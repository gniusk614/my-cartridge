extends Control

var photo: Texture2D
var pieces := 6
var placed: Array = []

func _ready() -> void:
	custom_minimum_size = Vector2(216, 112)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

func put_piece(index: int) -> void:
	if index not in placed: placed.append(index)
	queue_redraw()

static func sample(family: bool = false) -> Texture2D:
	var image := Image.create(120, 80, false, Image.FORMAT_RGBA8)
	image.fill(Color("f5e8c8"))
	image.fill_rect(Rect2i(4, 4, 112, 72), Color("b7c8bb") if family else Color("b5b4c6"))
	image.fill_rect(Rect2i(12, 50, 96, 22), Color("dbb8aa"))
	if family:
		for x in [30, 77]:
			image.fill_rect(Rect2i(x, 18, 16, 18), Color("f4cdb3"))
			image.fill_rect(Rect2i(x - 2, 14, 20, 7), Color("443345"))
			image.fill_rect(Rect2i(x - 4, 36, 24, 26), Color("d9919c") if x == 30 else Color("59899c"))
	image.fill_rect(Rect2i(44, 36, 30, 25), Color("ead9b0"))
	image.fill_rect(Rect2i(48, 22, 22, 19), Color("f4cdb3"))
	image.fill_rect(Rect2i(48, 20, 22, 5), Color("69515b"))
	image.fill_rect(Rect2i(52, 30, 2, 2), Color("443345"))
	image.fill_rect(Rect2i(63, 30, 2, 2), Color("443345"))
	return ImageTexture.create_from_image(image)

func _draw() -> void:
	if photo == null: return
	var src := photo.get_size()
	var factor := minf(size.x / src.x, custom_minimum_size.y / src.y)
	var drawn := src * factor
	var origin := Vector2((size.x - drawn.x) / 2, 0)
	var columns := mini(3, pieces)
	var rows := ceili(float(pieces) / columns)
	for i in rows * columns:
		var cell := Vector2(i % columns, floorf(float(i) / columns))
		var cell_size := drawn / Vector2(columns, rows)
		var destination := Rect2(origin + cell * cell_size, cell_size)
		if i in placed or placed.size() >= pieces:
			draw_texture_rect_region(photo, destination, Rect2(cell * src / Vector2(columns, rows), src / Vector2(columns, rows)))
		else:
			draw_rect(destination, Color("37465c"))
			draw_rect(destination.grow(-1), Color("92bcb7"), false, 1)
