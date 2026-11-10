/* Native landscape when allowed; rotated canvas with matching input otherwise. */
(() => {
  'use strict';
  const shell = document.getElementById('game-shell');
  const surface = document.getElementById('game-surface');
  const canvas = document.getElementById('canvas');
  const launch = document.getElementById('launch');
  const toggle = document.getElementById('fullscreen-toggle');
  const fullButton = document.getElementById('launch-fullscreen');
  const windowButton = document.getElementById('launch-windowed');
  const status = document.getElementById('loading-status');
  const progress = document.getElementById('loading-progress');
  const canFullscreen = () => Boolean((document.fullscreenEnabled && shell.requestFullscreen) || (document.webkitFullscreenEnabled && shell.webkitRequestFullscreen));
  const isFullscreen = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
  let began = false;
  let rotated = false;
  let geometry = '';
  let mouseOnCanvas = false;
  const forwarded = new WeakSet();

  function updateLayout() {
    const width = shell.clientWidth || innerWidth;
    const height = shell.clientHeight || innerHeight;
    rotated = began && height > width;
    surface.classList.toggle('rotated', rotated);
    const gameWidth = rotated ? height : width;
    const gameHeight = rotated ? width : height;
    surface.style.width = `${gameWidth}px`;
    surface.style.height = `${gameHeight}px`;
    // Resize policy 0: the shell owns the backing size, including DPR and rotation.
    const pixelWidth = Math.max(1, Math.round(gameWidth * (devicePixelRatio || 1)));
    const pixelHeight = Math.max(1, Math.round(gameHeight * (devicePixelRatio || 1)));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    toggle.hidden = !began || isFullscreen() || isStandalone() || !canFullscreen();
    const style = getComputedStyle(document.getElementById('safe-area-probe'));
    const physical = {
      left: parseFloat(style.paddingLeft) || 0, right: parseFloat(style.paddingRight) || 0,
      top: parseFloat(style.paddingTop) || 0, bottom: parseFloat(style.paddingBottom) || 0,
    };
    // CSS rotates clockwise: physical top becomes the game's left safe edge.
    window.myCartridgeSafeArea = rotated ? {
      left: physical.top, right: physical.bottom, top: physical.right, bottom: physical.left,
      width: gameWidth, height: gameHeight,
    } : { ...physical, width: gameWidth, height: gameHeight };
    const next = JSON.stringify(window.myCartridgeSafeArea) + rotated;
    if (next !== geometry) {
      geometry = next;
      if (window.myCartridgeOnLayout) window.myCartridgeOnLayout();
    }
  }

  // Godot normalizes client coordinates against the transformed bounding rectangle.
  // Feed the inverse rotation in that same rectangle; IDs and changed touch sets stay intact.
  function mapPoint(point, rect) {
    return {
      clientX: rect.left + (point.clientY - rect.top) / rect.height * rect.width,
      clientY: rect.top + (1 - (point.clientX - rect.left) / rect.width) * rect.height,
    };
  }
  function remap(event) {
    if (!rotated || forwarded.has(event)) return;
    if (!event.type.startsWith('touch')) {
      if (event.type === 'mousedown') mouseOnCanvas = event.target === canvas;
      if (event.target !== canvas && !mouseOnCanvas) return;
      if (event.type === 'mouseup') mouseOnCanvas = false;
    }
    const rect = canvas.getBoundingClientRect();
    let copy;
    if (event.type.startsWith('touch')) {
      copy = new Event(event.type, { bubbles: true, cancelable: true });
      for (const key of ['touches', 'targetTouches', 'changedTouches']) {
        Object.defineProperty(copy, key, { value: Array.from(event[key], touch => ({
          identifier: touch.identifier, target: canvas, ...mapPoint(touch, rect),
        })) });
      }
      for (const key of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) Object.defineProperty(copy, key, { value: event[key] });
    } else {
      const point = mapPoint(event, rect);
      const EventClass = event.type === 'pointermove' && window.PointerEvent ? PointerEvent : MouseEvent;
      copy = new EventClass(event.type, { bubbles: true, cancelable: true, ...point,
        button: event.button, buttons: event.buttons, pointerId: event.pointerId,
        pointerType: event.pointerType, pressure: event.pressure,
        altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey,
      });
      Object.defineProperty(copy, 'movementX', { value: event.movementY / rect.height * rect.width });
      Object.defineProperty(copy, 'movementY', { value: -event.movementX / rect.width * rect.height });
    }
    forwarded.add(copy);
    event.stopImmediatePropagation();
    if (event.cancelable) event.preventDefault();
    if (event.type === 'touchstart' || event.type === 'mousedown') canvas.focus({ preventScroll: true });
    canvas.dispatchEvent(copy);
  }
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) canvas.addEventListener(type, remap, { capture: true, passive: false });
  for (const type of ['mousedown', 'mouseup', 'pointermove']) window.addEventListener(type, remap, { capture: true, passive: false });

  async function requestLandscape() {
    try {
      if (canFullscreen() && !isFullscreen() && !isStandalone()) {
        if (shell.requestFullscreen) await shell.requestFullscreen({ navigationUI: 'hide' });
        else if (shell.webkitRequestFullscreen) await shell.webkitRequestFullscreen();
      }
    } catch (_) { /* Continue in the available viewport. */ }
    try {
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
    } catch (_) { /* CSS rotation remains active whenever the viewport is portrait. */ }
    updateLayout();
    canvas.focus({ preventScroll: true });
  }

  function begin(fullscreen) {
    began = true;
    launch.hidden = true;
    updateLayout();
    if (fullscreen) requestLandscape();
    else canvas.focus({ preventScroll: true });
  }

  fullButton.addEventListener('click', () => begin(true));
  windowButton.addEventListener('click', () => begin(false));
  toggle.addEventListener('click', requestLandscape);
  addEventListener('resize', updateLayout);
  addEventListener('orientationchange', updateLayout);
  document.addEventListener('fullscreenchange', updateLayout);
  document.addEventListener('webkitfullscreenchange', updateLayout);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', updateLayout);
  // Mobile browsers can hide/freeze a page without first blurring its canvas.
  // Stop owned touches and save while JavaScript is still allowed to run.
  const suspend = () => {
    mouseOnCanvas = false;
    if (window.myCartridgeOnSuspend) window.myCartridgeOnSuspend();
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });
  addEventListener('pagehide', suspend);
  document.getElementById('fullscreen-help').textContent = canFullscreen()
    ? '시작하면 전체화면과 가로 전환을 시도합니다. 지원되지 않으면 게임 화면을 가로로 맞춥니다.'
    : '가로 게임 화면으로 시작합니다. iPhone은 Safari의 공유 → 홈 화면에 추가로 주소줄 없이 실행할 수 있어요.';
  updateLayout();

  window.myCartridgeStudioPreview = typeof location !== 'undefined' && new URLSearchParams(location.search).get('studio-preview') === '1';
  let resolveImportReady;
  const importReady = new Promise(resolve => { resolveImportReady = resolve; });
  function importPack(pack, autoStart = false) {
    if (typeof window.myCartridgeImportPack !== 'function') throw new Error('게임 준비 후 다시 열어 주세요.');
    const raw = typeof pack === 'string' ? pack : JSON.stringify(pack);
    if (raw.length > 16000000) throw new Error('게임팩은 16 MB 이하여야 합니다.');
    window.myCartridgeImportPack(raw, autoStart);
    const result = JSON.parse(window.myCartridgeImportResult);
    if (result.ok && result.title) document.getElementById('launch-title').textContent = result.title;
    if (result.ok && autoStart) begin(false);
    return result;
  }
  let announced = false;
  function announceReady() {
    resolveImportReady();
    if (announced) return;
    announced = true;
    if (window.myCartridgeStudioPreview && window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'mc:ready' }, location.origin);
    }
  }
  addEventListener('message', event => {
    if (!window.myCartridgeStudioPreview || event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'mc:preview') return;
    try {
      const result = importPack(event.data.pack, true);
      window.parent.postMessage({ type: 'mc:preview-result', ...result }, location.origin);
    } catch (error) { window.parent.postMessage({ type: 'mc:preview-result', ok: false, errors: [error.message] }, location.origin); }
  });
  document.getElementById('launch-import').addEventListener('click', () => document.getElementById('pack-file').click());
  document.getElementById('pack-file').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 16000000) throw new Error('게임팩은 16 MB 이하여야 합니다.');
      const result = importPack(await file.text());
      if (!result.ok) throw new Error(result.errors.join(' / '));
      status.textContent = '맞춤 에피소드를 열었습니다. 게임 시작을 누르세요.';
    } catch (error) { status.textContent = error.message; }
    event.target.value = '';
  });

  const missing = Engine.getMissingFeatures({ threads: GODOT_THREADS_ENABLED });
  if (missing.length) {
    status.textContent = '이 브라우저에서 게임을 실행할 수 없습니다. Safari 또는 Chrome의 최신 버전에서 열어주세요.';
    progress.hidden = true;
    return;
  }
  const engine = new Engine(GODOT_CONFIG);
  engine.startGame({
    canvas,
    onProgress(current, total) {
      if (total > 0) {
        progress.max = total;
        progress.value = current;
        status.textContent = `게임을 불러오고 있어요… ${Math.min(100, Math.round(current / total * 100))}%`;
      }
    },
  }).then(async () => {
    const deadline = Date.now() + 30000;
    while (typeof window.myCartridgeImportPack !== 'function') {
      if (Date.now() > deadline) throw new Error('Game bridge did not initialize');
      await new Promise(resolve => setTimeout(resolve, 16));
    }
    announceReady();
    if (window.myCartridgeBundlePath === 'episode.json') {
      await importReady;
      const response = await fetch('episode.json');
      if (!response.ok) throw new Error('Bundled episode is missing');
      const result = importPack(await response.text());
      if (!result.ok) throw new Error(result.errors.join(' / '));
    }
    document.getElementById('launch-import').disabled = false;
    status.textContent = '준비됐어요. 화면을 눌러 시작하세요.';
    progress.hidden = true;
    fullButton.disabled = false;
    windowButton.disabled = false;
    updateLayout();
  }).catch(() => {
    status.textContent = '게임을 불러오지 못했습니다. 네트워크를 확인하고 새로고침해 주세요.';
    progress.hidden = true;
  });
})();
