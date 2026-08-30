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
  assert.doesNotMatch(source, /このデータに復旧設定を登録/);
  assert.doesNotMatch(source, /既存アカウントで復旧/);
  assert.match(source, /復旧ID/);
  assert.doesNotMatch(source, /パスワード再設定メール/);
});

test('home replaces the direct rename action with a my-page entry', () => {
  const source = fs.readFileSync(new URL('../../src/ui/home-screen.js', import.meta.url), 'utf8');
  assert.match(source, /text: 'マイページ'/);
  assert.doesNotMatch(source, /text: '名前変更'/);
});

test('recovery forms request a player ID instead of an email address', () => {
  const source = fs.readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /aria-label': '復旧ID'/);
  assert.match(source, /signInRecoveryAccount\(\{ playerId:/);
  assert.doesNotMatch(source, /type: 'email'/);
  assert.doesNotMatch(source, /sendRecoveryPasswordReset/);
});
