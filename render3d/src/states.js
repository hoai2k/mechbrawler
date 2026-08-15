// The 26 animation states, as data — the billboard side of the contract that
// SEMANTIC_ANIMS (src/characters.js) states in sprite terms.
//
// One entry per state a clip can be asked to play. `duration` and `beat` are
// the timing contract from billboards/docs/asset-requests.md: combat is tuned
// so a strike shows the instant its hitbox goes live, and these numbers are
// derived from the sprite animations' fps so a clip and a sprite hit the same
// instants. The engine drives clips by the game's own animTime — nothing here
// stretches a clip to fit.
//
// This file is deliberately dependency-free and DOM-free: the pose player,
// the mannequin's default clip set, the billboard workbench and the intake
// validator (a Node script) all read it, and it is the single place the state
// list lives on this side of the fence. If SEMANTIC_ANIMS gains a state, it is
// added here too — tools/billboard_intake.mjs `check` compares the two.
//
//   loop      the clip repeats; first and last frame must match
//   duration  seconds of clip the engine will play (loop cycle length, or the
//             one-shot's length); "hold" states have a duration too — it is
//             how long the settle takes before the pose freezes
//   beat      seconds in, full extension must be reached (attacks only)
//   tier      who authors it — see the sharing tiers in asset-requests.md:
//             'library'    shared locomotion/defense, retargeted roster-wide
//             'archetype'  the normals, per weapon archetype
//             'identity'   bespoke per fighter

export const STATES = {
  idle:           { loop: true,  duration: 0.909, tier: "library" },
  // The sprint. Like the walk below, NOT built from the sheet: it plays the
  // hand-authored four-phase cycle in run_cycle.js. The four sprite frames are
  // a reach and a pass, mirrored — the strike and the float between them are
  // the phases a four-frame sheet cannot afford and a rig cannot do without.
  run:            { loop: true,  duration: 0.308, tier: "library" },
  // The walk (constants.js RUN_TILT). NOT aliased and NOT built from the
  // sheet: it plays a hand-authored four-phase cycle (walk_cycle.js), because
  // round 21 asks the artists for two contacts and a rig interpolated between
  // two contacts floats instead of walking — the passing position it needs is
  // the one a two-frame sheet cannot afford and 3D gets for nothing.
  walk:           { loop: true,  duration: 1.0,   tier: "library" },
  // Standing on a lip (fighter.js updateTeeter). Aliased to idle: the read is
  // a LEAN, which motion.js supplies procedurally in every backend, so the
  // clip underneath it is just a stand. A bespoke one — weight back, arms out
  // — would be an upgrade, not a dependency.
  teeter:         { loop: true,  duration: 0.9,   tier: "library" },
  dash:           { loop: true,  duration: 0.4,   tier: "library" },
  jump:           { loop: true,  duration: 0.4,   tier: "library" },
  fall:           { loop: true,  duration: 0.4,   tier: "library" },
  land:           { loop: false, duration: 0.15,  tier: "library" },
  hurt:           { loop: true,  duration: 0.5,   tier: "library" },
  crouch:         { loop: true,  duration: 0.667, tier: "library" },
  // One-shot attacks carry a RECOVERY TAIL past the last sprite key: the
  // durations here approximate the move's own delay+dur+recover (moves.js),
  // where they used to stop at the last drawing — which froze the fighter at
  // full extension for the back ~40% of every attack. The tail is a settle
  // key back toward the wind-up (pose_clips.js buildStateClip), so the swing
  // retracts instead of holding. The beat is unchanged; a clip that outlives
  // its action is simply cut by the next state, which the cross-fade smooths.
  crouchAttack:   { loop: false, duration: 0.30,  beat: 0.09,  aim: true,  tier: "archetype" },
  shield:         { loop: true,  duration: 0.6,   tier: "library" },
  ledge:          { loop: true,  duration: 0.8,   tier: "library" },
  dodge:          { loop: true,  duration: 0.4,   tier: "library" },
  dodge_roll:     { loop: true,  duration: 0.4,   tier: "library" },
  dodge_air:      { loop: true,  duration: 0.4,   tier: "library" },
  light:          { loop: false, duration: 0.30,  beat: 0.083, aim: true,  tier: "archetype" },
  airLight:       { loop: false, duration: 0.35,  beat: 0.125, aim: true,  tier: "archetype" },
  sideHeavy:      { loop: false, duration: 0.55,  beat: 0.167, aim: true,  tier: "archetype" },
  upHeavy:        { loop: false, duration: 0.55,  beat: 0.167, aim: true,  tier: "archetype" },
  downHeavy:      { loop: false, duration: 0.55,  beat: 0.167, aim: true,  tier: "archetype" },
  charge:         { loop: true,  duration: 0.5,   tier: "identity" },
  specialNeutral: { loop: false, duration: 0.5,   beat: 0.125, aim: true,  tier: "identity" },
  specialSide:    { loop: false, duration: 0.5,   beat: 0.125, aim: true,  tier: "identity" },
  specialDown:    { loop: false, duration: 0.5,   beat: 0.125, tier: "identity" },
  ult:            { loop: true,  duration: 0.286, tier: "identity" },
  // The two dash attacks (moves.js, variant "dash"). Listed so an animKey the
  // game plays is never an unknown state, and ALIASED below rather than
  // authored: a dash attack is the archetype's own strike thrown out of a run,
  // and the sprite side stands it in the same way until its pose is drawn
  // (round 20D). A dedicated pair of clips is a billboard round when somebody
  // wants one, not a hole in the roster today.
  dashAttack:     { loop: false, duration: 0.30,  beat: 0.083, aim: true,  tier: "archetype" },
  dashAttackHeavy:{ loop: false, duration: 0.55,  beat: 0.167, aim: true,  tier: "archetype" },
  dizzy:          { loop: true,  duration: 1.0,   tier: "library" },
  prone:          { loop: true,  duration: 1.0,   tier: "library" },
  win:            { loop: true,  duration: 1.2,   tier: "identity" },
  // Grab/throw states (?throw=true — src/grab.js). ALIASED for now: each one
  // plays an existing clip via STATE_ALIASES below, so the mechanic works on
  // every rig today with no new clips owed. The entries exist so these are
  // never unknown states; their timing is taken from the clip they alias to
  // (clipTime resolves through clipNameFor). When bespoke grab clips are
  // authored, drop the alias and the state starts playing its own clip.
  grabReach:      { loop: false, duration: 0.2,   beat: 0.08, aim: true, tier: "library" },
  grabHold:       { loop: true,  duration: 0.5,   tier: "library" },
  grabbed:        { loop: true,  duration: 0.5,   tier: "library" },
  throwFwd:       { loop: false, duration: 0.3,   beat: 0.1,  tier: "library" },
  throwBack:      { loop: false, duration: 0.3,   beat: 0.1,  tier: "library" },
  throwUp:        { loop: false, duration: 0.3,   beat: 0.1,  tier: "library" },
  throwDown:      { loop: false, duration: 0.3,   beat: 0.1,  tier: "library" },
};

// States that play ANOTHER state's clip. `dodge` is the legacy alias for
// fighters whose sprite set predates dodge_roll/dodge_air; the grab/throw
// states and both dash attacks borrow the nearest existing clip until bespoke
// ones are authored (the same interim reuse the sprite side does in
// DEFAULT_ANIMS). A rig never delivers an aliased state's own clip, so none of
// them appear in CLIP_STATES.
const STATE_ALIASES = {
  dodge: "dodge_roll",
  teeter: "idle",
  dashAttack: "light",
  dashAttackHeavy: "sideHeavy",
  grabReach: "light",
  grabHold: "charge",
  grabbed: "hurt",
  throwFwd: "sideHeavy",
  throwBack: "sideHeavy",
  throwUp: "upHeavy",
  throwDown: "downHeavy",
};

export const CLIP_STATES = Object.keys(STATES).filter((s) => !STATE_ALIASES[s]);

/** The clip a state plays — itself, unless it is an alias. */
export function clipNameFor(state) {
  return STATE_ALIASES[state] || state;
}

/** Where the clip playhead sits for a state at animTime, honouring the game
 *  clock: loops wrap, one-shots clamp just short of the end so the final pose
 *  holds instead of snapping back to frame zero. */
export function clipTime(state, animTime) {
  const s = STATES[clipNameFor(state)] || STATES.idle;
  if (s.loop) return ((animTime % s.duration) + s.duration) % s.duration;
  return Math.min(Math.max(animTime, 0), s.duration - 1e-4);
}

/** Run-style states report a 4-beat cycle to motion.js (a full stride), which
 *  halves the procedural bob the same way the 4-frame sprite run does. */
export function cycleInfo(state, animTime) {
  const s = STATES[clipNameFor(state)] || STATES.idle;
  const t = animTime / s.duration;
  return { phase: t - Math.floor(t), frames: state === "run" ? 4 : 2 };
}

// ------------------------------------------------------------------- aiming
//
// Attack states flagged `aim: true` accept a TARGET: the strike pitches up or
// down toward a world point — an opponent above on a platform, a crouching
// one below. The game supplies the point (render.js passes `opts.aim`), from
// the controller when the fighter carries an explicit `aimPoint`, otherwise
// automatically at the nearest opponent; the workbench draws it as a
// draggable crosshair. Clips are authored AIM-NEUTRAL — a straight, level
// strike — and the engine adds the pitch at pose time, which is why a clip
// that bakes its own up-or-down angle fights the system.
//
// Pitch is clamped and QUANTISED: it joins the pose-cache key, and a 6° step
// keeps the cache dense while reading as continuous aim at game size.

export const AIM_MAX_DEG = 50;
export const AIM_STEP_DEG = 6;

// Reach quantisation, in game pixels. Coarser than the pitch step because it
// multiplies with it in the pose-cache key: every (pitch, dx, dy) triple is a
// distinct rendered pose, so fine buckets here trade a smooth aim for a cache
// that thrashes mid-flurry. 24 px is well under a fighter's body width, so the
// stepping is invisible at the size these are drawn.
export const AIM_REACH_STEP = 24;
const REACH_X = [-120, 460];
const REACH_Y = [-320, 340];

export function aimable(state) {
  return !!STATES[clipNameFor(state)]?.aim;
}

/**
 * The elevations, in degrees above level, that each attack is allowed to be
 * thrown at. The aim SNAPS to the nearest one.
 *
 * A fighting game does not have a continuously-aimable punch; it has an up
 * attack, a side attack and a down attack, and choosing between them IS the
 * aiming. Letting the solver point a limb anywhere on a 100° arc produced the
 * thing that looked most wrong on the first delivered fighter: a standing jab
 * angled down at the floor, because the opponent happened to be a little
 * lower. A grounded arm strike is level. Down-diagonal belongs to the moves
 * that are *about* going low — the crouch poke, the overhead that finishes
 * downward — and to anything thrown in the air, where the whole point is
 * hitting what is beneath you.
 *
 * A state absent here keeps the free continuous aim, clamped to AIM_MAX_DEG.
 */
export const AIM_ELEVATIONS = {
  light:          [0],
  sideHeavy:      [0],
  specialNeutral: [0],
  upHeavy:        [55],
  downHeavy:      [-25],
  crouchAttack:   [-30],
  specialSide:    [-15],
  airLight:       [-45, 0],
};

function nearestElevation(list, deg) {
  let best = list[0];
  for (const e of list) if (Math.abs(e - deg) < Math.abs(best - deg)) best = e;
  return best;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const bucket = (v, lo, hi) =>
  Math.round(clamp(v, lo, hi) / AIM_REACH_STEP) * AIM_REACH_STEP;

/** World target -> quantised pitch in radians, from the fighter's chest at
 *  (x, chestY) toward (aim.x, aim.y). Screen y grows downward, so a target
 *  above gives a positive (upward) pitch. `facing` keeps the pitch meaningful
 *  when the target is behind: distance is measured along the facing. */
export function aimPitch(x, chestY, aim, facing = 1) {
  if (!aim) return 0;
  const dx = Math.max(40, (aim.x - x) * (facing < 0 ? -1 : 1));
  const up = chestY - aim.y;
  const deg = (Math.atan2(up, dx) * 180) / Math.PI;
  const clamped = clamp(deg, -AIM_MAX_DEG, AIM_MAX_DEG);
  return (Math.round(clamped / AIM_STEP_DEG) * AIM_STEP_DEG * Math.PI) / 180;
}

/** The full aim solution: the spine's pitch, plus WHERE the strike has to
 *  reach — offsets in game pixels from the fighter's own origin, measured
 *  along their facing and upward from their feet.
 *
 *  Pitch alone leans the body at an angle; the offsets are what let the IK put
 *  the hand on the target (ik.js). Both are quantised, because both are part
 *  of the pose-cache key: an unquantised target would make every frame of
 *  every approach a unique pose and defeat the cache entirely.
 *
 *  Returns null with no target, which is the "just play the clip" path. */
export function aimSolve(x, footY, chestY, aim, facing = 1, state = null, reachPx = 0) {
  const name = state ? clipNameFor(state) : null;
  const elevs = name ? AIM_ELEVATIONS[name] : null;
  if (!aim && !elevs) return null;
  const sign = facing < 0 ? -1 : 1;
  const reach = reachPx > 0 ? reachPx : 96;

  let deg = 0;
  if (aim) {
    const fwd = Math.max(40, (aim.x - x) * sign);
    deg = (Math.atan2(chestY - aim.y, fwd) * 180) / Math.PI;
  }
  deg = elevs ? nearestElevation(elevs, deg) : clamp(deg, -AIM_MAX_DEG, AIM_MAX_DEG);
  const rad = (deg * Math.PI) / 180;

  // The target is built from the STRIKE, not from the opponent's position: out
  // along the facing at this fighter's own reach, at the elevation the move is
  // allowed. With no aim at all that is dead ahead at chest height, which is
  // where a punch goes.
  const chestUp = footY - chestY;
  return {
    pitch: (Math.round(deg / AIM_STEP_DEG) * AIM_STEP_DEG * Math.PI) / 180,
    dx: bucket(Math.cos(rad) * reach, REACH_X[0], REACH_X[1]),
    dy: bucket(chestUp + Math.sin(rad) * reach, REACH_Y[0], REACH_Y[1]),
  };
}

/** The cache-key fragment for an aim solution. */
export function aimKey(solution) {
  if (!solution) return "";
  const deg = Math.round((solution.pitch * 180) / Math.PI);
  return `~a${deg}x${solution.dx}y${solution.dy}`;
}
