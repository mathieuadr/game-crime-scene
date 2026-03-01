/* ═══════════════════════════════════════════════════════════════
   SoundManager — Loads and plays short sound effects.
   Supports a global mute toggle persisted in localStorage.
   ═══════════════════════════════════════════════════════════════ */

const SOUNDS = {
  'typewriter':   'assets/sounds/typewriter-click.mp3',
  'paper-rustle': 'assets/sounds/paper-rustle.mp3',
  'folder-snap':  'assets/sounds/folder-snap.mp3',
  'vhs-static':   'assets/sounds/vhs-static.mp3',
  'alarm':        'assets/sounds/alarm-subtle.mp3',
  'key-click':    'assets/sounds/key-click.mp3',
};

const STORAGE_KEY = 'crime-scene-muted';

class SoundManager {
  constructor() {
    this._cache = {};
    this._failed = new Set();
    this._muted = localStorage.getItem(STORAGE_KEY) === '1';
  }

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
    if (this._muted) return;
    const audio = this._getAudio(name);
    if (!audio) return;
    const clone = audio.cloneNode();
    clone.volume = 0.4;
    clone.play().catch(() => {});
  }

  toggleMute() {
    this._muted = !this._muted;
    localStorage.setItem(STORAGE_KEY, this._muted ? '1' : '0');
    return this._muted;
  }

  isMuted() {
    return this._muted;
  }

  preloadAll() {
    for (const name of Object.keys(SOUNDS)) {
      this._getAudio(name);
    }
  }
}

export const soundManager = new SoundManager();
