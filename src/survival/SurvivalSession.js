import { BattleEngine } from '../battle/BattleEngine.js';
import { RULES } from '../battle/rules.js';
import { SurvivalRun } from './SurvivalRun.js';
import { isSurvivalCheckpoint } from './SurvivalCheckpoint.js';

function clone(value) { return value == null ? value : structuredClone(value); }

export class SurvivalSession {
  static restore({ masterData, repository, user, checkpoint }) {
    if (!isSurvivalCheckpoint(checkpoint) || checkpoint.schemaVersion !== 1) {
      throw new Error('サバイバル再開データの形式が不正です');
    }
    const session = Object.create(SurvivalSession.prototype);
    session.masterData = masterData;
    session.repository = repository;
    session.user = user;
    session.seed = checkpoint.seed;
    session.runId = checkpoint.runId;
    session.run = SurvivalRun.fromCheckpoint({ masterData, checkpoint: checkpoint.survival });
    session.activeBattle = checkpoint.activeBattle
      ? BattleEngine.fromCheckpoint({ masterData, checkpoint: checkpoint.activeBattle })
      : null;
    session.result = clone(checkpoint.result ?? null);
    session.checkpointRevision = Math.max(0, Number(checkpoint.revision) || 0);
    session.checkpointClock = Math.max(0, Number(checkpoint.updatedAtMs) || 0);
    session.checkpointPhase = checkpoint.phase;
    session.checkpointRuntime = clone(checkpoint.runtime ?? {});
    if (checkpoint.phase === 'survival-battle' && !session.activeBattle) throw new Error('再開するサバイバル試合がありません');
    return session;
  }

  constructor({ masterData, repository, user, playerDeck, seed = 'survival-session' }) {
    this.masterData = masterData;
    this.repository = repository;
    this.user = user;
    this.seed = String(seed);
    this.runId = globalThis.crypto?.randomUUID?.() ?? `${this.seed}:${Date.now().toString(36)}`;
    this.run = new SurvivalRun({ masterData, playerDeck, seed: `${this.seed}:run` });
    this.activeBattle = null;
    this.result = null;
    this.checkpointRevision = 0;
    this.checkpointClock = 0;
    this.checkpointPhase = null;
    this.checkpointRuntime = {};
  }

  _nextCheckpointTime() {
    this.checkpointClock = Math.max(Date.now(), this.checkpointClock + 1);
    return this.checkpointClock;
  }

  createBattle() {
    if (this.run.state.status !== 'active') throw new Error('終了したサバイバルランです');
    if (this.activeBattle?.state.status === 'active') return this.activeBattle;
    const opponent = this.run.getCurrentOpponent();
    this.activeBattle = new BattleEngine({
      masterData: this.masterData,
      seed: `${this.run.state.seed}:battle:${this.run.state.currentStreak + 1}`,
      players: [
        {
          id: 'player', displayName: this.user.displayName,
          deckId: this.run.state.playerDeck.deckId, cards: this.run.state.playerDeck.cards,
          tournamentGrowth: this.run.state.carryOverGrowth,
        },
        {
          id: opponent.id, displayName: opponent.displayName,
          deckId: opponent.id, cards: opponent.cards,
          tournamentGrowth: opponent.tournamentGrowth,
        },
      ],
    });
    this.activeBattle.player('player').life = Math.max(1, Math.min(RULES.playerLife, this.run.state.carriedPlayerLife));
    void this.saveCheckpoint('survival-battle');
    return this.activeBattle;
  }

  completeBattle(engine = this.activeBattle) {
    if (!engine || engine.state.status !== 'finished') throw new Error('終了済みのサバイバル試合がありません');
    const won = engine.state.winnerId === 'player';
    const draw = engine.state.winnerId == null;
    const opponent = this.run.getCurrentOpponent();
    const discoveredFusionIds = [...new Set((engine.state.log ?? [])
      .filter((event) => event.type === 'fusion-special' && event.playerId === 'player' && event.fusionId)
      .map((event) => event.fusionId))];
    if (won) {
      const milestone = this.run.recordWin({
        growth: engine.getGrowthSnapshot('player'),
        remainingPlayerLife: engine.player('player').life,
      });
      this.result = { won: true, draw: false, opponent, milestone, discoveredFusionIds };
      this.activeBattle = null;
      return clone(this.result);
    }
    this.run.finish({ reason: 'defeat', draw });
    this.result = { won: false, draw, opponent, streak: this.run.state.currentStreak, discoveredFusionIds };
    this.activeBattle = null;
    return clone(this.result);
  }

  retire() {
    if (this.run.state.status !== 'active') return clone(this.result);
    this.run.finish({ reason: 'retired' });
    this.result = { won: false, draw: false, retired: true, streak: this.run.state.currentStreak, discoveredFusionIds: [] };
    this.activeBattle = null;
    return clone(this.result);
  }

  createCheckpoint(phase, runtime = {}) {
    this.checkpointRevision += 1;
    this.checkpointPhase = phase;
    this.checkpointRuntime = clone(runtime ?? {});
    return {
      schemaVersion: 1,
      mode: 'survival',
      runId: this.runId,
      revision: this.checkpointRevision,
      updatedAtMs: this._nextCheckpointTime(),
      seed: this.seed,
      phase,
      runtime: clone(this.checkpointRuntime),
      survival: this.run.toCheckpoint(),
      activeBattle: phase === 'survival-battle' && this.activeBattle ? this.activeBattle.toCheckpoint() : null,
      result: clone(this.result),
    };
  }

  saveCheckpoint(phase = this.checkpointPhase, runtime = this.checkpointRuntime) {
    if (!phase || !this.repository.saveActiveRun) return null;
    return this.repository.saveActiveRun(this.createCheckpoint(phase, runtime), 'survival');
  }

  async flushCheckpoint() {
    if (!this.checkpointPhase) return null;
    const result = await this.saveCheckpoint(this.checkpointPhase, this.checkpointRuntime);
    await this.repository.flushActiveRunSync?.('survival');
    return result;
  }

  clearCheckpoint() {
    this.checkpointRevision += 1;
    this.checkpointClock = this._nextCheckpointTime();
    this.checkpointPhase = null;
    return this.repository.clearActiveRun?.({
      schemaVersion: 1, mode: 'survival', runId: this.runId, revision: this.checkpointRevision,
      updatedAtMs: this.checkpointClock, phase: 'cleared',
    }, 'survival');
  }
}
