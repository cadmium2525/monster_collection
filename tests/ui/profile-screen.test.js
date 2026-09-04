import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { catalogProgress } from '../../src/ui/profile-screen.js';
import { masterIndex } from '../helpers.js';

test('my page exposes recovery, records and catalog progress', () => {
  const progress = catalogProgress({
    ownedCardMasterIds: ['monster-001', 'monster-002'],
    discoveredFusionIds: ['fusion-001'],
  }, masterIndex);
  assert.equal(progress.ownedCards, 2);
  assert.equal(progress.discoveredFusions, 1);
  assert.equal(progress.totalCards, masterIndex.cards.size);
  assert.equal(progress.totalFusions, masterIndex.data.fusions.length);

  const source = fs.readFileSync(new URL('../../src/ui/profile-screen.js', import.meta.url), 'utf8');
  assert.match(source, /text: 'ACCOUNT'/);
  assert.match(source, /王座獲得/);
  assert.match(source, /カード図鑑/);
  assert.match(source, /text: '新規登録'/);
  assert.match(source, /text: 'ログイン'/);
  assert.match(source, /でログイン中/);
  assert.doesNotMatch(source, /title: 'アカウント保護済み'/);
  assert.doesNotMatch(source, /このデータに復旧設定を登録/);
  assert.doesNotMatch(source, /既存アカウントで復旧/);
  assert.match(source, /復旧ID/);
  assert.match(source, /aria-label': 'プレイヤーアイコンを変更'/);
  assert.match(source, /所持したことのあるカードからアイコンを選択できます/);
  assert.match(source, /ownedPlayerIconDefinitions/);
  assert.match(source, /text: 'ホーム画面イラスト'/);
  assert.match(source, /デッキリーダーとは別に/);
  assert.match(source, /home-artwork-picker-grid/);
  assert.match(source, /onSelectHomeArtwork/);
  assert.doesNotMatch(source, /パスワード再設定メール/);
});

test('home replaces the direct rename action with a my-page entry', () => {
  const source = fs.readFileSync(new URL('../../src/ui/home-screen.js', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /text: 'マイページ'/);
  assert.match(app, /new HomeScreen\(\{[\s\S]*catalog: this\.catalog/);
  assert.doesNotMatch(source, /text: '名前変更'/);
});

test('home artwork choices keep their labels visible in compact landscape layouts', () => {
  const css = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.home-artwork-picker-grid\s*\{[^}]*grid-auto-rows:max-content;/s);
  assert.match(css, /\.home-artwork-choice\s*\{[^}]*grid-template-rows:auto minmax\(21px,max-content\);/s);
  assert.match(css, /@media \(max-height:430px\)[\s\S]*\.home-artwork-choice\s*\{\s*min-height:82px;/);
});

test('my page keeps account recovery visible in a one-screen dashboard', () => {
  const source = fs.readFileSync(new URL('../../src/ui/profile-screen.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.ok(source.indexOf('accountPanel(this, account)') < source.indexOf("className: 'profile-home-art panel'"));
  assert.match(css, /\.profile-layout\s*\{[^}]*overflow:hidden;[^}]*grid-template-areas:"identity account catalog" "homeart homeart record";/s);
  assert.match(css, /\.profile-layout\s*\{[^}]*grid-template-rows:clamp\(84px,18dvh,112px\) minmax\(0,1fr\);/s);
  assert.match(css, /\.profile-name-copy \.eyebrow,\.profile-name-copy span\s*\{[^}]*white-space:nowrap;/s);
  assert.match(css, /\.profile-metric-grid\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\);[^}]*grid-template-rows:repeat\(3,minmax\(0,1fr\)\);/s);
});

test('recovery forms request a player ID instead of an email address', () => {
  const source = fs.readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /aria-label': '復旧ID'/);
  assert.match(source, /signInRecoveryAccount\(\{ playerId:/);
  assert.doesNotMatch(source, /type: 'email'/);
  assert.doesNotMatch(source, /sendRecoveryPasswordReset/);
});
