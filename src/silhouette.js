// How big a fighter IS, in world pixels — the numbers combat.js builds
// hitboxes and hurtboxes out of.
//
// This file used to be a measuring instrument. It scanned every frame of every
// attack in a character's sprite sheet, took the second-longest reach (dropping
// the top one as an outlier), took the median resting width, compressed that
// toward a typical body because a drawing is evidence rather than truth, then
// banded and clamped everything so a redraw that moved an arm three pixels did
// not silently change the game. Three hundred lines, and every one of them was
// load-bearing, because the input was a pile of hand-drawn PNGs and the output
// was a hitbox.
//
// The mech conversion removed the input. A mech is not a sheet of drawings, and
// the numbers no longer have to be inferred from art at runtime — they are
// derived from the rig's real geometry, offline, and PINNED in
// config_metrics.js. The reasoning for pinning rather than measuring live is
// written out in that file and is worth reading before changing anything here:
// the short version is that rigs load asynchronously, and a hitbox that depends
// on whether a download finished is a hitbox that differs between machines.
//
// So this file is now a resolver, not an instrument. It does three things:
//
//   1. look up the mech's height-fractions (config_metrics.js)
//   2. multiply by that mech's rendered height (heights.js)
//   3. clamp into the guard range, so a bad table entry cannot hand a fighter
//      the whole stage
//
// The clamps are the one piece of the old machinery worth keeping. Banding is
// not: it existed to absorb noise in hand-drawn art, and a derived-from-geometry
// number has no noise to absorb. A change to a mech's reach should now be a
// visible line in a diff, which is exactly what banding was hiding.

import { MECH_METRICS, ROSTER_DEFAULT } from "./config_metrics.js";
import { headHeightTarget } from "./heights.js";
import { HURTBOX } from "./constants.js";
import { BODY } from "./config_tuning.js";
import { clamp } from "./utils.js";

const cache = new Map();
let rosterCache = null;

/**
 * Drop cached measurements — for one character, or all of them.
 *
 * Called when something that feeds a measurement changes underneath it: a
 * height override being applied, or a rig being swapped at development time.
 * `bodyMetrics` also self-invalidates when a character's rendered height moves,
 * so this is for changes the height does not reflect.
 */
export function refreshSilhouettes(charKey = null) {
  if (charKey) cache.delete(charKey);
  else cache.clear();
  rosterCache = null;
}

/**
 * Every measurement for one character, in world pixels.
 *
 * Cached, because `hurtbox()` runs against every fighter on every hitbox on
 * every frame. The cache key includes the rendered height, so anything that
 * resizes a character re-resolves them without anyone remembering to ask.
 *
 * Returns `{ height, reach, width, crouch, air }`. `height` and the two
 * distances are world pixels; `crouch` and `air` stay fractions of standing
 * height, because that is how combat.js uses them.
 */
export function bodyMetrics(charKey) {
  const height = headHeightTarget(charKey) || BODY.fallbackHeight;
  const hit = cache.get(charKey);
  if (hit && hit.height === height) return hit;
  const m = resolve(charKey, height);
  cache.set(charKey, m);
  return m;
}

/** How far in front of themselves a character's committed swing reaches, world px. */
export function artReach(charKey) {
  return bodyMetrics(charKey).reach;
}

/** How wide their body is at rest, world px. */
export function bodyWidth(charKey) {
  return bodyMetrics(charKey).width;
}

/**
 * The roster's median reach — the yardstick a move's startup and recovery are
 * priced against (moves.js). Median rather than mean so one long-lance outlier
 * does not drag the reference everyone else is judged by.
 *
 * Computed over the mechs that HAVE a pinned entry. A roster where nothing has
 * been derived yet answers with the default, which keeps move pricing stable
 * through the period when rigs are arriving one at a time — otherwise the first
 * mech delivered would become the yardstick for the whole game.
 */
export function rosterReach() {
  if (rosterCache !== null) return rosterCache;
  const fractions = Object.values(MECH_METRICS)
    .map((e) => e.reach)
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  const fraction = fractions.length ? median(fractions) : ROSTER_DEFAULT.reach;
  rosterCache = fraction * BODY.fallbackHeight;
  return rosterCache;
}

// ---------------------------------------------------------------------------

/** The pinned fractions for a mech, with anything absent taken from the
 *  roster default. Per-FIELD rather than per-entry: a mech that pins only its
 *  reach should not lose the default width by having an entry at all. */
function fractionsFor(charKey) {
  const e = MECH_METRICS[charKey];
  if (!e) return ROSTER_DEFAULT;
  return {
    reach: Number.isFinite(e.reach) ? e.reach : ROSTER_DEFAULT.reach,
    width: Number.isFinite(e.width) ? e.width : ROSTER_DEFAULT.width,
    crouch: Number.isFinite(e.crouch) ? e.crouch : ROSTER_DEFAULT.crouch,
    air: Number.isFinite(e.air) ? e.air : ROSTER_DEFAULT.air,
  };
}

function resolve(charKey, height) {
  const f = fractionsFor(charKey);
  // Every clamp is expressed against this character's OWN height, so the guard
  // scales with the mech. A cap in absolute pixels would be generous to a
  // raptor and punishing to a siege biped.
  return {
    height,
    reach: clamp(f.reach * height, height * BODY.reachMin, height * BODY.reachMax),
    width: clamp(f.width * height, height * BODY.widthMin, height * BODY.widthMax),
    crouch: clamp(f.crouch, HURTBOX.crouchMin, HURTBOX.crouchMax),
    air: clamp(f.air, HURTBOX.airMin, HURTBOX.airMax),
  };
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
