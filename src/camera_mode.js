// The seam between the flat renderer and the 2.5D camera (docs/2.5d-camera-plan.md).
//
// `?camera=3d` puts the scene — backdrop, platforms, fighters, projectiles —
// on a WebGL canvas under the game canvas, with a perspective camera doing the
// framing. Everything else about the game is untouched: the simulation, the
// blast zones, `updateCamera()` and the flat renderer all keep running exactly
// as they do today, and flat mode never loads a byte of the 3D module.
//
// This file is the only thing both sides import. It is deliberately tiny and
// three.js-free: render.js asks it which mode is on and which module to hand
// the frame to, main.js flips it after the lazy import succeeds, and stage
// gimmicks poke `cameraCue` without knowing whether anyone is listening.

/** "flat" | "3d". Flat is the default and the fallback — a missing WebGL
 *  context or a failed import must leave the game exactly as it ships. */
export let cameraMode = "flat";

/** The loaded src/camera3d/index.js module, once `enable3dCamera` has run. */
export let camera3d = null;

/** Called by main.js after the lazy import of the 3D module succeeds AND the
 *  module got a WebGL context. From the next frame on, render.js routes the
 *  scene through `camera3d` instead of drawing it itself. */
export function enable3dCamera(module) {
  camera3d = module;
  cameraMode = "3d";
}

// ---------------------------------------------------------------- camera cues
//
// Stage gimmicks (stage_fx.js) announce their big moments here — Curse Maw's
// fang snap, Billboard Roof's lightning, Crosswalk Rush's traffic. They call
// `cameraCue` unconditionally; in flat mode (or before the 3D scene exists)
// nobody is listening and the call is a no-op, which is the feature detection
// the plan asks for: stage_fx.js needs no knowledge of which mode is running.
//
// A LIST of listeners rather than one handler, because a cue is an event about
// the STAGE, not a message to the camera: the rig moves the lens on it, and
// the garnish layer spawns cards on it. Both want the same "the traffic is
// running now, going left" and neither should have to learn about the other.

const cueListeners = [];

/** Subscribe to stage cues. Both the rig and the garnish layer register here
 *  when the 3D scene is built. */
export function addCameraCueListener(fn) {
  cueListeners.push(fn);
}

/** Announce a stage moment, if anything is listening. `name` is a treatment
 *  the listeners know (see CUES in config_camera.js); `strength` scales it and
 *  carries a sign where direction matters (which way the wave is sweeping).
 *  Default 1. */
export function cameraCue(name, strength = 1) {
  for (const fn of cueListeners) fn(name, strength);
}
