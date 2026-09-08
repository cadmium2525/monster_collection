import { assertLegalDeck } from '../battle/deck.js';
import { RULES } from '../battle/rules.js';
import { createMasterIndex } from '../data/master-loader.js';
import { normalizeTournamentGrowthSnapshot } from '../tournament/growth-snapshot.js';
import { generateSurvivalOpponent } from './SurvivalCpuGenerator.js';

function clone(value) { return value == null ? value : structuredClone(value); }
function clampedLife(value) { return Math.max(1, Math.min(RULES.playerLife, Math.trunc(Number(value) || 1))); }

export class SurvivalRun {
  static fromCheckpoint({ masterData, checkpoint }) {
    if (!masterData || checkpoint?.schemaVersion !== 1 || !checkpoint.state?.playerDeck?.cards) {
      throw new Error('サバイバルランの再開データが不正です');
    }
    const run = Object.create(SurvivalRun.prototype);
    run.masterData = masterData;
    run.masterIndex = createMasterIndex(masterData);
    run.state = clone(checkpoint.state);
    assertLegalDeck(run.state.playerDeck.cards, run.masterIndex, { deckId: run.state.playerDeck.deckId });
    run.state.carryOverGrowth = normalizeTournamentGrowthSnapshot(
      run.state.playerDeck.cards,
      run.state.carryOverGrowth,
      run.masterIndex,
    );
    run.state.carriedPlayerLife = clampedLife(run.state.carriedPlayerLife);
    return run;
  }

  constructor({ masterData, playerDeck, seed = 'survival' }) {
    this.masterData = masterData;
    this.masterIndex = createMasterIndex(masterData);
    const cards = assertLegalDeck(playerDeck?.cards, this.masterIndex, { deckId: playerDeck?.deckId ?? 'survival' });
    this.state = {
      schemaVersion: 1,
      seed: String(seed),
      status: 'active',
      currentStreak: 0,
      playerDeck: { ...clone(playerDeck), cards: clone(cards) },
      carryOverGrowth: {},
      carriedPlayerLife: RULES.playerLife,
      currentOpponent: null,
      lastBattle: null,
      endedReason: null,
    };
    this._prepareOpponent();
  }

  _prepareOpponent() {
    this.state.currentOpponent = generateSurvivalOpponent({
      masterData: this.masterData,
      masterIndex: this.masterIndex,
      seed: this.state.seed,
      currentStreak: this.state.currentStreak,
    });
  }

  getCurrentOpponent() {
    if (this.state.status !== 'active') return null;
    if (!this.state.currentOpponent) this._prepareOpponent();
    return clone(this.state.currentOpponent);
  }

  getCurrentAiLevel() {
    return this.state.currentOpponent?.aiLevel ?? 'legend';
  }

  recordWin({ growth, remainingPlayerLife }) {
    if (this.state.status !== 'active') throw new Error('終了したサバイバルランです');
    const defeated = clone(this.state.currentOpponent);
    this.state.currentStreak += 1;
    this.state.carryOverGrowth = normalizeTournamentGrowthSnapshot(
      this.state.playerDeck.cards,
      growth,
      this.masterIndex,
    );
    const recovered = this.state.currentStreak % 5 === 0;
    this.state.carriedPlayerLife = recovered ? RULES.playerLife : clampedLife(remainingPlayerLife);
    this.state.lastBattle = {
      result: 'win',
      battleNumber: this.state.currentStreak,
      opponentId: defeated?.id ?? null,
      remainingPlayerLife: clampedLife(remainingPlayerLife),
      recovered,
    };
    this._prepareOpponent();
    return clone(this.state.lastBattle);
  }

  finish({ reason = 'defeat', draw = false } = {}) {
    if (this.state.status === 'ended') return clone(this.state.lastBattle);
    this.state.status = 'ended';
    this.state.endedReason = String(reason);
    this.state.lastBattle = {
      ...(this.state.lastBattle ?? {}),
      result: draw ? 'draw' : reason === 'retired' ? 'retired' : 'loss',
      streak: this.state.currentStreak,
    };
    this.state.currentOpponent = null;
    return clone(this.state.lastBattle);
  }

  toJSON() { return clone(this.state); }
  toCheckpoint() { return { schemaVersion: 1, state: clone(this.state) }; }
}
