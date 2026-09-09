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

test('deck strategy prefers the stronger completed fusion when recipe copy counts tie', () => {
  const strategy = analyzeDeckStrategy(cards([
    ...Array(3).fill('monster-027'),
    ...Array(3).fill('monster-005'),
    ...Array(3).fill('monster-006'),
    ...Array(3).fill('monster-008'),
  ]), masterIndex);
  assert.equal(strategy.primaryFaction, '幻霊');
  assert.equal(strategy.ace?.id, 'fusion-053');
  assert.equal(strategy.ace?.name, 'アストラカスミヨ');
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

test('Legend AI does not burn the blood combo while its target cannot attack', () => {
  const battle = engine();
  const demon = placeUnit(battle, 'p1', 'ドラゴン', 0);
  demon.actionPoints = 0;
  setHand(battle, 'p1', [card('breeder-062', 'ignition'), card('breeder-063', 'debt')]);
  const action = chooseAiAction('legend', battle, 'p1', new SeededRng('demon-hold'), { timeBudgetMs: 1 });
  assert.equal(action.type, 'end-turn');
});

test('Legend AI reserves TP and sequences blood ignition, debt, then an attack', () => {
  const battle = engine();
  const demon = placeUnit(battle, 'p1', 'ドラゴン', 0);
  const target = placeUnit(battle, 'p2', 'ゴーレム', 0);
  target.maxLife = 500;
  target.life = 500;
  battle.player('p1').maxTp = 10;
  battle.player('p1').tp = 10;
  setHand(battle, 'p1', [card('breeder-062', 'ignition'), card('breeder-063', 'debt')]);
  let action = chooseAiAction('legend', battle, 'p1', new SeededRng('demon-plan'), { timeBudgetMs: 1 });
  assert.equal(action.breederId, 'breeder-062');
  battle.applyAction(action);
  action = chooseAiAction('legend', battle, 'p1', new SeededRng('demon-payoff'), { timeBudgetMs: 1 });
  assert.equal(action.breederId, 'breeder-063');
  assert.equal(action.targetUnitId, demon.id);
  battle.applyAction(action);
  action = chooseAiAction('legend', battle, 'p1', new SeededRng('demon-attack'), { timeBudgetMs: 1 });
  assert.equal(action.type, 'move');
  assert.equal(action.unitId, demon.id);
  assert.equal(action.targetUnitId, target.id);
});

test('Legend AI keeps blood ignition and debt on the same damaging attacker', () => {
  const battle = engine();
  const weak = placeUnit(battle, 'p1', 'デュラハン', 0);
  const strong = placeUnit(battle, 'p1', 'ドラゴン', 1);
  const target = placeUnit(battle, 'p2', 'ゴーレム', 0);
  target.maxLife = 500;
  target.life = 500;
  target.defBase = 1;
  battle.player('p1').maxTp = 10;
  battle.player('p1').tp = 10;
  setHand(battle, 'p1', [card('breeder-062', 'ignition'), card('breeder-063', 'debt')]);

  let action = chooseAiAction('legend', battle, 'p1', new SeededRng('demon-best-attacker'), { timeBudgetMs: 1 });
  assert.equal(action.breederId, 'breeder-062');
  assert.equal(action.targetUnitId, strong.id);
  battle.applyAction(action);

  action = chooseAiAction('legend', battle, 'p1', new SeededRng('demon-same-attacker'), { timeBudgetMs: 1 });
  assert.equal(action.breederId, 'breeder-063');
  assert.equal(action.targetUnitId, strong.id);
  assert.notEqual(action.targetUnitId, weak.id);
});

test('Legend AI does not self-harm for a blood combo that cannot deal meaningful damage', () => {
  const battle = engine();
  const demon = placeUnit(battle, 'p1', 'デュラハン', 0);
  const target = placeUnit(battle, 'p2', 'ゴーレム', 0);
  target.maxLife = 500;
  target.life = 500;
  target.defBase = 500;
  battle.player('p1').maxTp = 10;
  battle.player('p1').tp = 10;
  setHand(battle, 'p1', [card('breeder-062', 'ignition'), card('breeder-063', 'debt')]);

  const action = chooseAiAction('legend', battle, 'p1', new SeededRng('demon-no-damage'), { timeBudgetMs: 1 });
  assert.notEqual(action.breederId, 'breeder-062');
  assert.equal(demon.statuses.nextDamageBonus, 0);
});

function explicitAceStrategy({ id, mainId, materialId, faction, combos = [] }) {
  return {
    playerId: 'p1',
    ace: { id, mainId, materialId, faction },
    preferredFusionIds: [id],
    combos,
  };
}

test('Legend AI reserves TP to summon its ace, apply fusion boost and complete the special fusion', () => {
  const battle = engine();
  battle.player('p1').board = [null, null, null];
  battle.player('p1').turnNumber = 6;
  battle.player('p1').maxTp = 10;
  battle.player('p1').tp = 10;
  setHand(battle, 'p1', [
    card('monster-025', 'ace-main'),
    card('monster-017', 'ace-material'),
    card('breeder-023', 'fusion-boost'),
  ]);
  const strategy = explicitAceStrategy({
    id: 'fusion-049',
    mainId: 'monster-025',
    materialId: 'monster-017',
    faction: '機鋼',
  });

  let action = chooseAiAction('legend', battle, 'p1', new SeededRng('ace-summon'), { strategy, timeBudgetMs: 1 });
  assert.equal(action.type, 'summon');
  assert.equal(action.cardInstanceId, 'ace-main');
  battle.applyAction(action);

  action = chooseAiAction('legend', battle, 'p1', new SeededRng('ace-boost'), { strategy, timeBudgetMs: 1 });
  assert.equal(action.type, 'breeder');
  assert.equal(action.breederId, 'breeder-023');
  battle.applyAction(action);

  action = chooseAiAction('legend', battle, 'p1', new SeededRng('ace-fuse'), { strategy, timeBudgetMs: 1 });
  assert.equal(action.type, 'fusion-special');
  assert.equal(action.fusionId, 'fusion-049');
  assert.equal(action.materialCardInstanceId, 'ace-material');
});

test('Legend AI does not summon or discard the last accessible ace material', () => {
  const battle = engine();
  placeUnit(battle, 'p1', 'ミメシア', 0);
  battle.player('p1').turnNumber = 1;
  battle.player('p1').maxTp = 10;
  battle.player('p1').tp = 10;
  setHand(battle, 'p1', [card('breeder-066', 'inheritance'), card('monster-003', 'ace-material')]);
  const strategy = explicitAceStrategy({
    id: 'fusion-059',
    mainId: 'monster-030',
    materialId: 'monster-003',
    faction: '怪物',
    combos: [{
      id: 'remnant-inheritance',
      faction: '怪物',
      setupId: 'breeder-066',
      payoffId: 'breeder-067',
      completeCopies: 1,
    }],
  });

  const action = chooseAiAction('legend', battle, 'p1', new SeededRng('ace-material-hold'), { strategy, timeBudgetMs: 1 });
  assert.notEqual(action.type, 'summon');
  assert.notEqual(action.materialCardInstanceId, 'ace-material');
});

test('Legend AI material search selects the missing ace component from the inspected five', () => {
  const battle = engine();
  placeUnit(battle, 'p1', 'アークヴァルキア', 0);
  battle.player('p1').maxTp = 10;
  battle.player('p1').tp = 10;
  battle.player('p1').deck = [
    card('training-life', 'search-1'),
    card('monster-001', 'other-monster'),
    card('training-atk', 'search-2'),
    card('monster-017', 'missing-material'),
    card('training-def', 'search-3'),
  ];
  setHand(battle, 'p1', [card('breeder-022', 'material-search')]);
  const strategy = explicitAceStrategy({
    id: 'fusion-049',
    mainId: 'monster-025',
    materialId: 'monster-017',
    faction: '機鋼',
  });

  const action = chooseAiAction('legend', battle, 'p1', new SeededRng('ace-search'), { strategy, timeBudgetMs: 1 });
  assert.equal(action.breederId, 'breeder-022');
  assert.equal(action.chosenCardInstanceId, 'missing-material');
});

test('Legend AI only arms pressure armor when a visible attack can build its payoff charge', () => {
  const combo = [{
    id: 'pressure-release',
    faction: '機鋼',
    setupId: 'breeder-056',
    payoffId: 'breeder-057',
    completeCopies: 1,
  }];
  const strategy = { playerId: 'p1', ace: null, preferredFusionIds: [], combos: combo };

  const weakBattle = engine();
  placeUnit(weakBattle, 'p1', 'ギアセンチネル', 0);
  const weakAttacker = placeUnit(weakBattle, 'p2', 'ルミラビ', 0);
  weakAttacker.atkBase = 1;
  weakBattle.player('p1').maxTp = 10;
  weakBattle.player('p1').tp = 10;
  setHand(weakBattle, 'p1', [card('breeder-056', 'weak-armor'), card('breeder-057', 'weak-release')]);
  let action = chooseAiAction('legend', weakBattle, 'p1', new SeededRng('pressure-hold'), { strategy, timeBudgetMs: 1 });
  assert.notEqual(action.breederId, 'breeder-056');

  const strongBattle = engine();
  const machine = placeUnit(strongBattle, 'p1', 'ギアセンチネル', 0);
  const strongAttacker = placeUnit(strongBattle, 'p2', 'ドラゴン', 0);
  strongAttacker.atkBase = 100;
  strongBattle.player('p1').maxTp = 10;
  strongBattle.player('p1').tp = 10;
  setHand(strongBattle, 'p1', [card('breeder-056', 'strong-armor'), card('breeder-057', 'strong-release')]);
  action = chooseAiAction('legend', strongBattle, 'p1', new SeededRng('pressure-arm'), { strategy, timeBudgetMs: 1 });
  assert.equal(action.breederId, 'breeder-056');
  assert.equal(action.targetUnitId, machine.id);
});
