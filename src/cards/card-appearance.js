import { canonicalCardRarity } from './card-rarity.js';

function cleanString(value, fallback) {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

export function isMonsterCardAsset(asset) {
  return /^monster-\d+$/.test(String(asset?.masterId ?? ''));
}

export function normalizeCardAppearance(asset = {}) {
  const hasAppearance = ['artVariantId', 'finish', 'rarity']
    .some((key) => Object.prototype.hasOwnProperty.call(asset, key));
  if (!hasAppearance) return { ...asset };
  const premiumAllowed = isMonsterCardAsset(asset);
  return {
    ...asset,
    artVariantId: premiumAllowed ? cleanString(asset.artVariantId, 'base') : 'base',
    finish: premiumAllowed ? cleanString(asset.finish, 'normal') : 'normal',
    rarity: canonicalCardRarity({
      masterId: asset.masterId,
      artVariantId: premiumAllowed ? cleanString(asset.artVariantId, 'base') : 'base',
    }),
  };
}
