import fs from 'node:fs';
import { chooseAiAction } from '../src/ai/levels.js';
import { BattleEngine } from '../src/battle/BattleEngine.js';
import { runAutomatedBattle } from '../src/battle/simulation.js';
import { SeededRng } from '../src/core/rng.js';
import { createMasterIndex } from '../src/data/master-loader.js';
import { generateCpuDeck } from '../src/tournament/deck-generator.js';

const FACTIONS = Object.freeze(['機鋼', '神造', '幻霊', '魔族', '獣族', '怪物']);

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function rate(value, total) {
  return total ? Number((value / total * 100).toFixed(1)) : 0;
}

const masterData = JSON.parse(fs.readFileSync(new URL('../src/data/master-data.json', import.meta.url), 'utf8'));
const masterIndex = createMasterIndex(masterData);
const gamesPerPair = Math.max(2, Number(option('games', '20')) || 20);
const rank = option('rank', 'legend');
const level = option('ai', 'gold');
const seed = option('seed', 'faction-ai-audit');
const useStrategy = option('strategy', 'true') !== 'false';
const deterministicSearch = process.argv.includes('--deterministic');
const timeBudgetMs = Math.max(1, Number(option('time-ms', '2')) || 2);
const deckVariants = Math.max(1, Number(option('deck-variants', '4')) || 4);
const decks = Object.fromEntries(FACTIONS.map((faction) => [faction, Array.from(
  { length: deckVariants },
  (_, variant) => generateCpuDeck({
    masterIndex,
    rank,
    theme: faction,
    rng: new SeededRng(`${seed}:deck:${faction}:${variant + 1}`),
    seedLabel: `audit-${faction}-${variant + 1}`,
  }).cards,
)]));
const factions = Object.fromEntries(FACTIONS.map((faction) => [faction, {
  games: 0,
  wins: 0,
  draws: 0,
  specialFusions: 0,
  breederUses: 0,
}]));
const matchups = [];
let firstPlayerWins = 0;
let secondPlayerWins = 0;
let draws = 0;
let totalRound = 0;

for (let left = 0; left < FACTIONS.length; left += 1) {
  for (let right = left + 1; right < FACTIONS.length; right += 1) {
    const factionA = FACTIONS[left];
    const factionB = FACTIONS[right];
    const row = { factionA, factionB, games: gamesPerPair, winsA: 0, winsB: 0, draws: 0 };
    for (let game = 0; game < gamesPerPair; game += 1) {
      const swap = game % 2 === 1;
      const seats = swap ? [factionB, factionA] : [factionA, factionB];
      const gameSeed = `${seed}:${factionA}:${factionB}:${game + 1}`;
      const battle = new BattleEngine({
        masterData,
        seed: gameSeed,
        players: seats.map((faction, seat) => ({
          id: seat === 0 ? 'a' : 'b',
          displayName: faction,
          deckId: `${gameSeed}:${faction}`,
          cards: decks[faction][(game + left + right) % deckVariants],
        })),
      });
      const rngs = {
        a: new SeededRng(`${gameSeed}:ai:a`),
        b: new SeededRng(`${gameSeed}:ai:b`),
      };
      const completed = runAutomatedBattle(battle, {
        seed: `${gameSeed}:driver`,
        maxActions: 3000,
        chooseAction: (engine, playerId) => chooseAiAction(level, engine, playerId, rngs[playerId], {
          deterministicSearch,
          timeBudgetMs,
          strategy: useStrategy ? undefined : false,
        }),
      });
      const winnerFaction = completed.result.winnerId
        ? seats[completed.result.winnerId === 'a' ? 0 : 1]
        : null;
      for (const faction of seats) factions[faction].games += 1;
      if (winnerFaction) {
        factions[winnerFaction].wins += 1;
        if (winnerFaction === factionA) row.winsA += 1;
        else row.winsB += 1;
        if (completed.result.winnerId === completed.state.firstPlayerId) firstPlayerWins += 1;
        else secondPlayerWins += 1;
      } else {
        row.draws += 1;
        draws += 1;
        factions[factionA].draws += 1;
        factions[factionB].draws += 1;
      }
      totalRound += completed.result.round;
      for (const player of Object.values(completed.state.players)) {
        const faction = seats[player.id === 'a' ? 0 : 1];
        factions[faction].specialFusions += player.metrics.specialFusions ?? 0;
        factions[faction].breederUses += player.metrics.breederUses ?? 0;
      }
    }
    matchups.push({
      ...row,
      winRateA: rate(row.winsA, row.games),
      winRateB: rate(row.winsB, row.games),
      drawRate: rate(row.draws, row.games),
    });
  }
}

const totalGames = matchups.reduce((sum, matchup) => sum + matchup.games, 0);
const factionSummary = Object.fromEntries(Object.entries(factions).map(([faction, row]) => [faction, {
  ...row,
  winRate: rate(row.wins, row.games),
  drawRate: rate(row.draws, row.games),
  specialFusionPerGame: Number((row.specialFusions / row.games).toFixed(3)),
  breederUsesPerGame: Number((row.breederUses / row.games).toFixed(2)),
}]));

console.log(JSON.stringify({
  mode: 'classification-round-robin',
  seed,
  rank,
  ai: level,
  strategy: useStrategy,
  deterministicSearch,
  timeBudgetMs,
  deckVariants,
  gamesPerPair,
  totalGames,
  firstPlayerWinRate: rate(firstPlayerWins, totalGames),
  secondPlayerWinRate: rate(secondPlayerWins, totalGames),
  drawRate: rate(draws, totalGames),
  averageRound: Number((totalRound / totalGames).toFixed(2)),
  factions: factionSummary,
  matchups,
}, null, process.argv.includes('--compact') ? 0 : 2));
