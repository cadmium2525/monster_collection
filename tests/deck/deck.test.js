import test from 'node:test';
import assert from 'node:assert/strict';
import { SeededRng } from '../../src/core/rng.js';
import { determineFirstPlayer, totalPlayTp, validateDeck } from '../../src/battle/deck.js';
import { createBaselineDeck, createFactionStarterDeck, STARTER_DECK_OPTIONS } from '../../src/data/default-decks.js';
import { legalDeck, masterData, masterIndex } from '../helpers.js';

test('master data contains all canonical records', () => {
  assert.equal(masterData.monsters.length, 24);
  assert.equal(masterData.moves.length, 216);
  assert.equal(masterData.breeders.length, 52);
  assert.equal(masterData.fusions.length, 48);
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

test('all six faction starters are deterministic legal 40-card decks with a clear faction core', () => {
  assert.deepEqual(STARTER_DECK_OPTIONS.map((starter) => starter.faction), ['無機', '創造', '幻霊', '魔族', '獣族', '怪物']);
  const signatures = new Set();
  for (const starter of STARTER_DECK_OPTIONS) {
    const deck = createFactionStarterDeck(masterData, starter.faction, `starter-${starter.faction}`);
    assert.equal(validateDeck(deck, masterIndex).valid, true, starter.faction);
    assert.equal(deck.length, 40, starter.faction);
    assert.equal(new Set(deck.map((card) => card.instanceId)).size, 40, starter.faction);
    assert.ok(deck.some((card) => card.masterId === starter.representativeMonsterId), `${starter.faction} leader`);
    assert.equal(deck.filter((card) => {
      const definition = masterIndex.cards.get(card.masterId);
      return definition.kind === 'monster' && definition.faction === starter.faction;
    }).length, 9, starter.faction);
    assert.equal(deck.filter((card) => {
      const definition = masterIndex.cards.get(card.masterId);
      return definition.kind === 'breeder' && definition.faction === starter.faction;
    }).length, 4, starter.faction);
    signatures.add(deck.map((card) => card.masterId).join(','));
    assert.deepEqual(createFactionStarterDeck(masterData, starter.faction, `starter-${starter.faction}`), deck);
  }
  assert.equal(signatures.size, 6);
  assert.throws(() => createFactionStarterDeck(masterData, '混合'), /Unknown starter faction/);
});

test('the original twelve faction breeders have effect-specific names while keeping stable IDs', () => {
  const names = {
    'breeder-009': '無機・硬化装甲', 'breeder-010': '無機・装甲解析',
    'breeder-011': '創造・省力設計', 'breeder-012': '創造・機能停止',
    'breeder-013': '幻霊・連続顕現', 'breeder-014': '幻霊・幽体回避',
    'breeder-015': '魔族・魔力注入', 'breeder-016': '魔族・群魔の共鳴',
    'breeder-017': '獣族・野生の活力', 'breeder-018': '獣族・生命の息吹',
    'breeder-019': '怪物・威嚇咆哮', 'breeder-020': '怪物・群体進化',
  };
  for (const [id, name] of Object.entries(names)) assert.equal(masterIndex.cards.get(id).name, name);
  assert.equal(Object.values(names).some((name) => /[①②]/.test(name)), false);
});
