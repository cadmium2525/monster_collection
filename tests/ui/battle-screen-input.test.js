import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BattleScreen } from '../../src/ui/battle-screen.js';

function classList(initial = []) {
  const values = new Set(initial);
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    contains: (name) => values.has(name),
  };
}

test('battle log pins to the newest entry after every render', () => {
  const log = { scrollTop: 0, scrollHeight: 742 };
  const screen = Object.create(BattleScreen.prototype);
  screen.root = { querySelector: (selector) => selector === '.battle-log' ? log : null };
  const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => { callback(); return 1; };
  try {
    screen.pinLatestLog();
    assert.equal(log.scrollTop, 742);
  } finally {
    if (previousRequestAnimationFrame) globalThis.requestAnimationFrame = previousRequestAnimationFrame;
    else delete globalThis.requestAnimationFrame;
  }
});

test('a hand-card tap during the final CPU animation is kept and selected once input unlocks', () => {
  const queuedNode = { classList: classList() };
  const previousQueuedNode = { classList: classList(['tap-queued']) };
  const screen = Object.create(BattleScreen.prototype);
  screen.humanPlayerId = 'human';
  screen.engine = {
    state: { status: 'active' },
    player: () => ({ hand: [{ instanceId: 'card-2' }] }),
  };
  screen.root = { querySelectorAll: () => [previousQueuedNode] };
  let humanTurn = false;
  screen.isHumanTurn = () => humanTurn;
  screen.pendingMove = { unitId: 'old-unit', moveId: 'old-move' };
  screen.selection = null;
  screen.queuedCardSelectionId = null;
  let renderCount = 0;
  screen.render = () => { renderCount += 1; };

  assert.equal(screen.queueHandCardSelection('card-2', queuedNode), true);
  assert.equal(previousQueuedNode.classList.contains('tap-queued'), false);
  assert.equal(queuedNode.classList.contains('tap-queued'), true);
  assert.equal(screen.applyQueuedCardSelection(), false);
  assert.equal(screen.queuedCardSelectionId, 'card-2');
  humanTurn = true;
  assert.equal(screen.applyQueuedCardSelection(), true);
  assert.deepEqual(screen.selection, { kind: 'hand', id: 'card-2' });
  assert.equal(screen.pendingMove, null);
  assert.equal(screen.queuedCardSelectionId, null);
  assert.equal(renderCount, 1);
});

test('portrait guidance has one global owner instead of competing battle overlays', () => {
  const battleSource = fs.readFileSync(new URL('../../src/ui/battle-screen.js', import.meta.url), 'utf8');
  assert.doesNotMatch(battleSource, /screen\.append\(el\('div', \{ className: 'portrait-warning'/);

  const page = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.equal((page.match(/class="portrait-warning"/g) ?? []).length, 1);

  const styles = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  const portraitRules = styles.match(/@media \(orientation: portrait\) \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(portraitRules, /body > \.app-shell,[\s\S]*?body > #modal-root \{[\s\S]*?display: none !important;/);
  assert.match(portraitRules, /body > \.portrait-warning \{[\s\S]*?contain: strict;/);
  assert.match(portraitRules, /body > \.portrait-warning \{[\s\S]*?animation: none !important;/);
  assert.doesNotMatch(styles, /@media \(orientation: portrait\) and \(max-width:/);
});

test('moves keep a short target impact while support cards use the shared cinematic', () => {
  const battleSource = fs.readFileSync(new URL('../../src/ui/battle-screen.js', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(battleSource, /className: `combat-impact\$\{action\.targetPlayerId \? ' direct' : ''\}`/);
  assert.match(battleSource, /await delay\(Math\.round\(duration \* \.46\)\)/);
  assert.match(styles, /\.combat-impact\s*\{/);
  assert.match(styles, /\.combat-impact\.direct\s*\{/);
  assert.match(battleSource, /playCardUseAnimation/);
  assert.match(styles, /\.card-use-impact::before,\.card-use-impact i/);
});

test('mulligan UI exposes 3/5-card limits and fits five opening cards in landscape', () => {
  const battleSource = fs.readFileSync(new URL('../../src/ui/battle-screen.js', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(battleSource, /最大\$\{maxExchange\}枚まで選択/);
  assert.match(battleSource, /aria-pressed/);
  assert.match(battleSource, /\$\{count\}枚を交換して開始/);
  assert.match(styles, /\.mulligan-dialog\s*\{[^}]*height:min\(92dvh,560px\)/);
  assert.match(styles, /\.mulligan-card-row\s*\{[^}]*overflow-x:auto/);
});

test('mulligan is presented after the opening deal and animates return before redraw', () => {
  const battleSource = fs.readFileSync(new URL('../../src/ui/battle-screen.js', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(battleSource, /await this\.playInitialHandDeal\(\)/);
  assert.match(battleSource, /mulliganPresentationPhase !== 'selecting'/);
  assert.match(battleSource, /mulliganPresentationPhase = 'returning'[\s\S]*await delay\(timing\.return\)[\s\S]*submitMulligan/);
  assert.match(battleSource, /mulliganPresentationPhase = 'redrawing'[\s\S]*for \(const card of replacementCards\)/);
  assert.match(styles, /@keyframes mulligan-card-deal/);
  assert.match(styles, /@keyframes mulligan-card-return/);
});

test('a selected monster material gives special-fusion targets a distinct field glow', () => {
  const battleSource = fs.readFileSync(new URL('../../src/ui/battle-screen.js', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(battleSource, /specialFusionAction = fusionActions\.find\(\(action\) => action\.type === 'fusion-special'\)/);
  assert.match(battleSource, /specialFusionAction \? ' special-fusion-ready' : ''/);
  assert.match(battleSource, /specialFusionAction \? '特殊合体' : '合体'/);
  assert.match(styles, /\.board-slot\.special-fusion-ready > \.game-card/);
  assert.match(styles, /@keyframes special-fusion-aura/);
  assert.match(styles, /@keyframes special-fusion-card-glow/);
});

test('frontline reorganization selects one or two cards directly from the hand before confirmation', async () => {
  const action = {
    type: 'breeder', breederId: 'breeder-021', cardInstanceId: 'organize',
    returnCardInstanceIds: ['hand-a', 'hand-b'],
  };
  const screen = Object.create(BattleScreen.prototype);
  screen.busy = false;
  screen.selection = null;
  screen.pendingMove = null;
  screen.breederSelection = null;
  screen.render = () => {};
  screen.humanPlayerId = 'human';
  screen.engine = { getLegalActions: () => [action] };
  let performed = null;
  screen.performHumanAction = async (candidate) => { performed = candidate; };

  screen.beginFrontlineSelection([action]);
  screen.toggleFrontlineCard('hand-a');
  screen.toggleFrontlineCard('hand-b');
  assert.deepEqual([...screen.breederSelection.selectedIds], ['hand-a', 'hand-b']);
  await screen.confirmFrontlineSelection();
  assert.equal(performed, action);
});

test('frontline redraw and material search use dedicated hand and top-five presentation', () => {
  const battleSource = fs.readFileSync(new URL('../../src/ui/battle-screen.js', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(battleSource, /frontline-source-card/);
  assert.match(battleSource, /戦線整理：山札へ戻す手札を1〜2枚選択/);
  assert.match(battleSource, /prepareFrontlineRedraw/);
  assert.match(battleSource, /animateFrontlineReturns/);
  assert.match(battleSource, /text: '確定'/);
  assert.match(styles, /\.frontline-discard-selected/);
  assert.match(styles, /\.frontline-return-cue/);

  assert.match(battleSource, /openMaterialSearchChoice/);
  assert.match(battleSource, /player\.deck\.slice\(-5\)/);
  assert.match(battleSource, /monsterIds\.has\(card\.instanceId\)/);
  assert.match(battleSource, /material-search-returning/);
  assert.match(battleSource, /pendingMaterialSearchResolution/);
  assert.match(battleSource, /if \(materialSearchResolution\) await materialSearchResolution\(\)/);
  assert.match(battleSource, /setTimeout\(\(\) => \{ void finish\(emptyAction\); \}/);
  assert.match(styles, /\.material-search-card-row\s*\{[^}]*grid-template-columns:repeat\(5/);
  assert.match(styles, /\.modal-backdrop\.material-search-suspended/);
});
