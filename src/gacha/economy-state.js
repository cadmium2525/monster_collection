import { FACTIONS } from './acquisition.js';

export const ECONOMY_SCHEMA_VERSION = 1;
export const STARTER_DIAMONDS = 600;

function clone(value) { return value == null ? value : structuredClone(value); }

function cleanString(value, fallback = null) {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

export function assetStackKey(asset) {
  return [asset.masterId, asset.artVariantId ?? 'base', asset.finish ?? 'normal', asset.origin ?? 'core'].join('|');
}

export function normalizeAssetStack(asset) {
  const quantity = Math.max(0, Math.trunc(Number(asset?.quantity) || 0));
  if (!cleanString(asset?.masterId) || quantity <= 0) return null;
  return {
    masterId: cleanString(asset.masterId),
    artVariantId: cleanString(asset.artVariantId, 'base'),
    finish: cleanString(asset.finish, 'normal'),
    origin: cleanString(asset.origin, 'core'),
    rarity: cleanString(asset.rarity, 'common'),
    quantity,
    firstObtainedAt: cleanString(asset.firstObtainedAt),
  };
}

export function mergeAssetStacks(stacks = []) {
  const merged = new Map();
  for (const raw of stacks) {
    const stack = normalizeAssetStack(raw);
    if (!stack) continue;
    const key = assetStackKey(stack);
    const current = merged.get(key);
    if (current) {
      current.quantity += stack.quantity;
      current.firstObtainedAt = current.firstObtainedAt ?? stack.firstObtainedAt;
    } else merged.set(key, stack);
  }
  return [...merged.values()].sort((a, b) => assetStackKey(a).localeCompare(assetStackKey(b)));
}

export function defaultEconomyState(now = null) {
  return {
    schemaVersion: ECONOMY_SCHEMA_VERSION,
    diamonds: STARTER_DIAMONDS,
    freePackCredits: 1,
    unassignedAssets: [],
    pendingPack: null,
    packCounters: Object.fromEntries(FACTIONS.map((faction) => [faction, 0])),
    processedOperationIds: [],
    archivedDecks: [],
    updatedAt: now,
  };
}

export function normalizeEconomyState(value, now = null) {
  const base = defaultEconomyState(now);
  if (!value || Number(value.schemaVersion) !== ECONOMY_SCHEMA_VERSION) return base;
  return {
    schemaVersion: ECONOMY_SCHEMA_VERSION,
    diamonds: Math.max(0, Math.trunc(Number(value.diamonds) || 0)),
    freePackCredits: Math.max(0, Math.trunc(Number(value.freePackCredits) || 0)),
    unassignedAssets: mergeAssetStacks(value.unassignedAssets),
    pendingPack: value.pendingPack ? clone(value.pendingPack) : null,
    packCounters: Object.fromEntries(FACTIONS.map((faction) => [
      faction,
      Math.max(0, Math.trunc(Number(value.packCounters?.[faction]) || 0)),
    ])),
    processedOperationIds: [...new Set((value.processedOperationIds ?? []).map(String))].slice(-160),
    archivedDecks: Array.isArray(value.archivedDecks) ? clone(value.archivedDecks) : [],
    updatedAt: value.updatedAt ?? now,
  };
}

function rememberOperation(state, operationId) {
  state.processedOperationIds = [...new Set([...state.processedOperationIds, operationId])].slice(-160);
}

export function applyPackPurchase(current, purchase, now = new Date().toISOString()) {
  const state = normalizeEconomyState(current, now);
  const operationId = cleanString(purchase?.operationId);
  if (!operationId) throw new Error('パック購入IDがありません');
  if (state.processedOperationIds.includes(operationId)) return state;
  if (state.pendingPack) throw new Error('先に未確認のパックを開封してください');
  if (!FACTIONS.includes(purchase.faction)) throw new Error('不明なブースターパックです');
  if (!Array.isArray(purchase.cards) || purchase.cards.length !== 5) throw new Error('パックは5枚である必要があります');

  const useFreeCredit = Boolean(purchase.useFreeCredit && state.freePackCredits > 0);
  const cost = useFreeCredit ? 0 : Math.max(0, Math.trunc(Number(purchase.cost) || 0));
  if (state.diamonds < cost) throw new Error('ダイヤが足りません');
  state.diamonds -= cost;
  if (useFreeCredit) state.freePackCredits -= 1;
  state.packCounters[purchase.faction] += 1;
  const assets = purchase.cards.map((card) => ({ ...clone(card), quantity: 1, firstObtainedAt: now }));
  state.unassignedAssets = mergeAssetStacks([...state.unassignedAssets, ...assets]);
  state.pendingPack = {
    schemaVersion: 1,
    operationId,
    faction: purchase.faction,
    packId: purchase.packId,
    cards: clone(purchase.cards),
    cost,
    usedFreeCredit: useFreeCredit,
    openedAt: now,
  };
  rememberOperation(state, operationId);
  state.updatedAt = now;
  return state;
}

export function acknowledgePendingPack(current, operationId, now = new Date().toISOString()) {
  const state = normalizeEconomyState(current, now);
  if (!state.pendingPack) return state;
  if (state.pendingPack.operationId !== operationId) throw new Error('確認対象のパックが一致しません');
  state.pendingPack = null;
  state.updatedAt = now;
  return state;
}

export function applyDiamondReward(current, reward, now = new Date().toISOString()) {
  const state = normalizeEconomyState(current, now);
  const operationId = cleanString(reward?.operationId);
  const amount = Math.max(0, Math.trunc(Number(reward?.amount) || 0));
  if (!operationId || amount <= 0) throw new Error('ダイヤ報酬が不正です');
  if (state.processedOperationIds.includes(operationId)) return state;
  state.diamonds += amount;
  rememberOperation(state, operationId);
  state.updatedAt = now;
  return state;
}

export function takeUnassignedAsset(current, key, now = new Date().toISOString()) {
  const state = normalizeEconomyState(current, now);
  const index = state.unassignedAssets.findIndex((asset) => assetStackKey(asset) === key);
  if (index < 0) throw new Error('未所属資産が見つかりません');
  const asset = { ...state.unassignedAssets[index], quantity: 1 };
  state.unassignedAssets[index].quantity -= 1;
  state.unassignedAssets = mergeAssetStacks(state.unassignedAssets);
  state.updatedAt = now;
  return { state, asset };
}

export function returnUnassignedAsset(current, asset, now = new Date().toISOString()) {
  const state = normalizeEconomyState(current, now);
  state.unassignedAssets = mergeAssetStacks([...state.unassignedAssets, { ...asset, quantity: 1 }]);
  state.updatedAt = now;
  return state;
}
