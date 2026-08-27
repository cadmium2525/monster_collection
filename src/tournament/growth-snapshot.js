import { normalizeGrowth } from '../battle/state.js';

export function normalizeTournamentGrowthSnapshot(cards, growth, masterIndex) {
  const source = growth && typeof growth === 'object' ? growth : {};
  const snapshot = {};
  for (const card of cards ?? []) {
    const definition = masterIndex.cards.get(card.masterId);
    if (definition?.kind !== 'monster') continue;
    snapshot[card.instanceId] = normalizeGrowth(source[card.instanceId], definition, masterIndex);
  }
  return snapshot;
}
