import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { awakeningAnimationDuration, createAwakeningAnimationModel } from '../../src/ui/awakening-animation.js';
import { fusionAnimationDuration } from '../../src/ui/fusion-animation.js';
import { masterIndex, monsterByName } from '../helpers.js';

function unit(definition, id, overrides = {}) {
  return {
    id,
    sourceMasterId: definition.id,
    name: definition.name,
    baseMonsterName: definition.name,
    specialForm: null,
    maxLife: definition.base.life,
    life: definition.base.life,
    atkBase: definition.base.atk,
    defBase: definition.base.def,
    actionPoints: 1,
    summonedThisTurn: false,
    stunnedThisTurn: false,
    statuses: {},
    ...overrides,
  };
}

test('awakening cinematic preserves sacrifice, vessel, result and opened ability', () => {
  const targetDefinition = monsterByName('ギアセンチネル');
  const materialDefinition = monsterByName('モノリス');
  const targetBefore = unit(targetDefinition, 'target');
  const materialBefore = unit(materialDefinition, 'material');
  const targetAfter = unit(targetDefinition, 'target', {
    maxLife: targetBefore.maxLife + 15,
    life: targetBefore.life + 15,
    atkBase: targetBefore.atkBase + 15,
    defBase: targetBefore.defBase + 15,
    awakened: true,
    awakeningAbilityName: '零式装甲演算',
    awakeningAbilityEffect: '次に受けるダメージを軽減する。',
    awakeningAbilityLimit: 'バトル中1回',
  });
  const model = createAwakeningAnimationModel({
    action: { type: 'awaken', unitId: 'target', materialUnitId: 'material' },
    beforePlayer: { board: [targetBefore, materialBefore] },
    afterPlayer: { board: [targetAfter] },
    masterIndex,
  });
  assert.equal(model.targetName, 'ギアセンチネル');
  assert.equal(model.materialName, 'モノリス');
  assert.equal(model.abilityName, '零式装甲演算');
  assert.equal(model.targetAfter.atkBase - model.targetBefore.atkBase, 15);
});

test('ultimate awakening is more ceremonial than special fusion while fast modes stay practical', () => {
  const standard = awakeningAnimationDuration({ speed: 'standard' });
  const specialFusion = fusionAnimationDuration({ speed: 'standard', special: true });
  assert.ok(standard >= specialFusion + 700);
  assert.ok(awakeningAnimationDuration({ speed: 'fast' }) < standard / 2);
  assert.ok(awakeningAnimationDuration({ reducedMotion: true }) < 900);

  const css = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  for (const layer of ['awakening-cinematic-eclipse', 'awakening-cinematic-rift', 'awakening-cinematic-vortex', 'awakening-soul-particles']) {
    assert.match(css, new RegExp(`\\.${layer}`));
  }
});
