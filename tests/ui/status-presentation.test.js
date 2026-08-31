import test from 'node:test';
import assert from 'node:assert/strict';
import { lowLifeTargetEffects, unitLifePresentation, unitStatusEntries, unitStatusGroups } from '../../src/ui/status-presentation.js';

function unit(overrides = {}) {
  return {
    baseMonsterName: 'ジョーカー',
    specialForm: null,
    life: 20,
    maxLife: 40,
    atkMod: 0,
    defMod: 0,
    temporaryAtk: 0,
    temporaryDef: 0,
    timedAtkBuffs: [],
    timedDefBuffs: [],
    stunnedThisTurn: false,
    statuses: {},
    ...overrides,
  };
}

test('LIFE percentage uses the current grown maximum and includes exactly fifty percent', () => {
  assert.deepEqual(unitLifePresentation(unit()), {
    current: 20,
    max: 40,
    ratio: 0.5,
    percentage: 50,
    low: true,
  });
  assert.equal(unitLifePresentation(unit({ life: 21 })).low, false);
  assert.equal(unitLifePresentation(unit({ life: 12, maxLife: 35 })).percentage, 34);
});

test('visible status entries describe meaningful effects and exclude consumed internal flags', () => {
  const target = unit({
    atkMod: 5,
    temporaryDef: -5,
    timedAtkBuffs: [{ amount: 5, remaining: 2 }],
    statuses: {
      nextDamageReduction: 0.5,
      stunOnNextTurn: 1,
      spareParts: true,
      vsCreationDefIgnore: { base: 3, creation: 5 },
      phoenixUsed: true,
      firstIncomingUsed: true,
      specialReviveUsed: true,
    },
  });
  const entries = unitStatusEntries(target);
  assert.equal(entries.some((entry) => entry.label === 'ATK +5' && entry.detail === 'この試合中'), true);
  assert.equal(entries.some((entry) => entry.label === 'ATK +5' && entry.detail === '残り2ターン'), true);
  assert.equal(entries.some((entry) => entry.label === 'DEF -5'), true);
  assert.equal(entries.some((entry) => entry.label === '次の被ダメージ -50%'), true);
  assert.equal(entries.some((entry) => entry.label === '次ターン行動不能'), true);
  assert.equal(entries.some((entry) => entry.label === '予備パーツ'), true);
  assert.equal(entries.some((entry) => entry.label === '相手DEFを3無視' && entry.detail.includes('創造には5無視')), true);
  assert.equal(entries.some((entry) => /復活済み|使用済み/.test(entry.label)), false);
  assert.deepEqual(unitStatusGroups(target).map((group) => group.tone), ['positive', 'negative']);
});

test('Joker target guidance lists every effect that becomes active at fifty percent', () => {
  const joker = unit();
  const target = unit({ baseMonsterName: 'ゴーレム', life: 15, maxLife: 30 });
  assert.deepEqual(lowLifeTargetEffects(joker, target, { id: 'move-084', name: '終焉執行' }), ['技威力+20', '消費TP-1']);
  assert.deepEqual(lowLifeTargetEffects(joker, target, { id: 'move-090', name: '冥界門' }), ['技威力+20', 'DEFを5低く扱う']);
  assert.deepEqual(lowLifeTargetEffects(joker, target, { id: 'move-085', name: '断魂刃' }), ['技威力+20']);
  assert.deepEqual(lowLifeTargetEffects(joker, { ...target, life: 16 }, { id: 'move-090', name: '冥界門' }), []);
});

test('Inferno Judge target guidance exposes its low-LIFE damage bonus', () => {
  const source = unit({ specialForm: 'インフェルノジャッジ' });
  const target = unit({ life: 10, maxLife: 30 });
  assert.deepEqual(lowLifeTargetEffects(source, target, { name: 'フレアブレス' }), ['与ダメージ+40%']);
});
