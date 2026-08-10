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
// `headHeights` in the sprite manifest overrides the computed target for a
// character. That is what the sprite workbench edits: it is a single number
// that rescales every one of that fighter's frames at once, which is why the
// workbench treats it as the global height control rather than a guide line.

import { getActor, CHARACTERS } from "./characters.js";
import { spriteManifest } from "./assets.js";
import { clamp } from "./utils.js";
import { frameFootY } from "./sprites.js";
import {
  HEIGHT_REFERENCE, HEIGHT_COMPRESSION, HEIGHT_MIN_RATIO, HEIGHT_MAX_RATIO,
  HEIGHT_BASE_PX, HEIGHT_UNKNOWN_RATIO, HEAD_ABOVE_BODY,
} from "./config_tuning.js";

/** The frame a character's height is measured from — their standing idle. */
const HEIGHT_FRAME = ["idle_a", "r0c0"];

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

/** Rendered head height in game pixels: the manifest override if one exists,
 *  otherwise the value derived from canon. */
export function headHeightTarget(charKey) {
  const override = spriteManifest?.headHeights?.[charKey];
  if (Number.isFinite(override) && override > 0) return override;
  return heightRatio(charKey) * HEIGHT_BASE_PX;
}

/** True when the target came from a hand edit rather than from canon. */
export function hasHeightOverride(charKey) {
  const override = spriteManifest?.headHeights?.[charKey];
  return Number.isFinite(override) && override > 0;
}

/**
 * How tall the character's idle stands at scale 1, from the foot line to the
 * very top of the art — the point the head-height target names.
 *
 * `bodyTop` is the topmost opaque row, measured offline by
 * tools/bake_anchors.py, so this is the real top of the head rather than an
 * estimate of it. `bodyBottom` is in the span too, which is what makes the head
 * hold its place when a pose's ground contact moves: shifting the foot line
 * changes the span, the solved scale absorbs it, and the top does not move.
 *
 * Frames the bake has not reached fall back to `bodyH` scaled by the empirical
 * offset between the detected body box and the hair above it.
 */
function idleSpan(charKey) {
  const frames = spriteManifest?.characters?.[charKey];
  if (!frames) return 0;
  for (const key of HEIGHT_FRAME) {
    const meta = frames[key];
    if (!meta) continue;
    const renderScale = meta.renderScale || 1;
    if (Number.isFinite(meta.bodyTop)) {
      const span = (frameFootY(meta) - (meta.oy ?? 0) - meta.bodyTop) * renderScale;
      if (span > 0) return span;
    }
    if (meta.bodyH) return meta.bodyH * HEAD_ABOVE_BODY;
  }
  return 0;
}

/**
 * The span a character's scale is solved against.
 *
 * Normally the idle's own, measured above — but a value pinned in
 * `heightSpans` wins. That pin is what lets the idle be adjusted like any other
 * pose: without it, nudging the idle's size or ground contact moves the span,
 * which re-solves the scale, which resizes every OTHER pose in the set. Once
 * the reference is pinned, the character's size is the height target's job
 * alone, which is where it belongs.
 */
export function referenceSpan(charKey) {
  const pinned = spriteManifest?.heightSpans?.[charKey];
  if (Number.isFinite(pinned) && pinned > 0) return pinned;
  return idleSpan(charKey);
}

/** The span as measured from the art right now, for whoever pins it. */
export function measuredIdleSpan(charKey) {
  return idleSpan(charKey);
}

/**
 * Solve a character's draw scale so the top of their idle lands exactly on the
 * head-height target, and write it onto the character. Returns the scale, or
 * null when the manifest cannot answer (leaving the authored fallback alone).
 */
export function applyHeightScale(charKey) {
  const char = getActor(charKey);
  const span = referenceSpan(charKey);
  if (!char || !span) return null;
  char.scale = headHeightTarget(charKey) / span;
  return char.scale;
}

/** Every character with art. Called once the manifest is loaded, and again by
 *  the workbench whenever a height is edited. */
export function applyAllHeightScales() {
  for (const charKey of Object.keys(spriteManifest?.characters || {})) {
    applyHeightScale(charKey);
  }
}
