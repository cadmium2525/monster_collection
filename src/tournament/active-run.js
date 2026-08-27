const ACTIVE_RUN_PHASES = new Set(['tournament', 'battle', 'reward']);
const REWARD_STATUSES = new Set(['active', 'won', 'champion']);

export function activeTournamentState(activeRun) {
  if (!activeRun || !ACTIVE_RUN_PHASES.has(activeRun.phase)) return null;
  const state = activeRun.tournament?.state;
  if (!state) return null;
  const resumable = activeRun.phase === 'reward'
    ? REWARD_STATUSES.has(state.status)
    : state.status === 'active';
  return resumable ? state : null;
}

export function activeRunDeckId(activeRun) {
  const deckId = activeTournamentState(activeRun)?.playerDeck?.deckId;
  return deckId == null || String(deckId).trim() === '' ? null : String(deckId);
}

export function isDeckLockedByActiveRun(activeRun, deckId) {
  const activeDeckId = activeRunDeckId(activeRun);
  return activeDeckId !== null && activeDeckId === String(deckId);
}
