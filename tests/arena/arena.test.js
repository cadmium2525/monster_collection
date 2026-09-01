import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyProgressionOperation, defaultEconomyState } from '../../src/gacha/economy-state.js';
import { ARENA_RANKS, arenaRankForRating, normalizeArenaProgress } from '../../src/arena/arena-state.js';
import { OFFICIAL_ARENA_SPECS, deckSimilarity, deckSignature, selectArenaOpponent } from '../../src/arena/matchmaker.js';
import { missionEntries } from '../../src/progression/mission-state.js';
import { legalDeck, masterIndex } from '../helpers.js';

test('arena has six ranks, 36 official opponents and Master-only legend archives', () => {
  assert.deepEqual(ARENA_RANKS, ['D', 'C', 'B', 'A', 'S', 'MASTER']);
  assert.equal(OFFICIAL_ARENA_SPECS.length, 36);
  assert.equal(new Set(OFFICIAL_ARENA_SPECS.map((entry) => `${entry.rank}:${entry.theme}`)).size, 36);
  assert.equal(arenaRankForRating(1999), 'S');
  assert.equal(arenaRankForRating(2000), 'MASTER');

  const archive = {
    archiveId: 'champion-1', championVersion: 1, championDisplayName: '王者', championDeckName: '王者の40枚',
    championUserId: 'champion-user', championDeckSnapshot: legalDeck('archive'), championGrowthSnapshot: {},
  };
  const lower = selectArenaOpponent({ masterIndex, arena: { rating: 1450 }, legendArchives: [archive], seed: 'lower' });
  assert.notEqual(lower.sourceType, 'LEGEND_ARCHIVE');
  const masterSources = new Set(Array.from({ length: 20 }, (_, index) => selectArenaOpponent({
    masterIndex, arena: { rating: 2050 }, legendArchives: [archive], seed: `master-${index}`,
  }).sourceType));
  assert.ok(masterSources.has('LEGEND_ARCHIVE'));
});

test('deck similarity compares card composition instead of display names', () => {
  const base = legalDeck('a');
  const same = base.map((card, index) => ({ ...card, instanceId: `b-${index}` }));
  const changed = base.map((card, index) => index < 20 ? { ...card, instanceId: `c-${index}` } : { instanceId: `c-${index}`, masterId: 'training-life' });
  assert.equal(deckSimilarity(deckSignature(base), deckSignature(same)), 1);
  assert.ok(deckSimilarity(deckSignature(base), deckSignature(changed)) < 1);
});

test('one arena result advances daily and weekly missions exactly once', () => {
  let economy = defaultEconomyState('2026-09-01T01:00:00.000Z');
  const operation = {
    type: 'arena-result', operationId: 'arena:test:1', dateKey: '2026-09-01',
    result: { won: true, opponentId: 'official-d', opponentRating: 1000, sourceType: 'OFFICIAL_AI', deckSignature: 'x' },
  };
  economy = applyProgressionOperation(economy, operation, '2026-09-01T01:00:00.000Z');
  economy = applyProgressionOperation(economy, operation, '2026-09-01T01:01:00.000Z');
  const entries = missionEntries(economy.missionProgress, { dateKey: '2026-09-01' });
  assert.equal(entries.find((entry) => entry.id === 'daily-play').actualProgress, 1);
  assert.equal(entries.find((entry) => entry.id === 'daily-win').actualProgress, 1);
  assert.equal(entries.find((entry) => entry.id === 'weekly-arena-plays').actualProgress, 1);
  assert.equal(entries.find((entry) => entry.id === 'weekly-arena-wins').actualProgress, 1);
  assert.equal(economy.arenaProgress.wins, 1);
  assert.equal(economy.arenaProgress.battleHistory.length, 1);
});

test('three arena wins unlock one selected weekly loot card', () => {
  let economy = defaultEconomyState('2026-09-01T01:00:00.000Z');
  for (let index = 1; index <= 3; index += 1) {
    economy = applyProgressionOperation(economy, {
      type: 'arena-result', operationId: `arena:test:${index}`, dateKey: '2026-09-01',
      result: { won: true, opponentId: `official-${index}`, opponentRating: 1000, sourceType: 'OFFICIAL_AI', deckSignature: String(index) },
    }, `2026-09-01T0${index}:00:00.000Z`);
  }
  economy = applyProgressionOperation(economy, {
    type: 'arena-loot', operationId: 'loot:test:1', dateKey: '2026-09-01',
    loot: { lootId: 'loot-1', card: { masterId: 'monster-001', rarity: 'rare' }, opponentName: '公式AI' },
  }, '2026-09-01T05:00:00.000Z');
  const weekly = missionEntries(economy.missionProgress, { dateKey: '2026-09-01' }).find((entry) => entry.id === 'weekly-arena-wins');
  assert.equal(weekly.claimable, true);
  economy = applyProgressionOperation(economy, {
    type: 'claim-mission', operationId: 'claim:weekly-card', dateKey: '2026-09-01',
    missionId: weekly.id, lootId: 'loot-1',
  }, '2026-09-01T05:01:00.000Z');
  assert.equal(economy.unassignedAssets.find((asset) => asset.masterId === 'monster-001')?.quantity, 1);
  assert.equal(economy.arenaProgress.lootStock.length, 0);
});

test('home and Firestore expose missions, arena ghosts and honest source labels', () => {
  const home = fs.readFileSync(new URL('../../src/ui/home-screen.js', import.meta.url), 'utf8');
  const arenaUi = fs.readFileSync(new URL('../../src/ui/arena-screen.js', import.meta.url), 'utf8');
  const rules = fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const giftIndex = home.indexOf("homeIcon('gift')");
  const missionIndex = home.indexOf("homeIcon('mission')");
  const noticeIndex = home.indexOf("homeIcon('notice')");
  const helpIndex = home.indexOf("homeIcon('help')");
  assert.ok(giftIndex < missionIndex && missionIndex < noticeIndex && noticeIndex < helpIndex);
  assert.match(home, /claimableMissionCount/);
  for (const label of ['PLAYER', 'OFFICIAL AI', 'LEGEND ARCHIVE']) assert.match(arenaUi, new RegExp(label));
  assert.match(rules, /match \/arenaDecks\/\{publicDeckId\}/);
  assert.match(rules, /match \/legendArchives\/\{archiveId\}/);
});

test('arena progress normalizes malformed records safely', () => {
  const arena = normalizeArenaProgress({ rating: -5, rank: 'HACK', battleHistory: 'bad', lootStock: null });
  assert.equal(arena.rating, 900);
  assert.equal(arena.rank, 'D');
  assert.deepEqual(arena.battleHistory, []);
});
