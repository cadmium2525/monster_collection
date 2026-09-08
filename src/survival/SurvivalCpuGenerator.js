import { representativeMonster } from '../battle/deck.js';
import { SeededRng } from '../core/rng.js';
import { createMasterIndex } from '../data/master-loader.js';
import { advanceCpuTournamentGrowth } from '../tournament/cpu-growth.js';
import { DECK_THEMES, generateCpuDeck } from '../tournament/deck-generator.js';
import { generateCpuNames } from '../tournament/cpu-names.js';

export const SURVIVAL_AI_BY_STREAK = Object.freeze({
  0: 'silver',
  1: 'gold',
});

function clone(value) { return structuredClone(value); }
function integer(value) { return Math.max(0, Math.trunc(Number(value) || 0)); }

export function survivalDifficulty(streakValue) {
  const streak = integer(streakValue);
  const aiLevel = SURVIVAL_AI_BY_STREAK[streak] ?? 'legend';
  const virtualGrowthRounds = streak >= 2 ? streak + Math.floor(streak / 3) : 0;
  return Object.freeze({
    battleNumber: streak + 1,
    deckRank: aiLevel,
    aiLevel,
    virtualGrowthRounds,
  });
}

function themeForStreak(seed, streak) {
  const order = new SeededRng(`${seed}:theme-order`).shuffle(DECK_THEMES);
  return order[streak % order.length];
}

export function generateSurvivalOpponent({ masterData, masterIndex = null, seed = 'survival', currentStreak = 0 }) {
  const index = masterIndex ?? createMasterIndex(masterData);
  const streak = integer(currentStreak);
  const difficulty = survivalDifficulty(streak);
  const opponentSeed = `${seed}:opponent:${difficulty.battleNumber}`;
  const rng = new SeededRng(opponentSeed);
  const theme = themeForStreak(seed, streak);
  const generated = generateCpuDeck({
    masterIndex: index,
    rank: difficulty.deckRank,
    theme,
    rng: rng.fork('deck'),
    seedLabel: `survival-${difficulty.battleNumber}`,
  });
  let entrant = {
    id: `survival-cpu-${String(difficulty.battleNumber).padStart(3, '0')}`,
    type: 'cpu',
    displayName: generateCpuNames(1, rng.fork('name'))[0],
    deckName: `${theme}型・第${difficulty.battleNumber}戦`,
    cards: clone(generated.cards),
    theme,
    aiLevel: difficulty.aiLevel,
    tournamentGrowth: {},
    growthHistory: [],
    virtualMatchWins: 0,
    qualityScore: generated.qualityScore,
    generatorStats: generated.analysis,
  };
  for (let roundIndex = 0; roundIndex < difficulty.virtualGrowthRounds; roundIndex += 1) {
    entrant = {
      ...entrant,
      ...advanceCpuTournamentGrowth({
        entrant,
        masterData,
        masterIndex: index,
        rank: 'legend',
        roundIndex,
        rng: new SeededRng(`${opponentSeed}:growth:${roundIndex + 1}`),
      }),
    };
  }
  entrant.representativeMonsterId = representativeMonster(entrant.cards, index)?.id ?? null;
  entrant.difficulty = clone(difficulty);
  return entrant;
}
