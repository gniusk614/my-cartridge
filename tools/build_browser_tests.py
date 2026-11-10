"""Build an isolated instrumented pack using the shipped Web engine runtime."""
import json
import re
import shutil
import subprocess
from pathlib import Path
from prepare_web import copy_studio

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "web"
DEST = ROOT / "build/browser"


def build():
    DEST.mkdir(parents=True, exist_ok=True)
    (DEST / "test.pck").unlink(missing_ok=True)
    subprocess.run([
        "bash", "tools/godot.sh", "--headless", "--export-pack", "Browser Tests",
        "../build/browser/test.pck",
    ], cwd=ROOT, check=True)
    if not (DEST / "test.pck").is_file():
        raise SystemExit("Godot did not produce the browser test pack")
    # Reuse the exact release WASM/JS without downloading all platform templates.
    for path in SITE.iterdir():
        if path.is_file() and path.name.startswith("index.") and path.suffix != ".html":
            shutil.copy2(path, DEST / path.name)
    shipped_html = (SITE / "index.html").read_text()
    pattern = r"const GODOT_CONFIG = (\{[^\n]+\});"
    match = re.search(pattern, shipped_html)
    if not match:
        raise SystemExit("Missing Godot configuration in the shipped Web shell")
    config = json.loads(match[1])
    config["mainPack"] = "test.pck"
    config["fileSizes"] = {key: value for key, value in config["fileSizes"].items() if not key.endswith(".pck")}
    config["fileSizes"]["test.pck"] = (DEST / "test.pck").stat().st_size
    html = (ROOT / "game/web/shell.html").read_text()
    for key, value in {
        "$GODOT_PROJECT_NAME": "MY CARTRIDGE Browser Tests",
        "$GODOT_HEAD_INCLUDE": "", "$GODOT_URL": "index.js",
        "$GODOT_CONFIG": json.dumps(config), "$GODOT_THREADS_ENABLED": "false",
    }.items():
        html = html.replace(key, value)
    # Use current source CSS/JS even before regenerating the Pages release.
    for path in (ROOT / "game/web/static").iterdir():
        if not path.is_file() or path.suffix in (".import", ".uid"):
            continue
        shutil.copy2(path, DEST / path.name)
    copy_studio(DEST)
    (DEST / "index.html").write_text(html)
    print("Browser test pack ready; Pages files and player saves are unchanged.")


if __name__ == "__main__":
    build()
