import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { CardStealSession } from '../../src/reward/CardStealSession.js';
import { SHOWCASE_VARIANTS, boosterPackDisclosure, generateBoosterPack } from '../../src/gacha/pack-generator.js';
import { BOOSTER_MONSTER_IDS, TROPHY_BREEDER_IDS, acquisitionOrigin, isPackEligible } from '../../src/gacha/acquisition.js';
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

test('pack disclosures expose exact next-pack card and appearance rates for every faction', () => {
  const expectedFeatured = { '無機': 'monster-019', '創造': 'monster-020', '幻霊': 'monster-021', '魔族': 'monster-022', '獣族': 'monster-023', '怪物': 'monster-024' };
  for (const [faction, featuredId] of Object.entries(expectedFeatured)) {
    const first = boosterPackDisclosure({ masterIndex, faction, openedCount: 0 });
    const normal = boosterPackDisclosure({ masterIndex, faction, openedCount: 1 });
    const fifth = boosterPackDisclosure({ masterIndex, faction, openedCount: 4 });
    const tenth = boosterPackDisclosure({ masterIndex, faction, openedCount: 9 });
    const twentieth = boosterPackDisclosure({ masterIndex, faction, openedCount: 19 });
    for (const disclosure of [first, normal, fifth, tenth, twentieth]) {
      assert.ok(disclosure.cards.length > 0);
      assert.equal(disclosure.cards.some(({ definition }) => TROPHY_BREEDER_IDS.includes(definition.id)), false);
      assert.equal(disclosure.cards.every(({ probability }) => probability > 0 && probability <= 1), true);
      for (const slot of disclosure.slots) {
        const total = [...slot.distribution.values()].reduce((sum, probability) => sum + probability, 0);
        assert.ok(Math.abs(total - 1) < 1e-9, `${faction} ${slot.label} totals 100%`);
      }
    }
    assert.equal(first.cards.find(({ definition }) => definition.id === featuredId).probability, 1);
    assert.equal(fifth.cards.find(({ definition }) => definition.id === featuredId).probability, 1);
    assert.equal(normal.appearanceRates.showcase, 0.04);
    assert.ok(Math.abs(normal.appearanceRates.foil - 0.014) < 1e-12);
    assert.equal(tenth.appearanceRates.foil, 1);
    assert.equal(twentieth.appearanceRates.showcase, 1);
    assert.equal(twentieth.appearanceRates.foil, 1);
    assert.equal(normal.showcaseCards.length, 4);
    assert.equal(twentieth.showcaseCards.length, 4);
    assert.ok(normal.showcaseCards.every(({ probability }) => Math.abs(probability - 0.01) < 1e-12));
    assert.ok(twentieth.showcaseCards.every(({ probability }) => Math.abs(probability - 0.25) < 1e-12));
  }
});

test('each faction booster can award all four steal-proof showcase illustrations', () => {
  for (const [faction, variants] of Object.entries(SHOWCASE_VARIANTS)) {
    assert.equal(variants.length, 4);
    for (const variant of variants) {
      assert.equal(existsSync(new URL(`../../assets/images/showcase/${variant.artVariantId}.webp`, import.meta.url)), true);
    }
    const seen = new Set();
    for (let seed = 0; seed < 120 && seen.size < variants.length; seed += 1) {
      const pack = generateBoosterPack({ masterIndex, faction, openedCount: 19, seed: `showcase-all:${faction}:${seed}` });
      const special = pack.cards.find((card) => card.rarity === 'showcase');
      assert.ok(special);
      seen.add(special.artVariantId);
    }
    assert.deepEqual(seen, new Set(variants.map((variant) => variant.artVariantId)));
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

test('all six counter commands are available from boosters, normal CPUs and post-win capture', () => {
  const counterIds = Array.from({ length: 6 }, (_, index) => `breeder-${String(index + 41).padStart(3, '0')}`);
  assert.equal(counterIds.every((id) => isPackEligible(masterIndex.cards.get(id))), true);
  const disclosure = boosterPackDisclosure({ masterIndex, faction: '無機', openedCount: 1 });
  assert.equal(counterIds.every((id) => disclosure.cards.some(({ definition }) => definition.id === id)), true);

  const generated = generateCpuDeck({ masterIndex, rank: 'legend', theme: '混合', rng: new SeededRng('counter-command-cpu') });
  assert.equal(generated.cards.some((entry) => counterIds.includes(entry.masterId)), true);

  const defeated = legalDeck('counter-capture');
  defeated[0] = { ...defeated[0], masterId: 'breeder-041' };
  let offered = false;
  for (let seed = 0; seed < 100 && !offered; seed += 1) {
    const session = new CardStealSession({
      playerCards: legalDeck(`counter-player-${seed}`),
      defeatedCards: defeated,
      masterIndex,
      deckId: `counter-player-${seed}`,
      seed: `counter-offer:${seed}`,
    });
    offered = session.getState().offered.some((entry) => entry.masterId === 'breeder-041');
  }
  assert.equal(offered, true);
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
