// Character size, derived from canon height.
//
// A fighter's rendered size used to be a hand-set `scale` per character with no
// relation to anything — Gojo, canonically the tallest sorcerer alive, was drawn
// third smallest. Size now comes from `heightCm` in characters.js, compressed
// toward the reference fighter so the roster keeps its real ordering without the
// extremes drifting away from the one-size-fits-all hurtbox in combat.js.
//
// The chain, and where to intervene:
//
//   heightCm (characters.js)          the real figure, or null if unpublished
//     -> heightRatio()                compressed against the reference, clamped
//     -> headHeightTarget()           rendered head height in game px
//     -> CHARACTERS[key].scale        what drawCharFrame is handed
//
// `headHeightPx` on the character definition overrides the computed target,
// for a mech whose canon height is not the size it should FIGHT at.
//
// ---------------------------------------------------------------------------
// WHAT USED TO BE HERE, AND WHY IT IS NOT
//
// Half this file solved a scale. Sprite art arrives at whatever pixel size the
// artist drew it, so the game measured the topmost opaque row of a character's
// idle frame, divided the height target by that span, and wrote the quotient
// onto `CHARACTERS[key].scale` for drawCharFrame to multiply by. There was a
// pinning mechanism on top of it (`heightSpans`) so that nudging the idle's
// ground contact did not silently resize every other pose in the set.
//
// A rig has none of that problem. The model's real height in metres is declared
// in the render3d manifest, and blit.js scales by it directly — so there is no
// span to measure, no scale to solve, and no pin to maintain. The whole
// mechanism went with the sprite sheets, and `CHARACTERS[key].scale` with it.
//
// What remains is the part that was always about the FIGHTER rather than the
// artwork: how tall this mech is relative to the rest of the roster.

import { getActor, CHARACTERS } from "./characters.js";
import { clamp } from "./utils.js";
import {
  HEIGHT_REFERENCE, HEIGHT_COMPRESSION, HEIGHT_MIN_RATIO, HEIGHT_MAX_RATIO,
  HEIGHT_BASE_PX, HEIGHT_UNKNOWN_RATIO,
} from "./config_tuning.js";

function referenceCm() {
  return CHARACTERS[HEIGHT_REFERENCE]?.heightCm || 190;
}

/** A canon height as a person's height reads: 190 -> 6'3".
 *
 *  The number in characters.js stays metric — that is how the sources publish
 *  it, and every calculation here is a ratio anyway — but a height only means
 *  something to a reader in the units they picture a person in. Rounded to the
 *  nearest inch, and 12 inches carries into the next foot rather than printing
 *  5'12". Returns "" when nothing is published, so callers can say their own
 *  thing about a fighter with no figure.
 */
export function heightLabel(cm) {
  if (!Number.isFinite(cm) || cm <= 0) return "";
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}"`;
}

/**
 * A fighter's size relative to the reference fighter, after compression and
 * clamping. 1.0 means "the same height as the reference".
 */
export function heightRatio(charKey) {
  const cm = getActor(charKey)?.heightCm;
  if (!cm) return HEIGHT_UNKNOWN_RATIO;
  const real = cm / referenceCm();
  const compressed = 1 + (real - 1) * HEIGHT_COMPRESSION;
  return clamp(compressed, HEIGHT_MIN_RATIO, HEIGHT_MAX_RATIO);
}

/** Rendered height in game pixels: the character's own `headHeightPx` if it
 *  declares one, otherwise the value derived from canon height. */
export function headHeightTarget(charKey) {
  const override = getActor(charKey)?.headHeightPx;
  if (Number.isFinite(override) && override > 0) return override;
  return heightRatio(charKey) * HEIGHT_BASE_PX;
}

/** True when the target was set by hand rather than derived from canon. */
export function hasHeightOverride(charKey) {
  const override = getActor(charKey)?.headHeightPx;
  return Number.isFinite(override) && override > 0;
}
