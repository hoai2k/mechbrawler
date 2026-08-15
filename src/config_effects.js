// Per-drawing placement for the shared effect art. THE EFFECT WORKBENCH WRITES
// THIS FILE (`workbench/`, "Copy config") — everything in it can be edited by
// hand, and nothing in it is load-bearing: the worst a bad value does is draw
// the picture in the wrong place.
//
// WHY IT IS A FILE AND NOT A MANIFEST
//
// In the JJK base these numbers lived in `otherSprites` in
// `sprites/assets/manifest.json`, beside the per-pose placement of nineteen
// hundred character drawings. Mechs are rigged models: there are no character
// sprites, so there is no manifest, and the twenty entries that survived that
// deletion do not justify resurrecting a JSON index and a loader to fetch it.
// They are configuration in exactly the sense `config_fx.js` and
// `config_tuning.js` are — safe to edit, read once at boot — so they live where
// the rest of the game's configuration lives.
//
// WHAT EACH FIELD MEANS
//
//   renderScale  a multiplier on whatever height the drawing is painted at,
//                wherever that height comes from — a kit's `spriteH`, a
//                hazard's own constant, a director that sizes the picture
//                itself. One knob, because "this art is delivered too big
//                relative to the mech throwing it" is one fact about the
//                picture and should not need finding in four files.
//
//   dx, dy       a nudge in GAME pixels, applied where the drawing is painted
//                and never to what it collides with. That is the point: art
//                arrives off-centre in its plate and the collision point is not
//                negotiable, so the picture moves onto the point rather than
//                the point onto the picture. Positive dy is DOWN.
//
//   rotationDeg  a standing tilt, about the drawing's own anchor. A projectile
//                already turns to follow its flight path; this is the
//                correction on top of that, for art delivered at an angle.
//
//   faceLeft     art drawn pointing the wrong way. Everything that travels is
//                drawn pointing LEFT here and mirrored by the renderer when it
//                flies right (see assets/intake/README.md), so a plate that
//                arrived pointing right is flipped once, at the one place a
//                drawing is read, instead of at every spawn site.
//
//   hit          where the move's collision shape sits relative to the picture,
//                and how big — `{ dx, dy, scale }`. Presentation only: it moves
//                the SHAPE THE WORKBENCH DRAWS, so a drawing can be matched to
//                its real collision rather than guessed at. Zero is a decision
//                and is stored as one, because "no entry" means the shape sits
//                on the spawn point and `{0,0,1}` means it sits on the picture,
//                and those differ the moment the picture has been nudged.
//
//   attackBox    for art that is a BODY rather than a shot — a creature, a
//                hazard something can stand on — the part of the drawing that
//                actually hits, as fractions of the drawing: `x` forward from
//                its middle, `y` up from its feet, `w`/`h` its size. Fractions
//                so the box travels with the art: rescale it here or redraw it
//                bigger and the bite stays on the mouth.
//
// An entry with nothing in it is the same as no entry at all. The delivered
// round trimmed every plate to its own alpha (tools/effects_intake.py), which
// is why this file starts nearly empty rather than with a hundred nudges
// paying off empty margin — the drawings arrive centred on themselves.

/** @type {Record<string, {
 *    renderScale?: number, dx?: number, dy?: number, rotationDeg?: number,
 *    faceLeft?: boolean,
 *    hit?: { dx: number, dy: number, scale: number },
 *    attackBox?: { x: number, y: number, w: number, h: number },
 *  }>} */
export const EFFECT_PLACEMENT = {
  // Delivered facing right, and everything that travels is mirrored when it
  // flies right — so without this the fist docks backwards and the missiles
  // fly tail-first. Set from the plates themselves rather than by eye: these
  // are the drawings whose subject points along its own travel direction.
  "effect:rocket_fist": { faceLeft: true },
  "effect:micro_missile": { faceLeft: true },
  "effect:salvo_rocket": { faceLeft: true },
  "effect:cannon_shell": { faceLeft: true },
  "effect:siege_shell": { faceLeft: true },
  "effect:mortar_shell": { faceLeft: true },
  "effect:gatling_tracer": { faceLeft: true },
  "effect:sniper_beam": { faceLeft: true },
  "effect:fang_dagger": { faceLeft: true },
  "effect:quill_feather": { faceLeft: true },
  "effect:flame_jet": { faceLeft: true },
  "effect:water_jet": { faceLeft: true },
  "effect:energy_serpent": { faceLeft: true },
  "effect:rend_wave": { faceLeft: true },
  "effect:tsunami_wall": { faceLeft: true },
};
