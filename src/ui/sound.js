/* ═══════════════════════════════════════════════════════════════
   SoundManager — Background music with volume cycling.
   ═══════════════════════════════════════════════════════════════ */

const SOUNDS = {};

const BG_SOUNDS = {
  'bg-menu':    'assets/sounds/bg-menu.mp3',
  'bg-loading': 'assets/sounds/bg-loading.mp3',
};

// Volume levels cycled by the sound button: full → low → mute → full
const VOLUME_LEVELS = [
  { value: 0.55, icon: '🔊' },
  { value: 0.18, icon: '🔈' },
  { value: 0,    icon: '🔇' },
];

const FADE_IN_MS   = 1800;
const FADE_OUT_MS  = 1000;
const STORAGE_KEY  = 'crime-scene-vol-idx';

class SoundManager {
  constructor() {
    this._cache       = {};
    this._failed      = new Set();
    this._volIdx      = parseInt(localStorage.getItem(STORAGE_KEY) ?? '0', 10);
    if (isNaN(this._volIdx) || this._volIdx < 0 || this._volIdx >= VOLUME_LEVELS.length) {
      this._volIdx = 0;
    }
    this._bgAudio     = null;
    this._bgName      = null;
    this._bgFadeTimer = null;
  }

  // ─── Sound Effects (empty — slots reserved for future sounds) ──

  _getAudio(name) {
    if (this._failed.has(name)) return null;
    if (this._cache[name]) return this._cache[name];
    const path = SOUNDS[name];
    if (!path) return null;
    const audio = new Audio(path);
    audio.preload = 'auto';
    audio.addEventListener('error', () => {
      this._failed.add(name);
      delete this._cache[name];
    }, { once: true });
    this._cache[name] = audio;
    return audio;
  }

  play(name) {
    if (this.isMuted()) return;
    const audio = this._getAudio(name);
    if (!audio) return;
    const clone = audio.cloneNode();
    clone.volume = 0.4;
    clone.play().catch(() => {});
  }

  preloadAll() {
    for (const name of Object.keys(SOUNDS)) this._getAudio(name);
  }

  // ─── Background Music ─────────────────────────────────────────

  playBg(name) {
    if (this._bgName === name) return;
    const path = BG_SOUNDS[name];
    if (!path) return;

    this._stopBgImmediate();
    this._bgName = name;

    const audio = new Audio(path);
    audio.loop   = true;
    audio.volume = 0;
    this._bgAudio = audio;

    if (!this.isMuted()) {
      audio.play().catch(() => {});
      this._fadeTo(audio, this._targetVolume(), FADE_IN_MS);
    }
  }

  stopBg(callback) {
    if (!this._bgAudio) { callback?.(); return; }
    const audio = this._bgAudio;
    this._bgAudio = null;
    this._bgName  = null;
    this._clearFade();
    this._fadeOut(audio, FADE_OUT_MS, () => {
      audio.pause();
      audio.src = '';
      callback?.();
    });
  }

  // ─── Volume Cycling ───────────────────────────────────────────

  /**
   * Cycles Full → Low → Mute → Full.
   * Returns the new level { value, icon }.
   */
  cycleVolume() {
    this._volIdx = (this._volIdx + 1) % VOLUME_LEVELS.length;
    localStorage.setItem(STORAGE_KEY, String(this._volIdx));
    const level = VOLUME_LEVELS[this._volIdx];

    if (this._bgAudio) {
      if (level.value === 0) {
        this._clearFade();
        this._bgAudio.pause();
      } else {
        if (this._bgAudio.paused) this._bgAudio.play().catch(() => {});
        this._fadeTo(this._bgAudio, level.value, 400);
      }
    }

    return level;
  }

  currentVolumeLevel() {
    return VOLUME_LEVELS[this._volIdx];
  }

  isMuted() {
    return VOLUME_LEVELS[this._volIdx].value === 0;
  }

  // ─── Internals ────────────────────────────────────────────────

  _targetVolume() {
    return VOLUME_LEVELS[this._volIdx].value;
  }

  _stopBgImmediate() {
    this._clearFade();
    if (this._bgAudio) {
      this._bgAudio.pause();
      this._bgAudio.src = '';
      this._bgAudio = null;
    }
    this._bgName = null;
  }

  _clearFade() {
    if (this._bgFadeTimer) {
      clearInterval(this._bgFadeTimer);
      this._bgFadeTimer = null;
    }
  }

  _fadeTo(audio, targetVol, duration) {
    this._clearFade();
    const steps    = 40;
    const interval = duration / steps;
    const startVol = audio.volume;
    const delta    = (targetVol - startVol) / steps;
    let step = 0;
    this._bgFadeTimer = setInterval(() => {
      step++;
      audio.volume = Math.max(0, Math.min(1, startVol + delta * step));
      if (step >= steps) this._clearFade();
    }, interval);
  }

  _fadeOut(audio, duration, cb) {
    const steps    = 25;
    const interval = duration / steps;
    const startVol = audio.volume;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      audio.volume = Math.max(0, startVol * (1 - step / steps));
      if (step >= steps) { clearInterval(timer); cb?.(); }
    }, interval);
  }
}

export const soundManager = new SoundManager();
