import { state } from "./state.js";
import { clamp, lerp } from "./utils.js";
import { WORLD } from "./constants.js";

// Smash-style framing: fit the alive fighters' bounding box, padded, and zoom
// to whatever makes that box fill the frame — tight duels are shot tight, a
// full-stage scramble pulls back to 1.0 (never below: the backdrops are
// painted for the full world and the 3D rig's frustum over-fill assumes it).
// The pads are sized for the fighters plus the space a fight needs around
// them: heads and jumps above (fighter y is the foot line), attack reach and
// a beat of lookahead to the sides, a strip of ground below.
const FRAME_PAD_X = 240;
const FRAME_PAD_TOP = 280;
const FRAME_PAD_BOTTOM = 120;
// 1.32 restores the on-screen size fighters had before the roster shrank 15%
// (docs/level-design-review.md G1a): close fights read as large as ever, and
// the zoom-out is what buys the bigger boards their room.
const ZOOM_MAX = 1.32;
const ZOOM_SOLO = 1.12;

export function updateCamera(dt) {
  const cam = state.camera;
  const alive = state.fighters.filter((f) => !f.dead && f.respawnTimer <= 0);

  let cx = WORLD.w / 2;
  let cy = WORLD.h / 2;
  let zoomTarget = 1;

  if (alive.length >= 2) {
    const xs = alive.map((f) => f.x);
    const ys = alive.map((f) => f.y);
    const left = Math.min(...xs) - FRAME_PAD_X;
    const right = Math.max(...xs) + FRAME_PAD_X;
    const top = Math.min(...ys) - FRAME_PAD_TOP;
    const bottom = Math.max(...ys) + FRAME_PAD_BOTTOM;
    zoomTarget = clamp(
      Math.min(WORLD.w / (right - left), WORLD.h / (bottom - top)),
      1.0, ZOOM_MAX,
    );
    cx = (left + right) / 2;
    cy = (top + bottom) / 2;
  } else if (alive.length === 1) {
    cx = alive[0].x;
    cy = alive[0].y - 90;
    zoomTarget = ZOOM_SOLO;
  }

  if (cam.kick > 0) {
    cam.kick = Math.max(0, cam.kick - dt);
    zoomTarget += 0.05;
  }

  cam.zoom = lerp(cam.zoom, zoomTarget, 1 - Math.pow(0.0015, dt));
  // keep the view inside the world
  const halfW = WORLD.w / 2 / cam.zoom;
  const halfH = WORLD.h / 2 / cam.zoom;
  cam.x = lerp(cam.x, clamp(cx, halfW, WORLD.w - halfW), 1 - Math.pow(0.0009, dt));
  cam.y = lerp(cam.y, clamp(cy, halfH, WORLD.h - halfH), 1 - Math.pow(0.0009, dt));

  cam.shake = Math.max(0, cam.shake - dt * 44);
}

export function applyCamera(ctx) {
  const cam = state.camera;
  const sx = (Math.random() - 0.5) * cam.shake;
  const sy = (Math.random() - 0.5) * cam.shake;
  ctx.save();
  ctx.translate(WORLD.w / 2 + sx, WORLD.h / 2 + sy);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
}

export function releaseCamera(ctx) {
  ctx.restore();
}
