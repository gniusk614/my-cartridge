import { STATES, THEMES, clone, uid, createEpisode, addScene, upgrade, syncCombat, putAsset, validateEpisode, clampProp, createProp, assetReferences, reachableAssets } from './core.js';
import { convertPortrait, avatarSheet, canvasAsset } from './pixel.js';
import { zipFiles } from './zip.js';
import { ASSET_KINDS, importAsset, assetCard } from './assets.js';
import { PROP_PRESETS, presetAsset } from './presets.js';
import { ActorEditor, actorEntries } from './actor_editor.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = { pack: null, scene: 0, character: 0, tab: 'episode', tool: 'select', selection: null, zoom: 1.5, photo: null, converted: null, mini: null, assetFilter: 'all', workshopActor: '' };
const schema = await fetch('./schema.json').then(r => { if (!r.ok) throw new Error('제작 스키마를 불러오지 못했습니다.'); return r.json(); });
const images = new Map(), decoded = new Map();
let db, saveTimer, toastTimer, frameReady = false, exporting = false, miniSequence = 0;
const undo = [], redo = [];
function remember() { undo.push(clone(state.pack)); if (undo.length > 20) undo.shift(); redo.length = 0; }
function clearHistory() { undo.length = redo.length = 0; }
function restoreHistory(from, to) {
  if (!from.length) return;
  to.push(clone(state.pack)); state.pack = from.pop(); state.scene = Math.min(state.scene, state.pack.chapters.length - 1); state.character = Math.min(state.character, state.pack.characters.length - 1);
  state.selection = null; state.tool = 'select'; images.clear(); decoded.clear(); changed(); render();
}
const titles = { episode: ['EPISODE', '한 사람을 위한 이야기'], map: ['MAP & SCENES', '기억이 머무는 장소'], character: ['CHARACTER WORKSHOP', '이야기의 주인공을 만들어요'], assets: ['ASSET LIBRARY', '이미지를 모아 바로 배치해요'], story: ['STORY', '우리만의 이야기를 담아요'], delivery: ['VALIDATE & DELIVER', '한 편의 게임으로 전달해요'] };
function scene() { return state.pack.chapters[state.scene]; }
function map() { return state.pack.maps.find(m => m.id === scene().map_id); }
function character() { return state.pack.characters[state.character]; }
function mapIndex() { return state.pack.maps.findIndex(m => m.id === scene().map_id); }
function selectedProp() { return state.selection?.type === 'prop' ? map().props[state.selection.index] : null; }
function propArtworkPanel(prop) {
  const assets = state.pack.assets.filter(a => a.kind === 'prop');
  return `<div class="prop-artwork"><h3>박스를 이미지로 바꾸기</h3><p>썸네일을 누르면 위치와 크기를 유지하며 그림만 바뀝니다.</p><div class="artwork-options"><button data-action="clear-prop-image" class="${!prop.asset_key ? 'active' : ''}"><span class="placeholder-icon"></span><span>기본 박스</span></button>${PROP_PRESETS.map(([key, name]) => { const a = presetAsset(key); return `<button data-apply-preset="${key}" aria-label="${name} 그림 적용"><img src="data:image/png;base64,${a.png_base64}" alt=""><span>${name}</span></button>`; }).join('')}${assets.filter(a => !a.id.startsWith('starter_')).map(a => `<button data-apply-asset="${esc(a.id)}" class="${prop.asset_key === a.id ? 'active' : ''}" aria-label="${esc(a.name || '이미지')} 그림 적용"><img src="data:image/png;base64,${a.png_base64}" alt=""><span>${esc(a.name || '내 이미지')}</span></button>`).join('')}</div><label class="file-label">＋ 내 이미지로 바꾸기<input id="object-image-file" type="file" accept="image/png,image/jpeg,image/webp"></label></div>`;
}
function actorTarget() {
  if (!state.pack) return null;
  const entries = actorEntries(state.pack);
  if (state.tab === 'map' || state.tab === 'assets') {
    const selected = state.selection;
    if (selected?.type === 'enemy') return entries.find(a => a.id === scene().enemies[selected.index]?.id) || null;
    if (selected?.type === 'spawn') return entries.find(a => a.kind === 'character' && a.ref.role === 'player');
    if (selected?.type === 'npc') return entries.find(a => a.id === map().npcs[selected.index]?.character_id) || null;
  }
  return entries.find(a => a.id === state.workshopActor) || entries.find(a => a.ref === character());
}
function selectWorkshopActor(id) {
  const target = actorEntries(state.pack).find(a => a.id === id); if (!target) return;
  state.workshopActor = id; state.selection = null; state.photo = state.converted = null;
  if (target.kind === 'character') state.character = target.characterIndex; else state.scene = target.chapterIndex;
}
const bodyEditor = new ActorEditor({ getPack: () => state.pack, getTarget: actorTarget, imageFor, fileImage, esc, toast, download,
  beforeCommit: remember, invalidate: ids => ids.forEach(id => { images.delete(id); decoded.delete(id); }),
  onCommitted: target => { state.workshopActor = target.id; if (target.kind === 'character') state.character = target.characterIndex; if (state.tab === 'assets') state.tab = 'character'; changed(); render(); },
});
function get(path) { return path.split('.').reduce((v, key) => v?.[key], state.pack); }
function set(path, value) { const keys = path.split('.'); const key = keys.pop(); const object = keys.reduce((v, k) => v[k], state.pack); object[key] = value; }
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500); }
function field(label, path, type = 'text', options = null, hint = '') {
  const value = get(path) ?? '';
  const control = type === 'textarea' ? `<textarea data-path="${path}">${esc(value)}</textarea>` : type === 'select' ? `<select data-path="${path}">${options.map(([v, t]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>` : `<input data-path="${path}" type="${type}" value="${esc(value)}" ${type === 'number' ? 'step="1"' : ''}>`;
  return `<label class="field">${label}${control}${hint ? `<small>${hint}</small>` : ''}</label>`;
}
function uploadControl() { return `<div class="asset-upload" id="asset-dropzone"><label class="field">이미지 용도<select id="asset-kind">${Object.entries(ASSET_KINDS).map(([v, label]) => `<option value="${v}">${label}</option>`).join('')}</select></label><label class="file-label">＋ 이미지 추가<input id="asset-files" type="file" accept="image/png,image/jpeg,image/webp" multiple></label><p>PNG·JPEG·WebP를 선택하거나 여기에 끌어 놓으세요. 투명 배경은 PNG로 준비하세요.</p></div>`; }
function presetCards() { return PROP_PRESETS.map(([key, name]) => { const a = presetAsset(key); return `<button class="preset-card" data-preset="${key}" draggable="true"><img src="data:image/png;base64,${a.png_base64}" alt=""><span>${name}</span><small>＋ 추가</small></button>`; }).join(''); }
function assetsPanel() {
  const assets = state.pack.assets.filter(a => state.assetFilter === 'all' || a.kind === state.assetFilter);
  return `<div class="card"><h2>내 이미지 등록</h2>${uploadControl()}<p>등록한 에셋은 여러 장면에서 재사용합니다. 장식은 맵에 추가하고, 배경·초상화·동작 시트는 해당 대상에 연결합니다.</p></div>
  <div class="card"><h2>바로 쓸 수 있는 기본 소품</h2><div class="preset-grid">${presetCards()}</div><p>소품을 누르면 현재 장면에 배치됩니다. 장식에는 충돌이나 전투 판정이 없습니다.</p></div>
  <div class="card"><div class="row spread"><h2>프로젝트 에셋 · ${state.pack.assets.length}/32</h2><label>종류<select id="asset-filter"><option value="all">전체</option>${Object.entries(ASSET_KINDS).map(([v, label]) => `<option value="${v}" ${state.assetFilter === v ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><label class="field">캐릭터·적 적용 대상<select id="asset-character">${actorEntries(state.pack).map(a => `<option value="${a.kind === 'enemy' ? 'enemy:' + a.id : a.characterIndex}" ${a.id === actorTarget()?.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label><p>현재 장면: <strong>${esc(scene().title)}</strong></p><div class="asset-grid">${assets.map(a => assetCard(a, state.pack, esc, false, selectedProp()?.name)).join('') || '<p>등록한 이미지가 없습니다.</p>'}</div></div>`;
}
function generatedId(c) { return `avatar_${c.id.slice(0, 48)}`; }
function generateCharacter(c, portrait = null) {
  const sheet = avatarSheet(c.appearance, portrait);
  const id = generatedId(c);
  putAsset(state.pack, canvasAsset(sheet.canvas, id, 'sprite_sheet', { frame_width: 32, frame_height: 48, animations: sheet.animations }));
  c.sprite_key = id; images.delete(id); decoded.delete(id);
}
function fresh() { clearHistory(); state.workshopActor = ''; const pack = createEpisode(); state.pack = pack; pack.characters.forEach(c => generateCharacter(c)); return pack; }
function changed() {
  $('#save-state').textContent = '저장 중…';
  clearTimeout(saveTimer); saveTimer = setTimeout(save, 400);
  $('#project-name').textContent = state.pack.meta.title;
  updateValidation(); drawMap();
  document.querySelectorAll('[data-action="undo"]').forEach(b => { b.disabled = !undo.length; });
  document.querySelectorAll('[data-action="redo"]').forEach(b => { b.disabled = !redo.length; });
}
async function save() {
  clearTimeout(saveTimer);
  if (!db) { $('#save-state').textContent = 'JSON으로 저장해 주세요'; return; }
  try {
    const transaction = db.transaction('projects', 'readwrite');
    transaction.objectStore('projects').put({ id: state.pack.pack_id, pack: clone(state.pack), updated: Date.now() });
    await new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); });
    $('#save-state').textContent = '이 브라우저에 저장됨'; await projects();
  } catch { $('#save-state').textContent = '저장 공간을 확인해 주세요'; }
}
async function projects() {
  if (!db) return;
  const result = await new Promise((resolve, reject) => { const r = db.transaction('projects').objectStore('projects').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = reject; });
  $('#projects').replaceChildren(...result.sort((a, b) => b.updated - a.updated).map(item => { const option = new Option(item.pack.meta.title, item.id); option.selected = item.id === state.pack.pack_id; return option; }));
}
function updateValidation(show = false) {
  const errors = validateEpisode(state.pack, schema);
  $('#issue-count').textContent = errors.length ? `${errors.length}개 확인` : '준비 완료';
  $('#summary').innerHTML = errors.length ? errors.slice(0, 8).map(e => `<div class="error">· ${esc(e)}</div>`).join('') : `<div class="ok">✓ 에피소드 구조</div><div class="ok">✓ 등장인물과 에셋 연결</div><div class="ok">✓ 맵 경계와 진행 조건</div><div class="ok">✓ 기억과 장면 연결</div>`;
  if (show) toast(errors.length ? `수정할 항목 ${errors.length}개가 있습니다. 오른쪽 제작 상태를 확인해 주세요.` : '구조 검증을 통과했습니다. 플레이에서 이야기를 확인해 보세요.');
  return errors;
}
function episodePanel() {
  return `<div class="card"><h2>이야기의 기본 정보</h2>${field('에피소드 제목', 'meta.title')}
    <div class="grid">${field('에피소드 ID', 'pack_id', 'text', null, '영문 소문자·숫자·밑줄. 고객마다 다른 ID를 사용하세요.')}${field('개정 번호', 'pack_revision', 'number', null, '개정을 올리면 이전 개정의 진행을 새로 시작합니다.')}</div>${field('예상 플레이 시간 (분)', 'meta.duration_minutes', 'number')}</div>
    <div class="card"><div class="row spread"><h2>에피소드 구성</h2><button data-action="add-scene">＋ 장면 추가</button></div><div class="row"><div class="stat"><b>${state.pack.chapters.length}</b><span>이야기 장면</span></div><div class="stat"><b>${state.pack.characters.length}</b><span>등장인물</span></div><div class="stat"><b>${state.pack.clues.length}</b><span>기억</span></div></div><p>장면의 기억을 모두 찾고 출입구로 들어가 편지를 읽으면 다음 장면으로 이어집니다. 마지막 장면에서는 에피소드의 엔딩 편지가 열립니다.</p></div>
    <div class="card"><h2>이렇게 만들면 쉬워요</h2><div class="step"><b>1</b><div><strong>주인공과 장소를 준비하세요</strong><p>캐릭터 공방에서 외형을 만들고, 맵에서 등장 위치와 기억을 배치합니다.</p></div></div><div class="step"><b>2</b><div><strong>장면마다 이야기를 입히세요</strong><p>도입, 등장인물의 말, 기억, 마지막 편지에 고객의 사연을 담습니다.</p></div></div><div class="step"><b>3</b><div><strong>플레이하고 전달하세요</strong><p>별도 미리보기로 확인한 뒤 JSON 초안이나 실행 파일을 포함한 게임 ZIP을 내려받습니다.</p></div></div></div>`;
}
function entities() {
  const m = map(), ch = scene();
  return [{ type: 'spawn', index: 0, label: '플레이어 시작', point: m.spawn }, { type: 'door', index: 0, label: '출입구', point: m.door },
    ...ch.enemies.map((e, i) => ({ type: 'enemy', index: i, label: `적 ${i + 1}`, point: e.position })),
    ...ch.objectives.map((g, i) => g.type === 'collect_clue' ? { type: 'clue', index: i, label: state.pack.clues.find(c => c.id === g.target)?.name || '기억', point: g.position } : null).filter(Boolean),
    ...m.surfaces.map((s, i) => ({ type: 'surface', index: i, label: `발판 ${i + 1}`, point: { x: s.x, y: s.y } })),
    ...m.npcs.map((n, i) => ({ type: 'npc', index: i, label: state.pack.characters.find(c => c.id === n.character_id)?.name || '대화', point: n.position })),
    ...(m.props || []).map((p, i) => ({ type: 'prop', index: i, label: p.name, point: p.position }))];
}
function mapPanel() {
  const mi = mapIndex(), m = map(), ci = state.scene, props = state.pack.assets.filter(a => a.kind === 'prop');
  return `<div class="card map-card"><div class="row spread"><h2>장면 ${ci + 1} · ${esc(scene().title)}</h2><button data-action="add-scene">＋ 장면 추가</button></div>
  <div class="map-heading"><label>편집할 장면<select id="scene-picker">${state.pack.chapters.map((c, i) => `<option value="${i}" ${i === ci ? 'selected' : ''}>${i + 1} · ${esc(c.title)}</option>`).join('')}</select></label><div class="row"><button data-action="undo" ${undo.length ? '' : 'disabled'}>↶ 실행 취소</button><button data-action="redo" ${redo.length ? '' : 'disabled'}>↷ 다시 실행</button><label>확대<select id="map-zoom"><option value="0.75">75%</option><option value="1">100%</option><option value="1.5">150%</option><option value="2">200%</option></select></label></div></div>
  <h3>개체 추가</h3><p class="hint">버튼을 누르면 보이는 맵 가운데에 바로 추가됩니다. 원하는 위치로 끌어 옮기세요.</p>
  <div class="quick-add">${[['prop', '장식 박스', '배치 후 그림 바꾸기'], ['clue', '기억', '이야기·회상'], ['npc', '대화 인물', '캐릭터와 대사'], ['enemy', '적', '전투 상대'], ['surface', '발판', '점프 가능한 지형']].map(([type, name, note]) => `<button data-add="${type}" draggable="true"><b>＋ ${name}</b><small>${note}</small></button>`).join('')}</div>
  ${props.length ? `<div class="asset-grid compact map-asset-tray">${props.map(a => assetCard(a, state.pack, esc, true, selectedProp()?.name)).join('')}</div>` : ''}
  <div class="map-viewport"><canvas id="map-canvas" width="${m.width}" height="180" tabindex="0" aria-label="맵 배치 편집기"></canvas></div><p class="hint map-help">이미지 파일을 맵에 끌어 놓으면 장식으로 배치됩니다. 선택한 개체의 설정은 아래에서 바꿀 수 있습니다.</p>
  <div id="object-properties" class="object-properties"></div><details class="object-details"><summary>장면의 개체 ${entities().length}개</summary><div class="object-list">${entities().map(e => `<button data-entity="${e.type}:${e.index}" class="${state.selection?.type === e.type && state.selection.index === e.index ? 'active' : ''}">${esc(e.label)}</button>`).join('')}</div></details>
  <details class="precise-tools"><summary>맵을 직접 찍어서 배치하기</summary><div class="tools">${[['select', '선택·이동'], ['enemy', '＋ 적'], ['clue', '＋ 기억'], ['surface', '＋ 발판'], ['npc', '＋ 대화'], ['spawn', '시작 위치'], ['door', '출입구']].map(([tool, label]) => `<button data-tool="${tool}" class="${state.tool === tool ? 'active' : ''}">${label}</button>`).join('')}</div></details>
  </div><div class="card"><div class="row spread"><h2>맵에 넣을 이미지</h2><button data-open-assets>에셋 보관함 열기</button></div><div class="preset-grid">${presetCards()}</div>${uploadControl()}<p>기본 소품과 내 이미지는 버튼 한 번으로 추가하거나 맵에 끌어 놓을 수 있습니다. 장식은 이동을 막지 않습니다.</p></div>
  <details class="card map-settings"><summary>장면 설정 · 배경 · 크기</summary><div class="row"><button data-action="scene-up">↑ 순서</button><button data-action="scene-down">↓ 순서</button><button class="danger" data-action="delete-scene">장면 삭제</button></div>
  <div class="grid">${field('장면 이름', `chapters.${ci}.title`)}${field('플레이 방식', `chapters.${ci}.mechanics`, 'select', [['combat', '전투와 기억 찾기'], ['story', '탐색과 이야기']])}</div>
  <div class="grid">${field('맵 이름', `maps.${mi}.name`)}${field('배경 테마', `maps.${mi}.theme`, 'select', [['winter_street', '눈 내리는 거리'], ['garden', '추억의 공원'], ['sunset', '노을 거리']])}</div>${field('맵 너비', `maps.${mi}.width`, 'number', null, '640~1920 픽셀. 이동 깊이는 104~156으로 유지합니다.')}
  <div class="grid">${Object.keys(THEMES.garden).map((key, i) => field(['하늘', '바닥', '건물·나무', '조명·장식'][i], `maps.${mi}.palette.${key}`, 'color')).join('')}</div><label class="file-label">직접 만든 배경 이미지 넣기<input id="background-file" type="file" accept="image/png,image/jpeg,image/webp"></label><p>배경 그림과 실제 발판·출입구 배치는 각각 편집합니다.</p>${m.background_key ? '<button data-action="remove-background">배경 이미지 해제</button>' : ''}</details>`;
}
function characterPanel() {
  const target = actorTarget();
  const options = actorEntries(state.pack).map(a => `<option value="${a.id}" ${a.id === target.id ? 'selected' : ''}>${a.kind === 'enemy' ? '적 · ' : ''}${esc(a.name)}</option>`).join('');
  const picker = `<div class="card actor-target-card"><label class="field">편집할 캐릭터·적<select id="actor-workshop-target">${options}</select></label><div class="character-list">${state.pack.characters.map((c, i) => `<button data-character="${i}" class="${c.id === target.id ? 'active' : ''}">${esc(c.name)}</button>`).join('')}<button data-action="add-character">＋ 캐릭터</button></div></div>`;
  const info = target.kind === 'character' ? `<div class="card"><div class="row spread"><h2>등장인물</h2><button class="small danger" data-action="delete-character">캐릭터 삭제</button></div><div class="grid">${field('이름', `${target.path}.name`)}${field('역할', `${target.path}.role`, 'select', [['player', '플레이어'], ['missing', '이야기의 상대'], ['npc', '대화 인물']])}</div></div>` : `<div class="card"><h2>${esc(target.name)}</h2>${field('적 종류', `${target.path}.type`, 'select', [['street_thug', '일반 적'], ['bruiser', '강적']])}<p>그림을 바꿔도 체력·공격 판정·등장 조건은 유지됩니다.</p></div>`;
  return picker + info + bodyEditor.panel(target) + (target.kind === 'character' ? `<details class="legacy-character"><summary>기본 도형 외형 · 대화 초상화 · 기존 시트 설정</summary>${legacyCharacterPanel()}</details>` : '');
}
function legacyCharacterPanel() {
  const c = character(), path = `characters.${state.character}`, asset = state.pack.assets.find(a => a.id === c.sprite_key);
  return `  <div class="card"><div class="row spread"><h2>등장인물 설정</h2><button class="small danger" data-action="delete-character">캐릭터 삭제</button></div><div class="grid three">${['skin', 'hair', 'coat', 'pants', 'scarf'].map((key, i) => field(['피부', '머리', '상의', '바지', '포인트'][i], `${path}.appearance.${key}`, 'color')).join('')}${field('머리 형태', `${path}.appearance.hair_style`, 'select', [['short', '짧은 머리'], ['long', '긴 머리']])}</div></div>
  <div class="card"><h2>사진·그림을 도트 초상화로</h2><div class="upload-grid"><div><canvas id="portrait-canvas" class="portrait-preview checker" width="64" height="64" aria-label="도트 초상화"></canvas><label class="file-label">캐릭터 이미지 선택<input id="portrait-file" type="file" accept="image/png,image/jpeg,image/webp"></label></div><div><div class="grid"><label class="field">해상도<select id="pixel-size"><option>32</option><option>48</option><option selected>64</option><option>96</option></select></label><label class="field">팔레트 색 수<select id="pixel-colors"><option>8</option><option selected>16</option><option>32</option></select></label></div><label class="field">자르기 좌우<input type="range" id="crop-x" min="0" max="1" step="0.01" value="0.5"></label><label class="field">자르기 상하<input type="range" id="crop-y" min="0" max="1" step="0.01" value="0.5"></label><label><input id="remove-bg" type="checkbox">모서리와 비슷한 배경색 지우기</label><div class="actions"><button data-action="apply-portrait" class="primary">초상화 적용</button><button data-action="download-portrait">PNG 받기</button></div></div></div><p class="inline-note">픽셀 크기와 색 수를 줄여 도트 스타일로 바꿉니다. 인물의 자세를 새로 그리는 AI 변환은 아닙니다. 얼굴이 잘 보이도록 이미지를 자른 뒤 사용하세요.</p></div>
  <div class="card"><h2>외부 시트 없이 공통 동작 생성</h2><p>외형 설정으로 대기·걷기·공격·점프·앉기·피격·쓰러짐 7개 동작을 생성합니다. 고정된 32×48 픽셀 동작 템플릿이며, 사진 한 장에서 새로운 전신 자세를 추론하지 않습니다.</p><label><input id="use-portrait-head" type="checkbox">적용된 도트 초상화를 템플릿의 얼굴에 사용</label><div class="actions"><button data-action="generate-sheet" class="primary">동작 템플릿 생성</button><button data-action="download-sheet">스프라이트시트 PNG 받기</button></div>${asset ? `<p class="hint">현재 연결: ${esc(asset.id)} · ${asset.width}×${asset.height}</p><img class="sheet-preview checker" src="data:image/png;base64,${asset.png_base64}" alt="현재 캐릭터 스프라이트시트">` : ''}</div>
  <div class="card"><h2>직접 만든·외부 스프라이트시트 등록</h2><label class="file-label">PNG 시트 선택<input id="sheet-file" type="file" accept="image/png"></label><p>모든 칸의 크기가 같은 PNG 시트를 사용합니다. 기본 방향은 오른쪽, 캐릭터의 발은 칸 아래쪽 중앙입니다.</p>${asset ? `<div class="grid">${field('칸 너비', `assets.${state.pack.assets.indexOf(asset)}.frame_width`, 'number')}${field('칸 높이', `assets.${state.pack.assets.indexOf(asset)}.frame_height`, 'number')}</div><div class="animation-grid"><span>동작</span><span>행 (0부터)</span><span>프레임 수</span><span>초당 프레임</span>${STATES.map((name, i) => { const a = state.pack.assets.indexOf(asset); asset.animations[name] ??= clone(asset.animations.idle); return `<span>${['대기', '이동', '공격', '점프', '앉기', '피격', '쓰러짐'][i]}</span>${['row', 'frames', 'fps'].map(k => `<input type="number" aria-label="${name} ${k}" data-path="assets.${a}.animations.${name}.${k}" value="${asset.animations[name][k]}">`).join('')}`; }).join('')}</div>` : ''}<p>외부 리소스를 사용할 때는 재배포·상업 이용 범위를 확인하세요.</p></div>`;
}
function storyPanel() {
  const ci = state.scene;
  return `<div class="card"><h2>장면 ${ci + 1} · 도입</h2>${field('장면 제목', `chapters.${ci}.title`)}${field('도입 이야기', `chapters.${ci}.intro`, 'textarea')}<p><code>{{player}}</code>, <code>{{missing}}</code>, <code>{{캐릭터ID}}</code>는 플레이할 때 해당 인물의 이름으로 바뀝니다.</p></div>
  ${scene().objectives.filter(g => g.type === 'collect_clue').map(g => { const i = state.pack.clues.findIndex(c => c.id === g.target); return `<div class="card"><h2>발견하는 기억</h2>${field('기억 이름', `clues.${i}.name`)}${field('발견했을 때 읽는 글', `clues.${i}.text`, 'textarea')}${field('회상 이야기', `clues.${i}.memory`, 'textarea')}${field('이야기의 화자', `clues.${i}.speaker_id`, 'select', [['', '화자 없음'], ...state.pack.characters.map(c => [c.id, c.name])])}</div>`; }).join('')}
  <div class="card"><h2>등장인물의 대화</h2>${map().npcs.length ? map().npcs.map((n, i) => `<h3>${esc(state.pack.characters.find(c => c.id === n.character_id)?.name)}</h3>${field('대화 내용', `maps.${mapIndex()}.npcs.${i}.text`, 'textarea')}`).join('') : '<p>맵과 장면에서 ＋ 대화 도구로 인물을 배치하면 이곳에서 대사를 편집할 수 있습니다.</p>'}</div>
  <div class="card"><h2>에피소드의 마지막 편지</h2>${field('엔딩 편지', 'ending.letter', 'textarea')}<p>마지막 장면의 기억을 모두 모으고 실내 책상에서 살피기를 누르면 열립니다. 중간 장면은 같은 경로에서 다음 장면으로 연결됩니다.</p></div>`;
}
function deliveryPanel() {
  return `<div class="card"><h2>제작에서 전달까지</h2><div class="step"><b>1</b><div><strong>검증하고 직접 플레이</strong><p>연결이 끊긴 캐릭터·이미지, 순환하는 등장 조건, 맵 밖 위치를 먼저 확인합니다. 실제 전투의 난이도와 이야기 흐름은 플레이로 확인하세요.</p></div></div><div class="step"><b>2</b><div><strong>JSON으로 제작 원본 보관</strong><p>맵·캐릭터·대사·PNG 에셋을 담은 한 파일입니다. 다시 불러와 수정하거나 게임 시작 화면의 게임팩 JSON 열기로 실행할 수 있습니다.</p></div></div><div class="step"><b>3</b><div><strong>게임 ZIP으로 전달·호스팅</strong><p>공통 게임 실행 파일과 에피소드 원본을 한 번에 묶습니다. ZIP을 풀어 HTTP 서버나 호스팅에 올리면 해당 에피소드가 자동으로 선택됩니다. 실행 파일 다운로드에는 네트워크가 필요합니다.</p></div></div><div class="actions"><button data-action="validate">지금 검증</button><button data-action="preview" class="primary">플레이</button><button data-action="export-json">JSON 저장</button><button data-action="export-game">게임 ZIP</button></div></div>
  <div class="card"><h2>고객별 데이터 보관</h2><p>원본 사진은 업로드하지 않으며, 변환한 PNG와 제작 초안은 이 브라우저의 IndexedDB에 보관합니다. 고객 게임을 공개 사이트에 자동 게시하지 않습니다. 전달 ZIP에는 해당 에피소드의 이름·사진·이야기가 포함되므로 고객별로 적절한 접근 권한이 있는 호스팅을 사용하세요.</p><p>브라우저 데이터를 지우면 이곳의 초안이 사라집니다. 제작 원본은 JSON으로 함께 보관하세요. 이미 전달한 팩의 ID·개정 변경은 저장 진행에 영향을 줍니다.</p><button data-action="prune-assets">연결되지 않은 에셋 정리</button></div>
  <div class="card"><h2>이 엔진의 제작 범위</h2><p>가로 액션·탐색형 에피소드, 최대 8장면·16명 등장인물·32개 PNG 에셋을 지원합니다. 배경과 발판·적·기억·대화 위치를 편집할 수 있습니다. 사진 기반 AI 재그림·고유 전신 동작 생성·타일맵 전용 편집·임의 게임 장르·온라인 협동·결제·고객별 호스팅 관리는 후속 확장입니다.</p></div>`;
}
function render() {
  const previousScroll = $('.map-viewport')?.scrollLeft || 0, geometryOpen = $('.object-geometry')?.open, rigOpen = $('#rig-settings')?.open, legacyOpen = $('.legacy-character')?.open, pickerOpen = $('.actor-sheet-picker')?.open;
  const [eyebrow, title] = titles[state.tab]; $('#page-eyebrow').textContent = eyebrow; $('#page-title').textContent = title;
  $('#project-name').textContent = state.pack.meta.title;
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  $('#scene-list').innerHTML = state.pack.chapters.map((ch, i) => `<button class="scene-card ${i === state.scene ? 'active' : ''}" data-scene="${i}"><strong>${String(i + 1).padStart(2, '0')} · ${esc(ch.title)}</strong><small>${esc(state.pack.maps.find(m => m.id === ch.map_id)?.name || '맵 미연결')}</small></button>`).join('');
  $('#panel').innerHTML = ({ episode: episodePanel, map: mapPanel, character: characterPanel, assets: assetsPanel, story: storyPanel, delivery: deliveryPanel })[state.tab]();
  if ($('#map-zoom')) $('#map-zoom').value = state.zoom;
  const mode = $(`[data-path="chapters.${state.scene}.mechanics"]`); if (mode) mode.value = scene().enemies.length ? 'combat' : 'story';
  if (state.tab === 'map') bindMap();
  if (state.tab === 'character') { if ($('#portrait-canvas')) drawPortrait(); bindFiles(); bodyEditor.bind().catch(error => toast(error.message)); $('#actor-workshop-target').onchange = event => { selectWorkshopActor(event.target.value); render(); }; }
  if (state.tab === 'map') bindFiles();
  if (state.tab === 'map' || state.tab === 'assets') bindAssets();
  renderSelection(); updateValidation(); prepareMini().catch(error => toast(error.message)); drawMap();
  if (rigOpen && $('#rig-settings')) $('#rig-settings').open = true;
  if (legacyOpen && $('.legacy-character')) $('.legacy-character').open = true;
  if (pickerOpen && $('.actor-sheet-picker')) $('.actor-sheet-picker').open = true;
  if (geometryOpen && $('.object-geometry')) $('.object-geometry').open = true;
  const viewport = $('.map-viewport');
  if (viewport) { viewport.scrollLeft = previousScroll; const selected = entities().find(e => e.type === state.selection?.type && e.index === state.selection.index); if (selected && (selected.point.x * state.zoom < viewport.scrollLeft || selected.point.x * state.zoom > viewport.scrollLeft + viewport.clientWidth)) viewport.scrollLeft = selected.point.x * state.zoom - viewport.clientWidth / 2; }
}
function renderSelection() {
  const target = $('#object-properties') || $('#selection-panel');
  if (state.tab === 'map') $('#selection-panel').innerHTML = '<h3>간편 배치</h3><p>버튼으로 추가 → 맵에서 이동 → 맵 아래에서 설정하세요.</p>';
  if (state.tab !== 'map' || !state.selection) { target.innerHTML = '<p class="hint">맵에서 개체를 누르면 이곳에서 이름·대사·크기를 바꿀 수 있습니다.</p>'; return; }
  const e = entities().find(e => e.type === state.selection.type && e.index === state.selection.index);
  if (!e) { state.selection = null; return renderSelection(); }
  const mi = mapIndex(), ci = state.scene;
  const path = e.type === 'enemy' ? `chapters.${ci}.enemies.${e.index}.position` : e.type === 'clue' ? `chapters.${ci}.objectives.${e.index}.position` : e.type === 'npc' ? `maps.${mi}.npcs.${e.index}.position` : e.type === 'prop' ? `maps.${mi}.props.${e.index}.position` : `maps.${mi}.${e.type}`;
  let html = `<div class="row spread"><h3>선택한 개체 · ${esc(e.label)}</h3><div class="row">${!['spawn', 'door'].includes(e.type) ? '<button data-action="duplicate-object">복제</button><button class="danger" data-action="delete-object">삭제</button>' : ''}</div></div>`;
  if (e.type === 'surface') html += `<div class="grid">${['x', 'y', 'width', 'depth', 'height'].map((key, i) => field(['X', 'Y (지면)', '너비', '깊이', '높이'][i], `maps.${mi}.surfaces.${e.index}.${key}`, 'number')).join('')}</div>`;
  else html += `<div class="grid">${field('X', `${path}.x`, 'number')}${field('Y', `${path}.y`, 'number')}</div>`;
  if (e.type === 'enemy') html += `<div class="grid">${field('적 종류', `chapters.${ci}.enemies.${e.index}.type`, 'select', [['street_thug', '일반 적'], ['bruiser', '강적']])}${field('등장 시작 X', `chapters.${ci}.enemies.${e.index}.trigger_x`, 'number')}</div>`;
  if (e.type === 'npc') html += field('등장인물', `maps.${mi}.npcs.${e.index}.character_id`, 'select', state.pack.characters.filter(c => c.role !== 'player').map(c => [c.id, c.name])) + field('대화', `maps.${mi}.npcs.${e.index}.text`, 'textarea');
  if (e.type === 'clue') { const i = state.pack.clues.findIndex(c => c.id === scene().objectives[e.index].target); html += field('기억 이름', `clues.${i}.name`) + field('발견했을 때 읽는 글', `clues.${i}.text`, 'textarea'); }
  if (e.type === 'prop') {
    const base = `maps.${mi}.props.${e.index}`;
    // Put the picture choices first; coordinates are an optional advanced step.
    html = html.slice(0, html.indexOf('<div class="grid">')) + propArtworkPanel(map().props[e.index]) + `<details class="object-geometry"><summary>위치 · 크기 · 겹침 설정</summary>${field('장식 이름', `${base}.name`)}<div class="grid">${field('X', `${base}.position.x`, 'number')}${field('Y', `${base}.position.y`, 'number')}${field('그림 너비', `${base}.width`, 'number')}${field('그림 높이', `${base}.height`, 'number')}${field('겹침 순서', `${base}.layer`, 'select', [['behind', '캐릭터 뒤'], ['front', '캐릭터 앞']])}</div><label><input type="checkbox" data-path="${base}.flip_x" ${map().props[e.index].flip_x ? 'checked' : ''}>좌우 반전</label></details><p class="hint">장식은 그림만 표시하며 이동·전투 판정을 바꾸지 않습니다.</p>`;
  }
  if (['spawn', 'npc', 'enemy'].includes(e.type)) html += bodyEditor.panel(actorTarget());
  target.innerHTML = html;
  if (['spawn', 'npc', 'enemy'].includes(e.type)) bodyEditor.bind().catch(error => toast(error.message));
  $('#object-image-file')?.addEventListener('change', event => { const prop = selectedProp(); if (prop) importFiles(event.target.files, 'prop', null, prop.id).catch(error => toast(error.message)); });
}
async function imageFor(asset) {
  if (!asset) return null;
  if (!images.has(asset.id)) images.set(asset.id, new Promise((resolve, reject) => { const image = new Image(); image.onload = () => { decoded.set(asset.id, image); resolve(image); }; image.onerror = () => reject(new Error('PNG 에셋을 읽을 수 없습니다')); image.src = `data:image/png;base64,${asset.png_base64}`; }));
  return images.get(asset.id);
}
async function prepareMini() {
  const sequence = ++miniSequence;
  const target = actorTarget(), c = target?.ref || character(); $('#actor-name').textContent = target?.name || c.name;
  const asset = state.pack.assets.find(a => a.id === c.sprite_key);
  const mini = asset ? { image: await imageFor(asset), asset } : { image: avatarSheet(c.appearance || (target?.kind === 'enemy' ? { coat: c.type === 'bruiser' ? '#a78ac9' : '#d36d81' } : {})).canvas, asset: { frame_width: 32, frame_height: 48, animations: { idle: { row: 0, frames: 4, fps: 8 } } } };
  if (sequence === miniSequence) state.mini = mini;
}
setInterval(() => {
  bodyEditor.tick();
  const mini = state.mini; if (!mini) return;
  const canvas = $('#actor-mini'), ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, 96, 144); ctx.imageSmoothingEnabled = false;
  const a = mini.asset, spec = a.animations.idle, f = Math.floor(performance.now() / 1000 * spec.fps) % spec.frames;
  const scale = Math.min(96 / a.frame_width, 144 / a.frame_height), w = a.frame_width * scale, h = a.frame_height * scale;
  ctx.drawImage(mini.image, f * a.frame_width, spec.row * a.frame_height, a.frame_width, a.frame_height, (96 - w) / 2, 144 - h, w, h);
}, 120);
function drawMap() {
  const canvas = $('#map-canvas'); if (!canvas || !state.pack) return;
  const m = map(), ctx = canvas.getContext('2d'); canvas.width = m.width; canvas.height = 180; canvas.style.width = `${m.width * state.zoom}px`; canvas.style.height = `${180 * state.zoom}px`;
  const p = { ...THEMES[m.theme], ...m.palette }; ctx.fillStyle = p.sky; ctx.fillRect(0, 0, m.width, 180);
  ctx.fillStyle = p.building;
  for (let x = 0; x < m.width; x += 110) { if (m.theme === 'garden') { ctx.fillRect(x + 30, 60, 5, 46); ctx.beginPath(); ctx.arc(x + 32, 55, 22, 0, Math.PI * 2); ctx.fill(); } else { ctx.fillRect(x, 45, 98, 63); ctx.fillStyle = p.accent; ctx.fillRect(x + 13, 65, 24, 29); ctx.fillRect(x + 50, 65, 24, 29); ctx.fillStyle = p.building; } }
  const backdrop = decoded.get(m.background_key); if (backdrop) ctx.drawImage(backdrop, 0, 0, m.width, 104);
  ctx.fillStyle = p.ground; ctx.fillRect(0, 104, m.width, 76);
  ctx.strokeStyle = '#d7e5d52a'; for (let x = 0; x < m.width; x += 32) { ctx.beginPath(); ctx.moveTo(x, 104); ctx.lineTo(x, 180); ctx.stroke(); }
  ctx.strokeStyle = '#d7e5d56a'; for (const y of [104, 156]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(m.width, y); ctx.stroke(); }
  for (const s of m.surfaces) { ctx.fillStyle = '#665a52'; ctx.fillRect(s.x, s.y - s.height, s.width, s.depth + s.height); ctx.fillStyle = '#c8b394'; ctx.fillRect(s.x, s.y - s.height, s.width, s.depth); }
  function paintProps(layer) {
    for (const prop of m.props.filter(p => p.layer === layer)) {
      if (!prop.asset_key) { ctx.fillStyle = '#7d8c9c'; ctx.fillRect(prop.position.x - prop.width / 2, prop.position.y - prop.height, prop.width, prop.height); ctx.strokeStyle = '#dbe2e5'; ctx.strokeRect(prop.position.x - prop.width / 2 + 1, prop.position.y - prop.height + 1, prop.width - 2, prop.height - 2); continue; }
      const image = decoded.get(prop.asset_key);
      if (image) { ctx.save(); ctx.translate(prop.position.x, prop.position.y); ctx.scale(prop.flip_x ? -1 : 1, 1); ctx.imageSmoothingEnabled = false; ctx.drawImage(image, -prop.width / 2, -prop.height, prop.width, prop.height); ctx.restore(); }
      else imageFor(state.pack.assets.find(a => a.id === prop.asset_key)).then(image => { if (canvas.isConnected && map() === m && image) drawMap(); }).catch(error => toast(error.message));
    }
  }
  paintProps('behind');
  function actorArtwork(e) {
    const ref = e.type === 'spawn' ? state.pack.characters.find(c => c.role === 'player') : e.type === 'npc' ? state.pack.characters.find(c => c.id === m.npcs[e.index].character_id) : e.type === 'enemy' ? scene().enemies[e.index] : null;
    const asset = state.pack.assets.find(a => a.id === ref?.sprite_key && a.kind === 'sprite_sheet'); if (!asset) return false;
    const image = decoded.get(asset.id); if (!image) { imageFor(asset).then(image => { if (canvas.isConnected && map() === m && image) drawMap(); }).catch(error => toast(error.message)); return false; }
    const h = asset.display_height || asset.frame_height, w = asset.frame_width / asset.frame_height * h, at = e.point;
    ctx.save(); ctx.translate(at.x, at.y); ctx.scale(e.type === 'spawn' ? 1 : -1, 1); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, asset.animations.idle.row * asset.frame_height, asset.frame_width, asset.frame_height, -w / 2, -h, w, h); ctx.restore();
    if (state.selection?.type === e.type && state.selection.index === e.index) { ctx.strokeStyle = '#8bd1bf'; ctx.strokeRect(at.x - w / 2 - 2, at.y - h - 2, w + 4, h + 4); }
    return true;
  }
  for (const e of entities()) {
    if (actorArtwork(e)) continue;
    const { x, y } = e.point; ctx.fillStyle = e.type === 'enemy' ? '#e48e9f' : e.type === 'clue' ? '#ffe4aa' : e.type === 'spawn' ? '#8bd1bf' : e.type === 'npc' ? '#c4a3d7' : '#edbd83';
    if (e.type === 'surface' || e.type === 'prop') continue;
    if (e.type === 'clue') ctx.fillRect(x - 4, y - 14, 8, 10);
    else if (e.type === 'door') { ctx.fillRect(x - 12, y - 32, 24, 34); ctx.fillStyle = p.building; ctx.fillRect(x - 7, y - 26, 14, 13); }
    else { ctx.fillRect(x - 6, y - 24, 12, 20); ctx.fillStyle = '#e4c4a6'; ctx.fillRect(x - 7, y - 35, 14, 12); }
    if (state.selection?.type === e.type && state.selection.index === e.index) { ctx.strokeStyle = '#ffffff'; ctx.strokeRect(x - 13, y - 38, 26, 41); }
  }
  paintProps('front');
  if (state.selection?.type === 'prop') { const p = m.props[state.selection.index]; if (p) { ctx.strokeStyle = '#8bd1bf'; ctx.lineWidth = 1.5; ctx.strokeRect(p.position.x - p.width / 2 - 2, p.position.y - p.height - 2, p.width + 4, p.height + 4); } }
  if (state.selection?.type === 'surface') { const s = m.surfaces[state.selection.index]; if (s) { ctx.strokeStyle = '#8bd1bf'; ctx.strokeRect(s.x, s.y - s.height, s.width, s.depth + s.height); } }
  if (m.background_key && !backdrop) {
    const asset = state.pack.assets.find(a => a.id === m.background_key);
    imageFor(asset).then(image => { if (canvas.isConnected && map() === m && image) drawMap(); }).catch(error => toast(error.message));
  }
}
function visibleMapCenter() {
  const viewport = $('.map-viewport'), left = viewport ? viewport.scrollLeft / state.zoom : 24, right = viewport ? (viewport.scrollLeft + viewport.clientWidth) / state.zoom : Math.min(map().width - 24, 540);
  const center = Math.min(map().width - 48, (left + right) / 2);
  for (const offset of [0, 64, -64, 128, -128, 192, -192, 256, -256]) {
    const x = center + offset;
    if (x < Math.max(48, left + 24) || x > Math.min(map().width - 48, right - 24)) continue;
    if (entities().every(e => e.type === 'surface' ? x < e.point.x - 28 || x > e.point.x + map().surfaces[e.index].width + 28 : Math.abs(e.point.x - x) > (e.type === 'prop' ? map().props[e.index].width / 2 + 28 : 40))) return { x, y: 134 };
  }
  return { x: center, y: 134 };
}
function canRegister(asset) {
  const all = [...state.pack.assets, asset];
  if (all.length > 32 || all.reduce((n, a) => n + a.png_base64.length, 0) > 12_000_000 || all.reduce((n, a) => n + a.width * a.height, 0) > 8_388_608) { toast('에셋 개수나 이미지 용량 한도입니다. 사용하지 않는 이미지를 정리해 주세요.'); return false; }
  return true;
}
function selectedAdded(type, index) { state.tab = 'map'; state.tool = 'select'; state.selection = { type, index }; changed(); render(); }
function applyPropAsset(id) {
  const prop = selectedProp(), asset = state.pack.assets.find(a => a.id === id && a.kind === 'prop');
  if (!prop || !asset) return;
  remember(); prop.asset_key = id; state.tab = 'map'; changed(); render(); toast('박스의 그림을 바꿨습니다. 위치와 크기는 유지됩니다.');
}
function applyPreset(key) {
  if (!selectedProp()) return;
  const asset = presetAsset(key), existing = state.pack.assets.find(a => a.id === asset.id && a.kind === 'prop');
  if (existing) return applyPropAsset(existing.id);
  if (!canRegister(asset)) return;
  if (state.pack.assets.some(a => a.id === asset.id)) asset.id = uid('starter');
  remember(); putAsset(state.pack, asset); selectedProp().asset_key = asset.id; changed(); render();
}
function useAsset(id, at = null) {
  const asset = state.pack.assets.find(a => a.id === id); if (!asset) return;
  if (asset.kind === 'sprite_sheet') return bodyEditor.applySheet(id);
  if (asset.kind === 'character_source') return bodyEditor.generate(asset);
  if (asset.kind === 'portrait' && actorTarget()?.kind === 'enemy') return toast('대화 초상화는 이야기의 등장인물을 선택해 적용해 주세요.');
  if (asset.kind === 'prop' && map().props.length >= 64) return toast('장식은 장면당 64개까지 배치할 수 있습니다.');
  const center = at || visibleMapCenter(); remember();
  if (asset.kind === 'prop') { map().props.push(createProp(asset, center, map().width)); selectedAdded('prop', map().props.length - 1); toast('맵에 추가했습니다. 그림을 끌어 이동하거나 아래에서 크기를 바꾸세요.'); }
  else { if (asset.kind === 'background') { map().background_key = id; state.tab = 'map'; } else { const target = actorTarget(); target.ref.portrait_key = id; state.character = target.characterIndex; state.workshopActor = target.id; state.tab = 'character'; state.converted = state.photo = null; } state.selection = null; changed(); render(); toast('에셋을 연결했습니다. 플레이에서 확인해 보세요.'); }
}
function usePreset(key, at = null) {
  if (map().props.length >= 64) return toast('장식은 장면당 64개까지 배치할 수 있습니다.');
  const asset = presetAsset(key), existing = state.pack.assets.find(a => a.id === asset.id && a.kind === 'prop');
  if (!existing) {
    if (!canRegister(asset)) return;
    if (state.pack.assets.some(a => a.id === asset.id)) asset.id = uid('starter');
    // The prop and its newly registered image belong to one undo step.
    remember(); putAsset(state.pack, asset); map().props.push(createProp(asset, at || visibleMapCenter(), map().width)); selectedAdded('prop', map().props.length - 1);
  } else useAsset(existing.id, at);
}
async function importFiles(files, kind, at = null, targetId = null) {
  const pack = state.pack, currentMap = map(), accepted = [], failures = [];
  for (const file of Array.from(files).slice(0, 32)) {
    if (pack.assets.length + accepted.length >= 32) { failures.push('에셋은 최대 32개입니다.'); break; }
    try {
      const asset = await importAsset(file, kind, fileImage);
      const bytes = [...pack.assets, ...accepted, asset].reduce((n, a) => n + a.png_base64.length, 0), pixels = [...pack.assets, ...accepted, asset].reduce((n, a) => n + a.width * a.height, 0);
      if (bytes > 12_000_000 || pixels > 8_388_608) throw new Error('프로젝트 이미지 용량을 줄여 주세요.');
      accepted.push(asset);
    } catch (error) { failures.push(error.message); }
  }
  if (state.pack !== pack || (at && map() !== currentMap)) return;
  while (accepted.length && (pack.assets.length + accepted.length > 32 || [...pack.assets, ...accepted].reduce((n, a) => n + a.png_base64.length, 0) > 12_000_000 || [...pack.assets, ...accepted].reduce((n, a) => n + a.width * a.height, 0) > 8_388_608)) { accepted.pop(); failures.push('이미지 용량 또는 개수 한도입니다.'); }
  if (accepted.length) {
    remember(); pack.assets.push(...accepted);
    if (at && kind === 'prop') for (const [i, asset] of accepted.entries()) {
      if (currentMap.props.length >= 64) break;
      currentMap.props.push(createProp(asset, { x: at.x + i * 24, y: at.y }, currentMap.width));
    }
    if (at) { state.selection = { type: 'prop', index: currentMap.props.length - 1 }; state.tool = 'select'; }
    if (targetId && map() === currentMap) { const index = currentMap.props.findIndex(p => p.id === targetId); if (index >= 0) { currentMap.props[index].asset_key = accepted[0].id; state.selection = { type: 'prop', index }; } }
    state.assetFilter = 'all'; changed(); render();
  }
  toast(`${accepted.length}개 이미지 등록${failures.length ? ` · ${failures.join(' / ')}` : ' 완료. 맵에 추가 버튼으로 배치하세요.'}`);
}
function bindAssets() {
  $('#asset-files')?.addEventListener('change', event => { const files = event.target.files, kind = $('#asset-kind').value; importFiles(files, kind).catch(error => toast(error.message)); });
  $('#asset-filter')?.addEventListener('change', event => { state.assetFilter = event.target.value; render(); });
  $('#asset-character')?.addEventListener('change', event => { const value = event.target.value; selectWorkshopActor(value.startsWith('enemy:') ? value.slice(6) : state.pack.characters[Number(value)].id); render(); });
  const zone = $('#asset-dropzone');
  if (zone) { zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); }); zone.addEventListener('dragleave', () => zone.classList.remove('drag-over')); zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); if (e.dataTransfer.files.length) importFiles(e.dataTransfer.files, $('#asset-kind').value).catch(error => toast(error.message)); }); }
  $('#scene-picker')?.addEventListener('change', event => { state.scene = Number(event.target.value); state.selection = null; state.tool = 'select'; render(); });
}
function bindMap() {
  const canvas = $('#map-canvas'); let dragging = null, moved = false;
  const point = event => { const r = canvas.getBoundingClientRect(); return { x: (event.clientX - r.left) / r.width * canvas.width, y: (event.clientY - r.top) / r.height * 180 }; };
  canvas.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; canvas.classList.add('drag-over'); });
  canvas.addEventListener('dragleave', () => canvas.classList.remove('drag-over'));
  canvas.addEventListener('drop', event => {
    event.preventDefault(); canvas.classList.remove('drag-over'); const at = point(event);
    if (event.dataTransfer.files.length) { importFiles(event.dataTransfer.files, 'prop', at).catch(error => toast(error.message)); return; }
    try { const data = JSON.parse(event.dataTransfer.getData('application/my-cartridge')); if (data.preset) usePreset(data.preset, at); else if (data.asset) useAsset(data.asset, at); else if (['clue', 'npc', 'enemy', 'surface', 'prop'].includes(data.type)) place(at, data.type); } catch { toast('배치할 개체를 다시 골라 주세요.'); }
  });
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const at = point(event);
    if (state.tool !== 'select') { place(at); return; }
    const choices = entities().filter(e => {
      if (e.type === 'prop') { const p = map().props[e.index]; return at.x >= p.position.x - p.width / 2 && at.x <= p.position.x + p.width / 2 && at.y >= p.position.y - p.height && at.y <= p.position.y; }
      if (e.type === 'surface') { const s = map().surfaces[e.index]; return at.x >= s.x && at.x <= s.x + s.width && at.y >= s.y - s.height && at.y <= s.y + s.depth; }
      return Math.hypot(e.point.x - at.x, e.point.y - 17 - at.y) < 23;
    });
    const chosen = choices.at(-1); if (!chosen) { state.selection = null; renderSelection(); drawMap(); return; }
    state.selection = { type: chosen.type, index: chosen.index }; dragging = { entity: chosen, start: at, origin: { ...chosen.point } }; moved = false; canvas.setPointerCapture(event.pointerId); renderSelection(); drawMap();
  });
  canvas.addEventListener('pointermove', event => {
    if (!dragging) return; const at = point(event), { entity, start, origin } = dragging;
    if (!moved && Math.hypot(at.x - start.x, at.y - start.y) < 2) return;
    if (!moved) { remember(); moved = true; }
    const x = Math.round((origin.x + at.x - start.x) / 2) * 2, y = Math.round((origin.y + at.y - start.y) / 2) * 2;
    if (entity.type === 'surface') { const s = map().surfaces[entity.index]; s.x = Math.max(24, Math.min(map().width - 24 - s.width, x)); s.y = Math.max(104, Math.min(156 - s.depth, y)); }
    else if (entity.type === 'prop') { const p = map().props[entity.index]; p.position = { x, y }; entity.point = p.position; clampProp(p, map().width); }
    else { entity.point.x = Math.max(24, Math.min(map().width - 24, x)); entity.point.y = Math.max(104, Math.min(156, y)); }
    changed();
  });
  const end = () => { if (dragging) { dragging = null; renderSelection(); changed(); $('#panel [data-action="undo"]').disabled = !undo.length; } };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
}
function place(at, type = state.tool) {
  const ch = scene(), m = map(), pos = { x: Math.max(24, Math.min(m.width - 24, Math.round(at.x / 4) * 4)), y: Math.max(104, Math.min(156, Math.round(at.y / 2) * 2)) };
  if ((type === 'prop' && m.props.length >= 64) || (type === 'enemy' && (ch.enemies.length >= 32 || ch.objectives.filter(g => g.type === 'collect_clue').length + new Set([...ch.enemies.map(e => e.type), 'street_thug']).size > 32)) || (type === 'clue' && (state.pack.clues.length >= 32 || ch.objectives.length >= 32)) || (type === 'surface' && m.surfaces.length >= 32) || (type === 'npc' && m.npcs.length >= 16)) return toast('이 장면에 추가할 수 있는 개수를 모두 사용했습니다.');
  remember(); let index = 0;
  if (type === 'prop') { index = m.props.length; m.props.push(createProp(null, pos, m.width)); }
  if (type === 'spawn' || type === 'door') m[type] = pos;
  if (type === 'enemy') { index = ch.enemies.length; ch.enemies.push({ id: uid('enemy'), type: 'street_thug', position: pos, trigger_x: Math.max(24, pos.x - 75), after: [] }); syncCombat(ch); }
  if (type === 'clue') { const id = uid('memory'); state.pack.clues.push({ id, name: '새로운 기억', text: '여기에 발견한 단서를 적어 주세요.', memory: '그날의 이야기를 적어 주세요.', asset_key: 'clue_photo' }); index = ch.objectives.length; ch.objectives.push({ id: uid('goal'), type: 'collect_clue', target: id, count: 1, depends_on: ch.objectives.filter(g => g.type === 'defeat_count').map(g => g.id), position: pos }); }
  if (type === 'surface') { index = m.surfaces.length; m.surfaces.push({ id: uid('platform'), x: Math.min(pos.x, m.width - 64), y: Math.min(pos.y, 140), width: 40, depth: 16, height: 16 }); }
  if (type === 'npc') { const c = character().role !== 'player' ? character() : state.pack.characters.find(c => c.role !== 'player'); if (!c) return toast('대화 인물을 먼저 추가해 주세요.'); index = m.npcs.length; m.npcs.push({ character_id: c.id, position: pos, text: '{{player}}, 여기서 만나서 반가워.' }); }
  selectedAdded(type, index);
}
function clampMap() {
  const m = map(), clamp = p => { p.x = Math.max(24, Math.min(m.width - 24, p.x)); };
  clamp(m.spawn); clamp(m.door); m.npcs.forEach(n => clamp(n.position)); m.props.forEach(p => clampProp(p, m.width));
  m.surfaces.forEach(s => { s.width = Math.min(s.width, m.width - 48); s.x = Math.max(24, Math.min(s.x, m.width - 24 - s.width)); });
  for (const ch of state.pack.chapters.filter(c => c.map_id === m.id)) { ch.enemies.forEach(e => { clamp(e.position); e.trigger_x = Math.min(e.trigger_x, m.width - 24); }); ch.objectives.forEach(g => clamp(g.position)); }
}
function drawPortrait() {
  const canvas = $('#portrait-canvas'); if (!canvas) return;
  if (state.converted) { canvas.width = canvas.height = state.converted.width; canvas.getContext('2d').drawImage(state.converted, 0, 0); return; }
  const asset = state.pack.assets.find(a => a.id === character().portrait_key);
  if (asset) imageFor(asset).then(image => { if (canvas.isConnected) { canvas.width = image.width; canvas.height = image.height; canvas.getContext('2d').drawImage(image, 0, 0); } }).catch(error => toast(error.message));
}
function convert() {
  if (!state.photo) return;
  state.converted = convertPortrait(state.photo, Number($('#pixel-size').value), Number($('#pixel-colors').value), $('#remove-bg').checked, Number($('#crop-x').value), Number($('#crop-y').value)); drawPortrait();
}
async function fileImage(file) {
  if (!file || file.size > 12_000_000 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('12 MB 이하 PNG·JPEG·WebP 이미지를 선택해 주세요.');
  const image = await createImageBitmap(file);
  if (image.width > 8192 || image.height > 8192) { image.close(); throw new Error('이미지 한 변은 8192 픽셀 이하여야 합니다.'); }
  return image;
}
function bindFiles() {
  $('#portrait-file')?.addEventListener('change', async event => { try { state.photo?.close(); state.photo = await fileImage(event.target.files[0]); convert(); } catch (error) { toast(error.message); } });
  for (const id of ['pixel-size', 'pixel-colors', 'remove-bg', 'crop-x', 'crop-y']) $(`#${id}`)?.addEventListener('input', convert);
  $('#sheet-file')?.addEventListener('change', async event => {
    try {
      if (event.target.files[0]?.type !== 'image/png') throw new Error('스프라이트시트는 PNG로 등록해 주세요.');
      const image = await fileImage(event.target.files[0]);
      if (image.width > 2048 || image.height > 2048 || image.width < 8 || image.height < 8) throw new Error('시트 크기는 8~2048 픽셀이어야 합니다.');
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; canvas.getContext('2d').drawImage(image, 0, 0); image.close();
      const w = Math.min(32, canvas.width), h = Math.min(48, canvas.height), rows = Math.floor(canvas.height / h), columns = Math.floor(canvas.width / w), id = `sheet_${character().id.slice(0, 48)}`;
      putAsset(state.pack, canvasAsset(canvas, id, 'sprite_sheet', { frame_width: w, frame_height: h, animations: Object.fromEntries(STATES.map((name, i) => [name, { row: Math.min(i, rows - 1), frames: Math.min(8, columns), fps: 8 }])) })); character().sprite_key = id; images.delete(id); decoded.delete(id); changed(); render();
    } catch (error) { toast(error.message); }
  });
  $('#background-file')?.addEventListener('change', async event => {
    try { const image = await fileImage(event.target.files[0]), canvas = document.createElement('canvas'); canvas.width = map().width; canvas.height = 104; canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); image.close(); const id = `background_${map().id.slice(0, 44)}`; putAsset(state.pack, canvasAsset(canvas, id, 'background')); map().background_key = id; images.delete(id); decoded.delete(id); changed(); render(); } catch (error) { toast(error.message); }
  });
}
function download(blob, name) { const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
async function preview() {
  if (updateValidation().length) return updateValidation(true);
  await save();
  $('#preview-dialog').showModal(); $('#preview-status').textContent = '게임을 준비하고 있습니다…'; frameReady = false;
  $('#game-frame').src = `../?studio-preview=1&run=${Date.now()}`;
}
addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== $('#game-frame').contentWindow) return;
  if (event.data?.type === 'mc:ready') { frameReady = true; $('#game-frame').contentWindow.postMessage({ type: 'mc:preview', pack: state.pack }, location.origin); }
  if (event.data?.type === 'mc:preview-result') $('#preview-status').textContent = event.data.ok ? '실제 게임 엔진에서 실행 중 · 변경 사항은 다시 플레이하면 반영됩니다.' : event.data.errors.join(' / ');
});
async function exportGame() {
  if (exporting) return;
  if (updateValidation().length) return updateValidation(true);
  const pack = clone(state.pack);
  exporting = true;
  await save();
  const button = $('#export-game'); button.disabled = true; toast('공통 실행 파일을 내려받아 게임 ZIP을 준비합니다…');
  try {
    const base = new URL('../', location.href), response = await fetch(new URL('build-info.json', base), { cache: 'no-store' }); if (!response.ok) throw new Error('배포 정보를 읽을 수 없습니다.');
    const manifest = await response.json();
    const names = Object.keys(manifest.assets).filter(name => !name.startsWith('studio/'));
    const files = await Promise.all(names.map(async name => {
      if (!/^[a-zA-Z0-9_.\/-]+$/.test(name) || name.includes('..') || name.startsWith('/')) throw new Error('잘못된 실행 파일 경로');
      const response = await fetch(new URL(name, base)); if (!response.ok) throw new Error(`${name} 파일을 내려받지 못했습니다.`);
      if (name === 'index.html') return { name, data: (await response.text()).replace('<script src="index.js">', '<script>window.myCartridgeBundlePath="episode.json";</script>\n  <script src="index.js">').replace(/<a class="studio-link"[^>]*>[^<]*<\/a>/, '') };
      return { name, data: await response.arrayBuffer() };
    }));
    files.push({ name: 'episode.json', data: JSON.stringify(pack, null, 2) }, { name: '.nojekyll', data: '' }, { name: 'README.txt', data: 'MY CARTRIDGE 맞춤 에피소드\n\n압축을 풀고 HTTP 또는 HTTPS 호스팅에 전체 파일을 업로드하세요.\n로컬 확인: python3 -m http.server 8765\n브라우저: http://127.0.0.1:8765\nfile:// 직접 실행은 WebAssembly 로딩이 지원되지 않습니다.\n\n이 폴더에는 에피소드의 인물·사진·이야기가 포함됩니다. 고객용 접근 권한에 맞게 전달하세요.\n공통 엔진은 Godot(MIT), 내장 폰트는 Noto Sans KR(SIL OFL)입니다. 원본 프로젝트의 라이선스 고지를 유지하세요.\n' });
    download(zipFiles(files), `${pack.pack_id}-game.zip`); toast('고객용 게임 ZIP을 만들었습니다.');
  } catch (error) { toast(error.message); } finally { button.disabled = false; exporting = false; }
}
async function action(name) {
  if (name === 'validate') return updateValidation(true);
  if (name === 'preview') return preview();
  if (name === 'export-json') { if (updateValidation().length) return updateValidation(true); await save(); return download(new Blob([JSON.stringify(state.pack, null, 2)], { type: 'application/json' }), `${state.pack.pack_id}.json`); }
  if (name === 'export-game') return exportGame();
  if (name === 'undo') return restoreHistory(undo, redo);
  if (name === 'redo') return restoreHistory(redo, undo);
  remember();
  if (name === 'clear-prop-image' && selectedProp()) delete selectedProp().asset_key;
  if (name === 'add-scene') { if (state.pack.chapters.length >= 8) return toast('에피소드당 최대 8장면입니다.'); state.scene = addScene(state.pack); state.tab = 'map'; state.selection = null; }
  if (name === 'delete-scene') {
    if (state.pack.chapters.length === 1) return toast('장면은 하나 이상 필요합니다.');
    const removed = state.pack.chapters.splice(state.scene, 1)[0];
    state.pack.clues = state.pack.clues.filter(c => !removed.objectives.some(g => g.type === 'collect_clue' && g.target === c.id));
    if (!state.pack.chapters.some(c => c.map_id === removed.map_id)) state.pack.maps = state.pack.maps.filter(m => m.id !== removed.map_id);
    state.scene = Math.max(0, state.scene - 1); state.selection = null;
  }
  if (name === 'scene-up' || name === 'scene-down') { const next = state.scene + (name === 'scene-up' ? -1 : 1); if (next < 0 || next >= state.pack.chapters.length) return; [state.pack.chapters[state.scene], state.pack.chapters[next]] = [state.pack.chapters[next], state.pack.chapters[state.scene]]; state.scene = next; state.selection = null; }
  if (name === 'add-character') { if (state.pack.characters.length >= 16) return toast('최대 16명까지 등록할 수 있습니다.'); const c = { id: uid('person'), name: '새로운 인물', role: 'npc', sprite_key: 'missing_base', appearance: clone(state.pack.characters[0].appearance) }; state.pack.characters.push(c); generateCharacter(c); state.character = state.pack.characters.length - 1; state.workshopActor = c.id; state.photo = state.converted = null; }
  if (name === 'delete-character') { const c = character(); if (['player', 'missing'].includes(c.role) || state.pack.characters.length <= 2) return toast('플레이어와 최소 두 등장인물을 유지해 주세요.'); state.pack.characters.splice(state.character, 1); state.pack.maps.forEach(m => { m.npcs = m.npcs.filter(n => n.character_id !== c.id); }); state.pack.clues.forEach(clue => { if (clue.speaker_id === c.id) delete clue.speaker_id; }); state.character = 0; }
  if (name === 'apply-portrait') { if (!state.converted) return toast('이미지를 먼저 선택해 주세요.'); const id = `portrait_${character().id.slice(0, 46)}`; putAsset(state.pack, canvasAsset(state.converted, id, 'portrait')); character().portrait_key = id; images.delete(id); decoded.delete(id); toast('도트 초상화를 대화와 이야기에 연결했습니다.'); }
  if (name === 'download-portrait') { const a = state.pack.assets.find(a => a.id === character().portrait_key); if (!state.converted && !a) return toast('이미지를 먼저 선택해 주세요.'); if (state.converted) return state.converted.toBlob(blob => download(blob, 'portrait.png')); return download(new Blob([Uint8Array.from(atob(a.png_base64), c => c.charCodeAt(0))], { type: 'image/png' }), 'portrait.png'); }
  if (name === 'generate-sheet') { const portrait = $('#use-portrait-head')?.checked ? await imageFor(state.pack.assets.find(a => a.id === character().portrait_key)) : null; generateCharacter(character(), portrait); toast('공통 동작 7개를 생성하고 캐릭터에 연결했습니다.'); }
  if (name === 'download-sheet') { const a = state.pack.assets.find(a => a.id === character().sprite_key); if (!a) return toast('동작 템플릿을 먼저 생성해 주세요.'); return download(new Blob([Uint8Array.from(atob(a.png_base64), c => c.charCodeAt(0))], { type: 'image/png' }), `${character().id}-sprites.png`); }
  if (name === 'remove-background') delete map().background_key;
  if (name === 'prune-assets') { const before = state.pack.assets.length; const used = reachableAssets(state.pack); state.pack.assets = state.pack.assets.filter(a => used.has(a.id)); toast(`연결되지 않은 에셋 ${before - state.pack.assets.length}개를 정리했습니다.`); }
  if (name === 'duplicate-object' && state.selection) {
    const { type, index } = state.selection, at = entities().find(e => e.type === type && e.index === index)?.point;
    if (!at || ['spawn', 'door'].includes(type)) return;
    const pos = { x: Math.min(map().width - 48, at.x + 32), y: at.y };
    if (type === 'prop') { if (map().props.length >= 64) return toast('장식은 장면당 64개까지 배치할 수 있습니다.'); const p = clone(map().props[index]); p.id = uid('prop'); p.position = pos; map().props.push(clampProp(p, map().width)); state.selection.index = map().props.length - 1; }
    if (type === 'npc') { if (map().npcs.length >= 16) return toast('대화 인물은 장면당 16명입니다.'); const n = clone(map().npcs[index]); n.position = pos; map().npcs.push(n); state.selection.index = map().npcs.length - 1; }
    if (type === 'surface') { if (map().surfaces.length >= 32) return toast('발판은 장면당 32개입니다.'); const s = clone(map().surfaces[index]); s.id = uid('platform'); s.x = Math.min(pos.x, map().width - 24 - s.width); map().surfaces.push(s); state.selection.index = map().surfaces.length - 1; }
    if (type === 'clue') { if (state.pack.clues.length >= 32 || scene().objectives.length >= 32) return toast('기억 또는 목표 개수 한도입니다.'); const g = clone(scene().objectives[index]), c = clone(state.pack.clues.find(c => c.id === g.target)); c.id = uid('memory'); c.name = (c.name + ' 복사').slice(0, 80); g.id = uid('goal'); g.target = c.id; g.position = pos; state.pack.clues.push(c); scene().objectives.push(g); state.selection.index = scene().objectives.length - 1; }
    if (type === 'enemy') { if (scene().enemies.length >= 32) return toast('적은 장면당 32명입니다.'); const e = clone(scene().enemies[index]); e.id = uid('enemy'); e.position = pos; e.trigger_x = Math.max(24, pos.x - 75); scene().enemies.push(e); syncCombat(scene()); state.selection.index = scene().enemies.length - 1; }
  }
  if (name === 'delete-object' && state.selection) {
    const { type, index } = state.selection;
    if (type === 'enemy') { const [e] = scene().enemies.splice(index, 1); scene().enemies.forEach(other => { other.after = other.after.filter(id => id !== e.id); }); syncCombat(scene()); }
    if (type === 'clue') { const [g] = scene().objectives.splice(index, 1); state.pack.clues = state.pack.clues.filter(c => c.id !== g.target); }
    if (type === 'surface') map().surfaces.splice(index, 1);
    if (type === 'npc') map().npcs.splice(index, 1);
    if (type === 'prop') map().props.splice(index, 1);
    state.selection = null;
  }
  changed(); render();
}
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.hasAttribute('data-open-assets')) { state.tab = 'assets'; render(); }
  if (button.dataset.add) place(visibleMapCenter(), button.dataset.add);
  if (button.dataset.preset) usePreset(button.dataset.preset);
  if (button.dataset.applyPreset) applyPreset(button.dataset.applyPreset);
  if (button.dataset.applyAsset) applyPropAsset(button.dataset.applyAsset);
  if (button.dataset.useAsset) useAsset(button.dataset.useAsset);
  if (button.dataset.deleteAsset) { const id = button.dataset.deleteAsset; if (!assetReferences(state.pack, id)) { remember(); state.pack.assets = state.pack.assets.filter(a => a.id !== id); images.delete(id); decoded.delete(id); changed(); render(); } }
  if (button.dataset.tab) { state.tab = button.dataset.tab; render(); }
  if (button.dataset.scene) { state.scene = Number(button.dataset.scene); state.selection = null; render(); }
  if (button.dataset.character) { state.character = Number(button.dataset.character); state.workshopActor = character().id; state.photo = state.converted = null; render(); }
  if (button.dataset.tool) { state.tool = button.dataset.tool; render(); }
  if (button.dataset.entity) { const [type, index] = button.dataset.entity.split(':'); state.selection = { type, index: Number(index) }; render(); }
  if (button.dataset.action) action(button.dataset.action).catch(error => toast(error.message));
});
document.addEventListener('dragstart', event => {
  const element = event.target.closest('[data-add], [data-preset], [data-drag-asset]'); if (!element) return;
  event.dataTransfer.setData('application/my-cartridge', JSON.stringify(element.dataset.add ? { type: element.dataset.add } : element.dataset.preset ? { preset: element.dataset.preset } : { asset: element.dataset.dragAsset })); event.dataTransfer.effectAllowed = 'copy';
});
document.addEventListener('change', event => {
  const element = event.target, path = element.dataset.path;
  if (element.id === 'map-zoom') { state.zoom = Number(element.value); drawMap(); return; }
  if (!path) return;
  remember();
  if (path.endsWith('.mechanics')) {
    if (element.value === 'story') scene().enemies = [];
    else if (!scene().enemies.length) scene().enemies = [{ id: uid('enemy'), type: 'street_thug', position: { x: 220, y: 130 }, trigger_x: 145, after: [] }];
    syncCombat(scene()); state.selection = null;
  } else {
    const value = element.type === 'checkbox' ? element.checked : element.type === 'number' ? Number(element.value) : element.value;
    if (path.endsWith('.speaker_id') && !value) delete state.pack.clues[Number(path.split('.')[1])].speaker_id;
    else set(path, value);
  }
  if (/^maps\.\d+\.props\./.test(path) && state.selection?.type === 'prop') clampProp(map().props[state.selection.index], map().width);
  if (path === `maps.${mapIndex()}.theme`) map().palette = { ...THEMES[map().theme] };
  if (path === `maps.${mapIndex()}.width` && map().width >= 640 && map().width <= 1920) clampMap();
  if (/characters\.\d+\.appearance\./.test(path) && character().sprite_key === generatedId(character()) && !state.pack.assets.find(a => a.id === character().sprite_key)?.generation) generateCharacter(character());
  if (/chapters\.\d+\.enemies\.\d+\.type$/.test(path)) { syncCombat(scene()); state.selection = null; }
  changed(); render();
});
for (const id of ['validate', 'preview', 'export-json', 'export-game']) $(`#${id}`).addEventListener('click', () => action(id).catch(error => toast(error.message)));
$('#add-scene').addEventListener('click', () => action('add-scene'));
$('#close-preview').addEventListener('click', () => { $('#preview-dialog').close(); $('#game-frame').src = 'about:blank'; frameReady = false; });
$('#preview-dialog').addEventListener('cancel', () => { $('#game-frame').src = 'about:blank'; frameReady = false; });
$('#new-project').addEventListener('click', async () => { await save(); fresh(); state.scene = state.character = 0; state.workshopActor = ''; state.selection = null; state.photo = state.converted = null; state.tab = 'episode'; images.clear(); decoded.clear(); render(); changed(); });
$('#import-project').addEventListener('click', () => $('#project-file').click());
$('#project-file').addEventListener('change', async event => {
  try {
    const file = event.target.files[0]; if (!file) return; if (file.size > 16_000_000) throw new Error('16 MB 이하 JSON을 선택해 주세요.');
    const raw = JSON.parse(await file.text()), errors = validateEpisode(raw, schema); if (errors.length) throw new Error(errors.slice(0, 4).join(' / '));
    const next = upgrade(raw); if (['demo_snowy_rescue', 'demo_blue_umbrella', 'demo_dawn_walk'].includes(next.pack_id)) next.pack_id = uid('episode');
    images.clear(); decoded.clear(); await Promise.all(next.assets.map(imageFor));
    await save(); clearHistory(); state.pack = next; state.pack.characters.forEach(c => { c.appearance ??= { ...createEpisode().characters[0].appearance }; }); images.clear(); decoded.clear();
    await Promise.all(state.pack.assets.map(imageFor)); state.scene = state.character = 0; state.workshopActor = ''; state.selection = null; state.photo = state.converted = null; render(); changed(); toast('제작 원본을 불러왔습니다.');
  } catch (error) { toast(error.message); } finally { event.target.value = ''; }
});
$('#projects').addEventListener('change', async event => {
  const id = event.target.value; await save(); const record = await new Promise((resolve, reject) => { const r = db.transaction('projects').objectStore('projects').get(id); r.onsuccess = () => resolve(r.result); r.onerror = reject; });
  if (record) { clearHistory(); state.pack = upgrade(record.pack); state.scene = state.character = 0; state.workshopActor = ''; state.selection = null; images.clear(); decoded.clear(); state.photo = state.converted = null; render(); $('#save-state').textContent = '이 브라우저에 저장됨'; }
});
try {
  db = await new Promise((resolve, reject) => { const r = indexedDB.open('my-cartridge-studio', 1); r.onupgradeneeded = () => r.result.createObjectStore('projects', { keyPath: 'id' }); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); r.onblocked = () => reject(new Error('제작 저장소를 열 수 없습니다.')); });
  const records = await new Promise((resolve, reject) => { const r = db.transaction('projects').objectStore('projects').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = reject; });
  if (records.length) state.pack = upgrade(records.sort((a, b) => b.updated - a.updated)[0].pack); else fresh();
} catch { fresh(); toast('자동 저장을 사용할 수 없습니다. JSON으로 작업을 보관해 주세요.'); }
render(); await save();
