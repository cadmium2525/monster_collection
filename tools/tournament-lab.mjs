import fs from 'node:fs';
import { runTournamentPlaytest } from '../src/game/playtest-lab.js';

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const masterData = JSON.parse(fs.readFileSync(new URL('../src/data/master-data.json', import.meta.url), 'utf8'));
const result = runTournamentPlaytest({
  masterData,
  rank: option('rank', 'bronze'),
  runs: Number(option('runs', '3')),
  playerAi: option('player-ai', 'gold'),
  playerDeckRank: option('player-deck-rank', null),
  seed: option('seed', 'tournament-lab'),
  timeBudgetMs: Number(option('time-ms', '12')),
});

const printable = process.argv.includes('--summary') ? {
  mode: result.mode,
  seed: result.seed,
  rank: result.rank,
  playerAi: result.playerAi,
  playerDeckRank: result.playerDeckRank,
  runs: result.runs,
  cupsWon: result.cupsWon,
  eliminated: result.eliminated,
  matches: result.matches,
  playerWins: result.playerWins,
  draws: result.draws,
  cupWinRate: result.cupWinRate,
  matchWinRate: result.matchWinRate,
  averageBattleRound: result.averageBattleRound,
  averageActions: result.averageActions,
  turnLimitRate: result.turnLimitRate,
  fusionMatchRate: result.fusionMatchRate,
  specialFusionMatchRate: result.specialFusionMatchRate,
  rewardScreens: result.rewardScreens,
  exchangedCards: result.exchangedCards,
  rewardValueGain: result.rewardValueGain,
  seeds: result.seeds.map((run) => ({
    seed: run.seed,
    status: run.status,
    matches: run.matches.map(({ seed, round, opponentAi, winner, battleRound, actions, reason, exchangedCards }) => ({
      seed, round, opponentAi, winner, battleRound, actions, reason, exchangedCards,
    })),
  })),
} : result;

console.log(JSON.stringify(printable, null, process.argv.includes('--compact') ? 0 : 2));
