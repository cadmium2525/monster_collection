export const HOME_BGM_PATH = './assets/audio/home-bgm.mp3';
export const ARENA_BGM_PATH = './assets/audio/arena.mp3';
export const BATTLE_BGM_PATH = './assets/audio/battle.mp3';
export const HIT_SE_PATH = './assets/audio/hit.mp3';
export const ZERO_DAMAGE_SE_PATH = './assets/audio/damage0.mp3';
export const TURN_SE_PATH = './assets/audio/turn.mp3';
export const CARD_DRAW_SE_PATH = './assets/audio/card-se.mp3';
export const STATUS_UP_SE_PATH = './assets/audio/status03.mp3';
export const STATUS_DOWN_SE_PATH = './assets/audio/status04.mp3';
export const AUDIO_MASTER_GAIN = 0.5;
export const BATTLE_BGM_TRIM_GAIN = 0.5;
export const TURN_SE_GAIN = 1.3;
export const BGM_DEFAULT_VOLUME = 100;
export const SE_DEFAULT_VOLUME = 100;
export const BGM_VOLUME_STORAGE_KEY = 'mc-bgm-volume-v2';
export const SE_VOLUME_STORAGE_KEY = 'mc-se-volume-v1';

const LEGACY_HOME_BGM_VOLUME_STORAGE_KEY = 'mc-home-bgm-volume-v1';
const MAX_SE_VOICES_PER_SOURCE = 3;
const HOME_BGM_SCREENS = new Set([
  'home',
  'boosters',
  'pack-opening',
  'decks',
  'deck-detail',
  'deck-builder',
  'assets',
  'card-catalog',
]);
const PREBATTLE_SCREENS = new Set(['setup', 'tournament', 'arena', 'survival']);
const BATTLE_SCREENS = new Set(['battle', 'arena-battle', 'survival-battle']);

export function normalizeAudioVolume(value, fallback = BGM_DEFAULT_VOLUME) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : fallback;
}

function storedVolume(storage, key, fallback, { preserveLegacyMute = false } = {}) {
  try {
    const value = storage?.getItem?.(key);
    if (value != null) return normalizeAudioVolume(value, fallback);
    const legacyValue = preserveLegacyMute ? storage?.getItem?.(LEGACY_HOME_BGM_VOLUME_STORAGE_KEY) : null;
    if (legacyValue != null && normalizeAudioVolume(legacyValue, -1) === 0) return 0;
  } catch {
    // Storage can be unavailable in private or restricted browsing.
  }
  return fallback;
}

function persistVolume(storage, key, volume) {
  try {
    storage?.setItem?.(key, String(volume));
  } catch {
    // The current session still keeps the selected value in memory.
  }
}

export function isIosDevice(navigatorRef = globalThis.navigator) {
  const userAgent = String(navigatorRef?.userAgent ?? '');
  return /iPad|iPhone|iPod/.test(userAgent)
    || (navigatorRef?.platform === 'MacIntel' && Number(navigatorRef?.maxTouchPoints) > 1);
}

function sceneForScreen(screen) {
  if (HOME_BGM_SCREENS.has(screen)) return 'home';
  if (PREBATTLE_SCREENS.has(screen)) return 'arena';
  if (BATTLE_SCREENS.has(screen)) return 'battle';
  return null;
}

export class GameAudioController {
  constructor({
    homeSource = HOME_BGM_PATH,
    arenaSource = ARENA_BGM_PATH,
    battleSource = BATTLE_BGM_PATH,
    storage = globalThis.localStorage,
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    navigatorRef = globalThis.navigator,
    AudioCtor = globalThis.Audio,
    AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext,
  } = {}) {
    this.storage = storage;
    this.documentRef = documentRef;
    this.windowRef = windowRef;
    this.navigatorRef = navigatorRef;
    this.AudioCtor = AudioCtor;
    this.AudioContextCtor = AudioContextCtor;
    this.bgmVolume = storedVolume(storage, BGM_VOLUME_STORAGE_KEY, BGM_DEFAULT_VOLUME, { preserveLegacyMute: true });
    this.seVolume = storedVolume(storage, SE_VOLUME_STORAGE_KEY, SE_DEFAULT_VOLUME);
    this.scene = null;
    this.unlocked = false;
    this.pageVisible = documentRef?.visibilityState !== 'hidden';
    this.pipelineReady = false;
    this.directFallback = false;
    this.safetyMuted = false;
    this.syncSequence = 0;
    this.audioContext = null;
    this.masterGainNode = null;
    this.bgmGainNode = null;
    this.seGainNode = null;
    this.mediaSources = [];
    this.trackGainNodes = {};
    this.activeEffects = new Set();
    this.effectPools = new Map();
    this.tracks = {
      home: this._createAudio(homeSource, { loop: true }),
      arena: this._createAudio(arenaSource, { loop: true }),
      battle: this._createAudio(battleSource, { loop: true }),
    };

    this._onVisibilityChange = () => {
      this.pageVisible = this.documentRef?.visibilityState !== 'hidden';
      if (!this.pageVisible) this._stopActiveEffects();
      void this._syncPlayback({ suspendWhenHidden: !this.pageVisible });
    };
    this._onPageHide = () => {
      this.pageVisible = false;
      this._stopActiveEffects();
      void this._syncPlayback({ suspendWhenHidden: true });
    };
    this._onPageShow = () => {
      this.pageVisible = this.documentRef?.visibilityState !== 'hidden';
      void this._syncPlayback();
    };
    documentRef?.addEventListener?.('visibilitychange', this._onVisibilityChange);
    windowRef?.addEventListener?.('pagehide', this._onPageHide);
    windowRef?.addEventListener?.('pageshow', this._onPageShow);
  }

  get muted() {
    return this.bgmVolume === 0 || this.safetyMuted;
  }

  setScreen(screen) {
    const nextScene = sceneForScreen(screen);
    if (nextScene === 'battle' && this.scene !== 'battle') {
      try { this.tracks.battle.currentTime = 0; } catch { /* Metadata may not be loaded yet. */ }
    }
    this.scene = nextScene;
    if (this.unlocked && nextScene && this.tracks[nextScene]) this.tracks[nextScene].preload = 'auto';
    void this._syncPlayback();
  }

  setBgmVolume(value) {
    this.bgmVolume = normalizeAudioVolume(value);
    persistVolume(this.storage, BGM_VOLUME_STORAGE_KEY, this.bgmVolume);
    this._applyVolumes();
    void this._syncPlayback();
    return this.bgmVolume;
  }

  setSeVolume(value) {
    this.seVolume = normalizeAudioVolume(value, SE_DEFAULT_VOLUME);
    persistVolume(this.storage, SE_VOLUME_STORAGE_KEY, this.seVolume);
    this._applyVolumes();
    return this.seVolume;
  }

  unlockFromGesture() {
    this.unlocked = true;
    if (this.scene && this.tracks[this.scene]) this.tracks[this.scene].preload = 'auto';
    this._configureAmbientSession();
    this._ensurePipeline();
    return this._syncPlayback();
  }

  async playSe(source, { volume = 1 } = {}) {
    if (!source || !this.AudioCtor || !this.unlocked || !this.pageVisible || this.seVolume === 0 || this.safetyMuted) return false;
    this._ensurePipeline();
    if (this.safetyMuted) return false;
    const localVolume = Math.max(0, Math.min(2, Number(volume) || 0));
    if (localVolume === 0) return false;
    const voice = this._acquireEffectVoice(source);
    if (!voice) return false;
    const effect = voice.audio;
    voice.playToken += 1;
    const token = voice.playToken;
    voice.busy = true;
    voice.startedAt = globalThis.performance?.now?.() ?? Date.now();
    voice.localVolume = localVolume;
    if (voice.localGain?.gain) voice.localGain.gain.value = localVolume;
    else effect.volume = Math.min(1, AUDIO_MASTER_GAIN * (this.seVolume / 100) * localVolume);
    this.activeEffects.add(effect);
    this._configureAmbientSession();
    if (this.audioContext && this.audioContext.state !== 'running' && this.audioContext.state !== 'closed') {
      try { await this.audioContext.resume(); } catch { this._releaseEffectVoice(voice, token); return false; }
    }
    try {
      try { effect.currentTime = 0; } catch { /* Metadata may not be ready yet. */ }
      await effect.play();
      return voice.playToken === token;
    } catch {
      this._discardEffectVoice(voice, token);
      return false;
    }
  }

  _createEffectVoice(source) {
    const audio = this._createAudio(source, { loop: false, preload: 'auto' });
    if (!audio) return null;
    const voice = {
      audio,
      source,
      sourceNode: null,
      localGain: null,
      localVolume: 1,
      busy: false,
      startedAt: 0,
      playToken: 0,
    };
    if (this.audioContext && this.seGainNode) {
      try {
        voice.sourceNode = this.audioContext.createMediaElementSource(audio);
        voice.localGain = this.audioContext.createGain();
        voice.sourceNode.connect(voice.localGain);
        voice.localGain.connect(this.seGainNode);
      } catch {
        if (isIosDevice(this.navigatorRef)) return null;
        voice.sourceNode = null;
        voice.localGain = null;
      }
    }
    audio.addEventListener?.('ended', () => this._releaseEffectVoice(voice, voice.playToken));
    audio.addEventListener?.('error', () => this._discardEffectVoice(voice, voice.playToken));
    return voice;
  }

  _acquireEffectVoice(source) {
    const pool = this.effectPools.get(source) ?? [];
    this.effectPools.set(source, pool);
    let voice = pool.find((candidate) => !candidate.busy);
    if (!voice && pool.length < MAX_SE_VOICES_PER_SOURCE) {
      voice = this._createEffectVoice(source);
      if (voice) pool.push(voice);
    }
    if (!voice && pool.length) {
      voice = [...pool].sort((left, right) => left.startedAt - right.startedAt)[0];
      voice.audio.pause?.();
      this._releaseEffectVoice(voice, voice.playToken);
    }
    return voice ?? null;
  }

  _releaseEffectVoice(voice, token) {
    if (!voice || voice.playToken !== token) return;
    voice.busy = false;
    this.activeEffects.delete(voice.audio);
  }

  _discardEffectVoice(voice, token) {
    if (!voice || voice.playToken !== token) return;
    voice.audio.pause?.();
    this._releaseEffectVoice(voice, token);
    try { voice.sourceNode?.disconnect?.(); } catch { /* Already disconnected. */ }
    try { voice.localGain?.disconnect?.(); } catch { /* Already disconnected. */ }
    const pool = this.effectPools.get(voice.source);
    if (!pool) return;
    const index = pool.indexOf(voice);
    if (index >= 0) pool.splice(index, 1);
    if (!pool.length) this.effectPools.delete(voice.source);
  }

  _createAudio(source, { loop = false, preload = 'none' } = {}) {
    if (!this.AudioCtor) return null;
    const audio = new this.AudioCtor(source);
    audio.loop = loop;
    audio.preload = preload;
    audio.playsInline = true;
    audio.setAttribute?.('playsinline', '');
    return audio;
  }

  _configureAmbientSession() {
    const session = this.navigatorRef?.audioSession;
    if (!session) return;
    try {
      session.type = 'ambient';
    } catch {
      // Older WebKit uses the ambient/default route without exposing AudioSession.
    }
  }

  _ensurePipeline() {
    if (this.pipelineReady) return;
    this.pipelineReady = true;
    if (!this.AudioContextCtor) {
      if (isIosDevice(this.navigatorRef)) {
        this.safetyMuted = true;
        for (const audio of Object.values(this.tracks)) if (audio) audio.muted = true;
      } else {
        this.directFallback = true;
      }
      this._applyVolumes();
      return;
    }
    try {
      this.audioContext = new this.AudioContextCtor({ latencyHint: 'playback' });
      this.masterGainNode = this.audioContext.createGain();
      this.bgmGainNode = this.audioContext.createGain();
      this.seGainNode = this.audioContext.createGain();
      this.bgmGainNode.connect(this.masterGainNode);
      this.seGainNode.connect(this.masterGainNode);
      this.masterGainNode.connect(this.audioContext.destination);
      for (const [trackName, audio] of Object.entries(this.tracks)) {
        if (!audio) continue;
        const mediaSource = this.audioContext.createMediaElementSource(audio);
        const trackGain = this.audioContext.createGain();
        trackGain.gain.value = trackName === 'battle' ? BATTLE_BGM_TRIM_GAIN : 1;
        mediaSource.connect(trackGain);
        trackGain.connect(this.bgmGainNode);
        this.mediaSources.push(mediaSource);
        this.trackGainNodes[trackName] = trackGain;
      }
    } catch {
      this.audioContext = null;
      this.masterGainNode = null;
      this.bgmGainNode = null;
      this.seGainNode = null;
      this.mediaSources = [];
      this.trackGainNodes = {};
      if (isIosDevice(this.navigatorRef)) {
        this.safetyMuted = true;
        for (const audio of Object.values(this.tracks)) if (audio) audio.muted = true;
      } else {
        this.directFallback = true;
      }
    }
    this._applyVolumes();
  }

  _applyVolumes() {
    if (this.masterGainNode?.gain) this.masterGainNode.gain.value = AUDIO_MASTER_GAIN;
    if (this.bgmGainNode?.gain) this.bgmGainNode.gain.value = this.bgmVolume / 100;
    if (this.seGainNode?.gain) this.seGainNode.gain.value = this.seVolume / 100;
    if (this.trackGainNodes.home?.gain) this.trackGainNodes.home.gain.value = 1;
    if (this.trackGainNodes.battle?.gain) this.trackGainNodes.battle.gain.value = BATTLE_BGM_TRIM_GAIN;
    for (const [trackName, audio] of Object.entries(this.tracks)) {
      if (!audio) continue;
      const trackGain = trackName === 'battle' ? BATTLE_BGM_TRIM_GAIN : 1;
      audio.volume = this.directFallback ? AUDIO_MASTER_GAIN * trackGain * (this.bgmVolume / 100) : 1;
      audio.muted = this.safetyMuted;
    }
    for (const pool of this.effectPools.values()) {
      for (const voice of pool) {
        if (!voice.localGain) {
          voice.audio.volume = Math.min(1, AUDIO_MASTER_GAIN * (this.seVolume / 100) * voice.localVolume);
        }
        voice.audio.muted = this.safetyMuted;
      }
    }
  }

  _stopActiveEffects() {
    for (const pool of this.effectPools.values()) {
      for (const voice of pool) {
        if (!voice.busy) continue;
        voice.audio.pause?.();
        this._releaseEffectVoice(voice, voice.playToken);
      }
    }
    this.activeEffects.clear();
  }

  async _syncPlayback({ suspendWhenHidden = false } = {}) {
    const sequence = ++this.syncSequence;
    const target = this.scene ? this.tracks[this.scene] : null;
    const shouldPlay = Boolean(target && this.unlocked && this.pageVisible && this.bgmVolume > 0 && !this.safetyMuted);
    for (const audio of Object.values(this.tracks)) {
      if (audio && (!shouldPlay || audio !== target)) audio.pause?.();
    }
    if (!shouldPlay) {
      if (suspendWhenHidden && this.audioContext?.state === 'running') {
        try { await this.audioContext.suspend(); } catch { /* The OS may already have suspended it. */ }
        if (sequence !== this.syncSequence && this.pageVisible) void this._syncPlayback();
      }
      return false;
    }
    this._configureAmbientSession();
    if (this.audioContext && this.audioContext.state !== 'running' && this.audioContext.state !== 'closed') {
      try { await this.audioContext.resume(); } catch { return false; }
    }
    if (sequence !== this.syncSequence || target !== this.tracks[this.scene] || !this.pageVisible || this.bgmVolume === 0) return false;
    if (target.paused === false) return true;
    try {
      await target.play();
      return true;
    } catch {
      return false;
    }
  }
}
