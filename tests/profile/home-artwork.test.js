import test from 'node:test';
import assert from 'node:assert/strict';
import { masterIndex } from '../helpers.js';
import {
  defaultHomeArtworkSelection,
  normalizeHomeArtworkSelection,
  ownedHomeArtworkSelections,
} from '../../src/profile/home-artwork.js';

test('home artwork selection accepts base and showcase monster appearances only', () => {
  assert.deepEqual(normalizeHomeArtworkSelection({ masterId: 'monster-001' }), {
    masterId: 'monster-001', artVariantId: 'base', finish: 'normal',
  });
  assert.deepEqual(normalizeHomeArtworkSelection({ masterId: 'monster-019', artVariantId: 'showcase-inorganic-01', finish: 'foil' }), {
    masterId: 'monster-019', artVariantId: 'showcase-inorganic-01', finish: 'foil',
  });
  assert.equal(normalizeHomeArtworkSelection({ masterId: 'breeder-001' }), null);
  assert.equal(normalizeHomeArtworkSelection({ masterId: 'monster-031' }), null);
  assert.equal(normalizeHomeArtworkSelection({ masterId: 'monster-001', artVariantId: '../unsafe' }), null);
});

test('home artwork choices include catalog base art and only actually owned showcase appearances', () => {
  const selections = ownedHomeArtworkSelections({
    catalog: { ownedCardMasterIds: ['monster-001', 'monster-019'] },
    decks: [{
      cards: [{ masterId: 'monster-019', artVariantId: 'showcase-inorganic-01', finish: 'foil' }],
      pool: [{ masterId: 'monster-001', artVariantId: 'showcase-monster-001', finish: 'normal' }],
    }],
    economy: { unassignedAssets: [{ masterId: 'monster-002', artVariantId: 'base', finish: 'normal', quantity: 1 }] },
    masterIndex,
  });
  assert.deepEqual(selections, [
    { masterId: 'monster-001', artVariantId: 'base', finish: 'normal' },
    { masterId: 'monster-001', artVariantId: 'showcase-monster-001', finish: 'normal' },
    { masterId: 'monster-002', artVariantId: 'base', finish: 'normal' },
    { masterId: 'monster-019', artVariantId: 'base', finish: 'normal' },
    { masterId: 'monster-019', artVariantId: 'showcase-inorganic-01', finish: 'foil' },
  ]);
});

test('first migration keeps the current deck leader appearance as a fixed home selection', () => {
  const selection = defaultHomeArtworkSelection([{
    representativeMonsterId: 'monster-019',
    cards: [
      { masterId: 'monster-019', artVariantId: 'base', finish: 'normal' },
      { masterId: 'monster-019', artVariantId: 'showcase-inorganic-01', finish: 'foil' },
    ],
  }], masterIndex);
  assert.deepEqual(selection, { masterId: 'monster-019', artVariantId: 'showcase-inorganic-01', finish: 'foil' });
});
