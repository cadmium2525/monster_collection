import { BOOSTER_PACKS } from '../gacha/pack-catalog.js';
import { acquisitionLabel } from '../gacha/acquisition.js';
import { assetStackKey } from '../gacha/economy-state.js';
import { el, replace } from './dom.js';
import { openCardDetails, renderCard } from './card-renderer.js';

function diamondBalance(economy) {
  return el('div', { className: 'diamond-balance', attrs: { 'aria-label': `所持ダイヤ ${economy.diamonds}` } }, [
    el('i', { attrs: { 'aria-hidden': 'true' } }),
    el('strong', { text: economy.diamonds.toLocaleString('ja-JP') }),
    economy.freePackCredits ? el('small', { text: `初回無料 ×${economy.freePackCredits}` }) : null,
  ]);
}

export class BoosterShopScreen {
  constructor({ root, economy, onBack, onOpen, onInventory }) {
    this.root = root;
    this.economy = economy;
    this.onBack = onBack;
    this.onOpen = onOpen;
    this.onInventory = onInventory;
    this.render();
  }

  render() {
    replace(this.root, el('main', { className: 'booster-shop-screen' }, [
      el('header', { className: 'screen-header booster-header' }, [
        el('div', {}, [
          el('p', { className: 'eyebrow', text: 'FREE BOOSTER LAB' }),
          el('h1', { text: 'モン類ブースター' }),
          el('p', { text: '5枚入り。モンスター1枚以上・Rare以上1枚以上。奪取限定カードは排出されません。' }),
        ]),
        el('div', { className: 'booster-header-actions' }, [
          diamondBalance(this.economy),
          el('button', { className: 'utility-button', text: '未所属カード', onclick: this.onInventory }),
          el('button', { className: 'utility-button', text: 'ホームへ', onclick: this.onBack }),
        ]),
      ]),
      this.economy.pendingPack ? el('button', { className: 'pending-pack-banner', onclick: () => this.onOpen(null, true) }, [
        el('strong', { text: '未確認のパックがあります' }),
        el('span', { text: '開封結果を続きから確認' }),
      ]) : null,
      el('section', { className: 'booster-pack-grid' }, BOOSTER_PACKS.map((pack) => {
        const free = this.economy.freePackCredits > 0;
        const affordable = free || this.economy.diamonds >= pack.cost;
        return el('article', {
          className: 'booster-pack-tile',
          attrs: { style: `--pack-color:${pack.color}` },
        }, [
          el('div', { className: 'booster-pack-art', attrs: { 'aria-hidden': 'true' } }, [
            el('i'), el('strong', { text: pack.sigil }), el('span', { text: 'MONSTER CONSTRUCTION' }),
          ]),
          el('div', { className: 'booster-pack-copy' }, [
            el('small', { text: `${pack.faction} BOOSTER / 5 CARDS` }),
            el('h2', { text: pack.name }),
            el('p', { text: pack.description }),
            el('button', {
              className: 'primary-button booster-open-button',
              text: free ? '初回無料で開封' : `◆ ${pack.cost}で開封`,
              disabled: !affordable || Boolean(this.economy.pendingPack),
              onclick: () => this.onOpen(pack),
            }),
          ]),
        ]);
      })),
      el('footer', { className: 'booster-notes' }, [
        el('strong', { text: 'このゲームに課金要素はありません。' }),
        el('span', { text: 'ダイヤは大会報酬だけで獲得できます。初回と5パックごとにそのモン類の新モンスター、20パックごとに奪取不可の特別イラストを保証します。' }),
      ]),
    ]));
  }
}

export class PackOpeningScreen {
  constructor({ root, pendingPack, masterIndex, reducedMotion = false, onComplete }) {
    this.root = root;
    this.pendingPack = pendingPack;
    this.masterIndex = masterIndex;
    this.reducedMotion = reducedMotion;
    this.onComplete = onComplete;
    this.revealed = new Set();
    this.revealing = new Set();
    this.phase = 'sealed';
    this.revealLocked = false;
    this.cardsSettled = false;
    this.burst = null;
    this.burstToken = 0;
    this.disposed = false;
    this.render();
  }

  wait(milliseconds) {
    return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
  }

  async revealPack() {
    if (this.phase !== 'sealed' || this.revealLocked) return;
    this.revealLocked = true;
    this.phase = 'breaking';
    this.render();
    await this.wait(this.reducedMotion ? 180 : 1180);
    if (this.disposed) return;
    this.phase = 'cards';
    this.cardsSettled = false;
    this.revealLocked = false;
    this.render();
    globalThis.setTimeout(() => {
      if (this.disposed || this.phase !== 'cards' || this.cardsSettled) return;
      this.cardsSettled = true;
      this.render();
    }, this.reducedMotion ? 100 : 760);
  }

  rarityLabel(asset) {
    if (asset.rarity === 'showcase') return 'SHOWCASE';
    if (asset.finish === 'foil') return 'FOIL';
    if (asset.rarity === 'rare') return 'RARE';
    return 'COMMON';
  }

  async revealOne(index, { sequence = false } = {}) {
    if (this.revealed.has(index) || this.revealing.has(index)) return;
    this.burstToken += 1;
    this.burst = null;
    this.revealing.add(index);
    this.render();
    await this.wait(this.reducedMotion ? 70 : 560);
    if (this.disposed) return;
    this.revealing.delete(index);
    this.revealed.add(index);
    const asset = this.pendingPack.cards[index];
    if (asset.rarity === 'showcase' || asset.rarity === 'rare' || asset.finish === 'foil') {
      const definition = this.masterIndex.cards.get(asset.masterId);
      const token = ++this.burstToken;
      this.burst = { asset, definition };
      this.render();
      globalThis.setTimeout(() => {
        if (this.disposed || this.burstToken !== token) return;
        this.burst = null;
        this.render();
      }, this.reducedMotion ? 180 : sequence ? 620 : 1400);
      return;
    }
    this.render();
  }

  complete() {
    this.disposed = true;
    this.burstToken += 1;
    this.onComplete();
  }

  async reveal(index) {
    if (this.revealLocked) return;
    this.cardsSettled = true;
    this.revealLocked = true;
    await this.revealOne(index);
    this.revealLocked = false;
    this.render();
  }

  async revealAll() {
    if (this.revealLocked) return;
    this.cardsSettled = true;
    this.revealLocked = true;
    for (let index = 0; index < this.pendingPack.cards.length; index += 1) {
      if (this.revealed.has(index)) continue;
      await this.revealOne(index, { sequence: true });
      await this.wait(this.reducedMotion ? 20 : 120);
    }
    this.revealLocked = false;
    this.burstToken += 1;
    this.burst = null;
    this.render();
  }

  render() {
    const pack = BOOSTER_PACKS.find((entry) => entry.id === this.pendingPack.packId)
      ?? BOOSTER_PACKS.find((entry) => entry.faction === this.pendingPack.faction);
    const allRevealed = this.revealed.size === this.pendingPack.cards.length;
    if (this.phase === 'sealed' || this.phase === 'breaking') {
      replace(this.root, el('main', {
        className: `pack-opening-screen pack-sealed${this.phase === 'breaking' ? ' breaking' : ''}${this.reducedMotion ? ' reduced-motion' : ''}`,
        attrs: { style: `--pack-color:${pack?.color ?? '#62d9e7'}` },
      }, [
        el('div', { className: 'opening-aura', attrs: { 'aria-hidden': 'true' } }, [el('i'), el('i'), el('i')]),
        el('div', { className: 'pack-particle-field', attrs: { 'aria-hidden': 'true' } }, Array.from({ length: 28 }, (_, index) => el('i', { attrs: { style: `--p:${index}` } }))),
        el('button', { className: 'opening-pack', disabled: this.phase === 'breaking', onclick: () => this.revealPack(), attrs: { type: 'button', 'aria-label': `${pack?.name ?? 'パック'}を開封` } }, [
          el('i', { className: 'pack-foil-sheen', attrs: { 'aria-hidden': 'true' } }),
          el('span', { text: 'MONSTER CONSTRUCTION' }),
          el('strong', { text: pack?.sigil ?? '封' }),
          el('b', { text: pack?.name ?? 'ブースターパック' }),
          el('small', { text: this.phase === 'breaking' ? 'SEAL BREAKING' : 'TAP TO BREAK THE SEAL' }),
        ]),
        this.phase === 'breaking' ? el('div', { className: 'pack-break-flash', attrs: { 'aria-hidden': 'true' } }, [el('i'), el('i'), el('i')]) : null,
      ]));
      return;
    }

    replace(this.root, el('main', {
      className: `pack-opening-screen pack-cards${allRevealed ? ' all-revealed' : ''}${this.cardsSettled ? ' settled' : ' entering'}`,
      attrs: { style: `--pack-color:${pack?.color ?? '#62d9e7'}` },
    }, [
      el('header', { className: 'pack-result-header' }, [
        el('div', {}, [el('p', { className: 'eyebrow', text: 'BOOSTER RESULT' }), el('h1', { text: pack?.name ?? '開封結果' })]),
        el('span', { text: `${this.revealed.size}/5 REVEALED` }),
      ]),
      el('section', { className: 'pack-card-fan' }, this.pendingPack.cards.map((asset, index) => {
        const definition = this.masterIndex.cards.get(asset.masterId);
        const revealed = this.revealed.has(index);
        const revealing = this.revealing.has(index);
        const backFace = () => el('div', { className: 'pack-card-face pack-card-back-face' }, [el('i'), el('strong', { text: 'MC' }), el('small', { text: 'REVEAL' })]);
        return el('div', {
          className: `pack-card-slot rarity-${asset.rarity ?? 'common'}${revealed ? ' revealed' : ''}${revealing ? ' revealing' : ''}`,
          attrs: { style: `--deal-index:${index}` },
        }, [
          revealed ? renderCard({
            definition,
            cardAsset: asset,
            onClick: () => openCardDetails({ definition, masterIndex: this.masterIndex, cardAsset: asset }),
          }) : revealing ? el('div', { className: 'pack-card-reveal-shell', attrs: { 'aria-hidden': 'true' } }, [
            backFace(),
            el('div', { className: 'pack-card-face pack-card-front-face' }, renderCard({ definition, cardAsset: asset, interactive: false })),
          ]) : el('button', {
            className: 'pack-card-back',
            attrs: { type: 'button', 'aria-label': `${index + 1}枚目をめくる` },
            onclick: () => this.reveal(index),
          }, [el('i'), el('strong', { text: 'MC' }), el('small', { text: 'TAP' })]),
          revealed ? el('span', { className: 'pack-rarity-label', text: this.rarityLabel(asset) }) : null,
        ]);
      })),
      this.burst ? el('div', { className: `pack-rarity-burst rarity-${this.burst.asset.rarity ?? 'rare'}${this.burst.asset.finish === 'foil' ? ' foil' : ''}`, attrs: { 'aria-live': 'polite' } }, [
        el('div', { className: 'rarity-burst-rings', attrs: { 'aria-hidden': 'true' } }, [el('i'), el('i'), el('i')]),
        el('strong', { text: this.rarityLabel(this.burst.asset) }),
        el('span', { text: this.burst.definition?.name ?? 'NEW CARD' }),
      ]) : null,
      el('footer', { className: 'pack-result-actions' }, [
        !allRevealed ? el('button', { className: 'text-button', text: this.revealLocked ? '開封中…' : 'すべてめくる', disabled: this.revealLocked, onclick: () => this.revealAll() }) : el('span'),
        allRevealed ? el('button', { className: 'primary-button', text: '資産へ受け取る', onclick: () => this.complete() }) : el('small', { text: 'カードをタップして1枚ずつ確認' }),
      ]),
    ]));
  }
}

export class AssetCollectionScreen {
  constructor({ root, economy, masterIndex, onBack }) {
    this.root = root;
    this.economy = economy;
    this.masterIndex = masterIndex;
    this.onBack = onBack;
    this.render();
  }

  render() {
    const stacks = [...this.economy.unassignedAssets].sort((a, b) => {
      const rarity = { showcase: 3, rare: 2, common: 1 };
      return (rarity[b.rarity] ?? 0) - (rarity[a.rarity] ?? 0) || assetStackKey(a).localeCompare(assetStackKey(b));
    });
    replace(this.root, el('main', { className: 'asset-collection-screen' }, [
      el('header', { className: 'screen-header' }, [
        el('div', {}, [
          el('p', { className: 'eyebrow', text: 'UNASSIGNED CARD ASSETS' }),
          el('h1', { text: '未所属カード' }),
          el('p', { text: 'パックから入手し、まだ保存デッキへ所属させていないカードです。' }),
        ]),
        el('button', { className: 'utility-button', text: 'パックへ', onclick: this.onBack }),
      ]),
      stacks.length ? el('section', { className: 'asset-card-grid' }, stacks.map((asset) => {
        const definition = this.masterIndex.cards.get(asset.masterId);
        return el('article', { className: 'asset-card-entry' }, [
          renderCard({ definition, cardAsset: asset, onClick: () => openCardDetails({ definition, masterIndex: this.masterIndex, cardAsset: asset }) }),
          el('div', {}, [
            el('strong', { text: `×${asset.quantity}` }),
            el('small', { text: `${acquisitionLabel(definition)} / ${asset.finish === 'foil' ? 'Foil' : asset.artVariantId !== 'base' ? '特別絵' : '通常絵'}` }),
          ]),
        ]);
      })) : el('section', { className: 'empty-state' }, [
        el('h2', { text: '未所属カードはありません' }),
        el('p', { text: 'ブースターパックを開封すると、ここへ追加されます。' }),
      ]),
    ]));
  }
}
