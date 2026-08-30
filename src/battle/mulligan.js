import { RULES } from './rules.js';

export function automaticMulliganIds(player, masterIndex) {
  const maxExchange = player.isFirst ? RULES.firstMulliganMax : RULES.secondMulliganMax;
  const entries = player.hand.map((card) => ({ card, definition: masterIndex.cards.get(card.masterId) }));
  const monsters = entries
    .filter(({ definition }) => definition?.kind === 'monster')
    .sort((a, b) => (a.definition.summonTp ?? 0) - (b.definition.summonTp ?? 0));

  if (!monsters.length) return entries.slice(0, maxExchange).map(({ card }) => card.instanceId);

  const keptMonsterIds = new Set(monsters.slice(0, 2).map(({ card }) => card.instanceId));
  return entries
    .filter(({ card, definition }) => {
      if (definition?.kind === 'monster') return !keptMonsterIds.has(card.instanceId);
      return Number(definition?.tp) >= 4;
    })
    .slice(0, maxExchange)
    .map(({ card }) => card.instanceId);
}
