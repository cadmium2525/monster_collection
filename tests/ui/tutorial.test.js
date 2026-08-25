import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { homeFooterMode, TUTORIAL_STEPS } from '../../src/ui/home-screen.js';

test('beginner tutorial covers the complete first tournament interaction loop', () => {
  assert.equal(TUTORIAL_STEPS.length, 7);
  const copy = TUTORIAL_STEPS.flatMap((step) => [step.title, step.copy, step.tip]).join('\n');
  for (const required of ['40枚', 'スワイプ', '実戦技', '大会終了時', '特殊合体', 'TP', '最大2枚']) {
    assert.match(copy, new RegExp(required));
  }
  assert.doesNotMatch(copy, /距離廃止版/);
  const homeSource = fs.readFileSync(new URL('../../src/ui/home-screen.js', import.meta.url), 'utf8');
  assert.doesNotMatch(homeSource, /距離廃止版ルール/);
});

test('technical home footer stays hidden for players but preserves debug and sync warning modes', () => {
  assert.equal(homeFooterMode(), 'hidden');
  assert.equal(homeFooterMode({ debugMode: true }), 'debug');
  assert.equal(homeFooterMode({ syncError: 'offline' }), 'warning');
});
