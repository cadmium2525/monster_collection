import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { activeRunSummary, homeCollectionLevel, homeFooterMode, homeLeaderArtworkPath, TUTORIAL_STEPS } from '../../src/ui/home-screen.js';

test('beginner tutorial covers the complete first tournament interaction loop', () => {
  assert.equal(TUTORIAL_STEPS.length, 8);
  const copy = TUTORIAL_STEPS.flatMap((step) => [step.title, step.copy, step.tip]).join('\n');
  for (const required of ['40枚', 'スワイプ', '実戦技', '大会終了時', '特殊合体', 'TP', '最大2枚']) {
    assert.match(copy, new RegExp(required));
  }
  assert.doesNotMatch(copy, /距離廃止版/);
  const homeSource = fs.readFileSync(new URL('../../src/ui/home-screen.js', import.meta.url), 'utf8');
  assert.doesNotMatch(homeSource, /距離廃止版ルール/);
  assert.match(homeSource, /戴冠した大会の決勝開始時点の40枚と育成状態を再現/);
});

test('technical home footer stays hidden for players and shows only in debug mode', () => {
  assert.equal(homeFooterMode(), 'hidden');
  assert.equal(homeFooterMode({ debugMode: true }), 'debug');
  assert.equal(homeFooterMode({ syncError: 'offline' }), 'hidden');
});

test('home lobby keeps the release version visible and separates its navigation labels', () => {
  const homeSource = fs.readFileSync(new URL('../../src/ui/home-screen.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(homeSource, /className: 'home-app-version home-lobby-version'/);
  assert.match(homeSource, /`v\$\{APP_VERSION\}`/);
  assert.match(css, /\.home-app-version\.home-lobby-version\s*\{[^}]*position:fixed;[^}]*z-index:12;[^}]*background:rgba\(2,9,17,\.72\)/s);
  assert.match(css, /\.home-app-version\.home-lobby-version\s*\{[^}]*bottom:max\(2px,calc\(var\(--safe-bottom\) - 16px\)\)/s);
  assert.match(css, /\.home-lobby-bottom-nav\s*\{[^}]*left:50%;[^}]*width:min\(760px,calc\(100% - 48px\)\);[^}]*grid-template-columns:repeat\(5,minmax\(0,1fr\)\);[^}]*transform:translateX\(-50%\)/s);
  for (const label of ['トーナメント', 'アリーナ', 'ホーム', 'カード', 'ショップ']) assert.match(homeSource, new RegExp(`label: '${label}'`));
  assert.doesNotMatch(homeSource, /home-lobby-leader-name/);
  assert.match(homeSource, /document\.createElementNS\('http:\/\/www\.w3\.org\/2000\/svg', 'svg'\)/);
  assert.match(homeSource, /attrs: \{ decoding: 'sync', fetchpriority: 'high' \}/);
  assert.match(homeSource, /aria-label': 'コレクションレベル進捗'/);
  assert.match(css, /\.home-lobby-level-track\s*\{[^}]*height:6px;[^}]*border:1px solid/s);
  assert.match(css, /\.home-lobby-hero-art\s*\{[^}]*width:100%;[^}]*object-fit:cover;[^}]*object-position:center;/s);
  assert.match(css, /\.home-lobby-topbar\s*\{[^}]*right:max\(18px,var\(--safe-right\)\)/s);
  assert.match(css, /\.home-lobby-utility-rail\s*\{[^}]*right:max\(18px,var\(--safe-right\)\)/s);
  assert.doesNotMatch(css, /\.home-lobby-utility-rail\s*\{\s*right:12px;/s);
  assert.doesNotMatch(css, /@keyframes home-lobby-arrive[^}]*scale:/s);
});

test('home chooses one leader illustration and calculates collection progress safely', () => {
  assert.equal(homeLeaderArtworkPath('monster-003'), './assets/images/home/monster-003.webp');
  assert.equal(homeLeaderArtworkPath('monster-019'), './assets/images/home/monster-019.webp');
  assert.equal(homeLeaderArtworkPath('monster-030', { artVariantId: 'showcase-monster-030' }), './assets/images/home-showcase/monster-030.webp');
  assert.equal(homeLeaderArtworkPath('invalid'), './assets/images/home/monster-019.webp');
  const masterIndex = { cards: new Map([['a', {}], ['b', {}]]), data: { fusions: [{}, {}] } };
  assert.equal(homeCollectionLevel({ ownedCardMasterIds: ['a'], discoveredFusionIds: ['f1'] }, masterIndex), 50);
  assert.equal(homeCollectionLevel({ ownedCardMasterIds: ['a', 'a'], discoveredFusionIds: [] }, masterIndex), 25);
});

test('active tournament checkpoint is summarized as a player-facing continue action', () => {
  const base = {
    phase: 'battle',
    tournament: { state: { rank: 'silver', roundIndex: 2, status: 'active' } },
  };
  assert.deepEqual(activeRunSummary(base), {
    title: '大会の続きから',
    detail: 'シルバーカップ・準決勝・試合中',
  });

  assert.deepEqual(activeRunSummary({
    ...base,
    phase: 'reward',
    tournament: { state: { rank: 'silver', roundIndex: 3, status: 'active' } },
  }), {
    title: 'カード奪取の続きから',
    detail: 'シルバーカップ・準決勝・カード奪取中',
  });

  assert.ok(activeRunSummary({
    ...base,
    phase: 'reward',
    tournament: { state: { rank: 'bronze', roundIndex: 3, status: 'won' } },
  }));
  assert.equal(activeRunSummary({ ...base, tournament: { state: { rank: 'silver', roundIndex: 2, status: 'eliminated' } } }), null);
});
