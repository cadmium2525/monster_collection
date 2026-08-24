import test from 'node:test';
import assert from 'node:assert/strict';
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
    player: () => ({ hand: [{ instanceId: 'card-2' }] }),
  };
  screen.root = { querySelectorAll: () => [previousQueuedNode] };
  screen.isHumanTurn = () => true;
  screen.pendingMove = { unitId: 'old-unit', moveId: 'old-move' };
  screen.selection = null;
  screen.queuedCardSelectionId = null;
  let renderCount = 0;
  screen.render = () => { renderCount += 1; };

  assert.equal(screen.queueHandCardSelection('card-2', queuedNode), true);
  assert.equal(previousQueuedNode.classList.contains('tap-queued'), false);
  assert.equal(queuedNode.classList.contains('tap-queued'), true);
  assert.equal(screen.applyQueuedCardSelection(), true);
  assert.deepEqual(screen.selection, { kind: 'hand', id: 'card-2' });
  assert.equal(screen.pendingMove, null);
  assert.equal(screen.queuedCardSelectionId, null);
  assert.equal(renderCount, 1);
});
