import { acquisitionOrigin } from '../gacha/acquisition.js';

const KIND_ORDER = Object.freeze({ monster: 0, training: 1, shugyo: 2, breeder: 3 });

function sortCards(cards) {
  return [...cards].sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9)
    || a.name.localeCompare(b.name, 'ja'));
}

function sortFusions(fusions) {
  return [...fusions].sort((a, b) => a.id.localeCompare(b.id));
}

export function buildCatalogModel(catalog, masterIndex, filter = 'all') {
  const ownedIds = new Set(catalog?.ownedCardMasterIds ?? []);
  const discoveredIds = new Set(catalog?.discoveredFusionIds ?? []);
  const allCards = sortCards(masterIndex.cards.values());
  const allFusions = sortFusions(masterIndex.data.fusions);
  const cards = allCards.map((definition) => ({ definition, owned: ownedIds.has(definition.id) }));
  const fusions = allFusions.map((fusion) => ({ fusion, discovered: discoveredIds.has(fusion.id) }));

  const visibleCards = filter === 'owned' ? cards.filter((entry) => entry.owned)
      : filter === 'unowned' ? cards.filter((entry) => !entry.owned)
      : filter === 'monster' ? cards.filter((entry) => entry.definition.kind === 'monster')
        : filter === 'support' ? cards.filter((entry) => entry.definition.kind !== 'monster')
          : filter === 'trophy' ? cards.filter((entry) => acquisitionOrigin(entry.definition) === 'trophy')
            : filter === 'booster' ? cards.filter((entry) => acquisitionOrigin(entry.definition) === 'booster')
          : ['fusion', 'undiscovered'].includes(filter) ? [] : cards;
  const visibleFusions = filter === 'fusion' ? fusions
    : filter === 'undiscovered' ? fusions.filter((entry) => !entry.discovered)
      : filter === 'all' ? fusions : [];

  return {
    cards: visibleCards,
    fusions: visibleFusions,
    progress: {
      owned: cards.filter((entry) => entry.owned).length,
      cards: cards.length,
      discovered: fusions.filter((entry) => entry.discovered).length,
      fusions: fusions.length,
    },
    filters: [
      ['all', '全件', cards.length + fusions.length],
      ['owned', '所持済み', cards.filter((entry) => entry.owned).length],
      ['unowned', '未所持', cards.filter((entry) => !entry.owned).length],
      ['monster', 'モンスター', cards.filter((entry) => entry.definition.kind === 'monster').length],
      ['support', '育成・ブリーダー', cards.filter((entry) => entry.definition.kind !== 'monster').length],
      ['trophy', '奪取限定', cards.filter((entry) => acquisitionOrigin(entry.definition) === 'trophy').length],
      ['booster', 'ブースター限定', cards.filter((entry) => acquisitionOrigin(entry.definition) === 'booster').length],
      ['fusion', '特殊合体', fusions.length],
      ['undiscovered', '未発見', fusions.filter((entry) => !entry.discovered).length],
    ],
  };
}
