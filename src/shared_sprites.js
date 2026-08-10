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
// Both are written by the sprite workbench's Other Sprites view and stored in
// `otherSprites` in the manifest, beside the review flags that already live
// there.

import { CHARACTERS, CHARACTER_KEYS } from "./characters.js";
import { spriteManifest } from "./assets.js";

/** The keys a kit node names a shared drawing with. */
const SPRITE_FIELDS = ["sprite", "aura", "domainSprite"];

function scaleOf(key) {
  const scale = spriteManifest?.otherSprites?.[key]?.renderScale;
  return Number.isFinite(scale) && scale > 0 ? scale : null;
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
    if (Number.isFinite(node.spriteH)) {
      // Remembered on first visit, so an edit in the workbench scales the
      // authored height rather than the one the last edit left behind.
      if (!Number.isFinite(node.spriteHBase)) node.spriteHBase = node.spriteH;
      const keys = [];
      for (const field of SPRITE_FIELDS) {
        if (typeof node[field] === "string") keys.push(node[field]);
      }
      if (Array.isArray(node.sprites)) keys.push(...node.sprites.filter((k) => typeof k === "string"));
      // A node naming several drawings (a summon with a borrowed stand-in)
      // takes the scale of the one it prefers, which is the first.
      const scale = keys.map(scaleOf).find((s) => s !== null);
      node.spriteH = scale ? node.spriteHBase * scale : node.spriteHBase;
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") visit(value);
    }
  };
  for (const key of CHARACTER_KEYS) {
    const char = CHARACTERS[key];
    visit(char?.specials);
    visit(char?.ultimate);
  }
}
