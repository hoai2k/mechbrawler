// A BIPED RUN, authored rather than read off the sprites — the walk's sibling,
// for the same reason and by the same rules (walk_cycle.js states the case in
// full; this file states only what is different about running).
//
// WHAT THE SHEET GIVES AND WHAT IT LEAVES OUT. Round 11 converted the roster to
// a four-frame run — `run_reach_a`, `run_pass_a`, `run_reach_b`, `run_pass_b` —
// and those four drawings are two positions on the stride, mirrored: the widest
// moment and the narrowest. That is a good four-frame sprite run and it is half
// a cycle for a rig. The two it leaves out are the two that carry the weight:
//
//   * CONTACT/DOWN — the foot strikes and the knee loads to ~40-65°, the body
//     at its lowest. Without it the legs swing but nothing ever lands, which is
//     the read the sprite path gets away with (a cut hides it) and a rig does
//     not (an interpolation shows every instant between the drawings).
//   * UP — the float. A run has an airborne phase and a walk does not; that
//     single fact is what separates the two cycles, and it lives entirely in
//     the frame where both feet are off the floor and the lead leg is reaching.
//
// So the rig's run gets the same four phases the walk got — CONTACT, DOWN,
// PASSING, UP — with the run's own amplitudes rather than the walk's, and the
// sprite path keeps playing the four drawings it was given.
//
// THE NUMBERS ARE THE ONES ALREADY AGREED. Reach and passing are lifted from
// the matched reads in battle_poses.js (`run_reach_*`, `run_pass_*`), which
// were placed on the measured sprint gait: hip 55° flexion in late swing and
// ~10° hyperextension after toe-off, knee ~125° at maximum mid-swing flexion
// and ~40° at strike, elbows near 90° and counter-swinging at the shoulder.
// Contact matches the legacy `run_a`/`run_b` pair, which is what that pose was.
// Only DOWN and UP are new. A fighter's run therefore lands where it already
// was, with the two missing phases filled in — not a different run.
//
// AGAINST THE WALK, since the two now sit side by side: the torso leans 20°
// into the travel against the walk's 2, the thighs swing 55/30 against ±20, the
// knee folds 118° through the pass against 42, the arms are carried high with
// the elbows locked near 90° instead of hanging and swinging, and there is a
// frame with no foot on the floor.
//
// CONVENTION is battle_poses.js's, exactly as walk_cycle.js uses it: degrees in
// the fighter's own frame from a T-pose, composed z → y → x. −x swings an arm
// forward, −x bends a forearm, −x swings a thigh forward, +x bends a knee, −x
// on the foot lifts the toes and +x points them. Vertical travel is NOT in
// here — motion.js owns the bob, and baking it in doubles it.
//
// NOTE this is NOT the mannequin's convention (it bends elbows about z on its
// own standard skeleton). The stand-in carries its own run in mannequin.js for
// that reason; the two tables cannot be shared and are not.

import { REST } from "./battle_poses.js";
import { mirrorPose } from "./clips.js";

const p = (extra) => ({ ...REST, ...extra });

/** The left-leading half of the stride — left foot strikes, right leg swings
 *  through. The right-leading half is this one reflected, generated below, so
 *  the two halves cannot drift apart. */
const HALF = {
  // CONTACT. The left foot strikes out in front with the knee at ~40° and
  // already loading; the right is behind, folded, on its way up off the floor.
  // The trunk is over the strike. Arms fully opposed — right arm forward.
  run_contact_l: p({
    Spine: [20, 4, 0], Spine1: [7, 2, 0], Head: [-15, -3, 0],
    LeftUpLeg: [-34, 0, 2], LeftLeg: [40, 0, 0], LeftFoot: [-6, 0, 0],
    RightUpLeg: [22, 0, -2], RightLeg: [56, 0, 0], RightFoot: [-18, 0, 0],
    LeftArm: [28, 6, -62], LeftForeArm: [-90, 0, -45],
    RightArm: [-32, -8, 62], RightForeArm: [-94, 0, 45],
  }),

  // DOWN. The absorption, and the lowest the body gets: the left knee folds to
  // ~65° under the whole weight while the hip extends back under the trunk, and
  // the right leg swings past behind with the toes pointed off the toe-off.
  // This is the phase the four sprite frames have no drawing for, and the one
  // that makes a stride land instead of hover.
  run_down_l: p({
    Spine: [21, 3, 0], Spine1: [8, 2, 0], Head: [-16, -2, 0],
    LeftUpLeg: [-16, 0, 2], LeftLeg: [66, 0, 0], LeftFoot: [-2, 0, 0],
    RightUpLeg: [32, 0, -2], RightLeg: [40, 0, 0], RightFoot: [8, 0, 0],
    LeftArm: [18, 4, -62], LeftForeArm: [-92, 0, -45],
    RightArm: [-22, -6, 62], RightForeArm: [-92, 0, 45],
  }),

  // PASSING. The right leg crosses the left, folded to its tightest (knee 118°)
  // and the heel near the seat; the left is under the hip and driving straight.
  // Arms pass neutral. This is `run_pass_a`, unchanged.
  run_pass_l: p({
    Spine: [17, 1, 0], Spine1: [6, 0, 0], Head: [-12, -1, 0],
    LeftUpLeg: [4, 0, 2], LeftLeg: [26, 0, 0], LeftFoot: [-10, 0, 0],
    RightUpLeg: [-12, 0, -2], RightLeg: [118, 0, 0], RightFoot: [-20, 0, 0],
    LeftArm: [2, 0, -62], LeftForeArm: [-92, 0, -45],
    RightArm: [-4, 0, 62], RightForeArm: [-90, 0, 45],
  }),

  // UP — the float, and the widest frame of the cycle. The left foot has left
  // the floor and trails fully extended behind; the right thigh is at its
  // highest, reaching for its own contact. NOTHING is on the ground here, which
  // is the whole difference between this cycle and the walk. This is
  // `run_reach_a`, unchanged.
  run_up_l: p({
    Spine: [18, -4, 0], Spine1: [6, -2, 0], Head: [-14, 3, 0],
    LeftUpLeg: [30, 0, 2], LeftLeg: [34, 0, 0], LeftFoot: [-20, 0, 0],
    RightUpLeg: [-55, 0, -2], RightLeg: [42, 0, 0], RightFoot: [-14, 0, 0],
    LeftArm: [-46, 0, -62], LeftForeArm: [-96, 0, -45],
    RightArm: [40, 0, 62], RightForeArm: [-88, 0, 45],
  }),
};

export const RUN_POSES = { ...HALF };
for (const phase of ["contact", "down", "pass", "up"]) {
  RUN_POSES[`run_${phase}_r`] = mirrorPose(HALF[`run_${phase}_l`]);
}

/**
 * The cycle as a key schedule, over a clip of `duration` seconds.
 *
 * Eight phases evenly spaced, closing on the pose it opened with so the loop
 * does not jump. The eases are the run's, not the walk's: a run DRIVES down
 * into each contact (`in` out of the float above it) and springs `out` of it,
 * and that asymmetry is most of what makes a stride feel heavy. The walk gets
 * a settle on the contacts and nothing else, because nothing else in a walk
 * lands hard enough to be worth an accent.
 *
 * IT STARTS ON `down`, NOT ON `contact`, and that is load-bearing twice over.
 * The walk can start wherever it likes — a second of clip at 13 Hz on twos is
 * thirteen samples and every phase gets seen. A stride is 0.308 s, which is
 * FOUR samples (pose.js DIALS: on twos, 13 Hz — the same cadence the 13 fps
 * sprite run plays at), and they land on t = 0, ¼, ½, ¾ of the cycle. So the
 * clip does not get to show eight poses in game; it gets to choose which four,
 * and they are the alternating phases from wherever it begins.
 *
 *   * Beginning on `contact` shows contact and passing — the run's narrowest
 *     moment twice, and never the reach, which is the frame that reads as
 *     running from across the stage.
 *   * Beginning on `down` shows DOWN and UP: the deepest, most compressed
 *     moment of the stride alternating with the widest, both feet off the
 *     floor. That is the pair a four-frame run wants.
 *
 * And it puts the gait in phase with the engine's bob, which is the vertical
 * travel this clip is forbidden to bake (motion.js: `dy -= |sin(c·2π)|·runBob`,
 * c being the cycle fraction). That lifts the body hardest at c = ¼ and ¾ and
 * drops it to nothing at 0 and ½ — so with `down` at 0 the body is LOWEST as
 * the leg loads and HIGHEST at the float, which is the flight phase the clip
 * cannot express on its own. The walk gets the same treatment for free by
 * starting on its contact: lowest at the strike, highest through the pass.
 */
export function runKeys(duration) {
  const d = duration;
  const step = d / 8;
  const order = [
    "run_down_l", "run_pass_l", "run_up_l", "run_contact_r",
    "run_down_r", "run_pass_r", "run_up_r", "run_contact_l",
  ];
  const ease = (name) => (name.startsWith("run_contact") ? "out"
    : name.startsWith("run_up") ? "in" : "ease");
  const keys = order.map((name, i) => ({
    t: step * i,
    pose: RUN_POSES[name],
    poseName: name,
    ease: ease(name),
  }));
  keys.push({ ...keys[0], t: d });
  return keys;
}
