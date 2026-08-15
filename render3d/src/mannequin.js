// The mannequin: a code-built figure on the standard skeleton, plus a
// programmatic clip for every animation state.
//
// It exists twice over:
//
//   * It is phase B0's proof body — the fighter that lets the whole pipeline
//     (pose, render, cache, blit, smoke tests) be built and verified before a
//     single model is commissioned. `?render=billboard&mannequin=all` puts it
//     on every fighter.
//
//   * Its clip set is THE DEFAULT POSE SET. Clip resolution (rig.js) falls
//     back to these clips for any state a character's rig does not cover and
//     no inheritance answers — so a delivered model with only its identity
//     clips is playable on day one, wearing the default poses everywhere else.
//     The clips animate standard bone names and nothing else, which is what
//     makes them land on any rig that honours the delivery spec.
//
// The figure is rigid-limbed on purpose: plain boxes parented to bones, no
// skinning. A wooden mannequin reads as a placeholder at a glance — nobody
// mistakes it for a delivered fighter — and it needs no weights to author.
// Delivered rigs are skinned meshes; the renderer draws either without caring.
//
// THREE is passed in rather than imported so this module stays inert until the
// billboard backend actually loads the vendored engine (see VENDOR.md: the 3D
// engine must never load for players who never pick the backend).

import { STATES, CLIP_STATES } from "./states.js";
import { attachPlaceholders } from "./props.js";
import { buildClipFromKeys, mirrorPose } from "./clips.js";

/** The mannequin's real-world height. Matches HEIGHT_UNKNOWN_RATIO's working
 *  height in spirit: an unremarkable figure the height chain treats neutrally. */
export const MANNEQUIN_HEIGHT_M = 1.75;

/** Painted one flat colour so smoke tests can find it in a frame by hue. */
export const MANNEQUIN_COLOR = 0x8fa0bd;

// FACING AND HANDEDNESS, PAINTED ON.
//
// The mannequin's other job is to be the PROOF BODY: drawn in a delivered
// fighter's place, driven by that fighter's own clip, so a pose that reads
// wrong can be blamed on the pose or on the model's binding rather than on
// both at once. A uniform grey figure cannot do that job. Which way is it
// facing? Which arm is the left one? Those are exactly the questions being
// asked, and a body that cannot answer them turns the comparison into two
// unknowns.
//
// So: the FACE is marked — a nose and two eyes on the head's +Z, which the
// delivery spec says is forward — and the two sides are different colours —
// warm on the character's LEFT, cool on their RIGHT. A rig whose arms are
// swapped, whose skeleton faces the other way, or whose mesh disagrees with
// its own bones says so at a glance instead of after a minute of squinting.
export const MANNEQUIN_LEFT = 0xd8a06a;   // warm: the character's left
export const MANNEQUIN_RIGHT = 0x6f9cd8;  // cool: the character's right
export const MANNEQUIN_FRONT = 0xd8d06a;  // the nose and the thumb nubs

const DEG = Math.PI / 180;

// ---------------------------------------------------------------- skeleton
//
// Standard naming (the delivery spec's Mixamo-style list), positions in
// metres for a 1.75 m figure, bind pose = T-pose, facing +Z. Legs point down,
// arms point out along ±X; every offset below is relative to the parent bone.

const H = MANNEQUIN_HEIGHT_M;
const BONES = {
  Hips:          { parent: null,            pos: [0, 0.530 * H, 0] },
  Spine:         { parent: "Hips",          pos: [0, 0.050 * H, 0] },
  Spine1:        { parent: "Spine",         pos: [0, 0.070 * H, 0] },
  Spine2:        { parent: "Spine1",        pos: [0, 0.070 * H, 0] },
  Neck:          { parent: "Spine2",        pos: [0, 0.110 * H, 0] },
  Head:          { parent: "Neck",          pos: [0, 0.030 * H, 0] },
  LeftShoulder:  { parent: "Spine2",        pos: [0.060 * H, 0.080 * H, 0] },
  LeftArm:       { parent: "LeftShoulder",  pos: [0.040 * H, 0, 0] },
  LeftForeArm:   { parent: "LeftArm",       pos: [0.160 * H, 0, 0] },
  LeftHand:      { parent: "LeftForeArm",   pos: [0.140 * H, 0, 0] },
  RightShoulder: { parent: "Spine2",        pos: [-0.060 * H, 0.080 * H, 0] },
  RightArm:      { parent: "RightShoulder", pos: [-0.040 * H, 0, 0] },
  RightForeArm:  { parent: "RightArm",      pos: [-0.160 * H, 0, 0] },
  RightHand:     { parent: "RightForeArm",  pos: [-0.140 * H, 0, 0] },
  LeftUpLeg:     { parent: "Hips",          pos: [0.055 * H, -0.010 * H, 0] },
  LeftLeg:       { parent: "LeftUpLeg",     pos: [0, -0.240 * H, 0] },
  LeftFoot:      { parent: "LeftLeg",       pos: [0, -0.230 * H, 0] },
  RightUpLeg:    { parent: "Hips",          pos: [-0.055 * H, -0.010 * H, 0] },
  RightLeg:      { parent: "RightUpLeg",    pos: [0, -0.240 * H, 0] },
  RightFoot:     { parent: "RightLeg",      pos: [0, -0.230 * H, 0] },
};

// ------------------------------------------------------------ default poses
//
// A pose is {BoneName: [rx, ry, rz] degrees}; a clip is timed keyframes of
// poses. Rotations are relative to the T-pose bind, so REST is what brings
// the arms down to a neutral stand — every pose below builds on it.
//
// These are stand-ins, not choreography: each aims for the same READ as its
// reference sprite (see the clip table in docs/asset-requests.md) so a
// default-posed fighter's states are tellable apart at game size. What they
// must still honour is the engine contract — no baked bob, squash or spin,
// full extension at the beat.

const REST = {
  LeftArm: [0, 0, -65], RightArm: [0, 0, 65],
  LeftForeArm: [0, 0, -12], RightForeArm: [0, 0, 12],
};
const p = (extra) => ({ ...REST, ...extra });

// Punch/reach poses point an arm along +Z (the facing): shoulder swung
// forward about Y, on top of the REST drop being removed.
const POSES = {
  // ------------------------------------------------------------- idle
  // Three extremes rather than two: a body at rest shifts its weight, and a
  // two-key sway reads as a metronome. The engine adds breath on top of this
  // (pose.js applyBreath), so the clip only owns the weight.
  idle_a: p({ Spine: [1, 0, 0], Spine2: [2, 0, 0], Head: [1, 0, 0],
              LeftUpLeg: [0, 0, 1], RightUpLeg: [0, 0, -1] }),
  idle_b: p({ Spine: [2, 0, 2], Spine2: [4, 0, -1], Head: [-2, 0, -1],
              LeftArm: [0, 0, -63], RightArm: [0, 0, 67] }),
  idle_c: p({ Spine: [1, 0, -2], Spine2: [3, 0, 1], Head: [0, 0, 1],
              LeftArm: [0, 0, -67], RightArm: [0, 0, 63] }),

  // ------------------------------------------------------------- run
  // A real run cycle in four positions per stride — contact, down, passing,
  // up — instead of the two the old table had. The difference is not detail
  // for its own sake: CONTACT is where the foot lands and the body is lowest
  // and widest, UP is where it is highest and narrowest, and a cycle without
  // them has no weight in it at all. Vertical travel stays out of the clip
  // (motion.js owns the bob, and doubling it is the delivery rule everyone
  // breaks once); the read comes from the legs and the counter-swinging arms.
  // A WALK, so the stand-in does not answer a walk with an idle wobble. The
  // delivered rigs play the authored cycle in walk_cycle.js; this is the same
  // four phases on the mannequin's own skeleton, which bends elbows about z
  // rather than x and so cannot share that table. Half the cycle, mirrored
  // below like the run's.
  //
  // Against the run directly above: the torso is upright (2° against 15), the
  // stride is half as long, the knees stay far straighter, and one foot is
  // always on the floor.
  walk_contact_l: p({
    Spine: [2, -3, 0], Head: [-1, 3, 0],
    LeftUpLeg: [-20, 0, 0], LeftLeg: [4, 0, 0], LeftFoot: [-10, 0, 0],
    RightUpLeg: [16, 0, 0], RightLeg: [10, 0, 0], RightFoot: [12, 0, 0],
    LeftArm: [12, 0, -72], LeftForeArm: [0, 0, -16],
    RightArm: [-14, 0, 72], RightForeArm: [0, 0, 18],
  }),
  walk_down_l: p({
    Spine: [3, -2, 0], Head: [-1, 2, 0],
    LeftUpLeg: [-10, 0, 0], LeftLeg: [16, 0, 0], LeftFoot: [-2, 0, 0],
    RightUpLeg: [10, 0, 0], RightLeg: [30, 0, 0], RightFoot: [4, 0, 0],
    LeftArm: [8, 0, -72], LeftForeArm: [0, 0, -14],
    RightArm: [-10, 0, 72], RightForeArm: [0, 0, 16],
  }),
  walk_pass_l: p({
    Spine: [2, 0, 0], Head: [-1, 0, 0],
    LeftUpLeg: [0, 0, 0], LeftLeg: [2, 0, 0], LeftFoot: [0, 0, 0],
    RightUpLeg: [-4, 0, 0], RightLeg: [42, 0, 0], RightFoot: [-8, 0, 0],
    LeftArm: [0, 0, -72], LeftForeArm: [0, 0, -12],
    RightArm: [0, 0, 72], RightForeArm: [0, 0, 14],
  }),
  walk_up_l: p({
    Spine: [2, 2, 0], Head: [-1, -2, 0],
    LeftUpLeg: [12, 0, 0], LeftLeg: [6, 0, 0], LeftFoot: [10, 0, 0],
    RightUpLeg: [-16, 0, 0], RightLeg: [24, 0, 0], RightFoot: [-6, 0, 0],
    LeftArm: [-8, 0, -72], LeftForeArm: [0, 0, -12],
    RightArm: [10, 0, 72], RightForeArm: [0, 0, 16],
  }),
  run_contact_l: p({
    Spine: [15, -6, 0], Head: [-6, 6, 0],
    LeftUpLeg: [-32, 0, 0], LeftLeg: [10, 0, 0], LeftFoot: [-10, 0, 0],
    RightUpLeg: [26, 0, 0], RightLeg: [48, 0, 0], RightFoot: [12, 0, 0],
    LeftArm: [26, 0, -58], LeftForeArm: [0, 0, -72],
    RightArm: [-34, 0, 58], RightForeArm: [0, 0, 62],
  }),
  run_down_l: p({
    Spine: [17, -4, 0], Head: [-7, 4, 0],
    LeftUpLeg: [-16, 0, 0], LeftLeg: [26, 0, 0], LeftFoot: [-6, 0, 0],
    RightUpLeg: [22, 0, 0], RightLeg: [66, 0, 0], RightFoot: [6, 0, 0],
    LeftArm: [14, 0, -60], LeftForeArm: [0, 0, -74],
    RightArm: [-20, 0, 60], RightForeArm: [0, 0, 66],
  }),
  run_pass_l: p({
    Spine: [15, 0, 0], Head: [-6, 0, 0],
    LeftUpLeg: [4, 0, 0], LeftLeg: [30, 0, 0], LeftFoot: [0, 0, 0],
    RightUpLeg: [-4, 0, 0], RightLeg: [88, 0, 0], RightFoot: [-16, 0, 0],
    LeftArm: [0, 0, -62], LeftForeArm: [0, 0, -76],
    RightArm: [0, 0, 62], RightForeArm: [0, 0, 70],
  }),
  run_up_l: p({
    Spine: [14, 3, 0], Head: [-5, -3, 0],
    LeftUpLeg: [22, 0, 0], LeftLeg: [22, 0, 0], LeftFoot: [8, 0, 0],
    RightUpLeg: [-26, 0, 0], RightLeg: [74, 0, 0], RightFoot: [-20, 0, 0],
    LeftArm: [-18, 0, -60], LeftForeArm: [0, 0, -74],
    RightArm: [16, 0, 60], RightForeArm: [0, 0, 68],
  }),

  // ------------------------------------------------------------- dash
  // Held states still need two extremes, or they are a still image. The dash
  // is a lean with the body drifting forward against the wind.
  dash_a: p({ Spine: [22, -4, 0], Head: [-12, 0, 0],
              LeftArm: [38, 0, -52], LeftForeArm: [0, 0, -60],
              RightArm: [44, 0, 52], RightForeArm: [0, 0, 56],
              LeftUpLeg: [-14, 0, 0], LeftLeg: [16, 0, 0],
              RightUpLeg: [10, 0, 0], RightLeg: [22, 0, 0] }),
  dash_b: p({ Spine: [26, 4, 0], Head: [-14, 0, 0],
              LeftArm: [46, 0, -54], LeftForeArm: [0, 0, -64],
              RightArm: [36, 0, 54], RightForeArm: [0, 0, 52],
              LeftUpLeg: [8, 0, 0], LeftLeg: [24, 0, 0],
              RightUpLeg: [-12, 0, 0], RightLeg: [18, 0, 0] }),

  // ------------------------------------------------------- jump / fall / land
  // The jump's own arc, per the sprite `jump_rise` read (pose brief: "pushing
  // up off the ground, legs still extending, arms rising, body stretched
  // upward"): the launch leaves the legs trailing and the arms up from the
  // swing, then one knee drives up while the body STAYS stretched — the old
  // tight tuck at the apex read as the dodge ball, which is a different move.
  // Falling gathers the legs under the body with the arms out for balance;
  // landing absorbs with a hand toward the floor.
  jump_launch: p({ Spine: [-6, 0, 0], Head: [-8, 0, 0],
                   LeftUpLeg: [-18, 0, 0], LeftLeg: [26, 0, 0], LeftFoot: [16, 0, 0],
                   RightUpLeg: [-8, 0, 0], RightLeg: [14, 0, 0], RightFoot: [14, 0, 0],
                   LeftArm: [-30, 0, -34], RightArm: [-30, 0, 34] }),
  jump_peak: p({ Spine: [-2, 0, 0], Head: [-6, 0, 0],
                 LeftUpLeg: [-56, 0, 0], LeftLeg: [68, 0, 0], LeftFoot: [10, 0, 0],
                 RightUpLeg: [-12, 0, 0], RightLeg: [28, 0, 0], RightFoot: [18, 0, 0],
                 LeftArm: [-24, 0, -36], LeftForeArm: [0, 0, -42],
                 RightArm: [-24, 0, 36], RightForeArm: [0, 0, 42] }),
  // Sprite `fall` read: legs gathered under the body (both knees bent, feet
  // beneath), arms out low for balance, head up watching the landing.
  fall_a: p({ Spine: [-8, 0, 0], Head: [-8, 0, 0],
              LeftArm: [-34, 0, -28], LeftForeArm: [0, 0, -24],
              RightArm: [-34, 0, 28], RightForeArm: [0, 0, 24],
              LeftUpLeg: [-18, 0, 0], LeftLeg: [36, 0, 0], LeftFoot: [10, 0, 0],
              RightUpLeg: [-6, 0, 0], RightLeg: [26, 0, 0], RightFoot: [8, 0, 0] }),
  fall_b: p({ Spine: [-6, 0, 0], Head: [-6, 0, 0],
              LeftArm: [-28, 0, -32], LeftForeArm: [0, 0, -20],
              RightArm: [-40, 0, 24], RightForeArm: [0, 0, 28],
              LeftUpLeg: [-12, 0, 0], LeftLeg: [30, 0, 0], LeftFoot: [8, 0, 0],
              RightUpLeg: [-10, 0, 0], RightLeg: [30, 0, 0], RightFoot: [10, 0, 0] }),
  // Sprite `land` read across the roster: a deep asymmetric absorb with one
  // hand dropped toward the floor and the other back for balance — not the
  // symmetric squat this used to be, which read as a second crouch.
  land_deep: p({ Spine: [30, 0, 0], Head: [8, 0, 0],
                 LeftUpLeg: [-58, 0, 0], LeftLeg: [72, 0, 0], LeftFoot: [-16, 0, 0],
                 RightUpLeg: [-62, 0, 0], RightLeg: [76, 0, 0], RightFoot: [-16, 0, 0],
                 LeftArm: [24, 0, -42], LeftForeArm: [0, 0, -36],
                 RightArm: [-42, 0, 62], RightForeArm: [0, 0, 12] }),
  land_rise: p({ Spine: [8, 0, 0], Head: [0, 0, 0],
                 LeftUpLeg: [-16, 0, 0], LeftLeg: [22, 0, 0],
                 RightUpLeg: [-16, 0, 0], RightLeg: [22, 0, 0],
                 LeftArm: [8, 0, -52], RightArm: [8, 0, 52] }),

  // ------------------------------------------------------------- reactions
  // Sprite `hurt` read: head snapped back, body arched, arms THROWN OUT —
  // nearer horizontal than the guarded half-drop this had.
  hurt_impact: p({ Spine: [-24, 0, 0], Head: [-20, 0, 0],
                   LeftArm: [-32, 0, -26], LeftForeArm: [0, 0, -34],
                   RightArm: [-32, 0, 26], RightForeArm: [0, 0, 34],
                   LeftUpLeg: [14, 0, 0], RightUpLeg: [6, 0, 0] }),
  hurt_settle: p({ Spine: [-12, 0, 0], Head: [-10, 0, 0],
                   LeftArm: [-18, 0, -52], LeftForeArm: [0, 0, -30],
                   RightArm: [-18, 0, 52], RightForeArm: [0, 0, 30],
                   LeftUpLeg: [8, 0, 0], RightUpLeg: [2, 0, 0] }),

  // ------------------------------------------------------------- crouch
  // The sprite crouch is a REAL squat (pose brief §3: hips at heel height,
  // thighs closer to horizontal than vertical, head down a quarter of standing
  // height) — the roster draws it that deep and the old half-bend read as a
  // fighting stance. Thighs near horizontal, shins near vertical; the matching
  // hip drop is in HIP_DROP.
  crouch: p({
    Spine: [32, 0, 0], Head: [-12, 0, 0],
    LeftUpLeg: [-88, 0, 0], LeftLeg: [96, 0, 0], LeftFoot: [-8, 0, 0],
    RightUpLeg: [-88, 0, 0], RightLeg: [96, 0, 0], RightFoot: [-8, 0, 0],
    LeftArm: [20, 0, -48], LeftForeArm: [0, 0, -62],
    RightArm: [20, 0, 48], RightForeArm: [0, 0, 62],
  }),
  crouch_b: p({
    Spine: [35, 0, 0], Head: [-14, 0, 0],
    LeftUpLeg: [-88, 0, 0], LeftLeg: [96, 0, 0], LeftFoot: [-8, 0, 0],
    RightUpLeg: [-88, 0, 0], RightLeg: [96, 0, 0], RightFoot: [-8, 0, 0],
    LeftArm: [24, 0, -46], LeftForeArm: [0, 0, -66],
    RightArm: [24, 0, 46], RightForeArm: [0, 0, 66],
  }),
  crouch_punch: null, // filled below off `crouch`

  shield: p({ LeftArm: [55, 30, -30], LeftForeArm: [0, 0, -95],
              RightArm: [55, -30, 30], RightForeArm: [0, 0, 95], Spine: [6, 0, 0] }),
  shield_b: p({ LeftArm: [58, 30, -28], LeftForeArm: [0, 0, -98],
                RightArm: [58, -30, 28], RightForeArm: [0, 0, 98], Spine: [8, 0, 0],
                Head: [4, 0, 0] }),
  // Sprite `ledge_hang` read (pose brief): BOTH hands raised overhead on the
  // grip, body straight below, feet dangling — the old one-arm-high hang read
  // as a wave. Toes pointed, knees just off straight: dangling, not standing.
  ledge: { LeftArm: [0, 0, 84], LeftForeArm: [0, 0, 6],
           RightArm: [0, 0, -78], RightForeArm: [0, 0, -8],
           Spine: [-4, 0, 0], Head: [-8, 0, 0],
           LeftUpLeg: [4, 0, 0], LeftLeg: [10, 0, 0], LeftFoot: [16, 0, 0],
           RightUpLeg: [8, 0, 0], RightLeg: [14, 0, 0], RightFoot: [18, 0, 0] },
  ledge_b: { LeftArm: [0, 0, 82], LeftForeArm: [0, 0, 9],
             RightArm: [0, 0, -80], RightForeArm: [0, 0, -5],
             Spine: [-2, 0, 0], Head: [-6, 0, 0],
             LeftUpLeg: [8, 0, 0], LeftLeg: [14, 0, 0], LeftFoot: [18, 0, 0],
             RightUpLeg: [4, 0, 0], RightLeg: [10, 0, 0], RightFoot: [16, 0, 0] },
  tuck: p({
    Spine: [40, 0, 0], Head: [20, 0, 0],
    LeftUpLeg: [-95, 0, 0], LeftLeg: [110, 0, 0],
    RightUpLeg: [-95, 0, 0], RightLeg: [110, 0, 0],
    LeftArm: [50, 0, -30], LeftForeArm: [0, 0, -100],
    RightArm: [50, 0, 30], RightForeArm: [0, 0, 100],
  }),
  tuck_tight: p({
    Spine: [48, 0, 0], Head: [26, 0, 0],
    LeftUpLeg: [-108, 0, 0], LeftLeg: [124, 0, 0],
    RightUpLeg: [-108, 0, 0], RightLeg: [124, 0, 0],
    LeftArm: [58, 0, -24], LeftForeArm: [0, 0, -112],
    RightArm: [58, 0, 24], RightForeArm: [0, 0, 112],
  }),
  // The air dodge, per the sprite read: a TWIST out of the line of the blow —
  // body turned, knees drawn up to one side, limbs pulled in. It shared the
  // roll's ball before, and the two states were indistinguishable at game
  // size when only one of them spins (motion.js owns the roll spin).
  air_twist_a: p({
    Spine: [16, 34, 6], Head: [-6, -18, 0],
    LeftUpLeg: [-64, 0, -8], LeftLeg: [76, 0, 0], LeftFoot: [-8, 0, 0],
    RightUpLeg: [-40, 0, 8], RightLeg: [56, 0, 0], RightFoot: [-4, 0, 0],
    LeftArm: [32, 0, -34], LeftForeArm: [0, 0, -86],
    RightArm: [32, 0, 34], RightForeArm: [0, 0, 86],
  }),
  air_twist_b: p({
    Spine: [20, 48, 8], Head: [-8, -24, 0],
    LeftUpLeg: [-72, 0, -8], LeftLeg: [84, 0, 0], LeftFoot: [-8, 0, 0],
    RightUpLeg: [-50, 0, 8], RightLeg: [64, 0, 0], RightFoot: [-4, 0, 0],
    LeftArm: [38, 0, -30], LeftForeArm: [0, 0, -92],
    RightArm: [38, 0, 30], RightForeArm: [0, 0, 92],
  }),

  // ------------------------------------------------------------- strikes
  //
  // Every attack is now four extremes, not two: ANTICIPATION (a small move
  // AGAINST the strike, which is what makes the strike itself read fast),
  // WIND-UP, CONTACT at the beat, and a SETTLE that recovers toward guard.
  // The beat pose is unchanged in kind — full extension, aim-neutral, level —
  // because the hitbox goes live on it.
  guard: p({ Spine: [4, -6, 0], LeftArm: [16, 0, -50], LeftForeArm: [0, 0, -66],
             RightArm: [14, 0, 50], RightForeArm: [0, 0, 62] }),
  anticip_r: p({ Spine: [2, -14, 0], Head: [0, -6, 0],
                 RightArm: [-16, 8, 58], RightForeArm: [0, 0, 46],
                 LeftArm: [12, 0, -52], LeftForeArm: [0, 0, -60] }),
  windup: p({ Spine: [0, -20, 0], Head: [0, -8, 0],
              RightArm: [-40, 0, 55], RightForeArm: [0, 0, 70],
              LeftArm: [16, 0, -50], LeftForeArm: [0, 0, -64] }),
  punch: p({ Spine: [0, 22, 0], Head: [0, 8, 0],
             RightArm: [0, -78, 8], RightForeArm: [0, 0, 4],
             LeftArm: [0, 10, -55], LeftForeArm: [0, 0, -70] }),
  punch_settle: p({ Spine: [2, 12, 0], Head: [0, 4, 0],
                    RightArm: [0, -58, 20], RightForeArm: [0, 0, 26],
                    LeftArm: [8, 4, -52], LeftForeArm: [0, 0, -66] }),

  kick_antic: p({ LeftUpLeg: [12, 0, 0], LeftLeg: [30, 0, 0], Spine: [6, 0, 0],
                  LeftArm: [0, 0, -40], RightArm: [0, 0, 50] }),
  kick: p({ LeftUpLeg: [-75, 0, 0], LeftLeg: [15, 0, 0], LeftFoot: [-14, 0, 0],
            Spine: [-10, 0, 0], Head: [6, 0, 0],
            LeftArm: [0, 0, -35], RightArm: [-10, 0, 45] }),
  kick_settle: p({ LeftUpLeg: [-42, 0, 0], LeftLeg: [40, 0, 0],
                   Spine: [-4, 0, 0], LeftArm: [0, 0, -42], RightArm: [0, 0, 48] }),

  swing_antic: p({ Spine: [4, -12, 0], LeftArm: [-40, 0, -34], RightArm: [-40, 0, 34],
                   LeftForeArm: [0, 0, -30], RightForeArm: [0, 0, 30] }),
  swing_up: p({ Spine: [-10, -25, 0], Head: [-10, -6, 0],
                LeftArm: [-140, 0, -20], RightArm: [-140, 0, 20],
                LeftForeArm: [0, 0, -15], RightForeArm: [0, 0, 15] }),
  swing_down: p({ Spine: [32, 15, 0], Head: [14, 4, 0],
                  LeftArm: [45, 0, -30], RightArm: [45, 0, 30] }),
  swing_settle: p({ Spine: [18, 8, 0], LeftArm: [30, 0, -38], RightArm: [30, 0, 38],
                    LeftForeArm: [0, 0, -22], RightForeArm: [0, 0, 22] }),

  reach_antic: p({ RightArm: [-20, 0, 40], RightForeArm: [0, 0, 60], Spine: [8, 0, 0] }),
  reach_up: p({ RightArm: [0, 0, 165], RightForeArm: [0, 0, 5], Spine: [-6, 0, 0],
                Head: [-12, 0, 0], LeftArm: [0, 0, -30] }),
  reach_settle: p({ RightArm: [0, 0, 130], RightForeArm: [0, 0, 22], Spine: [-2, 0, 0],
                    Head: [-6, 0, 0], LeftArm: [0, 0, -40] }),

  charge_a: p({ Spine: [12, 0, 0], LeftArm: [20, 0, -50], LeftForeArm: [0, 0, -85],
                RightArm: [20, 0, 50], RightForeArm: [0, 0, 85],
                LeftUpLeg: [-18, 0, 0], LeftLeg: [22, 0, 0], RightUpLeg: [-18, 0, 0], RightLeg: [22, 0, 0] }),
  charge_b: p({ Spine: [18, 0, 0], Head: [6, 0, 0],
                LeftArm: [26, 0, -44], LeftForeArm: [0, 0, -95],
                RightArm: [26, 0, 44], RightForeArm: [0, 0, 95],
                LeftUpLeg: [-28, 0, 0], LeftLeg: [34, 0, 0], RightUpLeg: [-28, 0, 0], RightLeg: [34, 0, 0] }),
  palm: p({ Spine: [0, 18, 0], Head: [0, 8, 0],
            RightArm: [0, -70, 0], RightForeArm: [0, -10, 0],
            LeftArm: [10, 0, -46], LeftForeArm: [0, 0, -70] }),
  palm_settle: p({ Spine: [0, 10, 0], RightArm: [0, -52, 14], RightForeArm: [0, -6, 12],
                   LeftArm: [10, 0, -48], LeftForeArm: [0, 0, -68] }),
  sweep: p({ Spine: [8, 40, 0], Head: [4, 12, 0],
             RightArm: [0, -55, 30], RightForeArm: [0, 0, 16],
             LeftArm: [10, 0, -40],
             LeftUpLeg: [-30, 0, 0], LeftLeg: [40, 0, 0],
             RightUpLeg: [-40, 0, 0], RightLeg: [50, 0, 0] }),
  sweep_settle: p({ Spine: [10, 24, 0], RightArm: [0, -38, 34], LeftArm: [8, 0, -44],
                    LeftUpLeg: [-18, 0, 0], LeftLeg: [26, 0, 0],
                    RightUpLeg: [-24, 0, 0], RightLeg: [32, 0, 0] }),
  ground_touch: p({ Spine: [42, 0, 0], Head: [15, 0, 0],
                    RightArm: [55, 0, 30], RightForeArm: [0, 0, 20],
                    LeftArm: [40, 0, -34], LeftForeArm: [0, 0, -28],
                    LeftUpLeg: [-46, 0, 0], LeftLeg: [58, 0, 0],
                    RightUpLeg: [-46, 0, 0], RightLeg: [58, 0, 0] }),
  arms_wide: p({ LeftArm: [0, 0, 12], RightArm: [0, -0, -12], Spine: [-10, 0, 0],
                 Head: [-8, 0, 0], LeftForeArm: [0, 0, -6], RightForeArm: [0, 0, 6] }),
  // Sprite `dizzy` read: a forward SLUMP — guard gone, arms dangling loose,
  // head lolling — not the upright metronome sway this was.
  dizzy_a: p({ Spine: [14, 0, 6], Spine2: [8, 0, -2], Head: [10, 0, 16],
               LeftArm: [-10, 0, -72], LeftForeArm: [0, 0, -6],
               RightArm: [-6, 0, 76], RightForeArm: [0, 0, 4] }),
  dizzy_b: p({ Spine: [12, 0, -6], Spine2: [7, 0, 2], Head: [8, 0, -16],
               LeftArm: [-6, 0, -76], LeftForeArm: [0, 0, -4],
               RightArm: [-10, 0, 72], RightForeArm: [0, 0, 6] }),
  prone: { Hips: [-88, 0, 0], LeftArm: [0, 0, -35], RightArm: [0, 0, 35],
           LeftLeg: [8, 0, 0], RightLeg: [8, 0, 0] },
  prone_b: { Hips: [-88, 0, 0], LeftArm: [-4, 0, -30], RightArm: [-4, 0, 30],
             LeftLeg: [12, 0, 0], RightLeg: [5, 0, 0], Head: [4, 0, 0] },
  win: p({ RightArm: [0, 0, 160], RightForeArm: [0, 0, 10], Head: [-8, 0, 0],
           LeftArm: [0, 0, -40] }),
  win_b: p({ RightArm: [-8, 0, 168], RightForeArm: [0, 0, 4], Head: [-12, 0, 0],
             LeftArm: [0, 0, -34], Spine: [-4, 0, 0] }),
};
POSES.crouch_punch = { ...POSES.crouch, Spine: [26, 20, 0],
  RightArm: [0, -75, 10], RightForeArm: [0, 0, 5] };
POSES.crouch_antic = { ...POSES.crouch, Spine: [30, -12, 0],
  RightArm: [-20, 0, 52], RightForeArm: [0, 0, 46] };
POSES.crouch_settle = { ...POSES.crouch, Spine: [28, 10, 0],
  RightArm: [0, -52, 22], RightForeArm: [0, 0, 20] };

// How far the hips drop, per state, in metres off the bind height. Poses that
// take the whole body down do it here rather than by scaling — squash belongs
// to the engine.
const HIP_BASE = BONES.Hips.pos[1];
// The crouch drop matches its leg fold (thigh ~horizontal, shin ~vertical) so
// the feet land on the ground line rather than floating or spearing it.
const HIP_DROP = { crouch: 0.23 * H, crouchAttack: 0.23 * H, charge: 0.06 * H,
                   dodge_roll: 0.22 * H, dodge_air: 0.14 * H, prone: 0.40 * H,
                   land: 0.20 * H };

/**
 * Which timed extremes each state plays, and HOW it travels between them.
 *
 * `[time, poseName, ease]`; the ease governs the segment leaving that key and
 * is baked by clips.js. Times beyond the state's duration are clamped by the
 * builder. Attack states put full extension exactly at their `beat` and the
 * hitbox goes live there, which is why the strike segments run `in` (wind up
 * against the blow) then `snap` (most of the travel in the first frames) and
 * only then settle.
 *
 * A looping state's last key repeats its first, or the wrap is a jump cut.
 */
function stateKeys(name) {
  const d = STATES[name].duration;
  const beat = STATES[name].beat;
  const q = d / 4, h = d / 2;
  switch (name) {
    case "idle":
      return [[0, "idle_a", "ease"], [d / 3, "idle_b", "ease"], [(2 * d) / 3, "idle_c", "ease"], [d, "idle_a", "ease"]];
    case "run":
      // Contact -> down -> passing -> up, twice, one leg leading each time.
      // `out` off contact (the landing absorbs), `in` into the next contact
      // (the leg drives down): that asymmetry is what a run feels like.
      return [
        [0, "run_contact_l", "out"], [d / 8, "run_down_l", "ease"],
        [d / 4, "run_pass_l", "ease"], [(3 * d) / 8, "run_up_l", "in"],
        [h, "run_contact_r", "out"], [(5 * d) / 8, "run_down_r", "ease"],
        [(3 * d) / 4, "run_pass_r", "ease"], [(7 * d) / 8, "run_up_r", "in"],
        [d, "run_contact_l", "out"],
      ];
    case "walk":
      // The same four phases as the run, at a walk's accents: only the contacts
      // get a settle, because nothing else in a walk lands hard enough to
      // deserve one.
      return [
        [0, "walk_contact_l", "out"], [d / 8, "walk_down_l", "ease"],
        [d / 4, "walk_pass_l", "ease"], [(3 * d) / 8, "walk_up_l", "ease"],
        [h, "walk_contact_r", "out"], [(5 * d) / 8, "walk_down_r", "ease"],
        [(3 * d) / 4, "walk_pass_r", "ease"], [(7 * d) / 8, "walk_up_r", "ease"],
        [d, "walk_contact_l", "out"],
      ];
    case "dash":   return [[0, "dash_a", "ease"], [h, "dash_b", "ease"], [d, "dash_a", "ease"]];
    case "jump":   return [[0, "jump_launch", "out"], [h, "jump_peak", "ease"], [d, "jump_launch", "ease"]];
    case "fall":   return [[0, "fall_a", "ease"], [h, "fall_b", "ease"], [d, "fall_a", "ease"]];
    case "land":   return [[0, "land_deep", "out"], [d, "land_rise", "out"]];
    case "hurt":   return [[0, "hurt_impact", "out"], [h, "hurt_settle", "ease"], [d, "hurt_impact", "ease"]];
    case "crouch": return [[0, "crouch", "ease"], [h, "crouch_b", "ease"], [d, "crouch", "ease"]];
    case "crouchAttack":
      return [[0, "crouch_antic", "in"], [beat, "crouch_punch", "out"], [d, "crouch_settle", "out"]];
    case "shield": return [[0, "shield", "ease"], [h, "shield_b", "ease"], [d, "shield", "ease"]];
    case "ledge":  return [[0, "ledge", "ease"], [h, "ledge_b", "ease"], [d, "ledge", "ease"]];
    case "dodge_roll":
      return [[0, "tuck", "ease"], [h, "tuck_tight", "ease"], [d, "tuck", "ease"]];
    case "dodge_air":
      return [[0, "air_twist_a", "ease"], [h, "air_twist_b", "ease"], [d, "air_twist_a", "ease"]];
    case "light":
      return [[0, "anticip_r", "in"], [beat * 0.45, "windup", "snap"],
              [beat, "punch", "out"], [d, "punch_settle", "out"]];
    case "airLight":
      return [[0, "kick_antic", "in"], [beat, "kick", "out"], [d, "kick_settle", "out"]];
    case "sideHeavy":
      return [[0, "swing_antic", "in"], [beat * 0.5, "swing_up", "snap"],
              [beat, "punch", "back"], [d, "punch_settle", "out"]];
    case "upHeavy":
      return [[0, "reach_antic", "in"], [beat * 0.5, "windup", "snap"],
              [beat, "reach_up", "back"], [d, "reach_settle", "out"]];
    case "downHeavy":
      return [[0, "swing_antic", "in"], [beat * 0.5, "swing_up", "snap"],
              [beat, "swing_down", "back"], [d, "swing_settle", "out"]];
    case "charge":
      return [[0, "charge_a", "ease"], [h, "charge_b", "ease"], [d, "charge_a", "ease"]];
    case "specialNeutral":
      return [[0, "anticip_r", "in"], [beat * 0.5, "windup", "snap"],
              [beat, "palm", "out"], [d, "palm_settle", "out"]];
    case "specialSide":
      return [[0, "anticip_r", "in"], [beat * 0.5, "windup", "snap"],
              [beat, "sweep", "out"], [d, "sweep_settle", "out"]];
    case "specialDown":
      return [[0, "guard", "in"], [beat * 0.5, "arms_wide", "snap"],
              [beat, "ground_touch", "out"], [d, "ground_touch", "linear"]];
    case "ult":
      return [[0, "arms_wide", "ease"], [h, "charge_b", "ease"], [d, "arms_wide", "ease"]];
    case "dizzy":
      return [[0, "dizzy_a", "ease"], [h, "dizzy_b", "ease"], [d, "dizzy_a", "ease"]];
    case "prone":
      return [[0, "prone", "ease"], [h, "prone_b", "ease"], [d, "prone", "ease"]];
    case "win":
      return [[0, "win", "ease"], [h, "win_b", "ease"], [d, "win", "ease"]];
    default:
      return [[0, "idle_a", "ease"], [q, "idle_b", "ease"], [d, "idle_a", "ease"]];
  }
}

// The run's right-leading half is the left-leading one reflected across the
// sagittal plane (clips.js mirrorPose) — written once, mirrored here, so
// tuning a contact pose tunes both halves instead of drifting out of step
// with itself. The same transform is what a whole-rig left-right flip uses,
// which is the guarantee these poses stay valid under one.
for (const k of ["contact", "down", "pass", "up"]) {
  POSES[`run_${k}_r`] = mirrorPose(POSES[`run_${k}_l`]);
  POSES[`walk_${k}_r`] = mirrorPose(POSES[`walk_${k}_l`]);
}

// ------------------------------------------------------------------ builders

function buildClip(THREE, name) {
  const d = STATES[name].duration;
  const drop = HIP_DROP[name];
  const keys = stateKeys(name)
    .filter(([t]) => t <= d + 1e-6)
    .map(([t, poseName, ease]) => ({
      t: Math.min(t, d),
      pose: POSES[poseName],
      ease: ease || "linear",
      ...(drop !== undefined ? { hipsY: HIP_BASE - drop } : {}),
    }));
  // The landing rises out of its crouch, which is the one hip move that is
  // not a constant: it is the whole point of the pose.
  if (name === "land") {
    keys[0].hipsY = HIP_BASE - HIP_DROP.land;
    keys[keys.length - 1].hipsY = HIP_BASE;
  }
  return buildClipFromKeys(THREE, name, keys, {
    duration: d, beat: STATES[name].beat, loop: !!STATES[name].loop,
  });
}

/** The default pose set: one clip per state, on standard bone names.
 *  rig.js falls back to these for any state nothing else answers. */
export function buildDefaultClips(THREE) {
  const clips = new Map();
  for (const s of CLIP_STATES) clips.set(s, buildClip(THREE, s));
  return clips;
}

/** The mannequin figure itself: a rigid grey stand-in on the standard
 *  skeleton, ready to play the default clips (or anyone else's).
 *
 *  `charKey` decides the extras: a fighter the roster table gives a weapon or
 *  a physics chain gets the placeholder version (props.js), because a clip
 *  authored against empty hands proves nothing about a two-handed spear. */
// ------------------------------------------------------------- the body
//
// One body-builder for both stand-ins: the mannequin (its own skeleton) and
// the bone proxy (a delivered fighter's skeleton with the mesh hidden). It
// used to be two — the mannequin hung boxes off a limb table, the proxy drew a
// beam down every bone with a cube at every joint — and the proxy in
// particular was unreadable as a figure: floating rectangles for the chest
// and nose, stick limbs with no volume, and a "post" up the middle wherever a
// rig kept a root bone at the origin, because the beam-walker drew EVERY
// bone, structural or not.
//
// This walks only the bones it recognises and dresses each in a human-girth
// volume — capsule limbs, an elliptical chest and pelvis, a skull with a nose
// and two eyes, palms with thumb nubs, wedge feet. The point is that a POSE
// should be readable off it the way it is readable off a person: where the
// face looks, where the palms turn, which way the feet point. Girths are
// average-human fractions of height, so it reads as a body, not a skeleton.
//
// Everything is parented to the BONES, so it poses itself — where the bones
// are is answerable independently of where any delivered mesh ends up.

// [parentBone, childBone, radius as a fraction of height] — a capsule laid
// along the parent->child offset, whatever direction that offset points, so a
// bone that points somewhere unexpected still LOOKS like it does.
const SEGMENTS = [
  ["LeftArm", "LeftForeArm", 0.030],
  ["LeftForeArm", "LeftHand", 0.024],
  ["RightArm", "RightForeArm", 0.030],
  ["RightForeArm", "RightHand", 0.024],
  ["LeftUpLeg", "LeftLeg", 0.046],
  ["LeftLeg", "LeftFoot", 0.036],
  ["RightUpLeg", "RightLeg", 0.046],
  ["RightLeg", "RightFoot", 0.036],
  ["Neck", "Head", 0.026],
];

/** Dress a standard-named skeleton in average-human volumes. Returns the
 *  meshes it added; touches nothing it does not recognise. */
function dressSkeleton(THREE, root, height, register) {
  const mats = {
    mid: new THREE.MeshLambertMaterial({ color: MANNEQUIN_COLOR }),
    Left: new THREE.MeshLambertMaterial({ color: MANNEQUIN_LEFT }),
    Right: new THREE.MeshLambertMaterial({ color: MANNEQUIN_RIGHT }),
    front: new THREE.MeshLambertMaterial({ color: MANNEQUIN_FRONT }),
    dark: new THREE.MeshLambertMaterial({ color: 0x2a2f3a }),
  };
  const matFor = (name) => name.startsWith("Left") ? mats.Left
    : name.startsWith("Right") ? mats.Right : mats.mid;
  // Bones are resolved by NAME BUT NOT BY TRUST. Yuji's delivered rig ships
  // an extra root bone also called "Hips", parked at the floor, with the real
  // hip ("mixamorigHips") inside it — getObjectByName returns the floor one,
  // which is where the old proxy's post up the middle came from and where a
  // pelvis would land. So: exact-name candidates first (a prop bone that
  // merely ENDS in "Head" never beats the real head), and a tie between
  // exact twins is settled by structure — the Hips is whichever candidate has
  // the leg bones as children, and otherwise the deepest candidate wins,
  // because exporters add wrappers OUTSIDE the skeleton, not inside it.
  const boneList = [];
  root.traverse((o) => { if (o.isBone) boneList.push(o); });
  const depthOf = (o) => { let d = 0, p = o.parent; while (p) { d++; p = p.parent; } return d; };
  // What a joint IS, structurally — the tests that outrank a name. An exact
  // name is not proof: yuji's impostor root is the bone named exactly "Hips",
  // and the real hip is the suffix match, so "prefer exact" picked the floor.
  const STRUCTURE = {
    Hips: (b) => b.children.some((c) => c.isBone && /UpLeg$/.test(c.name)),
    Head: (b) => /Neck$/.test(b.parent?.name || ""),
  };
  const bone = (name) => {
    const cands = boneList.filter((b) => b.name === name || b.name.endsWith(name));
    if (!cands.length) return null;
    if (cands.length === 1) return cands[0];
    const test = STRUCTURE[name];
    const score = (b) => (test && test(b) ? 4 : 0) + (b.name === name ? 2 : 0) + depthOf(b) / 100;
    return cands.sort((a, b) => score(b) - score(a))[0];
  };
  const add = (parent, mesh) => { parent.add(mesh); register(mesh); return mesh; };
  const up = new THREE.Vector3(0, 1, 0);
  const H = height;

  // THE BIND FRAME, PER BONE, POSE-INDEPENDENTLY. A delivered rig's bones do
  // not point their local axes anywhere in particular — a foot bone's +Z can
  // be anything the generator liked — and the rig may be mid-pose when this
  // runs, so reading live transforms is wrong twice over. The skinned mesh
  // carries the answer: `skeleton.boneInverses` is the bind pose, frozen at
  // export. From it, world directions ("down", "forward") and positions are
  // translated into each bone's own frame, which is the frame everything
  // below is parented in. The hand-built mannequin has no skin and identity
  // bones, so world axes pass through unchanged — the same code serves both.
  const bindQ = new Map();
  const bindP = new Map();
  {
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    root.traverse((o) => {
      if (!o.isSkinnedMesh || !o.skeleton) return;
      o.skeleton.bones.forEach((b, i) => {
        if (bindQ.has(b)) return;
        m.copy(o.skeleton.boneInverses[i]).invert().decompose(pos, q, sc);
        bindQ.set(b, q.clone());
        bindP.set(b, pos.clone());
      });
    });
  }
  /** A world-space direction, expressed in this bone's own bind frame. Keyed
   *  by the bone OBJECT — names duplicate (see the resolver above). */
  const localDir = (b, x, y, z) => {
    const v = new THREE.Vector3(x, y, z);
    const q = b ? bindQ.get(b) : null;
    return q ? v.applyQuaternion(q.clone().invert()) : v;
  };
  /** Orient a mesh so its local +Y lies along `upDir` and +Z along `fwdDir`. */
  const orient = (mesh, upDir, fwdDir) => {
    const zAxis = fwdDir.clone().normalize();
    const xAxis = upDir.clone().cross(zAxis).normalize();
    const yAxis = zAxis.clone().cross(xAxis).normalize();
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
  };

  // Limbs: a capsule per segment, plus a sphere at the joint so elbows and
  // knees stay round mid-bend instead of showing a gap.
  for (const [parentName, childName, rFrac] of SEGMENTS) {
    const p = bone(parentName);
    const c = bone(childName);
    if (!p || !c) continue;
    const off = c.position;
    const len = off.length();
    if (len < 1e-4) continue;
    const r = rFrac * H;
    const capsule = new THREE.Mesh(
      new THREE.CapsuleGeometry(r, Math.max(len - r, len * 0.4), 4, 12), matFor(childName));
    capsule.position.copy(off).multiplyScalar(0.5);
    capsule.quaternion.setFromUnitVectors(up, off.clone().normalize());
    add(p, capsule);
    add(c, new THREE.Mesh(new THREE.SphereGeometry(r * 0.95, 12, 10), matFor(childName)));
  }

  // Torso: pelvis and chest as squashed spheres — wider than deep, the way a
  // torso is — bridged by a waist capsule so the silhouette is one body.
  const torso = (boneName, mesh, upOff) => {
    const b = bone(boneName);
    if (!b) return false;
    const bUp = localDir(b, 0, 1, 0);
    orient(mesh, bUp, localDir(b, 0, 0, 1));
    mesh.position.copy(bUp).multiplyScalar(upOff);
    add(b, mesh);
    return true;
  };
  {
    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.080 * H, 16, 12), mats.mid);
    pelvis.scale.set(1.30, 0.80, 0.85);
    torso("Hips", pelvis, 0.005 * H);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.085 * H, 16, 12), mats.mid);
    chest.scale.set(1.35, 1.05, 0.78);
    torso("Spine2", chest, 0.045 * H) || torso("Spine1", chest, 0.045 * H);
    const waist = new THREE.Mesh(new THREE.CapsuleGeometry(0.062 * H, 0.10 * H, 4, 12), mats.mid);
    waist.scale.set(1.25, 1, 0.85);
    torso("Spine", waist, 0.06 * H);
  }
  // Shoulders: caps where the arms meet the chest.
  for (const sideName of ["LeftArm", "RightArm"]) {
    const b = bone(sideName);
    if (b) add(b, new THREE.Mesh(new THREE.SphereGeometry(0.034 * H, 12, 10), matFor(sideName)));
  }

  // The head: a skull with a FACE, because "which way is it looking" is the
  // first question a pose review asks. Nose and eyes sit on the bone's own
  // +Z — the delivery spec's forward — so a head whose face points sideways
  // is a head whose bone frame disagrees with the spec, made visible.
  const head = bone("Head");
  if (head) {
    const hUp = localDir(head, 0, 1, 0);
    const hFwd = localDir(head, 0, 0, 1);
    const hRight = localDir(head, 1, 0, 0);
    const at = (u, f, r) => hUp.clone().multiplyScalar(u)
      .addScaledVector(hFwd, f).addScaledVector(hRight, r);
    const rHead = 0.062 * H;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(rHead, 16, 14), mats.mid);
    skull.scale.set(0.82, 1.12, 0.92);
    orient(skull, hUp, hFwd);
    skull.position.copy(at(0.062 * H, 0, 0));
    add(head, skull);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.011 * H, 0.028 * H, 8), mats.front);
    orient(nose, hFwd, hUp.clone().negate()); // cone points along its +Y
    nose.position.copy(at(0.055 * H, rHead * 0.92, 0));
    add(head, nose);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0075 * H, 8, 8), mats.dark);
      eye.position.copy(at(0.075 * H, rHead * 0.82, sx * 0.021 * H));
      add(head, eye);
    }
  }

  // Hands: a palm continuing the forearm's line, flattened across the palm
  // axis, with a thumb nub on the +Z (palm-forward-at-bind) side in the facing
  // colour — so which way a palm is turned reads at a glance.
  for (const sideName of ["LeftHand", "RightHand"]) {
    const hand = bone(sideName);
    const fore = bone(sideName.replace("Hand", "ForeArm"));
    if (!hand || !fore) continue;
    // The palm continues the forearm's line. Structurally that line is the
    // forearm->hand offset; with a bind pose on record it is taken between
    // bind WORLD positions and expressed in the hand's own frame, so it holds
    // whatever the exporter did to the local axes.
    let dir;
    const hp = bindP.get(hand), fp = bindP.get(fore);
    if (hp && fp && bindQ.get(hand)) {
      dir = hp.clone().sub(fp).normalize()
        .applyQuaternion(bindQ.get(hand).clone().invert());
    } else {
      dir = hand.position.clone().normalize();
    }
    const palmFwd = localDir(hand, 0, 0, 1);
    const palmLen = 0.055 * H;
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.026 * H, palmLen, 0.045 * H), matFor(sideName));
    palm.position.copy(dir).multiplyScalar(palmLen * 0.45);
    orient(palm, dir, palmFwd);
    add(hand, palm);
    // The thumb nub, on the bind-forward side in the facing colour: which way
    // a palm is TURNED reads off it at a glance.
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.013 * H, 0.028 * H, 0.016 * H), mats.front);
    thumb.position.copy(dir).multiplyScalar(palmLen * 0.3).addScaledVector(palmFwd, 0.028 * H);
    thumb.quaternion.copy(palm.quaternion);
    add(hand, thumb);
  }

  // Feet: a wedge pointing +Z — long toward the toe, a rounded heel behind
  // the ankle — so foot direction is legible from any angle.
  for (const sideName of ["LeftFoot", "RightFoot"]) {
    const foot = bone(sideName);
    if (!foot) continue;
    const down = localDir(foot, 0, -1, 0);
    const fwd = localDir(foot, 0, 0, 1);
    const at = (d, f) => down.clone().multiplyScalar(d).addScaledVector(fwd, f);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.055 * H, 0.038 * H, 0.135 * H), matFor(sideName));
    orient(sole, down.clone().negate(), fwd);
    sole.position.copy(at(0.028 * H, 0.035 * H));
    add(foot, sole);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.026 * H, 10, 8), matFor(sideName));
    toe.scale.set(1.0, 0.72, 1.0);
    orient(toe, down.clone().negate(), fwd);
    toe.position.copy(at(0.032 * H, 0.10 * H));
    add(foot, toe);
    const heel = new THREE.Mesh(new THREE.SphereGeometry(0.026 * H, 10, 8), matFor(sideName));
    heel.scale.set(0.95, 0.9, 0.9);
    orient(heel, down.clone().negate(), fwd);
    heel.position.copy(at(0.026 * H, -0.025 * H));
    add(foot, heel);
  }
}

/**
 * Dress the SKELETON of an already-built rig as a human figure, hiding its
 * mesh: the fighter's own bones in the fighter's own pose, wearing average
 * girths. Returns the meshes it made and the skin it is standing in for, so
 * the caller can swap between them.
 *
 * Bones the dresser does not recognise — prop bones, physics chains, a root
 * an exporter left at the origin — get NOTHING, which is what retired the
 * old proxy's floating rectangles and its post up the middle.
 */
export function buildBoneProxy(THREE, root, height = MANNEQUIN_HEIGHT_M) {
  const proxy = [];
  const skin = [];
  root.traverse((o) => { if (o.isMesh) skin.push(o); });
  dressSkeleton(THREE, root, height, (mesh) => {
    mesh.userData.isBoneProxy = true;
    proxy.push(mesh);
  });
  return { proxy, skin };
}

export function buildMannequin(THREE, charKey = null) {
  const root = new THREE.Group();
  root.name = charKey ? `mannequin:${charKey}` : "mannequin";
  const bones = {};
  for (const [name, def] of Object.entries(BONES)) {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.set(...def.pos);
    bones[name] = bone;
    (def.parent ? bones[def.parent] : root).add(bone);
  }
  dressSkeleton(THREE, root, MANNEQUIN_HEIGHT_M, () => {});
  if (charKey) {
    const propMat = new THREE.MeshLambertMaterial({ color: 0x6f7d99 });
    attachPlaceholders(THREE, root, charKey, MANNEQUIN_HEIGHT_M, propMat);
  }
  return { root, height: MANNEQUIN_HEIGHT_M, clips: buildDefaultClips(THREE) };
}
