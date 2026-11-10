extends Node2D

const DEADZONE := 0.16
const STICK_RADIUS := 24.0
const THUMB_RADIUS := 10.0
var stick_radius := STICK_RADIUS
var stick_pointer := -1
var stick_center := Vector2.ZERO
var stick_offset := Vector2.ZERO
var idle_center := Vector2.ZERO
var activation_rect := Rect2()
var ui_theme: Theme
var buttons: Array = []
var contacts: Dictionary = {}

func _ready() -> void:
	visibility_changed.connect(func():
		if not is_visible_in_tree(): release_all())

func configure(size: Vector2, safe: Rect2) -> void:
	release_all()
	# Scale controls up on tall logical viewports, while keeping the 320x180 layout.
	var unit := clampf(size.y / 180.0, 1.0, 1.4)
	stick_radius = STICK_RADIUS * unit
	activation_rect = Rect2(safe.position + Vector2(0, 44 * unit),
		Vector2(maxf(0, size.x * 0.48 - safe.position.x), maxf(0, safe.size.y - 44 * unit)))
	idle_center = Vector2(safe.position.x + 36 * unit, safe.end.y - 32 * unit)
	stick_center = idle_center
	buttons = [
		{"action": "attack", "text": "공격", "center": safe.end - Vector2(25, 24) * unit, "radius": 20.0 * unit},
		{"action": "jump", "text": "점프", "center": safe.end - Vector2(23, 71) * unit, "radius": 15.0 * unit},
		{"action": "interact", "text": "살피기", "center": safe.end - Vector2(68, 47) * unit, "radius": 15.0 * unit},
	]
	for child in get_children(): child.queue_free()
	for item in buttons:
		var label := Label.new()
		label.theme = ui_theme
		label.position = item.center - Vector2(item.radius, 7 * unit)
		label.size = Vector2(item.radius * 2, 14 * unit)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.add_theme_font_size_override("font_size", roundi(9 * unit))
		label.text = item.text
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(label)
	queue_redraw()

func _input(event: InputEvent) -> void:
	if not is_visible_in_tree() or GameSession.state != "PLAYING": return
	if event is InputEventScreenTouch:
		if event.pressed and not event.canceled: press(event.index, event.position)
		else: release(event.index)
	elif event is InputEventScreenDrag:
		drag(event.index, event.position)
	elif event is InputEventMouseButton and event.device != InputEvent.DEVICE_ID_EMULATION and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed: press(-2, event.position)
		else: release(-2)
	elif event is InputEventMouseMotion and event.device != InputEvent.DEVICE_ID_EMULATION:
		drag(-2, event.position)

func press(pointer: int, point: Vector2) -> void:
	if contacts.has(pointer) or stick_pointer == pointer: return
	for item in buttons:
		if point.distance_to(item.center) <= item.radius:
			contacts[pointer] = item.action
			Input.action_press(item.action)
			queue_redraw()
			return
	if stick_pointer == -1 and activation_rect.has_point(point):
		stick_pointer = pointer
		# Exact touch origin, including near an edge; only the decoration may clip.
		stick_center = point
		stick_offset = Vector2.ZERO
		MobileInput.movement = Vector2.ZERO
		queue_redraw()

func drag(pointer: int, point: Vector2) -> void:
	if pointer != stick_pointer or stick_pointer == -1: return
	stick_offset = (point - stick_center).limit_length(stick_radius)
	var tilt := stick_offset.length() / stick_radius
	MobileInput.movement = Vector2.ZERO if tilt <= DEADZONE else stick_offset.normalized() * ((tilt - DEADZONE) / (1.0 - DEADZONE))
	queue_redraw()

func release(pointer: int) -> void:
	if pointer == stick_pointer:
		stick_pointer = -1
		stick_offset = Vector2.ZERO
		stick_center = idle_center
		MobileInput.movement = Vector2.ZERO
	if contacts.has(pointer):
		var action: String = contacts[pointer]
		contacts.erase(pointer)
		if not action in contacts.values(): Input.action_release(action)
	queue_redraw()

func release_all() -> void:
	for action in contacts.values(): Input.action_release(action)
	contacts.clear()
	stick_pointer = -1
	stick_offset = Vector2.ZERO
	MobileInput.movement = Vector2.ZERO
	stick_center = idle_center
	queue_redraw()

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT: release_all()

func _exit_tree() -> void:
	release_all()

func _draw() -> void:
	var active := stick_pointer != -1
	var center := stick_center if active else idle_center
	draw_circle(center, stick_radius, Color(0.06, 0.12, 0.22, 0.55 if active else 0.22))
	draw_arc(center, stick_radius, 0, TAU, 48, Color(0.55, 0.81, 0.78, 0.8 if active else 0.35), 1, true)
	draw_circle(center + stick_offset, THUMB_RADIUS * stick_radius / STICK_RADIUS, Color(0.55, 0.81, 0.78, 0.8 if active else 0.3))
	for item in buttons:
		var held: bool = item.action in contacts.values()
		draw_circle(item.center, item.radius, Color(0.28, 0.50, 0.55, 0.85) if held else Color(0.06, 0.12, 0.22, 0.68))
		draw_arc(item.center, item.radius, 0, TAU, 48, Color("f6c77e") if item.action == "attack" else Color("8ccfc6"), 1, true)
