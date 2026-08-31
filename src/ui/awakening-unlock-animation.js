import { el } from './dom.js';

const DURATION = Object.freeze({ standard: 2350, fast: 880, reduced: 720 });

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

export function awakeningUnlockDuration({ speed = 'standard', reducedMotion = false } = {}) {
  return reducedMotion ? DURATION.reduced : speed === 'fast' ? DURATION.fast : DURATION.standard;
}

export async function playAwakeningUnlockAnimation({ playerName, speed = 'standard' } = {}) {
  if (typeof document === 'undefined') return;
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const duration = awakeningUnlockDuration({ speed, reducedMotion });
  const overlay = el('div', {
    className: `awakening-unlock${speed === 'fast' ? ' fast' : ''}${reducedMotion ? ' reduced-motion' : ''}`,
    attrs: {
      role: 'status',
      'aria-live': 'assertive',
      'aria-label': `${playerName ?? '後攻プレイヤー'}の覚醒が解禁されました`,
      style: `--awakening-unlock-duration:${duration}ms`,
    },
  }, [
    el('div', { className: 'awakening-unlock-backdrop' }),
    el('div', { className: 'awakening-unlock-rays', attrs: { 'aria-hidden': 'true' } }),
    el('div', { className: 'awakening-unlock-particles', attrs: { 'aria-hidden': 'true' } },
      Array.from({ length: 18 }, (_, index) => el('i', { attrs: { style: `--i:${index};--delay:${index * 27}ms` } }))),
    el('div', { className: 'awakening-unlock-sigil', attrs: { 'aria-hidden': 'true' } }, [
      el('i', { className: 'awakening-ring ring-a' }),
      el('i', { className: 'awakening-ring ring-b' }),
      el('i', { className: 'awakening-ring ring-c' }),
      el('i', { className: 'awakening-rune-cross' }),
      el('b', { text: '醒' }),
    ]),
    el('header', { className: 'awakening-unlock-title' }, [
      el('small', { text: 'SECOND PLAYER · TURN 10' }),
      el('strong', { text: 'AWAKENING UNLOCKED' }),
      el('span', { text: '覚 醒 解 禁' }),
    ]),
    el('footer', { className: 'awakening-unlock-copy' }, [
      el('strong', { text: playerName ?? '後攻プレイヤー' }),
      el('span', { text: '召喚酔いしていない別の味方1体を墓地へ送り、真の能力を開花できます' }),
    ]),
  ]);

  document.body.append(overlay);
  await delay(duration);
  overlay.remove();
}

