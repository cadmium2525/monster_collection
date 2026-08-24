import { SeededRng } from '../core/rng.js';
import { createMasterIndex } from '../data/master-loader.js';
import { DECK_THEMES, generateCpuDeck } from './deck-generator.js';

export const LAB_RANKS = Object.freeze(['bronze', 'silver', 'gold', 'legend']);

function emptyAggregate() {
  return {
    samples: 0,
    qualityScore: 0,
    candidateCount: 0,
    totalPlayTp: 0,
    themePurity: 0,
    monsterCount: 0,
    trainingCount: 0,
    shugyoCount: 0,
    breederCount: 0,
    targetedRecipes: 0,
    completedTargetedRecipes: 0,
    actualRecipes: 0,
    accidentalRecipes: 0,
    fusionPairDensity: 0,
  };
}

function addSample(aggregate, deck) {
  const { analysis } = deck;
  aggregate.samples += 1;
  aggregate.qualityScore += deck.qualityScore;
  aggregate.candidateCount += deck.candidateCount;
  aggregate.totalPlayTp += analysis.totalPlayTp;
  aggregate.themePurity += analysis.themePurity;
  aggregate.monsterCount += analysis.counts.monster;
  aggregate.trainingCount += analysis.counts.training;
  aggregate.shugyoCount += analysis.counts.shugyo;
  aggregate.breederCount += analysis.counts.breeder;
  aggregate.targetedRecipes += analysis.fusion.targetedRecipeCount;
  aggregate.completedTargetedRecipes += analysis.fusion.completedTargetedRecipeCount;
  aggregate.actualRecipes += analysis.fusion.actualRecipeCount;
  aggregate.accidentalRecipes += analysis.fusion.accidentalRecipeCount;
  aggregate.fusionPairDensity += analysis.fusion.totalPairDensity;
}

function average(aggregate) {
  const samples = aggregate.samples || 1;
  return Object.fromEntries(Object.entries(aggregate).map(([key, value]) => [
    key,
    key === 'samples' ? value : value / samples,
  ]));
}

export function runDeckGenerationLab({
  masterData,
  seed = 'deck-lab',
  runsPerTheme = 5,
  ranks = LAB_RANKS,
  themes = DECK_THEMES,
} = {}) {
  if (!masterData) throw new Error('masterData is required');
  if (!Number.isInteger(runsPerTheme) || runsPerTheme <= 0) throw new Error('runsPerTheme must be a positive integer');
  const masterIndex = createMasterIndex(masterData);
  const summary = {
    mode: 'ranked-deck-generation-statistics',
    seed: String(seed),
    runsPerTheme,
    ranks: {},
    samples: [],
  };

  for (const rank of ranks) {
    const rankAggregate = emptyAggregate();
    const themeAggregates = Object.fromEntries(themes.map((theme) => [theme, emptyAggregate()]));
    for (const theme of themes) {
      for (let run = 0; run < runsPerTheme; run += 1) {
        const sampleSeed = `${seed}:${rank}:${theme}:${run + 1}`;
        const deck = generateCpuDeck({
          masterIndex,
          rank,
          theme,
          rng: new SeededRng(sampleSeed),
          seedLabel: sampleSeed,
        });
        addSample(rankAggregate, deck);
        addSample(themeAggregates[theme], deck);
        summary.samples.push({
          seed: sampleSeed,
          rank,
          theme,
          qualityScore: deck.qualityScore,
          candidateCount: deck.candidateCount,
          totalPlayTp: deck.analysis.totalPlayTp,
          themePurity: deck.analysis.themePurity,
          targetedRecipeCount: deck.analysis.fusion.targetedRecipeCount,
          completedTargetedRecipeCount: deck.analysis.fusion.completedTargetedRecipeCount,
          actualRecipeCount: deck.analysis.fusion.actualRecipeCount,
          accidentalRecipeCount: deck.analysis.fusion.accidentalRecipeCount,
          fusionPairDensity: deck.analysis.fusion.totalPairDensity,
        });
      }
    }
    summary.ranks[rank] = {
      ...average(rankAggregate),
      byTheme: Object.fromEntries(Object.entries(themeAggregates).map(([theme, aggregate]) => [theme, average(aggregate)])),
    };
  }
  return summary;
}
