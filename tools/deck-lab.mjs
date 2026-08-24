import fs from 'node:fs';
import { runDeckGenerationLab } from '../src/tournament/lab.js';

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const masterData = JSON.parse(fs.readFileSync(new URL('../src/data/master-data.json', import.meta.url), 'utf8'));
const runsPerTheme = Number(option('runs', '5'));
const seed = option('seed', 'deck-lab');
const compact = process.argv.includes('--compact');

const result = runDeckGenerationLab({ masterData, seed, runsPerTheme });
const printable = process.argv.includes('--summary') ? {
  mode: result.mode,
  seed: result.seed,
  runsPerTheme: result.runsPerTheme,
  ranks: Object.fromEntries(Object.entries(result.ranks).map(([rank, row]) => [rank, {
    samples: row.samples,
    qualityScore: row.qualityScore,
    candidateCount: row.candidateCount,
    totalPlayTp: row.totalPlayTp,
    themePurity: row.themePurity,
    monsterCount: row.monsterCount,
    trainingCount: row.trainingCount,
    shugyoCount: row.shugyoCount,
    breederCount: row.breederCount,
    targetedRecipes: row.targetedRecipes,
    completedTargetedRecipes: row.completedTargetedRecipes,
    actualRecipes: row.actualRecipes,
    accidentalRecipes: row.accidentalRecipes,
    fusionPairDensity: row.fusionPairDensity,
  }])),
} : result;
console.log(JSON.stringify(printable, null, compact ? 0 : 2));
