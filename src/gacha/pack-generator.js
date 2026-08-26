import { SeededRng } from '../core/rng.js';
import { acquisitionOrigin, isPackEligible } from './acquisition.js';
import { boosterPack } from './pack-catalog.js';

const FEATURED_VARIANTS = Object.freeze({
  '無機': Object.freeze({ masterId: 'monster-019', artVariantId: 'showcase-inorganic-01' }),
  '創造': Object.freeze({ masterId: 'monster-020', artVariantId: 'showcase-creation-01' }),
  '幻霊': Object.freeze({ masterId: 'monster-021', artVariantId: 'showcase-spirit-01' }),
  '魔族': Object.freeze({ masterId: 'monster-022', artVariantId: 'showcase-demon-01' }),
  '獣族': Object.freeze({ masterId: 'monster-023', artVariantId: 'showcase-beast-01' }),
  '怪物': Object.freeze({ masterId: 'monster-024', artVariantId: 'showcase-monster-01' }),
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

function asset(definition, { rarity = 'common', artVariantId = 'base', finish = 'normal' } = {}) {
  return {
    masterId: definition.id,
    artVariantId,
    finish,
    rarity,
    origin: acquisitionOrigin(definition) === 'booster' ? 'booster' : 'core',
  };
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
  const eligible = uniqueDefinitions(masterIndex);
  const themed = eligible.filter((definition) => factionFor(definition) === faction);
  const monsters = eligible.filter((definition) => definition.kind === 'monster' && definition.faction === faction);
  const generic = eligible.filter((definition) => !factionFor(definition));
  if (!monsters.length || !themed.length || !generic.length) throw new Error('パック候補マスターが不足しています');

  const cards = [];
  const featured = FEATURED_VARIANTS[faction];
  const newMonsterGuaranteed = openedCount === 0 || (openedCount + 1) % 5 === 0;
  const firstMonster = newMonsterGuaranteed && featured && masterIndex.cards.has(featured.masterId)
    ? masterIndex.cards.get(featured.masterId)
    : chooseDefinition(rng, monsters, (definition) => acquisitionOrigin(definition) === 'booster' ? 2 : 1);
  cards.push(asset(firstMonster, { rarity: acquisitionOrigin(firstMonster) === 'booster' ? 'rare' : 'common' }));
  cards.push(asset(chooseDefinition(rng, themed, (definition) => definition.kind === 'monster' ? 1.4 : 1)));
  cards.push(asset(chooseDefinition(rng, themed, (definition) => definition.kind === 'breeder' ? 1.3 : 1)));
  cards.push(asset(chooseDefinition(rng, generic, (definition) => definition.kind === 'training' ? 1.2 : 1)));

  const showcaseGuaranteed = (openedCount + 1) % 20 === 0;
  const foilGuaranteed = (openedCount + 1) % 10 === 0;
  const showcase = showcaseGuaranteed || rng.next() < 0.04;
  if (showcase && featured && masterIndex.cards.has(featured.masterId)) {
    cards.push(asset(masterIndex.cards.get(featured.masterId), {
      rarity: 'showcase',
      artVariantId: featured.artVariantId,
      finish: foilGuaranteed || rng.next() < 0.35 ? 'foil' : 'normal',
    }));
  } else {
    const rarePool = [...monsters, ...themed, ...generic];
    cards.push(asset(chooseDefinition(rng, rarePool, (definition) => definition.kind === 'monster' ? 2.2 : 1), {
      rarity: foilGuaranteed ? 'showcase' : 'rare',
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

export { FEATURED_VARIANTS };
