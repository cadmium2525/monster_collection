import { effectiveAtk, effectiveDef } from '../battle/state.js';
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

const FACTION_SIGIL = Object.freeze({
  '無機': '◇', '創造': '✦', '幻霊': '☾', '魔族': '◆', '獣族': '牙', '怪物': '爪',
});

function cardMeta(definition, unit) {
  if (definition.kind === 'monster') {
    const stats = unit
      ? { life: `${Math.max(0, unit.life)}/${unit.maxLife}`, atk: effectiveAtk(unit), def: effectiveDef(unit) }
      : { life: definition.base.life, atk: definition.base.atk, def: definition.base.def };
    return {
      cost: definition.summonTp,
      kind: unit?.specialForm ? `特殊合体 ${unit.fusionStage}` : `${definition.faction} / ${definition.role}`,
      stats,
      effect: unit?.specialTrait?.effect ?? definition.trait.effect,
      faction: unit?.faction ?? definition.faction,
    };
  }
  return {
    cost: definition.tp,
    kind: definition.kind === 'breeder' ? 'ブリーダー' : definition.kind === 'shugyo' ? '修行' : 'Training',
    stats: null,
    effect: definition.effect,
    faction: null,
  };
}

export function renderCard({ definition, unit = null, selected = false, disabled = false, onClick, label }) {
  const meta = cardMeta(definition, unit);
  const statuses = unit ? Object.values(unit.statuses ?? {}).filter((value) => value === true || (typeof value === 'number' && value > 0)) : [];
  const name = unit?.specialForm ?? definition.name;
  const classes = [
    'game-card',
    FACTION_CLASS[meta.faction] ?? '',
    selected ? 'selected' : '',
    disabled ? 'disabled' : '',
    unit && (unit.actionPoints <= 0 || unit.summonedThisTurn || unit.stunnedThisTurn) ? 'exhausted' : '',
  ].filter(Boolean).join(' ');
  const node = el('button', {
    className: classes,
    attrs: { type: 'button', 'aria-label': label ?? `${name}の詳細と行動を表示` },
    onclick: onClick,
  }, [
    el('div', { className: 'card-top' }, [
      el('span', { className: 'card-name', text: name }),
      el('span', { className: 'card-cost', text: `${meta.cost}TP` }),
    ]),
    el('div', { className: 'card-art' }, [
      el('span', { className: 'card-sigil', text: FACTION_SIGIL[meta.faction] ?? (definition.kind === 'breeder' ? '指' : '鍛') }),
      el('span', { className: 'card-kind', text: meta.kind }),
    ]),
    meta.stats ? el('div', { className: 'card-stats' }, [
      el('span', { text: `L ${meta.stats.life}` }),
      el('span', { text: `A ${meta.stats.atk}` }),
      el('span', { text: `D ${meta.stats.def}` }),
    ]) : null,
    el('div', { className: 'card-effect', text: meta.effect }),
    statuses.length ? el('span', { className: 'status-dots', attrs: { 'aria-label': `状態変化${statuses.length}件` } }, statuses.slice(0, 4).map(() => el('i'))) : null,
  ]);
  return node;
}

function moveRows(definition, unit, masterIndex) {
  const learned = new Set(unit?.learnedMoveIds ?? definition.moveIds.filter((id) => masterIndex.moves.get(id)?.initial));
  const equipped = new Set(unit?.equippedMoveIds ?? [...learned].slice(0, 4));
  return definition.moveIds.map((moveId) => {
    const move = masterIndex.moves.get(moveId);
    const state = equipped.has(moveId) ? '実戦' : learned.has(moveId) ? '習得' : '未習得';
    return el('tr', { className: equipped.has(moveId) ? 'equipped' : '' }, [
      el('td', { text: state }),
      el('td', { text: move.name }),
      el('td', { text: move.rank }),
      el('td', { text: move.power ?? '—' }),
      el('td', { text: move.tp }),
      el('td', { text: move.effect || '—' }),
    ]);
  });
}

export function openCardDetails({ definition, unit = null, masterIndex, growth = null }) {
  const isMonster = definition.kind === 'monster';
  const name = unit?.specialForm ?? definition.name;
  const summary = isMonster ? el('section', { className: 'detail-summary' }, [
    el('div', { className: `card-art ${FACTION_CLASS[unit?.faction ?? definition.faction] ?? ''}` }, [
      el('span', { className: 'card-sigil', text: FACTION_SIGIL[unit?.faction ?? definition.faction] }),
    ]),
    el('dl', {}, [
      el('dt', { text: 'モン類' }), el('dd', { text: unit?.faction ?? definition.faction }),
      el('dt', { text: '召喚TP' }), el('dd', { text: definition.summonTp }),
      el('dt', { text: 'LIFE' }), el('dd', { text: unit ? `${unit.life}/${unit.maxLife}` : definition.base.life + (growth?.life ?? 0) }),
      el('dt', { text: 'ATK' }), el('dd', { text: unit ? effectiveAtk(unit) : definition.base.atk + (growth?.atk ?? 0) }),
      el('dt', { text: 'DEF' }), el('dd', { text: unit ? effectiveDef(unit) : definition.base.def + (growth?.def ?? 0) }),
      el('dt', { text: '合体段階' }), el('dd', { text: unit?.fusionStage ?? 0 }),
      el('dt', { text: '行動権' }), el('dd', { text: unit ? Math.max(0, unit.actionPoints) : '—' }),
    ]),
    el('div', { className: 'trait-box' }, [
      el('strong', { text: unit?.specialTrait?.name ?? definition.trait.name }),
      el('br'),
      unit?.specialTrait?.effect ?? definition.trait.effect,
    ]),
    el('p', { className: 'legacy-note', text: '距離システムは廃止済みです。すべての実戦技は任意の合法対象へ使用できます。' }),
  ]) : el('section', { className: 'detail-summary' }, [
    el('dl', {}, [
      el('dt', { text: '種類' }), el('dd', { text: definition.kind === 'breeder' ? 'ブリーダー' : definition.kind === 'shugyo' ? '修行' : 'Training' }),
      el('dt', { text: '使用TP' }), el('dd', { text: definition.tp }),
    ]),
    el('div', { className: 'trait-box', text: definition.effect }),
  ]);

  const moves = isMonster ? el('section', {}, [
    el('table', { className: 'moves-table' }, [
      el('thead', {}, el('tr', {}, ['状態', '技名', 'Rank', '威力', 'TP', '追加効果'].map((text) => el('th', { text })))),
      el('tbody', {}, moveRows(definition, unit, masterIndex)),
    ]),
  ]) : el('section');

  return openModal({
    title: name,
    content: el('div', { className: 'detail-grid' }, [summary, moves]),
  });
}
