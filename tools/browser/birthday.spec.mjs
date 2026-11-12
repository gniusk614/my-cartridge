import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { validateEpisode } from '../../studio/core.js';
test.use({ deviceScaleFactor: 1, isMobile: false, hasTouch: false });
const schema = JSON.parse(readFileSync(new URL('../../schemas/game_pack.schema.json', import.meta.url)));
async function packFrom(page) { const waiting = page.waitForEvent('download'); await page.locator('#export-json').click(); return JSON.parse(await readFile(await (await waiting).path(), 'utf8')); }
async function startTemplate(page) { await page.goto('/studio/'); await expect(page.locator('#save-state')).toContainText('저장됨'); await page.locator('#birthday-template').click(); await expect(page.locator('#project-name')).toHaveText('너에게로 가는 길'); await expect(page.locator('#issue-count')).toHaveText('준비 완료'); }
async function snapshot(frame) { return frame.evaluate(() => { window.myCartridgeTestSnapshot(); return JSON.parse(window.myCartridgeTestState); }); }
async function tap(frame, label) {
  await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  for (let attempt = 0; attempt < 8; attempt++) {
    const s = await snapshot(frame), b = s.menu.find(b => b.text === label); expect(b, label).toBeTruthy();
    const size = await frame.locator('#canvas').evaluate(c => ({ x: c.getBoundingClientRect().x, y: c.getBoundingClientRect().y, w: c.getBoundingClientRect().width, h: c.getBoundingClientRect().height }));
    const modalTop = (s.viewport[1] - 162) / 2, modalBottom = modalTop + 152;
    if (b.center[1] > modalTop + 12 && b.center[1] < modalBottom) {
      await frame.locator('#canvas').click({ position: { x: b.center[0] / s.viewport[0] * size.w, y: b.center[1] / s.viewport[1] * size.h } }); return;
    }
    const screen = await frame.locator('#canvas').boundingBox();
    await frame.page().mouse.move(screen.x + screen.width / 2, screen.y + screen.height / 2);
    await frame.page().mouse.wheel(0, b.center[1] >= modalBottom ? 100 : -100);
    await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  throw new Error('Could not scroll to game button: ' + label);
}
async function fixturePhoto(page, color) { const png = await page.evaluate(color => { const c = document.createElement('canvas'); c.width = 180; c.height = 120; const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, 180, 120); x.fillStyle = '#d7bca2'; x.fillRect(64, 22, 42, 42); return c.toDataURL('image/png').split(',')[1]; }, color); return { name: 'private-photo.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }; }
test('birthday template, event conditions and private ending photos can be edited on a compact screen and roundtripped', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 }); await startTemplate(page);
  await expect.poll(() => page.locator('#projects option').count()).toBe(2);
  await page.locator('#story-add-event').click(); await page.locator('[data-story-trigger="2"]').selectOption('enemy_defeated');
  await page.locator('[data-path="chapters.0.events.2.text"]').fill('함께 길을 열었어.'); await page.locator('[data-path="chapters.0.events.2.heal"]').fill('5');
  await page.locator('[data-story-gate="1"]').selectOption('');
  await page.locator('[data-story-delete="2"]').click();
  await page.locator('[data-story-photo="photo_key"]').setInputFiles(await fixturePhoto(page, '#789ab3'));
  await expect(page.getByAltText('아내의 아기 시절 사진 넣기')).toHaveCount(1);
  await page.locator('[data-story-photo="family_key"]').setInputFiles(await fixturePhoto(page, '#8eab8c'));
  await expect(page.getByAltText('마지막 현재 가족 사진 넣기')).toHaveCount(1);
  const p = await packFrom(page); expect(validateEpisode(p, schema)).toEqual([]); expect(p.chapters[0].events).toHaveLength(2);
  expect(p.assets.filter(a => a.kind === 'story_photo').map(a => [a.width, a.height])).toEqual([[180, 120], [180, 120]]);
  await page.reload(); await expect(page.locator('#save-state')).toContainText('저장됨'); const next = await packFrom(page); expect(next.ending).toEqual(p.ending); expect(next.assets).toEqual(p.assets);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('real combat carries the baby through all three scenes and six fragments before the birthday photo, letter and family ending', async ({ page }) => {
  test.setTimeout(300_000); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 480, height: 640 }); await startTemplate(page);
  await page.locator('[data-path="ending.photo_reveal.subject"]').fill('소중한 이름'); await page.locator('[data-path="ending.photo_reveal.date"]').fill('비공개 생일 날짜');
  await page.locator('#preview').click(); await expect(page.locator('#preview-status')).toContainText('실행 중', { timeout: 45_000 });
  const frame = page.frames().find(f => f.url().includes('studio-preview=1'));
  await expect.poll(async () => (await snapshot(frame)).state).toBe('STAGE_INTRO');
  let scenes = new Set(), seenEvents = new Set(); const deadline = Date.now() + 250_000;
  async function pulse(key, mode, before, sign = 0) {
    await page.keyboard.down(key);
    try { await frame.waitForFunction(({ mode, before, sign }) => {
      window.myCartridgeTestSnapshot(); const s = JSON.parse(window.myCartridgeTestState);
      if (s.state !== 'PLAYING' || s.player.stun > 0) return true;
      if (mode === 'attack') return s.player.attack_id > before.player.attack_id;
      if (mode === 'turn') return s.player.facing === sign;
      return Math.hypot(s.player.position[0] - before.player.position[0], s.player.position[1] - before.player.position[1]) >= 5;
    }, { mode, before, sign }, { timeout: 5000 }); } finally { await page.keyboard.up(key); }
    await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect.poll(async () => (await snapshot(frame)).player.velocity).toEqual([0, 0]);
  }
  while (Date.now() < deadline) {
    const s = await snapshot(frame); if (s.state === 'PHOTO_ASSEMBLY') break;
    expect(s.modal_text.join('\n')).not.toMatch(/소중한 이름|비공개 생일 날짜|태어나줘서|생일 축하/);
    if (s.state === 'STAGE_INTRO') { scenes.add(s.chapter_index); await tap(frame, '기억을 찾아 출발'); continue; }
    if (s.state === 'DIALOGUE') { await tap(frame, '계속하기'); continue; }
    if (s.state === 'CLUE_REVEAL') { await tap(frame, '기억을 간직하고 계속'); continue; }
    if (s.state === 'STORY_EVENT') { expect(seenEvents.has(s.active_event)).toBe(false); seenEvents.add(s.active_event); await tap(frame, '계속 걷기'); continue; }
    if (s.state === 'CHAPTER_CLEAR') { await tap(frame, '다음 장면'); continue; }
    expect(s.state, JSON.stringify(s)).toBe('PLAYING'); expect(s.player.carrying_baby).toBe(true);
    const hero = s.player.position, enemy = s.enemies.sort((a, b) => Math.hypot(a.position[0] - hero[0], a.position[1] - hero[1]) - Math.hypot(b.position[0] - hero[0], b.position[1] - hero[1]))[0];
    if (s.player.position[1] < 140) { await pulse('ArrowDown', 'move', s); continue; }
    const clue = s.clues[0], dx = (enemy?.position[0] ?? clue?.position.x ?? 672) - hero[0], dy = (enemy ? 130 : clue?.position.y ?? 130) - hero[1];
    if (enemy && Math.abs(dx) < 27 && Math.abs(enemy.position[1] - hero[1]) < 11) { const sign = dx >= 0 ? 1 : -1; if (s.player.facing === sign) await page.keyboard.press('KeyJ', { delay: 120 }); else await pulse(sign > 0 ? 'ArrowRight' : 'ArrowLeft', 'turn', s, sign); }
    else if ((clue || s.complete) && !enemy && Math.hypot(dx, dy) < 23) { await page.keyboard.down('KeyE'); try { await expect.poll(async () => (await snapshot(frame)).state).not.toBe('PLAYING'); } finally { await page.keyboard.up('KeyE'); } }
    else if (enemy && Math.abs(dx) < 27) { await expect.poll(async () => { const next = await snapshot(frame), target = next.enemies.find(e => e.id === enemy.id); return !target || Math.abs(target.position[1] - next.player.position[1]) < 11; }).toBe(true); }
    else await pulse(dx > 0 ? 'ArrowRight' : 'ArrowLeft', 'move', s);
  }
  let s = await snapshot(frame); expect(s.state, JSON.stringify(s)).toBe('PHOTO_ASSEMBLY'); expect([...scenes]).toEqual([0, 1, 2]); expect(seenEvents.size).toBe(6);
  expect(s.progress.collected_clue_ids).toHaveLength(6); expect(s.progress.defeated_actor_ids).toHaveLength(6); expect(s.progress.ending_seen).toBe(false); expect(s.photo_placed).toHaveLength(0);
  for (let i = 1; i <= 6; i++) await tap(frame, `조각 ${i} 놓기`);
  s = await snapshot(frame); expect(s.state).toBe('PHOTO_ASSEMBLY'); expect(s.modal_text.join('\n')).not.toContain('소중한 이름');
  await tap(frame, '사진 뒷면 보기'); s = await snapshot(frame); expect(s.state).toBe('PHOTO_REVEAL'); expect(s.modal_text.join('\n')).toContain('소중한 이름'); expect(s.modal_text.join('\n')).toContain('비공개 생일 날짜');
  await tap(frame, '편지 읽기'); s = await snapshot(frame); expect(s.state).toBe('ENDING'); expect(s.progress.ending_seen).toBe(true); expect(s.modal_text.join('\n')).toContain('태어나줘서 고마워');
  await tap(frame, '우리의 오늘'); expect((await snapshot(frame)).state).toBe('FAMILY_ENDING'); expect(errors).toEqual([]);
});
