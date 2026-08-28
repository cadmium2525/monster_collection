import { actionKey } from '../battle/state.js';
import {
  actionEventDelta,
  evaluatePublicPosition,
  estimateCounterThreat,
  estimateHiddenOpportunity,
} from './public-evaluator.js';

const ACTION_PRIOR = Object.freeze({
  'resolve-shugyo-move': 30,
  move: 38,
  'fusion-special': 22,
  'fusion-normal': 10,
  summon: 21,
  breeder: 14,
  shugyo: 12,
  training: 10,
  'end-turn': 0,
});

function moveValue(masterIndex, moveId) {
  if (!moveId) return 0;
  const move = masterIndex.moves.get(moveId);
  if (!move) return 0;
  return (move.power ?? 8) * .22 + (6 - (move.rank ?? 3)) * 1.2 - (move.tp ?? 0) * .45 + (move.effect ? 2 : 0);
}

export function quickActionScore(engine, playerId, action, options = {}) {
  if (action.type === 'resolve-shugyo-move') {
    return action.replaceMoveId
      ? moveValue(engine.masterIndex, action.learnedMoveId) - moveValue(engine.masterIndex, action.replaceMoveId)
      : 0;
  }
  if (action.type === 'end-turn') {
    // All other actions are scored as a delta. Returning the absolute board
    // score here made a leading Silver AI end its turn instead of taking free
    // attacks, so evaluate the transition on the same scale.
    const next = engine.clone();
    const before = evaluatePublicPosition(next, playerId, options);
    next.applyAction(action);
    const after = evaluatePublicPosition(next, playerId, options);
    return after - before - estimateCounterThreat(next, playerId) * (options.counterWeight ?? 0.15);
  }
  const next = engine.clone();
  const before = evaluatePublicPosition(next, playerId, options);
  const beforeLogLength = next.state.log.length;
  next.applyAction(action);
  const after = evaluatePublicPosition(next, playerId, options);
  const costEfficiency = -(action.cost ?? 0) * (options.costWeight ?? 1.5);
  return after - before + actionEventDelta(beforeLogLength, next, playerId)
    + (ACTION_PRIOR[action.type] ?? 4) + costEfficiency;
}

function uniqueActions(actions) {
  const seen = new Set();
  return actions.filter((action) => {
    const key = actionKey(action);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cheapActionOrder(engine, action) {
  let value = (ACTION_PRIOR[action.type] ?? 4) - (action.cost ?? 0);
  if (action.type === 'move') {
    const move = engine.masterIndex.moves.get(action.moveId);
    value += (move?.power ?? 0) * .12;
  }
  if (action.type === 'fusion-special') value += 30;
  if (action.type === 'resolve-shugyo-move') {
    value += action.replaceMoveId
      ? moveValue(engine.masterIndex, action.learnedMoveId) - moveValue(engine.masterIndex, action.replaceMoveId)
      : 0;
  }
  return value;
}

function topCandidateActions(engine, playerId, limit, options, deadline) {
  const evaluationLimit = options.candidateEvaluationLimit ?? Math.max(limit * 3, 24);
  const shortlist = uniqueActions(engine.getLegalActions(playerId))
    .filter((action) => action.type !== 'end-turn')
    .filter((action) => typeof options.actionFilter !== 'function' || options.actionFilter(action))
    .sort((a, b) => cheapActionOrder(engine, b) - cheapActionOrder(engine, a) || actionKey(a).localeCompare(actionKey(b)))
    .slice(0, evaluationLimit);
  const scored = [];
  for (const action of shortlist) {
    if (performance.now() >= deadline && scored.length) break;
    scored.push({ action, score: quickActionScore(engine, playerId, action, options) });
  }
  return scored
    .sort((a, b) => b.score - a.score || actionKey(a.action).localeCompare(actionKey(b.action)))
    .slice(0, limit)
    .map(({ action }) => action);
}

export function searchTurnSequences(engine, playerId, options = {}) {
  const beamWidth = options.beamWidth ?? 6;
  const branchLimit = options.branchLimit ?? 6;
  const maxDepth = options.maxDepth ?? 4;
  const deadline = options.deadline ?? Number.POSITIVE_INFINITY;
  const counterWeight = options.counterWeight ?? 0;
  let beam = [{ engine: engine.clone(), actions: [], score: evaluatePublicPosition(engine, playerId, options) }];
  const completed = [];

  for (let depth = 0; depth < maxDepth && performance.now() < deadline; depth += 1) {
    const expanded = [];
    for (const node of beam) {
      if (performance.now() >= deadline || node.engine.state.status !== 'active') {
        completed.push(node);
        continue;
      }
      const candidates = topCandidateActions(node.engine, playerId, branchLimit, options, deadline);
      completed.push({
        ...node,
        score: evaluatePublicPosition(node.engine, playerId, options)
          - estimateCounterThreat(node.engine, playerId) * counterWeight
          + node.actions.length * .25,
      });
      for (const action of candidates) {
        if (performance.now() >= deadline) break;
        const next = node.engine.clone();
        next.applyAction(action);
        const actions = [...node.actions, action];
        const score = evaluatePublicPosition(next, playerId, options)
          - estimateCounterThreat(next, playerId) * counterWeight
          + actions.length * .25;
        expanded.push({ engine: next, actions, score });
      }
    }
    if (!expanded.length) break;
    expanded.sort((a, b) => b.score - a.score || a.actions.map(actionKey).join('|').localeCompare(b.actions.map(actionKey).join('|')));
    beam = expanded.slice(0, beamWidth);
  }
  completed.push(...beam);
  return completed
    .filter((node) => node.actions.length)
    .sort((a, b) => b.score - a.score || a.actions.length - b.actions.length);
}

function visibleResponseActions(engine, opponentId, limit, options, deadline) {
  // getLegalActions also constructs hand-based options internally, but only
  // public board moves enter this list. Hidden-hand invariance tests verify
  // that neither their identity nor deck order can affect the branch set.
  const shortlist = uniqueActions(engine.getLegalActions(opponentId))
    .filter((action) => action.type === 'move')
    .sort((a, b) => cheapActionOrder(engine, b) - cheapActionOrder(engine, a) || actionKey(a).localeCompare(actionKey(b)))
    .slice(0, Math.max(limit, limit * 2));
  const scored = [];
  for (const action of shortlist) {
    if (performance.now() >= deadline && scored.length) break;
    scored.push({
      action,
      score: quickActionScore(engine, opponentId, action, {
        ...options,
        counterWeight: Math.min(.12, options.counterWeight ?? .12),
      }),
    });
  }
  return scored
    .sort((a, b) => b.score - a.score || actionKey(a.action).localeCompare(actionKey(b.action)))
    .slice(0, limit)
    .map(({ action }) => action);
}

function publicResponseStateKey(engine, perspectiveId) {
  const observation = engine.getObservation(perspectiveId);
  const unitState = (unit) => unit ? {
    id: unit.id,
    life: unit.life,
    maxLife: unit.maxLife,
    atkBase: unit.atkBase,
    defBase: unit.defBase,
    atkMod: unit.atkMod,
    defMod: unit.defMod,
    temporaryAtk: unit.temporaryAtk,
    temporaryDef: unit.temporaryDef,
    timedAtkBuffs: unit.timedAtkBuffs,
    timedDefBuffs: unit.timedDefBuffs,
    actionPoints: unit.actionPoints,
    summonedThisTurn: unit.summonedThisTurn,
    stunnedThisTurn: unit.stunnedThisTurn,
    equippedMoveIds: unit.equippedMoveIds,
    statuses: unit.statuses,
  } : null;
  return JSON.stringify({
    status: observation.status,
    winnerId: observation.winnerId,
    currentPlayerId: observation.currentPlayerId,
    round: observation.round,
    own: {
      life: observation.own.life,
      tp: observation.own.tp,
      maxTp: observation.own.maxTp,
      handCount: observation.own.hand.length,
      graveyardCount: observation.own.graveyard.length,
      board: observation.own.board.map(unitState),
    },
    opponent: {
      life: observation.opponent.life,
      tp: observation.opponent.tp,
      maxTp: observation.opponent.maxTp,
      handCount: observation.opponent.handCount,
      graveyardCount: observation.opponent.graveyard.length,
      board: observation.opponent.board.map(unitState),
    },
  });
}

function completedVisibleReply(node, opponentId, perspectiveId, options) {
  const next = node.engine.clone();
  if (next.state.status === 'active' && next.state.currentPlayerId === opponentId) {
    const endTurn = next.getLegalActions(opponentId).find((action) => action.type === 'end-turn');
    if (endTurn) next.applyAction(endTurn);
  }
  return {
    engine: next,
    actions: node.actions,
    score: evaluatePublicPosition(next, perspectiveId, options),
  };
}

function uniqueResponseNodes(nodes, perspectiveId, limit) {
  const seen = new Set();
  const unique = [];
  for (const node of nodes) {
    const key = publicResponseStateKey(node.engine, perspectiveId);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(node);
    if (unique.length >= limit) break;
  }
  return unique;
}

export function searchPublicResponseSequences(engine, opponentId, perspectiveId, options = {}) {
  const deadline = options.deadline ?? Number.POSITIVE_INFINITY;
  const maxDepth = options.replyDepth ?? 3;
  const beamWidth = options.replyBeamWidth ?? 5;
  const branchLimit = options.replyBranchLimit ?? 4;
  let beam = [{
    engine: engine.clone(),
    actions: [],
    score: evaluatePublicPosition(engine, perspectiveId, options),
  }];
  const completed = [];

  for (let depth = 0; depth < maxDepth && performance.now() < deadline; depth += 1) {
    const expanded = [];
    for (const node of beam) {
      completed.push(completedVisibleReply(node, opponentId, perspectiveId, options));
      if (node.engine.state.status !== 'active' || node.engine.state.currentPlayerId !== opponentId) continue;
      const actions = visibleResponseActions(node.engine, opponentId, branchLimit, options, deadline);
      for (const action of actions) {
        if (performance.now() >= deadline && expanded.length) break;
        const next = node.engine.clone();
        next.applyAction(action);
        expanded.push({
          engine: next,
          actions: [...node.actions, action],
          score: evaluatePublicPosition(next, perspectiveId, options),
        });
      }
    }
    if (!expanded.length) break;
    expanded.sort((a, b) => a.score - b.score
      || a.actions.map(actionKey).join('|').localeCompare(b.actions.map(actionKey).join('|')));
    beam = uniqueResponseNodes(expanded, perspectiveId, beamWidth);
  }
  completed.push(...beam.map((node) => completedVisibleReply(node, opponentId, perspectiveId, options)));
  completed.sort((a, b) => a.score - b.score
    || b.actions.length - a.actions.length
    || a.actions.map(actionKey).join('|').localeCompare(b.actions.map(actionKey).join('|')));
  return uniqueResponseNodes(completed, perspectiveId, Math.max(1, options.replyWidth ?? 4));
}

function knownOwnCardIds(engine, perspectiveId) {
  const player = engine.player(perspectiveId);
  return new Set([
    ...player.hand.map((card) => card.instanceId),
    ...player.graveyard.map((card) => card.instanceId),
    ...player.setAside.map((card) => card.instanceId),
    ...player.board.flatMap((unit) => unit
      ? [unit.sourceCardInstanceId, ...(unit.absorbedCardInstanceIds ?? [])]
      : []),
  ]);
}

function knownCardActionFilter(knownCardIds) {
  return (action) => [action.cardInstanceId, action.materialCardInstanceId]
    .filter(Boolean)
    .every((instanceId) => knownCardIds.has(instanceId));
}

function championContinuationScore(engine, perspectiveId, knownCardIds, options) {
  const baseline = evaluatePublicPosition(engine, perspectiveId, options)
    - estimateCounterThreat(engine, perspectiveId) * .1;
  if (engine.state.status !== 'active' || engine.state.currentPlayerId !== perspectiveId) return baseline;
  if (performance.now() >= (options.deadline ?? Number.POSITIVE_INFINITY)) return baseline;
  const lines = searchTurnSequences(engine, perspectiveId, {
    ...options,
    beamWidth: options.continuationBeamWidth ?? 4,
    branchLimit: options.continuationBranchLimit ?? 4,
    maxDepth: options.continuationDepth ?? 2,
    actionFilter: knownCardActionFilter(knownCardIds),
  });
  return lines.length ? Math.max(baseline, lines[0].score) : baseline;
}

function phaseDeadline(overallDeadline, fraction) {
  if (!Number.isFinite(overallDeadline)) return Number.POSITIVE_INFINITY;
  const now = performance.now();
  return now + Math.max(1, overallDeadline - now) * fraction;
}

export function championLineScore(node, perspectiveId, options = {}) {
  const projected = node.engine.clone();
  if (projected.state.status !== 'active') return evaluatePublicPosition(projected, perspectiveId, options);
  const knownCardIds = knownOwnCardIds(projected, perspectiveId);
  const endTurn = projected.getLegalActions(perspectiveId).find((action) => action.type === 'end-turn');
  if (!endTurn) return node.score;
  projected.applyAction(endTurn);
  if (projected.state.status !== 'active') return evaluatePublicPosition(projected, perspectiveId, options);

  const overallDeadline = options.overallDeadline ?? options.deadline ?? Number.POSITIVE_INFINITY;
  const opponentId = projected.state.currentPlayerId;
  const hiddenReplyRisk = estimateHiddenOpportunity(projected, perspectiveId);
  const responses = searchPublicResponseSequences(projected, opponentId, perspectiveId, {
    ...options,
    deadline: phaseDeadline(overallDeadline, .48),
  });
  let worstReply = Number.POSITIVE_INFINITY;
  for (const response of responses) {
    if (performance.now() >= overallDeadline && Number.isFinite(worstReply)) break;
    const score = championContinuationScore(response.engine, perspectiveId, knownCardIds, {
      ...options,
      deadline: overallDeadline,
    });
    worstReply = Math.min(worstReply, score);
  }
  if (!Number.isFinite(worstReply)) worstReply = evaluatePublicPosition(projected, perspectiveId, options);
  const futureWeight = options.futureWeight ?? .45;
  return worstReply * futureWeight
    + node.score * (1 - futureWeight)
    - hiddenReplyRisk * (options.hiddenReplyWeight ?? .45)
    + node.actions.length * .15;
}
