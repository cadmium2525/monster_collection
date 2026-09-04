import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('the first paint includes an accessible progress bar and numeric percentage', () => {
  const page = read('../../index.html');
  const styles = read('../../styles.css');
  assert.match(page, /class="boot-progress" role="progressbar"[^>]*aria-valuenow="4"/);
  assert.match(page, /<strong>4%<\/strong>/);
  assert.match(styles, /\.boot-progress > i[^}]*transition:width/);
});

test('startup advances through named milestones before rendering the title screen', () => {
  const source = read('../../src/app.js');
  const milestones = [...source.matchAll(/showStartupProgress\((\d+),/g)].map((match) => Number(match[1]));
  assert.deepEqual(milestones, [8, 18, 28, 40, 53, 68, 78, 88, 100]);
  assert.match(source, /showStartupProgress\(100, 'タイトル画面を表示します…'\);[\s\S]*this\.showTitle\(\)/);
  assert.match(source, /showTitle\(\)[\s\S]*renderTitleScreen[\s\S]*this\.showHome\(\)/);
});

test('title screen uses optimized generated artwork and a slowly pulsing start prompt', () => {
  const source = read('../../src/ui/title-screen.js');
  const styles = read('../../styles.css');
  const artwork = new URL('../../assets/images/title/title-screen.webp', import.meta.url);
  const bytes = fs.readFileSync(artwork);
  assert.match(source, /title-screen\.webp/);
  assert.match(source, /text: 'TAP TO START'/);
  assert.match(source, /aria-label': 'ゲームを開始'/);
  assert.match(styles, /@keyframes title-start-pulse/);
  assert.match(styles, /animation:title-start-pulse 2\.6s/);
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
  assert.ok(bytes.length < 500_000, 'title artwork remains practical for startup loading');
});

test('home artwork decodes asynchronously so iPhone first paint is not blocked', () => {
  const source = read('../../src/ui/home-screen.js');
  assert.match(source, /decoding: 'async', fetchpriority: 'high'/);
  assert.doesNotMatch(source, /decoding: 'sync'/);
});
