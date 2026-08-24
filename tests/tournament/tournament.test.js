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

test('Legend bracket includes valid public player decks, fills remaining slots with CPUs, and reserves the final for champion', () => {
  const champion = {
    championUserId: 'king-user', championDeckId: 'king-deck', displayName: '現王者', deckName: '王者40',
    cards: createBaselineDeck(masterData, 'king-public'), championVersion: 9,
  };
  const legendDecks = [
    {
      publicDeckId: 'rival-a--deck-a', ownerUserId: 'rival-a', ownerDisplayName: '挑戦者A', sourceDeckId: 'deck-a',
      deckName: 'Aの40枚', cards: createBaselineDeck(masterData, 'rival-a'), qualification: 'legend',
    },
    {
      publicDeckId: 'rival-b--deck-b', ownerUserId: 'rival-b', ownerDisplayName: '挑戦者B', sourceDeckId: 'deck-b',
      deckName: 'Bの40枚', cards: createBaselineDeck(masterData, 'rival-b'), qualification: 'legend',
    },
    {
      publicDeckId: 'bad--deck', ownerUserId: 'bad', ownerDisplayName: '不正データ', sourceDeckId: 'bad',
      deckName: '壊れた40枚', cards: [{ instanceId: 'bad-1', masterId: 'unknown' }], qualification: 'legend',
    },
  ];
  const run = new TournamentRun({ masterData, rank: 'legend', playerDeck: playerDeck(), seed: 'public-legend', champion, legendDecks });
  const entrants = Object.values(run.state.entrants);
  assert.equal(entrants.length, 16);
  assert.equal(entrants.filter((entrant) => entrant.type === 'challenger').length, 2);
  assert.equal(entrants.filter((entrant) => entrant.type === 'cpu').length, 12);
  assert.equal(entrants.filter((entrant) => entrant.type === 'champion').length, 1);
  assert.deepEqual(entrants.filter((entrant) => entrant.type === 'challenger').map((entrant) => entrant.displayName).sort(), ['挑戦者A', '挑戦者B']);

  for (let round = 0; round < 3; round += 1) run.recordPlayerResult({ won: true });
  assert.equal(run.getCurrentOpponent().type, 'champion');
});
