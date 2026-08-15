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
// Any field may be hand-set and the tool will not clobber it — mark it with
// `pinned: [...]` naming the fields it must leave alone. Reasons this comes up:
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
 * GENERATED — `node tools/derive_attack_envelopes.mjs` rewrites entries here
 * from the delivered rigs. Fields listed in `pinned` are preserved across runs.
 *
 * Empty until the first mech rigs land. That is not a stub: an empty table is
 * exactly the state where every fighter uses ROSTER_DEFAULT, which is the
 * behaviour the fallback exists to provide.
 */
export const MECH_METRICS = {
  // titanus: { reach: 0.71, width: 0.38, crouch: 0.74, air: 0.88 },
  // viper:   { reach: 0.58, width: 0.24, crouch: 0.61, air: 0.82,
  //            pinned: ["reach"] },  // measured 0.66 — shortened for balance
};
