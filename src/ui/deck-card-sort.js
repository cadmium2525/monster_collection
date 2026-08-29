export const DECK_CARD_SORT_OPTIONS = Object.freeze([
  Object.freeze({ id: 'kind', label: '種類順' }),
  Object.freeze({ id: 'cost-asc', label: 'TPが低い順' }),
  Object.freeze({ id: 'cost-desc', label: 'TPが高い順' }),
  Object.freeze({ id: 'name', label: '名前順' }),
  Object.freeze({ id: 'original', label: '登録順' }),
]);

const KIND_ORDER = Object.freeze({ monster: 0, training: 1, shugyo: 2, breeder: 3 });

function definitionCost(definition) {
  return Number(definition?.kind === 'monster' ? definition.summonTp : definition?.tp) || 0;
}

function definitionName(definition) {
  return String(definition?.name ?? '');
}

export function sortDeckCards(cards, masterIndex, mode = 'kind') {
  const entries = cards.map((card, index) => ({ card, index, definition: masterIndex.cards.get(card.masterId) }));
  const byName = (a, b) => definitionName(a.definition).localeCompare(definitionName(b.definition), 'ja');
  const byCost = (a, b) => definitionCost(a.definition) - definitionCost(b.definition);
  const stable = (a, b) => a.index - b.index;

  if (mode === 'original') return entries.map(({ card }) => card);
  entries.sort((a, b) => {
    if (mode === 'cost-asc') return byCost(a, b) || byName(a, b) || stable(a, b);
    if (mode === 'cost-desc') return byCost(b, a) || byName(a, b) || stable(a, b);
    if (mode === 'name') return byName(a, b) || byCost(a, b) || stable(a, b);
    const kind = (KIND_ORDER[a.definition?.kind] ?? 9) - (KIND_ORDER[b.definition?.kind] ?? 9);
    return kind || byCost(a, b) || byName(a, b) || stable(a, b);
  });
  return entries.map(({ card }) => card);
}
