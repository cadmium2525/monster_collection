import { BattleEngine } from '../battle/BattleEngine.js';
import { representativeMonster } from '../battle/deck.js';
import { RULES } from '../battle/rules.js';
import { CardStealSession } from '../reward/CardStealSession.js';
import { TournamentRun } from '../tournament/TournamentRun.js';

const DIAMOND_REWARDS = Object.freeze({
  bronze: Object.freeze({ win: 50, champion: 100 }),
  silver: Object.freeze({ win: 60, champion: 110 }),
  gold: Object.freeze({ win: 70, champion: 120 }),
  legend: Object.freeze({ win: 80, champion: 180 }),
});

export class GameSession {
  static restore({ masterData, masterIndex, deckCollection, repository, user, champion = null, checkpoint }) {
    if (!checkpoint || checkpoint.schemaVersion !== 1 || !['tournament', 'battle', 'reward'].includes(checkpoint.phase)) {
      throw new Error('再開データの形式が不正です');
    }
    const session = new GameSession({
      masterData,
      masterIndex,
      deckCollection,
      repository,
      user,
      champion,
      seed: checkpoint.seed,
    });
    session.runId = checkpoint.runId;
    session.checkpointRevision = Math.max(0, Number(checkpoint.revision) || 0);
    session.checkpointClock = Math.max(0, Number(checkpoint.updatedAtMs) || 0);
    session.checkpointPhase = checkpoint.phase;
    session.checkpointRuntime = structuredClone(checkpoint.runtime ?? {});
    session.tournament = TournamentRun.fromCheckpoint({ masterData, checkpoint: checkpoint.tournament });
    session.activeBattle = checkpoint.activeBattle
      ? BattleEngine.fromCheckpoint({ masterData, checkpoint: checkpoint.activeBattle })
      : null;
    session.pendingReward = checkpoint.pendingReward
      ? CardStealSession.fromCheckpoint({ masterIndex, checkpoint: checkpoint.pendingReward })
      : null;
    session.pendingRewardOpponent = structuredClone(checkpoint.pendingRewardOpponent ?? null);
    if (checkpoint.phase === 'battle' && !session.activeBattle) throw new Error('再開する試合データがありません');
    if (checkpoint.phase === 'reward' && !session.pendingReward) throw new Error('再開するカード奪取データがありません');
    return session;
  }

  constructor({ masterData, masterIndex, deckCollection, repository, user, champion = null, seed = 'game-session' }) {
    this.masterData = masterData;
    this.masterIndex = masterIndex;
    this.deckCollection = deckCollection;
    this.repository = repository;
    this.user = user;
    this.champion = champion;
    this.seed = seed;
    this.tournament = null;
    this.activeBattle = null;
    this.pendingReward = null;
    this.pendingRewardOpponent = null;
    this.runId = globalThis.crypto?.randomUUID?.() ?? `${String(seed)}:${Date.now().toString(36)}`;
    this.checkpointRevision = 0;
    this.checkpointClock = 0;
    this.checkpointPhase = null;
    this.checkpointRuntime = {};
  }

  _nextCheckpointTime() {
    this.checkpointClock = Math.max(Date.now(), this.checkpointClock + 1);
    return this.checkpointClock;
  }

  createCheckpoint(phase, runtime = {}) {
    if (!this.tournament) throw new Error('保存する大会がありません');
    this.checkpointRevision += 1;
    this.checkpointPhase = phase;
    this.checkpointRuntime = structuredClone(runtime ?? {});
    return {
      schemaVersion: 1,
      runId: this.runId,
      revision: this.checkpointRevision,
      updatedAtMs: this._nextCheckpointTime(),
      seed: this.seed,
      phase,
      runtime: structuredClone(this.checkpointRuntime),
      tournament: this.tournament.toCheckpoint(),
      activeBattle: phase === 'battle' && this.activeBattle ? this.activeBattle.toCheckpoint() : null,
      pendingReward: phase === 'reward' && this.pendingReward ? this.pendingReward.toCheckpoint() : null,
      pendingRewardOpponent: phase === 'reward' ? structuredClone(this.pendingRewardOpponent) : null,
    };
  }

  async saveCheckpoint(phase = this.checkpointPhase, runtime = this.checkpointRuntime) {
    if (!phase || !this.repository.saveActiveRun) return null;
    return this.repository.saveActiveRun(this.createCheckpoint(phase, runtime));
  }

  async clearCheckpoint() {
    this.checkpointRevision += 1;
    this.checkpointClock = this._nextCheckpointTime();
    this.checkpointPhase = null;
    if (!this.repository.clearActiveRun) return null;
    return this.repository.clearActiveRun({
      schemaVersion: 1,
      runId: this.runId,
      revision: this.checkpointRevision,
      updatedAtMs: this.checkpointClock,
      phase: 'cleared',
    });
  }

  flushCheckpoint() {
    if (!this.checkpointPhase) return null;
    return this.saveCheckpoint(this.checkpointPhase, this.checkpointRuntime);
  }

  async startTournament(deckId, rank) {
    const deck = this.deckCollection.recordTournamentEntry(deckId, rank);
    await this.repository.saveDeck(deck);
    const legendDecks = rank === 'legend' && this.repository.listLegendDecks
      ? await this.repository.listLegendDecks(60)
      : [];
    this.tournament = new TournamentRun({
      masterData: this.masterData,
      rank,
      seed: `${this.seed}:${deckId}:${rank}`,
      champion: this.champion,
      legendDecks,
      playerDeck: { ...deck, ownerDisplayName: this.user.displayName },
    });
    await this.saveCheckpoint('tournament');
    return this.tournament;
  }

  createCurrentBattle() {
    if (!this.tournament || this.tournament.state.status !== 'active') throw new Error('開始可能な大会がありません');
    if (this.activeBattle?.state.status === 'active') throw new Error('試合は既に進行中です');
    this.tournament.captureLegendFinalSnapshot();
    const opponent = this.tournament.getCurrentOpponent();
    const round = this.tournament.state.roundIndex + 1;
    this.activeBattle = new BattleEngine({
      masterData: this.masterData,
      seed: `${this.tournament.state.seed}:battle:${round}`,
      players: [
        {
          id: 'player', displayName: this.user.displayName, deckId: this.tournament.state.playerDeck.deckId,
          cards: this.tournament.state.playerDeck.cards, tournamentGrowth: this.tournament.state.tournamentGrowth,
        },
        {
          id: opponent.id, displayName: opponent.displayName, deckId: opponent.id,
          cards: opponent.cards, tournamentGrowth: opponent.tournamentGrowth,
        },
      ],
    });
    void this.saveCheckpoint('battle');
    return this.activeBattle;
  }

  async completeBattle(engine = this.activeBattle) {
    if (!engine || engine.state.status !== 'finished') throw new Error('終了済みの試合がありません');
    this.tournament.captureLegendFinalSnapshot();
    const opponent = this.tournament.getCurrentOpponent();
    const discoveredFusionIds = [...new Set((engine.state.log ?? [])
      .filter((event) => event.type === 'fusion-special' && event.playerId === 'player' && event.fusionId)
      .map((event) => event.fusionId))];
    if (discoveredFusionIds.length) {
      await this.repository.recordCardCatalog?.({ discoveredFusionIds });
    }
    this.tournament.updateGrowth(RULES.tournamentGrowthLifetime === 'tournament' ? engine.getGrowthSnapshot('player') : {});
    const won = engine.state.winnerId === 'player';
    const draw = engine.state.winnerId == null;
    const tournamentResult = this.tournament.recordPlayerResult({ won, draw });
    this.activeBattle = null;

    if (!won) {
      const saved = this.deckCollection.get(this.tournament.state.playerDeck.deckId);
      await this.repository.saveDeck(saved);
      await this.clearCheckpoint();
      return { type: 'tournament-end', won: false, draw, tournamentResult, savedDeck: saved };
    }

    const round = Math.max(1, this.tournament.state.roundIndex);
    const rewardConfig = DIAMOND_REWARDS[this.tournament.state.rank];
    if (rewardConfig?.win && this.repository.creditDiamonds) {
      await this.repository.creditDiamonds({
        operationId: `diamond:${this.runId}:match:${round}`,
        amount: rewardConfig.win,
        reason: `${this.tournament.state.rank}:match-win`,
      });
    }

    this.pendingReward = new CardStealSession({
      playerCards: this.tournament.state.playerDeck.cards,
      defeatedCards: opponent.cards,
      masterIndex: this.masterIndex,
      deckId: this.tournament.state.playerDeck.deckId,
      seed: `${this.tournament.state.seed}:reward:${this.tournament.state.wins}`,
    });
    this.pendingRewardOpponent = opponent;
    await this.saveCheckpoint('reward');
    return { type: 'reward', opponent, reward: this.pendingReward, tournamentResult };
  }

  async completeReward(resultCards) {
    if (!this.pendingReward || !['committed', 'skipped', 'cancelled'].includes(this.pendingReward.state.status)) {
      throw new Error('確定済みの報酬処理がありません');
    }
    const deckId = this.tournament.state.playerDeck.deckId;
    this.tournament.updatePlayerDeck(resultCards);
    let saved = this.deckCollection.replaceTournamentCards(deckId, resultCards, {
      releasedInstanceIds: this.pendingReward.state.selectedReleaseIds,
    });
    const completedTournament = ['won', 'champion'].includes(this.tournament.state.status);
    const previousQualification = this.deckCollection.getPlayerQualification();
    if (completedTournament) saved = this.deckCollection.grantTournamentWin(deckId, this.tournament.state.rank);
    const playerQualification = this.deckCollection.getPlayerQualification();
    if (completedTournament && playerQualification !== previousQualification && this.repository.unlockTournamentRank) {
      await this.repository.unlockTournamentRank(playerQualification);
    }
    await this.repository.saveDeck(saved);

    const rewardConfig = DIAMOND_REWARDS[this.tournament.state.rank];
    if (completedTournament && rewardConfig?.champion && this.repository.creditDiamonds) {
      await this.repository.creditDiamonds({
        operationId: `diamond:${this.runId}:champion`,
        amount: rewardConfig.champion,
        reason: `${this.tournament.state.rank}:champion`,
      });
    }

    let crowned = null;
    let checkpointCleared = false;
    if (this.tournament.state.status === 'champion') {
      try {
        const finalSnapshot = this.tournament.getLegendFinalSnapshot();
        if (!finalSnapshot?.cards?.length || !finalSnapshot?.tournamentGrowth) {
          throw new Error('王座へ保存する決勝開始時スナップショットがありません');
        }
        const expectedVersion = this.tournament.state.championVersionAtStart;
        const alreadyCrowned = this.champion?.championUserId === this.user.id
          && this.champion?.championDeckId === saved.deckId
          && this.champion?.championVersion === expectedVersion + 1;
        crowned = alreadyCrowned ? this.champion : await this.repository.claimChampionship({
          expectedVersion,
          championDisplayName: this.user.displayName,
          championDeckId: saved.deckId,
          championDeckName: saved.deckName,
          championDeckSnapshot: finalSnapshot.cards,
          championGrowthSnapshot: finalSnapshot.tournamentGrowth,
          championSnapshotVersion: 2,
          representativeMonsterId: finalSnapshot.cards.some((card) => card.masterId === saved.representativeMonsterId)
            ? saved.representativeMonsterId
            : representativeMonster(finalSnapshot.cards, this.masterIndex)?.id
            ?? null,
        });
        this.champion = crowned;
      } finally {
        this.pendingReward = null;
        this.pendingRewardOpponent = null;
        await this.clearCheckpoint();
        checkpointCleared = true;
      }
    }
    this.pendingReward = null;
    this.pendingRewardOpponent = null;
    if (completedTournament) {
      if (!checkpointCleared) await this.clearCheckpoint();
    } else await this.saveCheckpoint('tournament');
    return {
      type: completedTournament ? 'tournament-end' : 'advanced',
      tournamentStatus: this.tournament.state.status,
      savedDeck: saved,
      crowned,
      playerQualification,
    };
  }
}

export { DIAMOND_REWARDS };
