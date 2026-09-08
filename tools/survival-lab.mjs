import fs from 'node:fs';
import { runSurvivalPlaytest } from '../src/survival/playtest-lab.js';

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const masterData = JSON.parse(fs.readFileSync(new URL('../src/data/master-data.json', import.meta.url), 'utf8'));
const result = runSurvivalPlaytest({
  masterData,
  seed: option('seed', 'survival-lab'),
  maxBattles: Number(option('battles', '8')),
  playerAi: option('player-ai', 'legend'),
  timeBudgetMs: Number(option('time-ms', 'Infinity')),
});

console.log(JSON.stringify(result, null, process.argv.includes('--compact') ? 0 : 2));
