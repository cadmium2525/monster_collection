import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalogModel } from '../../src/ui/catalog-model.js';
import { masterIndex } from '../helpers.js';

test('card catalog exposes every basic card and special fusion while marking collection state', () => {
  const catalog = { ownedCardMasterIds: ['monster-001', 'training-life'], discoveredFusionIds: ['fusion-014'] };
  const all = buildCatalogModel(catalog, masterIndex, 'all');
  assert.equal(all.cards.length, masterIndex.cards.size);
  assert.equal(all.fusions.length, masterIndex.data.fusions.length);
  assert.equal(all.progress.owned, 2);
  assert.equal(all.progress.discovered, 1);
  assert.equal(all.cards.find((entry) => entry.definition.id === 'monster-001').owned, true);
  assert.equal(all.cards.find((entry) => entry.definition.id === 'monster-002').owned, false);
  assert.equal(all.fusions.find((entry) => entry.fusion.id === 'fusion-014').discovered, true);
  assert.equal(all.fusions.find((entry) => entry.fusion.id === 'fusion-015').discovered, false);
});

test('catalog state filters separate unowned cards and undiscovered fusions', () => {
  const catalog = { ownedCardMasterIds: ['monster-001'], discoveredFusionIds: ['fusion-014'] };
  const unowned = buildCatalogModel(catalog, masterIndex, 'unowned');
  const undiscovered = buildCatalogModel(catalog, masterIndex, 'undiscovered');
  assert.equal(unowned.cards.length, masterIndex.cards.size - 1);
  assert.equal(unowned.cards.every((entry) => !entry.owned), true);
  assert.equal(unowned.fusions.length, 0);
  assert.equal(undiscovered.cards.length, 0);
  assert.equal(undiscovered.fusions.length, masterIndex.data.fusions.length - 1);
  assert.equal(undiscovered.fusions.every((entry) => !entry.discovered), true);
});

test('catalog exposes capture-only and booster-only filters', () => {
  const catalog = { ownedCardMasterIds: [], discoveredFusionIds: [] };
  const trophy = buildCatalogModel(catalog, masterIndex, 'trophy');
  const booster = buildCatalogModel(catalog, masterIndex, 'booster');
  assert.equal(trophy.cards.length, 18);
  assert.equal(trophy.cards.every(({ definition }) => definition.id.startsWith('breeder-')), true);
  assert.equal(booster.cards.length, 12);
  assert.equal(booster.cards.every(({ definition }) => definition.id.startsWith('monster-')), true);
  assert.ok(booster.filters.some(([id, label, count]) => id === 'booster' && label === 'ブースター限定' && count === 12));
});
