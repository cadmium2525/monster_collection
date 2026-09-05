export const HOME_BGM_PATH = './assets/audio/home-bgm.mp3';
export const BATTLE_BGM_PATH = './assets/audio/battle.mp3';
export const AUDIO_MASTER_GAIN = 0.5;
export const BGM_DEFAULT_VOLUME = 100;
export const SE_DEFAULT_VOLUME = 100;
export const BGM_VOLUME_STORAGE_KEY = 'mc-bgm-volume-v2';
export const SE_VOLUME_STORAGE_KEY = 'mc-se-volume-v1';

const LEGACY_HOME_BGM_VOLUME_STORAGE_KEY = 'mc-home-bgm-volume-v1';
const BATTLE_SCREENS = new Set(['battle', 'arena-battle']);

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
  if (screen === 'home') return 'home';
  if (BATTLE_SCREENS.has(screen)) return 'battle';
  return null;
}

export class GameAudioController {
  constructor({
    homeSource = HOME_BGM_PATH,
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
    this.activeEffects = new Set();
    this.tracks = {
      home: this._createAudio(homeSource, { loop: true }),
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
    const effect = this._createAudio(source, { loop: false, preload: 'auto' });
    if (!effect) return false;
    const localVolume = Math.max(0, Math.min(1, Number(volume) || 0));
    let sourceNode = null;
    let localGain = null;
    if (this.audioContext && this.seGainNode) {
      try {
        sourceNode = this.audioContext.createMediaElementSource(effect);
        localGain = this.audioContext.createGain();
        localGain.gain.value = localVolume;
        sourceNode.connect(localGain);
        localGain.connect(this.seGainNode);
      } catch {
        if (isIosDevice(this.navigatorRef)) return false;
        effect.volume = AUDIO_MASTER_GAIN * (this.seVolume / 100) * localVolume;
      }
    } else {
      effect.volume = AUDIO_MASTER_GAIN * (this.seVolume / 100) * localVolume;
    }
    const release = () => {
      this.activeEffects.delete(effect);
      try { sourceNode?.disconnect?.(); } catch { /* Already disconnected. */ }
      try { localGain?.disconnect?.(); } catch { /* Already disconnected. */ }
    };
    effect.addEventListener?.('ended', release, { once: true });
    effect.addEventListener?.('error', release, { once: true });
    this.activeEffects.add(effect);
    this._configureAmbientSession();
    if (this.audioContext && this.audioContext.state !== 'running' && this.audioContext.state !== 'closed') {
      try { await this.audioContext.resume(); } catch { release(); return false; }
    }
    try {
      await effect.play();
      return true;
    } catch {
      release();
      return false;
    }
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
      for (const audio of Object.values(this.tracks)) {
        if (!audio) continue;
        const mediaSource = this.audioContext.createMediaElementSource(audio);
        mediaSource.connect(this.bgmGainNode);
        this.mediaSources.push(mediaSource);
      }
    } catch {
      this.audioContext = null;
      this.masterGainNode = null;
      this.bgmGainNode = null;
      this.seGainNode = null;
      this.mediaSources = [];
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
    for (const audio of Object.values(this.tracks)) {
      if (!audio) continue;
      audio.volume = this.directFallback ? AUDIO_MASTER_GAIN * (this.bgmVolume / 100) : 1;
      audio.muted = this.safetyMuted;
    }
  }

  _stopActiveEffects() {
    for (const effect of this.activeEffects) effect.pause?.();
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
