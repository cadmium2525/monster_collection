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

if (!Number.isInteger(games) || games <= 0) throw new Error('--games must be a positive integer');

const result = runAiMatchup({
  masterData,
  levelA,
  levelB,
  games,
  seed,
  aiOptions: { timeBudgetMs },
});

console.log(JSON.stringify(result, null, 2));
