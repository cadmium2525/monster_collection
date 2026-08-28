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

test('booster shop discloses next-pack card rates without the removed billing note', () => {
  assert.match(source, /text: '収録カード・提供割合'/);
  assert.match(source, /boosterPackDisclosure/);
  assert.match(source, /次の1パック（5枚）に同じカードが1枚以上含まれる確率/);
  assert.match(source, /初回と5パックごとにそのモン類の新モンスター/);
  assert.doesNotMatch(source, /このゲームに課金要素はありません/);
  assert.match(css, /\.pack-card-rate-table/);
});

test('booster shop favors readable two-column tiles with one large action row', () => {
  assert.match(source, /className: 'booster-pack-actions'/);
  assert.match(css, /\.booster-pack-grid\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)[^}]*grid-auto-rows:minmax\(150px,auto\)/s);
  assert.match(css, /\.booster-pack-copy h2\s*\{[^}]*font-size:20px/s);
  assert.match(css, /\.booster-pack-copy p\s*\{[^}]*font-size:10\.5px/s);
  assert.match(css, /\.booster-pack-actions\s*\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1\.08fr\)/s);
  assert.match(css, /\.pack-disclosure-button\s*\{[^}]*min-height:38px/s);
  assert.match(css, /\.booster-open-button\s*\{[^}]*min-height:38px/s);
});
