import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPlayerStatsEvent, battleWinRate, normalizePlayerStats } from '../../src/profile/player-stats.js';

test('player stats record battles, cup wins, championships and captures idempotently', () => {
  let stats = normalizePlayerStats();
  stats = applyPlayerStatsEvent(stats, { type: 'tournament-entry', operationId: 'run-1:entry', rank: 'legend' }, '2026-08-30T00:00:00Z');
  stats = applyPlayerStatsEvent(stats, { type: 'battle-result', operationId: 'run-1:battle:1', result: 'win', rank: 'legend' });
  stats = applyPlayerStatsEvent(stats, { type: 'battle-result', operationId: 'run-1:battle:2', result: 'win', rank: 'legend', tournamentFinished: true, tournamentWon: true });
  stats = applyPlayerStatsEvent(stats, { type: 'cards-stolen', operationId: 'run-1:reward:2', count: 2 });
  stats = applyPlayerStatsEvent(stats, { type: 'championship', operationId: 'run-1:crown' });
  const replayed = applyPlayerStatsEvent(stats, { type: 'championship', operationId: 'run-1:crown' });

  assert.equal(replayed.tournamentsEntered, 1);
  assert.equal(replayed.battlesPlayed, 2);
  assert.equal(replayed.battleWins, 2);
  assert.equal(replayed.bestWinStreak, 2);
  assert.equal(replayed.tournamentWins, 1);
  assert.equal(replayed.cupWins.legend, 1);
  assert.equal(replayed.championshipsWon, 1);
  assert.equal(replayed.cardsStolen, 2);
  assert.equal(battleWinRate(replayed), 1);
});

test('a loss and draw reset the current streak and keep the win rate finite', () => {
  let stats = applyPlayerStatsEvent(null, { type: 'battle-result', operationId: 'win', result: 'win' });
  stats = applyPlayerStatsEvent(stats, { type: 'battle-result', operationId: 'draw', result: 'draw' });
  stats = applyPlayerStatsEvent(stats, { type: 'battle-result', operationId: 'loss', result: 'loss' });
  assert.equal(stats.currentWinStreak, 0);
  assert.equal(stats.battleDraws, 1);
  assert.equal(stats.battleLosses, 1);
  assert.equal(battleWinRate(stats), 1 / 3);
});
