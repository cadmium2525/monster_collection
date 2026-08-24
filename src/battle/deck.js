import { COPY_LIMITS, RULES, TOURNAMENTS } from './rules.js';

export function normalizeDeckCards(cards, deckId = 'deck') {
  return cards.map((entry, index) => typeof entry === 'string'
    ? { instanceId: `${deckId}-card-${String(index + 1).padStart(2, '0')}`, masterId: entry }
    : { instanceId: entry.instanceId ?? `${deckId}-card-${String(index + 1).padStart(2, '0')}`, masterId: entry.masterId });
}

export function validateDeck(cards, masterIndex, options = {}) {
  const normalized = normalizeDeckCards(cards, options.deckId);
  const errors = [];
  const expectedSize = options.expectedSize ?? RULES.deckSize;
  if (normalized.length !== expectedSize) errors.push(`デッキは${expectedSize}枚必要です（現在${normalized.length}枚）`);

  const instanceIds = new Set();
  const copies = new Map();
  for (const card of normalized) {
    if (instanceIds.has(card.instanceId)) errors.push(`カードinstanceIdが重複しています: ${card.instanceId}`);
    instanceIds.add(card.instanceId);
    const definition = masterIndex.cards.get(card.masterId);
    if (!definition) {
      errors.push(`不明なカードです: ${card.masterId}`);
      continue;
    }
    copies.set(card.masterId, (copies.get(card.masterId) ?? 0) + 1);
    const limit = COPY_LIMITS[definition.kind] ?? 0;
    if (copies.get(card.masterId) > limit) {
      errors.push(`${definition.name}は同名${limit}枚までです`);
    }
  }
  return { valid: errors.length === 0, errors, cards: normalized };
}

export function assertLegalDeck(cards, masterIndex, options = {}) {
  const result = validateDeck(cards, masterIndex, options);
  if (!result.valid) throw new Error(`不正なデッキ:\n${result.errors.join('\n')}`);
  return result.cards;
}

export function totalPlayTp(cards, masterIndex) {
  return normalizeDeckCards(cards).reduce((sum, card) => {
    const definition = masterIndex.cards.get(card.masterId);
    if (!definition) throw new Error(`不明なカードです: ${card.masterId}`);
    if (definition.kind === 'monster') return sum + definition.summonTp;
    return sum + definition.tp;
  }, 0);
}

export function determineFirstPlayer(playerA, playerB, masterIndex, rng) {
  const costA = totalPlayTp(playerA.cards, masterIndex);
  const costB = totalPlayTp(playerB.cards, masterIndex);
  if (costA < costB) return { firstPlayerId: playerA.id, costs: { [playerA.id]: costA, [playerB.id]: costB }, tied: false };
  if (costB < costA) return { firstPlayerId: playerB.id, costs: { [playerA.id]: costA, [playerB.id]: costB }, tied: false };
  return {
    firstPlayerId: rng.choice([playerA.id, playerB.id]),
    costs: { [playerA.id]: costA, [playerB.id]: costB },
    tied: true,
  };
}

export function representativeMonster(cards, masterIndex) {
  const monsters = normalizeDeckCards(cards)
    .map((card) => masterIndex.cards.get(card.masterId))
    .filter((card) => card?.kind === 'monster');
  return monsters.sort((a, b) => {
    const score = (monster) => monster.base.life + monster.base.atk + monster.base.def + monster.summonTp * 3;
    return score(b) - score(a) || a.name.localeCompare(b.name, 'ja');
  })[0] ?? null;
}

export function normalizeQualification(value = 'bronze') {
  return TOURNAMENTS.includes(value) ? value : 'bronze';
}
