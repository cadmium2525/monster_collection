import test from 'node:test';
import assert from 'node:assert/strict';
import { currentSp, effectiveAtk, effectiveDef } from '../../src/battle/state.js';
import { card, engine, monsterByName, moveByName, placeUnit, setHand } from '../helpers.js';

function breederAction(battle, breederId, predicate = () => true) {
  const action = battle.getLegalActions().find((candidate) => candidate.type === 'breeder'
    && candidate.breederId === breederId && predicate(candidate));
  assert.ok(action, `${breederId} should have a legal action`);
  return action;
}

function useOnUnit(battle, breederId, unit, extraHand = []) {
  setHand(battle, 'p1', [card(breederId, `play-${breederId}`), ...extraHand]);
  const action = breederAction(battle, breederId, (candidate) => candidate.targetUnitId === unit.id);
  battle.applyAction(action);
  return action;
}

test('all thirty-two expansion breeder cards are canonical and have explanatory copy', () => {
  const battle = engine();
  const additions = battle.masterData.breeders.filter((entry) => Number(entry.id.slice(-3)) >= 21);
  assert.equal(additions.length, 32);
  assert.deepEqual(additions.map((entry) => entry.id), Array.from({ length: 32 }, (_, index) => `breeder-${String(index + 21).padStart(3, '0')}`));
  assert.equal(additions.every((entry) => entry.effect && entry.tp >= 1), true);
});

test('high-tier capture breeders give every faction a strong but constrained payoff', () => {
  const inorganic = engine();
  const machine = placeUnit(inorganic, 'p1', 'ゴーレム', 0);
  const machineAtk = effectiveAtk(machine);
  const machineDef = effectiveDef(machine);
  useOnUnit(inorganic, 'breeder-047', machine);
  assert.equal(effectiveAtk(machine), machineAtk + 10);
  assert.equal(effectiveDef(machine), machineDef + 10);

  const creation = engine();
  const construct = placeUnit(creation, 'p1', 'ヒノトリ', 0);
  useOnUnit(creation, 'breeder-048', construct);
  assert.equal(construct.actionPoints, 2);
  assert.equal(construct.statuses.nextDamageBonus, 0.3);

  const spirit = engine();
  const phantom = placeUnit(spirit, 'p1', 'ウンディーネ', 0);
  useOnUnit(spirit, 'breeder-049', phantom);
  assert.equal(phantom.statuses.echoNext, 0.6);
  assert.equal(phantom.statuses.returnToHandOnDefeat, true);

  const demon = engine();
  const fiend = placeUnit(demon, 'p1', 'ドラゴン', 0);
  useOnUnit(demon, 'breeder-050', fiend);
  assert.equal(demon.player('p1').life, 85);
  assert.equal(fiend.statuses.nextDamageBonus, 0.5);

  const beast = engine();
  const alpha = placeUnit(beast, 'p1', 'ライガー', 0);
  const packmate = placeUnit(beast, 'p1', 'ディノ', 1);
  const alphaAtk = effectiveAtk(alpha);
  setHand(beast, 'p1', [card('breeder-051', 'king-roar')]);
  beast.applyAction(breederAction(beast, 'breeder-051'));
  assert.equal(effectiveAtk(alpha), alphaAtk + 5);
  assert.equal(alpha.statuses.nextDamageReduction, 0.25);
  assert.equal(packmate.statuses.nextDamageReduction, 0.25);

  const monster = engine();
  const devourer = placeUnit(monster, 'p1', 'ワーム', 0, { life: 5 });
  const devourerAtk = effectiveAtk(devourer);
  const food = card(monsterByName('ドラゴン').id, 'perfect-food');
  useOnUnit(monster, 'breeder-052', devourer, [food]);
  assert.equal(devourer.life, 25);
  assert.equal(effectiveAtk(devourer), devourerAtk + 10);
  assert.equal(monster.player('p1').graveyard.some((entry) => entry.instanceId === food.instanceId), true);
});

test('counter command cards dispel buffs, cleanse debuffs and build a conditional defense wall', () => {
  const dispel = engine();
  const enhanced = placeUnit(dispel, 'p2', 'ゴーレム', 0);
  enhanced.atkMod = 10;
  enhanced.timedDefBuffs.push({ amount: 5, remaining: 3 });
  enhanced.statuses.nextDamageReduction = 0.5;
  setHand(dispel, 'p1', [card('breeder-041', 'dispel')]);
  dispel.applyAction(breederAction(dispel, 'breeder-041', (action) => action.targetUnitId === enhanced.id));
  assert.equal(enhanced.atkMod, 0);
  assert.equal(enhanced.timedDefBuffs.length, 0);
  assert.equal(enhanced.statuses.nextDamageReduction, 0);

  const cleanse = engine();
  const weakened = placeUnit(cleanse, 'p1', 'ヘンガー', 0);
  weakened.atkMod = -10;
  weakened.statuses.stunOnNextTurn = 1;
  weakened.statuses.incomingFlatDamage = { amount: 5, remaining: 2 };
  useOnUnit(cleanse, 'breeder-044', weakened);
  assert.equal(weakened.atkMod, 0);
  assert.equal(weakened.statuses.stunOnNextTurn, 0);
  assert.equal(weakened.statuses.incomingFlatDamage, null);

  const wall = engine();
  const ally = placeUnit(wall, 'p1', 'モノリス', 0);
  const enemy = placeUnit(wall, 'p2', 'ドラゴン', 0);
  enemy.atkBase = ally.atkBase + 30;
  const before = effectiveDef(ally);
  setHand(wall, 'p1', [card('breeder-045', 'reversal-wall')]);
  wall.applyAction(breederAction(wall, 'breeder-045'));
  assert.equal(effectiveDef(ally), before + 5);
});

test('disruption and retreat cards delay fusion, surcharge one move and safely return a base monster', () => {
  const fusionLock = engine({ firstPlayerId: 'p1' });
  placeUnit(fusionLock, 'p2', 'ピクシー', 0);
  fusionLock.player('p2').turnNumber = 4;
  setHand(fusionLock, 'p2', [card(monsterByName('メタルナー').id, 'locked-material')]);
  setHand(fusionLock, 'p1', [card('breeder-042', 'fusion-lock')]);
  fusionLock.applyAction(breederAction(fusionLock, 'breeder-042'));
  fusionLock.applyAction(fusionLock.getLegalActions().find((action) => action.type === 'end-turn'));
  assert.equal(fusionLock.player('p2').turnNumber, 5);
  assert.equal(fusionLock.getLegalActions().some((action) => action.type.startsWith('fusion-')), false);

  const moveLock = engine({ firstPlayerId: 'p1' });
  const attacker = placeUnit(moveLock, 'p2', 'ヒノトリ', 0);
  attacker.equippedMoveIds = [moveByName('ヒノトリ', '火炎').id];
  setHand(moveLock, 'p1', [card('breeder-043', 'move-lock')]);
  moveLock.applyAction(breederAction(moveLock, 'breeder-043'));
  moveLock.applyAction(moveLock.getLegalActions().find((action) => action.type === 'end-turn'));
  const taxed = moveLock.getLegalActions().find((action) => action.type === 'move');
  assert.equal(taxed.cost, moveByName('ヒノトリ', '火炎').tp + 2);
  moveLock.applyAction(taxed);
  assert.equal(moveLock.player('p2').effects.nextTurnMoveSurcharges[0].remaining, 0);

  const retreat = engine();
  const rescued = placeUnit(retreat, 'p1', 'ワーム', 0, { instanceId: 'rescued-monster' });
  rescued.atkMod = -10;
  setHand(retreat, 'p1', [card('breeder-046', 'retreat-card')]);
  retreat.applyAction(breederAction(retreat, 'breeder-046', (action) => action.targetUnitId === rescued.id));
  assert.equal(retreat.player('p1').board[0], null);
  assert.equal(retreat.player('p1').hand.some((entry) => entry.instanceId === 'rescued-monster'), true);
});

test('frontline reorganization redraws selected hand cards and material search chooses from the top five', () => {
  const reorganize = engine({ seed: 'reorganize' });
  const first = card(monsterByName('モッチー').id, 'return-one');
  const second = card(monsterByName('ハム').id, 'return-two');
  setHand(reorganize, 'p1', [card('breeder-021', 'organize'), first, second]);
  const organizeAction = breederAction(reorganize, 'breeder-021', (action) => action.returnCardInstanceIds.length === 2);
  reorganize.applyAction(organizeAction);
  assert.equal(reorganize.player('p1').hand.length, 2);
  assert.equal(reorganize.player('p1').hand.some((entry) => ['return-one', 'return-two'].includes(entry.instanceId)), false);

  const search = engine({ seed: 'material-search' });
  const wanted = card(monsterByName('ドラゴン').id, 'wanted-material');
  search.player('p1').deck.push(card('training-atk', 'search-other-1'), wanted, card('training-def', 'search-other-2'));
  setHand(search, 'p1', [card('breeder-022', 'search-card')]);
  search.applyAction(breederAction(search, 'breeder-022', (action) => action.chosenCardInstanceId === wanted.instanceId));
  assert.equal(search.player('p1').hand.some((entry) => entry.instanceId === wanted.instanceId), true);
});

test('fusion order, first aid, sacrifice, defense, TP loan and adversity execute their full effects', () => {
  const fusion = engine({ seed: 'fusion-order' });
  const main = placeUnit(fusion, 'p1', 'ピクシー', 0);
  const material = card(monsterByName('メタルナー').id, 'fusion-buff-material');
  setHand(fusion, 'p1', [card('breeder-023', 'fusion-order-card'), material]);
  fusion.player('p1').turnNumber = 6;
  fusion.applyAction(breederAction(fusion, 'breeder-023'));
  const fusionAction = fusion.getLegalActions().find((action) => action.type === 'fusion-special');
  assert.deepEqual(fusionAction.preview.breederBonus, { life: 10, atk: 5, def: 5 });
  fusion.applyAction(fusionAction);
  assert.equal(currentSp(main), fusionAction.preview.newSp);

  const firstAid = engine();
  const patient = placeUnit(firstAid, 'p1', 'ゴーレム', 0, { life: 10 });
  patient.statuses.stunOnNextTurn = 1;
  useOnUnit(firstAid, 'breeder-024', patient);
  assert.equal(patient.life, 20);
  assert.equal(patient.statuses.stunOnNextTurn, 0);

  const sacrifice = engine();
  const striker = placeUnit(sacrifice, 'p1', 'ドラゴン', 0);
  const defender = placeUnit(sacrifice, 'p2', 'モノリス', 0);
  striker.equippedMoveIds = [moveByName('ドラゴン', 'ドラゴンパンチ').id];
  useOnUnit(sacrifice, 'breeder-025', striker);
  const beforeRecoil = striker.life;
  sacrifice.applyAction(sacrifice.getLegalActions().find((action) => action.type === 'move' && action.targetUnitId === defender.id));
  assert.equal(striker.life, beforeRecoil - 10);

  const defense = engine();
  const guardA = placeUnit(defense, 'p1', 'モノリス', 0);
  const guardB = placeUnit(defense, 'p1', 'ヘンガー', 1);
  setHand(defense, 'p1', [card('breeder-026', 'all-defense')]);
  defense.applyAction(breederAction(defense, 'breeder-026'));
  assert.equal(guardA.statuses.nextDamageReduction, 0.25);
  assert.equal(guardB.statuses.nextDamageReduction, 0.25);

  const loan = engine();
  loan.player('p1').tp = 5;
  setHand(loan, 'p1', [card('breeder-027', 'loan')]);
  loan.applyAction(breederAction(loan, 'breeder-027'));
  assert.equal(loan.player('p1').tp, 6);
  loan.applyAction(loan.getLegalActions().find((action) => action.type === 'end-turn'));
  loan.applyAction(loan.getLegalActions().find((action) => action.type === 'end-turn'));
  assert.equal(loan.player('p1').tp, 9);

  const adversity = engine();
  adversity.player('p1').life = 80;
  const underdog = placeUnit(adversity, 'p1', 'ワーム', 0);
  const atkBefore = effectiveAtk(underdog);
  const defBefore = effectiveDef(underdog);
  setHand(adversity, 'p1', [card('breeder-028', 'adversity')]);
  adversity.applyAction(breederAction(adversity, 'breeder-028'));
  assert.equal(effectiveAtk(underdog), atkBefore + 5);
  assert.equal(effectiveDef(underdog), defBefore + 5);
});

test('inorganic and creation breeder cards apply temporary offense, repair, redesign and survival', () => {
  const overclock = engine();
  const machine = placeUnit(overclock, 'p1', 'ゴーレム', 0);
  const atkBefore = effectiveAtk(machine);
  const defBefore = effectiveDef(machine);
  useOnUnit(overclock, 'breeder-029', machine);
  assert.equal(effectiveAtk(machine), atkBefore + 10);
  overclock.applyAction(overclock.getLegalActions().find((action) => action.type === 'end-turn'));
  assert.equal(effectiveDef(machine), defBefore - 5);

  const repair = engine();
  const repairTarget = placeUnit(repair, 'p1', 'ヘンガー', 0, { life: 10 });
  useOnUnit(repair, 'breeder-030', repairTarget);
  repair.applyAction(repair.getLegalActions().find((action) => action.type === 'end-turn'));
  assert.equal(repairTarget.life, 15);
  assert.equal(repairTarget.statuses.autoRepairRemaining, 2);

  const redesign = engine();
  const creation = placeUnit(redesign, 'p1', 'ヒノトリ', 0);
  const originalAtk = effectiveAtk(creation);
  const originalDef = effectiveDef(creation);
  useOnUnit(redesign, 'breeder-031', creation);
  assert.equal(effectiveAtk(creation), originalDef);
  assert.equal(effectiveDef(creation), originalAtk);
  redesign.applyAction(redesign.getLegalActions().find((action) => action.type === 'end-turn'));
  redesign.applyAction(redesign.getLegalActions().find((action) => action.type === 'end-turn'));
  assert.equal(effectiveAtk(creation), originalAtk);

  const spare = engine();
  const creationTarget = placeUnit(spare, 'p1', 'メタルナー', 0, { life: 5 });
  useOnUnit(spare, 'breeder-032', creationTarget);
  const result = spare._damageUnit(spare.player('p1'), creationTarget, 99, null);
  assert.equal(result.defeated, false);
  assert.equal(creationTarget.life, 1);
  assert.equal(creationTarget.statuses.spareParts, false);
});

test('spirit and demon breeder cards echo, return, trade LIFE for TP and mark incoming damage', () => {
  const echo = engine();
  const spirit = placeUnit(echo, 'p1', 'ウンディーネ', 0);
  const echoTarget = placeUnit(echo, 'p2', 'ゴーレム', 0);
  spirit.atkBase = 80;
  echoTarget.defBase = 1;
  echoTarget.maxLife = 500;
  echoTarget.life = 500;
  spirit.equippedMoveIds = [moveByName('ウンディーネ', 'アイスブレード').id];
  useOnUnit(echo, 'breeder-033', spirit);
  echo.applyAction(echo.getLegalActions().find((action) => action.type === 'move' && action.targetUnitId === echoTarget.id));
  assert.ok(echo.state.log.at(-1).echoDamage > 0);

  const returning = engine();
  const returner = placeUnit(returning, 'p1', 'プラント', 0, { instanceId: 'returning-spirit' });
  useOnUnit(returning, 'breeder-034', returner);
  returning._damageUnit(returning.player('p1'), returner, 999, null);
  assert.equal(returning.player('p1').hand.some((entry) => entry.instanceId === 'returning-spirit'), true);

  const pact = engine();
  pact.player('p1').tp = 5;
  setHand(pact, 'p1', [card('breeder-035', 'blood-pact')]);
  pact.applyAction(breederAction(pact, 'breeder-035'));
  assert.equal(pact.player('p1').life, 90);
  assert.equal(pact.player('p1').tp, 7);

  const curse = engine();
  const cursed = placeUnit(curse, 'p2', 'モノリス', 0);
  cursed.maxLife = 100;
  cursed.life = 100;
  setHand(curse, 'p1', [card('breeder-036', 'curse-mark')]);
  curse.applyAction(breederAction(curse, 'breeder-036', (action) => action.targetUnitId === cursed.id));
  const first = curse._damageUnit(curse.player('p2'), cursed, 10, null);
  const second = curse._damageUnit(curse.player('p2'), cursed, 10, null);
  assert.equal(first.actual, 15);
  assert.equal(second.actual, 15);
  assert.equal(cursed.statuses.incomingFlatDamage, null);
});

test('beast and monster breeder cards reward hunting, packs, gluttony and predation', () => {
  const hunt = engine();
  const hunter = placeUnit(hunt, 'p1', 'ハム', 0);
  const prey = placeUnit(hunt, 'p2', 'モノリス', 0, { life: 1 });
  hunter.atkBase = 100;
  hunter.equippedMoveIds = [moveByName('ハム', '正拳').id];
  useOnUnit(hunt, 'breeder-037', hunter);
  const huntMove = hunt.getLegalActions().find((action) => action.type === 'move' && action.targetUnitId === prey.id);
  const tpBeforeMove = hunt.player('p1').tp;
  hunt.applyAction(huntMove);
  assert.equal(hunt.player('p1').tp, Math.min(hunt.player('p1').maxTp, tpBeforeMove - huntMove.cost + 1));

  const pack = engine();
  const beastA = placeUnit(pack, 'p1', 'ライガー', 0);
  const beastB = placeUnit(pack, 'p1', 'ディノ', 1);
  setHand(pack, 'p1', [card('breeder-038', 'pack-guard')]);
  pack.applyAction(breederAction(pack, 'breeder-038'));
  assert.equal(beastA.statuses.nextDamageReduction, 0.25);
  assert.equal(beastB.statuses.nextDamageReduction, 0.25);

  const gluttony = engine();
  const glutton = placeUnit(gluttony, 'p1', 'ワーム', 0, { life: 5 });
  const food = card(monsterByName('ドラゴン').id, 'glutton-food');
  useOnUnit(gluttony, 'breeder-039', glutton, [food]);
  assert.equal(glutton.life, 25);
  assert.equal(gluttony.player('p1').graveyard.some((entry) => entry.instanceId === food.instanceId), true);

  const evolve = engine();
  const predator = placeUnit(evolve, 'p1', 'ジョーカー', 0, { life: 10 });
  const victim = placeUnit(evolve, 'p2', 'モノリス', 0, { life: 1 });
  predator.atkBase = 100;
  predator.equippedMoveIds = [moveByName('ジョーカー', 'デスパンチ').id];
  const predationAtk = predator.atkMod;
  useOnUnit(evolve, 'breeder-040', predator);
  evolve.applyAction(evolve.getLegalActions().find((action) => action.type === 'move' && action.targetUnitId === victim.id));
  assert.equal(predator.statuses.predationEvolution, false);
  assert.equal(predator.atkMod, predationAtk + 5);
  assert.equal(predator.life, 20);
});
