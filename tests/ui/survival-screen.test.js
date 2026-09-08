import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const screen = fs.readFileSync(new URL('../../src/ui/survival/survival-screen.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../../src/app.js', import.meta.url), 'utf8');
const home = fs.readFileSync(new URL('../../src/ui/home-screen.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

test('survival communicates the completed-deck challenge and all carry-over rules', () => {
  assert.match(screen, /トーナメントやアリーナで作り上げた保存デッキ/);
  assert.match(screen, /Training・修行・習得技を継続中/);
  assert.match(screen, /5勝ごと LIFE全回復/);
  assert.match(screen, /カード奪取なし/);
  assert.doesNotMatch(screen, /ここでランを終了/);
});

test('home separates survival, arena and throne tournament entry points', () => {
  assert.match(home, /icon: 'survival', label: 'サバイバル'/);
  assert.match(home, /王座への挑戦者、求む/);
  assert.match(home, /this\.activeRuns\.tournament/);
  assert.match(home, /this\.activeRuns\.arena/);
  assert.match(home, /this\.activeRuns\.survival/);
});

test('survival uses the shared engine and fits the synchronized landscape viewport', () => {
  assert.match(app, /new BattleScreen\(\{[\s\S]*?handleSurvivalBattleComplete/);
  assert.match(app, /getActiveRun\?\.\('survival'\)/);
  assert.match(css, /\.app-shell:has\(> \.survival-screen\)[\s\S]*?padding:0;/);
  assert.match(css, /\.survival-screen,\.survival-result-screen\s*\{[\s\S]*?height:var\(--app-viewport-height,100dvh\);[\s\S]*?overflow:hidden;/);
  assert.match(css, /@media \(max-height:500px\)[\s\S]*?\.survival-screen/);
});

test('all battle modes suspend to home while survival has no voluntary run settlement', () => {
  assert.match(app, /suspendBattle\('tournament', 'battle'/);
  assert.match(app, /suspendBattle\('arena', 'arena-battle'/);
  assert.match(app, /suspendBattle\('survival', 'survival-battle'/);
  assert.doesNotMatch(app, /confirmEndSurvival/);
  assert.match(css, /\.survival-deck-choice \.game-card \.card-corner \{ display:none; \}/);
});
