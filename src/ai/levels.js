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
    const simple = ({ 'resolve-shugyo-move': 90, move: 70, summon: 52, 'fusion-special': 50, 'fusion-normal': 40, breeder: 28, training: 24, shugyo: 21, 'end-turn': 0 })[action.type] ?? 10;
    const affordableBias = -(action.cost ?? 0) * 2;
    // Beginner logic still recognizes obvious damage/knockouts, but only for
    // the core board actions and with enough noise to remain fallible.
    const tacticalWeight = action.type === 'move' ? .32
      : action.type === 'summon' ? .14
        : action.type.startsWith('fusion') ? .12 : 0;
    const tactical = tacticalWeight ? quickActionScore(engine, playerId, action, { counterWeight: 0, costWeight: 2 }) * tacticalWeight : 0;
    const noise = rng.next() * 24;
    return { action, score: simple + affordableBias + tactical + noise };
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
    score: quickActionScore(engine, playerId, action, { counterWeight: .04 }) + rng.next() * 2,
  })));
}

function bestImmediate(engine, playerId, options) {
  return stableBest(legal(engine, playerId).map((action) => ({
    action,
    score: quickActionScore(engine, playerId, action, options),
  })));
}

function keepTacticalFloor(engine, playerId, planned, immediate, options, tolerance) {
  if (!planned || planned.type === 'end-turn' && immediate.type !== 'end-turn') return immediate;
  const plannedScore = quickActionScore(engine, playerId, planned, options);
  const immediateScore = quickActionScore(engine, playerId, immediate, options);
  return plannedScore >= immediateScore - tolerance ? planned : immediate;
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
  const searchOptions = {
    beamWidth: 2,
    branchLimit: 2,
    maxDepth: 2,
    counterWeight: .06,
    costWeight: 1.25,
    deadline: performance.now() + (options.timeBudgetMs ?? 22),
  };
  const planned = sequenceChoice(engine, playerId, searchOptions);
  const immediate = bestImmediate(engine, playerId, searchOptions);
  return keepTacticalFloor(engine, playerId, planned, immediate, searchOptions, 4);
}

function legend(engine, playerId, options = {}) {
  const searchOptions = {
    beamWidth: 6,
    branchLimit: 5,
    maxDepth: 4,
    counterWeight: .28,
    lifeWeight: 8.2,
    boardWeight: 1.2,
    costWeight: 1.05,
    deadline: performance.now() + (options.timeBudgetMs ?? 55),
  };
  const planned = sequenceChoice(engine, playerId, searchOptions);
  const immediate = bestImmediate(engine, playerId, searchOptions);
  return keepTacticalFloor(engine, playerId, planned, immediate, searchOptions, 8);
}

function champion(engine, playerId, options = {}) {
  const start = performance.now();
  const budgetMs = options.timeBudgetMs ?? 85;
  const searchOptions = {
    beamWidth: options.beamWidth ?? 10,
    branchLimit: options.branchLimit ?? 7,
    maxDepth: options.maxDepth ?? 5,
    counterWeight: .34,
    lifeWeight: 9,
    boardWeight: 1.3,
    costWeight: .9,
    deadline: start + budgetMs,
    replyWidth: 4,
  };
  const lines = searchTurnSequences(engine, playerId, searchOptions).slice(0, 6);
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
