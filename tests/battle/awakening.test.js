import test from 'node:test';
import assert from 'node:assert/strict';
import { AWAKENING_ABILITIES, BASE_AWAKENINGS, FUSION_AWAKENINGS } from '../../src/battle/awakening-data.js';
import { RULES } from '../../src/battle/rules.js';
import { engine, masterData, placeUnit } from '../helpers.js';

test('all 30 base monsters and all 60 special fusions have a unique awakening ability', () => {
  assert.equal(Object.keys(BASE_AWAKENINGS).length, 30);
  assert.equal(Object.keys(FUSION_AWAKENINGS).length, 60);
  assert.equal(AWAKENING_ABILITIES.length, 90);
  assert.equal(new Set(AWAKENING_ABILITIES.map((ability) => ability.id)).size, 90);
  assert.deepEqual(
    new Set(Object.keys(BASE_AWAKENINGS)),
    new Set(masterData.monsters.map((monster) => monster.name)),
  );
  assert.deepEqual(
    new Set(Object.keys(FUSION_AWAKENINGS)),
    new Set(masterData.fusions.map((fusion) => fusion.name)),
  );
  for (const ability of AWAKENING_ABILITIES) {
    assert.ok(ability.name && ability.effect && ability.limit);
  }
});

test('awakening unlock is announced only for the second player at turn 10', () => {
  const battle = engine({ firstPlayerId: 'p1', seed: 'awakening-unlock' });
  const second = battle.player('p2');
  battle.state.log = [];
  second.turnNumber = RULES.secondAwakeningTurn - 1;
  battle._startTurn(second.id);
  const unlocks = battle.state.log.filter((event) => event.type === 'awakening-unlocked');
  assert.equal(unlocks.length, 1);
  assert.equal(unlocks[0].turnNumber, 10);

  const first = battle.player('p1');
  battle.state.log = [];
  first.turnNumber = RULES.secondAwakeningTurn - 1;
  battle._startTurn(first.id);
  assert.equal(battle.state.log.some((event) => event.type === 'awakening-unlocked'), false);
});

test('second player can awaken once by sending another non-summoning-sick ally to graveyard', () => {
  const battle = engine({ firstPlayerId: 'p1', seed: 'awakening-action' });
  const player = battle.player('p2');
  battle.state.currentPlayerId = player.id;
  player.turnNumber = RULES.secondAwakeningTurn;
  const target = placeUnit(battle, player.id, 'ギアセンチネル', 0);
  const material = placeUnit(battle, player.id, 'ゴーレム', 1);
  const before = { life: target.life, maxLife: target.maxLife, atk: target.atkBase, def: target.defBase };
  const action = battle.getLegalActions(player.id).find((candidate) => candidate.type === 'awaken'
    && candidate.unitId === target.id && candidate.materialUnitId === material.id);
  assert.ok(action);
  battle.applyAction(action);

  assert.equal(player.board[1], null);
  assert.equal(player.graveyard.some((card) => card.instanceId === material.sourceCardInstanceId), true);
  assert.equal(player.metrics.knockouts, 0);
  assert.equal(player.awakeningUsed, true);
  assert.equal(player.metrics.awakenings, 1);
  assert.equal(target.awakened, true);
  assert.equal(target.awakeningAbilityName, '零式装甲演算');
  assert.equal(target.life, before.life + 15);
  assert.equal(target.maxLife, before.maxLife + 15);
  assert.equal(target.atkBase, before.atk + 15);
  assert.equal(target.defBase, before.def + 15);
  assert.equal(battle.getLegalActions(player.id).some((candidate) => candidate.type === 'awaken'), false);
  assert.equal(battle.getLegalActions(player.id).some((candidate) => candidate.type.startsWith('fusion-') && candidate.unitId === target.id), false);
});

test('summoning-sick monsters are never offered as awakening material', () => {
  const battle = engine({ firstPlayerId: 'p1', seed: 'awakening-material-sickness' });
  const player = battle.player('p2');
  battle.state.currentPlayerId = player.id;
  player.turnNumber = RULES.secondAwakeningTurn;
  const target = placeUnit(battle, player.id, 'モノリス', 0);
  const sick = placeUnit(battle, player.id, 'ゴーレム', 1, { summonedThisTurn: true });
  assert.equal(battle.getLegalActions(player.id).some((candidate) => candidate.type === 'awaken'
    && candidate.unitId === target.id && candidate.materialUnitId === sick.id), false);
});

