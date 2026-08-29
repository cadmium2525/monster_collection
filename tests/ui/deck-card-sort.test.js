import test from 'node:test';
import assert from 'node:assert/strict';
import { masterIndex } from '../helpers.js';
import { DECK_CARD_SORT_OPTIONS, sortDeckCards } from '../../src/ui/deck-card-sort.js';

const card = (masterId, instanceId) => ({ masterId, instanceId });

test('deck cards sort by kind, TP, name or original order without mutating assets', () => {
  const cards = [
    card('breeder-001', 'breeder'),
    card('monster-003', 'monster-high'),
    card('training-life', 'training'),
    card('monster-008', 'monster-low'),
    card('shugyo-attack', 'shugyo'),
  ];
  const originalIds = cards.map((entry) => entry.instanceId);

  assert.deepEqual(sortDeckCards(cards, masterIndex, 'kind').map((entry) => entry.instanceId), [
    'monster-low', 'monster-high', 'training', 'shugyo', 'breeder',
  ]);
  assert.deepEqual(sortDeckCards(cards, masterIndex, 'cost-asc').map((entry) => entry.instanceId), [
    'monster-low', 'training', 'breeder', 'monster-high', 'shugyo',
  ]);
  assert.deepEqual(sortDeckCards(cards, masterIndex, 'cost-desc').map((entry) => entry.instanceId), [
    'monster-high', 'shugyo', 'breeder', 'training', 'monster-low',
  ]);
  assert.deepEqual(sortDeckCards(cards, masterIndex, 'name').map((entry) => masterIndex.cards.get(entry.masterId).name),
    cards.map((entry) => masterIndex.cards.get(entry.masterId).name).sort((a, b) => a.localeCompare(b, 'ja')));
  assert.deepEqual(sortDeckCards(cards, masterIndex, 'original').map((entry) => entry.instanceId), originalIds);
  assert.deepEqual(cards.map((entry) => entry.instanceId), originalIds, 'source card order remains untouched');
});

test('deck sort exposes every player-facing option', () => {
  assert.deepEqual(DECK_CARD_SORT_OPTIONS.map((option) => option.label), [
    '種類順', 'TPが低い順', 'TPが高い順', '名前順', '登録順',
  ]);
});
