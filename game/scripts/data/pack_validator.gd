extends RefCounted

# This deliberately supports only the keywords used by our checked-in schema.
# Adding a schema keyword requires adding its runtime implementation and tests.
func validate(data: Variant) -> Array:
	var schema = JSON.parse_string(FileAccess.get_file_as_string("res://content/game_pack.schema.json"))
	var errors: Array = []
	check(data, schema, "$", errors)
	if not errors.is_empty(): return errors
	if data.schema_version == "1.0.0" and (data.chapters.size() != 1 or data.has("maps") or data.has("assets")):
		errors.append("schema_version: customization requires 1.1.0")
	var ids: Dictionary = {}
	var clues: Array = []
	var players := 0
	var counterparts := 0
	for character in data.characters:
		unique(character.id, ids, errors)
		if character.role == "player": players += 1
		if character.role == "missing": counterparts += 1
	if players != 1: errors.append("characters: exactly one player required")
	if counterparts != 1: errors.append("characters: exactly one story counterpart required")
	for clue in data.clues:
		unique(clue.id, ids, errors)
		clues.append(clue.id)
	var collectible: Array = []
	for chapter in data.chapters:
		unique(chapter.id, ids, errors)
		if not "collect" in chapter.mechanics or (not chapter.enemies.is_empty() and not "brawler" in chapter.mechanics):
			errors.append("mechanics: collect required, combat needs brawler")
		var enemies: Dictionary = {}
		var counts: Dictionary = {}
		for enemy in chapter.enemies:
			unique(enemy.id, ids, errors)
			enemies[enemy.id] = enemy.after
			counts[enemy.type] = counts.get(enemy.type, 0) + 1
		check_graph(enemies, "enemies", errors)
		var objectives: Dictionary = {}
		var defined: Dictionary = {}
		for objective in chapter.objectives:
			unique(objective.id, ids, errors)
			objectives[objective.id] = objective.depends_on
			defined[objective.id] = objective
			if objective.type == "defeat_count":
				if objective.count > counts.get(objective.target, 0):
					errors.append(objective.id + ": unreachable defeat count")
				if not objective.depends_on.is_empty():
					errors.append(objective.id + ": P0 defeat goals cannot depend on collection")
			else:
				if objective.target not in clues or objective.count != 1:
					errors.append(objective.id + ": invalid clue reference/count")
				if objective.target in collectible: errors.append("duplicate collection objective")
				collectible.append(objective.target)
		check_graph(objectives, "objectives", errors)
	if collectible.size() != clues.size(): errors.append("Every clue must have a collection objective")
	validate_customization(data, ids, errors)
	return errors

func unique(id: String, ids: Dictionary, errors: Array) -> void:
	if ids.has(id): errors.append("duplicate id: " + id)
	ids[id] = true

func check_graph(graph: Dictionary, label: String, errors: Array) -> void:
	var resolved: Array = []
	for id in graph:
		for dep in graph[id]:
			if not graph.has(dep): errors.append(label + ": unknown dependency " + str(dep))
	for _pass in graph.size():
		for id in graph:
			if id in resolved: continue
			var ready := true
			for dep in graph[id]:
				if dep not in resolved: ready = false
			if ready: resolved.append(id)
	if resolved.size() != graph.size(): errors.append(label + ": cyclic or unreachable dependency")

func check(value: Variant, spec: Dictionary, path: String, errors: Array) -> void:
	var valid := true
	match spec.get("type", ""):
		"object": valid = value is Dictionary
		"array": valid = value is Array
		"string": valid = value is String
		"boolean": valid = value is bool
		"number": valid = (value is float or value is int) and is_finite(float(value))
		"integer": valid = (value is float or value is int) and is_finite(float(value)) and float(value) == floor(float(value))
	if not valid:
		errors.append(path + ": invalid type")
		return
	if spec.has("enum") and value not in spec.enum: errors.append(path + ": not allowed")
	if value is Dictionary:
		for key in spec.get("required", []):
			if not value.has(key): errors.append(path + ": missing " + key)
		for key in value:
			if spec.get("properties", {}).has(key):
				check(value[key], spec.properties[key], path + "." + str(key), errors)
			elif spec.get("additionalProperties", true) == false:
				errors.append(path + ": unknown property " + str(key))
	elif value is Array:
		if value.size() < spec.get("minItems", 0) or value.size() > spec.get("maxItems", 99999):
			errors.append(path + ": invalid array length")
		for i in value.size(): check(value[i], spec.get("items", {}), path + "[" + str(i) + "]", errors)
	elif value is String:
		if value.length() < spec.get("minLength", 0) or value.length() > spec.get("maxLength", 99999):
			errors.append(path + ": invalid text length")
		if spec.has("pattern"):
			var regex := RegEx.new()
			regex.compile(spec.pattern)
			if regex.search(value) == null: errors.append(path + ": invalid identifier")
	elif value is float or value is int:
		if value < spec.get("minimum", -INF) or value > spec.get("maximum", INF):
			errors.append(path + ": outside limits")

func validate_customization(data: Dictionary, ids: Dictionary, errors: Array) -> void:
	var assets: Dictionary = {}
	var bytes := 0
	var pixels := 0
	for asset in data.get("assets", []):
		unique(asset.id, ids, errors)
		assets[asset.id] = asset
		bytes += asset.png_base64.length()
		pixels += int(asset.width) * int(asset.height)
		var png := Marshalls.base64_to_raw(asset.png_base64)
		if png.size() < 24 or png.slice(0, 8) != PackedByteArray([137, 80, 78, 71, 13, 10, 26, 10]):
			errors.append(asset.id + ": PNG signature required")
			continue
		var width := (int(png[16]) << 24) | (int(png[17]) << 16) | (int(png[18]) << 8) | int(png[19])
		var height := (int(png[20]) << 24) | (int(png[21]) << 16) | (int(png[22]) << 8) | int(png[23])
		if width != asset.width or height != asset.height or width > 2048 or height > 2048 or width <= 0 or height <= 0:
			errors.append(asset.id + ": PNG dimensions mismatch")
			continue
		if bytes > 12000000 or pixels > 8388608:
			errors.append("assets: total size limit exceeded")
			break
		var image := Image.new()
		if image.load_png_from_buffer(png) != OK: errors.append(asset.id + ": unreadable PNG")
		if asset.kind == "sprite_sheet":
			if not asset.has("frame_width") or not asset.has("frame_height") or not asset.has("animations"):
				errors.append(asset.id + ": sprite grid and animations required")
				continue
			if int(asset.width) % int(asset.frame_width) != 0 or int(asset.height) % int(asset.frame_height) != 0:
				errors.append(asset.id + ": sprite grid does not divide image")
			for spec in asset.animations.values():
				if spec.row * asset.frame_height >= asset.height or spec.frames * asset.frame_width > asset.width:
					errors.append(asset.id + ": animation outside sprite sheet")
	var characters: Dictionary = {}
	for character in data.characters:
		characters[character.id] = character
		check_asset(character.sprite_key, "sprite_sheet", assets, errors, ["hero_base", "missing_base"])
		if character.has("portrait_key"): check_asset(character.portrait_key, "portrait", assets, errors)
	for clue in data.clues:
		if clue.has("speaker_id") and not characters.has(clue.speaker_id): errors.append(clue.id + ": unknown speaker")
	var maps: Dictionary = {}
	for map in data.get("maps", []):
		unique(map.id, ids, errors)
		maps[map.id] = map
		for point in [map.spawn, map.door]: check_point(point, map.width, map.id, errors)
		var surface_ids: Array = []
		for surface in map.surfaces:
			if surface.id in surface_ids: errors.append(map.id + ": duplicate platform id")
			surface_ids.append(surface.id)
			if surface.x + surface.width > map.width - 24 or surface.y + surface.depth > 156:
				errors.append(map.id + ": platform outside walk area")
		for npc in map.npcs:
			if not characters.has(npc.character_id) or characters[npc.character_id].role == "player": errors.append(map.id + ": invalid NPC reference")
			check_point(npc.position, map.width, map.id, errors)
		if map.has("background_key"): check_asset(map.background_key, "background", assets, errors)
	for chapter in data.chapters:
		var width := 960
		if chapter.has("map_id"):
			if not maps.has(chapter.map_id): errors.append(chapter.id + ": unknown map")
			else: width = int(maps[chapter.map_id].width)
		for enemy in chapter.enemies:
			check_point(enemy.position, width, enemy.id, errors)
			if enemy.trigger_x > width - 24: errors.append(enemy.id + ": trigger outside map")
			if enemy.has("sprite_key"): check_asset(enemy.sprite_key, "sprite_sheet", assets, errors)
		for goal in chapter.objectives: check_point(goal.position, width, goal.id, errors)

func check_point(point: Dictionary, width: int, label: String, errors: Array) -> void:
	if point.x > width - 24: errors.append(label + ": position outside map")

func check_asset(id: String, kind: String, assets: Dictionary, errors: Array, builtins: Array = []) -> void:
	if id in builtins: return
	if not assets.has(id) or assets[id].kind != kind: errors.append(id + ": missing " + kind + " asset")
