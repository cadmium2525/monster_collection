import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyIncomingModifiers,
  defenseIgnore,
  outgoingDamageMultiplier,
  resolvedMoveTp,
  specialFlatDamageBonus,
} from '../../src/battle/effects.js';
import { engine, masterData, moveByName, placeUnit } from '../helpers.js';

function asForm(unit, name) {
  const fusion = masterData.fusions.find((entry) => entry.name === name);
  unit.specialFusionId = fusion.id;
  unit.specialForm = fusion.name;
  unit.specialTrait = fusion.trait;
  unit.statuses.firstIncomingUsed = false;
  unit.statuses.specialCounters = {};
  return unit;
}

test('each new heroine has two special recipes with unique older off-class materials', () => {
  const newNames = new Set(masterData.monsters.slice(24, 30).map((monster) => monster.name));
  const materials = new Set();
  for (const main of masterData.monsters.slice(24, 30)) {
    const recipes = masterData.fusions.filter((fusion) => fusion.main === main.name);
    assert.equal(recipes.length, 2, main.name);
    assert.equal(new Set(recipes.map((fusion) => masterData.monsters.find((monster) => monster.name === fusion.material)?.faction)).size, 2);
    for (const fusion of recipes) {
      const material = masterData.monsters.find((monster) => monster.name === fusion.material);
      assert.ok(material);
      assert.equal(newNames.has(material.name), false);
      assert.notEqual(material.faction, main.faction);
      assert.equal(materials.has(material.name), false, `${material.name} is selected only once`);
      materials.add(material.name);
    }
  }
  assert.equal(materials.size, 12);
});

test('new efficiency and penetration traits apply only to the first move each turn', () => {
  const battle = engine();
  const player = battle.player('p1');
  const target = placeUnit(battle, 'p2', 'ゴーレム', 0);
  const arc = asForm(placeUnit(battle, 'p1', 'アークヴァルキア', 0), 'アビスヴァルキア');
  const arcMove = moveByName('アークヴァルキア', '蒼雷突');
  assert.equal(defenseIgnore(player, arc, target, arcMove), 8);
  arc.movesUsedThisTurn = 1;
  assert.equal(defenseIgnore(player, arc, target, arcMove), 0);

  const fairy = asForm(placeUnit(battle, 'p1', 'アークヴァルキア', 1), 'フェアリアーク');
  assert.equal(resolvedMoveTp(player, fairy, target, arcMove), 1);
  fairy.movesUsedThisTurn = 1;
  assert.equal(resolvedMoveTp(player, fairy, target, arcMove), arcMove.tp);

  const astral = asForm(placeUnit(battle, 'p1', 'カスミヨ', 2), 'アストラカスミヨ');
  const astralMove = moveByName('カスミヨ', '鏡月刃');
  assert.equal(resolvedMoveTp(player, astral, target, astralMove), 1);
  assert.equal(defenseIgnore(player, astral, target, astralMove), 8);
});

test('new defensive forms reduce bounded damage and consume stored counterpower', () => {
  const battle = engine();
  const bolt = asForm(placeUnit(battle, 'p1', 'セラフィノア', 0), 'ボルトセラフィア');
  assert.equal(applyIncomingModifiers(bolt, 40).damage, 30);
  assert.equal(outgoingDamageMultiplier(bolt, null, moveByName('セラフィノア', '光紡ぎ'), battle.player('p2')), 1.15);
  battle._consumeDamageStatuses(bolt);
  assert.equal(outgoingDamageMultiplier(bolt, null, moveByName('セラフィノア', '光紡ぎ'), battle.player('p2')), 1);

  const nox = asForm(placeUnit(battle, 'p1', 'レオネア', 1), 'ノクスレオネア');
  assert.equal(applyIncomingModifiers(nox, 20).damage, 16);
  nox.life = Math.floor(nox.maxLife * 0.5);
  assert.equal(outgoingDamageMultiplier(nox, null, moveByName('レオネア', '砂牙'), battle.player('p2')), 1.2);

  const gaia = asForm(placeUnit(battle, 'p1', 'ミメシア', 2), 'ガイアミメシア');
  assert.equal(applyIncomingModifiers(gaia, 40).damage, 32);
  assert.equal(specialFlatDamageBonus(gaia), 8);
  applyIncomingModifiers(gaia, 80);
  assert.equal(specialFlatDamageBonus(gaia), 10);
  battle._consumeDamageStatuses(gaia);
  assert.equal(specialFlatDamageBonus(gaia), 0);
});

test('new recovery and growth traits remain conditional and capped', () => {
  const battle = engine();
  const player = battle.player('p1');

  const eclipse = asForm(placeUnit(battle, 'p1', 'セラフィノア', 0), 'エクリシエル');
  battle._applyTurnStartEffects(player);
  assert.equal(eclipse.statuses.nextDamageBonus, 0.2);
  eclipse.life = 1;
  battle._applyTurnStartEffects(player);
  assert.ok(eclipse.life > 1);

  const green = asForm(placeUnit(battle, 'p1', 'レオネア', 1), 'ヴェルデレオネア');
  green.life = 1;
  battle._applyTurnStartEffects(player);
  assert.ok(green.life > 1);
  assert.equal(green.statuses.nextDamageBonus, 0.15);

  const gluttony = asForm(placeUnit(battle, 'p1', 'リリヴェル', 2), 'グラトニアリリス');
  gluttony.life = 1;
  const move = moveByName('リリヴェル', '紅針');
  for (let count = 0; count < 4; count += 1) {
    battle._applyPostMoveEffects(player, battle.player('p2'), gluttony, null, move, { actual: 10, defeated: true });
  }
  assert.equal(gluttony.statuses.specialCounters.glatoniaAtk, 6);
  assert.equal(gluttony.atkMod, 6);

  const arcana = asForm(placeUnit(battle, 'p1', 'ミメシア', 2), 'アルカナミメシア');
  arcana.life = 1;
  const before = arcana.life;
  battle._applyTurnEndEffects(player);
  assert.ok(arcana.life > before);
});

test('ghost-moon Kasumiyo heals and restores TP only on its first damaging knockout', () => {
  const battle = engine();
  const player = battle.player('p1');
  const unit = asForm(placeUnit(battle, 'p1', 'カスミヨ', 0), '幽月カスミヨ');
  unit.life = 1;
  player.tp = 0;
  unit.movesUsedThisTurn = 0;
  battle._applyPostMoveEffects(player, battle.player('p2'), unit, null, moveByName('カスミヨ', '霧灯'), { actual: 10, defeated: true });
  assert.ok(unit.life > 1);
  assert.equal(player.tp, 1);
});
