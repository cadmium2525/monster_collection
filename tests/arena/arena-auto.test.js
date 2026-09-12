import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BattleEngine } from '../../src/battle/BattleEngine.js';
import { applyArenaReplay, runArenaAutoBattle } from '../../src/arena/auto-battle.js';
import { ArenaSession } from '../../src/arena/ArenaSession.js';
import { legalDeck, masterData } from '../helpers.js';

function battle(seed) {
  return new BattleEngine({
    masterData,
    seed,
    players: [
      { id: 'player', displayName: '自分', deckId: 'auto-player', cards: legalDeck('auto-player') },
      { id: 'rival', displayName: '相手', deckId: 'auto-rival', cards: legalDeck('auto-rival') },
    ],
  });
}

function simplePolicy(engine, playerId) {
  const actions = engine.getLegalActions(playerId);
  return actions.find((action) => action.type === 'move')
    ?? actions.find((action) => action.type === 'summon')
    ?? actions.find((action) => action.type === 'training')
    ?? actions.find((action) => action.type === 'end-turn')
    ?? actions[0];
}

test('Arena auto battle is deterministic and its legal-action transcript replays the exact result', async () => {
  const first = await runArenaAutoBattle({ engine: battle('arena-auto-proof'), chooseAction: simplePolicy, yieldEvery: 5000 });
  const second = await runArenaAutoBattle({ engine: battle('arena-auto-proof'), chooseAction: simplePolicy, yieldEvery: 5000 });
  assert.equal(first.engine.state.status, 'finished');
  assert.ok(first.replay.actions.length > 0);
  assert.deepEqual(first.replay, second.replay);
  assert.deepEqual(first.timeline, second.timeline);

  const replayed = applyArenaReplay(battle('arena-auto-proof'), first.replay);
  assert.equal(replayed.state.status, 'finished');
  assert.deepEqual(replayed.state.result, first.engine.state.result);
  assert.deepEqual(
    Object.fromEntries(replayed.state.playerOrder.map((id) => [id, replayed.player(id).life])),
    Object.fromEntries(first.engine.state.playerOrder.map((id) => [id, first.engine.player(id).life])),
  );
});

test('Arena UI offers manual or auto control, compact LIFE presentation and a full battle replay', () => {
  const arena = fs.readFileSync(new URL('../../src/ui/arena-screen.js', import.meta.url), 'utf8');
  const auto = fs.readFileSync(new URL('../../src/ui/arena-auto-battle-screen.js', import.meta.url), 'utf8');
  const battleUi = fs.readFileSync(new URL('../../src/ui/battle-screen.js', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(arena, /自分で操作/);
  assert.match(arena, /オートバトル/);
  assert.match(arena, /同じランクのAI/);
  assert.match(arena, /試合内容を見る/);
  assert.match(auto, /arena-auto-life-track/);
  assert.match(auto, /playerDeck\.representativeMonsterId/);
  assert.match(auto, /opponent\.representativeMonsterId/);
  assert.match(app, /showArenaAutoBattle/);
  assert.match(app, /showArenaReplay/);
  assert.match(battleUi, /replayActions/);
  assert.match(battleUi, /リプレイ終了/);
  assert.match(css, /\.arena-auto-stage/);
});

test('Arena checkpoint preserves auto mode and replay without committing a second result', async () => {
  const playerDeck = {
    deckId: 'saved-auto', deckName: '周回用', representativeMonsterId: 'monster-001', cards: legalDeck('session-player'),
  };
  const opponent = {
    id: 'auto-opponent', displayName: '公式AI', deckName: '基準', representativeMonsterId: 'monster-002',
    cards: legalDeck('session-rival'), rating: 1000, aiLevel: 'bronze', sourceType: 'OFFICIAL_AI',
  };
  const session = new ArenaSession({
    masterData, repository: {}, user: { displayName: '自分' }, playerDeck, opponent, battleMode: 'auto', seed: 'arena-session-auto',
  });
  const outcome = await runArenaAutoBattle({ engine: session.createBattle(), chooseAction: simplePolicy, yieldEvery: 5000 });
  session.autoReplay = outcome.replay;
  const result = session.completeBattle(outcome.engine);
  assert.equal(result.battleMode, 'auto');
  assert.ok(result.replay.actions.length);

  const checkpoint = session.createCheckpoint('arena-result');
  const restored = ArenaSession.restore({ masterData, repository: {}, user: { displayName: '自分' }, checkpoint });
  assert.equal(restored.battleMode, 'auto');
  const replayed = applyArenaReplay(restored.createReplayBattle(), restored.result.replay);
  assert.deepEqual(replayed.state.result, outcome.engine.state.result);
});
