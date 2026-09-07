import { createMasterIndex, loadMasterData } from '../../src/data/master-loader.js';
import { detailMoveEntries, renderCard } from '../../src/ui/card-renderer.js';
import { DECK_CARD_SORT_OPTIONS, sortDeckCards } from '../../src/ui/deck-card-sort.js';

const deckIds = [
  ...Array.from({ length: 4 }, (_, index) => Array(3).fill(`monster-${String(index + 1).padStart(3, '0')}`)).flat(),
  ...Array.from({ length: 6 }, (_, index) => Array(2).fill(`monster-${String(index + 5).padStart(3, '0')}`)).flat(),
  ...Array.from({ length: 8 }, (_, index) => `breeder-${String(index + 1).padStart(3, '0')}`),
  'training-life', 'training-atk', 'training-def', 'shugyo-attack', 'shugyo-defense',
  'breeder-009', 'breeder-010', 'breeder-011',
];

const candidateIds = [
  ...Array.from({ length: 18 }, (_, index) => `monster-${String(index + 13).padStart(3, '0')}`),
  ...Array.from({ length: 18 }, (_, index) => `breeder-${String(index + 12).padStart(3, '0')}`),
];

const root = document.querySelector('#prototype-root');
const deckGrid = document.querySelector('#deck-grid');
const candidateGrid = document.querySelector('#candidate-grid');
const inspector = document.querySelector('#card-inspector');
const deckSummary = document.querySelector('#deck-summary');
const toast = document.querySelector('.prototype-toast');
const guideItems = [...document.querySelectorAll('.edit-guide li')];
let toastTimer = 0;
let activeFilter = 'all';
let deckSortMode = 'kind';
let candidateSortMode = 'kind';
let selectedDeckIndex = 0;
let selectedCandidateIndex = null;
let inspectorSource = 'deck';

function asset(masterId, instanceId) {
  return { masterId, instanceId, artVariantId: 'base', finish: 'normal' };
}

let deck = deckIds.map((masterId, index) => asset(masterId, `prototype-deck-${index + 1}`));
let candidates = candidateIds.map((masterId, index) => asset(masterId, `prototype-pool-${index + 1}`));
const master = await loadMasterData();
const masterIndex = createMasterIndex(master);

function announce(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 1800);
}

function cardDefinition(card) {
  return masterIndex.cards.get(card.masterId);
}

function kindLabel(definition) {
  if (definition.kind === 'monster') return 'モンスター';
  if (definition.kind === 'breeder') return 'ブリーダー';
  if (definition.kind === 'training') return 'トレーニング';
  return definition.kind === 'shugyo' ? '修行' : definition.kind;
}

function cardCost(definition) {
  return definition.kind === 'monster' ? definition.summonTp : definition.tp;
}

function node(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== '') element.textContent = text;
  return element;
}

function visibleForFilter(definition) {
  if (activeFilter === 'monster') return definition.kind === 'monster';
  if (activeFilter === 'support') return definition.kind !== 'monster';
  return true;
}

function populateSortControl(select, selectedValue) {
  select.replaceChildren(...DECK_CARD_SORT_OPTIONS.map(({ id, label }) => {
    const option = node('option', '', label);
    option.value = id;
    option.selected = id === selectedValue;
    return option;
  }));
}

function groupedCards(cards, sortMode) {
  const sorted = sortDeckCards(cards, masterIndex, sortMode);
  const groups = new Map();
  for (const card of sorted) {
    const existing = groups.get(card.masterId);
    if (existing) existing.push(card);
    else groups.set(card.masterId, [card]);
  }
  return [...groups.values()];
}

function selectDeckCard(index) {
  selectedDeckIndex = index;
  selectedCandidateIndex = null;
  inspectorSource = 'deck';
  render();
}

function selectCandidate(index) {
  selectedCandidateIndex = index;
  inspectorSource = 'candidate';
  render();
}

function renderDeck() {
  const groups = groupedCards(deck, deckSortMode);
  deckGrid.replaceChildren(...groups.map((cards) => {
    const card = cards[0];
    const index = deck.indexOf(card);
    const definition = cardDefinition(card);
    const shell = node('div', `deck-slot${index === selectedDeckIndex ? ' is-selected' : ''}${visibleForFilter(definition) ? '' : ' is-hidden'}`);
    shell.append(renderCard({
      definition,
      cardAsset: card,
      thumbnailArt: true,
      selected: index === selectedDeckIndex,
      label: `${definition.name}を交換元として選択`,
      onClick: () => selectDeckCard(index),
    }));
    if (cards.length > 1) shell.append(node('span', 'stack-count', `×${cards.length}`));
    return shell;
  }));
}

function renderCandidates() {
  const sortedCandidates = sortDeckCards(candidates, masterIndex, candidateSortMode);
  candidateGrid.replaceChildren(...sortedCandidates.map((card) => {
    const index = candidates.indexOf(card);
    const definition = cardDefinition(card);
    const shell = node('article', `candidate-slot${index === selectedCandidateIndex ? ' is-previewing' : ''}`);
    shell.append(renderCard({
      definition,
      cardAsset: card,
      thumbnailArt: true,
      selected: index === selectedCandidateIndex,
      label: `${definition.name}の効果を比較`,
      onClick: () => selectCandidate(index),
    }));
    shell.append(node('small', '', definition.faction ?? definition.category ?? kindLabel(definition)));
    return shell;
  }));
  document.querySelector('#candidate-count').textContent = `${candidates.length}枚`;
}

function statStrip(definition) {
  const strip = node('div', 'stat-strip');
  const values = definition.kind === 'monster'
    ? [['LIFE', definition.base.life], ['ATK', definition.base.atk], ['DEF', definition.base.def], ['TP', definition.summonTp]]
    : [['種類', kindLabel(definition)], ['消費TP', definition.tp ?? '—']];
  for (const [label, value] of values) {
    const item = node('span', '', label);
    item.append(node('b', '', value));
    strip.append(item);
  }
  return strip;
}

function effectPanel(definition) {
  const panel = node('section', 'effect-panel');
  const heading = node('header');
  heading.append(node('small', '', definition.kind === 'monster' ? 'TRAIT' : 'CARD EFFECT'));
  heading.append(node('strong', '', definition.kind === 'monster' ? definition.trait.name : '効果'));
  panel.append(heading);
  panel.append(node('p', '', definition.kind === 'monster' ? definition.trait.effect : definition.effect));
  return panel;
}

function movesPanel(definition) {
  if (definition.kind !== 'monster') {
    const note = node('section', 'moves-panel');
    note.append(node('h4', '', 'デッキ検討メモ'));
    const copy = definition.faction
      ? `${definition.faction}を軸にした構成で効果を発揮しやすいカードです。交換前後の分類枚数も左上で確認できます。`
      : '分類を問わず採用できます。使用タイミングと消費TPを見比べて入れ替えを検討できます。';
    const memo = node('div', 'effect-panel');
    memo.append(node('p', '', copy));
    note.append(memo);
    return note;
  }
  const panel = node('section', 'moves-panel');
  panel.append(node('h4', '', '取得可能技（初期技・修行取得技）'));
  const list = node('div', 'move-list');
  const moves = detailMoveEntries({ definition, masterIndex, moveView: 'catalog' });
  for (const { move, label } of moves) {
    const row = node('div', 'move-row');
    const methodClass = label === '初期習得' ? 'initial' : label === '攻撃修行' ? 'attack' : 'defense';
    const methodLabel = label === '初期習得' ? '初期技' : label;
    row.append(node('em', `move-method ${methodClass}`, methodLabel));
    row.append(node('strong', '', move.name));
    row.append(node('span', '', `威力${move.power ?? '—'} · ${move.tp}TP`));
    row.append(node('small', '', move.effect === '―' ? '追加効果なし' : move.effect));
    list.append(row);
  }
  panel.append(list);
  return panel;
}

function renderInspector() {
  const activeCard = deck[selectedDeckIndex];
  const candidateCard = selectedCandidateIndex == null ? null : candidates[selectedCandidateIndex];
  const shownCard = inspectorSource === 'candidate' && candidateCard ? candidateCard : activeCard;
  const definition = cardDefinition(shownCard);
  const activeDefinition = cardDefinition(activeCard);

  const overview = node('section', 'inspector-overview');
  const cardShell = node('div', 'inspector-card');
  cardShell.append(renderCard({ definition, cardAsset: shownCard, thumbnailArt: true, interactive: false, label: definition.name }));
  overview.append(cardShell);
  const title = node('div', 'inspector-title');
  const label = node('span', 'inspector-card-label');
  label.append(node('i'));
  label.append(document.createTextNode(inspectorSource === 'candidate' && candidateCard ? '入替候補を確認中' : '現在の交換元'));
  title.append(label);
  title.append(node('h3', '', definition.name));
  const tags = node('div', 'inspector-tags');
  [kindLabel(definition), definition.faction ?? definition.category ?? '汎用', `${cardCost(definition)}TP`].forEach((text) => tags.append(node('span', '', text)));
  title.append(tags);
  title.append(statStrip(definition));
  overview.append(title);

  const compare = node('div', 'compare-bar');
  const compareCopy = node('div', 'compare-copy');
  compareCopy.append(node('strong', '', activeDefinition.name));
  compareCopy.append(node('b', '', '→'));
  compareCopy.append(node('strong', '', candidateCard ? cardDefinition(candidateCard).name : '候補を選択'));
  compare.append(compareCopy);
  const replaceButton = node('button', 'replace-action', candidateCard ? 'このカードと入れ替える' : '右から入替候補を選択');
  replaceButton.type = 'button';
  replaceButton.disabled = !candidateCard;
  replaceButton.addEventListener('click', replaceSelectedCard);
  compare.append(replaceButton);

  const scroll = node('div', 'inspector-scroll');
  scroll.append(overview, effectPanel(definition), movesPanel(definition));
  inspector.replaceChildren(scroll, compare);
}

function renderSummary() {
  const definitions = deck.map(cardDefinition);
  const monsters = definitions.filter(({ kind }) => kind === 'monster').length;
  const supports = deck.length - monsters;
  const factionCounts = new Map();
  for (const definition of definitions) {
    if (!definition.faction) continue;
    factionCounts.set(definition.faction, (factionCounts.get(definition.faction) ?? 0) + 1);
  }
  const leadingFaction = [...factionCounts.entries()].sort((left, right) => right[1] - left[1])[0] ?? ['分類なし', 0];
  deckSummary.replaceChildren(
    summaryChip('モンスター', monsters),
    summaryChip('サポート', supports),
    summaryChip(leadingFaction[0], leadingFaction[1]),
    summaryChip('同名上限', '3枚'),
  );
}

function summaryChip(label, value) {
  const chip = node('span', '', `${label} `);
  chip.append(node('b', '', value));
  return chip;
}

function updateGuide() {
  const stage = selectedCandidateIndex == null ? 0 : 2;
  guideItems.forEach((item, index) => item.classList.toggle('is-current', index === stage || (stage === 2 && index === 1)));
}

function replaceSelectedCard() {
  if (selectedCandidateIndex == null) return;
  const outgoing = deck[selectedDeckIndex];
  const incoming = candidates[selectedCandidateIndex];
  deck[selectedDeckIndex] = { ...incoming, instanceId: outgoing.instanceId };
  candidates[selectedCandidateIndex] = { ...outgoing, instanceId: incoming.instanceId };
  const incomingName = cardDefinition(deck[selectedDeckIndex]).name;
  selectedCandidateIndex = null;
  inspectorSource = 'deck';
  render();
  announce(`${incomingName}に入れ替えました（試作ページ内のみ）`);
}

function render() {
  renderDeck();
  renderCandidates();
  renderInspector();
  renderSummary();
  updateGuide();
}

const deckSortControl = document.querySelector('#deck-sort');
const candidateSortControl = document.querySelector('#candidate-sort');
populateSortControl(deckSortControl, deckSortMode);
populateSortControl(candidateSortControl, candidateSortMode);
deckSortControl.addEventListener('change', () => {
  deckSortMode = deckSortControl.value;
  renderDeck();
});
candidateSortControl.addEventListener('change', () => {
  candidateSortMode = candidateSortControl.value;
  renderCandidates();
});

document.querySelectorAll('[data-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((entry) => entry.classList.toggle('is-active', entry === button));
    renderDeck();
  });
});

document.querySelectorAll('.candidate-tabs button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.candidate-tabs button').forEach((entry) => entry.classList.toggle('is-active', entry === button));
    announce(button.textContent === '未所属' ? '未所属カード表示の見た目を確認中です' : 'このデッキの予備を表示しています');
  });
});

document.querySelector('[data-action="discard"]').addEventListener('click', () => announce('試作ページのため変更は保存されません'));
document.querySelector('[data-action="save"]').addEventListener('click', () => announce('40枚の保存操作を確認しました（試作ページ）'));

root.classList.add('is-ready');
render();
