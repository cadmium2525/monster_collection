import test from 'node:test';
import assert from 'node:assert/strict';
import { CardStealSession } from '../../src/reward/index.js';
import { legalDeck, masterIndex } from '../helpers.js';

test('five cards are offered and zero selection skips without changing the original deck', () => {
  const original = legalDeck('mine');
  const session = new CardStealSession({ playerCards: original, defeatedCards: legalDeck('enemy'), masterIndex, deckId: 'mine', seed: 'five' });
  assert.equal(session.state.offered.length, 5);
  assert.deepEqual(session.skip(), original);
  assert.deepEqual(original, legalDeck('mine'));
});

test('one or two acquisitions require the same release count and commit exactly 40 legal cards', () => {
  for (const count of [1, 2]) {
    const original = legalDeck(`mine-${count}`);
    const session = new CardStealSession({ playerCards: original, defeatedCards: legalDeck(`enemy-${count}`), masterIndex, deckId: `mine-${count}`, seed: `take-${count}` });
    for (const offer of session.state.offered.slice(0, count)) session.toggleOffer(offer.offerId);
    for (const card of original.slice(0, count)) session.toggleRelease(card.instanceId);
    const preview = session.preview();
    assert.equal(preview.acquired.length, count);
    assert.equal(preview.released.length, count);
    assert.equal(preview.finalCards.length, 40);
    assert.equal(preview.valid, true);
    const committed = session.commit();
    assert.equal(committed.length, 40);
    assert.equal(session.state.status, 'committed');
    assert.deepEqual(original, legalDeck(`mine-${count}`), 'input deck must remain untouched');
  }
});

test('selection can move from two cards back to one and cancel never mutates cards', () => {
  const original = legalDeck('mine-back');
  const session = new CardStealSession({ playerCards: original, defeatedCards: legalDeck('enemy-back'), masterIndex, deckId: 'mine-back', seed: 'back' });
  session.toggleOffer('offer-1');
  session.toggleOffer('offer-2');
  session.toggleRelease(original[0].instanceId);
  session.toggleRelease(original[1].instanceId);
  session.toggleOffer('offer-2');
  assert.equal(session.state.selectedOfferIds.length, 1);
  assert.equal(session.state.selectedReleaseIds.length, 1);
  assert.deepEqual(session.cancel(), original);
  assert.equal(session.state.status, 'cancelled');
});

test('copy-limit violation is blocked until a conflicting copy is released', () => {
  const original = legalDeck('limit');
  const enemy = legalDeck('enemy-limit');
  enemy[0] = { ...enemy[0], masterId: original[0].masterId };
  const session = new CardStealSession({ playerCards: original, defeatedCards: enemy, masterIndex, deckId: 'limit', seed: 'copy-limit' });
  const offered = session.state.offered.find((offer) => offer.masterId === original[0].masterId);
  if (!offered) return;
  session.toggleOffer(offered.offerId);
  const different = original.find((card) => card.masterId !== offered.masterId);
  session.toggleRelease(different.instanceId);
  assert.equal(session.preview().valid, false);
});
