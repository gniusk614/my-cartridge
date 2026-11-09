/* Fullscreen is always requested from an explicit user gesture. */
(() => {
  'use strict';
  const shell = document.getElementById('game-shell');
  const canvas = document.getElementById('canvas');
  const launch = document.getElementById('launch');
  const rotate = document.getElementById('rotate-screen');
  const toggle = document.getElementById('fullscreen-toggle');
  const fullButton = document.getElementById('launch-fullscreen');
  const windowButton = document.getElementById('launch-windowed');
  const status = document.getElementById('loading-status');
  const progress = document.getElementById('loading-progress');
  const canFullscreen = () => Boolean((document.fullscreenEnabled && shell.requestFullscreen) || (document.webkitFullscreenEnabled && shell.webkitRequestFullscreen));
  const isFullscreen = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
  const homeHelp = 'iPhone은 Safari의 공유 → 홈 화면에 추가로 실행하면 주소줄 없이 플레이할 수 있어요. 가로 방향 잠금도 해제해 주세요.';
  let began = false;

  function updateLayout() {
    const portrait = innerHeight > innerWidth;
    rotate.hidden = !began || !portrait;
    if (began && portrait && window.myCartridgeOnPortrait) window.myCartridgeOnPortrait();
    toggle.hidden = !began || portrait || isFullscreen() || isStandalone() || !canFullscreen();
    const style = getComputedStyle(document.getElementById('safe-area-probe'));
    window.myCartridgeSafeArea = {
      left: parseFloat(style.paddingLeft) || 0, right: parseFloat(style.paddingRight) || 0,
      top: parseFloat(style.paddingTop) || 0, bottom: parseFloat(style.paddingBottom) || 0,
      width: shell.clientWidth, height: shell.clientHeight,
    };
  }

  async function requestLandscape() {
    try {
      if (canFullscreen() && !isFullscreen() && !isStandalone()) {
        if (shell.requestFullscreen) await shell.requestFullscreen({ navigationUI: 'hide' });
        else if (shell.webkitRequestFullscreen) await shell.webkitRequestFullscreen();
      }
    } catch (_) { /* The windowed and home-screen routes remain available. */ }
    try {
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
    } catch (_) { /* Manual device rotation is required on unsupported browsers. */ }
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
  document.getElementById('rotate-fullscreen').addEventListener('click', requestLandscape);
  toggle.addEventListener('click', requestLandscape);
  addEventListener('resize', updateLayout);
  addEventListener('orientationchange', updateLayout);
  document.addEventListener('fullscreenchange', updateLayout);
  document.addEventListener('webkitfullscreenchange', updateLayout);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', updateLayout);
  document.getElementById('fullscreen-help').textContent = canFullscreen() ? '전체화면을 나갔다면 화면 위의 전체화면 버튼으로 다시 전환할 수 있어요.' : homeHelp;
  document.getElementById('rotate-help').textContent = canFullscreen() ? '자동으로 전환되지 않으면 기기를 직접 가로로 돌려주세요.' : homeHelp;
  updateLayout();

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
  }).then(() => {
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
