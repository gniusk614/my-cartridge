extends Node

const PACKS := ["demo_snowy_rescue", "demo_blue_umbrella", "demo_dawn_walk"]
var error_message := ""
var custom_packs: Dictionary = {}
var validator = preload("res://scripts/data/pack_validator.gd").new()

func load_pack(id: String) -> Dictionary:
	error_message = ""
	if custom_packs.has(id): return custom_packs[id].duplicate(true)
	if id not in PACKS:
		error_message = "등록되지 않은 게임팩입니다."
		return {}
	var parser := JSON.new()
	if parser.parse(FileAccess.get_file_as_string("res://content/" + id + ".json")) != OK:
		error_message = "게임팩 JSON 형식이 올바르지 않습니다."
		return {}
	var raw = parser.data
	var errors: Array = validator.validate(raw)
	if not errors.is_empty():
		error_message = "게임팩을 읽을 수 없습니다.\n" + "\n".join(errors)
		return {}
	return raw

func available_packs() -> Array:
	var result: Array = PACKS.duplicate()
	for id in custom_packs:
		if id not in result: result.append(id)
	return result

func register_pack(raw: Variant) -> Array:
	var errors: Array = validator.validate(raw)
	if errors.is_empty():
		if raw.pack_id in PACKS: return ["샘플 팩 ID와 다른 ID를 사용해 주세요."]
		custom_packs[raw.pack_id] = raw.duplicate(true)
	return errors
