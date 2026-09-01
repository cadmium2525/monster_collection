import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MISSION_GROUPS } from '../../src/ui/mission-screen.js';

test('mission screen provides complete objectives in switchable daily and weekly tabs', async () => {
  assert.deepEqual(Object.keys(MISSION_GROUPS), ['daily', 'weekly']);
  for (const group of Object.values(MISSION_GROUPS)) {
    assert.ok(group.reset.includes('更新'));
    assert.equal(group.missions.length, 3);
    for (const mission of group.missions) {
      assert.ok(mission.title.length >= 8, mission.id);
      assert.ok(mission.description.length >= 20, mission.id);
      assert.ok(mission.goal > 0, mission.id);
    }
  }
  const source = await readFile(new URL('../../src/ui/mission-screen.js', import.meta.url), 'utf8');
  assert.match(source, /role: 'tablist'/);
  assert.match(source, /role: 'tabpanel'/);
  assert.match(source, /aria-selected/);
});
