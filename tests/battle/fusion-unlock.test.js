import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../../src/battle/rules.js';
import { engine } from '../helpers.js';

test('fusion unlock is announced exactly when the second player starts turn 5', () => {
  const battle = engine({ firstPlayerId: 'p1', seed: 'fusion-unlock-turn' });
  const second = battle.player('p2');
  battle.state.log = [];

  second.turnNumber = RULES.secondFusionTurn - 2;
  battle._startTurn(second.id);
  assert.equal(battle.state.log.some((event) => event.type === 'fusion-unlocked'), false);

  battle._startTurn(second.id);
  const unlocks = battle.state.log.filter((event) => event.type === 'fusion-unlocked');
  assert.equal(unlocks.length, 1);
  assert.equal(unlocks[0].playerId, second.id);
  assert.equal(unlocks[0].turnNumber, RULES.secondFusionTurn);
  assert.match(unlocks[0].message, /合体が解禁/);

  battle._startTurn(second.id);
  assert.equal(battle.state.log.filter((event) => event.type === 'fusion-unlocked').length, 1);
});

test('first player turn 5 does not show the second-player fusion unlock ceremony', () => {
  const battle = engine({ firstPlayerId: 'p1', seed: 'no-first-turn-five-unlock' });
  const first = battle.player('p1');
  battle.state.log = [];
  first.turnNumber = 4;
  battle._startTurn(first.id);
  assert.equal(battle.state.log.some((event) => event.type === 'fusion-unlocked'), false);
});
