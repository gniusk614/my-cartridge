extends Node2D

const Actor = preload("res://scripts/actors/actor.gd")
const Stage = preload("res://scripts/gameplay/stage.gd")
const Quest = preload("res://scripts/gameplay/quest_manager.gd")
const StoryEvents = preload("res://scripts/gameplay/story_events.gd")
const PhotoBoard = preload("res://scripts/ui/photo_board.gd")
const UI = preload("res://scripts/ui/screen_ui.gd")
var ui
var stage
var actors: Node2D
var player
var camera: Camera2D
var quest
var spawned: Array = []
var selected := 0
var music: AudioStreamPlayer
var muted := false
var checkpoint_clock := 0.0
var indoors := false
var street_return := Vector2(884, 134)
var layout_callback
var import_callback
var studio_preview := false
var episode_only := ""
var suspend_callback
var story_events = StoryEvents.new()
var active_event: Dictionary = {}
var photo_board
var photo_placed: Array = []

func _ready() -> void:
	configure_input()
	ui = UI.new()
	ui.root = self
	add_child(ui)
	camera = Camera2D.new()
	camera.position = Vector2(160, 90)
	add_child(camera)
	get_viewport().size_changed.connect(update_camera)
	music = AudioStreamPlayer.new()
	music.stream = preload("res://assets/audio/demo_ending.wav")
	music.volume_db = -7
	music.finished.connect(func():
		if GameSession.state in ["ENDING", "FAMILY_ENDING"]: music.play())
	add_child(music)
	EventBus.actor_defeated.connect(on_defeat)
	if OS.has_feature("web"):
		layout_callback = JavaScriptBridge.create_callback(on_browser_layout)
		JavaScriptBridge.get_interface("window").myCartridgeOnLayout = layout_callback
		suspend_callback = JavaScriptBridge.create_callback(on_browser_suspend)
		JavaScriptBridge.get_interface("window").myCartridgeOnSuspend = suspend_callback
		import_callback = JavaScriptBridge.create_callback(on_import_pack)
		JavaScriptBridge.get_interface("window").myCartridgeImportPack = import_callback
		studio_preview = bool(JavaScriptBridge.get_interface("window").myCartridgeStudioPreview)
		if OS.has_feature("browser_test"):
			var probe = load("res://tests/browser_probe.gd").new()
			add_child(probe)
		if studio_preview: GameSession.storage.directory = "user://studio_preview"
	show_title()

func on_browser_layout(_arguments: Array) -> void:
	ui.apply_layout()

func on_browser_suspend(_arguments: Array) -> void:
	ui.touches.release_all()
	pause_game()

func configure_input() -> void:
	var bindings := {"move_left": [KEY_A, KEY_LEFT], "move_right": [KEY_D, KEY_RIGHT],
		"move_up": [KEY_W, KEY_UP], "move_down": [KEY_S, KEY_DOWN],
		"attack": [KEY_J], "jump": [KEY_SPACE], "crouch": [KEY_K, KEY_CTRL],
		"interact": [KEY_E], "pause": [KEY_ESCAPE]}
	for action in bindings:
		if not InputMap.has_action(action): InputMap.add_action(action)
		for key in bindings[action]:
			var event := InputEventKey.new()
			event.physical_keycode = key
			InputMap.action_add_event(action, event)

func show_title() -> void:
	GameSession.change_state("TITLE")
	music.stop()
	ui.clear_modal(PackLoader.load_pack(episode_only).meta.title if not episode_only.is_empty() else "MY CARTRIDGE", "이동 WASD / 방향키 · 공격 J · 점프 Space\n앉기 K / Ctrl · 살펴보기 / 출입 E")
	var selector := OptionButton.new()
	selector.custom_minimum_size.y = 23
	selector.add_theme_font_size_override("font_size", 9)
	for i in pack_choices().size():
		var pack: Dictionary = PackLoader.load_pack(pack_choices()[i])
		var title: String = pack.get("meta", {}).get("title", "팩 오류")
		selector.add_item(title)
	selector.select(selected)
	selector.item_selected.connect(func(index): selected = index)
	ui.body.add_child(selector)
	var controls: HBoxContainer = ui.row()
	var resume: Button = ui.button("시작 / 이어하기", start.bind(true))
	resume.reparent(controls)
	var fresh: Button = ui.button("새로 시작", start.bind(false))
	fresh.reparent(controls)
	ui.status.text = "로컬 저장 · 브라우저 정리 시 소실 가능"

func select_pack(index: int) -> void:
	selected = index
	show_title()

func start(resume: bool) -> void:
	music.stop()
	var pack: Dictionary = PackLoader.load_pack(pack_choices()[selected])
	if pack.is_empty():
		ui.clear_modal("게임팩 오류", PackLoader.error_message)
		ui.button("팩 선택으로", show_title)
		return
	GameSession.begin(pack, resume)
	build_stage()
	GameSession.change_state("STAGE_INTRO")
	ui.clear_modal(GameSession.chapter().title, GameSession.story_text(GameSession.chapter().intro), GameSession.character_for_role("player").get("portrait_key", ""))
	ui.button("기억을 찾아 출발", play)
	ui.status.text = ""

func build_stage() -> void:
	if is_instance_valid(stage): stage.free()
	stage = Stage.new()
	for map in GameSession.pack.get("maps", []):
		if map.id == GameSession.chapter().get("map_id", ""): stage.configure(map)
	add_child(stage)
	indoors = false
	active_event = {}
	actors = Node2D.new()
	actors.y_sort_enabled = true
	stage.add_child(actors)
	player = Actor.new()
	player.team = "player"
	player.actor_id = "hero"
	player.max_hp = 100
	player.hp = GameSession.progress.hp
	player.speed = 80
	player.facing = 1
	player.position = stage.spawn
	player.arena = Rect2(24, 104, stage.world_width - 48, 52)
	var hero: Dictionary = GameSession.character_for_role("player")
	player.sprite_key = hero.sprite_key
	player.appearance = hero.get("appearance", {})
	player.surfaces = stage.surfaces
	actors.add_child(player)
	if GameSession.chapter().get("carry_baby", false): player.add_child(preload("res://scripts/actors/baby_carrier.gd").new())
	quest = Quest.new()
	quest.configure(GameSession.chapter(), GameSession.progress)
	for spec in stage.map_data.get("npcs", []):
		var character: Dictionary = GameSession.character(spec.character_id)
		var npc = Actor.new()
		npc.team = "npc"
		npc.actor_id = character.id
		npc.sprite_key = character.sprite_key
		npc.appearance = character.get("appearance", {})
		npc.position = Vector2(spec.position.x, spec.position.y)
		npc.set_meta("follow", spec.character_id == GameSession.chapter().get("companion_id", ""))
		npc.facing = -1
		actors.add_child(npc)
		npc.set_physics_process(false)
		npc.hurtbox.collision_layer = 0
		npc.hitbox.monitoring = false
	spawned.clear()
	checkpoint_clock = 0
	update_camera()

func play() -> void:
	ui.close_modal()
	GameSession.change_state("PLAYING")
	EventBus.stage_started.emit(GameSession.chapter().id)

func _process(delta: float) -> void:
	if Input.is_action_just_pressed("pause"):
		if GameSession.state == "PLAYING": pause_game()
		elif GameSession.state == "PAUSED": play()
	if GameSession.state != "PLAYING" or not is_instance_valid(player): return
	if player.hp <= 0:
		GameSession.change_state("PLAYER_DOWN")
		ui.clear_modal("잠깐 쉬었다 다시 가자", "찾은 기억은 그대로 남아 있어요.\n체력을 회복하고 거리 입구에서 다시 시작합니다.")
		ui.button("다시 도전", retry)
		return
	update_companion(delta)
	update_camera()
	if not indoors:
		var event: Dictionary = story_events.next(GameSession.chapter(), GameSession.progress, player.position.x, quest.is_complete())
		if not event.is_empty() and player.grounded and player.attack_clock <= 0:
			show_story_event(event)
			return
		spawn_enemies()
	stage.clue_positions = [] if indoors else quest.available_clues()
	stage.exit_active = quest.is_complete()
	var objective: String = quest.objective_text()
	if indoors:
		objective = "책상 앞에서 E · 문 앞에서 E로 나가기"
	elif quest.is_complete():
		objective = "오른쪽 문 앞에서 살피기 →" if GameSession.chapter().get("exit_mode", "cafe") == "direct" else "오른쪽 카페 문 앞에서 E로 들어가기 →"
	ui.update_hud(player.hp, objective)
	ui.status.text = "Space 점프 · K 앉기" if not indoors and player.position.x > 255 and player.position.x < 550 else ""
	GameSession.progress.hp = player.hp
	checkpoint_clock += delta
	if checkpoint_clock >= 3:
		GameSession.persist()
		checkpoint_clock = 0
	if Input.is_action_just_pressed("interact"):
		interact_nearby()

func interact_nearby() -> void:
	if not player.grounded or player.elevation > 0.1 or player.attack_clock > 0: return
	if indoors:
		if player.position.distance_to(stage.room_exit) < 22:
			leave_cafe()
		elif player.position.distance_to(stage.letter_desk) < 25:
			if quest.is_complete(): finish_chapter()
			else:
				GameSession.change_state("CLUE_REVEAL")
				ui.clear_modal("창가의 편지", "너에게 전할 편지가 놓여 있다.\n거리에서 우리의 기억을 찾은 뒤 다시 읽어 보자.")
				ui.button("다시 둘러보기", play)
		return
	if player.position.distance_to(stage.door_position) < 25:
		if GameSession.chapter().get("exit_mode", "cafe") == "direct":
			if quest.is_complete(): finish_chapter()
			else:
				GameSession.change_state("CLUE_REVEAL")
				ui.clear_modal("문은 아직 닫혀 있다", "길을 열고 빛나는 기억을 모두 찾은 뒤 돌아오자.")
				ui.button("계속하기", play)
		else: enter_cafe()
		return
	for npc in stage.map_data.get("npcs", []):
		var at := Vector2(npc.position.x, npc.position.y)
		for actor in actors.get_children():
			if actor.actor_id == npc.character_id and actor.get_meta("follow", false): at = actor.position
		if player.position.distance_to(at) < 23:
			var character: Dictionary = GameSession.character(npc.character_id)
			GameSession.change_state("DIALOGUE")
			ui.clear_modal(character.name, GameSession.story_text(npc.text), character.get("portrait_key", ""))
			ui.button("계속하기", play)
			return
	for goal in quest.available_clues():
		var pos := Vector2(goal.position.x, goal.position.y)
		if player.position.distance_to(pos) < 25:
			collect(goal.target)
			return

func enter_cafe() -> void:
	if indoors: return
	indoors = true
	stage.indoors = true
	street_return = Vector2(stage.door_position.x - 25, player.position.y)
	player.reset_motion()
	player.surfaces = []
	player.arena = Rect2(24, 104, 272, 52)
	player.position = Vector2(160, 136)
	update_camera()
	for actor in actors.get_children():
		if actor == player: continue
		actor.hide()
		actor.set_physics_process(false)
	GameSession.persist()

func leave_cafe() -> void:
	if not indoors: return
	indoors = false
	stage.indoors = false
	player.reset_motion()
	player.arena = Rect2(24, 104, stage.world_width - 48, 52)
	player.surfaces = stage.surfaces
	player.position = street_return
	for actor in actors.get_children():
		if actor == player: continue
		actor.show()
		actor.set_physics_process(actor.team == "enemy")
	update_camera()

func update_camera() -> void:
	if not is_instance_valid(camera): return
	var size := get_viewport().get_visible_rect().size
	var half_width := size.x * 0.5
	camera.position.y = size.y * 0.5
	if indoors or not is_instance_valid(player):
		camera.position.x = half_width
	else:
		camera.position.x = clampf(roundf(player.position.x), half_width, maxf(half_width, (stage.world_width if is_instance_valid(stage) else 960) - half_width))

func spawn_enemies() -> void:
	for data in GameSession.chapter().enemies:
		if data.get("event_id", "") != "" and data.event_id not in GameSession.progress.get("completed_event_ids", []): continue
		if data.id in spawned or data.id in GameSession.progress.defeated_actor_ids: continue
		if player.position.x < data.trigger_x: continue
		var ready := true
		for dep in data.after:
			if dep not in GameSession.progress.defeated_actor_ids: ready = false
		if not ready: continue
		var enemy = Actor.new()
		enemy.actor_id = data.id
		enemy.enemy_type = data.type
		enemy.visual = data.get("visual", "default")
		enemy.max_hp = int(data.get("max_hp", 55 if data.type == "bruiser" else 35))
		enemy.hp = enemy.max_hp
		enemy.speed = 30 if data.type == "bruiser" else 45
		enemy.position = Vector2(data.position.x, data.position.y)
		enemy.target = player
		enemy.arena = player.arena
		enemy.sprite_key = data.get("sprite_key", "")
		if not stage.map_data.is_empty(): enemy.surfaces = stage.surfaces
		actors.add_child(enemy)
		spawned.append(data.id)

func on_defeat(id: String, _type: String) -> void:
	quest.record_defeat(id)
	GameSession.progress.hp = maxi(1, player.hp)
	GameSession.persist()

func collect(id: String) -> bool:
	if not quest.can_collect(id) or not GameSession.collect(id): return false
	quest.refresh()
	GameSession.persist()
	GameSession.change_state("CLUE_REVEAL")
	for clue in GameSession.pack.clues:
		if clue.id != id: continue
		ui.clear_modal(clue.name, GameSession.story_text(clue.text + "\n\n" + clue.memory), GameSession.character(clue.get("speaker_id", "")).get("portrait_key", ""))
		if clue.has("image_key"): add_photo(clue.image_key, true)
		ui.button("기억을 간직하고 계속", play)
	return true

func retry() -> void:
	GameSession.progress.hp = 100
	GameSession.persist()
	build_stage()
	play()

func pause_game() -> void:
	if GameSession.state != "PLAYING": return
	GameSession.change_state("PAUSED")
	GameSession.persist()
	ui.clear_modal("잠시 쉬어가기", "소리 없이도 모든 이야기를 읽을 수 있어요.")
	ui.button("계속하기", play)
	ui.button("기억 앨범", album)
	ui.button("소리 켜기" if muted else "소리 끄기", toggle_mute)
	ui.button("저장하고 팩 선택", show_title)

func toggle_mute() -> void:
	muted = not muted
	music.volume_db = -80 if muted else -7
	GameSession.change_state("PLAYING")
	pause_game()

func album() -> void:
	var text := ""
	for clue in GameSession.pack.clues:
		if clue.id in GameSession.progress.collected_clue_ids:
			text += clue.name + "\n" + clue.memory + "\n"
	ui.clear_modal("우리의 기억", text if text else "아직 찾은 기억이 없어요.")
	ui.button("돌아가기", func():
		GameSession.change_state("PLAYING")
		pause_game())

func show_ending() -> void:
	GameSession.change_state("ENDING")
	GameSession.progress.ending_seen = true
	GameSession.persist()
	EventBus.stage_completed.emit(GameSession.chapter().id)
	ui.clear_modal("태어나줘서 고마워" if GameSession.pack.ending.has("photo_reveal") else "다시, 너에게", GameSession.story_text(GameSession.pack.ending.letter), GameSession.character_for_role("missing").get("portrait_key", ""))
	if GameSession.pack.ending.has("photo_reveal"): ui.button("우리의 오늘", show_family_ending)
	ui.button("기억을 다시 걸어보기", start.bind(false))
	ui.button("팩 선택으로", show_title)
	if DisplayServer.get_name() != "headless": music.play()

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT and is_instance_valid(ui):
		pause_game()

func finish_chapter() -> void:
	if not quest.is_complete(): return
	if GameSession.chapter_index() + 1 >= GameSession.pack.chapters.size():
		if GameSession.pack.ending.has("photo_reveal"): show_photo_puzzle()
		else: show_ending()
		return
	GameSession.change_state("CHAPTER_CLEAR")
	GameSession.persist()
	EventBus.stage_completed.emit(GameSession.chapter().id)
	ui.clear_modal(GameSession.chapter().title, "이곳의 기억을 간직하고 다음 장면으로 갑니다.")
	ui.button("다음 장면", advance_chapter)

func advance_chapter() -> void:
	if not quest.is_complete() or GameSession.chapter_index() + 1 >= GameSession.pack.chapters.size(): return
	GameSession.progress.stage_id = GameSession.pack.chapters[GameSession.chapter_index() + 1].id
	GameSession.progress.checkpoint_id = "start"
	GameSession.persist()
	build_stage()
	GameSession.change_state("STAGE_INTRO")
	ui.clear_modal(GameSession.chapter().title, GameSession.story_text(GameSession.chapter().intro), GameSession.character_for_role("player").get("portrait_key", ""))
	ui.button("기억을 찾아 출발", play)

func on_import_pack(arguments: Array) -> void:
	var errors: Array = []
	var pack: Variant = null
	if arguments.is_empty() or not arguments[0] is String or arguments[0].length() > 16000000:
		errors = ["게임팩 파일은 16 MB 이하 JSON이어야 합니다."]
	else:
		var parser := JSON.new()
		if parser.parse(arguments[0]) != OK: errors = ["JSON 형식을 확인해 주세요."]
		else:
			pack = parser.data
			errors = PackLoader.register_pack(pack)
	if errors.is_empty():
		if studio_preview or str(JavaScriptBridge.get_interface("window").myCartridgeBundlePath) == "episode.json": episode_only = pack.pack_id
		selected = pack_choices().find(pack.pack_id)
		show_title()
		if studio_preview and arguments.size() > 1 and arguments[1] is bool and arguments[1]: start(false)
	var result := {"ok": errors.is_empty(), "errors": errors}
	if errors.is_empty():
		result.pack_id = pack.pack_id
		result.title = pack.meta.title
	JavaScriptBridge.get_interface("window").myCartridgeImportResult = JSON.stringify(result)

func pack_choices() -> Array:
	return [episode_only] if not episode_only.is_empty() else PackLoader.available_packs()

func show_story_event(event: Dictionary) -> void:
	active_event = event
	GameSession.change_state("STORY_EVENT")
	player.reset_motion()
	ui.clear_modal(event.title, GameSession.story_text(event.text), GameSession.character(event.get("speaker_id", "")).get("portrait_key", ""))
	ui.button("계속 걷기", complete_story_event)

func complete_story_event() -> void:
	if active_event.is_empty() or GameSession.state != "STORY_EVENT": return
	if active_event.id not in GameSession.progress.completed_event_ids:
		player.hp = mini(player.max_hp, player.hp + int(active_event.heal))
		GameSession.progress.hp = player.hp
		GameSession.progress.completed_event_ids.append(active_event.id)
		GameSession.persist()
	active_event = {}
	play()

func add_photo(key: String, complete: bool, family: bool = false):
	var board = PhotoBoard.new()
	board.photo = AssetLibrary.texture(key)
	if board.photo == null: board.photo = PhotoBoard.sample(family)
	board.pieces = GameSession.pack.ending.get("photo_reveal", {}).get("clue_ids", ["photo"]).size()
	if complete:
		for i in board.pieces: board.placed.append(i)
	ui.body.add_child(board)
	return board

func show_photo_puzzle() -> void:
	if not quest.is_complete(): return
	var reveal: Dictionary = GameSession.pack.ending.photo_reveal
	for id in reveal.clue_ids:
		if id not in GameSession.progress.collected_clue_ids: return
	GameSession.change_state("PHOTO_ASSEMBLY")
	GameSession.persist()
	photo_placed.clear()
	ui.clear_modal("사진 조각을 맞춰 보자", "")
	photo_board = add_photo(reveal.get("photo_key", ""), false)
	photo_board.custom_minimum_size.y = 84
	var next_piece: Button = ui.button("조각 1 놓기", func(): place_photo_piece(photo_placed.size()))
	next_piece.name = "piece_next"

func place_photo_piece(index: int) -> void:
	if GameSession.state != "PHOTO_ASSEMBLY" or index in photo_placed: return
	if index < 0 or index >= GameSession.pack.ending.photo_reveal.clue_ids.size(): return
	photo_placed.append(index)
	photo_board.put_piece(index)
	var button = ui.body.find_child("piece_next", true, false)
	if photo_placed.size() == GameSession.pack.ending.photo_reveal.clue_ids.size():
		if button: button.hide()
		ui.button("사진 뒷면 보기", reveal_photo)
	elif button: button.text = "조각 %d 놓기" % (photo_placed.size() + 1)

func reveal_photo() -> void:
	if GameSession.state != "PHOTO_ASSEMBLY" or photo_placed.size() != GameSession.pack.ending.photo_reveal.clue_ids.size(): return
	GameSession.change_state("PHOTO_REVEAL")
	var reveal: Dictionary = GameSession.pack.ending.photo_reveal
	ui.clear_modal(GameSession.story_text(reveal.subject), GameSession.story_text(reveal.date + "\n\n" + reveal.reveal_text))
	add_photo(reveal.get("photo_key", ""), true)
	if not reveal.has("photo_key"):
		var notice := Label.new()
		notice.text = "샘플 일러스트 · 스튜디오에서 실제 사진으로 교체"
		notice.add_theme_font_size_override("font_size", 8)
		ui.body.add_child(notice)
	ui.button("편지 읽기", show_ending)

func show_family_ending() -> void:
	GameSession.change_state("FAMILY_ENDING")
	ui.clear_modal("우리의 오늘", GameSession.story_text("이제 우리 세 사람의 이야기가 이어집니다.\n오늘의 주인공은 {{player}}."))
	add_photo(GameSession.pack.ending.photo_reveal.get("family_key", ""), true, true)
	ui.button("기억을 다시 걸어보기", start.bind(false))
	ui.button("팩 선택으로", show_title)

func update_companion(delta: float) -> void:
	if indoors: return
	for actor in actors.get_children():
		if not actor.get_meta("follow", false): continue
		var wanted := Vector2(clampf(player.position.x - 36, player.arena.position.x, player.arena.end.x), clampf(player.position.y + 12, 104, 156))
		var before: Vector2 = actor.position
		if actor.position.distance_to(wanted) > 6: actor.position = actor.position.move_toward(wanted, delta * 92)
		actor.velocity = (actor.position - before) / maxf(delta, 0.001)
		actor.phase = "MOVE" if actor.velocity.length() > 0.1 else "IDLE"
		if actor.velocity.x != 0: actor.facing = 1 if actor.velocity.x > 0 else -1
		actor.time += delta
		actor.elevation = player.elevation
		actor.queue_redraw()
