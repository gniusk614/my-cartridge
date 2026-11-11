import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { crc32 } from '../studio/zip.js';
import { createEpisode, addScene, validateEpisode, reachableAssets, assetReferences, STATES } from '../studio/core.js';
import { normalizeRig, DEFAULT_RIG, alphaBounds, cleanBodyBackground, rigParts, bodyPose, BODY_LENGTHS } from '../studio/body.js';
import { spritePrompt, gridSpec } from '../studio/ai_sprites.js';
import { actorEntries } from '../studio/actor_editor.js';
const schema = JSON.parse(readFileSync(new URL('../schemas/game_pack.schema.json', import.meta.url)));

function pngAsset(id, kind, width, height) {
  const chunk = (name, data) => { const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const payload = Buffer.concat([Buffer.from(name), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(payload)); return Buffer.concat([length, payload, crc]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height); for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw.set([40, 90, 120, 255], y * (width * 4 + 1) + 1 + x * 4);
  return { id, kind, width, height, png_base64: Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64') };
}
function bodyPack() {
  const pack = createEpisode(), source = pngAsset('body_source', 'character_source', 32, 64), sheet = pngAsset('body_motion', 'sprite_sheet', 768, 672);
  Object.assign(sheet, { frame_width: 96, frame_height: 96, display_height: 48, generation: { method: 'cutout_v1', source_key: source.id, settings: { ...DEFAULT_RIG } }, animations: Object.fromEntries(STATES.map((k, i) => [k, { row: i, frames: BODY_LENGTHS[i], fps: 8 }])) });
  pack.assets = [source, sheet]; pack.characters[0].sprite_key = sheet.id; pack.chapters[0].enemies[0].sprite_key = sheet.id;
  return pack;
}
test('whole-body rig partitions cover head, clothes, hands, legs and shoes', () => {
  const bounds = { x: 27, y: 10, width: 42, height: 84 }, parts = rigParts(bounds);
  assert.deepEqual(parts.map(p => p.name), ['leftLeg', 'rightLeg', 'leftArm', 'torso', 'head', 'rightArm']);
  for (let y = bounds.y; y < bounds.y + bounds.height; y++) for (let x = bounds.x; x < bounds.x + bounds.width; x++) assert.ok(parts.some(p => { const [a, b, w, h] = p.rect; return x >= a && x < a + w && y >= b && y < b + h; }));
});
test('automatic poses move limbs and keep all seven actions finite and distinct', () => {
  for (const [i, state] of STATES.entries()) for (let f = 0; f < BODY_LENGTHS[i]; f++) {
    const p = bodyPose(state, f); assert.ok(Object.values(p.angles).every(Number.isFinite)); assert.ok(p.sx > 0 && p.sy > 0);
  }
  assert.notEqual(bodyPose('move', 2).angles.leftLeg, bodyPose('move', 6).angles.leftLeg);
  assert.notEqual(bodyPose('attack', 2).angles.rightArm, bodyPose('idle', 0).angles.rightArm);
  assert.ok(bodyPose('crouch', 0).sy < 1); assert.equal(bodyPose('down', 0).down, true);
});
test('rig normalization keeps anatomical bands ordered and preview sizes bounded', () => {
  const s = normalizeRig({ head_cut: 38, hip_cut: 24, colors: 999, center_x: 200 });
  assert.ok(s.hip_cut >= s.head_cut + 12); assert.equal(s.center_x, 65); assert.equal(s.colors, 32);
  assert.equal(normalizeRig({ colors: 0 }).colors, 0);
});
test('transparent PNG margins do not erase dark full-body clothing', () => {
  const rgba = new Uint8ClampedArray(8 * 10 * 4); rgba.set([0, 0, 0, 255], (4 * 8 + 3) * 4); rgba.set([200, 50, 40, 255], (8 * 8 + 4) * 4);
  assert.deepEqual(cleanBodyBackground(rgba, 8, 10, true), rgba);
  assert.deepEqual(alphaBounds(rgba, 8, 10), { x: 3, y: 4, width: 2, height: 5 });
  assert.equal(alphaBounds(new Uint8ClampedArray(64), 4, 4), null);
});
test('solid border removal preserves connected subject pixels of other colors', () => {
  const rgba = new Uint8ClampedArray(8 * 10 * 4).fill(255); rgba.set([0, 0, 0, 255], (4 * 8 + 3) * 4);
  const result = cleanBodyBackground(rgba, 8, 10, true); assert.equal(result[3], 0); assert.equal(result[(4 * 8 + 3) * 4 + 3], 255); assert.equal(rgba[3], 255);
});
test('generated full-body art is valid and reusable by the player and an enemy', () => {
  const pack = bodyPack(); assert.deepEqual(validateEpisode(pack, schema), []);
  assert.equal(assetReferences(pack, 'body_motion'), 2); assert.equal(assetReferences(pack, 'body_source'), 1);
  assert.ok(reachableAssets(pack).has('body_source'));
  pack.characters[0].sprite_key = 'hero_base'; delete pack.chapters[0].enemies[0].sprite_key;
  assert.equal(reachableAssets(pack).has('body_source'), false);
});
test('generator source kind, layout, display size, rig ordering and version are validated', () => {
  for (const change of [p => { p.assets[0].kind = 'portrait'; }, p => { p.assets[1].frame_height = 48; }, p => { p.assets[1].display_height = 999; }, p => { p.assets[1].generation.settings.head_cut = 38; p.assets[1].generation.settings.hip_cut = 40; }, p => { p.schema_version = '1.2.0'; }, p => { delete p.assets[1].animations.down; }]) {
    const pack = bodyPack(); change(pack); assert.ok(validateEpisode(pack, schema).length);
  }
});
test('every scene enemy has an independent actor target without changing gameplay data', () => {
  const pack = createEpisode(); addScene(pack); const before = structuredClone(pack), entries = actorEntries(pack);
  assert.equal(entries.length, 4); assert.equal(entries[3].chapterIndex, 1); assert.equal(entries[2].ref, pack.chapters[0].enemies[0]);
  assert.deepEqual(pack, before);
});

test('animal fallback metadata and AI grid contracts remain compatible with the runtime', () => {
  const pack = bodyPack(); pack.assets[1].generation.method = 'whole_v1'; assert.deepEqual(validateEpisode(pack, schema), []);
  assert.deepEqual(gridSpec(1024, 1792, 4), { columns: 4, rows: 7, width: 384, height: 672 });
  for (const args of [[100, 100, 0], [100, 100, 9], [100, 100, 2.5], [10, 100, 4]]) assert.throws(() => gridSpec(...args));
});
test('AI prompts preserve animal anatomy, require an exact frame grid and retain character notes', () => {
  const prompt = spritePrompt('A penguin with a red scarf'); assert.match(prompt, /A penguin with a red scarf/);
  assert.match(prompt, /exactly 4 equal columns and 7 equal rows/); assert.match(prompt, /continuous body/); assert.match(prompt, /no margins or gaps/i);
  assert.ok(spritePrompt('x'.repeat(9000)).length < 4000);
});
