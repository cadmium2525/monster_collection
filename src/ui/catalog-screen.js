import { el, replace } from './dom.js';
import { cardArtPlacement, openCardDetails, renderCard } from './card-renderer.js';
import { openModal } from './modal.js';

const KIND_ORDER = Object.freeze({ monster: 0, training: 1, shugyo: 2, breeder: 3 });

export function openFusionDetails(fusion, masterIndex, { showcase = false } = {}) {
  const main = masterIndex.monstersByName.get(fusion.main);
  const material = masterIndex.monstersByName.get(fusion.material);
  const art = cardArtPlacement(main, {
    specialFusionId: fusion.id,
    specialForm: fusion.name,
    artVariantId: showcase ? 'showcase-preview' : 'base',
  });
  openModal({
    title: showcase ? `${fusion.name} 特別イラスト` : fusion.name,
    content: el('div', { className: 'fusion-catalog-detail' }, [
      el('div', { className: `card-art ${art.className}${showcase ? ' finish-foil-art' : ''}`, attrs: art.style ? { style: art.style } : null }),
      el('dl', {}, [
        el('dt', { text: '特殊合体' }), el('dd', { text: `${main?.name ?? fusion.main} ＋ ${material?.name ?? fusion.material}` }),
        el('dt', { text: '特殊特性' }), el('dd', { text: fusion.trait }),
        el('dt', { text: '能力値' }), el('dd', { text: '合体時のメインと素材の現在SPから決定' }),
      ]),
    ]),
    className: 'fusion-catalog-modal',
  });
}

export function fusionTile(fusion, masterIndex, { showcase = false } = {}) {
  const main = masterIndex.monstersByName.get(fusion.main);
  const art = cardArtPlacement(main, {
    specialFusionId: fusion.id,
    specialForm: fusion.name,
    artVariantId: showcase ? 'showcase-preview' : 'base',
  });
  return el('button', {
    className: `fusion-catalog-card${showcase ? ' fusion-showcase-card finish-foil' : ''}`,
    attrs: { type: 'button', 'aria-label': `${fusion.name}${showcase ? '特別イラスト' : ''}の詳細を表示` },
    onclick: () => openFusionDetails(fusion, masterIndex, { showcase }),
  }, [
    el('div', { className: 'card-top' }, el('b', { text: fusion.name })),
    el('div', { className: `card-art ${art.className}`, attrs: art.style ? { style: art.style } : null }),
    el('strong', { text: `${fusion.main} ＋ ${fusion.material}` }),
  ]);
}

export class CardCatalogScreen {
  constructor({ root, catalog, masterIndex, onBack }) {
    this.root = root;
    this.catalog = catalog;
    this.masterIndex = masterIndex;
    this.onBack = onBack;
    this.filter = 'all';
    this.render();
  }

  render() {
    const owned = this.catalog.ownedCardMasterIds
      .map((id) => this.masterIndex.cards.get(id))
      .filter(Boolean)
      .sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || a.name.localeCompare(b.name, 'ja'));
    const discovered = this.catalog.discoveredFusionIds
      .map((id) => this.masterIndex.data.fusions.find((fusion) => fusion.id === id))
      .filter(Boolean)
      .sort((a, b) => a.id.localeCompare(b.id));
    const filters = [
      ['all', 'すべて', owned.length + discovered.length],
      ['monster', 'モンスター', owned.filter((card) => card.kind === 'monster').length],
      ['support', '育成・ブリーダー', owned.filter((card) => card.kind !== 'monster').length],
      ['fusion', '特殊合体', discovered.length],
    ];
    const visibleCards = this.filter === 'monster' ? owned.filter((card) => card.kind === 'monster')
      : this.filter === 'support' ? owned.filter((card) => card.kind !== 'monster')
        : this.filter === 'fusion' ? [] : owned;
    const visibleFusions = ['all', 'fusion'].includes(this.filter) ? discovered : [];
    const entries = [
      ...visibleCards.map((definition) => renderCard({
        definition,
        label: `${definition.name}の詳細を表示`,
        onClick: () => openCardDetails({ definition, masterIndex: this.masterIndex }),
      })),
      ...visibleFusions.map((fusion) => fusionTile(fusion, this.masterIndex)),
    ];

    replace(this.root, el('main', { className: 'card-catalog-screen' }, [
      el('header', { className: 'screen-header' }, [
        el('div', {}, [el('p', { className: 'eyebrow', text: 'CARD CATALOG' }), el('h1', { text: 'カード図鑑' })]),
        el('div', { className: 'catalog-progress' }, [
          el('span', { text: `基本カード ${owned.length}/${this.masterIndex.cards.size}` }),
          el('span', { text: `特殊合体 ${discovered.length}/${this.masterIndex.data.fusions.length}` }),
        ]),
        el('button', { className: 'text-button', text: '保存デッキへ', onclick: this.onBack }),
      ]),
      el('nav', { className: 'catalog-filters', attrs: { 'aria-label': 'カード図鑑の絞り込み' } }, filters.map(([id, label, count]) => el('button', {
        className: id === this.filter ? 'selected' : '',
        text: `${label} ${count}`,
        onclick: () => { this.filter = id; this.render(); },
      }))),
      el('section', { className: 'catalog-card-grid', attrs: { 'aria-label': '所有・発見済みカード' } }, entries.length
        ? entries
        : el('div', { className: 'empty-state' }, [
          el('h2', { text: this.filter === 'fusion' ? '発見した特殊合体はまだありません' : '表示できるカードがありません' }),
          el('p', { text: this.filter === 'fusion' ? 'バトル中に特殊合体を成功させると、ここへ永久登録されます。' : 'カードをデッキへ迎えると、ここへ永久登録されます。' }),
        ])),
    ]));
  }
}
