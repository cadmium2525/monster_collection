import { el } from './dom.js';

const DURATION = Object.freeze({ standard: 1250, fast: 480, reduced: 650 });

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

export function turnTransitionDuration({ speed = 'standard', reducedMotion = false } = {}) {
  return reducedMotion ? DURATION.reduced : speed === 'fast' ? DURATION.fast : DURATION.standard;
}

export function turnTransitionModel({ humanTurn, turnNumber }) {
  const safeTurn = Math.max(1, Number(turnNumber) || 1);
  return {
    tone: humanTurn ? 'player' : 'enemy',
    title: humanTurn ? 'YOUR TURN' : 'ENEMY TURN',
    turnLabel: `TURN ${safeTurn}`,
    ariaLabel: `${humanTurn ? 'あなた' : '相手'}のターン ${safeTurn}`,
  };
}

export async function playTurnTransition({ humanTurn, turnNumber, speed = 'standard' } = {}) {
  if (typeof document === 'undefined') return;
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const duration = turnTransitionDuration({ speed, reducedMotion });
  const model = turnTransitionModel({ humanTurn, turnNumber });
  const overlay = el('div', {
    className: `turn-transition ${model.tone}${speed === 'fast' ? ' fast' : ''}${reducedMotion ? ' reduced-motion' : ''}`,
    attrs: {
      role: 'status',
      'aria-live': 'assertive',
      'aria-label': model.ariaLabel,
      style: `--turn-transition-duration:${duration}ms`,
    },
  }, [
    el('div', { className: 'turn-transition-shade', attrs: { 'aria-hidden': 'true' } }),
    el('div', { className: 'turn-transition-flare', attrs: { 'aria-hidden': 'true' } }),
    el('div', { className: 'turn-transition-sigil', attrs: { 'aria-hidden': 'true' } }, [
      el('i', { className: 'turn-sigil-ring ring-a' }),
      el('i', { className: 'turn-sigil-ring ring-b' }),
      el('i', { className: 'turn-sigil-ring ring-c' }),
      el('i', { className: 'turn-sigil-star' }),
      el('i', { className: 'turn-sigil-core' }),
    ]),
    el('header', { className: 'turn-transition-copy' }, [
      el('strong', { text: model.title }),
      el('span', { text: model.turnLabel }),
    ]),
  ]);

  document.body.append(overlay);
  await delay(duration);
  overlay.remove();
}
