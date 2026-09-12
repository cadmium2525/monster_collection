import { automaticMulliganIds } from '../battle/mulligan.js';
import { SeededRng } from '../core/rng.js';

const MAX_TOTAL_ACTIONS = 1600;
const MAX_ACTIONS_PER_TURN = 80;

function clone(value) { return value == null ? value : structuredClone(value); }

function lifeSnapshot(engine, label = '') {
  const opponentId = engine.state.playerOrder.find((id) => id !== 'player');
  return {
    round: engine.state.round,
    playerLife: Math.max(0, Number(engine.player('player').life) || 0),
    opponentLife: Math.max(0, Number(engine.player(opponentId).life) || 0),
    label,
  };
}

function frameLabel(logs, engine) {
  const event = [...logs].reverse().find((entry) => !['draw', 'turn-start'].includes(entry.type));
  if (event?.message) return event.message;
  return `${engine.player(engine.state.currentPlayerId).displayName}が行動中`;
}

function sameLife(left, right) {
  return left.playerLife === right.playerLife && left.opponentLife === right.opponentLife;
}

/**
 * Resolve an Arena auto battle through the same public legal-action API used by
 * the interactive battle. The compact transcript is sufficient to reproduce
 * the exact match later without running either AI again.
 */
export async function runArenaAutoBattle({
  engine,
  chooseAction,
  yieldEvery = 8,
  onProgress = null,
} = {}) {
  if (!engine || typeof chooseAction !== 'function') throw new Error('オートバトルの実行条件が不足しています');
  const mulligans = {};
  if (engine.state.mulligan?.status === 'selecting') {
    for (const playerId of engine.state.playerOrder) {
      if (engine.state.mulligan.submitted[playerId]) continue;
      const selected = automaticMulliganIds(engine.player(playerId), engine.masterIndex);
      mulligans[playerId] = [...selected];
      engine.submitMulligan(playerId, selected);
    }
  }

  const rngByPlayer = Object.fromEntries(engine.state.playerOrder.map((playerId) => [
    playerId,
    new SeededRng(`${engine.state.seed}:arena-auto:${playerId}`),
  ]));
  const actions = [];
  const timeline = [lifeSnapshot(engine, 'BATTLE START')];
  let currentPlayerId = engine.state.currentPlayerId;
  let actionsThisTurn = 0;

  while (engine.state.status === 'active' && actions.length < MAX_TOTAL_ACTIONS) {
    const playerId = engine.state.currentPlayerId;
    if (playerId !== currentPlayerId) {
      currentPlayerId = playerId;
      actionsThisTurn = 0;
    }
    if (actionsThisTurn >= MAX_ACTIONS_PER_TURN) throw new Error('オートAIの1ターン行動数が安全上限を超えました');
    const beforeLogLength = engine.state.log.length;
    const beforeLife = lifeSnapshot(engine);
    const action = await chooseAction(engine, playerId, rngByPlayer[playerId]);
    if (!action) throw new Error('オートAIが合法手を選択できませんでした');
    engine.applyAction(action);
    actions.push(clone(action));
    actionsThisTurn += 1;

    const afterLife = lifeSnapshot(engine, frameLabel(engine.state.log.slice(beforeLogLength), engine));
    if (!sameLife(beforeLife, afterLife) || engine.state.status === 'finished') timeline.push(afterLife);
    if (onProgress && (actions.length === 1 || actions.length % Math.max(1, yieldEvery) === 0)) {
      await onProgress({ actions: actions.length, round: engine.state.round, life: clone(afterLife) });
    }
  }
  if (engine.state.status !== 'finished') throw new Error('オートバトルが安全上限内に終了しませんでした');

  return {
    engine,
    timeline,
    replay: {
      schemaVersion: 1,
      mulligans,
      actions,
    },
  };
}

export function applyArenaReplay(engine, replay) {
  if (!engine || replay?.schemaVersion !== 1 || !Array.isArray(replay.actions)) throw new Error('リプレイデータの形式が不正です');
  if (engine.state.mulligan?.status === 'selecting') {
    for (const playerId of engine.state.playerOrder) {
      engine.submitMulligan(playerId, replay.mulligans?.[playerId] ?? []);
    }
  }
  for (const action of replay.actions) engine.applyAction(clone(action));
  return engine;
}
