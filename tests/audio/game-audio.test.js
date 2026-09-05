import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIO_MASTER_GAIN,
  BATTLE_BGM_PATH,
  BATTLE_BGM_TRIM_GAIN,
  BGM_DEFAULT_VOLUME,
  BGM_VOLUME_STORAGE_KEY,
  GameAudioController,
  HOME_BGM_PATH,
  SE_DEFAULT_VOLUME,
  SE_VOLUME_STORAGE_KEY,
  isIosDevice,
  normalizeAudioVolume,
} from '../../src/audio/game-audio.js';

class FakeEvents {
  constructor() {
    this.listeners = new Map();
    this.visibilityState = 'visible';
  }

  addEventListener(type, listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

class FakeAudio {
  static instances = [];

  constructor(source) {
    this.source = source;
    this.paused = true;
    this.currentTime = 12;
    this.volume = 1;
    this.muted = false;
    this.playCalls = 0;
    this.pauseCalls = 0;
    FakeAudio.instances.push(this);
  }

  setAttribute() {}
  addEventListener() {}

  async play() {
    this.playCalls += 1;
    this.paused = false;
  }

  pause() {
    this.pauseCalls += 1;
    this.paused = true;
  }
}

class FakeAudioContext {
  constructor() {
    this.state = 'suspended';
    this.destination = {};
    this.resumeCalls = 0;
    this.suspendCalls = 0;
    this.gains = [];
  }

  createMediaElementSource() {
    return { connect: () => {}, disconnect: () => {} };
  }

  createGain() {
    const node = { gain: { value: 1 }, connect: () => {}, disconnect: () => {} };
    this.gains.push(node);
    return node;
  }

  async resume() {
    this.resumeCalls += 1;
    this.state = 'running';
  }

  async suspend() {
    this.suspendCalls += 1;
    this.state = 'suspended';
  }
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    value: (key) => values.get(key),
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('master gain halves both tracks while BGM and SE controls default to 100', async () => {
  const storage = memoryStorage();
  const navigatorRef = { userAgent: 'iPhone', audioSession: { type: 'auto' } };
  const controller = new GameAudioController({
    storage, documentRef: new FakeEvents(), windowRef: new FakeEvents(), navigatorRef,
    AudioCtor: FakeAudio, AudioContextCtor: FakeAudioContext,
  });

  assert.equal(HOME_BGM_PATH, './assets/audio/home-bgm.mp3');
  assert.equal(BATTLE_BGM_PATH, './assets/audio/battle.mp3');
  assert.equal(controller.bgmVolume, BGM_DEFAULT_VOLUME);
  assert.equal(controller.seVolume, SE_DEFAULT_VOLUME);
  controller.setScreen('home');
  assert.equal(await controller.unlockFromGesture(), true);
  assert.equal(controller.masterGainNode.gain.value, AUDIO_MASTER_GAIN);
  assert.equal(controller.bgmGainNode.gain.value, 1);
  assert.equal(controller.seGainNode.gain.value, 1);
  assert.equal(controller.trackGainNodes.home.gain.value, 1);
  assert.equal(controller.trackGainNodes.battle.gain.value, BATTLE_BGM_TRIM_GAIN);
  assert.equal(AUDIO_MASTER_GAIN * BATTLE_BGM_TRIM_GAIN, 0.25);
  assert.equal(navigatorRef.audioSession.type, 'ambient');

  assert.equal(controller.setBgmVolume(73.4), 73);
  assert.equal(controller.bgmGainNode.gain.value, 0.73);
  assert.equal(storage.value(BGM_VOLUME_STORAGE_KEY), '73');
  assert.equal(controller.setSeVolume(41.6), 42);
  assert.equal(controller.seGainNode.gain.value, 0.42);
  assert.equal(storage.value(SE_VOLUME_STORAGE_KEY), '42');
  assert.equal(controller.masterGainNode.gain.value, 0.5);
});

test('home and battle screens switch tracks and every other screen pauses BGM', async () => {
  const controller = new GameAudioController({
    storage: memoryStorage(), documentRef: new FakeEvents(), windowRef: new FakeEvents(), navigatorRef: { userAgent: 'Desktop' },
    AudioCtor: FakeAudio, AudioContextCtor: FakeAudioContext,
  });
  controller.setScreen('home');
  await controller.unlockFromGesture();
  assert.equal(controller.tracks.home.paused, false);
  assert.equal(controller.tracks.battle.paused, true);

  controller.setScreen('battle');
  await tick();
  assert.equal(controller.tracks.home.paused, true);
  assert.equal(controller.tracks.battle.paused, false);
  assert.equal(controller.tracks.battle.currentTime, 0);

  controller.setScreen('reward');
  await tick();
  assert.equal(controller.tracks.home.paused, true);
  assert.equal(controller.tracks.battle.paused, true);
});

test('visibility pauses the active track and resumes it without resetting its position', async () => {
  const documentRef = new FakeEvents();
  const controller = new GameAudioController({
    storage: memoryStorage(), documentRef, windowRef: new FakeEvents(), navigatorRef: { userAgent: 'Desktop' },
    AudioCtor: FakeAudio, AudioContextCtor: FakeAudioContext,
  });
  controller.setScreen('arena-battle');
  await controller.unlockFromGesture();
  controller.tracks.battle.currentTime = 48;

  documentRef.visibilityState = 'hidden';
  documentRef.dispatch('visibilitychange');
  await tick();
  assert.equal(controller.tracks.battle.paused, true);
  assert.equal(controller.audioContext.state, 'suspended');

  documentRef.visibilityState = 'visible';
  documentRef.dispatch('visibilitychange');
  await tick();
  assert.equal(controller.tracks.battle.paused, false);
  assert.equal(controller.tracks.battle.currentTime, 48);
});

test('legacy mute is preserved but the former default 50 is replaced by BGM 100', () => {
  const muted = new GameAudioController({
    storage: memoryStorage({ 'mc-home-bgm-volume-v1': '0' }), documentRef: new FakeEvents(), windowRef: new FakeEvents(),
    navigatorRef: { userAgent: 'Desktop' }, AudioCtor: FakeAudio, AudioContextCtor: FakeAudioContext,
  });
  const formerDefault = new GameAudioController({
    storage: memoryStorage({ 'mc-home-bgm-volume-v1': '50' }), documentRef: new FakeEvents(), windowRef: new FakeEvents(),
    navigatorRef: { userAgent: 'Desktop' }, AudioCtor: FakeAudio, AudioContextCtor: FakeAudioContext,
  });
  assert.equal(muted.bgmVolume, 0);
  assert.equal(formerDefault.bgmVolume, 100);
});

test('future sound effects have an independent channel under the same half-volume master', async () => {
  FakeAudio.instances = [];
  const controller = new GameAudioController({
    storage: memoryStorage(), documentRef: new FakeEvents(), windowRef: new FakeEvents(), navigatorRef: { userAgent: 'Desktop' },
    AudioCtor: FakeAudio, AudioContextCtor: FakeAudioContext,
  });
  controller.setScreen('home');
  await controller.unlockFromGesture();
  controller.setSeVolume(80);
  assert.equal(await controller.playSe('./assets/audio/future-effect.mp3', { volume: 0.25 }), true);
  const effect = FakeAudio.instances.at(-1);
  assert.equal(effect.source, './assets/audio/future-effect.mp3');
  assert.equal(effect.playCalls, 1);
  assert.equal(controller.audioContext.gains.at(-1).gain.value, 0.25);
  assert.equal(AUDIO_MASTER_GAIN * (controller.seVolume / 100) * 0.25, 0.1);

  controller.setSeVolume(0);
  assert.equal(await controller.playSe('./assets/audio/muted-effect.mp3'), false);
});

test('iOS remains safely muted instead of bypassing silent mode without Web Audio', async () => {
  const navigatorRef = { userAgent: 'Mozilla/5.0 (iPhone)', audioSession: { type: 'auto' } };
  assert.equal(isIosDevice(navigatorRef), true);
  const controller = new GameAudioController({
    storage: memoryStorage(), documentRef: new FakeEvents(), windowRef: new FakeEvents(), navigatorRef,
    AudioCtor: FakeAudio, AudioContextCtor: null,
  });
  controller.setScreen('battle');
  assert.equal(await controller.unlockFromGesture(), false);
  assert.equal(controller.safetyMuted, true);
  assert.equal(controller.tracks.battle.muted, true);
  assert.equal(controller.tracks.battle.playCalls, 0);
});

test('audio volume normalization keeps exact integer slider semantics', () => {
  assert.equal(normalizeAudioVolume('41'), 41);
  assert.equal(normalizeAudioVolume(41.6), 42);
  assert.equal(normalizeAudioVolume(101), 100);
  assert.equal(normalizeAudioVolume(-1), 0);
  assert.equal(normalizeAudioVolume(Number.NaN), 100);
});
