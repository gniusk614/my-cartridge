extends Node2D

var clock := 0.0
var clue_positions: Array = []
var exit_active := false
var indoors := false
var surfaces: Array = [
	{"id": "crate", "footprint": Rect2(300, 104, 32, 17), "height": 16.0},
	{"id": "balcony", "footprint": Rect2(355, 104, 160, 17), "height": 50.0}
]
const CAFE_DOOR := Vector2(909, 133)
const ROOM_EXIT := Vector2(160, 149)
const LETTER_DESK := Vector2(251, 117)

func _process(delta: float) -> void:
	if GameSession.state == "PLAYING": clock += delta
	queue_redraw()

func _draw() -> void:
	if indoors:
		draw_interior()
		return
	draw_rect(Rect2(0, 0, 960, 180), Color("111e38"))
	draw_circle(Vector2(265, 27), 13, Color("f6dfb2"))
	for i in 18:
		var x := float(i * 58)
		var h := float(30 + (i * 17) % 38)
		draw_rect(Rect2(x, 95 - h, 50, h), Color("23314d"))
		for j in 3:
			draw_rect(Rect2(x + 8 + j * 12, 72 - h, 5, 8), Color("48576b"))
	for i in 8:
		var x := float(i * 132 - 20)
		draw_rect(Rect2(x, 45, 112, 63), Color("3d425e") if i % 2 else Color("394f62"))
		draw_rect(Rect2(x - 3, 40, 118, 7), Color("dce7ed"))
		draw_rect(Rect2(x + 12, 66, 28, 29), Color("edbe85"))
		draw_rect(Rect2(x + 48, 66, 28, 29), Color("e3b07f"))
		draw_line(Vector2(x + 26, 66), Vector2(x + 26, 95), Color("6f5661"), 2)
	draw_rect(Rect2(0, 101, 960, 79), Color("b1c5d5"))
	draw_rect(Rect2(0, 109, 960, 51), Color("7a93ac"))
	for i in 60:
		draw_rect(Rect2((i * 47) % 960, 116 + (i * 13) % 43, 8, 1), Color("a7bfce"))
	for x in [130, 440, 760]:
		draw_rect(Rect2(x, 48, 3, 57), Color("293449"))
		draw_rect(Rect2(x - 5, 44, 13, 10), Color("ffe4a0"))
		draw_circle(Vector2(x + 1, 50), 18, Color(1, 0.83, 0.5, 0.07))
	# Destination café; approved original procedural placeholder art.
	draw_rect(Rect2(866, 43, 88, 62), Color("645265"))
	draw_rect(Rect2(862, 39, 96, 7), Color("e8edf0"))
	draw_rect(Rect2(878, 54, 63, 13), Color("243c4c"))
	draw_string(ThemeDB.fallback_font, Vector2(892, 64), "CAFE", HORIZONTAL_ALIGNMENT_LEFT, -1, 9, Color("ffe6a9"))
	draw_rect(Rect2(903, 73, 24, 32), Color("d3a076"))
	draw_rect(Rect2(908, 78, 14, 18), Color("f9dca1"))
	draw_rect(Rect2(895, 98, 29, 38), Color("473848"))
	draw_rect(Rect2(900, 101, 19, 32), Color("d7b07f"))
	draw_rect(Rect2(904, 105, 11, 14), Color("ffe8aa"))
	draw_circle(Vector2(915, 125), 1, Color("423a48"))
	draw_string(ThemeDB.fallback_font, Vector2(896, 146), "E  IN", HORIZONTAL_ALIGNMENT_LEFT, -1, 8, Color("ffe6a9"))
	for surface in surfaces: draw_platform(surface)
	if exit_active:
		draw_line(Vector2(895, 128), Vector2(927, 128), Color("ffe2a1"), 3)
		draw_line(Vector2(927, 128), Vector2(919, 121), Color("ffe2a1"), 3)
		draw_line(Vector2(927, 128), Vector2(919, 135), Color("ffe2a1"), 3)
	for goal in clue_positions:
		var at := Vector2(goal.position.x, goal.position.y)
		var bob := roundf(sin(clock * 4) * 2)
		draw_circle(at + Vector2(0, -8 + bob), 11, Color(1, 0.87, 0.5, 0.16))
		draw_rect(Rect2(at + Vector2(-4, -15 + bob), Vector2(8, 11)), Color("fff1cd"))
		draw_line(at + Vector2(-2, -11 + bob), at + Vector2(2, -11 + bob), Color("ac8e8a"))
	for i in 100:
		var x := fmod(float(i * 71) + clock * (3 + i % 3), 960)
		var y := fmod(float(i * 37) + clock * (8 + i % 5), 175)
		draw_rect(Rect2(x, y, 1, 1), Color(0.93, 0.97, 1, 0.7))

func draw_platform(surface: Dictionary) -> void:
	var rect: Rect2 = surface.footprint
	var height: float = surface.height
	var top := Rect2(rect.position - Vector2(0, height), rect.size)
	var crate: bool = surface.id == "crate"
	draw_rect(Rect2(rect.position.x, rect.end.y - height, rect.size.x, height), Color("916a58") if crate else Color("40566b"))
	draw_rect(top, Color("cfaa77") if crate else Color("b8d0da"))
	draw_line(top.position, Vector2(top.end.x, top.position.y), Color("f4e9cf"), 2)
	if crate:
		draw_line(Vector2(rect.position.x + 3, rect.end.y - height + 3), rect.end - Vector2(3, 3), Color("b88b64"), 2)
		draw_string(ThemeDB.fallback_font, Vector2(292, 142), "SPACE", HORIZONTAL_ALIGNMENT_LEFT, -1, 8, Color("ffe6a9"))
	else:
		for x in range(int(rect.position.x), int(rect.end.x) + 1, 20):
			draw_line(Vector2(x, top.position.y - 9), Vector2(x, top.position.y + 2), Color("d3e2e9"), 1)
		draw_line(top.position - Vector2(0, 9), Vector2(top.end.x, top.position.y - 9), Color("d3e2e9"), 1)
		draw_string(ThemeDB.fallback_font, Vector2(396, 47), "SNOW TERRACE", HORIZONTAL_ALIGNMENT_LEFT, -1, 8, Color("ffe6a9"))

func draw_interior() -> void:
	draw_rect(Rect2(0, 0, 320, 180), Color("372e40"))
	draw_rect(Rect2(0, 14, 320, 91), Color("755669"))
	for i in 16:
		draw_line(Vector2(i * 22, 14), Vector2(i * 22, 105), Color("684c60"), 1)
	draw_rect(Rect2(0, 101, 320, 79), Color("bd9271"))
	for y in range(110, 180, 12):
		draw_line(Vector2(0, y), Vector2(320, y), Color("a77b61"), 1)
	draw_rect(Rect2(20, 38, 82, 53), Color("d7bb9b"))
	draw_rect(Rect2(24, 42, 74, 45), Color("20334e"))
	for x in range(30, 95, 13):
		draw_rect(Rect2(x, 48 + (x % 17), 1, 1), Color("edf3f7"))
	draw_line(Vector2(60, 42), Vector2(60, 87), Color("b79780"), 3)
	draw_rect(Rect2(205, 49, 91, 40), Color("513f4d"))
	draw_rect(Rect2(215, 57, 67, 5), Color("d9ae83"))
	for i in 5:
		draw_rect(Rect2(219 + i * 12, 70, 7, 12), Color("e8ceb1"))
	for x in [72, 248]:
		draw_line(Vector2(x, 0), Vector2(x, 26), Color("342d3d"), 2)
		draw_circle(Vector2(x, 30), 9, Color("ffdca0"))
	draw_rect(Rect2(233, 103, 5, 25), Color("68505b"))
	draw_rect(Rect2(276, 103, 5, 25), Color("68505b"))
	draw_rect(Rect2(225, 97, 64, 10), Color("f0c38f"))
	draw_rect(Rect2(244, 90, 15, 8), Color("fff0c9"))
	draw_line(Vector2(245, 91), Vector2(251, 96), Color("c79676"), 1)
	draw_line(Vector2(258, 91), Vector2(251, 96), Color("c79676"), 1)
	draw_string(ThemeDB.fallback_font, Vector2(236, 86), "E  LETTER", HORIZONTAL_ALIGNMENT_LEFT, -1, 8, Color("ffe6a9"))
	draw_rect(Rect2(135, 148, 50, 32), Color("4c3c4a"))
	draw_rect(Rect2(139, 152, 42, 28), Color("26364e"))
	draw_string(ThemeDB.fallback_font, Vector2(144, 176), "E  OUT", HORIZONTAL_ALIGNMENT_LEFT, -1, 8, Color("ffe6a9"))
