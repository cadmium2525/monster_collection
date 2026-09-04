import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOME_BGM_DEFAULT_VOLUME,
  HOME_BGM_PATH,
  HOME_BGM_VOLUME_STORAGE_KEY,
  HomeBgmController,
  isIosDevice,
  normalizeBgmVolume,
} from '../../src/audio/home-bgm.js';

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
  constructor(source) {
    this.source = source;
    this.paused = true;
    this.volume = 1;
    this.muted = false;
    this.playCalls = 0;
    this.pauseCalls = 0;
  }

  setAttribute() {}

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
  }

  createMediaElementSource() {
    return { connect: () => {} };
  }

  createGain() {
    return { gain: { value: 1 }, connect: () => {} };
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

test('home BGM defaults to half volume and persists one-step 0-100 values', async () => {
  const documentRef = new FakeEvents();
  const windowRef = new FakeEvents();
  const storage = memoryStorage();
  const navigatorRef = { userAgent: 'iPhone', audioSession: { type: 'auto' } };
  const controller = new HomeBgmController({
    storage, documentRef, windowRef, navigatorRef, AudioCtor: FakeAudio, AudioContextCtor: FakeAudioContext,
  });

  assert.equal(HOME_BGM_PATH, './assets/audio/home-bgm.mp3');
  assert.equal(controller.volume, HOME_BGM_DEFAULT_VOLUME);
  controller.setHomeActive(true);
  assert.equal(await controller.unlockFromGesture(), true);
  assert.equal(controller.audioContext.resumeCalls, 1);
  assert.equal(controller.audio.playCalls, 1);
  assert.equal(controller.gainNode.gain.value, 0.5);
  assert.equal(navigatorRef.audioSession.type, 'ambient');

  assert.equal(controller.setVolume(73.4), 73);
  assert.equal(controller.gainNode.gain.value, 0.73);
  assert.equal(storage.value(HOME_BGM_VOLUME_STORAGE_KEY), '73');
  assert.equal(controller.setVolume(101), 100);
  assert.equal(controller.setVolume(-5), 0);
  assert.equal(controller.muted, true);
  assert.equal(controller.audio.paused, true);
});

test('home BGM pauses while hidden or outside home and resumes from the same audio element', async () => {
  const documentRef = new FakeEvents();
  const windowRef = new FakeEvents();
  const controller = new HomeBgmController({
    storage: memoryStorage(), documentRef, windowRef, navigatorRef: { userAgent: 'Desktop' },
    AudioCtor: FakeAudio, AudioContextCtor: FakeAudioContext,
  });
  controller.setHomeActive(true);
  await controller.unlockFromGesture();
  const initialPlayCalls = controller.audio.playCalls;

  documentRef.visibilityState = 'hidden';
  documentRef.dispatch('visibilitychange');
  await tick();
  assert.equal(controller.audio.paused, true);
  assert.equal(controller.audioContext.state, 'suspended');

  documentRef.visibilityState = 'visible';
  documentRef.dispatch('visibilitychange');
  await tick();
  assert.equal(controller.audio.paused, false);
  assert.ok(controller.audio.playCalls > initialPlayCalls);

  controller.setHomeActive(false);
  await tick();
  assert.equal(controller.audio.paused, true);
});

test('iOS remains safely muted rather than bypassing silent mode when Web Audio is unavailable', async () => {
  const navigatorRef = { userAgent: 'Mozilla/5.0 (iPhone)', audioSession: { type: 'auto' } };
  assert.equal(isIosDevice(navigatorRef), true);
  const controller = new HomeBgmController({
    storage: memoryStorage(), documentRef: new FakeEvents(), windowRef: new FakeEvents(), navigatorRef,
    AudioCtor: FakeAudio, AudioContextCtor: null,
  });
  controller.setHomeActive(true);
  assert.equal(await controller.unlockFromGesture(), false);
  assert.equal(controller.safetyMuted, true);
  assert.equal(controller.audio.muted, true);
  assert.equal(controller.audio.playCalls, 0);
});

test('volume normalization keeps integer slider semantics', () => {
  assert.equal(normalizeBgmVolume('41'), 41);
  assert.equal(normalizeBgmVolume(41.6), 42);
  assert.equal(normalizeBgmVolume(Number.NaN), 50);
});
