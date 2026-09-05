import { FACTIONS, canonicalFaction, legacyFactionFor } from './acquisition.js';
import { normalizeCardAppearance } from '../cards/card-appearance.js';
import { TOURNAMENTS } from '../battle/rules.js';
import {
  claimMission,
  japanDateKey,
  japanWeekKey,
  normalizeMissionProgress,
  recordMissionEvent,
} from '../progression/mission-state.js';
import {
  addArenaLoot,
  claimArenaRankReward,
  normalizeArenaProgress,
  recordArenaResult,
} from '../arena/arena-state.js';
import { SHOWCASE_VARIANTS } from './pack-generator.js';

export const ECONOMY_SCHEMA_VERSION = 1;
export const STARTER_DIAMONDS = 600;
export const DAILY_LOGIN_DIAMONDS = 300;
export const SUMMER_BONUS_DIAMONDS = 3000;
export const SUMMER_BONUS_ID = 'summer-vacation-2026';
export const SUMMER_BONUS_START = '2026-08-29';
export const SUMMER_BONUS_END = '2026-08-31';
export const HOME_RENEWAL_GIFT_ID = 'home-renewal-2026';
export const HOME_RENEWAL_GIFT_DIAMONDS = 3000;
export const HOME_RENEWAL_GIFT_START = '2026-09-01';
export const HOME_RENEWAL_GIFT_END = '2026-09-04';

const CAMPAIGN_GIFTS = Object.freeze([
  Object.freeze({
    id: HOME_RENEWAL_GIFT_ID,
    type: 'gift',
    amount: HOME_RENEWAL_GIFT_DIAMONDS,
    label: 'ホーム画面刷新記念',
    description: '新しいホーム画面の公開を記念した期間限定プレゼントです。',
    startsAt: HOME_RENEWAL_GIFT_START,
    endsAt: HOME_RENEWAL_GIFT_END,
  }),
]);

const MONSTER_SHOWCASE_BY_ID = new Map(
  Object.values(SHOWCASE_VARIANTS).flat().map((variant) => [variant.masterId, variant.artVariantId]),
);

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
  return normalizeCardAppearance({
    masterId: cleanString(asset.masterId),
    artVariantId: cleanString(asset.artVariantId, 'base'),
    finish: cleanString(asset.finish, 'normal'),
    origin: cleanString(asset.origin, 'core'),
    rarity: cleanString(asset.rarity, 'common'),
    quantity,
    firstObtainedAt: cleanString(asset.firstObtainedAt),
  });
}

function normalizePendingPack(value) {
  if (!value) return null;
  return {
    ...clone(value),
    faction: canonicalFaction(value.faction),
    cards: Array.isArray(value.cards) ? value.cards.map((card) => normalizeCardAppearance(clone(card))) : [],
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
    monsterExchangeTickets: 0,
    unassignedAssets: [],
    pendingPack: null,
    packCounters: Object.fromEntries(FACTIONS.map((faction) => [faction, 0])),
    processedOperationIds: [],
    tournamentQualification: 'bronze',
    lastDailyLoginDate: null,
    claimedCampaignIds: [],
    archivedDecks: [],
    missionProgress: normalizeMissionProgress({}, { dateKey: now ? japanDateKey(now) : japanDateKey() }),
    arenaProgress: normalizeArenaProgress({}, { weekKey: now ? japanWeekKey(japanDateKey(now)) : japanWeekKey() }),
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
    monsterExchangeTickets: Math.max(0, Math.trunc(Number(value.monsterExchangeTickets) || 0)),
    unassignedAssets: mergeAssetStacks(value.unassignedAssets),
    pendingPack: normalizePendingPack(value.pendingPack),
    packCounters: Object.fromEntries(FACTIONS.map((faction) => [
      faction,
      Math.max(0, Math.trunc(Number(
        value.packCounters?.[faction] ?? value.packCounters?.[legacyFactionFor(faction)],
      ) || 0)),
    ])),
    processedOperationIds: [...new Set((value.processedOperationIds ?? []).map(String))].slice(-160),
    tournamentQualification: TOURNAMENTS.includes(value.tournamentQualification) ? value.tournamentQualification : 'bronze',
    lastDailyLoginDate: /^\d{4}-\d{2}-\d{2}$/.test(String(value.lastDailyLoginDate ?? ''))
      ? String(value.lastDailyLoginDate)
      : null,
    claimedCampaignIds: [...new Set((value.claimedCampaignIds ?? []).map(String))].slice(-32),
    archivedDecks: Array.isArray(value.archivedDecks) ? clone(value.archivedDecks) : [],
    missionProgress: normalizeMissionProgress(value.missionProgress, { dateKey: now ? japanDateKey(now) : japanDateKey() }),
    arenaProgress: normalizeArenaProgress(value.arenaProgress, { weekKey: now ? japanWeekKey(japanDateKey(now)) : japanWeekKey() }),
    updatedAt: value.updatedAt ?? now,
  };
}

export { japanDateKey };

export function applyTournamentUnlock(current, rank, now = new Date().toISOString()) {
  const state = normalizeEconomyState(current, now);
  if (!TOURNAMENTS.includes(rank)) throw new Error(`不明な大会です: ${rank}`);
  if (TOURNAMENTS.indexOf(rank) > TOURNAMENTS.indexOf(state.tournamentQualification)) {
    state.tournamentQualification = rank;
    state.updatedAt = now;
  }
  return state;
}

export function applyLoginRewards(current, {
  loginDate = japanDateKey(),
  campaignId = SUMMER_BONUS_ID,
  campaignStart = SUMMER_BONUS_START,
  campaignEnd = SUMMER_BONUS_END,
} = {}, now = new Date().toISOString()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(loginDate)) throw new Error('ログイン日が不正です');
  const state = normalizeEconomyState(current, now);
  const rewards = [];
  if (!state.lastDailyLoginDate || loginDate > state.lastDailyLoginDate) {
    state.lastDailyLoginDate = loginDate;
    state.missionProgress = recordMissionEvent(state.missionProgress, {
      type: 'login', operationId: `mission:login:${loginDate}`,
    }, { dateKey: loginDate });
  }
  if (loginDate >= campaignStart && loginDate <= campaignEnd && campaignId && !state.claimedCampaignIds.includes(campaignId)) {
    state.diamonds += SUMMER_BONUS_DIAMONDS;
    state.claimedCampaignIds = [...state.claimedCampaignIds, campaignId].slice(-32);
    rewards.push({ type: 'campaign', amount: SUMMER_BONUS_DIAMONDS, label: '夏休みボーナス' });
  }
  if (rewards.length) state.updatedAt = now;
  return { state, rewards };
}

export function availableCampaignGifts(current, { loginDate = japanDateKey() } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(loginDate)) throw new Error('ログイン日が不正です');
  const state = normalizeEconomyState(current);
  return CAMPAIGN_GIFTS
    .filter((gift) => loginDate >= gift.startsAt
      && loginDate <= gift.endsAt
      && !state.claimedCampaignIds.includes(gift.id))
    .map((gift) => clone(gift));
}

export function applyCampaignGiftClaim(current, {
  giftId,
  claimDate = japanDateKey(),
} = {}, now = new Date().toISOString()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(claimDate)) throw new Error('受取日が不正です');
  const state = normalizeEconomyState(current, now);
  const gift = CAMPAIGN_GIFTS.find((entry) => entry.id === giftId);
  if (!gift) throw new Error('ギフトが見つかりません');
  if (state.claimedCampaignIds.includes(gift.id)) return { state, reward: null };
  if (claimDate < gift.startsAt || claimDate > gift.endsAt) throw new Error('このギフトの受取期間は終了しました');
  state.diamonds += gift.amount;
  state.claimedCampaignIds = [...state.claimedCampaignIds, gift.id].slice(-32);
  state.updatedAt = now;
  return { state, reward: clone(gift) };
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
  const normalizedCards = purchase.cards.map((card) => normalizeCardAppearance(clone(card)));
  const assets = normalizedCards.map((card) => ({ ...card, quantity: 1, firstObtainedAt: now }));
  state.unassignedAssets = mergeAssetStacks([...state.unassignedAssets, ...assets]);
  state.pendingPack = {
    schemaVersion: 1,
    operationId,
    faction: purchase.faction,
    packId: purchase.packId,
    cards: clone(normalizedCards),
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

export function applyProgressionOperation(current, operation, now = new Date().toISOString()) {
  const state = normalizeEconomyState(current, now);
  const dateKey = operation?.dateKey ?? japanDateKey(now);
  const operationId = String(operation?.operationId ?? '').trim();
  if (!operationId) throw new Error('進行更新IDがありません');

  if (operation.type === 'mission-event') {
    state.missionProgress = recordMissionEvent(state.missionProgress, { ...operation.event, operationId }, { dateKey });
  } else if (operation.type === 'arena-result') {
    state.arenaProgress = recordArenaResult(state.arenaProgress, { ...operation.result, operationId }, now);
    state.missionProgress = recordMissionEvent(state.missionProgress, {
      type: 'battle-result', mode: 'arena', won: Boolean(operation.result?.won), operationId: `mission:${operationId}`,
    }, { dateKey });
  } else if (operation.type === 'arena-loot') {
    state.arenaProgress = addArenaLoot(state.arenaProgress, { ...operation.loot, operationId }, { weekKey: japanWeekKey(dateKey), now });
  } else if (operation.type === 'arena-defense') {
    if (!state.arenaProgress.processedOperationIds.includes(operationId)) {
      state.arenaProgress.defenseDeckId = String(operation.deckId ?? '').trim() || null;
      state.arenaProgress.processedOperationIds = [...state.arenaProgress.processedOperationIds, operationId].slice(-320);
      state.arenaProgress.updatedAt = now;
    }
  } else if (operation.type === 'claim-mission') {
    if (state.processedOperationIds.includes(operationId)) return state;
    const progressBeforeClaim = normalizeMissionProgress(state.missionProgress, { dateKey });
    const countersBeforeClaim = Object.fromEntries(['daily', 'weekly', 'monthly'].map((period) => [
      period,
      clone(progressBeforeClaim[period].counters),
    ]));
    const claimed = claimMission(progressBeforeClaim, operation.missionId, { dateKey });
    state.missionProgress = claimed.progress;
    for (const period of ['daily', 'weekly', 'monthly']) {
      state.missionProgress[period].counters = countersBeforeClaim[period];
    }
    if (claimed.reward?.type === 'diamonds') state.diamonds += claimed.reward.amount;
    if (claimed.reward?.type === 'monster-exchange-ticket') {
      state.monsterExchangeTickets += claimed.reward.amount;
    }
    if (claimed.reward?.type === 'arena-card') {
      const weekKey = japanWeekKey(dateKey);
      const loot = state.arenaProgress.lootStock.find((entry) => entry.lootId === operation.lootId && entry.weekKey === weekKey);
      if (!loot) throw new Error('獲得する戦利品カードを選択してください');
      state.unassignedAssets = mergeAssetStacks([...state.unassignedAssets, {
        masterId: loot.masterId, artVariantId: 'base', finish: 'normal', origin: 'arena',
        rarity: loot.rarity, quantity: 1, firstObtainedAt: now,
      }]);
      state.arenaProgress.lootStock = state.arenaProgress.lootStock.filter((entry) => entry.weekKey !== weekKey);
    }
    rememberOperation(state, operationId);
  } else if (operation.type === 'exchange-monster-ticket') {
    if (state.processedOperationIds.includes(operationId)) return state;
    if (state.monsterExchangeTickets <= 0) throw new Error('モンスターカード交換券を所持していません');
    const masterId = cleanString(operation.masterId);
    const expectedShowcaseId = MONSTER_SHOWCASE_BY_ID.get(masterId);
    if (!expectedShowcaseId) throw new Error('交換対象のモンスターが見つかりません');
    const artVariantId = cleanString(operation.artVariantId, 'base');
    if (artVariantId !== 'base' && artVariantId !== expectedShowcaseId) {
      throw new Error('選択した特別イラストは交換対象外です');
    }
    const finish = cleanString(operation.finish, 'normal');
    if (!['normal', 'foil'].includes(finish)) throw new Error('カードの加工指定が不正です');
    state.monsterExchangeTickets -= 1;
    state.unassignedAssets = mergeAssetStacks([...state.unassignedAssets, {
      masterId,
      artVariantId,
      finish,
      origin: 'exchange',
      rarity: artVariantId === 'base' ? 'rare' : 'showcase',
      quantity: 1,
      firstObtainedAt: now,
    }]);
    rememberOperation(state, operationId);
  } else if (operation.type === 'claim-arena-rank') {
    const claimed = claimArenaRankReward(state.arenaProgress, operation.rank, now);
    state.arenaProgress = claimed.arena;
    if (claimed.reward) {
      state.diamonds += claimed.reward.diamonds ?? 0;
      state.freePackCredits += claimed.reward.packs ?? 0;
    }
  } else throw new Error(`不明な進行更新です: ${operation.type}`);

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
