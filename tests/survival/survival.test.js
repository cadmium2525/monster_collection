import test from 'node:test';
import assert from 'node:assert/strict';
import { createMasterIndex } from '../../src/data/master-loader.js';
import { createBaselineDeck } from '../../src/data/default-decks.js';
import { SurvivalRun } from '../../src/survival/SurvivalRun.js';
import { generateSurvivalOpponent, survivalDifficulty } from '../../src/survival/SurvivalCpuGenerator.js';
import { recordSurvivalCompletion, survivalRewardForStreak } from '../../src/survival/SurvivalReward.js';
import { applyProgressionOperation, defaultEconomyState } from '../../src/gacha/economy-state.js';
import { runSurvivalPlaytest } from '../../src/survival/playtest-lab.js';

import { masterData } from '../helpers.js';

const masterIndex = createMasterIndex(masterData);

function playerDeck() {
  return {
    deckId: 'survival-deck',
    deckName: '鍛えた40枚',
    cards: createBaselineDeck(masterData, 'survival-player'),
    totalPlayTp: 100,
    representativeMonsterId: 'monster-001',
  };
}

test('survival difficulty reaches Legend on battle three and keeps scaling without a ceiling', () => {
  assert.deepEqual(survivalDifficulty(0), { battleNumber: 1, deckRank: 'silver', aiLevel: 'silver', virtualGrowthRounds: 0 });
  assert.deepEqual(survivalDifficulty(1), { battleNumber: 2, deckRank: 'gold', aiLevel: 'gold', virtualGrowthRounds: 0 });
  assert.deepEqual(survivalDifficulty(2), { battleNumber: 3, deckRank: 'legend', aiLevel: 'legend', virtualGrowthRounds: 2 });
  assert.equal(survivalDifficulty(30).virtualGrowthRounds, 40);
});

test('same survival seed and streak generate the exact same CPU snapshot', () => {
  const first = generateSurvivalOpponent({ masterData, masterIndex, seed: 'repeatable-run', currentStreak: 7 });
  const second = generateSurvivalOpponent({ masterData, masterIndex, seed: 'repeatable-run', currentStreak: 7 });
  assert.deepEqual(first, second);
  assert.equal(first.aiLevel, 'legend');
  assert.equal(first.virtualMatchWins, 9);
});

test('survival carries player life and fully recovers after each fifth win', () => {
  const run = new SurvivalRun({ masterData, playerDeck: playerDeck(), seed: 'life-carry' });
  for (let win = 1; win <= 4; win += 1) {
    const result = run.recordWin({ growth: {}, remainingPlayerLife: 73 - win });
    assert.equal(result.recovered, false);
    assert.equal(run.state.carriedPlayerLife, 73 - win);
  }
  const fifth = run.recordWin({ growth: {}, remainingPlayerLife: 12 });
  assert.equal(fifth.recovered, true);
  assert.equal(run.state.carriedPlayerLife, 100);
});

test('survival checkpoint restores the exact next opponent, growth and life', () => {
  const run = new SurvivalRun({ masterData, playerDeck: playerDeck(), seed: 'checkpoint-run' });
  const monsterCard = run.state.playerDeck.cards.find((card) => masterIndex.cards.get(card.masterId)?.kind === 'monster');
  run.recordWin({ growth: { [monsterCard.instanceId]: { life: 5, atk: 10, def: 0 } }, remainingPlayerLife: 61 });
  const restored = SurvivalRun.fromCheckpoint({ masterData, checkpoint: run.toCheckpoint() });
  assert.deepEqual(restored.toJSON(), run.toJSON());
});

test('survival rewards are deterministic, milestone-based and idempotent', () => {
  assert.deepEqual(survivalRewardForStreak(5, 4), {
    streak: 5, baseDiamonds: 550, bestBonusDiamonds: 100, diamonds: 650,
    packCredits: 1, newBest: true, crossedMilestones: 1,
  });
  assert.equal(survivalRewardForStreak(25, 0).packCredits, 5);
  assert.equal(survivalRewardForStreak(25, 0).baseDiamonds, 6000);
  assert.equal(survivalRewardForStreak(30, 0).baseDiamonds, 6000);
  const first = recordSurvivalCompletion({}, { operationId: 'survival-result-1', streak: 7 }, '2026-09-08T00:00:00.000Z');
  assert.equal(first.progress.bestStreak, 7);
  assert.equal(first.reward.diamonds, 980);
  const repeated = recordSurvivalCompletion(first.progress, { operationId: 'survival-result-1', streak: 7 }, '2026-09-08T00:01:00.000Z');
  assert.equal(repeated.reward, null);
  assert.equal(repeated.progress.totalRuns, 1);
});

test('economy credits a completed survival run exactly once', () => {
  const economy = defaultEconomyState('2026-09-08');
  const first = applyProgressionOperation(economy, {
    type: 'survival-result', operationId: 'survival:run-1:result', streak: 5, dateKey: '2026-09-08',
  }, '2026-09-08T03:00:00.000Z');
  assert.equal(first.diamonds, economy.diamonds + 650);
  assert.equal(first.freePackCredits, economy.freePackCredits + 1);
  assert.equal(first.survivalProgress.bestStreak, 5);
  const repeated = applyProgressionOperation(first, {
    type: 'survival-result', operationId: 'survival:run-1:result', streak: 5, dateKey: '2026-09-08',
  }, '2026-09-08T03:01:00.000Z');
  assert.equal(repeated.diamonds, first.diamonds);
  assert.equal(repeated.freePackCredits, first.freePackCredits);
  assert.equal(repeated.survivalProgress.totalRuns, 1);
});

test('the same survival seed reproduces the complete automated result trace', () => {
  const options = { masterData, seed: 'survival-result-replay', maxBattles: 3 };
  const first = runSurvivalPlaytest(options);
  const replay = runSurvivalPlaytest(options);
  assert.deepEqual(replay, first);
});
