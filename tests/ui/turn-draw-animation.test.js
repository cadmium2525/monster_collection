import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalTurnDrawCards, turnDrawTimings } from '../../src/ui/turn-draw-animation.js';

test('normal human turn draws are identified without animating card effects or enemy draws', () => {
  const oldCard = { instanceId: 'old-card' };
  const firstDraw = { instanceId: 'draw-1' };
  const secondDraw = { instanceId: 'draw-2' };
  const input = {
    action: { type: 'end-turn' },
    logs: [{ type: 'draw', playerId: 'human', drawn: 2 }],
    currentPlayerId: 'human',
    humanPlayerId: 'human',
    beforeHandIds: new Set([oldCard.instanceId]),
    hand: [oldCard, firstDraw, secondDraw],
  };
  assert.deepEqual(normalTurnDrawCards(input), [firstDraw, secondDraw]);
  assert.deepEqual(normalTurnDrawCards({ ...input, action: { type: 'breeder' } }), []);
  assert.deepEqual(normalTurnDrawCards({ ...input, currentPlayerId: 'cpu' }), []);
});

test('turn draw follows the turn transition and reveals cards one at a time', () => {
  const battleSource = fs.readFileSync(new URL('../../src/ui/battle-screen.js', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(battleSource, /if \(turnStarted\) await this\.showCurrentTurnTransition\(\);[\s\S]*?await this\.showStatDirections[\s\S]*?await this\.playPreparedNormalTurnDraw\(\);/);
  assert.match(battleSource, /turnDrawHiddenIds\.delete\(instanceId\);\s*this\.render\(\);\s*await delay\(timing\.deal\);/);
  assert.match(styles, /\.game-card\.turn-draw-enter/);
  assert.match(styles, /@keyframes turn-card-draw/);
});

test('standard, fast and reduced turn draws retain distinct practical timings', () => {
  assert.deepEqual(turnDrawTimings(), { lead: 90, deal: 235, settle: 130 });
  assert.deepEqual(turnDrawTimings({ speed: 'fast' }), { lead: 45, deal: 115, settle: 65 });
  assert.deepEqual(turnDrawTimings({ reducedMotion: true }), { lead: 30, deal: 80, settle: 40 });
});
