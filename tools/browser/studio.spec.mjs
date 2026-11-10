import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve, sep, extname } from 'node:path';
import { createEpisode, addScene, syncCombat, validateEpisode } from '../../studio/core.js';
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
  await page.locator('[data-tool="npc"]').click();
  const box = await page.locator('#map-canvas').boundingBox();
  const scale = box.width / 960;
  await page.locator('#map-canvas').click({ position: { x: 500 * scale, y: 130 * scale } });
  await page.locator('[data-entity="npc:0"]').click();
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
