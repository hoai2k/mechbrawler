// WHERE THE BLOW IS — the fist, the foot, or the blade, per character per move.
//
// A hitbox says what a swing threatens; it does not say where the swing IS.
// The box is deliberately generous — a jab's runs from chest to floor so it
// catches a crouching opponent — so its centre is nobody's fist, and anything
// that wants the actual point of contact (impact sparks, a radial tipper, the
// debug overlay) had to guess. This module is the answer to "where is it".
//
// THREE SOURCES, in order:
//
//   1. a HUMAN-VERIFIED point (src/config_strike_points.js), written by the
//      verification bench — `/workbench/?edit=verification`. A person looked
//      at this fighter's own drawing and said where the blow lands, which
//      beats any measurement.
//   2. the MODEL measurement (src/config_model_reach.js), baked from the rig
//      posed at the move's contact beat with the aim solved — the striking
//      limb ik.js names for that state, or the weapon's far end when one
//      leads. Good enough to review, not always good enough to ship: a rig
//      with a mis-gripped prop reports the prop.
//   3. a FALLBACK derived from the fighter's own measured body — out along
//      the facing at most of their reach, at centre-of-mass height. Never
//      absent, so a consumer can call this for anybody.
//
// COORDINATES are the ones the rest of the sim uses: `x` forward along the
// fighter's facing from their centre line, `y` in canvas convention from the
// foot line, so up is NEGATIVE — the same frame `moves.js` writes `oy: -92`
// in. Callers mirror x by facing exactly as they do for a hitbox.

import { bodyMetrics } from "./silhouette.js";
import { MODEL_REACH } from "./config_model_reach.js";
import { STRIKE_POINTS, STRIKE_POINT_META } from "./config_strike_points.js";
import { comFrac } from "./body_points.js";

/** Attack states that have a strike point at all. A state absent here has no
 *  single point of contact — a quake comes out of the floor everywhere. */
const STRIKE_STATES = new Set([
  "light", "sideHeavy", "upHeavy", "downHeavy", "crouchAttack", "airLight",
  "dashAttack", "dashAttackHeavy",
]);

/** States that borrow another's point, mirroring states.js STATE_ALIASES:
 *  a dash attack is the archetype's own strike thrown out of a run. */
const ALIAS = { dashAttack: "light", dashAttackHeavy: "sideHeavy" };

const cache = new Map();

/** Drop memoised points — the verification bench calls this after an edit so
 *  the change shows without a reload. The game never needs it. */
export function refreshStrikePoints() {
  cache.clear();
}

/**
 * Where `charKey`'s `state` lands, as { x, y, source }.
 *
 * `source` says which of the three answers this is ("human", "model",
 * "derived"), because a consumer that wants to be conservative — a damage
 * rule, say — can decline to act on a point nobody has looked at, while the
 * FX and the debug overlay happily draw whatever is best available.
 */
export function strikePoint(charKey, state) {
  const key = `${charKey}/${state}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const point = solve(charKey, state);
  cache.set(key, point);
  return point;
}

/** True when a person has checked this one. */
export function strikePointVerified(charKey, state) {
  return strikePoint(charKey, state).source === "human";
}

function solve(charKey, state) {
  const name = ALIAS[state] || state;
  const b = bodyMetrics(charKey);
  if (STRIKE_STATES.has(name)) {
    const human = STRIKE_POINTS[charKey]?.[name];
    if (human && Number.isFinite(human.x) && Number.isFinite(human.y)) {
      return { x: human.x, y: human.y, source: "human" };
    }
    const model = MODEL_REACH[charKey]?.states?.[name];
    if (model && Number.isFinite(model.sx) && Number.isFinite(model.sy)) {
      // Baked `sy` is metres-up turned to px-up; canvas y grows downward.
      return { x: model.sx, y: -model.sy, source: "model" };
    }
  }
  // Nobody has measured this one: out along the facing at most of the
  // fighter's own reach, at the height their mass sits — which is where an
  // arm strike from a body that size would land.
  return {
    x: Math.round(b.reach * 0.75),
    y: -Math.round(b.height * comFrac(charKey)),
    source: "derived",
  };
}

/** Coverage, for the audit and the verification bench's progress line. */
export function strikePointCoverage(charKeys) {
  const out = { human: 0, model: 0, derived: 0, total: 0 };
  for (const charKey of charKeys) {
    for (const state of STRIKE_STATES) {
      if (ALIAS[state]) continue;
      out[strikePoint(charKey, state).source]++;
      out.total++;
    }
  }
  return out;
}

export { STRIKE_STATES, STRIKE_POINT_META };
