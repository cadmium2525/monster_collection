import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveAtk } from '../../src/battle/state.js';
import { card, engine, placeUnit, setHand } from '../helpers.js';

function actionOf(battle, type, predicate = () => true) {
  const action = battle.getLegalActions().find((candidate) => candidate.type === type && predicate(candidate));
  assert.ok(action, `${type} should have a legal action`);
  return action;
}

function useBreeder(battle, breederId, targetUnitId) {
  setHand(battle, 'p1', [card(breederId, `play-${breederId}`)]);
  battle.applyAction(actionOf(battle, 'breeder', (action) => (
    action.breederId === breederId && action.targetUnitId === targetUnitId
  )));
}

function endTurn(battle) {
  battle.applyAction(actionOf(battle, 'end-turn'));
}

test('封印の鎖 blocks only attack techniques during the selected enemy next turn', () => {
  const battle = engine();
  const sealed = placeUnit(battle, 'p2', 'モノリス', 0);
  sealed.equippedMoveIds = ['move-109', 'move-111'];

  useBreeder(battle, 'breeder-053', sealed.id);
  endTurn(battle);

  const sealedTurnMoves = battle.getLegalActions().filter((action) => action.type === 'move' && action.unitId === sealed.id);
  assert.deepEqual(sealedTurnMoves.map((action) => action.moveId), ['move-111']);
  assert.equal(sealed.statuses.attackSeal.activeTurn, battle.player('p2').turnNumber);

  endTurn(battle);
  endTurn(battle);
  const followingTurnMoves = battle.getLegalActions().filter((action) => action.type === 'move' && action.unitId === sealed.id);
  assert.deepEqual(new Set(followingTurnMoves.map((action) => action.moveId)), new Set(['move-109', 'move-111']));
  assert.equal(sealed.statuses.attackSeal, null);
});

test('粛清 offers every tied highest-ATK unit and sends the chosen one directly to the graveyard', () => {
  const battle = engine();
  const ownHighest = placeUnit(battle, 'p1', 'ドラゴン', 0);
  const enemyHighest = placeUnit(battle, 'p2', 'ゴーレム', 0);
  const enemyLower = placeUnit(battle, 'p2', 'ルミラビ', 1);
  ownHighest.atkBase = 80;
  enemyHighest.atkBase = 80;
  enemyHighest.statuses.spareParts = true;
  enemyLower.atkBase = 70;
  setHand(battle, 'p1', [card('breeder-054', 'play-breeder-054')]);

  const targets = battle.getLegalActions()
    .filter((action) => action.type === 'breeder' && action.breederId === 'breeder-054');
  assert.deepEqual(new Set(targets.map((action) => action.targetUnitId)), new Set([ownHighest.id, enemyHighest.id]));
  assert.equal(targets.every((action) => /味方|敵/.test(action.label)), true);
  assert.equal(effectiveAtk(enemyLower), 70);

  battle.applyAction(targets.find((action) => action.targetUnitId === enemyHighest.id));
  assert.equal(battle.player('p2').board.includes(enemyHighest), false);
  assert.equal(battle.player('p2').graveyard.some((entry) => entry.instanceId === enemyHighest.sourceCardInstanceId), true);
  assert.equal(battle.player('p1').board.includes(ownHighest), true);
});

test('道連れの契約 sends the destroying attacker to the graveyard only during the next enemy turn', () => {
  const battle = engine();
  const contracted = placeUnit(battle, 'p1', 'ルミラビ', 0, { life: 1 });
  const attacker = placeUnit(battle, 'p2', 'ゴーレム', 0);
  attacker.atkBase = 200;
  attacker.equippedMoveIds = ['move-127'];

  useBreeder(battle, 'breeder-055', contracted.id);
  endTurn(battle);
  battle.applyAction(actionOf(battle, 'move', (action) => action.unitId === attacker.id && action.targetUnitId === contracted.id));

  assert.equal(battle.player('p1').board.includes(contracted), false);
  assert.equal(battle.player('p2').board.includes(attacker), false);
  assert.equal(battle.player('p2').graveyard.some((entry) => entry.instanceId === attacker.sourceCardInstanceId), true);
  assert.ok(battle.getState().log.some((entry) => entry.type === 'death-pact'));

  const expired = engine({ seed: 'expired-death-pact' });
  const survivor = placeUnit(expired, 'p1', 'ルミラビ', 0, { life: 1 });
  const lateAttacker = placeUnit(expired, 'p2', 'ゴーレム', 0);
  lateAttacker.atkBase = 200;
  lateAttacker.equippedMoveIds = ['move-127'];
  useBreeder(expired, 'breeder-055', survivor.id);
  endTurn(expired);
  endTurn(expired);
  assert.equal(survivor.statuses.deathPact, null);
  endTurn(expired);
  expired.applyAction(actionOf(expired, 'move', (action) => action.unitId === lateAttacker.id && action.targetUnitId === survivor.id));
  assert.equal(expired.player('p2').board.includes(lateAttacker), true);
});
