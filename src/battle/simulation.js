import { SeededRng } from '../core/rng.js';
import { automaticMulliganIds } from './mulligan.js';

const TYPE_PRIORITY = Object.freeze({
  'resolve-shugyo-move': 8,
  move: 7,
  'fusion-special': 6,
  'fusion-normal': 5,
  summon: 4,
  breeder: 3,
  training: 2,
  shugyo: 2,
  'end-turn': 0,
});

export function defaultSimulationPolicy(engine, playerId, rng) {
  const actions = engine.getLegalActions(playerId);
  if (!actions.length) throw new Error('Active player has no legal action');
  const scored = actions.map((action) => ({
    action,
    score: (TYPE_PRIORITY[action.type] ?? 1) * 100 - (action.cost ?? 0) + rng.next(),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0].action;
}

export function runAutomatedBattle(engine, options = {}) {
  const rng = new SeededRng(options.seed ?? `${engine.state.seed}:simulation`);
  const chooseAction = options.chooseAction ?? defaultSimulationPolicy;
  const maxActions = options.maxActions ?? 5000;
  if (engine.state.mulligan?.status === 'selecting') {
    for (const playerId of engine.state.playerOrder) {
      if (engine.state.mulligan.submitted[playerId]) continue;
      engine.submitMulligan(playerId, automaticMulliganIds(engine.player(playerId), engine.masterIndex));
    }
  }
  let actions = 0;
  while (engine.state.status === 'active' && actions < maxActions) {
    const playerId = engine.state.currentPlayerId;
    const action = chooseAction(engine, playerId, rng);
    engine.applyAction(action);
    actions += 1;
  }
  if (engine.state.status !== 'finished') throw new Error(`Automated battle exceeded ${maxActions} actions`);
  return { result: engine.state.result, actions, state: engine.getState() };
}
