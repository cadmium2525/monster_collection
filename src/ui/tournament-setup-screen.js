import { TOURNAMENTS, TOURNAMENT_LABELS } from '../battle/rules.js';
import { el, replace } from './dom.js';
import { renderCard } from './card-renderer.js';

export class TournamentSetupScreen {
  constructor({ root, collection, masterIndex, onBack, onStart }) {
    this.root = root;
    this.collection = collection;
    this.masterIndex = masterIndex;
    this.onBack = onBack;
    this.onStart = onStart;
    this.selectedDeckId = collection.list()[0]?.deckId ?? null;
    this.selectedRank = 'bronze';
    this.render();
  }

  render() {
    const decks = this.collection.list();
    const deck = this.selectedDeckId ? this.collection.get(this.selectedDeckId) : null;
    const playerQualification = this.collection.getPlayerQualification();
    const maxRankIndex = deck ? TOURNAMENTS.indexOf(playerQualification) : -1;
    if (TOURNAMENTS.indexOf(this.selectedRank) > maxRankIndex) this.selectedRank = playerQualification;
    replace(this.root, el('main', { className: 'tournament-setup-screen' }, [
      el('header', { className: 'screen-header' }, [
        el('div', {}, [el('p', { className: 'eyebrow', text: 'ENTRY SETUP' }), el('h1', { text: '大会エントリー' })]),
        el('button', { className: 'text-button', text: 'ホームへ', onclick: this.onBack }),
      ]),
      el('section', { className: 'setup-grid' }, [
        el('section', { className: 'setup-decks' }, [
          el('div', { className: 'section-title' }, [el('span', { className: 'step-number', text: '1' }), el('div', {}, [el('h2', { text: '使用するデッキ' }), el('p', { text: '大会の解禁は全デッキ共通。交換カードは使用デッキに保存されます。' })])]),
          el('div', { className: 'setup-deck-list' }, decks.map((entry) => {
            const representative = this.masterIndex.monsters.get(entry.representativeMonsterId);
            return el('article', {
              className: `setup-deck ${entry.deckId === this.selectedDeckId ? 'selected' : ''}`,
              attrs: { role: 'button', tabindex: '0', 'aria-label': `${entry.deckName}を選択` },
              onclick: () => { this.selectedDeckId = entry.deckId; this.render(); },
              onkeydown: (event) => { if (event.key === 'Enter' || event.key === ' ') { this.selectedDeckId = entry.deckId; this.render(); } },
            }, [
              representative ? renderCard({ definition: representative, label: `${entry.deckName}のリーダー画像`, interactive: false }) : null,
              el('div', {}, [el('strong', { text: entry.deckName }), el('span', { text: `デッキ総TP ${entry.totalPlayTp}` }), el('small', { text: `最高到達 ${TOURNAMENT_LABELS[entry.highestReached]}` })]),
            ]);
          })),
        ]),
        el('section', { className: 'setup-ranks' }, [
          el('div', { className: 'section-title' }, [el('span', { className: 'step-number', text: '2' }), el('div', {}, [el('h2', { text: '挑戦する大会' }), el('p', { text: '自分 + 15人、全4試合。' })])]),
          el('div', { className: 'rank-choice-grid' }, TOURNAMENTS.map((rank, index) => {
            const locked = index > maxRankIndex;
            return el('button', {
              className: `rank-choice rank-${rank} ${rank === this.selectedRank ? 'selected' : ''}`,
              disabled: locked,
              onclick: () => { this.selectedRank = rank; this.render(); },
            }, [
              el('span', { text: String(index + 1).padStart(2, '0') }),
              el('strong', { text: TOURNAMENT_LABELS[rank] }),
              el('small', { text: locked ? 'LOCKED' : rank === 'legend' ? '決勝: 現チャンピオン' : `${rank.toUpperCase()} AI` }),
            ]);
          })),
        ]),
      ]),
      el('footer', { className: 'setup-footer' }, [
        el('div', {}, [el('span', { className: 'eyebrow', text: 'READY' }), el('h2', { text: deck ? `${deck.deckName} × ${TOURNAMENT_LABELS[this.selectedRank]}` : 'デッキがありません' })]),
        el('button', { className: 'primary-button', text: '16人大会を開始', disabled: !deck, onclick: () => this.onStart?.(deck, this.selectedRank) }),
      ]),
    ]));
  }
}
