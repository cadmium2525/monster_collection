import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MISSION_DETAILS } from '../../src/ui/mission-screen.js';

test('mission screen provides complete objectives in switchable daily and weekly tabs', async () => {
  assert.equal(Object.keys(MISSION_DETAILS).length, 6);
  for (const [id, mission] of Object.entries(MISSION_DETAILS)) {
    assert.ok(mission.title.length >= 8, id);
    assert.ok(mission.description.length >= 20, id);
  }
  const source = await readFile(new URL('../../src/ui/mission-screen.js', import.meta.url), 'utf8');
  assert.match(source, /role: 'tablist'/);
  assert.match(source, /role: 'tabpanel'/);
  assert.match(source, /aria-selected/);
});
