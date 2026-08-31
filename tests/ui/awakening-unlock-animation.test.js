import test from 'node:test';
import assert from 'node:assert/strict';
import { awakeningUnlockDuration } from '../../src/ui/awakening-unlock-animation.js';

test('awakening unlock ceremony is richer than a banner while retaining fast and reduced variants', () => {
  const standard = awakeningUnlockDuration({ speed: 'standard' });
  const fast = awakeningUnlockDuration({ speed: 'fast' });
  const reduced = awakeningUnlockDuration({ reducedMotion: true });
  assert.ok(standard >= 2200);
  assert.ok(fast < standard / 2);
  assert.ok(reduced < 800);
});

