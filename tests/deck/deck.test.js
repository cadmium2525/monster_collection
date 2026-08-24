import test from 'node:test';
import assert from 'node:assert/strict';
import { SeededRng } from '../../src/core/rng.js';
import { determineFirstPlayer, totalPlayTp, validateDeck } from '../../src/battle/deck.js';
import { createBaselineDeck } from '../../src/data/default-decks.js';
import { legalDeck, masterData, masterIndex } from '../helpers.js';

test('master data contains all canonical records', () => {
  assert.equal(masterData.monsters.length, 18);
  assert.equal(masterData.moves.length, 162);
  assert.equal(masterData.breeders.length, 20);
  assert.equal(masterData.fusions.length, 36);
  for (const monster of masterData.monsters) {
    const moves = masterData.moves.filter((move) => move.monsterName === monster.name);
    assert.equal(moves.length, 9, monster.name);
    assert.equal(moves.filter((move) => move.initial).length, 3, monster.name);
  }
});

test('deck is fixed at 40 and enforces monster copy limit', () => {
  assert.equal(validateDeck(legalDeck(), masterIndex).valid, true);
  const short = legalDeck().slice(0, 39);
  assert.match(validateDeck(short, masterIndex).errors.join('\n'), /40枚/);
  const illegal = legalDeck();
  illegal[3] = { ...illegal[3], masterId: illegal[0].masterId };
  illegal[5] = { ...illegal[5], masterId: illegal[0].masterId };
  assert.match(validateDeck(illegal, masterIndex).errors.join('\n'), /3枚まで/);
});

test('total play TP excludes move TP and lower-cost deck goes first', () => {
  const expensive = legalDeck('expensive');
  const cheap = legalDeck('cheap');
  const expensiveMonster = masterData.monsters.find((monster) => monster.summonTp === 5);
  const cheapMonster = masterData.monsters.find((monster) => monster.summonTp === 1);
  expensive[0].masterId = expensiveMonster.id;
  cheap[0].masterId = cheapMonster.id;
  assert.ok(totalPlayTp(cheap, masterIndex) < totalPlayTp(expensive, masterIndex));
  const result = determineFirstPlayer(
    { id: 'cheap', cards: cheap },
    { id: 'expensive', cards: expensive },
    masterIndex,
    new SeededRng('first'),
  );
  assert.equal(result.firstPlayerId, 'cheap');
});

test('seeded RNG is reproducible', () => {
  const a = new SeededRng('same-seed');
  const b = new SeededRng('same-seed');
  assert.deepEqual(Array.from({ length: 10 }, () => a.next()), Array.from({ length: 10 }, () => b.next()));
});

test('starter 40 exposes every canonical card category and stays legal', () => {
  const deck = createBaselineDeck(masterData, 'starter-test');
  assert.equal(validateDeck(deck, masterIndex).valid, true);
  const kinds = new Set(deck.map((card) => masterIndex.cards.get(card.masterId).kind));
  assert.deepEqual(kinds, new Set(['monster', 'training', 'shugyo', 'breeder']));
  assert.equal(deck.length, 40);
});
