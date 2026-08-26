import { normalizeDeckCards, validateDeck } from '../battle/deck.js';
import { SeededRng } from '../core/rng.js';
import { normalStealVariant } from '../gacha/acquisition.js';

function clone(value) { return structuredClone(value); }

export class CardStealSession {
  static fromCheckpoint({ masterIndex, checkpoint }) {
    if (!masterIndex || checkpoint?.schemaVersion !== 1 || checkpoint?.originalCards?.length !== 40 || !checkpoint?.state) {
      throw new Error('Reward checkpoint is invalid');
    }
    const session = Object.create(CardStealSession.prototype);
    session.masterIndex = masterIndex;
    session.deckId = checkpoint.deckId;
    session.originalCards = clone(checkpoint.originalCards);
    session.captureToken = checkpoint.captureToken;
    session.state = clone(checkpoint.state);
    session.rng = new SeededRng(session.state.seed);
    return session;
  }

  constructor({ playerCards, defeatedCards, masterIndex, deckId, seed = 'reward' }) {
    if (playerCards.length !== 40 || defeatedCards.length !== 40) throw new Error('Card steal requires two 40-card decks');
    this.masterIndex = masterIndex;
    this.deckId = deckId;
    this.rng = new SeededRng(seed);
    this.originalCards = clone(normalizeDeckCards(playerCards, deckId));
    this.captureToken = this.rng.int(0, 0x7fffffff).toString(36);
    this.state = {
      seed: String(seed),
      status: 'selecting',
      offered: this.rng.shuffle(normalizeDeckCards(defeatedCards, 'defeated')).slice(0, 5).map((card, index) => ({
        offerId: `offer-${index + 1}`,
        sourceInstanceId: card.instanceId,
        ...normalStealVariant(card),
      })),
      selectedOfferIds: [],
      selectedReleaseIds: [],
      resultCards: null,
    };
  }

  _assertSelecting() {
    if (this.state.status !== 'selecting') throw new Error(`Reward session is ${this.state.status}`);
  }

  toggleOffer(offerId) {
    this._assertSelecting();
    if (!this.state.offered.some((offer) => offer.offerId === offerId)) throw new Error('Unknown offered card');
    const index = this.state.selectedOfferIds.indexOf(offerId);
    if (index >= 0) {
      this.state.selectedOfferIds.splice(index, 1);
      while (this.state.selectedReleaseIds.length > this.state.selectedOfferIds.length) this.state.selectedReleaseIds.pop();
    } else {
      if (this.state.selectedOfferIds.length >= 2) throw new Error('獲得できるカードは最大2枚です');
      this.state.selectedOfferIds.push(offerId);
    }
    return this.getState();
  }

  toggleRelease(instanceId) {
    this._assertSelecting();
    if (!this.originalCards.some((card) => card.instanceId === instanceId)) throw new Error('Unknown release card');
    const index = this.state.selectedReleaseIds.indexOf(instanceId);
    if (index >= 0) this.state.selectedReleaseIds.splice(index, 1);
    else {
      if (!this.state.selectedOfferIds.length) throw new Error('先に獲得候補を選んでください');
      if (this.state.selectedReleaseIds.length >= this.state.selectedOfferIds.length) throw new Error('獲得枚数を超えて放出できません');
      this.state.selectedReleaseIds.push(instanceId);
    }
    return this.getState();
  }

  _newInstanceId(index, used) {
    let suffix = index + 1;
    let id = `${this.deckId}-captured-${this.captureToken}-${suffix}`;
    while (used.has(id)) {
      suffix += 1;
      id = `${this.deckId}-captured-${this.captureToken}-${suffix}`;
    }
    used.add(id);
    return id;
  }

  preview() {
    const acquired = this.state.selectedOfferIds.map((offerId) => this.state.offered.find((offer) => offer.offerId === offerId));
    const released = this.state.selectedReleaseIds.map((instanceId) => this.originalCards.find((card) => card.instanceId === instanceId));
    const releasedSet = new Set(this.state.selectedReleaseIds);
    const finalCards = this.originalCards.filter((card) => !releasedSet.has(card.instanceId));
    const used = new Set(finalCards.map((card) => card.instanceId));
    finalCards.push(...acquired.map((offer, index) => ({
      instanceId: this._newInstanceId(index, used),
      masterId: offer.masterId,
      artVariantId: 'base',
      finish: 'normal',
      origin: 'capture',
    })));
    const countReady = acquired.length > 0 && acquired.length === released.length;
    const validation = countReady
      ? validateDeck(finalCards, this.masterIndex, { deckId: this.deckId })
      : { valid: false, errors: acquired.length ? [`獲得${acquired.length}枚と同数の放出カードを選んでください`] : ['獲得候補を1〜2枚選んでください'] };
    return clone({ acquired, released, finalCards, countReady, valid: validation.valid, errors: validation.errors });
  }

  commit() {
    this._assertSelecting();
    const preview = this.preview();
    if (!preview.valid) throw new Error(`交換を確定できません:\n${preview.errors.join('\n')}`);
    this.state.status = 'committed';
    this.state.resultCards = clone(preview.finalCards);
    return clone(preview.finalCards);
  }

  skip() {
    this._assertSelecting();
    if (this.state.selectedOfferIds.length) throw new Error('選択中です。先に選択解除するか「やっぱりやめる」を選んでください');
    this.state.status = 'skipped';
    this.state.resultCards = clone(this.originalCards);
    return clone(this.originalCards);
  }

  cancel() {
    this._assertSelecting();
    this.state.status = 'cancelled';
    this.state.resultCards = clone(this.originalCards);
    return clone(this.originalCards);
  }

  getState() { return clone(this.state); }

  toCheckpoint() {
    return {
      schemaVersion: 1,
      deckId: this.deckId,
      originalCards: clone(this.originalCards),
      captureToken: this.captureToken,
      state: clone(this.state),
    };
  }
}
