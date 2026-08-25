import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeRunSummary, homeFooterMode, TUTORIAL_STEPS } from '../../src/ui/home-screen.js';

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

test('active tournament checkpoint is summarized as a player-facing continue action', () => {
  const base = {
    phase: 'battle',
    tournament: { state: { rank: 'silver', roundIndex: 2, status: 'active' } },
  };
  assert.deepEqual(activeRunSummary(base), {
    title: '大会の続きから',
    detail: 'シルバーカップ・準決勝・試合中',
  });

  assert.deepEqual(activeRunSummary({
    ...base,
    phase: 'reward',
    tournament: { state: { rank: 'silver', roundIndex: 3, status: 'active' } },
  }), {
    title: 'カード奪取の続きから',
    detail: 'シルバーカップ・準決勝・カード奪取中',
  });

  assert.ok(activeRunSummary({
    ...base,
    phase: 'reward',
    tournament: { state: { rank: 'bronze', roundIndex: 3, status: 'won' } },
  }));
  assert.equal(activeRunSummary({ ...base, tournament: { state: { rank: 'silver', roundIndex: 2, status: 'eliminated' } } }), null);
});
