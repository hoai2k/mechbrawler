// Per-drawing adjustments for the shared `effect:*` and `summon:*` art.
//
// These sprites belong to no fighter. They have no manifest entry of their own
// and no placement data: the code that spawns each one decides where it goes
// and how big it is, from `sprite` and `spriteH` in the kit that throws it.
// That is the right shape — a projectile's size is a property of the move, not
// of the picture — but it leaves two things nobody can fix without editing a
// kit by hand:
//
//   faceLeft     art that arrived drawn facing the wrong way. Every fighter's
//                sheet is drawn facing right and the renderer mirrors it; an
//                effect that points left is simply wrong, everywhere it is
//                used. Applied in assets.js, at the one place a drawing is
//                read, so no spawn site has to know about that one file.
//
//   renderScale  art delivered at the wrong size RELATIVE to the character who
//                throws it. The kits declare a height in pixels each; rather
//                than re-authoring fifty numbers by eye, the workbench tunes
//                one multiplier against the character it is drawn beside, and
//                it is folded into those declared heights here.
//
//                Kit `spriteH` is not the only place a size comes from, and it
//                used to be the only one this reached — so a scale set on a
//                summon, an install aura or a stage hazard was stored, showed
//                in the workbench, and did nothing on stage. `sharedScale()`
//                is now read at those draw sites too.
//
//   dx, dy       where the picture sits relative to the point the game spawns
//                it on. Art arrives off-centre in its plate and the collision
//                point is not negotiable, so the drawing moves.
//
//   rotationDeg  a standing tilt correction, about the same point. Art that
//                arrives at an angle is otherwise unusable for anything the
//                engine turns itself.
//
// Both are written by the sprite workbench's Other Sprites view and stored in
// `otherSprites` in the manifest, beside the review flags that already live
// there.

import { CHARACTERS, CHARACTER_KEYS } from "./characters.js";
import { spriteManifest } from "./assets.js";

/** How a kit node names a shared drawing, and which field holds the height that
 *  drawing is painted at.
 *
 *  There is no single convention and there does not need to be — a projectile's
 *  `spriteH`, an orb's `orbSpriteH` and a dropped set piece's plain `h` are
 *  each the natural name in their own move. What matters is that every one of
 *  them is listed here, because a pair that is missing is a drawing whose
 *  declared size the scale fold cannot reach.
 *
 *  A null height means the drawing is sized by the renderer rather than by the
 *  kit — auras and domain backdrops — and is handled at those draw sites.
 */
// The third element, where present, is the field's OWN hit numbers. A node can
// declare two drawings at once — a cannon under `sprite` and the orbs it opens
// with under `orbSprite` — and the node's hit numbers describe only the first
// of them.
const SPRITE_FIELDS = [
  // A list per field, first one present wins: a move may name its drawing
  // under `sprite` but declare the height as plain `h`, so a single partner
  // name would leave that drawing unscalable.
  ["sprite", ["spriteH", "h"]],
  ["orbSprite", ["orbSpriteH"], { r: "orbR" }],
  ["waveSprite", ["waveSpriteH"]],  // rampage ground-wave (Konga APEX POUND)
  ["eggSprite", ["eggSpriteH"]],    // summon warp-in prop (Saurion RAPTOR PACK)
  ["key", ["h"]],          // a random-drop entry: `{ key: "effect:…", w, h }`
  ["aura", []],
  ["domainSprite", []],
];

/** Fields holding a LIST of interchangeable drawings that share one declared
 *  height, and the field that declares it.
 *
 *  `sprites` is a preference list — the first drawing that has loaded is the
 *  one used, the rest are stand-ins. `spritePool` is a random pick per shot,
 *  all members painted at the same `spriteH`. Both are one height for several
 *  keys, so a size set on any member is a statement about all of them — which
 *  is honest, because the move declares one number and there is nowhere to put
 *  a second. */
const SPRITE_LIST_FIELDS = [
  ["sprites", "spriteH"],
  ["spritePool", "spriteH"],
];

/**
 * The box a CREATURE hits with, as fractions of its own drawing.
 *
 * Its hurt box is the whole sprite — a creature drawn 205 px long is hit
 * anywhere along those 205 px, which is what a hurt box should be. Its ATTACK
 * box is not the same shape: a hound bites with its head, and being brushed by
 * its tail should not deal damage. Fighters have had the two separate since
 * the beginning; this gives creatures the same split.
 *
 *   x  centre of the box, FORWARD from the middle of the drawing, in fractions
 *      of its width. Positive is the way the creature faces, so it mirrors.
 *   y  centre of the box above the feet, in fractions of the drawing's height.
 *   w  width, as a fraction of the drawing's width.
 *   h  height, as a fraction of the drawing's height.
 *
 * Fractions rather than pixels, so the box travels with the art: rescale the
 * creature in the workbench, or redraw it bigger, and the bite stays on the
 * mouth. Stored per creature in `otherSprites`, beside the size and the nudge,
 * and edited on the canvas.
 */
export function sharedAttack(key) {
  const box = entryOf(key)?.attackBox;
  if (!box) return null;
  const n = (v, d) => (Number.isFinite(v) ? v : d);
  return { x: n(box.x, 0.25), y: n(box.y, 0.5), w: n(box.w, 0.5), h: n(box.h, 0.8) };
}

const isSharedKey = (v) => typeof v === "string"
  && (v.startsWith("effect:") || v.startsWith("summon:") || v.startsWith("stagefx:"));

/** The stored entry for a shared drawing, following the one inheritance rule
 *  this map has: a summon POSE (`summon:nue:idle_a`) falls back to its creature
 *  (`summon:nue`). The six poses of a creature are one drawing at one zoom, so
 *  a size set on any of them is a statement about the creature; without this,
 *  adjusting the pose you happen to be looking at silently does nothing. */
function entryOf(key) {
  const all = spriteManifest?.otherSprites;
  if (!all) return null;
  if (all[key]) return all[key];
  const parts = String(key).split(":");
  if (parts[0] === "summon" && parts.length === 3) return all[`${parts[0]}:${parts[1]}`] || null;
  return null;
}

function scaleOf(key) {
  const scale = entryOf(key)?.renderScale;
  return Number.isFinite(scale) && scale > 0 ? scale : null;
}

/**
 * Every per-drawing adjustment for a shared sprite, resolved.
 *
 *   scale   a multiplier on whatever height the drawing is drawn at, wherever
 *           that height comes from — a kit's `spriteH`, a creature's `h` in
 *           config_summons.js, the install aura's own constant, a stage
 *           hazard's. One knob, because "this art is delivered too big" is one
 *           fact about the picture and should not need finding in four files.
 *   dx, dy  a nudge in game pixels, applied where the drawing is painted and
 *           NOT to anything it collides with. That is the point: art arrives
 *           off-centre in its plate — an egg at one end of a long trail, a
 *           creature drawn to one side — and the fix is to move the picture
 *           onto the point the game is actually using, rather than to move the
 *           point. Positive dy is DOWN, matching canvas coordinates.
 *
 * Returns the identity adjustment for a drawing nobody has touched, so callers
 * can use it unconditionally.
 */
export function sharedAdjust(key) {
  const e = entryOf(key);
  const scale = Number.isFinite(e?.renderScale) && e.renderScale > 0 ? e.renderScale : 1;
  const deg = Number.isFinite(e?.rotationDeg) ? e.rotationDeg : 0;
  return {
    scale,
    dx: Number.isFinite(e?.dx) ? e.dx : 0,
    dy: Number.isFinite(e?.dy) ? e.dy : 0,
    // Radians, about the drawing's own anchor. A projectile already turns to
    // follow its flight path; this is the standing correction on top of that,
    // for art delivered at a tilt.
    rot: deg * Math.PI / 180,
    deg,
  };
}

/** Fold each shared sprite's scale into the `spriteH` of every kit entry that
 *  draws it, once, after the manifest has loaded.
 *
 *  The declared heights are the only size the spawn sites read, so multiplying
 *  them here reaches every one — including the effects drawn by code that has
 *  no idea the workbench exists. Idempotent: the baseline is remembered per
 *  node, so re-running after an edit re-derives rather than compounding.
 */
export function applySharedSpriteScales() {
  const seen = new Set();
  const visit = (node) => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    for (const [field, heightFields] of SPRITE_FIELDS) {
      if (!isSharedKey(node[field])) continue;
      const heightField = heightFields.find((h) => Number.isFinite(node[h]));
      if (!heightField) continue;
      // Remembered on first visit, so an edit in the workbench scales the
      // authored height rather than the one the last edit left behind.
      const base = `${heightField}Base`;
      if (!Number.isFinite(node[base])) node[base] = node[heightField];
      const scale = scaleOf(node[field]);
      node[heightField] = scale ? node[base] * scale : node[base];
    }
    // A list of drawings under one declared height (SPRITE_LIST_FIELDS): the
    // first member with a scale set decides it, because there is a single
    // number to fold it into.
    for (const [field, heightField] of SPRITE_LIST_FIELDS) {
      if (!Array.isArray(node[field]) || !Number.isFinite(node[heightField])) continue;
      const base = `${heightField}Base`;
      if (!Number.isFinite(node[base])) node[base] = node[heightField];
      const scale = node[field].filter(isSharedKey).map(scaleOf).find((s) => s !== null);
      node[heightField] = scale ? node[base] * scale : node[base];
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") visit(value);
    }
  };
  for (const key of CHARACTER_KEYS) {
    const char = CHARACTERS[key];
    visit(char?.specials);
    visit(char?.ultimate);
    // The RB gun slot (K1) declares sprites the same way the specials do.
    visit(char?.ranged);
  }
}

/** The install aura's nominal painted height (src/render.js, drawInstallAura). */
export const AURA_H = 220;

/** The aura breathes rather than sitting still, so `AURA_H` is never the height
 *  it is actually painted at: the drawing is `AURA_H * pulse`, and the pulse
 *  swings between 0.82 and 0.94. Lives here with the height because more than
 *  one renderer paints this one drawing, and a breath that differs between
 *  them is a preview that lies about the size by a tenth. */
export const AURA_PULSE = { base: 0.88, amp: 0.06, rate: 8 };

/** The aura stands this many pixels BELOW the fighter's feet, so the glow skirts
 *  the floor they are standing on rather than being cut off by it. */
export const AURA_FOOT_DY = 10;
