import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('home exposes an exact 0-100 BGM control initialized at half volume', () => {
  const home = read('../../src/ui/home-screen.js');
  const styles = read('../../styles.css');
  assert.match(home, /type: 'range', min: '0', max: '100', step: '1'/);
  assert.match(home, /HOME_BGM_DEFAULT_VOLUME/);
  assert.match(home, /text: '初期設定 50'/);
  assert.match(home, /home-lobby-sound/);
  assert.match(home, /iPhoneのマナーモードに連動して消音/);
  assert.match(styles, /\.home-lobby-top-actions\s*\{[^}]*display:flex/);
  assert.match(styles, /\.bgm-volume-settings input\[type="range"\]/);
});

test('title gesture unlocks BGM and screen changes keep playback home-only', () => {
  const app = read('../../src/app.js');
  assert.match(app, /new HomeBgmController\(\)/);
  assert.match(app, /onStart:[\s\S]*bgm\.unlockFromGesture\(\)[\s\S]*showHome\(\)/);
  assert.match(app, /set currentScreen\(value\)[\s\S]*setHomeActive\(value === 'home'\)/);
  assert.match(app, /bgmVolume: this\.bgm\.volume/);
  assert.match(app, /onBgmVolumeChange: \(volume\) => this\.bgm\.setVolume\(volume\)/);
});

test('home BGM is a bounded on-demand MP3 and is not part of startup precache', () => {
  const url = new URL('../../assets/audio/home-bgm.mp3', import.meta.url);
  const bytes = readFileSync(url);
  assert.equal(bytes.subarray(0, 3).toString('ascii'), 'ID3');
  assert.ok(statSync(url).size < 2_500_000);
  const worker = read('../../sw.js');
  const precache = worker.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/)?.[1] ?? '';
  assert.doesNotMatch(precache, /home-bgm\.mp3/);
});
