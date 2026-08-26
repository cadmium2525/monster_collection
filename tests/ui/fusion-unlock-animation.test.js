import test from 'node:test';
import assert from 'node:assert/strict';
import { fusionUnlockDuration } from '../../src/ui/fusion-unlock-animation.js';

test('fusion unlock ceremony keeps a readable standard pace and practical alternatives', () => {
  const standard = fusionUnlockDuration({ speed: 'standard' });
  const fast = fusionUnlockDuration({ speed: 'fast' });
  const reduced = fusionUnlockDuration({ reducedMotion: true });
  assert.ok(standard >= 1800);
  assert.ok(fast < standard / 2);
  assert.ok(reduced < 700);
});
