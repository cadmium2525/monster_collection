import { BattleEngine } from '../battle/BattleEngine.js';
import { runAutomatedBattle } from '../battle/simulation.js';
import { SeededRng } from '../core/rng.js';
import { createBaselineDeck } from '../data/default-decks.js';
import { chooseAiAction } from './levels.js';

export function runAiMatchup({
  masterData,
  levelA,
  levelB,
  games = 20,
  seed = 'ai-lab',
  deckFactory = createBaselineDeck,
  aiOptions = { timeBudgetMs: 25 },
}) {
  const summary = {
    mode: 'same-deck-ai-comparison',
    seed,
    levelA,
    levelB,
    games,
    wins: { [levelA]: 0, [levelB]: 0, draw: 0 },
    firstPlayerWins: 0,
    secondPlayerWins: 0,
    totalRounds: 0,
    turnLimitGames: 0,
    specialFusions: { [levelA]: 0, [levelB]: 0 },
    seeds: [],
  };

  for (let index = 0; index < games; index += 1) {
    const gameSeed = `${seed}:${index + 1}`;
    const battle = new BattleEngine({
      masterData,
      seed: gameSeed,
      players: [
        { id: 'a', displayName: levelA, deckId: `a-${index}`, cards: deckFactory(masterData, `a-${index}`) },
        { id: 'b', displayName: levelB, deckId: `b-${index}`, cards: deckFactory(masterData, `b-${index}`) },
      ],
    });
    const rngs = {
      a: new SeededRng(`${gameSeed}:ai:a`),
      b: new SeededRng(`${gameSeed}:ai:b`),
    };
    const levels = { a: levelA, b: levelB };
    const completed = runAutomatedBattle(battle, {
      seed: `${gameSeed}:driver`,
      maxActions: 3000,
      chooseAction: (engine, playerId) => chooseAiAction(levels[playerId], engine, playerId, rngs[playerId], aiOptions),
    });
    const winnerLevel = completed.result.winnerId ? levels[completed.result.winnerId] : 'draw';
    summary.wins[winnerLevel] += 1;
    if (completed.result.winnerId === completed.state.firstPlayerId) summary.firstPlayerWins += 1;
    else if (completed.result.winnerId) summary.secondPlayerWins += 1;
    summary.totalRounds += completed.result.round;
    if (completed.result.reason.startsWith('turn-limit')) summary.turnLimitGames += 1;
    summary.specialFusions[levelA] += completed.state.players.a.metrics.specialFusions;
    summary.specialFusions[levelB] += completed.state.players.b.metrics.specialFusions;
    summary.seeds.push({ seed: gameSeed, winner: winnerLevel, round: completed.result.round, reason: completed.result.reason });
  }

  summary.winRates = {
    [levelA]: summary.wins[levelA] / games,
    [levelB]: summary.wins[levelB] / games,
    draw: summary.wins.draw / games,
  };
  summary.averageRound = summary.totalRounds / games;
  summary.turnLimitRate = summary.turnLimitGames / games;
  return summary;
}
