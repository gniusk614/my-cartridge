import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve, sep, extname } from 'node:path';
import { createEpisode, addScene, syncCombat, validateEpisode, createProp } from '../../studio/core.js';
import { readFileSync } from 'node:fs';
test.use({ deviceScaleFactor: 1, isMobile: false, hasTouch: false });
const schema = JSON.parse(readFileSync(new URL('../../schemas/game_pack.schema.json', import.meta.url), 'utf8'));

function storyEpisode() {
  const pack = createEpisode(); addScene(pack);
  pack.characters[0].name = '지민'; pack.characters[1].name = '하린';
  pack.meta.title = '두 사람의 기억';
  pack.chapters.forEach((chapter, i) => {
    chapter.enemies = []; syncCombat(chapter); chapter.intro = `{{player}}와 {{missing}}의 ${i + 1}번째 장소`;
    chapter.objectives[0].position = { x: 65, y: 130 };
    const map = pack.maps[i]; map.width = 640; map.spawn = { x: 60, y: 130 }; map.door = { x: 100, y: 130 }; map.surfaces = [];
  });
  const asset = { id: 'delivery_prop', name: '기본 소품', kind: 'prop', width: 192, height: 192, png_base64: readFileSync(new URL('../../game/web/static/icon-192.png', import.meta.url)).toString('base64') };
  pack.assets.push(asset); pack.maps.forEach(m => m.props.push(createProp(asset, { x: 400, y: 140 }, m.width)));
  return pack;
}
async function openStudio(page, base = '') {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/studio/`);
  await expect(page.locator('#save-state')).toContainText('저장됨');
}
async function importProject(page, pack) {
  await page.locator('#project-file').setInputFiles({ name: 'episode.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) });
  await expect(page.locator('#project-name')).toHaveText(pack.meta.title);
  await expect(page.locator('#issue-count')).toHaveText('준비 완료');
}
async function snapshot(frame) {
  return frame.evaluate(() => { window.myCartridgeTestSnapshot(); return JSON.parse(window.myCartridgeTestState); });
}
async function tapGame(frame, label) {
  await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const data = await snapshot(frame), button = data.menu.find(b => b.text === label);
  expect(button, label).toBeTruthy();
  const size = await frame.locator('#canvas').evaluate(c => ({ width: c.getBoundingClientRect().width, height: c.getBoundingClientRect().height }));
  await frame.locator('#canvas').click({ position: { x: button.center[0] / data.viewport[0] * size.width, y: button.center[1] / data.viewport[1] * size.height } });
}
async function walk(frame, point) {
  const page = frame.page(), deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    const data = await snapshot(frame), [x, y] = data.player.position, dx = point[0] - x, dy = point[1] - y;
    if (Math.hypot(dx, dy) < 20) return;
    const key = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp');
    // Release and observe the stopped position between pulses; software WebGL can
    // otherwise continue moving while remote-control key-up messages are queued.
    await page.keyboard.press(key, { delay: 120 });
    await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect.poll(async () => (await snapshot(frame)).player.velocity).toEqual([0, 0]);
  }
  throw new Error('Custom map movement did not reach the interaction');
}

async function interact(frame, key, value) {
  const page = frame.page();
  await page.keyboard.down('KeyE');
  try { await expect.poll(async () => (await snapshot(frame))[key]).toBe(value); }
  catch (error) { console.log('Failed interaction', JSON.stringify(await snapshot(frame))); throw error; }
  finally { await page.keyboard.up('KeyE'); }
}

test('studio converts a local image, generates sprites, validates and roundtrips JSON drafts', async ({ page }) => {
  await openStudio(page);
  await page.locator('[data-tab="map"]').click();
  await page.locator('.precise-tools summary').click();
  await page.locator('[data-tool="npc"]').click();
  let box = await page.locator('#map-canvas').boundingBox();
  const scale = box.width / 960;
  await page.locator('#map-canvas').click({ position: { x: 500 * scale, y: 130 * scale } });
  box = await page.locator('#map-canvas').boundingBox();
  await page.mouse.move(box.x + 500 * scale, box.y + 113 * scale);
  await page.mouse.down(); await page.mouse.move(box.x + 540 * scale, box.y + 113 * scale, { steps: 6 }); await page.mouse.up();
  await expect(page.locator('[data-path="maps.0.npcs.0.position.x"]')).toHaveValue('540');
  await page.locator('[data-tab="character"]').click();
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 96, 96); g.addColorStop(0, '#375583'); g.addColorStop(1, '#efc48c'); x.fillStyle = g; x.fillRect(0, 0, 96, 96); x.fillStyle = '#ad547a'; x.fillRect(24, 20, 48, 55); return c.toDataURL('image/png').split(',')[1]; });
  await page.locator('#portrait-file').setInputFiles({ name: 'character.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect.poll(() => page.locator('#portrait-canvas').evaluate(c => c.getContext('2d').getImageData(0, 0, 1, 1).data[3])).toBe(255);
  await page.locator('#pixel-size').selectOption('32'); await page.locator('#pixel-colors').selectOption('8');
  await page.getByRole('button', { name: '초상화 적용', exact: true }).click();
  await page.locator('#use-portrait-head').check(); await page.getByRole('button', { name: '동작 템플릿 생성', exact: true }).click();
  const downloadPromise = page.waitForEvent('download'); await page.locator('#export-json').click(); const download = await downloadPromise;
  const pack = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(validateEpisode(pack, schema)).toEqual([]);
  expect(pack.maps[0].npcs[0].position.x).toBe(540);
  const portrait = pack.assets.find(a => a.id === pack.characters[0].portrait_key);
  expect([portrait.width, portrait.height]).toEqual([32, 32]);
  const sheet = pack.assets.find(a => a.id === pack.characters[0].sprite_key);
  expect([sheet.width, sheet.height]).toEqual([256, 336]); expect(Object.keys(sheet.animations)).toHaveLength(7);
  const paletteCount = await page.evaluate(async asset => { const image = new Image(); image.src = `data:image/png;base64,${asset.png_base64}`; await image.decode(); const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); x.drawImage(image, 0, 0); const data = x.getImageData(0, 0, 32, 32).data, colors = new Set(); for (let i = 0; i < data.length; i += 4) if (data[i + 3]) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`); return colors.size; }, portrait);
  expect(paletteCount).toBeLessThanOrEqual(8);
  await page.reload(); await expect(page.locator('#save-state')).toContainText('저장됨');
  const again = page.waitForEvent('download'); await page.locator('#export-json').click();
  const restored = JSON.parse(await readFile(await (await again).path(), 'utf8'));
  expect(restored.characters[0].portrait_key).toBe(pack.characters[0].portrait_key); expect(restored.assets).toEqual(pack.assets);
  await page.locator('#preview').click(); await expect(page.locator('#preview-status')).toContainText('실행 중', { timeout: 45_000 });
  const frame = page.frames().find(f => f.url().includes('studio-preview=1'));
  await expect.poll(async () => (await snapshot(frame)).state).toBe('STAGE_INTRO');
  expect((await snapshot(frame)).asset_count).toBe(pack.assets.length);
  await tapGame(frame, '기억을 찾아 출발');
  expect((await snapshot(frame)).player.sprite_key).toBe(pack.characters[0].sprite_key);
});

test('studio preview plays a custom two-map story through to the final letter', async ({ page }) => {
  await openStudio(page); const pack = storyEpisode(); await importProject(page, pack);
  await page.locator('#preview').click(); await expect(page.locator('#preview-status')).toContainText('실행 중', { timeout: 45_000 });
  const frame = page.frames().find(f => f.url().includes('studio-preview=1')); expect(frame).toBeTruthy();
  await expect.poll(async () => (await snapshot(frame)).state).toBe('STAGE_INTRO');
  expect((await snapshot(frame)).preview).toBe(true);
  expect((await snapshot(frame)).storage).toBe('user://studio_preview');
  expect((await snapshot(frame)).modal_text.join()).toContain('지민와 하린의');
  for (let index = 0; index < 2; index++) {
    await tapGame(frame, '기억을 찾아 출발'); await expect.poll(async () => (await snapshot(frame)).state).toBe('PLAYING');
    expect((await snapshot(frame)).map_id).toBe(pack.maps[index].id);
    await interact(frame, 'state', 'CLUE_REVEAL');
    await tapGame(frame, '기억을 간직하고 계속');
    await walk(frame, [100, 130]); await interact(frame, 'indoors', true);
    await walk(frame, [251, 117]); await interact(frame, 'state', index === 0 ? 'CHAPTER_CLEAR' : 'ENDING');
    if (index === 0) { await expect.poll(async () => (await snapshot(frame)).state).toBe('CHAPTER_CLEAR'); await tapGame(frame, '다음 장면'); await expect.poll(async () => (await snapshot(frame)).chapter_index).toBe(1); }
  }
  await expect.poll(async () => (await snapshot(frame)).state).toBe('ENDING');
  expect((await snapshot(frame)).progress.collected_clue_ids).toHaveLength(2);
});

test('delivery ZIP contains a standalone player that automatically loads the customer episode', async ({ page }, testInfo) => {
  await openStudio(page, 'http://127.0.0.1:8767'); const pack = storyEpisode(); await importProject(page, pack);
  const promised = page.waitForEvent('download', { timeout: 60_000 }); await page.locator('#export-game').click(); const zip = await promised;
  const directory = testInfo.outputPath('customer-game'); await mkdir(directory, { recursive: true });
  execFileSync('python3', ['-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert "episode.json" in z.namelist(); assert not any("studio/" in n for n in z.namelist()); z.extractall(sys.argv[2])', await zip.path(), directory]);
  expect(JSON.parse(await readFile(resolve(directory, 'episode.json'), 'utf8')).pack_id).toBe(pack.pack_id);
  const server = createServer(async (req, res) => {
    const path = resolve(directory, decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html');
    if (!path.startsWith(directory + sep)) { res.writeHead(403); res.end(); return; }
    try { const data = await readFile(path); res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' })[extname(path)] || 'application/octet-stream' }); res.end(data); } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await expect(page.locator('#launch-windowed')).toBeEnabled({ timeout: 45_000 });
    expect(await page.evaluate(() => JSON.parse(window.myCartridgeImportResult))).toMatchObject({ ok: true, pack_id: pack.pack_id });
    expect(await page.evaluate(() => typeof window.myCartridgeTestSnapshot)).toBe('undefined');
    await page.locator('#launch-windowed').click();
  } finally { await page.goto('about:blank'); await new Promise(resolve => server.close(resolve)); }
});

async function downloadPack(page) {
  const promised = page.waitForEvent('download'); await page.locator('#export-json').click();
  return JSON.parse(await readFile(await (await promised).path(), 'utf8'));
}
async function imageFixture(page, name = '여행 간판.png') {
  const data = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 64; c.height = 48; const x = c.getContext('2d'); x.fillStyle = '#4b7b65'; x.fillRect(8, 0, 48, 35); x.fillStyle = '#ffe3a0'; x.fillRect(14, 8, 36, 15); x.fillStyle = '#997451'; x.fillRect(28, 30, 8, 18); return c.toDataURL('image/png').split(',')[1]; });
  return { name, mimeType: 'image/png', buffer: Buffer.from(data, 'base64') };
}

test('placeholder boxes accept reusable artwork without moving, and undo, JSON and the real game preserve it', async ({ page }) => {
  await openStudio(page); await page.locator('[data-tab="map"]').click();
  await page.locator('[data-add="prop"]').click();
  await expect(page.locator('#object-properties')).toContainText('박스를 이미지로 바꾸기');
  let pack = await downloadPack(page), box = pack.maps[0].props[0];
  expect(box.asset_key).toBeUndefined(); expect([box.width, box.height]).toEqual([48, 48]);
  const original = { ...box.position };
  await page.locator('#object-image-file').setInputFiles(await imageFixture(page));
  await expect(page.locator('#issue-count')).toHaveText('준비 완료');
  await expect(page.getByRole('button', { name: '여행 간판 그림 적용', exact: true })).toBeVisible();
  pack = await downloadPack(page); box = pack.maps[0].props[0]; const assetId = box.asset_key;
  expect(box.position).toEqual(original); expect([box.width, box.height]).toEqual([48, 48]);
  expect(pack.assets.find(a => a.id === assetId).name).toBe('여행 간판');
  await page.locator('.object-geometry summary').click();
  await page.locator('[data-path="maps.0.props.0.width"]').fill('64'); await page.locator('[data-path="maps.0.props.0.width"]').press('Tab');
  await page.locator('[data-path="maps.0.props.0.flip_x"]').check();
  await page.locator('[data-path="maps.0.props.0.layer"]').selectOption('front');
  await page.getByRole('button', { name: '나무 그림 적용', exact: true }).click();
  expect((await downloadPack(page)).maps[0].props[0].position).toEqual(original);
  await page.locator('[data-action="undo"]').click();
  pack = await downloadPack(page); expect(pack.maps[0].props[0].asset_key).toBe(assetId);
  // Re-select after undo, then clone and delete independently of the shared image.
  await page.locator('.object-details summary').click(); await page.locator('[data-entity="prop:0"]').click();
  await page.locator('[data-action="duplicate-object"]').click();
  expect((await downloadPack(page)).maps[0].props).toHaveLength(2);
  await page.locator('[data-action="undo"]').click(); expect((await downloadPack(page)).maps[0].props).toHaveLength(1);
  await page.locator('[data-action="redo"]').click(); expect((await downloadPack(page)).maps[0].props).toHaveLength(2);
  await page.locator('.object-details summary').click(); await page.locator('[data-entity="prop:1"]').click();
  await page.locator('[data-action="delete-object"]').click();
  pack = await downloadPack(page); expect(pack.maps[0].props).toHaveLength(1); expect(validateEpisode(pack, schema)).toEqual([]);
  await page.reload(); await expect(page.locator('#save-state')).toContainText('저장됨');
  const restored = await downloadPack(page); expect(restored.maps[0].props).toEqual(pack.maps[0].props);
  await page.locator('#preview').click(); await expect(page.locator('#preview-status')).toContainText('실행 중', { timeout: 45_000 });
  const frame = page.frames().find(f => f.url().includes('studio-preview=1'));
  const actual = await snapshot(frame); expect(actual.props).toHaveLength(1);
  expect(actual.props[0]).toMatchObject({ asset_key: assetId, size: [64, 48], front: true, position: [original.x, original.y] });
});

test('asset library imports multiple pictures, reuses art in scenes and connects backgrounds', async ({ page }) => {
  await openStudio(page); await page.locator('[data-tab="assets"]').click();
  const picture = await imageFixture(page);
  await page.locator('#asset-files').setInputFiles([picture, { ...picture, name: '공원 안내.png' }]);
  await expect(page.locator('.asset-card')).toHaveCount(4);
  const card = page.locator('.asset-card').filter({ has: page.getByAltText('여행 간판', { exact: true }) });
  await card.getByRole('button', { name: '맵에 추가', exact: true }).click();
  let pack = await downloadPack(page); const id = pack.maps[0].props[0].asset_key;
  await page.locator('#add-scene').click(); await page.locator('[data-tab="assets"]').click();
  await page.locator('.asset-card').filter({ has: page.getByAltText('여행 간판', { exact: true }) }).getByRole('button', { name: '맵에 추가', exact: true }).click();
  pack = await downloadPack(page); expect(pack.maps.map(m => m.props[0].asset_key)).toEqual([id, id]);
  await page.locator('.asset-grid.compact .asset-card').filter({ has: page.getByAltText('공원 안내', { exact: true }) }).dragTo(page.locator('#map-canvas'), { targetPosition: { x: 300, y: 180 } });
  expect((await downloadPack(page)).maps[1].props).toHaveLength(2);
  await page.locator('[data-tab="assets"]').click();
  await expect(page.locator('.asset-card').filter({ has: page.getByAltText('여행 간판', { exact: true }) }).getByRole('button', { name: '사용 중', exact: true })).toBeDisabled();
  await page.locator('#asset-kind').selectOption('background'); await page.locator('#asset-files').setInputFiles({ ...picture, name: '여행 배경.png' });
  await page.locator('.asset-card').filter({ has: page.getByAltText('여행 배경', { exact: true }) }).getByRole('button', { name: '현재 장면 배경으로', exact: true }).click();
  pack = await downloadPack(page); expect(pack.assets.find(a => a.id === pack.maps[1].background_key).kind).toBe('background');
  await page.locator('[data-tab="assets"]').click(); await page.locator('#asset-character').selectOption('1');
  await page.locator('#asset-kind').selectOption('portrait'); await page.locator('#asset-files').setInputFiles({ ...picture, name: '상대 초상화.png' });
  await page.locator('.asset-card').filter({ has: page.getByAltText('상대 초상화', { exact: true }) }).getByRole('button', { name: '선택한 인물 초상화로', exact: true }).click();
  await page.locator('[data-tab="assets"]').click(); await page.locator('#asset-character').selectOption('0');
  await page.locator('#asset-kind').selectOption('sprite_sheet'); await page.locator('#asset-files').setInputFiles({ ...picture, name: '주인공 시트.png' });
  await page.locator('.asset-card').filter({ has: page.getByAltText('주인공 시트', { exact: true }) }).getByRole('button', { name: '선택한 인물 동작으로', exact: true }).click();
  pack = await downloadPack(page);
  expect(pack.assets.find(a => a.id === pack.characters[1].portrait_key).kind).toBe('portrait');
  expect(pack.assets.find(a => a.id === pack.characters[0].sprite_key).name).toBe('주인공 시트');
  expect(validateEpisode(pack, schema)).toEqual([]);
});

test.describe('compact authoring' , () => {
  test.use({ viewport: { width: 600, height: 900 }, hasTouch: true, isMobile: true });
  test('touch adds a box and swaps art beside the map without coordinate entry', async ({ page }) => {
    await page.goto('/studio/'); await expect(page.locator('#save-state')).toContainText('저장됨');
    await page.locator('[data-tab="map"]').tap(); await page.locator('[data-add="prop"]').tap();
    await expect(page.locator('#object-properties')).toContainText('장식 박스');
    await page.getByRole('button', { name: '벤치 그림 적용', exact: true }).tap();
    await expect(page.locator('#issue-count')).toHaveText('준비 완료');
    const pack = await downloadPack(page); expect(pack.maps[0].props[0].asset_key).toBe('starter_bench');
    expect(pack.maps[0].props[0].width).toBe(48);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('[data-action="undo"]').tap();
    expect((await downloadPack(page)).maps[0].props[0].asset_key).toBeUndefined();
    await page.locator('#scene-picker').selectOption('0');
  });
});
