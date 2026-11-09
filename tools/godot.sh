#!/bin/bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
engine="${GODOT_BIN:-}"
if [[ -z "$engine" ]] && command -v godot >/dev/null 2>&1; then
  engine="$(command -v godot)"
fi
if [[ -z "$engine" ]] && [[ -x /Applications/Godot.app/Contents/MacOS/Godot ]]; then
  engine=/Applications/Godot.app/Contents/MacOS/Godot
fi
if [[ -z "$engine" ]] && [[ -x "$project_dir/../../work/tools/Godot.app/Contents/MacOS/Godot" ]]; then
  engine="$project_dir/../../work/tools/Godot.app/Contents/MacOS/Godot"
fi
if [[ -z "$engine" ]] || [[ ! -x "$engine" ]]; then
  echo 'Godot 4.7.2가 필요합니다. GODOT_BIN 환경 변수에 Godot 실행 파일 경로를 지정하세요.' >&2
  exit 1
fi
exec "$engine" --path "$project_dir/game" "$@"
