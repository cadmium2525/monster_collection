import { actionKey, effectiveDef, livingUnits } from '../battle/state.js';

function responseValue(engine, defenderId, initial) {
  const defender = engine.player(defenderId);
  const remaining = new Set(livingUnits(defender).map((unit) => unit.sourceCardInstanceId));
  const destroyedSourceCardInstanceIds = initial.units
    .filter((instanceId) => !remaining.has(instanceId));
  const boardDamage = livingUnits(defender).reduce((sum, unit) => {
    const before = initial.durability.get(unit.sourceCardInstanceId) ?? 0;
    return sum + Math.max(0, before - Math.max(0, unit.life) - effectiveDef(unit) * 0.35);
  }, 0);
  const lethal = engine.state.status === 'finished'
    && engine.state.winnerId != null
    && engine.state.winnerId !== defenderId;
  const playerDamage = Math.max(0, initial.life - Math.max(0, defender.life));
  return {
    lethal,
    playerDamage,
    destroyedSourceCardInstanceIds,
    score: (lethal ? 1_000_000 : 0)
      + playerDamage * 1_000
      + destroyedSourceCardInstanceIds.length * 100
      + boardDamage,
  };
}

function responseStateKey(engine, defenderId) {
  const playerState = (player) => ({
    life: player.life,
    tp: player.tp,
    board: player.board.map((unit) => unit ? {
      id: unit.id,
      life: unit.life,
      actionPoints: unit.actionPoints,
      statuses: unit.statuses,
    } : null),
  });
  return JSON.stringify({
    status: engine.state.status,
    winnerId: engine.state.winnerId,
    defender: playerState(engine.player(defenderId)),
    attacker: playerState(engine.opponent(defenderId)),
  });
}

function uniqueBest(nodes, defenderId, initial, limit) {
  const seen = new Set();
  return nodes
    .map((node) => ({ ...node, outcome: responseValue(node.engine, defenderId, initial) }))
    .sort((a, b) => b.outcome.score - a.outcome.score
      || a.actions.map(actionKey).join('|').localeCompare(b.actions.map(actionKey).join('|')))
    .filter((node) => {
      const key = responseStateKey(node.engine, defenderId);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

/**
 * Forecasts the strongest attack-only reply visible on the current board.
 * It deliberately ignores the opponent's hidden hand and newly drawn card.
 */
export function forecastVisibleAttackReply(engine, defenderId, options = {}) {
  const projected = engine.clone();
  if (options.action) projected.applyAction(options.action);
  if (projected.state.status === 'active' && projected.state.currentPlayerId === defenderId) {
    const endTurn = projected.getLegalActions(defenderId).find((action) => action.type === 'end-turn');
    if (endTurn) projected.applyAction(endTurn);
  }

  const defender = projected.player(defenderId);
  const initial = {
    life: defender.life,
    units: livingUnits(defender).map((unit) => unit.sourceCardInstanceId),
    durability: new Map(livingUnits(defender).map((unit) => [
      unit.sourceCardInstanceId,
      Math.max(0, unit.life) + effectiveDef(unit) * 0.35,
    ])),
  };
  if (projected.state.status !== 'active') {
    return { ...responseValue(projected, defenderId, initial), actions: [] };
  }

  const attackerId = projected.state.currentPlayerId;
  const visibleActions = livingUnits(projected.player(attackerId))
    .reduce((sum, unit) => sum + Math.max(0, unit.actionPoints), 0);
  const actionBudget = Math.min(4, visibleActions + 1);
  const beamWidth = Math.max(4, options.beamWidth ?? 6);
  let beam = [{ engine: projected, actions: [] }];
  let completed = [...beam];

  for (let depth = 0; depth < actionBudget; depth += 1) {
    const expanded = [];
    for (const node of beam) {
      if (node.engine.state.status !== 'active' || node.engine.state.currentPlayerId !== attackerId) continue;
      const attacks = node.engine.getLegalActions(attackerId).filter((action) => (
        action.type === 'move' && node.engine.masterIndex.moves.get(action.moveId)?.power != null
      ));
      for (const action of attacks) {
        const next = node.engine.clone();
        next.applyAction(action);
        expanded.push({ engine: next, actions: [...node.actions, action] });
      }
    }
    if (!expanded.length) break;
    beam = uniqueBest(expanded, defenderId, initial, beamWidth);
    completed.push(...beam);
  }

  const best = uniqueBest(completed, defenderId, initial, 1)[0];
  return { ...best.outcome, actions: best.actions };
}
