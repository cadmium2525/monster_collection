import { acquisitionLabel, acquisitionOrigin } from '../gacha/acquisition.js';
import { BOOSTER_PACKS } from '../gacha/pack-catalog.js';
import { SHOWCASE_VARIANTS, generateBoosterPack } from '../gacha/pack-generator.js';
import { openCardDetails, renderCard } from './card-renderer.js';
import { fusionTile } from './catalog-screen.js';
import { el, replace } from './dom.js';

const KIND_LABELS = Object.freeze({
  monster: 'モンスター',
  training: 'Training',
  shugyo: '修行',
  breeder: 'ブリーダー',
  fusion: '特殊合体',
  showcase: '特別イラスト',
  'fusion-showcase': '特殊合体特別絵',
});

export const ADMIN_GUARANTEE_PROFILES = Object.freeze([
  Object.freeze({ id: 'standard', name: '通常抽選', openedCount: 1, copy: '通常の抽選率。モンスター1枚以上・Rare以上1枚以上。' }),
  Object.freeze({ id: 'featured', name: '新モンスター保証', openedCount: 0, copy: '各モン類のブースター限定モンスターを保証。' }),
  Object.freeze({ id: 'foil', name: 'Foil保証', openedCount: 9, copy: '10パック目相当。Foilカードを保証。' }),
  Object.freeze({ id: 'showcase', name: '特別絵保証', openedCount: 19, copy: '20パック目相当。奪取不可の特別イラストを保証。' }),
]);

export function adminCatalogEntries(masterIndex) {
  const base = [...masterIndex.cards.values()].map((definition) => ({
    id: definition.id,
    kind: definition.kind,
    name: definition.name,
    faction: definition.faction ?? '',
    origin: acquisitionOrigin(definition),
    definition,
  }));
  const fusions = masterIndex.data.fusions.map((fusion) => ({
    id: fusion.id,
    kind: 'fusion',
    name: fusion.name,
    faction: masterIndex.monstersByName.get(fusion.main)?.faction ?? '',
    origin: 'fusion',
    fusion,
  }));
  const showcases = Object.entries(SHOWCASE_VARIANTS).flatMap(([faction, variants]) => variants.map((variant) => {
    const definition = masterIndex.cards.get(variant.masterId);
    return {
      id: variant.artVariantId,
      kind: 'showcase',
      name: `${definition?.name ?? variant.masterId} 特別イラスト`,
      faction,
      origin: 'booster',
      definition,
      cardAsset: {
        masterId: variant.masterId,
        artVariantId: variant.artVariantId,
        finish: 'foil',
        rarity: 'showcase',
        origin: 'booster',
      },
    };
  }));
  const fusionShowcases = masterIndex.data.fusions.map((fusion) => ({
    id: `showcase-${fusion.id}`,
    kind: 'fusion-showcase',
    name: `${fusion.name} 特別イラスト`,
    faction: masterIndex.monstersByName.get(fusion.main)?.faction ?? '',
    origin: 'fusion',
    fusion,
  }));
  return [...base, ...fusions, ...showcases, ...fusionShowcases];
}

export function generateAdminPreviewPack({ masterIndex, packId, profileId = 'standard', seed = 'admin-preview' }) {
  const pack = BOOSTER_PACKS.find((entry) => entry.id === packId) ?? BOOSTER_PACKS[0];
  const profile = ADMIN_GUARANTEE_PROFILES.find((entry) => entry.id === profileId) ?? ADMIN_GUARANTEE_PROFILES[0];
  const generated = generateBoosterPack({
    masterIndex,
    faction: pack.faction,
    seed: String(seed || 'admin-preview'),
    openedCount: profile.openedCount,
  });
  return {
    ...generated,
    operationId: `admin-preview-${pack.id}-${profile.id}`,
  };
}

function entrySearchText(entry) {
  const definition = entry.definition;
  return [entry.id, entry.name, entry.faction, KIND_LABELS[entry.kind], definition?.category, definition?.role, definition?.effect]
    .filter(Boolean).join(' ').toLocaleLowerCase('ja');
}

function adminEntryTile(entry, masterIndex) {
  const fusionEntry = entry.kind === 'fusion' || entry.kind === 'fusion-showcase';
  const visual = fusionEntry
    ? fusionTile(entry.fusion, masterIndex, { showcase: entry.kind === 'fusion-showcase', lazyArt: true })
    : renderCard({
      definition: entry.definition,
      cardAsset: entry.cardAsset ?? null,
      label: `${entry.name}の管理者詳細を表示`,
      onClick: () => openCardDetails({ definition: entry.definition, masterIndex, cardAsset: entry.cardAsset ?? null }),
      lazyArt: true,
    });
  const origin = entry.kind === 'fusion' ? '合体レシピ'
    : entry.kind === 'fusion-showcase' ? '特別絵メインで出現'
    : entry.kind === 'showcase' ? 'ブースター特別絵'
      : acquisitionLabel(entry.definition);
  return el('article', { className: 'admin-card-entry' }, [
    visual,
    el('div', { className: 'admin-card-meta' }, [
      el('strong', { text: entry.id }),
      el('span', { text: `${KIND_LABELS[entry.kind]} / ${origin}` }),
    ]),
  ]);
}

export class AdminToolScreen {
  constructor({ root, masterIndex, onBack, onPreview, initialConfig = null }) {
    this.root = root;
    this.masterIndex = masterIndex;
    this.onBack = onBack;
    this.onPreview = onPreview;
    this.entries = adminCatalogEntries(masterIndex);
    this.tab = initialConfig?.tab ?? 'cards';
    this.kind = initialConfig?.kind ?? 'all';
    this.origin = initialConfig?.origin ?? 'all';
    this.query = initialConfig?.query ?? '';
    this.packId = initialConfig?.packId ?? BOOSTER_PACKS[0].id;
    this.profileId = initialConfig?.profileId ?? 'standard';
    this.seed = initialConfig?.seed ?? 'admin-preview-001';
    this.render();
  }

  config() {
    return {
      tab: this.tab,
      kind: this.kind,
      origin: this.origin,
      query: this.query,
      packId: this.packId,
      profileId: this.profileId,
      seed: this.seed,
    };
  }

  renderCards() {
    const normalizedQuery = this.query.trim().toLocaleLowerCase('ja');
    const filtered = this.entries.filter((entry) => {
      if (this.kind !== 'all' && entry.kind !== this.kind) return false;
      if (this.origin !== 'all' && entry.origin !== this.origin) return false;
      return !normalizedQuery || entrySearchText(entry).includes(normalizedQuery);
    });
    const kindFilters = [
      ['all', 'すべて'], ['monster', 'モンスター'], ['training', 'Training'], ['shugyo', '修行'],
      ['breeder', 'ブリーダー'], ['fusion', '特殊合体'], ['showcase', '特別絵'],
      ['fusion-showcase', '特殊合体特別絵'],
    ];
    const search = el('input', {
      value: this.query,
      attrs: { type: 'search', placeholder: 'カード名・ID・モン類・効果で検索', 'aria-label': '管理者カード検索' },
    });
    const origin = el('select', {
      attrs: { 'aria-label': '入手経路で絞り込み' },
      onchange: (event) => { this.origin = event.target.value; this.render(); },
    }, [
      el('option', { value: 'all', selected: this.origin === 'all', text: '全入手経路' }),
      el('option', { value: 'core', selected: this.origin === 'core', text: '汎用' }),
      el('option', { value: 'trophy', selected: this.origin === 'trophy', text: '奪取限定' }),
      el('option', { value: 'booster', selected: this.origin === 'booster', text: 'ブースター限定・特別絵' }),
      el('option', { value: 'fusion', selected: this.origin === 'fusion', text: '特殊合体' }),
    ]);
    const applySearch = () => { this.query = search.value; this.render(); };
    search.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      applySearch();
    });
    return el('section', { className: 'admin-catalog-pane' }, [
      el('div', { className: 'admin-catalog-toolbar' }, [
        el('div', { className: 'admin-kind-filters' }, kindFilters.map(([id, label]) => {
          const count = this.entries.filter((entry) => id === 'all' || entry.kind === id).length;
          return el('button', {
            className: this.kind === id ? 'selected' : '',
            text: `${label} ${count}`,
            onclick: () => { this.kind = id; this.render(); },
          });
        })),
        el('div', { className: 'admin-search-tools' }, [search, el('button', { className: 'utility-button', text: '検索', onclick: applySearch }), origin]),
      ]),
      el('div', { className: 'admin-result-summary' }, [
        el('strong', { text: `${filtered.length}件表示` }),
        el('span', { text: `基本カード ${this.masterIndex.cards.size} / 特殊合体 ${this.masterIndex.data.fusions.length} / 通常特別絵 ${Object.values(SHOWCASE_VARIANTS).flat().length} / 特殊合体特別絵 ${this.masterIndex.data.fusions.length}` }),
      ]),
      el('div', { className: 'admin-card-grid' }, filtered.map((entry) => adminEntryTile(entry, this.masterIndex))),
    ]);
  }

  renderGacha() {
    const selectedProfile = ADMIN_GUARANTEE_PROFILES.find((entry) => entry.id === this.profileId) ?? ADMIN_GUARANTEE_PROFILES[0];
    const seed = el('input', { value: this.seed, attrs: { 'aria-label': '演出プレビューseed', maxlength: '64' } });
    return el('section', { className: 'admin-gacha-pane' }, [
      el('div', { className: 'admin-preview-note' }, [
        el('strong', { text: 'READ ONLY PREVIEW' }),
        el('span', { text: 'ダイヤ・未所属カード・開封回数は変更されません。' }),
      ]),
      el('div', { className: 'admin-pack-grid' }, BOOSTER_PACKS.map((pack) => el('button', {
        className: `admin-pack-choice${this.packId === pack.id ? ' selected' : ''}`,
        attrs: { style: `--pack-color:${pack.color}`, type: 'button' },
        onclick: () => { this.packId = pack.id; this.render(); },
      }, [
        el('i', { text: pack.sigil }),
        el('div', {}, [el('small', { text: `${pack.faction} BOOSTER` }), el('strong', { text: pack.name }), el('span', { text: pack.description })]),
      ]))),
      el('div', { className: 'admin-preview-controls' }, [
        el('div', { className: 'admin-profile-options' }, ADMIN_GUARANTEE_PROFILES.map((profile) => el('button', {
          className: this.profileId === profile.id ? 'selected' : '',
          onclick: () => { this.profileId = profile.id; this.render(); },
        }, [el('strong', { text: profile.name }), el('small', { text: profile.copy })]))),
        el('label', { className: 'admin-seed-field' }, [el('span', { text: '演出seed' }), seed]),
        el('button', {
          className: 'primary-button admin-preview-button',
          text: `${selectedProfile.name}で演出を再生`,
          onclick: () => {
            this.seed = seed.value.trim() || `admin-${Date.now()}`;
            const pendingPack = generateAdminPreviewPack({
              masterIndex: this.masterIndex,
              packId: this.packId,
              profileId: this.profileId,
              seed: this.seed,
            });
            this.onPreview(pendingPack, this.config());
          },
        }),
      ]),
    ]);
  }

  render() {
    replace(this.root, el('main', { className: 'admin-tool-screen' }, [
      el('header', { className: 'screen-header admin-header' }, [
        el('div', {}, [el('p', { className: 'eyebrow', text: 'ADMINISTRATION / READ ONLY' }), el('h1', { text: '管理者ツール' })]),
        el('div', { className: 'admin-header-summary' }, [
          el('span', { text: `基本 ${this.masterIndex.cards.size}` }),
          el('span', { text: `合体 ${this.masterIndex.data.fusions.length}` }),
          el('span', { text: '資産変更なし' }),
        ]),
        el('button', { className: 'utility-button', text: 'ホームへ', onclick: this.onBack }),
      ]),
      el('nav', { className: 'admin-tabs', attrs: { 'aria-label': '管理者ツール機能' } }, [
        el('button', { className: this.tab === 'cards' ? 'selected' : '', text: '全カード一覧', onclick: () => { this.tab = 'cards'; this.render(); } }),
        el('button', { className: this.tab === 'gacha' ? 'selected' : '', text: 'ガチャ演出確認', onclick: () => { this.tab = 'gacha'; this.render(); } }),
      ]),
      this.tab === 'gacha' ? this.renderGacha() : this.renderCards(),
    ]));
  }
}
