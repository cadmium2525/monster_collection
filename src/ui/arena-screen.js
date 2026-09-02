import { ARENA_RANK_REWARDS, ARENA_RANK_THRESHOLDS, ARENA_RANKS, unclaimedArenaRankRewards } from '../arena/arena-state.js';
import { el, replace } from './dom.js';
import { renderCard } from './card-renderer.js';
import { representativeCardAsset } from './representative-card.js';

function nextRank(arena) {
  const index = ARENA_RANKS.indexOf(arena.rank);
  return index >= 0 && index < ARENA_RANKS.length - 1 ? ARENA_RANKS[index + 1] : null;
}

function sourceClass(sourceType) { return String(sourceType ?? '').toLowerCase().replaceAll('_', '-'); }

export class ArenaScreen {
  constructor({ root, collection, masterIndex, arena, match = null, onBack, onFindMatch, onStartMatch, onRegisterDefense, onClaimRankReward, onMissions }) {
    this.root = root;
    this.collection = collection;
    this.masterIndex = masterIndex;
    this.arena = arena;
    this.match = match;
    this.onBack = onBack;
    this.onFindMatch = onFindMatch;
    this.onStartMatch = onStartMatch;
    this.onRegisterDefense = onRegisterDefense;
    this.onClaimRankReward = onClaimRankReward;
    this.onMissions = onMissions;
    const matchedDeckId = match?.deckId && collection.get(match.deckId) ? match.deckId : null;
    const defenseDeckId = arena.defenseDeckId && collection.get(arena.defenseDeckId) ? arena.defenseDeckId : null;
    this.selectedDeckId = matchedDeckId ?? defenseDeckId ?? collection.list()[0]?.deckId ?? null;
    this.render();
  }

  renderDecks() {
    return el('div', { className: 'arena-deck-list' }, this.collection.list().map((deck) => {
      const leader = this.masterIndex.monsters.get(deck.representativeMonsterId);
      const asset = representativeCardAsset(deck.cards, deck.representativeMonsterId);
      return el('button', {
        className: `arena-deck-choice${deck.deckId === this.selectedDeckId ? ' selected' : ''}`,
        onclick: () => { this.selectedDeckId = deck.deckId; this.render(); },
      }, [
        leader ? renderCard({ definition: leader, cardAsset: asset, interactive: false, label: leader.name }) : null,
        el('span', {}, [el('strong', { text: deck.deckName }), el('small', { text: `デッキ総TP ${deck.totalPlayTp}` })]),
        deck.deckId === this.arena.defenseDeckId ? el('b', { text: '防衛登録中' }) : null,
      ]);
    }));
  }

  renderOpponentChoice(deck, opponent) {
    const representativeId = opponent.cards.find((card) => this.masterIndex.cards.get(card.masterId)?.kind === 'monster')?.masterId;
    const representative = this.masterIndex.monsters.get(representativeId);
    return el('article', { className: `arena-opponent-choice tier-${opponent.matchmakingTier}` }, [
      el('header', {}, [
        el('strong', { text: opponent.matchmakingLabel }),
        el('span', { text: opponent.matchmakingDescription }),
      ]),
      el('div', { className: `arena-source-label ${sourceClass(opponent.sourceType)}`, text: opponent.sourceLabel }),
      el('div', { className: 'arena-opponent-profile' }, [
          representative ? renderCard({ definition: representative, cardAsset: opponent.cards.find((card) => card.masterId === representativeId), interactive: false, label: representative.name }) : null,
          el('div', {}, [el('strong', { text: opponent.displayName }), el('span', { text: opponent.deckName }), el('small', { text: `RATING ${opponent.rating}` })]),
      ]),
      el('button', { className: 'primary-button', text: 'この相手と対戦', onclick: () => this.onStartMatch?.(deck, opponent) }),
    ]);
  }

  renderMatchChoices(deck) {
    return el('section', { className: 'arena-match-choices' }, [
      el('div', { className: 'section-title' }, [el('span', { className: 'step-number', text: '2' }), el('div', {}, [el('h2', { text: '対戦相手を選択' }), el('p', { text: `${deck.deckName}で挑戦します。相手の強さを選んでください。` })])]),
      el('div', { className: 'arena-opponent-choice-list' }, this.match.opponents.map((opponent) => this.renderOpponentChoice(deck, opponent))),
      el('div', { className: 'arena-choice-footer' }, [el('p', { text: '対戦相手のデッキはCPUが公平に操作します。' }), el('button', { className: 'text-button', text: '候補を更新', onclick: () => this.onFindMatch?.(deck) })]),
    ]);
  }

  render() {
    const deck = this.selectedDeckId ? this.collection.get(this.selectedDeckId) : null;
    const next = nextRank(this.arena);
    const floor = ARENA_RANK_THRESHOLDS[this.arena.rank];
    const ceiling = next ? ARENA_RANK_THRESHOLDS[next] : floor + 1;
    const progress = next ? Math.max(0, Math.min(100, (this.arena.rating - floor) / (ceiling - floor) * 100)) : 100;
    const claimableRanks = unclaimedArenaRankRewards(this.arena);
    replace(this.root, el('main', { className: 'arena-screen' }, [
      el('header', { className: 'screen-header arena-header' }, [
        el('div', {}, [el('p', { className: 'eyebrow', text: 'RATING ARENA' }), el('h1', { text: 'アリーナ' })]),
        el('div', { className: 'arena-header-actions' }, [
          el('button', { className: 'text-button', text: 'ミッション', onclick: this.onMissions }),
          el('button', { className: 'text-button', text: 'ホームへ', onclick: this.onBack }),
        ]),
      ]),
      el('section', { className: 'arena-rank-panel' }, [
        el('div', { className: `arena-rank-emblem rank-${this.arena.rank.toLowerCase()}` }, [el('small', { text: 'RANK' }), el('strong', { text: this.arena.rank })]),
        el('div', { className: 'arena-rating-copy' }, [
          el('span', {}, [el('small', { text: 'ARENA RATING' }), el('strong', { text: String(this.arena.rating) })]),
          el('div', { className: 'arena-rating-track' }, el('i', { style: `width:${progress}%` })),
          el('small', { text: next ? `${next}まで ${Math.max(0, ceiling - this.arena.rating)}` : 'MASTERランキング帯' }),
        ]),
        el('div', { className: 'arena-record' }, [
          el('span', {}, [el('small', { text: 'WIN' }), el('b', { text: String(this.arena.wins) })]),
          el('span', {}, [el('small', { text: 'LOSE' }), el('b', { text: String(this.arena.losses) })]),
          el('span', {}, [el('small', { text: 'BEST STREAK' }), el('b', { text: String(this.arena.bestWinStreak) })]),
        ]),
      ]),
      claimableRanks.length ? el('section', { className: 'arena-rank-rewards' }, claimableRanks.map((rank) => {
        const reward = ARENA_RANK_REWARDS[rank];
        return el('article', {}, [
          el('span', {}, [el('strong', { text: reward.label }), el('small', { text: `ダイヤ ${reward.diamonds.toLocaleString('ja-JP')}${reward.packs ? `・パック券 ${reward.packs}` : ''}` })]),
          el('button', { className: 'primary-button', text: '受け取る', onclick: () => this.onClaimRankReward?.(rank) }),
        ]);
      })) : null,
      this.match ? this.renderMatchChoices(deck) : el('section', { className: 'arena-main-grid' }, [
        el('section', { className: 'arena-entry-panel' }, [
          el('div', { className: 'section-title' }, [el('span', { className: 'step-number', text: '1' }), el('div', {}, [el('h2', { text: '使用するデッキ' }), el('p', { text: '1回の参加につき1試合。試合中だけ編集できません。' })])]),
          this.renderDecks(),
          el('div', { className: 'arena-entry-actions' }, [
            el('button', { className: 'text-button', text: deck?.deckId === this.arena.defenseDeckId ? '防衛登録を更新' : '防衛デッキに登録', disabled: !deck, onclick: () => this.onRegisterDefense?.(deck) }),
            el('button', { className: 'primary-button', text: '対戦相手を探す', disabled: !deck, onclick: () => this.onFindMatch?.(deck) }),
          ]),
        ]),
        el('section', { className: 'arena-opponent-guide' }, [
          el('div', { className: 'section-title' }, [el('span', { className: 'step-number', text: '2' }), el('div', {}, [el('h2', { text: '対戦相手' }), el('p', { text: '現在のレートと直近の対戦履歴から即時選出します。' })])]),
          el('article', {}, [el('b', { text: 'PLAYER' }), el('span', { text: '他プレイヤーの防衛デッキ' })]),
          el('article', {}, [el('b', { text: 'OFFICIAL AI' }), el('span', { text: '6分類×6ランク、全36種' })]),
          el('article', { className: this.arena.rank === 'MASTER' ? 'is-open' : '' }, [el('b', { text: 'LEGEND ARCHIVE' }), el('span', { text: this.arena.rank === 'MASTER' ? '歴代チャンピオンが出現' : 'MASTERで解禁' })]),
        ]),
      ]),
    ]));
  }
}

export class ArenaResultScreen {
  constructor({ root, masterIndex, result, arenaBefore, arenaAfter, onFinish }) {
    this.root = root;
    this.masterIndex = masterIndex;
    this.result = result;
    this.arenaBefore = arenaBefore;
    this.arenaAfter = arenaAfter;
    this.onFinish = onFinish;
    this.selectedOfferId = null;
    this.render();
  }

  render() {
    const delta = this.arenaAfter.rating - this.arenaBefore.rating;
    replace(this.root, el('main', { className: `arena-result-screen ${this.result.won ? 'is-win' : 'is-loss'}` }, [
      el('section', { className: 'arena-result-panel' }, [
        el('p', { className: 'eyebrow', text: 'ARENA RESULT' }),
        el('h1', { text: this.result.won ? 'VICTORY' : this.result.draw ? 'DRAW' : 'DEFEAT' }),
        el('div', { className: 'arena-result-rating' }, [
          el('span', { text: `${this.arenaBefore.rating} → ${this.arenaAfter.rating}` }),
          el('b', { text: `${delta >= 0 ? '+' : ''}${delta}` }),
          el('strong', { text: `RANK ${this.arenaAfter.rank}` }),
        ]),
        this.result.won ? el('section', { className: 'arena-loot-offers' }, [
          el('h2', { text: '戦利品ストックへ保管' }),
          el('p', { text: '候補から1枚を選択してください。週3勝達成後、ストックから1枚を正式獲得できます。' }),
          el('div', {}, this.result.lootOffers.map((offer) => {
            const definition = this.masterIndex.cards.get(offer.masterId);
            return el('button', {
              className: `arena-loot-offer${offer.offerId === this.selectedOfferId ? ' selected' : ''}`,
              onclick: () => { this.selectedOfferId = offer.offerId; this.render(); },
            }, [definition ? renderCard({ definition, cardAsset: offer, interactive: false, label: definition.name }) : null, el('span', { text: definition?.name ?? offer.masterId })]);
          })),
        ]) : el('p', { text: '次の1試合で取り返しましょう。連戦する必要はありません。' }),
        el('div', { className: 'modal-actions' }, [
          this.result.won ? el('button', { className: 'text-button', text: '今回は保管しない', onclick: () => this.onFinish?.(null) }) : null,
          el('button', { className: 'primary-button', text: this.result.won ? '選んだカードを保管' : 'アリーナへ', disabled: this.result.won && !this.selectedOfferId, onclick: () => this.onFinish?.(this.result.lootOffers.find((offer) => offer.offerId === this.selectedOfferId) ?? null) }),
        ]),
      ]),
    ]));
  }
}
