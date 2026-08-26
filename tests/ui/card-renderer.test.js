import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { cardArtPlacement, cardDisplayStats, resolvedTrait } from '../../src/ui/card-renderer.js';
import { shugyoMoveWeight } from '../../src/battle/shugyo.js';
import { masterData, monsterByName } from '../helpers.js';

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

test('card art placement selects generated support and special-fusion atlases deterministically', () => {
  const monster = monsterByName('ピクシー');
  assert.equal(cardArtPlacement(monster).className, 'monster-art');
  const special = cardArtPlacement(monster, { specialFusionId: 'fusion-036', specialForm: 'クレバス' });
  assert.equal(special.className, 'monster-art special-fusion-art');
  assert.match(special.style, /--art-x:100%;--art-y:100%/);
  const blueDrill = cardArtPlacement(monster, { specialFusionId: 'fusion-014', specialForm: 'ブルードリル' });
  assert.equal(blueDrill.className, 'monster-art special-fusion-art blue-drill-art');
  assert.equal(blueDrill.style, null);
  const support = cardArtPlacement({ id: 'breeder-020', kind: 'breeder' });
  assert.equal(support.className, 'support-card-art');
  assert.match(support.style, /--art-x:100%;--art-y:100%/);
  assert.deepEqual(cardArtPlacement({ id: 'breeder-040', kind: 'breeder' }), {
    className: 'support-card-art standalone-support-art',
    style: '--support-art:url("./assets/images/breeders/breeder-040.webp")',
  });
});

test('all twenty new breeder illustrations are optimized WebP project assets', () => {
  for (let number = 21; number <= 40; number += 1) {
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
  assert.match(css, /\.detail-summary > \.card-art\s*\{[^}]*aspect-ratio: \.75/s);
  assert.match(css, /\.detail-summary > \.card-art\.support-card-art\s*\{\s*aspect-ratio: 1/s);
  assert.match(css, /\.card-cost\s*\{[^}]*width: clamp\(21px,25%,31px\)/s);
});

test('standalone booster monster art and asset cards share one fixed footprint', () => {
  const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.game-card \.card-art\.monster-art::after,[^{]+\{\s*content: none;\s*display: none;/s);
  assert.match(css, /\.asset-card-grid\s*\{[^}]*grid-template-columns:repeat\(auto-fill,var\(--asset-card-width\)\)/s);
  assert.match(css, /\.asset-card-entry \.game-card\s*\{[^}]*width:100%;[^}]*aspect-ratio:\.72;/s);
});

test('Foil uses one non-repeating sweep and premium classes are monster-only', () => {
  const renderer = readFileSync(new URL('../../src/ui/card-renderer.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(renderer, /definition\.kind === 'monster' && \(cardAsset\?\.finish/);
  assert.match(renderer, /definition\.kind === 'monster' && \(cardAsset\?\.artVariantId/);
  assert.match(css, /\.game-card\.finish-foil::before\s*\{[^}]*background-repeat:no-repeat/s);
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
