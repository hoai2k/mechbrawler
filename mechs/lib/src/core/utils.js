// Math helpers, easing, seeded RNG, small object pools.
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp01((v - a) / (b - a));

// Frame-rate independent exponential smoothing.
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

export function angleLerp(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}
export function angleDamp(a, b, rate, dt) {
  return angleLerp(a, b, 1 - Math.exp(-rate * dt));
}
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// ---- easing ----
export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 + --t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  outBack: (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  inBack: (t) => { const c = 1.70158; return (c + 1) * t * t * t - c * t * t; },
  outElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1;
  },
  outBounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

// ---- seeded RNG (mulberry32) ----
export function makeRng(seed) {
  let s = seed >>> 0;
  const rng = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (a, b) => a + rng() * (b - a);
  rng.int = (a, b) => Math.floor(rng.range(a, b + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.chance = (p) => rng() < p;
  return rng;
}

export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---- device detection (touch/mobile) ----
// Cached; honors ?touch=1 / ?notouch=1 (aka ?desktop) overrides, else sniffs
// for a touchscreen with a coarse primary pointer (phones, tablets).
let _touchOverride = null;
export function isTouchDevice() {
  if (_touchOverride === null) {
    const p = new URLSearchParams(location.search);
    if (p.has('touch') || p.get('input') === 'touch') _touchOverride = true;
    else if (p.has('notouch') || p.has('desktop')) _touchOverride = false;
    else _touchOverride = !!(
      (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) &&
      window.matchMedia?.('(pointer: coarse)').matches);
  }
  return _touchOverride;
}

// ---- scratch vectors (avoid per-frame allocation) ----
export const _v1 = new THREE.Vector3();
export const _v2 = new THREE.Vector3();
export const _v3 = new THREE.Vector3();
export const _q1 = new THREE.Quaternion();

// Flat-ground distance between two Vector3s.
export function distXZ(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}
export function yawTo(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

// ---- simple pool ----
export class Pool {
  constructor(create, reset, size = 0) {
    this.create = create;
    this.reset = reset;
    this.free = [];
    for (let i = 0; i < size; i++) this.free.push(create());
  }
  get() {
    const item = this.free.pop() || this.create();
    if (this.reset) this.reset(item);
    return item;
  }
  release(item) { this.free.push(item); }
}

export function removeFromArray(arr, item) {
  const i = arr.indexOf(item);
  if (i !== -1) { arr[i] = arr[arr.length - 1]; arr.pop(); }
}
