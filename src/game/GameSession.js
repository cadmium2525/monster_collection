import { BattleEngine } from '../battle/BattleEngine.js';
import { representativeMonster } from '../battle/deck.js';
import { RULES } from '../battle/rules.js';
import { CardStealSession } from '../reward/CardStealSession.js';
import { TournamentRun } from '../tournament/TournamentRun.js';

export class GameSession {
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
    return this.tournament;
  }

  createCurrentBattle() {
    if (!this.tournament || this.tournament.state.status !== 'active') throw new Error('開始可能な大会がありません');
    if (this.activeBattle?.state.status === 'active') throw new Error('試合は既に進行中です');
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
        { id: opponent.id, displayName: opponent.displayName, deckId: opponent.id, cards: opponent.cards },
      ],
    });
    return this.activeBattle;
  }

  async completeBattle(engine = this.activeBattle) {
    if (!engine || engine.state.status !== 'finished') throw new Error('終了済みの試合がありません');
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
      return { type: 'tournament-end', won: false, draw, tournamentResult, savedDeck: saved };
    }

    this.pendingReward = new CardStealSession({
      playerCards: this.tournament.state.playerDeck.cards,
      defeatedCards: opponent.cards,
      masterIndex: this.masterIndex,
      deckId: this.tournament.state.playerDeck.deckId,
      seed: `${this.tournament.state.seed}:reward:${this.tournament.state.wins}`,
    });
    return { type: 'reward', opponent, reward: this.pendingReward, tournamentResult };
  }

  async completeReward(resultCards) {
    if (!this.pendingReward || !['committed', 'skipped', 'cancelled'].includes(this.pendingReward.state.status)) {
      throw new Error('確定済みの報酬処理がありません');
    }
    const deckId = this.tournament.state.playerDeck.deckId;
    this.tournament.updatePlayerDeck(resultCards);
    let saved = this.deckCollection.replaceCards(deckId, resultCards);
    const completedTournament = ['won', 'champion'].includes(this.tournament.state.status);
    if (completedTournament) saved = this.deckCollection.grantTournamentWin(deckId, this.tournament.state.rank);
    await this.repository.saveDeck(saved);

    let crowned = null;
    if (this.tournament.state.status === 'champion') {
      try {
        crowned = await this.repository.claimChampionship({
          expectedVersion: this.tournament.state.championVersionAtStart,
          championDisplayName: this.user.displayName,
          championDeckId: saved.deckId,
          championDeckName: saved.deckName,
          championDeckSnapshot: saved.cards,
          representativeMonsterId: saved.representativeMonsterId
            ?? representativeMonster(saved.cards, this.masterIndex)?.id
            ?? null,
        });
        this.champion = crowned;
      } finally {
        this.pendingReward = null;
      }
    }
    this.pendingReward = null;
    return {
      type: completedTournament ? 'tournament-end' : 'advanced',
      tournamentStatus: this.tournament.state.status,
      savedDeck: saved,
      crowned,
    };
  }
}
