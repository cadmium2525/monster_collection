import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MISSION_DETAILS } from '../../src/ui/mission-screen.js';

test('mission screen provides complete objectives in switchable daily, weekly and monthly tabs', async () => {
  assert.equal(Object.keys(MISSION_DETAILS).length, 13);
  for (const [id, mission] of Object.entries(MISSION_DETAILS)) {
    assert.ok(mission.title.length >= 8, id);
    assert.ok(mission.description.length >= 20, id);
  }
  const source = await readFile(new URL('../../src/ui/mission-screen.js', import.meta.url), 'utf8');
  assert.match(source, /role: 'tablist'/);
  assert.match(source, /role: 'tabpanel'/);
  assert.match(source, /aria-selected/);
  assert.match(source, /monthly: Object\.freeze/);
  assert.match(source, /モンスターカード交換券 ×1/);
  assert.doesNotMatch(source, /mission-loot-section/);
  assert.match(source, /lootStock\?\.\[0\]\?\.lootId/);

  const css = await readFile(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.mission-entry\.is-claimable \.mission-state\.primary-button/);
  assert.match(css, /background:linear-gradient\(135deg,#fff0ae/);
  assert.match(css, /@keyframes mission-claim-ready/);
});

test('arena header replaces its mission shortcut with the loot stock', async () => {
  const source = await readFile(new URL('../../src/ui/arena-screen.js', import.meta.url), 'utf8');
  assert.match(source, /className: 'arena-header-loot'/);
  assert.match(source, /text: '戦利品ストック'/);
  assert.doesNotMatch(source, /text: 'ミッション'/);
});
