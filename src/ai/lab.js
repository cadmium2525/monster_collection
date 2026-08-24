import { BattleEngine } from '../battle/BattleEngine.js';
import { runAutomatedBattle } from '../battle/simulation.js';
import { SeededRng } from '../core/rng.js';
import { createBaselineDeck } from '../data/default-decks.js';
import { chooseAiAction } from './levels.js';

const METRIC_KEYS = Object.freeze([
  'cardsDrawn', 'reshuffles', 'summons', 'attacks', 'damageDealt',
  'directDamage', 'knockouts', 'trainingUses', 'shugyoUses',
  'breederUses', 'fusions', 'specialFusions',
]);

function add(counter, key, amount = 1) {
  if (key == null) return;
  counter[key] = (counter[key] ?? 0) + amount;
}

function emptySide(level) {
  return {
    level,
    wins: 0,
    gamesWithFusion: 0,
    gamesWithSpecialFusion: 0,
    metrics: Object.fromEntries(METRIC_KEYS.map((key) => [key, 0])),
    actionTypes: {},
    cardUsage: {},
    moveUsage: {},
  };
}

function recordPlayerStats(side, player, log, masterIndex) {
  for (const key of METRIC_KEYS) side.metrics[key] += player.metrics[key] ?? 0;
  if (player.metrics.fusions > 0) side.gamesWithFusion += 1;
  if (player.metrics.specialFusions > 0) side.gamesWithSpecialFusion += 1;

  for (const event of log.filter((entry) => entry.playerId === player.id)) {
    if (['summon', 'training', 'shugyo', 'breeder', 'fusion-normal', 'fusion-special', 'move', 'attack', 'direct-attack', 'turn-end'].includes(event.type)) {
      add(side.actionTypes, event.type);
    }
    const cardId = event.cardMasterId ?? event.materialMasterId;
    if (cardId) add(side.cardUsage, `${cardId}:${masterIndex.cards.get(cardId)?.name ?? cardId}`);
    if (event.moveId) add(side.moveUsage, `${event.moveId}:${masterIndex.moves.get(event.moveId)?.name ?? event.moveId}`);
  }
}

function finalizeSide(side, games) {
  return {
    ...side,
    winRate: side.wins / games,
    fusionGameRate: side.gamesWithFusion / games,
    specialFusionGameRate: side.gamesWithSpecialFusion / games,
    normalFusions: side.metrics.fusions - side.metrics.specialFusions,
    averageMetrics: Object.fromEntries(METRIC_KEYS.map((key) => [key, side.metrics[key] / games])),
  };
}

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
    totalActions: 0,
    gamesWithFusion: 0,
    gamesWithSpecialFusion: 0,
    specialFusions: { [levelA]: 0, [levelB]: 0 },
    sides: { a: emptySide(levelA), b: emptySide(levelB) },
    traitTriggers: {},
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
    if (completed.result.winnerId) summary.sides[completed.result.winnerId].wins += 1;
    if (completed.result.winnerId === completed.state.firstPlayerId) summary.firstPlayerWins += 1;
    else if (completed.result.winnerId) summary.secondPlayerWins += 1;
    summary.totalRounds += completed.result.round;
    summary.totalActions += completed.actions;
    if (completed.result.reason.startsWith('turn-limit')) summary.turnLimitGames += 1;
    const totalFusions = completed.state.players.a.metrics.fusions + completed.state.players.b.metrics.fusions;
    const totalSpecialFusions = completed.state.players.a.metrics.specialFusions + completed.state.players.b.metrics.specialFusions;
    if (totalFusions > 0) summary.gamesWithFusion += 1;
    if (totalSpecialFusions > 0) summary.gamesWithSpecialFusion += 1;
    summary.specialFusions[levelA] += completed.state.players.a.metrics.specialFusions;
    summary.specialFusions[levelB] += completed.state.players.b.metrics.specialFusions;
    recordPlayerStats(summary.sides.a, completed.state.players.a, completed.state.log, battle.masterIndex);
    recordPlayerStats(summary.sides.b, completed.state.players.b, completed.state.log, battle.masterIndex);
    for (const event of completed.state.log) {
      for (const trigger of event.incomingTriggers ?? []) add(summary.traitTriggers, trigger);
      if (event.type === 'trait') add(summary.traitTriggers, event.traitName ?? event.message);
    }
    summary.seeds.push({
      seed: gameSeed,
      firstPlayer: levels[completed.state.firstPlayerId],
      winner: winnerLevel,
      round: completed.result.round,
      actions: completed.actions,
      reason: completed.result.reason,
    });
  }

  summary.winRates = {
    [levelA]: summary.wins[levelA] / games,
    [levelB]: summary.wins[levelB] / games,
    draw: summary.wins.draw / games,
  };
  summary.averageRound = summary.totalRounds / games;
  summary.averageActions = summary.totalActions / games;
  summary.turnLimitRate = summary.turnLimitGames / games;
  summary.fusionGameRate = summary.gamesWithFusion / games;
  summary.specialFusionGameRate = summary.gamesWithSpecialFusion / games;
  summary.firstPlayerWinRate = summary.firstPlayerWins / games;
  summary.secondPlayerWinRate = summary.secondPlayerWins / games;
  summary.sides = {
    a: finalizeSide(summary.sides.a, games),
    b: finalizeSide(summary.sides.b, games),
  };
  return summary;
}
