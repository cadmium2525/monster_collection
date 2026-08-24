import test from 'node:test';
import assert from 'node:assert/strict';
import { TournamentRun, ROUND_LABELS } from '../../src/tournament/index.js';
import { createBaselineDeck } from '../../src/data/default-decks.js';
import { masterData } from '../helpers.js';

function playerDeck() {
  return { deckId: 'deck-1', deckName: 'テスト40', ownerDisplayName: 'テスター', cards: createBaselineDeck(masterData, 'player') };
}

test('tournament is shown as 16 entrants and player advances through exactly four matches', () => {
  const run = new TournamentRun({ masterData, rank: 'bronze', playerDeck: playerDeck(), seed: 'bracket-16' });
  assert.equal(Object.keys(run.state.entrants).length, 16);
  assert.equal(run.state.rounds[0].length, 8);
  for (let round = 0; round < 4; round += 1) {
    assert.equal(ROUND_LABELS[run.state.roundIndex], ROUND_LABELS[round]);
    assert.ok(run.getCurrentOpponent());
    run.recordPlayerResult({ won: true });
  }
  assert.equal(run.state.status, 'won');
  assert.equal(run.state.wins, 4);
  assert.equal(run.state.result.nextRank, 'silver');
  assert.deepEqual(run.state.rounds.map((matches) => matches.length), [8, 4, 2, 1]);
});

test('loss or draw saves elimination state and does not grant qualification', () => {
  const run = new TournamentRun({ masterData, rank: 'gold', playerDeck: playerDeck(), seed: 'lose' });
  const result = run.recordPlayerResult({ won: false, draw: true });
  assert.equal(result.status, 'eliminated');
  assert.equal(result.draw, true);
  assert.equal(run.state.result.nextRank, undefined);
});

test('Legend rounds 1-3 use Legend opponents and final is the captured champion snapshot', () => {
  const champion = {
    displayName: '現王者テスト', deckName: '王者40', cards: createBaselineDeck(masterData, 'king'), championVersion: 42,
  };
  const run = new TournamentRun({ masterData, rank: 'legend', playerDeck: playerDeck(), seed: 'legend-final', champion });
  for (let round = 0; round < 3; round += 1) {
    assert.equal(run.getCurrentOpponent().type, 'cpu');
    assert.equal(run.getCurrentAiLevel(), 'legend');
    run.recordPlayerResult({ won: true });
  }
  assert.equal(run.getCurrentOpponent().type, 'champion');
  assert.equal(run.getCurrentOpponent().displayName, '現王者テスト');
  assert.equal(run.getCurrentAiLevel(), 'champion');
  const result = run.recordPlayerResult({ won: true });
  assert.equal(result.status, 'champion');
  assert.equal(result.defeatedChampionVersion, 42);
});
