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
  assert.match(homeScreen, /diamondIcon\('home-diamond-icon'\)/);
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
});

test('saved deck details and editing expose display-only card sorting', () => {
  assert.match(deckScreens, /DECK_CARD_SORT_OPTIONS/);
  assert.match(deckScreens, /aria-label': 'デッキカードの並び順'/);
  assert.match(deckScreens, /表示順のみ変更・対戦時はシャッフル/);
  assert.match(deckScreens, /sortedCards\.map/);
  assert.match(deckScreens, /sortedActiveCards\.map/);
  assert.match(css, /\.deck-sort-control select/);
});

test('tournament entry names the deck choice and renders its leader as art only', () => {
  const tournamentSetup = readFileSync(new URL('../../src/ui/tournament-setup-screen.js', import.meta.url), 'utf8');
  assert.match(tournamentSetup, /text: '使用するデッキ'/);
  assert.doesNotMatch(tournamentSetup, /text: '使用する40枚'/);
  assert.match(tournamentSetup, /\$\{entry\.deckName\}のリーダー画像/);
  assert.match(css, /\.setup-deck \.game-card \.card-top,[\s\S]*\.setup-deck \.game-card \.card-corner,[\s\S]*display: none;/);
  assert.match(css, /\.setup-deck \.game-card > \.card-art\s*\{[^}]*inset: 0;[^}]*top: 0;/s);
});
