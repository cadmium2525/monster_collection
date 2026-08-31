import test from 'node:test';
import assert from 'node:assert/strict';
import { defenseIgnore, resolvedMovePower, resolvedMoveTp } from '../../src/battle/effects.js';
import { MOVE_NAME_OVERRIDES } from '../../src/data/move-name-overrides.js';
import { engine, masterData, placeUnit } from '../helpers.js';

function move(id) {
  return masterData.moves.find((candidate) => candidate.id === id);
}

test('approved move names are attached to stable move ids', () => {
  assert.equal(Object.keys(MOVE_NAME_OVERRIDES).length, 44);
  for (const [id, name] of Object.entries(MOVE_NAME_OVERRIDES)) {
    assert.equal(move(id)?.name, name, id);
  }
  assert.equal(move('move-051').name, 'ドラゴンパンチ', 'the Dragon move was not part of the Kongo rename');
});

test('every shugyo pool name resolves to a current move for its monster', () => {
  for (const [monsterName, pools] of Object.entries(masterData.shugyoPools)) {
    const currentNames = new Set(masterData.moves
      .filter((candidate) => candidate.monsterName === monsterName)
      .map((candidate) => candidate.name));
    for (const name of [...pools.attack, ...pools.defense]) {
      assert.equal(currentNames.has(name), true, `${monsterName}: ${name}`);
    }
  }
});

test('renamed move effects remain keyed to stable ids', () => {
  const battle = engine();
  const player = battle.player('p1');
  const target = placeUnit(battle, 'p2', 'ゴーレム', 0);

  const lumirabi = placeUnit(battle, 'p1', 'ルミラビ', 0);
  lumirabi.life = Math.floor(lumirabi.maxLife / 2);
  assert.equal(resolvedMoveTp(player, lumirabi, target, move('move-011')), move('move-011').tp - 1);
  assert.equal(resolvedMovePower(lumirabi, target, move('move-014')), 130);
  assert.equal(resolvedMovePower(lumirabi, target, move('move-018')), 150);

  const arcana = placeUnit(battle, 'p1', 'アルカナロード', 1);
  assert.equal(resolvedMoveTp(player, arcana, target, move('move-158')), move('move-158').tp - 1);
  assert.equal(resolvedMovePower(arcana, target, move('move-156')), 140);
  assert.equal(resolvedMovePower(arcana, target, move('move-159')), 150);

  const joker = placeUnit(battle, 'p1', 'ジョーカー', 2);
  target.life = Math.floor(target.maxLife / 2);
  assert.equal(resolvedMoveTp(player, joker, target, move('move-084')), move('move-084').tp - 1);
  assert.equal(defenseIgnore(player, joker, target, move('move-090')), 5);

  const knight = placeUnit(battle, 'p2', 'デュラハン', 1);
  knight.statuses.knightWill = true;
  assert.equal(resolvedMovePower(knight, joker, move('move-039')), 150);
});

test('the renamed Monolith defense form remains limited to once per battle', () => {
  const battle = engine();
  const monolith = placeUnit(battle, 'p1', 'モノリス', 0);
  monolith.equippedMoveIds = ['move-111'];
  monolith.summonedThisTurn = false;
  monolith.actionPoints = 1;
  battle.player('p1').tp = 10;

  assert.equal(battle.getLegalActions().some((action) => action.moveId === 'move-111'), true);
  monolith.statuses.formAlphaUsed = true;
  assert.equal(battle.getLegalActions().some((action) => action.moveId === 'move-111'), false);
});
