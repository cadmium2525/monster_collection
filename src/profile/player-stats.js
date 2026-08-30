import { TOURNAMENTS } from '../battle/rules.js';

export const PLAYER_STATS_SCHEMA_VERSION = 1;

function nonNegativeInteger(value) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

function rankRecord(value = {}) {
  return Object.fromEntries(TOURNAMENTS.map((rank) => [rank, nonNegativeInteger(value?.[rank])]));
}

export function defaultPlayerStats() {
  return {
    schemaVersion: PLAYER_STATS_SCHEMA_VERSION,
    battlesPlayed: 0,
    battleWins: 0,
    battleLosses: 0,
    battleDraws: 0,
    currentWinStreak: 0,
    bestWinStreak: 0,
    tournamentsEntered: 0,
    tournamentsCompleted: 0,
    tournamentWins: 0,
    cupWins: rankRecord(),
    championshipsWon: 0,
    cardsStolen: 0,
    processedOperationIds: [],
    firstBattleAt: null,
    lastBattleAt: null,
    firstTournamentAt: null,
    lastTournamentAt: null,
    updatedAt: null,
  };
}

export function normalizePlayerStats(value = {}) {
  value = value && typeof value === 'object' ? value : {};
  const base = defaultPlayerStats();
  return {
    ...base,
    battlesPlayed: nonNegativeInteger(value.battlesPlayed),
    battleWins: nonNegativeInteger(value.battleWins),
    battleLosses: nonNegativeInteger(value.battleLosses),
    battleDraws: nonNegativeInteger(value.battleDraws),
    currentWinStreak: nonNegativeInteger(value.currentWinStreak),
    bestWinStreak: nonNegativeInteger(value.bestWinStreak),
    tournamentsEntered: nonNegativeInteger(value.tournamentsEntered),
    tournamentsCompleted: nonNegativeInteger(value.tournamentsCompleted),
    tournamentWins: nonNegativeInteger(value.tournamentWins),
    cupWins: rankRecord(value.cupWins),
    championshipsWon: nonNegativeInteger(value.championshipsWon),
    cardsStolen: nonNegativeInteger(value.cardsStolen),
    processedOperationIds: [...new Set((value.processedOperationIds ?? []).map(String))].slice(-320),
    firstBattleAt: value.firstBattleAt ?? null,
    lastBattleAt: value.lastBattleAt ?? null,
    firstTournamentAt: value.firstTournamentAt ?? null,
    lastTournamentAt: value.lastTournamentAt ?? null,
    updatedAt: value.updatedAt ?? null,
  };
}

export function applyPlayerStatsEvent(current, event, now = new Date().toISOString()) {
  const stats = normalizePlayerStats(current);
  const operationId = String(event?.operationId ?? '').trim();
  if (!operationId) throw new Error('戦績更新の操作IDがありません');
  if (stats.processedOperationIds.includes(operationId)) return stats;

  if (event.type === 'tournament-entry') {
    stats.tournamentsEntered += 1;
    stats.firstTournamentAt ??= now;
    stats.lastTournamentAt = now;
  } else if (event.type === 'battle-result') {
    stats.battlesPlayed += 1;
    stats.firstBattleAt ??= now;
    stats.lastBattleAt = now;
    if (event.result === 'win') {
      stats.battleWins += 1;
      stats.currentWinStreak += 1;
      stats.bestWinStreak = Math.max(stats.bestWinStreak, stats.currentWinStreak);
    } else if (event.result === 'draw') {
      stats.battleDraws += 1;
      stats.currentWinStreak = 0;
    } else {
      stats.battleLosses += 1;
      stats.currentWinStreak = 0;
    }
    if (event.tournamentFinished) {
      stats.tournamentsCompleted += 1;
      stats.lastTournamentAt = now;
    }
    if (event.tournamentWon) {
      stats.tournamentWins += 1;
      if (TOURNAMENTS.includes(event.rank)) stats.cupWins[event.rank] += 1;
    }
  } else if (event.type === 'cards-stolen') {
    stats.cardsStolen += nonNegativeInteger(event.count);
  } else if (event.type === 'championship') {
    stats.championshipsWon += 1;
  } else throw new Error(`不明な戦績イベントです: ${event.type}`);

  stats.processedOperationIds = [...stats.processedOperationIds, operationId].slice(-320);
  stats.updatedAt = now;
  return stats;
}

export function battleWinRate(stats) {
  const normalized = normalizePlayerStats(stats);
  return normalized.battlesPlayed ? normalized.battleWins / normalized.battlesPlayed : 0;
}
