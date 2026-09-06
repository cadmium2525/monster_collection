import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDeckStrategy, analyzePlayerStrategy } from '../../src/ai/deck-strategy.js';
import { chooseAiAction } from '../../src/ai/levels.js';
import { SeededRng } from '../../src/core/rng.js';
import { card, engine, masterIndex, placeUnit, setHand } from '../helpers.js';

function cards(ids) {
  return ids.map((masterId, index) => ({ instanceId: `strategy-${index}`, masterId }));
}

test('deck strategy detects a focused faction, combo package and ace route from arbitrary cards', () => {
  const strategy = analyzeDeckStrategy(cards([
    'monster-022', 'monster-022', 'monster-022',
    'monster-023', 'monster-023', 'monster-023',
    'monster-010', 'monster-011', 'monster-012', 'monster-028',
    'breeder-062', 'breeder-062', 'breeder-063', 'breeder-063',
  ]), masterIndex);
  assert.equal(strategy.archetype, '魔族');
  assert.equal(strategy.primaryFaction, '魔族');
  assert.equal(strategy.activeCombo?.id, 'blood-debt');
  assert.equal(strategy.ace?.name, 'フェンリルノクス');
  assert.deepEqual(strategy.preferredFusionIds.slice(0, 1), [strategy.ace.id]);
});

test('deck strategy keeps evenly split decks as balanced while retaining multiple plans', () => {
  const strategy = analyzeDeckStrategy(cards([
    'monster-001', 'monster-002', 'monster-003',
    'monster-004', 'monster-005', 'monster-006',
    'monster-007', 'monster-008', 'monster-009',
    'monster-010', 'monster-011', 'monster-012',
  ]), masterIndex);
  assert.equal(strategy.archetype, 'バランス');
  assert.ok(strategy.fusionRoutes.length > 1);
  assert.ok(strategy.preferredFusionIds.length > 1);
});

test('player strategy can recover the original plan after cards move into field zones', () => {
  const battle = engine();
  battle.player('p1').deck = [];
  battle.player('p1').hand = [];
  battle.player('p1').graveyard = [];
  battle.player('p1').setAside = [];
  placeUnit(battle, 'p1', 'モノリス', 0);
  const after = analyzePlayerStrategy(battle, 'p1');
  assert.equal(after.monsterTotal, 1);
  assert.equal(after.primaryFaction, '機鋼');
  assert.equal(after.playerId, 'p1');
});

test('Legend AI sequences blood ignition before the enhanced blood debt payoff', () => {
  const battle = engine();
  const demon = placeUnit(battle, 'p1', 'ドラゴン', 0);
  demon.actionPoints = 0;
  setHand(battle, 'p1', [card('breeder-062', 'ignition'), card('breeder-063', 'debt')]);
  let action = chooseAiAction('legend', battle, 'p1', new SeededRng('demon-plan'), { timeBudgetMs: 1 });
  assert.equal(action.breederId, 'breeder-062');
  battle.applyAction(action);
  action = chooseAiAction('legend', battle, 'p1', new SeededRng('demon-payoff'), { timeBudgetMs: 1 });
  assert.equal(action.breederId, 'breeder-063');
  assert.equal(action.targetUnitId, demon.id);
});
