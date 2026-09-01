import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const deckScreens = readFileSync(new URL('../../src/ui/deck-screens.js', import.meta.url), 'utf8');
const catalogScreen = readFileSync(new URL('../../src/ui/catalog-screen.js', import.meta.url), 'utf8');
const boosterScreen = readFileSync(new URL('../../src/ui/booster-screen.js', import.meta.url), 'utf8');
const homeScreen = readFileSync(new URL('../../src/ui/home-screen.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

test('saved deck header clearly separates the catalog from unassigned assets', () => {
  assert.match(deckScreens, /text: 'カード図鑑'/);
  assert.match(deckScreens, /text: '未所属カード'/);
  assert.match(deckScreens, /カード図鑑[\s\S]*未所属カード/);
  assert.match(app, /onInventory: \(\) => this\.showAssetCollection\(\{ returnTo: 'decks' \}\)/);
  assert.match(app, /backLabel: returnToDecks \? '保存デッキへ' : 'パックへ'/);
});

test('collection history is named card catalog throughout its visible UI', () => {
  assert.match(catalogScreen, /text: 'カード図鑑'/);
  assert.match(catalogScreen, /aria-label': 'カード図鑑の絞り込み'/);
  assert.doesNotMatch(catalogScreen, /text: 'カード一覧'/);
  assert.match(app, /カード図鑑を読み込めません/);
});

test('deck names are edited from a pencil control on the list, not the detail toolbar', () => {
  assert.match(deckScreens, /className: 'deck-rename-button'/);
  assert.match(deckScreens, /title: 'デッキ名を変更'/);
  assert.match(deckScreens, /openRenameDialog\(deck\)/);
  assert.doesNotMatch(deckScreens, /text: '名前を保存'/);
  assert.match(app, /onRename: async \(deck, nextName\)/);
  assert.match(app, /大会参加中はデッキ名を変更できません/);
});

test('player-facing deck cost labels use deck total TP wording', () => {
  const tournamentSetup = readFileSync(new URL('../../src/ui/tournament-setup-screen.js', import.meta.url), 'utf8');
  assert.match(deckScreens, /デッキ総TP/);
  assert.doesNotMatch(deckScreens, /総プレイTP/);
  assert.match(tournamentSetup, /デッキ総TP/);
});

test('premium diamond artwork replaces CSS and text placeholders', () => {
  const assetUrl = new URL('../../assets/ui/currency/diamond-premium.webp', import.meta.url);
  const bytes = readFileSync(assetUrl);
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
  assert.ok(statSync(assetUrl).size < 100_000);
  assert.match(boosterScreen, /diamondIcon\('diamond-balance-icon'\)/);
  assert.match(boosterScreen, /diamondIcon\('booster-cost-icon'\)/);
  assert.match(homeScreen, /diamondIcon\('home-lobby-diamond'\)/);
  assert.doesNotMatch(css, /\.diamond-balance i\s*\{/);
});

test('deck editing keeps tap-to-swap and adds long-press card details', () => {
  const longPress = readFileSync(new URL('../../src/ui/long-press.js', import.meta.url), 'utf8');
  assert.match(deckScreens, /attachLongPress/);
  assert.match(deckScreens, /renderEditableCard/);
  assert.match(deckScreens, /長押しで詳細を確認できます/);
  assert.match(longPress, /CARD_DETAILS_LONG_PRESS_MS = 520/);
  assert.match(longPress, /suppressNextClick = true/);
  assert.match(longPress, /stopImmediatePropagation/);
  assert.match(longPress, /contextmenu/);
  assert.match(css, /\.deck-builder-screen \.game-card,[\s\S]*\.deck-builder-screen \.game-card \*\s*\{[^}]*-webkit-user-select:none;[^}]*user-select:none;[^}]*-webkit-touch-callout:none;/s);
});

test('saved deck cards omit redundant player-wide qualification labels', () => {
  assert.doesNotMatch(deckScreens, /プレイヤー解禁/);
  assert.doesNotMatch(deckScreens, /全デッキ共通/);
  assert.match(deckScreens, /最高到達/);
  assert.match(deckScreens, /デッキ総TP/);
});

test('saved deck details and editing expose display-only card sorting', () => {
  assert.match(deckScreens, /DECK_CARD_SORT_OPTIONS/);
  assert.match(deckScreens, /label = 'デッキカードの並び順'/);
  assert.match(deckScreens, /'aria-label': label/);
  assert.match(deckScreens, /表示順のみ変更・対戦時はシャッフル/);
  assert.match(deckScreens, /sortedCards\.map/);
  assert.match(deckScreens, /sortedActiveCards\.map/);
  assert.match(deckScreens, /candidateSortMode/);
  assert.match(deckScreens, /入替候補の並び順/);
  assert.match(deckScreens, /sortedCandidates\.map/);
  assert.match(css, /\.deck-sort-control select/);
});

test('large card collections use catalog atlases and defer other standalone artwork', () => {
  const renderer = readFileSync(new URL('../../src/ui/card-renderer.js', import.meta.url), 'utf8');
  assert.match(renderer, /IntersectionObserver/);
  assert.match(renderer, /rootMargin: '320px 0px'/);
  assert.match(renderer, /dataset\.lazyArtStyle/);
  assert.match(deckScreens, /lazyArt: true/);
  assert.match(catalogScreen, /thumbnailArt: true/);
  assert.doesNotMatch(catalogScreen, /lazyArt: true/);
  assert.match(boosterScreen, /lazyArt: true/);
  assert.match(css, /catalog-thumbnails\/cards\.webp/);
  assert.match(css, /catalog-thumbnails\/fusions\.webp/);
  assert.match(css, /content-visibility:auto/);
});

test('catalog grid gives every card a definite iPhone-safe row height', () => {
  assert.match(css, /\.catalog-card-grid\s*\{[^}]*--catalog-row-height:clamp\(100px,10\.4vw,150px\);[^}]*grid-auto-rows:var\(--catalog-row-height\)/s);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.catalog-card-grid\s*\{[^}]*--catalog-row-height:clamp\(84px,12\.4vw,126px\)/s);
  assert.match(css, /\.catalog-entry\s*\{[^}]*height:100%;[^}]*aspect-ratio:auto/s);
  assert.match(css, /\.fusion-catalog-card\s*\{[^}]*height:100%;[^}]*aspect-ratio:auto/s);
  assert.match(css, /\.catalog-entry \.game-card\s*\{[^}]*position:absolute;[^}]*height:100%;[^}]*aspect-ratio:auto/s);
  assert.doesNotMatch(css, /\.catalog-entry[^\n{]*\{[^}]*contain:/s);
  assert.doesNotMatch(css, /\.catalog-entry,\.fusion-catalog-card\s*\{[^}]*contain:/s);
});

test('leader artwork resolves the owned card appearance in every deck-facing screen', () => {
  const tournamentSetup = readFileSync(new URL('../../src/ui/tournament-setup-screen.js', import.meta.url), 'utf8');
  assert.match(deckScreens, /representativeCardAsset\(deck\.cards, deck\.representativeMonsterId\)/);
  assert.match(deckScreens, /cardAsset: representativeAsset/);
  assert.match(deckScreens, /cardAsset,/);
  assert.match(tournamentSetup, /representativeCardAsset\(entry\.cards, entry\.representativeMonsterId\)/);
  assert.match(tournamentSetup, /cardAsset: representativeAsset/);
});

test('tournament entry names the deck choice and renders its leader as art only', () => {
  const tournamentSetup = readFileSync(new URL('../../src/ui/tournament-setup-screen.js', import.meta.url), 'utf8');
  assert.match(tournamentSetup, /text: '使用するデッキ'/);
  assert.doesNotMatch(tournamentSetup, /text: '使用する40枚'/);
  assert.match(tournamentSetup, /\$\{entry\.deckName\}のリーダー画像/);
  assert.match(css, /\.setup-deck \.game-card \.card-top,[\s\S]*\.setup-deck \.game-card \.card-corner,[\s\S]*display: none;/);
  assert.match(css, /\.setup-deck \.game-card > \.card-art\s*\{[^}]*inset: 0;[^}]*top: 0;/s);
});
