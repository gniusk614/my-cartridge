import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../game/web/static/viewport.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

async function boot({ fullscreen = true, fullscreenAllowed = true, rejectFullscreen = false, portrait = false, standalone = false, loadFails = false, rejectLock = false, missing = [] } = {}) {
  const nodes = new Map();
  const events = {};
  const calls = [];
  const element = id => {
    if (!nodes.has(id)) nodes.set(id, {
      hidden: false, disabled: true, textContent: '', clientWidth: 844, clientHeight: 390,
      style: {}, classes: new Set(), forwarded: [],
      classList: { toggle(name, active) { element(id).classes[active ? 'add' : 'delete'](name); } },
      getBoundingClientRect() { return { left: 0, top: 0, width: context.innerWidth, height: context.innerHeight }; },
      dispatchEvent(event) { this.forwarded.push(event); this.events[event.type]?.(event); },
      events: {}, addEventListener(name, fn) { this.events[name] = fn; }, focus() {},
    });
    return nodes.get(id);
  };
  const document = {
    fullscreenEnabled: fullscreen && fullscreenAllowed, fullscreenElement: null, getElementById: element,
    addEventListener(name, fn) { events[name] = fn; },
  };
  const shell = element('game-shell');
  shell.clientWidth = portrait ? 390 : 844;
  shell.clientHeight = portrait ? 844 : 390;
  if (fullscreen) shell.requestFullscreen = async () => {
    calls.push('fullscreen');
    if (rejectFullscreen) throw new Error('denied');
    document.fullscreenElement = shell;
  };
  class BrowserEvent {
    constructor(type, options = {}) { this.type = type; Object.assign(this, options); }
    stopImmediatePropagation() { this.stopped = true; }
    preventDefault() { this.prevented = true; }
  }
  const context = {
    Event: BrowserEvent, MouseEvent: BrowserEvent, PointerEvent: BrowserEvent, devicePixelRatio: 2,
    document, navigator: { standalone }, GODOT_CONFIG: {}, GODOT_THREADS_ENABLED: false,
    innerWidth: portrait ? 390 : 844, innerHeight: portrait ? 844 : 390,
    screen: { orientation: { lock: async type => { calls.push(`lock:${type}`); if (rejectLock) throw new Error("denied"); } } },
    getComputedStyle: () => ({ paddingLeft: '47px', paddingRight: '47px', paddingTop: '0px', paddingBottom: '34px' }),
    matchMedia: () => ({ matches: standalone }),
    addEventListener(name, fn) { events[name] = fn; },
    Engine: class {
      static getMissingFeatures() { return missing; }
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

test('unsupported iPhone fullscreen starts a rotated landscape surface', async () => {
  const page = await boot({ fullscreen: false, portrait: true });
  page.element('launch-fullscreen').events.click();
  await flush();
  assert.equal(page.element('launch').hidden, true);
  assert.ok(page.element('game-surface').classes.has('rotated'));
  assert.match(page.element('fullscreen-help').textContent, /홈 화면에 추가/);
  page.context.innerWidth = page.element('game-shell').clientWidth = 844;
  page.context.innerHeight = page.element('game-shell').clientHeight = 390;
  page.events.resize();
  assert.equal(page.element('game-surface').classes.has('rotated'), false);
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

test('portrait changes clear held input through layout callback without a blocking screen', async () => {
  const page = await boot();
  let layouts = 0;
  page.context.myCartridgeOnLayout = () => layouts++;
  page.element('launch-windowed').events.click();
  page.context.innerWidth = page.element('game-shell').clientWidth = 390;
  page.context.innerHeight = page.element('game-shell').clientHeight = 844;
  page.events.resize();
  assert.equal(layouts, 1);
  assert.ok(page.element('game-surface').classes.has('rotated'));
  assert.equal(page.element('canvas').width, 1688);
  assert.equal(page.element('canvas').height, 780);
  assert.equal(page.context.myCartridgeSafeArea.width, 844);
  assert.equal(page.context.myCartridgeSafeArea.left, 0);
  assert.equal(page.context.myCartridgeSafeArea.right, 34);
  assert.equal(page.context.myCartridgeSafeArea.top, 47);
  assert.equal(page.context.myCartridgeSafeArea.bottom, 47);
  page.events.resize();
  assert.equal(layouts, 1, 'unchanged geometry does not clear input again');
});

test('orientation rejection still starts and rotates the game', async () => {
  const page = await boot({ rejectFullscreen: true, rejectLock: true, portrait: true });
  page.element('launch-fullscreen').events.click();
  await flush();
  assert.equal(page.element('launch').hidden, true);
  assert.ok(page.element('game-surface').classes.has('rotated'));
});

test('missing browser features keep start disabled', async () => {
  const page = await boot({ missing: ['WebGL2'] });
  assert.equal(page.element('launch-fullscreen').disabled, true);
  assert.match(page.element('loading-status').textContent, /실행할 수 없습니다/);
});

function touchEvent(type, points) {
  return { type, cancelable: true, touches: points, targetTouches: points, changedTouches: points,
    stopImmediatePropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; } };
}

test('rotated multitouch maps both axes once and preserves each identifier on move and cancel', async () => {
  const page = await boot({ fullscreen: false, portrait: true });
  page.element('launch-windowed').events.click();
  const canvas = page.element('canvas');
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
    const event = touchEvent(type, [{ identifier: 7, clientX: 390 * 0.8, clientY: 844 * 0.1 }, { identifier: 19, clientX: 390 * 0.2, clientY: 844 * 0.9 }]);
    canvas.events[type](event);
    assert.ok(event.stopped && event.prevented);
    const mapped = canvas.forwarded.at(-1).changedTouches;
    assert.deepEqual(Array.from(mapped, p => p.identifier), [7, 19]);
    assert.ok(Math.abs(mapped[0].clientX / 390 - 0.1) < 0.001);
    assert.ok(Math.abs(mapped[0].clientY / 844 - 0.2) < 0.001);
    assert.ok(Math.abs(mapped[1].clientX / 390 - 0.9) < 0.001);
    assert.ok(Math.abs(mapped[1].clientY / 844 - 0.8) < 0.001);
  }
  assert.equal(canvas.forwarded.length, 4, 'forwarded events are never mapped recursively');
});

test('landscape input passes through without synthetic events', async () => {
  const page = await boot();
  page.element('launch-windowed').events.click();
  const event = touchEvent('touchmove', [{ identifier: 1, clientX: 100, clientY: 200 }]);
  page.element('canvas').events.touchmove(event);
  assert.equal(event.stopped, undefined);
  assert.equal(page.element('canvas').forwarded.length, 0);
});

test('rotated mouse input maps position and relative movement for menus', async () => {
  const page = await boot({ portrait: true });
  page.element('launch-windowed').events.click();
  const canvas = page.element('canvas');
  const event = { type: 'pointermove', target: canvas, clientX: 195, clientY: 211, movementX: 10, movementY: 20, buttons: 1,
    stopImmediatePropagation() {}, preventDefault() {} };
  page.events.pointermove(event);
  const mapped = canvas.forwarded[0];
  assert.equal(mapped.clientX, 97.5);
  assert.equal(mapped.clientY, 422);
  assert.equal(mapped.movementX, 20 / 844 * 390);
  assert.equal(mapped.movementY, -10 / 390 * 844);
});

test('HTML removes the rotate-device blocker and exports shell-owned canvas sizing', () => {
  const html = readFileSync(new URL('../game/web/shell.html', import.meta.url), 'utf8');
  const preset = readFileSync(new URL('../game/export_presets.cfg', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /rotate-screen|휴대폰을 가로로 돌려주세요/);
  assert.match(preset, /html\/canvas_resize_policy=0/);
});

test('rotated canvas does not intercept fullscreen overlay mouse gestures', async () => {
  const page = await boot({ portrait: true });
  page.element('launch-windowed').events.click();
  const event = { type: 'mousedown', target: page.element('fullscreen-toggle'), buttons: 1,
    stopImmediatePropagation() { throw new Error('overlay gesture intercepted'); } };
  page.events.mousedown(event);
  assert.equal(page.element('canvas').forwarded.length, 0);
});


test('hidden document and pagehide suspend once per event without auto resume', async () => {
  const page = await boot();
  let suspends = 0;
  page.context.myCartridgeOnSuspend = () => suspends++;
  page.document.hidden = false;
  page.events.visibilitychange();
  assert.equal(suspends, 0);
  page.document.hidden = true;
  page.events.visibilitychange();
  assert.equal(suspends, 1);
  page.events.pagehide();
  assert.equal(suspends, 2);
  page.document.hidden = false;
  page.events.visibilitychange();
  assert.equal(suspends, 2);
});

test('suspending before engine callbacks are ready is harmless', async () => {
  const page = await boot();
  page.document.hidden = true;
  assert.doesNotThrow(() => page.events.visibilitychange());
  assert.doesNotThrow(() => page.events.pagehide());
});
