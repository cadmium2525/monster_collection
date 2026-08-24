import { SeededRng } from '../core/rng.js';
import { createBaselineDeck } from '../data/default-decks.js';
import { createMasterIndex } from '../data/master-loader.js';
import { generateCpuDeck } from './deck-generator.js';
import { generateCpuNames } from './cpu-names.js';

export const ROUND_LABELS = Object.freeze(['1回戦', '2回戦', '準決勝', '決勝']);
export const NEXT_RANK = Object.freeze({ bronze: 'silver', silver: 'gold', gold: 'legend', legend: null });
export const RANK_AI = Object.freeze({ bronze: 'bronze', silver: 'silver', gold: 'gold', legend: 'legend' });

function clone(value) { return structuredClone(value); }

function fallbackChampion(masterData) {
  return {
    id: 'champion-npc',
    type: 'champion',
    displayName: '初代王者 アルカナ',
    deckName: '王座の原型',
    cards: createBaselineDeck(masterData, 'champion-npc'),
    championVersion: 0,
    representativeMonsterId: 'monster-004',
  };
}

export class TournamentRun {
  constructor({ masterData, rank, playerDeck, seed = 'tournament', champion = null }) {
    this.masterData = masterData;
    this.masterIndex = createMasterIndex(masterData);
    this.rng = new SeededRng(seed);
    this.state = {
      version: 1,
      seed: String(seed),
      rank,
      status: 'active',
      roundIndex: 0,
      playerDeck: clone(playerDeck),
      tournamentGrowth: {},
      entrants: {},
      rounds: [],
      wins: 0,
      championVersionAtStart: champion?.championVersion ?? 0,
      result: null,
    };
    this._createEntrants(champion ?? fallbackChampion(masterData));
    this._buildInitialRound();
  }

  _createEntrants(champion) {
    const names = generateCpuNames(15, this.rng.fork('names'));
    const player = {
      id: 'player',
      type: 'player',
      displayName: this.state.playerDeck.ownerDisplayName ?? 'あなた',
      deckName: this.state.playerDeck.deckName,
      cards: clone(this.state.playerDeck.cards),
      qualityScore: Number.POSITIVE_INFINITY,
    };
    this.state.entrants[player.id] = player;
    const cpuCount = this.state.rank === 'legend' ? 14 : 15;
    for (let index = 0; index < cpuCount; index += 1) {
      const deck = generateCpuDeck({
        masterIndex: this.masterIndex,
        rank: this.state.rank,
        rng: this.rng.fork(`entrant:${index + 1}`),
        seedLabel: `entrant-${index + 1}`,
      });
      const id = `cpu-${String(index + 1).padStart(2, '0')}`;
      this.state.entrants[id] = {
        id,
        type: 'cpu',
        displayName: names[index],
        deckName: `${deck.theme}型`,
        cards: deck.cards,
        theme: deck.theme,
        qualityScore: deck.qualityScore,
        generatorStats: deck.analysis,
      };
    }
    if (this.state.rank === 'legend') {
      this.state.entrants.champion = {
        ...clone(champion),
        id: 'champion',
        type: 'champion',
        cards: clone(champion.cards ?? champion.championDeckSnapshot ?? createBaselineDeck(this.masterData, 'champion-fallback')),
        qualityScore: Number.MAX_SAFE_INTEGER,
      };
    }
  }

  _buildInitialRound() {
    const ids = Object.keys(this.state.entrants).filter((id) => id !== 'player' && id !== 'champion');
    let ordered;
    if (this.state.rank === 'legend') ordered = ['player', ...this.rng.shuffle(ids), 'champion'];
    else {
      ordered = this.rng.shuffle(['player', ...ids]);
    }
    this._buildRound(ordered, 0);
  }

  _buildRound(entrantIds, roundIndex) {
    const matches = [];
    for (let index = 0; index < entrantIds.length; index += 2) {
      matches.push({
        id: `round-${roundIndex + 1}-match-${index / 2 + 1}`,
        roundIndex,
        entrants: [entrantIds[index], entrantIds[index + 1]],
        winnerId: null,
        status: 'pending',
      });
    }
    this.state.rounds[roundIndex] = matches;
    this.state.roundIndex = roundIndex;
    this._resolveCpuMatches(false);
  }

  _cpuWinner(match) {
    const entrants = match.entrants.map((id) => this.state.entrants[id]);
    const champion = entrants.find((entrant) => entrant.type === 'champion');
    if (champion) return champion.id;
    const [a, b] = entrants;
    const scale = 18;
    const chanceA = 1 / (1 + Math.exp((b.qualityScore - a.qualityScore) / scale));
    return this.rng.next() < chanceA ? a.id : b.id;
  }

  _resolveCpuMatches(includePlayerMatch) {
    for (const match of this.state.rounds[this.state.roundIndex]) {
      if (match.status !== 'pending') continue;
      if (!includePlayerMatch && match.entrants.includes('player')) continue;
      match.winnerId = this._cpuWinner(match);
      match.status = 'resolved';
    }
  }

  getCurrentMatch() {
    return clone(this.state.rounds[this.state.roundIndex].find((match) => match.entrants.includes('player') && match.status === 'pending') ?? null);
  }

  getCurrentOpponent() {
    const match = this.getCurrentMatch();
    if (!match) return null;
    return clone(this.state.entrants[match.entrants.find((id) => id !== 'player')]);
  }

  getCurrentAiLevel() {
    if (this.state.rank === 'legend' && this.state.roundIndex === 3) return 'champion';
    return RANK_AI[this.state.rank];
  }

  updatePlayerDeck(cards) {
    this.state.playerDeck.cards = clone(cards);
    this.state.entrants.player.cards = clone(cards);
  }

  updateGrowth(growth) {
    this.state.tournamentGrowth = clone(growth);
  }

  recordPlayerResult({ won, draw = false }) {
    if (this.state.status !== 'active') throw new Error('Tournament is not active');
    const match = this.state.rounds[this.state.roundIndex].find((candidate) => candidate.entrants.includes('player'));
    if (!match || match.status !== 'pending') throw new Error('No pending player match');
    const opponentId = match.entrants.find((id) => id !== 'player');
    match.winnerId = won ? 'player' : opponentId;
    match.status = 'resolved';
    match.playerResult = draw ? 'draw-loss' : won ? 'win' : 'loss';

    if (!won) {
      this.state.status = 'eliminated';
      this.state.result = { status: 'eliminated', roundIndex: this.state.roundIndex, opponentId, draw };
      return clone(this.state.result);
    }

    this.state.wins += 1;
    this._resolveCpuMatches(false);
    if (this.state.roundIndex === 3) {
      this.state.status = this.state.rank === 'legend' ? 'champion' : 'won';
      this.state.result = {
        status: this.state.status,
        wins: 4,
        nextRank: NEXT_RANK[this.state.rank],
        defeatedChampionVersion: this.state.rank === 'legend' ? this.state.championVersionAtStart : null,
      };
      return clone(this.state.result);
    }

    const winners = this.state.rounds[this.state.roundIndex].map((candidate) => candidate.winnerId);
    if (winners.some((id) => !id)) throw new Error('Round contains unresolved CPU match');
    this._buildRound(winners, this.state.roundIndex + 1);
    return { status: 'advanced', roundIndex: this.state.roundIndex };
  }

  getBracket() {
    return clone({ entrants: this.state.entrants, rounds: this.state.rounds, roundIndex: this.state.roundIndex, status: this.state.status });
  }

  toJSON() { return clone(this.state); }
}
