const HOME_MONSTER_ID = /^monster-(00[1-9]|0[12][0-9]|030)$/;
const HOME_VARIANT_ID = /^(?:base|showcase-[a-z0-9-]{1,64})$/;

export function normalizeHomeArtworkSelection(value) {
  if (!value || typeof value !== 'object') return null;
  const masterId = String(value.masterId ?? '').trim();
  const artVariantId = String(value.artVariantId ?? 'base').trim();
  if (!HOME_MONSTER_ID.test(masterId) || !HOME_VARIANT_ID.test(artVariantId)) return null;
  return {
    masterId,
    artVariantId,
    finish: value.finish === 'foil' ? 'foil' : 'normal',
  };
}

export function homeArtworkSelectionKey(value) {
  const selection = normalizeHomeArtworkSelection(value);
  return selection ? `${selection.masterId}|${selection.artVariantId}|${selection.finish}` : '';
}

function appearanceRank(asset) {
  return ((asset?.artVariantId ?? 'base') !== 'base' ? 2 : 0) + (asset?.finish === 'foil' ? 1 : 0);
}

export function defaultHomeArtworkSelection(decks = [], masterIndex) {
  const deck = decks?.[0] ?? null;
  const fallbackId = deck?.representativeMonsterId
    ?? deck?.cards?.find((asset) => masterIndex?.monsters?.has(asset.masterId))?.masterId
    ?? 'monster-019';
  const cardAsset = deck?.cards
    ?.filter((asset) => asset.masterId === fallbackId)
    .reduce((best, asset) => (!best || appearanceRank(asset) > appearanceRank(best) ? asset : best), null);
  return normalizeHomeArtworkSelection({
    masterId: fallbackId,
    artVariantId: cardAsset?.artVariantId ?? 'base',
    finish: cardAsset?.finish ?? 'normal',
  }) ?? { masterId: 'monster-019', artVariantId: 'base', finish: 'normal' };
}

export function ownedHomeArtworkSelections({ catalog = null, decks = [], economy = null, masterIndex, current = null } = {}) {
  const appearances = new Map();
  const add = (raw, allowHistoricalBase = false) => {
    const definition = masterIndex?.monsters?.get(raw?.masterId);
    if (!definition) return;
    const selection = normalizeHomeArtworkSelection({
      masterId: definition.id,
      artVariantId: raw?.artVariantId ?? 'base',
      finish: raw?.finish ?? 'normal',
    });
    if (!selection) return;
    if (selection.artVariantId !== 'base' && !selection.artVariantId.startsWith('showcase-')) return;
    const key = `${selection.masterId}|${selection.artVariantId}`;
    const previous = appearances.get(key);
    if (!previous || appearanceRank(selection) > appearanceRank(previous) || allowHistoricalBase) appearances.set(key, selection);
  };

  for (const masterId of new Set(catalog?.ownedCardMasterIds ?? [])) add({ masterId }, true);
  for (const deck of decks ?? []) {
    for (const asset of [...(deck?.cards ?? []), ...(deck?.pool ?? [])]) add(asset);
  }
  for (const stack of economy?.unassignedAssets ?? []) add(stack);
  add(current);

  return [...appearances.values()].sort((left, right) => {
    const leftNumber = Number(left.masterId.slice(-3));
    const rightNumber = Number(right.masterId.slice(-3));
    if (leftNumber !== rightNumber) return leftNumber - rightNumber;
    if (left.artVariantId === right.artVariantId) return appearanceRank(right) - appearanceRank(left);
    return left.artVariantId === 'base' ? -1 : 1;
  });
}
