import { effectiveAtk, effectiveDef } from '../battle/state.js';
import { shugyoMovePoolType } from '../battle/shugyo.js';
import { el } from './dom.js';
import { openModal } from './modal.js';
import { unitLifePresentation, unitStatusEntries, unitStatusGroups } from './status-presentation.js';

const FACTION_CLASS = Object.freeze({
  '無機': 'faction-inorganic',
  '創造': 'faction-creation',
  '幻霊': 'faction-spirit',
  '魔族': 'faction-demon',
  '獣族': 'faction-beast',
  '怪物': 'faction-monster',
});

const SPECIAL_FUSION_NAMES = Object.freeze([
  'フューチャー', 'ルナモルフォ', 'ガルーダ', 'フロストヴァンガード', 'ゴウライウルフ', 'ヴェルデボルト',
  'フェイグラップラー', 'オブシディアンコング', 'バスティオンレックス', 'アルカノレックス', 'オチムシャ', 'オキクサン',
  'ドラコワーム', 'アズールドリル', 'インフェルノジャッジ', '花葬ラビリス', 'ビーストバスティオン', 'レックスメンヒル',
  'アンゴルモア', 'タイラント', 'アイギスラプトル', 'デスギアリーパー', 'イグニギア', 'アオサギビ',
  'マスクドヴァジュラ', 'プリズムアルカナ', 'コズミックミューズ', 'ユーマ', 'セイレーン', 'ヤオビクニ',
  'アイギスルミラビ', 'ルミギア・オクト', 'クリムゾンフローラ', 'シャドウリーフ', 'オブシディアーク', 'クレバス',
  'ファントムギア', 'アルケノクロック', 'ソルフェニキア', 'ネビュラミア', 'アストラレイ', 'エクリプスレイ',
  'ノクスオラクル', 'フェンリルノクス', 'ガイアヴォルフ', 'ベヒモスファング', 'オベリスクグラトン', 'クロノヴォア',
]);

const SUPPORT_CARD_IDS = Object.freeze([
  'training-life', 'training-atk', 'training-def', 'shugyo-attack', 'shugyo-defense',
  ...Array.from({ length: 20 }, (_, index) => `breeder-${String(index + 1).padStart(3, '0')}`),
]);

let lazyArtObserver = null;

function artObserver() {
  if (typeof IntersectionObserver !== 'function') return null;
  if (!lazyArtObserver) {
    lazyArtObserver = new IntersectionObserver((entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const style = entry.target.dataset.lazyArtStyle;
        if (style) entry.target.setAttribute('style', style);
        delete entry.target.dataset.lazyArtStyle;
        observer.unobserve(entry.target);
      }
    }, { rootMargin: '320px 0px' });
  }
  return lazyArtObserver;
}

export function deferCardArt(node) {
  const observer = artObserver();
  if (!observer) return node;
  const artNodes = node.classList?.contains('card-art')
    ? [node]
    : [...(node.querySelectorAll?.('.card-art') ?? [])];
  for (const artNode of artNodes) {
    const style = artNode.getAttribute('style');
    // アトラスは全カードで共有するため、単体画像URLだけを遅延設定する。
    if (!style?.includes('url(')) continue;
    artNode.removeAttribute('style');
    artNode.dataset.lazyArtStyle = style;
    observer.observe(artNode);
  }
  return node;
}

function atlasPosition(index, columns, rows) {
  if (!Number.isInteger(index) || index < 0 || index >= columns * rows) return null;
  const x = columns === 1 ? 0 : (index % columns) * (100 / (columns - 1));
  const y = rows === 1 ? 0 : Math.floor(index / columns) * (100 / (rows - 1));
  return `--art-x:${x}%;--art-y:${y}%`;
}

function specialFusionIndex(unit) {
  const fusionFromId = Number(unit?.specialFusionId?.match(/(\d+)$/)?.[1]) - 1;
  return Number.isInteger(fusionFromId) && fusionFromId >= 0
    ? fusionFromId
    : SPECIAL_FUSION_NAMES.indexOf(unit?.specialForm);
}

export function catalogCardThumbnailPlacement(definition) {
  let index = -1;
  if (definition.kind === 'monster') {
    index = Number(definition.id.match(/(\d+)$/)?.[1]) - 1;
  } else if (definition.id.startsWith('breeder-')) {
    const number = Number(definition.id.match(/(\d+)$/)?.[1]);
    index = number <= 20 ? 28 + number : 49 + (number - 21);
  } else {
    const supportIndex = SUPPORT_CARD_IDS.indexOf(definition.id);
    index = supportIndex >= 0 ? 24 + supportIndex : -1;
  }
  return {
    className: 'catalog-thumbnail-art',
    style: atlasPosition(index, 9, 9),
  };
}

export function catalogFusionThumbnailPlacement(fusion) {
  const index = Number(fusion?.id?.match(/(\d+)$/)?.[1]) - 1;
  return {
    className: 'fusion-thumbnail-art',
    style: atlasPosition(index, 8, 6),
  };
}

export function isFoilAppearance(definition, unit = null, cardAsset = null) {
  if (definition.kind !== 'monster') return false;
  if ((cardAsset?.finish ?? unit?.finish) === 'foil') return true;
  const artVariantId = cardAsset?.artVariantId ?? unit?.artVariantId ?? 'base';
  const fusionIndex = specialFusionIndex(unit);
  return artVariantId !== 'base' && fusionIndex >= 0 && fusionIndex < SPECIAL_FUSION_NAMES.length;
}

export function cardArtPlacement(definition, unit = null, cardAsset = null) {
  if (definition.kind !== 'monster') {
    const breederNumber = definition.kind === 'breeder' ? Number(definition.id.match(/(\d+)$/)?.[1]) : 0;
    if (breederNumber > 20 && breederNumber <= 52) {
      return {
        className: 'support-card-art standalone-support-art',
        style: `--support-art:url("./assets/images/breeders/${definition.id}.webp")`,
      };
    }
    const supportIndex = SUPPORT_CARD_IDS.indexOf(definition.id);
    return {
      className: supportIndex >= 0 ? 'support-card-art legacy-name-safe-art' : '',
      style: atlasPosition(supportIndex, 5, 5),
    };
  }

  const artVariantId = definition.kind === 'monster'
    ? cardAsset?.artVariantId ?? unit?.artVariantId ?? 'base'
    : 'base';
  const fusionIndex = specialFusionIndex(unit);
  if (fusionIndex >= 0 && fusionIndex < SPECIAL_FUSION_NAMES.length) {
    const fusionAssetId = `fusion-${String(fusionIndex + 1).padStart(3, '0')}`;
    if (artVariantId !== 'base') {
      return {
        className: 'monster-art special-fusion-art standalone-fusion-art showcase-fusion-art',
        style: `--monster-art:url("./assets/images/showcase-fusions/showcase-${fusionAssetId}.webp")`,
      };
    }
    const horizontalCorrection = fusionIndex === 27 ? ';--fusion-art-x:8%' : '';
    return {
      className: 'monster-art special-fusion-art standalone-fusion-art',
      style: `--monster-art:url("./assets/images/special-fusions/${fusionAssetId}.webp")${horizontalCorrection}`,
    };
  }

  if (artVariantId !== 'base') {
    return {
      className: 'monster-art standalone-monster-art showcase-monster-art',
      style: `--monster-art:url("./assets/images/showcase/${artVariantId}.webp")`,
    };
  }

  const index = Number(definition.id.match(/(\d+)$/)?.[1]) - 1;
  if (index >= 18) {
    return {
      className: 'monster-art standalone-monster-art booster-monster-art',
      style: `--monster-art:url("./assets/images/booster/${definition.id}.webp")`,
    };
  }
  return {
    className: 'monster-art legacy-name-safe-art',
    style: atlasPosition(index, 6, 3),
  };
}

export function resolvedTrait(definition, unit) {
  if (!unit?.specialForm) return definition.trait;
  return {
    name: '特殊特性',
    effect: typeof unit.specialTrait === 'string' ? unit.specialTrait : unit.specialTrait?.effect ?? definition.trait.effect,
  };
}

export function cardDisplayStats(definition, unit = null, growth = null) {
  if (definition.kind !== 'monster') return null;
  if (unit) return { life: Math.max(0, unit.life), atk: effectiveAtk(unit), def: effectiveDef(unit) };
  return {
    life: definition.base.life + Math.max(0, Number(growth?.life) || 0),
    atk: definition.base.atk + Math.max(0, Number(growth?.atk) || 0),
    def: definition.base.def + Math.max(0, Number(growth?.def) || 0),
  };
}

function cardMeta(definition, unit, growth) {
  if (definition.kind === 'monster') {
    return {
      cost: definition.summonTp,
      stats: cardDisplayStats(definition, unit, growth),
      faction: unit?.faction ?? definition.faction,
    };
  }
  return {
    cost: definition.tp,
    kind: definition.kind === 'breeder' ? 'ブリーダー' : definition.kind === 'shugyo' ? '修行' : 'Training',
    stats: null,
    faction: null,
  };
}

function cornerBadge(kind, value, label) {
  return el('span', {
    className: `card-corner card-${kind}`,
    attrs: { 'aria-label': label },
  }, [
    el('i', { attrs: { 'aria-hidden': 'true' } }),
    el('b', { text: String(value) }),
  ]);
}

export function renderCard({
  definition,
  unit = null,
  growth = null,
  selected = false,
  disabled = false,
  onClick,
  onPointerDown = null,
  label,
  interactive = true,
  showMonsterEffect = true,
  dragReady = false,
  cardAsset = null,
  lazyArt = false,
  thumbnailArt = false,
}) {
  const meta = cardMeta(definition, unit, growth);
  const art = thumbnailArt
    ? catalogCardThumbnailPlacement(definition)
    : cardArtPlacement(definition, unit, cardAsset);
  const life = unit ? unitLifePresentation(unit) : null;
  const statusGroups = unitStatusGroups(unit);
  const name = unit?.specialForm ?? definition.name;
  const classes = [
    'game-card',
    `kind-${definition.kind}`,
    FACTION_CLASS[meta.faction] ?? '',
    selected ? 'selected' : '',
    disabled ? 'disabled' : '',
    definition.kind === 'monster' && !showMonsterEffect ? 'effect-hidden' : '',
    dragReady ? 'drag-ready' : '',
    unit && (unit.actionPoints <= 0 || unit.summonedThisTurn || unit.stunnedThisTurn) ? 'exhausted' : '',
    life?.low ? 'life-critical' : '',
    interactive ? '' : 'static',
    isFoilAppearance(definition, unit, cardAsset) ? 'finish-foil' : '',
    definition.kind === 'monster' && (cardAsset?.artVariantId ?? unit?.artVariantId ?? 'base') !== 'base' ? 'variant-showcase' : '',
  ].filter(Boolean).join(' ');
  const node = el(interactive ? 'button' : 'div', {
    className: classes,
    attrs: interactive
      ? { type: 'button', 'aria-label': label ?? `${name}の詳細と行動を表示` }
      : { role: 'img', 'aria-label': label ?? name },
    onclick: interactive ? onClick : null,
    onpointerdown: interactive ? onPointerDown : null,
  }, [
    el('div', { className: 'card-top' }, [
      el('span', { className: 'card-name' }, [
        el('b', { text: name }),
      ]),
    ]),
    el('div', {
      className: `card-art ${art.className}`.trim(),
      attrs: art.style ? { style: art.style } : null,
    }, [
      definition.kind === 'monster' ? null : el('span', { className: 'card-kind', text: meta.kind }),
    ]),
    meta.stats ? cornerBadge('life', meta.stats.life, `LIFE ${meta.stats.life}`) : null,
    cornerBadge('cost', meta.cost, `${meta.cost}TP`),
    meta.stats ? cornerBadge('atk', meta.stats.atk, `ATK ${meta.stats.atk}`) : null,
    meta.stats ? cornerBadge('def', meta.stats.def, `DEF ${meta.stats.def}`, '') : null,
    statusGroups.length ? el('span', {
      className: 'status-indicators',
      attrs: { 'aria-label': statusGroups.map((group) => `${group.label}、${group.count}件`).join('。') },
    }, statusGroups.map((group) => el('i', {
      className: `status-indicator ${group.tone}`,
      attrs: { title: group.label, 'aria-hidden': 'true' },
    }, [
      el('b', { text: group.icon }),
      group.count > 1 ? el('small', { text: group.count }) : null,
    ]))) : null,
  ]);
  return lazyArt ? deferCardArt(node) : node;
}

export function renderDetailArtwork({ definition, unit = null, cardAsset = null, label = definition.name }) {
  const art = cardArtPlacement(definition, unit, cardAsset);
  const standaloneUrl = art.style?.match(/--(?:monster|support)-art:url\("([^"]+)"\)/)?.[1] ?? null;
  const foilClass = isFoilAppearance(definition, unit, cardAsset) ? ' finish-foil-art' : '';
  if (standaloneUrl) {
    return el('div', {
      className: `detail-art-frame ${art.className}${foilClass}`.trim(),
      attrs: { role: 'img', 'aria-label': label },
    }, el('img', {
      className: 'detail-art-image',
      attrs: { src: standaloneUrl, alt: '', decoding: 'async' },
    }));
  }
  return el('div', {
    className: `card-art detail-atlas-art ${art.className} ${FACTION_CLASS[unit?.faction ?? definition.faction] ?? ''}${foilClass}`.trim(),
    attrs: art.style ? { style: art.style, role: 'img', 'aria-label': label } : { role: 'img', 'aria-label': label },
  });
}

export function monsterPortraitPresentation(definition, cardAsset = null) {
  const art = cardArtPlacement(definition, null, cardAsset);
  return {
    className: `monster-portrait ${art.className} ${FACTION_CLASS[definition.faction] ?? ''} ${isFoilAppearance(definition, null, cardAsset) ? 'finish-foil' : ''}`.trim(),
    style: art.style,
  };
}

export function renderMonsterPortrait(definition, label = definition.name, cardAsset = null) {
  const presentation = monsterPortraitPresentation(definition, cardAsset);
  return el('div', {
    className: presentation.className,
    attrs: { role: 'img', 'aria-label': label, style: presentation.style },
  });
}

function currentMoveSets(definition, unit, growth, masterIndex) {
  const initial = definition.moveIds.filter((id) => masterIndex.moves.get(id)?.initial);
  const learned = new Set(unit?.learnedMoveIds ?? [...new Set([...initial, ...(growth?.learnedMoveIds ?? [])])]);
  const equipped = new Set(unit?.equippedMoveIds ?? growth?.equippedMoveIds ?? [...learned].slice(0, 4));
  return { learned, equipped };
}

function moveLearningLabel(definition, move, masterIndex) {
  if (move.initial) return '初期習得';
  const poolType = shugyoMovePoolType(masterIndex.data, definition.name, move.name);
  if (poolType === 'attack') return '攻撃修行';
  if (poolType === 'defense') return '防御修行';
  return '習得方法不明';
}

export function detailMoveEntries({ definition, unit = null, growth = null, masterIndex, moveView = 'catalog' }) {
  const { learned, equipped } = currentMoveSets(definition, unit, growth, masterIndex);
  const moveIds = moveView === 'battle'
    ? definition.moveIds.filter((moveId) => equipped.has(moveId))
    : definition.moveIds;
  return moveIds.map((moveId) => {
    const move = masterIndex.moves.get(moveId);
    return {
      move,
      equipped: moveView === 'battle' && equipped.has(moveId),
      learned: learned.has(moveId),
      label: moveView === 'battle' ? '実戦' : moveLearningLabel(definition, move, masterIndex),
    };
  }).filter((entry) => entry.move);
}

function moveRows({ definition, unit, growth, masterIndex, moveView, selectableMoveIds, onMoveSelect, closeDetails }) {
  const selectable = new Set(selectableMoveIds ?? []);
  return detailMoveEntries({ definition, unit, growth, masterIndex, moveView }).map(({ move, equipped, label }) => {
    return el('tr', { className: equipped ? 'equipped' : '' }, [
      el('td', { text: label }),
      el('td', {}, onMoveSelect ? el('button', {
        className: 'move-choice',
        text: move.name,
        disabled: !selectable.has(move.id),
        attrs: { type: 'button', 'aria-label': selectable.has(move.id) ? `${move.name}を選択` : `${move.name}は現在使用できません` },
        onclick: () => {
          closeDetails();
          onMoveSelect(move);
        },
      }) : move.name),
      el('td', { text: move.rank }),
      el('td', { text: move.power ?? '—' }),
      el('td', { text: move.tp }),
      el('td', { text: move.effect || '—' }),
    ]);
  });
}

export function openCardDetails({
  definition,
  unit = null,
  masterIndex,
  growth = null,
  selectableMoveIds = [],
  onMoveSelect = null,
  cardAsset = null,
  moveView = 'catalog',
}) {
  const isMonster = definition.kind === 'monster';
  const name = unit?.specialForm ?? definition.name;
  const trait = isMonster ? resolvedTrait(definition, unit) : null;
  const life = unit ? unitLifePresentation(unit) : null;
  const statusEntries = unitStatusEntries(unit);
  const summary = isMonster ? el('section', { className: 'detail-summary' }, [
    renderDetailArtwork({ definition, unit, cardAsset, label: name }),
    el('dl', {}, [
      el('dt', { text: 'モン類' }), el('dd', { text: unit?.faction ?? definition.faction }),
      el('dt', { text: '役割' }), el('dd', { text: definition.role }),
      el('dt', { text: '召喚TP' }), el('dd', { text: definition.summonTp }),
      el('dt', { text: 'LIFE' }), el('dd', {
        text: unit
          ? `${life.current} / ${life.max}（${life.percentage}%）`
          : definition.base.life + (growth?.life ?? 0),
      }),
      el('dt', { text: 'ATK' }), el('dd', { text: unit ? effectiveAtk(unit) : definition.base.atk + (growth?.atk ?? 0) }),
      el('dt', { text: 'DEF' }), el('dd', { text: unit ? effectiveDef(unit) : definition.base.def + (growth?.def ?? 0) }),
    ]),
    el('div', { className: 'trait-box' }, [
      el('strong', { text: trait.name }),
      el('br'),
      trait.effect,
    ]),
    unit && life.low ? el('div', { className: 'life-condition-active' }, [
      el('strong', { text: 'LIFE50%以下' }),
      el('span', { text: '割合条件が発動中です' }),
    ]) : null,
    unit ? el('section', { className: 'detail-status-list' }, [
      el('strong', { text: '現在の状態' }),
      statusEntries.length ? el('ul', {}, statusEntries.map((entry) => el('li', { className: entry.tone }, [
        el('i', { text: entry.icon, attrs: { 'aria-hidden': 'true' } }),
        el('span', {}, [
          el('b', { text: entry.label }),
          el('small', { text: entry.detail }),
        ]),
      ]))) : el('p', { text: '状態変化なし' }),
    ]) : null,
  ]) : el('section', { className: 'detail-summary' }, [
    renderDetailArtwork({ definition, unit, cardAsset, label: name }),
    el('dl', {}, [
      el('dt', { text: '種類' }), el('dd', { text: definition.kind === 'breeder' ? 'ブリーダー' : definition.kind === 'shugyo' ? '修行' : 'Training' }),
      el('dt', { text: '使用TP' }), el('dd', { text: definition.tp }),
    ]),
    el('div', { className: 'trait-box', text: definition.effect }),
  ]);

  let modalController = null;
  const battleMoveView = moveView === 'battle';
  const moves = isMonster ? el('section', { className: 'known-moves' }, [
    el('div', { className: 'moves-heading' }, [
      el('strong', { text: battleMoveView ? '現在の実戦技' : '全技一覧' }),
      onMoveSelect ? el('small', { text: '使用する実戦技をタップ' }) : null,
    ]),
    el('table', { className: 'moves-table' }, [
      el('thead', {}, el('tr', {}, [battleMoveView ? '状態' : '習得方法', '技名', 'Rank', '威力', 'TP', '追加効果'].map((text) => el('th', { text })))),
      el('tbody', {}, moveRows({
        definition,
        unit,
        growth,
        masterIndex,
        moveView,
        selectableMoveIds,
        onMoveSelect,
        closeDetails: () => modalController?.close(),
      })),
    ]),
  ]) : el('section');

  modalController = openModal({
    title: name,
    content: el('div', { className: 'detail-grid' }, [summary, moves]),
  });
  return modalController;
}
