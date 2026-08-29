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

test('qualification belongs to the player and unlocks the next cup for every deck', () => {
  const decks = collection();
  const first = decks.create({ deckName: '挑戦者A', cards: legalDeck('qual-a') });
  const second = decks.create({ deckName: '挑戦者B', cards: legalDeck('qual-b') });
  assert.equal(decks.getPlayerQualification(), 'bronze');
  assert.throws(() => decks.recordTournamentEntry(second.deckId, 'silver'), /未解禁/);
  decks.recordTournamentEntry(first.deckId, 'bronze');
  assert.equal(decks.grantTournamentWin(first.deckId, 'bronze').qualification, 'silver');
  assert.equal(decks.getPlayerQualification(), 'silver');
  assert.equal(decks.get(first.deckId).highestReached, 'bronze');
  assert.equal(decks.get(second.deckId).qualification, 'silver');
  assert.doesNotThrow(() => decks.recordTournamentEntry(second.deckId, 'silver'));
  assert.equal(decks.get(second.deckId).highestReached, 'silver');
});

test('legacy per-deck qualification migrates to the highest player-wide unlock', () => {
  const records = [
    { deckId: 'legacy-bronze', deckName: '旧銅', cards: legalDeck('legacy-bronze'), qualification: 'bronze' },
    { deckId: 'legacy-gold', deckName: '旧金', cards: legalDeck('legacy-gold'), qualification: 'gold' },
  ];
  const decks = new DeckCollection({ masterIndex, records, playerQualification: 'silver' });
  assert.equal(decks.getPlayerQualification(), 'gold');
  assert.equal(decks.list().every((deck) => deck.qualification === 'gold'), true);
  assert.equal(decks.create({ deckName: '新規', cards: legalDeck('new-after-unlock') }).qualification, 'gold');
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
  assert.equal(repaired.legacyRecoveryCredits, 1);
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
  assert.equal(secondLoad.get('legacy-reload-deck').legacyRecoveryCredits, 1);
});

test('legacy recovery credit restores the player-selected owned card to the deck pool', () => {
  const cards = legalDeck('legacy-recovery');
  const decks = new DeckCollection({
    masterIndex,
    records: [{
      deckId: 'legacy-recovery-deck',
      deckName: '消失カード復元',
      cards,
      pool: [{ ...cards[0] }],
    }],
  });
  const recovered = decks.recoverLegacyAsset('legacy-recovery-deck', 'monster-019', 'legacy-recovered-chronogear');
  assert.equal(recovered.legacyRecoveryCredits, 0);
  assert.equal(recovered.pool.length, 1);
  assert.deepEqual(recovered.pool[0], {
    instanceId: 'legacy-recovered-chronogear',
    masterId: 'monster-019',
    artVariantId: 'base',
    finish: 'normal',
    origin: 'legacy-recovery',
    boundDeckId: 'legacy-recovery-deck',
    rarity: 'rare',
  });
  assert.throws(() => decks.recoverLegacyAsset('legacy-recovery-deck', 'monster-019', 'another-card'), /復元できるカード/);
});

test('legacy tournament completion preserves post-entry swaps in the pool without duplicating restored cards', () => {
  const decks = collection();
  const deck = decks.create({ deckName: '旧大会差分', cards: legalDeck('legacy-run') });
  const tournamentCards = structuredClone(deck.cards);
  const outgoing = deck.cards[5];
  const chronogear = {
    instanceId: 'booster-chronogear-001',
    masterId: 'monster-019',
    artVariantId: 'base',
    finish: 'normal',
    origin: 'booster',
    boundDeckId: deck.deckId,
  };
  const editedCards = [...deck.cards];
  editedCards[5] = chronogear;
  decks.replaceCardsAndPool(deck.deckId, { cards: editedCards, pool: [outgoing] });

  const completed = decks.replaceTournamentCards(deck.deckId, tournamentCards);
  assert.deepEqual(completed.cards.map((card) => card.instanceId), tournamentCards.map((card) => card.instanceId));
  assert.deepEqual(completed.pool.map((card) => card.instanceId), [chronogear.instanceId]);
  assert.equal(new Set([...completed.cards, ...completed.pool].map((card) => card.instanceId)).size, 41);
  assert.doesNotThrow(() => decks.replaceCardsAndPool(completed.deckId, completed));
});

test('pool collisions are also repaired at save time instead of blocking deck editing', () => {
  const decks = collection();
  const deck = decks.create({ deckName: '保存時修復', cards: legalDeck('save-repair') });
  const saved = decks.replaceCardsAndPool(deck.deckId, { cards: deck.cards, pool: [{ ...deck.cards[0] }] });
  assert.equal(saved.pool.length, 0);
});

test('saved decks migrate legacy Foil and special art off support cards', () => {
  const decks = collection();
  const cards = legalDeck('legacy-support-premium');
  const supportIndex = cards.findIndex((card) => masterIndex.cards.get(card.masterId)?.kind !== 'monster');
  cards[supportIndex] = { ...cards[supportIndex], artVariantId: 'legacy-special', finish: 'foil', rarity: 'showcase' };
  const deck = decks.create({ deckName: '旧プレミアム移行', cards });
  assert.equal(deck.cards[supportIndex].artVariantId, 'base');
  assert.equal(deck.cards[supportIndex].finish, 'normal');
  assert.equal(deck.cards[supportIndex].rarity, 'common');
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
