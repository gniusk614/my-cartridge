export const EVENT_TRIGGERS = [['stage_start', '장면 시작'], ['reach_x', '장소 도착'], ['enemy_defeated', '특정 적 처치'], ['clue_collected', '기억 획득'], ['objectives_complete', '장면 목표 완료']];
export function createStoryEvent(chapter) {
  return { id: `event_${crypto.randomUUID().slice(0, 8)}`, title: '새로운 이야기', text: '{{missing}}: 천천히 가자. 내가 옆에 있을게.', trigger: { type: 'reach_x', x: 120 }, after: [], heal: 0 };
}
export function eventErrors(pack) {
  const errors = [], allIds = new Set([...pack.characters, ...pack.clues, ...pack.chapters, ...(pack.maps || []), ...(pack.assets || []), ...pack.chapters.flatMap(c => [...c.enemies, ...c.objectives]), ...(pack.maps || []).flatMap(m => m.props || [])].map(x => x.id));
  for (const ch of pack.chapters) {
    if (ch.companion_id && (!pack.characters.some(c => c.id === ch.companion_id && c.role !== 'player') || !pack.maps?.find(m => m.id === ch.map_id)?.npcs.some(n => n.character_id === ch.companion_id))) errors.push(`${ch.id}: 따라오는 인물을 맵의 대화 인물에 배치해 주세요`);
    const events = ch.events || [], ids = new Set(events.map(e => e.id)), width = pack.maps?.find(m => m.id === ch.map_id)?.width || 960;
    const graph = new Map(), thresholds = new Map();
    for (const e of events) {
      if (allIds.has(e.id)) errors.push(`${e.id}: 중복 이벤트 ID`); allIds.add(e.id);
      if (e.after.some(id => !ids.has(id))) errors.push(`${e.id}: 같은 장면의 선행 이벤트를 선택해 주세요`);
      const deps = [...e.after], t = e.trigger;
      if (t.type === 'reach_x' && (!Number.isFinite(t.x) || t.x < 24 || t.x > width - 24)) errors.push(`${e.id}: 이벤트 위치가 맵 밖입니다`);
      if (t.type !== 'reach_x' && t.x !== undefined) errors.push(`${e.id}: 이 조건에는 X 좌표를 사용하지 않습니다`);
      if (t.type === 'enemy_defeated') { if (!ch.enemies.some(x => x.id === t.target)) errors.push(`${e.id}: 적 조건 연결 확인`); deps.push(t.target); }
      else if (t.type === 'clue_collected') { const goal = ch.objectives.find(g => g.type === 'collect_clue' && g.target === t.target); if (!goal) errors.push(`${e.id}: 기억 조건 연결 확인`); else deps.push(goal.id); }
      else if (t.target !== undefined) errors.push(`${e.id}: 이 조건에는 대상 ID를 사용하지 않습니다`);
      if (t.type === 'objectives_complete') deps.push(...ch.objectives.map(g => g.id));
      if (e.speaker_id && !pack.characters.some(c => c.id === e.speaker_id)) errors.push(`${e.id}: 이벤트 화자 연결 확인`);
      graph.set(e.id, deps);
    }
    for (const e of ch.enemies) { if (e.event_id && !ids.has(e.event_id)) errors.push(`${e.id}: 적 등장 이벤트 연결 확인`); graph.set(e.id, [...e.after, ...(e.event_id ? [e.event_id] : [])]); }
    for (const g of ch.objectives) { graph.set(g.id, g.type === 'defeat_count' ? ch.enemies.filter(e => e.type === g.target).map(e => e.id) : [...g.depends_on]); if (g.type === 'defeat_count') thresholds.set(g.id, g.count); }
    const resolved = new Set(); for (let i = 0; i < graph.size; i++) for (const [id, deps] of graph) if (deps.filter(d => resolved.has(d)).length >= (thresholds.get(id) ?? deps.length)) resolved.add(id);
    if (resolved.size !== graph.size) errors.push(`${ch.id}: 이벤트·등장·목표 조건이 순환하거나 도달할 수 없습니다`);
  }
  return errors;
}
