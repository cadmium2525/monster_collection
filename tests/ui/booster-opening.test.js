import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/ui/booster-screen.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

test('booster opening advances through seal break, deal and individual card flips', () => {
  assert.match(source, /this\.phase = 'breaking'/);
  assert.match(source, /className: 'pack-break-flash'/);
  assert.match(source, /className: 'pack-card-reveal-shell'/);
  assert.match(source, /await this\.revealOne\(index, \{ sequence: true \}\)/);
  assert.match(css, /@keyframes pack-break/);
  assert.match(css, /@keyframes pack-card-deal/);
  assert.match(css, /@keyframes card-reveal-flip/);
});

test('rare, foil and showcase pulls receive a dedicated readable burst', () => {
  assert.match(source, /asset\.rarity === 'showcase' \|\| asset\.rarity === 'rare' \|\| asset\.finish === 'foil'/);
  assert.match(source, /className: `pack-rarity-burst/);
  assert.match(css, /\.pack-rarity-burst\.rarity-showcase/);
  assert.match(css, /\.pack-rarity-burst\.foil strong/);
  assert.match(css, /@keyframes rarity-ring/);
  assert.match(source, /this\.disposed = true;[\s\S]*this\.burstToken \+= 1;[\s\S]*this\.onComplete\(\);/);
});
