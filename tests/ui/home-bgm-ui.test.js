import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('home exposes independent exact 0-100 BGM and future SE controls', () => {
  const home = read('../../src/ui/home-screen.js');
  const styles = read('../../styles.css');
  assert.match(home, /id: 'game-bgm-volume'/);
  assert.match(home, /id: 'game-se-volume'/);
  assert.match(home, /type: 'range', min: '0', max: '100', step: '1'/);
  assert.match(home, /BGM_DEFAULT_VOLUME/);
  assert.match(home, /SE_DEFAULT_VOLUME/);
  assert.match(home, /マスター出力は50%に固定/);
  assert.match(home, /text: '初期設定 100'/);
  assert.match(home, /home-lobby-sound/);
  assert.match(styles, /\.home-lobby-top-actions\s*\{[^}]*display:flex/);
  assert.match(styles, /\.audio-channel-setting/);
  assert.match(styles, /\.bgm-volume-settings input\[type="range"\]/);
});

test('title gesture unlocks audio and screen changes select the scene BGM', () => {
  const app = read('../../src/app.js');
  assert.match(app, /new GameAudioController\(\)/);
  assert.match(app, /onStart:[\s\S]*audio\.unlockFromGesture\(\)[\s\S]*showHome\(\)/);
  assert.match(app, /set currentScreen\(value\)[\s\S]*audio\?\.setScreen\(value\)/);
  assert.match(app, /bgmVolume: this\.audio\.bgmVolume/);
  assert.match(app, /seVolume: this\.audio\.seVolume/);
  assert.match(app, /onBgmVolumeChange: \(volume\) => this\.audio\.setBgmVolume\(volume\)/);
  assert.match(app, /onSeVolumeChange: \(volume\) => this\.audio\.setSeVolume\(volume\)/);
});

test('home and battle BGM are valid on-demand MP3 files outside startup precache', () => {
  const homeUrl = new URL('../../assets/audio/home-bgm.mp3', import.meta.url);
  const battleUrl = new URL('../../assets/audio/battle.mp3', import.meta.url);
  assert.equal(readFileSync(homeUrl).subarray(0, 3).toString('ascii'), 'ID3');
  assert.equal(readFileSync(battleUrl).subarray(0, 3).toString('ascii'), 'ID3');
  assert.ok(statSync(homeUrl).size < 2_500_000);
  assert.ok(statSync(battleUrl).size < 10_000_000);
  const worker = read('../../sw.js');
  const precache = worker.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/)?.[1] ?? '';
  assert.doesNotMatch(precache, /home-bgm\.mp3/);
  assert.doesNotMatch(precache, /battle\.mp3/);
});
