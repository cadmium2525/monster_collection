import { TOURNAMENT_LABELS } from '../battle/rules.js';
import { el, formatDate, replace } from './dom.js';
import { openCardDetails, renderCard } from './card-renderer.js';
import { openModal } from './modal.js';
import { validateDeck } from '../battle/deck.js';
import { assetStackKey, takeUnassignedAsset } from '../gacha/economy-state.js';

export function openStarterDeckPicker({ masterIndex, options, onChoose }) {
  let modal = null;
  const content = el('div', { className: 'starter-picker' }, [
    el('p', { className: 'starter-picker-intro', text: '好きなモン類の40枚から始めます。どのデッキもブロンズカップへすぐ出場でき、作成後に名前とリーダーを変更できます。' }),
    el('div', { className: 'starter-choice-grid' }, options.map((option) => {
      const representative = masterIndex.monsters.get(option.representativeMonsterId);
      const choose = () => { modal.close(); onChoose(option); };
      return el('article', {
        className: `starter-choice starter-${option.faction}`,
        attrs: { role: 'button', tabindex: '0', 'aria-label': `${option.faction}スターター「${option.deckName}」を作成` },
        onclick: choose,
        onkeydown: (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          choose();
        },
      }, [
        el('div', { className: 'starter-choice-art' }, representative
          ? renderCard({ definition: representative, interactive: false, label: `${option.deckName}のリーダー` })
          : null),
        el('div', { className: 'starter-choice-copy' }, [
          el('small', { text: `${option.faction} STARTER` }),
          el('strong', { text: option.deckName }),
          el('p', { text: option.description }),
          el('span', { text: 'この40枚を選ぶ' }),
        ]),
      ]);
    })),
  ]);
  modal = openModal({ title: 'スターターデッキを選択', content, className: 'starter-picker-modal' });
  return modal;
}

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
      el('p', { text: representative ? `リーダー ${representative.name}` : 'モンスターなし' }),
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
  constructor({ root, collection, masterIndex, onSelect, onCreate, onBack, onCatalog = null }) {
    this.root = root;
    this.collection = collection;
    this.masterIndex = masterIndex;
    this.onSelect = onSelect;
    this.onCreate = onCreate;
    this.onBack = onBack;
    this.onCatalog = onCatalog;
    this.render();
  }

  render() {
    const decks = this.collection.list();
    replace(this.root, el('main', { className: 'deck-list-screen' }, [
      el('header', { className: 'screen-header' }, [
        el('div', {}, [el('p', { className: 'eyebrow', text: 'SAVED 40-CARD DECKS' }), el('h1', { text: '保存デッキ' })]),
        el('div', { className: 'header-actions' }, [
          this.onBack ? el('button', { className: 'text-button', text: '戻る', onclick: this.onBack }) : null,
          this.onCatalog ? el('button', { className: 'text-button catalog-open-button', text: 'カード一覧', onclick: this.onCatalog }) : null,
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
  constructor({ root, collection, masterIndex, deckId, onBack, onUse, onDelete, onChanged, onBuild = null }) {
    this.root = root;
    this.collection = collection;
    this.masterIndex = masterIndex;
    this.deckId = deckId;
    this.onBack = onBack;
    this.onUse = onUse;
    this.onDelete = onDelete;
    this.onChanged = onChanged;
    this.onBuild = onBuild;
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

  openLeaderPicker() {
    const deck = this.collection.get(this.deckId);
    const monsterIds = [...new Set(deck.cards
      .map((card) => card.masterId)
      .filter((id) => this.masterIndex.cards.get(id)?.kind === 'monster'))];
    let modal = null;
    const choices = el('div', { className: 'leader-choice-grid' }, monsterIds.map((monsterId) => {
      const definition = this.masterIndex.monsters.get(monsterId);
      return renderCard({
        definition,
        selected: monsterId === deck.representativeMonsterId,
        label: `${definition.name}をリーダーにする`,
        onClick: () => {
          try {
            const updated = this.collection.setRepresentativeMonster(this.deckId, monsterId);
            this.onChanged?.(updated);
            modal.close();
            this.render();
          } catch (error) {
            this.error = error.message;
            modal.close();
            this.render();
          }
        },
      });
    }));
    modal = openModal({
      title: 'デッキリーダーを選択',
      content: el('div', { className: 'leader-picker' }, [
        el('p', { text: 'この40枚に入っているモンスターから、デッキの顔となる1体を選びます。' }),
        choices,
      ]),
      className: 'leader-picker-modal',
    });
  }

  render() {
    const deck = this.collection.get(this.deckId);
    const leader = this.masterIndex.monsters.get(deck.representativeMonsterId);
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
        el('div', { className: 'deck-leader-edit' }, [
          el('span', { text: 'リーダー' }),
          el('strong', { text: leader?.name ?? '未設定' }),
          el('button', { className: 'text-button', text: 'リーダー変更', onclick: () => this.openLeaderPicker() }),
        ]),
        this.error ? el('span', { className: 'invalid-copy', text: this.error }) : null,
        this.onBuild ? el('button', { className: 'primary-button deck-build-button', text: `デッキ編集${deck.pool.length ? `（予備${deck.pool.length}）` : ''}`, onclick: () => this.onBuild(deck) }) : null,
        this.onDelete ? el('button', { className: 'text-button danger-button deck-delete', text: '削除', onclick: () => this.onDelete(deck) }) : null,
      ]),
      el('section', { className: 'deck-card-grid', attrs: { 'aria-label': `${deck.deckName}の40枚` } }, deck.cards.map((card) => {
        const definition = this.masterIndex.cards.get(card.masterId);
        return renderCard({ definition, cardAsset: card, onClick: () => openCardDetails({ definition, masterIndex: this.masterIndex, cardAsset: card }) });
      })),
    ]));
  }
}

export class DeckBuildScreen {
  constructor({ root, deck, economy, masterIndex, onBack, onSave }) {
    this.root = root;
    this.masterIndex = masterIndex;
    this.onBack = onBack;
    this.onSave = onSave;
    this.deck = structuredClone(deck);
    this.economy = structuredClone(economy);
    this.selectedActiveId = null;
    this.error = '';
    this.render();
  }

  selectActive(instanceId) {
    this.selectedActiveId = this.selectedActiveId === instanceId ? null : instanceId;
    this.error = '';
    this.render();
  }

  swapWithPool(instanceId) {
    const activeIndex = this.deck.cards.findIndex((card) => card.instanceId === this.selectedActiveId);
    const poolIndex = this.deck.pool.findIndex((card) => card.instanceId === instanceId);
    if (activeIndex < 0 || poolIndex < 0) return;
    const outgoing = this.deck.cards[activeIndex];
    const incoming = this.deck.pool[poolIndex];
    const nextCards = [...this.deck.cards];
    nextCards[activeIndex] = incoming;
    const validation = validateDeck(nextCards, this.masterIndex, { deckId: this.deck.deckId });
    if (!validation.valid) { this.error = validation.errors[0]; this.render(); return; }
    this.deck.cards = nextCards;
    this.deck.pool.splice(poolIndex, 1, outgoing);
    this.selectedActiveId = null;
    this.error = '';
    this.render();
  }

  swapWithUnassigned(stack) {
    const activeIndex = this.deck.cards.findIndex((card) => card.instanceId === this.selectedActiveId);
    if (activeIndex < 0) return;
    let taken;
    try { taken = takeUnassignedAsset(this.economy, assetStackKey(stack)); }
    catch (error) { this.error = error.message; this.render(); return; }
    const serial = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const incoming = {
      ...taken.asset,
      instanceId: `${this.deck.deckId}-asset-${serial}`,
      boundDeckId: this.deck.deckId,
    };
    delete incoming.quantity;
    const outgoing = this.deck.cards[activeIndex];
    const nextCards = [...this.deck.cards];
    nextCards[activeIndex] = incoming;
    const validation = validateDeck(nextCards, this.masterIndex, { deckId: this.deck.deckId });
    if (!validation.valid) { this.error = validation.errors[0]; this.render(); return; }
    this.economy = taken.state;
    this.deck.cards = nextCards;
    this.deck.pool.push(outgoing);
    this.selectedActiveId = null;
    this.error = '';
    this.render();
  }

  renderCandidate(card, source, count = null) {
    const definition = this.masterIndex.cards.get(card.masterId);
    const action = source === 'pool' ? () => this.swapWithPool(card.instanceId) : () => this.swapWithUnassigned(card);
    return el('article', { className: `builder-candidate${this.selectedActiveId ? ' ready' : ''}` }, [
      renderCard({ definition, cardAsset: card, disabled: !this.selectedActiveId, onClick: action }),
      count != null ? el('strong', { text: `×${count}` }) : null,
      el('small', { text: source === 'pool' ? 'このデッキの予備' : '未所属資産' }),
    ]);
  }

  render() {
    replace(this.root, el('main', { className: 'deck-builder-screen' }, [
      el('header', { className: 'screen-header deck-builder-header' }, [
        el('div', {}, [
          el('p', { className: 'eyebrow', text: 'DECK-BOUND CARD POOL' }),
          el('h1', { text: `${this.deck.deckName}を編集` }),
          el('p', { text: '40枚から1枚選び、デッキ予備または未所属カードと交換します。採用した未所属カードはこのデッキ専用になります。' }),
        ]),
        el('div', { className: 'builder-header-actions' }, [
          el('button', { className: 'text-button', text: '変更を破棄', onclick: this.onBack }),
          el('button', { className: 'primary-button', text: '40枚を保存', onclick: () => this.onSave(this.deck, this.economy) }),
        ]),
      ]),
      this.error ? el('p', { className: 'invalid-copy builder-error', text: this.error }) : null,
      el('section', { className: 'deck-builder-workspace' }, [
        el('section', { className: 'builder-active' }, [
          el('div', { className: 'section-title' }, [el('h2', { text: '使用中の40枚' }), el('span', { text: this.selectedActiveId ? '交換先を選択' : '外すカードを選択' })]),
          el('div', { className: 'builder-card-grid' }, this.deck.cards.map((card) => {
            const definition = this.masterIndex.cards.get(card.masterId);
            return renderCard({ definition, cardAsset: card, selected: card.instanceId === this.selectedActiveId, onClick: () => this.selectActive(card.instanceId) });
          })),
        ]),
        el('section', { className: 'builder-reserve' }, [
          el('div', { className: 'section-title' }, [el('h2', { text: '入替候補' }), el('span', { text: `予備${this.deck.pool.length} / 未所属${this.economy.unassignedAssets.reduce((sum, stack) => sum + stack.quantity, 0)}` })]),
          el('div', { className: 'builder-candidate-grid' }, [
            ...this.deck.pool.map((card) => this.renderCandidate(card, 'pool')),
            ...this.economy.unassignedAssets.map((stack) => this.renderCandidate(stack, 'unassigned', stack.quantity)),
          ]),
        ]),
      ]),
    ]));
  }
}
