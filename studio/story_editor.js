import { createStoryEvent, EVENT_TRIGGERS } from './events.js';
import { importAsset } from './assets.js';

export class StoryEditor {
  constructor(options) { Object.assign(this, options); }
  panel() {
    const p = this.getPack(), ci = this.getScene(), ch = p.chapters[ci], f = this.field, esc = this.esc, events = ch.events || [];
    return `<section class="card"><h2>장면 진행과 이벤트</h2><div class="grid">${f('출입구를 사용하면', `chapters.${ci}.exit_mode`, 'select', [['cafe', '카페 실내로 이동 (기존)'], ['direct', '다음 장면 · 마지막 엔딩으로']])}<label><input id="story-carry-baby" type="checkbox" ${ch.carry_baby ? 'checked' : ''}>주인공이 아기를 안고 이동</label></div>
      ${f('함께 따라오는 인물 (선택)', `chapters.${ci}.companion_id`, 'select', [['', '없음'], ...p.characters.filter(c => c.role !== 'player').map(c => [c.id, c.name])])}<p>조건이 충족되면 대화를 보여 주고, 계속하기를 누른 뒤 한 번만 회복·완료 처리합니다. 적 등장도 이벤트에 연결할 수 있습니다.</p><button id="story-add-event">＋ 이벤트 추가</button>
      ${events.map((e, i) => { const base = `chapters.${ci}.events.${i}`, t = e.trigger;
        return `<article class="card event-card"><div class="row spread"><h3>이벤트 ${i + 1}</h3><button data-story-delete="${i}" class="small danger">이벤트 삭제</button></div>${f('이벤트 이름', `${base}.title`)}<label>시작 조건<select data-story-trigger="${i}">${EVENT_TRIGGERS.map(([v, name]) => `<option value="${v}" ${t.type === v ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
        ${t.type === 'reach_x' ? f('도착 X 좌표', `${base}.trigger.x`, 'number') : t.type === 'enemy_defeated' ? f('조건의 적', `${base}.trigger.target`, 'select', ch.enemies.map((x, n) => [x.id, `적 ${n + 1} · ${x.type}`])) : t.type === 'clue_collected' ? f('조건의 기억', `${base}.trigger.target`, 'select', ch.objectives.filter(g => g.type === 'collect_clue').map(g => [g.target, p.clues.find(c => c.id === g.target)?.name || g.target])) : ''}
        <label>먼저 완료할 이벤트 (여러 개 선택 가능)<select multiple data-story-after="${i}" aria-label="이벤트 ${i + 1} 선행 조건">${events.filter(x => x.id !== e.id).map(x => `<option value="${x.id}" ${e.after.includes(x.id) ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select></label>
        ${f('이벤트 대사', `${base}.text`, 'textarea')}${f('화자', `${base}.speaker_id`, 'select', [['', '화자 없음'], ...p.characters.map(c => [c.id, c.name])])}${f('대화 후 회복량', `${base}.heal`, 'number')}</article>`;
      }).join('')}
      <h3>적 등장 연결</h3>${ch.enemies.map((e, i) => `<label>적 ${i + 1} 등장 전에 끝낼 이벤트<select data-story-gate="${i}"><option value="">이벤트 제한 없음</option>${events.map(x => `<option value="${x.id}" ${e.event_id === x.id ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select></label><div class="grid">${f('적 표현', `chapters.${ci}.enemies.${i}.visual`, 'select', [['default', '기본 사람'], ['virus', '바이러스'], ['shadow', '큰 그림자']])}${f('적 체력 (선택)', `chapters.${ci}.enemies.${i}.max_hp`, 'number', null, '비우면 기본 체력. 10~160')}</div>`).join('') || '<p>이 장면에는 적이 없습니다.</p>'}</section>`;
  }
  photoPanel() {
    const p = this.getPack(), r = p.ending.photo_reveal, f = this.field, esc = this.esc;
    const picture = (key, label) => { const a = p.assets.find(a => a.id === r?.[key]); return `<label class="file-label">${label}<input data-story-photo="${key}" type="file" accept="image/png,image/jpeg,image/webp"></label><label>보관함 사진으로 연결<select data-story-photo-select="${key}">${this.photoOptions(r?.[key])}</select></label>${a ? `<details><summary>등록 사진 보기 (제작자용)</summary><img class="story-photo" src="data:image/png;base64,${a.png_base64}" alt="${label}"></details><button data-story-clear-photo="${key}" class="small">사진 연결 해제</button>` : '<small>현재는 샘플 일러스트. 실제 사진을 넣어 완성하세요.</small>'}`; };
    return `<section class="card"><h2>사진 조각과 생일 반전 엔딩</h2><label><input id="story-photo-enabled" type="checkbox" ${r ? 'checked' : ''}>사진을 완성한 뒤 정체·편지 공개</label>${r ? `<p>게임에서는 조각을 모두 맞춘 뒤에만 사진의 이름·날짜·반전 대사를 표시합니다. 사진 파일 이름과 제작 설정은 플레이어에게 표시하지 않습니다.</p>
      <div class="grid">${f('주인공 이름', `characters.${p.characters.findIndex(c => c.role === 'player')}.name`)}${f('이야기의 상대 이름', `characters.${p.characters.findIndex(c => c.role === 'missing')}.name`)}</div><label>사진 조각으로 모을 기억 (1~9개)<select multiple id="story-photo-clues">${p.clues.map(c => `<option value="${c.id}" ${r.clue_ids.includes(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      ${picture('photo_key', '아내의 아기 시절 사진 넣기')}${f('사진 속 이름 (마지막에 표시)', 'ending.photo_reveal.subject')}${f('태어난 날짜 · 사진 설명 (마지막에 표시)', 'ending.photo_reveal.date')}${f('정체가 드러날 때의 대사', 'ending.photo_reveal.reveal_text', 'textarea')}${picture('family_key', '마지막 현재 가족 사진 넣기')}` : '<p>생일 반전 예제로 시작하거나 이 옵션을 켠 뒤, 마지막 사진과 대사를 설정하세요.</p>'}</section>`;
  }
  cluePhoto(clue) {
    const a = this.getPack().assets.find(a => a.id === clue.image_key);
    return `<label class="file-label">기억에 옛날 사진 넣기 (선택)<input data-clue-photo="${clue.id}" type="file" accept="image/png,image/jpeg,image/webp"></label><label>보관함의 기억 사진<select data-clue-photo-select="${clue.id}">${this.photoOptions(clue.image_key)}</select></label>${a ? `<details><summary>이 기억의 사진 보기</summary><img class="story-photo" alt="기억에 연결된 사진" src="data:image/png;base64,${a.png_base64}"></details><button data-clear-clue-photo="${clue.id}" class="small">기억 사진 연결 해제</button>` : ''}`;
  }
  photoOptions(selected) { return `<option value="">사진 없음 · 샘플 사용</option>${this.getPack().assets.filter(a => a.kind === 'story_photo').map(a => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${this.esc(a.name || a.id)}</option>`).join('')}`; }
  commit(work) { this.beforeCommit(); work(); this.onCommitted(); }
  async photo(file, key, clueId = '') {
    if (!file) return;
    const pack = this.getPack(), clue = clueId ? pack.clues.find(c => c.id === clueId) : null, reveal = pack.ending.photo_reveal;
    const asset = await importAsset(file, 'story_photo', this.fileImage);
    if (this.getPack() !== pack || (clueId ? !pack.clues.includes(clue) : pack.ending.photo_reveal !== reveal)) return;
    const all = [...pack.assets, asset];
    if (all.length > 32 || all.reduce((n, a) => n + a.width * a.height, 0) > 8_388_608 || all.reduce((n, a) => n + a.png_base64.length, 0) > 12_000_000) throw new Error('이미지 개수나 용량 한도입니다. 사용하지 않는 에셋을 정리해 주세요.');
    this.commit(() => { pack.assets.push(asset); if (clue) clue.image_key = asset.id; else reveal[key] = asset.id; });
    this.toast('사진을 이 브라우저의 제작 원본에 보관했습니다. 공개 사이트에 자동 게시하지 않습니다.');
  }
  bind() {
    const p = this.getPack(), ch = p.chapters[this.getScene()], $ = s => document.querySelector(s), run = fn => Promise.resolve().then(fn).catch(e => this.toast(e.message));
    $('#story-add-event').onclick = () => this.commit(() => { if ((ch.events || []).length >= 32) return; ch.events ??= []; ch.events.push(createStoryEvent(ch)); });
    $('#story-carry-baby').onchange = e => this.commit(() => { ch.carry_baby = e.target.checked; });
    for (const el of document.querySelectorAll('[data-story-trigger]')) el.onchange = e => this.commit(() => { const item = ch.events[Number(el.dataset.storyTrigger)], type = el.value; item.trigger = { type }; if (type === 'reach_x') item.trigger.x = 120; if (type === 'enemy_defeated') item.trigger.target = ch.enemies[0]?.id || ''; if (type === 'clue_collected') item.trigger.target = ch.objectives.find(g => g.type === 'collect_clue')?.target || ''; });
    for (const el of document.querySelectorAll('[data-story-after]')) el.onchange = () => this.commit(() => { ch.events[Number(el.dataset.storyAfter)].after = [...el.selectedOptions].map(x => x.value); });
    for (const el of document.querySelectorAll('[data-story-gate]')) el.onchange = () => this.commit(() => { const enemy = ch.enemies[Number(el.dataset.storyGate)]; if (el.value) enemy.event_id = el.value; else delete enemy.event_id; });
    for (const el of document.querySelectorAll('[data-story-delete]')) el.onclick = () => this.commit(() => { const id = ch.events[Number(el.dataset.storyDelete)].id; ch.events = ch.events.filter(e => e.id !== id); ch.events.forEach(e => { e.after = e.after.filter(x => x !== id); }); ch.enemies.forEach(e => { if (e.event_id === id) delete e.event_id; }); });
    $('#story-photo-enabled').onchange = e => this.commit(() => { if (e.target.checked) p.ending.photo_reveal = { clue_ids: p.clues.slice(0, 9).map(c => c.id), subject: '{{player}}', date: '당신이 태어난 날', reveal_text: '{{missing}}: 이 아이가 자라서… 내가 가장 사랑하는 사람이 됐어.' }; else delete p.ending.photo_reveal; });
    if ($('#story-photo-clues')) $('#story-photo-clues').onchange = e => this.commit(() => { p.ending.photo_reveal.clue_ids = [...e.target.selectedOptions].map(x => x.value); });
    for (const el of document.querySelectorAll('[data-story-photo]')) el.onchange = () => run(() => this.photo(el.files[0], el.dataset.storyPhoto));
    for (const el of document.querySelectorAll('[data-clue-photo]')) el.onchange = () => run(() => this.photo(el.files[0], '', el.dataset.cluePhoto));
    for (const el of document.querySelectorAll('[data-story-photo-select]')) el.onchange = () => this.commit(() => { if (el.value) p.ending.photo_reveal[el.dataset.storyPhotoSelect] = el.value; else delete p.ending.photo_reveal[el.dataset.storyPhotoSelect]; });
    for (const el of document.querySelectorAll('[data-clue-photo-select]')) el.onchange = () => this.commit(() => { const clue = p.clues.find(c => c.id === el.dataset.cluePhotoSelect); if (el.value) clue.image_key = el.value; else delete clue.image_key; });
    for (const el of document.querySelectorAll('[data-story-clear-photo]')) el.onclick = () => this.commit(() => { delete p.ending.photo_reveal[el.dataset.storyClearPhoto]; });
    for (const el of document.querySelectorAll('[data-clear-clue-photo]')) el.onclick = () => this.commit(() => { delete p.clues.find(c => c.id === el.dataset.clearCluePhoto).image_key; });
  }
}
