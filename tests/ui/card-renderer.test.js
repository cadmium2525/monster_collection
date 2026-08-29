import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { cardArtPlacement, cardDisplayStats, detailMoveEntries, isFoilAppearance, monsterPortraitPresentation, resolvedTrait } from '../../src/ui/card-renderer.js';
import { shugyoMovePoolType, shugyoMoveWeight } from '../../src/battle/shugyo.js';
import { masterData, masterIndex, monsterByName } from '../helpers.js';

test('special-fusion cards display the replacement trait instead of the base trait', () => {
  const definition = monsterByName('ピクシー');
  assert.equal(resolvedTrait(definition, null).name, definition.trait.name);
  const trait = resolvedTrait(definition, { specialForm: 'フューチャー', specialTrait: '各ターン最初の被ダメージに上限' });
  assert.equal(trait.name, '特殊特性');
  assert.equal(trait.effect, '各ターン最初の被ダメージに上限');
});

test('battle cards use full art with four corner badges and no effect text', () => {
  const renderer = readFileSync(new URL('../../src/ui/card-renderer.js', import.meta.url), 'utf8');
  assert.match(renderer, /cornerBadge\('life'/);
  assert.match(renderer, /cornerBadge\('cost'/);
  assert.match(renderer, /cornerBadge\('atk'/);
  assert.match(renderer, /cornerBadge\('def'/);
  assert.doesNotMatch(renderer, /className: 'card-stats'/);
  assert.doesNotMatch(renderer, /className: 'card-effect'/);
  assert.doesNotMatch(renderer, /card-growth-badge/);
  assert.doesNotMatch(renderer, /status-dots/);
  assert.match(renderer, /status-indicators/);
});

test('battle LIFE conditions and status meanings are visible without changing compact corner values', () => {
  const renderer = readFileSync(new URL('../../src/ui/card-renderer.js', import.meta.url), 'utf8');
  const battle = readFileSync(new URL('../../src/ui/battle-screen.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(renderer, /life\.current.*life\.max.*life\.percentage/s);
  assert.match(renderer, /LIFE50%以下/);
  assert.match(renderer, /className: 'detail-status-list'/);
  assert.match(battle, /50%条件成立/);
  assert.match(css, /\.game-card\.life-critical \.card-life/);
  assert.match(css, /\.status-indicator\.positive/);
  assert.match(css, /\.status-indicator\.negative/);
  assert.match(css, /\.status-indicator\.special/);
  assert.doesNotMatch(css, /\.status-dots/);
});

test('corner values use the supplied transparent badge artwork', () => {
  const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  for (const badge of ['life', 'cost', 'atk', 'def']) {
    assert.match(css, new RegExp(`card-badges/${badge}\\.webp`));
  }
  assert.match(css, /\.card-corner\s*\{[^}]*width: clamp\(25px,29%,37px\)/s);
  assert.match(css, /\.card-life\s*\{[^}]*top: -11px;[^}]*left: -11px/s);
  assert.match(css, /\.card-cost\s*\{[^}]*width: clamp\(21px,25%,31px\)/s);
  assert.doesNotMatch(css, /\.card-atk\s*\{[^}]*width:/s);
  assert.match(css, /\.card-def\s*\{[^}]*right: -11px;[^}]*bottom: -11px/s);
});

test('card role icons are omitted and field cards hide their compact name band', () => {
  const renderer = readFileSync(new URL('../../src/ui/card-renderer.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(renderer, /ROLE_MARK/);
  assert.doesNotMatch(renderer, /card-role/);
  assert.match(css, /\.card-top\s*\{[^}]*top: 0;[^}]*left: 0;[^}]*right: 0;/s);
  assert.match(css, /\.board-slot \.game-card \.card-top\s*\{\s*display: none;/s);
});

test('battle hand omits the old heading and uses the full panel for cards', () => {
  const screen = readFileSync(new URL('../../src/ui/battle-screen.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(screen, /YOUR HAND/);
  assert.doesNotMatch(screen, /className: 'zone-heading'/);
  assert.doesNotMatch(screen, /山札 \$\{own\.deck\.length\}/);
  assert.match(css, /\.hand-panel\s*\{[^}]*grid-template-rows: minmax\(0, 1fr\)/s);
  assert.match(css, /\.card-strip \.game-card\s*\{[^}]*height: 100%[^}]*max-width: 145px/s);
});

test('shugyo rank weighting stays deliberately small', () => {
  const weights = [1, 2, 3, 4, 5].map((rank) => shugyoMoveWeight({ rank }));
  assert.ok(Math.max(...weights) / Math.min(...weights) < 1.12);
  assert.ok(weights[0] > weights[4]);
});

test('saved-deck details show all nine moves with their actual shugyo source', () => {
  for (const definition of masterData.monsters) {
    const entries = detailMoveEntries({ definition, masterIndex, moveView: 'catalog' });
    assert.equal(entries.length, 9, `${definition.name} has all nine moves`);
    assert.deepEqual(
      Object.fromEntries(['初期習得', '攻撃修行', '防御修行'].map((label) => [label, entries.filter((entry) => entry.label === label).length])),
      { 初期習得: 3, 攻撃修行: 3, 防御修行: 3 },
      `${definition.name} labels the same pools used by battle shugyo`,
    );
  }
  assert.equal(shugyoMovePoolType(masterData, 'ドラゴン', 'ルインクロス'), 'attack');
  assert.equal(shugyoMovePoolType(masterData, 'ドラゴン', 'ドラゴンラッシュ'), 'defense');
});

test('battle details expose only the current equipped moves after replacement', () => {
  const definition = monsterByName('ドラゴン');
  const initial = definition.moveIds.filter((id) => masterIndex.moves.get(id).initial);
  const learnedAttack = masterIndex.movesByName.get('ドラゴン:ルインクロス').id;
  const replacement = masterIndex.movesByName.get('ドラゴン:インフェルノ').id;
  const equippedMoveIds = [initial[1], initial[2], learnedAttack, replacement];
  const entries = detailMoveEntries({
    definition,
    masterIndex,
    moveView: 'battle',
    growth: {
      learnedMoveIds: [...initial, learnedAttack, replacement],
      equippedMoveIds,
    },
  });
  assert.deepEqual(new Set(entries.map((entry) => entry.move.id)), new Set(equippedMoveIds));
  assert.equal(entries.some((entry) => entry.move.id === initial[0]), false, 'replaced old technique is hidden');
  assert.equal(entries.every((entry) => entry.label === '実戦'), true);
});

test('card art placement keeps legacy art below the name band and uses standalone fusion cells', () => {
  const monster = monsterByName('ピクシー');
  assert.equal(cardArtPlacement(monster).className, 'monster-art legacy-name-safe-art');
  const special = cardArtPlacement(monster, { specialFusionId: 'fusion-036', specialForm: 'クレバス' });
  assert.equal(special.className, 'monster-art special-fusion-art standalone-fusion-art');
  assert.equal(special.style, '--monster-art:url("./assets/images/special-fusions/fusion-036.webp")');
  const blueDrill = cardArtPlacement(monster, { specialFusionId: 'fusion-014', specialForm: 'ブルードリル' });
  assert.equal(blueDrill.className, 'monster-art special-fusion-art standalone-fusion-art');
  assert.equal(blueDrill.style, '--monster-art:url("./assets/images/special-fusions/fusion-014.webp")');
  const yuma = cardArtPlacement(monster, { specialFusionId: 'fusion-028', specialForm: 'ユーマ' });
  assert.equal(yuma.style, '--monster-art:url("./assets/images/special-fusions/fusion-028.webp");--fusion-art-x:8%');
  const premiumFusion = cardArtPlacement(monster, {
    specialFusionId: 'fusion-001',
    specialForm: 'フューチャー',
    artVariantId: 'showcase-monster-001',
  });
  assert.equal(premiumFusion.className, 'monster-art special-fusion-art standalone-fusion-art showcase-fusion-art');
  assert.equal(premiumFusion.style, '--monster-art:url("./assets/images/showcase-fusions/showcase-fusion-001.webp")');
  const support = cardArtPlacement({ id: 'breeder-020', kind: 'breeder' });
  assert.equal(support.className, 'support-card-art legacy-name-safe-art');
  assert.match(support.style, /--art-x:100%;--art-y:100%/);
  assert.deepEqual(cardArtPlacement({ id: 'breeder-040', kind: 'breeder' }), {
    className: 'support-card-art standalone-support-art',
    style: '--support-art:url("./assets/images/breeders/breeder-040.webp")',
  });
  assert.deepEqual(cardArtPlacement({ id: 'breeder-046', kind: 'breeder' }), {
    className: 'support-card-art standalone-support-art',
    style: '--support-art:url("./assets/images/breeders/breeder-046.webp")',
  });
  assert.deepEqual(cardArtPlacement({ id: 'breeder-052', kind: 'breeder' }), {
    className: 'support-card-art standalone-support-art',
    style: '--support-art:url("./assets/images/breeders/breeder-052.webp")',
  });
});

test('champion portraits retain standalone and showcase artwork instead of falling back to Monolith', () => {
  const chronogear = masterIndex.monsters.get('monster-019');
  const base = monsterPortraitPresentation(chronogear, { masterId: chronogear.id, artVariantId: 'base' });
  assert.match(base.className, /standalone-monster-art/);
  assert.match(base.className, /booster-monster-art/);
  assert.equal(base.style, '--monster-art:url("./assets/images/booster/monster-019.webp")');

  const showcase = monsterPortraitPresentation(chronogear, { masterId: chronogear.id, artVariantId: 'showcase-inorganic-01' });
  assert.match(showcase.className, /standalone-monster-art/);
  assert.match(showcase.className, /showcase-monster-art/);
  assert.equal(showcase.style, '--monster-art:url("./assets/images/showcase/showcase-inorganic-01.webp")');

  const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.champion-art \.monster-portrait\.standalone-monster-art\s*\{[^}]*var\(--monster-art\)[^}]*background-size: 100% 100%,cover/s);
});

test('every showcase special fusion is Foil even when its main asset has a normal finish', () => {
  const monster = monsterByName('メタルナー');
  assert.equal(isFoilAppearance(monster, {
    specialFusionId: 'fusion-027',
    specialForm: 'ラブラブセイジン',
    artVariantId: 'showcase-monster-005',
    finish: 'normal',
  }), true);
  assert.equal(isFoilAppearance(monster, {
    specialFusionId: 'fusion-027',
    specialForm: 'ラブラブセイジン',
    artVariantId: 'base',
    finish: 'normal',
  }), false);
  assert.equal(isFoilAppearance(monster, {
    artVariantId: 'showcase-monster-005',
    finish: 'normal',
  }), false, 'an unfused showcase keeps its independently rolled finish');
  assert.equal(isFoilAppearance(monster, { finish: 'foil' }), true);
  assert.equal(isFoilAppearance({ id: 'breeder-001', kind: 'breeder' }, null, { finish: 'foil' }), false);
});

test('all thirty-six special fusion cells are valid standalone WebP assets', () => {
  for (let number = 1; number <= 36; number += 1) {
    const id = String(number).padStart(3, '0');
    const url = new URL(`../../assets/images/special-fusions/fusion-${id}.webp`, import.meta.url);
    const bytes = readFileSync(url);
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', `fusion-${id} starts with RIFF marker`);
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', `fusion-${id} has WEBP signature`);
    assert.ok(statSync(url).size < 500_000, `fusion-${id} stays practical for on-demand loading`);
  }
});

test('all thirty-six premium special-fusion illustrations are optimized standalone WebP assets', () => {
  for (let number = 1; number <= 36; number += 1) {
    const id = String(number).padStart(3, '0');
    const url = new URL(`../../assets/images/showcase-fusions/showcase-fusion-${id}.webp`, import.meta.url);
    const bytes = readFileSync(url);
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', `showcase-fusion-${id} starts with RIFF marker`);
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', `showcase-fusion-${id} has WEBP signature`);
    assert.ok(statSync(url).size < 900_000, `showcase-fusion-${id} stays practical for on-demand loading`);
  }
});

test('all thirty-two expansion breeder illustrations are optimized WebP project assets', () => {
  for (let number = 21; number <= 52; number += 1) {
    const id = String(number).padStart(3, '0');
    const url = new URL(`../../assets/images/breeders/breeder-${id}.webp`, import.meta.url);
    const bytes = readFileSync(url);
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', `breeder-${id} starts with RIFF marker`);
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', `breeder-${id} has WEBP signature`);
    assert.ok(statSync(url).size < 300_000, `breeder-${id} stays practical for PWA caching`);
  }
});

test('all runtime game artwork uses valid WebP while compatibility PWA icons remain separate', () => {
  const assets = [
    'assets/images/battle-arena.webp',
    'assets/images/monster-atlas.webp',
    'assets/images/special-fusion-atlas-v1.webp',
    'assets/images/blue-drill-v2.webp',
    'assets/images/support-card-atlas-v1.webp',
    'assets/ui/card-badges/life.webp',
    'assets/ui/card-badges/cost.webp',
    'assets/ui/card-badges/atk.webp',
    'assets/ui/card-badges/def.webp',
  ];
  for (const asset of assets) {
    const bytes = readFileSync(new URL(`../../${asset}`, import.meta.url));
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', `${asset} starts with RIFF marker`);
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', `${asset} has WEBP signature`);
  }
  const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /assets\/(?:images|ui\/card-badges)\/[^)"']+\.(?:png|jpe?g)/i);
});

test('opponent cards stay upright so their corner values remain readable', () => {
  const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.board-row\.opponent\s+\.game-card\s*\{[^}]*rotate\(180deg\)/s);
});

test('atlas artwork renders exactly once and keeps correct detail ratios', () => {
  const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.game-card \.card-art\.monster-art::after,[^{]+\{\s*content: none;\s*display: none;/s);
  assert.doesNotMatch(css, /\.game-card \.card-art\.(?:monster-art|support-card-art)::after\s*\{[^}]*(?:background-image|top: 18%)/s);
  assert.match(css, /\.card-art\.monster-art\s*\{[^}]*background-size: 100% 100%, 600% 300%/s);
  assert.match(css, /\.game-card > \.card-art\.legacy-name-safe-art\s*\{[^}]*top: clamp\(18px, 14%, 21px\)/s);
  assert.match(css, /\.board-slot \.game-card > \.card-art\.legacy-name-safe-art\s*\{[^}]*top: 0/s);
  assert.match(css, /\.game-card > \.card-art\.special-fusion-art\s*\{[^}]*top: clamp\(18px, 14%, 21px\)/s);
  assert.match(css, /\.fusion-catalog-card > \.card-art\.special-fusion-art\s*\{[^}]*top: clamp\(18px,14%,21px\)/s);
  assert.match(css, /\.card-art\.monster-art\.special-fusion-art,[^{]+\{[^}]*var\(--monster-art\)[^}]*background-size: 100% 100%, cover/s);
  assert.match(css, /background-position: center, var\(--fusion-art-x, 50%\) top/);
  assert.doesNotMatch(css, /special-fusion-art[^}]+special-fusion-atlas-v1\.webp/s);
  assert.match(css, /\.detail-summary > \.card-art\s*\{[^}]*aspect-ratio: \.75/s);
  assert.match(css, /\.detail-summary > \.card-art\.support-card-art\s*\{\s*aspect-ratio: 1/s);
  assert.match(css, /\.card-cost\s*\{[^}]*width: clamp\(21px,25%,31px\)/s);
});

test('special fusion name bands omit the redundant fusion marker', () => {
  const catalog = readFileSync(new URL('../../src/ui/catalog-screen.js', import.meta.url), 'utf8');
  assert.doesNotMatch(catalog, /text: '合'/);
  assert.match(catalog, /className: 'card-top'[^\n]+fusion\.name/);
});

test('standalone booster monster art and asset cards share one fixed footprint', () => {
  const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.game-card \.card-art\.monster-art::after,[^{]+\{\s*content: none;\s*display: none;/s);
  assert.match(css, /\.asset-card-grid\s*\{[^}]*grid-template-columns:repeat\(auto-fill,var\(--asset-card-width\)\)/s);
  assert.match(css, /\.asset-card-entry \.game-card\s*\{[^}]*width:100%;[^}]*aspect-ratio:\.72;/s);
});

test('Foil uses one non-repeating sweep and premium classes are monster-only', () => {
  const renderer = readFileSync(new URL('../../src/ui/card-renderer.js', import.meta.url), 'utf8');
  const catalog = readFileSync(new URL('../../src/ui/catalog-screen.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(renderer, /isFoilAppearance\(definition, unit, cardAsset\) \? 'finish-foil'/);
  assert.match(renderer, /definition\.kind === 'monster' && \(cardAsset\?\.artVariantId/);
  assert.match(catalog, /fusion-showcase-card finish-foil/);
  assert.match(css, /\.game-card\.finish-foil::before,[^{]+\.fusion-catalog-card\.finish-foil::before,[^{]+\.card-art\.finish-foil-art::after\s*\{[^}]*background-repeat:no-repeat/s);
  assert.match(css, /\.detail-summary > \.card-art\.showcase-fusion-art\s*\{\s*aspect-ratio: \.75/s);
  assert.match(css, /@keyframes foil-sheen\s*\{\s*0%,14%/s);
  assert.match(css, /@keyframes foil-sheen[^}]+\}[^}]*74%,100%/s);
});

test('hand monster stats include tournament growth carried from earlier matches', () => {
  const monster = monsterByName('ドラゴン');
  assert.deepEqual(cardDisplayStats(monster, null, { life: 8, atk: 5, def: 10 }), {
    life: monster.base.life + 8,
    atk: monster.base.atk + 5,
    def: monster.base.def + 10,
  });
});

test('every Training and shugyo card has explanatory copy for its detail modal', () => {
  for (const definition of masterData.growthCards) {
    assert.equal(typeof definition.effect, 'string');
    assert.ok(definition.effect.length >= 10, `${definition.name} needs explanatory copy`);
    assert.doesNotMatch(definition.effect, /大会中継続/, `${definition.name} should keep tournament rules out of card copy`);
  }
});
