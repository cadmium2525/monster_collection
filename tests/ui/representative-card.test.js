import test from 'node:test';
import assert from 'node:assert/strict';
import { representativeCardAsset } from '../../src/ui/representative-card.js';

test('deck leader appearance prefers special Foil, then special, Foil and normal', () => {
  const cards = [
    { instanceId: 'normal', masterId: 'monster-019', artVariantId: 'base', finish: 'normal' },
    { instanceId: 'foil', masterId: 'monster-019', artVariantId: 'base', finish: 'foil' },
    { instanceId: 'special', masterId: 'monster-019', artVariantId: 'showcase-inorganic-01', finish: 'normal' },
    { instanceId: 'special-foil', masterId: 'monster-019', artVariantId: 'showcase-inorganic-01', finish: 'foil' },
  ];
  assert.equal(representativeCardAsset(cards, 'monster-019').instanceId, 'special-foil');
  assert.equal(representativeCardAsset(cards.slice(0, 3), 'monster-019').instanceId, 'special');
  assert.equal(representativeCardAsset(cards.slice(0, 2), 'monster-019').instanceId, 'foil');
  assert.equal(representativeCardAsset(cards.slice(0, 1), 'monster-019').instanceId, 'normal');
  assert.equal(representativeCardAsset(cards, 'monster-001'), null);
});
