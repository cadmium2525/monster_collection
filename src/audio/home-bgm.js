export const HOME_BGM_PATH = './assets/audio/home-bgm.mp3';
export const HOME_BGM_DEFAULT_VOLUME = 50;
export const HOME_BGM_VOLUME_STORAGE_KEY = 'mc-home-bgm-volume-v1';

export function normalizeBgmVolume(value, fallback = HOME_BGM_DEFAULT_VOLUME) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : fallback;
}

function storedVolume(storage) {
  try {
    const value = storage?.getItem?.(HOME_BGM_VOLUME_STORAGE_KEY);
    return value == null ? HOME_BGM_DEFAULT_VOLUME : normalizeBgmVolume(value);
  } catch {
    return HOME_BGM_DEFAULT_VOLUME;
  }
}

function persistVolume(storage, volume) {
  try {
    storage?.setItem?.(HOME_BGM_VOLUME_STORAGE_KEY, String(volume));
  } catch {
    // Storage can be unavailable in private or restricted browsing. The
    // current session still keeps the selected value in memory.
  }
}

export function isIosDevice(navigatorRef = globalThis.navigator) {
  const userAgent = String(navigatorRef?.userAgent ?? '');
  return /iPad|iPhone|iPod/.test(userAgent)
    || (navigatorRef?.platform === 'MacIntel' && Number(navigatorRef?.maxTouchPoints) > 1);
}

export class HomeBgmController {
  constructor({
    source = HOME_BGM_PATH,
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
    this.AudioContextCtor = AudioContextCtor;
    this.volume = storedVolume(storage);
    this.homeActive = false;
    this.unlocked = false;
    this.pageVisible = documentRef?.visibilityState !== 'hidden';
    this.pipelineReady = false;
    this.directFallback = false;
    this.safetyMuted = false;
    this.syncSequence = 0;
    this.audioContext = null;
    this.gainNode = null;
    this.mediaSource = null;
    this.audio = AudioCtor ? new AudioCtor(source) : null;
    if (this.audio) {
      this.audio.loop = true;
      this.audio.preload = 'none';
      this.audio.playsInline = true;
      this.audio.setAttribute?.('playsinline', '');
    }

    this._onVisibilityChange = () => {
      this.pageVisible = this.documentRef?.visibilityState !== 'hidden';
      void this._syncPlayback({ suspendWhenHidden: !this.pageVisible });
    };
    this._onPageHide = () => {
      this.pageVisible = false;
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
    return this.volume === 0 || this.safetyMuted;
  }

  setHomeActive(active) {
    this.homeActive = Boolean(active);
    void this._syncPlayback();
  }

  setVolume(value) {
    this.volume = normalizeBgmVolume(value);
    persistVolume(this.storage, this.volume);
    this._applyVolume();
    void this._syncPlayback();
    return this.volume;
  }

  unlockFromGesture() {
    this.unlocked = true;
    if (this.audio) this.audio.preload = 'auto';
    this._configureAmbientSession();
    this._ensurePipeline();
    return this._syncPlayback();
  }

  _configureAmbientSession() {
    const session = this.navigatorRef?.audioSession;
    if (!session) return;
    try {
      // WebKit maps ambient Web Audio to a session silenced by the iPhone
      // Ring/Silent switch and stops it when the web app is backgrounded.
      session.type = 'ambient';
    } catch {
      // Older WebKit does not expose AudioSession. Web Audio itself uses the
      // ambient/default route there, so no HTMLMediaElement bypass is used.
    }
  }

  _ensurePipeline() {
    if (this.pipelineReady || !this.audio) return;
    this.pipelineReady = true;
    if (!this.AudioContextCtor) {
      if (isIosDevice(this.navigatorRef)) {
        // Direct HTML audio can ignore the iPhone silent switch. If Web Audio
        // is unavailable, remain silent on iOS instead of surprising users.
        this.safetyMuted = true;
        this.audio.muted = true;
      } else {
        this.directFallback = true;
      }
      this._applyVolume();
      return;
    }
    try {
      this.audioContext = new this.AudioContextCtor({ latencyHint: 'playback' });
      this.mediaSource = this.audioContext.createMediaElementSource(this.audio);
      this.gainNode = this.audioContext.createGain();
      this.mediaSource.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);
    } catch {
      this.audioContext = null;
      this.mediaSource = null;
      this.gainNode = null;
      if (isIosDevice(this.navigatorRef)) {
        this.safetyMuted = true;
        this.audio.muted = true;
      } else {
        this.directFallback = true;
      }
    }
    this._applyVolume();
  }

  _applyVolume() {
    const normalized = this.volume / 100;
    if (this.gainNode?.gain) this.gainNode.gain.value = normalized;
    if (this.audio) {
      this.audio.volume = this.directFallback ? normalized : 1;
      this.audio.muted = this.safetyMuted;
    }
  }

  async _syncPlayback({ suspendWhenHidden = false } = {}) {
    const sequence = ++this.syncSequence;
    const shouldPlay = Boolean(this.audio && this.unlocked && this.homeActive
      && this.pageVisible && this.volume > 0 && !this.safetyMuted);
    if (!shouldPlay) {
      this.audio?.pause?.();
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
    if (sequence !== this.syncSequence || !this.homeActive || !this.pageVisible || this.volume === 0) return false;
    try {
      await this.audio.play();
      return true;
    } catch {
      // Autoplay may still be denied by a platform policy. The next explicit
      // title tap or volume operation can retry without blocking navigation.
      return false;
    }
  }
}
