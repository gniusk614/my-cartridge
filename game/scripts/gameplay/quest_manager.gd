extends RefCounted

var chapter: Dictionary
var progress: Dictionary
var completed: Array = []

func configure(data: Dictionary, saved: Dictionary) -> void:
	chapter = data
	progress = saved
	# Derive goals from facts; do not trust saved completion flags alone.
	completed.clear()
	refresh()

func record_defeat(id: String) -> void:
	if id not in progress.defeated_actor_ids:
		progress.defeated_actor_ids.append(id)
	refresh()

func dependencies_met(goal: Dictionary) -> bool:
	for id in goal.depends_on:
		if id not in completed: return false
	return true

func refresh() -> void:
	for _pass in chapter.objectives.size():
		for goal in chapter.objectives:
			if goal.id in completed or not dependencies_met(goal): continue
			var done := false
			if goal.type == "defeat_count":
				var count := 0
				for enemy in chapter.enemies:
					if enemy.type == goal.target and enemy.id in progress.defeated_actor_ids: count += 1
				done = count >= goal.count
			else:
				done = goal.target in progress.collected_clue_ids
			if done:
				completed.append(goal.id)
				EventBus.objective_completed.emit(goal.id)
	progress.completed_objective_ids = completed.duplicate()

func available_clues() -> Array:
	var result: Array = []
	for goal in chapter.objectives:
		if goal.type == "collect_clue" and goal.target not in progress.collected_clue_ids and dependencies_met(goal):
			result.append(goal)
	return result

func can_collect(id: String) -> bool:
	for goal in available_clues():
		if goal.target == id: return true
	return false

func is_complete() -> bool:
	return completed.size() == chapter.objectives.size()

func objective_text() -> String:
	for goal in chapter.objectives:
		if goal.id in completed: continue
		if goal.type == "defeat_count":
			var count := 0
			for enemy in chapter.enemies:
				if enemy.type == goal.target and enemy.id in progress.defeated_actor_ids: count += 1
			return "길을 막은 장난꾸러기  %d / %d" % [count, goal.count]
		if dependencies_met(goal): return "빛나는 기억 가까이에서 E / 기억 버튼"
	return "기억을 찾았다! 오른쪽 카페로 →"
