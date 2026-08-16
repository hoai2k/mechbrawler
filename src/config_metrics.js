// HOW BIG EACH MECH IS, as gameplay sees it.
//
// Reach, width, crouch height and airborne height are the numbers combat.js
// builds hitboxes and hurtboxes out of. They used to be MEASURED AT RUNTIME
// from sprite silhouette bounds — every frame of every attack, banded and
// clamped, on the way to a per-fighter reach. The sprite sheets are gone, and
// the obvious replacement (measure the rig instead) is a trap worth naming so
// nobody re-introduces it:
//
//   THE RIGS LOAD LAZILY AND ASYNCHRONOUSLY. A metric read off a rig is a
//   metric that does not exist until that rig lands. Combat asks for reach on
//   the first frame a hitbox goes live, which on a slow connection can be
//   before the model has arrived — so the same matchup would play differently
//   depending on download timing. That is not a rounding difference; it is a
//   fighter whose sword reaches further on a fast machine.
//
// So the numbers are PINNED HERE, in data, and gameplay reads only this file.
// Measurement did not go away — it moved upstream. `render3d/src/loader.js`
// still exposes `measureIdleHeight` and `measureAttackReach`, and
// `tools/derive_attack_envelopes.mjs` poses each rig at its contact beats,
// measures the posed bounding box, and writes the result here. The loop is:
//
//   deliver a rig -> run the tool -> it writes this table -> review the diff
//
// which means a mech's numbers come from its actual geometry (nobody is
// guessing how far a lance reaches) while staying a reviewable constant that a
// designer can overrule. Both halves matter: measured so the art and the
// hitbox agree, pinned so the fight is the same every time.
//
// ---------------------------------------------------------------------------
// OVERRIDING
//
// Every field here is hand-set: this file is edited, not generated (see the
// note on MECH_METRICS). When a measurement and a design intent disagree, the
// design intent wins and the reason is written beside the number. Reasons this
// comes up:
//
//   * a mech whose silhouette lies about its threat (a wide decorative shell
//     that should not be a bigger hurtbox);
//   * balance work that wants a reach shorter than the model to keep a matchup
//     honest;
//   * a rig delivered before its weapon prop, where the measured reach is the
//     arm rather than the lance.
//
// ---------------------------------------------------------------------------
// UNITS
//
// Everything is a FRACTION OF THAT MECH'S OWN STANDING HEIGHT, never pixels
// and never metres. A 12-metre biped and a four-metre raptor are described in
// the same numbers, and rescaling a mech does not invalidate its table. The
// absolute height comes from `heightM` in the render3d manifest; heights.js
// turns the pair into game pixels.
//
//   reach    how far past the body centre a committed swing extends
//   width    body half-width at rest (hurtbox), excluding outstretched limbs
//   crouch   ducked height as a fraction of standing
//   air      height occupied while jumping or falling (tucked legs read short)
//
// A mech with no entry falls back to ROSTER_DEFAULT, so a rig delivered before
// its numbers are derived still fights sensibly instead of crashing.

/** What an unlisted mech is assumed to be. Deliberately middling: a fighter
 *  whose table has not been derived yet should feel unremarkable, not strong. */
export const ROSTER_DEFAULT = {
  reach: 0.62,
  width: 0.30,
  crouch: 0.72,
  air: 0.86,
};

/**
 * Per-mech metrics, keyed by the character key used everywhere else.
 *
 * HALF MEASURED, HALF AUTHORED — and the split is written out per field in
 * the block below, because it used to claim the derive tool rewrote this file
 * and it never has. `node tools/derive_attack_envelopes.mjs` writes
 * src/config_model_reach.js; `reach` here is transcribed from it (see below).
 *
 * A mech missing from the table falls back to ROSTER_DEFAULT — that is the
 * intended behaviour for a rig delivered ahead of its numbers.
 */
export const MECH_METRICS = {
  // `reach` is MEASURED. tools/derive_attack_envelopes.mjs poses each rig at
  // the contact beat of all six attack states and records the forward
  // extension in game px (src/config_model_reach.js); the fraction here is
  // that mech's LONGEST committed swing over its own rendered head height —
  // the same "committed swing" this field is defined as above. The finer
  // per-state answer stays in MODEL_REACH, which is what strike_points.js
  // reads; this single number is the coarse threat range that pricing, tips,
  // grace and AI spacing want.
  //
  // `width`, `crouch` and `air` are STILL HAND-DERIVED from the Mech Mayhem
  // dossier, and the tool does not touch them, because it cannot measure
  // them honestly: it records a posed box's forward extent and its TOP, and
  // normalises against head height rather than standing height — so its
  // "top" readings run past 1.0 on every mech with a crest or a spire, and
  // there is no idle measurement to divide a crouch or an air pose by. A
  // number derived from those would be arithmetic, not evidence. Measuring
  // them properly means teaching the tool an idle-height reading first.
  titanus: { reach: 0.54, width: 0.36, crouch: 0.75, air: 0.80 },
  vulcan: { reach: 0.50, width: 0.36, crouch: 0.75, air: 0.85 },
  viper: { reach: 0.53, width: 0.22, crouch: 0.72, air: 0.85 },
  rhino: { reach: 0.51, width: 0.34, crouch: 0.76, air: 0.80 },
  // Measured off TORNADO (105 px) against a 40 px jab — the widest spread of
  // any mech's move set. The long number is the honest threat range to space
  // against; nothing prices a jab off it (MODEL_REACH.states does that).
  tempest: { reach: 0.83, width: 0.24, crouch: 0.74, air: 0.85 },
  // The shortest reach on the roster, and correctly so: a hunched wolf frame
  // whose arms are tucked under its chest. Every one of its six attack states
  // measures 44-50 px, so this is the body, not one bad pose.
  fenrir: { reach: 0.40, width: 0.26, crouch: 0.68, air: 0.85 },
  colossus: { reach: 0.49, width: 0.40, crouch: 0.78, air: 0.80 },
  wraith: { reach: 0.61, width: 0.22, crouch: 0.72, air: 0.85 },
  inferno: { reach: 0.46, width: 0.33, crouch: 0.75, air: 0.85 },
  glacier: { reach: 0.56, width: 0.36, crouch: 0.78, air: 0.80 },
  // The reach monster: pincers on a wide shell. The guard clamp in
  // silhouette.js is expected to bite here — that is the clamp working, and
  // the measurement (0.95) says so louder than the hand guess (0.90) did.
  cranky: { reach: 0.95, width: 0.48, crouch: 0.85, air: 0.80 },
  saurion: { reach: 0.69, width: 0.30, crouch: 0.66, air: 0.85 },
  frogger: { reach: 0.50, width: 0.30, crouch: 0.55, air: 0.85 },
  jerry: { reach: 0.54, width: 0.34, crouch: 0.60, air: 0.78 },
  nullbot: { reach: 0.50, width: 0.24, crouch: 0.74, air: 0.85 },
  konga: { reach: 0.59, width: 0.40, crouch: 0.72, air: 0.80 },
  // Cannon arms on a wide hull; clamped like cranky.
  tritone: { reach: 0.97, width: 0.46, crouch: 0.88, air: 0.80 },
};
