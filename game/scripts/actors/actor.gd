extends CharacterBody2D

const Combat = preload("res://scripts/gameplay/combat_manager.gd")
var team := "enemy"
var actor_id := ""
var enemy_type := "street_thug"
var hp := 35
var max_hp := 35
var speed := 45.0
var facing := -1
var phase := "IDLE"
var target: CharacterBody2D
var arena := Rect2(24, 104, 912, 52)
var attack_clock := 0.0
var attack_length := 0.34
var windup := 0.08
var cooldown := 0.0
var stun := 0.0
var invulnerability := 0.0
var combo := 0
var combo_window := 0.0
var buffered := false
var attack_id := 0
var hits: Dictionary = {}
var hitbox: Area2D
var hurtbox: Area2D
var time := 0.0
var knockback := Vector2.ZERO
var elevation := 0.0
var vertical_speed := 0.0
var grounded := true
var crouching := false
var surfaces: Array = []
var support_id := "ground"
var shadow_height := 0.0
const GRAVITY := 520.0
const JUMP_SPEED := 210.0

func _ready() -> void:
	add_to_group("actors")
	collision_layer = 0
	collision_mask = 0
	hurtbox = Area2D.new()
	hurtbox.collision_layer = 2
	hurtbox.collision_mask = 0
	hurtbox.monitoring = false
	hurtbox.set_meta("actor", self)
	var hurt_shape := CollisionShape2D.new()
	var body := RectangleShape2D.new()
	body.size = Vector2(14, 14)
	hurt_shape.shape = body
	hurtbox.add_child(hurt_shape)
	add_child(hurtbox)
	hitbox = Area2D.new()
	hitbox.collision_layer = 0
	hitbox.collision_mask = 2
	hitbox.monitorable = false
	var hit_shape := CollisionShape2D.new()
	var fist := RectangleShape2D.new()
	fist.size = Vector2(29, 22)
	hit_shape.shape = fist
	hitbox.add_child(hit_shape)
	add_child(hitbox)

func _physics_process(delta: float) -> void:
	if GameSession.state != "PLAYING":
		queue_redraw()
		return
	time += delta
	cooldown = maxf(0, cooldown - delta)
	stun = maxf(0, stun - delta)
	invulnerability = maxf(0, invulnerability - delta)
	combo_window = maxf(0, combo_window - delta)
	if hp <= 0:
		phase = "DOWN"
		queue_redraw()
		return
	crouching = team == "player" and grounded and stun <= 0 and attack_clock <= 0 and Input.is_action_pressed("crouch")
	if team == "player" and Input.is_action_just_pressed("jump") and grounded and stun <= 0 and attack_clock <= 0:
		vertical_speed = JUMP_SPEED
		grounded = false
		crouching = false
	if team == "player" and Input.is_action_just_pressed("attack"):
		if attack_clock > 0: buffered = true
		elif stun <= 0 and not crouching: start_attack()
	if stun > 0:
		phase = "HURT"
		velocity = knockback
		knockback = knockback.move_toward(Vector2.ZERO, delta * 700)
	elif attack_clock > 0:
		attack_clock += delta
		phase = "ATTACK"
		velocity = Vector2.ZERO
		if attack_clock >= windup and attack_clock <= windup + 0.10:
			for area in hitbox.get_overlapping_areas():
				if area.has_meta("actor"):
					var damage: int = [12, 14, 24][combo] if team == "player" else (13 if enemy_type == "bruiser" else 8)
					Combat.try_hit(self, area.get_meta("actor"), attack_id, damage, hits)
		if attack_clock >= attack_length:
			attack_clock = 0
			combo_window = 0.45
			if buffered and team == "player": start_attack()
	else:
		velocity = movement() * speed * (0.35 if crouching else 1.0)
		phase = "CROUCH" if crouching else ("MOVE" if velocity.length() > 0.1 else "IDLE")
		if velocity.x != 0: facing = 1 if velocity.x > 0 else -1
	var previous := position
	move_and_slide()
	position.x = clampf(position.x, arena.position.x, arena.end.x)
	position.y = clampf(position.y, arena.position.y, arena.end.y)
	resolve_platform_walls(previous)
	update_elevation(delta)
	hitbox.position = Vector2(facing * 14, -elevation)
	hurtbox.position.y = -elevation
	queue_redraw()

func resolve_platform_walls(previous: Vector2) -> void:
	for surface in surfaces:
		if elevation >= float(surface.height) - 0.01: continue
		var rect: Rect2 = surface.footprint
		if not rect.has_point(position): continue
		if not rect.has_point(Vector2(previous.x, position.y)):
			position.x = rect.position.x - 0.01 if previous.x < rect.position.x else rect.end.x + 0.01
		elif not rect.has_point(Vector2(position.x, previous.y)):
			position.y = rect.position.y - 0.01 if previous.y < rect.position.y else rect.end.y + 0.01
		else:
			position = previous

func update_elevation(delta: float) -> void:
	var floor_height := 0.0
	var floor_id := "ground"
	for surface in surfaces:
		if surface.footprint.has_point(position) and float(surface.height) <= elevation + 0.01 and float(surface.height) > floor_height:
			floor_height = surface.height
			floor_id = surface.id
	shadow_height = floor_height
	if grounded and absf(elevation - floor_height) < 0.02:
		elevation = floor_height
		vertical_speed = 0
		support_id = floor_id
		return
	grounded = false
	vertical_speed -= GRAVITY * delta
	var next_height := elevation + vertical_speed * delta
	if vertical_speed <= 0 and next_height <= floor_height:
		elevation = floor_height
		vertical_speed = 0
		grounded = true
		support_id = floor_id
	else:
		elevation = maxf(0, next_height)

func reset_motion() -> void:
	velocity = Vector2.ZERO
	knockback = Vector2.ZERO
	attack_clock = 0
	buffered = false
	elevation = 0
	vertical_speed = 0
	grounded = true
	crouching = false
	support_id = "ground"
	shadow_height = 0

func movement() -> Vector2:
	if team == "player":
		return (Input.get_vector("move_left", "move_right", "move_up", "move_down") + MobileInput.movement).limit_length()
	if not is_instance_valid(target) or target.hp <= 0: return Vector2.ZERO
	var offset := target.position - position
	facing = 1 if offset.x >= 0 else -1
	if absf(offset.x) < 23 and absf(offset.y) < 9:
		if absf(target.elevation - elevation) > 14: return Vector2.ZERO
		if cooldown <= 0: start_attack()
		return Vector2.ZERO
	return offset.normalized()

func start_attack() -> void:
	combo = (combo + 1) % 3 if combo_window > 0 else 0
	combo_window = 0
	buffered = false
	attack_clock = 0.001
	attack_id += 1
	hits.clear()
	windup = 0.08 if team == "player" else 0.40
	attack_length = 0.32 if team == "player" else 0.66
	cooldown = 0.9

func receive_hit(damage: int, direction: int) -> bool:
	if hp <= 0 or invulnerability > 0: return false
	hp = maxi(0, hp - damage)
	attack_clock = 0
	buffered = false
	stun = 0.23
	knockback = Vector2(direction * 100, 0)
	invulnerability = 0.75 if team == "player" else 0.12
	if hp == 0 and team == "enemy": EventBus.actor_defeated.emit(actor_id, enemy_type)
	return true

func _draw() -> void:
	draw_ellipse_shadow()
	draw_set_transform(Vector2(0, -roundf(elevation)), 0, Vector2(1, 0.55 if crouching else 1.0))
	if hp <= 0:
		draw_rect(Rect2(-11, -7, 22, 6), Color("777b95"))
		return
	var bounce := roundf(sin(time * 12)) if phase == "MOVE" else 0.0
	var coat := Color("6bb8c4") if team == "player" else Color("d36d81")
	if enemy_type == "bruiser" and team == "enemy": coat = Color("a78ac9")
	if invulnerability > 0 and fmod(time, 0.12) < 0.06: coat = Color("fff1cc")
	var bob := Vector2(0, bounce)
	draw_rect(Rect2(Vector2(-7, -19) + bob, Vector2(14, 13)), coat)
	draw_rect(Rect2(Vector2(-8, -32) + bob, Vector2(16, 13)), Color("f4cdb3"))
	draw_rect(Rect2(Vector2(-9, -35) + bob, Vector2(18, 7)), Color("272945"))
	draw_rect(Rect2(Vector2(-9, -29) + bob, Vector2(4, 6)), Color("272945"))
	draw_rect(Rect2(Vector2(facing * 4 - 1, -27) + bob, Vector2(2, 2)), Color("272945"))
	draw_rect(Rect2(Vector2(-8, -21) + bob, Vector2(16, 4)), Color("f6c77e"))
	var stride := roundf(sin(time * 13) * 2) if phase == "MOVE" else 0.0
	draw_rect(Rect2(-7, -6, 5, 5 + stride), Color("252941"))
	draw_rect(Rect2(2, -6, 5, 5 - stride), Color("252941"))
	if attack_clock > 0:
		if attack_clock < windup:
			draw_line(Vector2(facing * 8, -16), Vector2(facing * 12, -21), Color("ffe0a3"), 3)
		else:
			draw_rect(Rect2(Vector2(facing * 18 - 5, -18), Vector2(10, 7)), Color("ffe0a3"))
			draw_arc(Vector2(facing * 15, -14), 13, -1.4, 1.4, 8, Color("fff1cb"), 2)
	if team == "enemy":
		draw_rect(Rect2(-10, -41, 20, 2), Color("34354e"))
		draw_rect(Rect2(-10, -41, 20.0 * hp / max_hp, 2), Color("f2949a"))

func draw_ellipse_shadow() -> void:
	draw_set_transform(Vector2(0, -roundf(shadow_height)), 0, Vector2(1, 0.3))
	draw_circle(Vector2.ZERO, maxf(5, 10 - elevation * 0.06), Color(0.03, 0.05, 0.12, 0.35))
	draw_set_transform(Vector2.ZERO)
