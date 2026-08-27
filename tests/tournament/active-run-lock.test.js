import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeRunDeckId, activeTournamentState, isDeckLockedByActiveRun } from '../../src/tournament/active-run.js';

function checkpoint(phase = 'battle', status = 'active', deckId = 'deck-in-run') {
  return { phase, tournament: { state: { status, playerDeck: { deckId } } } };
}

test('only the deck referenced by a resumable tournament checkpoint is locked', () => {
  for (const phase of ['tournament', 'battle']) {
    const run = checkpoint(phase);
    assert.equal(activeRunDeckId(run), 'deck-in-run');
    assert.equal(isDeckLockedByActiveRun(run, 'deck-in-run'), true);
    assert.equal(isDeckLockedByActiveRun(run, 'another-deck'), false);
  }
  for (const status of ['active', 'won', 'champion']) {
    assert.equal(isDeckLockedByActiveRun(checkpoint('reward', status), 'deck-in-run'), true);
  }
});

test('finished, cleared and malformed checkpoints never leave a deck locked', () => {
  assert.equal(activeTournamentState(checkpoint('battle', 'eliminated')), null);
  assert.equal(activeRunDeckId(checkpoint('cleared')), null);
  assert.equal(activeRunDeckId({ phase: 'battle', tournament: { state: { status: 'active' } } }), null);
  assert.equal(isDeckLockedByActiveRun(null, 'deck-in-run'), false);
});

test('deck management UI and app both enforce the tournament lock', () => {
  const screens = fs.readFileSync(new URL('../../src/ui/deck-screens.js', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8');
  assert.match(screens, /大会参加中のため編集できません/);
  assert.match(screens, /this\.locked \? el\('section'/);
  assert.match(app, /showDeckBuilder\(deck\)[\s\S]*?this\.isDeckEditingLocked\(deck\.deckId\)/);
  assert.match(app, /confirmDeleteDeck\(deck\)[\s\S]*?this\.isDeckEditingLocked\(deck\.deckId\)/);
  assert.match(app, /onSave: async \(draft, economy\) => \{[\s\S]*?this\.isDeckEditingLocked\(deck\.deckId\)/);
});
