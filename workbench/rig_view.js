// THE SHARED RIG VIEWER — the one place either workbench tool learns how to
// put a mech on a canvas.
//
// Both tools in this folder need the same four things: boot the game's own 3D
// renderer, make sure a mech's rig is in memory, draw that mech in a named
// state at a named clip time, and say what the loader actually resolved that
// state to. The effect workbench needed them to stand a machine beside the
// drawing it throws; the pose workbench needs them to answer "does this state
// render at all". Before this file existed the first tool had them inline, and
// the second would have had to copy them — which is how two tools end up
// disagreeing about what a pose looks like.
//
// EVERYTHING HERE IS THE GAME'S OWN CALL. `drawMech` is `drawCharFrame` with
// the same token `currentFrame` mints; `resolution` is `loader.resolveClip`,
// the function the renderer itself asks. Nothing in this file re-implements a
// decision the engine makes, because a workbench with its own idea of what a
// pose is is a workbench that lies.
//
// THE CAMERA. render3d frames every character through one lens
// (scene.CAMERA_YAW_DEG = -78, a few degrees off profile) and pose.js pins
// several states to a presented angle on top of that (the K3 facing work). Both
// happen inside `drawMech`, so the default view here IS the gameplay view. The
// orbit below is a workbench-only OFFSET on that camera — zeroed, it is exactly
// the shot the game renders, which is what makes "Reset" a return to the truth
// rather than to a second approximation.

import * as render3d from "../render3d/src/backend.js";
import { STATES, clipNameFor } from "../render3d/src/states.js";
import { CHARACTERS, CHARACTER_KEYS } from "../src/characters.js";
import { headHeightTarget } from "../src/heights.js";

let loader = null;   // render3d/src/loader.js, once the engine has booted
let scene = null;    // render3d/src/scene.js
let bootPromise = null;

/**
 * Boot the game's renderer and grab the two engine modules the tools poke at
 * directly. `render3d.init()` swallows its own failures (the game must still
 * boot with no rigs), so `ready` reports whether anything can actually draw.
 */
export async function bootRenderer() {
  bootPromise ||= (async () => {
    await render3d.init();
    // Same module URLs the backend imported, so ESM hands back the SAME module
    // instances — the loader's rig table and the scene's camera are the ones
    // that just booted, not fresh empty copies.
    loader = await import("../render3d/src/loader.js");
    scene = await import("../render3d/src/scene.js");
    return { ready: render3d.modelCount() >= 0 };
  })();
  return bootPromise;
}

// ------------------------------------------------------------------ the cast

/** Every mech in the game, in roster order, with the name a caption wants. */
export const MECHS = CHARACTER_KEYS.map((key) => ({
  key,
  name: CHARACTERS[key]?.name || key,
}));

// ---------------------------------------------------------------- the states

/** Every state a clip can be asked for — the same table the pose player drives
 *  from, so the dropdown lists what the engine can actually be asked for rather
 *  than a hand-kept list that drifts. Aliased states are included and marked:
 *  "this state plays somebody else's clip" is exactly the kind of thing a
 *  debugging tool should show rather than hide. */
export const POSE_STATES = Object.keys(STATES).map((state) => ({
  state,
  clip: clipNameFor(state),
  alias: clipNameFor(state) !== state ? clipNameFor(state) : null,
  tier: STATES[state]?.tier || "",
  loop: !!STATES[clipNameFor(state)]?.loop,
  duration: STATES[clipNameFor(state)]?.duration ?? 1,
}));

const STATE_BY_NAME = new Map(POSE_STATES.map((s) => [s.state, s]));

export function stateSpec(state) {
  return STATE_BY_NAME.get(state) || null;
}

/**
 * WHAT THE LOADER ACTUALLY RESOLVED — the readout the pose tool exists for.
 *
 * `resolveClip` is the renderer's own question, and its answer carries a
 * `source` string saying which branch won: `glb:clawSnap` (the rig's own
 * exported animation, named by the manifest), `glb:x@0.2s` (that clip frozen at
 * a time), `from:other` (borrowed from another rig), `own`, `inherit:…`, and
 * `+mirror` appended when the clip is played mirrored. A null answer means the
 * state resolves to NOTHING and the fighter draws the placeholder body — which
 * is the failure this tool is for, so it is reported as a state rather than
 * swallowed.
 */
export function resolution(charKey, state) {
  const spec = stateSpec(state);
  const clip = clipNameFor(state);
  let resolved = null;
  let error = null;
  try {
    resolved = loader?.resolveClip?.(charKey, state) || null;
  } catch (err) {
    error = err.message;
  }
  return {
    state,
    clip,
    alias: spec?.alias || null,
    source: resolved?.source || null,
    ok: !!resolved,
    rig: !!loader?.hasRig?.(charKey),
    error,
    loop: !!spec?.loop,
    duration: spec?.duration ?? 1,
  };
}

// ------------------------------------------------------------------- the rigs

/** Is this mech's rig in memory and posable right now? */
export function rigReady(charKey) {
  return !!loader?.hasRig?.(charKey);
}

/** Start this mech's rig loading (idempotent, de-duped by the loader). Rigs are
 *  8–46 MB each and load lazily by default, so every viewer in here has to ask
 *  and then keep redrawing until the answer changes. */
export function ensureRig(charKey) {
  render3d.preload?.(charKey, true);
}

/** Resolve once the rig is posable, or give up after `timeoutMs`. Cheap polling
 *  rather than an event, because the loader publishes none. */
export function whenRigReady(charKey, timeoutMs = 30000) {
  ensureRig(charKey);
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      if (rigReady(charKey)) return resolve(true);
      if (performance.now() - t0 > timeoutMs) return resolve(false);
      setTimeout(tick, 120);
    };
    tick();
  });
}

// ------------------------------------------------------------------ the draw

/** How tall this mech is drawn, in game pixels — the number every scene in
 *  either tool is laid out against, so a drawing beside it is a ratio you can
 *  read. */
export function mechHeightPx(charKey) {
  return headHeightTarget(charKey);
}

/**
 * THE BOX A RENDERED MECH ACTUALLY OCCUPIES, in game pixels around its feet.
 *
 * Not the same as its height, and framing a viewer on the height alone is how
 * you get the crop this function exists to prevent. render3d renders into a
 * SQUARE texture whose side is FRAME_MUL (1.5) times the rig's height, with the
 * foot line FOOT_FRAC (10%) up from the bottom, and blits that whole square at
 * game scale — so a wide brace or a lunge toward the lens legitimately paints
 * three quarters of a body-height either side of the feet, and a tenth of it
 * below the floor. Frame on this and the machine is always whole.
 */
export function mechFrameBox(charKey) {
  const h = mechHeightPx(charKey);
  const side = h * 1.5;             // scene.FRAME_MUL
  return { side, halfW: side / 2, above: side * 0.9, below: side * 0.1 };
}

/**
 * Draw a mech, feet at (x, y), in game pixels, on whatever transform the caller
 * is already under. Returns false when there is no rig yet (the caller draws
 * its own placeholder — see `drawGhost`).
 *
 * `anim` is a state name and `t` a clip time in seconds; the pair is exactly
 * what the game passes, so the presentation pin, the aim solve and the facing
 * yaw all land the same way they do in a match.
 */
export function drawMech(ctx, charKey, anim, t, x, y, opts = {}) {
  const token = render3d.currentFrame(charKey, anim, t);
  return render3d.drawCharFrame(ctx, charKey, token, x, y, {
    facing: 1, ...opts,
  });
}

/** The stand-in for a rig that has not landed: a box the mech's own height, so
 *  a viewer waiting on a 40 MB download is still a ruler. */
export function drawGhost(ctx, charKey, x, y, lineScale = 1) {
  const h = mechHeightPx(charKey);
  ctx.save();
  ctx.strokeStyle = "rgba(120, 200, 255, 0.28)";
  ctx.lineWidth = 1.4 * lineScale;
  ctx.setLineDash([6 * lineScale, 5 * lineScale]);
  ctx.strokeRect(x - h * 0.19, y - h, h * 0.38, h);
  ctx.restore();
}

// ------------------------------------------------------------------ the orbit
//
// scene.js already owns a workbench orbit — a yaw/pitch/dolly offset laid on
// top of the match camera, which joins the pose-cache key so a moved camera
// re-renders instead of serving the old seat. This is the thin wrapper the
// tools use, plus the pointer handling, so both tools orbit identically.

export const IN_GAME_ORBIT = { yawDeg: 0, pitchDeg: 0, dolly: 1 };

export function setOrbit(o) {
  scene?.setOrbit?.(o);
}

/** The camera angle the game itself renders at, for the caption. */
export function inGameCameraDeg() {
  return scene?.CAMERA_YAW_DEG ?? -78;
}

/**
 * Mouse-orbit a canvas: drag to rotate, wheel to zoom. Returns a controller
 * carrying the live orbit, so the caller can show it and reset it.
 *
 * The orbit is stored here and pushed into the scene before every draw by the
 * caller's redraw, rather than pushed on every pointer event — the scene's
 * orbit is global to the renderer, and setting it at draw time is what keeps
 * two viewers on one page from fighting over the camera.
 */
export function attachOrbit(canvas, onChange) {
  const orbit = { ...IN_GAME_ORBIT };
  let from = null;
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    from = { x: e.clientX, y: e.clientY, yaw: orbit.yawDeg, pitch: orbit.pitchDeg };
    canvas.classList.add("is-orbiting");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!from) return;
    orbit.yawDeg = from.yaw + (e.clientX - from.x) * 0.4;
    // Clamped by scene.setOrbit at ±80° anyway; clamped here too so the
    // readout never claims an angle the camera did not take.
    orbit.pitchDeg = Math.max(-80, Math.min(80, from.pitch - (e.clientY - from.y) * 0.35));
    onChange?.(orbit);
  });
  const end = () => { from = null; canvas.classList.remove("is-orbiting"); };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    orbit.dolly = Math.max(0.3, Math.min(4, orbit.dolly * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
    onChange?.(orbit);
  }, { passive: false });
  return {
    orbit,
    reset() {
      Object.assign(orbit, IN_GAME_ORBIT);
      onChange?.(orbit);
    },
    /** True while the viewer is showing something other than the game's shot. */
    moved() {
      return orbit.yawDeg !== 0 || orbit.pitchDeg !== 0 || orbit.dolly !== 1;
    },
  };
}
