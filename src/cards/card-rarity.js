export const CARD_RARITY = Object.freeze({
  common: 'common',
  rare: 'rare',
  showcase: 'showcase',
});

export function baseCardRarity(definitionOrId) {
  const id = typeof definitionOrId === 'string' ? definitionOrId : definitionOrId?.id;
  const kind = typeof definitionOrId === 'object' ? definitionOrId?.kind : null;
  return kind === 'monster' || /^monster-\d+$/.test(String(id ?? ''))
    ? CARD_RARITY.rare
    : CARD_RARITY.common;
}

export function canonicalCardRarity({ masterId, artVariantId = 'base' } = {}) {
  return artVariantId !== 'base' ? CARD_RARITY.showcase : baseCardRarity(masterId);
}
