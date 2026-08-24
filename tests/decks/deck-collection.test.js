import test from 'node:test';
import assert from 'node:assert/strict';
import { DeckCollection } from '../../src/decks/index.js';
import { legalDeck, masterIndex } from '../helpers.js';

function collection() {
  let id = 0;
  let tick = 0;
  return new DeckCollection({
    masterIndex,
    idFactory: () => `deck-${++id}`,
    now: () => `2026-08-24T00:00:${String(++tick).padStart(2, '0')}.000Z`,
  });
}

test('up to five named 40-card decks are stored with summaries', () => {
  const decks = collection();
  for (let index = 0; index < 5; index += 1) {
    const deck = decks.create({ deckName: `デッキ${index + 1}`, cards: legalDeck(`source-${index}`) });
    assert.equal(deck.cards.length, 40);
    assert.ok(deck.totalPlayTp > 0);
    assert.ok(deck.representativeMonsterId);
  }
  assert.equal(decks.list().length, 5);
  assert.throws(() => decks.create({ deckName: '6個目', cards: legalDeck('six') }), /最大5/);
});

test('qualification belongs to a deck and advances only on tournament win', () => {
  const decks = collection();
  const deck = decks.create({ deckName: '挑戦者', cards: legalDeck('qual') });
  assert.equal(deck.qualification, 'bronze');
  assert.throws(() => decks.recordTournamentEntry(deck.deckId, 'silver'), /出場資格/);
  decks.recordTournamentEntry(deck.deckId, 'bronze');
  assert.equal(decks.grantTournamentWin(deck.deckId, 'bronze').qualification, 'silver');
  assert.equal(decks.get(deck.deckId).highestReached, 'bronze');
  decks.recordTournamentEntry(deck.deckId, 'silver');
  assert.equal(decks.get(deck.deckId).highestReached, 'silver');
});

test('replacing cards recalculates total TP and does not store tournament growth', () => {
  const decks = collection();
  const deck = decks.create({ deckName: '交換前', cards: legalDeck('replace-a') });
  const updated = decks.replaceCards(deck.deckId, legalDeck('replace-b'));
  assert.equal(updated.cards.length, 40);
  assert.equal('tournamentGrowth' in updated, false);
  assert.equal(decks.rename(deck.deckId, '交換後').deckName, '交換後');
});

test('deck leader can be selected from its monsters and survives card updates while present', () => {
  const decks = collection();
  const originalCards = legalDeck('leader-a');
  const deck = decks.create({ deckName: 'リーダーテスト', cards: originalCards });
  const monsterIds = [...new Set(originalCards.map((card) => card.masterId)
    .filter((id) => masterIndex.cards.get(id)?.kind === 'monster'))];
  const selectedId = monsterIds.at(-1);
  assert.equal(decks.setRepresentativeMonster(deck.deckId, selectedId).representativeMonsterId, selectedId);
  assert.equal(decks.replaceCards(deck.deckId, legalDeck('leader-b')).representativeMonsterId, selectedId);
  assert.throws(() => decks.setRepresentativeMonster(deck.deckId, 'training-life'), /このデッキ/);
  assert.throws(() => decks.setRepresentativeMonster(deck.deckId, 'missing-monster'), /このデッキ/);
});

test('deck leader falls back safely when that monster leaves the 40 cards', () => {
  const decks = collection();
  const originalCards = legalDeck('leader-remove');
  const deck = decks.create({ deckName: '交代テスト', cards: originalCards });
  const selectedId = 'monster-018';
  decks.setRepresentativeMonster(deck.deckId, selectedId);
  const replacement = legalDeck('leader-replaced').map((card) => card.masterId === selectedId
    ? { ...card, masterId: 'training-def' }
    : card);
  const updated = decks.replaceCards(deck.deckId, replacement);
  assert.notEqual(updated.representativeMonsterId, selectedId);
  assert.equal(masterIndex.cards.get(updated.representativeMonsterId).kind, 'monster');
});
