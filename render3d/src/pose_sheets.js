// WHAT EACH MECH'S STATES ARE MADE OF — the pose schedules clip_schedule.js
// reads.
//
// This is CONTENT, not engine. Adding a mech means adding one key here; nothing
// in render3d/src/ needs to know the mech exists. See docs/content-contract.md
// for the full list of files a new mech touches.
//
// ---------------------------------------------------------------------------
// THE SHAPE
//
//   POSE_SHEETS[charKey][state] = { fps, frames: [...] }        even spacing
//   POSE_SHEETS[charKey][state] = { t: [...], frames: [...] }   explicit times
//
// `frames` are POSE NAMES, resolved against the shared pose vocabulary in
// battle_poses.js / baseline_poses.js. They are not file names and not clip
// names — a mech schedules poses; what a pose IS as a body is a separate
// question with a separate answer, which is what lets two mechs of very
// different builds share the word `strike`.
//
// The `fps` form exists because states.js derives a state's `duration` from an
// fps, so a frame list and a rate agree with the state table by construction.
// Reach for the `t` form only when a state genuinely needs irregular spacing (a
// long hold then a fast snap); even spacing is easier to review.
//
// A state with no entry is not an error. It means "use whatever the delivered
// GLB does for this state" — the right answer for a mech that shipped real
// authored animation, and the reason a mech can arrive with a full clip set and
// an empty entry here.
//
// ---------------------------------------------------------------------------
// PORTING FROM ROBOTWORLD
//
// Robotworld's `src/mechs/animations.js` is already this table in a different
// notation: its clips are `{ t, ease, pose: { joint: [x,y,z] } }` keyframes,
// which carry the pose INLINE rather than by name. Bringing one across is two
// moves, and they go in different files:
//
//   the joint angles  ->  a named pose in battle_poses.js
//   the `t` values    ->  a `{ t, frames }` entry here
//
// Doing it that way rather than importing the keyframes wholesale is what keeps
// poses reusable across the roster instead of each mech carrying its own
// private copy of "arm extended".

/**
 * Per-mech pose schedules, keyed by the character key used everywhere else.
 *
 * Empty until the first mech is delivered. An empty table is a valid state, not
 * a stub: every mech falls through to its GLB's own clips, and a mech with
 * neither draws its bind pose — visible, obviously wrong, and reported by
 * `coverageFor` rather than silently missing.
 */
export const POSE_SHEETS = {
  // titanus: {
  //   idle:      { fps: 2.2, frames: ["idleSettle", "idleBreathe"] },
  //   light:     { fps: 12,  frames: ["coil", "strike", "recover"] },
  //   sideHeavy: { t: [0, 0.42, 0.5, 0.9],
  //                frames: ["windUp", "windHold", "slam", "settle"] },
  // },
};
