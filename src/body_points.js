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
// Measured from the rigs (tools/derive_muzzles.mjs) — MM's own anchor nodes.
import { MODEL_MUZZLES } from "./config_model_muzzles.js";
// Measured from the drawings (tools/derive_com.mjs) — the alpha-weighted centre
// of each mech as the game renders it, per state.
import { MODEL_COM } from "./config_model_com.js";
import { COM_BODY_FRAC } from "./config_tuning.js";
import { HEIGHT_BASE_PX } from "./config_tuning.js";

/**
 * CENTRE OF MASS as a fraction of drawn height — the pivot a tumble turns about,
 * the point the 3D rig rotates about in-scene, the anchor an airborne body hangs
 * from, the chest line an aim solves from, and the centre the airborne prone box
 * hangs off. It is the one point on a fighter that should hold STILL while
 * everything else moves around it, which is why it has this many callers.
 *
 * Three answers, in this order — the same precedence muzzlePoint uses below:
 *
 *   1. A PINNED CENTRE (config_body_points.js): somebody looked at the machine
 *      and said where its mass is. Decisions outrank measurement.
 *   2. THE MEASURED CENTRE (config_model_com.js), read off the mech as the game
 *      actually draws it by tools/derive_com.mjs.
 *   3. COM_BODY_FRAC, the roster-wide 0.55 — which is what every mech got for
 *      all seventeen of them before the measurement existed, from Saurion's long
 *      low body to Titanus's top-heavy one.
 *
 * `animKey` asks for the centre IN THAT STATE, because a pose moves the mass: a
 * fall tucks the legs and carries it up around a tenth of a body height, a
 * knockdown puts it on the floor. States are stored only where they differ from
 * the stance, so an unlisted one correctly answers with the base. Callers that
 * do not know or care about the state omit it and get the standing answer.
 *
 * A caller that needs the pivot and a caller that needs the anchor MUST get the
 * same number for the same fighter in the same state — an anchor that disagrees
 * with its pivot is a body shoved vertically for as long as it is airborne,
 * which is exactly how this last went wrong. That is the reason this is one
 * function rather than a convention.
 */
export function comFrac(charKey, animKey = null) {
  const pinned = BODY_POINTS[charKey]?.com;
  if (typeof pinned === "number" && pinned > 0.2 && pinned < 0.9) return pinned;
  const measured = MODEL_COM[charKey];
  if (measured) {
    const v = (animKey && measured.states?.[animKey]) ?? measured.base;
    if (typeof v === "number" && v > 0.2 && v < 0.9) return v;
  }
  return COM_BODY_FRAC;
}

/**
 * WHERE A PROJECTILE LEAVES THIS FIGHTER, in game px from their centre line and
 * foot line (up negative). Three answers, in this order:
 *
 *   1. THE CALLER PLACED IT. `ox`/`oy` given means the spawn site is choosing a
 *      spot rather than asking where the barrel is — the wave handler spacing
 *      its walls one per 54px along the floor, say. Those are distances on the
 *      board, so they are scaled onto this body and used as given. Nothing in
 *      any kit declares them for a projectile today; the handlers that do, mean
 *      it.
 *   2. A PINNED MUZZLE (config_body_points.js): somebody looked at the machine
 *      and said where it fires from. Decisions outrank measurement.
 *   3. THE MEASURED MUZZLE (config_model_muzzles.js): Mech Mayhem's own
 *      `anchor_muzzle*` node, read off the rig in that mech's firing pose by
 *      tools/derive_muzzles.mjs. Already in this body's game px, so it is not
 *      scaled again.
 *
 * and failing all three, the reference body's chest offsets scaled by height —
 * which is what every mech in the game got before the anchors were read, and
 * which is why every gun fired out of the middle of its machine.
 */
export function muzzlePoint(charKey, height, ox, oy) {
  const k = height / HEIGHT_BASE_PX;
  if (Number.isFinite(ox) || Number.isFinite(oy)) {
    return { x: (Number.isFinite(ox) ? ox : 70) * k, y: (Number.isFinite(oy) ? oy : -86) * k };
  }
  const pinned = BODY_POINTS[charKey]?.muzzle;
  if (pinned && Number.isFinite(pinned.x) && Number.isFinite(pinned.y)) return pinned;
  const measured = MODEL_MUZZLES[charKey];
  if (measured && Number.isFinite(measured.x) && Number.isFinite(measured.y)) {
    return { x: measured.x, y: measured.y };
  }
  return { x: 70 * k, y: -86 * k };
}

/**
 * WHICH of those answers a fighter's muzzle is — `pinned`, `model` or
 * `reference` — for the tools that draw the point.
 *
 * The difference is the whole story a workbench has to tell: a muzzle read off
 * the rig is on the barrel MM put it on, while the reference fallback is a
 * chest offset that lands mid-torso and reads as somebody's decision when it is
 * nobody's. `muzzlePoint` answers with one or the other and cannot say which;
 * this can, and it names the anchor when the answer came from the model.
 */
export function muzzleSource(charKey) {
  const pinned = BODY_POINTS[charKey]?.muzzle;
  if (pinned && Number.isFinite(pinned.x) && Number.isFinite(pinned.y)) {
    return { kind: "pinned", note: "pinned by hand in src/config_body_points.js" };
  }
  const measured = MODEL_MUZZLES[charKey];
  if (measured && Number.isFinite(measured.x)) {
    return { kind: "model", anchor: measured.anchor, clip: measured.clip,
             note: `measured from the rig's ${measured.anchor} anchor, posed in ${measured.clip}` };
  }
  return { kind: "reference",
           note: "no muzzle for this mech — the reference body's chest offsets scaled by height" };
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
