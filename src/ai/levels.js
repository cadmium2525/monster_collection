import { actionKey } from '../battle/state.js';
import { evaluatePublicPosition, estimateCounterThreat } from './public-evaluator.js';
import { championLineScore, quickActionScore, searchTurnSequences } from './search.js';

export const AI_LEVELS = Object.freeze(['bronze', 'silver', 'gold', 'legend', 'champion']);

export const AI_LABELS = Object.freeze({
  bronze: 'Bronze AI',
  silver: 'Silver AI',
  gold: 'Gold AI',
  legend: 'Legend AI',
  champion: 'Champion AI',
});

function legal(engine, playerId) {
  const actions = engine.getLegalActions(playerId);
  if (!actions.length) throw new Error(`${playerId}に合法行動がありません`);
  return actions;
}

function stableBest(scored) {
  return scored.sort((a, b) => b.score - a.score || actionKey(a.action).localeCompare(actionKey(b.action)))[0].action;
}

function bronze(engine, playerId, rng) {
  const actions = legal(engine, playerId);
  const scored = actions.map((action) => {
    const simple = ({ move: 70, summon: 52, 'fusion-special': 50, 'fusion-normal': 40, breeder: 28, training: 24, shugyo: 21, 'end-turn': 0 })[action.type] ?? 10;
    const affordableBias = -(action.cost ?? 0) * 2;
    const noise = rng.next() * 32;
    return { action, score: simple + affordableBias + noise };
  });
  const ordered = scored.sort((a, b) => b.score - a.score);
  const pool = ordered.slice(0, Math.min(3, ordered.length));
  const weighted = pool.map((entry, index) => ({ ...entry, pickWeight: [5, 3, 2][index] ?? 1 }));
  return rng.weightedChoice(weighted, (entry) => entry.pickWeight).action;
}

function silver(engine, playerId, rng) {
  const actions = legal(engine, playerId);
  return stableBest(actions.map((action) => ({
    action,
    score: quickActionScore(engine, playerId, action, { counterWeight: .04 }) + rng.next() * 1.25,
  })));
}

function sequenceChoice(engine, playerId, options) {
  const lines = searchTurnSequences(engine, playerId, options);
  if (!lines.length) return legal(engine, playerId).find((action) => action.type === 'end-turn');
  const best = lines[0];
  const current = evaluatePublicPosition(engine, playerId, options) - estimateCounterThreat(engine, playerId) * (options.counterWeight ?? 0);
  if (best.score < current - 1) return legal(engine, playerId).find((action) => action.type === 'end-turn');
  return best.actions[0];
}

function gold(engine, playerId, options = {}) {
  return sequenceChoice(engine, playerId, {
    beamWidth: 2,
    branchLimit: 2,
    maxDepth: 2,
    counterWeight: .06,
    costWeight: 1.25,
    deadline: performance.now() + (options.timeBudgetMs ?? 22),
  });
}

function legend(engine, playerId, options = {}) {
  return sequenceChoice(engine, playerId, {
    beamWidth: 6,
    branchLimit: 5,
    maxDepth: 4,
    counterWeight: .28,
    lifeWeight: 8.2,
    boardWeight: 1.2,
    costWeight: 1.05,
    deadline: performance.now() + (options.timeBudgetMs ?? 55),
  });
}

function champion(engine, playerId, options = {}) {
  const start = performance.now();
  const budgetMs = options.timeBudgetMs ?? 85;
  const searchOptions = {
    beamWidth: options.beamWidth ?? 12,
    branchLimit: options.branchLimit ?? 8,
    maxDepth: options.maxDepth ?? 6,
    counterWeight: .34,
    lifeWeight: 9,
    boardWeight: 1.3,
    costWeight: .9,
    deadline: start + budgetMs,
    replyWidth: 4,
  };
  const lines = searchTurnSequences(engine, playerId, searchOptions).slice(0, 8);
  if (!lines.length) return legal(engine, playerId).find((action) => action.type === 'end-turn');
  const evaluated = lines.map((line) => ({
    line,
    score: performance.now() < searchOptions.deadline ? championLineScore(line, playerId, searchOptions) : line.score,
  })).sort((a, b) => b.score - a.score || a.line.actions.length - b.line.actions.length);
  return evaluated[0].line.actions[0];
}

export function chooseAiAction(level, engine, playerId, rng, options = {}) {
  switch (level) {
    case 'bronze': return bronze(engine, playerId, rng);
    case 'silver': return silver(engine, playerId, rng);
    case 'gold': return gold(engine, playerId, options);
    case 'legend': return legend(engine, playerId, options);
    case 'champion': return champion(engine, playerId, options);
    default: throw new Error(`Unknown AI level: ${level}`);
  }
}

export function createAiPolicy(level, options = {}) {
  if (!AI_LEVELS.includes(level)) throw new Error(`Unknown AI level: ${level}`);
  return (engine, playerId, rng) => chooseAiAction(level, engine, playerId, rng, options);
}
