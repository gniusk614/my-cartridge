extends Node

const PACKS := ["demo_snowy_rescue", "demo_blue_umbrella", "demo_dawn_walk"]
var error_message := ""
var validator = preload("res://scripts/data/pack_validator.gd").new()

func load_pack(id: String) -> Dictionary:
	error_message = ""
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
