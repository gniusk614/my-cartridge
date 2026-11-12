import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBirthdayEpisode } from '../studio/birthday.js';
import { createStoryEvent } from '../studio/events.js';
import { validateEpisode, upgrade, reachableAssets, assetReferences } from '../studio/core.js';
const schema = JSON.parse(readFileSync(new URL('../schemas/game_pack.schema.json', import.meta.url)));
test('birthday journey is a playable three-scene template with six ambiguous memories and a final reveal', () => {
  const p = createBirthdayEpisode(); assert.deepEqual(validateEpisode(p, schema), []);
  assert.equal(p.schema_version, '1.4.0'); assert.equal(p.chapters.length, 3); assert.equal(p.clues.length, 6);
  assert.ok(p.chapters.every(c => c.carry_baby && c.exit_mode === 'direct' && c.enemies.length === 2));
  assert.equal(p.chapters[2].enemies[1].visual, 'shadow'); assert.equal(p.ending.photo_reveal.clue_ids.length, 6);
  assert.ok(p.chapters.every(c => !/태어나|생일/.test(c.intro))); assert.match(p.ending.letter, /^태어나줘서 고마워/);
  assert.equal('photo_key' in p.ending.photo_reveal, false);
});
test('story graph rejects missing, cross-scene, cyclic and self-blocked spawn conditions', () => {
  const changes = [p => { p.chapters[0].events[0].after = ['missing_event']; }, p => { const e = p.chapters[0].events[0]; e.after = [e.id]; }, p => { p.chapters[0].events[0].trigger.x = 900; }, p => { p.chapters[0].events[0].trigger = { type: 'enemy_defeated', target: p.chapters[0].enemies[1].id }; }, p => { p.chapters[0].events[0].trigger = { type: 'clue_collected', target: p.clues[2].id }; }, p => { p.chapters[0].enemies[1].event_id = p.chapters[1].events[0].id; }, p => { p.chapters[0].events[0].speaker_id = 'nobody'; }, p => { p.chapters[0].events[0].id = p.characters[0].id; }];
  for (const change of changes) { const p = createBirthdayEpisode(); change(p); assert.ok(validateEpisode(p, schema).length); }
});
test('partial defeat goals can unlock a clue event that releases a later enemy', () => {
  const p = createBirthdayEpisode(); p.chapters[0].events[0].trigger = { type: 'clue_collected', target: p.clues[0].id };
  assert.deepEqual(validateEpisode(p, schema), []);
  p.chapters[0].events[0].trigger.target = p.clues[1].id; assert.ok(validateEpisode(p, schema).length);
});
test('photo reveal requires unique real clue IDs and gated features require version 1.4', () => {
  for (const change of [p => { p.ending.photo_reveal.clue_ids.push(p.clues[0].id); }, p => { p.ending.photo_reveal.clue_ids[0] = 'missing_photo'; }, p => { p.schema_version = '1.3.0'; }, p => { p.chapters[0].events[0].heal = 999; }]) { const p = createBirthdayEpisode(); change(p); assert.ok(validateEpisode(p, schema).length); }
});
test('story photo references are preserved by cleanup and counted across endings and clues', () => {
  const p = createBirthdayEpisode(); p.assets = [{ id: 'baby_photo', kind: 'story_photo' }, { id: 'family_photo', kind: 'story_photo' }, { id: 'old_photo', kind: 'story_photo' }];
  p.ending.photo_reveal.photo_key = 'baby_photo'; p.ending.photo_reveal.family_key = 'family_photo'; p.clues[0].image_key = 'old_photo';
  for (const id of ['baby_photo', 'family_photo', 'old_photo']) { assert.equal(assetReferences(p, id), 1); assert.ok(reachableAssets(p).has(id)); }
});
test('legacy projects upgrade without changing identity, facts, old art or story', () => {
  const p = createBirthdayEpisode(); delete p.ending.photo_reveal; p.chapters.forEach(c => { delete c.events; delete c.exit_mode; delete c.carry_baby; delete c.companion_id; c.enemies.forEach(e => { delete e.event_id; delete e.visual; delete e.max_hp; }); }); p.schema_version = '1.3.0';
  const before = structuredClone(p), next = upgrade(p); assert.deepEqual(p, before); assert.equal(next.schema_version, '1.4.0');
  next.schema_version = before.schema_version; assert.deepEqual(next, before);
});
test('new events use stable data-only defaults with no code or URLs', () => { const e = createStoryEvent(createBirthdayEpisode().chapters[0]); assert.equal(e.trigger.type, 'reach_x'); assert.equal(e.heal, 0); assert.equal(typeof e.text, 'string'); });
