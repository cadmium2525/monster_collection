const TIMINGS = Object.freeze({
  standard: Object.freeze({ lead: 90, deal: 235, settle: 130 }),
  fast: Object.freeze({ lead: 45, deal: 115, settle: 65 }),
  reduced: Object.freeze({ lead: 30, deal: 80, settle: 40 }),
});

export function turnDrawTimings({ speed = 'standard', reducedMotion = false } = {}) {
  if (reducedMotion) return TIMINGS.reduced;
  return speed === 'fast' ? TIMINGS.fast : TIMINGS.standard;
}

export function normalTurnDrawCards({
  action,
  logs = [],
  currentPlayerId,
  humanPlayerId,
  beforeHandIds = [],
  hand = [],
} = {}) {
  if (action?.type !== 'end-turn' || currentPlayerId !== humanPlayerId) return [];
  const drawn = logs
    .filter((event) => event.type === 'draw' && event.playerId === humanPlayerId)
    .reduce((total, event) => total + Math.max(0, Number(event.drawn) || 0), 0);
  if (!drawn) return [];
  const known = beforeHandIds instanceof Set ? beforeHandIds : new Set(beforeHandIds);
  return hand.filter((card) => !known.has(card.instanceId)).slice(0, drawn);
}
