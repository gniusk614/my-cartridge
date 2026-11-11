extends Node

var textures: Dictionary = {}
var definitions: Dictionary = {}
var placeholder: Texture2D

func placeholder_texture() -> Texture2D:
	if placeholder == null:
		var image := Image.create(16, 16, false, Image.FORMAT_RGBA8)
		image.fill(Color("7d8c9c"))
		for y in 16:
			for x in 16:
				if x == 0 or y == 0 or x == 15 or y == 15: image.set_pixel(x, y, Color("dbe2e5"))
				elif (floori(x / 4.0) + floori(y / 4.0)) % 2 == 0: image.set_pixel(x, y, Color("8899a8"))
		placeholder = ImageTexture.create_from_image(image)
	return placeholder

func configure(pack: Dictionary) -> void:
	textures.clear()
	definitions.clear()
	for asset in pack.get("assets", []):
		var image := Image.new()
		if image.load_png_from_buffer(Marshalls.base64_to_raw(asset.png_base64)) == OK:
			textures[asset.id] = ImageTexture.create_from_image(image)
			definitions[asset.id] = asset

func texture(id: String) -> Texture2D:
	return textures.get(id)

func actor_size(id: String) -> Vector2:
	if not definitions.has(id) or definitions[id].kind != "sprite_sheet": return Vector2.ZERO
	var asset: Dictionary = definitions[id]
	var height := float(asset.get("display_height", asset.frame_height))
	return Vector2(float(asset.frame_width) / float(asset.frame_height) * height, height)

func draw_actor(canvas: CanvasItem, id: String, animation: String, clock: float, attack_ratio: float = -1) -> bool:
	if not definitions.has(id) or definitions[id].kind != "sprite_sheet": return false
	var asset: Dictionary = definitions[id]
	var spec: Dictionary = asset.animations.get(animation, asset.animations.idle)
	var frame := int(clock * float(spec.fps)) % int(spec.frames)
	if attack_ratio >= 0: frame = mini(int(spec.frames) - 1, int(attack_ratio * int(spec.frames)))
	var size := Vector2(asset.frame_width, asset.frame_height)
	var drawn := actor_size(id)
	canvas.draw_texture_rect_region(textures[id], Rect2(Vector2(-drawn.x / 2, -drawn.y), drawn), Rect2(Vector2(frame * size.x, float(spec.row) * size.y), size))
	return true
