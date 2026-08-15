// The camera rig: a perspective camera on a dolly, replacing pan/zoom while
// reusing camera.js's existing targeting math. updateCamera() keeps running
// unmodified in both modes — this rig is a CONSUMER of state.camera, never a
// replacement, so blast zones, HUD logic and the flat fallback all keep one
// source of truth. Only the projection changes.
//
// Everything tunable lives in config_camera.js. The rig itself is pure math —
// no DOM, no WebGL context — so tools/smoke_camera.mjs can drive it headless.

import { PerspectiveCamera, Vector3 } from "../../vendor/three/three.module.js";
import { CAMERA as C, DRAMA, BOARD_CAMERA, CUES } from "../config_camera.js";
import { addCameraCueListener } from "../camera_mode.js";
import { getStage, mainPlatform } from "../stages.js";
import { WORLD } from "../constants.js";
import { clamp, lerp } from "../utils.js";

const DEG = Math.PI / 180;

/** Sim space -> world space. Sim is 1280×720 pixels with +y down; world is
 *  metres-ish with +y up, stage centre at the origin, the gameplay plane at
 *  z = 0. Linear, so the scene is an undistorted image of the sim. */
export function simToWorldX(x) { return (x - C.originX) * C.simScale; }
export function simToWorldY(y) { return (C.originY - y) * C.simScale; }

/** Dolly distance that frames the same 1280/zoom × 720/zoom window the flat
 *  renderer shows at this zoom. ≈13.4 world units at zoom 1. */
export function dollyFor(zoom, fovDeg = C.fov) {
  return (WORLD.h / zoom) * C.simScale / (2 * Math.tan((fovDeg * DEG) / 2));
}

export const camera = new PerspectiveCamera(C.fov, WORLD.w / WORLD.h, C.near, C.far);

// ------------------------------------------------------------------- cues
//
// Stage gimmicks poke these through cameraCue() (camera_mode.js). Each active
// cue runs an attack/hold/release envelope over the treatment's numbers.

const activeCues = [];

function cue(name, strength = 1) {
  const def = CUES[name];
  if (!def) return;
  // Retriggering a sustained cue restarts it instead of stacking a second copy.
  const existing = activeCues.find((c) => c.name === name);
  if (existing) { existing.t = Math.min(existing.t, def.attack); existing.strength = strength; return; }
  activeCues.push({ name, def, strength, t: 0 });
}

addCameraCueListener(cue);

/** 0→1→0 over attack/hold/release, smooth at both ends. */
function envelope(c) {
  const { attack = 0.1, hold = 0, release = 0.3 } = c.def;
  if (c.t < attack) { const k = c.t / attack; return k * k * (3 - 2 * k); }
  if (c.t < attack + hold) return 1;
  const k = (c.t - attack - hold) / release;
  return k >= 1 ? 0 : 1 - k * k * (3 - 2 * k);
}

// ------------------------------------------------------------------- state
//
// The rig's own smoothed values. cam.x/y/zoom arrive already smoothed by
// camera.js; these are the 3D-only quantities layered on top.

const smooth = {
  yaw: 0,       // degrees
  roll: 0,      // degrees
  dollyMul: 1,  // × the standard framing distance
  fov: C.fov,
  focusX: null, // world x of a drama focus target, or null
  focus: 0,     // 0..1 blend toward that target
};

let kickT = Infinity;   // time since the last cam.kick rising edge
let prevKick = 0;
let domainT = -1;       // time since the current domain cast began, or -1
// Where the ACTION is, in sim pixels — the point overlayTransform pins its
// linearisation to. The mean alive-fighter position, not the camera centre:
// the affine is exact where it is fitted, and the pixels that must land
// exactly are the ones on the fighters (hitbox debug is the acceptance test).
let lastSimX = 640, lastSimY = 460;

/** Reset between matches — main.js resets state.camera the same way. */
export function resetRig() {
  smooth.yaw = 0; smooth.roll = 0; smooth.dollyMul = 1; smooth.fov = C.fov;
  smooth.focusX = null; smooth.focus = 0;
  kickT = Infinity; prevKick = 0; domainT = -1;
  activeCues.length = 0;
}

function boardDials(stageKey) {
  return BOARD_CAMERA[stageKey] || {};
}

/** Advance the rig one frame and pose `camera`. `st` is the game state (or a
 *  scripted stand-in from the smoke test): reads st.camera, st.fighters,
 *  st.stageKey, st.platforms, st.introT, st.endT, st.domainOverlay. */
export function updateRig(st, dt) {
  const cam = st.camera;
  const board = boardDials(st.stageKey);
  // factor = 1 - damping^dt, the same convention camera.js uses. A board that
  // halves damping (dampingMul 0.5) makes the exponent smaller, i.e. the lerp
  // LAZIER, which is the glide-and-overshoot feel Sunken Crossing wants.
  const lerpK = 1 - Math.pow(C.damping, dt * (board.dampingMul ?? 1));

  // ---- cue contributions
  let cueDolly = 0, cueYaw = 0, cueRoll = 0, cueFov = 0, cueShake = 0, cuePan = 0;
  let yawTo0 = false;
  for (let i = activeCues.length - 1; i >= 0; i--) {
    const c = activeCues[i];
    c.t += dt;
    const e = envelope(c) * (Math.abs(c.strength) || 1);
    const sign = Math.sign(c.strength) || 1;
    const d = c.def;
    if (d.dolly) cueDolly += d.dolly * e;
    if (d.yaw) cueYaw += d.yaw * e * sign;
    if (d.roll) cueRoll += d.roll * e * sign;
    if (d.fov) cueFov += d.fov * e;
    if (d.shake) cueShake += d.shake * e;
    if (d.pan) cuePan += d.pan * e * sign;
    if (d.yawTo0 && e > 0.5) yawTo0 = true;
    const total = (d.attack ?? 0.1) + (d.hold ?? 0) + (d.release ?? 0.3);
    if (c.t >= total) {
      if (d.kickOnRelease) cam.kick = Math.max(cam.kick, d.kickOnRelease);
      activeCues.splice(i, 1);
    }
  }

  // ---- tracked point, from the sim camera (already smoothed and clamped)
  let camX = simToWorldX(cam.x);
  const camY = simToWorldY(cam.y);

  // Bridge Duel: blend some of the main platform's drift into the tracked x so
  // the world visibly slides under the fight.
  if (board.driftFollow && st.platforms?.length) {
    const live = mainPlatform(st.platforms);
    const home = mainPlatform(getStage(st.stageKey).platforms);
    camX += (live.x - home.x) * C.simScale * board.driftFollow;
  }

  // ---- drama: who is the shot about, and how tight is it?
  const alive = st.fighters.filter((f) => !f.dead && f.respawnTimer <= 0);
  let dollyTarget = 1;
  let focusTargetX = null;
  let yawTarget;

  const caster = alive.find((f) => f.action?.kind === "ult" && f.action.t < f.action.dur);
  const casting = !!caster;
  if (st.domainOverlay) {
    domainT = domainT < 0 ? 0 : domainT + dt;
  } else if (!casting) {
    domainT = -1;
  }

  if (st.endT > 0) {
    // The final-blow shot: frame the winner tight and head-on.
    const winner = st.fighters.find((f) => !f.dead);
    if (winner) {
      focusTargetX = simToWorldX(winner.x);
      dollyTarget = DRAMA.endDolly;
      yawTarget = 0;
    }
  } else if (casting && st.domainOverlay) {
    // Domain cast: arrive tight, then a slow drift back out while the overlay
    // owns the screen.
    focusTargetX = simToWorldX(caster.x);
    const drift = domainT < 0 ? 0 : clamp(domainT / DRAMA.domainDrift, 0, 1);
    dollyTarget = lerp(DRAMA.domainDolly, 1, drift);
  } else if (casting) {
    // Ult cast: dolly in on the caster with a touch of dutch.
    focusTargetX = simToWorldX(caster.x);
    dollyTarget = DRAMA.ultDolly;
    cueRoll += DRAMA.ultRoll * (focusTargetX >= 0 ? 1 : -1)
      * clamp(caster.action.t / DRAMA.ultIn, 0, 1);
  } else if (st.domainOverlay && domainT >= 0) {
    // The cast animation ended but the domain still runs: keep drifting out.
    dollyTarget = lerp(DRAMA.domainDolly, 1, clamp(domainT / DRAMA.domainDrift, 0, 1));
  }

  // Blend toward/away from the focus target, so entering and leaving a drama
  // shot is a camera move rather than a cut.
  const focusK = 1 - Math.pow(0.002, dt);
  smooth.focus = lerp(smooth.focus, focusTargetX !== null ? 1 : 0, focusK);
  if (focusTargetX !== null) smooth.focusX = focusTargetX;
  if (smooth.focusX !== null && smooth.focus > 0.001) {
    camX = lerp(camX, smooth.focusX, smooth.focus);
  }

  // ---- round intro: pulled out and angled, easing in as READY…/GO! plays
  let introK = 0;
  if (st.introT > 0) {
    introK = clamp(st.introT / DRAMA.introTime, 0, 1);
    dollyTarget = Math.max(dollyTarget, lerp(1, DRAMA.introDolly, introK));
  }

  // ---- yaw: toward the action as the camera tracks, plus board bias and cues
  if (yawTarget === undefined) {
    yawTarget = clamp(camX * C.yawPerUnit, -(board.yawMax ?? C.yawMax), board.yawMax ?? C.yawMax)
      + (board.yawBias ?? 0) + introK * DRAMA.introYaw;
  }
  if (yawTo0) yawTarget = 0;
  yawTarget += cueYaw;

  // ---- lookahead: lead the average alive-fighter x-velocity
  let lookX = 0;
  if (alive.length) {
    const avgVx = alive.reduce((s, f) => s + (f.vx || 0), 0) / alive.length;
    lookX = clamp(avgVx * C.lookahead * (board.lookaheadMul ?? 1), -C.lookaheadMax, C.lookaheadMax);
  }

  // ---- FOV: kick punch riding on base + board nudge + cues
  if (cam.kick > prevKick + 0.001) kickT = 0;
  prevKick = cam.kick;
  kickT += dt;
  let kickDrop = 0;
  if (kickT < C.kickIn) kickDrop = C.kickFovDrop * (kickT / C.kickIn);
  else if (kickT < C.kickIn + C.kickOut) kickDrop = C.kickFovDrop * (1 - (kickT - C.kickIn) / C.kickOut);
  const fovTarget = C.fov + (board.fovNudge ?? 0) + cueFov;

  // ---- smooth the rig's own values
  smooth.yaw = lerp(smooth.yaw, yawTarget, lerpK);
  smooth.roll = lerp(smooth.roll, cueRoll, lerpK);
  smooth.dollyMul = lerp(smooth.dollyMul, dollyTarget + cueDolly, lerpK);
  smooth.fov = lerp(smooth.fov, fovTarget, lerpK);

  // ---- pose the camera
  const fov = smooth.fov - kickDrop;
  const D = dollyFor(cam.zoom, C.fov) * smooth.dollyMul;
  const yawRad = smooth.yaw * DEG;
  const shake = (cam.shake * C.shakeScale + cueShake) * C.simScale;
  const sx = (Math.random() - 0.5) * shake;
  const sy = (Math.random() - 0.5) * shake;

  const lookAt = new Vector3(camX + lookX + cuePan, camY + D * Math.tan(C.pitch * DEG), 0);
  camera.position.set(
    camX + cuePan + Math.sin(yawRad) * D + sx,
    camY + (board.heightBias ?? C.heightBias) + sy,
    Math.cos(yawRad) * D,
  );
  camera.fov = fov;
  camera.aspect = WORLD.w / WORLD.h;
  camera.lookAt(lookAt);
  if (smooth.roll) camera.rotateZ(smooth.roll * DEG);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  if (alive.length) {
    lastSimX = alive.reduce((s, f) => s + f.x, 0) / alive.length;
    lastSimY = alive.reduce((s, f) => s + f.y, 0) / alive.length - 70;
  } else {
    lastSimX = cam.x;
    lastSimY = cam.y;
  }

  // Handed back for the smoke test's invariants; the game ignores it.
  return { D, fov, yaw: smooth.yaw, roll: smooth.roll, dollyMul: smooth.dollyMul };
}

// ------------------------------------------------------- overlay projection
//
// Everything still drawn on the 2D canvas positions itself in sim coordinates.
// Project three sim-space points on the gameplay plane through the camera and
// fit the affine transform that maps them — because everything the overlay
// draws sits on z = 0 and yaw/pitch are clamped tiny, the fit is visually
// exact (< 1 px at ±4°). This one transform is why particles, popups, strike
// arcs and hitbox debug land on the fighters in 3D with zero changes.

const _p = new Vector3();

/** Sim-space (x, y) on the gameplay plane -> screen pixels in WORLD space
 *  (the coordinate system the 2D canvas draws in). */
export function worldToScreen(x, y) {
  _p.set(simToWorldX(x), simToWorldY(y), 0).project(camera);
  return {
    x: (_p.x + 1) / 2 * WORLD.w,
    y: (1 - _p.y) / 2 * WORLD.h,
  };
}

/** The affine {a,b,c,d,e,f} for ctx.transform() that maps sim coordinates to
 *  their projected position. Fitted about the camera's tracked point — the
 *  linearisation is exact there and the small perspective error lands out at
 *  the frame edges, not on the fighters the shot is centred on. */
export function overlayTransform() {
  // Pinned exactly at the action point (the translation comes from `o`), with
  // central-difference slopes over a wide baseline: the plane's projection is
  // a hair non-affine (the tilt from pitch and heightBias), and the wide
  // secant halves how fast that error grows away from the fighters.
  const B = 200;
  const cx = lastSimX, cy = lastSimY;
  const o = worldToScreen(cx, cy);
  const pxm = worldToScreen(cx - B, cy);
  const pxp = worldToScreen(cx + B, cy);
  const pym = worldToScreen(cx, cy - B);
  const pyp = worldToScreen(cx, cy + B);
  const a = (pxp.x - pxm.x) / (2 * B), b = (pxp.y - pxm.y) / (2 * B);
  const c = (pyp.x - pym.x) / (2 * B), d = (pyp.y - pym.y) / (2 * B);
  return {
    a, b, c, d,
    e: o.x - a * cx - c * cy,
    f: o.y - b * cx - d * cy,
  };
}
