extends Node

var pack: Dictionary = {}
var state := "TITLE"
var progress: Dictionary = {}
var storage = preload("res://scripts/save/save_repository.gd").new()

func change_state(next: String) -> void:
	state = next
	EventBus.state_changed.emit(state)

func begin(data: Dictionary, resume: bool = true) -> void:
	pack = data
	progress = storage.load_save(data) if resume else {}
	if progress.is_empty():
		progress = {"pack_id": pack.pack_id, "pack_revision": pack.pack_revision,
			"stage_id": pack.chapters[0].id, "checkpoint_id": "start", "hp": 100,
			"collected_clue_ids": [], "completed_objective_ids": [],
			"defeated_actor_ids": [], "ending_seen": false, "saved_at": ""}

func persist() -> bool:
	if progress.is_empty():
		return false
	progress.saved_at = Time.get_datetime_string_from_system(true)
	var ok: bool = storage.write_save(progress)
	if not ok:
		EventBus.save_failed.emit("저장하지 못했습니다. 이번 플레이는 계속할 수 있습니다.")
	return ok

func collect(id: String) -> bool:
	if id in progress.collected_clue_ids:
		return false
	progress.collected_clue_ids.append(id)
	persist()
	EventBus.clue_collected.emit(id)
	return true
