// The blit: a rendered pose texture into the 2D world — the billboard blit's
// placement arithmetic (same anchors from two constants, same TRANSFORM ORDER
// as sprites: squash about the foot line, rotation about the centre of mass,
// mirror last) with this backend's one behavioural difference:
//
//   TURNAROUNDS END THE MIRROR FLIP. When pose.js's turnaround dial is on,
//   facing is baked into the render (the rig yawed 180°), the entry says so
//   via `yawed`, and this blit must NOT mirror — Gojo's parting and Maki's
//   grip stay on the correct side at last. With the dial off, facing is
//   blit-time mirroring, exactly as sprites and billboards do it.
//
// motion.js stays the owner of engine motion: sway, bob, squash, tumble and
// dodge spin arrive through `opts` and are applied here at blit time,
// identically across all three backends — that is what keeps game feel
// backend-independent.

import { headHeightTarget } from "../../src/heights.js";
import { getActor } from "../../src/characters.js";
import { TEX_SIZE, FOOT_FRAC } from "./scene.js";

/** Centre of mass height as a fraction of body height — the pivot rotations
 *  turn about (the hips, effectively; same constant as billboards). */
const COM_FRAC = 0.55;

export function blitPose(ctx, entry, charKey, x, y, opts = {}) {
  const targetPx = headHeightTarget(charKey);
  const actorScale = getActor(charKey)?.scale;
  const scaleRatio = opts.scale && actorScale ? opts.scale / actorScale : 1;

  const rowsForBody = entry.rowsPerMetre * entry.heightM;
  // renderScale is the per-character size dial: how big this rig is drawn
  // against the head-height target the roster gives the character.
  const s = (targetPx * scaleRatio * (entry.renderScale ?? 1)) / rowsForBody;

  const drawW = TEX_SIZE * s;
  const drawH = TEX_SIZE * s;
  const footRow = TEX_SIZE * (1 - FOOT_FRAC);
  const comY = -targetPx * scaleRatio * COM_FRAC;

  const facing = opts.facing ?? 1;
  const rotation = opts.rotation || 0;
  const sx = opts.scaleX ?? 1;
  const sy = opts.scaleY ?? 1;

  ctx.save();
  ctx.translate(x + (opts.offsetX || 0), y + (opts.offsetY || 0));
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  if (rotation !== 0) {
    ctx.translate(0, comY);
    ctx.rotate(rotation);
    ctx.translate(0, -comY);
  }
  if (!entry.yawed) ctx.scale(facing < 0 ? -1 : 1, 1);
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  if (opts.glow) {
    ctx.shadowColor = opts.glow;
    ctx.shadowBlur = opts.glowBlur ?? 14;
  }
  ctx.drawImage(entry.canvas, -drawW / 2, -footRow * s, drawW, drawH);
  ctx.restore();
  return true;
}
