export const TP_GEM_SLOTS = 10;

const TIMINGS = Object.freeze({
  standard: Object.freeze({ lead: 60, count: 520, settle: 180 }),
  fast: Object.freeze({ lead: 20, count: 190, settle: 70 }),
  reduced: Object.freeze({ lead: 20, count: 90, settle: 40 }),
});

export function statChangeTimings({ speed = 'standard', reducedMotion = false } = {}) {
  if (reducedMotion) return { ...TIMINGS.reduced };
  return { ...(speed === 'fast' ? TIMINGS.fast : TIMINGS.standard) };
}

export function tpGemStates(tp, slots = TP_GEM_SLOTS) {
  const safeSlots = Math.max(1, Math.floor(Number(slots) || TP_GEM_SLOTS));
  const value = Math.max(0, Math.min(safeSlots * 2, Math.floor(Number(tp) || 0)));
  if (value <= safeSlots) {
    return Array.from({ length: safeSlots }, (_, index) => index < value ? 'active' : 'empty');
  }
  const overcharged = value - safeSlots;
  return Array.from({ length: safeSlots }, (_, index) => index < overcharged ? 'overcharged' : 'active');
}

export function interpolatedStatValue(from, to, progress) {
  const start = Number(from) || 0;
  const end = Number(to) || 0;
  const bounded = Math.max(0, Math.min(1, Number(progress) || 0));
  return Math.round(start + (end - start) * bounded);
}

export function turnStartTpTransition(event) {
  if (event?.type !== 'turn-start') return null;
  const from = Number(event.tpBeforeModifiers);
  const to = Number(event.tp);
  const maxFrom = Number(event.maxTpBeforeModifiers);
  const maxTo = Number(event.maxTp);
  if (![from, to, maxFrom, maxTo].every(Number.isFinite)) return null;
  if (from === to && maxFrom === maxTo) return null;
  return { from, to, maxFrom, maxTo };
}
