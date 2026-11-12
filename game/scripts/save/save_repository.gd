extends RefCounted

var directory := "user://saves"

func write_save(data: Dictionary) -> bool:
	if DirAccess.make_dir_recursive_absolute(directory) != OK:
		return false
	var path := directory.path_join(str(data.pack_id) + ".json")
	var file := FileAccess.open(path + ".tmp", FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(data))
	file.flush()
	var error := file.get_error()
	file.close()
	if error != OK:
		return false
	return DirAccess.rename_absolute(path + ".tmp", path) == OK

func load_save(pack: Dictionary) -> Dictionary:
	var path := directory.path_join(str(pack.pack_id) + ".json")
	if not FileAccess.file_exists(path):
		return {}
	var parser := JSON.new()
	if parser.parse(FileAccess.get_file_as_string(path)) != OK:
		return {}
	var raw = parser.data
	if not raw is Dictionary:
		return {}
	if raw.get("pack_id") != pack.pack_id or raw.get("pack_revision") != pack.pack_revision:
		return {} # Revision migrations must be explicit; do not mix incompatible state.
	var stages: Array = []
	for chapter in pack.chapters: stages.append(chapter.id)
	if raw.get("stage_id") not in stages:
		return {}
	for key in ["collected_clue_ids", "completed_objective_ids", "defeated_actor_ids"]:
		if not raw.get(key) is Array:
			return {}
		var allowed: Array = []
		if key == "collected_clue_ids":
			for item in pack.clues: allowed.append(item.id)
		elif key == "completed_objective_ids":
			for chapter in pack.chapters:
				for item in chapter.objectives: allowed.append(item.id)
		else:
			for chapter in pack.chapters:
				for item in chapter.enemies: allowed.append(item.id)
		var clean: Array = []
		for id in raw[key]:
			if id in allowed and id not in clean: clean.append(id)
		raw[key] = clean
	var allowed_events: Array = []
	for chapter in pack.chapters:
		for event in chapter.get("events", []): allowed_events.append(event.id)
	var clean_events: Array = []
	if raw.get("completed_event_ids", []) is Array:
		for id in raw.get("completed_event_ids", []):
			if id in allowed_events and id not in clean_events: clean_events.append(id)
	raw.completed_event_ids = clean_events
	if not raw.get("hp") is float and not raw.get("hp") is int:
		return {}
	if not raw.get("ending_seen") is bool:
		return {}
	raw.hp = clampi(int(raw.hp), 1, 100)
	return raw
