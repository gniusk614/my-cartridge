extends RefCounted

# Eligibility only; game_root presents dialogue and commits after acknowledgement.
func eligible(event: Dictionary, chapter: Dictionary, progress: Dictionary, x: float, complete: bool) -> bool:
	var seen: Array = progress.get("completed_event_ids", [])
	if event.id in seen: return false
	for id in event.after:
		if id not in seen: return false
	var trigger: Dictionary = event.trigger
	match trigger.type:
		"stage_start": return true
		"reach_x": return x >= float(trigger.x)
		"enemy_defeated": return trigger.target in progress.defeated_actor_ids
		"clue_collected": return trigger.target in progress.collected_clue_ids
		"objectives_complete": return complete
	return false

func next(chapter: Dictionary, progress: Dictionary, x: float, complete: bool) -> Dictionary:
	for event in chapter.get("events", []):
		if eligible(event, chapter, progress, x, complete): return event
	return {}
