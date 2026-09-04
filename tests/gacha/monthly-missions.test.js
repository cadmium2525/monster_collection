import test from 'node:test';
import assert from 'node:assert/strict';
import { applyProgressionOperation, defaultEconomyState } from '../../src/gacha/economy-state.js';
import {
  japanMonthKey,
  missionEntries,
  normalizeMissionProgress,
  recordMissionEvent,
} from '../../src/progression/mission-state.js';

test('monthly missions share login, battle and tournament events without duplicate progress', () => {
  let progress = normalizeMissionProgress({}, { dateKey: '2026-09-01' });
  progress = recordMissionEvent(progress, { type: 'login', operationId: 'login:0901' }, { dateKey: '2026-09-01' });
  progress = recordMissionEvent(progress, { type: 'battle-result', mode: 'arena', won: true, operationId: 'battle:1' }, { dateKey: '2026-09-01' });
  progress = recordMissionEvent(progress, { type: 'battle-result', mode: 'arena', won: true, operationId: 'battle:1' }, { dateKey: '2026-09-01' });
  progress = recordMissionEvent(progress, { type: 'tournament-entry', operationId: 'entry:1' }, { dateKey: '2026-09-01' });
  const entries = missionEntries(progress, { dateKey: '2026-09-01' });
  assert.equal(entries.find(({ id }) => id === 'monthly-login').actualProgress, 1);
  assert.equal(entries.find(({ id }) => id === 'monthly-play').actualProgress, 1);
  assert.equal(entries.find(({ id }) => id === 'monthly-win').actualProgress, 1);
  assert.equal(entries.find(({ id }) => id === 'monthly-arena-plays').actualProgress, 1);
  assert.equal(entries.find(({ id }) => id === 'monthly-arena-wins').actualProgress, 1);
  assert.equal(entries.find(({ id }) => id === 'monthly-tournament-entry').actualProgress, 1);
  assert.equal(japanMonthKey('2026-09-30'), '2026-09');
  assert.deepEqual(normalizeMissionProgress(progress, { dateKey: '2026-10-01' }).monthly.counters, {});
});

test('completing every monthly objective awards one monster exchange ticket', () => {
  let economy = defaultEconomyState('2026-09-05T00:00:00.000Z');
  economy.missionProgress.monthly.counters = {
    loginDays: 20,
    battles: 30,
    wins: 15,
    arenaWins: 10,
    arenaBattles: 20,
    tournamentEntries: 8,
  };
  const monthly = missionEntries(economy.missionProgress, { dateKey: '2026-09-05' })
    .filter(({ period }) => period === 'monthly');
  assert.equal(monthly.filter(({ progressOnly, completed }) => progressOnly && completed).length, 6);
  assert.equal(monthly.find(({ id }) => id === 'monthly-complete').claimable, true);
  assert.throws(() => applyProgressionOperation(economy, {
    type: 'claim-mission', operationId: 'claim:objective', missionId: 'monthly-login', dateKey: '2026-09-05',
  }), /個別の受取報酬はありません/);

  economy = applyProgressionOperation(economy, {
    type: 'claim-mission', operationId: 'claim:monthly:2026-09', missionId: 'monthly-complete', dateKey: '2026-09-05',
  }, '2026-09-05T01:00:00.000Z');
  assert.equal(economy.monsterExchangeTickets, 1);
  assert.deepEqual(economy.missionProgress.monthly.claimedIds, ['monthly-complete']);

  const repeated = applyProgressionOperation(economy, {
    type: 'claim-mission', operationId: 'claim:monthly:2026-09', missionId: 'monthly-complete', dateKey: '2026-09-05',
  }, '2026-09-05T01:01:00.000Z');
  assert.equal(repeated.monsterExchangeTickets, 1);
});

test('a ticket exchanges for one chosen normal or showcase foil monster exactly once', () => {
  const initial = { ...defaultEconomyState('2026-09-05T00:00:00.000Z'), monsterExchangeTickets: 1 };
  const operation = {
    type: 'exchange-monster-ticket', operationId: 'exchange:1', dateKey: '2026-09-05',
    masterId: 'monster-001', artVariantId: 'showcase-monster-001', finish: 'foil',
  };
  const exchanged = applyProgressionOperation(initial, operation, '2026-09-05T02:00:00.000Z');
  assert.equal(exchanged.monsterExchangeTickets, 0);
  assert.deepEqual(exchanged.unassignedAssets.map(({ masterId, artVariantId, finish, rarity, quantity, origin }) => ({ masterId, artVariantId, finish, rarity, quantity, origin })), [{
    masterId: 'monster-001', artVariantId: 'showcase-monster-001', finish: 'foil', rarity: 'showcase', quantity: 1, origin: 'exchange',
  }]);
  const repeated = applyProgressionOperation(exchanged, operation, '2026-09-05T02:01:00.000Z');
  assert.equal(repeated.monsterExchangeTickets, 0);
  assert.equal(repeated.unassignedAssets[0].quantity, 1);
});
