import test from 'node:test';
import assert from 'node:assert/strict';
import { awakeningAudit } from '../../src/ai/lab.js';

test('awakening audit counts only a winner on the same half-turn as an immediate awakening win', () => {
  const state = { firstPlayerId: 'first' };
  const immediate = awakeningAudit([
    { type: 'awakening', playerId: 'second', round: 10, halfTurn: 20, abilityId: 'base:test', abilityName: '試験覚醒' },
    { type: 'attack', playerId: 'second', round: 10, halfTurn: 20, moveId: 'move-test' },
    { type: 'battle-end', winnerId: 'second', round: 10, halfTurn: 20 },
  ], state);
  assert.equal(immediate.secondPlayer, true);
  assert.equal(immediate.sameTurnWin, true);
  assert.equal(immediate.decisiveActionType, 'attack');

  const later = awakeningAudit([
    { type: 'awakening', playerId: 'second', round: 10, halfTurn: 20, abilityId: 'base:test', abilityName: '試験覚醒' },
    { type: 'battle-end', winnerId: 'second', round: 11, halfTurn: 22 },
  ], state);
  assert.equal(later.sameTurnWin, false);
});
