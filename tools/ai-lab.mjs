import fs from 'node:fs';
import { runAiMatchup } from '../src/ai/lab.js';

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const masterData = JSON.parse(fs.readFileSync(new URL('../src/data/master-data.json', import.meta.url), 'utf8'));
const levelA = option('a', 'bronze');
const levelB = option('b', 'silver');
const games = Number(option('games', '20'));
const seed = option('seed', 'ai-lab');
const timeBudgetMs = Number(option('time-ms', '20'));
const timeBudgetA = Number(option('time-a', String(timeBudgetMs)));
const timeBudgetB = Number(option('time-b', String(timeBudgetMs)));

if (!Number.isInteger(games) || games <= 0) throw new Error('--games must be a positive integer');

const result = runAiMatchup({
  masterData,
  levelA,
  levelB,
  games,
  seed,
  aiOptions: { timeBudgetMs },
  aiOptionsBySide: {
    a: { timeBudgetMs: timeBudgetA },
    b: { timeBudgetMs: timeBudgetB },
  },
});

const printable = process.argv.includes('--summary') ? {
  mode: result.mode,
  seed: result.seed,
  matchup: `${result.levelA}-vs-${result.levelB}`,
  games: result.games,
  timeBudgetMs: { a: timeBudgetA, b: timeBudgetB },
  wins: result.wins,
  winRates: result.winRates,
  firstPlayerWinRate: result.firstPlayerWinRate,
  secondPlayerWinRate: result.secondPlayerWinRate,
  averageRound: result.averageRound,
  averageActions: result.averageActions,
  turnLimitRate: result.turnLimitRate,
  fusionGameRate: result.fusionGameRate,
  specialFusionGameRate: result.specialFusionGameRate,
  sideA: {
    level: result.sides.a.level,
    normalFusions: result.sides.a.normalFusions,
    specialFusions: result.sides.a.metrics.specialFusions,
    averageMetrics: result.sides.a.averageMetrics,
  },
  sideB: {
    level: result.sides.b.level,
    normalFusions: result.sides.b.normalFusions,
    specialFusions: result.sides.b.metrics.specialFusions,
    averageMetrics: result.sides.b.averageMetrics,
  },
  traitTriggers: result.traitTriggers,
} : result;

console.log(JSON.stringify(printable, null, process.argv.includes('--compact') ? 0 : 2));
