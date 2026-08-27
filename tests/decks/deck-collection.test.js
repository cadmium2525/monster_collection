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

test('deck builder keeps removed assets in that deck pool and preserves unique asset ids', () => {
  const decks = collection();
  const deck = decks.create({ deckName: '資産バインド', cards: legalDeck('asset-bind') });
  const outgoing = deck.cards[0];
  const incoming = {
    instanceId: 'pack-asset-001',
    masterId: 'monster-019',
    artVariantId: 'showcase-inorganic-01',
    finish: 'foil',
    origin: 'booster',
  };
  const updated = decks.replaceCardsAndPool(deck.deckId, {
    cards: [incoming, ...deck.cards.slice(1)],
    pool: [outgoing],
  });
  assert.equal(updated.cards.length, 40);
  assert.equal(updated.cards[0].artVariantId, 'showcase-inorganic-01');
  assert.deepEqual(updated.pool.map((card) => card.instanceId), [outgoing.instanceId]);
  assert.equal(new Set([...updated.cards, ...updated.pool].map((card) => card.instanceId)).size, 41);
});

test('legacy tournament edits remove duplicate pool references while keeping the active 40 authoritative', () => {
  const cards = legalDeck('legacy-tournament-edit');
  const legitimateReserve = { instanceId: 'reserve-only-001', masterId: 'monster-019' };
  const decks = new DeckCollection({
    masterIndex,
    records: [{
      deckId: 'legacy-corrupted-deck',
      deckName: '大会中に編集したデッキ',
      cards,
      pool: [
        { ...cards[5] },
        legitimateReserve,
        { ...legitimateReserve },
      ],
      qualification: 'bronze',
      highestReached: 'bronze',
    }],
  });

  const repaired = decks.get('legacy-corrupted-deck');
  assert.deepEqual(repaired.cards.map((card) => card.instanceId), cards.map((card) => card.instanceId));
  assert.equal(repaired.pool.length, 1);
  assert.equal(repaired.pool[0].instanceId, legitimateReserve.instanceId);
  assert.equal(repaired.pool[0].masterId, legitimateReserve.masterId);
  assert.deepEqual(decks.assetRepairReport(), [{
    deckId: 'legacy-corrupted-deck',
    removedDuplicateReferences: 2,
  }]);
  assert.doesNotThrow(() => decks.replaceCardsAndPool(repaired.deckId, repaired));
});

test('duplicate asset repair is idempotent after the repaired deck is saved', () => {
  const cards = legalDeck('legacy-reload');
  const firstLoad = new DeckCollection({
    masterIndex,
    records: [{
      deckId: 'legacy-reload-deck',
      deckName: '再読込テスト',
      cards,
      pool: [{ ...cards[0] }],
    }],
  });
  const secondLoad = new DeckCollection({ masterIndex, records: firstLoad.export() });
  assert.equal(firstLoad.assetRepairReport()[0].removedDuplicateReferences, 1);
  assert.deepEqual(secondLoad.assetRepairReport(), []);
  assert.equal(secondLoad.get('legacy-reload-deck').pool.length, 0);
});

test('saved decks migrate legacy Foil and special art off support cards', () => {
  const decks = collection();
  const cards = legalDeck('legacy-support-premium');
  const supportIndex = cards.findIndex((card) => masterIndex.cards.get(card.masterId)?.kind !== 'monster');
  cards[supportIndex] = { ...cards[supportIndex], artVariantId: 'legacy-special', finish: 'foil', rarity: 'showcase' };
  const deck = decks.create({ deckName: '旧プレミアム移行', cards });
  assert.equal(deck.cards[supportIndex].artVariantId, 'base');
  assert.equal(deck.cards[supportIndex].finish, 'normal');
  assert.equal(deck.cards[supportIndex].rarity, 'rare');
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
