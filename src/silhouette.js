// How big a fighter actually is, measured from their own artwork.
//
// Hitboxes and hurtboxes used to be hand-typed numbers with no relation to the
// sprites: one 64x108 hurtbox for a roster drawn 153-192 px tall, and melee
// boxes reaching about 2.1x as far as the art with the size of that lie varying
// 1.55x-2.89x per character (docs/hitbox-audit.md). This module is the fix. It
// turns the silhouette bounds `tools/bake_anchors.py` bakes into the manifest
// into three numbers per character:
//
//   height   how tall they are drawn, foot line to top of head
//   width    how wide their body is in a neutral pose
//   reach    how far in front of them their committed swing is painted
//
// Everything in combat.js and moves.js sizes off those, so redrawing a pose
// retunes the move and neither can drift from the other.
//
// ---------------------------------------------------------------------------
// Resilience: the art is in flux, and gameplay must not be.
//
// A measurement that tracked the art exactly would mean every re-export, every
// nudge in the workbench and every replacement frame silently changed a
// matchup. So nothing here reads a single frame:
//
//   * every figure is an aggregate over the character's whole COLLECTION of
//     relevant poses, not one pose;
//   * reach discards the single furthest frame before taking a maximum, so one
//     over-extended or glow-heavy drawing cannot set a character's range;
//   * width takes a median, which a couple of odd frames cannot move at all;
//   * results are BANDED (rounded to a step) so a few pixels of drift does not
//     register as a change at all — art has to move meaningfully before the
//     game notices;
//   * everything is clamped to a guard range expressed as a fraction of the
//     character's own height, so a broken export cannot produce a fighter who
//     reaches across the stage;
//   * a character with no baked bounds at all falls back to the roster median,
//     so a fighter whose art has not landed yet still plays correctly.
//
// The cost of banding is that the numbers are approximate on purpose. That is
// the point: they are estimates from a body of artwork, not a readout of one
// PNG.

import { spriteManifest, frameMeta } from "./assets.js";
import { resolvedAnim, frameFootY } from "./sprites.js";
import { headHeightTarget, referenceSpan } from "./heights.js";
import { CELL_W, HURTBOX } from "./constants.js";
import { BODY } from "./config_tuning.js";
import { clamp } from "./utils.js";

// The animation states whose frames show a committed swing. Named by state
// rather than by frame key so a character who re-points `light` at different
// art is measured from whatever they now actually draw.
const SWING_STATES = ["light", "sideHeavy", "upHeavy", "downHeavy", "airLight", "crouchAttack"];

// And the states that show the body at rest, which is what "how wide is this
// fighter" means. Deliberately excludes anything mid-swing — an outstretched
// arm is reach, not width — and also running and jumping, which are wider
// still: a full stride measures 2-3x an idle (Momo's run is 171 px against a
// 67 px idle), and a fighter is not a bigger target for having legs apart.
const NEUTRAL_STATES = ["idle", "walk"];

// And the ducked states, for how low a crouch actually gets. Measured rather
// than assumed because most of the roster's crouch art does not currently duck
// at all — placed crouch poses run from 0.56 of standing height (Yuji, a real
// crouch) to 1.01 (Jogo, who is simply standing). A fixed fraction would have
// fifteen fighters ducking under attacks on screen while standing upright.
const CROUCH_STATES = ["crouch", "crouchAttack"];

const cache = new Map();
let rosterCache = null;

/** Drop the cached measurements for a character, or for everyone. The sprite
 *  workbench calls this after an edit; the game never needs to. */
export function refreshSilhouettes(charKey = null) {
  if (charKey) cache.delete(charKey);
  else cache.clear();
  rosterCache = null;
}

/**
 * Every measurement for one character, in world pixels.
 *
 * Cached, because `hurtbox()` runs against every fighter on every hitbox on
 * every frame. The cache key includes the head-height target, so a workbench
 * edit that resizes a character re-measures them without anyone remembering to
 * ask.
 */
export function bodyMetrics(charKey) {
  const height = headHeightTarget(charKey) || BODY.fallbackHeight;
  const hit = cache.get(charKey);
  if (hit && hit.height === height) return hit;
  const m = measure(charKey, height);
  cache.set(charKey, m);
  return m;
}

/** How far in front of themselves a character's swing is painted, world px. */
export function artReach(charKey) {
  return bodyMetrics(charKey).reach;
}

/** How wide their body is at rest, world px. */
export function bodyWidth(charKey) {
  return bodyMetrics(charKey).width;
}

/**
 * The roster's median art reach — the yardstick a move's startup and recovery
 * are priced against (moves.js), and the fallback for a fighter whose art has
 * not been measured. Median rather than mean so an outlier at either end does
 * not drag the reference everyone else is judged by.
 */
export function rosterReach() {
  if (rosterCache !== null) return rosterCache;
  const keys = Object.keys(spriteManifest?.characters || {});
  const found = [];
  for (const key of keys) {
    const raw = rawReach(key, scaleOf(key));
    if (raw != null) found.push(raw);
  }
  rosterCache = found.length ? median(found) : BODY.fallbackReach;
  return rosterCache;
}

// ------------------------------------------------------------- measurement

/** The draw scale heights.js solves, recomputed here rather than read off the
 *  character so this module works before the roster is wired up. */
function scaleOf(charKey) {
  const span = referenceSpan(charKey);
  if (!span) return 0;
  return (headHeightTarget(charKey) || BODY.fallbackHeight) / span;
}

function measure(charKey, height) {
  const scale = scaleOf(charKey);
  const reachRaw = rawReach(charKey, scale);
  const widthRaw = rawWidth(charKey, scale);

  // Missing art falls back to the roster, scaled to this character's height, so
  // an unmeasured fighter is a normal fighter their own size rather than a
  // fighter shaped like the reference.
  const relative = height / BODY.fallbackHeight;
  const reach = band(
    reachRaw ?? rosterReach() * relative,
    BODY.reachBand, height * BODY.reachMin, height * BODY.reachMax
  );
  // Width is compressed toward a typical body before it is banded — see
  // BODY.widthTrust for why the measurement is evidence rather than truth.
  const typical = height * BODY.widthTypical;
  const measuredW = widthRaw ?? BODY.fallbackWidth * relative;
  const width = band(
    typical + (measuredW - typical) * BODY.widthTrust,
    BODY.widthBand, height * BODY.widthMin, height * BODY.widthMax
  );
  // How low this fighter's crouch actually gets, as a fraction of their drawn
  // height. A crouch that ducks is rewarded with a box that ducks; one that
  // does not, is not. It fixes itself as the art lands, which is the point.
  const crouchRaw = poseHeight(charKey, CROUCH_STATES, scaleOf(charKey));
  const crouch = clamp(
    crouchRaw ? crouchRaw / height : HURTBOX.crouchH,
    HURTBOX.crouchMin, HURTBOX.crouchMax
  );

  return {
    charKey, height, width, reach, crouch,
    measured: reachRaw != null,
    // False means this character's numbers came from art nobody has sized or
    // positioned yet, so they will move once somebody does.
    placed: allPlaced(charKey, SWING_STATES),
  };
}

// The manifest fields that move or resize a drawing. `edited` records the
// PRE-edit value of every field somebody changed by hand in the sprite
// workbench (tools/apply_sprite_adjustments.py writes it), so a frame carrying
// one of these has been through the placement pass.
const PLACEMENT_FIELDS = ["renderScale", "ox", "bodyBottom"];

/**
 * Has this frame been sized and positioned by hand yet?
 *
 * It matters because a freshly delivered sprite lands at numbers the intake
 * pipeline derived, and those are routinely wrong — `renderScale` in
 * particular, which is measured to be corrected on most poses
 * (docs/sprite-auto-adjust.md). Measuring reach off an unplaced frame reads the
 * pipeline's guess at the art's size, not the art, and would hand a character a
 * range that changes the moment somebody opens the workbench.
 *
 * So an unplaced frame is not evidence. It is skipped while the character has
 * any placed art to go on.
 */
function isPlaced(meta) {
  const edited = meta?.edited;
  return !!edited && PLACEMENT_FIELDS.some((f) => f in edited);
}

/**
 * Frame keys a character draws in any of the given animation states —
 * hand-placed ones only, unless they have none at all.
 *
 * The fallback matters: a fighter whose art has just arrived and been through
 * nothing still has to play. They are measured off their raw delivery and
 * flagged `placed: false`, so the audit tool can say out loud that their range
 * is provisional rather than quietly presenting a guess as a measurement.
 */
function framesFor(charKey, states) {
  const all = new Set();
  for (const state of states) {
    for (const frame of resolvedAnim(charKey, state)?.frames || []) all.add(frame);
  }
  const keys = [...all];
  const placed = keys.filter((k) => isPlaced(frameMeta(charKey, k)));
  return placed.length ? placed : keys;
}

/** True when every measurement for this character came from placed art. */
function allPlaced(charKey, states) {
  const keys = [];
  for (const state of states) {
    for (const frame of resolvedAnim(charKey, state)?.frames || []) keys.push(frame);
  }
  return keys.some((k) => isPlaced(frameMeta(charKey, k)));
}

/**
 * How far past their own centre line a frame's art extends, world px.
 *
 * `bodyLeft` / `bodyRight` are image pixels, so `ox` brings them into cell
 * space where the centre line is CELL_W/2, and a frame the manifest marks
 * `faceLeft` is drawn mirrored — its forward side is the cell's LEFT.
 */
function frameReach(charKey, frameKey, scale) {
  const m = frameMeta(charKey, frameKey);
  if (!m || !Number.isFinite(m.bodyLeft) || !Number.isFinite(m.bodyRight)) return null;
  const ox = m.ox ?? 0;
  const forward = m.faceLeft
    ? CELL_W / 2 - (ox + m.bodyLeft)
    : (ox + m.bodyRight) - CELL_W / 2;
  return forward * scale * (m.renderScale || 1);
}

/**
 * How wide the BODY is in a frame, world px.
 *
 * Off `coreLeft`/`coreRight` — the columns holding the middle of the drawing's
 * ink — rather than its outer bounds, because Maki's naginata, Gakuganji's
 * guitar and Momo's broom are all held across the body in an idle, and a
 * fighter should not be a wider target for carrying something that cannot be
 * hit. Falls back to the outer bounds for art the core measurement has not
 * reached.
 */
function frameWidth(charKey, frameKey, scale) {
  const m = frameMeta(charKey, frameKey);
  if (!m) return null;
  const lo = Number.isFinite(m.coreLeft) ? m.coreLeft : m.bodyLeft;
  const hi = Number.isFinite(m.coreRight) ? m.coreRight : m.bodyRight;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return (hi - lo) * scale * (m.renderScale || 1);
}

/**
 * Reach before banding: the furthest the art gets in a swing, having thrown
 * away the single furthest frame.
 *
 * Dropping the top one is what makes this survive the art changing. The frame
 * that reaches furthest is exactly the frame most likely to be an outlier — a
 * pose delivered at the wrong zoom, a weapon drawn past the edge of its cell,
 * an effect baked into the sheet — and taking a plain maximum would hand a
 * character's whole range to it. The second-furthest still describes a
 * committed swing, and it takes two bad frames rather than one to move it.
 */
function rawReach(charKey, scale) {
  if (!scale) return null;
  const values = framesFor(charKey, SWING_STATES)
    .map((k) => frameReach(charKey, k, scale))
    .filter((v) => v != null)
    .sort((a, b) => a - b);
  if (!values.length) return null;
  return values.length >= BODY.reachDropTopFrom
    ? values[values.length - 2]
    : values[values.length - 1];
}

/** The tallest the art gets in any of these states, world px above the foot
 *  line. Tallest rather than median because a two-frame crouch is a dip and a
 *  hold, and the box has to cover the fighter through both. */
function poseHeight(charKey, states, scale) {
  if (!scale) return 0;
  let best = 0;
  for (const key of framesFor(charKey, states)) {
    const m = frameMeta(charKey, key);
    if (!m || !Number.isFinite(m.bodyTop)) continue;
    best = Math.max(best, (frameFootY(m) - (m.oy ?? 0) - m.bodyTop) * scale * (m.renderScale || 1));
  }
  return best;
}

/** Width before banding: the median of the resting poses. */
function rawWidth(charKey, scale) {
  if (!scale) return null;
  const values = framesFor(charKey, NEUTRAL_STATES)
    .map((k) => frameWidth(charKey, k, scale))
    .filter((v) => v != null);
  return values.length ? median(values) : null;
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Round to a step, then hold inside a guard range. The rounding is the whole
 *  resilience story in one line: below the step size, art changes are invisible
 *  to the simulation. */
function band(value, step, lo, hi) {
  return clamp(Math.round(value / step) * step, lo, hi);
}
