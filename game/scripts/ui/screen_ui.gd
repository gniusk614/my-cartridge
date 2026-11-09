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
var pause_button: Button
var touch_layout: Array = []

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
	pause_button = Button.new()
	pause_button.text = "Ⅱ"
	pause_button.size = Vector2(28, 24)
	pause_button.pressed.connect(func(): root.pause_game())
	base.add_child(pause_button)
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
	get_viewport().size_changed.connect(apply_layout)
	apply_layout()
	EventBus.save_failed.connect(func(message): status.text = message)

func apply_layout() -> void:
	var safe: Dictionary = {}
	if OS.has_feature("web"):
		var raw = JavaScriptBridge.eval("JSON.stringify(window.myCartridgeSafeArea || {})")
		if raw is String:
			var parsed = JSON.parse_string(raw)
			if parsed is Dictionary: safe = parsed
	layout_for_size(get_viewport().get_visible_rect().size, safe)

func layout_for_size(size: Vector2, safe: Dictionary = {}) -> void:
	var scale_x := size.x / maxf(1, float(safe.get("width", size.x)))
	var scale_y := size.y / maxf(1, float(safe.get("height", size.y)))
	var left := maxf(8, float(safe.get("left", 0)) * scale_x + 3)
	var right := maxf(13, float(safe.get("right", 0)) * scale_x + 3)
	var top := maxf(5, float(safe.get("top", 0)) * scale_y + 3)
	var bottom := maxf(6, float(safe.get("bottom", 0)) * scale_y + 3)
	hud.position = Vector2(left, top)
	hp.position = Vector2(left, top + 28)
	pause_button.position = Vector2(size.x - right - 28, top)
	status.position = Vector2(left + 74, size.y - bottom - 14)
	status.size.x = maxf(80, size.x - left - right - 160)
	modal.position = (size - modal.size) * 0.5
	for item in touch_layout:
		var offset := Vector2(left - 3 if item.left_side else size.x - 320 - (right - 13), size.y - 180 - bottom)
		item.button.position = item.origin + offset

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
		touch_layout.append({"button": button, "origin": button.position, "left_side": str(spec[0]).begins_with("move_")})
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
