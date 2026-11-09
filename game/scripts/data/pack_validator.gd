extends RefCounted

# This deliberately supports only the keywords used by our checked-in schema.
# Adding a schema keyword requires adding its runtime implementation and tests.
func validate(data: Variant) -> Array:
	var schema = JSON.parse_string(FileAccess.get_file_as_string("res://content/game_pack.schema.json"))
	var errors: Array = []
	check(data, schema, "$", errors)
	if not errors.is_empty(): return errors
	var ids: Dictionary = {}
	var clues: Array = []
	var players := 0
	for character in data.characters:
		unique(character.id, ids, errors)
		if character.role == "player": players += 1
	if players != 1: errors.append("characters: exactly one player required")
	for clue in data.clues:
		unique(clue.id, ids, errors)
		clues.append(clue.id)
	var chapter: Dictionary = data.chapters[0]
	unique(chapter.id, ids, errors)
	if not "brawler" in chapter.mechanics or not "collect" in chapter.mechanics:
		errors.append("mechanics: brawler and collect required")
	var enemies: Dictionary = {}
	var counts: Dictionary = {}
	for enemy in chapter.enemies:
		unique(enemy.id, ids, errors)
		enemies[enemy.id] = enemy.after
		counts[enemy.type] = counts.get(enemy.type, 0) + 1
	check_graph(enemies, "enemies", errors)
	var objectives: Dictionary = {}
	var defined: Dictionary = {}
	var collectible: Array = []
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
