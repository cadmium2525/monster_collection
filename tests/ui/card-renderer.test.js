import test from 'node:test';
import assert from 'node:assert/strict';
import { cardArtPlacement, cardDisplayStats, circledTp, resolvedTrait } from '../../src/ui/card-renderer.js';
import { shugyoMoveWeight } from '../../src/battle/shugyo.js';
import { masterData, monsterByName } from '../helpers.js';

test('special-fusion cards display the replacement trait instead of the base trait', () => {
  const definition = monsterByName('ピクシー');
  assert.equal(resolvedTrait(definition, null).name, definition.trait.name);
  const trait = resolvedTrait(definition, { specialForm: 'フューチャー', specialTrait: '各ターン最初の被ダメージに上限' });
  assert.equal(trait.name, '特殊特性');
  assert.equal(trait.effect, '各ターン最初の被ダメージに上限');
});

test('card TP is rendered as a circled number without a TP suffix', () => {
  assert.equal(circledTp(0), '⓪');
  assert.equal(circledTp(2), '②');
  assert.equal(circledTp(5), '⑤');
  assert.equal(circledTp(10), '⑩');
});

test('shugyo rank weighting stays deliberately small', () => {
  const weights = [1, 2, 3, 4, 5].map((rank) => shugyoMoveWeight({ rank }));
  assert.ok(Math.max(...weights) / Math.min(...weights) < 1.12);
  assert.ok(weights[0] > weights[4]);
});

test('card art placement selects generated support and special-fusion atlases deterministically', () => {
  const monster = monsterByName('ピクシー');
  assert.equal(cardArtPlacement(monster).className, 'monster-art');
  const special = cardArtPlacement(monster, { specialFusionId: 'fusion-036', specialForm: 'クレバス' });
  assert.equal(special.className, 'monster-art special-fusion-art');
  assert.match(special.style, /--art-x:100%;--art-y:100%/);
  const blueDrill = cardArtPlacement(monster, { specialFusionId: 'fusion-014', specialForm: 'ブルードリル' });
  assert.equal(blueDrill.className, 'monster-art special-fusion-art blue-drill-art');
  assert.equal(blueDrill.style, null);
  const support = cardArtPlacement({ id: 'breeder-020', kind: 'breeder' });
  assert.equal(support.className, 'support-card-art');
  assert.match(support.style, /--art-x:100%;--art-y:100%/);
});

test('hand monster stats include tournament growth carried from earlier matches', () => {
  const monster = monsterByName('ドラゴン');
  assert.deepEqual(cardDisplayStats(monster, null, { life: 8, atk: 5, def: 10 }), {
    life: monster.base.life + 8,
    atk: monster.base.atk + 5,
    def: monster.base.def + 10,
  });
});

test('every Training and shugyo card has visible explanatory copy', () => {
  for (const definition of masterData.growthCards) {
    assert.equal(typeof definition.effect, 'string');
    assert.ok(definition.effect.length >= 10, `${definition.name} needs explanatory copy`);
  }
});
