import { actionKey } from '../battle/state.js';
import { actionEventDelta, evaluatePublicPosition, estimateCounterThreat } from './public-evaluator.js';

const ACTION_PRIOR = Object.freeze({
  move: 38,
  'fusion-special': 22,
  'fusion-normal': 10,
  summon: 21,
  breeder: 14,
  shugyo: 12,
  training: 10,
  'end-turn': 0,
});

export function quickActionScore(engine, playerId, action, options = {}) {
  if (action.type === 'end-turn') {
    return evaluatePublicPosition(engine, playerId, options) - estimateCounterThreat(engine, playerId) * (options.counterWeight ?? 0.15);
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
  return value;
}

function topCandidateActions(engine, playerId, limit, options, deadline) {
  const shortlist = uniqueActions(engine.getLegalActions(playerId))
    .filter((action) => action.type !== 'end-turn')
    .sort((a, b) => cheapActionOrder(engine, b) - cheapActionOrder(engine, a) || actionKey(a).localeCompare(actionKey(b)))
    .slice(0, Math.max(limit, limit * 2));
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

function visibleResponseActions(engine, opponentId, limit) {
  return engine.getLegalActions(opponentId)
    .filter((action) => action.type === 'move')
    .sort((a, b) => cheapActionOrder(engine, b) - cheapActionOrder(engine, a) || actionKey(a).localeCompare(actionKey(b)))
    .slice(0, limit);
}

export function championLineScore(node, perspectiveId, options = {}) {
  const projected = node.engine.clone();
  if (projected.state.status !== 'active') return evaluatePublicPosition(projected, perspectiveId, options);
  const endTurn = projected.getLegalActions(perspectiveId).find((action) => action.type === 'end-turn');
  if (!endTurn) return node.score;
  projected.applyAction(endTurn);
  if (projected.state.status !== 'active') return evaluatePublicPosition(projected, perspectiveId, options);

  const opponentId = projected.state.currentPlayerId;
  const responses = [];
  for (const action of visibleResponseActions(projected, opponentId, Math.max(4, options.replyWidth ?? 4))) {
    if (performance.now() >= (options.deadline ?? Number.POSITIVE_INFINITY) && responses.length) break;
      const reply = projected.clone();
      reply.applyAction(action);
      responses.push({ action, reply, score: evaluatePublicPosition(reply, perspectiveId, options) });
  }
  responses.sort((a, b) => a.score - b.score);

  const worstVisibleReply = responses.length ? responses[0].score : evaluatePublicPosition(projected, perspectiveId, options);
  const counterRisk = estimateCounterThreat(node.engine, perspectiveId);
  const nextTurnReadiness = node.engine.player(perspectiveId).board.filter(Boolean)
    .reduce((sum, unit) => sum + (unit.life > 0 ? 5 + unit.equippedMoveIds.length : 0), 0);
  return worstVisibleReply - counterRisk * .42 + nextTurnReadiness;
}
