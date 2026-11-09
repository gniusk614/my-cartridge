extends Node

signal actor_defeated(actor_id: String, enemy_type: String)
signal clue_collected(clue_id: String)
signal objective_completed(objective_id: String)
signal stage_started(stage_id: String)
signal stage_completed(stage_id: String)
signal state_changed(state: String)
signal save_failed(message: String)
