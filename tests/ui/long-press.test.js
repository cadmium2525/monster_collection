import test from 'node:test';
import assert from 'node:assert/strict';
import { attachLongPress } from '../../src/ui/long-press.js';

class FakeNode {
  constructor() {
    this.listeners = new Map();
    this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
    };
  }

  addEventListener(type, listener, capture = false) {
    const entries = this.listeners.get(type) ?? [];
    entries.push({ listener, capture: capture === true });
    this.listeners.set(type, entries);
  }

  setPointerCapture() {}

  emit(type, event = {}) {
    const enriched = {
      isPrimary: true,
      pointerType: 'touch',
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      preventDefault() { this.defaultPrevented = true; },
      stopImmediatePropagation() { this.immediateStopped = true; },
      ...event,
    };
    const entries = this.listeners.get(type) ?? [];
    for (const { listener } of entries.filter((entry) => entry.capture)) {
      listener(enriched);
      if (enriched.immediateStopped) return enriched;
    }
    for (const { listener } of entries.filter((entry) => !entry.capture)) {
      listener(enriched);
      if (enriched.immediateStopped) break;
    }
    return enriched;
  }
}

test('long press opens details and suppresses only its following normal click', async () => {
  const node = new FakeNode();
  let normalClicks = 0;
  let detailOpens = 0;
  node.addEventListener('click', () => { normalClicks += 1; });
  attachLongPress(node, () => { detailOpens += 1; }, { delayMs: 8 });

  node.emit('pointerdown');
  node.emit('pointerup');
  node.emit('click');
  assert.equal(normalClicks, 1, 'short tap keeps the existing deck-selection action');
  assert.equal(detailOpens, 0);

  node.emit('pointerdown');
  await new Promise((resolve) => setTimeout(resolve, 15));
  node.emit('pointerup');
  const click = node.emit('click');
  assert.equal(detailOpens, 1);
  assert.equal(normalClicks, 1, 'long press must not also select or swap the card');
  assert.equal(click.defaultPrevented, true);
});
