// Controller vibration. Every trigger point in the game already exists as an
// event with a magnitude (hitlag, camera shake, KO); this module mirrors them
// to the Gamepad API's vibrationActuator — feature-detected, so it is silently
// absent on keyboards, on pads without motors, and in browsers without the
// API. All magnitudes and the master switch live in config_fx.js (RUMBLE).
//
// Model: each human player carries a decaying envelope (strong, weak, t) that
// events raise; updateRumble() flushes the loudest of envelope + camera-shake
// ambient to that player's pad every frame with a short playEffect, so
// overlapping events blend instead of queueing.

import { RUMBLE } from "./config_fx.js";
import { state } from "./state.js";
import { padForPlayer } from "./input.js";

const env = new Map();     // playerId -> { strong, weak, t }
const delayed = [];        // [{ playerId, s, w, t, delay }]

function raise(playerId, s, w, t) {
  const e = env.get(playerId) || { strong: 0, weak: 0, t: 0 };
  e.strong = Math.max(e.strong, s);
  e.weak = Math.max(e.weak, w);
  e.t = Math.max(e.t, t);
  env.set(playerId, e);
}

/** A one-off pulse on a fighter's pad. No-op for the CPU. */
export function rumbleFighter(f, s, w, t) {
  if (!RUMBLE.enabled || !f || f.aiState || !f.id) return;
  raise(f.id, s, w, t);
}

/** A named preset from RUMBLE.events — either one pulse or a timed sequence
 *  (Black Flash is tick … beat … slam). */
export function rumbleEvent(f, name) {
  if (!RUMBLE.enabled || !f || f.aiState || !f.id) return;
  const ev = RUMBLE.events[name];
  if (!ev) return;
  for (const p of Array.isArray(ev) ? ev : [ev]) {
    if (p.delay) delayed.push({ playerId: f.id, s: p.s, w: p.w, t: p.t, delay: p.delay });
    else raise(f.id, p.s, p.w, p.t);
  }
}

/** Flush envelopes + shake ambient to the pads. Called once per frame. */
export function updateRumble(dt) {
  if (!RUMBLE.enabled) return;
  for (let i = delayed.length - 1; i >= 0; i--) {
    const d = delayed[i];
    d.delay -= dt;
    if (d.delay <= 0) { raise(d.playerId, d.s, d.w, d.t); delayed.splice(i, 1); }
  }
  // Meteors, sedans, domain slams — anything that shakes the camera hard
  // reaches every human pad as a low ambient, no per-site wiring needed.
  const shake = state.camera?.shake || 0;
  const ambient = shake > RUMBLE.shakeFloor
    ? Math.min(RUMBLE.shakeMax, (shake - RUMBLE.shakeFloor) * RUMBLE.shakeScale)
    : 0;
  for (const f of state.fighters) {
    if (f.aiState || !f.id) continue;
    const e = env.get(f.id);
    let strong = 0, weak = ambient;
    if (e && e.t > 0) {
      e.t -= dt;
      strong = e.strong;
      weak = Math.max(weak, e.weak);
      if (e.t <= 0) { e.strong = 0; e.weak = 0; }
    }
    if (strong < 0.02 && weak < 0.02) continue;
    const act = padForPlayer(f.id)?.vibrationActuator;
    if (!act?.playEffect) continue;
    // Short overlapping effects: each frame's call supersedes the last, so a
    // decaying envelope reads as continuous rumble that stops when we stop.
    try {
      act.playEffect("dual-rumble", {
        duration: 60,
        strongMagnitude: Math.min(1, strong),
        weakMagnitude: Math.min(1, weak),
      })?.catch?.(() => {});
    } catch { /* actuator variants differ; a refusal is fine */ }
  }
}
