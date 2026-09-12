import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SOUND_CUES, playSoundCue, resultSoundCue, installUiSoundFeedback } from '../../src/audio/sound-cues.js';
import { PackOpeningScreen } from '../../src/ui/booster-screen.js';

test('all approved cues exist, remain small and share the existing volume-controlled output', () => {
  const files = new Set();
  for (const [name, cue] of Object.entries(SOUND_CUES)) {
    const calls = [];
    playSoundCue((...args) => calls.push(args), name);
    assert.deepEqual(calls, [[`./assets/audio/se/${cue.file}.mp3`, { volume: cue.volume }]]);
    assert.ok(cue.volume > 0 && cue.volume <= 1);
    files.add(cue.file);
  }
  let bytes = 0;
  for (const file of files) bytes += fs.statSync(new URL(`../../assets/audio/se/${file}.mp3`, import.meta.url)).size;
  assert.equal(files.size, 9);
  assert.ok(bytes < 600_000);
  assert.doesNotThrow(() => playSoundCue(() => { throw Error('audio unavailable'); }, 'reward'));
  playSoundCue(() => Promise.reject(Error('blocked')), 'reward');
  playSoundCue(() => assert.fail('unknown cue must be silent'), 'unknown');
  assert.equal(resultSoundCue('p', 'p'), 'victory');
  assert.equal(resultSoundCue('cpu', 'p'), 'defeat');
  assert.equal(resultSoundCue(null, 'p'), null);
});

test('UI listener excludes disabled buttons and battle/pack-specific cues and can be removed', () => {
  let handler;
  const documentRef = {
    addEventListener(type, fn, capture) { assert.equal(type, 'click'); assert.equal(capture, true); handler = fn; },
    removeEventListener(type, fn) { assert.equal(fn, handler); handler = null; },
  };
  let screen = 'battle';
  const calls = [];
  const remove = installUiSoundFeedback(documentRef, (...args) => calls.push(args), () => screen);
  const button = { disabled: false, textContent: '戻る', getAttribute: () => null };
  const event = { target: { closest: () => button } };
  for (screen of ['battle', 'arena-battle', 'survival-battle', 'pack-opening', 'admin-pack-preview']) handler(event);
  screen = 'home';
  button.disabled = true;
  handler(event);
  assert.equal(calls.length, 0);
  button.disabled = false;
  handler(event);
  handler(event);
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /cancel8/);
  remove();
  assert.equal(handler, null);
});

test('pack opening and rare reveal emit only once and never from render', async () => {
  const sounds = [];
  const screen = Object.create(PackOpeningScreen.prototype);
  Object.assign(screen, {
    phase: 'sealed', revealLocked: false, reducedMotion: true, disposed: false,
    render() {}, wait: async () => {}, onPlaySe: (path) => sounds.push(path),
    revealed: new Set(), revealing: new Set(), burstToken: 0,
    pendingPack: { cards: [{ rarity: 'showcase', masterId: 'm' }] },
    masterIndex: { cards: new Map([['m', { name: 'Monster' }]]) },
  });
  await Promise.all([screen.revealPack(), screen.revealPack()]);
  assert.equal(sounds.length, 1);
  await Promise.all([screen.revealOne(0), screen.revealOne(0)]);
  assert.equal(sounds.filter((path) => path.endsWith('card-se.mp3')).length, 1);
  assert.equal(sounds.filter((path) => path.endsWith('kira1.mp3')).length, 1);
  screen.disposed = true;
});
