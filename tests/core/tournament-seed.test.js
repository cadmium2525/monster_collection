import test from 'node:test';
import assert from 'node:assert/strict';
import { TournamentSeedSource } from '../../src/core/tournament-seed.js';

test('normal tournament runs receive distinct seeds within one page session', () => {
  const ids = ['session', 'cup-a', 'cup-b'];
  const source = new TournamentSeedSource({
    now: () => 1234,
    randomId: () => ids.shift(),
  });
  assert.equal(source.sessionSeed, 'web-ya-session');
  assert.equal(source.next(), 'web-ya-session:run:1:cup-a');
  assert.equal(source.next(), 'web-ya-session:run:2:cup-b');
});

test('explicit debug seed remains reproducible while separating repeated runs', () => {
  const first = new TournamentSeedSource({ fixedSeed: 'bug-report-42' });
  const replay = new TournamentSeedSource({ fixedSeed: 'bug-report-42' });
  assert.equal(first.next(), 'bug-report-42:run:1');
  assert.equal(first.next(), 'bug-report-42:run:2');
  assert.equal(replay.next(), 'bug-report-42:run:1');
});
