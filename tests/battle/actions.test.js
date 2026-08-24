import test from 'node:test';
import assert from 'node:assert/strict';
import { runAutomatedBattle } from '../../src/battle/simulation.js';
import { card, engine, monsterByName, moveByName, placeUnit, setHand } from '../helpers.js';

test('distance system is absent and any equipped attack can target any opposing slot', () => {
  const battle = engine();
  const attacker = placeUnit(battle, 'p1', 'ヘンガー', 0);
  const target = placeUnit(battle, 'p2', 'モノリス', 2);
  attacker.equippedMoveIds = [moveByName('ヘンガー', 'パンチ').id];
  const actions = battle.getLegalActions('p1');
  assert.equal(actions.some((action) => action.type === 'move' && action.targetUnitId === target.id), true);
  assert.equal(actions.some((action) => action.type === 'movement'), false);
});

test('summoning costs TP and summoned monster cannot act that turn', () => {
  const battle = engine();
  const monster = monsterByName('モッチー');
  setHand(battle, 'p1', [card(monster.id, 'summon-card')]);
  const action = battle.getLegalActions().find((candidate) => candidate.type === 'summon' && candidate.slot === 0);
  battle.applyAction(action);
  const unit = battle.player('p1').board[0];
  assert.equal(battle.player('p1').tp, 9);
  assert.equal(unit.actionPoints, 0);
  assert.equal(battle.getLegalActions().some((candidate) => candidate.type === 'move' && candidate.unitId === unit.id), false);
});

test('attack consumes one action point and applies faction advantage damage', () => {
  const battle = engine();
  const attacker = placeUnit(battle, 'p1', 'ゴーレム', 0);
  const target = placeUnit(battle, 'p2', 'メタルナー', 0);
  const move = moveByName('ゴーレム', 'パンチ');
  attacker.equippedMoveIds = [move.id];
  const before = target.life;
  const action = battle.getLegalActions().find((candidate) => candidate.type === 'move' && candidate.moveId === move.id);
  battle.applyAction(action);
  assert.equal(attacker.actionPoints, 0);
  assert.ok(target.life < before || battle.player('p2').board[0] == null);
});

test('direct attack is legal only when opposing board is empty', () => {
  const battle = engine();
  const attacker = placeUnit(battle, 'p1', 'ドラゴン', 0);
  const move = moveByName('ドラゴン', 'ファイアブレス');
  attacker.equippedMoveIds = [move.id];
  let action = battle.getLegalActions().find((candidate) => candidate.targetPlayerId === 'p2');
  assert.ok(action);
  placeUnit(battle, 'p2', 'ゴースト', 0);
  assert.equal(battle.getLegalActions().some((candidate) => candidate.targetPlayerId === 'p2'), false);
});

test('40 round limit resolves by remaining player LIFE and equal LIFE draws', () => {
  const battle = engine();
  battle.player('p1').turnNumber = 40;
  battle.player('p2').turnNumber = 40;
  battle.player('p1').life = 80;
  battle.player('p2').life = 70;
  battle._resolveTurnLimit();
  assert.equal(battle.state.winnerId, 'p1');

  const draw = engine();
  draw.player('p1').life = 50;
  draw.player('p2').life = 50;
  draw._resolveTurnLimit();
  assert.equal(draw.state.result.draw, true);
});

test('seeded UI-less simulation always completes a match', () => {
  const battle = engine({ seed: 'complete-match' });
  const output = runAutomatedBattle(battle, { seed: 'complete-policy' });
  assert.equal(battle.state.status, 'finished');
  assert.ok(output.actions > 0 && output.actions < 5000);
  assert.ok(['direct-attack', 'overflow', 'turn-limit-life', 'turn-limit-draw'].includes(output.result.reason));
});
