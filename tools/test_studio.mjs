import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEpisode, addScene, upgrade, syncCombat, validateEpisode, createProp, clampProp, assetReferences } from '../studio/core.js';
import { quantize, removeEdgeBackground } from '../studio/pixel.js';
import { crc32, zipFiles } from '../studio/zip.js';
const schema = JSON.parse(readFileSync(new URL('../schemas/game_pack.schema.json', import.meta.url), 'utf8'));

test('fresh episode and extra scene are valid independently of the game code', () => {
  const pack = createEpisode(); assert.deepEqual(validateEpisode(pack, schema), []);
  addScene(pack); assert.equal(pack.chapters.length, 2); assert.notEqual(pack.chapters[0].map_id, pack.chapters[1].map_id);
  assert.deepEqual(validateEpisode(pack, schema), []);
});
test('legacy samples upgrade without changing story or progress identifiers', () => {
  for (const name of ['demo_snowy_rescue', 'demo_blue_umbrella', 'demo_dawn_walk']) {
    const original = JSON.parse(readFileSync(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'));
    const next = upgrade(original); assert.deepEqual(validateEpisode(next, schema), []);
    assert.equal(next.pack_id, original.pack_id); assert.deepEqual(next.clues, original.clues); assert.deepEqual(next.chapters[0].enemies, original.chapters[0].enemies);
    assert.equal(original.schema_version, '1.0.0');
  }
});
test('story-only scenes remove combat gates and remain playable', () => {
  const pack = createEpisode(); pack.chapters[0].enemies = []; syncCombat(pack.chapters[0]);
  assert.deepEqual(pack.chapters[0].mechanics, ['collect']); assert.deepEqual(pack.chapters[0].objectives[0].depends_on, []);
  assert.deepEqual(validateEpisode(pack, schema), []);
});
test('cross-scene duplicate IDs, missing map and broken sprite references are rejected', () => {
  const pack = createEpisode(); addScene(pack); pack.chapters[1].enemies[0].id = pack.chapters[0].enemies[0].id;
  assert.match(validateEpisode(pack, schema).join(), /중복/);
  const bad = createEpisode(); bad.chapters[0].map_id = 'absent'; bad.characters[0].sprite_key = 'absent';
  assert.match(validateEpisode(bad, schema).join(), /맵 연결/); assert.match(validateEpisode(bad, schema).join(), /sprite_sheet/);
});
test('authoring rejects cycles, impossible objectives and out-of-map placements', () => {
  const pack = createEpisode(); pack.chapters[0].enemies[0].after = [pack.chapters[0].enemies[0].id];
  pack.chapters[0].objectives[0].count = 8; pack.maps[0].door.x = 1000;
  const errors = validateEpisode(pack, schema).join(); assert.match(errors, /순환/); assert.match(errors, /달성/); assert.match(errors, /맵 경계/);
});
test('local palette conversion preserves transparency and bounds color count', () => {
  const pixels = new Uint8ClampedArray(64 * 4);
  for (let i = 0; i < 64; i++) pixels.set([i * 4, 255 - i * 4, (i * 7) % 255, i === 0 ? 0 : 255], i * 4);
  const original = pixels.slice(), result = quantize(pixels, 8);
  assert.deepEqual(pixels, original); assert.equal(result.data[3], 0);
  const colors = new Set(); for (let i = 4; i < result.data.length; i += 4) colors.add(result.data.slice(i, i + 3).join());
  assert.ok(colors.size <= 8); assert.ok(colors.size > 1);
  assert.deepEqual(quantize(pixels, 8), result);
});
test('background removal follows edge connectivity rather than removing enclosed colors', () => {
  const pixels = new Uint8ClampedArray(5 * 5 * 4).fill(255);
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) if (x !== 2 || y !== 2) pixels.set([0, 0, 0, 255], (y * 5 + x) * 4);
  const result = removeEdgeBackground(pixels, 5, 5, 5);
  assert.equal(result[3], 0); assert.equal(result[(2 * 5 + 2) * 4 + 3], 255); assert.equal(pixels[3], 255);
});
test('ZIP export stores intact content and CRC, and prevents traversal filenames', async () => {
  const data = new TextEncoder().encode('123456789'); assert.equal(crc32(data), 0xcbf43926);
  const raw = new Uint8Array(await zipFiles([{ name: 'episode.json', data }, { name: '.nojekyll', data: '' }]).arrayBuffer());
  const view = new DataView(raw.buffer); assert.equal(view.getUint32(0, true), 0x04034b50); assert.equal(view.getUint32(14, true), 0xcbf43926);
  assert.equal(view.getUint32(raw.length - 22, true), 0x06054b50); assert.equal(view.getUint16(raw.length - 12, true), 2);
  assert.throws(() => zipFiles([{ name: '../escape', data }]), /파일명/);
});


test('import normalization fills optional authoring controls while keeping explicit colors', () => {
  const pack = createEpisode(); delete pack.maps[0].palette; pack.characters[0].appearance = { coat: '#123456' };
  const next = upgrade(pack);
  assert.equal(next.maps[0].palette.sky, '#111e38'); assert.equal(next.characters[0].appearance.coat, '#123456');
  assert.equal(next.characters[0].appearance.skin, '#f4cdb3'); assert.deepEqual(validateEpisode(next, schema), []);
});

const propImage = () => ({ id: 'own_sign', name: '우리의 표지판', kind: 'prop', width: 1, height: 1, png_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' });
test('reusable decoration references survive another scene and prevent deleting used art', () => {
  const pack = createEpisode(), asset = propImage(); pack.assets.push(asset); addScene(pack);
  for (const map of pack.maps) map.props.push(createProp(asset, { x: 200, y: 130 }, map.width));
  assert.equal(assetReferences(pack, asset.id), 2); assert.deepEqual(validateEpisode(pack, schema), []);
  assert.notEqual(pack.maps[0].props[0].id, pack.maps[1].props[0].id);
});
test('prop placement and resizing keep the complete picture inside the map', () => {
  const p = createProp({ ...propImage(), width: 200, height: 400 }, { x: -200, y: -1 }, 640);
  assert.deepEqual([p.width, p.height], [40, 80]); assert.deepEqual(p.position, { x: 20, y: 80 });
  p.width = 300; p.height = 999; p.position = { x: 700, y: 999 }; clampProp(p, 640);
  assert.deepEqual([p.width, p.height, p.position.x, p.position.y], [256, 180, 512, 180]);
});
test('decoration kind, bounds, duplicate IDs and version are checked before playing', () => {
  const pack = createEpisode(), asset = propImage(); pack.assets.push(asset); pack.maps[0].props.push(createProp(asset, { x: 100, y: 130 }, 960));
  for (const change of [p => { p.assets[0].kind = 'portrait'; }, p => { p.maps[0].props[0].position.x = 0; }, p => { p.maps[0].props[0].id = p.characters[0].id; }, p => { p.schema_version = '1.1.0'; }]) {
    const bad = structuredClone(pack); change(bad); assert.ok(validateEpisode(bad, schema).length);
  }
});
test('1.1 drafts acquire an empty prop collection while retaining story and saves', () => {
  const old = createEpisode(); old.schema_version = '1.1.0'; delete old.maps[0].props;
  const next = upgrade(old); assert.equal(next.schema_version, '1.2.0'); assert.deepEqual(next.maps[0].props, []);
  assert.equal(next.pack_id, old.pack_id); assert.equal(next.pack_revision, old.pack_revision); assert.deepEqual(next.clues, old.clues);
});

test('a placeholder box can be saved, dressed with art and cleared without moving it', () => {
  const pack = createEpisode(), box = createProp(null, { x: 220, y: 134 }, 960);
  pack.maps[0].props.push(box); assert.deepEqual(validateEpisode(pack, schema), []); assert.equal(pack.assets.length, 0);
  const placement = structuredClone(box), asset = propImage(); pack.assets.push(asset); box.asset_key = asset.id;
  assert.deepEqual(validateEpisode(pack, schema), []); assert.equal(assetReferences(pack, asset.id), 1);
  delete box.asset_key; assert.deepEqual(box, placement); assert.deepEqual(validateEpisode(pack, schema), []);
});
