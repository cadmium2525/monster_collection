const VIEWPORT_HEIGHT_PROPERTY = '--app-viewport-height';
const SETTLE_DELAYS = Object.freeze([80, 240, 700, 1500]);

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}
function isAppleMobile(windowRef) {
  const navigatorRef = windowRef?.navigator;
  const userAgent = String(navigatorRef?.userAgent ?? '');
  return /iPad|iPhone|iPod/.test(userAgent)
    || (navigatorRef?.platform === 'MacIntel' && finitePositive(navigatorRef?.maxTouchPoints) > 1);
}

function isStandalone(windowRef) {
  return windowRef?.navigator?.standalone === true
    || windowRef?.matchMedia?.('(display-mode: standalone)')?.matches === true;
}

function isLandscape(windowRef) {
  const mediaMatch = windowRef?.matchMedia?.('(orientation: landscape)')?.matches;
  if (typeof mediaMatch === 'boolean') return mediaMatch;
  return finitePositive(windowRef?.innerWidth) > finitePositive(windowRef?.innerHeight);
}

/**
 * iOSのホーム画面追加版では、横向き起動直後だけ innerHeight / 100dvh が
 * セーフエリア1つ分ほど短い値を返すことがある。通常ブラウザやPCの
 * リサイズ可能なPWAへ影響させないよう、画面寸法による補正はiOSの
 * standalone・横向きに限定する。
 */
export function measureAppViewportHeight({ windowRef = globalThis.window, documentRef = globalThis.document } = {}) {
  const candidates = [
    finitePositive(windowRef?.innerHeight),
    finitePositive(windowRef?.visualViewport?.height),
    finitePositive(documentRef?.documentElement?.clientHeight),
  ];

  if (isAppleMobile(windowRef) && isStandalone(windowRef) && isLandscape(windowRef)) {
    candidates.push(Math.min(
      finitePositive(windowRef?.screen?.width) || Number.POSITIVE_INFINITY,
      finitePositive(windowRef?.screen?.height) || Number.POSITIVE_INFINITY,
    ));
  }

  const measured = Math.max(...candidates.filter(Number.isFinite), 0);
  return measured > 0 ? Math.round(measured) : 0;
}

export function installAppViewportSync({
  windowRef = globalThis.window,
  documentRef = globalThis.document,
  settleDelays = SETTLE_DELAYS,
} = {}) {
  const rootStyle = documentRef?.documentElement?.style;
  if (!windowRef?.addEventListener || !rootStyle?.setProperty) return { sync() {}, dispose() {} };

  let animationFrame = null;
  let timers = [];
  let lastHeight = 0;

  const sync = () => {
    const height = measureAppViewportHeight({ windowRef, documentRef });
    if (!height || height === lastHeight) return height;
    lastHeight = height;
    rootStyle.setProperty(VIEWPORT_HEIGHT_PROPERTY, `${height}px`);
    return height;
  };

  const clearScheduled = () => {
    if (animationFrame !== null && windowRef.cancelAnimationFrame) windowRef.cancelAnimationFrame(animationFrame);
    animationFrame = null;
    timers.forEach((timer) => windowRef.clearTimeout(timer));
    timers = [];
  };

  const schedule = () => {
    clearScheduled();
    sync();
    if (windowRef.requestAnimationFrame) {
      animationFrame = windowRef.requestAnimationFrame(() => {
        animationFrame = null;
        sync();
      });
    }
    timers = settleDelays.map((delay) => windowRef.setTimeout(sync, delay));
  };

  const scheduleWhenVisible = () => {
    if (documentRef.visibilityState !== 'hidden') schedule();
  };
  const events = ['resize', 'orientationchange', 'pageshow'];
  events.forEach((eventName) => windowRef.addEventListener(eventName, schedule, { passive: true }));
  windowRef.visualViewport?.addEventListener?.('resize', schedule, { passive: true });
  documentRef.addEventListener?.('visibilitychange', scheduleWhenVisible);
  schedule();

  return {
    sync,
    dispose() {
      clearScheduled();
      events.forEach((eventName) => windowRef.removeEventListener(eventName, schedule));
      windowRef.visualViewport?.removeEventListener?.('resize', schedule);
      documentRef.removeEventListener?.('visibilitychange', scheduleWhenVisible);
    },
  };
}
