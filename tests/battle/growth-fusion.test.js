import test from 'node:test';
import assert from 'node:assert/strict';
import { currentSp } from '../../src/battle/state.js';
import { card, engine, masterData, monsterByName, moveByName, placeUnit, setHand } from '../helpers.js';

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

test('a fifth learned technique pauses play until the actual four are replaced or deliberately kept', () => {
  const prepare = (seed) => {
    const battle = engine({ seed });
    const unit = placeUnit(battle, 'p1', 'ドラゴン', 0);
    const fourth = moveByName('ドラゴン', 'しっぽアタック').id;
    unit.learnedMoveIds.push(fourth);
    unit.equippedMoveIds.push(fourth);
    battle.player('p1').tournamentGrowth[unit.sourceCardInstanceId].learnedMoveIds = [...unit.learnedMoveIds];
    battle.player('p1').tournamentGrowth[unit.sourceCardInstanceId].equippedMoveIds = [...unit.equippedMoveIds];
    setHand(battle, 'p1', [card('shugyo-attack', `fifth-${seed}`)]);
    battle.applyAction(battle.getLegalActions().find((candidate) => candidate.type === 'shugyo'));
    return { battle, unit };
  };

  const replaceCase = prepare('fifth-replace');
  const pending = replaceCase.battle.state.pendingMoveChoice;
  assert.ok(pending?.learnedMoveId, 'the newly learned fifth move must wait for a conscious loadout decision');
  const choiceActions = replaceCase.battle.getLegalActions();
  assert.equal(choiceActions.length, 5, 'four replacement choices plus keep-current must be offered');
  assert.equal(choiceActions.every((action) => action.type === 'resolve-shugyo-move'), true);
  const replacedMoveId = replaceCase.unit.equippedMoveIds[0];
  const replace = choiceActions.find((action) => action.replaceMoveId === replacedMoveId);
  replaceCase.battle.applyAction(replace);
  assert.equal(replaceCase.unit.equippedMoveIds.includes(pending.learnedMoveId), true);
  assert.equal(replaceCase.unit.equippedMoveIds.includes(replacedMoveId), false);
  assert.deepEqual(
    replaceCase.battle.getGrowthSnapshot('p1')[replaceCase.unit.sourceCardInstanceId].equippedMoveIds,
    replaceCase.unit.equippedMoveIds,
  );
  assert.equal(replaceCase.battle.state.pendingMoveChoice, null);
  assert.equal(replaceCase.battle.getLegalActions().some((action) => action.type === 'end-turn'), true);

  const keepCase = prepare('fifth-keep');
  const originalFour = [...keepCase.unit.equippedMoveIds];
  const keep = keepCase.battle.getLegalActions().find((action) => action.replaceMoveId == null);
  keepCase.battle.applyAction(keep);
  assert.deepEqual(keepCase.unit.equippedMoveIds, originalFour);
  assert.equal(keepCase.unit.learnedMoveIds.includes(keep.learnedMoveId), true, 'unselected new move remains learned');
});

test('fusion is unavailable before first 6 / second 5 and costs 1 or 2 afterward', () => {
  const battle = engine();
  const main = placeUnit(battle, 'p1', 'ピクシー', 0);
  const material = monsterByName('アストラノイド');
  setHand(battle, 'p1', [card(material.id, 'fusion-material')]);
  assert.equal(battle.getLegalActions().some((action) => action.type.startsWith('fusion')), false);
  battle.player('p1').turnNumber = 6;
  const actions = battle.getLegalActions();
  assert.equal(actions.some((action) => action.type === 'fusion-normal' && action.cost === 1), true);
  assert.equal(actions.some((action) => action.type === 'fusion-special' && action.cost === 2), true);

  main.actionPoints = 0;
  main.artVariantId = 'showcase-monster-001';
  const special = actions.find((action) => action.type === 'fusion-special');
  battle.applyAction(special);
  assert.equal(main.specialForm, 'フューチャー');
  assert.equal(main.artVariantId, 'showcase-monster-001', 'special-fusion result keeps the main card appearance');
  assert.equal(main.actionPoints, 0, 'fusion must not restore action points');
  assert.equal(battle.player('p1').tp, 8);
});

test('fusion never weakens a trained main monster and exposes the guaranteed gain', () => {
  const battle = engine({ seed: 'fusion-floor' });
  const main = placeUnit(battle, 'p1', 'ジョーカー', 0);
  main.maxLife += 20;
  main.life += 20;
  main.atkBase += 20;
  const material = monsterByName('ルミラビ');
  setHand(battle, 'p1', [card(material.id, 'weak-material')]);
  battle.player('p1').turnNumber = 6;
  const beforeSp = currentSp(main);
  const action = battle.getLegalActions().find((candidate) => candidate.type === 'fusion-special');
  assert.ok(action.preview.deltaSp > 0);
  assert.equal(action.preview.mainSp, beforeSp);
  battle.applyAction(action);
  assert.equal(currentSp(main), action.preview.newSp);
  assert.ok(currentSp(main) > beforeSp, 'fusion must always consume a monster without weakening the board');
});

test('all 48 special recipes are present and set their canonical form/trait', () => {
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
    assert.equal(main.specialFusionId, fusion.id);
    assert.equal(main.specialTrait, fusion.trait);
    assert.ok(currentSp(main) > action.preview.mainSp, `${fusion.name} must gain SP`);
    assert.equal(currentSp(main), action.preview.newSp, `${fusion.name} preview must equal applied SP`);
  }
});

test('renamed special fusions keep stable ids and approved canonical names', () => {
  const expected = {
    'fusion-002': 'ルナモルフォ',
    'fusion-004': 'フロストヴァンガード',
    'fusion-005': 'ゴウライウルフ',
    'fusion-006': 'ヴェルデボルト',
    'fusion-007': 'フェイグラップラー',
    'fusion-008': 'オブシディアンコング',
    'fusion-009': 'バスティオンレックス',
    'fusion-010': 'アルカノレックス',
    'fusion-013': 'ドラコワーム',
    'fusion-014': 'アズールドリル',
    'fusion-015': 'インフェルノジャッジ',
    'fusion-016': '花葬ラビリス',
    'fusion-017': 'ビーストバスティオン',
    'fusion-018': 'レックスメンヒル',
    'fusion-021': 'アイギスラプトル',
    'fusion-022': 'デスギアリーパー',
    'fusion-023': 'イグニギア',
    'fusion-025': 'マスクドヴァジュラ',
    'fusion-026': 'プリズムアルカナ',
    'fusion-027': 'コズミックミューズ',
    'fusion-031': 'アイギスルミラビ',
    'fusion-032': 'ルミギア・オクト',
    'fusion-033': 'クリムゾンフローラ',
    'fusion-034': 'シャドウリーフ',
    'fusion-035': 'オブシディアーク',
  };
  for (const [id, name] of Object.entries(expected)) {
    assert.equal(masterData.fusions.find((fusion) => fusion.id === id)?.name, name);
  }
  assert.equal(masterData.fusions.find((fusion) => fusion.id === 'fusion-012')?.name, 'オキクサン');
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
  unit.specialForm = 'ドラコワーム';
  const beforeDef = unit.defMod;

  battle._selfDamage(battle.player('p1'), unit, 5);

  assert.equal(unit.life, unit.maxLife - 5);
  assert.equal(unit.defMod, beforeDef, '反動で「被攻撃ごとDEF+3」は発動しない');
});

test('move TP and actual four-move data stay inside the monster card', () => {
  const battle = engine();
  const unit = placeUnit(battle, 'p1', 'ボルトウルフ', 0);
  const target = placeUnit(battle, 'p2', 'ゴースト', 0);
  const move = moveByName('ボルトウルフ', 'かみつき');
  unit.equippedMoveIds = [move.id];
  const action = battle.getLegalActions().find((candidate) => candidate.type === 'move' && candidate.targetUnitId === target.id);
  assert.equal(action.cost, 1, 'Liger first move discount should apply');
  assert.equal(battle.player('p1').hand.some((entry) => entry.masterId === move.id), false, 'moves are not deck cards');
});
