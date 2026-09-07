import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hasDamagingAttack } from '../../src/ui/battle-screen.js';

test('hit sound eligibility requires positive attack damage', () => {
  assert.equal(hasDamagingAttack([{ type: 'attack', damage: 12 }]), true);
  assert.equal(hasDamagingAttack([{ type: 'direct-attack', damage: 1 }]), true);
  assert.equal(hasDamagingAttack([{ type: 'attack', damage: 0 }]), false);
  assert.equal(hasDamagingAttack([{ type: 'trait', damage: 8 }]), false);
});

test('battle screen wires turn, draw and hit sounds to their presentation moments', () => {
  const source = fs.readFileSync(new URL('../../src/ui/battle-screen.js', import.meta.url), 'utf8');
  assert.match(source, /this\.playSe\(TURN_SE_PATH\);\s*await playTurnTransition/);
  assert.match(source, /this\.playSe\(CARD_DRAW_SE_PATH\);\s*this\.mulliganAnimatingCardId/);
  assert.match(source, /this\.playSe\(CARD_DRAW_SE_PATH\);\s*this\.turnDrawAnimatingCardId/);
  assert.match(source, /if \(damagingMove\) this\.playSe\(HIT_SE_PATH\)/);
  assert.match(source, /const damagingMove = this\.moveWillDealDamage\(action\)/);
});

test('both tournament and arena battles receive the common SE output', () => {
  const app = fs.readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8');
  assert.equal((app.match(/onPlaySe: \(source, options\) => this\.audio\.playSe\(source, options\)/g) ?? []).length, 2);
});
