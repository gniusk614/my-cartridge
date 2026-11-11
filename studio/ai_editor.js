import { STATES, uid } from './core.js';
import { importAsset } from './assets.js';
import { canvasAsset } from './pixel.js';
import { MOTION_NAMES } from './body.js';
import { spritePrompt, normalizeSpriteGrid } from './ai_sprites.js';

export class AiSheetEditor {
  constructor(actor) { this.actor = actor; this.references = new WeakMap(); this.pending = null; this.sequence = 0; }
  source() {
    const a = this.actor, pack = a.getPack(), id = a.getTarget()?.id;
    return this.references.get(pack)?.get(id) || pack.assets.find(x => x.id === a.sheet()?.generation?.source_key);
  }
  panel() {
    return `<section class="card ai-workflow"><h3>ChatGPT로 캐릭터에 맞는 동작 그리기</h3>
      <p>펭귄·동물·마스코트는 원래 체형에 맞춰 새 자세를 그리는 방식을 권장합니다. ChatGPT에서 생성한 시트를 가져옵니다. 이 페이지가 ChatGPT를 자동 호출하지 않으며 API 키는 필요하지 않습니다.</p>
      <ol><li>참조 이미지와 요청문을 준비해 ChatGPT에 함께 첨부합니다.</li><li>생성된 4열·7행 PNG를 아래에 넣습니다.</li><li>7개 동작을 확인하고 선택한 캐릭터·적에 적용합니다.</li></ol>
      <label class="file-label">참조 이미지 선택<input id="ai-reference-file" type="file" accept="image/png,image/jpeg,image/webp"></label>
      <small id="ai-reference-status">${this.source() ? '참조 이미지 준비됨 (현재 전신 원본 사용 가능)' : '현재 전신 원본을 사용하거나 별도 참조 이미지를 선택하세요.'}</small>
      <label class="field">캐릭터 특징<textarea id="ai-character-notes" placeholder="예: 둥근 펭귄, 짧은 발, 날개로 공격, 빨간 목도리"></textarea></label>
      <div class="actions"><button id="ai-reference-download" ${this.source() ? '' : 'disabled'}>참조 PNG 받기</button><button id="ai-prompt-download">ChatGPT 요청문 받기</button><button id="ai-prompt-copy">요청문 복사</button><a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">ChatGPT 열기 ↗</a></div>
      <details><summary>시트 격자 설정</summary><label class="field">가로 칸 수<input id="ai-columns" type="number" min="1" max="8" value="4"></label><p>세로는 대기·걷기·공격·점프·앉기·피격·쓰러짐의 7행입니다. 칸 사이 여백·격자선·글자가 없어야 합니다.</p><label><input id="ai-remove-background" type="checkbox">불투명한 단색 배경 제거 (선택)</label></details>
      <label class="file-label">＋ 생성된 동작 시트 넣기<input id="ai-sheet-file" type="file" accept="image/png"></label>
      <div class="ai-review" hidden><canvas id="ai-motion-preview" class="checker" width="192" height="192" aria-label="가져온 AI 동작 미리보기"></canvas><label>가져온 동작<select id="ai-motion">${STATES.map((k, i) => `<option value="${k}">${MOTION_NAMES[i]}</option>`).join('')}</select></label><p id="ai-import-status"></p><button id="ai-apply-sheet" class="primary">확인한 시트 적용</button></div>
      <p class="hint">AI가 격자·투명 배경·프레임 일관성을 정확히 지키지 못할 수 있습니다. 미리보기에서 잘림·다른 인물·배경 무늬를 확인하고 필요하면 ChatGPT에 수정을 요청하세요. 가짜 체크무늬 배경은 투명으로 변환되지 않습니다.</p></section>`;
  }
  async bind() {
    const a = this.actor, $ = id => document.getElementById(id), run = work => Promise.resolve().then(work).catch(e => a.toast(e.message));
    if (!$('ai-sheet-file')) return;
    const target = a.getTarget(), pack = a.getPack(); this.pending = null; ++this.sequence;
    $('ai-reference-file').onchange = e => run(async () => {
      const file = e.target.files[0]; if (!file) return;
      const source = await importAsset(file, 'character_source', a.fileImage);
      if (a.getPack() !== pack || a.getTarget()?.id !== target.id) return;
      if (!this.references.has(pack)) this.references.set(pack, new Map()); this.references.get(pack).set(target.id, source);
      $('ai-reference-download').disabled = false; $('ai-reference-status').textContent = '참조 이미지 준비됨 · 이 이미지를 ChatGPT에 첨부하세요.';
    });
    $('ai-reference-download').onclick = () => { const s = this.source(); if (s) a.download(new Blob([Uint8Array.from(atob(s.png_base64), x => x.charCodeAt(0))], { type: 'image/png' }), `${target.id}-reference.png`); };
    const prompt = () => spritePrompt($('ai-character-notes').value);
    const savePrompt = () => a.download(new Blob([prompt()], { type: 'text/plain;charset=utf-8' }), `${target.id}-chatgpt-sprites.txt`);
    $('ai-prompt-download').onclick = savePrompt;
    $('ai-prompt-copy').onclick = () => run(async () => { try { await navigator.clipboard.writeText(prompt()); a.toast('요청문을 복사했습니다. 참조 이미지와 함께 ChatGPT에 붙여 넣으세요.'); } catch { savePrompt(); a.toast('복사가 지원되지 않아 요청문 파일을 저장했습니다.'); } });
    $('ai-sheet-file').onchange = e => run(async () => {
      const file = e.target.files[0], sequence = ++this.sequence; this.pending = null;
      document.querySelector('.ai-review').hidden = true;
      if (!file) return; if (file.type !== 'image/png') throw new Error('생성된 PNG 시트를 선택해 주세요.');
      const columns = Number($('ai-columns').value), remove = $('ai-remove-background').checked, height = a.height(), image = await a.fileImage(file);
      let result; try { result = normalizeSpriteGrid(image, columns, remove); } finally { image.close(); }
      const asset = canvasAsset(result.canvas, uid('ai_motion'), 'sprite_sheet', { name: `${target.name} · AI 가져온 동작`.slice(0, 80), frame_width: 96, frame_height: 96, display_height: height, animations: result.animations });
      if (sequence !== this.sequence || a.getPack() !== pack || a.getTarget()?.ref !== target.ref) return;
      this.pending = { asset, image: result.canvas, pack, target, motion: 'idle' };
      document.querySelector('.ai-review').hidden = false; $('ai-import-status').textContent = `${columns}열·7행을 96×96 칸으로 정리했습니다. 아직 캐릭터에 적용하지 않았습니다.`;
      this.tick(); a.toast('시트를 불러왔습니다. 동작을 확인한 뒤 적용하세요.');
    });
    $('ai-motion').onchange = e => { if (this.pending) this.pending.motion = e.target.value; this.tick(); };
    $('ai-apply-sheet').onclick = () => run(() => {
      const p = this.pending; if (!p || a.getPack() !== p.pack || a.getTarget()?.ref !== p.target.ref) return;
      const assets = [...pack.assets, p.asset];
      if (assets.length > 32 || p.asset.png_base64.length > 2_000_000 || assets.reduce((n, x) => n + x.png_base64.length, 0) > 12_000_000 || assets.reduce((n, x) => n + x.width * x.height, 0) > 8_388_608) throw new Error('이미지 개수나 용량 한도입니다. 사용하지 않는 에셋을 정리해 주세요.');
      a.beforeCommit(); pack.assets = assets; target.ref.sprite_key = p.asset.id; this.pending = null; a.onCommitted(target); a.toast('확인한 AI 동작을 적용했습니다. 플레이에서 확인하세요.');
    });
  }
  tick() {
    const p = this.pending, canvas = document.getElementById('ai-motion-preview'); if (!p || !canvas) return;
    const spec = p.asset.animations[p.motion], f = Math.floor(performance.now() / 1000 * spec.fps) % spec.frames, ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 192, 192); ctx.imageSmoothingEnabled = false; ctx.drawImage(p.image, f * 96, spec.row * 96, 96, 96, 0, 0, 192, 192);
  }
}
