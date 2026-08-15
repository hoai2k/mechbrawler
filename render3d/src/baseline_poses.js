// BASELINE POSES — one per pose INTENT, for every frame name the roster has.
//
// The matched set next door (battle_poses.js) is per-drawing: somebody looked
// at Yuji's `crouch_a`, saw a sprinter's three-point stance, and matched it to
// one. That is the right answer for Yuji and it is not available for anybody
// else, because nobody else has been read — twenty-seven of the twenty-eight
// fighters have seeded joints and no human verdict at all.
//
// This file is the answer that IS available: what a frame CALLED `crouch_a`
// should look like, from its name, the pose brief that commissioned it, and
// the same human-movement library. It is deliberately coarser and deliberately
// TOTAL — every frame name on every sheet resolves to an intent here, so the
// baseline never falls back to anything. That is the point of it. A per-frame
// match is an override on top of a floor, and this is the floor.
//
// WHERE IT DELIBERATELY DISAGREES WITH YUJI. His sheet contradicts the pose
// brief on five states (sprites/docs/pose-reads.md), and the baseline follows
// the BRIEF, not him: `crouch` is a deep squat, `ledge_hang` grips with both
// arms, `land` posts one hand, `dizzy` slumps forward, `jump_rise` is still
// stretching upward. Those are what a fighter nobody has read should be given,
// and the gap between this and the matched set is exactly the value a read
// adds — which is worth being able to see, and is why both are on the cycle.
//
// Conventions and axis signs are battle_poses.js's, in full: degrees in the
// fighter's own frame, from a T-pose, composed z → y → x, with −x swinging a
// hanging arm forward and −x on the forearm bending the elbow.

import { REST } from "./battle_poses.js";

const p = (extra) => ({ ...REST, ...extra });

/**
 * Every intent, and the pose a fighter with no read gets for it.
 *
 * The names are what the move IS, not what any state is called, because two
 * states share an intent all the time — a light and a heavy contact are both
 * a straight punch, and the sheet draws them as the same body at different
 * amounts.
 */
export const INTENT_POSES = {
  // A model-sheet cell: the character standing for a turnaround, not fighting.
  // Feet under the hips, arms clear of the body so the silhouette reads.
  reference: p({
    LeftArm: [0, 0, -58], LeftForeArm: [-8, 0, -6],
    RightArm: [0, 0, 58], RightForeArm: [-8, 0, 6],
    LeftUpLeg: [0, 0, 3], RightUpLeg: [0, 0, -3],
  }),

  // The orthodox stance: lead foot forward, rear foot out at ~45°, knees
  // sitting, hands up, chest bladed.
  stance: p({
    Spine: [6, -10, 0], Spine1: [2, -6, 0], Head: [-2, 8, 0],
    LeftUpLeg: [-16, 0, 2], LeftLeg: [20, 0, 0], LeftFoot: [-4, 0, 0],
    RightUpLeg: [12, 0, -2], RightLeg: [24, 0, 0], RightFoot: [-8, 0, 0],
    LeftArm: [-40, -12, -70], LeftForeArm: [-110, 0, -60],
    RightArm: [-38, 10, 70], RightForeArm: [-108, 0, 60],
  }),
  // The shell: forearms up in front of the face, elbows pinched to the ribs,
  // body folded down behind them.
  guard: p({
    Spine: [14, -14, 0], Spine1: [6, -8, 0], Head: [4, 10, 0],
    LeftShoulder: [0, 0, -12], RightShoulder: [0, 0, 12],
    LeftUpLeg: [-20, 0, 2], LeftLeg: [30, 0, 0], LeftFoot: [-6, 0, 0],
    RightUpLeg: [10, 0, -2], RightLeg: [34, 0, 0], RightFoot: [-10, 0, 0],
    LeftArm: [-52, -16, -74], LeftForeArm: [-128, 0, -66],
    RightArm: [-50, 14, 74], RightForeArm: [-126, 0, 66],
  }),

  // The anticipation: chest rotates AWAY, rear hand chambers at the jaw,
  // weight loads onto the rear leg. The frame that makes the strike read fast.
  strike_wind: p({
    Spine: [10, -46, 0], Spine1: [4, -24, 0], Head: [-4, 30, 0],
    LeftUpLeg: [-34, 0, 4], LeftLeg: [46, 0, 0], LeftFoot: [-6, 0, 0],
    RightUpLeg: [4, 0, -4], RightLeg: [58, 0, 0], RightFoot: [-4, 0, 0],
    RightArm: [40, -46, 28], RightForeArm: [-118, 0, 30],
    LeftArm: [-58, -18, -50], LeftForeArm: [-84, 0, -40],
  }),
  // Contact: hip through, trunk rotated, rear heel up, arm arriving last and
  // level. The hitbox goes live here, so it is full extension and aim-neutral.
  strike_straight: p({
    Spine: [0, 34, 0], Spine1: [0, 20, 0], Head: [0, -10, 0],
    LeftUpLeg: [-24, 0, 2], LeftLeg: [8, 0, 0], LeftFoot: [-4, 0, 0],
    RightUpLeg: [22, 0, -4], RightLeg: [14, 0, 0], RightFoot: [-30, 0, 0],
    RightArm: [0, 88, 4], RightForeArm: [-2, 0, 2],
    LeftArm: [-40, -12, -70], LeftForeArm: [-108, 0, -58],
  }),
  // The uppercut. Vertical drive, so the rear leg extends and the trunk
  // EXTENDS rather than folding; the elbow stays bent through contact,
  // because an uppercut thrown with a straight arm is a swing.
  strike_up: p({
    Spine: [-14, 22, 0], Spine1: [-6, 12, 0], Head: [-14, -6, 0],
    LeftUpLeg: [-18, 0, 2], LeftLeg: [10, 0, 0], LeftFoot: [-6, 0, 0],
    RightUpLeg: [10, 0, -2], RightLeg: [6, 0, 0], RightFoot: [-24, 0, 0],
    RightArm: [-104, 16, 50], RightForeArm: [-86, 0, 40],
    LeftArm: [-40, -12, -70], LeftForeArm: [-106, 0, -58],
  }),
  // OVERHAND INTO THE FLOOR, and it has to actually get there — the contact
  // below says `ground`, and a fist that stops at hip height is a different
  // move however good the body looks. Reaching it is mostly the LEGS: a
  // standing shoulder is 1.45m up and an arm is 0.55m, so the body has to drop
  // most of a metre, which is a deep split with the rear leg folded to near
  // kneeling. The arm itself is straight down, not swung across.
  // A WIDE SPLIT LUNGE, which is what the sheets draw: the near leg bent under
  // the body taking the weight, the far leg stretched back and near straight,
  // the trunk folded over the near knee and the striking arm hanging straight
  // down through it. The reach comes from the stance, not from the shoulder.
  strike_down: p({
    Spine: [40, 14, 0], Spine1: [16, 8, 0], Head: [-22, -6, 0],
    RightUpLeg: [-62, 0, -8], RightLeg: [72, 0, 0], RightFoot: [-10, 0, 0],
    LeftUpLeg: [44, 0, 8], LeftLeg: [16, 0, 0], LeftFoot: [-22, 0, 0],
    RightArm: [-8, 24, 80], RightForeArm: [-10, 0, 6],
    LeftArm: [34, 0, -56], LeftForeArm: [-44, 0, -40],
  }),
  // A low sweeping strike: trunk rotated hard over a wide split stance, arm
  // travelling across at hip height.
  strike_sweep: p({
    Spine: [16, 38, 0], Spine1: [6, 20, 0], Head: [-8, -14, 0],
    LeftUpLeg: [-46, 0, 8], LeftLeg: [22, 0, 0], LeftFoot: [-4, 0, 0],
    RightUpLeg: [42, 0, -8], RightLeg: [26, 0, 0], RightFoot: [-24, 0, 0],
    RightArm: [-16, 66, 30], RightForeArm: [-12, 0, 12],
    LeftArm: [26, 10, -62], LeftForeArm: [-34, 0, -45],
  }),
  // A two-handed push out from the centre, off the same hip-first chain as the
  // straight punch but with both arms and a squarer chest.
  strike_push: p({
    Spine: [4, 26, 0], Spine1: [2, 16, 0], Head: [0, -8, 0],
    LeftUpLeg: [-34, 0, 6], LeftLeg: [18, 0, 0], LeftFoot: [-6, 0, 0],
    RightUpLeg: [30, 0, -6], RightLeg: [20, 0, 0], RightFoot: [-22, 0, 0],
    RightArm: [0, 80, 10], RightForeArm: [-8, 0, 8],
    LeftArm: [8, -26, -18], LeftForeArm: [-26, 0, -12],
  }),

  // A squat: thighs closer to horizontal than vertical, shins near vertical,
  // hips at heel height, guard kept. This is the POSE BRIEF's crouch, not
  // Yuji's three-point stance — see the note at the top of the file.
  crouch: p({
    Spine: [32, 0, 0], Spine1: [12, 0, 0], Head: [-16, 0, 0],
    LeftUpLeg: [-88, 0, 4], LeftLeg: [96, 0, 0], LeftFoot: [-8, 0, 0],
    RightUpLeg: [-84, 0, -4], RightLeg: [94, 0, 0], RightFoot: [-8, 0, 0],
    LeftArm: [-38, -12, -66], LeftForeArm: [-104, 0, -56],
    RightArm: [-36, 10, 66], RightForeArm: [-102, 0, 56],
  }),
  // Striking out of the squat: the rear leg drives, the trunk stays low, the
  // near arm goes.
  crouch_strike: p({
    Spine: [34, 22, 0], Spine1: [13, 12, 0], Head: [-18, -10, 0],
    LeftUpLeg: [-80, 0, 4], LeftLeg: [70, 0, 0], LeftFoot: [-8, 0, 0],
    RightUpLeg: [-30, 0, -4], RightLeg: [40, 0, 0], RightFoot: [-26, 0, 0],
    RightArm: [-24, 78, 20], RightForeArm: [-8, 0, 10],
    LeftArm: [26, 8, -62], LeftForeArm: [-46, 0, -45],
  }),

  // The sprint cycle, on the measured gait: hip 55° flexion in late swing and
  // ~10° hyperextension after toe-off, knee ~125° at mid-swing and ~40° at
  // strike. REACH is the widest frame, PASS the narrowest, CONTACT the lowest.
  stride_reach: p({
    Spine: [18, -6, 0], Spine1: [6, -2, 0], Head: [-14, 4, 0],
    RightUpLeg: [-55, 0, 2], RightLeg: [42, 0, 0], RightFoot: [-14, 0, 0],
    LeftUpLeg: [30, 0, -2], LeftLeg: [34, 0, 0], LeftFoot: [-24, 0, 0],
    LeftArm: [-46, 10, -62], LeftForeArm: [-96, 0, -45],
    RightArm: [40, -8, 62], RightForeArm: [-88, 0, 45],
  }),
  stride_pass: p({
    Spine: [16, -2, 0], Spine1: [6, 0, 0], Head: [-12, 2, 0],
    RightUpLeg: [-12, 0, 2], RightLeg: [118, 0, 0], RightFoot: [-20, 0, 0],
    LeftUpLeg: [4, 0, -2], LeftLeg: [26, 0, 0], LeftFoot: [-10, 0, 0],
    LeftArm: [-16, 4, -62], LeftForeArm: [-92, 0, -45],
    RightArm: [12, -4, 62], RightForeArm: [-90, 0, 45],
  }),
  stride_contact: p({
    Spine: [20, -4, 0], Spine1: [7, -2, 0], Head: [-15, 3, 0],
    RightUpLeg: [-34, 0, 2], RightLeg: [40, 0, 0], RightFoot: [-6, 0, 0],
    LeftUpLeg: [22, 0, -2], LeftLeg: [56, 0, 0], LeftFoot: [-18, 0, 0],
    LeftArm: [-32, 8, -62], LeftForeArm: [-94, 0, -45],
    RightArm: [28, -6, 62], RightForeArm: [-90, 0, 45],
  }),
  // The drive phase, which is a different animal: trunk near 45°, both arms
  // driving, body travelling ahead of the feet rather than over them.
  drive: p({
    Spine: [30, -4, 0], Spine1: [10, -2, 0], Head: [-22, 2, 0],
    RightUpLeg: [-46, 0, 2], RightLeg: [50, 0, 0], RightFoot: [-12, 0, 0],
    LeftUpLeg: [32, 0, -2], LeftLeg: [30, 0, 0], LeftFoot: [-26, 0, 0],
    LeftArm: [-54, 10, -62], LeftForeArm: [-100, 0, -45],
    RightArm: [48, -8, 62], RightForeArm: [-94, 0, 45],
  }),

  // The brief's jump: pushing up off the ground, legs STILL EXTENDING, arms
  // rising, body stretched upward. (Yuji's is a tuck; see the top of the file.)
  jump: p({
    Spine: [-8, -4, 0], Spine1: [-2, -2, 0], Head: [-12, 2, 0],
    RightUpLeg: [-22, 0, 4], RightLeg: [28, 0, 0], RightFoot: [18, 0, 0],
    LeftUpLeg: [-6, 0, -4], LeftLeg: [14, 0, 0], LeftFoot: [20, 0, 0],
    LeftArm: [-58, 8, -40], LeftForeArm: [-40, 0, -22],
    RightArm: [-56, -6, 40], RightForeArm: [-38, 0, 22],
  }),
  // Falling: legs gathered under the body, arms low and out for balance, head
  // up watching the ground come.
  fall: p({
    Spine: [-6, -2, 0], Spine1: [-2, 0, 0], Head: [-12, 2, 0],
    RightUpLeg: [-26, 0, 4], RightLeg: [46, 0, 0], RightFoot: [-18, 0, 0],
    LeftUpLeg: [-14, 0, -4], LeftLeg: [34, 0, 0], LeftFoot: [-16, 0, 0],
    LeftArm: [-30, 6, -50], LeftForeArm: [-26, 0, -20],
    RightArm: [-38, -6, 50], RightForeArm: [-22, 0, 20],
  }),
  // The brief's landing: a deep absorb — peak knee flexion 80–86° with the
  // trunk doing the absorbing — and ONE hand dropped toward the floor.
  land: p({
    Spine: [42, 0, 0], Spine1: [14, 0, 0], Head: [-26, 0, 0],
    RightUpLeg: [-64, 0, 6], RightLeg: [86, 0, 0], RightFoot: [-14, 0, 0],
    LeftUpLeg: [-52, 0, -6], LeftLeg: [80, 0, 0], LeftFoot: [-12, 0, 0],
    RightArm: [-62, -6, 56], RightForeArm: [-26, 0, 20],
    LeftArm: [30, 10, -60], LeftForeArm: [-40, 0, -40],
  }),

  // A jumping punch: nothing under the body, so the legs trail and split and
  // the rotation comes from the trunk alone.
  air_strike: p({
    Spine: [10, 30, 0], Spine1: [4, 18, 0], Head: [-6, -10, 0],
    RightUpLeg: [-34, 0, 4], RightLeg: [58, 0, 0], RightFoot: [-18, 0, 0],
    LeftUpLeg: [26, 0, -4], LeftLeg: [40, 0, 0], LeftFoot: [-22, 0, 0],
    RightArm: [0, 86, 6], RightForeArm: [-4, 0, 4],
    LeftArm: [-40, -10, -66], LeftForeArm: [-96, 0, -56],
  }),
  // The airborne wind-up, per the brief: body coiled mid-jump, striking limb
  // cocked, legs GATHERED. Distinct from the airborne strike in every part —
  // which is the flip test the brief asks every _a/_b pair to pass.
  air_wind: p({
    Spine: [16, -24, 0], Spine1: [6, -14, 0], Head: [-4, 14, 0],
    RightUpLeg: [-72, 0, 4], RightLeg: [92, 0, 0], RightFoot: [-18, 0, 0],
    LeftUpLeg: [-40, 0, -4], LeftLeg: [66, 0, 0], LeftFoot: [-20, 0, 0],
    RightArm: [24, -30, 62], RightForeArm: [-100, 0, 45],
    LeftArm: [-40, -12, -70], LeftForeArm: [-104, 0, -58],
  }),
  // Winding up from the crouch and STAYING DOWN — the brief is emphatic that a
  // crouch attack whose head rises is not one.
  crouch_wind: p({
    Spine: [26, -48, 0], Spine1: [10, -26, 0], Head: [-14, 30, 0],
    LeftUpLeg: [-96, 0, 10], LeftLeg: [104, 0, 0], LeftFoot: [-8, 0, 0],
    RightUpLeg: [-62, 0, -14], RightLeg: [110, 0, 0], RightFoot: [-8, 0, 0],
    RightArm: [56, -52, 20], RightForeArm: [-124, 0, 24],
    LeftArm: [-70, -14, -44], LeftForeArm: [-70, 0, -34],
  }),
  // A twist out of the line of the blow: body turned, knees drawn to one side,
  // limbs pulled in.
  evade_twist: p({
    Spine: [18, -40, 8], Spine1: [8, -22, 4], Head: [-8, 22, 0],
    RightUpLeg: [-66, 0, 8], RightLeg: [80, 0, 0], RightFoot: [-10, 0, 0],
    LeftUpLeg: [-44, 0, -8], LeftLeg: [62, 0, 0], LeftFoot: [-8, 0, 0],
    LeftArm: [-40, -14, -62], LeftForeArm: [-96, 0, -50],
    RightArm: [-36, 12, 62], RightForeArm: [-92, 0, 50],
  }),
  // An actual tucked ball: chin to chest, knees to chest, arms wrapped.
  evade_ball: p({
    Spine: [56, -18, 0], Spine1: [22, -10, 0], Head: [34, 10, 0],
    RightUpLeg: [-112, 0, 6], RightLeg: [128, 0, 0], RightFoot: [-18, 0, 0],
    LeftUpLeg: [-104, 0, -6], LeftLeg: [124, 0, 0], LeftFoot: [-18, 0, 0],
    LeftArm: [-70, -14, -62], LeftForeArm: [-128, 0, -50],
    RightArm: [-66, 12, 62], RightForeArm: [-124, 0, 50],
  }),

  // Whiplash: the head goes first and furthest and the spine arches back.
  whiplash: p({
    Spine: [-26, 4, 0], Spine1: [-12, 2, 0], Head: [-34, -4, 0],
    RightUpLeg: [14, 0, 4], RightLeg: [22, 0, 0], RightFoot: [-8, 0, 0],
    LeftUpLeg: [8, 0, -4], LeftLeg: [16, 0, 0], LeftFoot: [-6, 0, 0],
    LeftArm: [14, 0, -68], LeftForeArm: [-22, 0, -18],
    RightArm: [18, 0, 70], RightForeArm: [-18, 0, 18],
  }),
  // The brief's dizzy: a forward SLUMP, guard gone, arms dangling, head
  // lolling. (Yuji tips backward; see the top of the file.)
  stagger: p({
    Spine: [14, 0, 6], Spine1: [8, 0, -3], Head: [10, 0, 16],
    RightUpLeg: [10, 0, 6], RightLeg: [18, 0, 0], RightFoot: [-4, 0, 0],
    LeftUpLeg: [-6, 0, -6], LeftLeg: [10, 0, 0], LeftFoot: [-2, 0, 0],
    LeftArm: [10, 0, -74], LeftForeArm: [-8, 0, -6],
    RightArm: [6, 0, 76], RightForeArm: [-6, 0, 6],
  }),
  // Face down. The whole body rotates at the hips; the limbs only say how it
  // fell.
  prone: {
    Hips: [-86, 0, 0], Spine: [-6, 0, 0], Head: [26, 0, 0],
    LeftArm: [0, 0, -42], LeftForeArm: [-30, 0, -20],
    RightArm: [0, 0, 46], RightForeArm: [-26, 0, 20],
    LeftLeg: [14, 0, 0], RightLeg: [8, 0, 0],
  },

  // The brief's ledge: BOTH hands overhead on the grip, body straight below,
  // toes pointed, knees just off straight. (Yuji hangs from one; see above.)
  hang: p({
    Spine: [-2, 0, 0], Spine1: [0, 0, 0], Head: [-10, 0, 0],
    LeftArm: [0, 6, -84], LeftForeArm: [-6, 0, -4],
    RightArm: [0, -6, 84], RightForeArm: [-6, 0, 4],
    RightUpLeg: [-8, 0, 3], RightLeg: [16, 0, 0], RightFoot: [22, 0, 0],
    LeftUpLeg: [4, 0, -3], LeftLeg: [10, 0, 0], LeftFoot: [26, 0, 0],
  }),

  // Gathering power: both fists drawn to the centre, knees loaded, body coiled
  // down over them.
  gather: p({
    Spine: [22, 0, 0], Spine1: [8, 0, 0], Head: [-16, 0, 0],
    RightUpLeg: [-34, 0, 6], RightLeg: [48, 0, 0], RightFoot: [-8, 0, 0],
    LeftUpLeg: [-30, 0, -6], LeftLeg: [44, 0, 0], LeftFoot: [-8, 0, 0],
    LeftArm: [-52, -22, -62], LeftForeArm: [-124, 0, -45],
    RightArm: [-50, 20, 62], RightForeArm: [-120, 0, 45],
  }),
  // Holding a stance with something building — the stance, weight settled,
  // hands opened.
  poise: p({
    Spine: [8, -8, 0], Spine1: [3, -5, 0], Head: [-4, 6, 0],
    LeftUpLeg: [-16, 0, 2], LeftLeg: [20, 0, 0], LeftFoot: [-4, 0, 0],
    RightUpLeg: [12, 0, -2], RightLeg: [24, 0, 0], RightFoot: [-8, 0, 0],
    LeftArm: [-38, -10, -62], LeftForeArm: [-96, 0, -45],
    RightArm: [-34, 8, 62], RightForeArm: [-92, 0, 45],
  }),

  // Reaching for a grab: both arms out at chest height, hands leading, elbows
  // soft and shoulders level — which is what tells a grab from a push.
  grab_reach: p({
    Spine: [12, 10, 0], Spine1: [4, 6, 0], Head: [-8, -4, 0],
    LeftUpLeg: [-28, 0, 4], LeftLeg: [20, 0, 0], LeftFoot: [-6, 0, 0],
    RightUpLeg: [18, 0, -4], RightLeg: [26, 0, 0], RightFoot: [-16, 0, 0],
    RightArm: [0, 72, 16], RightForeArm: [-24, 0, 16],
    LeftArm: [0, -66, -20], LeftForeArm: [-28, 0, -16],
  }),
  // Holding one: elbows drawn in to the ribs, the load close, hips under it.
  grab_hold: p({
    Spine: [-6, 6, 0], Spine1: [-2, 4, 0], Head: [-6, -4, 0],
    LeftUpLeg: [-22, 0, 5], LeftLeg: [32, 0, 0], LeftFoot: [-6, 0, 0],
    RightUpLeg: [-6, 0, -5], RightLeg: [34, 0, 0], RightFoot: [-8, 0, 0],
    RightArm: [-30, 44, 62], RightForeArm: [-92, 0, 45],
    LeftArm: [-30, -40, -62], LeftForeArm: [-96, 0, -45],
  }),
  // Being held: feet off the line, hands up at the grip, body slack below.
  grabbed: p({
    Spine: [-12, -6, 0], Spine1: [-6, -4, 0], Head: [-18, 4, 0],
    LeftUpLeg: [-30, 0, 6], LeftLeg: [54, 0, 0], LeftFoot: [-14, 0, 0],
    RightUpLeg: [-18, 0, -6], RightLeg: [44, 0, 0], RightFoot: [-12, 0, 0],
    RightArm: [-24, 20, 62], RightForeArm: [-76, 0, 45],
    LeftArm: [-24, -18, -62], LeftForeArm: [-80, 0, -45],
  }),

  // One fist raised, weight settled, chest open — the one pose on a fighting
  // sheet that is not a fighting pose.
  celebrate: p({
    Spine: [-4, 8, 0], Spine1: [-2, 6, 0], Head: [-8, -8, 0],
    RightUpLeg: [-6, 0, 3], RightLeg: [8, 0, 0],
    LeftUpLeg: [4, 0, -3], LeftLeg: [10, 0, 0],
    RightArm: [6, -10, -74], RightForeArm: [-26, 0, 14],
    LeftArm: [-10, 0, -60], LeftForeArm: [-40, 0, -30],
  }),
};

/**
 * Frame name → intent, for the names the roster actually draws.
 *
 * Spelled out rather than inferred wherever the name does not give it away:
 * `special_down` is a held stance and `special_side` is a sweep, and no rule
 * over the string "special" was ever going to know that.
 */
const INTENT_OF = {
  idle: "stance",
  attack_air: "air_strike",
  guard: "guard",
  attack_light: "strike_straight",
  attack_heavy: "strike_straight",
  attack_dash: "strike_straight",
  ult: "strike_straight",
  attack_up: "strike_up",
  attack_down: "strike_down",
  attack_air: "air_strike",
  crouch: "crouch",
  crouch_attack: "crouch_strike",
  run_reach: "stride_reach",
  run_pass: "stride_pass",
  run: "stride_contact",
  dash: "drive",
  jump_rise: "jump",
  fall: "fall",
  land: "land",
  dodge_air: "evade_twist",
  dodge_roll: "evade_ball",
  hurt: "whiplash",
  dizzy: "stagger",
  prone: "prone",
  ledge_hang: "hang",
  charge: "gather",
  special_neutral: "strike_push",
  special_side: "strike_sweep",
  special_down: "poise",
  grab_reach: "grab_reach",
  grab_hold: "grab_hold",
  grabbed: "grabbed",
  victory: "celebrate",
};

/**
 * THE BEAT. `pose-brief.md` §2 is explicit and it holds for the whole roster:
 * in an attack pair, `_a` is the WIND-UP and `_b` is the strike. So the beat
 * is not decoration on the name, it selects a different intent — and getting
 * it wrong gives a fighter two contact frames and no anticipation, which is
 * the single thing that makes a strike read slow.
 *
 * Only families where the two beats really are different poses appear here.
 * `idle_a`/`idle_b` are one stance a breath apart and `crouch_a`/`crouch_b`
 * one held crouch breathing — the brief says so in the same table — so they
 * share an intent and always will.
 */
const BEATS = {
  attack_light: ["strike_wind", "strike_straight"],
  attack_heavy: ["strike_wind", "strike_straight"],
  attack_air: ["air_wind", "air_strike"],
  crouch_attack: ["crouch_wind", "crouch_strike"],
  ult: ["gather", "strike_straight"],
};

/** The frames that are not moves at all: turnaround-board cells, `r<row>c<col>`. */
const REFERENCE = /^r\d+c\d+$/;

/**
 * WHICH INTENT A FRAME IS, for any name at all.
 *
 * Total by construction, and the chain is short enough to hold in the head:
 * a turnaround cell, then the name itself, then the name with its `_a`/`_b`
 * beat dropped, then the longest prefix that is a known family — which is what
 * makes `attack_heavy_a` land on the straight punch and would catch an
 * `attack_light_c` nobody has drawn yet. `stance` is the floor, and it is a
 * floor rather than a failure: a fighter in an unknown frame standing in their
 * own guard is the least wrong thing to draw.
 */
export function intentFor(frame) {
  if (REFERENCE.test(frame)) return "reference";
  if (INTENT_OF[frame]) return INTENT_OF[frame];
  const beat = /_([ab])$/.exec(frame);
  const beatless = frame.replace(/_[abc]$/, "");
  if (beat && BEATS[beatless]) return BEATS[beatless][beat[1] === "a" ? 0 : 1];
  if (INTENT_OF[beatless]) return INTENT_OF[beatless];
  let best = null;
  for (const key of Object.keys(INTENT_OF)) {
    if ((beatless === key || beatless.startsWith(`${key}_`))
        && (!best || key.length > best.length)) best = key;
  }
  return best ? INTENT_OF[best] : "stance";
}

/**
 * A pose, mirrored across the fighter's own midline.
 *
 * Left and right bones swap, and the y and z angles negate while x does not.
 * That is not a guess: a rotation is a pseudovector, so reflecting through a
 * plane preserves the component along the plane's NORMAL and flips the rest —
 * and the mirror plane here is the sagittal one, whose normal is the lateral
 * axis that x turns about.
 */
export function mirrorPose(pose) {
  const out = {};
  for (const [bone, [x, y, z]] of Object.entries(pose)) {
    const other = bone.startsWith("Left") ? `Right${bone.slice(4)}`
      : bone.startsWith("Right") ? `Left${bone.slice(5)}` : bone;
    out[other] = [x, -y, -z];
  }
  return out;
}

/**
 * Intents whose `_a` and `_b` are the two SIDES of one cycle rather than two
 * moments of one move. Without this the baseline hands `run_reach_a` and
 * `run_reach_b` the same pose and the fighter runs by hopping on one leg —
 * which is what it did until the intent-divergence check noticed that Yuji's
 * matched `run_reach_b` was 28° away from a baseline it should have matched.
 */
const TWO_SIDED = new Set(["stride_reach", "stride_pass", "stride_contact"]);

/**
 * The baseline pose for a frame, and the intent it came from. NEVER null —
 * that is the contract this file exists to keep, and tools/check_battle_poses.mjs
 * enforces it over every frame name on every sheet.
 */
const _mirrored = new Map();

export function baselinePose(frame) {
  const intent = intentFor(frame);
  const pose = INTENT_POSES[intent] || INTENT_POSES.stance;
  if (!TWO_SIDED.has(intent) || !/_b$/.test(frame)) return { intent, pose };
  if (!_mirrored.has(intent)) _mirrored.set(intent, mirrorPose(pose));
  return { intent, pose: _mirrored.get(intent), mirrored: true };
}

/**
 * HEIGHTS a strike can be aimed at, as a fraction of the fighter's own height.
 * Taken from the mannequin's own skeleton (render3d/src/mannequin.js) so they
 * mean the same thing on a fighter of any size: hips at 0.53, chest where
 * Spine2 sits, head where the Head bone does.
 */
export const HEIGHTS = {
  ground: 0, ankle: 0.06, shin: 0.25, hip: 0.53, chest: 0.72, head: 0.86,
};

/**
 * WHERE THE POSE HAS TO REACH, and with what.
 *
 * A pose can be anatomically perfect and useless: an overhand meant to smash
 * the floor is not that move if the fist stops at hip height, and a low sweep
 * that arrives at chest height is a different attack. The body says what the
 * fighter is DOING; this says what they are doing it TO, which is the half a
 * pose table normally leaves to be noticed later by eye.
 *
 * It is also the half that can be checked. `tools/check_battle_poses.mjs`
 * fails on a contact naming a bone or a height that does not exist, and the
 * editor prints how far the pose actually falls short.
 */
export const CONTACTS = {
  // SHIN, not ground, and the difference is a judgement worth writing down.
  // A standing shoulder is 1.45m up and an arm is 0.55m, so a fist reaches the
  // floor only from a kneel — and posing the fold that gets there lays the
  // fighter out flat, which is a dive rather than a smash. Look at what the
  // drawings actually do: the fist lands around shin height and the impact
  // EFFECT is what sits on the floor under it. Aiming at the floor makes a
  // worse pose and a truer-sounding number.
  strike_down: { bone: "RightHand", at: "shin", why: "an overhand down at the legs" },
  strike_straight: { bone: "RightHand", at: "chest", why: "a cross to the body" },
  strike_up: { bone: "RightHand", at: "head", why: "an uppercut through the chin" },
  strike_sweep: { bone: "RightHand", at: "shin", why: "a low sweep at the legs" },
  strike_push: { bone: "RightHand", at: "chest", why: "a two-handed push to the body" },
  crouch_strike: { bone: "RightHand", at: "shin",
                   why: "the brief: extended at ankle-to-knee height, staying down" },
  air_strike: { bone: "RightHand", at: "chest", why: "a cross thrown from the air" },
  air_wind: null, land: { bone: "RightHand", at: "ground", why: "a hand posted on the landing" },
};

/**
 * WHAT IS ON THE FLOOR. Everything here is planted — the preview drops the
 * root until the lowest of its bones sits on the ground line — and everything
 * NOT here is in the air and stays where the pose puts it.
 *
 * This is not a detail. Without it nothing in the preview touches anything:
 * an idle floats seven centimetres up, a crouch floats thirty, and the
 * question "does the fist reach the floor" has no meaning because the floor is
 * not where the fighter is standing.
 */
export const AIRBORNE = new Set([
  "jump", "fall", "air_wind", "air_strike", "evade_twist", "evade_ball",
  "hang", "grabbed", "stride_reach", "stride_pass",
]);

/** The contact a frame has to make, or null. Keyed by intent, so a matched
 *  pose and the baseline it overrides are held to the same target. */
export function contactFor(frame) {
  return CONTACTS[intentFor(frame)] || null;
}

export const INTENTS = Object.keys(INTENT_POSES);
