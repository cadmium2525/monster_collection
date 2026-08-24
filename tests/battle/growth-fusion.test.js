import test from 'node:test';
import assert from 'node:assert/strict';
import { card, engine, monsterByName, moveByName, placeUnit, setHand } from '../helpers.js';

test('Training costs 2 TP, grants +5, and records tournament growth', () => {
  const battle = engine();
  const unit = placeUnit(battle, 'p1', 'ドラゴン', 0);
  setHand(battle, 'p1', [card('training-atk', 'training-card')]);
  const before = unit.atkBase;
  const action = battle.getLegalActions().find((candidate) => candidate.type === 'training');
  battle.applyAction(action);
  assert.equal(unit.atkBase, before + 5);
  assert.equal(battle.player('p1').tp, 8);
  assert.equal(battle.getGrowthSnapshot('p1')[unit.sourceCardInstanceId].atk, 5);
});

test('shugyo costs 5 TP, rolls +5..+10 twice, learns up to 9 moves and keeps 4 equipped', () => {
  const battle = engine({ seed: 'shugyo' });
  const unit = placeUnit(battle, 'p1', 'ドラゴン', 0);
  setHand(battle, 'p1', [card('shugyo-attack', 'shugyo-card')]);
  const action = battle.getLegalActions().find((candidate) => candidate.type === 'shugyo');
  const possibleMoveIds = action.preview.possibleMoveIds;
  const beforeLife = unit.maxLife;
  const beforeAtk = unit.atkBase;
  battle.applyAction(action);
  const learnedMoveId = battle.state.log.at(-1).learnedMoveId;
  assert.ok(unit.maxLife - beforeLife >= 5 && unit.maxLife - beforeLife <= 10);
  assert.ok(unit.atkBase - beforeAtk >= 5 && unit.atkBase - beforeAtk <= 10);
  assert.equal(possibleMoveIds.includes(learnedMoveId), true);
  assert.equal(unit.learnedMoveIds.includes(learnedMoveId), true);
  assert.ok(unit.equippedMoveIds.length <= 4);
  assert.equal(battle.player('p1').tp, 5);
});

test('shugyo learns a seeded random technique from the correct attack/defense pool', () => {
  const learned = (seed, cardId) => {
    const battle = engine({ seed });
    placeUnit(battle, 'p1', 'ドラゴン', 0);
    setHand(battle, 'p1', [card(cardId, `${cardId}-${seed}`)]);
    const actions = battle.getLegalActions().filter((candidate) => candidate.type === 'shugyo');
    assert.equal(actions.length, 1, 'one decision per card and target; the result is not chosen by the caller');
    battle.applyAction(actions[0]);
    return battle.state.log.at(-1).learnedMoveId;
  };

  assert.equal(learned('same-seed', 'shugyo-attack'), learned('same-seed', 'shugyo-attack'));
  const attackIds = new Set(['ルインクロス', 'インフェルノ', 'しっぽアタック'].map((name) => moveByName('ドラゴン', name).id));
  const defenseIds = new Set(['ドラゴンラッシュ', 'ドラゴンパンチ', 'ウイングアタック'].map((name) => moveByName('ドラゴン', name).id));
  const attackResults = new Set(Array.from({ length: 24 }, (_, index) => learned(`attack-${index}`, 'shugyo-attack')));
  const defenseResults = new Set(Array.from({ length: 24 }, (_, index) => learned(`defense-${index}`, 'shugyo-defense')));
  assert.ok(attackResults.size > 1, 'different seeds should produce more than one attack technique');
  assert.ok(defenseResults.size > 1, 'different seeds should produce more than one defense technique');
  assert.equal([...attackResults].every((id) => attackIds.has(id)), true);
  assert.equal([...defenseResults].every((id) => defenseIds.has(id)), true);
});

test('fusion is unavailable before first 6 / second 5 and costs 1 or 2 afterward', () => {
  const battle = engine();
  const main = placeUnit(battle, 'p1', 'ピクシー', 0);
  const material = monsterByName('メタルナー');
  setHand(battle, 'p1', [card(material.id, 'fusion-material')]);
  assert.equal(battle.getLegalActions().some((action) => action.type.startsWith('fusion')), false);
  battle.player('p1').turnNumber = 6;
  const actions = battle.getLegalActions();
  assert.equal(actions.some((action) => action.type === 'fusion-normal' && action.cost === 1), true);
  assert.equal(actions.some((action) => action.type === 'fusion-special' && action.cost === 2), true);

  main.actionPoints = 0;
  const special = actions.find((action) => action.type === 'fusion-special');
  battle.applyAction(special);
  assert.equal(main.specialForm, 'フューチャー');
  assert.equal(main.actionPoints, 0, 'fusion must not restore action points');
  assert.equal(battle.player('p1').tp, 8);
});

test('all 36 special recipes are present and set their canonical form/trait', () => {
  for (const fusion of engine().masterData.fusions) {
    const battle = engine({ seed: fusion.id });
    const main = placeUnit(battle, 'p1', fusion.main, 0, { unitId: `main-${fusion.id}` });
    const material = monsterByName(fusion.material);
    setHand(battle, 'p1', [card(material.id, `material-${fusion.id}`)]);
    battle.player('p1').turnNumber = 6;
    const action = battle.getLegalActions().find((candidate) => candidate.type === 'fusion-special' && candidate.fusionId === fusion.id);
    assert.ok(action, fusion.name);
    battle.applyAction(action);
    assert.equal(main.specialForm, fusion.name);
    assert.equal(main.specialTrait, fusion.trait);
  }
});

test('special fusion replaces base-trait statuses but preserves ordinary action state', () => {
  const battle = engine();
  const main = placeUnit(battle, 'p1', 'ゴースト', 0);
  const material = monsterByName('デュラハン');
  setHand(battle, 'p1', [card(material.id, 'ghost-fusion-material')]);
  battle.player('p1').turnNumber = 6;
  main.actionPoints = 0;
  main.statuses.specialReviveUsed = true;
  main.statuses.consecutiveAttackCount = 3;
  assert.equal(main.statuses.evadeNext, true);

  const action = battle.getLegalActions().find((candidate) => candidate.type === 'fusion-special');
  battle.applyAction(action);

  assert.equal(main.specialForm, 'オチムシャ');
  assert.equal(main.statuses.evadeNext, false, 'ゴーストの通常特性は特殊合体後に残さない');
  assert.equal(main.statuses.specialReviveUsed, false, '以前の特殊個体フラグも新形態へ持ち越さない');
  assert.equal(main.statuses.consecutiveAttackCount, 0);
  assert.equal(main.actionPoints, 0, '合体前の行動済み状態は維持する');
});

test('recoil damage does not count as being attacked for special traits', () => {
  const battle = engine();
  const unit = placeUnit(battle, 'p1', 'ワーム', 0);
  unit.specialForm = 'トカゲムシ';
  const beforeDef = unit.defMod;

  battle._selfDamage(battle.player('p1'), unit, 5);

  assert.equal(unit.life, unit.maxLife - 5);
  assert.equal(unit.defMod, beforeDef, '反動で「被攻撃ごとDEF+3」は発動しない');
});

test('move TP and actual four-move data stay inside the monster card', () => {
  const battle = engine();
  const unit = placeUnit(battle, 'p1', 'ライガー', 0);
  const target = placeUnit(battle, 'p2', 'ゴースト', 0);
  const move = moveByName('ライガー', 'かみつき');
  unit.equippedMoveIds = [move.id];
  const action = battle.getLegalActions().find((candidate) => candidate.type === 'move' && candidate.targetUnitId === target.id);
  assert.equal(action.cost, 1, 'Liger first move discount should apply');
  assert.equal(battle.player('p1').hand.some((entry) => entry.masterId === move.id), false, 'moves are not deck cards');
});
