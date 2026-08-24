import { el, replace } from './dom.js';
import { openCardDetails, renderCard } from './card-renderer.js';
import { openModal } from './modal.js';

function cardTile({ definition, selected, mode, onToggle, onDetails }) {
  return el('div', { className: `selectable-card ${selected ? 'selected' : ''}` }, [
    renderCard({ definition, selected, onClick: onToggle, label: `${definition.name}を${mode === 'gain' ? '獲得候補' : '放出候補'}として選択` }),
    el('button', {
      className: 'card-info-button', text: '詳細', attrs: { type: 'button', 'aria-label': `${definition.name}の詳細` },
      onclick: (event) => { event.stopPropagation(); onDetails(); },
    }),
    selected ? el('span', { className: 'selection-badge', text: mode === 'gain' ? '獲得' : '放出' }) : null,
  ]);
}

export class RewardScreen {
  constructor({ root, session, masterIndex, opponentName, onCommit, onSkip, onCancel }) {
    this.root = root;
    this.session = session;
    this.masterIndex = masterIndex;
    this.opponentName = opponentName;
    this.onCommit = onCommit;
    this.onSkip = onSkip;
    this.onCancel = onCancel;
    this.error = '';
    this.render();
  }

  definition(masterId) { return this.masterIndex.cards.get(masterId); }

  toggleOffer(offerId) {
    try { this.session.toggleOffer(offerId); this.error = ''; }
    catch (error) { this.error = error.message; }
    this.render();
  }

  toggleRelease(instanceId) {
    try { this.session.toggleRelease(instanceId); this.error = ''; }
    catch (error) { this.error = error.message; }
    this.render();
  }

  render() {
    const state = this.session.getState();
    const preview = this.session.preview();
    const selectedOffers = new Set(state.selectedOfferIds);
    const selectedReleases = new Set(state.selectedReleaseIds);
    const selectedCount = selectedOffers.size;
    const remaining = selectedCount - selectedReleases.size;
    const screen = el('main', { className: 'reward-screen' }, [
      el('header', { className: 'screen-header reward-header' }, [
        el('div', {}, [
          el('p', { className: 'eyebrow', text: 'VICTORY REWARD' }),
          el('h1', { text: `${this.opponentName}の40枚から奪う` }),
        ]),
        el('div', { className: 'reward-counter' }, [
          el('strong', { text: `${selectedCount}/2` }),
          el('span', { text: '獲得候補' }),
        ]),
      ]),
      el('section', { className: 'reward-workspace' }, [
        el('section', { className: 'reward-offers' }, [
          el('div', { className: 'section-title' }, [
            el('span', { className: 'step-number', text: '1' }),
            el('div', {}, [el('h2', { text: '提示された5枚' }), el('p', { text: '欲しいカードを最大2枚。カードはタップで選択・解除できます。' })]),
          ]),
          el('div', { className: 'reward-card-row' }, state.offered.map((offer) => {
            const definition = this.definition(offer.masterId);
            return cardTile({
              definition,
              selected: selectedOffers.has(offer.offerId),
              mode: 'gain',
              onToggle: () => this.toggleOffer(offer.offerId),
              onDetails: () => openCardDetails({ definition, masterIndex: this.masterIndex }),
            });
          })),
        ]),
        el('section', { className: `reward-release ${selectedCount ? '' : 'locked'}` }, [
          el('div', { className: 'section-title' }, [
            el('span', { className: 'step-number', text: '2' }),
            el('div', {}, [
              el('h2', { text: '自分の40枚から放出' }),
              el('p', { text: selectedCount ? `あと${Math.max(0, remaining)}枚選択（獲得と同数）` : '先に獲得候補を選んでください。' }),
            ]),
          ]),
          el('div', { className: 'release-grid' }, this.session.originalCards.map((card) => {
            const definition = this.definition(card.masterId);
            return cardTile({
              definition,
              selected: selectedReleases.has(card.instanceId),
              mode: 'release',
              onToggle: () => selectedCount && this.toggleRelease(card.instanceId),
              onDetails: () => openCardDetails({ definition, masterIndex: this.masterIndex }),
            });
          })),
        ]),
      ]),
      el('footer', { className: 'reward-footer' }, [
        el('div', { className: 'exchange-summary' }, [
          el('span', { className: 'step-number', text: '3' }),
          el('div', {}, [
            el('strong', { text: selectedCount ? `獲得 ${preview.acquired.length}枚 ⇄ 放出 ${preview.released.length}枚` : '交換しないこともできます' }),
            el('p', { className: preview.valid ? 'valid-copy' : 'invalid-copy', text: this.error || (selectedCount ? preview.valid ? '交換後も40枚。確定前は保存されません。' : preview.errors[0] : '0枚ならそのまま終了します。') }),
          ]),
        ]),
        el('div', { className: 'reward-actions' }, [
          selectedCount ? el('button', { className: 'text-button danger-button', text: 'やっぱりやめる', onclick: () => this.cancel() }) : null,
          selectedCount ? el('button', { className: 'primary-button', text: '最終確認へ', disabled: !preview.valid, onclick: () => this.confirmExchange(preview) })
            : el('button', { className: 'primary-button', text: 'スキップして終了', onclick: () => this.skip() }),
        ]),
      ]),
    ]);
    replace(this.root, screen);
  }

  confirmExchange(preview) {
    const names = (cards) => cards.map((card) => this.definition(card.masterId).name).join('、');
    const modalContent = el('div', { className: 'confirm-exchange' }, [
      el('div', { className: 'confirmation-pair' }, [
        el('section', {}, [el('span', { text: '獲得' }), el('strong', { text: names(preview.acquired) })]),
        el('b', { text: '⇄' }),
        el('section', {}, [el('span', { text: '放出' }), el('strong', { text: names(preview.released) })]),
      ]),
      el('p', { text: '確定すると、この大会で使用中の保存デッキが更新されます。40枚構成は維持されます。' }),
      el('div', { className: 'modal-actions' }, [
        el('button', { className: 'text-button', text: '選び直す', onclick: () => modal.close() }),
        el('button', { className: 'primary-button', text: '交換を確定', onclick: () => {
          const cards = this.session.commit();
          modal.close();
          this.onCommit?.(cards, preview);
        } }),
      ]),
    ]);
    const modal = openModal({ title: 'この交換で確定しますか？', content: modalContent, dismissible: true });
  }

  skip() { this.onSkip?.(this.session.skip()); }
  cancel() { this.onCancel?.(this.session.cancel()); }
}
