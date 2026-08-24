import { totalPlayTp } from '../battle/deck.js';

export function cardCounts(cards) {
  const counts = new Map();
  for (const card of cards) counts.set(card.masterId, (counts.get(card.masterId) ?? 0) + 1);
  return counts;
}

export function analyzeFusionRoutes(cards, masterIndex, targetedFusionIds = []) {
  const counts = cardCounts(cards);
  const targetSet = new Set(targetedFusionIds);
  const routes = masterIndex.data.fusions.flatMap((fusion) => {
    const main = masterIndex.monstersByName.get(fusion.main);
    const material = masterIndex.monstersByName.get(fusion.material);
    const mainCopies = counts.get(main.id) ?? 0;
    const materialCopies = counts.get(material.id) ?? 0;
    if (!mainCopies || !materialCopies) return [];
    return [{
      fusionId: fusion.id,
      name: fusion.name,
      main: fusion.main,
      material: fusion.material,
      mainCopies,
      materialCopies,
      pairDensity: Math.min(mainCopies, materialCopies),
      targeted: targetSet.has(fusion.id),
    }];
  });
  return {
    targetedRecipeCount: targetSet.size,
    completedTargetedRecipeCount: routes.filter((route) => route.targeted).length,
    actualRecipeCount: routes.length,
    accidentalRecipeCount: routes.filter((route) => !route.targeted).length,
    totalPairDensity: routes.reduce((sum, route) => sum + route.pairDensity, 0),
    routes,
  };
}

export function analyzeDeck(cards, masterIndex, { theme = '混合', targetedFusionIds = [] } = {}) {
  const definitions = cards.map((card) => masterIndex.cards.get(card.masterId));
  const monsters = definitions.filter((card) => card.kind === 'monster');
  const breeders = definitions.filter((card) => card.kind === 'breeder');
  const training = definitions.filter((card) => card.kind === 'training');
  const shugyo = definitions.filter((card) => card.kind === 'shugyo');
  const factions = new Map();
  for (const monster of monsters) factions.set(monster.faction, (factions.get(monster.faction) ?? 0) + 1);
  const dominantCopies = Math.max(0, ...factions.values());
  const themeCopies = theme === '混合' ? dominantCopies : (factions.get(theme) ?? 0);
  const specificBreeders = theme === '混合' ? 0 : breeders.filter((card) => card.name.startsWith(theme)).length;
  const fusion = analyzeFusionRoutes(cards, masterIndex, targetedFusionIds);
  const averageMonsterEfficiency = monsters.length
    ? monsters.reduce((sum, monster) => sum + (monster.base.life + monster.base.atk + monster.base.def) / monster.summonTp, 0) / monsters.length
    : 0;
  return {
    size: cards.length,
    counts: {
      monster: monsters.length,
      breeder: breeders.length,
      training: training.length,
      shugyo: shugyo.length,
    },
    factionCopies: Object.fromEntries(factions),
    theme,
    themePurity: monsters.length ? themeCopies / monsters.length : 0,
    factionDiversity: factions.size,
    specificBreederCount: specificBreeders,
    averageMonsterEfficiency,
    totalPlayTp: totalPlayTp(cards, masterIndex),
    fusion,
  };
}

export function scoreGeneratedDeck(analysis, rank) {
  const rankWeights = {
    bronze: { purity: 18, route: 6, density: 3, efficiency: .5, synergy: 4, accidental: 0 },
    silver: { purity: 28, route: 9, density: 4, efficiency: .7, synergy: 6, accidental: .5 },
    gold: { purity: 38, route: 12, density: 5, efficiency: .9, synergy: 8, accidental: 1 },
    legend: { purity: 48, route: 15, density: 6, efficiency: 1.1, synergy: 10, accidental: 1.5 },
  }[rank];
  const growthBalance = Math.min(analysis.counts.training, analysis.counts.shugyo) * 1.3;
  const monsterBand = analysis.counts.monster >= 12 && analysis.counts.monster <= 16 ? 12 : -12;
  const diversityScore = analysis.theme === '混合'
    ? Math.min(6, analysis.factionDiversity) * rankWeights.purity * .13
    : analysis.themePurity * rankWeights.purity;
  return diversityScore
    + analysis.fusion.completedTargetedRecipeCount * rankWeights.route
    + analysis.fusion.totalPairDensity * rankWeights.density
    + analysis.fusion.accidentalRecipeCount * rankWeights.accidental
    + analysis.averageMonsterEfficiency * rankWeights.efficiency
    + analysis.specificBreederCount * rankWeights.synergy
    + growthBalance
    + monsterBand;
}
