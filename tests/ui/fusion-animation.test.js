import test from 'node:test';
import assert from 'node:assert/strict';
import { createFusionAnimationModel, fusionAnimationDuration } from '../../src/ui/fusion-animation.js';
import { masterIndex, monsterByName } from '../helpers.js';

function unit(definition, overrides = {}) {
  return {
    id: 'unit-main',
    sourceMasterId: definition.id,
    name: definition.name,
    baseMonsterName: definition.name,
    specialForm: null,
    specialFusionId: null,
    maxLife: definition.base.life,
    life: definition.base.life,
    atkBase: definition.base.atk,
    defBase: definition.base.def,
    atkMod: 0,
    defMod: 0,
    temporaryAtk: 0,
    temporaryDef: 0,
    timedDefBuffs: [],
    statuses: {},
    actionPoints: 0,
    summonedThisTurn: false,
    stunnedThisTurn: false,
    ...overrides,
  };
}

test('fusion cinematic model preserves both source cards and the special result', () => {
  const main = monsterByName('ピクシー');
  const material = monsterByName('メタルナー');
  const beforeUnit = unit(main);
  const afterUnit = unit(main, {
    specialForm: 'フューチャー',
    specialFusionId: 'fusion-001',
    maxLife: main.base.life + 4,
    atkBase: main.base.atk + 3,
    defBase: main.base.def + 2,
  });
  const action = { type: 'fusion-special', unitId: beforeUnit.id, materialCardInstanceId: 'material-1' };
  const model = createFusionAnimationModel({
    action,
    beforePlayer: {
      board: [beforeUnit],
      hand: [{ instanceId: 'material-1', masterId: material.id }],
      tournamentGrowth: { 'material-1': { life: 5, atk: 0, def: 0 } },
    },
    afterPlayer: { board: [afterUnit] },
    masterIndex,
  });

  assert.equal(model.special, true);
  assert.equal(model.mainName, 'ピクシー');
  assert.equal(model.materialName, 'メタルナー');
  assert.equal(model.resultName, 'フューチャー');
  assert.equal(model.deltaSp, 9);
  assert.equal(model.materialGrowth.life, 5);
});

test('special fusion remains more ceremonial while fast and reduced modes stay practical', () => {
  const normal = fusionAnimationDuration({ speed: 'standard', special: false });
  const special = fusionAnimationDuration({ speed: 'standard', special: true });
  assert.ok(special > normal + 500);
  assert.ok(fusionAnimationDuration({ speed: 'fast', special: true }) < special / 2);
  assert.ok(fusionAnimationDuration({ special: true, reducedMotion: true }) < 800);
});
