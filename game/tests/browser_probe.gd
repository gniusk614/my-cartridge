extends Node

# Installed only by the browser_test export; never included in the Pages pack.
# Read-only observation: tests drive the same UI, physics and storage as players.
var game
var snapshot_callback

func _ready() -> void:
	game = get_parent()
	GameSession.storage.directory = "user://mc_browser_tests"
	snapshot_callback = JavaScriptBridge.create_callback(snapshot)
	JavaScriptBridge.get_interface("window").myCartridgeTestSnapshot = snapshot_callback

func point(value: Vector2) -> Array:
	return [value.x, value.y]

func snapshot(_arguments: Array) -> void:
	var data := {
		"state": GameSession.state, "progress": GameSession.progress.duplicate(true),
		"viewport": point(get_viewport().get_visible_rect().size),
		"movement": point(MobileInput.movement), "modal": game.ui.modal.visible,
		"stick_pointer": game.ui.touches.stick_pointer,
		"contacts": game.ui.touches.contacts.size(), "buttons": [], "menu": [], "enemies": [],
		"indoors": game.indoors, "storage": GameSession.storage.directory,
		"pause": point(game.ui.pause_button.get_global_rect().get_center()),
	}
	for item in game.ui.touches.buttons:
		data.buttons.append({"action": item.action, "center": point(item.center), "radius": item.radius})
	for child in game.ui.body.find_children("*", "Button", true, false):
		if child.is_visible_in_tree():
			data.menu.append({"text": child.text, "center": point(child.get_global_rect().get_center())})
	if is_instance_valid(game.player):
		data.player = {
			"position": point(game.player.position), "velocity": point(game.player.velocity),
			"hp": game.player.hp, "elevation": game.player.elevation,
			"grounded": game.player.grounded, "attack_clock": game.player.attack_clock,
			"facing": game.player.facing,
		}
		data.clues = game.quest.available_clues()
		data.complete = game.quest.is_complete()
		for actor in game.actors.get_children():
			if actor != game.player and actor.hp > 0:
				data.enemies.append({"position": point(actor.position), "hp": actor.hp})
	JavaScriptBridge.get_interface("window").myCartridgeTestState = JSON.stringify(data)
