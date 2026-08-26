import { el } from './dom.js';

const DURATION = Object.freeze({ standard: 1950, fast: 760, reduced: 620 });

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

export function fusionUnlockDuration({ speed = 'standard', reducedMotion = false } = {}) {
  return reducedMotion ? DURATION.reduced : speed === 'fast' ? DURATION.fast : DURATION.standard;
}

export async function playFusionUnlockAnimation({ playerName, speed = 'standard' } = {}) {
  if (typeof document === 'undefined') return;
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const duration = fusionUnlockDuration({ speed, reducedMotion });
  const overlay = el('div', {
    className: `fusion-unlock ${speed === 'fast' ? 'fast' : ''} ${reducedMotion ? 'reduced-motion' : ''}`,
    attrs: {
      role: 'status',
      'aria-live': 'assertive',
      'aria-label': `${playerName ?? '後攻プレイヤー'}の合体が解禁されました`,
      style: `--unlock-duration:${duration}ms`,
    },
  }, [
    el('div', { className: 'fusion-unlock-backdrop' }),
    el('div', { className: 'fusion-unlock-lines', attrs: { 'aria-hidden': 'true' } }),
    el('div', { className: 'fusion-unlock-sigil', attrs: { 'aria-hidden': 'true' } }, [
      el('i', { className: 'unlock-ring unlock-ring-outer' }),
      el('i', { className: 'unlock-ring unlock-ring-middle' }),
      el('i', { className: 'unlock-ring unlock-ring-inner' }),
      el('span', { className: 'unlock-card-mark unlock-card-left' }),
      el('span', { className: 'unlock-card-mark unlock-card-right' }),
      el('b', { text: '✦' }),
    ]),
    el('header', { className: 'fusion-unlock-title' }, [
      el('small', { text: 'SECOND PLAYER · TURN 5' }),
      el('strong', { text: 'FUSION UNLOCKED' }),
      el('span', { text: '合 体 解 禁' }),
    ]),
    el('footer', { className: 'fusion-unlock-copy' }, [
      el('strong', { text: playerName ?? '後攻プレイヤー' }),
      el('span', { text: '場のメインモンスターと手札の素材を合体できます' }),
    ]),
  ]);

  document.body.append(overlay);
  await delay(duration);
  overlay.remove();
}
