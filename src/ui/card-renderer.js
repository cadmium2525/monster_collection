import { effectiveAtk, effectiveDef } from '../battle/state.js';
import { shugyoMovePoolType } from '../battle/shugyo.js';
import { el } from './dom.js';
import { openModal } from './modal.js';

const FACTION_CLASS = Object.freeze({
  '無機': 'faction-inorganic',
  '創造': 'faction-creation',
  '幻霊': 'faction-spirit',
  '魔族': 'faction-demon',
  '獣族': 'faction-beast',
  '怪物': 'faction-monster',
});

const SPECIAL_FUSION_NAMES = Object.freeze([
  'フューチャー', 'ナハトファルター', 'ガルーダ', 'グレイシア', 'ハムライガー', 'エコノキックス',
  'ヴァージアハピ', 'ダークハム', 'アンキロックス', 'ガリニクス', 'オチムシャ', 'オキクサン',
  'トカゲムシ', 'ブルードリル', 'フレアデス', 'サクラチル', 'ワイルドブロック', 'ジュラスウォール',
  'アンゴルモア', 'タイラント', 'オメガレックス', 'エンドブリンガー', 'ラプタ', 'アオサギビ',
  'ガリオン', 'カラフルマスク', 'ラブラブセイジン', 'ユーマ', 'セイレーン', 'ヤオビクニ',
  'ヨロイモッチー', 'モチモチエイト', 'ベニヒメソウ', 'ウスバカゲソウ', 'ラグナロックス', 'クレバス',
]);

const SUPPORT_CARD_IDS = Object.freeze([
  'training-life', 'training-atk', 'training-def', 'shugyo-attack', 'shugyo-defense',
  ...Array.from({ length: 20 }, (_, index) => `breeder-${String(index + 1).padStart(3, '0')}`),
]);

function atlasPosition(index, columns, rows) {
  if (!Number.isInteger(index) || index < 0 || index >= columns * rows) return null;
  const x = columns === 1 ? 0 : (index % columns) * (100 / (columns - 1));
  const y = rows === 1 ? 0 : Math.floor(index / columns) * (100 / (rows - 1));
  return `--art-x:${x}%;--art-y:${y}%`;
}

export function cardArtPlacement(definition, unit = null, cardAsset = null) {
  if (definition.kind !== 'monster') {
    const breederNumber = definition.kind === 'breeder' ? Number(definition.id.match(/(\d+)$/)?.[1]) : 0;
    if (breederNumber > 20 && breederNumber <= 40) {
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
  const fusionFromId = Number(unit?.specialFusionId?.match(/(\d+)$/)?.[1]) - 1;
  const fusionIndex = Number.isInteger(fusionFromId) && fusionFromId >= 0
    ? fusionFromId
    : SPECIAL_FUSION_NAMES.indexOf(unit?.specialForm);
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
}) {
  const meta = cardMeta(definition, unit, growth);
  const art = cardArtPlacement(definition, unit, cardAsset);
  const statuses = unit ? Object.values(unit.statuses ?? {}).filter((value) => value === true || (typeof value === 'number' && value > 0)) : [];
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
    interactive ? '' : 'static',
    definition.kind === 'monster' && (cardAsset?.finish ?? unit?.finish) === 'foil' ? 'finish-foil' : '',
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
    statuses.length ? el('span', { className: 'status-dots', attrs: { 'aria-label': `状態変化${statuses.length}件` } }, statuses.slice(0, 4).map(() => el('i'))) : null,
  ]);
  return node;
}

export function renderMonsterPortrait(definition, label = definition.name) {
  const art = cardArtPlacement(definition);
  return el('div', {
    className: `monster-portrait ${FACTION_CLASS[definition.faction] ?? ''}`,
    attrs: { role: 'img', 'aria-label': label, style: art.style },
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
  const art = cardArtPlacement(definition, unit, cardAsset);
  const summary = isMonster ? el('section', { className: 'detail-summary' }, [
    el('div', {
      className: `card-art ${art.className} ${FACTION_CLASS[unit?.faction ?? definition.faction] ?? ''}`,
      attrs: { style: art.style },
    }),
    el('dl', {}, [
      el('dt', { text: 'モン類' }), el('dd', { text: unit?.faction ?? definition.faction }),
      el('dt', { text: '役割' }), el('dd', { text: definition.role }),
      el('dt', { text: '召喚TP' }), el('dd', { text: definition.summonTp }),
      el('dt', { text: 'LIFE' }), el('dd', { text: unit ? Math.max(0, unit.life) : definition.base.life + (growth?.life ?? 0) }),
      el('dt', { text: 'ATK' }), el('dd', { text: unit ? effectiveAtk(unit) : definition.base.atk + (growth?.atk ?? 0) }),
      el('dt', { text: 'DEF' }), el('dd', { text: unit ? effectiveDef(unit) : definition.base.def + (growth?.def ?? 0) }),
    ]),
    el('div', { className: 'trait-box' }, [
      el('strong', { text: trait.name }),
      el('br'),
      trait.effect,
    ]),
  ]) : el('section', { className: 'detail-summary' }, [
    el('div', {
      className: `card-art ${art.className}`.trim(),
      attrs: art.style ? { style: art.style } : null,
    }),
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
