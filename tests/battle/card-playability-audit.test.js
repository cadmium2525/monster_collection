import test from 'node:test';
import assert from 'node:assert/strict';
import { card, engine, masterData, placeUnit, setHand } from '../helpers.js';

test('every monster card can generate and resolve a summon action', () => {
  for (const monster of masterData.monsters) {
    const battle = engine({ seed: `summon-audit-${monster.id}` });
    const player = battle.player('p1');
    player.tp = 100;
    player.maxTp = 100;
    setHand(battle, 'p1', [card(monster.id, `summon-audit-card-${monster.id}`)]);

    const action = battle.getLegalActions().find((candidate) => candidate.type === 'summon'
      && candidate.cardInstanceId === `summon-audit-card-${monster.id}`);
    assert.ok(action, `${monster.id} ${monster.name} should be summonable`);
    assert.doesNotThrow(() => battle.applyAction(action), `${monster.id} ${monster.name} summon should resolve`);
  }
});

test('every training and shugyo card can generate and resolve its action', () => {
  for (const definition of masterData.growthCards) {
    const battle = engine({ seed: `growth-audit-${definition.id}` });
    const player = battle.player('p1');
    const unit = placeUnit(battle, 'p1', 'クロノギア', 0);
    player.tp = 100;
    player.maxTp = 100;
    setHand(battle, 'p1', [card(definition.id, `growth-audit-card-${definition.id}`)]);

    const action = battle.getLegalActions().find((candidate) => candidate.type === definition.kind
      && candidate.cardInstanceId === `growth-audit-card-${definition.id}`
      && candidate.unitId === unit.id);
    assert.ok(action, `${definition.id} ${definition.name} should be usable`);
    assert.doesNotThrow(() => battle.applyAction(action), `${definition.id} ${definition.name} should resolve`);
  }
});

test('all 270 moves can generate and resolve an action for their owning monster', () => {
  for (const move of masterData.moves) {
    const battle = engine({ seed: `move-audit-${move.id}` });
    const player = battle.player('p1');
    const unit = placeUnit(battle, 'p1', move.monsterName, 0);
    placeUnit(battle, 'p2', 'ゴーレム', 0);
    unit.equippedMoveIds = [move.id];
    unit.learnedMoveIds = [move.id];
    player.tp = 100;
    player.maxTp = 100;

    const action = battle.getLegalActions().find((candidate) => candidate.type === 'move'
      && candidate.unitId === unit.id && candidate.moveId === move.id);
    assert.ok(action, `${move.id} ${move.monsterName}：${move.name} should be usable`);
    assert.doesNotThrow(() => battle.applyAction(action), `${move.id} ${move.monsterName}：${move.name} should resolve`);
  }
});
