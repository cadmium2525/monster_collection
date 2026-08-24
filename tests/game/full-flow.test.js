import test from 'node:test';
import assert from 'node:assert/strict';
import { DeckCollection } from '../../src/decks/DeckCollection.js';
import { GameSession } from '../../src/game/GameSession.js';
import { createBaselineDeck } from '../../src/data/default-decks.js';
import { masterData, masterIndex } from '../helpers.js';

function setup(champion = null) {
  const saves = [];
  const catalogUpdates = [];
  const repository = {
    async saveDeck(deck) { saves.push(structuredClone(deck)); return deck; },
    async recordCardCatalog(update) { catalogUpdates.push(structuredClone(update)); return update; },
    async claimChampionship(payload) { return { ...payload, championVersion: payload.expectedVersion + 1, crownedAt: '2026-08-24T00:00:00Z' }; },
  };
  let id = 0;
  const decks = new DeckCollection({ masterIndex, idFactory: () => `deck-${++id}`, now: () => '2026-08-24T00:00:00Z' });
  const deck = decks.create({ deckName: '通しテスト40', cards: createBaselineDeck(masterData, 'source') });
  const session = new GameSession({
    masterData, masterIndex, deckCollection: decks, repository, user: { id: 'u1', displayName: '通しテスター' }, champion, seed: 'full-flow',
  });
  return { session, decks, deck, saves, repository, catalogUpdates };
}

function fakeFinishedBattle(winnerId = 'player', growth = {}, log = []) {
  return {
    state: { status: 'finished', winnerId, log },
    getGrowthSnapshot: () => structuredClone(growth),
  };
}

test('a player special fusion is permanently recorded even when the match is lost', async () => {
  const { session, deck, catalogUpdates } = setup();
  await session.startTournament(deck.deckId, 'bronze');
  await session.completeBattle(fakeFinishedBattle('cpu-01', {}, [
    { type: 'fusion-special', playerId: 'player', fusionId: 'fusion-014' },
    { type: 'fusion-special', playerId: 'cpu-01', fusionId: 'fusion-001' },
    { type: 'fusion-special', playerId: 'player', fusionId: 'fusion-014' },
  ]));
  assert.deepEqual(catalogUpdates, [{ discoveredFusionIds: ['fusion-014'] }]);
});

test('Training growth carries to the next match but never enters the saved 40-card record', async () => {
  const { session, decks, deck, saves } = setup();
  await session.startTournament(deck.deckId, 'bronze');
  const monsterCard = deck.cards.find((card) => masterIndex.cards.get(card.masterId)?.kind === 'monster');
  const growth = { [monsterCard.instanceId]: { life: 5, atk: 10, def: 0, learnedMoveIds: [], equippedMoveIds: [] } };
  const outcome = await session.completeBattle(fakeFinishedBattle('player', growth));
  await session.completeReward(outcome.reward.skip());
  assert.deepEqual(session.tournament.state.tournamentGrowth, growth);
  const nextBattle = session.createCurrentBattle();
  assert.deepEqual(nextBattle.player('player').tournamentGrowth, growth);
  assert.equal('tournamentGrowth' in decks.get(deck.deckId), false);
  assert.equal(saves.some((saved) => 'tournamentGrowth' in saved), false);
});

test('home-equivalent deck selection -> four wins -> rewards -> next rank qualification', async () => {
  const { session, decks, deck, saves } = setup();
  await session.startTournament(deck.deckId, 'bronze');
  for (let round = 0; round < 4; round += 1) {
    const outcome = await session.completeBattle(fakeFinishedBattle('player'));
    assert.equal(outcome.type, 'reward');
    const cards = outcome.reward.skip();
    const afterReward = await session.completeReward(cards);
    assert.equal(afterReward.type, round === 3 ? 'tournament-end' : 'advanced');
  }
  assert.equal(decks.get(deck.deckId).qualification, 'silver');
  assert.equal(session.tournament.state.wins, 4);
  assert.ok(saves.length >= 5);
});

test('elimination preserves the latest 40 cards but grants no next qualification', async () => {
  const { session, decks, deck, saves } = setup();
  await session.startTournament(deck.deckId, 'bronze');
  const outcome = await session.completeBattle(fakeFinishedBattle('cpu-01'));
  assert.equal(outcome.type, 'tournament-end');
  assert.equal(outcome.won, false);
  assert.equal(decks.get(deck.deckId).qualification, 'bronze');
  assert.equal(saves.at(-1).cards.length, 40);
});

test('Legend fourth win crowns the post-reward saved 40 with captured championVersion', async () => {
  const champion = {
    displayName: '旧王者', deckName: '旧王者40', championVersion: 7, cards: createBaselineDeck(masterData, 'old-king'),
  };
  const { session, decks, deck } = setup(champion);
  decks.grantTournamentWin(deck.deckId, 'bronze');
  decks.grantTournamentWin(deck.deckId, 'silver');
  decks.grantTournamentWin(deck.deckId, 'gold');
  await session.startTournament(deck.deckId, 'legend');
  let final;
  for (let round = 0; round < 4; round += 1) {
    const outcome = await session.completeBattle(fakeFinishedBattle('player'));
    final = await session.completeReward(outcome.reward.skip());
  }
  assert.equal(final.crowned.expectedVersion, 7);
  assert.equal(final.crowned.championVersion, 8);
  assert.equal(final.crowned.championDeckSnapshot.length, 40);
});
