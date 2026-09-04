import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boosterGuaranteeLabel, percentageBreakdown } from '../../src/ui/booster-screen.js';

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

test('the whole sealed-pack screen can start opening while the pack button remains keyboard accessible', () => {
  assert.match(source, /className: `pack-opening-screen pack-sealed[\s\S]*onclick: \(\) => \{[\s\S]*this\.phase === 'sealed'[\s\S]*this\.revealPack\(\)/);
  assert.match(source, /className: 'opening-pack'[\s\S]*event\.stopPropagation\(\)/);
  assert.match(source, /TAP ANYWHERE TO OPEN/);
  assert.match(css, /\.pack-sealed\s*\{[^}]*cursor:pointer;[^}]*touch-action:manipulation;/s);
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
  assert.match(source, /確定モンスター枠とRare以上枠を除く通常抽選/);
  assert.match(source, /カード別の提供割合は合計100%/);
  assert.match(source, /通常抽選での提供割合/);
  assert.match(source, /特別イラスト抽選時の内訳/);
  assert.doesNotMatch(source, /'出現枠'/);
  assert.match(source, /showcaseGuaranteed\) return '特別イラスト1枚以上確定'/);
  assert.match(source, /foilGuaranteed\) return 'モンスターFoil 1枚以上確定'/);
  assert.match(source, /初回と5パックごとにその分類のブースター限定モンスター2種から1体/);
  assert.doesNotMatch(source, /このゲームに課金要素はありません/);
  assert.match(css, /\.pack-card-rate-table/);
});

test('booster guarantee copy only shows the strongest overlapping guarantee', () => {
  assert.equal(boosterGuaranteeLabel({ boosterMonsterGuaranteed: true }), 'ブースター限定モンスター1枚以上確定');
  assert.equal(boosterGuaranteeLabel({ boosterMonsterGuaranteed: true, foilGuaranteed: true }), 'モンスターFoil 1枚以上確定');
  assert.equal(boosterGuaranteeLabel({ boosterMonsterGuaranteed: true, foilGuaranteed: true, showcaseGuaranteed: true }), '特別イラスト1枚以上確定');
  assert.equal(boosterGuaranteeLabel({}), null);
});

test('displayed probability breakdown always totals exactly 100 percent', () => {
  const display = percentageBreakdown([1 / 3, 1 / 3, 1 / 3]);
  assert.deepEqual(display, ['33.34%', '33.33%', '33.33%']);
  assert.equal(display.reduce((sum, value) => sum + Number.parseFloat(value), 0), 100);
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
