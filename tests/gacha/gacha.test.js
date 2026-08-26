import test from 'node:test';
import assert from 'node:assert/strict';
import { CardStealSession } from '../../src/reward/CardStealSession.js';
import { generateBoosterPack } from '../../src/gacha/pack-generator.js';
import { BOOSTER_MONSTER_IDS, TROPHY_BREEDER_IDS, acquisitionOrigin } from '../../src/gacha/acquisition.js';
import { applyDiamondReward, applyPackPurchase, defaultEconomyState, normalizeEconomyState } from '../../src/gacha/economy-state.js';
import { SeededRng } from '../../src/core/rng.js';
import { generateCpuDeck } from '../../src/tournament/deck-generator.js';
import { legalDeck, masterIndex } from '../helpers.js';

test('recent faction breeders are the twelve trophy-only cards and never enter boosters', () => {
  assert.deepEqual(TROPHY_BREEDER_IDS, Array.from({ length: 12 }, (_, index) => `breeder-${String(index + 29).padStart(3, '0')}`));
  for (const id of TROPHY_BREEDER_IDS) assert.equal(acquisitionOrigin(masterIndex.cards.get(id)), 'trophy');
  for (const faction of ['無機', '創造', '幻霊', '魔族', '獣族', '怪物']) {
    for (let seed = 0; seed < 30; seed += 1) {
      const result = generateBoosterPack({ masterIndex, faction, seed: `${faction}:${seed}`, openedCount: seed });
      assert.equal(result.cards.length, 5);
      assert.equal(result.cards.some((card) => TROPHY_BREEDER_IDS.includes(card.masterId)), false);
    }
  }
});

test('tutorial booster guarantees its faction booster monster and every pack has a monster plus Rare or better', () => {
  const expected = { '無機': 'monster-019', '創造': 'monster-020', '幻霊': 'monster-021', '魔族': 'monster-022', '獣族': 'monster-023', '怪物': 'monster-024' };
  for (const [faction, monsterId] of Object.entries(expected)) {
    const result = generateBoosterPack({ masterIndex, faction, seed: `tutorial:${faction}`, openedCount: 0 });
    assert.ok(result.cards.some((card) => card.masterId === monsterId));
    assert.ok(result.cards.some((card) => masterIndex.cards.get(card.masterId).kind === 'monster'));
    assert.ok(result.cards.some((card) => ['rare', 'showcase'].includes(card.rarity)));
  }
});

test('five, ten and twenty-pack guarantees are deterministic per faction', () => {
  for (const faction of ['無機', '創造', '幻霊', '魔族', '獣族', '怪物']) {
    const fifth = generateBoosterPack({ masterIndex, faction, seed: `fifth:${faction}`, openedCount: 4 });
    const tenth = generateBoosterPack({ masterIndex, faction, seed: `tenth:${faction}`, openedCount: 9 });
    const twentieth = generateBoosterPack({ masterIndex, faction, seed: `twentieth:${faction}`, openedCount: 19 });
    assert.ok(fifth.cards.some((card) => BOOSTER_MONSTER_IDS.includes(card.masterId)));
    assert.ok(tenth.cards.some((card) => card.finish === 'foil'));
    assert.ok(tenth.cards.filter((card) => card.finish === 'foil').every((card) => masterIndex.cards.get(card.masterId)?.kind === 'monster'));
    assert.ok(twentieth.cards.some((card) => card.artVariantId !== 'base' && card.rarity === 'showcase'));
    assert.ok(twentieth.cards.filter((card) => card.artVariantId !== 'base').every((card) => masterIndex.cards.get(card.masterId)?.kind === 'monster'));
  }
});

test('legacy premium support assets are migrated to normal appearance', () => {
  const legacy = defaultEconomyState();
  legacy.unassignedAssets = [{
    masterId: 'breeder-001', artVariantId: 'legacy-special', finish: 'foil', rarity: 'showcase', origin: 'core', quantity: 2,
  }];
  legacy.pendingPack = {
    operationId: 'legacy-pack', faction: '無機', packId: 'pack-inorganic',
    cards: [{ masterId: 'training-life', artVariantId: 'legacy-special', finish: 'foil', rarity: 'showcase', origin: 'core' }],
  };
  const migrated = normalizeEconomyState(legacy);
  assert.deepEqual(migrated.unassignedAssets[0], {
    masterId: 'breeder-001', artVariantId: 'base', finish: 'normal', rarity: 'rare', origin: 'core', quantity: 2, firstObtainedAt: null,
  });
  assert.equal(migrated.pendingPack.cards[0].artVariantId, 'base');
  assert.equal(migrated.pendingPack.cards[0].finish, 'normal');
  assert.equal(migrated.pendingPack.cards[0].rarity, 'rare');
});

test('every generated Foil and special illustration belongs to a monster', () => {
  for (const faction of ['無機', '創造', '幻霊', '魔族', '獣族', '怪物']) {
    for (let openedCount = 0; openedCount < 40; openedCount += 1) {
      const pack = generateBoosterPack({ masterIndex, faction, openedCount, seed: `premium-rule:${faction}:${openedCount}` });
      const premium = pack.cards.filter((card) => card.finish === 'foil' || card.artVariantId !== 'base');
      assert.ok(premium.every((card) => masterIndex.cards.get(card.masterId)?.kind === 'monster'));
    }
  }
});

test('normal CPU decks keep trophy breeders obtainable but never generate booster-only monsters', () => {
  let trophySeen = false;
  for (const rank of ['bronze', 'silver', 'gold', 'legend']) {
    for (const faction of ['無機', '創造', '幻霊', '魔族', '獣族', '怪物']) {
      const generated = generateCpuDeck({ masterIndex, rank, theme: faction, rng: new SeededRng(`cpu:${rank}:${faction}`) });
      assert.equal(generated.cards.some((card) => BOOSTER_MONSTER_IDS.includes(card.masterId)), false);
      trophySeen ||= generated.cards.some((card) => TROPHY_BREEDER_IDS.includes(card.masterId));
    }
  }
  assert.equal(trophySeen, true);
});

test('pack purchase persists five assets before reveal and operation ids prevent double spending or rewards', () => {
  const pack = generateBoosterPack({ masterIndex, faction: '無機', seed: 'atomic-pack', openedCount: 0 });
  const purchase = { operationId: 'pack-op-1', faction: '無機', packId: pack.packId, cards: pack.cards, cost: 300, useFreeCredit: false };
  const once = applyPackPurchase(defaultEconomyState(), purchase, '2026-08-26T00:00:00.000Z');
  const twice = applyPackPurchase(once, purchase, '2026-08-26T00:00:01.000Z');
  assert.equal(once.diamonds, 300);
  assert.equal(twice.diamonds, 300);
  assert.equal(twice.unassignedAssets.reduce((sum, stack) => sum + stack.quantity, 0), 5);
  assert.equal(twice.pendingPack.operationId, 'pack-op-1');
  const rewarded = applyDiamondReward(twice, { operationId: 'cup-win-1', amount: 50 });
  const duplicated = applyDiamondReward(rewarded, { operationId: 'cup-win-1', amount: 50 });
  assert.equal(duplicated.diamonds, 350);
});

test('special illustrations and Foil are normalized to ordinary art when offered for capture', () => {
  const opponent = legalDeck('showcase-opponent');
  opponent[0] = { ...opponent[0], masterId: 'monster-019', artVariantId: 'showcase-inorganic-01', finish: 'foil', origin: 'booster' };
  let found = false;
  for (let seed = 0; seed < 100 && !found; seed += 1) {
    const session = new CardStealSession({ playerCards: legalDeck('player'), defeatedCards: opponent, masterIndex, deckId: 'player', seed: `steal:${seed}` });
    const offer = session.getState().offered.find((card) => card.masterId === 'monster-019');
    if (!offer) continue;
    found = true;
    assert.equal(offer.artVariantId, 'base');
    assert.equal(offer.finish, 'normal');
    assert.equal(offer.origin, 'capture');
  }
  assert.equal(found, true);
});
