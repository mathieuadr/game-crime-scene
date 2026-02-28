/* ═══════════════════════════════════════════════════════════════
   Utility functions — Seeded RNG, array helpers, math.
   Pure functions, zero side effects.
   ═══════════════════════════════════════════════════════════════ */

function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h;
}

export function createRng(seed) {
  return mulberry32(typeof seed === "number" ? seed : hashString(String(seed)));
}

export function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

export function pickN(arr, n, rng) {
  const copy = arr.slice(), result = [];
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(rng() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function randInt(min, max, rng) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function randFloat(min, max, rng) {
  return rng() * (max - min) + min;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
