import { SeededRng } from '../core/rng.js';
import { normalizeCardAppearance } from '../cards/card-appearance.js';
import { acquisitionOrigin, isPackEligible } from './acquisition.js';
import { boosterPack } from './pack-catalog.js';
import { baseCardRarity } from '../cards/card-rarity.js';

const FEATURED_VARIANTS = Object.freeze({
  '無機': Object.freeze({ masterId: 'monster-019', artVariantId: 'showcase-inorganic-01' }),
  '創造': Object.freeze({ masterId: 'monster-020', artVariantId: 'showcase-creation-01' }),
  '幻霊': Object.freeze({ masterId: 'monster-021', artVariantId: 'showcase-spirit-01' }),
  '魔族': Object.freeze({ masterId: 'monster-022', artVariantId: 'showcase-demon-01' }),
  '獣族': Object.freeze({ masterId: 'monster-023', artVariantId: 'showcase-beast-01' }),
  '怪物': Object.freeze({ masterId: 'monster-024', artVariantId: 'showcase-monster-01' }),
});

const LEGACY_SHOWCASE_IDS = Object.freeze({
  '無機': Object.freeze(['monster-001', 'monster-002', 'monster-003']),
  '創造': Object.freeze(['monster-004', 'monster-005', 'monster-006']),
  '幻霊': Object.freeze(['monster-007', 'monster-008', 'monster-009']),
  '魔族': Object.freeze(['monster-010', 'monster-011', 'monster-012']),
  '獣族': Object.freeze(['monster-013', 'monster-014', 'monster-015']),
  '怪物': Object.freeze(['monster-016', 'monster-017', 'monster-018']),
});

const SHOWCASE_VARIANTS = Object.freeze(Object.fromEntries(
  Object.entries(FEATURED_VARIANTS).map(([faction, featured]) => [faction, Object.freeze([
    featured,
    ...LEGACY_SHOWCASE_IDS[faction].map((masterId) => Object.freeze({
      masterId,
      artVariantId: `showcase-${masterId}`,
    })),
  ])]),
));

export const BOOSTER_DRAW_RATES = Object.freeze({
  showcase: 0.04,
  showcaseFoil: 0.35,
  firstMonsterBoosterWeight: 2,
  themedMonsterWeight: 1.4,
  themedBreederWeight: 1.3,
  genericTrainingWeight: 1.2,
  rareMonsterWeight: 2.2,
});

function uniqueDefinitions(masterIndex) {
  return [...masterIndex.cards.values()].filter(isPackEligible);
}

function factionFor(definition) {
  if (definition.kind === 'monster') return definition.faction;
  if (definition.kind === 'breeder' && definition.category === 'モン類専用') {
    return definition.name.split('・')[0];
  }
  return null;
}

export function boosterPools(masterIndex, faction) {
  const eligible = uniqueDefinitions(masterIndex);
  return {
    eligible,
    themed: eligible.filter((definition) => factionFor(definition) === faction),
    monsters: eligible.filter((definition) => definition.kind === 'monster' && definition.faction === faction),
    generic: eligible.filter((definition) => !factionFor(definition)),
    featured: FEATURED_VARIANTS[faction],
    showcases: SHOWCASE_VARIANTS[faction] ?? [],
  };
}

function weightedDistribution(definitions, weightFor = () => 1) {
  const weights = definitions.map((definition) => Math.max(0, Number(weightFor(definition)) || 0));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const distribution = new Map();
  if (total <= 0) return distribution;
  definitions.forEach((definition, index) => {
    distribution.set(definition.id, (distribution.get(definition.id) ?? 0) + weights[index] / total);
  });
  return distribution;
}

function certainDistribution(definition) {
  return definition ? new Map([[definition.id, 1]]) : new Map();
}

function mixedDistribution(parts) {
  const mixed = new Map();
  for (const { distribution, weight } of parts) {
    for (const [masterId, probability] of distribution) {
      mixed.set(masterId, (mixed.get(masterId) ?? 0) + probability * weight);
    }
  }
  return mixed;
}

export function boosterPackDisclosure({ masterIndex, faction, openedCount = 0 }) {
  const { eligible, themed, monsters, generic, featured, showcases } = boosterPools(masterIndex, faction);
  const nextPackNumber = Math.max(0, Math.trunc(Number(openedCount) || 0)) + 1;
  const featuredDefinition = featured ? masterIndex.cards.get(featured.masterId) : null;
  const availableShowcases = showcases.filter((variant) => masterIndex.cards.has(variant.masterId));
  const showcaseDefinitions = availableShowcases.map((variant) => masterIndex.cards.get(variant.masterId));
  const newMonsterGuaranteed = openedCount === 0 || nextPackNumber % 5 === 0;
  const foilGuaranteed = nextPackNumber % 10 === 0;
  const showcaseGuaranteed = nextPackNumber % 20 === 0;
  const hasFeatured = Boolean(featuredDefinition);
  const hasShowcases = availableShowcases.length > 0;

  const firstMonster = newMonsterGuaranteed && hasFeatured
    ? certainDistribution(featuredDefinition)
    : weightedDistribution(monsters, (definition) => acquisitionOrigin(definition) === 'booster'
      ? BOOSTER_DRAW_RATES.firstMonsterBoosterWeight : 1);
  const themedMonster = weightedDistribution(themed, (definition) => definition.kind === 'monster'
    ? BOOSTER_DRAW_RATES.themedMonsterWeight : 1);
  const themedBreeder = weightedDistribution(themed, (definition) => definition.kind === 'breeder'
    ? BOOSTER_DRAW_RATES.themedBreederWeight : 1);
  const common = weightedDistribution(generic, (definition) => definition.kind === 'training'
    ? BOOSTER_DRAW_RATES.genericTrainingWeight : 1);
  const rarePool = monsters.filter((definition) => baseCardRarity(definition) === 'rare');
  const rare = weightedDistribution(rarePool, (definition) => definition.kind === 'monster'
    ? BOOSTER_DRAW_RATES.rareMonsterWeight : 1);
  const showcaseChance = hasShowcases ? (showcaseGuaranteed ? 1 : BOOSTER_DRAW_RATES.showcase) : 0;
  const showcaseDistribution = weightedDistribution(showcaseDefinitions);
  const premium = showcaseGuaranteed && hasShowcases
    ? showcaseDistribution
    : mixedDistribution([
      { distribution: showcaseDistribution, weight: showcaseChance },
      { distribution: rare, weight: 1 - showcaseChance },
    ]);
  const slots = [
    { label: 'モンスター枠', distribution: firstMonster },
    { label: 'モン類枠A', distribution: themedMonster },
    { label: 'モン類枠B', distribution: themedBreeder },
    { label: '共通枠', distribution: common },
    { label: 'Rare以上枠', distribution: premium },
  ];
  const cards = eligible.map((definition) => {
    const slotProbabilities = slots.map(({ distribution }) => distribution.get(definition.id) ?? 0);
    const probability = 1 - slotProbabilities.reduce((remaining, chance) => remaining * (1 - chance), 1);
    return {
      definition,
      probability,
      slots: slots.filter(({ distribution }) => (distribution.get(definition.id) ?? 0) > 0).map(({ label }) => label),
    };
  }).filter((entry) => entry.probability > 0)
    .sort((a, b) => b.probability - a.probability || a.definition.name.localeCompare(b.definition.name, 'ja'));
  const showcaseProbability = availableShowcases.length ? showcaseChance / availableShowcases.length : 0;
  const showcaseCards = availableShowcases.map((variant) => ({
    variant,
    definition: masterIndex.cards.get(variant.masterId),
    probability: showcaseProbability,
  }));

  return {
    faction,
    nextPackNumber,
    cards,
    showcaseCards,
    slots,
    guarantees: { newMonsterGuaranteed, foilGuaranteed, showcaseGuaranteed },
    appearanceRates: {
      rareOrBetter: 1,
      showcase: showcaseChance,
      foil: foilGuaranteed ? 1 : showcaseChance * BOOSTER_DRAW_RATES.showcaseFoil,
    },
  };
}

function asset(definition, { artVariantId = 'base', finish = 'normal' } = {}) {
  return normalizeCardAppearance({
    masterId: definition.id,
    artVariantId,
    finish,
    rarity: artVariantId !== 'base' ? 'showcase' : baseCardRarity(definition),
    origin: acquisitionOrigin(definition) === 'booster' ? 'booster' : 'core',
  });
}

function chooseDefinition(rng, definitions, weightFor = () => 1) {
  const choice = rng.weightedChoice(definitions, weightFor);
  if (!choice) throw new Error('パック候補カードがありません');
  return choice;
}

export function generateBoosterPack({ masterIndex, faction, seed, openedCount = 0 }) {
  const pack = boosterPack(faction);
  if (!pack) throw new Error(`Unknown booster faction: ${faction}`);
  const rng = new SeededRng(seed);
  const { eligible, themed, monsters, generic, showcases } = boosterPools(masterIndex, faction);
  if (!monsters.length || !themed.length || !generic.length) throw new Error('パック候補マスターが不足しています');

  const cards = [];
  const featured = FEATURED_VARIANTS[faction];
  const newMonsterGuaranteed = openedCount === 0 || (openedCount + 1) % 5 === 0;
  const firstMonster = newMonsterGuaranteed && featured && masterIndex.cards.has(featured.masterId)
    ? masterIndex.cards.get(featured.masterId)
    : chooseDefinition(rng, monsters, (definition) => acquisitionOrigin(definition) === 'booster' ? BOOSTER_DRAW_RATES.firstMonsterBoosterWeight : 1);
  cards.push(asset(firstMonster));
  cards.push(asset(chooseDefinition(rng, themed, (definition) => definition.kind === 'monster' ? BOOSTER_DRAW_RATES.themedMonsterWeight : 1)));
  cards.push(asset(chooseDefinition(rng, themed, (definition) => definition.kind === 'breeder' ? BOOSTER_DRAW_RATES.themedBreederWeight : 1)));
  cards.push(asset(chooseDefinition(rng, generic, (definition) => definition.kind === 'training' ? BOOSTER_DRAW_RATES.genericTrainingWeight : 1)));

  const showcaseGuaranteed = (openedCount + 1) % 20 === 0;
  const foilGuaranteed = (openedCount + 1) % 10 === 0;
  const showcase = showcaseGuaranteed || rng.next() < BOOSTER_DRAW_RATES.showcase;
  const availableShowcases = showcases.filter((variant) => masterIndex.cards.has(variant.masterId));
  if (showcase && availableShowcases.length) {
    const showcaseVariant = rng.choice(availableShowcases);
    cards.push(asset(masterIndex.cards.get(showcaseVariant.masterId), {
      artVariantId: showcaseVariant.artVariantId,
      finish: foilGuaranteed || rng.next() < BOOSTER_DRAW_RATES.showcaseFoil ? 'foil' : 'normal',
    }));
  } else {
    const rarePool = monsters.filter((definition) => baseCardRarity(definition) === 'rare');
    cards.push(asset(chooseDefinition(rng, rarePool, (definition) => definition.kind === 'monster' ? BOOSTER_DRAW_RATES.rareMonsterWeight : 1), {
      finish: foilGuaranteed ? 'foil' : 'normal',
    }));
  }
  return {
    schemaVersion: 1,
    packId: pack.id,
    faction,
    seed: String(seed),
    cards: rng.shuffle(cards),
  };
}

export { FEATURED_VARIANTS, SHOWCASE_VARIANTS };
