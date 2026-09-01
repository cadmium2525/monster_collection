import { BattleEngine } from '../battle/BattleEngine.js';
import { normalStealVariant } from '../gacha/acquisition.js';
import { canonicalCardRarity } from '../cards/card-rarity.js';
import { SeededRng } from '../core/rng.js';

function clone(value) { return value == null ? value : structuredClone(value); }

function arenaLootOffers(cards, seed) {
  const rng = new SeededRng(seed);
  const unique = new Map();
  for (const card of cards ?? []) {
    if ((card.artVariantId ?? 'base') !== 'base' || (card.finish ?? 'normal') !== 'normal') continue;
    if (!unique.has(card.masterId)) unique.set(card.masterId, card);
  }
  return rng.shuffle([...unique.values()]).slice(0, 3).map((card, index) => ({
    offerId: `arena-offer-${index + 1}`,
    ...normalStealVariant(card),
    rarity: canonicalCardRarity({ masterId: card.masterId, artVariantId: 'base' }),
  }));
}

export class ArenaSession {
  static restore({ masterData, repository, user, checkpoint }) {
    if (!checkpoint || checkpoint.schemaVersion !== 1 || !['arena-battle', 'arena-result'].includes(checkpoint.phase) || !checkpoint.arena) {
      throw new Error('アリーナ再開データの形式が不正です');
    }
    const session = Object.create(ArenaSession.prototype);
    session.masterData = masterData;
    session.repository = repository;
    session.user = user;
    session.seed = checkpoint.seed;
    session.runId = checkpoint.runId;
    session.playerDeck = clone(checkpoint.arena.playerDeck);
    session.opponent = clone(checkpoint.arena.opponent);
    session.result = clone(checkpoint.arena.result ?? null);
    session.activeBattle = checkpoint.activeBattle
      ? BattleEngine.fromCheckpoint({ masterData, checkpoint: checkpoint.activeBattle })
      : null;
    session.checkpointRevision = Math.max(0, Number(checkpoint.revision) || 0);
    session.checkpointClock = Math.max(0, Number(checkpoint.updatedAtMs) || 0);
    session.checkpointPhase = checkpoint.phase;
    session.checkpointRuntime = clone(checkpoint.runtime ?? {});
    if (checkpoint.phase === 'arena-battle' && !session.activeBattle) throw new Error('再開するアリーナ試合がありません');
    if (checkpoint.phase === 'arena-result' && !session.result) throw new Error('再開するアリーナ結果がありません');
    return session;
  }

  constructor({ masterData, repository, user, playerDeck, opponent, seed = 'arena-session' }) {
    this.masterData = masterData;
    this.repository = repository;
    this.user = user;
    this.playerDeck = clone(playerDeck);
    this.opponent = clone(opponent);
    this.seed = String(seed);
    this.runId = globalThis.crypto?.randomUUID?.() ?? `${this.seed}:${Date.now().toString(36)}`;
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
    if (this.activeBattle?.state.status === 'active') return this.activeBattle;
    this.activeBattle = new BattleEngine({
      masterData: this.masterData,
      seed: `${this.seed}:battle`,
      players: [
        {
          id: 'player', displayName: this.user.displayName,
          deckId: this.playerDeck.deckId, cards: this.playerDeck.cards,
          tournamentGrowth: {},
        },
        {
          id: this.opponent.id, displayName: this.opponent.displayName,
          deckId: this.opponent.id, cards: this.opponent.cards,
          tournamentGrowth: this.opponent.tournamentGrowth ?? {},
        },
      ],
    });
    void this.saveCheckpoint('arena-battle');
    return this.activeBattle;
  }

  completeBattle(engine = this.activeBattle) {
    if (!engine || engine.state.status !== 'finished') throw new Error('終了済みのアリーナ試合がありません');
    const won = engine.state.winnerId === 'player';
    const draw = engine.state.winnerId == null;
    this.result = {
      won,
      draw,
      opponent: clone(this.opponent),
      lootOffers: won ? arenaLootOffers(this.opponent.cards, `${this.seed}:loot`) : [],
      discoveredFusionIds: [...new Set((engine.state.log ?? [])
        .filter((event) => event.type === 'fusion-special' && event.playerId === 'player' && event.fusionId)
        .map((event) => event.fusionId))],
    };
    this.activeBattle = null;
    return clone(this.result);
  }

  createCheckpoint(phase, runtime = {}) {
    this.checkpointRevision += 1;
    this.checkpointPhase = phase;
    this.checkpointRuntime = clone(runtime ?? {});
    return {
      schemaVersion: 1,
      runId: this.runId,
      revision: this.checkpointRevision,
      updatedAtMs: this._nextCheckpointTime(),
      seed: this.seed,
      phase,
      runtime: clone(this.checkpointRuntime),
      arena: { playerDeck: clone(this.playerDeck), opponent: clone(this.opponent), result: clone(this.result) },
      activeBattle: phase === 'arena-battle' && this.activeBattle ? this.activeBattle.toCheckpoint() : null,
    };
  }

  saveCheckpoint(phase = this.checkpointPhase, runtime = this.checkpointRuntime) {
    if (!phase || !this.repository.saveActiveRun) return null;
    return this.repository.saveActiveRun(this.createCheckpoint(phase, runtime));
  }

  flushCheckpoint() {
    if (!this.checkpointPhase) return null;
    return this.saveCheckpoint(this.checkpointPhase, this.checkpointRuntime);
  }

  clearCheckpoint() {
    this.checkpointRevision += 1;
    this.checkpointClock = this._nextCheckpointTime();
    this.checkpointPhase = null;
    return this.repository.clearActiveRun?.({
      schemaVersion: 1, runId: this.runId, revision: this.checkpointRevision,
      updatedAtMs: this.checkpointClock, phase: 'cleared',
    });
  }
}
