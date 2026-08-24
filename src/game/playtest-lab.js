import { chooseAiAction } from '../ai/levels.js';
import { BattleEngine } from '../battle/BattleEngine.js';
import { validateDeck } from '../battle/deck.js';
import { runAutomatedBattle } from '../battle/simulation.js';
import { SeededRng } from '../core/rng.js';
import { createBaselineDeck } from '../data/default-decks.js';
import { createMasterIndex } from '../data/master-loader.js';
import { CardStealSession } from '../reward/CardStealSession.js';
import { generateCpuDeck } from '../tournament/deck-generator.js';
import { TournamentRun } from '../tournament/TournamentRun.js';

function combinations(items, size, start = 0, prefix = [], output = []) {
  if (prefix.length === size) {
    output.push(prefix);
    return output;
  }
  for (let index = start; index <= items.length - (size - prefix.length); index += 1) {
    combinations(items, size, index + 1, [...prefix, items[index]], output);
  }
  return output;
}

function cardValue(card, masterIndex) {
  const definition = masterIndex.cards.get(card.masterId);
  if (definition.kind === 'monster') {
    const sp = definition.base.life + definition.base.atk + definition.base.def;
    return sp / definition.summonTp + definition.moveIds.length * 0.25;
  }
  if (definition.kind === 'shugyo') return 18 / definition.tp;
  if (definition.kind === 'training') return definition.amount * 1.7 / definition.tp;
  return 8 / definition.tp + (definition.name.includes('②') ? 1 : 0);
}

export function chooseAutomaticReward(reward, masterIndex) {
  const state = reward.getState();
  let best = null;
  for (const count of [1, 2]) {
    for (const offered of combinations(state.offered, count)) {
      for (const released of combinations(reward.originalCards, count)) {
        const releasedIds = new Set(released.map((card) => card.instanceId));
        const finalCards = reward.originalCards
          .filter((card) => !releasedIds.has(card.instanceId))
          .concat(offered.map((card, index) => ({ instanceId: `lab-capture-${count}-${index}`, masterId: card.masterId })));
        if (!validateDeck(finalCards, masterIndex, { deckId: reward.deckId }).valid) continue;
        const gain = offered.reduce((sum, card) => sum + cardValue(card, masterIndex), 0)
          - released.reduce((sum, card) => sum + cardValue(card, masterIndex), 0);
        if (gain > 0.01 && (!best || gain > best.gain)) best = { offered, released, gain };
      }
    }
  }
  if (!best) return { cards: reward.skip(), exchanged: 0, gain: 0 };
  for (const offer of best.offered) reward.toggleOffer(offer.offerId);
  for (const card of best.released) reward.toggleRelease(card.instanceId);
  return { cards: reward.commit(), exchanged: best.offered.length, gain: best.gain };
}

export function runTournamentPlaytest({
  masterData,
  rank = 'bronze',
  runs = 3,
  playerAi = 'gold',
  playerDeckRank = null,
  seed = 'tournament-playtest',
  timeBudgetMs = 12,
} = {}) {
  if (!masterData) throw new Error('masterData is required');
  if (!Number.isInteger(runs) || runs <= 0) throw new Error('runs must be a positive integer');
  const masterIndex = createMasterIndex(masterData);
  const summary = {
    mode: 'full-tournament-playtest',
    seed: String(seed),
    rank,
    playerAi,
    playerDeckRank: playerDeckRank ?? 'starter',
    runs,
    cupsWon: 0,
    eliminated: 0,
    matches: 0,
    playerWins: 0,
    draws: 0,
    totalRounds: 0,
    totalActions: 0,
    turnLimitMatches: 0,
    matchesWithFusion: 0,
    matchesWithSpecialFusion: 0,
    rewardScreens: 0,
    exchangedCards: 0,
    rewardValueGain: 0,
    seeds: [],
  };

  for (let runIndex = 0; runIndex < runs; runIndex += 1) {
    const runSeed = `${seed}:${runIndex + 1}`;
    const playerCards = playerDeckRank
      ? generateCpuDeck({
          masterIndex,
          rank: playerDeckRank,
          theme: '混合',
          rng: new SeededRng(`${runSeed}:player-deck`),
          seedLabel: `${runSeed}:player-deck`,
        }).cards
      : createBaselineDeck(masterData, `playtest-${runIndex + 1}`);
    const tournament = new TournamentRun({
      masterData,
      rank,
      seed: runSeed,
      playerDeck: {
        deckId: `playtest-${runIndex + 1}`,
        deckName: '検証用40枚',
        ownerDisplayName: '検証AI',
        cards: playerCards,
      },
    });
    const runRecord = { seed: runSeed, matches: [], status: null };

    while (tournament.state.status === 'active') {
      const round = tournament.state.roundIndex + 1;
      const opponent = tournament.getCurrentOpponent();
      const battleSeed = `${runSeed}:battle:${round}`;
      const battle = new BattleEngine({
        masterData,
        seed: battleSeed,
        players: [
          {
            id: 'player',
            displayName: '検証AI',
            deckId: tournament.state.playerDeck.deckId,
            cards: tournament.state.playerDeck.cards,
            tournamentGrowth: tournament.state.tournamentGrowth,
          },
          { id: opponent.id, displayName: opponent.displayName, deckId: opponent.id, cards: opponent.cards },
        ],
      });
      const levels = { player: playerAi, [opponent.id]: tournament.getCurrentAiLevel() };
      const aiRngs = {
        player: new SeededRng(`${battleSeed}:ai:player`),
        [opponent.id]: new SeededRng(`${battleSeed}:ai:opponent`),
      };
      const completed = runAutomatedBattle(battle, {
        seed: `${battleSeed}:driver`,
        maxActions: 3000,
        chooseAction: (engine, playerId) => chooseAiAction(
          levels[playerId], engine, playerId, aiRngs[playerId], { timeBudgetMs },
        ),
      });

      summary.matches += 1;
      summary.totalRounds += completed.result.round;
      summary.totalActions += completed.actions;
      if (completed.result.reason.startsWith('turn-limit')) summary.turnLimitMatches += 1;
      if (Object.values(completed.state.players).some((player) => player.metrics.fusions > 0)) summary.matchesWithFusion += 1;
      if (Object.values(completed.state.players).some((player) => player.metrics.specialFusions > 0)) summary.matchesWithSpecialFusion += 1;
      const won = completed.result.winnerId === 'player';
      const draw = completed.result.winnerId == null;
      if (won) summary.playerWins += 1;
      if (draw) summary.draws += 1;
      tournament.updateGrowth(battle.getGrowthSnapshot('player'));
      tournament.recordPlayerResult({ won, draw });

      let reward = null;
      if (won) {
        summary.rewardScreens += 1;
        const session = new CardStealSession({
          playerCards: tournament.state.playerDeck.cards,
          defeatedCards: opponent.cards,
          masterIndex,
          deckId: tournament.state.playerDeck.deckId,
          seed: `${runSeed}:reward:${round}`,
        });
        reward = chooseAutomaticReward(session, masterIndex);
        tournament.updatePlayerDeck(reward.cards);
        summary.exchangedCards += reward.exchanged;
        summary.rewardValueGain += reward.gain;
      }

      runRecord.matches.push({
        seed: battleSeed,
        round,
        opponent: opponent.displayName,
        opponentAi: levels[opponent.id],
        winner: won ? 'player' : draw ? 'draw' : 'opponent',
        battleRound: completed.result.round,
        actions: completed.actions,
        reason: completed.result.reason,
        exchangedCards: reward?.exchanged ?? 0,
        playerMetrics: completed.state.players.player.metrics,
        opponentMetrics: completed.state.players[opponent.id].metrics,
      });
    }

    runRecord.status = tournament.state.status;
    if (['won', 'champion'].includes(tournament.state.status)) summary.cupsWon += 1;
    else summary.eliminated += 1;
    summary.seeds.push(runRecord);
  }

  summary.cupWinRate = summary.cupsWon / runs;
  summary.matchWinRate = summary.matches ? summary.playerWins / summary.matches : 0;
  summary.averageBattleRound = summary.matches ? summary.totalRounds / summary.matches : 0;
  summary.averageActions = summary.matches ? summary.totalActions / summary.matches : 0;
  summary.turnLimitRate = summary.matches ? summary.turnLimitMatches / summary.matches : 0;
  summary.fusionMatchRate = summary.matches ? summary.matchesWithFusion / summary.matches : 0;
  summary.specialFusionMatchRate = summary.matches ? summary.matchesWithSpecialFusion / summary.matches : 0;
  return summary;
}
