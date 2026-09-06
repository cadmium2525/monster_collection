import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installAppViewportSync, measureAppViewportHeight } from '../../src/ui/app-viewport.js';

function fakeWindow(overrides = {}) {
  return {
    innerWidth: 844,
    innerHeight: 369,
    screen: { width: 390, height: 844 },
    navigator: { userAgent: 'Mozilla/5.0 (iPhone)', standalone: true },
    matchMedia: (query) => ({ matches: query.includes('standalone') || query.includes('landscape') }),
    ...overrides,
  };
}

test('iPhone standalone landscape corrects a stale short startup viewport from screen dimensions', () => {
  const height = measureAppViewportHeight({
    windowRef: fakeWindow(),
    documentRef: { documentElement: { clientHeight: 369 } },
  });
  assert.equal(height, 390);
});

test('regular browsers do not expand a resizable window to the physical screen height', () => {
  const height = measureAppViewportHeight({
    windowRef: fakeWindow({
      navigator: { userAgent: 'Mozilla/5.0 (Macintosh)', standalone: false },
      matchMedia: () => ({ matches: false }),
      innerWidth: 900,
      innerHeight: 610,
      screen: { width: 1440, height: 900 },
    }),
    documentRef: { documentElement: { clientHeight: 610 } },
  });
  assert.equal(height, 610);
});

test('portrait iPhone keeps the live viewport so the orientation warning is not oversized', () => {
  const height = measureAppViewportHeight({
    windowRef: fakeWindow({
      innerWidth: 390,
      innerHeight: 760,
      matchMedia: (query) => ({ matches: query.includes('standalone') }),
    }),
    documentRef: { documentElement: { clientHeight: 760 } },
  });
  assert.equal(height, 760);
});

test('viewport sync publishes a stable CSS height immediately and after startup settling', () => {
  const values = [];
  const listeners = new Map();
  const windowRef = fakeWindow({
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name) => listeners.delete(name),
    setTimeout: (callback) => { callback(); return 1; },
    clearTimeout() {},
    requestAnimationFrame: (callback) => { callback(); return 1; },
    cancelAnimationFrame() {},
  });
  const documentRef = {
    visibilityState: 'visible',
    documentElement: {
      clientHeight: 369,
      style: { setProperty: (name, value) => values.push([name, value]) },
    },
    addEventListener: (name, listener) => listeners.set(`document:${name}`, listener),
    removeEventListener: (name) => listeners.delete(`document:${name}`),
  };

  const controller = installAppViewportSync({ windowRef, documentRef, settleDelays: [1] });
  assert.deepEqual(values, [['--app-viewport-height', '390px']]);
  assert.ok(listeners.has('orientationchange'));
  assert.ok(listeners.has('pageshow'));
  controller.dispose();
});

test('home lobby uses the synchronized app viewport height instead of raw 100dvh', () => {
  const css = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  for (const selector of ['body:has(.home-lobby)', '.app-shell:has(> .home-lobby)', '#app:has(.home-lobby)', '.home-screen.home-lobby']) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(css, new RegExp(`${escaped}\\s*\\{[^}]*height:var\\(--app-viewport-height,100dvh\\)`, 's'));
  }
});
