"""Copy a tested Godot export for Pages and verify source/build consistency."""
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def source_digest():
    digest = hashlib.sha256()
    files = []
    for folder in ("game", "schemas", "examples"):
        for path in (ROOT / folder).rglob("*"):
            if not path.is_file() or ".godot" in path.parts:
                continue
            if path.suffix in (".uid", ".import") or path.name == ".DS_Store":
                continue
            files.append(path)
    for path in sorted(files):
        digest.update(path.relative_to(ROOT).as_posix().encode() + b"\0")
        digest.update(path.read_bytes())
    return digest.hexdigest()


def check_site():
    site = ROOT / "web"
    info = json.loads((site / "build-info.json").read_text())
    if info["source_sha256"] != source_digest():
        raise SystemExit("Source changed: export Godot Web and run tools/prepare_web.py before deployment.")
    for name, checksum in info["assets"].items():
        if hashlib.sha256((site / name).read_bytes()).hexdigest() != checksum:
            raise SystemExit(f"Export asset changed or missing: {name}")
    html = (site / "index.html").read_text()
    if "const GODOT_THREADS_ENABLED = false;" not in html:
        raise SystemExit("Expected single-threaded Godot Web export")
    if not (site / ".nojekyll").exists():
        raise SystemExit("Missing .nojekyll marker")
    print("PASS: Pages export matches the current game source and asset checksums.")


def prepare_site():
    export = ROOT / "build" / "web"
    required = ("index.html", "index.js", "index.wasm", "index.pck")
    if any(not (export / name).is_file() for name in required):
        raise SystemExit("Export Godot Web into build/web first.")
    site = ROOT / "web"
    site.mkdir(exist_ok=True)
    # Only this script's generated files are replaced; source and saves are untouched.
    previous = site / "build-info.json"
    if previous.exists():
        for name in json.loads(previous.read_text()).get("assets", {}):
            if Path(name).name != name:
                raise SystemExit("Invalid previous manifest asset name")
            (site / name).unlink(missing_ok=True)
    assets = {}
    for path in sorted(export.iterdir()):
        if path.is_file() and path.name.startswith("index."):
            shutil.copy2(path, site / path.name)
            assets[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
    # HTML and game data must not reuse a cached pack from the previous release.
    pack_name = "game-" + assets["index.pck"][:12] + ".pck"
    (site / "index.pck").rename(site / pack_name)
    assets[pack_name] = assets.pop("index.pck")
    html = (site / "index.html").read_text()
    pattern = r"const GODOT_CONFIG = (\{[^\n]+\});"
    match = re.search(pattern, html)
    if not match:
        raise SystemExit("Missing Godot export configuration")
    config = json.loads(match[1])
    config["mainPack"] = pack_name
    config["fileSizes"][pack_name] = config["fileSizes"].pop("index.pck")
    html = re.sub(pattern, lambda _: "const GODOT_CONFIG = " + json.dumps(config, separators=(",", ":")) + ";", html)
    for path in sorted((ROOT / "game/web/static").iterdir()):
        if not path.is_file() or path.suffix in (".import", ".uid"):
            continue
        name = path.name
        checksum = hashlib.sha256(path.read_bytes()).hexdigest()
        if path.suffix in (".js", ".css"):
            name = f"{path.stem}-{checksum[:12]}{path.suffix}"
            html = html.replace(f'"{path.name}"', f'"{name}"')
        shutil.copy2(path, site / name)
        shutil.copy2(path, export / path.name)
        assets[name] = checksum
    html = "\n".join(line.rstrip() for line in html.splitlines()) + "\n"
    (site / "index.html").write_text(html)
    assets["index.html"] = hashlib.sha256((site / "index.html").read_bytes()).hexdigest()
    (site / ".nojekyll").touch()
    (site / "build-info.json").write_text(json.dumps({
        "engine": "4.7.2.stable", "source_sha256": source_digest(), "assets": assets
    }, indent=2) + "\n")
    check_site()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    check_site() if args.check else prepare_site()
