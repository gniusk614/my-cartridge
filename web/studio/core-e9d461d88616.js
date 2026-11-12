import { eventErrors } from './events-08b10cbcc2aa.js';
export const STATES = ['idle', 'move', 'attack', 'jump', 'crouch', 'hurt', 'down'];
export const clone = value => structuredClone(value);
export const DEFAULT_APPEARANCE = { skin: '#f4cdb3', hair: '#272945', coat: '#6bb8c4', pants: '#252941', scarf: '#f6c77e', hair_style: 'short' };
export const uid = prefix => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
export const THEMES = {
  winter_street: { sky: '#111e38', ground: '#7a93ac', building: '#394f62', accent: '#ffe4a0' },
  garden: { sky: '#c4dfde', ground: '#89ad88', building: '#527765', accent: '#f3c5ad' },
  sunset: { sky: '#775575', ground: '#ad8587', building: '#4f526b', accent: '#ffcf9d' },
};
export function createMap(id = 'map_01', theme = 'winter_street') {
  return { id, name: '첫 만남의 거리', theme, width: 960, spawn: { x: 60, y: 130 }, door: { x: 909, y: 133 }, surfaces: [
    { id: 'crate', x: 300, y: 104, width: 32, depth: 17, height: 16 },
    { id: 'balcony', x: 355, y: 104, width: 160, depth: 17, height: 50 },
  ], npcs: [], props: [], palette: { ...THEMES[theme] } };
}
export function createScene(index = 1, mapId = `map_${String(index).padStart(2, '0')}`) {
  const id = `scene_${index}`;
  return { id, title: index === 1 ? '우리의 첫 만남' : `새로운 기억 ${index}`, intro: '{{player}}와 {{missing}}의 기억을 찾아 걸어보세요.', template: 'winter_street', map_id: mapId,
    mechanics: ['brawler', 'collect'], enemies: [{ id: `${id}_enemy_1`, type: 'street_thug', position: { x: 220, y: 130 }, trigger_x: 145, after: [] }],
    objectives: [{ id: `${id}_battle`, type: 'defeat_count', target: 'street_thug', count: 1, depends_on: [], position: { x: 680, y: 130 } },
      { id: `${id}_memory`, type: 'collect_clue', target: `${id}_clue`, count: 1, depends_on: [`${id}_battle`], position: { x: 680, y: 130 } }] };
}
export function createClue(index) {
  return { id: `scene_${index}_clue`, name: '함께 남긴 기억', text: '그날의 작은 약속을 기억하나요?', memory: '{{player}}와 {{missing}}가 함께 웃었던 순간.', asset_key: 'clue_photo', speaker_id: 'companion' };
}
export function createEpisode() {
  return { schema_version: '1.4.0', pack_id: uid('episode'), pack_revision: 1,
    meta: { title: '우리만의 에피소드', locale: 'ko-KR', duration_minutes: 3 },
    characters: [{ id: 'hero', name: '주인공', role: 'player', sprite_key: 'hero_base', appearance: { skin: '#f4cdb3', hair: '#272945', coat: '#6bb8c4', pants: '#252941', scarf: '#f6c77e', hair_style: 'short' } },
      { id: 'companion', name: '소중한 사람', role: 'missing', sprite_key: 'missing_base', appearance: { skin: '#e8b998', hair: '#453247', coat: '#d397a9', pants: '#343449', scarf: '#e5cba1', hair_style: 'long' } }],
    clues: [createClue(1)], chapters: [createScene()], maps: [createMap()], assets: [],
    ending: { letter: '{{missing}}에게.\n너와 함께한 모든 날이 나에게는 소중한 기억이야.\n우리의 이야기는 앞으로도 계속될 거야.', music_asset_key: 'demo_ending' }, coop: { enabled: false } };
}
export function addScene(pack) {
  let index = 1;
  while (pack.chapters.some(c => c.id === `scene_${index}`) || pack.maps.some(m => m.id === `map_${String(index).padStart(2, '0')}`)) index++;
  const map = createMap(`map_${String(index).padStart(2, '0')}`, 'garden');
  map.name = `새로운 장소 ${index}`;
  pack.maps.push(map); pack.chapters.push(createScene(index, map.id)); pack.clues.push(createClue(index));
  return pack.chapters.length - 1;
}
export function upgrade(pack) {
  const result = clone(pack);
  result.schema_version = '1.4.0'; result.assets ??= []; result.maps ??= [];
  result.chapters.forEach((chapter, i) => {
    if (!chapter.map_id) { const map = createMap(`map_${String(i + 1).padStart(2, '0')}`); result.maps.push(map); chapter.map_id = map.id; }
  });
  result.maps.forEach(map => { map.palette = { ...THEMES[map.theme], ...map.palette }; map.props ??= []; });
  result.characters.forEach(character => { character.appearance = { ...DEFAULT_APPEARANCE, ...character.appearance }; });
  return result;
}
export function syncCombat(chapter) {
  const goals = chapter.objectives.filter(g => g.type === 'collect_clue');
  const battle = [];
  for (const type of [...new Set(chapter.enemies.map(e => e.type))]) {
    battle.push({ id: `${chapter.id}_${type}_goal`, type: 'defeat_count', target: type, count: chapter.enemies.filter(e => e.type === type).length, depends_on: [], position: { x: 680, y: 130 } });
  }
  chapter.mechanics = chapter.enemies.length ? ['brawler', 'collect'] : ['collect'];
  goals.forEach(g => { g.depends_on = battle.map(b => b.id); });
  chapter.objectives = [...battle, ...goals];
}
export function putAsset(pack, asset) {
  const index = pack.assets.findIndex(a => a.id === asset.id);
  if (index >= 0) pack.assets[index] = asset; else pack.assets.push(asset);
}
export function clampProp(prop, width) {
  prop.width = Math.max(4, Math.min(256, prop.width)); prop.height = Math.max(4, Math.min(180, prop.height));
  prop.position.x = Math.max(prop.width / 2, Math.min(width - prop.width / 2, prop.position.x));
  prop.position.y = Math.max(prop.height, Math.min(180, prop.position.y));
  return prop;
}
export function createProp(asset, at, width) {
  if (!asset) return clampProp({ id: uid('prop'), name: '장식 박스', position: { ...at }, width: 48, height: 48, layer: 'behind', flip_x: false }, width);
  const scale = Math.min(1, 80 / Math.max(asset.width, asset.height));
  return clampProp({ id: uid('prop'), name: asset.name || '장식 이미지', asset_key: asset.id, position: { ...at }, width: Math.max(4, Math.round(asset.width * scale)), height: Math.max(4, Math.round(asset.height * scale)), layer: 'behind', flip_x: false }, width);
}
export function assetReferences(pack, id) {
  return pack.characters.reduce((n, c) => n + Number(c.sprite_key === id) + Number(c.portrait_key === id), 0)
    + pack.maps.reduce((n, m) => n + Number(m.background_key === id) + (m.props || []).filter(p => p.asset_key === id).length, 0)
    + pack.chapters.reduce((n, c) => n + c.enemies.filter(e => e.sprite_key === id).length, 0)
    + pack.assets.filter(a => a.generation?.source_key === id).length
    + pack.clues.filter(c => c.image_key === id).length + Number(pack.ending.photo_reveal?.photo_key === id) + Number(pack.ending.photo_reveal?.family_key === id);
}
export function reachableAssets(pack) {
  const used = new Set([...pack.characters.flatMap(c => [c.sprite_key, c.portrait_key]), ...pack.maps.flatMap(m => [m.background_key, ...(m.props || []).map(p => p.asset_key)]), ...pack.chapters.flatMap(c => c.enemies.map(e => e.sprite_key))]);
  pack.clues.forEach(c => used.add(c.image_key)); used.add(pack.ending.photo_reveal?.photo_key); used.add(pack.ending.photo_reveal?.family_key);
  for (const asset of pack.assets) if (used.has(asset.id) && asset.generation) used.add(asset.generation.source_key);
  return used;
}
export function validateEpisode(pack, schema) {
  const errors = [];
  function check(v, spec, path) {
    const type = spec.type;
    const valid = type === 'object' ? v !== null && typeof v === 'object' && !Array.isArray(v) : type === 'array' ? Array.isArray(v) : type === 'integer' ? Number.isInteger(v) : type === 'number' ? Number.isFinite(v) : type === 'boolean' ? typeof v === 'boolean' : type === 'string' ? typeof v === 'string' : true;
    if (!valid) { errors.push(`${path}: ${type} 형식이 필요합니다`); return; }
    if (spec.enum && !spec.enum.includes(v)) errors.push(`${path}: 허용되지 않은 값`);
    if (type === 'object') {
      for (const k of spec.required || []) if (!(k in v)) errors.push(`${path}.${k}: 필수 항목`);
      for (const [k, value] of Object.entries(v)) {
        if (spec.properties?.[k]) check(value, spec.properties[k], `${path}.${k}`);
        else if (spec.additionalProperties === false) errors.push(`${path}.${k}: 지원하지 않는 항목`);
      }
    } else if (type === 'array') {
      if (v.length < (spec.minItems ?? 0) || v.length > (spec.maxItems ?? Infinity)) errors.push(`${path}: 항목 수 범위 확인`);
      v.forEach((item, i) => check(item, spec.items || {}, `${path}[${i}]`));
    } else if (type === 'string') {
      if ([...v].length < (spec.minLength ?? 0) || [...v].length > (spec.maxLength ?? Infinity)) errors.push(`${path}: 글자 수 범위 확인`);
      if (spec.pattern && !new RegExp(spec.pattern).test(v)) errors.push(`${path}: 형식 확인`);
    } else if (type === 'number' || type === 'integer') {
      if (v < (spec.minimum ?? -Infinity) || v > (spec.maximum ?? Infinity)) errors.push(`${path}: 허용 범위 확인`);
    }
  }
  check(pack, schema, 'episode');
  if (errors.length) return errors;
  if (!['1.2.0', '1.3.0', '1.4.0'].includes(pack.schema_version) && ((pack.assets || []).some(a => a.kind === 'prop') || (pack.maps || []).some(m => m.props?.length))) errors.push('장식 에셋은 스키마 1.2.0을 사용합니다');
  if (!['1.3.0', '1.4.0'].includes(pack.schema_version) && (pack.assets || []).some(a => a.kind === 'character_source' || a.generation || a.display_height !== undefined)) errors.push('전신 생성 에셋은 스키마 1.3.0을 사용합니다');
  if (pack.schema_version !== '1.4.0' && (pack.ending.photo_reveal || pack.clues.some(c => c.image_key) || (pack.assets || []).some(a => a.kind === 'story_photo') || pack.chapters.some(c => c.events !== undefined || c.exit_mode !== undefined || c.carry_baby !== undefined || c.companion_id !== undefined || c.enemies.some(e => e.event_id || e.visual || e.max_hp !== undefined)))) errors.push('이벤트·생일 반전 기능은 스키마 1.4.0을 사용합니다');
  const ids = new Set();
  const unique = id => { if (ids.has(id)) errors.push(`${id}: 중복 ID`); ids.add(id); };
  const graph = (items, key, label) => {
    const defined = new Set(items.map(item => item.id)), resolved = new Set();
    for (const item of items) if (item[key].some(id => !defined.has(id))) errors.push(`${label}: 없는 선행 조건`);
    for (let i = 0; i < items.length; i++) for (const item of items) if (item[key].every(id => resolved.has(id))) resolved.add(item.id);
    if (resolved.size !== items.length) errors.push(`${label}: 선행 조건이 순환합니다`);
  };
  pack.characters.forEach(c => unique(c.id)); pack.clues.forEach(c => unique(c.id));
  if (pack.characters.filter(c => c.role === 'player').length !== 1) errors.push('플레이어는 정확히 한 명이어야 합니다');
  if (pack.characters.filter(c => c.role === 'missing').length !== 1) errors.push('이야기의 상대는 정확히 한 명이어야 합니다');
  const assets = new Map((pack.assets || []).map(a => [a.id, a]));
  let bytes = 0, pixels = 0;
  for (const a of assets.values()) {
    unique(a.id); bytes += a.png_base64.length; pixels += a.width * a.height;
    try {
      const raw = Uint8Array.from(atob(a.png_base64), c => c.charCodeAt(0));
      const view = new DataView(raw.buffer);
      if (raw.length < 24 || view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a || view.getUint32(16) !== a.width || view.getUint32(20) !== a.height) errors.push(`${a.id}: PNG 정보 불일치`);
    } catch { errors.push(`${a.id}: 올바른 PNG가 아닙니다`); }
    if (a.display_height !== undefined && a.kind !== 'sprite_sheet') errors.push(`${a.id}: 그림 높이는 동작 시트에만 지정합니다`);
    if (a.generation) {
      if (a.kind !== 'sprite_sheet' || assets.get(a.generation.source_key)?.kind !== 'character_source') errors.push(`${a.id}: 전신 원본 연결 확인`);
      if (a.frame_width !== 96 || a.frame_height !== 96 || a.width !== 768 || a.height !== 672 || a.display_height === undefined || STATES.some(k => !a.animations?.[k])) errors.push(`${a.id}: 자동 생성 시트 형식 확인`);
      if (a.generation.settings.hip_cut < a.generation.settings.head_cut + 12) errors.push(`${a.id}: 머리와 허리 경계 확인`);
    }
    if (a.kind === 'sprite_sheet') {
      if (!a.frame_width || !a.frame_height || !a.animations) errors.push(`${a.id}: 프레임 크기와 애니메이션 필요`);
      else {
        if (a.width % a.frame_width || a.height % a.frame_height) errors.push(`${a.id}: 시트 크기가 프레임과 맞지 않습니다`);
        for (const spec of Object.values(a.animations)) if (spec.row * a.frame_height >= a.height || spec.frames * a.frame_width > a.width) errors.push(`${a.id}: 애니메이션이 시트를 벗어납니다`);
      }
    }
  }
  if (assets.size !== (pack.assets || []).length) errors.push('중복 에셋 ID');
  if (bytes > 12_000_000 || pixels > 8_388_608) errors.push('에셋 전체 용량 또는 해상도 한도 초과');
  const assetRef = (id, kind, builtins = []) => { if (!builtins.includes(id) && assets.get(id)?.kind !== kind) errors.push(`${id}: ${kind} 에셋 연결 확인`); };
  pack.characters.forEach(c => { assetRef(c.sprite_key, 'sprite_sheet', ['hero_base', 'missing_base']); if (c.portrait_key) assetRef(c.portrait_key, 'portrait'); });
  pack.clues.forEach(c => { if (c.speaker_id && !pack.characters.some(p => p.id === c.speaker_id)) errors.push(`${c.id}: 화자 연결 확인`); });
  for (const clue of pack.clues) if (clue.image_key) assetRef(clue.image_key, 'story_photo');
  const reveal = pack.ending.photo_reveal;
  if (reveal) {
    if (new Set(reveal.clue_ids).size !== reveal.clue_ids.length || reveal.clue_ids.some(id => !pack.clues.some(c => c.id === id))) errors.push('엔딩 사진 조각의 기억 연결 확인');
    for (const key of ['photo_key', 'family_key']) if (reveal[key]) assetRef(reveal[key], 'story_photo');
    if (reveal.photo_key && pack.clues.some(c => c.image_key === reveal.photo_key)) errors.push('엔딩 반전 사진을 일반 기억 사진과 분리해 주세요');
  }
  errors.push(...eventErrors(pack));
  const maps = new Map((pack.maps || []).map(m => [m.id, m]));
  const point = (p, width, label) => { if (p.x > width - 24) errors.push(`${label}: 맵 경계 밖 위치`); };
  for (const map of pack.maps || []) {
    unique(map.id); point(map.spawn, map.width, map.id); point(map.door, map.width, map.id);
    const surfaces = new Set();
    for (const s of map.surfaces) {
      if (surfaces.has(s.id)) errors.push(`${map.id}: 발판 ID 중복`); surfaces.add(s.id);
      if (s.x + s.width > map.width - 24 || s.y + s.depth > 156) errors.push(`${map.id}: 발판이 이동 영역 밖입니다`);
    }
    for (const npc of map.npcs) {
      if (!pack.characters.some(c => c.id === npc.character_id && c.role !== 'player')) errors.push(`${map.id}: 등장인물 연결 확인`);
      point(npc.position, map.width, map.id);
    }
    for (const prop of map.props || []) {
      unique(prop.id); if (prop.asset_key) assetRef(prop.asset_key, 'prop');
      if (prop.position.x - prop.width / 2 < 0 || prop.position.x + prop.width / 2 > map.width || prop.position.y - prop.height < 0) errors.push(`${prop.name}: 장식 이미지가 맵 밖입니다`);
    }
    if (map.background_key) assetRef(map.background_key, 'background');
  }
  const collected = new Set();
  for (const ch of pack.chapters) {
    unique(ch.id);
    const map = maps.get(ch.map_id), width = map?.width || 960;
    if (ch.map_id && !map) errors.push(`${ch.id}: 맵 연결 확인`);
    if (!ch.mechanics.includes('collect') || (ch.enemies.length && !ch.mechanics.includes('brawler'))) errors.push(`${ch.id}: 장면 방식 확인`);
    ch.enemies.forEach(e => { unique(e.id); point(e.position, width, e.id); if (e.trigger_x > width - 24) errors.push(`${e.id}: 등장 위치가 맵 밖입니다`); if (e.sprite_key) assetRef(e.sprite_key, 'sprite_sheet'); });
    graph(ch.enemies, 'after', ch.id);
    ch.objectives.forEach(g => {
      unique(g.id); point(g.position, width, g.id);
      if (g.type === 'collect_clue') {
        if (!pack.clues.some(c => c.id === g.target) || g.count !== 1) errors.push(`${g.id}: 기억 연결 확인`);
        if (collected.has(g.target)) errors.push(`${g.id}: 기억 수집 목표 중복`); collected.add(g.target);
      } else if (g.depends_on.length || ch.enemies.filter(e => e.type === g.target).length < g.count) errors.push(`${g.id}: 달성할 수 없는 전투 목표`);
    });
    graph(ch.objectives, 'depends_on', ch.id);
  }
  if (collected.size !== pack.clues.length) errors.push('모든 기억을 장면의 목표에 연결해 주세요');
  if (pack.schema_version === '1.0.0' && (pack.chapters.length !== 1 || pack.maps || pack.assets)) errors.push('맞춤형 게임팩은 스키마 1.1.0을 사용합니다');
  return errors;
}
