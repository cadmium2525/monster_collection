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

test('moves create a short target impact while Training and shugyo keep distinct cast effects', () => {
  const battleSource = fs.readFileSync(new URL('../../src/ui/battle-screen.js', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(battleSource, /className: `combat-impact\$\{action\.targetPlayerId \? ' direct' : ''\}`/);
  assert.match(battleSource, /await delay\(Math\.round\(duration \* \.46\)\)/);
  assert.match(styles, /\.combat-impact\s*\{/);
  assert.match(styles, /\.combat-impact\.direct\s*\{/);
  assert.match(styles, /\.effect-burst::before,\.effect-burst::after/);
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
