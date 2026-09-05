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
  const preferred = actions.filter((action) => !action.meta?.aiAvoid);
  return preferred.length ? preferred : actions;
}

function stableBest(scored) {
  return scored.sort((a, b) => b.score - a.score || actionKey(a.action).localeCompare(actionKey(b.action)))[0].action;
}

function cardDefinitionForAction(engine, playerId, action) {
  const card = engine.player(playerId).hand.find((candidate) => candidate.instanceId === action.cardInstanceId);
  return card ? engine.masterIndex.cards.get(card.masterId) : null;
}

function isImmediateWinOrKnockout(engine, playerId, action) {
  const opponentId = engine.state.playerOrder.find((candidate) => candidate !== playerId);
  const beforeUnits = new Set(engine.player(opponentId).board.filter(Boolean).map((unit) => unit.id));
  const next = engine.clone();
  next.applyAction(action);
  if (next.state.status === 'finished' && next.state.winnerId === playerId) return true;
  const afterUnits = new Set(next.player(opponentId).board.filter(Boolean).map((unit) => unit.id));
  return [...beforeUnits].some((unitId) => !afterUnits.has(unitId));
}

function damagingMoves(engine, actions) {
  return actions.filter((action) => action.type === 'move'
    && engine.masterIndex.moves.get(action.moveId)?.power != null);
}

function setupCandidatesForAttack(engine, playerId, attack, actions) {
  const player = engine.player(playerId);
  return actions.filter((action) => {
    if (!['training', 'shugyo'].includes(action.type) || action.unitId !== attack.unitId) return false;
    const definition = cardDefinitionForAction(engine, playerId, action);
    return definition?.stat === 'atk' && (action.cost ?? 0) + (attack.cost ?? 0) <= player.tp;
  });
}

function correctObviousActionOrder(engine, playerId, selected, options = {}) {
  const actions = engine.getLegalActions(playerId);
  const attacks = damagingMoves(engine, actions);
  const decisive = attacks.filter((action) => isImmediateWinOrKnockout(engine, playerId, action));
  if (decisive.length) {
    return stableBest(decisive.map((action) => ({
      action,
      score: quickActionScore(engine, playerId, action, options),
    })));
  }
  let plannedAttack = selected;
  if (selected?.type === 'end-turn') {
    const setupAttacks = attacks.filter((attack) => setupCandidatesForAttack(engine, playerId, attack, actions).length);
    if (!setupAttacks.length) return selected;
    plannedAttack = stableBest(setupAttacks.map((action) => ({
      action,
      score: quickActionScore(engine, playerId, action, options),
    })));
  }
  if (plannedAttack?.type !== 'move') return selected;
  const candidates = setupCandidatesForAttack(engine, playerId, plannedAttack, actions);
  if (!candidates.length) return selected;
  return stableBest(candidates.map((action) => ({
    action,
    score: quickActionScore(engine, playerId, action, options),
  })));
}

function bronze(engine, playerId, rng) {
  const actions = legal(engine, playerId);
  const scored = actions.map((action) => {
    const simple = ({ 'resolve-shugyo-move': 90, move: 70, awaken: 58, summon: 52, 'fusion-special': 50, 'fusion-normal': 40, breeder: 28, training: 24, shugyo: 21, 'end-turn': 0 })[action.type] ?? 10;
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

function searchDeadline(options, defaultBudgetMs) {
  // Wall-clock cutoffs are useful on a phone, but they make seeded validation
  // depend on machine load. Tests and replay tools can request a fully bounded,
  // deterministic beam search instead; beamWidth/branchLimit/maxDepth still cap
  // the amount of work.
  if (options.deterministicSearch) return Number.POSITIVE_INFINITY;
  return performance.now() + (options.timeBudgetMs ?? defaultBudgetMs);
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
    deadline: searchDeadline(options, 22),
  };
  const planned = sequenceChoice(engine, playerId, searchOptions);
  const immediate = bestImmediate(engine, playerId, searchOptions);
  return keepTacticalFloor(engine, playerId, planned, immediate, searchOptions, 4);
}

function legend(engine, playerId, options = {}) {
  const searchOptions = {
    beamWidth: options.beamWidth ?? 8,
    branchLimit: options.branchLimit ?? 6,
    maxDepth: options.maxDepth ?? 5,
    candidateEvaluationLimit: options.candidateEvaluationLimit ?? 32,
    counterWeight: .34,
    lifeWeight: 8.8,
    boardWeight: 1.28,
    costWeight: .95,
    deadline: searchDeadline(options, 85),
  };
  const planned = sequenceChoice(engine, playerId, searchOptions);
  const immediate = bestImmediate(engine, playerId, searchOptions);
  return keepTacticalFloor(engine, playerId, planned, immediate, searchOptions, 8);
}

function champion(engine, playerId, options = {}) {
  const overallDeadline = searchDeadline(options, 240);
  const searchOptions = {
    beamWidth: options.beamWidth ?? 12,
    branchLimit: options.branchLimit ?? 8,
    maxDepth: options.maxDepth ?? 7,
    candidateEvaluationLimit: options.candidateEvaluationLimit ?? 48,
    counterWeight: .48,
    lifeWeight: 10.5,
    boardWeight: 1.42,
    costWeight: .78,
    deadline: overallDeadline,
    overallDeadline,
    replyWidth: options.replyWidth ?? 5,
    replyBeamWidth: options.replyBeamWidth ?? 6,
    replyBranchLimit: options.replyBranchLimit ?? 5,
    replyDepth: options.replyDepth ?? 4,
    continuationBeamWidth: options.continuationBeamWidth ?? 5,
    continuationBranchLimit: options.continuationBranchLimit ?? 5,
    continuationDepth: options.continuationDepth ?? 3,
    futureWeight: options.futureWeight ?? .66,
    hiddenReplyWeight: options.hiddenReplyWeight ?? .62,
  };
  const immediate = bestImmediate(engine, playerId, searchOptions);
  if (performance.now() >= overallDeadline) return immediate;
  const rootDeadline = Number.isFinite(overallDeadline)
    ? performance.now() + Math.max(1, overallDeadline - performance.now()) * .42
    : Number.POSITIVE_INFINITY;
  const lines = searchTurnSequences(engine, playerId, { ...searchOptions, deadline: rootDeadline }).slice(0, 4);
  if (!lines.length) return immediate;
  const evaluated = [];
  for (let index = 0; index < lines.length; index += 1) {
    const remainingLines = lines.length - index;
    const lineDeadline = Number.isFinite(overallDeadline)
      ? performance.now() + Math.max(1, overallDeadline - performance.now()) / remainingLines
      : Number.POSITIVE_INFINITY;
    const line = lines[index];
    evaluated.push({
      line,
      score: performance.now() < overallDeadline
        ? championLineScore(line, playerId, { ...searchOptions, deadline: lineDeadline, overallDeadline: lineDeadline })
        : line.score,
    });
  }
  evaluated.sort((a, b) => b.score - a.score
    || a.line.actions.length - b.line.actions.length
    || a.line.actions.map(actionKey).join('|').localeCompare(b.line.actions.map(actionKey).join('|')));
  return keepTacticalFloor(engine, playerId, evaluated[0].line.actions[0], immediate, searchOptions, 1.5);
}

export function chooseAiAction(level, engine, playerId, rng, options = {}) {
  let selected;
  switch (level) {
    case 'bronze': selected = bronze(engine, playerId, rng); break;
    case 'silver': selected = silver(engine, playerId, rng); break;
    case 'gold': selected = gold(engine, playerId, options); break;
    case 'legend': selected = legend(engine, playerId, options); break;
    case 'champion': selected = champion(engine, playerId, options); break;
    default: throw new Error(`Unknown AI level: ${level}`);
  }
  return correctObviousActionOrder(engine, playerId, selected, options);
}

export function createAiPolicy(level, options = {}) {
  if (!AI_LEVELS.includes(level)) throw new Error(`Unknown AI level: ${level}`);
  return (engine, playerId, rng) => chooseAiAction(level, engine, playerId, rng, options);
}
