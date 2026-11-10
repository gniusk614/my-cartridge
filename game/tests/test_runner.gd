extends SceneTree

var failures := 0
var checks := 0
var session
var loader
var game
var Quest
var Actor
var Combat
var mobile

func _initialize() -> void:
	run.call_deferred()

func expect(condition: bool, label: String) -> void:
	checks += 1
	if not condition:
		failures += 1
		printerr("FAIL: " + label)

func run() -> void:
	session = root.get_node("GameSession")
	mobile = root.get_node("MobileInput")
	loader = root.get_node("PackLoader")
	Quest = load("res://scripts/gameplay/quest_manager.gd")
	Actor = load("res://scripts/actors/actor.gd")
	Combat = load("res://scripts/gameplay/combat_manager.gd")
	session.storage.directory = "user://mc_automated_tests"
	var validator = preload("res://scripts/data/pack_validator.gd").new()
	for id in loader.PACKS:
		var pack: Dictionary = loader.load_pack(id)
		expect(not pack.is_empty(), "valid pack " + id)
	var pack: Dictionary = loader.load_pack(loader.PACKS[0])
	for mutation in ["type", "path", "cycle", "missing", "count", "mechanic", "role", "duplicate"]:
		var bad: Dictionary = pack.duplicate(true)
		match mutation:
			"type": bad.pack_revision = "1"
			"path": bad.pack_id = "../../outside"
			"cycle": bad.chapters[0].enemies[0].after = ["enemy_2"]
			"missing": bad.chapters[0].objectives[1].target = "not_a_clue"
			"count": bad.chapters[0].objectives[0].count = 8
			"mechanic": bad.chapters[0].mechanics[0] = "eval_code"
			"role": bad.characters[1].role = "player"
			"duplicate": bad.clues[0].id = "hero"
		expect(not validator.validate(bad).is_empty(), "reject " + mutation)
	expect(loader.load_pack("../../secret").is_empty(), "loader whitelist")
	session.begin(pack, false)
	var quest = Quest.new()
	quest.configure(pack.chapters[0], session.progress)
	expect(not quest.can_collect("clue_cafe"), "clue gated before combat")
	quest.record_defeat("enemy_1")
	quest.record_defeat("enemy_1")
	expect(session.progress.defeated_actor_ids.size() == 1, "idempotent defeat")
	expect(not quest.can_collect("clue_cafe"), "partial combat still gated")
	quest.record_defeat("enemy_2")
	expect(quest.available_clues().size() == 1, "one clue unlocked")
	expect(session.collect("clue_cafe"), "first collection")
	expect(not session.collect("clue_cafe"), "duplicate collection rejected")
	quest.refresh()
	expect(quest.is_complete(), "goals completed")
	expect(session.persist(), "atomic save written")
	session.begin(pack, true)
	quest.configure(pack.chapters[0], session.progress)
	expect(quest.is_complete() and quest.available_clues().is_empty(), "restored completion/no respawn")
	var updated: Dictionary = pack.duplicate(true)
	updated.pack_revision = 2
	expect(session.storage.load_save(updated).is_empty(), "revision mismatch isolated")
	var file := FileAccess.open(session.storage.directory + "/" + pack.pack_id + ".json", FileAccess.WRITE)
	file.store_string("{broken")
	file.close()
	expect(session.storage.load_save(pack).is_empty(), "corrupt save recovered")
	var attacker = Actor.new()
	var target = Actor.new()
	attacker.team = "player"
	attacker.facing = 1
	target.position = Vector2(20, 0)
	target.hp = 100
	var hits: Dictionary = {}
	expect(Combat.try_hit(attacker, target, 1, 12, hits), "first combat hit")
	expect(not Combat.try_hit(attacker, target, 1, 12, hits) and target.hp == 88, "one hit per attack")
	target.position.y = 15
	target.invulnerability = 0
	expect(not Combat.try_hit(attacker, target, 2, 12, hits), "depth miss")
	target.position = Vector2(-20, 0)
	expect(not Combat.try_hit(attacker, target, 3, 12, hits), "facing miss")
	attacker.free()
	target.free()
	game = load("res://scenes/GameRoot.tscn").instantiate()
	root.add_child(game)
	await process_frame
	# Exercise real movement, hitbox overlap, AI, interactions and ending 10 times.
	for iteration in 10:
		game.selected = iteration % 3
		game.start(false)
		game.play()
		var ticks := 0
		var cleared := false
		while ticks < 7200:
			ticks += 1
			await physics_frame
			if session.state == "ENDING":
				cleared = true
				break
			if session.state == "CLUE_REVEAL":
				expect(game.player.attack_clock == 0 or game.player.velocity == Vector2.ZERO, "popup locks input")
				game.play()
			if session.state == "PLAYER_DOWN": break
			for action in ["move_left", "move_right", "move_up", "move_down", "attack", "interact", "jump", "crouch"]:
				Input.action_release(action)
			var hero = game.player
			var destination := Vector2(909, 133)
			var closest = null
			var distance := INF
			for actor in game.actors.get_children():
				if not game.indoors and actor.team == "enemy" and actor.hp > 0 and hero.position.distance_to(actor.position) < distance:
					closest = actor
					distance = hero.position.distance_to(actor.position)
			if game.indoors:
				destination = Vector2(251, 117)
				if hero.position.distance_to(destination) < 23: Input.action_press("interact")
			elif closest != null:
				destination = closest.position
				var dx: float = destination.x - hero.position.x
				if absf(dx) < 25 and absf(destination.y - hero.position.y) < 9:
					if hero.facing != (1 if dx >= 0 else -1):
						Input.action_press("move_right" if dx >= 0 else "move_left")
					elif ticks % 10 == 0:
						Input.action_press("attack")
					continue
			elif not game.quest.available_clues().is_empty():
				var goal: Dictionary = game.quest.available_clues()[0]
				destination = Vector2(goal.position.x, goal.position.y)
				if hero.position.distance_to(destination) < 23:
					Input.action_press("interact")
			elif game.quest.is_complete() and hero.position.distance_to(destination) < 23:
				Input.action_press("interact")
			var offset: Vector2 = destination - hero.position
			if absf(offset.x) > 3: Input.action_press("move_right" if offset.x > 0 else "move_left")
			if absf(offset.y) > 3: Input.action_press("move_down" if offset.y > 0 else "move_up")
		expect(cleared, "real physics clear %d (%d frames, %s)" % [iteration + 1, ticks, session.state])
		print("RUN %02d: %s / %d physics frames" % [iteration + 1, "PASS" if cleared else "FAIL", ticks])
		for action in InputMap.get_actions(): Input.action_release(action)
	# Pause freezes simulation and retry preserves collected memories.
	game.start(false)
	game.play()
	var initial: Vector2 = game.player.position
	game.pause_game()
	Input.action_press("move_right")
	for i in 5: await physics_frame
	expect(game.player.position == initial, "pause freezes movement")
	Input.action_release("move_right")
	game.play()
	game.player.position = Vector2(70, 120)
	Input.action_press("move_right")
	for i in 10: await physics_frame
	Input.action_release("move_right")
	var straight: float = game.player.position.distance_to(Vector2(70, 120))
	game.player.position = Vector2(70, 120)
	Input.action_press("move_right")
	Input.action_press("move_down")
	for i in 10: await physics_frame
	Input.action_release("move_right")
	Input.action_release("move_down")
	var diagonal: float = game.player.position.distance_to(Vector2(70, 120))
	expect(absf(straight - diagonal) < 0.2, "diagonal movement normalized")
	game.player.position = Vector2(-999, -999)
	await physics_frame
	expect(game.player.position.x >= 24 and game.player.position.y >= 104, "stage bounds clamp")
	# Death recovery keeps independently collected facts rather than resetting the pack.
	session.progress.collected_clue_ids = ["clue_cafe"]
	session.progress.defeated_actor_ids = ["enemy_1", "enemy_2"]
	game.player.hp = 0
	for i in 2: await process_frame
	expect(session.state == "PLAYER_DOWN", "death state entered")
	game.retry()
	expect(game.player.hp == 100 and session.progress.collected_clue_ids == ["clue_cafe"], "retry keeps clues")
	expect(game.quest.is_complete(), "retry rebuilds completed goals")
	# Real jump input: ground -> crate -> balcony, walk on top, then fall off.
	game.player.reset_motion()
	game.player.position = Vector2(282, 112)
	Input.action_press("jump")
	Input.action_press("move_right")
	var peak := 0.0
	for i in 25:
		await physics_frame
		peak = maxf(peak, game.player.elevation)
	Input.action_release("jump")
	Input.action_release("move_right")
	for i in 40: await physics_frame
	expect(peak > 35, "jump has independent height")
	expect(game.player.grounded and game.player.support_id == "crate" and game.player.elevation == 16, "jump lands on crate")
	Input.action_press("jump")
	Input.action_press("move_right")
	for i in 40: await physics_frame
	Input.action_release("jump")
	Input.action_release("move_right")
	for i in 10: await physics_frame
	expect(game.player.grounded and game.player.support_id == "balcony" and game.player.elevation == 50, "crate jump reaches balcony")
	Input.action_press("move_right")
	for i in 40: await physics_frame
	Input.action_release("move_right")
	expect(game.player.elevation == 50 and game.player.position.x > 400, "walk along elevated balcony")
	Input.action_press("move_down")
	for i in 45: await physics_frame
	Input.action_release("move_down")
	for i in 20: await physics_frame
	expect(game.player.grounded and game.player.elevation == 0, "step off balcony lands on street")
	Input.action_press("crouch")
	for i in 2: await physics_frame
	expect(game.player.crouching, "hold crouch on ground")
	Input.action_press("attack")
	for i in 2: await physics_frame
	expect(game.player.attack_clock == 0, "crouch prevents attack")
	Input.action_release("attack")
	Input.action_release("crouch")
	for i in 2: await physics_frame
	expect(not game.player.crouching, "release crouch stands up")
	game.player.position = Vector2(340, 112)
	Input.action_press("move_right")
	Input.action_press("jump")
	for i in 70: await physics_frame
	Input.action_release("jump")
	Input.action_release("move_right")
	expect(game.player.elevation == 0 and game.player.position.x < 355, "balcony too high from ground")
	# A paused jump must not advance its height.
	game.player.position = Vector2(200, 135)
	Input.action_press("jump")
	for i in 6: await physics_frame
	Input.action_release("jump")
	var paused_height: float = game.player.elevation
	game.pause_game()
	for i in 10: await physics_frame
	expect(game.player.elevation == paused_height, "pause freezes airborne player")
	game.play()
	for i in 60: await physics_frame
	game.player.position = Vector2(909, 133)
	game.interact_nearby()
	expect(game.indoors and game.stage.indoors and game.player.arena.end.x == 296, "door enters cafe")
	var memories: Array = session.progress.collected_clue_ids.duplicate()
	game.player.position = Vector2(160, 149)
	game.interact_nearby()
	expect(not game.indoors and game.player.position.x == 884, "interior door returns to street")
	expect(session.progress.collected_clue_ids == memories, "door transition preserves progress")
	# Check high/low combat independently of XY overlap.
	var high = Actor.new()
	var low = Actor.new()
	high.team = "player"
	high.facing = 1
	high.elevation = 50
	low.position = Vector2(20, 0)
	expect(not Combat.try_hit(high, low, 1, 12, {}), "height prevents ground melee hit")
	high.free()
	low.free()
	game.start(false)
	game.play()
	game.player.position = Vector2(909, 133)
	for i in 2: await physics_frame
	var outside_enemy = null
	for actor in game.actors.get_children():
		if actor.team == "enemy": outside_enemy = actor
	expect(outside_enemy != null, "live enemy exists before indoor isolation test")
	game.interact_nearby()
	if outside_enemy != null:
		var enemy_position: Vector2 = outside_enemy.position
		var safe_hp: int = game.player.hp
		for i in 30: await physics_frame
		expect(outside_enemy.position == enemy_position and game.player.hp == safe_hp, "outside enemy freezes indoors")
	game.player.position = Vector2(251, 117)
	game.interact_nearby()
	expect(session.state == "CLUE_REVEAL" and not session.progress.ending_seen, "letter stays locked before clue")
	game.play()
	game.player.position = Vector2(160, 149)
	game.interact_nearby()
	if outside_enemy != null:
		expect(outside_enemy.is_physics_processing(), "outside enemy resumes after exit")
	await test_mobile_controls()
	# Real window resize: expanded game viewport and edge-anchored touch controls.
	var original_window_size := root.size
	root.size = Vector2i(1950, 900)
	for i in 3: await process_frame
	var expanded: Vector2 = root.get_visible_rect().size
	expect(expanded.x > 320 and absf(expanded.y - 180) < 1, "wide window expands horizontal view without letterboxing")
	for item in game.ui.touches.buttons:
		var rect := Rect2(item.center - Vector2.ONE * item.radius, Vector2.ONE * item.radius * 2)
		expect(rect.position.x >= 0 and rect.end.x <= expanded.x and rect.position.y >= 0 and rect.end.y <= expanded.y, "touch control stays on resized screen: " + str(item.action))
	expect(absf(game.ui.modal.position.x + game.ui.modal.size.x * 0.5 - expanded.x * 0.5) < 1, "modal stays centered on wide screen")
	game.player.position.x = 24
	game.update_camera()
	expect(absf(game.camera.position.x - expanded.x * 0.5) < 1, "wide camera keeps stage left edge")
	game.player.position.x = 936
	game.update_camera()
	expect(absf(game.camera.position.x + expanded.x * 0.5 - 960) < 1, "wide camera keeps stage right edge")
	game.ui.layout_for_size(Vector2(390, 180), {"left": 47, "right": 47, "bottom": 34, "width": 844, "height": 390})
	for item in game.ui.touches.buttons:
		expect(item.center.x - item.radius >= 47.0 * 390 / 844 and item.center.x + item.radius <= 390 - 47.0 * 390 / 844, "touch control clears landscape notch")
	root.size = original_window_size
	for i in 3: await process_frame
	game.ui.apply_layout()
	print("RESULT: %d checks, %d failures" % [checks, failures])
	game.free()
	await process_frame
	await process_frame
	quit(0 if failures == 0 else 1)

func touch(index: int, pressed: bool, point: Vector2, canceled := false) -> void:
	var event := InputEventScreenTouch.new()
	event.index = index
	event.position = point
	event.pressed = pressed
	event.canceled = canceled
	root.push_input(event, true)

func drag(index: int, point: Vector2) -> void:
	var event := InputEventScreenDrag.new()
	event.index = index
	event.position = point
	root.push_input(event, true)

func test_mobile_controls() -> void:
	game.start(false)
	game.play()
	var controls = game.ui.touches
	var origin := Vector2(65, 125)
	expect(controls.buttons.size() == 3 and controls.buttons[0].radius > controls.buttons[1].radius, "three circular actions with larger attack, no mobile crouch")
	touch(10, true, origin)
	expect(controls.stick_center == origin and mobile.movement == Vector2.ZERO, "floating stick starts at exact contact with zero tilt")
	drag(10, origin + Vector2(2, 1))
	expect(mobile.movement == Vector2.ZERO, "radial deadzone ignores small drift")
	drag(10, origin + Vector2(controls.stick_radius * 0.58, 0))
	expect(absf(mobile.movement.x - 0.5) < 0.01, "stick tilt gives half movement speed after deadzone")
	for i in 3: await physics_frame
	expect(absf(game.player.velocity.x - 40) < 0.1, "analog strength reaches actual player physics")
	drag(10, origin + Vector2(100, -40))
	expect(absf(mobile.movement.length() - 1) < 0.001 and mobile.movement.y < 0, "360 degree direction clamps magnitude without axis snapping")
	touch(11, true, origin + Vector2(-20, 10))
	drag(11, origin - Vector2(100, 0))
	expect(controls.stick_pointer == 10 and mobile.movement.x > 0, "second finger cannot steal movement pointer")
	touch(11, false, origin)
	expect(mobile.movement.x > 0, "unrelated release preserves joystick")
	var jump: Vector2 = controls.buttons[1].center
	var attack: Vector2 = controls.buttons[0].center
	touch(20, true, jump)
	for i in 2: await physics_frame
	expect(not game.player.grounded and mobile.movement.x > 0, "left movement and right jump work simultaneously")
	touch(21, true, attack)
	for i in 2: await physics_frame
	expect(game.player.attack_clock > 0 and Input.is_action_pressed("jump") and mobile.movement.x > 0, "three finger move jump attack preserves existing airborne combat")
	touch(10, false, origin)
	expect(mobile.movement == Vector2.ZERO and Input.is_action_pressed("attack"), "stick release stops immediately without releasing attack")
	touch(22, true, attack)
	touch(21, false, attack)
	expect(Input.is_action_pressed("attack"), "same button stays pressed until last owning finger releases")
	touch(22, false, attack, true)
	touch(20, false, jump, true)
	expect(not Input.is_action_pressed("attack") and not Input.is_action_pressed("jump"), "touchcancel releases owned actions")
	touch(30, true, origin)
	drag(30, origin + Vector2(controls.stick_radius, 0))
	touch(31, true, controls.buttons[2].center)
	game.pause_game()
	expect(mobile.movement == Vector2.ZERO and controls.contacts.is_empty() and not Input.is_action_pressed("interact"), "pause/modal clears every active touch")
	game.play()
	drag(30, origin + Vector2(100, 0))
	expect(mobile.movement == Vector2.ZERO, "held contact cannot resume after modal without new press")
	touch(40, true, origin)
	drag(40, origin + Vector2(controls.stick_radius, 0))
	controls.notification(NOTIFICATION_APPLICATION_FOCUS_OUT)
	expect(mobile.movement == Vector2.ZERO and controls.stick_pointer == -1, "focus loss clears joystick")
	touch(41, true, origin)
	drag(41, origin + Vector2(controls.stick_radius, 0))
	game.ui.apply_layout()
	expect(mobile.movement == Vector2.ZERO, "viewport/rotation layout clears held controls")
	game.player.reset_motion()
	Input.action_press("move_right")
	touch(42, true, origin)
	drag(42, origin - Vector2(controls.stick_radius, 0))
	touch(42, false, origin)
	expect(Input.is_action_pressed("move_right") and game.player.movement() == Vector2.RIGHT, "stick release preserves keyboard movement")
	Input.action_release("move_right")
	for i in 2: await physics_frame
	expect(game.player.velocity == Vector2.ZERO, "player stops by next physics frame after all movement releases")
	touch(43, true, controls.buttons[0].center + Vector2.ONE * controls.buttons[0].radius * 0.9)
	expect(not Input.is_action_pressed("attack"), "outside circular action hit area is not pressed")
