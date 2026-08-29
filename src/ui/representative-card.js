function appearanceScore(card) {
  const special = (card?.artVariantId ?? 'base') !== 'base' ? 2 : 0;
  const foil = card?.finish === 'foil' ? 1 : 0;
  return special + foil;
}

export function representativeCardAsset(cards = [], representativeMonsterId = null) {
  if (!representativeMonsterId) return null;
  return cards
    .filter((card) => card?.masterId === representativeMonsterId)
    .reduce((best, card) => (!best || appearanceScore(card) > appearanceScore(best) ? card : best), null);
}

export function representativeAppearance(cards = [], representativeMonsterId = null) {
  const cardAsset = representativeCardAsset(cards, representativeMonsterId);
  return {
    cardAsset,
    premium: Boolean(cardAsset && (cardAsset.artVariantId !== 'base' || cardAsset.finish === 'foil')),
  };
}
