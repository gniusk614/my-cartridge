"""Validate Draft 2020-12 samples and ensure export copies match canonical data."""
import json
from pathlib import Path
from jsonschema import Draft202012Validator

root = Path(__file__).resolve().parents[1]
schema_path = root / "schemas/game_pack.schema.json"
schema = json.loads(schema_path.read_text())
Draft202012Validator.check_schema(schema)
validator = Draft202012Validator(schema)
assert schema_path.read_bytes() == (root / "game/content/game_pack.schema.json").read_bytes(), "schema copies differ"
for source in sorted((root / "examples").glob("*.json")):
    data = json.loads(source.read_text())
    validator.validate(data)
    assert source.read_bytes() == (root / "game/content" / source.name).read_bytes(), f"copy differs: {source.name}"
    print(f"PASS {source.name}")
print("Schema and export copies are consistent. Runtime reference/reachability checks: Godot test_runner.gd")
