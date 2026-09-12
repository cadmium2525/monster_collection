import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  attackImpactSound,
  hasDamagingAttack,
  statChangeSoundDirection,
} from '../../src/ui/battle-screen.js';
import {
  HIT_SE_PATH,
  ZERO_DAMAGE_SE_PATH,
} from '../../src/audio/game-audio.js';

test('hit sound eligibility requires positive attack damage', () => {
  assert.equal(hasDamagingAttack([{ type: 'attack', damage: 12 }]), true);
  assert.equal(hasDamagingAttack([{ type: 'direct-attack', damage: 1 }]), true);
  assert.equal(hasDamagingAttack([{ type: 'attack', damage: 0 }]), false);
  assert.equal(hasDamagingAttack([{ type: 'trait', damage: 8 }]), false);
  assert.equal(attackImpactSound([{ type: 'attack', damage: 12 }]), HIT_SE_PATH);
  assert.equal(attackImpactSound([{ type: 'attack', damage: 0 }]), ZERO_DAMAGE_SE_PATH);
  assert.equal(attackImpactSound([{ type: 'move' }]), null);
});

test('status sound coalesces changes, ignores attack LIFE and resolves parasite from the player viewpoint', () => {
  const changes = [{ kind: 'unit', id: 'target', values: [
    { key: 'life', from: 20, to: 15, direction: 'down' },
    { key: 'atk', from: 10, to: 15, direction: 'up' },
  ] }];
  assert.equal(statChangeSoundDirection({ changes }), 'up');
  assert.equal(statChangeSoundDirection({
    changes: [{ kind: 'unit', id: 'target', values: [{ key: 'life', from: 20, to: 15, direction: 'down' }] }],
    newLogs: [{ type: 'attack', targetUnitId: 'target', damage: 5 }],
  }), null);
  assert.equal(statChangeSoundDirection({
    changes,
    humanPlayerId: 'player',
    newLogs: [{ type: 'trait', traitName: '寄生根', playerId: 'player' }],
  }), 'up');
  assert.equal(statChangeSoundDirection({
    changes,
    humanPlayerId: 'player',
    newLogs: [{ type: 'trait', traitName: '寄生根', playerId: 'cpu' }],
  }), 'down');
});

test('ordinary TP spending does not masquerade as a status-down effect', () => {
  const tpDown = [{ kind: 'player', id: 'player', values: [{ key: 'tp', from: 8, to: 6, direction: 'down' }] }];
  assert.equal(statChangeSoundDirection({
    changes: tpDown,
    action: { type: 'move', cost: 2 },
    actingPlayerId: 'player',
  }), null);
  assert.equal(statChangeSoundDirection({
    changes: tpDown,
    action: { type: 'move', cost: 1 },
    actingPlayerId: 'player',
  }), 'down');
});

test('battle screen wires turn, draw and hit sounds to their presentation moments', () => {
  const source = fs.readFileSync(new URL('../../src/ui/battle-screen.js', import.meta.url), 'utf8');
  assert.match(source, /this\.playSe\(TURN_SE_PATH, \{ volume: TURN_SE_GAIN \}\);\s*await playTurnTransition/);
  assert.match(source, /this\.playSe\(CARD_DRAW_SE_PATH\);\s*this\.mulliganAnimatingCardId/);
  assert.match(source, /this\.playSe\(CARD_DRAW_SE_PATH\);\s*this\.turnDrawAnimatingCardId/);
  assert.match(source, /if \(impactSound\) this\.playSe\(impactSound\)/);
  assert.match(source, /const impactSound = this\.moveImpactSound\(action\)/);
  assert.match(source, /STATUS_UP_SE_PATH[\s\S]*STATUS_DOWN_SE_PATH/);
  assert.match(source, /playCardUseAnimation\(\{[\s\S]*?onImpact: playStatSound/);
  assert.match(source, /showStatDirections\([^\n]+\{ soundPlayed: statSoundPlayed \}\)/);
});

test('tournament, manual/auto/replay arena and survival battles receive the common SE output', () => {
  const app = fs.readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8');
  assert.equal((app.match(/onPlaySe: \(source, options\) => this\.audio\.playSe\(source, options\)/g) ?? []).length, 5);
});
