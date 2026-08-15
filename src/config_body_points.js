// HUMAN-VERIFIED FACTS ABOUT A FIGHTER'S BODY.
//
// Written by the verification bench (`/workbench/?edit=verification`, task
// sets "centre-of-mass", "muzzle-points", "ledge-grip"): a person looked at
// the drawing and said where the thing actually is. Paste the bench's export
// blocks in here and commit — this is the one place these decisions live, and
// nothing here is generated, so a re-bake of any measurement cannot undo it.
//
// Every key is optional. Absent means "use the roster default", which is what
// the game did before anybody checked:
//
//   com        centre of mass as a FRACTION of drawn height. The default is
//              COM_BODY_FRAC (0.55, config_tuning.js) — the pivot a tumble
//              rotates about, the point the 3D rig rotates about in-scene,
//              the chest line an aim solves from, and the centre the prone
//              box hangs off.
//   muzzle     { x, y } in game px from the fighter's centre line and foot
//              line (up is negative) — where a projectile leaves them. The
//              default is the reference body's 70, -86 scaled by height.
//   ledgeGrip  { x, y } likewise — where the gripping hand meets the lip on
//              a ledge hang.

export const BODY_POINTS = {
  // "gojo": { com: 0.57, muzzle: { x: 62, y: -104 } },
};

/**
 * Per-fighter, per-state corrections to the hurtbox, as MULTIPLIERS on the
 * box combat.js derives. Written by the "hurtbox-fit" task set.
 *
 * Multipliers rather than sizes on purpose: the derived box tracks the art
 * (height and width are measured from the drawings, and the crouch and air
 * fractions from those poses), so a fighter whose sprites are redrawn keeps
 * a correct box. An absolute size would freeze it at whatever the art was on
 * the day somebody looked. A case a reviewer approved as-derived is
 * deliberately ABSENT here rather than written as 1×1, for the same reason.
 *
 * Cases: stand | crouch | air | hurt | prone | ledge.
 */
export const HURTBOX_FIT = {
  // "hanami": { air: { w: 1.1, h: 0.95 } },
};

/** Who checked what, and when. Same keys; `at` is an ISO date. */
export const BODY_POINT_META = {
  // "gojo": { com: { at: "2026-08-15", note: "blindfold reads high" } },
};
