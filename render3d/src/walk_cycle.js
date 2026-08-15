// A BIPED WALK, authored rather than read off the sprites.
//
// Every other state's clip is built from that fighter's own drawings: the
// sprite schedule says which frame is on screen when, the pose libraries say
// what each drawing IS as a body, and pose_clips.js interpolates between them.
// That is the right machine for a state the artists have drawn, and it is the
// wrong one here, for two reasons.
//
// A WALK IS A CYCLE, AND TWO DRAWINGS ARE NOT ONE. Round 21 asks for `walk_a`
// and `walk_b` — two contacts, opposite legs leading — because two frames is
// what reads as a walk in 2D at game size. Interpolating a rig between two
// contact poses does NOT give a walk: it gives a body scissoring between two
// extremes, the legs passing through each other with the knees straight and
// the hips never rising or settling. A walk needs the four phases — CONTACT,
// DOWN, PASSING, UP — and the two that carry all the weight, down and passing,
// are exactly the two a two-frame sheet leaves out.
//
// AND IT IS FREE HERE. The cost of a pose is drawing it; in 3D a pose is eight
// joint angles, so the phases a 2D sheet cannot afford are the cheapest thing
// in this file. That asymmetry is the whole reason the two paths should
// diverge on this state rather than the 3D one waiting for art it does not
// need.
//
// So the 3D walk ignores `walk_a`/`walk_b` entirely and plays this. The sprites
// are still requested and still used — by the sprite renderer, which is what
// they were drawn for.
//
// WHAT MAKES IT A WALK AND NOT A SLOW RUN, which is the note round 21A gives
// the artists and holds just as well here:
//
//   * one foot is always down. A run has an airborne phase; a walk does not,
//     and that single fact is what the timing below is arranged around.
//   * the torso is upright. The mannequin's run leans 15° into the travel;
//     this leans 2°.
//   * the stride is short — thighs swing ±20° against the run's ±32 — and the
//     knees stay far straighter, 42° through the pass against the run's 88.
//   * the arms hang and swing from the shoulder, elbows soft, rather than
//     being carried high and pumped.
//
// CONVENTION is battle_poses.js's, in full: degrees in the fighter's own frame
// from a T-pose, composed z → y → x. −x swings a hanging arm forward, −x bends
// a forearm, −x swings a thigh forward, +x bends a knee, and −x on the foot
// lifts the toes (a heel strike) while +x points them (a toe-off).
//
// NOTE this is NOT the mannequin's convention, which bends elbows about z on
// its own standard skeleton. The stand-in has its own walk in mannequin.js for
// that reason; the two tables cannot be shared and are not.

import { REST } from "./battle_poses.js";
import { mirrorPose } from "./clips.js";

const p = (extra) => ({ ...REST, ...extra });

/** The left-leading half of the cycle. The right-leading half is this one
 *  reflected, generated below — so tuning a phase tunes both and the two
 *  halves cannot drift out of step with each other. */
const HALF = {
  // CONTACT. Left heel strikes with the leg nearly straight, right foot still
  // down behind and rolling off its toes. Arms at their widest, opposed to the
  // legs. Both feet on the floor: this is the moment a walk has and a run
  // does not.
  walk_contact_l: p({
    Spine: [2, -3, 0], Spine1: [1, -2, 0], Head: [-1, 3, 0],
    LeftUpLeg: [-20, 0, 2], LeftLeg: [4, 0, 0], LeftFoot: [-10, 0, 0],
    RightUpLeg: [16, 0, -2], RightLeg: [3, 0, 0], RightFoot: [11, 0, 0],
    LeftArm: [12, 0, -74], LeftForeArm: [-14, 0, -8],
    RightArm: [-14, 0, 74], RightForeArm: [-18, 0, 8],
  }),

  // DOWN. The weight arrives: the left knee bends to absorb it and the hips are
  // at their lowest. The right foot is STILL DOWN, rolled up onto its toes and
  // pushing — it leaves the floor at the pass, not here. This is the frame of
  // double support, the one a walk has and a run does not, and lifting the rear
  // foot through it does not make the figure airborne (the support leg is
  // straight underneath either way) — it just throws away the phase that makes
  // a walk look like it has weight.
  walk_down_l: p({
    Spine: [3, -2, 0], Spine1: [1, -1, 0], Head: [-1, 2, 0],
    LeftUpLeg: [-10, 0, 2], LeftLeg: [16, 0, 0], LeftFoot: [-2, 0, 0],
    RightUpLeg: [10, 0, -2], RightLeg: [13, 0, 0], RightFoot: [9, 0, 0],
    LeftArm: [8, 0, -74], LeftForeArm: [-12, 0, -8],
    RightArm: [-10, 0, 74], RightForeArm: [-16, 0, 8],
  }),

  // PASSING. The right leg swings through under the body, knee folded and toes
  // clear of the floor; the left is vertical and straight, carrying everything.
  // Arms pass neutral. This is the position a two-frame sheet cannot show and
  // the one that makes the cycle read as walking.
  walk_pass_l: p({
    Spine: [2, 0, 0], Spine1: [1, 0, 0], Head: [-1, 0, 0],
    LeftUpLeg: [0, 0, 2], LeftLeg: [2, 0, 0], LeftFoot: [0, 0, 0],
    RightUpLeg: [-4, 0, -2], RightLeg: [42, 0, 0], RightFoot: [-8, 0, 0],
    LeftArm: [0, 0, -74], LeftForeArm: [-10, 0, -8],
    RightArm: [0, 0, 74], RightForeArm: [-12, 0, 8],
  }),

  // UP. The hips reach their highest as the left leg pushes over the ball of
  // its foot and the right swings out toward its own contact. The arms have
  // crossed and are opening the other way.
  //
  // The roll onto the ball is deliberately shallow — 6° rather than the 10 this
  // started at. Rigs answer the same ankle angle with different heights, and a
  // deep roll on a long foot reads as tiptoeing rather than walking.
  walk_up_l: p({
    Spine: [2, 2, 0], Spine1: [1, 1, 0], Head: [-1, -2, 0],
    LeftUpLeg: [12, 0, 2], LeftLeg: [4, 0, 0], LeftFoot: [6, 0, 0],
    RightUpLeg: [-16, 0, -2], RightLeg: [24, 0, 0], RightFoot: [-6, 0, 0],
    LeftArm: [-8, 0, -74], LeftForeArm: [-10, 0, -8],
    RightArm: [10, 0, 74], RightForeArm: [-14, 0, 8],
  }),
};

export const WALK_POSES = { ...HALF };
for (const phase of ["contact", "down", "pass", "up"]) {
  WALK_POSES[`walk_${phase}_r`] = mirrorPose(HALF[`walk_${phase}_l`]);
}

/**
 * The cycle as a key schedule, over a clip of `duration` seconds.
 *
 * Eight phases evenly spaced, closing on the pose it opened with so the loop
 * does not jump — the same shape the mannequin's run uses. The eases are
 * gentler than the run's: a run drives DOWN into each contact and springs
 * `out` of it, and a walk does neither hard enough to be worth saying, so the
 * only accent left is a slight settle onto each contact.
 */
export function walkKeys(duration) {
  const d = duration;
  const step = d / 8;
  const order = [
    "walk_contact_l", "walk_down_l", "walk_pass_l", "walk_up_l",
    "walk_contact_r", "walk_down_r", "walk_pass_r", "walk_up_r",
  ];
  const keys = order.map((name, i) => ({
    t: step * i,
    pose: WALK_POSES[name],
    poseName: name,
    ease: name.startsWith("walk_contact") ? "out" : "ease",
  }));
  keys.push({ ...keys[0], t: d });
  return keys;
}
