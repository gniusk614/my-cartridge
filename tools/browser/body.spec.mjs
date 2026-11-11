import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { validateEpisode } from '../../studio/core.js';
test.use({ deviceScaleFactor: 1, isMobile: false, hasTouch: false });
const schema = JSON.parse(readFileSync(new URL('../../schemas/game_pack.schema.json', import.meta.url)));
async function open(page) {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/studio/');
  await expect(page.locator('#save-state')).toContainText('저장됨');
}
async function packFrom(page) {
  const download = page.waitForEvent('download'); await page.locator('#export-json').click();
  return JSON.parse(await readFile(await (await download).path(), 'utf8'));
}
async function bodyFile(page, coat = '#862d87') {
  const png = await page.evaluate(coat => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 96; const x = c.getContext('2d');
    const rect = (a, b, w, h, color) => { x.fillStyle = color; x.fillRect(a, b, w, h); };
    rect(19, 7, 27, 11, '#315873'); rect(20, 18, 24, 17, '#d1af88'); rect(19, 35, 26, 29, coat);
    rect(11, 35, 8, 23, coat); rect(45, 35, 8, 23, coat); rect(11, 58, 8, 6, '#d1af88'); rect(45, 58, 8, 6, '#d1af88');
    rect(20, 64, 10, 17, '#193b58'); rect(35, 64, 10, 17, '#193b58'); rect(19, 81, 12, 11, '#eaa233'); rect(35, 81, 13, 11, '#eaa233');
    return c.toDataURL('image/png').split(',')[1];
  }, coat);
  return { name: 'whole-character.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') };
}
async function snapshot(frame) { return frame.evaluate(() => { window.myCartridgeTestSnapshot(); return JSON.parse(window.myCartridgeTestState); }); }
async function startPreview(page) {
  await page.locator('#preview').click(); await expect(page.locator('#preview-status')).toContainText('실행 중', { timeout: 45_000 });
  const frame = page.frames().find(f => f.url().includes('studio-preview=1'));
  await expect.poll(async () => (await snapshot(frame)).state).toBe('STAGE_INTRO');
  await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const state = await snapshot(frame), button = state.menu.find(b => b.text === '기억을 찾아 출발');
  const size = await frame.locator('#canvas').evaluate(c => ({ w: c.getBoundingClientRect().width, h: c.getBoundingClientRect().height }));
  await frame.locator('#canvas').click({ position: { x: button.center[0] / state.viewport[0] * size.w, y: button.center[1] / state.viewport[1] * size.h } });
  return frame;
}
test('a whole image replaces the player and enemy outfits and auto-generates seven actual game motions', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message)); await open(page);
  await page.locator('[data-tab="map"]').click(); await page.locator('.object-details summary').click(); await page.locator('[data-entity="spawn:0"]').click();
  await page.locator('#body-file').setInputFiles(await bodyFile(page)); await expect(page.locator('#body-regenerate')).toBeEnabled();
  let pack = await packFrom(page), hero = pack.assets.find(a => a.id === pack.characters[0].sprite_key);
  expect([hero.width, hero.height, hero.frame_width, hero.frame_height, hero.display_height]).toEqual([768, 672, 96, 96, 48]);
  expect(Object.keys(hero.animations)).toHaveLength(7); expect(pack.assets.find(a => a.id === hero.generation.source_key).kind).toBe('character_source');
  const evidence = await page.evaluate(async asset => {
    const image = new Image(); image.src = `data:image/png;base64,${asset.png_base64}`; await image.decode();
    const c = document.createElement('canvas'); c.width = asset.width; c.height = asset.height; const x = c.getContext('2d'); x.drawImage(image, 0, 0);
    const pixels = x.getImageData(0, 0, 96, 96).data, colors = new Set(); let bootsBelowWaist = false;
    for (let p = 0; p < pixels.length; p += 4) if (pixels[p + 3]) { const rgb = `${pixels[p]},${pixels[p + 1]},${pixels[p + 2]}`; colors.add(rgb); if (rgb === '234,162,51' && Math.floor(p / 4 / 96) > 65) bootsBelowWaist = true; }
    const frame = (col, row) => Array.from(x.getImageData(col * 96, row * 96, 96, 96).data).join(',');
    return { colors: [...colors], bootsBelowWaist, idle: frame(0, 0), walk: frame(2, 1), attack: frame(3, 2), crouch: frame(0, 4) };
  }, hero);
  expect(evidence.colors).toEqual(expect.arrayContaining(['49,88,115', '134,45,135', '234,162,51'])); expect(evidence.bootsBelowWaist).toBe(true);
  expect(evidence.walk).not.toBe(evidence.idle); expect(evidence.attack).not.toBe(evidence.idle); expect(evidence.crouch).not.toBe(evidence.idle);
  const gameplay = structuredClone(pack.chapters[0].enemies[0]);
  await page.locator('.object-details summary').click(); await page.locator('[data-entity="enemy:0"]').click();
  await page.locator('#body-file').setInputFiles(await bodyFile(page, '#ba563b')); await expect(page.locator('#body-regenerate')).toBeEnabled();
  pack = await packFrom(page); const enemy = pack.chapters[0].enemies[0], enemyArt = pack.assets.find(a => a.id === enemy.sprite_key);
  expect(enemy.sprite_key).not.toBe(hero.id); expect(enemyArt.generation.method).toBe('whole_v1');
  const { sprite_key, ...enemyGameplay } = enemy; expect(enemyGameplay).toEqual(gameplay); expect(validateEpisode(pack, schema)).toEqual([]);
  const frame = await startPreview(page); let actual = await snapshot(frame);
  expect(actual.player.sprite_key).toBe(hero.id); expect(actual.player.render_size).toEqual([48, 48]);
  await page.keyboard.down('ArrowRight');
  try { await expect.poll(async () => (await snapshot(frame)).enemies.length).toBeGreaterThan(0); } finally { await page.keyboard.up('ArrowRight'); }
  actual = await snapshot(frame); expect(actual.enemies[0].sprite_key).toBe(enemy.sprite_key); expect(actual.enemies[0].render_size).toEqual([48, 48]);
  expect(errors).toEqual([]);
});
test('regenerating shared whole-body art forks only the selected actor and survives undo and reload', async ({ page }) => {
  await open(page); await page.locator('[data-tab="character"]').click();
  await page.locator('#body-file').setInputFiles(await bodyFile(page)); await expect(page.locator('#body-regenerate')).toBeEnabled();
  let pack = await packFrom(page), original = pack.assets.find(a => a.id === pack.characters[0].sprite_key);
  await page.locator('[data-tab="assets"]').click(); await page.locator('#asset-character').selectOption(`enemy:${pack.chapters[0].enemies[0].id}`);
  await page.locator('.asset-card').filter({ has: page.getByAltText(original.name, { exact: true }) }).getByRole('button', { name: '선택한 인물 동작으로', exact: true }).click();
  await page.locator('#actor-workshop-target').selectOption(pack.characters[0].id);
  await page.locator('#rig-settings summary').click(); await page.locator('#rig-colors').selectOption('8'); await page.locator('#body-display-height').fill('56');
  await page.locator('#body-regenerate').click();
  await expect(page.locator('[data-actor-sheet].active')).not.toHaveAttribute('data-actor-sheet', original.id);
  pack = await packFrom(page); const next = pack.assets.find(a => a.id === pack.characters[0].sprite_key);
  expect(next.generation.settings.colors).toBe(8); expect(next.display_height).toBe(56);
  expect(pack.chapters[0].enemies[0].sprite_key).toBe(original.id); expect(pack.assets.find(a => a.id === original.id)).toEqual(original);
  await page.locator('#body-file').setInputFiles(await bodyFile(page, '#377d58')); await expect(page.locator('#body-regenerate')).toBeEnabled();
  const changed = await packFrom(page); expect(changed.assets.find(a => a.id === changed.characters[0].sprite_key).generation.source_key).not.toBe(original.generation.source_key);
  await page.locator('[data-tab="map"]').click(); await page.locator('[data-action="undo"]').click();
  expect((await packFrom(page)).assets.find(a => a.id === next.id)).toEqual(next);
  await page.reload(); await expect(page.locator('#save-state')).toContainText('저장됨');
  const restored = await packFrom(page); expect(restored.characters[0].sprite_key).toBe(next.id); expect(restored.assets.find(a => a.id === next.id)).toEqual(next); expect(validateEpisode(restored, schema)).toEqual([]);
  // A library source stays reusable after its only actor uploads a different image.
  await page.locator('[data-tab="assets"]').click(); await page.locator('#asset-kind').selectOption('character_source');
  await page.locator('#asset-files').setInputFiles({ ...await bodyFile(page, '#286895'), name: 'library-body.png' });
  await expect(page.getByAltText('library-body', { exact: true })).toBeVisible();
  const library = (await packFrom(page)).assets.find(a => a.kind === 'character_source' && a.name === 'library-body');
  await page.locator('#asset-character').selectOption('0');
  await page.locator('.asset-card').filter({ has: page.getByAltText('library-body', { exact: true }) }).getByRole('button', { name: '전신 동작 자동 생성', exact: true }).click();
  await expect(page.locator('#body-regenerate')).toBeEnabled();
  expect((await packFrom(page)).assets.find(a => a.id === next.id).display_height).toBe(56);
  await page.locator('#body-file').setInputFiles(await bodyFile(page, '#ba563b')); await expect(page.locator('#body-regenerate')).toBeEnabled();
  const replacement = await packFrom(page), replacementSheet = replacement.assets.find(a => a.id === replacement.characters[0].sprite_key);
  expect(replacement.assets.find(a => a.id === library.id)).toEqual(library); expect(replacementSheet.generation.source_key).not.toBe(library.id);
});
test.describe('compact actor authoring', () => {
  test.use({ viewport: { width: 600, height: 900 }, hasTouch: true, isMobile: true });
  test('a newly added enemy can generate and preview full-body animation by touch', async ({ page }) => {
    await page.goto('/studio/'); await expect(page.locator('#save-state')).toContainText('저장됨');
    await page.locator('[data-tab="map"]').tap(); await page.locator('[data-add="enemy"]').tap();
    await page.locator('#body-sample').tap(); await expect(page.locator('#body-regenerate')).toBeEnabled();
    await page.locator('#actor-motion').selectOption('jump');
    const pack = await packFrom(page), enemy = pack.chapters[0].enemies.at(-1), sheet = pack.assets.find(a => a.id === enemy.sprite_key);
    expect(sheet.generation.method).toBe('whole_v1'); expect(Object.keys(sheet.animations)).toHaveLength(7);
    expect(pack.characters[0].sprite_key).toBe('avatar_hero'); expect(validateEpisode(pack, schema)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
