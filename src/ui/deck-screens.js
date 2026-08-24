import { TOURNAMENT_LABELS } from '../battle/rules.js';
import { el, formatDate, replace } from './dom.js';
import { openCardDetails, renderCard } from './card-renderer.js';

function deckSummaryCard(deck, masterIndex, onSelect) {
  const representative = masterIndex.monsters.get(deck.representativeMonsterId);
  return el('article', {
    className: 'deck-summary-card',
    attrs: { role: 'button', tabindex: '0', 'aria-label': `${deck.deckName}を開く` },
    onclick: () => onSelect(deck),
    onkeydown: (event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(deck); },
  }, [
    el('div', { className: 'deck-representative' }, representative ? renderCard({ definition: representative, label: `${deck.deckName}の代表モンスター`, interactive: false }) : null),
    el('div', { className: 'deck-summary-copy' }, [
      el('h2', { text: deck.deckName }),
      el('p', { text: representative?.name ?? 'モンスターなし' }),
      el('dl', {}, [
        el('dt', { text: '総プレイTP' }), el('dd', { text: deck.totalPlayTp }),
        el('dt', { text: '最高到達' }), el('dd', { text: TOURNAMENT_LABELS[deck.highestReached] }),
        el('dt', { text: '出場資格' }), el('dd', { text: `${TOURNAMENT_LABELS[deck.qualification]}まで` }),
      ]),
      el('small', { text: `更新 ${formatDate(deck.updatedAt)}` }),
    ]),
  ]);
}

export class DeckListScreen {
  constructor({ root, collection, masterIndex, onSelect, onCreate, onBack }) {
    this.root = root;
    this.collection = collection;
    this.masterIndex = masterIndex;
    this.onSelect = onSelect;
    this.onCreate = onCreate;
    this.onBack = onBack;
    this.render();
  }

  render() {
    const decks = this.collection.list();
    replace(this.root, el('main', { className: 'deck-list-screen' }, [
      el('header', { className: 'screen-header' }, [
        el('div', {}, [el('p', { className: 'eyebrow', text: 'SAVED 40-CARD DECKS' }), el('h1', { text: '保存デッキ' })]),
        el('div', { className: 'header-actions' }, [
          this.onBack ? el('button', { className: 'text-button', text: '戻る', onclick: this.onBack }) : null,
          el('button', { className: 'primary-button', text: `新規作成 ${decks.length}/5`, disabled: decks.length >= 5, onclick: this.onCreate }),
        ]),
      ]),
      el('section', { className: 'deck-summary-grid' }, decks.length
        ? decks.map((deck) => deckSummaryCard(deck, this.masterIndex, this.onSelect))
        : el('div', { className: 'empty-state' }, [el('h2', { text: '保存デッキがありません' }), el('p', { text: '最初の40枚デッキを作成してください。' })])),
    ]));
  }
}

export class DeckDetailScreen {
  constructor({ root, collection, masterIndex, deckId, onBack, onUse, onDelete, onChanged }) {
    this.root = root;
    this.collection = collection;
    this.masterIndex = masterIndex;
    this.deckId = deckId;
    this.onBack = onBack;
    this.onUse = onUse;
    this.onDelete = onDelete;
    this.onChanged = onChanged;
    this.render();
  }

  rename(input) {
    try {
      const deck = this.collection.rename(this.deckId, input.value);
      this.onChanged?.(deck);
      this.error = '';
    }
    catch (error) { this.error = error.message; }
    this.render();
  }

  render() {
    const deck = this.collection.get(this.deckId);
    replace(this.root, el('main', { className: 'deck-detail-screen' }, [
      el('header', { className: 'screen-header deck-detail-header' }, [
        el('div', {}, [el('p', { className: 'eyebrow', text: '40-CARD DECK' }), el('h1', { text: deck.deckName })]),
        el('div', { className: 'deck-stats-inline' }, [
          el('span', { text: `40枚` }), el('span', { text: `総TP ${deck.totalPlayTp}` }), el('span', { text: `${TOURNAMENT_LABELS[deck.qualification]}まで` }),
        ]),
        el('div', { className: 'header-actions' }, [
          el('button', { className: 'text-button', text: '一覧へ', onclick: this.onBack }),
          this.onUse ? el('button', { className: 'primary-button', text: 'このデッキを使う', onclick: () => this.onUse(deck) }) : null,
        ]),
      ]),
      el('section', { className: 'deck-editor-bar' }, [
        el('label', {}, [el('span', { text: 'デッキ名' }), el('input', { value: deck.deckName, attrs: { maxlength: '30', 'aria-label': 'デッキ名' } })]),
        el('button', { className: 'text-button', text: '名前を保存', onclick: (event) => this.rename(event.currentTarget.previousElementSibling.querySelector('input')) }),
        this.error ? el('span', { className: 'invalid-copy', text: this.error }) : null,
        this.onDelete ? el('button', { className: 'text-button danger-button deck-delete', text: '削除', onclick: () => this.onDelete(deck) }) : null,
      ]),
      el('section', { className: 'deck-card-grid', attrs: { 'aria-label': `${deck.deckName}の40枚` } }, deck.cards.map((card) => {
        const definition = this.masterIndex.cards.get(card.masterId);
        return renderCard({ definition, onClick: () => openCardDetails({ definition, masterIndex: this.masterIndex }) });
      })),
    ]));
  }
}
