import { japanWeekKey } from '../progression/mission-state.js';

export const ARENA_SCHEMA_VERSION = 1;
export const ARENA_RANKS = Object.freeze(['D', 'C', 'B', 'A', 'S', 'MASTER']);
export const ARENA_RANK_THRESHOLDS = Object.freeze({ D: 900, C: 1100, B: 1250, A: 1450, S: 1700, MASTER: 2000 });
export const ARENA_RANK_REWARDS = Object.freeze({
  C: Object.freeze({ diamonds: 1000, packs: 0, label: 'Cランク到達' }),
  B: Object.freeze({ diamonds: 1500, packs: 1, label: 'Bランク到達' }),
  A: Object.freeze({ diamonds: 2000, packs: 2, label: 'Aランク到達' }),
  S: Object.freeze({ diamonds: 3000, packs: 2, title: 'アリーナエリート', label: 'Sランク到達' }),
  MASTER: Object.freeze({ diamonds: 5000, packs: 3, title: 'アリーナマスター', label: 'MASTER到達' }),
});

function integer(value) { return Math.max(0, Math.trunc(Number(value) || 0)); }
function clone(value) { return value == null ? value : structuredClone(value); }

export function arenaRankForRating(value) {
  const rating = Math.max(ARENA_RANK_THRESHOLDS.D, Math.round(Number(value) || 1000));
  return [...ARENA_RANKS].reverse().find((rank) => rating >= ARENA_RANK_THRESHOLDS[rank]) ?? 'D';
}

export function normalizeArenaProgress(value = {}, { weekKey = japanWeekKey() } = {}) {
  const rating = Math.max(ARENA_RANK_THRESHOLDS.D, Math.round(Number(value.rating) || 1000));
  const rank = arenaRankForRating(rating);
  const highestRank = ARENA_RANKS.includes(value.highestRank)
    && ARENA_RANKS.indexOf(value.highestRank) > ARENA_RANKS.indexOf(rank) ? value.highestRank : rank;
  return {
    schemaVersion: ARENA_SCHEMA_VERSION,
    rating,
    rank,
    highestRank,
    wins: integer(value.wins),
    losses: integer(value.losses),
    currentWinStreak: integer(value.currentWinStreak),
    bestWinStreak: integer(value.bestWinStreak),
    defenseDeckId: value.defenseDeckId == null ? null : String(value.defenseDeckId),
    battleHistory: Array.isArray(value.battleHistory) ? clone(value.battleHistory).slice(-10) : [],
    lootStock: Array.isArray(value.lootStock)
      ? clone(value.lootStock).filter((entry) => entry?.weekKey === weekKey).slice(-12)
      : [],
    claimedRankRewards: [...new Set((value.claimedRankRewards ?? []).filter((rankName) => ARENA_RANKS.includes(rankName)))],
    unlockedTitles: [...new Set((value.unlockedTitles ?? []).map(String))].slice(-32),
    processedOperationIds: [...new Set((value.processedOperationIds ?? []).map(String))].slice(-320),
    updatedAt: value.updatedAt ?? null,
  };
}

export function arenaRatingDelta(playerRating, opponentRating, won) {
  const expected = 1 / (1 + (10 ** ((Number(opponentRating) - Number(playerRating)) / 400)));
  return Math.round(40 * ((won ? 1 : 0) - expected));
}

export function recordArenaResult(current, result, now = new Date().toISOString()) {
  const arena = normalizeArenaProgress(current);
  const operationId = String(result?.operationId ?? '').trim();
  if (!operationId) throw new Error('アリーナ結果IDがありません');
  if (arena.processedOperationIds.includes(operationId)) return arena;
  const won = Boolean(result.won);
  const delta = arenaRatingDelta(arena.rating, Number(result.opponentRating) || arena.rating, won);
  arena.rating = Math.max(ARENA_RANK_THRESHOLDS.D, arena.rating + delta);
  arena.rank = arenaRankForRating(arena.rating);
  if (ARENA_RANKS.indexOf(arena.rank) > ARENA_RANKS.indexOf(arena.highestRank)) arena.highestRank = arena.rank;
  if (won) {
    arena.wins += 1;
    arena.currentWinStreak += 1;
    arena.bestWinStreak = Math.max(arena.bestWinStreak, arena.currentWinStreak);
  } else {
    arena.losses += 1;
    arena.currentWinStreak = 0;
  }
  arena.battleHistory.push({
    operationId,
    opponentId: String(result.opponentId ?? 'unknown'),
    ownerUserId: result.ownerUserId == null ? null : String(result.ownerUserId),
    sourceType: String(result.sourceType ?? 'OFFICIAL_AI'),
    deckSignature: String(result.deckSignature ?? ''),
    won,
    ratingDelta: delta,
    ratingAfter: arena.rating,
    playedAt: now,
  });
  arena.battleHistory = arena.battleHistory.slice(-10);
  arena.processedOperationIds.push(operationId);
  arena.processedOperationIds = arena.processedOperationIds.slice(-320);
  arena.updatedAt = now;
  return arena;
}

export function addArenaLoot(current, loot, { weekKey = japanWeekKey(), now = new Date().toISOString() } = {}) {
  const arena = normalizeArenaProgress(current, { weekKey });
  const operationId = String(loot?.operationId ?? '').trim();
  if (!operationId) throw new Error('戦利品登録IDがありません');
  if (arena.processedOperationIds.includes(operationId)) return arena;
  const masterId = String(loot?.card?.masterId ?? '').trim();
  if (!masterId) throw new Error('戦利品カードがありません');
  if (!arena.lootStock.some((entry) => entry.masterId === masterId)) {
    arena.lootStock.push({
      lootId: String(loot.lootId ?? operationId), masterId,
      rarity: String(loot.card.rarity ?? 'common'), artVariantId: 'base', finish: 'normal', origin: 'arena',
      opponentName: String(loot.opponentName ?? ''), weekKey, obtainedAt: now,
    });
  }
  arena.lootStock = arena.lootStock.slice(-12);
  arena.processedOperationIds.push(operationId);
  arena.processedOperationIds = arena.processedOperationIds.slice(-320);
  arena.updatedAt = now;
  return arena;
}

export function claimArenaRankReward(current, rank, now = new Date().toISOString()) {
  const arena = normalizeArenaProgress(current);
  if (!ARENA_RANK_REWARDS[rank]) throw new Error('このランクに到達報酬はありません');
  if (ARENA_RANKS.indexOf(arena.highestRank) < ARENA_RANKS.indexOf(rank)) throw new Error('まだこのランクに到達していません');
  if (arena.claimedRankRewards.includes(rank)) return { arena, reward: null };
  arena.claimedRankRewards.push(rank);
  const reward = clone(ARENA_RANK_REWARDS[rank]);
  if (reward.title && !arena.unlockedTitles.includes(reward.title)) arena.unlockedTitles.push(reward.title);
  arena.updatedAt = now;
  return { arena, reward };
}

export function unclaimedArenaRankRewards(current) {
  const arena = normalizeArenaProgress(current);
  return ARENA_RANKS.filter((rank) => ARENA_RANK_REWARDS[rank]
    && ARENA_RANKS.indexOf(arena.highestRank) >= ARENA_RANKS.indexOf(rank)
    && !arena.claimedRankRewards.includes(rank));
}
