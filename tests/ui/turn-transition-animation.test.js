import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  turnTransitionDuration,
  turnTransitionModel,
} from '../../src/ui/turn-transition-animation.js';

test('turn transition distinguishes player and enemy with the active player turn number', () => {
  assert.deepEqual(turnTransitionModel({ humanTurn: true, turnNumber: 8 }), {
    tone: 'player', title: 'YOUR TURN', turnLabel: 'TURN 8', ariaLabel: 'あなたのターン 8',
  });
  assert.deepEqual(turnTransitionModel({ humanTurn: false, turnNumber: 6 }), {
    tone: 'enemy', title: 'ENEMY TURN', turnLabel: 'TURN 6', ariaLabel: '相手のターン 6',
  });
});

test('fast and reduced-motion turn transitions remain visible but shorter', () => {
  assert.equal(turnTransitionDuration(), 1250);
  assert.equal(turnTransitionDuration({ speed: 'fast' }), 480);
  assert.equal(turnTransitionDuration({ reducedMotion: true }), 650);
});

test('battle flow announces the initial turn and every changed current turn', () => {
  const source = fs.readFileSync(new URL('../../src/ui/battle-screen.js', import.meta.url), 'utf8');
  assert.match(source, /startInitialTurnFlow/);
  assert.match(source, /await this\.showCurrentTurnTransition\(\);[\s\S]*await this\.showLatestEvent\(\);/);
  assert.match(source, /humanTurn \? 'YOUR TURN' : 'ENEMY TURN'/);
});

test('turn sigil uses responsive layered rings instead of a fixed reference screenshot', () => {
  const source = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(source, /\.turn-transition-sigil/);
  assert.match(source, /\.turn-sigil-ring\.ring-a/);
  assert.match(source, /\.turn-transition\.enemy/);
});
