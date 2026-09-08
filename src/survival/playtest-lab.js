import { createAiPolicy } from '../ai/index.js';
import { BattleEngine } from '../battle/BattleEngine.js';
import { RULES } from '../battle/rules.js';
import { runAutomatedBattle } from '../battle/simulation.js';
import { createBaselineDeck } from '../data/default-decks.js';
import { SurvivalRun } from './SurvivalRun.js';

export function runSurvivalPlaytest({ masterData, seed = 'survival-lab', maxBattles = 8, playerAi = 'legend', timeBudgetMs = Number.POSITIVE_INFINITY } = {}) {
  const cards = createBaselineDeck(masterData, `${seed}:player-deck`);
  const playerDeck = { deckId: 'survival-lab-player', deckName: '検証用40枚', cards };
  const run = new SurvivalRun({ masterData, playerDeck, seed: `${seed}:run` });
  const playerPolicy = createAiPolicy(playerAi, { timeBudgetMs });
  const trace = [];
  while (run.state.status === 'active' && trace.length < Math.max(1, Number(maxBattles) || 1)) {
    const opponent = run.getCurrentOpponent();
    const engine = new BattleEngine({
      masterData,
      seed: `${run.state.seed}:battle:${run.state.currentStreak + 1}`,
      players: [
        { id: 'player', displayName: '検証プレイヤー', cards: run.state.playerDeck.cards, tournamentGrowth: run.state.carryOverGrowth },
        { id: opponent.id, displayName: opponent.displayName, cards: opponent.cards, tournamentGrowth: opponent.tournamentGrowth },
      ],
    });
    engine.player('player').life = Math.max(1, Math.min(RULES.playerLife, run.state.carriedPlayerLife));
    const opponentPolicy = createAiPolicy(opponent.aiLevel, { timeBudgetMs });
    const completed = runAutomatedBattle(engine, {
      seed: `${seed}:policy:${trace.length + 1}`,
      chooseAction: (battle, playerId, rng) => (
        playerId === 'player' ? playerPolicy(battle, playerId, rng) : opponentPolicy(battle, playerId, rng)
      ),
    });
    const won = engine.state.winnerId === 'player';
    trace.push({
      battleNumber: trace.length + 1,
      opponentId: opponent.id,
      opponentAi: opponent.aiLevel,
      virtualGrowthRounds: opponent.difficulty.virtualGrowthRounds,
      winnerId: engine.state.winnerId,
      reason: engine.state.result?.reason ?? null,
      round: engine.state.round,
      actions: completed.actions,
      remainingPlayerLife: engine.player('player').life,
    });
    if (won) run.recordWin({ growth: engine.getGrowthSnapshot('player'), remainingPlayerLife: engine.player('player').life });
    else run.finish({ reason: 'defeat', draw: engine.state.winnerId == null });
  }
  return { seed: String(seed), playerAi, streak: run.state.currentStreak, status: run.state.status, trace };
}
