import { state } from "./state.js";
import { clamp, lerp } from "./utils.js";
import { WORLD } from "./constants.js";

export function updateCamera(dt) {
  const cam = state.camera;
  const alive = state.fighters.filter((f) => !f.dead && f.respawnTimer <= 0);

  let cx = WORLD.w / 2;
  let cy = WORLD.h / 2;
  let zoomTarget = 1;

  if (alive.length >= 2) {
    const xs = alive.map((f) => f.x);
    const ys = alive.map((f) => f.y);
    const spread = Math.max(...xs) - Math.min(...xs);
    const midX = (Math.max(...xs) + Math.min(...xs)) / 2;
    const midY = (Math.max(...ys) + Math.min(...ys)) / 2 - 80;
    zoomTarget = clamp(1.42 - spread / 900, 1.0, 1.18);
    cx = midX;
    cy = midY;
  } else if (alive.length === 1) {
    cx = alive[0].x;
    cy = alive[0].y - 90;
    zoomTarget = 1.05;
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
