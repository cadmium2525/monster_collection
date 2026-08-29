import { TOURNAMENT_LABELS } from '../battle/rules.js';
import { el, formatDate, replace } from './dom.js';
import { openCardDetails, renderCard } from './card-renderer.js';
import { openModal } from './modal.js';
import { validateDeck } from '../battle/deck.js';
import { assetStackKey, takeUnassignedAsset } from '../gacha/economy-state.js';
import { attachLongPress } from './long-press.js';
import { DECK_CARD_SORT_OPTIONS, sortDeckCards } from './deck-card-sort.js';

function deckSortControl(value, onChange, className = '') {
  return el('label', { className: `deck-sort-control${className ? ` ${className}` : ''}` }, [
    el('span', { text: '並び順' }),
    el('select', {
      attrs: { 'aria-label': 'デッキカードの並び順', title: '表示順だけを変更します。対戦開始時のシャッフルには影響しません。' },
      onchange: (event) => onChange(event.target.value),
    }, DECK_CARD_SORT_OPTIONS.map((option) => el('option', {
      value: option.id,
      selected: option.id === value,
      text: option.label,
    }))),
  ]);
}

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

function deckSummaryCard(deck, masterIndex, onSelect, onRename, locked = false, playerQualification = 'bronze') {
  const representative = masterIndex.monsters.get(deck.representativeMonsterId);
  return el('article', {
    className: `deck-summary-card${locked ? ' tournament-locked' : ''}`,
  }, [
    el('button', {
      className: 'deck-summary-open',
      attrs: { type: 'button', 'aria-label': `${deck.deckName}を開く${locked ? '（大会参加中・編集不可）' : ''}` },
      onclick: () => onSelect(deck),
    }, [
      el('div', { className: 'deck-representative' }, representative ? renderCard({ definition: representative, label: `${deck.deckName}の代表モンスター`, interactive: false }) : null),
      el('div', { className: 'deck-summary-copy' }, [
        el('div', { className: 'deck-name-row' }, [
          el('h2', { text: deck.deckName }),
        ]),
        locked ? el('span', { className: 'deck-run-lock', text: '大会参加中・編集不可' }) : null,
        el('p', { text: representative ? `リーダー ${representative.name}` : 'モンスターなし' }),
        el('dl', {}, [
          el('dt', { text: 'デッキ総TP' }), el('dd', { text: deck.totalPlayTp }),
          el('dt', { text: '最高到達' }), el('dd', { text: TOURNAMENT_LABELS[deck.highestReached] }),
          el('dt', { text: 'プレイヤー解禁' }), el('dd', { text: `${TOURNAMENT_LABELS[playerQualification]}まで` }),
        ]),
        el('small', { text: `更新 ${formatDate(deck.updatedAt)}` }),
      ]),
    ]),
    onRename ? el('button', {
      className: 'deck-rename-button',
      text: '✎',
      disabled: locked,
      attrs: { type: 'button', 'aria-label': `${deck.deckName}の名前を変更`, title: locked ? '大会終了後に変更できます' : 'デッキ名を変更' },
      onclick: () => onRename(deck),
    }) : null,
  ]);
}

export class DeckListScreen {
  constructor({ root, collection, masterIndex, onSelect, onCreate, onBack, onCatalog = null, onInventory = null, onRename = null, lockedDeckId = null }) {
    this.root = root;
    this.collection = collection;
    this.masterIndex = masterIndex;
    this.onSelect = onSelect;
    this.onCreate = onCreate;
    this.onBack = onBack;
    this.onCatalog = onCatalog;
    this.onInventory = onInventory;
    this.onRename = onRename;
    this.lockedDeckId = lockedDeckId;
    this.render();
  }

  openRenameDialog(deck) {
    if (!this.onRename || deck.deckId === this.lockedDeckId) return;
    const input = el('input', { value: deck.deckName, attrs: { maxlength: '30', 'aria-label': '新しいデッキ名' } });
    const errorCopy = el('p', { className: 'invalid-copy deck-rename-error' });
    let modal = null;
    const save = async () => {
      const button = modal.modal.querySelector('.deck-rename-confirm');
      if (button?.disabled) return;
      if (button) button.disabled = true;
      try {
        await this.onRename(deck, input.value);
        modal.close();
        this.render();
      } catch (error) {
        errorCopy.textContent = error.message;
        if (button) button.disabled = false;
      }
    };
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      save();
    });
    modal = openModal({
      title: 'デッキ名を変更',
      className: 'deck-rename-modal',
      content: el('div', { className: 'deck-rename-editor' }, [
        el('label', {}, [el('span', { text: 'デッキ名（30文字以内）' }), input]),
        errorCopy,
        el('div', { className: 'modal-actions' }, [
          el('button', { className: 'text-button', text: 'キャンセル', onclick: () => modal.close() }),
          el('button', { className: 'primary-button deck-rename-confirm', text: '変更を保存', onclick: save }),
        ]),
      ]),
    });
    globalThis.setTimeout(() => { input.focus(); input.select(); }, 0);
  }

  render() {
    const decks = this.collection.list();
    const playerQualification = this.collection.getPlayerQualification();
    replace(this.root, el('main', { className: 'deck-list-screen' }, [
      el('header', { className: 'screen-header deck-list-header' }, [
        el('div', {}, [el('p', { className: 'eyebrow', text: 'SAVED 40-CARD DECKS' }), el('h1', { text: '保存デッキ' })]),
        el('div', { className: 'header-actions deck-list-actions' }, [
          this.onBack ? el('button', { className: 'text-button', text: '戻る', onclick: this.onBack }) : null,
          this.onCatalog ? el('button', { className: 'text-button catalog-open-button', text: 'カード図鑑', onclick: this.onCatalog }) : null,
          this.onInventory ? el('button', { className: 'text-button inventory-open-button', text: '未所属カード', onclick: this.onInventory }) : null,
          el('button', { className: 'primary-button', text: `新規作成 ${decks.length}/5`, disabled: decks.length >= 5, onclick: this.onCreate }),
        ]),
      ]),
      el('section', { className: 'deck-summary-grid' }, decks.length
        ? decks.map((deck) => deckSummaryCard(deck, this.masterIndex, this.onSelect, (entry) => this.openRenameDialog(entry), deck.deckId === this.lockedDeckId, playerQualification))
        : el('div', { className: 'empty-state' }, [el('h2', { text: '保存デッキがありません' }), el('p', { text: '最初の40枚デッキを作成してください。' })])),
    ]));
  }
}

export class DeckDetailScreen {
  constructor({ root, collection, masterIndex, deckId, onBack, onUse, onDelete, onChanged, onBuild = null, onRecover = null, catalog = null, locked = false }) {
    this.root = root;
    this.collection = collection;
    this.masterIndex = masterIndex;
    this.deckId = deckId;
    this.onBack = onBack;
    this.onUse = onUse;
    this.onDelete = onDelete;
    this.onChanged = onChanged;
    this.onBuild = onBuild;
    this.onRecover = onRecover;
    this.catalog = catalog;
    this.locked = locked;
    this.sortMode = 'kind';
    this.render();
  }

  openLegacyRecoveryPicker() {
    if (this.locked || !this.onRecover) return;
    const candidates = [...new Set(this.catalog?.ownedCardMasterIds ?? [])]
      .map((masterId) => this.masterIndex.cards.get(masterId))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    if (!candidates.length) {
      this.error = '所有履歴から復元候補を確認できませんでした';
      this.render();
      return;
    }
    const select = el('select', { attrs: { 'aria-label': '消失したカード' } }, candidates.map((definition) => (
      el('option', { value: definition.id, text: definition.name })
    )));
    let modal = null;
    const recover = async () => {
      try {
        const button = modal.modal.querySelector('.legacy-recovery-confirm');
        if (button) button.disabled = true;
        await this.onRecover(select.value);
        modal.close();
      } catch (error) {
        this.error = error.message;
        modal.close();
        this.render();
      }
    };
    modal = openModal({
      title: '消失した入替カードを復元',
      className: 'legacy-recovery-modal',
      content: el('div', { className: 'legacy-recovery-picker' }, [
        el('p', { text: '旧バージョンで大会中に入れ替えたあと消失したカードを、所有履歴から1枚選んでこのデッキの予備へ戻します。' }),
        el('label', {}, [el('span', { text: '消失したカード' }), select]),
        el('small', { text: 'カード性能は同じまま、通常イラスト・通常加工で復元されます。' }),
        el('div', { className: 'modal-actions' }, [
          el('button', { className: 'text-button', text: 'キャンセル', onclick: () => modal.close() }),
          el('button', { className: 'primary-button legacy-recovery-confirm', text: '予備へ復元', onclick: recover }),
        ]),
      ]),
    });
  }

  openLeaderPicker() {
    if (this.locked) return;
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
    const sortedCards = sortDeckCards(deck.cards, this.masterIndex, this.sortMode);
    replace(this.root, el('main', { className: 'deck-detail-screen' }, [
      el('header', { className: 'screen-header deck-detail-header' }, [
        el('div', {}, [el('p', { className: 'eyebrow', text: '40-CARD DECK' }), el('h1', { text: deck.deckName })]),
        el('div', { className: 'deck-stats-inline' }, [
          el('span', { text: `40枚` }), el('span', { text: `デッキ総TP ${deck.totalPlayTp}` }), el('span', { text: `${TOURNAMENT_LABELS[this.collection.getPlayerQualification()]}まで・全デッキ共通` }),
        ]),
        el('div', { className: 'header-actions' }, [
          el('button', { className: 'text-button', text: '一覧へ', onclick: this.onBack }),
          this.onUse ? el('button', { className: 'primary-button', text: 'このデッキを使う', onclick: () => this.onUse(deck) }) : null,
        ]),
      ]),
      deck.legacyRecoveryCredits > 0 && !this.locked ? el('section', { className: 'legacy-recovery-banner' }, [
        el('div', {}, [
          el('strong', { text: '旧大会データから消失カードを復元できます' }),
          el('small', { text: `復元可能 ${deck.legacyRecoveryCredits}枚。今回消えたクロノギアなどを所有履歴から選択してください。` }),
        ]),
        el('button', { className: 'primary-button', text: '消失カードを復元', onclick: () => this.openLegacyRecoveryPicker() }),
      ]) : null,
      this.locked ? el('section', { className: 'deck-editor-bar tournament-locked' }, [
        el('span', { className: 'deck-lock-mark', text: 'LOCK' }),
        el('div', { className: 'deck-lock-copy' }, [
          el('strong', { text: '大会参加中のため編集できません' }),
          el('small', { text: '大会を終了すると、名前・リーダー・40枚構成の編集と削除が再び可能になります。' }),
        ]),
      ]) : el('section', { className: 'deck-editor-bar' }, [
        el('div', { className: 'deck-leader-edit' }, [
          el('span', { text: 'リーダー' }),
          el('strong', { text: leader?.name ?? '未設定' }),
          el('button', { className: 'text-button', text: 'リーダー変更', onclick: () => this.openLeaderPicker() }),
        ]),
        this.error ? el('span', { className: 'invalid-copy', text: this.error }) : null,
        this.onBuild ? el('button', { className: 'primary-button deck-build-button', text: `デッキ編集${deck.pool.length ? `（予備${deck.pool.length}）` : ''}`, onclick: () => this.onBuild(deck) }) : null,
        this.onDelete ? el('button', { className: 'text-button danger-button deck-delete', text: '削除', onclick: () => this.onDelete(deck) }) : null,
      ]),
      el('section', { className: 'deck-card-browser' }, [
        el('div', { className: 'deck-card-toolbar' }, [
          el('div', { className: 'deck-card-toolbar-copy' }, [
            el('strong', { text: 'デッキ40枚' }),
            el('small', { text: '表示順のみ変更・対戦時はシャッフル' }),
          ]),
          deckSortControl(this.sortMode, (value) => { this.sortMode = value; this.render(); }),
        ]),
        el('div', { className: 'deck-card-grid', attrs: { 'aria-label': `${deck.deckName}の40枚` } }, sortedCards.map((card) => {
          const definition = this.masterIndex.cards.get(card.masterId);
          return renderCard({ definition, cardAsset: card, onClick: () => openCardDetails({ definition, masterIndex: this.masterIndex, cardAsset: card }) });
        })),
      ]),
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
    this.sortMode = 'kind';
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

  renderEditableCard({ definition, card, selected = false, disabled = false, onClick }) {
    const node = renderCard({ definition, cardAsset: card, selected, disabled, onClick });
    return attachLongPress(node, () => openCardDetails({
      definition,
      masterIndex: this.masterIndex,
      cardAsset: card,
      moveView: 'catalog',
    }));
  }

  renderCandidate(card, source, count = null) {
    const definition = this.masterIndex.cards.get(card.masterId);
    const action = source === 'pool' ? () => this.swapWithPool(card.instanceId) : () => this.swapWithUnassigned(card);
    return el('article', { className: `builder-candidate${this.selectedActiveId ? ' ready' : ''}` }, [
      this.renderEditableCard({ definition, card, disabled: !this.selectedActiveId, onClick: action }),
      count != null ? el('strong', { text: `×${count}` }) : null,
      el('small', { text: source === 'pool' ? 'このデッキの予備' : '未所属資産' }),
    ]);
  }

  render() {
    const sortedActiveCards = sortDeckCards(this.deck.cards, this.masterIndex, this.sortMode);
    replace(this.root, el('main', { className: 'deck-builder-screen' }, [
      el('header', { className: 'screen-header deck-builder-header' }, [
        el('div', {}, [
          el('p', { className: 'eyebrow', text: 'DECK-BOUND CARD POOL' }),
          el('h1', { text: `${this.deck.deckName}を編集` }),
          el('p', { text: 'タップで交換、長押しで詳細を確認できます。採用した未所属カードはこのデッキ専用になります。' }),
        ]),
        el('div', { className: 'builder-header-actions' }, [
          el('button', { className: 'text-button', text: '変更を破棄', onclick: this.onBack }),
          el('button', { className: 'primary-button', text: '40枚を保存', onclick: () => this.onSave(this.deck, this.economy) }),
        ]),
      ]),
      this.error ? el('p', { className: 'invalid-copy builder-error', text: this.error }) : null,
      el('section', { className: 'deck-builder-workspace' }, [
        el('section', { className: 'builder-active' }, [
          el('div', { className: 'section-title' }, [
            el('h2', { text: '使用中の40枚' }),
            el('div', { className: 'builder-section-tools' }, [
              el('span', { text: this.selectedActiveId ? '交換先を選択' : '外すカードを選択' }),
              deckSortControl(this.sortMode, (value) => { this.sortMode = value; this.render(); }, 'compact'),
            ]),
          ]),
          el('div', { className: 'builder-card-grid' }, sortedActiveCards.map((card) => {
            const definition = this.masterIndex.cards.get(card.masterId);
            return this.renderEditableCard({
              definition,
              card,
              selected: card.instanceId === this.selectedActiveId,
              onClick: () => this.selectActive(card.instanceId),
            });
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
