import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../game/web/static/viewport.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

async function boot({ fullscreen = true, fullscreenAllowed = true, rejectFullscreen = false, portrait = false, standalone = false, loadFails = false } = {}) {
  const nodes = new Map();
  const events = {};
  const calls = [];
  const element = id => {
    if (!nodes.has(id)) nodes.set(id, {
      hidden: false, disabled: true, textContent: '', clientWidth: 844, clientHeight: 390,
      events: {}, addEventListener(name, fn) { this.events[name] = fn; }, focus() {},
    });
    return nodes.get(id);
  };
  const document = {
    fullscreenEnabled: fullscreen && fullscreenAllowed, fullscreenElement: null, getElementById: element,
    addEventListener(name, fn) { events[name] = fn; },
  };
  const shell = element('game-shell');
  if (fullscreen) shell.requestFullscreen = async () => {
    calls.push('fullscreen');
    if (rejectFullscreen) throw new Error('denied');
    document.fullscreenElement = shell;
  };
  const context = {
    document, navigator: { standalone }, GODOT_CONFIG: {}, GODOT_THREADS_ENABLED: false,
    innerWidth: portrait ? 390 : 844, innerHeight: portrait ? 844 : 390,
    screen: { orientation: { lock: async type => { calls.push(`lock:${type}`); } } },
    getComputedStyle: () => ({ paddingLeft: '47px', paddingRight: '47px', paddingTop: '0px', paddingBottom: '34px' }),
    matchMedia: () => ({ matches: standalone }),
    addEventListener(name, fn) { events[name] = fn; },
    Engine: class {
      static getMissingFeatures() { return []; }
      startGame() { return loadFails ? Promise.reject(new Error('network')) : Promise.resolve(); }
    },
  };
  context.window = context;
  runInNewContext(source, context);
  await flush();
  return { element, calls, events, context, document };
}

test('fullscreen requires a start gesture and locks orientation after entering', async () => {
  const page = await boot();
  assert.deepEqual(page.calls, []);
  assert.equal(page.element('launch-fullscreen').disabled, false);
  page.element('launch-fullscreen').events.click();
  await flush();
  assert.deepEqual(page.calls, ['fullscreen', 'lock:landscape']);
  assert.equal(page.element('launch').hidden, true);
  assert.equal(page.element('fullscreen-toggle').hidden, true);
});

test('unsupported iPhone fullscreen leaves manual rotation and home-screen guidance usable', async () => {
  const page = await boot({ fullscreen: false, portrait: true });
  page.element('launch-fullscreen').events.click();
  await flush();
  assert.equal(page.element('launch').hidden, true);
  assert.equal(page.element('rotate-screen').hidden, false);
  assert.match(page.element('fullscreen-help').textContent, /홈 화면에 추가/);
  page.context.innerWidth = 844;
  page.context.innerHeight = 390;
  page.events.resize();
  assert.equal(page.element('rotate-screen').hidden, true);
  assert.equal(page.context.myCartridgeSafeArea.left, 47);
});

test('fullscreen rejection permits playing and offers retry', async () => {
  const page = await boot({ rejectFullscreen: true });
  page.element('launch-fullscreen').events.click();
  await flush();
  assert.equal(page.element('launch').hidden, true);
  assert.equal(page.element('fullscreen-toggle').hidden, false);
});

test('windowed start never invokes fullscreen', async () => {
  const page = await boot();
  page.element('launch-windowed').events.click();
  assert.deepEqual(page.calls, []);
  assert.equal(page.element('launch').hidden, true);
});

test('installed web app starts without another fullscreen request', async () => {
  const page = await boot({ standalone: true });
  page.element('launch-fullscreen').events.click();
  await flush();
  assert.equal(page.calls.includes('fullscreen'), false);
  assert.equal(page.element('fullscreen-toggle').hidden, true);
});

test('network failure keeps start disabled and explains retry', async () => {
  const page = await boot({ loadFails: true });
  assert.equal(page.element('launch-fullscreen').disabled, true);
  assert.match(page.element('loading-status').textContent, /새로고침/);
});

test('an exposed fullscreen method with disabled capability uses the supported fallback', async () => {
  const page = await boot({ fullscreenAllowed: false });
  page.element('launch-fullscreen').events.click();
  await flush();
  assert.equal(page.calls.includes('fullscreen'), false);
  assert.match(page.element('fullscreen-help').textContent, /홈 화면에 추가/);
});

test('rotating to portrait notifies the game to pause behind the guidance', async () => {
  const page = await boot();
  let pauses = 0;
  page.context.myCartridgeOnPortrait = () => pauses++;
  page.element('launch-windowed').events.click();
  page.context.innerWidth = 390;
  page.context.innerHeight = 844;
  page.events.resize();
  assert.ok(pauses > 0);
  assert.equal(page.element('rotate-screen').hidden, false);
});
