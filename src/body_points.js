// FACTS ABOUT A FIGHTER'S BODY, resolved — the reader for
// src/config_body_points.js.
//
// Each of these is a number the simulation used to assume for the whole
// roster. A person can now say otherwise per fighter (the verification bench
// writes the config), and everything here answers with their decision when
// there is one and the old assumption when there is not — so an empty config
// is exactly today's behaviour, and filling one in is the only thing that
// changes anything.
//
// Deliberately NOT merged into silhouette.js: that module MEASURES, from art,
// and re-measures when the art moves. These are decisions, they outrank
// measurement, and keeping the two apart is what stops a re-bake from quietly
// undoing somebody's judgement.

import { BODY_POINTS, HURTBOX_FIT } from "./config_body_points.js";
import { COM_BODY_FRAC } from "./config_tuning.js";
import { HEIGHT_BASE_PX } from "./config_tuning.js";

/** Centre of mass as a fraction of drawn height — the pivot a tumble turns
 *  about, the point the 3D rig rotates about in-scene, the chest line an aim
 *  solves from, and the centre the airborne prone box hangs off. */
export function comFrac(charKey) {
  const v = BODY_POINTS[charKey]?.com;
  return typeof v === "number" && v > 0.2 && v < 0.9 ? v : COM_BODY_FRAC;
}

/** Where a projectile leaves this fighter, in game px from their centre line
 *  and foot line (up negative). `height` is their measured drawn height; the
 *  fallback is the reference body's offsets scaled onto it, which is what
 *  combat.js did for everyone before anybody checked. */
export function muzzlePoint(charKey, height, fallbackOx = 70, fallbackOy = -86) {
  const p = BODY_POINTS[charKey]?.muzzle;
  if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return p;
  const k = height / HEIGHT_BASE_PX;
  return { x: fallbackOx * k, y: fallbackOy * k };
}

/** Has anybody actually LOOKED at this fighter and said where their muzzle is?
 *
 *  The difference matters to a tool that draws the point: a verified muzzle is
 *  on the barrel somebody picked, while the fallback is the reference body's
 *  chest offsets scaled by height — which on a tall machine lands mid-torso and
 *  looks like a bug rather than like the default it is. `muzzlePoint` answers
 *  with one or the other and cannot say which; this can. */
export function muzzleIsVerified(charKey) {
  const p = BODY_POINTS[charKey]?.muzzle;
  return !!(p && Number.isFinite(p.x) && Number.isFinite(p.y));
}

/** Where the gripping hand meets the lip on a ledge hang, or null when
 *  nobody has said — the caller keeps whatever it did before. */
export function ledgeGrip(charKey) {
  const p = BODY_POINTS[charKey]?.ledgeGrip;
  return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
}

/** Multipliers on a derived hurtbox for one state, or 1×1. Cases:
 *  stand | crouch | air | hurt | prone | ledge. */
export function hurtboxFit(charKey, caseKey) {
  const f = HURTBOX_FIT[charKey]?.[caseKey];
  return {
    w: Number.isFinite(f?.w) ? f.w : 1,
    h: Number.isFinite(f?.h) ? f.h : 1,
  };
}
