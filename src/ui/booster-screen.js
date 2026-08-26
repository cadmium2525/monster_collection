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
    this.phase = 'sealed';
    this.render();
  }

  revealPack() {
    this.phase = 'cards';
    this.render();
  }

  reveal(index) {
    this.revealed.add(index);
    this.render();
  }

  revealAll() {
    this.pendingPack.cards.forEach((_, index) => this.revealed.add(index));
    this.render();
  }

  render() {
    const pack = BOOSTER_PACKS.find((entry) => entry.id === this.pendingPack.packId)
      ?? BOOSTER_PACKS.find((entry) => entry.faction === this.pendingPack.faction);
    const allRevealed = this.revealed.size === this.pendingPack.cards.length;
    if (this.phase === 'sealed') {
      replace(this.root, el('main', {
        className: `pack-opening-screen pack-sealed${this.reducedMotion ? ' reduced-motion' : ''}`,
        attrs: { style: `--pack-color:${pack?.color ?? '#62d9e7'}` },
      }, [
        el('div', { className: 'pack-particle-field', attrs: { 'aria-hidden': 'true' } }, Array.from({ length: 18 }, (_, index) => el('i', { attrs: { style: `--p:${index}` } }))),
        el('button', { className: 'opening-pack', onclick: () => this.revealPack(), attrs: { type: 'button', 'aria-label': `${pack?.name ?? 'パック'}を開封` } }, [
          el('span', { text: 'MONSTER CONSTRUCTION' }),
          el('strong', { text: pack?.sigil ?? '封' }),
          el('b', { text: pack?.name ?? 'ブースターパック' }),
          el('small', { text: 'TAP TO BREAK THE SEAL' }),
        ]),
      ]));
      return;
    }

    replace(this.root, el('main', {
      className: `pack-opening-screen pack-cards${allRevealed ? ' all-revealed' : ''}`,
      attrs: { style: `--pack-color:${pack?.color ?? '#62d9e7'}` },
    }, [
      el('header', { className: 'pack-result-header' }, [
        el('div', {}, [el('p', { className: 'eyebrow', text: 'BOOSTER RESULT' }), el('h1', { text: pack?.name ?? '開封結果' })]),
        el('span', { text: `${this.revealed.size}/5 REVEALED` }),
      ]),
      el('section', { className: 'pack-card-fan' }, this.pendingPack.cards.map((asset, index) => {
        const definition = this.masterIndex.cards.get(asset.masterId);
        const revealed = this.revealed.has(index);
        return el('div', { className: `pack-card-slot rarity-${asset.rarity ?? 'common'}${revealed ? ' revealed' : ''}` }, [
          revealed ? renderCard({
            definition,
            cardAsset: asset,
            onClick: () => openCardDetails({ definition, masterIndex: this.masterIndex, cardAsset: asset }),
          }) : el('button', {
            className: 'pack-card-back',
            attrs: { type: 'button', 'aria-label': `${index + 1}枚目をめくる` },
            onclick: () => this.reveal(index),
          }, [el('i'), el('strong', { text: 'MC' }), el('small', { text: 'TAP' })]),
          revealed ? el('span', { className: 'pack-rarity-label', text: asset.rarity === 'showcase' ? 'SHOWCASE' : asset.finish === 'foil' ? 'FOIL' : asset.rarity === 'rare' ? 'RARE' : 'COMMON' }) : null,
        ]);
      })),
      el('footer', { className: 'pack-result-actions' }, [
        !allRevealed ? el('button', { className: 'text-button', text: 'すべてめくる', onclick: () => this.revealAll() }) : el('span'),
        allRevealed ? el('button', { className: 'primary-button', text: '資産へ受け取る', onclick: this.onComplete }) : el('small', { text: 'カードをタップして1枚ずつ確認' }),
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
