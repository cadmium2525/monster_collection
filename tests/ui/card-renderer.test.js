import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
    assert.match(css, new RegExp(`card-badges/${badge}\\.png`));
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
});

test('opponent cards stay upright so their corner values remain readable', () => {
  const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.board-row\.opponent\s+\.game-card\s*\{[^}]*rotate\(180deg\)/s);
});

test('card artwork keeps a head-safe portrait and correct detail ratios', () => {
  const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.game-card \.card-art\.monster-art::after\s*\{[^}]*top: 18%[^}]*aspect-ratio: \.75/s);
  assert.match(css, /\.detail-summary > \.card-art\s*\{[^}]*aspect-ratio: \.75/s);
  assert.match(css, /\.detail-summary > \.card-art\.support-card-art\s*\{\s*aspect-ratio: 1/s);
  assert.match(css, /\.card-cost\s*\{[^}]*width: clamp\(21px,25%,31px\)/s);
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
