// THE GAIT TABLE — the walk/run cycle as DATA, not as code buried in the animator.
//
// Every mech's locomotion used to be one hard-coded block of sines in
// animator.js: one set of amplitudes for a 6.5-speed colossus and a 13.5-speed
// viper alike, differing only by `ratio = speed / maxSpeed`. That is why the
// fast mechs read as stiff — at full throttle they ran the SAME stride a heavy
// runs at full throttle, just faster.
//
// A GAIT is a named bundle of those numbers. A roster def names one
// (`gait: 'sprint'`), several mechs SHARE one (that is the point: tune
// 'sprint' once and viper, tempest, wraith and nova all move), and a mech that
// names none gets `standard`. `applyGait()` below is the whole cycle, and it is
// what the animator runs — the gait workbench (`/workbench/?edit=gait`) drives
// this exact function, so what you tune there is what ships.
//
// SHAPE OF A GAIT
//   legs   the stride itself: thigh swing, forward reach, knee lift, track width
//   ankle  the foot roll and the toe-off push
//   arms   the counter-swing: shoulder pitch, elbow bend/pump, how tucked in
//   body   what the torso does with all of it: bob, pitch, lean, twist, head
//   quad   OPTIONAL — the four-legged gallop layer (fenrir), which rides on top
//
// EVERY NUMBER IS IN RADIANS unless the schema below says otherwise, and every
// `*Run` twin is the amount ADDED AT FULL SPEED (`base + run * ratio`), which is
// how a gait can walk politely and sprint hard without a second table.
//
// CONVENTIONS (the animator's virtual rig, see rigadapter JOINT_ORDER):
//   thigh/shoulder pitch  NEGATIVE = forward, positive = back — the SAME sense
//                          for an arm as for a leg, which is the trap that had
//                          the arms swinging with the legs (see applyGait)
//   knee pitch            POSITIVE = folded
//   thigh roll (z)        POSITIVE pulls the LEFT leg toward the midline
//                          (the right leg mirrors), so `adduct` narrows the track
//   head pitch            NEGATIVE = eyes up
import { lerp, clamp01, TAU as TAU_ } from '../core/utils.js';

export const DEFAULT_GAIT = 'standard';

// HOW MUCH HIGHER THAN THE OTHER FOOT this one has to be before it counts as
// fully AIRBORNE, as a fraction of the leg's length. This is the switch between
// the foot's two jobs — flat on the pavement below it, hanging off the shin above
// it — and it is deliberately a soft one: a foot crosses it as it lands, so the
// sole rolls level into the plant instead of snapping flat.
const LIFT_BAND = 0.045;

// …and how far the leg has to swing BEHIND its rest direction (radians of thigh +
// knee) before a foot still on the ground counts as fully PUSHING OFF rather than
// standing. ~29 degrees, so the push builds through the back half of stance.
const TRAIL_BAND = 0.5;

/**
 * How much this foot is IN THE AIR: 0 standing on it, 1 clear of the ground.
 *
 * FIRST CHOICE is the measurement: a calibrated body knows the real distance from
 * each boot to the pavement (Animator.soleClearanceBySide, handed over as
 * `env.footClr`), and nothing beats that — a deep-booted heavy can have its ankle
 * a quarter of a body height up with the sole still planted.
 *
 * WITHOUT ONE (procedural bodies, and the quadruped, whose hock calibrateFeet
 * skips) it falls back to how much HIGHER this foot hangs than the other one,
 * from the leg's own geometry: thigh and shin projected on vertical, both from the same hips.
 * The comparison is what makes it work without knowing where the ground is — a
 * walking body always has a foot down, so the LOWER foot is the one standing and
 * the other is up by the difference. (Absolute leg length cannot answer it: a leg
 * that shortens in stance is the body squatting over a planted foot, not the foot
 * rising, and reading it that way had every foot "airborne" all cycle.)
 *
 * Two reasons it is done from the pose rather than from the gait phase or a world
 * measurement:
 *
 *  · it is a fact about the FINISHED stride, so it does not care WHICH layer bent
 *    the leg. Fenrir's hinds are moved by the biped layer AND by a gallop running
 *    at its own rate (`quad.stride`); no single phase window describes where his
 *    paws are, and any gait added later would need its own.
 *  · it stays a pure function of the pose, so the gait workbench measures exactly
 *    what the game runs.
 */
function airWeight(tgt, rest, side, env = {}) {
  const thighL = env.thighLen || 1, shinL = env.shinLen || 1;
  // MEASURED, where the body has been calibrated: the real gap between this
  // boot and the pavement, from last frame's draw (Animator.soleClearanceBySide).
  const clr = env.footClr?.[side];
  if (typeof clr === 'number' && Number.isFinite(clr)) {
    return clamp01(clr / (LIFT_BAND * (thighL + shinL)));
  }
  const r = (j) => (rest?.[j]?.[0] || 0);
  const reach = (sd) => {
    const t = tgt['thigh' + sd][0], k = tgt['knee' + sd][0];
    return thighL * Math.cos(t) + shinL * Math.cos(t + k);
  };
  const other = side === 'L' ? 'R' : 'L';
  if (!tgt['thigh' + other] || !tgt['knee' + other]) return 0;
  const lift = (reach(other) - reach(side)) / (thighL + shinL);
  return clamp01(lift / LIFT_BAND);
}

/**
 * A FOOT IS ALWAYS IN ONE OF THREE STATES, and each one wants something different:
 *
 *   stance   flat on the ground, whatever the leg above it is doing
 *   push     planted but BEHIND the body: the toe stays down while the leg
 *            straightens and the heel lifts, so the foot pivots over the toe and
 *            ends up angled hard down relative to the shin — the most plantar-flexed
 *            moment of the whole cycle
 *   air      off the ground: nothing holds it at any angle to the WORLD, so it hangs
 *            at its resting angle to the shin
 *
 * The weights come from the pose, never from a phase window: `air` is measured
 * (Animator.soleClearanceBySide) or inferred, and `back` is how far the leg has
 * swung behind its rest direction. They sum to 1, so a foot is always fully
 * described and the transitions are crossfades rather than switches.
 */
function footStates(tgt, rest, side, env) {
  const r = (j) => (rest?.[j]?.[0] || 0);
  const air = env.air ? env.air[side] : airWeight(tgt, rest, side, env);
  const back = clamp01(((tgt['thigh' + side][0] - r('thigh' + side))
    + (tgt['knee' + side][0] - r('knee' + side))) / TRAIL_BAND);
  const push = (1 - air) * back;
  return { air, back, push, stance: (1 - air) * (1 - back) };
}

// ---------------------------------------------------------------------------
// THE PARAMETER SCHEMA. One entry per dial: what it is called, what it does,
// what range is sane, and WHICH JOINTS it moves — the workbench builds its
// sliders from this list and uses `joints` to work out which dial a dragged
// limb belongs to. Adding a parameter here + reading it in applyGait() is the
// whole cost of a new gait dial.
// ---------------------------------------------------------------------------
export const GAIT_SCHEMA = [
  {
    id: 'legs', label: 'Legs — the stride',
    params: [
      { key: 'swing', label: 'thigh swing', min: 0, max: 1.6, step: 0.01, joints: ['thighL', 'thighR'],
        help: 'stride amplitude at a standstill-to-walk pace' },
      { key: 'swingRun', label: 'thigh swing @run', min: 0, max: 1.6, step: 0.01, joints: ['thighL', 'thighR'],
        help: 'extra stride amplitude added at full speed' },
      { key: 'reach', label: 'forward reach', min: -1.2, max: 1.2, step: 0.01, joints: ['thighL', 'thighR'],
        help: 'asymmetric extra swing on the FORWARD half — the leg reaching out ahead. NEGATIVE is '
          + 'legitimate for the same reason `extend` is: on a body whose thighs are carried out sideways '
          + 'rather than under the hips (the arthropod) the joint reads the other way round' },
      { key: 'extend', label: 'rear extension', min: -2, max: 1.2, step: 0.01, joints: ['thighL', 'thighR'],
        help: 'asymmetric extra swing BEHIND — the trailing leg finishing its push. NEGATIVE is legitimate: '
          + 'on a body whose hips are carried horizontally (the quadruped) the same joint reads the other '
          + 'way round, so his rear extension is a negative number' },
      { key: 'adduct', label: 'track narrow', min: -0.5, max: 0.6, step: 0.005, joints: ['thighL', 'thighR'],
        help: 'hip roll toward the midline: positive brings the feet under the body' },
      { key: 'adductRun', label: 'track narrow @run', min: -0.5, max: 0.6, step: 0.005, joints: ['thighL', 'thighR'],
        help: 'extra midline pull at full speed (a runner tracks nearly single-file)' },
      { key: 'adductTrail', label: 'trailing flick inward', min: -0.5, max: 0.6, step: 0.005, joints: ['kneeL', 'kneeR'],
        help: 'midline pull on the leg that is BEHIND AND OFF THE GROUND — the flick after '
          + 'toe-off. Fades as the leg swings forward, so the foot lands at its normal width '
          + 'and a PLANTED foot is never pulled sideways (that would be a skate)' },
      { key: 'stanceBend', label: 'knee stance bend', min: -1.2, max: 1.0, step: 0.01, joints: ['kneeL', 'kneeR'],
        help: 'springy knees that never lock. Negative on a leg whose knee folds the other way — the '
          + 'arthropod stands on splayed legs whose stifle opens where a humanoid knee closes' },
      { key: 'stanceBendRun', label: 'knee bend @run', min: -1.2, max: 1.0, step: 0.01, joints: ['kneeL', 'kneeR'] },
      { key: 'kneeLift', label: 'knee lift', min: 0, max: 2.4, step: 0.01, joints: ['kneeL', 'kneeR'],
        help: 'how far the swing leg folds up under the body' },
      { key: 'kneeLiftRun', label: 'knee lift @run', min: 0, max: 2.4, step: 0.01, joints: ['kneeL', 'kneeR'] },
      { key: 'kneePhase', label: 'knee phase', min: -3.14, max: 3.14, step: 0.01, joints: ['kneeL', 'kneeR'],
        help: 'where in the cycle the fold peaks (radians of lead over the thigh)' },
      // WHERE THE LEG CYCLE SITS ON THE BEAT. Everything else in this group
      // shapes the stride; this one slides the whole thing round the clock,
      // against the body (bob, yaw, roll) which stays on the raw phase.
      { key: 'phase', label: 'leg phase offset', min: -3.14, max: 3.14, step: 0.01,
        joints: ['thighL', 'thighR', 'kneeL', 'kneeR', 'ankleL', 'ankleR'],
        help: 'radians the LEG cycle runs ahead of the beat. The legs keep their own alternation '
          + '(L and R stay half a cycle apart) — what moves is where they sit relative to the arms '
          + 'and the body bob. π swaps which leg leads' },
      // THE RANGE IS THE SANE BAND FOR A BIPED, NOT A LIMIT. A body whose legs
      // cannot swing far — six short splayed crab legs — covers the same ground
      // by taking many more, much shorter steps, and the honest way to say that
      // is a small `cadence` and a high cap. Both ends are widened for it: the
      // alternative is a mech whose feet cannot keep up with the floor.
      { key: 'cadence', label: 'cadence reach', min: 0.1, max: 1.6, step: 0.01, joints: [],
        help: 'fraction of leg length a stride is assumed to cover — SMALLER = faster steps for the same ground speed' },
      { key: 'cadenceCap', label: 'cadence cap', min: 4, max: 60, step: 0.5, joints: [],
        help: 'ceiling on steps per second (rad/s of gait phase)' },
    ],
  },
  {
    id: 'ankle', label: 'Ankle — foot roll & push',
    params: [
      { key: 'roll', label: 'roll', min: 0, max: 1.2, step: 0.01, joints: ['ankleL', 'ankleR'],
        help: 'heel-to-toe roll, as a fraction of the thigh swing' },
      { key: 'tilt', label: 'toe-down bias @run', min: -0.8, max: 0.4, step: 0.01, joints: ['ankleL', 'ankleR'] },
      { key: 'push', label: 'foot angle at full back extension', min: 0, max: 2.0, step: 0.01,
        joints: ['ankleL', 'ankleR'],
        help: 'THE ANGLE THE FOOT ENDS UP AT, relative to the shin, when the leg is planted and fully behind '
          + 'the body — the toe down, the heel up, pushing off. It is an absolute target, not an offset, so '
          + 'this dial (plus its @run twin) is the whole answer: 1.57 = 90°, 0.79 = 45°. The WINDOW is not a '
          + 'dial — planted AND behind is worked out from the pose' },
      { key: 'pushRun', label: 'toe-off @run', min: 0, max: 2.0, step: 0.01, joints: ['ankleL', 'ankleR'] },
      { key: 'level', label: 'sole levelling on the ground', min: 0, max: 1, step: 0.01, joints: ['ankleL', 'ankleR'],
        help: 'how hard to keep the sole FLAT ON THE GROUND while the foot is planted, over and above what '
          + "the model's own foot-depth calibration already asks for. Bodies the calibration skips (the "
          + 'quadruped) need it here or their feet land at whatever angle the leg left them' },
      { key: 'hang', label: 'toe past rest @airborne', min: -0.4, max: 1.0, step: 0.01, joints: ['ankleL', 'ankleR'],
        help: 'extra plantar flex PAST the resting foot line, radians, while the foot is OFF THE GROUND. '
          + '0 means the foot simply hangs at its natural angle to the shin (perpendicular, for a body built '
          + 'that way) — which is the rule; a runner points the toe a little past it (~0.26 = 15°). The '
          + 'alignment itself is not optional and needs no dial' },
    ],
  },
  {
    id: 'arms', label: 'Arms — the counter-swing',
    params: [
      { key: 'swing', label: 'shoulder swing', min: 0, max: 2.2, step: 0.01, joints: ['shoulderL', 'shoulderR'],
        help: 'arm swing as a fraction of the thigh swing — 1.0 means the arms match the legs' },
      { key: 'swingRun', label: 'shoulder swing @run', min: 0, max: 2.2, step: 0.01, joints: ['shoulderL', 'shoulderR'] },
      { key: 'lift', label: 'shoulder lift @run', min: -0.8, max: 0.8, step: 0.01, joints: ['shoulderL', 'shoulderR'],
        help: 'constant pitch added at speed: negative carries the hands high, boxer-style' },
      { key: 'elbow', label: 'elbow bend', min: 0, max: 2.0, step: 0.01, joints: ['elbowL', 'elbowR'] },
      { key: 'elbowRun', label: 'elbow bend @run', min: 0, max: 2.0, step: 0.01, joints: ['elbowL', 'elbowR'],
        help: 'a sprinter holds ~90°; a walker lets them hang' },
      { key: 'elbowPump', label: 'elbow pump', min: 0, max: 1.6, step: 0.01, joints: ['elbowL', 'elbowR'],
        help: 'extra fold on the forward half of each arm swing' },
      { key: 'tuck', label: 'arm tuck @run', min: -0.6, max: 0.8, step: 0.01, joints: ['shoulderL', 'shoulderR'],
        help: 'roll the arms in toward the ribs instead of leaving them winged out' },
      { key: 'cross', label: 'arm cross @run', min: -0.8, max: 0.8, step: 0.01, joints: ['shoulderL', 'shoulderR'],
        help: 'yaw the forward-swinging arm across the chest' },
      // THE ARM CYCLE'S OWN PLACE ON THE BEAT — the dial that answers "which
      // leg does this arm (or foreleg) answer to?".
      { key: 'phase', label: 'arm phase offset', min: -3.14, max: 3.14, step: 0.01,
        joints: ['shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'handL', 'handR'],
        help: 'radians the ARM cycle runs ahead of the leg cycle, carrying the elbow pump, the cross '
          + 'and — on a foreleg gait — the claw plant/lift window with it. 0 is the counter-swing '
          + 'every humanoid gait wants (left leg forward, left arm back). π SWAPS which arm answers '
          + 'which leg, which is how a foreleg is matched to the other diagonal; anything in between '
          + 'slides the claw touchdown onto the footfall you want it on' },
      // ---- FORELEGS: the arms as a second pair of legs (arthropod — jerry).
      //      All four are 0 on a humanoid gait and the block never runs.
      { key: 'carry', label: 'foreleg carry', min: -1.2, max: 1.2, step: 0.01, joints: ['shoulderL', 'shoulderR'],
        help: 'constant shoulder pitch that PLANTS the claws on the ground — the standing posture of a '
          + 'limb that walks, applied at every speed (unlike lift, which rides the throttle). Sign is '
          + 'body-dependent: measure where the claw tips actually land' },
      { key: 'foldClear', label: 'foreleg fold to clear', min: 0, max: 1.6, step: 0.01, joints: ['elbowL', 'elbowR'],
        help: 'elbow fold on the RECOVERY half of the stride — a front leg lifts to clear the ground '
          + 'while it swings forward, then extends to plant. Fades back out through the planted sweep' },
      { key: 'handGround', label: 'claw ground align', min: 0, max: 1, step: 0.01, joints: ['handL', 'handR'],
        help: 'how hard to keep the PLANTED claw parallel to the ground, the way footFlat levels a '
          + 'planted sole: the wrist cancels what the hips + shoulder + elbow pitched into it, fading '
          + 'as the limb lifts. 0 on a humanoid — hands are not feet there' },
      { key: 'handClear', label: 'claw lift in the air', min: -1.2, max: 1.2, step: 0.01, joints: ['handL', 'handR'],
        help: 'wrist pitch on the SWINGING claw, so the tip clears the ground on recovery instead of '
          + 'ploughing a furrow forward' },
    ],
  },
  {
    id: 'body', label: 'Body — what the torso does with it',
    params: [
      { key: 'bob', label: 'hip bob', min: 0, max: 0.8, step: 0.01, joints: ['hipsPos'],
        help: 'vertical drop on each push-off beat (scaled by body size)' },
      { key: 'pitch', label: 'hip pitch', min: -0.4, max: 0.9, step: 0.01, joints: ['hipsRot'],
        help: 'the whole frame tipping into the run' },
      { key: 'yaw', label: 'hip yaw', min: 0, max: 0.5, step: 0.005, joints: ['hipsRot'] },
      { key: 'roll', label: 'hip roll', min: 0, max: 0.4, step: 0.005, joints: ['hipsRot'] },
      { key: 'lean', label: 'torso lean', min: -0.3, max: 1.0, step: 0.01, joints: ['torso'],
        help: 'upper body angled forward at full speed' },
      { key: 'twist', label: 'torso counter-twist', min: 0, max: 0.6, step: 0.01, joints: ['torso'] },
      { key: 'head', label: 'head level', min: -1.0, max: 0.4, step: 0.01, joints: ['head'],
        help: 'negative pitches the head UP so the eyes stay on the horizon under a lean' },
    ],
  },
  {
    // A TAIL IS NOT A LIMB. It is not one of the 15 game joints, nothing
    // retargets onto it, and only some bodies have one — so this group is
    // OPTIONAL and a gait that has no `tail` block simply never shows it. What
    // it drives is a chain of extra bones on a custom rig (`tail0`, `tail1`, …
    // — fenrir's blade), through applyTailGait below.
    id: 'tail', label: 'Tail — the blade', optional: true,
    params: [
      { key: 'droop', label: 'relax downward', min: -1.2, max: 1.2, step: 0.01,
        joints: ['tail0', 'tail1', 'tail2', 'tail3', 'tail4', 'tail5'],
        help: 'total radians of DOWN, spread along the chain and weighted toward the tip — a tail '
          + 'carried heavy rather than held out. Negative lifts it instead' },
      { key: 'straight', label: 'straighten the resting curve', min: 0, max: 1, step: 0.01,
        joints: ['tail0', 'tail1', 'tail2', 'tail3', 'tail4', 'tail5'],
        help: 'how much of the tail\'s OWN bind curve to take back out, segment by segment. The curve '
          + 'is in the rig\'s bone positions, not in any rotation, so this is measured off the chain '
          + 'itself (see tailChainOf) and cancelled: 0 leaves the sculpted droop, 1 lays the whole '
          + 'blade out along its first segment' },
      { key: 'sway', label: 'wag', min: 0, max: 0.5, step: 0.005,
        joints: ['tail0', 'tail1', 'tail2', 'tail3', 'tail4', 'tail5'],
        help: 'horizontal sweep per segment, radians. It BEATS WITH THE STRIDE — the wave is driven '
          + 'off the gait phase, not off a clock — which is what makes it read as the tail answering '
          + 'the body rather than wagging on its own' },
      { key: 'swayRun', label: 'wag @run', min: 0, max: 0.5, step: 0.005,
        joints: ['tail0', 'tail1', 'tail2', 'tail3', 'tail4', 'tail5'],
        help: 'extra sweep at full speed, on top of `wag`' },
      { key: 'lag', label: 'whip — lag down the chain', min: 0, max: 2.5, step: 0.01,
        joints: ['tail0', 'tail1', 'tail2', 'tail3', 'tail4', 'tail5'],
        help: 'radians of phase the TIP runs behind the root. 0 swings the whole tail as one rigid '
          + 'blade; turn it up and the wave travels outward and the tip trails, which is the whole '
          + 'difference between a stick and something with weight on the end of it' },
      { key: 'lift', label: 'vertical float', min: 0, max: 0.4, step: 0.005,
        joints: ['tail0', 'tail1', 'tail2', 'tail3', 'tail4', 'tail5'],
        help: 'up-and-down undulation, at twice the wag\'s rate — the tail rising on the gather and '
          + 'settling on the drive' },
      { key: 'idle', label: 'wag speed at a standstill', min: 0, max: 4, step: 0.05,
        joints: ['tail0', 'tail1', 'tail2', 'tail3', 'tail4', 'tail5'],
        help: 'the gait phase barely advances when the mech is not moving, so a wag driven purely by '
          + 'it freezes on the spot and the tail reads as dead weight. This is the slow drift added '
          + 'on top, radians per second — it is what keeps a standing wolf alive. It is a RATE, so '
          + 'the workbench sweeps it a second along the tail\'s own clock to have something to '
          + 'measure (see `tailT` in the adapter)' },
    ],
  },
  {
    // THE OTHER FOUR LEGS. Same deal as the tail: these are not the 15 game
    // joints, nothing retargets onto them, and only some bodies have them — so
    // the group is OPTIONAL and a gait without a `hex` block never shows it.
    //
    // A hexapod's BACK pair carries the game leg joints (cranky's thighL/thighR
    // ARE his back-left and back-right crab legs), so the stride, the knee lift
    // and the foot rules above already drive two of the six. This group drives
    // the other four, off the SAME gait phase, in the tripod an insect walks on:
    // front-left + mid-right + back-left step together, then the other three.
    // Which leg is in which tripod is DERIVED from the rig (see hexLegsOf), not
    // listed here, so it stays right on a body with the legs somewhere else.
    id: 'hex', label: 'Extra legs — the hexapod tripod', optional: true,
    params: [
      { key: 'sweep', label: 'fore-aft sweep', min: 0, max: 1.2, step: 0.01,
        joints: ['legFLhip', 'legMLhip', 'legFRhip', 'legMRhip'],
        help: 'how far each extra leg swings forward and back about the body\'s UP axis, radians. '
          + 'This is the stride these legs take: the foot travels twice this times its own '
          + 'horizontal distance from the hip, and that has to keep up with the floor' },
      { key: 'sweepRun', label: 'fore-aft sweep @run', min: 0, max: 1.2, step: 0.01,
        joints: ['legFLhip', 'legMLhip', 'legFRhip', 'legMRhip'] },
      // THE ONE THAT MAKES IT AN ARTHROPOD RATHER THAN A SHORT HUMANOID.
      { key: 'yaw', label: 'swing AROUND the hip, not under it', min: 0, max: 1, step: 0.01,
        joints: ['legFLhip', 'legMLhip', 'legFRhip', 'legMRhip', 'thighL', 'thighR'],
        help: 'how much of the stride is a HORIZONTAL rotation about the body\'s up axis rather '
          + 'than a fore-aft pitch under the hip. 0 is what a humanoid does — the leg is a '
          + 'pendulum and the step is a PUSH-OFF. 1 is what a crab does — the leg lifts, swings '
          + 'round the hip like a hand on a clock face, and sets down again. It applies to all '
          + 'SIX legs: the four here directly, and the back pair by taking that fraction of its '
          + 'thigh pitch back out and putting the same swing in as yaw. Turning it up SHORTENS '
          + 'the step, because a splayed leg\'s foot sits further below its hip than out from it '
          + '— so `cadence` has to come down with it or the feet stop keeping up with the floor '
          + '(node tools/hexprobe.mjs says by how much)' },
      { key: 'lift', label: 'hip lift on recovery', min: -0.6, max: 1.2, step: 0.01,
        joints: ['legFLhip', 'legMLhip', 'legFRhip', 'legMRhip'],
        help: 'how far the hip raises the whole leg while it is swinging forward — half of the '
          + 'ground clearance (the knee fold below is the other half)' },
      { key: 'liftRun', label: 'hip lift @run', min: -0.6, max: 1.2, step: 0.01,
        joints: ['legFLhip', 'legMLhip', 'legFRhip', 'legMRhip'] },
      { key: 'fold', label: 'knee fold on recovery', min: -1.2, max: 1.2, step: 0.01,
        joints: ['legFLknee', 'legMLknee', 'legFRknee', 'legMRknee'],
        help: 'the knee tucking the foot up out of the way through the swing. On a leg that '
          + 'hangs nearly straight down this does most of the clearing, because rotating the '
          + 'hip mostly swings such a foot sideways rather than up' },
      { key: 'foldRun', label: 'knee fold @run', min: -1.2, max: 1.2, step: 0.01,
        joints: ['legFLknee', 'legMLknee', 'legFRknee', 'legMRknee'] },
      { key: 'liftPhase', label: 'lift phase', min: -3.14, max: 3.14, step: 0.01,
        joints: ['legFLhip', 'legMLhip', 'legFRhip', 'legMRhip'],
        help: 'where in the cycle the leg picks up, radians after the leg is furthest BACK. '
          + '1.57 lifts through the middle of the forward swing, which is the one that keeps '
          + 'the planted half of the stride on the floor' },
      { key: 'splay', label: 'leg splay', min: -0.8, max: 0.8, step: 0.01,
        joints: ['legFLhip', 'legMLhip', 'legFRhip', 'legMRhip'],
        help: 'constant hip rotation about the same axis as the lift: positive carries the legs '
          + 'out flatter and the shell lower, negative tucks them under' },
      { key: 'crouch', label: 'knee crouch', min: -1.2, max: 1.2, step: 0.01,
        joints: ['legFLknee', 'legMLknee', 'legFRknee', 'legMRknee'],
        help: 'constant knee bend — the standing shape of the leg, before any stride' },
      { key: 'lag', label: 'metachronal lag', min: -1.5, max: 1.5, step: 0.01,
        joints: ['legFLhip', 'legMLhip', 'legFRhip', 'legMRhip', 'legFLknee', 'legMLknee', 'legFRknee', 'legMRknee'],
        help: 'radians of phase each rank runs behind the one in front of it, ON TOP of the '
          + 'tripod. 0 is a rigid tripod (three legs land as one); turn it up and the step runs '
          + 'back down the body as a wave, which is what a real many-legged thing does' },
      { key: 'midAmp', label: 'mid pair amplitude', min: 0, max: 1.5, step: 0.01,
        joints: ['legMLhip', 'legMRhip', 'legMLknee', 'legMRknee'],
        help: 'scales everything above for the MIDDLE pair alone' },
      { key: 'frontAmp', label: 'front pair amplitude', min: 0, max: 1.5, step: 0.01,
        joints: ['legFLhip', 'legFRhip', 'legFLknee', 'legFRknee'],
        help: 'scales everything above for the FRONT pair alone — the pair that sits closest to '
          + 'a crab\'s pincer bases, where a big step can drag the claw skin with it' },
    ],
  },
  {
    id: 'quad', label: 'Quadruped gallop', optional: true,
    params: [
      { key: 'onset', label: 'drops to four legs at', min: 0, max: 1, step: 0.01, joints: [],
        help: 'the speed ratio where the gallop STARTS coming in. Below it the body runs its biped '
          + 'gait untouched — for fenrir that is the sprint gait, so he jogs like a runner and only '
          + 'goes quadruped when he opens up' },
      { key: 'snap', label: 'commit time (state transition)', min: 0, max: 1.5, step: 0.01,
        joints: [], runtime: true,
        help: 'SECONDS to cross from two legs to four, instead of crossing it by SPEED. 0 = off: the '
          + 'blend is `blend-in speed` below, a straight function of the throttle, so a mech held at '
          + 'the middle of that band stands there permanently half-galloping — fine for a body that '
          + 'genuinely mixes the two. Above 0 the crossing becomes a STATE TRANSITION: past `drops to '
          + 'four legs at` he commits to the gallop over this many seconds, below it he commits back, '
          + 'and the only time he is in between is while the animation is blending. A fenrir thing. '
          + '(Poses nothing on its own — it is a rate, and it needs the animator\'s memory, so the '
          + 'workbench\'s throttle slider still previews the speed ramp underneath it.)' },
      { key: 'blend', label: 'blend-in speed', min: 0.05, max: 1, step: 0.01, joints: [],
        help: 'ratio span over which the gallop takes over from the biped stride, starting at the '
          + 'onset above: onset + this = fully on four legs' },
      { key: 'stride', label: 'stride length', min: 0.4, max: 1.6, step: 0.01, joints: [] },
      { key: 'lag', label: 'rotary lag', min: 0, max: 1.2, step: 0.01, joints: [],
        help: 'phase offset inside each pair, so the two hinds do not land as one' },
      { key: 'bodyPitch', label: 'body pitch', min: 0, max: 1.4, step: 0.01, joints: ['hipsRot'] },
      { key: 'bodyArch', label: 'body arch', min: 0, max: 0.6, step: 0.01, joints: ['hipsRot'] },
      { key: 'drop', label: 'chest drop', min: 0, max: 0.7, step: 0.01, joints: ['hipsPos'] },
      { key: 'heave', label: 'suspension heave', min: 0, max: 0.6, step: 0.01, joints: ['hipsPos'] },
      { key: 'frontReach', label: 'front reach', min: 0.4, max: 2.2, step: 0.01, joints: ['shoulderL', 'shoulderR'] },
      { key: 'frontSwing', label: 'front swing', min: 0, max: 1.6, step: 0.01, joints: ['shoulderL', 'shoulderR'] },
      { key: 'frontRake', label: 'front rake', min: 0, max: 1.6, step: 0.01, joints: ['shoulderL', 'shoulderR'] },
      { key: 'frontFold', label: 'front fold', min: 0, max: 2.4, step: 0.01, joints: ['elbowL', 'elbowR'] },
      // The gallop's OWN stride shaping, so the biped layer underneath can stay a
      // clean sprint. `legs.reach`/`legs.extend` are shared with every mech on the
      // base gait and apply at every speed; these two only exist once the gallop
      // is in, which is what lets one body jog like a runner and gallop like a wolf.
      { key: 'hindReach', label: 'hind reach', min: -1, max: 2, step: 0.01, joints: ['thighL', 'thighR'],
        help: 'extra forward reach on the hinds, ON TOP of the base gait, faded in with the gallop' },
      { key: 'hindExtend', label: 'hind extension', min: -2.5, max: 1.5, step: 0.01, joints: ['thighL', 'thighR'],
        help: 'extra rear extension on the hinds, on top of the base gait. NEGATIVE is right for a '
          + 'body whose hips are carried horizontally — the same joint reads the other way round' },
      { key: 'hindSwing', label: 'hind swing', min: 0, max: 2.0, step: 0.01, joints: ['thighL', 'thighR'],
        help: 'the hind thigh\u2019s own sweep: peak-to-peak range is twice this, so 1.57 is a 180\u00b0 stride' },
      { key: 'hindCarry', label: 'hind thigh carry', min: -1.5, max: 1.5, step: 0.01, joints: ['thighL', 'thighR'],
        help: 'where the hind thigh SITS, before the swing — the middle of the stride' },
      { key: 'hindFold', label: 'hind fold', min: -2.4, max: 2.4, step: 0.01, joints: ['kneeL', 'kneeR'] },
      { key: 'hindKneeCarry', label: 'hind knee carry', min: -2.0, max: 2.0, step: 0.01, joints: ['kneeL', 'kneeR'],
        help: 'where the hind knee SITS: this is what lifts the stifle up under the belly instead '
          + 'of letting it drag along the floor' },
      { key: 'hockSnap', label: 'hock snap', min: 0, max: 1.6, step: 0.01, joints: ['ankleL', 'ankleR'] },
      { key: 'hockCarry', label: 'hock carry', min: -2.0, max: 2.0, step: 0.01, joints: ['ankleL', 'ankleR'],
        help: 'where the hock SITS — the paw\u2019s angle under the leg through the whole gallop' },
    ],
  },
];

// ---------------------------------------------------------------------------
// …AND THE SAME DIALS AGAIN, AS "WHAT THIS GAIT TURNS INTO WHEN IT OPENS UP".
//
// A gait is one set of numbers scaled by `ratio`, which is enough for a body
// that does ONE thing faster. It is not enough for a body that does a DIFFERENT
// thing fast: fenrir jogs on two legs like a runner and gallops on four like a
// wolf, and those want different stride, different knees, different carriage —
// not the same numbers turned up.
//
// So a gait may carry a second copy of any of the four pose groups, under
// `runLegs` / `runAnkle` / `runArms` / `runBody`, and the gait MORPHS from the
// first into the second as the quadruped layer fades in (the same `q`, so the
// carriage and the gallop arrive together instead of fighting on the way).
// At the bottom the gait is exactly its base; at the top it is exactly the run
// table, which is what lets a hand-tuned gallop be restored verbatim and still
// have a sprinter's jog underneath it.
//
// The groups are DERIVED from the four they mirror, so a dial added above is a
// dial here too — including in the workbench, which builds its panel from this
// schema and will show `runLegs.reach` beside `legs.reach` with no edit there.
// ---------------------------------------------------------------------------
const MORPH_GROUPS = ['legs', 'ankle', 'arms', 'body'];
export const runGroupId = (id) => `run${id[0].toUpperCase()}${id.slice(1)}`;
for (const id of MORPH_GROUPS) {
  const src = GAIT_SCHEMA.find((g) => g.id === id);
  GAIT_SCHEMA.push({
    id: runGroupId(id),
    label: `${src.label} — AT FULL GALLOP`,
    optional: true,
    params: src.params.map((p) => ({
      ...p,
      help: `${p.help ? `${p.help}. ` : ''}THE VALUE AT FULL GALLOP: the gait crossfades to this `
        + 'one over the same speed band the quadruped layer fades in on, so this is the number '
        + 'that shapes the run and the one above is the number that shapes the jog',
    })),
  });
}

const GROUPS = GAIT_SCHEMA.map((g) => g.id);
/** Flat list of every dial: { group, key, label, min, max, step, joints, help }. */
export function gaitParamList() {
  return GAIT_SCHEMA.flatMap((g) => g.params.map((p) => ({ ...p, group: g.id, groupLabel: g.label })));
}

// ---------------------------------------------------------------------------
// THE GAITS
// ---------------------------------------------------------------------------
export const GAITS = {
  // The shipped walk: the numbers that lived in animator.js, unchanged. Every
  // mech that names no gait runs this, so editing it moves the whole roster.
  // (The one thing that DID change with the move is not a number — the arms
  // counter-swing the legs now instead of marching with them; see applyGait.)
  standard: {
    name: 'Standard',
    note: 'The all-purpose walk→run. Upright carriage, moderate stride, arms hanging.',
    legs: {
      swing: 0.42, swingRun: 0.40, reach: 0.51, extend: 0.47,
      adduct: 0.08, adductRun: 0, adductTrail: 0.25,
      stanceBend: 0.14, stanceBendRun: 0.14,
      kneeLift: 0.70, kneeLiftRun: 0.65, kneePhase: 1.05, phase: 0,
      cadence: 0.92, cadenceCap: 14,
    },
    ankle: { roll: 0.51, tilt: -0.10, push: 0.70, pushRun: 0.80, level: 0, hang: 0 },
    arms: { swing: 0.75, swingRun: 0, lift: 0, elbow: 0.25, elbowRun: 0, elbowPump: 0.30, tuck: 0, cross: 0, phase: 0 },
    body: { bob: 0.19, pitch: 0.10, yaw: 0.09, roll: 0.05, lean: 0.30, twist: 0.11, head: -0.22 },
  },

  // THE FAST TIER — viper, tempest, wraith, nova. A light mech at full throttle
  // is SPRINTING, and a sprint is not a walk played faster:
  //   · the lead leg reaches out ahead of the body and the trailing leg finishes
  //     its push behind it (reach + extend), instead of a symmetric pendulum;
  //   · the feet track close to the midline (adduct) rather than straddling a
  //     shoulder-width base — the "legs far apart" read;
  //   · the knees fold high and the toe-off is hard;
  //   · the arms drive from bent elbows, tucked in beside the ribs, swinging
  //     nearly as far as the legs — a runner's arms, not a stroller's;
  //   · the whole frame is pitched forward into it, head up, the way the jet
  //     flight pose leans (see the `hovering` block in animator.js).
  // All of it rides on `ratio`, so these mechs still WALK normally at low speed.
  sprint: {
    name: 'Sprint',
    note: 'Light, fast mechs at full tilt: long reaching stride, narrow track, driving bent arms, body pitched into it.',
    legs: {
      swing: 0.44, swingRun: 0.36, reach: 0.28, extend: 0.16,
      adduct: 0.105, adductRun: 0, adductTrail: 0.215,
      stanceBend: 0.14, stanceBendRun: 0.16,
      kneeLift: 0.72, kneeLiftRun: 0.86, kneePhase: 1.93, phase: 0,
      cadence: 0.95, cadenceCap: 16,
    },
    ankle: { roll: 0.55, tilt: -0.14, push: 0.75, pushRun: 0.85, level: 0, hang: 0.26 },
    arms: { swing: 0.78, swingRun: 0.89, lift: -0.10, elbow: 0.25, elbowRun: 0.55, elbowPump: 0.40, tuck: 0.18, cross: 0.12, phase: 0 },
    body: { bob: 0.21, pitch: 0.12, yaw: 0.10, roll: 0.05, lean: 0.46, twist: 0.15, head: -0.36 },
  },

  // JERRY — the shrimp. Two big claw-ARMS in front (the game's arm joints, his
  // strikers), two smaller true legs at the back (the leg joints, his walkers),
  // a body that is mostly shell. A humanoid walk read wrong on every count: the
  // long stride swung his stubby back legs like a man's, the counter-swing
  // pumped the great pincers back and forth like handbags, and the upright
  // carriage stood the shell up like a suit.
  //
  // An ARTHROPOD moves the other way round on all three:
  //   · the step is QUICK — a skitter: a low cadence reach so the step rate
  //     climbs fast with speed, and a higher cap. (The SIZE of the paddle is a
  //     tuned number and it ended up big; see the block on the legs below.)
  //   · the legs stay SPLAYED and CROUCHED: negative adduct pushes the track
  //     wide of his already-wide rest stance, and the stance bend keeps the
  //     body carried low between bent legs instead of vaulting over straight
  //     ones — on his backwards stifle that is a NEGATIVE number.
  //   · the CLAWS ARE NOT ARMS. No counter-swing to speak of; they ride
  //     RAISED and OUT in front (negative lift, wide negative tuck), elbows
  //     folded, with a small pump so they breathe with the cycle — a mantis
  //     carriage, weapons held ready, not pendulums.
  //   · the body stays LEVEL and LOW — small bob, little forward lean (a shell
  //     has no chest to pitch), but a distinct side-to-side WAGGLE (yaw + roll)
  //     which is the scuttle read.
  arthropod: {
    name: 'Arthropod',
    note: 'Crustacean scuttle: quick short skittering steps on splayed crouched legs, shell low and level with a side-to-side waggle, claws carried raised and ready.',
    // OWNER-TUNED on the GLB at full throttle. The three that moved furthest are
    // the three a shrimp does backwards: the swing got BIG (the back legs
    // paddle hard rather than mincing), `reach` and `stanceBend` both went
    // NEGATIVE — his thighs are carried out sideways and his stifle opens where
    // a humanoid knee closes, so the same number reads the other way round on
    // his body — and the track now narrows with speed instead of splaying
    // further (`adductRun`).
    legs: {
      swing: 0.57, swingRun: 0.51, reach: -1.0, extend: 0.14,
      adduct: -0.08, adductRun: 0.15, adductTrail: 0,
      stanceBend: -1.0, stanceBendRun: 0,
      kneeLift: 0.58, kneeLiftRun: 0.42, kneePhase: 1.15, phase: 0,
      cadence: 0.58, cadenceCap: 19,
    },
    ankle: { roll: 0.35, tilt: -0.06, push: 0.5, pushRun: 0.3, level: 0, hang: 0 },
    // THE CLAWS ARE THE FRONT LEGS — the biggest limbs on the body, so they
    // carry the bulk of the visible motion: a stride-sized swing (bigger than
    // the back legs'), a constant `carry` planting the tips on the ground, the
    // elbow folding to clear on the recovery swing, and the wrist doing ankle
    // work — `handGround` keeps the planted claw parallel to the ground the
    // way footFlat levels a planted sole, `handClear` tips the swinging one up.
    // The counter-swing already puts each claw on the beat of the OPPOSITE back
    // leg, which is the diagonal-couplet timing an insect actually walks on —
    // and `phase` below is the dial that slides that timing if a particular
    // claw should land with a particular foot instead.
    arms: {
      swing: 0.45, swingRun: 0.15, lift: 0, elbow: 0.15, elbowRun: 0,
      elbowPump: 0, tuck: -0.16, cross: 0,
      // carry measured on the GLB: -0.3 puts the planted tip at -0.5% of body
      // height (touchdown) with the swinging one clearing at +37%
      carry: -0.30, foldClear: 0.50, handGround: 0.8, handClear: 0.30,
      // WHICH FOOTFALL EACH CLAW LANDS ON. Measured on the shipped tune (
      // `node tools/gaitprobe.mjs jerry 1`): at 0 each claw reaches down with
      // the foot on its OWN side (8% of a cycle apart), and at π it swaps to
      // the DIAGONAL — right claw with left leg, 3% apart. Left at 0; the swap
      // is one slider away in /workbench/?edit=gait.
      phase: 0,
    },
    body: { bob: 0.11, pitch: 0.06, yaw: 0.16, roll: 0.08, lean: 0.12, twist: 0.05, head: -0.10 },
  },

  // CRANKY — SIX LEGS, ONE PHASE.
  //
  // His custom rig carries all six crab legs as real bones, and the BACK pair is
  // the game's own leg joints (thighL/kneeL/ankleL/footL IS the back-left leg).
  // So two of the six ride the ordinary stride above — including the foot rules,
  // which is what keeps his soles honest — and the `hex` block below drives the
  // other four off the SAME phase, in the tripod an insect walks on.
  //
  // HE ROTATES HIS LEGS, HE DOES NOT PUSH OFF THEM. `hex.yaw` 0.6 makes most of
  // the stride a flat swing ROUND each hip rather than a pendulum under it, on
  // all six legs, so the cycle reads lift -> rotate -> lower instead of the
  // humanoid drive. That is what an arthropod does, and it is the one dial the
  // whole rest of this table is arranged around.
  //
  // The numbers are then the no-skate solve, not taste. At full throttle he
  // covers 15.6 u/s; `cadence` fixes how much ground one step is asked to cover
  // (pi * legLen * cadence * swing), and every leg's arc is set so its foot
  // actually travels that far. What makes that arithmetic rather than guesswork
  // is that a leg has TWO lever arms and hexLegsOf measures both: a radian of
  // pitch carries the foot as far as it hangs BELOW the hip, a radian of yaw as
  // far as it sits OUT from it, and on these legs the second is a third to a half
  // of the first. So 60% yaw costs about a third of the step, and cadence comes
  // down 0.70 -> 0.48 to pay for it (2.75 u per step, against 4.01 before).
  // MEASURED, `node tools/hexprobe.mjs cranky` — travel over ground asked, per
  // leg: 1.11 / 1.12 / 1.11 / 1.26 / 0.97 / 0.95, where the roster's own baseline
  // (titanus, standard gait) is 0.73. Judge it in /workbench/?edit=gait&mech=cranky
  // with FOOTPRINTS on too: "landed" and the derived "u per step" beside it are
  // the two halves of the same claim.
  hexapod: {
    base: 'standard',
    name: 'Hexapod',
    note: 'Six-legged crab scuttle: a tripod of legs steps while the other three carry, shell level and low, pincers held up and ready.',
    // SHORT STEPS, MANY OF THEM. cadence 0.92 -> 0.48 is the crab admitting his
    // legs are not a biped's: at 0.92 the floor moved 7.9 u per step under a
    // foot that travelled 0.3, which is the "wiggling his legs and floating
    // along" the owner reported. (0.70 was the answer before the legs started
    // swinging round the hip instead of under it — see `hex.yaw` below.)
    legs: {
      swing: 0.35, swingRun: 0.20, reach: 0, extend: 0,
      adduct: 0, adductRun: 0, adductTrail: 0,
      stanceBend: 0.10, stanceBendRun: 0,
      kneeLift: 0.30, kneeLiftRun: 0.15, kneePhase: 1.57, phase: 0,
      cadence: 0.48, cadenceCap: 20,
    },
    // a crab's leg tip is a POINT, not a sole: little roll, a modest push, and
    // `level` doing the work of keeping the tip down through the stance
    ankle: { roll: 0.15, tilt: 0, push: 0.40, pushRun: 0.20, level: 0.3, hang: 0 },
    // THE PINCERS ARE NOT LEGS — they are carried. This is the old hard-coded
    // CRANKY_CARRY (glbanim.js) expressed as gait dials, which is what makes the
    // arm rows in the workbench mean something on him instead of sitting there
    // dead: `carry` raises both claws off the floor, `tuck` rolls them out to the
    // sides, and the swing/pump is the small sway of something heavy being
    // carried at speed. The no-droop floor in the profile still guarantees they
    // can never be driven back down through the pavement.
    //
    // OWNER-TUNED (?edit=gait on cranky at 100%) to hold the claws STILL: the
    // swing went to 0 outright — a pincer that big reads as flailing if it
    // pendulums with the stride at all — the tuck reversed to carry them out to
    // the sides rather than rolled in, and the carry came down to -0.57, which
    // is as high as they go before the elbows crowd the shell.
    arms: {
      swing: 0, swingRun: 0, lift: 0, elbow: 0, elbowRun: 0,
      elbowPump: 0.15, tuck: -0.15, cross: 0, phase: 0,
      carry: -0.57, foldClear: 0, handGround: 0, handClear: 0,
    },
    // a shell has no chest to pitch and no waist to twist: level, with the
    // side-to-side waggle that reads as a scuttle
    body: { bob: 0.05, pitch: 0, yaw: 0.10, roll: 0.06, lean: 0.04, twist: 0.02, head: 0 },
    hex: {
      sweep: 0.58, sweepRun: 0.32,
      // HE IS AN ARTHROPOD, SO HE ROTATES HIS LEGS RATHER THAN PUSHING OFF THEM:
      // 0.6 of the stride is a flat swing round the hip and only 0.4 is the
      // humanoid pendulum. It costs ground — a splayed foot sits ~1 u out from
      // its hip and ~2.4 u below it, so a radian of yaw carries it less than half
      // as far as a radian of pitch — which is what the cadence above pays for.
      yaw: 0.6,
      // A YAW SWING DOES NOT LIFT THE FOOT — that is the other half of the trade.
      // A pendulum raises its own foot at both ends of the arc for free; a leg
      // swinging flat round the hip stays at exactly the height it started, so
      // every bit of "lift, rotate, lower" has to come from these two. They went
      // up by half again when the yaw came in, which is what puts the clearance
      // back (measured, peak foot travel as a fraction of body height: front pair
      // 13/16% before the bump, 19/24% after; mid pair 23/25% -> 31/33%).
      lift: 0.34, liftRun: 0.16,
      fold: 0.62, foldRun: 0.26,
      liftPhase: 1.57, splay: 0, crouch: 0,
      // a touch of wave down the body rather than three legs landing as one
      lag: 0.35,
      // …and the two pairs are trimmed against each other, because this rig's
      // legs are NOT equal: the mid pair's feet sit barely half a unit out from
      // their hips, so a yaw-heavy stride shortchanges them most and they need
      // the bigger arc to keep up. The front pair sits against the pincer bases
      // and steps a little smaller for the opposite reason — big steps there
      // drag the claw skin with them.
      midAmp: 1.25, frontAmp: 0.80,
    },
  },

  // FENRIR — A SPRINTER WHO OPENS INTO A WOLF.
  //
  // TWO TABLES, ONE GAIT. `base: 'sprint'` is his slow end: below `quad.onset`
  // nothing here applies and what runs is the sprint gait verbatim — driving
  // bent arms, narrow track, frame pitched into it. He JOGS LIKE A RUNNER. The
  // `run*` blocks are his fast end: THE OWNER'S TUNED GALLOP, copied in
  // unchanged, and the gait crossfades into them over exactly the band the
  // quadruped layer fades in on. At full throttle every dial is that table to
  // the last digit, so the gallop is the one he tuned and not an approximation
  // of it.
  //
  // The first attempt at this made the run inherit sprint too, with the stride
  // shaping moved into `quad.hindReach`/`hindExtend`. Stride survived the port;
  // the carriage did not — sprint's knees, bob and lean rode along and put him
  // 5 points of body height deeper through the floor. Hence two whole tables
  // rather than a base plus patches: the run end is not a variation on a
  // sprinter, it is a different animal, and the honest way to say that is to
  // write it out.
  quad: {
    // BASE `standard`, not `sprint`. He is not a runner who drops onto all
    // fours — below the onset he is a plain biped jogging, and above it he is a
    // wolf. Two states with a transition between them, which is what `snap`
    // below enforces; nothing should ever see him half-way for longer than the
    // blend takes.
    base: 'standard',
    name: 'Quadruped',
    note: 'A standard jog that COMMITS into a wolf gallop: hinds drive as a pair against the fronts, spine arching on the gather.',
    // his own rear extension, a walk-table dial: shorter than standard's so his
    // back feet stop passing through the blade-tail behind him. Only fenrir runs
    // this gait, so `standard` itself is untouched.
    legs: { extend: -0.93 },
    // ---- AT FULL GALLOP: the owner's tuning, verbatim ----
    runLegs: {
      // reach 1.2 -> 0 (owner): the forward half of the stride was being shaped
      // twice — `hindReach` in the quad block is already 0 for exactly that
      // reason — and taking it out is what lines the hind arc up with where the
      // paw actually lands. It is also what puts the paws back on the floor: the
      // reach was swinging the leg forward past the body drop.
      swing: 0.42, swingRun: 0.40, reach: 0, extend: -1.5,
      adduct: 0.085, adductRun: 0, adductTrail: 0,
      stanceBend: 0.14, stanceBendRun: 0.14,
      kneeLift: 0.70, kneeLiftRun: 0.65, kneePhase: 1.05,
      cadence: 0.92, cadenceCap: 14,
    },
    // …EXCEPT THE FOOT. The ankle is the one part of the old gallop that was not
    // worth restoring, so it is left on the sprint base at every speed: the roll,
    // the toe-down bias and — the one that shows — `hang 0.26`, which lets an
    // airborne paw hang at its resting line off the hock instead of being held
    // at an angle to the world (measured 36 degrees off it before, 22 after).
    // A run table that names only two keys morphs only those two; the rest of
    // the group stays the base's, which is what makes this expressible at all.
    // The two named here are the BACK-EXTENSION ANGLE, asked for explicitly:
    // 0.45 + 0.35 = 0.80 rad, so the paw finishes its push at 46 degrees rather
    // than the ~86 the old table drove it to.
    runAnkle: { push: 0.45, pushRun: 0.35 },
    // THE BLADE-TAIL. Carried a little heavy, most of its sculpted curve taken
    // back out, and a wave running down it off the stride phase — see
    // applyTailGait. `sway 0` would switch the motion off and leave only the
    // carriage; the whole group missing would leave the tail exactly as the rig
    // sculpted it.
    tail: { droop: 0.45, straight: 0.3, sway: 0.09, swayRun: 0.09, lag: 1.1, lift: 0.05, idle: 1.2 },
    runArms: { swing: 0.75, swingRun: 0, lift: 0, elbow: 0.25, elbowRun: 0, elbowPump: 0.30, tuck: 0, cross: 0 },
    runBody: { bob: 0.19, pitch: 0.10, yaw: 0.09, roll: 0.05, lean: 0.30, twist: 0.11, head: -0.22 },
    quad: {
      // `snap`: he COMMITS in a quarter of a second rather than crossfading over
      // a third of his speed range — see Animator.gallopState. `blend` is still
      // what a stateless reader (the workbench's dial sweep) uses.
      onset: 0.40, blend: 0.35, snap: 0.25, stride: 0.85, lag: 0.30,
      // drop 0.32 -> 0.30: the 180-degree hind stride below needs the room, and
      // at 0.32 the paws swung 0.44 units UNDER the floor at full gallop
      bodyPitch: 0.60, bodyArch: 0.50, drop: 0.30, heave: 0.15,
      frontReach: 1.45, frontSwing: 0.65, frontRake: 0.45, frontFold: 1.20,
      // the stride shaping lives in `runLegs.reach`/`extend` above, as it did
      // when this gallop was tuned (the crossfade is what keeps it off his jog)
      // — these two stay 0 so it is not applied twice
      hindReach: 0.28, hindExtend: 0,
      // A 180-DEGREE HIND STRIDE, as asked: the sweep is twice hindSwing, so 1.80
      // measures 178 degrees peak-to-peak on the thigh (it was 93 at 0.62).
      // hindCarry sits the middle of that stride a little forward so the wider
      // arc does not drive the knee into the floor, and hindKneeCarry lifts the
      // stifle for the same reason — measured: knee low point -0.00 -> 0.10,
      // paw low point -0.41 -> 0.30, both now clear of the ground.
      hindSwing: 1.42, hindCarry: -0.35,
      // hindFold 1.00 -> -1.28 (owner, ?edit=gait on fenrir at 100%): the fold
      // now runs the other way, so the stifle OPENS through the gather instead
      // of curling the shin up under the belly.
      hindFold: -1.28, hindKneeCarry: 0.90,
      hockSnap: 0.75, hockCarry: -0.28,
    },
  },

  // KONGA — KNUCKLE-WALK. A gorilla is not a quadruped that gallops; it is a
  // biped-shaped body that CARRIES ITS TRUNK ON ITS ARMS at every speed. So
  // this is not `quad` (no onset, no commit, no flight phase) — it is the
  // arthropod trick: the ordinary stride on short back legs, plus the four
  // foreleg dials putting the knuckles on the ground the whole time.
  //
  // The shape those dials have to make: the arms are LONGER than the legs, so
  // the shoulders ride high and the spine slopes DOWN to the hips — that is
  // `body.lean` doing the work, not a pitch that would nose him into the floor.
  // Steps are short and heavy (low `cadence`, big `bob`), the track is wide
  // (`adduct`), and the whole mass rolls side to side over whichever arm is
  // planted (`body.roll`), which is the read that says "heavy" more than any
  // other dial here.
  knuckle: {
    base: 'standard',
    name: 'Knuckle-walk',
    note: 'Gorilla travel: the trunk rides on planted knuckles at every speed, short heavy back-leg steps, big side-to-side roll over the loaded arm.',
    legs: {
      // short bowed legs taking short strides — the arms cover the ground
      swing: 0.30, swingRun: 0.34, reach: 0.30, extend: 0.34,
      adduct: 0.20, adductRun: 0.14, adductTrail: 0.20,
      stanceBend: 0.34, stanceBendRun: 0.30,
      kneeLift: 0.52, kneeLiftRun: 0.60, kneePhase: 1.05, phase: 0,
      cadence: 0.62, cadenceCap: 13,
    },
    ankle: { roll: 0.34, tilt: -0.08, push: 0.44, pushRun: 0.56, level: 0.35, hang: 0 },
    // THE ARMS ARE THE FRONT LEGS. `carry` is the constant shoulder pitch that
    // plants the knuckles; it is strongly negative because his arms hang from
    // high shoulders and must reach well forward of them to meet the ground.
    // `handGround` levels the loaded fist the way footFlat levels a sole —
    // a knuckle-walker rolls over the BACK of the fingers, so this is high.
    arms: {
      swing: 0.34, swingRun: 0.30, lift: 0, elbow: 0.12, elbowRun: 0.06,
      elbowPump: 0, tuck: -0.06, cross: 0,
      carry: -0.10, foldClear: 0.46, handGround: 0.85, handClear: 0.34,
      // 0 lands each fist with the foot on its OWN side; π swaps to the
      // diagonal couplet. A gorilla walks the diagonal, so: π.
      phase: Math.PI,
    },
    body: {
      bob: 0.26, pitch: 0.05, yaw: 0.07, roll: 0.16, lean: 0.46, twist: 0.08, head: -0.16,
    },
  },

  // TRITONE — CERATOPSIAN. A true four-on-the-floor quadruped, but the opposite
  // animal to fenrir: six tonnes of armored gun platform, not a wolf. So it
  // borrows `quad`'s machinery and de-tunes almost every dial of it:
  //   • `onset` is LOW and `snap` LONG — he is on all fours essentially always
  //     and eases between speeds instead of committing to a gallop.
  //   • `bodyArch` ~0 — a ceratopsian's back is a rigid weight-bearing bridge
  //     with a fused sacrum. Arching it would read as a cat, not a tank.
  //   • the hinds SWING far less and CARRY far more: columnar elephantine legs
  //     that plant and push rather than folding up under the belly.
  //   • the head is enormous, so `bodyPitch` stays small — nodding that frill
  //     through a big arc would swing his whole mass around.
  trike: {
    base: 'standard',
    name: 'Ceratopsian',
    note: 'Heavy four-legged gun platform: columnar legs on a rigid weight-bearing spine, a slow rolling walk that lengthens into a thunderous trot.',
    // NOT a gallop. `quad` is fenrir's wolf bound — hinds folding up under the
    // belly, spine arching, a flight phase — and every one of those is wrong
    // for six tonnes on four pillars (it also drove the front feet through the
    // floor). A ceratopsian keeps three feet down and swings the fourth: that
    // is just the standard cycle, slowed, shortened and widened, run on all
    // four limbs via the foreleg dials below.
    legs: {
      swing: 0.30, swingRun: 0.34, reach: 0.26, extend: 0.30,
      adduct: 0.16, adductRun: 0.10, adductTrail: 0.14,
      stanceBend: 0.16, stanceBendRun: 0.14,
      kneeLift: 0.30, kneeLiftRun: 0.36, kneePhase: 1.0, phase: 0,
      cadence: 0.70, cadenceCap: 11,
    },
    ankle: { roll: 0.20, tilt: -0.05, push: 0.30, pushRun: 0.36, level: 0.55, hang: 0 },
    // THE FRONT LEGS ARE THE ARM JOINTS. Inheriting the humanoid `arms` block
    // swings them like arms — big pendulum, elbow pump — so they get the
    // foreleg dials instead: a short stride, the wrist doing ankle work
    // (`handGround` keeps the planted foot flat), and `phase: π` putting each
    // front foot on the DIAGONAL back foot's beat, which is how a quadruped
    // actually walks.
    arms: {
      swing: 0.24, swingRun: 0.24, lift: 0, elbow: 0.06, elbowRun: 0.03,
      elbowPump: 0, tuck: 0, cross: 0,
      carry: 0, foldClear: 0.30, handGround: 0.9, handClear: 0.22,
      phase: Math.PI,
    },
    // heavy armored tail: hangs low, sways slowly, lags well behind the body
    tail: { droop: 0.30, straight: 0.55, sway: 0.06, swayRun: 0.07, lag: 1.5, lift: 0.03, idle: 0.7 },
    body: { bob: 0.12, pitch: 0.04, yaw: 0.05, roll: 0.10, lean: 0.14, twist: 0.04, head: -0.08 },
  },
};

// ---------------------------------------------------------------------------
// INHERITANCE. A gait may name a `base`, and then it IS that gait plus the keys
// it overrides — group by group, key by key, so `legs: { adduct }` changes one
// dial and keeps the other eleven.
//
// It is not sugar: it is the only way to say "this body's slow gait is that
// body's gait". Copying sprint's numbers into quad would read the same on the
// day it was written and drift the first time sprint was tuned, which is exactly
// the bug the shared gait table exists to avoid.
//
// Resolved ONCE, in place, so everything downstream — the animator, the
// workbench, every probe — sees one flat table and needs to know nothing about
// bases. `baseOf` remembers who came from where, for the parts that want to say
// so (the workbench header, formatGait).
// ---------------------------------------------------------------------------
/**
 * How far into the quadruped layer this gait is at that speed, 0..1 — the ONE
 * number that says "how much wolf". `applyQuadGait` blends its pose with it and
 * `effectiveGait` crossfades the dials with it, so the carriage and the gallop
 * are never out of step with each other.
 */
export function gallopBlend(gait, ratio, q) {
  const Q = gait?.quad;
  if (!Q) return 0;
  // A CALLER MAY OWN THIS INSTEAD. `quad.snap` turns the crossfade from a
  // function of SPEED into a state transition (see Animator.gallopState): the
  // mech commits to four legs or two and only passes through the middle, rather
  // than jogging along half-way between them at a steady 55% throttle. That
  // needs memory, which a pure function has none of, so the animator works the
  // number out and hands it in. Everything that has no state — the workbench's
  // dial sweep, any probe — leaves it undefined and gets the speed ramp, which
  // is still the honest answer to "what does this dial do across the band".
  if (typeof q === 'number') return clamp01(q);
  return clamp01((ratio - (Q.onset ?? 0.4)) / Q.blend);
}

/**
 * THE GAIT AT THIS SPEED. Without `run*` groups that is the gait itself; with
 * them it is the crossfade between the two tables (see the schema note above).
 *
 * Every pass downstream — the phase rate, applyGait, the gallop, the keys, the
 * foot rule — must run on THIS rather than on the raw gait, or half the body
 * gets the jog's numbers and half gets the run's.
 *
 * `out` is a caller-owned scratch object so the per-frame path allocates
 * nothing; the source gait is never written to.
 */
export function effectiveGait(gait, ratio, out, qIn) {
  if (!MORPH_GROUPS.some((g) => gait[runGroupId(g)])) return gait;
  const q = gallopBlend(gait, ratio, qIn);
  if (q <= 1e-4) return gait;
  const dst = out || {};
  const own = dst.__morph || (dst.__morph = { legs: {}, ankle: {}, arms: {}, body: {} });
  for (const k of Object.keys(gait)) if (!MORPH_GROUPS.includes(k)) dst[k] = gait[k];
  for (const g of MORPH_GROUPS) {
    const from = gait[g], to = gait[runGroupId(g)];
    if (!from) { delete dst[g]; continue; }
    if (!to) { dst[g] = from; continue; }
    const o = own[g];
    // a dial the run table does not name simply does not morph
    for (const k in from) o[k] = to[k] === undefined ? from[k] : lerp(from[k], to[k], q);
    dst[g] = o;
  }
  return dst;
}

const BASE_OF = {};
export const gaitBaseOf = (id) => BASE_OF[id] || null;
export const gaitHeirsOf = (id) => Object.keys(BASE_OF).filter((k) => BASE_OF[k] === id);

(function resolveGaits() {
  for (const [id, gait] of Object.entries(GAITS)) {
    const baseId = gait.base;
    if (!baseId) continue;
    const base = GAITS[baseId];
    if (!base) throw new Error(`gait '${id}' names an unknown base '${baseId}'`);
    if (base.base) throw new Error(`gait bases do not chain: '${baseId}' has its own base`);
    BASE_OF[id] = baseId;
    delete gait.base;
    for (const grp of GROUPS) {
      if (!base[grp]) continue;
      gait[grp] = { ...base[grp], ...(gait[grp] || {}) };
    }
  }
})();

export function gaitIds() { return Object.keys(GAITS); }

/** The gait id a roster def runs (an unknown or absent name falls back). */
export function gaitIdFor(def) {
  const id = def?.gait;
  return id && GAITS[id] ? id : DEFAULT_GAIT;
}

/** The gait a roster def runs. */
export function gaitFor(def) { return GAITS[gaitIdFor(def)]; }

/** A deep, independent copy — what the workbench edits. */
export function cloneGait(g) {
  const out = { name: g.name, note: g.note };
  for (const grp of GROUPS) if (g[grp]) out[grp] = { ...g[grp] };
  if (g.keys?.length) out.keys = g.keys.map((k) => ({ ph: k.ph, pose: JSON.parse(JSON.stringify(k.pose || {})) }));
  return out;
}

/** Every numeric difference between two gaits: [{ group, key, from, to }]. */
export function gaitDiff(a, b) {
  const out = [];
  for (const grp of GROUPS) {
    if (!a?.[grp] && !b?.[grp]) continue;
    for (const key of Object.keys(b?.[grp] || a[grp])) {
      const from = a?.[grp]?.[key], to = b?.[grp]?.[key];
      if (from === undefined || to === undefined) continue;
      if (Math.abs(from - to) > 1e-6) out.push({ group: grp, key, from, to });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// CADENCE — how fast the gait phase turns.
//
// FOOT-PLANT CADENCE: the stance foot's backward sweep speed is
// legLen * swing * dφ/dt at mid-stance, so the phase must advance at whatever
// makes that equal the actual ground speed. Feet then plant and push off one
// spot per step instead of skating under a canned walk cycle.
//
// legLen is in the model's LOCAL units; a grown body's legs really are sizeMul
// times longer, so the same ground speed is that many times fewer steps. Miss
// that and a 4x colossus takes four strides per stride's worth of ground — the
// skating the giant form was full of. The ceiling scales with it for the same
// reason.
// ---------------------------------------------------------------------------
export function gaitPhaseRate(gait, { speed, ratio, legLen, sizeMul = 1 }) {
  const L = gait.legs;
  const swing = L.swing + L.swingRun * ratio;
  const reach = legLen * L.cadence * sizeMul;
  return Math.min(L.cadenceCap / sizeMul, speed / Math.max(0.2, reach * swing));
}

// ---------------------------------------------------------------------------
// THE CYCLE ITSELF. Pure: it adds this frame's locomotion onto a rest-pose
// target and touches nothing else, which is what lets the workbench measure
// d(joint)/d(parameter) by calling it twice.
//
// env: { ph, ratio, s, ankleGain, footFlat, rest, hipHeight, thighLen, shinLen }
//   ph         gait phase, radians
//   ratio      speed / maxSpeed, 0..1 — every `*Run` dial rides this
//   s          the model's scale (hip bob is a distance, not an angle)
//   ankleGain  foot-depth calibration (see Animator.calibrateFeet)
//   footFlat   how hard to keep a long sole parallel to the ground
//   rest       the rest pose, needed by the flat-sole correction
// ---------------------------------------------------------------------------
export function applyGait(tgt, gait, env) {
  const { ph, ratio, s = 1, ankleGain = 1, footFlat = 0, rest = null } = env;
  const L = gait.legs, A = gait.ankle, R = gait.arms, B = gait.body;

  const swing = L.swing + L.swingRun * ratio;
  // THREE CLOCKS, ONE BEAT. `ph` is the beat itself and the BODY stays on it
  // (bob, yaw, roll, lean — the things that read as the frame's rhythm). The
  // legs and the arms each get to sit somewhere on it: `legs.phase` and
  // `arms.phase` slide their whole cycle round, keeping each pair's own L/R
  // alternation. Both default to 0, which is the counter-swing every gait
  // shipped with — an arm opposite its own leg — so a gait that names neither
  // is bit-identical to before the dials existed.
  const phL = ph + (L.phase || 0);
  const phA = ph + (R.phase || 0);
  const sinL = Math.sin(phL), sinR = Math.sin(phL + Math.PI);
  const fwdL = Math.max(0, sinL), fwdR = Math.max(0, sinR);
  const backL = Math.max(0, -sinL), backR = Math.max(0, -sinR);
  // the arms' own copies of the same four weights, on the arm clock
  const aSinL = Math.sin(phA), aSinR = Math.sin(phA + Math.PI);

  // ===== legs =====
  // A symmetric pendulum reads as a march; a run REACHES ahead and FINISHES
  // behind, so the forward and rear halves get their own extra amplitude.
  const reach = L.reach * ratio, extend = L.extend * ratio;
  tgt.thighL[0] += -swing * sinL - reach * fwdL + extend * backL;
  tgt.thighR[0] += -swing * sinR - reach * fwdR + extend * backR;
  // springy legs, not stilts: a soft stance bend that never locks the knee, a
  // bigger swing-phase lift, and (below) a plantar-flex TOE-OFF as the trailing
  // leg leaves the ground — the mech pushes itself forward
  const stanceBend = L.stanceBend + L.stanceBendRun * ratio;
  const lift = L.kneeLift + L.kneeLiftRun * ratio;
  tgt.kneeL[0] += stanceBend + lift * Math.max(0, Math.sin(phL + L.kneePhase));
  tgt.kneeR[0] += stanceBend + lift * Math.max(0, Math.sin(phL + Math.PI + L.kneePhase));
  // TRACK WIDTH: a runner's feet fall nearly single-file under the centre of
  // mass. Straddling a shoulder-width base at speed is the single loudest
  // "stiff" tell on the fast mechs.
  // ...and its TRAILING-FOOT twin, which is a different thing and needs a
  // different envelope. `adduct` is the same at every phase, so narrowing the
  // track with it moves the WHOLE stride inboard — including the foot the mech is
  // about to land on and stand on. `adductTrail` instead pulls a leg toward the
  // midline only through the FLICK: the moment after toe-off when the foot is off
  // the ground and still behind the body. It fades out as the leg swings forward,
  // so the foot comes back down at its normal width, takes the weight, and drives
  // the body over it — then flicks in again on the way back.
  //
  // GATED ON THE POSE, NOT ON THE PHASE: `air * back` from footStates(), the same
  // two weights the foot rule uses, and `air` is the MEASURED sole clearance
  // wherever the body has been calibrated. A PLANTED foot pulled sideways is a
  // skate — the one failure this dial could cause — and multiplying by `air` is
  // what makes that impossible rather than merely unlikely.
  const adduct = L.adduct + L.adductRun * ratio;
  const trail = L.adductTrail || 0;
  if (adduct || trail) {
    let tL = 0, tR = 0;
    if (trail && rest) {
      const fL = footStates(tgt, rest, 'L', env), fR = footStates(tgt, rest, 'R', env);
      tL = trail * fL.air * fL.back;
      tR = trail * fR.air * fR.back;
    }
    tgt.thighL[2] += adduct;
    tgt.thighR[2] -= adduct;
    // THE FLICK IS A KNEE ROLL, not a hip one: rolling the thigh swings the whole
    // leg in from the hip, which moves the knee as much as the foot; rolling the
    // KNEE tucks the shin and paw in under a hip that stays where it is, which is
    // the shape a runner's trailing leg actually makes.
    tgt.kneeL[2] += tL;
    tgt.kneeR[2] -= tR;
  }

  // ===== ankles =====
  // authored roll + toe-off, scaled to the foot's real depth (ankleGain) and
  // laid over a FLAT-SOLE base for long-footed models (footFlat) — see
  // Animator.calibrateFeet. Without both, a deep, long boot pitches about a
  // joint far above and behind its sole and buries a corner in the floor for
  // most of the cycle: the walk reads as pushing off air rather than pavement.
  // the heel-to-toe ROLL that shapes a planted foot. The TOE-OFF is not here any
  // more: it belongs to the push-off state, which applyFootRule works out from
  // the pose (planted AND behind) instead of from a phase window — the phase one
  // was firing ~100 degrees late, well after the foot had already left the ground.
  tgt.ankleL[0] += ankleGain * (swing * A.roll * sinL + A.tilt * ratio);
  tgt.ankleR[0] += ankleGain * (swing * A.roll * sinR + A.tilt * ratio);
  // (the TOE-BACK on a raised rear foot is applied last, by applyToeHang below —
  // it is a rule about the finished pose, so it has to run after the gallop layer
  // has had its say)

  // ===== arms: the COUNTER-swing =====
  // An arm swings OPPOSITE its own leg: left leg forward, left arm back. That
  // is not decoration — it is what cancels the leg's angular momentum about the
  // spine, and getting it backwards reads instantly as a wind-up toy.
  //
  // The sign trap: shoulder pitch runs the same way as thigh pitch (NEGATIVE is
  // forward), so an arm driven by `sinL` lands opposite the leg driven by
  // `-swing * sinL`, and one driven by `sinR` (= -sinL) marches WITH it. The
  // original engine used sinR here, which is why every mech's arms went along
  // for the ride instead of counterbalancing.
  const armSwing = swing * (R.swing + R.swingRun * ratio);
  tgt.shoulderL[0] += armSwing * aSinL + R.lift * ratio;
  tgt.shoulderR[0] += armSwing * aSinR + R.lift * ratio;
  // how far FORWARD each arm is right now, 0..1 — the pump and the cross both
  // want the arm at the front of its swing, and with the counter-swing above
  // that is the moment its OWN leg is at the back. Measured on the ARM clock,
  // so it follows `arms.phase` instead of quietly staying on the legs'.
  const armFwdL = Math.max(0, -aSinL), armFwdR = Math.max(0, -aSinR);
  const elbow = R.elbow + R.elbowRun * ratio;
  tgt.elbowL[0] += -elbow - R.elbowPump * ratio * armFwdL;
  tgt.elbowR[0] += -elbow - R.elbowPump * ratio * armFwdR;
  if (R.tuck) {
    const t = R.tuck * ratio;               // positive rolls both arms inward
    tgt.shoulderL[2] += t; tgt.shoulderR[2] -= t;
  }
  if (R.cross) {
    const c = R.cross * ratio;              // the forward arm swings across the chest
    tgt.shoulderL[1] += c * armFwdL; tgt.shoulderR[1] += -c * armFwdR;
  }

  // ===== FORELEGS (arthropod bodies — jerry): the arms ARE front legs =====
  // The counter-swing above already gives them a sensible BEAT — an arm moves
  // with the opposite leg, which is the diagonal-couplet timing an insect walks
  // on — and `arms.phase` slides that beat when a particular body wants a
  // particular claw landing with a particular foot. What changes here is the JOB:
  //   · `carry` plants the claws: a constant shoulder pitch onto the ground,
  //     there at a walk and a sprint alike (lift rides the throttle; a limb
  //     that bears weight cannot).
  //   · the PLANTED half of each arm's own cycle is its backward sweep — the
  //     body travelling over the planted claw — which for the L arm (driven by
  //     +sinL) runs while cos(ph) > 0, and mirrored for R. The weight is a
  //     smoothed half-cosine so plant and lift are crossfades, like footStates.
  //   · `foldClear` folds the elbow through the recovery swing (a front leg
  //     lifts to clear the ground coming forward, extends to plant)…
  //   · …and the WRIST does what an ankle does: `handGround` cancels the pitch
  //     the hips + shoulder + elbow stacked into the planted claw so it stays
  //     parallel to the ground (footFlat, one limb pair up), while `handClear`
  //     tips the swinging claw up so the tip doesn't plough a furrow forward.
  if (R.carry || R.foldClear || R.handGround || R.handClear) {
    const cosP = Math.cos(phA);   // the claw plant window rides the ARM clock
    const plantL = clamp01(0.5 + 0.85 * cosP);
    const plantR = clamp01(0.5 - 0.85 * cosP);
    tgt.shoulderL[0] += R.carry || 0;
    tgt.shoulderR[0] += R.carry || 0;
    if (R.foldClear) {
      tgt.elbowL[0] += -R.foldClear * (1 - plantL);
      tgt.elbowR[0] += -R.foldClear * (1 - plantR);
    }
    if (rest && (R.handGround || R.handClear)) {
      for (const [side, plant] of [['L', plantL], ['R', plantR]]) {
        const h = tgt['hand' + side];
        if (!h) continue;
        // level against everything the chain above pitched into the claw,
        // relative to rest — the same cancellation the flat-sole rule does
        if (R.handGround) {
          h[0] -= R.handGround * plant * (tgt.hipsRot[0]
            + (tgt['shoulder' + side][0] - (rest['shoulder' + side]?.[0] || 0))
            + (tgt['elbow' + side][0] - (rest['elbow' + side]?.[0] || 0)));
        }
        if (R.handClear) h[0] += R.handClear * (1 - plant);
      }
    }
  }

  // ===== body dynamics — bob rides the push-off beat =====
  tgt.hipsPos[1] += -Math.abs(Math.cos(ph)) * B.bob * ratio * s;
  tgt.hipsRot[0] += B.pitch * ratio;            // whole body pitches into the run
  tgt.hipsRot[1] += Math.sin(ph) * B.yaw * ratio;
  tgt.hipsRot[2] += Math.cos(ph) * B.roll * ratio;
  tgt.torso[0] += B.lean * ratio;               // upper body leans forward
  tgt.torso[1] += -Math.sin(ph) * B.twist * ratio;  // counter-rotate
  tgt.head[0] += B.head * ratio;                // eyes stay on the horizon

  // FLAT SOLE (long-footed models): level the foot against everything the chain
  // above it just pitched into it — run LAST, after hipsRot is set, so the
  // body's forward pitch is included. The authored roll above then rides on top
  // of a level plate instead of on top of the leg's own tilt.
  // …and only while the foot IS on the pavement (`1 - air weight`), so that above
  // the ground the foot can hang off the shin instead of being levelled straight
  // back out — see applyToeHang.
  //
  // How hard to level is the LARGER of two asks: what the model's own foot depth
  // measured (footFlat, from Animator.calibrateFeet — a long boot needs it or it
  // buries a corner) and what the GAIT asks for (`ankle.level`), for a body the
  // calibration never ran on.
  //
  // THE QUADRUPED LEAVES IT AT 0, MEASURED. calibrateFeet skips fenrir because a
  // hock is nothing like a boot, and asking the gait to level his paws is worse
  // than not: the levelling cancels hips + thigh + knee, which on a gallop
  // includes 34 degrees of body pitch, and a paw whose rest carriage is nothing
  // like flat came out dorsiflexed 130-170 degrees with its claws pointing at the
  // sky. His planted paws stay with the authored hock motion; what he does get
  // from this pass is the airborne half — a raised paw hangs at its resting line
  // like every other foot in the game.
  // WHICH FOOT IS UP, published for the passes that come after this one: the
  // gallop layer refines it (it knows its own flight phase, which no L-vs-R
  // comparison can see because a galloping quadruped lifts both hinds together)
  // and applyToeHang consumes it.
  env.air = { L: airWeight(tgt, rest, 'L', env), R: airWeight(tgt, rest, 'R', env) };
  // …and PUSHING OFF IS NOT STANDING: in late stance the toe stays on the ground
  // while the leg straightens and the heel comes up, so the foot is deliberately
  // NOT flat there. The levelling therefore only gets the weight that is neither
  // airborne nor pushing (see footStates).
  const levelAsk = Math.max(footFlat, A.level || 0);
  if (levelAsk > 0.01 && rest) {
    for (const side of ['L', 'R']) {
      const level = levelAsk * footStates(tgt, rest, side, env).stance;
      if (level < 0.01) continue;
      tgt['ankle' + side][0] -= level * (tgt.hipsRot[0]
        + (tgt['thigh' + side][0] - rest['thigh' + side][0])
        + (tgt['knee' + side][0] - rest['knee' + side][0]));
    }
  }
}

// ---------------------------------------------------------------------------
// QUADRUPED GALLOP (gaits with a `quad` block — FENRIR the wolf).
//
// A sprinting-wolf rotary gallop: the two HINDS drive as a pair EXACTLY half a
// cycle against the two FRONTS (a slight rotary lag inside each pair), the
// spine ARCHES as the hinds swing under the body and EXTENDS flat as they fire,
// and the whole frame rides low with a suspension rise on the flight phase.
// Runs OVER applyGait(), which is what it lerps out of at walking pace.
// ---------------------------------------------------------------------------
export function applyQuadGait(tgt, gait, env) {
  const Q = gait.quad;
  if (!Q) return;
  const { ph, ratio, s = 1, hipHeight = 1 } = env;
  // BELOW THE ONSET THIS PASS DOES NOTHING, which is the point: what is left is
  // the base gait, untouched. Fenrir's base is `sprint`, so his jog is a
  // runner's jog and the wolf only arrives as he opens up.
  const q = gallopBlend(gait, ratio, env.quadQ);
  if (q <= 0.01) return;
  const g = ph * Q.stride;                       // longer gallop stride
  const hind = Math.sin(g), hind2 = Math.sin(g + Q.lag);
  const front = Math.sin(g + Math.PI), front2 = Math.sin(g + Math.PI + Q.lag);
  const arch = Math.max(0, -hind);               // spine curls on the gather
  const ext = Math.max(0, hind);                 // and stretches on the drive
  // long, low, LEVEL frame: the back stays near-horizontal through the whole
  // cycle — only a subtle arch/heave rides the bound
  tgt.hipsRot[0] += (Q.bodyPitch + arch * Q.bodyArch) * q;
  tgt.hipsPos[1] += (-hipHeight * Q.drop + ext * Q.heave * s) * q;
  tgt.torso[0] += (0.1 + arch * 0.2) * q;        // curl under on the gather
  tgt.head[0] += (-0.7 - arch * 0.16) * q;       // muzzle level, eyes forward
  // FRONTS: stretch far out flat on the reach, fold and rake through
  const reachL = -Q.frontReach - Math.max(0, front) * Q.frontSwing + Math.min(0, front) * Q.frontRake;
  const reachR = -Q.frontReach - Math.max(0, front2) * Q.frontSwing + Math.min(0, front2) * Q.frontRake;
  tgt.shoulderL[0] = lerp(tgt.shoulderL[0], reachL, q);
  tgt.shoulderR[0] = lerp(tgt.shoulderR[0], reachR, q);
  tgt.shoulderL[2] = lerp(tgt.shoulderL[2], -0.1, q);
  tgt.shoulderR[2] = lerp(tgt.shoulderR[2], 0.1, q);
  // elbow ARROW-STRAIGHT on the reach, folded tight on the recovery
  tgt.elbowL[0] = lerp(tgt.elbowL[0], -0.1 - Math.max(0, -front) * Q.frontFold, q);
  tgt.elbowR[0] = lerp(tgt.elbowR[0], -0.1 - Math.max(0, -front2) * Q.frontFold, q);
  tgt.handL[0] = lerp(tgt.handL[0], 0.5, q);
  tgt.handR[0] = lerp(tgt.handR[0], 0.5, q);
  // HINDS: the engine — huge sweep, knees folding right up under the chest on
  // the gather, then a full-stretch fire with an ankle snap
  // …including the gallop's OWN reach and rear extension, which the base gait
  // must not carry: `legs.reach`/`legs.extend` apply at every speed and to every
  // mech sharing that gait, so a wolf's stride shaping written there would land
  // on his jog (and on viper). Same form as applyGait's pair — negative sin is
  // the forward half — scaled by ratio so it composes with them exactly.
  // the BIPED phase, not the gallop's own `g` — these reproduce terms that used
  // to live in applyGait, so they have to keep applyGait's beat
  const bs = Math.sin(ph);
  const hFwdL = Math.max(0, bs), hBackL = Math.max(0, -bs);
  const hFwdR = hBackL, hBackR = hFwdL;
  const qr = q * ratio;
  tgt.thighL[0] += (-(Q.hindReach || 0) * hFwdL + (Q.hindExtend || 0) * hBackL) * qr;
  tgt.thighR[0] += (-(Q.hindReach || 0) * hFwdR + (Q.hindExtend || 0) * hBackR) * qr;
  // THE THREE CARRIES — where each hind joint SITS through the gallop, before its
  // swing/fold/snap is added. They were hard-coded constants (-0.12, 0.3, -0.28)
  // tuned for one body; they are dials now because they are what decides whether
  // a hind knee rides UP under the belly or drags along the floor, and that is
  // the whole difference between a wolf and a lizard.
  const hCarry = Q.hindCarry ?? -0.12, kCarry = Q.hindKneeCarry ?? 0.3, aCarry = Q.hockCarry ?? -0.28;
  tgt.thighL[0] += (hCarry + hind * Q.hindSwing) * q;
  tgt.thighR[0] += (hCarry + hind2 * Q.hindSwing) * q;
  tgt.kneeL[0] += (kCarry + Math.max(0, hind) * Q.hindFold) * q;
  tgt.kneeR[0] += (kCarry + Math.max(0, hind2) * Q.hindFold) * q;
  tgt.ankleL[0] += (aCarry - Math.max(0, -hind) * Q.hockSnap) * q;
  tgt.ankleR[0] += (aCarry - Math.max(0, -hind2) * Q.hockSnap) * q;
  // WHICH PAW IS UP — the gallop's own answer, which replaces the biped layer's
  // guess as the gallop blends in. A galloping quadruped lifts both hinds
  // TOGETHER on the gather, so comparing left against right (all applyGait can
  // do) sees nothing; `hind` going negative IS the gather, and that is when the
  // paw is in the air and should hang off the hock instead of being driven.
  if (env.air) {
    env.air.L = lerp(env.air.L, clamp01(2.6 * Math.max(0, -hind)), q);
    env.air.R = lerp(env.air.R, clamp01(2.6 * Math.max(0, -hind2)), q);
  }
}

// ---------------------------------------------------------------------------
// HAND-KEYED CORRECTIONS — the escape hatch, for when the dials cannot say it.
//
// A gait is parametric: it has no frames, so there is nothing to key. What it
// DOES have is a phase, and that is enough to hang corrections off: `gait.keys`
// is a list of `{ ph, pose: { joint: [x, y, z] degrees } }`, each an ADDITIVE
// offset over whatever the cycle produced, interpolated around the loop (the last
// key wraps to the first, because a gait cycle is a circle and not a timeline).
//
// They are deliberately additive and deliberately EARLY — before the foot rule —
// so the rules that keep a foot honest still win. Rotating a planted ankle by
// hand is not a thing anyone should be able to do; rotating an elbow at the top
// of the swing is. The gait workbench enforces the same split in its UI.
//
// Nothing ships with keys. They exist so a shape the sliders cannot reach can be
// fixed by hand instead of by adding a dial for every possible complaint.
// ---------------------------------------------------------------------------
const D2R_ = Math.PI / 180;

/** The keys either side of `ph`, and how far between them it sits. */
function keySpan(keys, ph) {
  const n = keys.length;
  const at = ((ph % TAU_) + TAU_) % TAU_;
  let i = -1;
  for (let k = 0; k < n; k++) if (keys[k].ph <= at) i = k;
  const a = keys[(i + n) % n], b = keys[(i + 1) % n];
  let span = b.ph - a.ph;
  if (span <= 0) span += TAU_;                     // wrapped past the end
  let t = span > 1e-6 ? (at - a.ph) / span : 0;
  if (t < 0) t += TAU_ / span;
  return { a, b, t: clamp01(t) };
}

export function applyGaitKeys(tgt, gait, env = {}) {
  const keys = gait.keys;
  if (!keys?.length) return;
  const sorted = keys.slice().sort((x, y) => x.ph - y.ph);
  const { a, b, t } = keySpan(sorted, env.ph || 0);
  const joints = new Set([...Object.keys(a.pose || {}), ...Object.keys(b.pose || {})]);
  for (const j of joints) {
    const dst = tgt[j];
    if (!dst) continue;
    const va = a.pose?.[j] || [0, 0, 0], vb = b.pose?.[j] || [0, 0, 0];
    const k = j === 'hipsPos' ? (env.s || 1) : D2R_;   // hips translate, everything else rotates
    for (let i = 0; i < 3; i++) dst[i] += lerp(va[i], vb[i], t) * k;
  }
}

// ---------------------------------------------------------------------------
// THE FOOT RULE — the last word on a stride, and the one part of a gait that is
// not a curve.
//
// A foot is doing one of three things (see footStates), and only the first of
// them is about the world:
//
//   ON THE GROUND   the sole belongs FLAT ON IT, whatever the leg is doing. That
//                   is the levelling ask back in applyGait (`footFlat` from the
//                   model's own foot depth, or `ankle.level` from the gait), and
//                   it is world-space: it cancels hips + thigh + knee.
//   PUSHING OFF     planted but behind the body — the toe stays down while the leg
//                   straightens and the heel comes up. The foot pivots over the
//                   toe, so it is NOT flat and NOT hanging: it is driven hard down
//                   relative to the shin (`ankle.push` + `pushRun`, and ~90 degrees
//                   is what a real push-off reaches).
//   IN THE AIR      nothing holds a foot at an angle to the world. It hangs off the
//                   shin at its resting angle — perpendicular, for a body built
//                   that way; whatever its own bind says, for a digitigrade one.
//                   `ankle.hang` points the toe a little past that, which is what
//                   a runner does (~15 degrees) and a walker does not.
//
// Both non-stance states are JOINT-space rules — stated relative to the shin, not
// to the horizon — so one number lands the same on a boot, a talon and a paw.
//
// It runs LAST, after the gallop layer, so it covers fenrir's hinds too, and it
// BLENDS rather than adds: the stance shaping (roll, tilt) is handed back as the
// foot leaves the ground instead of accumulating into a pose no ankle holds.
// ---------------------------------------------------------------------------
export function applyToeHang(tgt, gait, env = {}) {
  const A = gait.ankle || {};
  const rest = env.rest || null;
  const r = (j) => (rest?.[j]?.[0] || 0);
  const ratio = env.ratio ?? 1;
  const pushAngle = (A.push || 0) + (A.pushRun || 0) * ratio;
  const hang = A.hang || 0;
  for (const side of ['L', 'R']) {
    const a = tgt['ankle' + side];
    if (!a || !tgt['thigh' + side]) continue;
    const st = footStates(tgt, rest, side, env);
    if (st.air + st.push < 0.01) continue;          // pure stance: leave it alone
    const home = r('ankle' + side);
    a[0] = a[0] * st.stance + (home + hang) * st.air + (home + pushAngle) * st.push;
  }
}

// ---------------------------------------------------------------------------
// THE TAIL — a wave travelling down a chain that is not part of the rig.
//
// A tail is not one of the 15 game joints. Nothing retargets onto it, the
// RigAdapter never touches it, and only a custom rig even has one (fenrir's
// blade is `tail0`…`tail5`, hanging off the hips). So it gets its own pass,
// gated on a gait carrying a `tail` block — every other gait is untouched and
// shows no tail dials at all.
//
// WHAT IT IS TRYING TO LOOK LIKE: weight on the end of a rope. The wag is
// driven off the GAIT PHASE rather than a clock, so it beats with the stride;
// each segment further out runs a little further BEHIND that phase (`lag`), so
// what you see is a wave travelling outward and a tip that trails rather than a
// rigid blade swinging as one. The vertical float runs at twice the rate, which
// is what a tail does — over and back once per stride sideways, up and down
// twice.
//
// STRAIGHTENING is the odd one, and it is measured rather than authored: the
// tail's resting curve lives in the rig's BONE POSITIONS, not in any rotation,
// so there is no number to turn down. tailChainOf() reads the chain once and
// works out how much each segment turns away from the one before it; `straight`
// cancels that fraction back out. That is why this needs `env.tail` and does
// nothing without it.
// ---------------------------------------------------------------------------

/**
 * Measure a bone chain's own resting bend, once, so `tail.straight` has
 * something to cancel. Local axes: every bone on a hand-placed rig rests
 * unrotated, so all the segment directions live in one frame and the turn from
 * one to the next is two plain angles — elevation (a rotation about Z) and
 * heading (about Y).
 * @param {Object} byName  bones by name (mech.rigBones)
 * @returns {null|{n:number, bend:number[][]}}  bend[i] = [_, y, z] radians
 */
export function tailChainOf(byName, prefix = 'tail', max = 12) {
  if (!byName) return null;
  const chain = [];
  for (let i = 0; i < max; i++) {
    const b = byName[prefix + i];
    if (!b) break;
    chain.push(b);
  }
  if (chain.length < 2) return null;
  // segment i runs from bone i to bone i+1, and a child's position IS that offset
  const dirs = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const p = chain[i + 1].position;
    const len = Math.hypot(p.x, p.y, p.z) || 1;
    dirs.push([p.x / len, p.y / len, p.z / len]);
  }
  // THE ANGLES HAVE TO BE THE ONES THE ROTATIONS ACTUALLY ADD, or the sign is a
  // coin flip that depends on which way the chain happens to point — measuring
  // "elevation" as atan2(y, |xz|) and subtracting it CURLED fenrir's tail into a
  // hook, because his blade runs along -x and a positive Z turn lowers it there
  // while raising a +x one. So: angZ is the angle a rotation about Z advances,
  // angY the angle a rotation about Y advances, both read straight off the
  // rotation matrices, and the turn from one segment to the next is their
  // difference — correct in every quadrant, on any rig, facing any way.
  const angZ = (d) => Math.atan2(d[1], d[0]);
  const angY = (d) => Math.atan2(-d[2], d[0]);
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const bend = [[0, 0, 0]];
  for (let i = 1; i < dirs.length; i++) {
    bend.push([0, wrap(angY(dirs[i]) - angY(dirs[i - 1])), wrap(angZ(dirs[i]) - angZ(dirs[i - 1]))]);
  }
  // the LAST bone has no segment leaving it, so there is nothing of its own to
  // straighten — padding it with its neighbour's turn put a kink in the tip
  while (bend.length < chain.length) bend.push([0, 0, 0]);
  return { n: chain.length, bend };
}

/**
 * One frame of tail. Pure, like every other pass here: it writes `tgt.tail0…`
 * and the caller decides what those mean (the animator puts them on the rig's
 * own bones; the workbench measures them to find out which dials do anything).
 * env: { ph, ratio, tail } — `tail` from tailChainOf, and without it the
 * straighten term simply contributes nothing.
 */
export function applyTailGait(tgt, gait, env = {}) {
  const T = gait.tail;
  const chain = env.tail;
  if (!T || !chain) return;
  const ratio = env.ratio ?? 1;
  const ph = env.tailPh ?? env.ph ?? 0;
  const sway = (T.sway || 0) + (T.swayRun || 0) * ratio;
  const n = chain.n;
  for (let i = 0; i < n; i++) {
    const a = tgt['tail' + i];
    if (!a) continue;
    // 0 at the root, 1 at the tip — everything below is weighted along it,
    // because a tail does not do the same thing at both ends
    const k = n > 1 ? i / (n - 1) : 0;
    const b = chain.bend?.[i];
    if (b && T.straight) { a[1] -= T.straight * b[1]; a[2] -= T.straight * b[2]; }
    // RELAX DOWN. Spread over the chain so no single joint kinks, and weighted
    // outward so the drop happens along the blade rather than at its root.
    a[2] += ((T.droop || 0) / n) * (0.5 + k);
    // THE WAVE. Each segment lags the one before it, so the sweep travels out.
    const w = ph - (T.lag || 0) * k;
    a[1] += Math.sin(w) * sway * (0.35 + k);
    a[2] += Math.sin(w * 2 + 0.7) * (T.lift || 0) * (0.35 + k);
  }
}

// ---------------------------------------------------------------------------
// THE OTHER FOUR LEGS.
//
// Same shape as the tail above, and for the same reason: a hexapod's extra legs
// are not the 15 game joints, nothing retargets onto them, and only one body has
// them. So the rig is MEASURED once (hexLegsOf) and a pure pass (applyHexGait)
// writes their angles into the pose target, which the animator then puts on the
// rig's own bones after the retarget has had its say.
//
// TWO THINGS ARE DERIVED RATHER THAN AUTHORED, because getting either wrong is
// invisible in the numbers and obvious on screen:
//
//  1. WHICH AXIS IS FORWARD — and there are TWO of them, which is the whole
//     difference between a crab and a short humanoid. Turn the leg about the
//     body's LATERAL axis and it swings under the hip like a pendulum: that is a
//     PUSH-OFF, and its lever arm is how far the foot hangs BELOW the hip. Turn
//     it about the body's UP axis and the leg swings ROUND the hip, flat, like a
//     hand on a clock face: that is what an arthropod does, and its lever arm is
//     how far the foot sits OUT from the hip. `hex.yaw` mixes the two, and both
//     levers are measured per leg so the mix can be costed rather than guessed.
//     All three axes are read off the rig itself (up from hips->torso, lateral
//     from the two back hips), so this works on a body facing any way with its
//     legs anywhere.
//  2. WHICH TRIPOD EACH LEG IS IN. An insect walks on alternating triangles —
//     front-left, mid-right, back-left, then the other three — which is just
//     "flip the phase for each rank down the body, and again for the other
//     side". Rank comes from where the hip actually sits along the body, so a
//     rig edit that moves a leg re-derives its place instead of quietly walking
//     the wrong triangle.
//
// The BACK pair is included in the measurement and NOT driven: it carries the
// game leg joints, so the stride above already owns it, and all it contributes
// here is its rank (the tripod parity the other four alternate against).
// ---------------------------------------------------------------------------

const v3sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const v3dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const v3cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];
function v3norm(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
// a bone's position in the rig's own common frame. Exact because every bone on a
// hand-placed rig rests unrotated — the same property tailChainOf leans on.
function boneRigPos(b) {
  const p = [0, 0, 0];
  for (let o = b; o && o.isBone; o = o.parent) { p[0] += o.position.x; p[1] += o.position.y; p[2] += o.position.z; }
  return p;
}
const restRot = (b) => (b ? [b.rotation.x, b.rotation.y, b.rotation.z] : [0, 0, 0]);

/**
 * Measure a hexapod's legs, once. Extra legs are named `leg<TAG>hip` /
 * `leg<TAG>knee` / `leg<TAG>foot`; the two game legs (thigh/knee/ankle) join
 * them so the ranks and the tripod come out right.
 * @param {Object} byName  bones by name (mech.rigBones)
 * @returns {null|{n:number, legs:Object[]}}
 */
export function hexLegsOf(byName) {
  if (!byName?.hips) return null;
  const found = [];
  for (const name of Object.keys(byName)) {
    const m = /^leg(.+)hip$/.exec(name);
    if (!m) continue;
    const knee = byName[`leg${m[1]}knee`];
    if (!knee) continue;
    found.push({ hip: byName[name], knee, foot: byName[`leg${m[1]}foot`] || null, driven: true });
  }
  if (!found.length) return null;
  for (const s of ['L', 'R']) {
    const hip = byName[`thigh${s}`];
    if (!hip) continue;
    found.push({
      hip,
      knee: byName[`knee${s}`] || null,
      foot: byName[`foot${s}`] || byName[`ankle${s}`] || null,
      driven: false,
    });
  }
  const hipsP = boneRigPos(byName.hips);
  const up = byName.torso ? v3norm(v3sub(boneRigPos(byName.torso), hipsP)) : [0, 1, 0];
  // the body's own LEFT, from the two back hips — a rig may face any way
  const tL = byName.thighL, tR = byName.thighR;
  let left = tL && tR ? v3sub(boneRigPos(tL), boneRigPos(tR)) : [0, 0, 1];
  left = v3norm(v3sub(left, up.map((c) => c * v3dot(left, up))));   // …square to up
  const fwd = v3cross(up, left);

  const legs = found.map((l) => {
    const hp = boneRigPos(l.hip);
    const tip = boneRigPos(l.foot || l.knee);
    const span = v3sub(tip, hp);
    // the horizontal part of the leg, for the lift axis; a leg hanging dead
    // straight down has none, and its own side stands in
    const flat = v3sub(span, up.map((c) => c * v3dot(span, up)));
    const side = v3dot(v3sub(hp, hipsP), left) >= 0 ? 1 : -1;
    const out = Math.hypot(flat[0], flat[1], flat[2]) > 1e-4
      ? v3norm(flat) : left.map((c) => c * side);
    const driven = l.driven && !!l.knee;
    return {
      hip: l.hip.name, knee: l.knee?.name || null, foot: l.foot?.name || null,
      driven,
      // the two the GAME drives: the hip bone IS a game joint, so the yaw mix is
      // applied to it in joint space (see applyHexGait) rather than on the bone
      joint: driven ? null : l.hip.name,
      side, fore: v3dot(v3sub(hp, hipsP), fwd),
      // + swings every foot FORWARD, whichever side it is on: the foot hangs
      // below the hip, so a turn about `left` carries it along `fwd`
      pitchAxis: left,
      // …and about the body's UP axis it swings round the hip instead — forward
      // on the left, backward on the right, hence `side` at the call site
      yawAxis: up,
      // …and about this one it rises (see the note above: `out x up`)
      liftAxis: v3norm(v3cross(out, up)),
      restHip: restRot(l.hip), restKnee: restRot(l.knee),
      // THE TWO LEVER ARMS, in the rig's own units: how far the foot travels
      // fore-aft per radian of pitch (it hangs this far below the hip) and per
      // radian of yaw (it sits this far out from it). A probe can then say what
      // arc a leg needs, and what a yaw mix costs it, rather than guessing.
      drop: Math.abs(v3dot(span, up)),
      reach: Math.hypot(flat[0], flat[1], flat[2]),
    };
  });
  // RANK: front to back, down each side independently, so the two sides mirror
  // even on a rig whose legs are not paired exactly.
  for (const s of [1, -1]) {
    const mine = legs.filter((l) => l.side === s).sort((a, b) => b.fore - a.fore);
    mine.forEach((l, i) => { l.rank = i; });
  }
  // …and the tripod falls straight out of it: alternate down the body, and
  // again across it.
  for (const l of legs) l.group = ((l.rank || 0) + (l.side > 0 ? 0 : 1)) % 2;
  return { n: legs.length, legs };
}

/**
 * One frame of the extra legs. Pure, like every other pass here: it writes
 * `tgt['<hip bone>']` / `tgt['<knee bone>']` and the caller decides what those
 * mean (the animator puts them on the rig's bones; the workbench measures them
 * to find out which dials do anything).
 * env: { ph, ratio, hex } — `hex` from hexLegsOf, and without it this does
 * nothing at all.
 */
export function applyHexGait(tgt, gait, env = {}) {
  const H = gait.hex;
  const rig = env.hex;
  if (!H || !rig) return;
  const ratio = env.ratio ?? 1;
  const ph = env.ph ?? 0;
  const sweep = (H.sweep || 0) + (H.sweepRun || 0) * ratio;
  const lift = (H.lift || 0) + (H.liftRun || 0) * ratio;
  const fold = (H.fold || 0) + (H.foldRun || 0) * ratio;
  const mix = clamp01(H.yaw || 0);
  for (const l of rig.legs) {
    if (!l.driven) continue;
    const h = tgt[l.hip], k = tgt[l.knee];
    if (!h && !k) continue;
    // the tripod, plus the wave running back down the body
    const p = ph + (l.group ? Math.PI : 0) - (H.lag || 0) * (l.rank || 0);
    const amp = l.rank === 0 ? (H.frontAmp ?? 1) : l.rank === 1 ? (H.midAmp ?? 1) : 1;
    // FORWARD when sin is positive — the same beat the back leg on this side is
    // on, since the stride above drives thighL by -swing*sin(ph) and a negative
    // thigh pitch is forward.
    const fore = sweep * amp * Math.sin(p);
    // …split between swinging UNDER the hip and swinging ROUND it (`yaw`). Both
    // carry the foot along the body's forward axis; what changes is the shape of
    // the arc it takes to get there, and how much ground it covers doing it.
    const pitch = fore * (1 - mix), turn = fore * mix * l.side;
    // …and OFF THE GROUND through the forward half of that swing
    const air = Math.max(0, Math.sin(p + (H.liftPhase ?? 1.57)));
    const up = (H.splay || 0) + lift * amp * air;
    if (h) {
      for (let i = 0; i < 3; i++) {
        h[i] += l.pitchAxis[i] * pitch + l.yawAxis[i] * turn + l.liftAxis[i] * up;
      }
    }
    if (k) {
      const bend = (H.crouch || 0) + fold * amp * air;
      for (let i = 0; i < 3; i++) k[i] += l.liftAxis[i] * bend;
    }
  }
  // THE BACK PAIR rides the ordinary stride (it carries the game leg joints, so
  // applyGait and every foot rule already own it) — but the yaw mix is a
  // property of the BODY, not of one layer, and legs that swing round the hip
  // beside legs that pendulum under it read as two animals. So take `mix` of
  // what the stride wrote as thigh PITCH back out, and put the same swing in as
  // thigh YAW. Joint space, before the foot rule runs, so nothing downstream
  // sees a leg that disagrees with its own ankle.
  if (mix > 1e-4 && gait.legs) {
    const L = gait.legs;
    const phL = ph + (L.phase || 0);
    const swingAmt = (L.swing || 0) + (L.swingRun || 0) * ratio;
    for (const l of rig.legs) {
      const t = l.joint && tgt[l.joint];
      if (!t) continue;
      const s = Math.sin(phL + (l.side > 0 ? 0 : Math.PI));
      t[0] += mix * swingAmt * s;              // undo that share of the pendulum
      t[1] += mix * swingAmt * s * l.side;     // …and swing it round instead
    }
  }
}

// ---------------------------------------------------------------------------
// EXPORT — the gait workbench's "Output gait" hands over exactly this text, so
// an edited gait can be pasted back into the GAITS table above verbatim.
// ---------------------------------------------------------------------------
const num = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

export function formatGait(id, gait) {
  const lines = [`  ${id}: {`];
  // A GAIT WITH A BASE IS EMITTED AS ONE. Spelling every inherited number out
  // would paste back as a gait that no longer follows its base — the block would
  // look identical and silently stop tracking the gait it is supposed to be a
  // variant of. So name the base and print only what actually differs from it.
  const baseId = gaitBaseOf(id);
  const base = baseId ? GAITS[baseId] : null;
  if (baseId) lines.push(`    base: ${JSON.stringify(baseId)},`);
  lines.push(`    name: ${JSON.stringify(gait.name || id)},`);
  if (gait.note) lines.push(`    note: ${JSON.stringify(gait.note)},`);
  for (const grp of GROUPS) {
    const g = gait[grp];
    if (!g) continue;
    const inherited = base?.[grp];
    const body = Object.entries(g)
      .filter(([k, v]) => !inherited || !(k in inherited) || Math.abs(inherited[k] - v) > 1e-9)
      .map(([k, v]) => `${k}: ${num(v)}`);
    if (!body.length) continue;
    // legs and quad are long enough to want wrapping; the others fit one line
    if (body.join(', ').length <= 92) {
      lines.push(`    ${grp}: { ${body.join(', ')} },`);
    } else {
      lines.push(`    ${grp}: {`);
      let row = [];
      for (const b of body) {
        row.push(b);
        if (row.join(', ').length > 66) { lines.push(`      ${row.join(', ')},`); row = []; }
      }
      if (row.length) lines.push(`      ${row.join(', ')},`);
      lines.push('    },');
    }
  }
  // hand-keyed corrections, one key per line — see applyGaitKeys
  if (gait.keys?.length) {
    lines.push('    keys: [');
    for (const k of gait.keys.slice().sort((a, b) => a.ph - b.ph)) {
      const pose = Object.entries(k.pose || {})
        .map(([j, v]) => `${j}: [${v.map(num).join(', ')}]`).join(', ');
      lines.push(`      { ph: ${num(k.ph)}, pose: { ${pose} } },`);
    }
    lines.push('    ],');
  }
  lines.push('  },');
  return lines.join('\n');
}
