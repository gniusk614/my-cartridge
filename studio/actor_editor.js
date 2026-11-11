import { AiSheetEditor } from './ai_editor.js';
import { STATES, uid, assetReferences, putAsset } from './core.js';
import { canvasAsset } from './pixel.js';
import { importAsset } from './assets.js';
import { DEFAULT_RIG, MOTION_NAMES, normalizeRig, fullBodySheet, prepareBody, drawRigGuide, sampleBody, suggestRig } from './body.js';

export function actorEntries(pack) {
  return [...pack.characters.map((ref, i) => ({ ref, id: ref.id, name: ref.name, kind: 'character', path: `characters.${i}`, characterIndex: i })),
    ...pack.chapters.flatMap((chapter, ci) => chapter.enemies.map((ref, i) => ({ ref, id: ref.id, name: `${chapter.title} · ${ref.type === 'bruiser' ? '강적' : '적'} ${i + 1}`, kind: 'enemy', path: `chapters.${ci}.enemies.${i}`, chapterIndex: ci })))];
}
export class ActorEditor {
  constructor(options) { Object.assign(this, options); this.motion = 'idle'; this.busy = false; this.sequence = 0; this.preview = null; this.ai = new AiSheetEditor(this); }
  sheet(target = this.getTarget()) { return this.getPack().assets.find(a => a.id === target?.ref.sprite_key && a.kind === 'sprite_sheet'); }
  panel(target) {
    const sheet = this.sheet(target), settings = normalizeRig(sheet?.generation?.settings), method = sheet?.generation?.method || 'whole_v1', esc = this.esc;
    const number = (label, key, min, max) => `<label class="field">${label}<input id="rig-${key}" type="range" min="${min}" max="${max}" value="${settings[key]}"><output id="rig-value-${key}">${settings[key]}%</output></label>`;
    const index = this.getPack().assets.indexOf(sheet);
    const sheetControls = !sheet ? '' : `<div class="grid"><label class="field">표시 높이<input type="number" data-path="assets.${index}.display_height" min="16" max="96" value="${sheet.display_height || sheet.frame_height}"></label>${!sheet.generation ? `<label class="field">칸 너비<input type="number" data-path="assets.${index}.frame_width" value="${sheet.frame_width}"></label><label class="field">칸 높이<input type="number" data-path="assets.${index}.frame_height" value="${sheet.frame_height}"></label>` : ''}</div>${!sheet.generation ? `<div class="animation-grid"><span>동작</span><span>행</span><span>프레임 수</span><span>FPS</span>${STATES.filter(k => sheet.animations[k]).map(k => `<span>${MOTION_NAMES[STATES.indexOf(k)]}</span>${['row', 'frames', 'fps'].map(v => `<input type="number" aria-label="동작 시트 ${k} ${v}" data-path="assets.${index}.animations.${k}.${v}" value="${sheet.animations[k][v]}">`).join('')}`).join('')}</div>` : '<p>자동 생성 시트는 96×96 칸, 8열·7행입니다. 그림 높이를 바꿔도 전투 판정은 유지됩니다.</p>'}`;
    return `<section class="card actor-editor"><div class="row spread"><h2>전신 캐릭터와 자동 동작</h2><small>${esc(target.name)}</small></div>
    <div class="body-workspace"><div class="motion-panel"><canvas id="actor-motion-preview" class="checker" width="192" height="192" aria-label="전신 동작 미리보기"></canvas><label>동작 미리보기<select id="actor-motion">${STATES.map((k, i) => `<option value="${k}" ${this.motion === k ? 'selected' : ''}>${MOTION_NAMES[i]}</option>`).join('')}</select></label></div>
    <div class="body-actions"><label class="file-label">＋ 전신 이미지 선택<input id="body-file" type="file" accept="image/png,image/jpeg,image/webp"></label><button id="body-sample">샘플 전신으로 테스트</button><p>전신 원본을 등록하고 간단한 움직임을 적용합니다. 기본은 전체 그림 유지이며, 펭귄·동물의 몸을 나누지 않습니다. 새 자세는 아래 ChatGPT 시트 가져오기를 사용하세요.</p><button id="body-download" ${sheet ? '' : 'disabled'}>스프라이트시트 PNG 받기</button></div></div>
    ${this.ai.panel()}<p class="inline-note">로컬 기본 움직임은 AI 생성이 아닙니다. 전체 그림 유지가 기본이며, 사람형 부위 분할은 고급 옵션에서 직접 선택합니다.</p>
    <details id="rig-settings"><summary>기본 움직임 방식 · 부위 경계 · 색상 · 크기 조정</summary><label class="field">기본 움직임 방식<select id="body-method"><option value="whole_v1" ${method === 'whole_v1' ? 'selected' : ''}>전체 그림 유지 (동물·마스코트 권장)</option><option value="cutout_v1" ${method === 'cutout_v1' ? 'selected' : ''}>사람형 부위 분할 (고급)</option></select></label><p>펭귄 등 몸이 갈라졌다면 전체 그림 유지를 선택하고 다시 생성하세요. 부위 경계선은 사람형 분할에만 사용합니다.</p><div class="rig-workspace"><canvas id="body-rig-guide" class="checker" width="192" height="192" aria-label="머리와 허리·팔 분할선"></canvas><div class="grid"><label class="field">색상 수<select id="rig-colors">${[[32, '32색'], [16, '16색'], [8, '8색'], [64, '64색'], [0, '원본 색상']].map(([v, l]) => `<option value="${v}" ${settings.colors === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label class="field">원본이 보는 방향<select id="rig-facing"><option value="right" ${settings.facing === 'right' ? 'selected' : ''}>오른쪽·정면</option><option value="left" ${settings.facing === 'left' ? 'selected' : ''}>왼쪽</option></select></label>${number('머리 아래 경계', 'head_cut', 12, 38)}${number('허리 경계', 'hip_cut', 24, 78)}${number('몸통 너비', 'torso_width', 30, 80)}${number('몸 중심', 'center_x', 35, 65)}<label class="field">게임 안 그림 높이<input id="body-display-height" type="number" min="16" max="96" value="${sheet?.display_height || 48}"></label><label class="field"><input type="checkbox" id="rig-background" ${settings.remove_background ? 'checked' : ''}>단색 배경 제거</label></div></div><button id="body-regenerate" class="primary" ${sheet?.generation ? '' : 'disabled'}>동작 다시 생성해 적용</button><p>방식·색상·필요한 경우 분할선을 조정한 뒤 다시 생성하세요. 전신 원본과 설정은 JSON 원본에도 보관됩니다. 원본 사진에 없는 새 자세를 그리는 도구는 아닙니다.</p></details>
    <details class="actor-sheet-picker"><summary>등록된 동작 시트로 바꾸기 · 기본 외형 복원</summary><div class="actor-sheet-options"><button id="actor-reset">기본 외형</button>${this.getPack().assets.filter(a => a.kind === 'sprite_sheet').map(a => `<button data-actor-sheet="${esc(a.id)}" class="${a.id === target.ref.sprite_key ? 'active' : ''}"><canvas data-actor-thumb="${esc(a.id)}" width="64" height="64" aria-hidden="true"></canvas><span>${esc(a.name || a.id)}</span></button>`).join('')}</div><label class="file-label">완성된 PNG 동작 시트 등록<input id="actor-sheet-file" type="file" accept="image/png"></label>${sheetControls}</details></section>`;
  }
  settings() {
    const settings = Object.fromEntries(['head_cut', 'hip_cut', 'torso_width', 'center_x', 'colors'].map(k => [k, Number(document.getElementById(`rig-${k}`).value)]));
    return normalizeRig({ ...settings, facing: document.getElementById('rig-facing').value, remove_background: document.getElementById('rig-background').checked });
  }
  height() { const value = Number(document.getElementById('body-display-height')?.value || this.sheet()?.display_height || 48); return Math.max(16, Math.min(96, Number.isFinite(value) ? Math.round(value) : 48)); }
  async generate(source, settings = null) {
    const pack = this.getPack(), target = this.getTarget(), operation = ++this.sequence;
    if (!target) return;
    const method = document.getElementById('body-method')?.value || 'whole_v1';
    this.setBusy(true);
    try {
      const image = await this.imageFor(source), rig = settings || (method === 'cutout_v1' ? suggestRig(image) : DEFAULT_RIG), result = fullBodySheet(image, rig, method), current = this.sheet(target);
      const ownSheet = current && assetReferences(pack, current.id) === 1 && (current.generation || current.id === `avatar_${target.id.slice(0, 48)}`);
      const id = ownSheet ? current.id : uid('motion');
      const asset = canvasAsset(result.canvas, id, 'sprite_sheet', { name: `${target.name} · 전신 동작`.slice(0, 80), frame_width: 96, frame_height: 96, animations: result.animations, display_height: this.height(), generation: { method, source_key: source.id, settings: result.prepared.settings } });
      const assets = [...pack.assets.filter(a => a.id !== source.id && a.id !== id), source, asset];
      if (assets.length > 32 || assets.some(a => a.png_base64.length > 2_000_000) || assets.reduce((n, a) => n + a.png_base64.length, 0) > 12_000_000 || assets.reduce((n, a) => n + a.width * a.height, 0) > 8_388_608) throw new Error('이미지 개수나 용량 한도입니다. 사용하지 않는 에셋을 정리해 주세요.');
      if (operation !== this.sequence || this.getPack() !== pack || this.getTarget()?.id !== target.id || !actorEntries(pack).some(a => a.id === target.id && a.ref === target.ref)) return;
      this.beforeCommit(); pack.assets = assets; target.ref.sprite_key = id;
      this.invalidate([id, source.id]); this.onCommitted(target);
      this.toast(method === 'whole_v1' ? '몸을 나누지 않는 기본 움직임을 적용했습니다. 새 자세는 ChatGPT 시트를 가져오세요.' : '사람형 부위 분할로 7개 동작을 생성하고 적용했습니다.');
    } catch (error) { this.toast(error.message); }
    finally { this.setBusy(false); }
  }
  applySheet(id) {
    const target = this.getTarget(), asset = this.getPack().assets.find(a => a.id === id && a.kind === 'sprite_sheet'); if (!target || !asset) return;
    this.beforeCommit(); target.ref.sprite_key = id; this.onCommitted(target); this.toast('동작 시트를 적용했습니다.');
  }
  reset() {
    const target = this.getTarget(); if (!target) return;
    this.beforeCommit(); if (target.kind === 'enemy') delete target.ref.sprite_key; else target.ref.sprite_key = target.ref.role === 'player' ? 'hero_base' : 'missing_base'; this.onCommitted(target);
  }
  setBusy(value) { this.busy = value; for (const id of ['body-file', 'body-sample', 'body-regenerate', 'actor-sheet-file']) { const control = document.getElementById(id); if (control) control.disabled = value || (id === 'body-regenerate' && !this.sheet()?.generation); } }
  async guide() {
    const sequence = this.guideSequence = (this.guideSequence || 0) + 1;
    const canvas = document.getElementById('body-rig-guide'), source = this.getPack().assets.find(a => a.id === this.sheet()?.generation?.source_key);
    if (!canvas || !source) return;
    try { const settings = this.settings(), image = await this.imageFor(source); if (canvas.isConnected && sequence === this.guideSequence) drawRigGuide(canvas, prepareBody(image, settings)); } catch { /* An empty background selection is explained on regeneration. */ }
  }
  async bind() {
    if (!document.getElementById('body-file')) return;
    const run = work => Promise.resolve().then(work).catch(error => this.toast(error.message));
    document.getElementById('body-file').onchange = e => run(async () => { const file = e.target.files[0], target = this.getTarget(), pack = this.getPack(); if (!file) return; this.setBusy(true); try { const source = await importAsset(file, 'character_source', this.fileImage); if (this.getPack() === pack && this.getTarget()?.id === target.id) await this.generate(source); } finally { this.setBusy(false); } });
    document.getElementById('body-sample').onclick = () => run(() => this.generate(canvasAsset(sampleBody(), uid('body_source'), 'character_source', { name: '샘플 전신 원본' })));
    document.getElementById('body-regenerate').onclick = () => run(() => { const source = this.getPack().assets.find(a => a.id === this.sheet()?.generation?.source_key); if (source) return this.generate(source, this.settings()); });
    document.getElementById('body-download').onclick = () => { const asset = this.sheet(); if (asset) this.download(new Blob([Uint8Array.from(atob(asset.png_base64), c => c.charCodeAt(0))], { type: 'image/png' }), `${this.getTarget().id}-sprites.png`); };
    document.getElementById('actor-reset').onclick = () => this.reset();
    document.getElementById('actor-motion').onchange = e => { this.motion = e.target.value; this.tick(); };
    for (const input of document.querySelectorAll('[id^="rig-"]')) if (input.matches('input,select')) input.oninput = () => { for (const key of ['head_cut', 'hip_cut', 'torso_width', 'center_x']) document.getElementById(`rig-value-${key}`).textContent = `${document.getElementById(`rig-${key}`).value}%`; this.guide(); };
    for (const button of document.querySelectorAll('[data-actor-sheet]')) button.onclick = () => this.applySheet(button.dataset.actorSheet);
    document.getElementById('actor-sheet-file').onchange = e => run(async () => {
      if (!e.target.files[0]) return;
      const target = this.getTarget(), pack = this.getPack(), asset = await importAsset(e.target.files[0], 'sprite_sheet', this.fileImage);
      if (this.getPack() !== pack || this.getTarget()?.id !== target.id) return;
      if (pack.assets.length >= 32 || pack.assets.reduce((n, a) => n + a.width * a.height, asset.width * asset.height) > 8_388_608 || pack.assets.reduce((n, a) => n + a.png_base64.length, asset.png_base64.length) > 12_000_000) throw new Error('프로젝트 에셋 용량을 줄여 주세요.');
      this.beforeCommit(); putAsset(pack, asset); target.ref.sprite_key = asset.id; this.onCommitted(target);
    });
    this.ai.bind(); this.setBusy(this.busy); this.guide(); const sheet = this.sheet(), targetId = this.getTarget()?.id;
    this.preview = null;
    const previewSequence = this.previewSequence = (this.previewSequence || 0) + 1;
    if (sheet) { const image = await this.imageFor(sheet); if (this.getTarget()?.id === targetId && previewSequence === this.previewSequence) { this.preview = { sheet, image }; this.tick(); } }
    for (const canvas of document.querySelectorAll('[data-actor-thumb]')) { const asset = this.getPack().assets.find(a => a.id === canvas.dataset.actorThumb); const image = await this.imageFor(asset); if (canvas.isConnected && image) { const c = canvas.getContext('2d'); c.imageSmoothingEnabled = false; const scale = Math.min(60 / asset.frame_width, 60 / asset.frame_height), w = asset.frame_width * scale, h = asset.frame_height * scale; c.drawImage(image, 0, asset.animations.idle.row * asset.frame_height, asset.frame_width, asset.frame_height, (64 - w) / 2, 64 - h, w, h); } }
  }
  tick() {
    this.ai.tick();
    const canvas = document.getElementById('actor-motion-preview'), data = this.preview; if (!canvas || !data) return;
    const { sheet, image } = data, spec = sheet.animations[this.motion] || sheet.animations.idle, frame = Math.floor(performance.now() / 1000 * spec.fps) % spec.frames;
    const c = canvas.getContext('2d'), scale = Math.min(176 / sheet.frame_width, 176 / sheet.frame_height), w = sheet.frame_width * scale, h = sheet.frame_height * scale;
    c.clearRect(0, 0, 192, 192); c.imageSmoothingEnabled = false; c.drawImage(image, frame * sheet.frame_width, spec.row * sheet.frame_height, sheet.frame_width, sheet.frame_height, (192 - w) / 2, 188 - h, w, h);
  }
}
