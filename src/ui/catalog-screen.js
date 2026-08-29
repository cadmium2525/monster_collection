import { el, replace } from './dom.js';
import { cardArtPlacement, deferCardArt, openCardDetails, renderCard } from './card-renderer.js';
import { openModal } from './modal.js';
import { buildCatalogModel } from './catalog-model.js';

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

export function fusionTile(fusion, masterIndex, { showcase = false, locked = false, lazyArt = false } = {}) {
  const main = masterIndex.monstersByName.get(fusion.main);
  const art = cardArtPlacement(main, {
    specialFusionId: fusion.id,
    specialForm: fusion.name,
    artVariantId: showcase ? 'showcase-preview' : 'base',
  });
  const tile = el(locked ? 'div' : 'button', {
    className: `fusion-catalog-card${showcase ? ' fusion-showcase-card finish-foil' : ''}${locked ? ' catalog-locked' : ''}`,
    attrs: locked
      ? { role: 'img', 'aria-label': `${fusion.name} 未発見` }
      : { type: 'button', 'aria-label': `${fusion.name}${showcase ? '特別イラスト' : ''}の詳細を表示` },
    onclick: locked ? null : () => openFusionDetails(fusion, masterIndex, { showcase }),
  }, [
    el('div', { className: 'card-top' }, el('b', { text: fusion.name })),
    el('div', { className: `card-art ${art.className}`, attrs: art.style ? { style: art.style } : null }),
    el('strong', { text: locked ? '🔒 未発見' : `${fusion.main} ＋ ${fusion.material}` }),
  ]);
  return lazyArt ? deferCardArt(tile) : tile;
}

function catalogCardTile(definition, owned, masterIndex) {
  return el('article', { className: `catalog-entry${owned ? '' : ' catalog-locked'}` }, [
    renderCard({
      definition,
      interactive: owned,
      label: owned ? `${definition.name}の詳細を表示` : `${definition.name} 未所持`,
      onClick: owned ? () => openCardDetails({ definition, masterIndex }) : null,
      lazyArt: true,
    }),
    owned ? null : el('span', { className: 'catalog-lock-label', text: '🔒 未所持', attrs: { 'aria-hidden': 'true' } }),
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
    const model = buildCatalogModel(this.catalog, this.masterIndex, this.filter);
    const entries = [
      ...model.cards.map(({ definition, owned }) => catalogCardTile(definition, owned, this.masterIndex)),
      ...model.fusions.map(({ fusion, discovered }) => fusionTile(fusion, this.masterIndex, { locked: !discovered, lazyArt: true })),
    ];

    replace(this.root, el('main', { className: 'card-catalog-screen' }, [
      el('header', { className: 'screen-header' }, [
        el('div', {}, [el('p', { className: 'eyebrow', text: 'CARD CATALOG' }), el('h1', { text: 'カード図鑑' })]),
        el('div', { className: 'catalog-progress' }, [
          el('span', { text: `基本カード ${model.progress.owned}/${model.progress.cards}` }),
          el('span', { text: `特殊合体 ${model.progress.discovered}/${model.progress.fusions}` }),
        ]),
        el('button', { className: 'text-button', text: '保存デッキへ', onclick: this.onBack }),
      ]),
      el('nav', { className: 'catalog-filters', attrs: { 'aria-label': 'カード図鑑の絞り込み' } }, model.filters.map(([id, label, count]) => el('button', {
        className: id === this.filter ? 'selected' : '',
        text: `${label} ${count}`,
        onclick: () => { this.filter = id; this.render(); },
      }))),
      el('section', { className: 'catalog-card-grid', attrs: { 'aria-label': 'ゲーム内の全カード' } }, entries.length
        ? entries
        : el('div', { className: 'empty-state' }, [
          el('h2', { text: '該当するカードはありません' }),
          el('p', { text: '絞り込み条件を変更してください。' }),
        ])),
    ]));
  }
}
