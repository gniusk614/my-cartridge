extends Node

var textures: Dictionary = {}
var definitions: Dictionary = {}

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

func draw_actor(canvas: CanvasItem, id: String, animation: String, clock: float, attack_ratio: float = -1) -> bool:
	if not definitions.has(id) or definitions[id].kind != "sprite_sheet": return false
	var asset: Dictionary = definitions[id]
	var spec: Dictionary = asset.animations.get(animation, asset.animations.idle)
	var frame := int(clock * float(spec.fps)) % int(spec.frames)
	if attack_ratio >= 0: frame = mini(int(spec.frames) - 1, int(attack_ratio * int(spec.frames)))
	var size := Vector2(asset.frame_width, asset.frame_height)
	canvas.draw_texture_rect_region(textures[id], Rect2(Vector2(-size.x / 2, -size.y), size), Rect2(Vector2(frame * size.x, float(spec.row) * size.y), size))
	return true
