extends CanvasLayer

var root
var hud: Label
var status: Label
var modal: PanelContainer
var body: VBoxContainer
var touches: Node2D
var hp: ColorRect
var hp_fill: ColorRect
var ui_theme: Theme

func _ready() -> void:
	layer = 10
	var theme := Theme.new()
	theme.default_font_size = 10
	# System fallback on native; bundled Noto font is selected when available.
	if ResourceLoader.exists("res://assets/fonts/NotoSansKR.ttf"):
		theme.default_font = load("res://assets/fonts/NotoSansKR.ttf")
	var base := Control.new()
	ui_theme = theme
	base.theme = theme
	base.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(base)
	hud = Label.new()
	hud.position = Vector2(8, 5)
	hud.size = Vector2(244, 30)
	hud.add_theme_font_size_override("font_size", 9)
	base.add_child(hud)
	hp = ColorRect.new()
	hp.position = Vector2(8, 33)
	hp.size = Vector2(60, 4)
	hp.color = Color("2b354b")
	hp.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hp_fill = ColorRect.new()
	hp_fill.size = Vector2(60, 4)
	hp_fill.color = Color("7bd1c5")
	hp_fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hp.add_child(hp_fill)
	base.add_child(hp)
	var pause := Button.new()
	pause.text = "Ⅱ"
	pause.position = Vector2(285, 5)
	pause.size = Vector2(28, 24)
	pause.pressed.connect(func(): root.pause_game())
	base.add_child(pause)
	status = Label.new()
	status.position = Vector2(82, 164)
	status.size = Vector2(157, 14)
	status.add_theme_font_size_override("font_size", 8)
	base.add_child(status)
	modal = PanelContainer.new()
	modal.position = Vector2(39, 8)
	modal.size = Vector2(242, 162)
	var style := StyleBoxFlat.new()
	style.bg_color = Color("17263d")
	style.border_color = Color("be9d78")
	style.set_border_width_all(1)
	style.content_margin_left = 12
	style.content_margin_right = 12
	style.content_margin_top = 9
	style.content_margin_bottom = 9
	modal.add_theme_stylebox_override("panel", style)
	base.add_child(modal)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.custom_minimum_size = Vector2(216, 134)
	modal.add_child(scroll)
	body = VBoxContainer.new()
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 4)
	scroll.add_child(body)
	create_touches()
	EventBus.save_failed.connect(func(message): status.text = message)

func create_touches() -> void:
	touches = Node2D.new()
	add_child(touches)
	for spec in [["move_left", "←", Vector2(17, 145)], ["move_right", "→", Vector2(67, 145)],
		["move_up", "↑", Vector2(42, 120)], ["move_down", "↓", Vector2(42, 166)],
		["attack", "공격", Vector2(293, 151)], ["interact", "살피기", Vector2(250, 116)],
		["jump", "점프", Vector2(293, 116)], ["crouch", "앉기", Vector2(250, 151)]]:
		var button := TouchScreenButton.new()
		button.action = spec[0]
		button.position = spec[2]
		var shape := CircleShape2D.new()
		shape.radius = 13
		button.shape = shape
		button.visibility_mode = TouchScreenButton.VISIBILITY_ALWAYS
		var image := Image.create(28, 28, false, Image.FORMAT_RGBA8)
		image.fill(Color(0.09, 0.16, 0.26, 0.65))
		button.texture_normal = ImageTexture.create_from_image(image)
		button.texture_pressed = button.texture_normal
		# Shape is centered at texture center; place button around intended center.
		button.position -= Vector2(14, 14)
		touches.add_child(button)
		var label := Label.new()
		label.theme = ui_theme
		label.position = Vector2(0, 5)
		label.size = Vector2(28, 18)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.text = spec[1]
		label.add_theme_font_size_override("font_size", 9)
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		button.add_child(label)

func clear_modal(title: String, text: String) -> void:
	for child in body.get_children():
		body.remove_child(child)
		child.queue_free()
	modal.show()
	hud.hide()
	hp.hide()
	status.hide()
	touches.hide()
	for action in ["move_left", "move_right", "move_up", "move_down", "attack", "interact", "jump", "crouch"]:
		Input.action_release(action)
	var heading := Label.new()
	heading.text = title
	heading.add_theme_font_size_override("font_size", 12)
	body.add_child(heading)
	if not text.is_empty():
		var copy := Label.new()
		copy.text = text
		copy.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		copy.custom_minimum_size = Vector2(216, 0)
		copy.add_theme_font_size_override("font_size", 9)
		body.add_child(copy)

func button(text: String, callback: Callable) -> Button:
	var item := Button.new()
	item.text = text
	item.custom_minimum_size.y = 21
	item.add_theme_font_size_override("font_size", 9)
	item.pressed.connect(callback)
	body.add_child(item)
	return item

func row() -> HBoxContainer:
	var box := HBoxContainer.new()
	body.add_child(box)
	return box

func close_modal() -> void:
	modal.hide()
	hud.show()
	hp.show()
	status.show()
	touches.show()

func update_hud(player_hp: int, objective: String) -> void:
	hud.text = "%s    기억 %d / %d\n%s" % [GameSession.pack.meta.title,
		GameSession.progress.collected_clue_ids.size(), GameSession.pack.clues.size(), objective]
	hp_fill.size.x = 60.0 * player_hp / 100.0
