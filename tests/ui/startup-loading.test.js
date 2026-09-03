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

test('startup advances through named milestones before rendering home', () => {
  const source = read('../../src/app.js');
  const milestones = [...source.matchAll(/showStartupProgress\((\d+),/g)].map((match) => Number(match[1]));
  assert.deepEqual(milestones, [8, 18, 28, 40, 53, 68, 78, 88, 100]);
  assert.match(source, /showStartupProgress\(100,[\s\S]*this\.showHome\(\)/);
});

test('home artwork decodes asynchronously so iPhone first paint is not blocked', () => {
  const source = read('../../src/ui/home-screen.js');
  assert.match(source, /decoding: 'async', fetchpriority: 'high'/);
  assert.doesNotMatch(source, /decoding: 'sync'/);
});
