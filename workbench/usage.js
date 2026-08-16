// WHO THROWS EACH DRAWING, and in what pose.
//
// `sharedSpriteInfo` (src/shared_sprites.js) already answers most of what a
// panel needs about a shared drawing: how tall the game paints it, which point
// on it lands on the spawn point, whether the spawn site reads a nudge, what
// shape the move collides on. It is derived from the drawing code, which is
// what makes it trustworthy, and it is the reason this workbench can size art
// against real numbers instead of by eye.
//
// It stops one step short of what a REFERENCE RENDER needs. It names the owner
// as a display name — "Titanus" — because that is what a caption wants, and a
// caption was all anything wanted until now. To stand the mech who fires a
// drawing beside it, this file has to answer three more questions:
//
//   which mech      the character KEY, not their name, because that is what
//                   render3d loads a rig by
//   which move      so the card can say "Rocket Fist (RB)" rather than leaving
//                   the reader to work out which of five slots this is
//   which pose      the animation state that mech is in while they throw it,
//                   so the render is the moment the drawing belongs to
//
// All three come out of the same walk the registry does, over the same kits, so
// nothing here is a second source of truth about what a move is — it is the
// same fields, kept rather than discarded.

import { CHARACTERS, CHARACTER_KEYS } from "../src/characters.js";
import { SPRITE_KEY_FIELDS } from "../src/shared_sprites.js";

/** What each kit slot is called on the pad, so a card can say where a move
 *  lives rather than making the reader remember the control map (K1). */
const SLOT_LABEL = {
  ranged: "RB · ranged",
  neutral: "RT · neutral",
  side: "RT · side",
  down: "RT · down",
  ult: "LB · ultimate",
};

/** The animation state a mech plays while the slot runs — `slotAnim` in
 *  src/specials.js, and `ult` for an ultimate. The gun plays the neutral
 *  special's pose, which is each mech's own shoot clip. */
const SLOT_ANIM = {
  ranged: "specialNeutral",
  neutral: "specialNeutral",
  side: "specialSide",
  down: "specialDown",
  ult: "ult",
};

/** How far into that clip to freeze the reference render.
 *
 *  Not the first frame and not the last: a wind-up has not thrown anything yet
 *  and a recovery has already finished. A third of a second in is the release
 *  on every one of these clips, which is the moment the drawing this card is
 *  about actually exists. */
export const LAUNCH_TIME = 0.34;

let index = null;

/** Every shared key this node or anything under it names, with the field it
 *  was named in — the same fields the scale fold and the registry walk. */
function keysIn(node, out = []) {
  if (!node || typeof node !== "object") return out;
  for (const field of SPRITE_KEY_FIELDS) {
    const v = node[field];
    if (typeof v === "string" && v.includes(":")) out.push(v);
    else if (Array.isArray(v)) for (const k of v) if (typeof k === "string" && k.includes(":")) out.push(k);
  }
  for (const v of Object.values(node)) {
    if (v && typeof v === "object") keysIn(v, out);
  }
  return out;
}

function build() {
  const map = new Map();
  const claim = (key, use) => {
    // FIRST USE WINS, and the walk is ordered so that is the right one: a
    // drawing shared between a mech's gun and their ultimate belongs, for the
    // purposes of standing somebody beside it, to whichever throws it first in
    // kit order. Recording every use instead would mean a card with four
    // reference renders and no reason to prefer any of them.
    if (!map.has(key)) map.set(key, use);
  };
  for (const charKey of CHARACTER_KEYS) {
    const c = CHARACTERS[charKey];
    if (!c) continue;
    const slots = [
      ["ranged", c.ranged],
      ...Object.entries(c.specials || {}).map(([s, def]) => [s, def]),
      ["ult", c.ultimate],
    ];
    for (const [slot, def] of slots) {
      if (!def) continue;
      for (const key of keysIn(def)) {
        claim(key, {
          charKey,
          charName: c.name || charKey,
          slot,
          slotLabel: SLOT_LABEL[slot] || slot,
          anim: SLOT_ANIM[slot] || "idle",
          move: def.name || slot,
          // The handler that spawns it (specials.js SPECIALS / ultimates.js).
          // The Preview needs it to know whether this drawing FLIES — a
          // `projectile` has a speed and a lifetime the preview can integrate,
          // while a `burst` is a flash the handler paints itself.
          type: def.type || null,
          p: def.p || null,
        });
      }
    }
  }
  return map;
}

/** The move that throws this drawing, or null for art no kit names — a hazard,
 *  a status, a piece of shared feedback. Null is a real answer and the panel
 *  says so: those drawings get a mech beside them purely as a ruler. */
export function firingUse(key) {
  index ||= build();
  return index.get(key) || null;
}

/** The mech to stand beside art nobody throws, purely as a size reference.
 *
 *  The roster MEDIAN by height, resolved rather than named, so it stays the
 *  honest middle of the cast as the roster changes. A ruler wants to be typical
 *  — putting a hazard next to the tallest mech in the game would make every
 *  hazard look small, and next to the shortest, large. */
export function referenceMech() {
  const byHeight = CHARACTER_KEYS
    .filter((k) => Number.isFinite(CHARACTERS[k]?.heightCm))
    .sort((a, b) => CHARACTERS[a].heightCm - CHARACTERS[b].heightCm);
  return byHeight[Math.floor(byHeight.length / 2)] || CHARACTER_KEYS[0];
}
