import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

test('reward offers remain reachable at both horizontal edges while centering when space permits', () => {
  assert.match(css, /\.reward-card-row\s*\{[^}]*justify-content:\s*flex-start;[^}]*overflow-x:\s*auto;[^}]*padding:\s*14px;/s);
  assert.match(css, /\.reward-card-row \.selectable-card:first-child\s*\{[^}]*margin-left:\s*auto;/s);
  assert.match(css, /\.reward-card-row \.selectable-card:last-child\s*\{[^}]*margin-right:\s*auto;/s);
});
