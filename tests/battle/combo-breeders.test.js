import test from 'node:test';
import assert from 'node:assert/strict';
import { card, engine, monsterByName, placeUnit, setHand } from '../helpers.js';

function breederAction(battle, breederId, predicate = () => true) {
  const action = battle.getLegalActions().find((candidate) => candidate.type === 'breeder'
    && candidate.breederId === breederId && predicate(candidate));
  assert.ok(action, `${breederId} should have a legal action`);
  return action;
}

function playOn(battle, breederId, unit, extra = []) {
  setHand(battle, 'p1', [card(breederId, `card-${breederId}`), ...extra]);
  battle.applyAction(breederAction(battle, breederId, (action) => action.targetUnitId === unit.id));
}

test('machine armor stores only prevented damage and releases it with the capped TP discount', () => {
  const battle = engine();
  const machine = placeUnit(battle, 'p1', 'ギアセンチネル', 0);
  playOn(battle, 'breeder-056', machine);
  assert.deepEqual(machine.statuses.pressureArmor, { armed: true, defAmount: 5, remaining: 2 });
  assert.deepEqual(machine.timedDefBuffs.at(-1), { amount: 5, remaining: 2 });

  battle._damageUnit(battle.player('p1'), machine, 18, null, { pressurePrevented: 12 });
  assert.equal(machine.statuses.pressureCharge, 10);
  assert.equal(machine.statuses.pressureArmor.armed, false);

  playOn(battle, 'breeder-057', machine);
  assert.equal(machine.statuses.pressureCharge, 0);
  assert.equal(machine.statuses.pressureRelease, 10);
  assert.equal(machine.statuses.nextDamageBonus, 0.1);
  assert.equal(machine.statuses.nextMoveTpDiscount, 1);
});

test('creation tuning needs a real heal to full and is consumed by one enhanced manifestation per turn', () => {
  const battle = engine();
  const creation = placeUnit(battle, 'p1', 'ヒノトリ', 0);
  creation.life = creation.maxLife - 7;
  playOn(battle, 'breeder-058', creation);
  assert.equal(creation.life, creation.maxLife);
  assert.equal(creation.statuses.tuningReady, true);

  playOn(battle, 'breeder-059', creation);
  assert.equal(creation.statuses.tuningReady, false);
  assert.equal(creation.statuses.nextDamageBonus, 0.3);
  assert.equal(creation.actionPoints, 2);
  setHand(battle, 'p1', [card('breeder-059', 'second-manifestation')]);
  assert.equal(battle.getLegalActions().some((action) => action.breederId === 'breeder-059'), false);
});

test('spirit link draws on a successful evade and afterimage pursuit consumes the ready state', () => {
  const battle = engine();
  const spirit = placeUnit(battle, 'p1', 'ウンディーネ', 0);
  const attacker = placeUnit(battle, 'p2', 'ドラゴン', 0);
  battle.player('p1').deck.push(card('training-atk', 'ghost-link-draw'));
  playOn(battle, 'breeder-060', spirit);
  const beforeHand = battle.player('p1').hand.length;
  const result = battle._damageUnit(battle.player('p1'), spirit, 30, attacker);
  assert.equal(result.evaded, true);
  assert.equal(battle.player('p1').hand.length, beforeHand + 1);
  assert.equal(spirit.statuses.afterimageReady, true);

  playOn(battle, 'breeder-061', spirit);
  assert.equal(spirit.statuses.afterimageReady, false);
  assert.equal(spirit.statuses.nextDamageBonus, 0.3);
  assert.equal(spirit.actionPoints, 2);
});

test('bloodline ignition checks LIFE after paying its cost and enables blood-debt recovery', () => {
  const battle = engine();
  const demon = placeUnit(battle, 'p1', 'ドラゴン', 0);
  const target = placeUnit(battle, 'p2', 'ゴーレム', 0);
  demon.atkBase = 100;
  target.defBase = 1;
  target.maxLife = 500;
  target.life = 500;
  battle.player('p1').life = 55;

  playOn(battle, 'breeder-062', demon);
  assert.equal(battle.player('p1').life, 50);
  assert.equal(demon.statuses.nextMoveTpDiscount, 1);
  setHand(battle, 'p1', [card('breeder-063', 'blood-debt')]);
  battle.applyAction(breederAction(battle, 'breeder-063', (action) => action.targetUnitId === demon.id));
  assert.equal(demon.statuses.nextDamageBonus, 0.35);
  assert.deepEqual(demon.statuses.nextDamageLifesteal, { ratio: 0.25, cap: 10 });

  const action = battle.getLegalActions().find((candidate) => candidate.type === 'move'
    && candidate.unitId === demon.id && candidate.targetUnitId === target.id);
  assert.ok(action);
  battle.applyAction(action);
  assert.equal(battle.player('p1').life, 60);
  assert.equal(demon.statuses.nextMoveTpDiscount, 0);
});

test('hunting mark assigns +10%, +20%, +30% to distinct beasts and keeps each assignment stable', () => {
  const battle = engine();
  const beasts = [
    placeUnit(battle, 'p1', 'ボルトウルフ', 0),
    placeUnit(battle, 'p1', 'コンゴウ', 1),
    placeUnit(battle, 'p1', 'フェザーレックス', 2),
  ];
  const target = placeUnit(battle, 'p2', 'ゴーレム', 0);
  setHand(battle, 'p1', [card('breeder-064', 'hunting-ground')]);
  battle.applyAction(breederAction(battle, 'breeder-064', (action) => action.targetUnitId === target.id));

  assert.equal(battle._activateHuntingBonus(battle.player('p1'), beasts[0], target), 0.1);
  assert.equal(battle._activateHuntingBonus(battle.player('p1'), beasts[0], target), 0.1);
  assert.equal(battle._activateHuntingBonus(battle.player('p1'), beasts[1], target), 0.2);
  assert.equal(battle._activateHuntingBonus(battle.player('p1'), beasts[2], target), 0.3);
});

test('beast spoils and monster remnants only become legal after their setup events', () => {
  const beastBattle = engine();
  const beast = placeUnit(beastBattle, 'p1', 'コンゴウ', 0, { life: 10 });
  setHand(beastBattle, 'p1', [card('breeder-065', 'spoils')]);
  assert.equal(beastBattle.getLegalActions().some((action) => action.breederId === 'breeder-065'), false);
  beastBattle.player('p1').effects.comboTurn.beastKill = true;
  beastBattle.player('p1').tp = 5;
  beastBattle.applyAction(breederAction(beastBattle, 'breeder-065'));
  assert.equal(beastBattle.player('p1').tp, 6);
  assert.equal(beast.life, 15);

  const monsterBattle = engine();
  const monster = placeUnit(monsterBattle, 'p1', 'ワーム', 0, { life: 5 });
  const material = card(monsterByName('ドラゴン').id, 'inherit-material');
  playOn(monsterBattle, 'breeder-066', monster, [material]);
  assert.equal(monster.statuses.inheritedRemnant, Math.min(20, monsterByName('ドラゴン').summonTp * 5));
  assert.equal(monsterBattle.player('p1').effects.comboTurn.monsterDiscarded, true);

  monsterBattle.player('p1').deck.push(card('training-def', 'remnant-draw'));
  setHand(monsterBattle, 'p1', [card('breeder-067', 'remnant-recovery')]);
  monsterBattle.applyAction(breederAction(monsterBattle, 'breeder-067', (action) => action.targetUnitId === monster.id));
  assert.equal(monster.life, 10);
  assert.equal(monsterBattle.player('p1').hand.some((entry) => entry.instanceId === 'remnant-draw'), true);
});
