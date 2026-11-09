extends RefCounted

static func try_hit(attacker, target, attack_id: int, damage: int, hits: Dictionary) -> bool:
	if target == attacker or target.team == attacker.team or target.hp <= 0: return false
	if absf(target.elevation - attacker.elevation) > 14: return false
	if absf(target.position.y - attacker.position.y) > 11: return false
	var dx: float = target.position.x - attacker.position.x
	if dx * attacker.facing < -3 or absf(dx) > 29: return false
	var key := "%d:%d" % [attack_id, target.get_instance_id()]
	if hits.has(key): return false
	hits[key] = true
	return target.receive_hit(damage, attacker.facing)
