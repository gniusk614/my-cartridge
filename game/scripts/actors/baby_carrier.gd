extends Node2D

func _process(_delta: float) -> void:
	var actor = get_parent()
	position = Vector2(actor.facing * 3, -actor.elevation - 19)
	scale.x = actor.facing
	queue_redraw()

func _draw() -> void:
	# The face stays tucked into the same blanket throughout the journey.
	draw_rect(Rect2(-6, -2, 15, 10), Color("f2e0b9"))
	draw_rect(Rect2(-4, 0, 11, 6), Color("d5b7ad"))
	draw_rect(Rect2(3, -5, 7, 6), Color("f4cdb3"))
	draw_rect(Rect2(6, -4, 4, 5), Color("ead9b0"))
	draw_line(Vector2(-6, 5), Vector2(5, 8), Color("f4cdb3"), 3)
