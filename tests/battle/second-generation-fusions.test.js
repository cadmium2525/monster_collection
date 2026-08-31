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
  unit.specialForm = name;
  unit.specialTrait = masterData.fusions.find((fusion) => fusion.name === name)?.trait ?? name;
  unit.statuses.evadeNext = false;
  return unit;
}

test('each second-generation monster has exactly two special recipes using underused materials first', () => {
  const secondGeneration = new Set(masterData.monsters.slice(18, 24).map((monster) => monster.name));
  for (const name of secondGeneration) {
    assert.equal(masterData.fusions.filter((fusion) => fusion.main === name).length, 2, name);
  }
  const originalRecipes = masterData.fusions.slice(0, 36);
  const originalMaterialCount = new Map(masterData.monsters.slice(0, 18).map((monster) => [
    monster.name,
    originalRecipes.filter((fusion) => fusion.material === monster.name).length,
  ]));
  const originalMaterialsInExpansion = masterData.fusions.slice(36)
    .map((fusion) => fusion.material)
    .filter((name) => !secondGeneration.has(name));
  assert.deepEqual(originalMaterialsInExpansion, ['ゴースト', 'ヒノトリ', 'アストラノイド', 'アルカナロード', 'ゴーレム', 'モノリス']);
  assert.equal(originalMaterialsInExpansion.every((name) => originalMaterialCount.get(name) <= 2), true);
});

test('new first-move efficiency and penetration traits are bounded to once per turn', () => {
  const battle = engine();
  const player = battle.player('p1');
  const target = placeUnit(battle, 'p2', 'ゴーレム', 0);
  const move = moveByName('クロノギア', 'ギアブレード');
  const chronogear = asForm(placeUnit(battle, 'p1', 'クロノギア', 0), 'アルケノクロック');
  assert.equal(resolvedMoveTp(player, chronogear, target, move), Math.max(1, move.tp - 1));
  chronogear.movesUsedThisTurn = 1;
  assert.equal(resolvedMoveTp(player, chronogear, target, move), move.tp);

  const ray = asForm(placeUnit(battle, 'p1', 'ミストレイ', 1), 'アストラレイ');
  const rayMove = moveByName('ミストレイ', '霧爪');
  assert.equal(resolvedMoveTp(player, ray, target, rayMove), Math.max(1, rayMove.tp - 1));
  assert.equal(defenseIgnore(player, ray, target, rayMove), 10);
  ray.movesUsedThisTurn = 1;
  assert.equal(defenseIgnore(player, ray, target, rayMove), 0);
});

test('Phantom Gear converts its first defense trigger into one extra next-turn action', () => {
  const battle = engine();
  const unit = asForm(placeUnit(battle, 'p1', 'クロノギア', 0), 'ファントムギア');
  unit.life = Math.ceil(unit.maxLife * 0.6);
  const reduced = battle._damageUnit(battle.player('p1'), unit, 20, null);
  assert.equal(reduced.actual, 15);
  assert.equal(unit.statuses.phantomExtraActionPending, true);
  unit.actionPoints = 1;
  battle._applyTurnStartEffects(battle.player('p1'));
  assert.equal(unit.actionPoints, 2);
  assert.equal(unit.statuses.phantomExtraActionPending, false);
});

test('Sun Phoenicia revives once at twenty percent and Eclipse Ray changes stance at half LIFE', () => {
  const battle = engine();
  const phoenix = asForm(placeUnit(battle, 'p1', 'アルケミア', 0), 'ソルフェニキア');
  const first = battle._damageUnit(battle.player('p1'), phoenix, phoenix.maxLife + 20, null);
  assert.equal(first.defeated, false);
  assert.equal(phoenix.life, Math.round(phoenix.maxLife * 0.2));
  const second = battle._damageUnit(battle.player('p1'), phoenix, phoenix.maxLife + 20, null);
  assert.equal(second.defeated, true);

  const eclipse = asForm(placeUnit(battle, 'p2', 'ミストレイ', 0), 'エクリプスレイ');
  assert.equal(applyIncomingModifiers(eclipse, 20).damage, 16);
  eclipse.life = Math.floor(eclipse.maxLife * 0.5);
  const move = moveByName('ミストレイ', '霧爪');
  assert.equal(outgoingDamageMultiplier(eclipse, phoenix, move, battle.player('p1')), 1.25);
});

test('Gaia Wolf retaliation and Obelisk Graton storage both cap and are consumed by a move', () => {
  const battle = engine();
  const wolf = asForm(placeUnit(battle, 'p1', 'ヴォルファング', 0), 'ガイアヴォルフ');
  for (let count = 0; count < 5; count += 1) battle._onAttacked(wolf, null, 5, false);
  assert.equal(wolf.statuses.specialCounters.gaiaRetaliation, 0.3);
  assert.equal(outgoingDamageMultiplier(wolf, null, moveByName('ヴォルファング', '牙撃'), battle.player('p2')), 1.3);
  battle._consumeDamageStatuses(wolf);
  assert.equal(wolf.statuses.specialCounters.gaiaRetaliation, 0);

  const graton = asForm(placeUnit(battle, 'p2', 'グラトン', 0), 'オベリスクグラトン');
  assert.equal(applyIncomingModifiers(graton, 40).damage, 30);
  assert.equal(specialFlatDamageBonus(graton), 10);
  applyIncomingModifiers(graton, 80);
  assert.equal(specialFlatDamageBonus(graton), 15);
  battle._consumeDamageStatuses(graton);
  assert.equal(specialFlatDamageBonus(graton), 0);
});

test('Oracle, Behemoth and Chronovore rewards stay condition- and cap-bound', () => {
  const battle = engine();
  const player = battle.player('p1');
  const oracle = asForm(placeUnit(battle, 'p1', 'ノクティス', 0), 'ノクスオラクル');
  battle._applyTurnStartEffects(player);
  assert.equal(oracle.statuses.nextDamageBonus, 0.2);
  oracle.life = 1;
  battle._applyTurnStartEffects(player);
  assert.ok(oracle.life > 1);

  const behemoth = asForm(placeUnit(battle, 'p1', 'ヴォルファング', 1), 'ベヒモスファング');
  const dummyMove = moveByName('ヴォルファング', '牙撃');
  for (let count = 0; count < 4; count += 1) {
    player.tp = 0;
    behemoth.life = Math.max(1, behemoth.life - 10);
    battle._applyPostMoveEffects(player, battle.player('p2'), behemoth, null, dummyMove, { actual: 10, defeated: true });
  }
  assert.equal(behemoth.statuses.specialCounters.behemothAtk, 9);
  assert.equal(player.tp, 1);

  const chrono = asForm(placeUnit(battle, 'p1', 'グラトン', 2), 'クロノヴォア');
  chrono.life = 1;
  chrono.movesUsedThisTurn = 0;
  battle._applyPostMoveEffects(player, battle.player('p2'), chrono, null, moveByName('グラトン', 'かじりつき'), { actual: 10, defeated: false });
  assert.equal(chrono.life, 1 + Math.max(1, Math.floor(chrono.maxLife * 0.08)));
});
