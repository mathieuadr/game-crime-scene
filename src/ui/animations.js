/* ═══════════════════════════════════════════════════════════════
   Animation Utilities — Reusable JS-driven animation helpers.
   CSS keyframes handle most effects; these cover the JS-driven
   ones (typewriter reveal, procedural glitch, screen flash).
   ═══════════════════════════════════════════════════════════════ */

import { soundManager } from './sound.js';

/**
 * Typewriter text reveal — appends characters one by one.
 * Resolves when complete. Plays throttled typewriter sound.
 */
export function typewriterReveal(el, text, { speed = 80, soundEvery = 3 } = {}) {
  return new Promise(resolve => {
    let i = 0;
    el.textContent = '';
    const interval = setInterval(() => {
      if (i >= text.length) {
        clearInterval(interval);
        resolve();
        return;
      }
      el.textContent += text[i];
      if (i % soundEvery === 0) soundManager.play('typewriter');
      i++;
    }, speed);
  });
}

/**
 * Glitch flicker — rapid red/cyan offsets for a cinematic title effect.
 */
export function glitchFlicker(el, { duration = 400 } = {}) {
  return new Promise(resolve => {
    el.classList.add('glitch-active');
    setTimeout(() => {
      el.classList.remove('glitch-active');
      resolve();
    }, duration);
  });
}

/**
 * Shake an element briefly (contradiction, confront).
 */
export function shakeElement(el, { duration = 400 } = {}) {
  el.classList.add('anim-shake');
  setTimeout(() => el.classList.remove('anim-shake'), duration);
}

/**
 * Flash the screen edges in a given color (red for contradiction/confront).
 */
export function flashEdge(color = '#8B1A1A', { duration = 200 } = {}) {
  const overlay = document.getElementById('edge-flash');
  if (!overlay) return;
  overlay.style.boxShadow = `inset 0 0 80px 30px ${color}`;
  overlay.style.opacity = '1';
  setTimeout(() => { overlay.style.opacity = '0'; }, duration);
}

/**
 * Typewriter reveal for chat bubbles — character by character with
 * cursor blinking, resolves when done.
 */
export function typewriterChat(el, text, { speed = 25, soundEvery = 3 } = {}) {
  return new Promise(resolve => {
    let i = 0;
    el.textContent = '';
    el.classList.add('typewriter-cursor');
    const interval = setInterval(() => {
      if (i >= text.length) {
        clearInterval(interval);
        el.classList.remove('typewriter-cursor');
        resolve();
        return;
      }
      el.textContent += text[i];
      if (i % soundEvery === 0) soundManager.play('typewriter');
      i++;
    }, speed);
  });
}

/**
 * Page transition helper — fades out current, calls swap callback,
 * fades in new content.
 */
export function pageTransition(outEl, inEl, swapCallback, inDisplay = 'block') {
  outEl.classList.add('page-exit');
  soundManager.play('paper-rustle');
  setTimeout(() => {
    if (swapCallback) swapCallback();
    outEl.style.display = 'none';
    outEl.classList.remove('page-exit');
    inEl.style.display = inDisplay;
    inEl.classList.add('page-enter');
    setTimeout(() => inEl.classList.remove('page-enter'), 350);
  }, 300);
}
