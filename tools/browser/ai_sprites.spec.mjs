import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { validateEpisode } from '../../studio/core.js';
test.use({ deviceScaleFactor: 1, isMobile: false, hasTouch: false });
const schema = JSON.parse(readFileSync(new URL('../../schemas/game_pack.schema.json', import.meta.url)));
async function open(page) { await page.setViewportSize({ width: 1280, height: 960 }); await page.goto('/studio/'); await expect(page.locator('#save-state')).toContainText('저장됨'); await page.locator('[data-tab="character"]').click(); }
async function packFrom(page) { const waiting = page.waitForEvent('download'); await page.locator('#export-json').click(); return JSON.parse(await readFile(await (await waiting).path(), 'utf8')); }
async function penguin(page, sheet = false, empty = false) {
  const base64 = await page.evaluate(({ sheet, empty }) => {
    const c = document.createElement('canvas'); c.width = sheet ? 512 : 128; c.height = sheet ? 896 : 128; const x = c.getContext('2d');
    for (let row = 0; row < (sheet ? 7 : 1); row++) for (let col = 0; col < (sheet ? 4 : 1); col++) {
      if (empty && row === 4 && col === 2) continue;
      const dx = col * 128, dy = row * 128; x.fillStyle = '#24314b'; x.fillRect(dx + 40, dy + 20, 48, 76); x.fillRect(dx + 26, dy + 42, 76, 30);
      x.fillStyle = '#eee2b4'; x.fillRect(dx + 48, dy + 44, 32, 42); x.fillStyle = '#da7c3c'; x.fillRect(dx + 72, dy + 34, 24, 8); x.fillRect(dx + 34, dy + 96, 60, 8);
      if (sheet) { x.fillStyle = ['#bc425e', '#427e9a', '#6b974a', '#9270b5'][col]; x.fillRect(dx + 40, dy + 45, 48, 6); }
    } return c.toDataURL('image/png').split(',')[1];
  }, { sheet, empty });
  return { name: sheet ? 'penguin-ai-sheet.png' : 'penguin-reference.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}
async function components(page, asset, col, row) {
  return page.evaluate(async ({ asset, col, row }) => {
    const i = new Image(); i.src = `data:image/png;base64,${asset.png_base64}`; await i.decode(); const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d'); x.drawImage(i, col * 96, row * 96, 96, 96, 0, 0, 96, 96);
    const p = x.getImageData(0, 0, 96, 96).data, seen = new Set(); let count = 0;
    for (let n = 0; n < 96 * 96; n++) if (p[n * 4 + 3] > 16 && !seen.has(n)) {
      count++; const queue = [n]; seen.add(n);
      for (let k = 0; k < queue.length; k++) { const a = queue[k], ax = a % 96, ay = Math.floor(a / 96); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const bx = ax + dx, by = ay + dy, b = by * 96 + bx; if (bx >= 0 && bx < 96 && by >= 0 && by < 96 && p[b * 4 + 3] > 16 && !seen.has(b)) { seen.add(b); queue.push(b); } } }
    } return count;
  }, { asset, col, row });
}
test('penguin fallback stays connected and ChatGPT reference plus anatomy-aware prompt can be exported', async ({ page }) => {
  await open(page); await page.locator('#body-file').setInputFiles(await penguin(page)); await expect(page.locator('#body-regenerate')).toBeEnabled();
  const pack = await packFrom(page), art = pack.assets.find(a => a.id === pack.characters[0].sprite_key);
  expect(art.generation.method).toBe('whole_v1'); for (let f = 0; f < 8; f++) expect(await components(page, art, f, 1)).toBe(1);
  await page.locator('#ai-character-notes').fill('둥근 펭귄, 빨간 목도리, 날개로 공격');
  let waiting = page.waitForEvent('download'); await page.locator('#ai-prompt-download').click(); const prompt = await readFile(await (await waiting).path(), 'utf8');
  expect(prompt).toContain('둥근 펭귄'); expect(prompt).toContain('4 equal columns and 7 equal rows'); expect(prompt).toContain('continuous body');
  waiting = page.waitForEvent('download'); await page.locator('#ai-reference-download').click(); expect((await readFile(await (await waiting).path())).subarray(1, 4).toString()).toBe('PNG');
  expect(validateEpisode(pack, schema)).toEqual([]);
});
test('AI sheet is reviewed before applying only to the selected enemy and survives undo, reload and real game loading', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message)); await open(page);
  const original = await packFrom(page), enemy = original.chapters[0].enemies[0]; await page.locator('#actor-workshop-target').selectOption(enemy.id);
  await page.locator('#ai-sheet-file').setInputFiles(await penguin(page, true, true)); await expect(page.locator('#toast')).toContainText('칸이 비어');
  expect((await packFrom(page)).chapters[0].enemies[0]).toEqual(enemy);
  await page.locator('#ai-sheet-file').setInputFiles(await penguin(page, true)); await expect(page.locator('#ai-import-status')).toContainText('아직 캐릭터에 적용하지 않았습니다');
  await page.locator('#ai-motion').selectOption('attack'); expect((await packFrom(page)).chapters[0].enemies[0]).toEqual(enemy);
  await page.locator('#ai-apply-sheet').click(); let pack = await packFrom(page), art = pack.assets.find(a => a.id === pack.chapters[0].enemies[0].sprite_key);
  expect([art.width, art.height, art.frame_width, art.frame_height]).toEqual([384, 672, 96, 96]); expect(art.generation).toBeUndefined(); expect(Object.values(art.animations).every(s => s.frames === 4)).toBe(true);
  for (let f = 0; f < 4; f++) expect(await components(page, art, f, 1)).toBe(1);
  expect(pack.characters).toEqual(original.characters); expect(validateEpisode(pack, schema)).toEqual([]);
  await page.locator('[data-tab="map"]').click(); await page.locator('[data-action="undo"]').click(); expect((await packFrom(page)).chapters[0].enemies[0]).toEqual(enemy);
  await page.locator('[data-action="redo"]').click(); await expect(page.locator('#save-state')).toContainText('저장됨');
  await page.reload(); await expect(page.locator('#save-state')).toContainText('저장됨'); pack = await packFrom(page); expect(pack.assets.find(a => a.id === art.id)).toEqual(art);
  await page.locator('#preview').click(); await expect(page.locator('#preview-status')).toContainText('실행 중', { timeout: 45_000 });
  const frame = page.frames().find(f => f.url().includes('studio-preview=1'));
  await expect.poll(() => frame.evaluate(() => { window.myCartridgeTestSnapshot(); return JSON.parse(window.myCartridgeTestState).state; })).toBe('STAGE_INTRO');
  expect(errors).toEqual([]);
});
