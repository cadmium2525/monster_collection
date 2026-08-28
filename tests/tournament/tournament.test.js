import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceCpuTournamentGrowth, TournamentRun, ROUND_LABELS, summarizeCpuTournamentGrowth } from '../../src/tournament/index.js';
import { createBaselineDeck } from '../../src/data/default-decks.js';
import { card, masterData, masterIndex, monsterByName } from '../helpers.js';

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

test('other bracket results stay visually pending until the player match finishes', () => {
  const run = new TournamentRun({ masterData, rank: 'bronze', playerDeck: playerDeck(), seed: 'delayed-bracket' });
  const initialRound = run.getBracket().rounds[0];
  const otherMatches = initialRound.filter((match) => !match.entrants.includes('player'));
  assert.equal(otherMatches.length, 7);
  assert.ok(otherMatches.every((match) => match.status === 'pending' && match.winnerId === null && match.resultHidden));

  const internalOtherMatches = run.state.rounds[0].filter((match) => !match.entrants.includes('player'));
  assert.ok(internalOtherMatches.every((match) => match.status === 'resolved' && match.winnerId));

  run.recordPlayerResult({ won: true });
  const bracket = run.getBracket();
  assert.ok(bracket.rounds[0].every((match) => match.status === 'resolved' && !match.resultHidden));
  assert.ok(bracket.rounds[1].filter((match) => !match.entrants.includes('player'))
    .every((match) => match.status === 'pending' && match.resultHidden));
});

test('tournament checkpoint restores the exact seeded bracket and continuation', () => {
  const original = new TournamentRun({ masterData, rank: 'silver', playerDeck: playerDeck(), seed: 'tournament-resume' });
  original.recordPlayerResult({ won: true });
  const restored = TournamentRun.fromCheckpoint({ masterData, checkpoint: original.toCheckpoint() });
  assert.deepEqual(restored.toCheckpoint(), original.toCheckpoint());

  original.recordPlayerResult({ won: true });
  restored.recordPlayerResult({ won: true });
  assert.deepEqual(restored.toCheckpoint(), original.toCheckpoint());
});

test('CPU winners carry plausible seeded Training and shugyo growth into later rounds', () => {
  const run = new TournamentRun({ masterData, rank: 'gold', playerDeck: playerDeck(), seed: 'cpu-growth-carry' });
  assert.equal(summarizeCpuTournamentGrowth(run.getCurrentOpponent()).wins, 0, 'first-round opponent has no prior match');

  for (let expectedWins = 1; expectedWins <= 3; expectedWins += 1) {
    run.recordPlayerResult({ won: true });
    const opponent = run.getCurrentOpponent();
    const summary = summarizeCpuTournamentGrowth(opponent);
    assert.equal(summary.wins, expectedWins);
    assert.ok(summary.uses >= expectedWins, 'the advancing entrant used growth cards in its prior matches');
    assert.ok(summary.statGain > 0);
    assert.ok(Object.keys(opponent.tournamentGrowth).length > 0);
    assert.ok(opponent.growthHistory.every((event) => ['training', 'shugyo'].includes(run.masterIndex.cards.get(event.cardMasterId)?.kind)));
  }
});

test('CPU bracket growth is reproducible from the tournament seed', () => {
  const collect = () => {
    const run = new TournamentRun({ masterData, rank: 'legend', playerDeck: playerDeck(), seed: 'cpu-growth-repeat' });
    const snapshots = [];
    for (let round = 0; round < 3; round += 1) {
      run.recordPlayerResult({ won: true });
      const opponent = run.getCurrentOpponent();
      snapshots.push({
        id: opponent.id,
        growth: opponent.tournamentGrowth,
        history: opponent.growthHistory,
        wins: opponent.virtualMatchWins,
      });
    }
    return snapshots;
  };
  assert.deepEqual(collect(), collect());
});

test('Legend virtual winners can invest the full 10TP into two shugyo cards', () => {
  const monster = monsterByName('ドラゴン');
  const entrant = {
    cards: [
      card(monster.id, 'legend-growth-monster'),
      card('shugyo-attack', 'legend-shugyo-a'),
      card('shugyo-defense', 'legend-shugyo-b'),
    ],
    tournamentGrowth: {},
    growthHistory: [],
    virtualMatchWins: 0,
  };
  const advanced = advanceCpuTournamentGrowth({
    entrant,
    masterData,
    masterIndex,
    rank: 'legend',
    roundIndex: 1,
    rng: { weightedChoice: (items) => items[0], int: (min) => min },
  });
  assert.equal(advanced.growthHistory.length, 2);
  assert.equal(advanced.growthHistory.every((event) => event.cardMasterId.startsWith('shugyo-')), true);
  assert.equal(advanced.virtualMatchWins, 1);
});

test('loss or draw saves elimination state and does not grant qualification', () => {
  const run = new TournamentRun({ masterData, rank: 'gold', playerDeck: playerDeck(), seed: 'lose' });
  const result = run.recordPlayerResult({ won: false, draw: true });
  assert.equal(result.status, 'eliminated');
  assert.equal(result.draw, true);
  assert.equal(run.state.result.nextRank, undefined);
});

test('Legend rounds 1-3 use Legend opponents and final is the captured champion snapshot', () => {
  const championCards = createBaselineDeck(masterData, 'king');
  const developedCard = championCards.find((card) => card.masterId === 'monster-002');
  const champion = {
    championDisplayName: '現王者テスト', championDeckName: '王者40', championDeckSnapshot: championCards, championVersion: 42,
    championGrowthSnapshot: {
      [developedCard.instanceId]: { life: 25, atk: 15, def: 10, learnedMoveIds: [], equippedMoveIds: [] },
    },
  };
  const run = new TournamentRun({ masterData, rank: 'legend', playerDeck: playerDeck(), seed: 'legend-final', champion });
  for (let round = 0; round < 3; round += 1) {
    assert.equal(run.getCurrentOpponent().type, 'cpu');
    assert.equal(run.getCurrentAiLevel(), 'legend');
    run.recordPlayerResult({ won: true });
  }
  assert.equal(run.getCurrentOpponent().type, 'champion');
  assert.equal(run.getCurrentOpponent().displayName, '現王者テスト');
  assert.equal(run.getCurrentOpponent().tournamentGrowth[developedCard.instanceId].life, 25);
  assert.equal(run.getCurrentOpponent().tournamentGrowth[developedCard.instanceId].atk, 15);
  assert.equal(summarizeCpuTournamentGrowth(run.getCurrentOpponent()).wins, 0, '王者へ新たな仮想育成を加えない');
  assert.equal(run.getCurrentAiLevel(), 'champion');
  const result = run.recordPlayerResult({ won: true });
  assert.equal(result.status, 'champion');
  assert.equal(result.defeatedChampionVersion, 42);
});

test('Legend final-start snapshot freezes the challenger 40 and growth and survives checkpoints', () => {
  const run = new TournamentRun({ masterData, rank: 'legend', playerDeck: playerDeck(), seed: 'crown-snapshot' });
  for (let round = 0; round < 3; round += 1) run.recordPlayerResult({ won: true });
  const developedCard = run.state.playerDeck.cards.find((card) => card.masterId === 'monster-002');
  run.updateGrowth({
    [developedCard.instanceId]: { life: 20, atk: 10, def: 5, learnedMoveIds: [], equippedMoveIds: [] },
    'released-card-not-in-final-deck': { life: 99, atk: 99, def: 99, learnedMoveIds: [], equippedMoveIds: [] },
  });
  const snapshot = run.captureLegendFinalSnapshot();
  run.state.playerDeck.cards[0] = { instanceId: 'after-final-card', masterId: 'monster-019' };
  run.state.tournamentGrowth[developedCard.instanceId].life = 99;

  assert.equal(snapshot.cards.length, 40);
  assert.equal(snapshot.tournamentGrowth[developedCard.instanceId].life, 20);
  assert.equal('released-card-not-in-final-deck' in snapshot.tournamentGrowth, false);
  assert.deepEqual(run.captureLegendFinalSnapshot(), snapshot, '決勝中の変化で上書きしない');
  const restored = TournamentRun.fromCheckpoint({ masterData, checkpoint: run.toCheckpoint() });
  assert.deepEqual(restored.getLegendFinalSnapshot(), snapshot);
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
