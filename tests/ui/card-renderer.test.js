import test from 'node:test';
import assert from 'node:assert/strict';
import { circledTp, resolvedTrait } from '../../src/ui/card-renderer.js';
import { shugyoMoveWeight } from '../../src/battle/shugyo.js';
import { monsterByName } from '../helpers.js';

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
