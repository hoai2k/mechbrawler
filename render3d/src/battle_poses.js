// MATCHED BATTLE POSES — a real human doing the thing, keyed by sprite frame.
//
// Everything else in the pose pipeline works forwards from the drawing: read
// eighteen joints off the art, infer depth, solve the rig onto them. That
// answers "where are his limbs" and it cannot answer "is this a pose a fighter
// would actually be in", because a read has no idea what a fighter is. Two
// drawings a frame apart can read as two unrelated bodies; a foreshortened
// forearm can read as an arm that is simply short; and nothing in the pipeline
// ever objects, because nothing in it knows what a jab looks like.
//
// This file works the other way round. Each of the sheet's frames is MATCHED to
// a named human pose — an orthodox boxing guard, a rear-hand cross at full
// extension, a sprinter's three-point set, mid-swing of a sprint stride — and
// the rig is put in that pose directly. The drawing chooses WHICH pose; the
// pose itself comes from how bodies are built. That is the trade being offered:
// a matched pose will not track a drawing joint for joint, and in exchange it
// is never anatomically nonsense, never inconsistent between neighbouring
// frames, and never needs depth inferred because it was authored in 3D.
//
// Both are kept and the editor switches between them, because which one wins
// is a per-frame judgement and the only way to make it is to look.
//
// THE NUMBERS ARE SOURCED. Where a real measurement exists it is used, and the
// ones that set the shape of this table are:
//
//   * Orthodox stance — feet about shoulder width, staggered, rear foot at
//     ~45°, knees "sitting" with a slight bend, weight near even.
//   * The cross — a proximal-to-distal chain, hip extension the single largest
//     contributor, peak-speed order hip → shoulder → elbow → wrist. So the
//     contact frames drive the SPINE first: an arm extended off a square torso
//     is the pose that reads as a push rather than a punch.
//   * Sprint gait — hip 55° flexion in late swing and ~10° hyperextension
//     after toe-off; knee ~125° at maximum mid-swing flexion, ~40° at strike,
//     ~60° through loading. The four run frames are placed on that cycle.
//   * Three-point start — front knee ~90°, rear knee ~120–135°, trunk about
//     45° to the ground, hips above the shoulders, one arm posted down.
//   * Drop landing — peak knee flexion ~80–86°, and trunk flexion (rather than
//     an erect landing) is what actually absorbs the force.
//   * Roundhouse kick — pelvic rotation leads, then hip flexion/abduction with
//     the knee extending through the target; the ankle stays dorsiflexed.
//
// WHERE YUJI DISAGREES WITH THE GENERIC POSE, THE DRAWING WINS. His sheet is
// not the default fighting-game sheet, and five frames are genuinely different
// animals (see sprites/docs/pose-reads.md): his crouch is a sprinter's
// three-point stance rather than a squat, he hangs from ONE arm, he lands with
// BOTH hands forward, his dizzy tips backward rather than slumping forward,
// and his jump has the knees already tucked at the rise. Those are matched to
// what he is drawn doing, not to what the state is usually drawn doing.
//
// CONVENTIONS, all shared with render3d/src/mannequin.js and the pose library
// the keyframe bench exports:
//
//   A pose is {BoneName: [rx, ry, rz]} in DEGREES, taken in the FIGHTER's own
//   frame — x about the line through his shoulders, y about the vertical, z
//   about his facing — starting from a T-pose. Unlisted bones stay at rest.
//   The editor measures that frame off each rig and swings it into the T-pose
//   first, so these numbers mean the same thing on any delivered .glb whatever
//   it was bound in; see `anatomy` and `toTPose` in the sprite pose editor.
//
//   The three angles are composed z, then y, then x — drop the arm, turn it,
//   then swing it — which is what makes them separately readable:
//
//     Spine    +x leans forward · +y brings the RIGHT shoulder forward
//     Arm      ±z drops it to the side (+ right, − left)
//              −x then swings the hanging arm FORWARD (+x sends it behind him)
//              +y turns it about the vertical: forward for the RIGHT arm and
//              backward for the LEFT, because there is one vertical and the
//              two arms hang off opposite ends of it. Only bites once the arm
//              is up; a hanging arm lies along the axis and just twists.
//     ForeArm  −x BENDS THE ELBOW, bringing the hand forward and up
//              ±z swings the bend inward across the chest (+ right, − left),
//              which is what puts a guard hand on the cheek instead of out
//              beside the ear
//     UpLeg    −x swings the thigh forward, +x back
//     Leg      +x bends the knee
//     Foot     −x points the toe down
//
//   Every one of those was MEASURED off the rig by rotating one bone and asking
//   where the hand went, and the guesses kept being backwards — first the
//   punches, thrown over his shoulder; then the arms, whose +x put both hands
//   15cm BEHIND the chest on every frame of the sheet. The reason is the same
//   both times and worth keeping in mind: x turns about the line through his
//   shoulders, so it tips the TOP of the spine forward and the BOTTOM of a
//   hanging arm backward. Same rotation, opposite ends of the vertical.
//
//   The elbow is the other trap. It is a hinge PERPENDICULAR to the upper arm,
//   so it belongs on x, not on the facing axis: bend it about the facing and
//   the forearm sweeps sideways across the body, which from the side reads as
//   an arm tucked behind the back. And the axes are deliberately NOT carried
//   down the chain — carrying them rotates "lateral" until it runs along the
//   upper arm, and an elbow asked to hinge about its own bone just twists.
//
//   Left and right are the CHARACTER's, as everywhere else in this pipeline:
//   facing right, RIGHT is the near limb and LEFT is the far one.

/** Arms down at the sides. Every pose builds on it, so a pose only has to say
 *  what it changes — and a pose that says nothing is a fighter standing still
 *  rather than a fighter in a T. Exported because the baseline library next
 *  door builds on the same zero. */
export const REST = {
  LeftArm: [0, 0, -65], RightArm: [0, 0, 65],
  LeftForeArm: [-12, 0, -12], RightForeArm: [-12, 0, 12],
};
const p = (extra) => ({ ...REST, ...extra });

/**
 * ORTHODOX GUARD, the pose half this sheet is a departure from.
 *
 * Lead (left) foot forward and turned in, rear (right) foot back at about 45°,
 * knees bent enough to sit into, hands up with the elbows down covering the
 * ribs, chin tucked behind the lead shoulder. The chest is bladed — turned a
 * little away from the opponent — which is the whole point of the stance and
 * also why it reads correctly at game size from the side.
 */
const GUARD = p({
  Spine: [6, -10, 0], Spine1: [2, -6, 0], Head: [-2, 8, 0],
  LeftUpLeg: [-16, 0, 2], LeftLeg: [20, 0, 0], LeftFoot: [-4, 0, 0],
  RightUpLeg: [12, 0, -2], RightLeg: [24, 0, 0], RightFoot: [-8, 0, 0],
  LeftArm: [-40, -12, -70], LeftForeArm: [-110, 0, -60],
  RightArm: [-38, 10, 70], RightForeArm: [-108, 0, 60],
});

export const BATTLE_POSES = {
  // ------------------------------------------------------------------ idle
  // Matched to the orthodox stance itself, with the weight shifting between
  // the two frames — a fighter at rest is never still, and a two-frame idle
  // that only breathes reads as a statue with a chest.
  idle_a: { ...GUARD, Spine: [5, -10, 1], Spine1: [2, -6, 0], Head: [-2, 8, 0],
            LeftUpLeg: [-15, 0, 2], LeftLeg: [19, 0, 0],
            RightUpLeg: [11, 0, -2], RightLeg: [23, 0, 0] },
  idle_b: { ...GUARD, Spine: [7, -9, -1], Spine1: [3, -5, 0], Head: [-1, 7, 0],
            LeftUpLeg: [-17, 0, 2], LeftLeg: [22, 0, 0],
            RightUpLeg: [13, 0, -2], RightLeg: [26, 0, 0],
            LeftArm: [-42, -12, -69], RightArm: [-36, 10, 71] },

  // Matched to a TIGHT boxing guard — the shell. Both forearms vertical in
  // front of the face, elbows pinched to the ribs, shoulders lifted to meet
  // the chin, body folded down behind them. Distinguished from the idle by the
  // shoulders and the crouch, not by the arms, because that is what a fighter
  // covering up actually changes.
  guard: p({
    Spine: [14, -14, 0], Spine1: [6, -8, 0], Head: [4, 10, 0],
    LeftShoulder: [0, 0, -12], RightShoulder: [0, 0, 12],
    LeftUpLeg: [-20, 0, 2], LeftLeg: [30, 0, 0], LeftFoot: [-6, 0, 0],
    RightUpLeg: [10, 0, -2], RightLeg: [34, 0, 0], RightFoot: [-10, 0, 0],
    LeftArm: [-52, -16, -74], LeftForeArm: [-128, 0, -66],
    RightArm: [-50, 14, 74], RightForeArm: [-126, 0, 66],
  }),

  // ------------------------------------------------------------- the strikes
  //
  // All four contact frames are the same human movement at different amounts:
  // a rear-hand cross. The kinetic chain is what makes them read — the rear
  // hip drives, the trunk rotates, and the arm arrives last. So the spine's
  // +y (chest turned to the camera, which from the side is "turned into the
  // punch") carries the pose and the arm is merely extended.

  // LEAD JAB, full extension. The near (right) hand goes; the far hand stays
  // home at the cheek. Lead knee straightening, rear foot pivoted.
  // THE JAB'S WIND-UP — and the drawing disagrees, which is the interesting
  // part. Yuji's `attack_light_a` is drawn at full extension, but the brief is
  // explicit that `_a` is the wind-up and `_b` is the strike, and a light
  // attack with two contact frames and no anticipation is a light attack the
  // opponent gets no frames to see. THE INTENT WINS: a matched pose follows
  // the drawing where the drawing is a legitimate interpretation, not where it
  // contradicts what the frame is FOR. Same body as the heavy's wind-up, a
  // notch smaller, because a jab is chambered less.
  attack_light_a: p({
    Spine: [8, -32, 0], Spine1: [3, -18, 0], Head: [-2, 22, 0],
    LeftUpLeg: [-26, 0, 4], LeftLeg: [34, 0, 0], LeftFoot: [-6, 0, 0],
    RightUpLeg: [8, 0, -4], RightLeg: [44, 0, 0], RightFoot: [-6, 0, 0],
    RightArm: [30, -36, 40], RightForeArm: [-112, 0, 34],
    LeftArm: [-48, -16, -58], LeftForeArm: [-92, 0, -46],
  }),
  // The jab's second contact — a half beat later, arm still out, weight
  // arriving on the lead foot and the chest beginning to unwind.
  attack_light_b: p({
    Spine: [6, 15, 0], Spine1: [3, 10, 0], Head: [0, -4, 0],
    LeftUpLeg: [-30, 0, 2], LeftLeg: [16, 0, 0], LeftFoot: [-4, 0, 0],
    RightUpLeg: [24, 0, -2], RightLeg: [20, 0, 0], RightFoot: [-20, 0, 0],
    RightArm: [0, 74, 12], RightForeArm: [-14, 0, 14],
    LeftArm: [-44, -12, -62], LeftForeArm: [-116, 0, -45],
  }),

  // THE CROSS. Its anticipation is the only true wind-up drawing on the sheet:
  // the chest rotates AWAY, the rear hand chambers at the jaw, weight loads
  // onto the rear leg. A strike reads fast because of this frame.
  attack_heavy_a: p({
    Spine: [2, -28, 0], Spine1: [0, -16, 0], Head: [0, 14, 0],
    LeftUpLeg: [-10, 0, 2], LeftLeg: [18, 0, 0], LeftFoot: [-2, 0, 0],
    RightUpLeg: [8, 0, -2], RightLeg: [34, 0, 0], RightFoot: [-6, 0, 0],
    RightArm: [26, -30, 48], RightForeArm: [-96, 0, 15],
    LeftArm: [-44, -14, -62], LeftForeArm: [-114, 0, -45],
  }),
  // Contact. Hip through, trunk rotated hard, rear heel up, arm arriving last
  // and level — the hitbox goes live on this pose, so it is full extension and
  // aim-neutral.
  attack_heavy: p({
    Spine: [0, 34, 0], Spine1: [0, 20, 0], Head: [0, -10, 0],
    LeftUpLeg: [-24, 0, 2], LeftLeg: [8, 0, 0], LeftFoot: [-4, 0, 0],
    RightUpLeg: [22, 0, -4], RightLeg: [14, 0, 0], RightFoot: [-30, 0, 0],
    RightArm: [0, 88, 4], RightForeArm: [-2, 0, 2],
    LeftArm: [-42, -10, -62], LeftForeArm: [-118, 0, -45],
  }),
  // The follow-through: everything the same, one notch further round and
  // beginning to recover. Skeletally the heavy's contact, per the read.
  attack_heavy_b: p({
    Spine: [4, 28, 0], Spine1: [2, 16, 0], Head: [0, -8, 0],
    LeftUpLeg: [-30, 0, 2], LeftLeg: [14, 0, 0], LeftFoot: [-4, 0, 0],
    RightUpLeg: [26, 0, -4], RightLeg: [20, 0, 0], RightFoot: [-26, 0, 0],
    RightArm: [0, 70, 14], RightForeArm: [-18, 0, 18],
    LeftArm: [-43, -12, -62], LeftForeArm: [-116, 0, -45],
  }),

  // UPPERCUT. Matched to a rear-hand uppercut rather than a generic "arm up":
  // the drive is vertical, so the rear leg extends, the trunk EXTENDS (leans
  // back) rather than folding, and the elbow stays bent through contact. An
  // uppercut thrown with a straight arm is a swing.
  attack_up: p({
    Spine: [-14, 22, 0], Spine1: [-6, 12, 0], Head: [-14, -6, 0],
    LeftUpLeg: [-18, 0, 2], LeftLeg: [10, 0, 0], LeftFoot: [-6, 0, 0],
    RightUpLeg: [10, 0, -2], RightLeg: [6, 0, 0], RightFoot: [-24, 0, 0],
    RightArm: [-104, 16, 50], RightForeArm: [-86, 0, 15],
    LeftArm: [-45, -12, -62], LeftForeArm: [-118, 0, -45],
  }),

  // OVERHAND / HAMMER DOWN into the floor. Trunk flexes hard, the arm comes
  // over the top, and the stance splits wide to get the shoulder low — the
  // legs are what make a downward strike read as force rather than a bow.
  // The contact is `ground`, and reaching it is mostly the LEGS: a standing
  // shoulder is 1.45m up and an arm is 0.55m, so the body has to drop most of a
  // metre. A wide split with the rear leg folded to near kneeling does it; an
  // arm swung harder does not.
  attack_down: p({
    Spine: [44, 14, 0], Spine1: [18, 8, 0], Head: [-24, -6, 0],
    RightUpLeg: [-68, 0, -8], RightLeg: [80, 0, 0], RightFoot: [-10, 0, 0],
    LeftUpLeg: [50, 0, 8], LeftLeg: [14, 0, 0], LeftFoot: [-24, 0, 0],
    RightArm: [-8, 26, 80], RightForeArm: [-10, 0, 6],
    LeftArm: [36, 0, -56], LeftForeArm: [-44, 0, -40],
  }),

  // ------------------------------------------------------------ the crouch
  //
  // Yuji's crouch is a SPRINTER'S THREE-POINT SET, not a squat — the sheet is
  // explicit and the pose brief's default squat is wrong for him. Front knee
  // ~90°, rear knee ~125°, trunk about 45° to the ground, hips high, one arm
  // posted straight down to the floor and the other cocked at the hip.
  crouch_a: p({
    Spine: [46, -8, 0], Spine1: [16, -4, 0], Head: [-32, 6, 0],
    LeftUpLeg: [-56, 0, 4], LeftLeg: [88, 0, 0], LeftFoot: [-14, 0, 0],
    RightUpLeg: [-14, 0, -4], RightLeg: [124, 0, 0], RightFoot: [-24, 0, 0],
    RightArm: [-18, 6, 76], RightForeArm: [-10, 0, 10],
    LeftArm: [34, 6, -58], LeftForeArm: [-62, 0, -15],
  }),
  // A CROUCH BREATHES; IT DOES NOT BOUNCE. This used to sit 6° away from
  // crouch_a at the knee and the hip, which is a small number on a joint and a
  // large one at the hips: a held crouch pumped up and down several centimetres
  // a second, and the settle pass under it (pose.js levelFeet) re-grounded the
  // body on every frame of it, so the whole fighter throbbed. The pair are one
  // held crouch a breath apart — the same relationship idle_a/idle_b have — so
  // the difference is damped to about a quarter of what it was: still alive,
  // no longer a bob. The legs carry the least of it because they carry the
  // hips; the trunk and arms keep more, because that is where a breath shows.
  crouch_b: p({
    Spine: [47.5, -6, 0], Spine1: [16.5, -4, 0], Head: [-32.5, 4, 0],
    LeftUpLeg: [-57.5, 0, 4], LeftLeg: [89.5, 0, 0], LeftFoot: [-14, 0, 0],
    RightUpLeg: [-15, 0, -4], RightLeg: [125, 0, 0], RightFoot: [-24.5, 0, 0],
    RightArm: [-19.5, 6, 77], RightForeArm: [-9.5, 0, 9],
    LeftArm: [33, 6, -59], LeftForeArm: [-63, 0, -15],
  }),
  // Driving OUT of the set — the sprint start's first step, with a strike on
  // the end of it. Rear leg extending behind, trunk still low, lead arm out.
  crouch_attack_a: p({
    Spine: [44, 18, 0], Spine1: [16, 10, 0], Head: [-30, -8, 0],
    LeftUpLeg: [-58, 0, 4], LeftLeg: [70, 0, 0], LeftFoot: [-10, 0, 0],
    RightUpLeg: [34, 0, -4], RightLeg: [28, 0, 0], RightFoot: [-30, 0, 0],
    RightArm: [-30, 74, 22], RightForeArm: [-8, 0, 8],
    LeftArm: [46, 10, -50], LeftForeArm: [-48, 0, -15],
  }),
  crouch_attack_b: p({
    Spine: [42, 24, 0], Spine1: [15, 12, 0], Head: [-28, -10, 0],
    LeftUpLeg: [-64, 0, 4], LeftLeg: [58, 0, 0], LeftFoot: [-8, 0, 0],
    RightUpLeg: [42, 0, -4], RightLeg: [22, 0, 0], RightFoot: [-32, 0, 0],
    RightArm: [-22, 82, 16], RightForeArm: [-4, 0, 4],
    LeftArm: [54, 10, -46], LeftForeArm: [-44, 0, -15],
  }),

  // ------------------------------------------------------------- locomotion
  //
  // The four run frames are four positions on one sprint cycle, using the
  // measured gait: hip 55° flexion in late swing, ~10° hyperextension after
  // toe-off, knee ~125° at maximum mid-swing flexion and ~40° at strike. Arms
  // counter-swing at the shoulder with the elbows near 90°, which is what
  // makes a run read as a run rather than a jog with the arms held.

  // REACH — late swing, the lead thigh at its highest and the trail leg fully
  // behind. The widest, most recognisable frame of the cycle.
  run_reach_a: p({
    Spine: [18, -6, 0], Spine1: [6, -2, 0], Head: [-14, 4, 0],
    RightUpLeg: [-55, 0, 2], RightLeg: [42, 0, 0], RightFoot: [-14, 0, 0],
    LeftUpLeg: [30, 0, -2], LeftLeg: [34, 0, 0], LeftFoot: [-24, 0, 0],
    LeftArm: [-46, 10, -62], LeftForeArm: [-96, 0, -45],
    RightArm: [40, -8, 62], RightForeArm: [-88, 0, 45],
  }),
  // The same instant on the other side of the stride.
  run_reach_b: p({
    Spine: [18, 6, 0], Spine1: [6, 2, 0], Head: [-14, -4, 0],
    LeftUpLeg: [-55, 0, 2], LeftLeg: [42, 0, 0], LeftFoot: [-14, 0, 0],
    RightUpLeg: [30, 0, -2], RightLeg: [34, 0, 0], RightFoot: [-24, 0, 0],
    RightArm: [-46, -10, 62], RightForeArm: [-96, 0, 45],
    LeftArm: [40, 8, -62], LeftForeArm: [-88, 0, -45],
  }),
  // PASSING — the swing leg folded to its tightest under the hip (knee ~125°)
  // as it crosses the stance leg. The narrowest frame, and the one that gets
  // dropped when a run cycle looks like skating.
  run_pass_a: p({
    Spine: [16, -2, 0], Spine1: [6, 0, 0], Head: [-12, 2, 0],
    RightUpLeg: [-12, 0, 2], RightLeg: [118, 0, 0], RightFoot: [-20, 0, 0],
    LeftUpLeg: [4, 0, -2], LeftLeg: [26, 0, 0], LeftFoot: [-10, 0, 0],
    LeftArm: [-16, 4, -62], LeftForeArm: [-92, 0, -45],
    RightArm: [12, -4, 62], RightForeArm: [-90, 0, 45],
  }),
  run_pass_b: p({
    Spine: [16, 2, 0], Spine1: [6, 0, 0], Head: [-12, -2, 0],
    LeftUpLeg: [-12, 0, 2], LeftLeg: [118, 0, 0], LeftFoot: [-20, 0, 0],
    RightUpLeg: [4, 0, -2], RightLeg: [26, 0, 0], RightFoot: [-10, 0, 0],
    RightArm: [-16, -4, 62], RightForeArm: [-92, 0, 45],
    LeftArm: [12, 4, -62], LeftForeArm: [-90, 0, -45],
  }),
  // CONTACT — foot strike, knee ~40° and loading, body at its lowest.
  run_a: p({
    Spine: [20, -4, 0], Spine1: [7, -2, 0], Head: [-15, 3, 0],
    RightUpLeg: [-34, 0, 2], RightLeg: [40, 0, 0], RightFoot: [-6, 0, 0],
    LeftUpLeg: [22, 0, -2], LeftLeg: [56, 0, 0], LeftFoot: [-18, 0, 0],
    LeftArm: [-32, 8, -62], LeftForeArm: [-94, 0, -45],
    RightArm: [28, -6, 62], RightForeArm: [-90, 0, 45],
  }),
  run_b: p({
    Spine: [20, 4, 0], Spine1: [7, 2, 0], Head: [-15, -3, 0],
    LeftUpLeg: [-34, 0, 2], LeftLeg: [40, 0, 0], LeftFoot: [-6, 0, 0],
    RightUpLeg: [22, 0, -2], RightLeg: [56, 0, 0], RightFoot: [-18, 0, 0],
    RightArm: [-32, -8, 62], RightForeArm: [-94, 0, 45],
    LeftArm: [28, 6, -62], LeftForeArm: [-90, 0, -45],
  }),
  // DASH — the drive phase, which is a different animal from the run cycle:
  // trunk lean near 45° early, both arms driving, and the body travelling
  // ahead of the feet rather than over them.
  dash: p({
    Spine: [30, -4, 0], Spine1: [10, -2, 0], Head: [-22, 2, 0],
    RightUpLeg: [-46, 0, 2], RightLeg: [50, 0, 0], RightFoot: [-12, 0, 0],
    LeftUpLeg: [32, 0, -2], LeftLeg: [30, 0, 0], LeftFoot: [-26, 0, 0],
    LeftArm: [-54, 10, -62], LeftForeArm: [-100, 0, -45],
    RightArm: [48, -8, 62], RightForeArm: [-94, 0, 45],
  }),

  // -------------------------------------------------------------- air, fall
  //
  // Yuji's jump has the KNEES ALREADY TUCKED at the rise — the sheet is
  // explicit and the pose brief's "stretched upward, legs still extending" is
  // somebody else's jump. So this is matched to a tuck jump at the point the
  // feet leave, not to a launch.
  jump_rise: p({
    Spine: [-8, -4, 0], Spine1: [-2, -2, 0], Head: [-14, 2, 0],
    RightUpLeg: [-74, 0, 4], RightLeg: [96, 0, 0], RightFoot: [-16, 0, 0],
    LeftUpLeg: [-50, 0, -4], LeftLeg: [72, 0, 0], LeftFoot: [-20, 0, 0],
    LeftArm: [58, 10, -62], LeftForeArm: [-56, 0, -45],
    RightArm: [52, -8, 62], RightForeArm: [-50, 0, 45],
  }),
  // Falling: legs gathered under, arms low and out for balance, head up
  // watching the ground come.
  fall: p({
    Spine: [-6, -2, 0], Spine1: [-2, 0, 0], Head: [-12, 2, 0],
    RightUpLeg: [-26, 0, 4], RightLeg: [46, 0, 0], RightFoot: [-18, 0, 0],
    LeftUpLeg: [-14, 0, -4], LeftLeg: [34, 0, 0], LeftFoot: [-16, 0, 0],
    LeftArm: [30, 6, -62], LeftForeArm: [-26, 0, -26],
    RightArm: [38, -6, 62], RightForeArm: [-22, 0, 22],
  }),
  // LANDING, matched to a drop landing: peak knee flexion 80–86° and the
  // absorbing trunk flexion that goes with it. Yuji reaches BOTH hands
  // forward and down rather than posting one, which the sheet is clear about.
  land: p({
    Spine: [42, 0, 0], Spine1: [14, 0, 0], Head: [-26, 0, 0],
    RightUpLeg: [-64, 0, 6], RightLeg: [86, 0, 0], RightFoot: [-14, 0, 0],
    LeftUpLeg: [-52, 0, -6], LeftLeg: [80, 0, 0], LeftFoot: [-12, 0, 0],
    LeftArm: [-58, 8, -52], LeftForeArm: [-30, 0, -30],
    RightArm: [-62, -6, 56], RightForeArm: [-26, 0, 26],
  }),

  // AERIAL STRIKES. A jumping punch is a cross thrown off a body with nothing
  // under it, so the legs trail and split rather than driving — the rotation
  // has to come from the trunk alone, which is exactly how it looks.
  attack_air: p({
    Spine: [10, 30, 0], Spine1: [4, 18, 0], Head: [-6, -10, 0],
    RightUpLeg: [-34, 0, 4], RightLeg: [58, 0, 0], RightFoot: [-18, 0, 0],
    LeftUpLeg: [26, 0, -4], LeftLeg: [40, 0, 0], LeftFoot: [-22, 0, 0],
    RightArm: [0, 86, 6], RightForeArm: [-4, 0, 4],
    LeftArm: [-26, -10, -62], LeftForeArm: [-96, 0, -45],
  }),
  // Its wind-up in the air: knees drawn up, chest turned away, fist chambered.
  attack_air_a: p({
    Spine: [16, -22, 0], Spine1: [6, -12, 0], Head: [-4, 12, 0],
    RightUpLeg: [-72, 0, 4], RightLeg: [92, 0, 0], RightFoot: [-18, 0, 0],
    LeftUpLeg: [-40, 0, -4], LeftLeg: [66, 0, 0], LeftFoot: [-20, 0, 0],
    RightArm: [24, -28, 46], RightForeArm: [-100, 0, 15],
    LeftArm: [-40, -12, -70], LeftForeArm: [-108, 0, -58],
  }),
  // FLYING KICK, matched to a jumping front/side kick: the kicking leg extends
  // through the target with the ankle dorsiflexed, the support leg folds under,
  // and the trunk leans AWAY to counterweight it.
  attack_air_b: p({
    Spine: [-16, 10, 0], Spine1: [-6, 6, 0], Head: [8, -6, 0],
    RightUpLeg: [-78, 0, 6], RightLeg: [10, 0, 0], RightFoot: [16, 0, 0],
    LeftUpLeg: [16, 0, -6], LeftLeg: [86, 0, 0], LeftFoot: [-14, 0, 0],
    RightArm: [24, -20, 62], RightForeArm: [-40, 0, 15],
    LeftArm: [40, 12, -62], LeftForeArm: [-30, 0, -30],
  }),

  // ---------------------------------------------------------------- evasion
  // The air dodge is a TWIST out of the line of the blow — body turned, knees
  // drawn to one side, limbs pulled in. Distinct from the roll, which is an
  // actual tucked ball: chin to chest, knees to chest, arms wrapped.
  dodge_air: p({
    Spine: [18, -40, 8], Spine1: [8, -22, 4], Head: [-8, 22, 0],
    RightUpLeg: [-66, 0, 8], RightLeg: [80, 0, 0], RightFoot: [-10, 0, 0],
    LeftUpLeg: [-44, 0, -8], LeftLeg: [62, 0, 0], LeftFoot: [-8, 0, 0],
    LeftArm: [-50, -16, -62], LeftForeArm: [-108, 0, -45],
    RightArm: [-46, 14, 62], RightForeArm: [-104, 0, 45],
  }),
  dodge_roll: p({
    Spine: [56, -18, 0], Spine1: [22, -10, 0], Head: [34, 10, 0],
    RightUpLeg: [-112, 0, 6], RightLeg: [128, 0, 0], RightFoot: [-18, 0, 0],
    LeftUpLeg: [-104, 0, -6], LeftLeg: [124, 0, 0], LeftFoot: [-18, 0, 0],
    LeftArm: [-70, -14, -62], LeftForeArm: [-128, 0, -45],
    RightArm: [-66, 12, 62], RightForeArm: [-124, 0, 45],
  }),

  // --------------------------------------------------------------- reactions
  // Whiplash: the head goes first and furthest, the spine arches back, and the
  // arms hang DEAD — Yuji's hurt is not the arms-flung-wide the pose audit
  // assumed. The reaction lives in the spine.
  hurt: p({
    Spine: [-26, 4, 0], Spine1: [-12, 2, 0], Head: [-34, -4, 0],
    RightUpLeg: [14, 0, 4], RightLeg: [22, 0, 0], RightFoot: [-8, 0, 0],
    LeftUpLeg: [8, 0, -4], LeftLeg: [16, 0, 0], LeftFoot: [-6, 0, 0],
    LeftArm: [14, 0, -68], LeftForeArm: [-22, 0, -22],
    RightArm: [18, 0, 70], RightForeArm: [-18, 0, 18],
  }),
  // Yuji's dizzy tips BACKWARD, chin up, arms dead at the sides — the audit's
  // forward slump is a different character's stagger.
  dizzy: p({
    Spine: [-16, 0, 6], Spine1: [-8, 0, -3], Head: [-22, 0, 14],
    RightUpLeg: [10, 0, 6], RightLeg: [18, 0, 0], RightFoot: [-4, 0, 0],
    LeftUpLeg: [-6, 0, -6], LeftLeg: [10, 0, 0], LeftFoot: [-2, 0, 0],
    LeftArm: [8, 0, -74], LeftForeArm: [-8, 0, -8],
    RightArm: [6, 0, 76], RightForeArm: [-6, 0, 6],
  }),
  // Face down on the floor. The whole body rotates at the hips; the limbs only
  // say how it fell.
  prone: {
    Hips: [-86, 0, 0],
    Spine: [-6, 0, 0], Head: [26, 0, 0],
    LeftArm: [0, 0, -62], LeftForeArm: [-30, 0, -30],
    RightArm: [0, 0, 46], RightForeArm: [-26, 0, 26],
    LeftLeg: [14, 0, 0], RightLeg: [8, 0, 0],
  },

  // ------------------------------------------------------------------ hangs
  // Yuji hangs from ONE arm with the other at his side — the sheet is explicit
  // and the two-armed grip is somebody else's ledge. Body straight below the
  // grip, toes pointed, knees just off straight: dangling, not standing.
  ledge_hang: p({
    Spine: [-2, 6, 0], Spine1: [0, 4, 0], Head: [-10, -8, 0],
    RightArm: [0, -6, -82], RightForeArm: [-4, 0, 4],
    LeftArm: [6, 0, -58], LeftForeArm: [-18, 0, -18],
    RightUpLeg: [-8, 0, 3], RightLeg: [16, 0, 0], RightFoot: [22, 0, 0],
    LeftUpLeg: [4, 0, -3], LeftLeg: [10, 0, 0], LeftFoot: [26, 0, 0],
  }),

  // --------------------------------------------------------------- specials
  // Gathering: both fists drawn to the centre, knees loaded, body coiled down
  // over them. Matched to a power-gathering stance — a horse stance narrowed
  // to fighting width — rather than to a strike.
  charge: p({
    Spine: [22, 0, 0], Spine1: [8, 0, 0], Head: [-16, 0, 0],
    RightUpLeg: [-34, 0, 6], RightLeg: [48, 0, 0], RightFoot: [-8, 0, 0],
    LeftUpLeg: [-30, 0, -6], LeftLeg: [44, 0, 0], LeftFoot: [-8, 0, 0],
    LeftArm: [-52, -22, -62], LeftForeArm: [-124, 0, -45],
    RightArm: [-50, 20, 62], RightForeArm: [-120, 0, 45],
  }),
  // A two-handed push out from the centre — the palm strike, thrown off the
  // same hip-first chain as the cross but with both arms and a squarer chest.
  special_neutral: p({
    Spine: [4, 26, 0], Spine1: [2, 16, 0], Head: [0, -8, 0],
    LeftUpLeg: [-34, 0, 6], LeftLeg: [18, 0, 0], LeftFoot: [-6, 0, 0],
    RightUpLeg: [30, 0, -6], RightLeg: [20, 0, 0], RightFoot: [-22, 0, 0],
    RightArm: [0, 80, 10], RightForeArm: [-8, 0, 8],
    LeftArm: [8, -26, -62], LeftForeArm: [-26, 0, -26],
  }),
  // A low sweeping strike — trunk rotated hard over a wide split stance, arm
  // travelling across at hip height.
  special_side: p({
    Spine: [16, 38, 0], Spine1: [6, 20, 0], Head: [-8, -14, 0],
    LeftUpLeg: [-46, 0, 8], LeftLeg: [22, 0, 0], LeftFoot: [-4, 0, 0],
    RightUpLeg: [42, 0, -8], RightLeg: [26, 0, 0], RightFoot: [-24, 0, 0],
    RightArm: [-16, 66, 30], RightForeArm: [-12, 0, 12],
    LeftArm: [26, 10, -62], LeftForeArm: [-34, 0, -15],
  }),
  // The idle with a wisp of aura — skeletally the stance, per the read, with
  // the weight settled and the hands opened.
  special_down: { ...GUARD, Spine: [8, -8, 0], Head: [-4, 6, 0],
                  LeftArm: [-38, -10, -62], LeftForeArm: [-96, 0, -45],
                  RightArm: [-34, 8, 62], RightForeArm: [-92, 0, 45] },

  // GATHERING, then release — and again the drawing disagrees. Yuji's `ult_a`
  // and `ult_b` are drawn as two contact frames (the read notes it: they are
  // "skeletally the heavy's contact frame"), but the brief is unambiguous that
  // `ult_a` is "the wind-up of their ultimate: gathering, energy at maximum,
  // before release". An ultimate that begins already extended has no moment of
  // gathering, which is the only thing that makes an ultimate read as one. So
  // `ult_a` gathers, and `ult_b` releases.
  ult_a: p({
    Spine: [20, -10, 0], Spine1: [8, -6, 0], Head: [-14, 8, 0],
    RightUpLeg: [-38, 0, 6], RightLeg: [52, 0, 0], RightFoot: [-8, 0, 0],
    LeftUpLeg: [-32, 0, -6], LeftLeg: [48, 0, 0], LeftFoot: [-8, 0, 0],
    LeftArm: [-56, -24, -62], LeftForeArm: [-128, 0, -48],
    RightArm: [-54, 22, 62], RightForeArm: [-124, 0, 48],
  }),
  // The release: the heavy's cross thrown bigger — a longer stance and a
  // fuller rotation than any ordinary strike.
  ult_b: p({
    Spine: [2, 38, 0], Spine1: [1, 22, 0], Head: [0, -12, 0],
    LeftUpLeg: [-40, 0, 4], LeftLeg: [16, 0, 0], LeftFoot: [-4, 0, 0],
    RightUpLeg: [34, 0, -4], RightLeg: [18, 0, 0], RightFoot: [-30, 0, 0],
    RightArm: [0, 76, 12], RightForeArm: [-14, 0, 14],
    LeftArm: [-42, -10, -62], LeftForeArm: [-112, 0, -45],
  }),

  // ------------------------------------------------------------ grabs, dash
  //
  // A dash attack is a cross thrown while still travelling: the drive-phase
  // lean of the dash with the strike arriving on top of it, which is what
  // separates it from the standing heavy — the body is ahead of the feet.
  attack_dash: p({
    Spine: [26, 26, 0], Spine1: [10, 15, 0], Head: [-16, -10, 0],
    LeftUpLeg: [-40, 0, 4], LeftLeg: [24, 0, 0], LeftFoot: [-8, 0, 0],
    RightUpLeg: [34, 0, -4], RightLeg: [30, 0, 0], RightFoot: [-28, 0, 0],
    RightArm: [0, 82, 8], RightForeArm: [-6, 0, 6],
    LeftArm: [-40, -12, -62], LeftForeArm: [-108, 0, -45],
  }),
  // REACHING for a grab: both arms out at chest height, hands open and
  // leading, weight moving onto the front foot. It is not a strike — the
  // elbows stay soft and the shoulders stay level, which is the read that
  // tells a grab from a push at game size.
  grab_reach: p({
    Spine: [12, 10, 0], Spine1: [4, 6, 0], Head: [-8, -4, 0],
    LeftUpLeg: [-28, 0, 4], LeftLeg: [20, 0, 0], LeftFoot: [-6, 0, 0],
    RightUpLeg: [18, 0, -4], RightLeg: [26, 0, 0], RightFoot: [-16, 0, 0],
    RightArm: [0, 72, 16], RightForeArm: [-24, 0, 24],
    LeftArm: [0, -66, -20], LeftForeArm: [-28, 0, -28],
  }),
  // HOLDING one: elbows drawn back in to the ribs with the load close to the
  // body, hips under it, knees bent — the way anything heavy is actually
  // carried, and the opposite of the reach that got there.
  grab_hold: p({
    Spine: [-6, 6, 0], Spine1: [-2, 4, 0], Head: [-6, -4, 0],
    LeftUpLeg: [-22, 0, 5], LeftLeg: [32, 0, 0], LeftFoot: [-6, 0, 0],
    RightUpLeg: [-6, 0, -5], RightLeg: [34, 0, 0], RightFoot: [-8, 0, 0],
    RightArm: [-30, 44, 62], RightForeArm: [-92, 0, 45],
    LeftArm: [-30, -40, -62], LeftForeArm: [-96, 0, -45],
  }),
  // BEING held: feet off the line, hands up at the grip trying to break it,
  // body slack below. Matched to someone lifted rather than someone standing
  // still, because the legs are what sell it.
  grabbed: p({
    Spine: [-12, -6, 0], Spine1: [-6, -4, 0], Head: [-18, 4, 0],
    LeftUpLeg: [-30, 0, 6], LeftLeg: [54, 0, 0], LeftFoot: [-14, 0, 0],
    RightUpLeg: [-18, 0, -6], RightLeg: [44, 0, 0], RightFoot: [-12, 0, 0],
    RightArm: [-24, 20, 62], RightForeArm: [-76, 0, 45],
    LeftArm: [-24, -18, -62], LeftForeArm: [-80, 0, -45],
  }),

  // ----------------------------------------------------------------- victory
  // One fist raised, weight settled, chest open — the celebration, which is
  // the one pose on the sheet that is not a fighting pose at all.
  victory: p({
    Spine: [-4, 8, 0], Spine1: [-2, 6, 0], Head: [-8, -8, 0],
    RightUpLeg: [-6, 0, 3], RightLeg: [8, 0, 0],
    LeftUpLeg: [4, 0, -3], LeftLeg: [10, 0, 0],
    RightArm: [6, -10, -74], RightForeArm: [-26, 0, 26],
    LeftArm: [-10, 0, -48], LeftForeArm: [-40, 0, -15],
  }),
};

/** The matched pose for a sprite frame, or null if that frame has no match. */
export const matchedPose = (frame) => BATTLE_POSES[frame] || null;

/** Which frames have one. The editor badges these in the picker. */
export const MATCHED_FRAMES = new Set(Object.keys(BATTLE_POSES));

/**
 * Sprite frames that will never get a matched pose, and are not a gap.
 *
 * The gait is the one part of the 3D path that is NOT read off the sprite
 * sheet: `render3d/src/walk_cycle.js` generates the walk and the run as a
 * continuous cycle with its own phase, contact timing and stride length,
 * because two drawn keyframes cannot say how a leg travels between them.
 * Matching a pose to `walk_a` would freeze a model mid-stride and then fight
 * the cycle for the same bones.
 *
 * Round 21 delivered `walk_a` and `walk_b` for all 27 fighters, which is what
 * put these names on every sheet. The sprites are used — by the sprite
 * renderer, which is where drawn keyframes belong.
 */
export const GAIT_FRAMES = new Set(["walk_a", "walk_b"]);
