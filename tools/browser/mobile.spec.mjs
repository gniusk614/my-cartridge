import { test, expect } from '@playwright/test';

async function state(page) {
  return page.evaluate(() => {
    window.myCartridgeTestSnapshot();
    return JSON.parse(window.myCartridgeTestState);
  });
}

async function boot(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await expect(page.locator('#launch-windowed')).toBeEnabled({ timeout: 45_000 });
  await page.locator('#launch-windowed').tap();
  await page.waitForFunction(() => typeof window.myCartridgeTestSnapshot === 'function');
  expect((await state(page)).storage).toBe('user://mc_browser_tests');
  return errors;
}

async function screenPoint(page, point) {
  const snapshot = await state(page);
  return page.locator('#canvas').evaluate((canvas, { point, viewport }) => {
    const rect = canvas.getBoundingClientRect();
    const rotated = document.getElementById('game-surface').classList.contains('rotated');
    return rotated ? {
      x: rect.left + (1 - point[1] / viewport[1]) * rect.width,
      y: rect.top + point[0] / viewport[0] * rect.height,
    } : {
      x: rect.left + point[0] / viewport[0] * rect.width,
      y: rect.top + point[1] / viewport[1] * rect.height,
    };
  }, { point, viewport: snapshot.viewport });
}

async function tapMenu(page, text) {
  // Godot containers sort new controls at the end of the frame.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const button = (await state(page)).menu.find(item => item.text === text);
  expect(button, `menu button ${text}`).toBeTruthy();
  const point = await screenPoint(page, button.center);
  await page.touchscreen.tap(point.x, point.y);
}

async function start(page, resume = false) {
  await tapMenu(page, resume ? '시작 / 이어하기' : '새로 시작');
  await expect.poll(async () => (await state(page)).state).toBe('STAGE_INTRO');
  await tapMenu(page, '기억을 찾아 출발');
  await expect.poll(async () => (await state(page)).state).toBe('PLAYING');
}

async function fingers(page, browserName) {
  const contacts = new Map();
  const cdp = browserName === 'chromium' ? await page.context().newCDPSession(page) : null;
  async function send(type, id, point) {
    const changed = point ? { id, ...await screenPoint(page, point) } : contacts.get(id);
    if (type === 'touchEnd') contacts.delete(id);
    else contacts.set(id, changed);
    if (cdp) {
      // Chromium's default CDP path uses changed contacts, including touchEnd.
      // https://issues.chromium.org/issues/569778218
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [changed] });
    } else {
      // Playwright WebKit has no CDP multi-touch API. Menus still use real taps.
      await page.evaluate(({ type, active, changed }) => {
        const names = { touchStart: 'touchstart', touchMove: 'touchmove', touchEnd: 'touchend', touchCancel: 'touchcancel' };
        const touch = p => ({ identifier: p.id, clientX: p.x, clientY: p.y, target: canvas });
        const event = new Event(names[type], { bubbles: true, cancelable: true });
        for (const [key, value] of Object.entries({ touches: active, targetTouches: active, changedTouches: changed })) {
          Object.defineProperty(event, key, { value: value.map(touch) });
        }
        canvas.dispatchEvent(event);
      }, { type, active: [...contacts.values()], changed: [changed] });
    }
  }
  return {
    down: (id, point) => send('touchStart', id, point),
    move: (id, point) => send('touchMove', id, point),
    up: id => send('touchEnd', id),
    cancel: async () => {
      if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      else {
        const old = [...contacts.values()];
        await page.evaluate(points => {
          const event = new Event('touchcancel', { bubbles: true, cancelable: true });
          for (const [key, value] of Object.entries({ touches: [], targetTouches: [], changedTouches: points })) {
            Object.defineProperty(event, key, { value: value.map(p => ({ identifier: p.id, clientX: p.x, clientY: p.y })) });
          }
          canvas.dispatchEvent(event);
        }, old);
      }
      contacts.clear();
    },
  };
}

for (const portrait of [false, true]) {
  test(`${portrait ? 'rotated portrait' : 'landscape'}: analog speed, three fingers, cancel and resize`, async ({ page, browserName }) => {
    if (portrait) await page.setViewportSize({ width: 390, height: 844 });
    const errors = await boot(page);
    await start(page);
    const touch = await fingers(page, browserName);
    await touch.down(10, [65, 145]);
    await touch.move(10, [67, 146]);
    expect((await state(page)).movement).toEqual([0, 0]);
    await touch.move(10, [65 + 24 * 0.58, 145]);
    await expect.poll(async () => (await state(page)).player.velocity[0]).toBeCloseTo(40, 0);
    await touch.move(10, [165, 120]);
    await expect.poll(async () => Math.hypot(...(await state(page)).movement)).toBeCloseTo(1, 3);
    const buttons = (await state(page)).buttons;
    await touch.down(20, buttons.find(item => item.action === 'jump').center);
    await expect.poll(async () => (await state(page)).player.elevation).toBeGreaterThan(0);
    await touch.down(21, buttons.find(item => item.action === 'attack').center);
    await expect.poll(async () => (await state(page)).player.attack_clock).toBeGreaterThan(0);
    expect((await state(page)).contacts).toBe(2);
    await touch.up(10);
    await expect.poll(async () => (await state(page)).movement).toEqual([0, 0]);
    expect((await state(page)).contacts).toBe(2);
    await touch.cancel();
    await expect.poll(async () => (await state(page)).contacts).toBe(0);
    await expect.poll(async () => (await state(page)).player.attack_clock).toBe(0);
    await expect.poll(async () => (await state(page)).player.velocity).toEqual([0, 0]);
    // Rotate with a live contact: it must not become movement in the new frame.
    await touch.down(30, [65, 145]);
    await touch.move(30, [89, 145]);
    await page.setViewportSize(portrait ? { width: 844, height: 390 } : { width: 390, height: 844 });
    await expect.poll(async () => (await state(page)).stick_pointer).toBe(-1);
    expect((await state(page)).movement).toEqual([0, 0]);
    expect((await state(page)).state).toBe('PLAYING');
    await touch.cancel();
    const pause = await screenPoint(page, (await state(page)).pause);
    await page.touchscreen.tap(pause.x, pause.y);
    await expect.poll(async () => (await state(page)).state).toBe('PAUSED');
    await tapMenu(page, '계속하기');
    await expect.poll(async () => (await state(page)).state).toBe('PLAYING');
    expect(errors).toEqual([]);
  });
}

test('background/pagehide saves and clears held input; returning waits for continue', async ({ page, browserName }) => {
  const errors = await boot(page);
  await start(page);
  const touch = await fingers(page, browserName);
  for (const kind of ['visibilitychange', 'pagehide']) {
    await touch.down(1, [65, 145]);
    await touch.move(1, [89, 145]);
    await expect.poll(async () => (await state(page)).player.velocity[0]).toBeCloseTo(80, 1);
    await page.evaluate(kind => {
      if (kind === 'visibilitychange') {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
        delete document.hidden;
      } else window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    }, kind);
    await expect.poll(async () => (await state(page)).state).toBe('PAUSED');
    const paused = await state(page);
    expect(paused.movement).toEqual([0, 0]);
    expect(paused.stick_pointer).toBe(-1);
    expect(paused.progress.saved_at).not.toBe('');
    await touch.cancel();
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(200); // Observe multiple physics frames while paused.
    expect((await state(page)).player.position).toEqual(paused.player.position);
    expect((await state(page)).state).toBe('PAUSED');
    await tapMenu(page, '계속하기');
    await expect.poll(async () => (await state(page)).player.velocity).toEqual([0, 0]);
  }
  expect(errors).toEqual([]);
});

async function collectMemory(page) {
  // Observe actual game responses before releasing each native key. Short timed
  // presses can be missed when software WebGL stalls the browser's main thread.
  async function pulse(key, mode, before, sign = 0) {
    await page.keyboard.down(key);
    try {
      await page.waitForFunction(({ mode, before, sign }) => {
        window.myCartridgeTestSnapshot(); const s = JSON.parse(window.myCartridgeTestState);
        if (s.state !== 'PLAYING' || s.player.stun > 0) return true;
        if (mode === 'attack') return s.player.attack_id > before.player.attack_id;
        if (mode === 'interact') return s.state !== before.state;
        if (mode === 'turn') return s.player.facing === sign;
        return Math.hypot(s.player.position[0] - before.player.position[0], s.player.position[1] - before.player.position[1]) >= 5;
      }, { mode, before, sign }, { timeout: 5_000 });
    } finally { await page.keyboard.up(key); }
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect.poll(async () => (await state(page)).player.velocity).toEqual([0, 0]);
  }
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const s = await state(page);
    if (s.state === 'CLUE_REVEAL' && s.progress.collected_clue_ids.length) return s.progress;
    expect(s.state, 'combat bot stays alive and playing').toBe('PLAYING');
    if (s.player.stun > 0) { await expect.poll(async () => (await state(page)).player.stun).toBe(0); continue; }
    const hero = s.player.position;
    const enemy = s.enemies.sort((a, b) => Math.hypot(a.position[0] - hero[0], a.position[1] - hero[1]) - Math.hypot(b.position[0] - hero[0], b.position[1] - hero[1]))[0];
    const clue = s.clues[0], dx = (enemy?.position[0] ?? clue?.position.x ?? 909) - hero[0];
    // Keep a clear ground lane; chasing a moving enemy's small depth offset can
    // send a delayed key release into the upper platforms on slow CI machines.
    const dy = (enemy ? 130 : clue?.position.y ?? 130) - hero[1];
    if (enemy && Math.abs(dx) < 27 && Math.abs(enemy.position[1] - hero[1]) < 11) {
      const sign = dx >= 0 ? 1 : -1;
      if (s.player.facing !== sign) await pulse(sign > 0 ? 'ArrowRight' : 'ArrowLeft', 'turn', s, sign);
      else await pulse('KeyJ', 'attack', s);
    } else if (clue && Math.hypot(dx, dy) < 23) await pulse('KeyE', 'interact', s);
    else {
      const key = Math.abs(dy) > 5 ? (dy > 0 ? 'ArrowDown' : 'ArrowUp') : dx > 0 ? 'ArrowRight' : 'ArrowLeft';
      await pulse(key, 'move', s);
    }
  }
  throw new Error('Combat bot did not reach the memory within 120 seconds');
}

async function diskSaves(page) {
  return page.evaluate(async () => {
    const databases = await indexedDB.databases();
    const saves = [];
    for (const entry of databases) {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(entry.name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        if (!db.objectStoreNames.contains('FILE_DATA')) continue;
        const records = await new Promise((resolve, reject) => {
          const request = db.transaction('FILE_DATA', 'readonly').objectStore('FILE_DATA').getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        for (const record of records) {
          if (!record.contents) continue;
          try {
            const data = JSON.parse(new TextDecoder().decode(record.contents));
            if (data.pack_id) saves.push(data);
          } catch { /* Directories and logs are not save files. */ }
        }
      } finally { db.close(); }
    }
    return saves;
  });
}

test('earned combat and memory progress survives reload and a full browser restart', async ({ playwright, browserName }, testInfo) => {
  const type = playwright[browserName];
  const profile = testInfo.outputPath('isolated-profile');
  // Only BrowserContext launch options; test runner options belong outside this call.
  const { launchOptions = {} } = testInfo.project.use;
  const launch = () => type.launchPersistentContext(profile, {
    ...launchOptions, headless: true, viewport: { width: 844, height: 390 },
    deviceScaleFactor: 2, hasTouch: true, isMobile: true, baseURL: 'http://127.0.0.1:8766',
  });
  let context = await launch();
  try {
    let page = context.pages()[0];
    const errors = await boot(page);
    if (browserName === 'chromium' && process.env.MC_TEST_CPU_RATE) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.MC_TEST_CPU_RATE) });
    }
    await start(page);
    const earned = await collectMemory(page);
    expect(earned.defeated_actor_ids).toHaveLength(2);
    expect(earned.collected_clue_ids).toEqual(['clue_cafe']);
    await expect.poll(async () => (await diskSaves(page)).find(save => save.pack_id === earned.pack_id)?.collected_clue_ids, { timeout: 15_000 }).toEqual(earned.collected_clue_ids);
    await page.reload();
    await expect(page.locator('#launch-windowed')).toBeEnabled({ timeout: 45_000 });
    await page.locator('#launch-windowed').tap();
    await start(page, true);
    let restored = (await state(page)).progress;
    for (const key of ['collected_clue_ids', 'defeated_actor_ids', 'completed_objective_ids', 'hp']) expect(restored[key]).toEqual(earned[key]);
    expect((await state(page)).clues).toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
    context = await launch();
    page = context.pages()[0];
    const reopenedErrors = await boot(page);
    await start(page, true);
    restored = (await state(page)).progress;
    for (const key of ['collected_clue_ids', 'defeated_actor_ids', 'completed_objective_ids', 'hp']) expect(restored[key]).toEqual(earned[key]);
    expect((await state(page)).complete).toBe(true);
    expect(reopenedErrors).toEqual([]);
  } catch (error) {
    const page = context.pages()[0];
    if (page && !page.isClosed()) {
      await testInfo.attach('restart-failure-screen', { body: await page.screenshot(), contentType: 'image/png' }).catch(() => {});
      await state(page).then(snapshot => testInfo.attach('restart-failure-state', {
        body: JSON.stringify(snapshot, null, 2), contentType: 'application/json',
      })).catch(() => {});
    }
    throw error;
  } finally { await context.close(); }
});


test('Pages release does not expose the test probe, even with a URL flag', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:8767/?browser_test=1');
  await expect(page.locator('#launch-windowed')).toBeEnabled({ timeout: 45_000 });
  await page.locator('#launch-windowed').tap();
  await page.waitForFunction(() => typeof window.myCartridgeOnLayout === 'function');
  expect(await page.evaluate(() => typeof window.myCartridgeTestSnapshot)).toBe('undefined');
  expect(await page.evaluate(() => typeof window.myCartridgeTestState)).toBe('undefined');
  expect(errors).toEqual([]);
});
