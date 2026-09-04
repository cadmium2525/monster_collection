import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { CardStealSession } from '../../src/reward/CardStealSession.js';
import { GUARANTEED_MONSTER_IDS, SHOWCASE_VARIANTS, boosterPackDisclosure, generateBoosterPack } from '../../src/gacha/pack-generator.js';
import { BOOSTER_MONSTER_IDS, TROPHY_BREEDER_IDS, acquisitionOrigin, isNormalCpuEligible, isPackEligible } from '../../src/gacha/acquisition.js';
import { applyDiamondReward, applyPackPurchase, defaultEconomyState, normalizeEconomyState } from '../../src/gacha/economy-state.js';
import { SeededRng } from '../../src/core/rng.js';
import { generateCpuDeck } from '../../src/tournament/deck-generator.js';
import { legalDeck, masterIndex } from '../helpers.js';
import { baseCardRarity } from '../../src/cards/card-rarity.js';

test('all eighteen faction trophy breeders are capture-only and never enter boosters', () => {
  assert.deepEqual(TROPHY_BREEDER_IDS, [
    ...Array.from({ length: 12 }, (_, index) => `breeder-${String(index + 29).padStart(3, '0')}`),
    ...Array.from({ length: 6 }, (_, index) => `breeder-${String(index + 47).padStart(3, '0')}`),
  ]);
  for (const id of TROPHY_BREEDER_IDS) assert.equal(acquisitionOrigin(masterIndex.cards.get(id)), 'trophy');
  for (const faction of ['機鋼', '神造', '幻霊', '魔族', '獣族', '怪物']) {
    for (let seed = 0; seed < 30; seed += 1) {
      const result = generateBoosterPack({ masterIndex, faction, seed: `${faction}:${seed}`, openedCount: seed });
      assert.equal(result.cards.length, 5);
      assert.equal(result.cards.some((card) => TROPHY_BREEDER_IDS.includes(card.masterId)), false);
    }
  }
});

test('tutorial booster guarantees one of its two Chronogear-or-later monsters and every pack has Rare or better', () => {
  for (const [faction, guaranteedIds] of Object.entries(GUARANTEED_MONSTER_IDS)) {
    const seen = new Set();
    for (let seed = 0; seed < 40; seed += 1) {
      const result = generateBoosterPack({ masterIndex, faction, seed: `tutorial:${faction}:${seed}`, openedCount: 0 });
      const guaranteed = result.cards.find((card) => guaranteedIds.includes(card.masterId));
      assert.ok(guaranteed);
      seen.add(guaranteed.masterId);
      assert.ok(result.cards.some((card) => ['rare', 'showcase'].includes(card.rarity)));
    }
    assert.deepEqual(seen, new Set(guaranteedIds));
  }
});

test('base card rarity is stable per card instead of depending on the pack slot', () => {
  for (const definition of masterIndex.cards.values()) {
    assert.equal(baseCardRarity(definition), definition.kind === 'monster' ? 'rare' : 'common');
  }
  const observed = new Map();
  for (const faction of ['機鋼', '神造', '幻霊', '魔族', '獣族', '怪物']) {
    for (let seed = 0; seed < 180; seed += 1) {
      const pack = generateBoosterPack({ masterIndex, faction, seed: `canonical-rarity:${faction}:${seed}`, openedCount: seed % 20 });
      for (const card of pack.cards.filter((entry) => entry.artVariantId === 'base')) {
        if (!observed.has(card.masterId)) observed.set(card.masterId, new Set());
        observed.get(card.masterId).add(card.rarity);
      }
    }
  }
  assert.equal([...observed.values()].every((rarities) => rarities.size === 1), true);
  for (const [masterId, rarities] of observed) {
    assert.deepEqual([...rarities], [baseCardRarity(masterIndex.cards.get(masterId))]);
  }
});

test('five, ten and twenty-pack guarantees are deterministic per faction', () => {
  for (const faction of ['機鋼', '神造', '幻霊', '魔族', '獣族', '怪物']) {
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
  for (const [faction, guaranteedIds] of Object.entries(GUARANTEED_MONSTER_IDS)) {
    const first = boosterPackDisclosure({ masterIndex, faction, openedCount: 0 });
    const normal = boosterPackDisclosure({ masterIndex, faction, openedCount: 1 });
    const fifth = boosterPackDisclosure({ masterIndex, faction, openedCount: 4 });
    const tenth = boosterPackDisclosure({ masterIndex, faction, openedCount: 9 });
    const twentieth = boosterPackDisclosure({ masterIndex, faction, openedCount: 19 });
    for (const disclosure of [first, normal, fifth, tenth, twentieth]) {
      assert.ok(disclosure.cards.length > 0);
      assert.equal(disclosure.cards.some(({ definition }) => TROPHY_BREEDER_IDS.includes(definition.id)), false);
      assert.equal(disclosure.cards.every(({ probability }) => probability > 0 && probability <= 1), true);
      assert.ok(Math.abs(disclosure.cards.reduce((sum, { probability }) => sum + probability, 0) - 1) < 1e-9, `${faction} regular disclosure totals 100%`);
      assert.equal(disclosure.regularSlotCount, 3);
      assert.equal(disclosure.cards.every(({ packProbability }) => packProbability > 0 && packProbability <= 1), true);
      for (const slot of disclosure.slots) {
        const total = [...slot.distribution.values()].reduce((sum, probability) => sum + probability, 0);
        assert.ok(Math.abs(total - 1) < 1e-9, `${faction} ${slot.label} totals 100%`);
      }
    }
    for (const disclosure of [first, fifth]) {
      assert.equal(disclosure.guarantees.boosterMonsterGuaranteed, true);
      const monsterSlot = disclosure.slots.find(({ label }) => label === 'モンスター枠');
      assert.deepEqual([...monsterSlot.distribution.keys()], guaranteedIds);
      assert.ok([...monsterSlot.distribution.values()].every((probability) => probability === 0.5));
    }
    assert.equal(normal.appearanceRates.showcase, 0.04);
    assert.equal(normal.appearanceRates.foil, 0.04);
    assert.equal(tenth.appearanceRates.foil, 1);
    assert.equal(twentieth.appearanceRates.showcase, 1);
    assert.equal(twentieth.appearanceRates.foil, 1);
    assert.equal(normal.showcaseCards.length, 5);
    assert.equal(twentieth.showcaseCards.length, 5);
    assert.ok(normal.showcaseCards.every(({ probability, packProbability }) => Math.abs(probability - 0.2) < 1e-12 && Math.abs(packProbability - 0.008) < 1e-12));
    assert.ok(twentieth.showcaseCards.every(({ probability }) => Math.abs(probability - 0.2) < 1e-12));
  }
});

test('each faction booster can award all five steal-proof showcase illustrations', () => {
  for (const [faction, variants] of Object.entries(SHOWCASE_VARIANTS)) {
    assert.equal(variants.length, 5);
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
    operationId: 'legacy-pack', faction: '機鋼', packId: 'pack-inorganic',
    cards: [{ masterId: 'training-life', artVariantId: 'legacy-special', finish: 'foil', rarity: 'showcase', origin: 'core' }],
  };
  const migrated = normalizeEconomyState(legacy);
  assert.deepEqual(migrated.unassignedAssets[0], {
    masterId: 'breeder-001', artVariantId: 'base', finish: 'normal', rarity: 'common', origin: 'core', quantity: 2, firstObtainedAt: null,
  });
  assert.equal(migrated.pendingPack.cards[0].artVariantId, 'base');
  assert.equal(migrated.pendingPack.cards[0].finish, 'normal');
  assert.equal(migrated.pendingPack.cards[0].rarity, 'common');
});

test('legacy faction names keep pack counters and pending pack state after renaming', () => {
  const legacy = defaultEconomyState();
  legacy.packCounters = { '無機': 7, '創造': 4, '幻霊': 3, '魔族': 2, '獣族': 1, '怪物': 0 };
  legacy.pendingPack = { operationId: 'legacy-faction-pack', faction: '無機', packId: 'pack-inorganic', cards: [] };
  const migrated = normalizeEconomyState(legacy);
  assert.equal(migrated.packCounters['機鋼'], 7);
  assert.equal(migrated.packCounters['神造'], 4);
  assert.equal(migrated.pendingPack.faction, '機鋼');
});

test('every generated Foil and special illustration belongs to a monster and every special illustration is Foil', () => {
  for (const faction of ['機鋼', '神造', '幻霊', '魔族', '獣族', '怪物']) {
    for (let openedCount = 0; openedCount < 40; openedCount += 1) {
      const pack = generateBoosterPack({ masterIndex, faction, openedCount, seed: `premium-rule:${faction}:${openedCount}` });
      const premium = pack.cards.filter((card) => card.finish === 'foil' || card.artVariantId !== 'base');
      assert.ok(premium.every((card) => masterIndex.cards.get(card.masterId)?.kind === 'monster'));
      assert.ok(pack.cards.filter((card) => card.artVariantId !== 'base').every((card) => card.finish === 'foil'));
    }
  }
});

test('legacy monster showcase assets are migrated to Foil in inventory and pending packs', () => {
  const legacy = defaultEconomyState();
  legacy.unassignedAssets = [{
    masterId: 'monster-019', artVariantId: 'showcase-inorganic-01', finish: 'normal', rarity: 'showcase', origin: 'booster', quantity: 2,
  }];
  legacy.pendingPack = {
    operationId: 'legacy-showcase-pack', faction: '機鋼', packId: 'pack-inorganic',
    cards: [{ masterId: 'monster-019', artVariantId: 'showcase-inorganic-01', finish: 'normal', rarity: 'showcase', origin: 'booster' }],
  };
  const migrated = normalizeEconomyState(legacy);
  assert.equal(migrated.unassignedAssets[0].finish, 'foil');
  assert.equal(migrated.pendingPack.cards[0].finish, 'foil');
});

test('normal CPU decks keep trophy breeders obtainable but never generate booster-only monsters', () => {
  let trophySeen = false;
  for (const rank of ['bronze', 'silver', 'gold', 'legend']) {
    for (const faction of ['機鋼', '神造', '幻霊', '魔族', '獣族', '怪物']) {
      const generated = generateCpuDeck({ masterIndex, rank, theme: faction, rng: new SeededRng(`cpu:${rank}:${faction}`) });
      assert.equal(generated.cards.some((card) => BOOSTER_MONSTER_IDS.includes(card.masterId)), false);
      trophySeen ||= generated.cards.some((card) => TROPHY_BREEDER_IDS.includes(card.masterId));
    }
  }
  assert.equal(trophySeen, true);
});

test('the six stronger trophy breeders are used by matching CPUs and can be captured after a win', () => {
  const newest = Array.from({ length: 6 }, (_, index) => `breeder-${String(index + 47).padStart(3, '0')}`);
  const factions = ['機鋼', '神造', '幻霊', '魔族', '獣族', '怪物'];
  for (const [index, breederId] of newest.entries()) {
    let cpuSeen = false;
    for (let seed = 0; seed < 160 && !cpuSeen; seed += 1) {
      const generated = generateCpuDeck({
        masterIndex,
        rank: 'legend',
        theme: factions[index],
        rng: new SeededRng(`new-trophy-cpu:${breederId}:${seed}`),
      });
      cpuSeen = generated.cards.some((card) => card.masterId === breederId);
    }
    assert.equal(cpuSeen, true, `${breederId} should enter its faction CPU deck pool`);

    const defeated = legalDeck(`new-trophy-defeated-${breederId}`);
    defeated[0] = { ...defeated[0], masterId: breederId };
    let offered = false;
    for (let seed = 0; seed < 100 && !offered; seed += 1) {
      const session = new CardStealSession({
        playerCards: legalDeck(`new-trophy-player-${breederId}-${seed}`),
        defeatedCards: defeated,
        masterIndex,
        deckId: `new-trophy-player-${breederId}-${seed}`,
        seed: `new-trophy-offer:${breederId}:${seed}`,
      });
      offered = session.getState().offered.some((card) => card.masterId === breederId);
    }
    assert.equal(offered, true, `${breederId} should be offered by capture`);
  }
});

test('all nine counter commands are available from boosters, normal CPUs and post-win capture', () => {
  const counterIds = [
    ...Array.from({ length: 6 }, (_, index) => `breeder-${String(index + 41).padStart(3, '0')}`),
    'breeder-053', 'breeder-054', 'breeder-055',
  ];
  assert.equal(counterIds.every((id) => isPackEligible(masterIndex.cards.get(id))), true);
  assert.equal(counterIds.every((id) => isNormalCpuEligible(masterIndex.cards.get(id))), true);
  const disclosure = boosterPackDisclosure({ masterIndex, faction: '機鋼', openedCount: 1 });
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
  const pack = generateBoosterPack({ masterIndex, faction: '機鋼', seed: 'atomic-pack', openedCount: 0 });
  const purchase = { operationId: 'pack-op-1', faction: '機鋼', packId: pack.packId, cards: pack.cards, cost: 300, useFreeCredit: false };
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
