// Keyframe clips for combat & personality. Angles in DEGREES for authoring;
// compiled to radians. hipsPos is in meters at scale=1 (multiplied by mech scale).
//
// Joint conventions (mech faces +Z, limbs hang -Y):
//   shoulder.x negative  -> arm swings forward/up
//   elbow.x negative     -> elbow flexes forward
//   thigh.x negative     -> leg swings forward
//   knee.x positive      -> knee bends (shin back)
//   torso.y negative     -> right shoulder comes forward
//   shoulderL.z negative -> left arm flares outward (mirror for R)

export const UPPER_JOINTS = [
  'torso', 'head', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'handL', 'handR',
];

// key: { t, ease?, pose: { joint: [x,y,z] | hipsPos: [x,y,z] | hipsRot: [x,y,z] } }
// Shared return-to-rest end keys. A pose key only drives the joints it
// lists, so these are distinct variants, not one constant: FULL squares
// everything ankles-down, ARMSTANCE keeps handR keyed (the lance-carry
// family), UPPER leaves ankles to the locomotion blend. Use one ONLY when
// the clip's final key matches it exactly — near-misses stay inline.
const REST_FULL = { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], torso: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0], head: [0, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0], ankleL: [0, 0, 0], ankleR: [0, 0, 0] };
const REST_ARMSTANCE = { torso: [0, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, 0, 0], head: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], handR: [0, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0], thighL: [0, 0, 0], kneeL: [0, 0, 0], thighR: [0, 0, 0], kneeR: [0, 0, 0], ankleR: [0, 0, 0] };
const REST_UPPER = { torso: [0, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0] };

// The tight-ball tuck the air somersault curls into, and the stretched-long
// pre-landing reach — named because each is shared across two places: the
// tuck is both the `ball` clip's held key and the base a roster `ballPose`
// override is merged over (defClipVariants), and the stretch is both
// landReach's held pose and land's t=0 (the touchdown handover).
const BALL_TUCK = { hipsPos: [0, -0.12, 0], hipsRot: [14, 0, 0], torso: [52, 0, 0], head: [26, 0, 0], thighL: [-96, 0, -4], thighR: [-100, 0, 4], kneeL: [126, 0, 0], kneeR: [122, 0, 0], ankleL: [-30, 0, 0], ankleR: [-30, 0, 0], shoulderL: [-62, 18, 4], shoulderR: [-62, -18, -4], elbowL: [-112, 0, 0], elbowR: [-112, 0, 0], handL: [24, 0, 0], handR: [24, 0, 0] };
const LAND_STRETCH = { hipsPos: [0, 0.12, 0], hipsRot: [0, 0, 0], torso: [6, 0, 0], head: [-6, 0, 0], thighL: [-6, 0, -3], thighR: [-6, 0, 3], kneeL: [6, 0, 0], kneeR: [6, 0, 0], ankleL: [-32, 0, 0], ankleR: [-32, 0, 0], shoulderL: [-38, 0, -58], shoulderR: [-38, 0, 58], elbowL: [-18, 0, 0], elbowR: [-18, 0, 0], handL: [0, 0, 0], handR: [0, 0, 0] };

// ---------- SAURION's PERCH (biteLatch) ----------
// The pose vocabulary for riding a kill: he does not just bite it, he HOLDS IT
// DOWN and opens it up. A raptor's hands are hooked sickles carried in front —
// on top of prey they chamber high and drag down through it, alternating, while
// the jaws hammer the collar between rakes. Arm values are ABSOLUTE (only
// legs/torso/head take the restPose bias) and every one of them sits inside his
// `foreCarry` band, so the compile-time clamp leaves them exactly as authored.
const perchCarry = (s) => ({            // claws hooked into what he is standing on
  ['shoulder' + s]: [-74, 0, s === 'L' ? -20 : 20], ['elbow' + s]: [-58, 0, 0],
  ['hand' + s]: [30, 0, s === 'L' ? 12 : -12],
});
// The rake is his own forehand SWIPE (saurionClawR) reshaped for a body he is
// standing ON: the drive is shoulder YAW carrying the claw ACROSS the thing
// under him while the elbow EXTENDS, not a shoulder pitched out to the side —
// which is what the first version did, and it read as presenting the claw
// rather than opening anything with it.
const perchChamber = (s) => ({          // …cocked high and outboard
  ['shoulder' + s]: [-116, s === 'L' ? -22 : 22, s === 'L' ? -28 : 28],
  ['elbow' + s]: [-92, 0, 0], ['hand' + s]: [40, 0, s === 'L' ? 16 : -16],
});
const perchRake = (s) => ({             // …and DRAGGED down and across them
  ['shoulder' + s]: [-44, s === 'L' ? 24 : -24, s === 'L' ? 6 : -6],
  ['elbow' + s]: [-34, 0, 0], ['hand' + s]: [-12, 0, s === 'L' ? 6 : -6],
});
const PERCH_UP = { torso: [22, 0, 0], head: [-14, 0, 0], hipsRot: [20, 0, 0], hipsPos: [0, -0.55, 0] };
const PERCH_BITE = { torso: [38, 0, 0], head: [55, 0, 0], hipsRot: [26, 0, 0], hipsPos: [0, -0.68, 0] };
const PERCH_LEGS = { thighL: [-24, 0, -10], thighR: [-24, 0, 10], kneeL: [40, 0, 0], kneeR: [40, 0, 0],
  ankleL: [-20, 0, 0], ankleR: [-20, 0, 0] };
// THE FOUR BEATS, in clip seconds — bite, right rake, bite, left rake. The
// hits are scheduled against these numbers (combat/specials.js sickleRush), so
// the blow lands on the frame the limb arrives rather than near it.
export const PERCH_BEATS = { bite1: 0.07, rakeR: 0.24, bite2: 0.37, rakeL: 0.54, loop: 0.6 };


const CLIPS_RAW = {
  // ---------- personality ----------
  intro: {
    dur: 2.3, cancelOnMove: true,
    keys: [
      { t: 0, pose: { hipsPos: [0, -1.5, 0], torso: [42, 0, 0], head: [-30, 0, 0], shoulderL: [20, 0, -14], shoulderR: [20, 0, 14], elbowL: [-30, 0, 0], elbowR: [-30, 0, 0], kneeL: [95, 0, 0], kneeR: [95, 0, 0], thighL: [-52, 0, 0], thighR: [-52, 0, 0], ankleL: [-40, 0, 0], ankleR: [-40, 0, 0] } },
      { t: 0.55, ease: 'inOutQuad', pose: { hipsPos: [0, -1.4, 0], torso: [40, 0, 0], head: [-28, 0, 0] } },
      { t: 1.25, ease: 'outCubic', pose: { hipsPos: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0], ankleL: [0, 0, 0], ankleR: [0, 0, 0] } },
      { t: 1.6, ease: 'outBack', pose: { shoulderL: [-15, 0, -30], shoulderR: [-15, 0, 30], elbowL: [-115, 0, 0], elbowR: [-115, 0, 0], torso: [-6, 0, 0], head: [6, 0, 0] } },
      { t: 2.3, ease: 'inOutQuad', pose: { shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], torso: [0, 0, 0], head: [0, 0, 0] } },
    ],
    events: [{ t: 1.55, type: 'sfx', arg: 'powerup' }],
  },
  victory: {
    dur: 2.6, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.4, ease: 'outBack', pose: { shoulderR: [-165, 0, 18], elbowR: [-20, 0, 0], torso: [-10, 0, -6], head: [-12, 0, 0], shoulderL: [10, 0, -18], elbowL: [-30, 0, 0] } },
      { t: 0.8, ease: 'inOutQuad', pose: { shoulderR: [-150, 0, 14] } },
      { t: 1.1, ease: 'outBack', pose: { shoulderR: [-168, 0, 18] } },
      { t: 2.0, ease: 'inOutQuad', pose: { shoulderR: [-150, 0, 25], elbowR: [-115, 0, 0], torso: [-6, 0, 0] } },
    ],
    events: [{ t: 0.35, type: 'sfx', arg: 'powerup' }],
  },
  taunt: {
    dur: 1.3, cancelOnMove: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.3, ease: 'outQuad', pose: { torso: [14, 12, 0], head: [-10, -10, 0], shoulderR: [-72, 0, 16], elbowR: [-70, 0, 0] } },
      { t: 0.55, ease: 'inOutQuad', pose: { elbowR: [-30, 0, 0] } },
      { t: 0.75, ease: 'inOutQuad', pose: { elbowR: [-75, 0, 0] } },
      { t: 1.3, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0] } },
    ],
    events: [{ t: 0.35, type: 'sfx', arg: 'taunt' }],
  },

  // ---------- melee ----------
  // exaggerated wind-ups, full-body twist (hipsRot), side leans and outBack
  // overshoot on the strikes — snappy anime energy instead of stiff robots.
  light1: { // left jab — a REAL pull-back first (fist chambers, hips coil
    // right), then the whip through the punch
    strikeArm: 'L', // ONE-ARMED blow — see Fighter.aimStrikeAt
    dur: 0.52,
    keys: [
      { t: 0, pose: {} },
      { t: 0.11, ease: 'outCubic', pose: { torso: [6, -22, -6], hipsRot: [0, -10, 0], shoulderL: [-26, 8, -20], elbowL: [-112, 0, 0], shoulderR: [10, 0, 18], head: [0, 10, 0] } },
      { t: 0.23, ease: 'outBack', pose: { torso: [10, 26, 8], hipsRot: [0, 14, 0], hipsPos: [0, -0.12, 0], shoulderL: [-98, -14, 24], elbowL: [-4, 0, 0], shoulderR: [18, 0, 26], head: [0, -12, 0] } },
      { t: 0.34, ease: 'inOutQuad', pose: { torso: [7, 18, 5], hipsRot: [0, 10, 0], shoulderL: [-84, -10, 18], elbowL: [-24, 0, 0] } },
      { t: 0.52, ease: 'inOutQuad', pose: { torso: [0, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0], shoulderR: [0, 0, 10], head: [0, 0, 0] } },
    ],
    events: [{ t: 0.2, type: 'sfx', arg: 'whoosh' }, { t: 0.23, type: 'hit', arg: 0 }],
  },
  light2: { // right cross — chambers deep behind the shoulder, then the
    // counter-twist throws it through
    strikeArm: 'R', // ONE-ARMED blow — see Fighter.aimStrikeAt
    dur: 0.56,
    keys: [
      { t: 0, pose: {} },
      { t: 0.12, ease: 'outCubic', pose: { torso: [7, 24, 6], hipsRot: [0, 12, 0], shoulderR: [-30, -8, 22], elbowR: [-116, 0, 0], shoulderL: [12, 0, -20], head: [0, -10, 0] } },
      { t: 0.25, ease: 'outBack', pose: { torso: [10, -30, -8], hipsRot: [0, -16, 0], hipsPos: [0, -0.14, 0], shoulderR: [-100, 14, -24], elbowR: [-2, 0, 0], shoulderL: [20, 0, -28], head: [0, 12, 0] } },
      { t: 0.37, ease: 'inOutQuad', pose: { torso: [7, -20, -5], hipsRot: [0, -11, 0], shoulderR: [-86, 10, -18], elbowR: [-22, 0, 0] } },
      { t: 0.56, ease: 'inOutQuad', pose: { torso: [0, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], shoulderL: [0, 0, -10], head: [0, 0, 0] } },
    ],
    events: [{ t: 0.22, type: 'sfx', arg: 'whoosh' }, { t: 0.25, type: 'hit', arg: 1 }],
  },
  light3: { // rising uppercut — deep coil, launch onto tiptoes, fist driven up
    // THROUGH the target line. The strike used to swing the arm to −150° pitch,
    // which is past vertical: measured on the rig, the fist ended 0.16 units in
    // front of the hips and 5.1 up — directly over his own shoulder, so the blow
    // read as raising an arm rather than punching. It now lands where the jab and
    // cross land (fwd 2.8 vs their ~3.0) but higher (up 2.9 vs 2.1) and ON the
    // centreline (lat 0.04, was 0.89 across to the far side): a rising blow into
    // the same spot, with the torso unwinding to drive the shoulder through it
    // rather than arching away from it. Solved with a grid search over the
    // strike-frame shoulder/elbow/torso against those measured fist positions.
    strikeArm: 'R', // ONE-ARMED blow — see Fighter.aimStrikeAt
    dur: 0.62,
    keys: [
      { t: 0, pose: {} },
      { t: 0.18, ease: 'inOutCubic', pose: { hipsPos: [0, -0.7, 0], hipsRot: [0, 16, 0], torso: [30, 20, -10], head: [8, -8, 0], shoulderR: [22, 0, 14], elbowR: [-130, 0, 0], shoulderL: [-20, 0, -30], elbowL: [-40, 0, 0], kneeL: [55, 0, 0], kneeR: [55, 0, 0], thighL: [-28, 0, 0], thighR: [-28, 0, 0] } },
      { t: 0.32, ease: 'outBack', pose: { hipsPos: [0, 0.35, 0], hipsRot: [0, -14, 0], torso: [-14, -22, 8], head: [-14, 6, 0], shoulderR: [-80, 24, 0], elbowR: [-25, 0, 0], shoulderL: [10, 0, -36], elbowL: [-60, 0, 0], kneeL: [4, 0, 0], kneeR: [12, 0, 0], thighL: [6, 0, 0], thighR: [-8, 0, 0], ankleL: [22, 0, 0], ankleR: [22, 0, 0] } },
      { t: 0.62, ease: 'inOutQuad', pose: REST_FULL },
    ],
    events: [{ t: 0.27, type: 'sfx', arg: 'whooshBig' }, { t: 0.3, type: 'hit', arg: 2 }],
  },
  // ---------- VIPER: ninja sword forms ----------
  // blade-led arcs and lunging thrusts: the elbow stays near-straight so the
  // forearm energy daggers LEAD every move — never a punch holding a sword.
  viperSlash1: { // right blade: draws BACK across the far shoulder first,
    // then the horizontal right-to-left cut across the throat line
    dur: 0.5,
    keys: [
      { t: 0, pose: {} },
      { t: 0.1, ease: 'outCubic', pose: { torso: [4, 30, 5], hipsRot: [0, 14, 0], head: [0, -14, 0], shoulderR: [-62, 42, 30], elbowR: [-26, 0, 0], handR: [0, 0, 35], shoulderL: [12, 0, -22], elbowL: [-40, 0, 0] } },
      { t: 0.22, ease: 'outBack', pose: { torso: [8, -34, -7], hipsRot: [0, -17, 0], hipsPos: [0, -0.12, 0], head: [0, 14, 0], shoulderR: [-96, -30, -20], elbowR: [-3, 0, 0], handR: [0, 0, -30], shoulderL: [18, 0, -28] } },
      { t: 0.34, ease: 'inOutQuad', pose: { torso: [6, -24, -5], hipsRot: [0, -12, 0], shoulderR: [-88, -24, -14] } },
      { t: 0.5, ease: 'inOutQuad', pose: { torso: [0, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, 0, 0], head: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], handR: [0, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0] } },
    ],
    events: [{ t: 0.19, type: 'sfx', arg: 'slash' }, { t: 0.22, type: 'hit', arg: 0 }],
  },
  viperSlash2: { // left blade: drops to the hip first, then the rising
    // reverse diagonal — low hip to high shoulder
    dur: 0.54,
    keys: [
      { t: 0, pose: {} },
      { t: 0.11, ease: 'outCubic', pose: { torso: [10, -30, -6], hipsRot: [0, -14, 0], hipsPos: [0, -0.16, 0], head: [0, 12, 0], shoulderL: [-30, -40, -38], elbowL: [-20, 0, 0], handL: [0, 0, -35], shoulderR: [14, 0, 24], elbowR: [-45, 0, 0] } },
      { t: 0.23, ease: 'outBack', pose: { torso: [-6, 32, 8], hipsRot: [0, 16, 0], hipsPos: [0, 0.05, 0], head: [-6, -12, 0], shoulderL: [-124, 26, 18], elbowL: [-4, 0, 0], handL: [0, 0, 30], shoulderR: [20, 0, 30] } },
      { t: 0.36, ease: 'inOutQuad', pose: { torso: [-4, 22, 6], hipsRot: [0, 11, 0], shoulderL: [-112, 20, 14] } },
      { t: 0.54, ease: 'inOutQuad', pose: { torso: [0, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0], handL: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0] } },
    ],
    events: [{ t: 0.2, type: 'sfx', arg: 'slash' }, { t: 0.23, type: 'hit', arg: 1 }],
  },
  viperStab: { // combo ender: coiled low, then a full-body lunging skewer
    dur: 0.6,
    keys: [
      { t: 0, pose: {} },
      { t: 0.14, ease: 'inOutCubic', pose: { torso: [6, 30, 0], hipsRot: [0, 16, 0], hipsPos: [0, -0.3, -0.1], head: [0, -14, 0], shoulderR: [-28, 20, 14], elbowR: [-98, 0, 0], handR: [0, 0, 20], shoulderL: [-14, 0, -30], elbowL: [-55, 0, 0], thighL: [-30, 0, 0], kneeL: [50, 0, 0], thighR: [12, 0, 0], kneeR: [30, 0, 0] } },
      { t: 0.28, ease: 'outBack', pose: { torso: [24, -26, -4], hipsRot: [4, -14, 0], hipsPos: [0, -0.34, 0.3], head: [-10, 12, 0], shoulderR: [-94, -8, 2], elbowR: [0, 0, 0], handR: [0, 0, 0], shoulderL: [18, 0, -34], elbowL: [-30, 0, 0], thighL: [-48, 0, 0], kneeL: [58, 0, 0], thighR: [26, 0, 0], kneeR: [60, 0, 0], ankleR: [24, 0, 0] } },
      { t: 0.42, ease: 'inOutQuad', pose: { torso: [20, -20, -3], hipsPos: [0, -0.3, 0.24] } },
      { t: 0.6, ease: 'inOutQuad', pose: REST_ARMSTANCE },
    ],
    events: [{ t: 0.24, type: 'sfx', arg: 'whoosh' }, { t: 0.28, type: 'hit', arg: 2 }],
  },
  viperWhirl: { // BLADE CYCLONE carriage (upper-body only, so the LEGS keep
    // walking underneath): both swords thrown out level like rotor blades,
    // arms see-sawing so the cuts carve different heights — the special
    // spins the torso joint post-pose, IG-11 style
    dur: 0.5, loop: true, upper: true,
    keys: [
      { t: 0, pose: { torso: [6, 0, 0], head: [-4, 0, 0], shoulderL: [-18, 0, -86], shoulderR: [-10, 0, 86], elbowL: [-6, 0, 0], elbowR: [-6, 0, 0], handL: [0, 0, -10], handR: [0, 0, 10] } },
      { t: 0.25, ease: 'inOutQuad', pose: { shoulderL: [-8, 0, -84], shoulderR: [-22, 0, 84], torso: [8, 0, 0] } },
      { t: 0.5, ease: 'inOutQuad', pose: { shoulderL: [-18, 0, -86], shoulderR: [-10, 0, 86], torso: [6, 0, 0] } },
    ],
    events: [{ t: 0.1, type: 'sfx', arg: 'whoosh' }, { t: 0.35, type: 'sfx', arg: 'whoosh' }],
  },
  viperHeavy: { // kesa-giri: blade raised high behind the head, then one great
    // diagonal cut down through the target with full follow-through
    dur: 0.8,
    keys: [
      { t: 0, pose: {} },
      { t: 0.3, ease: 'inOutCubic', pose: { torso: [-18, 28, 8], hipsRot: [-4, 12, 0], hipsPos: [0, -0.22, 0], head: [8, -12, 0], shoulderR: [-168, 14, 28], elbowR: [-24, 0, 0], handR: [0, 0, 25], shoulderL: [-20, 0, -34], elbowL: [-60, 0, 0], kneeL: [40, 0, 0], kneeR: [40, 0, 0], thighL: [-20, 0, 0], thighR: [-20, 0, 0] } },
      { t: 0.42, ease: 'inCubic', pose: { torso: [34, -28, -10], hipsRot: [8, -14, 0], hipsPos: [0, -0.42, 0.16], head: [4, 12, 0], shoulderR: [-52, -24, -28], elbowR: [-4, 0, 0], handR: [0, 0, -35], shoulderL: [16, 0, -30], elbowL: [-24, 0, 0], kneeL: [55, 0, 0], kneeR: [55, 0, 0], thighL: [-28, 0, 0], thighR: [-28, 0, 0], ankleL: [-22, 0, 0], ankleR: [-22, 0, 0] } },
      { t: 0.58, ease: 'outQuad', pose: { torso: [28, -22, -8], hipsPos: [0, -0.34, 0.12] } },
      { t: 0.8, ease: 'inOutQuad', pose: { torso: [0, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, 0, 0], head: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], handR: [0, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0], ankleL: [0, 0, 0], ankleR: [0, 0, 0] } },
    ],
    events: [{ t: 0.38, type: 'sfx', arg: 'whooshBig' }, { t: 0.42, type: 'hit', arg: 0 }, { t: 0.44, type: 'shake', arg: 0.4 }],
  },

  // ---------- AEGIS: spear-and-shield forms ----------
  // Researched off classical hoplite doru technique + athletic javelin form:
  //   * the body fights BLADED — lead-left behind the tower shield, deep
  //     knees, and every strike is driven by hip rotation, not the arm
  //   * two true spear grips: UNDERARM (couched by the hip, thrust on the
  //     low line) and OVERARM (hand above the helm, striking down over the
  //     shield's top rim — the classic promachos vase pose)
  //   * the shield is strapped to the FOREARM, so the left fist is free to
  //     JOIN THE SHAFT for two-handed power moves while the shield keeps
  //     covering — the animator squares its face front through every form
  //   * the shield guard through every swing is one strong high-front
  //     brace: shoulderL [-46,22,-8] / elbowL [-72]
  // NOTE on spear aim: the lance lies along the HAND's local +Z, so with the
  // arm raised forward and the hand at rest the tip points straight UP (the
  // old "punching with a spear" read). Keeping handR.x ~= -(shoulderX +
  // elbowX) pitches the tip back onto the target line — every key below
  // holds that identity (+a few degrees pitches the tip DOWN) so the point
  // LEADS through chamber and strike.
  aegisStab1: { // UNDERARM thrust: the whole frame coils side-on and the
    // lance draws far back couched beside the hip — tip never leaving the
    // target line — then the hips fire and ram it through on the low line,
    // rear leg driving into a full lunge
    dur: 0.56,
    keys: [
      { t: 0, pose: {} },
      { t: 0.12, ease: 'outCubic', pose: { torso: [6, 34, 6], hipsRot: [0, 20, 0], hipsPos: [0, -0.16, -0.06], head: [0, -16, 0], shoulderR: [-18, 10, 12], elbowR: [-58, 0, 0], handR: [76, 0, 0], shoulderL: [-46, 22, -8], elbowL: [-72, 0, 0] } },
      { t: 0.25, ease: 'outBack', pose: { torso: [12, -26, -6], hipsRot: [3, -14, 0], hipsPos: [0, -0.2, 0.22], head: [0, 12, 0], shoulderR: [-95, -6, 0], elbowR: [-2, 0, 0], handR: [90, 0, 0], shoulderL: [-46, 22, -8], elbowL: [-72, 0, 0], thighL: [-34, 0, 0], kneeL: [42, 0, 0], thighR: [18, 0, 0], kneeR: [40, 0, 0], ankleR: [16, 0, 0] } },
      { t: 0.4, ease: 'inOutQuad', pose: { torso: [9, -20, -4], hipsPos: [0, -0.16, 0.16], shoulderR: [-90, -6, 0], handR: [86, 0, 0] } },
      { t: 0.56, ease: 'inOutQuad', pose: REST_ARMSTANCE },
    ],
    events: [{ t: 0.22, type: 'sfx', arg: 'whoosh' }, { t: 0.25, type: 'hit', arg: 0 }],
  },
  aegisStab2: { // OVERARM strike — the promachos pose: the hand hoists high
    // above the helm, tip cocked just past vertical, chest arched back;
    // then the body slams forward and the point drives DOWN over the
    // shield's top rim into the target's chest line
    dur: 0.6,
    keys: [
      { t: 0, pose: {} },
      { t: 0.14, ease: 'outCubic', pose: { torso: [-14, 26, 4], hipsRot: [0, 14, 0], hipsPos: [0, -0.1, -0.06], head: [6, -12, 0], shoulderR: [-128, 8, 14], elbowR: [-24, 0, 0], handR: [127, 0, 0], shoulderL: [-46, 22, -8], elbowL: [-72, 0, 0], thighL: [-10, 0, 0], kneeL: [20, 0, 0], thighR: [-10, 0, 0], kneeR: [20, 0, 0] } },
      { t: 0.28, ease: 'outBack', pose: { torso: [18, -18, -5], hipsRot: [3, -10, 0], hipsPos: [0, -0.22, 0.16], head: [2, 10, 0], shoulderR: [-80, -4, -2], elbowR: [-4, 0, 0], handR: [78, 0, 0], shoulderL: [-46, 22, -8], elbowL: [-72, 0, 0], thighL: [-40, 0, 0], kneeL: [46, 0, 0], thighR: [20, 0, 0], kneeR: [44, 0, 0], ankleR: [16, 0, 0] } },
      { t: 0.42, ease: 'inOutQuad', pose: { torso: [14, -13, -3], hipsPos: [0, -0.18, 0.12], shoulderR: [-76, -4, -2], handR: [76, 0, 0] } },
      { t: 0.6, ease: 'inOutQuad', pose: REST_ARMSTANCE },
    ],
    events: [{ t: 0.25, type: 'sfx', arg: 'whoosh' }, { t: 0.28, type: 'hit', arg: 1 }],
  },
  aegisPierce: { // combo ender: TWO-HANDED skewer. The left fist leaves the
    // shield grip (the shield stays strapped to the forearm, still squared
    // front) and clamps the shaft ahead of the right hand; the whole frame
    // then drops into a full fencing lunge — front knee deep, rear leg
    // driven straight — and both arms ram the lance through
    // The blow is on the LANCE, which rides handR. Without saying so, the
    // "whichever extremity leads furthest forward" fallback picked footL —
    // a full fencing lunge throws the front foot further out than the point
    // — and resolved the skewer down at ankle height behind the target.
    strikeArm: 'R',
    dur: 0.62,
    keys: [
      { t: 0, pose: {} },
      { t: 0.16, ease: 'inOutCubic', pose: { torso: [6, 30, 2], hipsRot: [0, 18, 0], hipsPos: [0, -0.34, -0.1], head: [0, -12, 0], shoulderL: [-52, 44, 6], elbowL: [-46, 0, 0], handL: [40, 0, 0], shoulderR: [-30, 22, 12], elbowR: [-96, 0, 0], handR: [126, 0, 0], thighL: [-30, 0, 0], kneeL: [50, 0, 0], thighR: [12, 0, 0], kneeR: [30, 0, 0] } },
      { t: 0.3, ease: 'outBack', pose: { torso: [26, -22, -5], hipsRot: [5, -12, 0], hipsPos: [0, -0.4, 0.34], head: [-8, 10, 0], shoulderL: [-64, 36, 4], elbowL: [-24, 0, 0], handL: [30, 0, 0], shoulderR: [-98, -8, 0], elbowR: [0, 0, 0], handR: [90, 0, 0], thighL: [-52, 0, 0], kneeL: [60, 0, 0], thighR: [28, 0, 0], kneeR: [62, 0, 0], ankleR: [24, 0, 0] } },
      { t: 0.44, ease: 'inOutQuad', pose: { torso: [21, -17, -4], hipsPos: [0, -0.34, 0.26], handR: [88, 0, 0] } },
      { t: 0.62, ease: 'inOutQuad', pose: { torso: [0, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0], handL: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], handR: [0, 0, 0], thighL: [0, 0, 0], kneeL: [0, 0, 0], thighR: [0, 0, 0], kneeR: [0, 0, 0], ankleR: [0, 0, 0] } },
    ],
    events: [{ t: 0.26, type: 'sfx', arg: 'whooshBig' }, { t: 0.3, type: 'hit', arg: 2 }],
  },
  aegisWhirlHold: { // heavy HOLD phase: spear raised overhead spinning like a
    // rotor (fighter.js heavySpin whirls the hand joint) for as long as Y is
    // held — power banks up; the shield holds the high-front guard and the
    // frame sinks deeper into the coil the longer it churns
    dur: 0.6, loop: true,
    keys: [
      { t: 0, pose: { torso: [-6, 0, 3], hipsRot: [-3, 0, 0], hipsPos: [0, -0.24, 0], head: [-16, 0, 0], shoulderR: [-176, 0, 10], elbowR: [-5, 0, 0], shoulderL: [-46, 22, -8], elbowL: [-72, 0, 0], kneeL: [30, 0, 0], kneeR: [30, 0, 0], thighL: [-16, 0, 0], thighR: [-16, 0, 0] } },
      { t: 0.3, ease: 'inOutQuad', pose: { hipsPos: [0, -0.28, 0], torso: [-8, 0, 3], shoulderR: [-174, 0, 8] } },
      { t: 0.6, ease: 'inOutQuad', pose: { hipsPos: [0, -0.24, 0], torso: [-6, 0, 3], shoulderR: [-176, 0, 10] } },
    ],
    events: [{ t: 0.08, type: 'sfx', arg: 'whoosh' }, { t: 0.38, type: 'sfx', arg: 'whoosh' }],
  },
  aegisLunge: { // heavy RELEASE: the banked whirl discharges into a flying
    // fencing lunge — the whole frame drops near-horizontal behind the point
    // and rams the spear home, shield still squared front
    dur: 0.55,
    keys: [
      { t: 0, pose: { torso: [-6, 0, 3], hipsRot: [-3, 0, 0], hipsPos: [0, -0.26, 0], head: [-16, 0, 0], shoulderR: [-174, 0, 8], elbowR: [-5, 0, 0], handR: [0, 0, 0], shoulderL: [-46, 22, -8], elbowL: [-72, 0, 0], kneeL: [30, 0, 0], kneeR: [30, 0, 0], thighL: [-16, 0, 0], thighR: [-16, 0, 0] } },
      { t: 0.14, ease: 'outBack', pose: { torso: [26, -20, -5], hipsRot: [5, -12, 0], hipsPos: [0, -0.38, 0.34], head: [-10, 9, 0], shoulderR: [-98, -8, 0], elbowR: [0, 0, 0], handR: [80, 0, 0], shoulderL: [-46, 22, -8], elbowL: [-72, 0, 0], thighL: [-52, 0, 0], kneeL: [60, 0, 0], thighR: [28, 0, 0], kneeR: [62, 0, 0], ankleR: [24, 0, 0] } },
      { t: 0.3, ease: 'inOutQuad', pose: { torso: [20, -15, -4], hipsPos: [0, -0.3, 0.26], handR: [78, 0, 0] } },
      { t: 0.55, ease: 'inOutQuad', pose: REST_ARMSTANCE },
    ],
    events: [{ t: 0.04, type: 'sfx', arg: 'whooshBig' }, { t: 0.16, type: 'hit', arg: 0 }, { t: 0.18, type: 'shake', arg: 0.4 }],
  },
  aegisThrow: { // ranged: a TRUE JAVELIN throw, built off athletic form.
    // WITHDRAWAL: the body turns fully side-on and the throwing arm
    // EXTENDS straight back, level at shoulder height — the shaft lies
    // along the whole arm with the tip riding by the helm, still aimed at
    // the target (this extended-back carry is what separates a javelin
    // throw from a knife flick). The shield arm stays a raised wall toward
    // the enemy, part guard, part aim. It HOLDS a readable beat, chest
    // arched back into the bow — then the hips fire, the front leg BLOCKS,
    // and the arm whips over the TOP, releasing high with the chest snap.
    // Follow-through carries the arm down across the body like a thrown
    // strikeout pitch before recovering to guard.
    dur: 0.78,
    keys: [
      { t: 0, pose: {} },
      // withdrawal — side-on, arm extended level behind, chest opening
      { t: 0.2, ease: 'outCubic', pose: { torso: [-16, 44, 6], hipsRot: [-2, 26, 0], hipsPos: [0, -0.12, -0.1], head: [4, -34, 0], shoulderR: [80, 0, 24], elbowR: [-8, 0, 0], handR: [-72, 0, 0], shoulderL: [-64, 30, 0], elbowL: [-30, 0, 0], thighL: [-20, 0, 0], kneeL: [16, 0, 0], thighR: [14, 0, 0], kneeR: [28, 0, 0] } },
      // the bow — the draw deepens and HOLDS so the wind-up is unmistakable
      { t: 0.34, ease: 'inOutQuad', pose: { torso: [-18, 46, 6], hipsRot: [-3, 28, 0], hipsPos: [0, -0.14, -0.12], head: [5, -36, 0], shoulderR: [86, 0, 26], elbowR: [-6, 0, 0], handR: [-80, 0, 0], shoulderL: [-66, 30, 0], elbowL: [-28, 0, 0], thighL: [-22, 0, 0], kneeL: [18, 0, 0], thighR: [15, 0, 0], kneeR: [30, 0, 0] } },
      // strike — hips fire, front leg blocks, the arm whips over the TOP
      { t: 0.47, ease: 'outCubic', pose: { torso: [26, -20, -6], hipsRot: [6, -14, 0], hipsPos: [0, -0.16, 0.2], head: [0, 6, 0], shoulderR: [-96, 4, -2], elbowR: [-8, 0, 0], handR: [96, 0, 0], shoulderL: [-20, 10, -14], elbowL: [-40, 0, 0], thighL: [-44, 0, 0], kneeL: [30, 0, 0], thighR: [26, 0, 0], kneeR: [52, 0, 0], ankleR: [22, 0, 0] } },
      // follow-through — the arm carries down ACROSS the body, torso folding
      { t: 0.62, ease: 'outQuad', pose: { torso: [30, -26, -8], hipsRot: [6, -14, 0], hipsPos: [0, -0.2, 0.24], head: [2, 8, 0], shoulderR: [-40, -16, -10], elbowR: [-46, 0, 0], handR: [30, 0, 0], shoulderL: [-24, 12, -14], elbowL: [-44, 0, 0] } },
      // recover to the high shield guard
      { t: 0.78, ease: 'inOutQuad', pose: { torso: [4, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, 0, 0], head: [0, 0, 0], shoulderR: [-30, 0, 8], elbowR: [-28, 0, 0], handR: [6, 0, 0], shoulderL: [-46, 22, -8], elbowL: [-72, 0, 0], thighL: [0, 0, 0], kneeL: [0, 0, 0], thighR: [0, 0, 0], kneeR: [0, 0, 0], ankleR: [0, 0, 0] } },
    ],
    events: [{ t: 0.36, type: 'sfx', arg: 'whooshBig' }, { t: 0.45, type: 'fire' }],
  },
  shieldWhirlHold: { // AEGIS Bulwark Bash wind-up: the tower shield is
    // hoisted straight overhead FACE-UP and whirled like a rotor (the
    // special spins elbowL post-pose) while the LANCE LEVELS at the enemy —
    // a menacing come-on instead of a dangling arm.
    // Deliberately NOT 'aegis'-prefixed: the signature's square-to-front
    // shield brace must not fight the face-up carry.
    dur: 0.6, loop: true,
    keys: [
      { t: 0, pose: { torso: [-6, 0, -3], hipsRot: [-3, 0, 0], hipsPos: [0, -0.22, 0], head: [-16, 0, 0], shoulderL: [-176, 0, -10], elbowL: [-5, 0, 0], shoulderR: [-60, 0, 10], elbowR: [-20, 0, 0], handR: [80, 0, 0], kneeL: [28, 0, 0], kneeR: [28, 0, 0], thighL: [-15, 0, 0], thighR: [-15, 0, 0] } },
      { t: 0.3, ease: 'inOutQuad', pose: { hipsPos: [0, -0.26, 0], torso: [-8, 0, -3], shoulderL: [-174, 0, -8], shoulderR: [-62, 0, 10] } },
      { t: 0.6, ease: 'inOutQuad', pose: { hipsPos: [0, -0.22, 0], torso: [-6, 0, -3], shoulderL: [-176, 0, -10], shoulderR: [-60, 0, 10] } },
    ],
    events: [{ t: 0.08, type: 'sfx', arg: 'whoosh' }, { t: 0.38, type: 'sfx', arg: 'whoosh' }],
  },
  aegisShieldSmash: { // Bulwark Bash release: the whirling shield comes
    // DOWN off the crown and RAMS forward face-first — the special grows
    // it to a bot-tall wall through the strike ('aegis' prefix so the
    // signature squares the face to the front for the impact)
    dur: 0.62,
    keys: [
      { t: 0, pose: { torso: [-6, 0, -3], hipsRot: [-3, 0, 0], hipsPos: [0, -0.22, 0], head: [-16, 0, 0], shoulderL: [-176, 0, -10], elbowL: [-5, 0, 0], shoulderR: [-60, 0, 10], elbowR: [-20, 0, 0], handR: [80, 0, 0], kneeL: [28, 0, 0], kneeR: [28, 0, 0], thighL: [-15, 0, 0], thighR: [-15, 0, 0] } },
      { t: 0.16, ease: 'outBack', pose: { torso: [16, 12, -3], hipsRot: [4, 6, 0], hipsPos: [0, -0.22, 0.26], head: [0, -6, 0], shoulderL: [-88, 14, -6], elbowL: [-18, 0, 0], shoulderR: [22, 0, 18], elbowR: [-30, 0, 0], handR: [10, 0, 0], thighL: [-40, 0, 0], kneeL: [50, 0, 0], thighR: [20, 0, 0], kneeR: [46, 0, 0], ankleR: [18, 0, 0] } },
      { t: 0.36, ease: 'inOutQuad', pose: { torso: [13, 10, -2], hipsPos: [0, -0.2, 0.2] } },
      { t: 0.62, ease: 'inOutQuad', pose: REST_ARMSTANCE },
    ],
    events: [{ t: 0.06, type: 'sfx', arg: 'whooshBig' }, { t: 0.18, type: 'hit', arg: 0 }, { t: 0.2, type: 'shake', arg: 0.5 }],
  },
  frozenSurrender: { // GLACIER's finisher victim: iced over mid-surrender —
    // both hands thrown in the air, slight cower, held solid
    dur: 0.55, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.55, ease: 'outCubic', pose: { shoulderL: [-160, 0, -18], shoulderR: [-160, 0, 18], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], torso: [-10, 0, 0], head: [-14, 0, 0], hipsPos: [0, -0.1, 0], kneeL: [14, 0, 0], kneeR: [14, 0, 0], thighL: [-8, 0, 0], thighR: [-8, 0, 0] } },
    ],
  },
  daintyTap: { // GLACIER's finisher: one delicate outstretched poke —
    // barely a touch, all it takes
    dur: 0.85,
    keys: [
      { t: 0, pose: {} },
      { t: 0.32, ease: 'inOutCubic', pose: { torso: [4, -10, 0], head: [2, 8, 0], hipsPos: [0, -0.04, 0.05], shoulderR: [-60, 0, 6], elbowR: [-48, 0, 0], handR: [-16, 0, 0], shoulderL: [4, 0, -14] } },
      { t: 0.46, ease: 'outCubic', pose: { shoulderR: [-74, 0, 2], elbowR: [-10, 0, 0], torso: [6, -12, 0], hipsPos: [0, -0.05, 0.09] } },
      { t: 0.85, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsPos: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], handR: [0, 0, 0], shoulderL: [0, 0, -10] } },
    ],
    events: [{ t: 0.42, type: 'sfx', arg: 'servo' }],
  },
  viperDrill: { // heavy: ninja coil, then the whole body launches FLAT and
    // corkscrews forward — both blades speared ahead as the drill point
    // (fighter.js heavySpin barrel-rolls the hips; heavyDrive flies it)
    dur: 0.95,
    keys: [
      { t: 0, pose: {} },
      { t: 0.24, ease: 'inOutCubic', pose: { hipsPos: [0, -0.85, 0], hipsRot: [0, 8, 0], torso: [20, 10, 0], head: [-10, -8, 0], shoulderL: [-42, 30, -48], shoulderR: [-42, -30, 48], elbowL: [-72, 0, 0], elbowR: [-72, 0, 0], handL: [0, 0, -30], handR: [0, 0, 30], kneeL: [80, 0, 0], kneeR: [80, 0, 0], thighL: [-42, 0, 0], thighR: [-42, 0, 0], ankleL: [-34, 0, 0], ankleR: [-34, 0, 0] } },
      { t: 0.36, ease: 'outCubic', pose: { hipsPos: [0, 0.5, 0], hipsRot: [90, 0, 0], torso: [0, 0, 0], head: [12, 0, 0], shoulderL: [-172, 0, -6], shoulderR: [-172, 0, 6], elbowL: [-4, 0, 0], elbowR: [-4, 0, 0], handL: [0, 0, 0], handR: [0, 0, 0], kneeL: [8, 0, 0], kneeR: [8, 0, 0], thighL: [4, 0, -3], thighR: [4, 0, 3], ankleL: [-30, 0, 0], ankleR: [-30, 0, 0] } },
      { t: 0.72, ease: 'inOutQuad', pose: { hipsPos: [0, 0.42, 0], hipsRot: [90, 0, 0] } },
      { t: 0.95, ease: 'inOutQuad', pose: REST_FULL },
    ],
    events: [{ t: 0.3, type: 'sfx', arg: 'dash' }, { t: 0.44, type: 'sfx', arg: 'whooshBig' }, { t: 0.55, type: 'hit', arg: 0 }, { t: 0.57, type: 'shake', arg: 0.35 }],
  },
  novaSmite: { // heavy: reach to the sky — a shaft of starlight strikes the
    // staff (fx event) and sets it blazing — then hammer it down for an
    // area-burst on whatever stands there
    dur: 1.1,
    keys: [
      { t: 0, pose: {} },
      { t: 0.3, ease: 'inOutCubic', pose: { torso: [-10, 0, 4], hipsRot: [-4, 0, 0], hipsPos: [0, 0.08, 0], head: [-22, 0, 0], shoulderR: [-176, 0, 6], elbowR: [-4, 0, 0], shoulderL: [-26, 0, -42], elbowL: [-30, 0, 0], kneeL: [10, 0, 0], kneeR: [10, 0, 0] } },
      { t: 0.62, ease: 'inOutQuad', pose: { torso: [-12, 0, 4], shoulderR: [-174, 0, 6], hipsPos: [0, 0.05, 0] } },
      { t: 0.78, ease: 'inCubic', pose: { torso: [48, -8, 0], hipsRot: [10, 0, 0], hipsPos: [0, -0.55, 0.1], head: [12, 0, 0], shoulderR: [-58, -6, -4], elbowR: [-8, 0, 0], shoulderL: [10, 0, -30], elbowL: [-20, 0, 0], kneeL: [55, 0, 0], kneeR: [55, 0, 0], thighL: [-30, 0, 0], thighR: [-30, 0, 0], ankleL: [-24, 0, 0], ankleR: [-24, 0, 0] } },
      { t: 0.9, ease: 'outQuad', pose: { torso: [42, -6, 0], hipsPos: [0, -0.45, 0.08] } },
      { t: 1.1, ease: 'inOutQuad', pose: REST_FULL },
    ],
    events: [{ t: 0.34, type: 'fx', arg: 'charge' }, { t: 0.34, type: 'sfx', arg: 'cast' }, { t: 0.72, type: 'sfx', arg: 'whooshBig' }, { t: 0.8, type: 'hit', arg: 0 }, { t: 0.82, type: 'shake', arg: 0.6 }],
  },
  tempestTornado: { // heavy: arms fling wide and the whole frame spins up
    // into a tornado (heavySpin whirls the hips; the aura FX ride along) —
    // two hit beats as the vortex grinds through the target.
    // The arms go OUT, never up: they snap to a flat T the instant the spin
    // starts (t=0.26, the heavySpin t0) and PUMP there across the whole
    // whirl — dropping along the body between passes, launching back out
    // sideways on the next.
    //   T pose   shoulder roll -92 / +92 with ZERO pitch and a straight elbow
    //            is the flat T on this rig, measured on BOTH routes: hands
    //            land at y 1.8-2.0 against shoulders at y 1.64-1.77, at full
    //            3.6-3.9 horizontal reach. Pitch is what breaks it — a -24
    //            dragged the hands forward and below the shoulder line — and
    //            roll past ~100 lifts them into a Y, not a T.
    //   ease     the launches are outCUBIC, not outBack: outBack overshoots
    //            ~10% past the key, which on a 16 -> 92 roll peaks near 100
    //            and reads as the arms going UP over the shoulders. Cubic
    //            stops them dead flat.
    //   drop     roll ±16 with elbow -22: arms swing back down along the body
    //            between passes so the next launch reads (measured in battle,
    //            the hands swing from y 1.7 at the T down to y 0.3).
    //   dwell    each T is keyed TWICE (0.26+0.30, 0.46+0.50, 0.68+0.72) —
    //            without the second key the target starts falling the instant
    //            it arrives, and the animator's 26/s pose-chase only ever
    //            reaches ~-83 of the -92. The dwell lets it saturate: measured
    //            in battle, -88 and full hand spread by t≈0.30, well inside
    //            the first revolution (which ends at 0.26 + 2π/28.8 ≈ 0.48).
    // heavySpin runs t 0.26-1.07 at 28.8 rad/s ≈ 3.7 turns (0.22s a turn), so
    // the T's (0.26, 0.46, 0.68, 0.90) and the drops between them sit about
    // one pump per revolution, with a T carrying each hit beat.
    dur: 1.22,
    keys: [
      { t: 0, pose: {} },
      { t: 0.18, ease: 'inOutCubic', pose: { hipsPos: [0, -0.4, 0], torso: [10, 20, 0], head: [0, -10, 0], shoulderL: [-20, 30, -20], shoulderR: [-20, -30, 20], elbowL: [-110, 0, 0], elbowR: [-110, 0, 0], kneeL: [40, 0, 0], kneeR: [40, 0, 0], thighL: [-22, 0, 0], thighR: [-22, 0, 0] } },
      { t: 0.26, ease: 'outCubic', pose: { hipsPos: [0, 0.18, 0], torso: [-6, 0, 0], head: [-8, 0, 0], shoulderL: [0, 0, -92], shoulderR: [0, 0, 92], elbowL: [0, 0, 0], elbowR: [0, 0, 0], kneeL: [8, 0, 0], kneeR: [8, 0, 0], thighL: [-4, 0, 0], thighR: [-4, 0, 0] } },
      { t: 0.30, ease: 'inOutQuad', pose: { shoulderL: [0, 0, -92], shoulderR: [0, 0, 92] } },
      { t: 0.39, ease: 'inQuad', pose: { hipsPos: [0, 0.1, 0], shoulderL: [6, 0, -16], shoulderR: [6, 0, 16], elbowL: [-22, 0, 0], elbowR: [-22, 0, 0] } },
      { t: 0.46, ease: 'outCubic', pose: { hipsPos: [0, 0.18, 0], shoulderL: [0, 0, -92], shoulderR: [0, 0, 92], elbowL: [0, 0, 0], elbowR: [0, 0, 0] } },
      { t: 0.50, ease: 'inOutQuad', pose: { shoulderL: [0, 0, -92], shoulderR: [0, 0, 92] } },
      { t: 0.59, ease: 'inQuad', pose: { hipsPos: [0, 0.1, 0], shoulderL: [6, 0, -16], shoulderR: [6, 0, 16], elbowL: [-22, 0, 0], elbowR: [-22, 0, 0] } },
      { t: 0.68, ease: 'outCubic', pose: { hipsPos: [0, 0.2, 0], shoulderL: [0, 0, -92], shoulderR: [0, 0, 92], elbowL: [0, 0, 0], elbowR: [0, 0, 0] } },
      { t: 0.72, ease: 'inOutQuad', pose: { shoulderL: [0, 0, -92], shoulderR: [0, 0, 92] } },
      { t: 0.81, ease: 'inQuad', pose: { hipsPos: [0, 0.12, 0], shoulderL: [6, 0, -16], shoulderR: [6, 0, 16], elbowL: [-22, 0, 0], elbowR: [-22, 0, 0] } },
      { t: 0.9, ease: 'outCubic', pose: { hipsPos: [0, 0.18, 0], shoulderL: [0, 0, -92], shoulderR: [0, 0, 92], elbowL: [0, 0, 0], elbowR: [0, 0, 0] } },
      { t: 1.07, ease: 'inOutQuad', pose: { hipsPos: [0, 0.1, 0], shoulderL: [0, 0, -88], shoulderR: [0, 0, 88], elbowL: [-4, 0, 0], elbowR: [-4, 0, 0] } },
      { t: 1.22, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0] } },
    ],
    events: [{ t: 0.24, type: 'sfx', arg: 'whooshBig' }, { t: 0.46, type: 'hit', arg: 0 }, { t: 0.58, type: 'sfx', arg: 'whoosh' }, { t: 0.68, type: 'hit', arg: 0 }, { t: 0.7, type: 'shake', arg: 0.35 }, { t: 0.9, type: 'sfx', arg: 'whoosh' }],
  },
  fenrirSpike: { // heavy: the mane flares out huge (heavyFlare scales the
    // ruff, porcupine-style) as the wolf coils — then a spiking LEAP
    // (heavyDrive) that rams the whole bladed body through the target.
    // The arms open and CLOSE across it, like a bear hug thrown at a sprint:
    //   wind-up  both arms flung as wide and as far back as the joint allows
    //            (measured on the rig: claws 6.8 units apart vs 3.7 at rest,
    //            and behind the chest line) — shoulder pitch +32 is extension,
    //            roll -78/+78 is abduction, yaw sweeps them behind the plane
    //   lunge    they SCYTHE to the middle and forward — 1.0 apart, 2.8 ahead
    //            of the body, converging in front of the chest as he lands
    // (roll sign is not guessable: on this rig NEGATIVE roll on the left and
    // POSITIVE on the right is what opens the arms outward, and positive
    // shoulder pitch is what carries them back.)
    dur: 0.9,
    keys: [
      { t: 0, pose: {} },
      { t: 0.28, ease: 'inOutCubic', pose: { hipsPos: [0, -0.7, 0], hipsRot: [6, 0, 0], torso: [24, 0, 0], head: [-22, 0, 0], shoulderL: [32, -40, -78], shoulderR: [32, 40, 78], elbowL: [-14, 0, 0], elbowR: [-14, 0, 0], handL: [10, 0, 0], handR: [10, 0, 0], kneeL: [70, 0, 0], kneeR: [70, 0, 0], thighL: [-40, 0, 0], thighR: [-40, 0, 0], ankleL: [-32, 0, 0], ankleR: [-32, 0, 0] } },
      { t: 0.42, ease: 'outCubic', pose: { hipsPos: [0, 0.2, 0], hipsRot: [22, 0, 0], torso: [14, 0, 0], head: [-16, 0, 0], shoulderL: [-100, 26, 16], shoulderR: [-100, -26, -16], elbowL: [-30, 0, 0], elbowR: [-30, 0, 0], handL: [-20, 0, 0], handR: [-20, 0, 0], thighL: [-30, 0, -4], thighR: [-30, 0, 4], kneeL: [26, 0, 0], kneeR: [26, 0, 0], ankleL: [-24, 0, 0], ankleR: [-24, 0, 0] } },
      { t: 0.68, ease: 'inOutQuad', pose: { hipsPos: [0, 0.1, 0], hipsRot: [16, 0, 0], shoulderL: [-86, 20, 10], shoulderR: [-86, -20, -10], elbowL: [-38, 0, 0], elbowR: [-38, 0, 0], handL: [-12, 0, 0], handR: [-12, 0, 0] } },
      { t: 0.9, ease: 'inOutQuad', pose: REST_FULL },
    ],
    events: [{ t: 0.08, type: 'sfx', arg: 'howl' }, { t: 0.38, type: 'sfx', arg: 'jump' }, { t: 0.55, type: 'hit', arg: 0 }, { t: 0.57, type: 'shake', arg: 0.35 }],
  },
  wraithLasers: { // heavy: he LIFTS OFF and leans INTO the mark — hovering
    // with legs trailing, torso pitched forward — while the cloak spreads
    // (heavyFlare) and the wing halves fan up above his head (heavyRaise);
    // only THEN do the wing-tips fire (heavyFx 'wingLasers')
    dur: 1.45,
    keys: [
      { t: 0, pose: {} },
      { t: 0.3, ease: 'outCubic', pose: { hipsPos: [0, 0.42, 0], hipsRot: [4, 0, 0], torso: [14, 0, 0], head: [-6, 0, 0], shoulderL: [-42, 0, -72], shoulderR: [-42, 0, 72], elbowL: [-8, 0, 0], elbowR: [-8, 0, 0], thighL: [8, 0, 0], thighR: [8, 0, 0], kneeL: [-20, 0, 0], kneeR: [-20, 0, 0], ankleL: [40, 0, 0], ankleR: [40, 0, 0] } },
      { t: 0.68, ease: 'inOutCubic', pose: { hipsPos: [0, 0.66, 0], hipsRot: [7, 0, 0], torso: [22, 0, 0], head: [-8, 0, 0], shoulderL: [-58, 0, -78], shoulderR: [-58, 0, 78] } },
      { t: 0.95, ease: 'inOutQuad', pose: { hipsPos: [0, 0.6, 0], torso: [20, 0, 0], head: [-4, 0, 0] } },
      { t: 1.15, ease: 'inOutQuad', pose: { hipsPos: [0, 0.42, 0], torso: [13, 0, 0] } },
      { t: 1.45, ease: 'inOutQuad', pose: REST_FULL },
    ],
    events: [{ t: 0.14, type: 'sfx', arg: 'charge' }, { t: 0.6, type: 'sfx', arg: 'charge' }, { t: 0.88, type: 'hit', arg: 0 }, { t: 0.88, type: 'sfx', arg: 'railgun' }, { t: 0.92, type: 'shake', arg: 0.45 }],
  },
  // ---------- SAURION: raptor forms — he fights with his FEET ----------
  // legs/torso/head values are rest-relative (restBias) so the deep
  // digitigrade crouch carries through every kick.
  saurionKick1: { // right EAGLE KICK: knee chambers at the chest, then the
    // sickle toe-claw whips up-and-out at head height, torso swung back
    strikeLimb: 'footR',   // the blow is resolved on the CLAW, not the body
    dur: 0.5,
    keys: [
      { t: 0, pose: {} },
      { t: 0.12, ease: 'outCubic', pose: { torso: [4, -6, 0], head: [-2, 4, 0], hipsPos: [0, -0.12, 0], hipsRot: [0, -8, 0], thighR: [-62, 0, -4], kneeR: [38, 0, 0], ankleR: [-12, 0, 0], shoulderL: [-40, 0, -10], elbowL: [-66, 0, 0], handL: [30, 0, 10], shoulderR: [-26, 0, 10], elbowR: [-56, 0, 0], handR: [26, 0, -10] } },
      { t: 0.22, ease: 'outBack', pose: { torso: [-18, 6, 0], head: [14, -4, 0], hipsPos: [0, 0, 0.08], hipsRot: [0, 6, 0], thighR: [-65, 0, -8], kneeR: [-64, 0, 0], ankleR: [58, 0, 0] } },
      { t: 0.32, ease: 'inOutQuad', pose: { thighR: [-45, 0, -6], kneeR: [-40, 0, 0], ankleR: [40, 0, 0] } },
      { t: 0.5, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], thighR: [0, 0, 0], kneeR: [0, 0, 0], ankleR: [0, 0, 0], shoulderL: [-34, 0, -7], elbowL: [-62, 0, 0], handL: [28, 0, 10], shoulderR: [-34, 0, 7], elbowR: [-62, 0, 0], handR: [28, 0, -10] } },
    ],
    events: [{ t: 0.18, type: 'sfx', arg: 'whoosh' }, { t: 0.22, type: 'hit', arg: 0 }],
  },
  saurionKick2: { // left eagle kick, same head-high snap off the other leg
    strikeLimb: 'footL',
    dur: 0.52,
    keys: [
      { t: 0, pose: {} },
      { t: 0.12, ease: 'outCubic', pose: { torso: [4, 6, 0], head: [-2, -4, 0], hipsPos: [0, -0.12, 0], hipsRot: [0, 8, 0], thighL: [-52, 0, 4], kneeL: [34, 0, 0], ankleL: [-12, 0, 0], shoulderR: [-40, 0, 10], elbowR: [-66, 0, 0], handR: [30, 0, -10], shoulderL: [-26, 0, -10], elbowL: [-56, 0, 0], handL: [26, 0, 10] } },
      { t: 0.24, ease: 'outBack', pose: { torso: [-18, -6, 0], head: [14, 4, 0], hipsPos: [0, 0, 0.08], hipsRot: [0, -6, 0], thighL: [-55, 0, 8], kneeL: [-74, 0, 0], ankleL: [62, 0, 0] } },
      { t: 0.34, ease: 'inOutQuad', pose: { thighL: [-42, 0, 6], kneeL: [-52, 0, 0], ankleL: [44, 0, 0] } },
      { t: 0.52, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], thighL: [0, 0, 0], kneeL: [0, 0, 0], ankleL: [0, 0, 0], shoulderL: [-34, 0, -7], elbowL: [-62, 0, 0], handL: [28, 0, 10], shoulderR: [-34, 0, 7], elbowR: [-62, 0, 0], handR: [28, 0, -10] } },
    ],
    events: [{ t: 0.2, type: 'sfx', arg: 'whoosh' }, { t: 0.24, type: 'hit', arg: 1 }],
  },
  saurionKick3: { // combo ender: coil onto the haunches, then a leaping
    // downward claw slash with the whole body behind it
    strikeLimb: 'footR',   // leaps off the left, strikes with the right sickle
    dur: 0.62,
    keys: [
      { t: 0, pose: {} },
      { t: 0.16, ease: 'inOutCubic', pose: { hipsPos: [0, -0.42, 0], hipsRot: [4, 0, 0], torso: [12, 0, 0], head: [-8, 0, 0], thighL: [-16, 0, 0], thighR: [-16, 0, 0], kneeL: [22, 0, 0], kneeR: [22, 0, 0], ankleL: [-8, 0, 0], ankleR: [-8, 0, 0], shoulderL: [-12, 0, -18], shoulderR: [-12, 0, 18], elbowL: [-30, 0, 0], elbowR: [-30, 0, 0], handL: [20, 0, 8], handR: [20, 0, -8] } },
      { t: 0.3, ease: 'outBack', pose: { hipsPos: [0, 0.32, 0.14], hipsRot: [12, 0, 0], torso: [-14, 0, 0], head: [16, 0, 0], thighR: [-62, 0, -6], kneeR: [-62, 0, 0], ankleR: [56, 0, 0], thighL: [16, 0, 4], kneeL: [-16, 0, 0], shoulderL: [-60, 0, -24], shoulderR: [-60, 0, 24], elbowL: [-20, 0, 0], elbowR: [-20, 0, 0] } },
      { t: 0.42, ease: 'inOutQuad', pose: { hipsPos: [0, 0.1, 0.1], thighR: [-30, 0, -4], kneeR: [-30, 0, 0], ankleR: [36, 0, 0] } },
      { t: 0.62, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], ankleL: [0, 0, 0], ankleR: [0, 0, 0], shoulderL: [-34, 0, -7], shoulderR: [-34, 0, 7], elbowL: [-62, 0, 0], elbowR: [-62, 0, 0], handL: [28, 0, 10], handR: [28, 0, -10] } },
    ],
    events: [{ t: 0.26, type: 'sfx', arg: 'whoosh' }, { t: 0.3, type: 'hit', arg: 2 }, { t: 0.32, type: 'shake', arg: 0.3 }],
  },
  saurionBite: { // heavy: coil deep back onto the haunches, head craned away
    // — then the whole frame SPRINGS forward (heavyDrive) and the jaws snap
    // down through the target
    dur: 0.9,
    keys: [
      { t: 0, pose: {} },
      { t: 0.3, ease: 'inOutCubic', pose: { hipsPos: [0, -0.4, -0.12], hipsRot: [-4, 0, 0], torso: [14, 0, 0], head: [-30, 0, 0], thighL: [-10, 0, 0], thighR: [-10, 0, 0], kneeL: [14, 0, 0], kneeR: [14, 0, 0], ankleL: [-6, 0, 0], ankleR: [-6, 0, 0], shoulderL: [-16, 0, -14], shoulderR: [-16, 0, 14], elbowL: [-70, 0, 0], elbowR: [-70, 0, 0], handL: [34, 0, 12], handR: [34, 0, -12] } },
      // THE POUNCE. Both claws come UP and OVER as the jaws drive in — the
      // predator rearing over the kill, not reaching for it. Shoulders swing
      // well past horizontal so the arms clear the head, elbows stay folded
      // and the wrists cock forward so the sickle claws hang over the target
      // ready to come down. (They used to be thrown out level beside the head,
      // which read as a shove; before that they stayed tucked in the raptor
      // carry, which read as biting with his hands held behind him.)
      { t: 0.44, ease: 'outCubic', pose: { hipsPos: [0, 0.14, 0.28], hipsRot: [10, 0, 0], torso: [-12, 0, 0], head: [40, 0, 0], thighL: [18, 0, 0], thighR: [18, 0, 0], kneeL: [-30, 0, 0], kneeR: [-30, 0, 0], ankleL: [12, 0, 0], ankleR: [12, 0, 0], shoulderL: [-104, 0, -16], shoulderR: [-104, 0, 16], elbowL: [-56, 0, 0], elbowR: [-56, 0, 0], handL: [28, 0, 12], handR: [28, 0, -12] } },
      // claws start their descent as the bite lands — still high, coming over
      { t: 0.58, ease: 'inOutQuad', pose: { hipsPos: [0, 0.04, 0.2], head: [30, 0, 0], shoulderL: [-92, 0, -14], shoulderR: [-92, 0, 14], elbowL: [-44, 0, 0], elbowR: [-44, 0, 0], handL: [22, 0, 12], handR: [22, 0, -12] } },
      { t: 0.9, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], ankleL: [0, 0, 0], ankleR: [0, 0, 0], shoulderL: [-34, 0, -7], shoulderR: [-34, 0, 7], elbowL: [-62, 0, 0], elbowR: [-62, 0, 0], handL: [28, 0, 10], handR: [28, 0, -10] } },
    ],
    events: [{ t: 0.1, type: 'sfx', arg: 'charge' }, { t: 0.4, type: 'sfx', arg: 'whooshBig' }, { t: 0.48, type: 'hit', arg: 0 }, { t: 0.5, type: 'shake', arg: 0.35 }],
  },

  saurionClawR: { // raptor forehand SWIPE, right claw: chamber high outside,
    // then rake across the body with the torso torquing into it. Used by the
    // GLB light cycle (kicks alternate with claw rakes); procedural saurion
    // keeps his all-kick doctrine unless a def opts in.
    dur: 0.46,
    keys: [
      { t: 0, pose: {} },
      { t: 0.12, ease: 'outCubic', pose: { torso: [6, -10, 0], head: [-4, 8, 0], hipsRot: [0, -8, 0], hipsPos: [0, -0.08, 0], shoulderR: [-72, 22, 26], elbowR: [-82, 0, 0], handR: [-18, 0, -14], shoulderL: [-30, 0, -8], elbowL: [-58, 0, 0] } },
      { t: 0.22, ease: 'outBack', pose: { torso: [-4, 14, 0], head: [6, -10, 0], hipsRot: [0, 10, 0], hipsPos: [0, 0, 0.06], shoulderR: [-58, -26, -8], elbowR: [-12, 0, 0], handR: [12, 0, -4] } },
      { t: 0.33, ease: 'inOutQuad', pose: { shoulderR: [-42, -18, 0], elbowR: [-28, 0, 0] } },
      { t: 0.46, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, 0, 0], shoulderR: [-34, 0, 7], elbowR: [-62, 0, 0], handR: [28, 0, -10], shoulderL: [-34, 0, -7], elbowL: [-62, 0, 0] } },
    ],
    events: [{ t: 0.16, type: 'sfx', arg: 'whoosh' }, { t: 0.22, type: 'hit', arg: 1 }],
  },
  saurionClawL: { // mirrored left-claw rake
    dur: 0.46,
    keys: [
      { t: 0, pose: {} },
      { t: 0.12, ease: 'outCubic', pose: { torso: [6, 10, 0], head: [-4, -8, 0], hipsRot: [0, 8, 0], hipsPos: [0, -0.08, 0], shoulderL: [-72, -22, -26], elbowL: [-82, 0, 0], handL: [-18, 0, 14], shoulderR: [-30, 0, 8], elbowR: [-58, 0, 0] } },
      { t: 0.22, ease: 'outBack', pose: { torso: [-4, -14, 0], head: [6, 10, 0], hipsRot: [0, -10, 0], hipsPos: [0, 0, 0.06], shoulderL: [-58, 26, 8], elbowL: [-12, 0, 0], handL: [12, 0, 4] } },
      { t: 0.33, ease: 'inOutQuad', pose: { shoulderL: [-42, 18, 0], elbowL: [-28, 0, 0] } },
      { t: 0.46, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, 0, 0], shoulderL: [-34, 0, -7], elbowL: [-62, 0, 0], handL: [28, 0, 10], shoulderR: [-34, 0, 7], elbowR: [-62, 0, 0] } },
    ],
    events: [{ t: 0.16, type: 'sfx', arg: 'whoosh' }, { t: 0.22, type: 'hit', arg: 1 }],
  },

  saurionQuillFan: { // ranged: he SLINGS the quills, both arms whipping
    // straight out down the aim line. The shared `shoot` raises one arm and
    // leaves the other in the raptor carry — fine for a mech with a gun in
    // its right hand, wrong here: the quills come off BOTH forearms, and on
    // the GLB the muzzle anchors ride the left hand / right forearm bones, so
    // a carried arm aimed the fan at his own feet. Both arms thrown forward,
    // elbows nearly straight, so the barrels sit on the aim line at the fire
    // frame; the torso uncoils behind the throw and recoils back to carry.
    dur: 0.44, upper: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.06, ease: 'outCubic', pose: { shoulderL: [-52, 10, -14], shoulderR: [-52, -10, 14], elbowL: [-74, 0, 0], elbowR: [-74, 0, 0], handL: [34, 0, 12], handR: [34, 0, -12], torso: [6, 0, 0], head: [-4, 0, 0] } },
      // FIRE FRAME. The two arms don't carry matching numbers because the two
      // anchors don't ride matching bones: muzzleR is pinned to the left HAND
      // and muzzleL out along the right FOREARM, each with its own authored
      // rot, so each barrel squares up at a different joint angle. Solved by
      // measurement (see the deg readouts below), not by eye.
      { t: 0.14, ease: 'outBack', pose: { shoulderL: [-96, 4, -6], shoulderR: [-108, -10, 6], elbowL: [-6, 0, 0], elbowR: [-30, 0, 0], handL: [-13, 0, 11], handR: [-13, 0, -11], torso: [-8, 0, 0], head: [8, 0, 0] } },
      { t: 0.26, ease: 'outQuad', pose: { shoulderL: [-88, 4, -6], shoulderR: [-98, -10, 6], elbowL: [-14, 0, 0], elbowR: [-36, 0, 0], handL: [-6, 0, 10], handR: [-6, 0, -10], torso: [-2, 0, 0] } },
      { t: 0.44, ease: 'inOutQuad', pose: { shoulderL: [-34, 0, -7], shoulderR: [-34, 0, 7], elbowL: [-62, 0, 0], elbowR: [-62, 0, 0], handL: [28, 0, 10], handR: [28, 0, -10], torso: [0, 0, 0], head: [0, 0, 0] } },
    ],
    // Fire once the arms have arrived, not at the peak of the whip (8 deg high
    // there). Sampled across the fire window muzzleR sits on the aim line to
    // within a few degrees of frame-sampling noise — 0.1 / -1.3 / 4.7 deg up at
    // t=0.16 / 0.17 / 0.18, all off a barrel that hangs 47 deg DOWN in his
    // resting claw carry. Yaw holds ~1 deg off-axis throughout.
    events: [{ t: 0.18, type: 'fire' }],
  },

  nullBackhand: { // NULLBOT heavy: a contemptuous one-arm BACKHAND — the
    // arm folds across the chest almost lazily, a beat of dead stillness,
    // then the knuckles whip through the front arc and send whatever they
    // meet across the street
    dur: 0.8,
    keys: [
      { t: 0, pose: {} },
      { t: 0.26, ease: 'inOutCubic', pose: { torso: [4, 38, 8], hipsRot: [0, 18, 0], hipsPos: [0, -0.16, 0], head: [-4, -18, 0], shoulderR: [-96, 38, 20], elbowR: [-64, 0, 0], handR: [0, 0, 40], shoulderL: [10, 0, -24], elbowL: [-40, 0, 0], kneeL: [16, 0, 0], kneeR: [16, 0, 0], thighL: [-8, 0, 0], thighR: [-8, 0, 0] } },
      { t: 0.4, ease: 'outBack', pose: { torso: [8, -42, -10], hipsRot: [0, -20, 0], hipsPos: [0, -0.2, 0.1], head: [0, 18, 0], shoulderR: [-90, -44, -18], elbowR: [-4, 0, 0], handR: [0, 0, -35], shoulderL: [18, 0, -30], kneeL: [22, 0, 0], kneeR: [30, 0, 0], thighL: [-14, 0, 0], thighR: [2, 0, 0] } },
      { t: 0.55, ease: 'inOutQuad', pose: { torso: [6, -32, -7], hipsRot: [0, -15, 0], shoulderR: [-84, -36, -12], elbowR: [-10, 0, 0] } },
      { t: 0.8, ease: 'inOutQuad', pose: { torso: [0, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, 0, 0], head: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], handR: [0, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0] } },
    ],
    events: [{ t: 0.33, type: 'sfx', arg: 'whooshBig' }, { t: 0.4, type: 'hit', arg: 0 }, { t: 0.42, type: 'shake', arg: 0.4 }],
  },

  // ---------- TITANUS / COLOSSUS: telegraphed haymakers ----------
  // the fist gets PULLED all the way back and the frame coils before it
  // lets loose — slower than a jab, and it launches people across the block.
  bigPunch1: { // left haymaker with a full wind-up
    strikeArm: 'L', // ONE-ARMED blow — see Fighter.aimStrikeAt
    dur: 0.66,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, ease: 'inOutCubic', pose: { torso: [8, -36, -9], hipsRot: [0, -18, 0], hipsPos: [0, -0.2, -0.06], head: [0, 16, 0], shoulderL: [30, 8, -26], elbowL: [-126, 0, 0], shoulderR: [-18, 0, 24], elbowR: [-60, 0, 0], kneeL: [30, 0, 0], kneeR: [30, 0, 0], thighL: [-16, 0, 0], thighR: [-16, 0, 0] } },
      { t: 0.34, ease: 'outBack', pose: { torso: [12, 32, 9], hipsRot: [0, 18, 0], hipsPos: [0, -0.22, 0.16], head: [0, -14, 0], shoulderL: [-104, -16, 26], elbowL: [-2, 0, 0], shoulderR: [24, 0, 28], elbowR: [-30, 0, 0], kneeL: [26, 0, 0], kneeR: [40, 0, 0], thighL: [-22, 0, 0], thighR: [4, 0, 0] } },
      { t: 0.48, ease: 'inOutQuad', pose: { torso: [9, 24, 7], hipsRot: [0, 13, 0], shoulderL: [-92, -12, 20], elbowL: [-18, 0, 0] } },
      { t: 0.66, ease: 'inOutQuad', pose: REST_UPPER },
    ],
    events: [{ t: 0.24, type: 'sfx', arg: 'whooshBig' }, { t: 0.34, type: 'hit', arg: 0 }, { t: 0.36, type: 'shake', arg: 0.3 }],
  },

  // ---------- TITANUS / COLOSSUS: hold-to-charge haymakers & pounds ----------
  // punchHold1 freezes bigPunch1's wind-up as a trembling loop while X stays
  // down; punchRelease1 fires the strike FROM that chamber (no rest detour).
  // Mirrored *2 variants alternate arms. poundHold/poundSlam do the same for
  // the two-hand overhead heavy.
  punchHold1: { // charged haymaker wind-up: coiled at full stretch, the
    // cocked fist quaking at the hip until the button lets it go
    strikeArm: 'L', // ONE-ARMED blow — see Fighter.aimStrikeAt
    dur: 0.7, loop: true,
    keys: [
      { t: 0, pose: { torso: [8, -36, -9], hipsRot: [0, -18, 0], hipsPos: [0, -0.2, -0.06], head: [0, 16, 0], shoulderL: [30, 8, -26], elbowL: [-126, 0, 0], shoulderR: [-18, 0, 24], elbowR: [-60, 0, 0], kneeL: [30, 0, 0], kneeR: [30, 0, 0], thighL: [-16, 0, 0], thighR: [-16, 0, 0] } },
      { t: 0.35, ease: 'inOutQuad', pose: { torso: [9, -38, -10], hipsPos: [0, -0.23, -0.07], shoulderL: [33, 9, -28], elbowL: [-122, 0, 0] } },
      { t: 0.7, ease: 'inOutQuad', pose: { torso: [8, -36, -9], hipsPos: [0, -0.2, -0.06], shoulderL: [30, 8, -26], elbowL: [-126, 0, 0] } },
    ],
  },
  punchRelease1: { // the banked haymaker discharges: chamber -> strike ->
    // follow-through, exactly bigPunch1 from its wind-up onward
    strikeArm: 'L', // ONE-ARMED blow — see Fighter.aimStrikeAt
    dur: 0.5,
    keys: [
      { t: 0, pose: { torso: [8, -36, -9], hipsRot: [0, -18, 0], hipsPos: [0, -0.2, -0.06], head: [0, 16, 0], shoulderL: [30, 8, -26], elbowL: [-126, 0, 0], shoulderR: [-18, 0, 24], elbowR: [-60, 0, 0], kneeL: [30, 0, 0], kneeR: [30, 0, 0], thighL: [-16, 0, 0], thighR: [-16, 0, 0] } },
      { t: 0.12, ease: 'outBack', pose: { torso: [12, 32, 9], hipsRot: [0, 18, 0], hipsPos: [0, -0.22, 0.16], head: [0, -14, 0], shoulderL: [-104, -16, 26], elbowL: [-2, 0, 0], shoulderR: [24, 0, 28], elbowR: [-30, 0, 0], kneeL: [26, 0, 0], kneeR: [40, 0, 0], thighL: [-22, 0, 0], thighR: [4, 0, 0] } },
      { t: 0.26, ease: 'inOutQuad', pose: { torso: [9, 24, 7], hipsRot: [0, 13, 0], shoulderL: [-92, -12, 20], elbowL: [-18, 0, 0] } },
      { t: 0.5, ease: 'inOutQuad', pose: REST_UPPER },
    ],
    events: [{ t: 0.02, type: 'sfx', arg: 'whooshBig' }, { t: 0.12, type: 'hit', arg: 0 }, { t: 0.14, type: 'shake', arg: 0.35 }],
  },
  // COLOSSUS plays these too, but on his GLB they are OVERRIDDEN by his
  // thunderclap (COLOSSUS_CLAP_HOLD / COLOSSUS_CLAP at the bottom of this file,
  // wired up in glbanim's colossus profile). Same names, same timings — only the
  // shape differs, and only on that model.
  poundHold: { // charged overhead pound: both fists locked high, the whole
    // frame arched back and quaking until Y releases
    dur: 0.8, loop: true,
    keys: [
      { t: 0, pose: { hipsPos: [0, -0.3, 0], hipsRot: [-8, 8, 0], torso: [-28, 6, -6], head: [-18, 0, 0], shoulderL: [-142, 0, -26], shoulderR: [-142, 0, 26], elbowL: [-38, 0, 0], elbowR: [-38, 0, 0], kneeL: [18, 0, 0], kneeR: [18, 0, 0], thighL: [-8, 0, 0], thighR: [-8, 0, 0] } },
      { t: 0.4, ease: 'inOutQuad', pose: { hipsPos: [0, -0.34, 0], torso: [-30, 6, -6], shoulderL: [-146, 0, -28], shoulderR: [-146, 0, 28] } },
      { t: 0.8, ease: 'inOutQuad', pose: { hipsPos: [0, -0.3, 0], torso: [-28, 6, -6], shoulderL: [-142, 0, -26], shoulderR: [-142, 0, 26] } },
    ],
  },
  poundSlam: { // the banked pound discharges: raised -> slam, exactly the
    // shared heavy from its apex onward
    dur: 0.7,
    keys: [
      { t: 0, pose: { hipsPos: [0, -0.3, 0], hipsRot: [-8, 8, 0], torso: [-28, 6, -6], head: [-18, 0, 0], shoulderL: [-142, 0, -26], shoulderR: [-142, 0, 26], elbowL: [-38, 0, 0], elbowR: [-38, 0, 0], kneeL: [18, 0, 0], kneeR: [18, 0, 0], thighL: [-8, 0, 0], thighR: [-8, 0, 0] } },
      { t: 0.18, ease: 'inCubic', pose: { hipsPos: [0, -0.72, 0], hipsRot: [12, -6, 0], torso: [52, -6, 4], head: [14, 0, 0], shoulderL: [-48, 0, 22], shoulderR: [-48, 0, -22], elbowL: [-6, 0, 0], elbowR: [-6, 0, 0], kneeL: [48, 0, 0], kneeR: [48, 0, 0], thighL: [-26, 0, 0], thighR: [-26, 0, 0], ankleL: [-20, 0, 0], ankleR: [-20, 0, 0] } },
      { t: 0.36, ease: 'outQuad', pose: { hipsPos: [0, -0.5, 0], torso: [44, -4, 3] } },
      { t: 0.7, ease: 'inOutQuad', pose: REST_FULL },
    ],
    events: [{ t: 0.1, type: 'sfx', arg: 'whooshBig' }, { t: 0.18, type: 'hit', arg: 0 }, { t: 0.2, type: 'shake', arg: 0.5 }],
  },
  fistLaunch: { // ROCKET FIST: chamber the right fist past the hip, then punch
    // STRAIGHT DOWN THE LINE — the fist detaches at full extension (the fire
    // event) and the arm stays punched out a beat while it flies.
    //
    // The release frame squares the body up on purpose. The old version carried
    // the wind-up's twist (torso yaw -28, hips -16) straight through the
    // release, which threw the arm 46° across his chest and 12° UP — measured,
    // not eyeballed — so the punch, and the fist that becomes the projectile,
    // left along a diagonal aimed at the sky. Both routes had it.
    // Arm angles here are MEASURED (see the shoulder-pitch sweep in the log):
    // shoulderR pitch -90 with a level torso puts the arm dead level and dead
    // forward (armDir [0,0,1]); every +1° of torso lean pitches the arm 1°
    // down, so lean 6 pairs with -96. Do not "tidy" these numbers by eye.
    strikeArm: 'R', // ONE-ARMED blow — see Fighter.aimStrikeAt
    dur: 0.7,
    keys: [
      { t: 0, pose: {} },
      { t: 0.16, ease: 'outCubic', pose: { torso: [6, 30, 8], hipsRot: [0, 15, 0], hipsPos: [0, -0.14, -0.04], head: [0, -14, 0], shoulderR: [26, -6, 22], elbowR: [-118, 0, 0], shoulderL: [-16, 0, -22], elbowL: [-55, 0, 0], kneeL: [26, 0, 0], kneeR: [26, 0, 0], thighL: [-14, 0, 0], thighR: [-14, 0, 0] } },
      { t: 0.26, ease: 'outBack', pose: { torso: [6, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, -0.18, 0.12], head: [0, 0, 0], shoulderR: [-96, 0, 0], elbowR: [0, 0, 0], shoulderL: [24, 0, -24], elbowL: [-34, 0, 0], kneeL: [36, 0, 0], kneeR: [24, 0, 0], thighL: [2, 0, 0], thighR: [-20, 0, 0] } },
      { t: 0.48, ease: 'inOutQuad', pose: { torso: [5, 0, 0], shoulderR: [-92, 0, 0], elbowR: [0, 0, 0] } },
      { t: 0.7, ease: 'inOutQuad', pose: REST_UPPER },
    ],
    events: [{ t: 0.18, type: 'sfx', arg: 'whooshBig' }, { t: 0.26, type: 'fire' }, { t: 0.28, type: 'shake', arg: 0.25 }],
  },
  fistCatch: { // the rocket fist is inbound: reach the right arm straight
    // out and brace — the fist re-docks onto the extended wrist mid-clip.
    // Squared up like fistLaunch's release: the catch has to present the wrist
    // down the SAME line the fist is flying home along, so the re-dock reads.
    strikeArm: 'R', // ONE-ARMED blow — see Fighter.aimStrikeAt
    dur: 0.85, upper: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.2, ease: 'outCubic', pose: { torso: [4, 0, 0], head: [0, 0, 0], shoulderR: [-94, 0, 0], elbowR: [0, 0, 0], shoulderL: [6, 0, -14], elbowL: [-24, 0, 0] } },
      { t: 0.55, ease: 'inOutQuad', pose: { shoulderR: [-92, 0, 0], torso: [3, 0, 0] } },
      { t: 0.85, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0] } },
    ],
  },

  vulcanSpray: { // finisher: weight rocked back, the right gatling flung up
    // PAST his shoulder hosing the sky — loose and casual, mid-laugh
    dur: 0.9, loop: true,
    keys: [
      { t: 0, pose: { hipsPos: [0, -0.06, 0], hipsRot: [0, -10, 0], torso: [-14, 8, -4], head: [-16, -10, 4], shoulderR: [-148, 0, 34], elbowR: [-24, 0, 0], shoulderL: [-8, 0, -16], elbowL: [-30, 0, 0], thighL: [-8, 0, -6], thighR: [4, 0, 8], kneeL: [12, 0, 0], kneeR: [4, 0, 0] } },
      { t: 0.45, ease: 'inOutQuad', pose: { torso: [-17, 8, -4], head: [-19, -10, 4], hipsPos: [0, -0.09, 0], shoulderR: [-152, 0, 36] } },
      { t: 0.9, ease: 'inOutQuad', pose: { torso: [-14, 8, -4], head: [-16, -10, 4], hipsPos: [0, -0.06, 0], shoulderR: [-148, 0, 34] } },
    ],
  },
  colossusSlamR: { // one-arm ragdoll hammer, DOWN THE RIGHT SIDE: the
    // loaded fist swings from overhead to the dirt beside his right leg
    // (the finisher LOCKS the victim to handR, so they ride this swing)
    dur: 0.8,
    keys: [
      { t: 0, pose: {} },
      { t: 0.28, ease: 'inOutCubic', pose: { torso: [-14, 0, -10], hipsPos: [0, -0.08, 0], head: [-10, 0, 0], shoulderR: [-168, 0, 18], elbowR: [-14, 0, 0], shoulderL: [-24, 0, -30], elbowL: [-40, 0, 0], kneeL: [14, 0, 0], kneeR: [14, 0, 0] } },
      { t: 0.5, ease: 'inCubic', pose: { torso: [28, 0, 22], hipsPos: [0, -0.52, 0], head: [14, 0, 0], shoulderR: [-12, 0, 38], elbowR: [-4, 0, 0], shoulderL: [-10, 0, -24], kneeL: [52, 0, 0], kneeR: [52, 0, 0], thighL: [-28, 0, 0], thighR: [-28, 0, 0], ankleL: [-20, 0, 0], ankleR: [-20, 0, 0] } },
      { t: 0.64, ease: 'outQuad', pose: { torso: [24, 0, 18], hipsPos: [0, -0.44, 0] } },
      { t: 0.8, ease: 'inOutQuad', pose: { torso: [0, 0, 0], hipsPos: [0, 0, 0], head: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0] } },
    ],
    events: [{ t: 0.12, type: 'sfx', arg: 'whooshBig' }, { t: 0.5, type: 'sfx', arg: 'slam' }, { t: 0.52, type: 'shake', arg: 0.4 }],
  },
  colossusSlamL: { // ...and swung ACROSS the body, down beside his left leg
    dur: 0.8,
    keys: [
      { t: 0, pose: {} },
      { t: 0.28, ease: 'inOutCubic', pose: { torso: [-14, 0, 10], hipsPos: [0, -0.08, 0], head: [-10, 0, 0], shoulderR: [-168, 0, 20], elbowR: [-14, 0, 0], shoulderL: [-24, 0, -30], elbowL: [-40, 0, 0], kneeL: [14, 0, 0], kneeR: [14, 0, 0] } },
      { t: 0.5, ease: 'inCubic', pose: { torso: [26, -20, -20], hipsPos: [0, -0.52, 0], head: [12, 10, 0], shoulderR: [-34, 0, -36], elbowR: [-12, 0, 0], shoulderL: [-8, 0, -34], kneeL: [52, 0, 0], kneeR: [52, 0, 0], thighL: [-28, 0, 0], thighR: [-28, 0, 0], ankleL: [-20, 0, 0], ankleR: [-20, 0, 0] } },
      { t: 0.64, ease: 'outQuad', pose: { torso: [22, -16, -16], hipsPos: [0, -0.44, 0] } },
      { t: 0.8, ease: 'inOutQuad', pose: { torso: [0, 0, 0], hipsPos: [0, 0, 0], head: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0] } },
    ],
    events: [{ t: 0.12, type: 'sfx', arg: 'whooshBig' }, { t: 0.5, type: 'sfx', arg: 'slam' }, { t: 0.52, type: 'shake', arg: 0.4 }],
  },

  stomp: { // one heavy foot raised high and RAMMED straight down — the
    // finisher trample (stomp2 is the mirrored left foot)
    strikeLimb: 'footR',
    dur: 0.5,
    keys: [
      { t: 0, pose: {} },
      { t: 0.18, ease: 'outCubic', pose: { hipsPos: [0, -0.04, 0], torso: [10, 0, 0], head: [8, 0, 0], thighR: [-72, 0, -4], kneeR: [78, 0, 0], ankleR: [-22, 0, 0], shoulderL: [-22, 0, -18], shoulderR: [-32, 0, 18], elbowL: [-30, 0, 0], elbowR: [-40, 0, 0] } },
      { t: 0.3, ease: 'inCubic', pose: { hipsPos: [0, -0.16, 0], torso: [18, 0, 0], head: [10, 0, 0], thighR: [-16, 0, -2], kneeR: [10, 0, 0], ankleR: [-2, 0, 0] } },
      { t: 0.5, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], thighR: [0, 0, 0], kneeR: [0, 0, 0], ankleR: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0] } },
    ],
    events: [{ t: 0.28, type: 'sfx', arg: 'slam' }],
  },

  heavy: { // two-hand overhead smash — huge arch back, body hurled into the slam
    dur: 0.98,
    keys: [
      { t: 0, pose: {} },
      { t: 0.34, ease: 'inOutCubic', pose: { hipsPos: [0, -0.3, 0], hipsRot: [-8, 8, 0], torso: [-28, 6, -6], head: [-18, 0, 0], shoulderL: [-172, 0, -26], shoulderR: [-172, 0, 26], elbowL: [-38, 0, 0], elbowR: [-38, 0, 0], kneeL: [18, 0, 0], kneeR: [18, 0, 0], thighL: [-8, 0, 0], thighR: [-8, 0, 0] } },
      { t: 0.52, ease: 'inCubic', pose: { hipsPos: [0, -0.72, 0], hipsRot: [12, -6, 0], torso: [52, -6, 4], head: [14, 0, 0], shoulderL: [-48, 0, 22], shoulderR: [-48, 0, -22], elbowL: [-6, 0, 0], elbowR: [-6, 0, 0], kneeL: [48, 0, 0], kneeR: [48, 0, 0], thighL: [-26, 0, 0], thighR: [-26, 0, 0], ankleL: [-20, 0, 0], ankleR: [-20, 0, 0] } },
      { t: 0.7, ease: 'outQuad', pose: { hipsPos: [0, -0.5, 0], torso: [44, -4, 3] } },
      { t: 0.98, ease: 'inOutQuad', pose: REST_FULL },
    ],
    events: [{ t: 0.46, type: 'sfx', arg: 'whooshBig' }, { t: 0.52, type: 'hit', arg: 0 }, { t: 0.54, type: 'shake', arg: 0.5 }],
  },

  // ---------- ranged / channel ----------
  shoot: { // single right-arm shot — sharper side profile, real recoil kick
    dur: 0.5, upper: true,
    keys: [
      { t: 0, pose: { shoulderR: [-90, 0, 4], elbowR: [-4, 0, 0], shoulderL: [8, 0, -18], torso: [4, -18, -5], head: [0, 10, 0] } },
      { t: 0.12, ease: 'outBack', pose: { shoulderR: [-104, 0, 6], elbowR: [-18, 0, 0], torso: [-3, -11, -2], head: [-4, 7, 0] } },
      { t: 0.3, ease: 'outQuad', pose: { shoulderR: [-88, 0, 4], elbowR: [-6, 0, 0], torso: [3, -15, -4] } },
      { t: 0.5, ease: 'inOutQuad', pose: { shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], shoulderL: [0, 0, -10], torso: [0, 0, 0], head: [0, 0, 0] } },
    ],
    events: [{ t: 0.1, type: 'fire' }],
  },
  shootLoop: { // held channel: gatling / flame / freeze
    dur: 0.36, upper: true, loop: true,
    keys: [
      { t: 0, pose: { shoulderR: [-86, 0, 4], elbowR: [-8, 0, 0], torso: [4, -14, 0], head: [0, 8, 0], shoulderL: [-30, 25, -6], elbowL: [-70, 0, 0] } },
      { t: 0.18, ease: 'inOutQuad', pose: { shoulderR: [-90, 0, 4], torso: [3, -12, 0] } },
      { t: 0.36, ease: 'inOutQuad', pose: { shoulderR: [-86, 0, 4], torso: [4, -14, 0] } },
    ],
  },
  gatlingLoop: { // VULCAN's held gatling burst — same beat as shootLoop, but
    // the gun arm is punched further FORWARD and the shooter's-blade torso
    // twist is eased off, so the barrel line runs down the aim instead of
    // across it (the generic shootLoop's -14 deg twist threw his rounds wide).
    dur: 0.36, upper: true, loop: true,
    keys: [
      { t: 0, pose: { shoulderR: [-90, 0, 4], elbowR: [-5, 0, 0], torso: [3, -5, 0], head: [0, 3, 0], shoulderL: [-30, 25, -6], elbowL: [-70, 0, 0] } },
      { t: 0.18, ease: 'inOutQuad', pose: { shoulderR: [-94, 0, 4], torso: [2, -4, 0] } },
      { t: 0.36, ease: 'inOutQuad', pose: { shoulderR: [-90, 0, 4], torso: [3, -5, 0] } },
    ],
  },
  shootLow: { // hip-level channel (CRANKY's hose cannons): arms level/DOWN,
    // shell braced low — never raised overhead
    dur: 0.4, upper: true, loop: true,
    keys: [
      { t: 0, pose: { shoulderL: [-38, 14, -14], shoulderR: [-38, -14, 14], elbowL: [-6, 0, 0], elbowR: [-6, 0, 0], torso: [10, 0, 0], head: [-6, 0, 0], hipsPos: [0, -0.12, 0] } },
      { t: 0.2, ease: 'inOutQuad', pose: { torso: [12, 0, 0], shoulderL: [-42, 14, -14], shoulderR: [-42, -14, 14] } },
      { t: 0.4, ease: 'inOutQuad', pose: { torso: [10, 0, 0], shoulderL: [-38, 14, -14], shoulderR: [-38, -14, 14] } },
    ],
  },
  castRaise: { // arms skyward — deep coil then a full-body arch on release
    dur: 0.95,
    keys: [
      { t: 0, pose: {} },
      { t: 0.3, ease: 'inOutCubic', pose: { hipsPos: [0, -0.45, 0], torso: [16, 0, -8], head: [10, 0, 0], shoulderL: [-50, 0, -26], shoulderR: [-50, 0, 26], elbowL: [-75, 0, 0], elbowR: [-75, 0, 0], kneeL: [35, 0, 0], kneeR: [35, 0, 0], thighL: [-18, 0, 0], thighR: [-18, 0, 0] } },
      { t: 0.52, ease: 'outBack', pose: { hipsPos: [0, 0.18, 0], hipsRot: [-8, 0, 0], torso: [-22, 0, 6], head: [-24, 0, 0], shoulderL: [-175, 0, -20], shoulderR: [-175, 0, 20], elbowL: [-6, 0, 0], elbowR: [-6, 0, 0], kneeL: [4, 0, 0], kneeR: [4, 0, 0], thighL: [2, 0, 0], thighR: [2, 0, 0] } },
      { t: 0.95, ease: 'inOutQuad', pose: REST_UPPER },
    ],
    events: [{ t: 0.5, type: 'fire' }, { t: 0.5, type: 'sfx', arg: 'cast' }],
  },
  brace: { // artillery stance — wide stagger, torso rocked hard by the recoil
    dur: 0.95,
    keys: [
      { t: 0, pose: {} },
      { t: 0.3, ease: 'inOutCubic', pose: { hipsPos: [0, -0.5, 0], hipsRot: [0, -12, 0], torso: [-20, 10, -5], head: [-12, 0, 0], thighL: [-42, 0, 0], thighR: [18, 0, 0], kneeL: [55, 0, 0], kneeR: [38, 0, 0], shoulderL: [-40, 0, -18], shoulderR: [-40, 0, 18], elbowL: [-45, 0, 0], elbowR: [-45, 0, 0] } },
      { t: 0.55, ease: 'outBack', pose: { hipsPos: [0, -0.68, 0], torso: [-30, 12, -7], head: [-16, 0, 0] } },
      { t: 0.95, ease: 'inOutQuad', pose: REST_UPPER },
    ],
    events: [{ t: 0.5, type: 'fire' }, { t: 0.52, type: 'shake', arg: 0.4 }],
  },
  aim: { // sniper careful shot
    dur: 0.85, upper: true,
    keys: [
      { t: 0, pose: { shoulderR: [-84, 0, 2], elbowR: [-8, 0, 0], shoulderL: [-62, 30, -4], elbowL: [-65, 0, 0], torso: [2, -18, 0], head: [-2, 10, 0] } },
      { t: 0.38, ease: 'inOutQuad', pose: { shoulderR: [-86, 0, 2] } },
      { t: 0.46, ease: 'outCubic', pose: { shoulderR: [-96, 0, 2], torso: [0, -14, 0] } },
      { t: 0.85, ease: 'inOutQuad', pose: { shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0], torso: [0, 0, 0], head: [0, 0, 0] } },
    ],
    events: [{ t: 0.42, type: 'fire' }],
  },

  // ---------- defense / reactions ----------
  block: {
    dur: 0.22, upper: true, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, ease: 'outCubic', pose: { shoulderL: [-70, 30, -10], shoulderR: [-70, -30, 10], elbowL: [-105, 0, 0], elbowR: [-105, 0, 0], torso: [10, 0, 0], head: [8, 0, 0] } },
    ],
  },
  // TIGHT BALL: the air somersault's carriage (see Fighter.startAirRoll) —
  // knees hauled to the chest, shins folded flat against the thighs, spine
  // curled and chin tucked, arms hugged around the shins. Authored so the
  // whole silhouette pulls in toward the middle, which is what the roll
  // spins about post-pose (Fighter.tuckCentre measures the curled body's own
  // centre per rig): the tighter the mass sits to that pivot, the
  // cleaner the tumble reads (and a heavy mech that only TUCKS without
  // spinning still reads as bracing, not falling). Full-body and held —
  // the fighter drops it when the roll ends. Legs/torso/head ride the
  // restBias like every clip, so digitigrade bodies keep their bend;
  // beyond that, a roster def may reshape it per body type with a sparse
  // `ballPose` override (see defClipVariants below).
  ball: {
    dur: 0.16, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.16, ease: 'outCubic', pose: BALL_TUCK },
    ],
  },
  // ---------- landing ----------
  // Two halves of one touchdown, split so the fighter can enter from any
  // fall: LANDREACH is the anticipation — held while the ground rushes up,
  // legs stretched long underneath with toes pointed, arms flung out for
  // balance. LAND takes over at the instant of contact: its t=0 IS
  // landReach's held pose (the same handover trick as flipOver→proneBack),
  // so the stretch compresses seamlessly into a deep foot-flat crouch and
  // the body stands back up out of it. The crouch follows the duck layer's
  // geometry (ankle = -(knee - thigh), hip drop ≈ the leg fold's lost
  // reach) so the feet land planted instead of punching through the floor.
  landReach: {
    dur: 0.22, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, ease: 'outCubic', pose: LAND_STRETCH },
    ],
  },
  land: {
    dur: 0.62,
    keys: [
      { t: 0, pose: LAND_STRETCH },
      // impact: the stretch compresses into the crouch in one beat
      { t: 0.1, ease: 'outCubic', pose: { hipsPos: [0, -0.74, 0.02], hipsRot: [2, 0, 0], torso: [30, 0, 0], head: [-22, 0, 0], thighL: [-50, 0, -4], thighR: [-50, 0, 4], kneeL: [92, 0, 0], kneeR: [92, 0, 0], ankleL: [-42, 0, 0], ankleR: [-42, 0, 0], shoulderL: [-30, 0, -30], shoulderR: [-30, 0, 30], elbowL: [-38, 0, 0], elbowR: [-38, 0, 0] } },
      // the springs take the weight — a small settle up out of the deepest point
      { t: 0.22, ease: 'outQuad', pose: { hipsPos: [0, -0.58, 0.02], torso: [24, 0, 0], head: [-16, 0, 0], thighL: [-42, 0, -4], thighR: [-42, 0, 4], kneeL: [78, 0, 0], kneeR: [78, 0, 0], ankleL: [-36, 0, 0], ankleR: [-36, 0, 0] } },
      // ...and stand back up
      { t: 0.62, ease: 'inOutQuad', pose: REST_FULL },
    ],
  },
  hitFlinch: {
    dur: 0.32,
    keys: [
      { t: 0, pose: {} },
      { t: 0.07, ease: 'outCubic', pose: { torso: [-22, 6, 0], head: [-18, 0, 0], shoulderL: [-30, 0, -26], shoulderR: [-30, 0, 26], elbowL: [-50, 0, 0], elbowR: [-50, 0, 0], hipsPos: [0, -0.15, 0] } },
      { t: 0.32, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], hipsPos: [0, 0, 0] } },
    ],
  },
  launched: {
    dur: 0.7, loop: true,
    keys: [
      { t: 0, pose: { torso: [-30, 0, 0], head: [-20, 0, 0], shoulderL: [-130, 0, -35], shoulderR: [-100, 0, 40], elbowL: [-40, 0, 0], elbowR: [-60, 0, 0], thighL: [-45, 0, 0], thighR: [15, 0, 0], kneeL: [60, 0, 0], kneeR: [85, 0, 0] } },
      { t: 0.35, ease: 'inOutQuad', pose: { shoulderL: [-100, 0, -40], shoulderR: [-130, 0, 35], thighL: [-20, 0, 0], thighR: [-35, 0, 0] } },
      { t: 0.7, ease: 'inOutQuad', pose: { shoulderL: [-130, 0, -35], shoulderR: [-100, 0, 40], thighL: [-45, 0, 0], thighR: [15, 0, 0] } },
    ],
  },
  knockdown: {
    dur: 0.4, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.4, ease: 'outQuad', pose: { hipsPos: [0, -2.55, 0.4], hipsRot: [-78, 0, 0], torso: [12, 0, 0], head: [25, 0, 0], shoulderL: [-40, 0, -55], shoulderR: [-40, 0, 55], elbowL: [-30, 0, 0], elbowR: [-30, 0, 0], thighL: [-25, 0, 0], thighR: [-40, 0, 0], kneeL: [45, 0, 0], kneeR: [70, 0, 0] } },
    ],
  },
  // ---------- ragdoll: limp finisher-victim poses (loop = never fade back
  // to the standing rest; the Finisher adds acceleration-driven flailing) --
  ragdollAir: { // carried / whipped around: everything dangles loose
    dur: 1.1, loop: true,
    keys: [
      { t: 0, pose: { hipsPos: [0, -0.1, 0], torso: [24, 6, 4], head: [34, -14, 8], shoulderL: [-24, 0, -58], shoulderR: [-14, 0, 66], elbowL: [-24, 0, 0], elbowR: [-42, 0, 0], handL: [20, 0, 0], handR: [26, 0, 0], thighL: [-14, 0, -10], thighR: [4, 0, 14], kneeL: [34, 0, 0], kneeR: [58, 0, 0], ankleL: [30, 0, 0], ankleR: [38, 0, 0] } },
      { t: 0.55, ease: 'inOutQuad', pose: { head: [30, -10, 6], shoulderL: [-20, 0, -54], shoulderR: [-18, 0, 62], kneeR: [52, 0, 0] } },
      { t: 1.1, ease: 'inOutQuad', pose: { head: [34, -14, 8], shoulderL: [-24, 0, -58], shoulderR: [-14, 0, 66], kneeR: [58, 0, 0] } },
    ],
  },
  ragdoll: { // downed: flat on the back, limbs flung asymmetric — a wreck,
    // not a fighter waiting to stand up
    dur: 1, loop: true,
    keys: [
      { t: 0, pose: { hipsPos: [0, -2.55, 0.4], hipsRot: [-78, 0, 0], torso: [10, 8, 0], head: [28, 18, 0], shoulderL: [-70, 0, -70], shoulderR: [-15, 0, 80], elbowL: [-45, 0, 0], elbowR: [-10, 0, 0], thighL: [-15, 0, -8], thighR: [-45, 0, 12], kneeL: [30, 0, 0], kneeR: [80, 0, 0] } },
      { t: 1, pose: { hipsPos: [0, -2.55, 0.4], hipsRot: [-78, 0, 0], torso: [10, 8, 0], head: [28, 18, 0], shoulderL: [-70, 0, -70], shoulderR: [-15, 0, 80], elbowL: [-45, 0, 0], elbowR: [-10, 0, 0], thighL: [-15, 0, -8], thighR: [-45, 0, 12], kneeL: [30, 0, 0], kneeR: [80, 0, 0] } },
    ],
  },

  getup: {
    dur: 0.75,
    keys: [
      { t: 0, pose: { hipsPos: [0, -2.55, 0.4], hipsRot: [-78, 0, 0], torso: [12, 0, 0], head: [25, 0, 0], shoulderL: [-40, 0, -55], shoulderR: [-40, 0, 55], elbowL: [-30, 0, 0], elbowR: [-30, 0, 0], thighL: [-25, 0, 0], thighR: [-40, 0, 0], kneeL: [45, 0, 0], kneeR: [70, 0, 0] } },
      { t: 0.35, ease: 'inOutCubic', pose: { hipsPos: [0, -1.5, 0.2], hipsRot: [-20, 0, 0], torso: [30, 0, 0], head: [0, 0, 0], kneeL: [95, 0, 0], kneeR: [95, 0, 0], thighL: [-55, 0, 0], thighR: [-55, 0, 0], ankleL: [-40, 0, 0], ankleR: [-40, 0, 0], shoulderL: [20, 0, -14], shoulderR: [20, 0, 14] } },
      { t: 0.75, ease: 'outQuad', pose: REST_FULL },
    ],
  },

  // ---------- ROLLOVER (roster `rollover` — CRANKY) ----------
  // The shared knockdown sits a mech DOWN — hips back, knees up, propped and
  // ready to push straight off the floor again. A big enough blow instead
  // turns a top-heavy shell CLEAN OVER: it BARREL-ROLLS about its own facing
  // axis until the carapace is on the pavement and every limb is waving at the
  // sky, and there it stays until it rolls itself back upright. Three clips,
  // played in sequence by the fighter (see ROLLOVER_* in fighter.js): the FLIP,
  // a prone loop while he's stranded, and the righting ROLL he gets up with.
  //
  // The roll axis is hipsRot.Z — the mech's own facing direction — so the body
  // ends up inverted while still POINTING where it pointed (unlike a pitch
  // about X, which would lay a wide flat crab out on his tail-end rather than
  // his back). Everything below is authored in the body's own frame as usual,
  // which upside down means: limbs hang toward the SKY, and increasing Z rolls
  // him toward his LEFT.
  //
  // Winding matters. +180 and -180 are the same pose but not the same number,
  // and the pose smoother lerps numbers — so the prone loop sits at +180, the
  // right-hand recovery unwinds it 180 -> 0, and the mirrored left-hand one
  // runs -180 -> 0 after the fighter re-winds the smoother (Animator.rewrap).
  // Both END at 0: a clip that finished anywhere else would leave the body
  // standing up facing somewhere other than its own yaw.
  //
  // proneBack deliberately keys NO leg joint. With the legs left to the
  // locomotion layer, a stranded mech's legs still answer the stick and
  // scuttle uselessly at the sky (fighter.js feeds the stick in as speed).
  flipOver: {
    dur: 0.62, hold: true,
    keys: [
      // contact: he lands already going over, weight past the outside legs
      { t: 0, pose: { hipsPos: [0, -0.35, 0.1], hipsRot: [8, 0, 42], torso: [10, 0, -14], head: [6, 0, 0], shoulderL: [-30, 0, -38], shoulderR: [-24, 0, 26], elbowL: [-40, 0, 0], elbowR: [-52, 0, 0], thighL: [-24, 0, -14], thighR: [-16, 0, 10], kneeL: [40, 0, 0], kneeR: [30, 0, 0] } },
      // past the point of no return — the shell comes round underneath him
      { t: 0.22, ease: 'inQuad', pose: { hipsPos: [0, -0.95, 0.2], hipsRot: [6, 0, 112], torso: [4, 0, -8], head: [2, 0, 0], shoulderL: [-46, 0, -52], shoulderR: [-36, 0, 34], elbowL: [-52, 0, 0], elbowR: [-60, 0, 0], thighL: [-34, 0, -18], thighR: [-22, 0, 14], kneeL: [52, 0, 0], kneeR: [40, 0, 0] } },
      // carapace hits and the whole frame rocks PAST level on its curve
      { t: 0.42, ease: 'outQuad', pose: { hipsPos: [0, -1.35, 0.28], hipsRot: [-4, 0, 198], torso: [-6, 0, 6], head: [-4, 0, 0], shoulderL: [-18, 0, -64], shoulderR: [-14, 0, 58], elbowL: [-70, 0, 0], elbowR: [-66, 0, 0], thighL: [-14, 0, -26], thighR: [-10, 0, 24], kneeL: [64, 0, 0], kneeR: [58, 0, 0] } },
      // ...and rocks back to rest ON the shell. This key IS proneBack's t=0, so
      // the fighter's hold->loop handover takes over with no seam. The legs
      // land near their rest bend, since the loop hands them straight back to
      // the locomotion layer and anything further out would visibly settle.
      { t: 0.62, ease: 'inOutQuad', pose: { hipsPos: [0, -1.2, 0.22], hipsRot: [0, 0, 180], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [-24, 0, -56], shoulderR: [-24, 0, 56], elbowL: [-58, 0, 0], elbowR: [-58, 0, 0], thighL: [-6, 0, -10], thighR: [-6, 0, 10], kneeL: [18, 0, 0], kneeR: [18, 0, 0] } },
    ],
  },
  proneBack: { // stranded: the shell rocks on its curve, the claws paw at air
    dur: 1.5, loop: true,
    keys: [
      { t: 0, pose: { hipsPos: [0, -1.2, 0.22], hipsRot: [0, 0, 180], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [-24, 0, -56], shoulderR: [-24, 0, 56], elbowL: [-58, 0, 0], elbowR: [-58, 0, 0] } },
      { t: 0.5, ease: 'inOutQuad', pose: { hipsPos: [0, -1.22, 0.22], hipsRot: [3, 0, 187], torso: [3, 0, 4], head: [2, 0, 0], shoulderL: [-40, 0, -44], shoulderR: [-12, 0, 66], elbowL: [-34, 0, 0], elbowR: [-74, 0, 0] } },
      { t: 1.0, ease: 'inOutQuad', pose: { hipsPos: [0, -1.18, 0.22], hipsRot: [-3, 0, 173], torso: [-3, 0, -4], head: [-2, 0, 0], shoulderL: [-10, 0, -68], shoulderR: [-38, 0, 46], elbowL: [-76, 0, 0], elbowR: [-32, 0, 0] } },
      { t: 1.5, ease: 'inOutQuad', pose: { hipsPos: [0, -1.2, 0.22], hipsRot: [0, 0, 180], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [-24, 0, -56], shoulderR: [-24, 0, 56], elbowL: [-58, 0, 0], elbowR: [-58, 0, 0] } },
    ],
  },
  // Righting roll over his RIGHT side (rollUpL is the mirror, and rolls left).
  // He heaves the shell round off its back, catches himself on the claws as he
  // comes onto his flank, folds the legs in underneath and pushes up. The
  // travel that sells it as a ROLL rather than a spin is real world movement,
  // driven by the fighter for the length of the clip, not authored here.
  rollUpR: {
    dur: 0.85,
    keys: [
      { t: 0, pose: { hipsPos: [0, -1.2, 0.22], hipsRot: [0, 0, 180], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [-24, 0, -56], shoulderR: [-24, 0, 56], elbowL: [-58, 0, 0], elbowR: [-58, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], ankleL: [0, 0, 0], ankleR: [0, 0, 0] } },
      // throw the weight over the right flank — right claw reaches for ground
      { t: 0.17, ease: 'inOutQuad', pose: { hipsPos: [0, -1.25, 0.2], hipsRot: [4, 0, 146], torso: [6, 0, -10], head: [4, 0, 0], shoulderL: [-52, 0, -30], shoulderR: [-10, 0, 62], elbowL: [-30, 0, 0], elbowR: [-84, 0, 0], thighL: [-30, 0, -16], thighR: [-12, 0, 10], kneeL: [56, 0, 0], kneeR: [34, 0, 0] } },
      // onto the flank, claws taking the weight, legs gathering under him
      { t: 0.36, ease: 'inOutQuad', pose: { hipsPos: [0, -1.35, 0.14], hipsRot: [6, 0, 92], torso: [10, 0, -16], head: [-4, 0, 0], shoulderL: [-40, 0, -20], shoulderR: [-6, 0, 40], elbowL: [-56, 0, 0], elbowR: [-58, 0, 0], thighL: [-56, 0, -10], thighR: [-46, 0, 8], kneeL: [86, 0, 0], kneeR: [78, 0, 0], ankleL: [-24, 0, 0], ankleR: [-24, 0, 0] } },
      // shell comes up off the pavement, legs planting
      { t: 0.53, ease: 'outCubic', pose: { hipsPos: [0, -1.05, 0.08], hipsRot: [8, 0, 40], torso: [18, 0, -10], head: [-12, 0, 0], shoulderL: [-20, 0, -26], shoulderR: [-14, 0, 26], elbowL: [-46, 0, 0], elbowR: [-46, 0, 0], thighL: [-70, 0, -6], thighR: [-66, 0, 6], kneeL: [104, 0, 0], kneeR: [100, 0, 0], ankleL: [-32, 0, 0], ankleR: [-32, 0, 0] } },
      // up on the legs, still crouched over them
      { t: 0.68, ease: 'outQuad', pose: { hipsPos: [0, -0.5, 0.02], hipsRot: [4, 0, 10], torso: [14, 0, -2], head: [-6, 0, 0], shoulderL: [-8, 0, -22], shoulderR: [-8, 0, 22], elbowL: [-40, 0, 0], elbowR: [-40, 0, 0], thighL: [-38, 0, 0], thighR: [-36, 0, 0], kneeL: [68, 0, 0], kneeR: [66, 0, 0], ankleL: [-20, 0, 0], ankleR: [-20, 0, 0] } },
      { t: 0.85, ease: 'inOutQuad', pose: REST_FULL },
    ],
  },
  dead: {
    dur: 1.3, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.35, ease: 'inOutQuad', pose: { hipsPos: [0, -1.3, 0], torso: [25, 0, 8], head: [30, 0, 0], kneeL: [100, 0, 0], kneeR: [100, 0, 0], thighL: [-55, 0, 0], thighR: [-55, 0, 0], ankleL: [-45, 0, 0], ankleR: [-45, 0, 0], shoulderL: [10, 0, -20], shoulderR: [10, 0, 20] } },
      { t: 0.7, ease: 'inQuad', pose: { hipsPos: [0, -2.2, 0.3], hipsRot: [35, 0, 0], torso: [55, 0, 10], head: [40, 0, 0], shoulderL: [-30, 0, -40], shoulderR: [-30, 0, 40], elbowL: [-20, 0, 0], elbowR: [-20, 0, 0] } },
      { t: 1.3, ease: 'outBounce', pose: { hipsPos: [0, -2.5, 0.35], hipsRot: [42, 0, 0], torso: [60, 0, 12] } },
    ],
    events: [{ t: 0.7, type: 'sfx', arg: 'bodyfall' }, { t: 0.75, type: 'shake', arg: 0.4 }],
  },

  // ---------- specials ----------
  groundPound: {
    dur: 0.9,
    keys: [
      { t: 0, pose: {} },
      { t: 0.28, ease: 'inOutCubic', pose: { hipsPos: [0, 0.22, 0], hipsRot: [-6, 0, 0], torso: [-26, 0, 0], head: [-18, 0, 0], shoulderL: [-168, 0, -28], shoulderR: [-168, 0, 28], elbowL: [-26, 0, 0], elbowR: [-26, 0, 0] } },
      { t: 0.46, ease: 'inCubic', pose: { hipsPos: [0, -1.0, 0], hipsRot: [14, 0, 0], torso: [52, 0, 0], head: [18, 0, 0], shoulderL: [-45, 0, -12], shoulderR: [-45, 0, 12], elbowL: [-4, 0, 0], elbowR: [-4, 0, 0], kneeL: [70, 0, 0], kneeR: [70, 0, 0], thighL: [-36, 0, 0], thighR: [-36, 0, 0], ankleL: [-30, 0, 0], ankleR: [-30, 0, 0] } },
      { t: 0.62, ease: 'outQuad', pose: { hipsPos: [0, -0.8, 0] } },
      { t: 0.9, ease: 'inOutQuad', pose: REST_FULL },
    ],
    events: [{ t: 0.44, type: 'fire' }, { t: 0.46, type: 'shake', arg: 0.8 }],
  },
  shieldBash: {
    dur: 0.58,
    keys: [
      { t: 0, pose: { torso: [6, 26, -6], hipsRot: [0, 12, 0], shoulderL: [-40, 0, -24], elbowL: [-90, 0, 0], head: [0, -8, 0] } },
      { t: 0.18, ease: 'outBack', pose: { torso: [10, -30, 8], hipsRot: [0, -14, 0], hipsPos: [0, -0.15, 0], shoulderL: [-92, -24, -2], elbowL: [-22, 0, 0], head: [0, 12, 0] } },
      { t: 0.34, ease: 'inOutQuad', pose: { torso: [7, -20, 5] } },
      { t: 0.58, ease: 'inOutQuad', pose: { torso: [0, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0], head: [0, 0, 0] } },
    ],
    events: [{ t: 0.16, type: 'hit', arg: 0 }, { t: 0.16, type: 'sfx', arg: 'whooshBig' }],
  },
  lunge: { // dash-stab — body thrown flat, arms speared, trailing leg at full stretch
    dur: 0.6, hold: false,
    keys: [
      { t: 0, pose: {} },
      { t: 0.12, ease: 'outCubic', pose: { torso: [42, 0, -8], head: [-22, 0, 0], hipsRot: [12, 0, 0], shoulderL: [-108, 0, -10], shoulderR: [-108, 0, 10], elbowL: [-6, 0, 0], elbowR: [-6, 0, 0], thighL: [-52, 0, 0], thighR: [34, 0, 0], kneeL: [55, 0, 0], kneeR: [82, 0, 0], ankleR: [30, 0, 0], hipsPos: [0, -0.5, 0] } },
      { t: 0.42, ease: 'inOutQuad', pose: { torso: [32, 0, -5], hipsRot: [8, 0, 0] } },
      { t: 0.6, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsRot: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], ankleR: [0, 0, 0], hipsPos: [0, 0, 0] } },
    ],
    events: [{ t: 0.1, type: 'sfx', arg: 'dash' }],
  },
  chargeLean: { // bull rush / stampede loop — lower, hungrier, swaying with effort
    dur: 0.5, loop: true,
    keys: [
      { t: 0, pose: { torso: [50, 4, -4], head: [-26, 0, 0], hipsRot: [8, 0, 0], shoulderL: [36, 0, -34], shoulderR: [36, 0, 34], elbowL: [-20, 0, 0], elbowR: [-20, 0, 0], hipsPos: [0, -0.42, 0] } },
      { t: 0.25, ease: 'inOutQuad', pose: { torso: [54, -4, 4], hipsPos: [0, -0.5, 0], head: [-28, 0, 0] } },
      { t: 0.5, ease: 'inOutQuad', pose: { torso: [50, 4, -4], hipsPos: [0, -0.42, 0], head: [-26, 0, 0] } },
    ],
  },
  burst: { // nova / static field / backdraft / absolute zero — coil tight, detonate open
    dur: 0.78,
    keys: [
      { t: 0, pose: {} },
      { t: 0.26, ease: 'inOutCubic', pose: { hipsPos: [0, -0.7, 0], hipsRot: [6, 0, 0], torso: [30, 0, 0], head: [18, 0, 0], shoulderL: [-60, 45, -4], shoulderR: [-60, -45, 4], elbowL: [-130, 0, 0], elbowR: [-130, 0, 0], kneeL: [55, 0, 0], kneeR: [55, 0, 0], thighL: [-28, 0, 0], thighR: [-28, 0, 0] } },
      { t: 0.44, ease: 'outBack', pose: { hipsPos: [0, 0.3, 0], hipsRot: [-10, 0, 0], torso: [-26, 0, 0], head: [-22, 0, 0], shoulderL: [-30, 0, -88], shoulderR: [-30, 0, 88], elbowL: [-2, 0, 0], elbowR: [-2, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0] } },
      { t: 0.78, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0] } },
    ],
    events: [{ t: 0.42, type: 'fire' }, { t: 0.44, type: 'shake', arg: 0.7 }],
  },
  flurry: { // serpent storm / wild hunt claw loop — wide slashing arcs, hips whipping
    dur: 0.44, loop: true,
    keys: [
      { t: 0, pose: { torso: [12, 34, -10], hipsRot: [0, 12, 0], shoulderL: [-112, -26, 4], elbowL: [-8, 0, 0], shoulderR: [-24, 0, 26], elbowR: [-96, 0, 0], head: [0, -14, 0] } },
      { t: 0.22, ease: 'outBack', pose: { torso: [12, -34, 10], hipsRot: [0, -12, 0], shoulderR: [-112, 26, -4], elbowR: [-8, 0, 0], shoulderL: [-24, 0, -26], elbowL: [-96, 0, 0], head: [0, 14, 0] } },
      { t: 0.44, ease: 'outBack', pose: { torso: [12, 34, -10], hipsRot: [0, 12, 0], shoulderL: [-112, -26, 4], elbowL: [-8, 0, 0], shoulderR: [-24, 0, 26], elbowR: [-96, 0, 0], head: [0, -14, 0] } },
    ],
    events: [{ t: 0.05, type: 'hit', arg: 0 }, { t: 0.27, type: 'hit', arg: 0 }],
  },
  // (spinFire, the old arms-FORWARD hurricane loop, is gone — hurricaneSpin
  // replaced it: the storm now needs the arms out to the sides to fly off.)
  hurricaneSpin: { // VULCAN's BULLET HURRICANE. The storm GATHERS first: both
    // gatling arms fling out wide and HIGH — abducted past the shoulder line so
    // the barrels ride diagonally up-and-out, not drooping — elbows locked
    // straight, and only then does combat spin the torso up from a standstill
    // under this pose (specials.js bulletHurricane — delay/ramp/brake on
    // _spinFx). `hold` parks the final key so the arms stay outstretched for the
    // whole whirl, which is what the rounds are seen to fly off.
    dur: 1.0, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.34, ease: 'outBack', pose: { shoulderL: [-20, -40, -142], shoulderR: [-20, 40, 142], elbowL: [0, 0, 0], elbowR: [0, 0, 0], torso: [-9, 0, 0], head: [-12, 0, 0], hipsPos: [0, -0.2, 0], kneeL: [24, 0, 0], kneeR: [24, 0, 0], thighL: [-13, 0, 0], thighR: [-13, 0, 0] } },
      { t: 1.0, ease: 'inOutQuad', pose: { shoulderL: [-20, -40, -138], shoulderR: [-20, 40, 138], elbowL: [-2, 0, 0], elbowR: [-2, 0, 0], torso: [7, 0, 0], head: [-4, 0, 0], hipsPos: [0, -0.36, 0], kneeL: [34, 0, 0], kneeR: [34, 0, 0], thighL: [-18, 0, 0], thighR: [-18, 0, 0] } },
    ],
  },
  spray: { // flame / napalm sweep channel
    dur: 0.9, upper: true, loop: true,
    keys: [
      { t: 0, pose: { shoulderR: [-84, -14, 4], elbowR: [-10, 0, 0], shoulderL: [-84, 14, -4], elbowL: [-10, 0, 0], torso: [6, 8, 0], head: [4, 0, 0] } },
      { t: 0.45, ease: 'inOutQuad', pose: { torso: [6, -8, 0], shoulderR: [-84, -10, 4], shoulderL: [-84, 18, -4] } },
      { t: 0.9, ease: 'inOutQuad', pose: { torso: [6, 8, 0], shoulderR: [-84, -14, 4], shoulderL: [-84, 14, -4] } },
    ],
  },
  clawSnap: { // CRANKY heavy — the arms reach OUTSTRETCHED wide to the sides
    // (elbows straight, pincers gaping), then SMASH together at the centerline
    // like one giant pincer. Deliberately symmetric with NO body yaw/twist: a
    // wide crab squares up and claps, it doesn't wind up like a boxer.
    //
    // The inward yaw at the smash is generous on purpose — how far the claws can
    // actually travel before they'd pass THROUGH each other depends on the
    // model's arm proportions, so each body caps it to its own geometry
    // (armClampYaw in the cranky signature / GLB profile). Lateral travel is
    // driven almost entirely by shoulder YAW; pitch barely moves the claws
    // sideways, so pitch stays free to sell the lunge.
    dur: 0.55,
    keys: [
      { t: 0, pose: {} },
      { t: 0.18, ease: 'outCubic', pose: { torso: [5, 0, 0], head: [-7, 0, 0], shoulderL: [-34, -52, -10], shoulderR: [-34, 52, 10], elbowL: [-5, 0, 0], elbowR: [-5, 0, 0], hipsPos: [0, -0.06, -0.04] } },
      { t: 0.32, ease: 'inCubic', pose: { torso: [12, 0, 0], head: [2, 0, 0], shoulderL: [-58, 44, 8], shoulderR: [-58, -44, -8], elbowL: [-30, 0, 0], elbowR: [-30, 0, 0], hipsPos: [0, -0.1, 0.15] } },
      { t: 0.44, ease: 'outQuad', pose: { torso: [10, 0, 0] } },
      { t: 0.55, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], hipsPos: [0, 0, 0] } },
    ],
    events: [{ t: 0.29, type: 'sfx', arg: 'whooshBig' }, { t: 0.32, type: 'hit', arg: 0 }, { t: 0.33, type: 'sfx', arg: 'block' }, { t: 0.34, type: 'shake', arg: 0.5 }],
  },
  // ---------- JERRY: the claw rakes (his light chain) ----------
  // The shared jab trio is a BOXER's kit — punches sold with torso twist, and
  // the third one an uppercut. On a shrimp none of that reads: the carapace
  // slewing around was the visible motion, and an uppercut swings a downward-
  // hanging claw the wrong way entirely. These are OVERHAND RAKES: the claw
  // chambers UP AND OVER the shell, past vertical, then slams down-and-forward
  // through the target — a claw is a pick, not a fist. The shell stays nearly
  // square throughout (torso yaw ≤5° against the shared trio's 22-30°): the
  // arm is the whole show. R first, L is the mirror, and the finisher below
  // brings both down together.
  jerryRakeR: {
    strikeArm: 'R', // ONE-ARMED blow — see Fighter.aimStrikeAt
    dur: 0.55,
    keys: [
      { t: 0, pose: {} },
      { t: 0.18, ease: 'outCubic', pose: { shoulderR: [-148, -8, 14], elbowR: [-64, 0, 0], handR: [-24, 0, 0], shoulderL: [4, 0, -14], torso: [-4, 5, 2], head: [-4, -4, 0], hipsPos: [0, -0.05, -0.05] } },
      { t: 0.3, ease: 'inCubic', pose: { shoulderR: [-34, 4, -6], elbowR: [-4, 0, 0], handR: [26, 0, 0], shoulderL: [8, 0, -16], torso: [9, -5, -2], head: [2, 3, 0], hipsPos: [0, -0.1, 0.08] } },
      { t: 0.4, ease: 'outQuad', pose: { shoulderR: [-42, 2, -2], handR: [12, 0, 0], torso: [6, -3, -1] } },
      { t: 0.55, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsPos: [0, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], handR: [0, 0, 0], shoulderL: [0, 0, -10] } },
    ],
    // HIT AFTER ARRIVAL, not on the strike key. The pose smoother lags the
    // clip, and this swing travels 114 degrees in 0.12s — measured
    // (tools/striketime.mjs), at t=0.30 the claw is still up over his own
    // back (0.25 body heights forward, 1.0 up) and only reaches down-and-
    // forward (0.57 fwd, 0.73 up) around t=0.32. Firing on the key resolved
    // the blow at the top of the chamber and whiffed over the target.
    events: [{ t: 0.2, type: 'sfx', arg: 'whoosh' }, { t: 0.35, type: 'hit', arg: 0 }],
  },
  jerryRake2: { // combo finisher: BOTH claws chamber over the shell and come
    // down as one — the two-arm blow at the end of the rake chain. Slightly
    // longer wind-up than the singles, a knee dip under the impact, and still
    // no body yaw: symmetric limbs, square shell.
    dur: 0.62,
    keys: [
      { t: 0, pose: {} },
      { t: 0.2, ease: 'outCubic', pose: { shoulderL: [-152, 6, -16], shoulderR: [-152, -6, 16], elbowL: [-60, 0, 0], elbowR: [-60, 0, 0], handL: [-24, 0, 0], handR: [-24, 0, 0], torso: [-6, 0, 0], head: [-6, 0, 0], hipsPos: [0, -0.06, -0.08] } },
      { t: 0.34, ease: 'inCubic', pose: { shoulderL: [-36, -4, -4], shoulderR: [-36, 4, 4], elbowL: [-4, 0, 0], elbowR: [-4, 0, 0], handL: [28, 0, 0], handR: [28, 0, 0], torso: [10, 0, 0], head: [3, 0, 0], hipsPos: [0, -0.12, 0.1], kneeL: [10, 0, 0], kneeR: [10, 0, 0] } },
      { t: 0.46, ease: 'outQuad', pose: { torso: [7, 0, 0], hipsPos: [0, -0.06, 0.04] } },
      { t: 0.62, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsPos: [0, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], handL: [0, 0, 0], handR: [0, 0, 0] } },
    ],
    events: [{ t: 0.24, type: 'sfx', arg: 'whooshBig' }, { t: 0.39, type: 'hit', arg: 2 }, { t: 0.4, type: 'shake', arg: 0.3 }],
  },
  // ---------- JERRY: the barrage (his heavy) ----------
  // REAR BACK, then eight quick forward-and-downward claw strikes, arms
  // alternating — a frenzy, not one blow. Every `hit` event resolves a full
  // strike, so the roster's heavy dmg/knock are PER HIT (8 × 11 ≈ one shared
  // heavy when most land) and knock stays small so the victim is pummelled in
  // place rather than launched off the second hit. The shell leans in and
  // stays leaned — all the travel is in the claws.
  jerryBarrage: {
    dur: 1.3,
    keys: [
      { t: 0, pose: {} },
      // the rear-back: shell tips back and low, both claws cocked over the top
      { t: 0.3, ease: 'outCubic', pose: { torso: [-14, 0, 0], head: [-10, 0, 0], hipsPos: [0, -0.08, -0.18], shoulderL: [-150, 6, -16], shoulderR: [-150, -6, 16], elbowL: [-58, 0, 0], elbowR: [-58, 0, 0], handL: [-24, 0, 0], handR: [-24, 0, 0], kneeL: [12, 0, 0], kneeR: [12, 0, 0] } },
      // the barrage: one claw down-and-forward while the other re-cocks, at a
      // strike every 0.09s — each key IS one alternation extreme
      { t: 0.38, ease: 'inCubic', pose: { torso: [8, -3, 0], head: [0, 0, 0], hipsPos: [0, -0.1, 0.06], shoulderR: [-34, 2, -4], elbowR: [-6, 0, 0], handR: [24, 0, 0], shoulderL: [-128, 4, -10], elbowL: [-56, 0, 0], handL: [-20, 0, 0] } },
      { t: 0.47, ease: 'inOutQuad', pose: { torso: [8, 3, 0], shoulderL: [-34, -2, 4], elbowL: [-6, 0, 0], handL: [24, 0, 0], shoulderR: [-128, -4, 10], elbowR: [-56, 0, 0], handR: [-20, 0, 0] } },
      { t: 0.56, ease: 'inOutQuad', pose: { torso: [8, -3, 0], shoulderR: [-34, 2, -4], elbowR: [-6, 0, 0], handR: [24, 0, 0], shoulderL: [-128, 4, -10], elbowL: [-56, 0, 0], handL: [-20, 0, 0] } },
      { t: 0.65, ease: 'inOutQuad', pose: { torso: [8, 3, 0], shoulderL: [-34, -2, 4], elbowL: [-6, 0, 0], handL: [24, 0, 0], shoulderR: [-128, -4, 10], elbowR: [-56, 0, 0], handR: [-20, 0, 0] } },
      { t: 0.74, ease: 'inOutQuad', pose: { torso: [8, -3, 0], shoulderR: [-34, 2, -4], elbowR: [-6, 0, 0], handR: [24, 0, 0], shoulderL: [-128, 4, -10], elbowL: [-56, 0, 0], handL: [-20, 0, 0] } },
      { t: 0.83, ease: 'inOutQuad', pose: { torso: [8, 3, 0], shoulderL: [-34, -2, 4], elbowL: [-6, 0, 0], handL: [24, 0, 0], shoulderR: [-128, -4, 10], elbowR: [-56, 0, 0], handR: [-20, 0, 0] } },
      { t: 0.92, ease: 'inOutQuad', pose: { torso: [8, -3, 0], shoulderR: [-34, 2, -4], elbowR: [-6, 0, 0], handR: [24, 0, 0], shoulderL: [-128, 4, -10], elbowL: [-56, 0, 0], handL: [-20, 0, 0] } },
      { t: 1.01, ease: 'inOutQuad', pose: { torso: [8, 3, 0], shoulderL: [-34, -2, 4], elbowL: [-6, 0, 0], handL: [24, 0, 0], shoulderR: [-128, -4, 10], elbowR: [-56, 0, 0], handR: [-20, 0, 0] } },
      { t: 1.3, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsPos: [0, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], handL: [0, 0, 0], handR: [0, 0, 0] } },
    ],
    events: [
      { t: 0.28, type: 'sfx', arg: 'whooshBig' },
      // each hit sits one arrival-lag (0.03s) PAST its own strike key — see
      // the note on jerryRakeR; measured, the claw is down-and-forward by then
      { t: 0.41, type: 'hit', arg: 0 }, { t: 0.5, type: 'hit', arg: 0 },
      { t: 0.59, type: 'hit', arg: 0 }, { t: 0.6, type: 'sfx', arg: 'whoosh' },
      { t: 0.68, type: 'hit', arg: 0 }, { t: 0.77, type: 'hit', arg: 0 },
      { t: 0.86, type: 'hit', arg: 0 }, { t: 0.87, type: 'sfx', arg: 'whoosh' },
      { t: 0.95, type: 'hit', arg: 0 }, { t: 1.04, type: 'hit', arg: 0 },
      { t: 1.06, type: 'shake', arg: 0.4 },
    ],
  },
  pounceLeap: { // SAURION pounce airtime — legs cocked under the body, head
    // locked on prey, and the sickle claws REACHING: both arms thrown forward
    // and slightly out, elbows part-folded so the hands lead the body into the
    // target. (They used to sweep BACK, which is a diver's pose, not a
    // predator's — the claws are the reason for the leap and they arrived
    // last. See the foreCarry note in defClipVariants.) Leg/torso/head values
    // are deltas over his raptor rest pose; arm values are absolute.
    dur: 0.6, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, ease: 'outCubic', pose: { torso: [10, 0, 0], head: [-10, 0, 0], shoulderL: [-98, 0, -22], shoulderR: [-98, 0, 22], elbowL: [-52, 0, 0], elbowR: [-52, 0, 0], handL: [32, 0, 12], handR: [32, 0, -12], thighL: [-28, 0, -4], thighR: [-28, 0, 4], kneeL: [24, 0, 0], kneeR: [24, 0, 0], ankleL: [-22, 0, 0], ankleR: [-22, 0, 0], hipsRot: [16, 0, 0] } },
    ],
  },
  biteLatch: { // SAURION riding the kill — legs clenched in a deep gripping
    // crouch (talons in), body hunched low over them, and a four-beat loop of
    // JAWS AND CLAWS: head rears back and hammers the collar, the right sickle
    // chambers and is dragged down through them, hammer again, left sickle. He
    // used to only peck, with both hands hanging idle at his sides — a raptor
    // on top of something uses everything it has. See PERCH_BEATS.
    dur: PERCH_BEATS.loop, loop: true,
    keys: [
      { t: 0, pose: { ...PERCH_UP, ...PERCH_LEGS, ...perchCarry('L'), ...perchCarry('R') } },
      { t: PERCH_BEATS.bite1, ease: 'inCubic', pose: { ...PERCH_BITE, ...perchChamber('R') } },
      { t: 0.14, ease: 'outCubic', pose: { ...PERCH_UP } },
      // RIGHT RAKE — the shoulder rolls into it so the whole frame drives the claw
      { t: PERCH_BEATS.rakeR, ease: 'inCubic', pose: { torso: [30, 0, -7], head: [-6, 0, 0], ...perchRake('R') } },
      { t: 0.31, ease: 'outCubic', pose: { ...PERCH_UP, ...perchCarry('R') } },
      { t: PERCH_BEATS.bite2, ease: 'inCubic', pose: { ...PERCH_BITE, ...perchChamber('L') } },
      { t: 0.44, ease: 'outCubic', pose: { ...PERCH_UP } },
      { t: PERCH_BEATS.rakeL, ease: 'inCubic', pose: { torso: [30, 0, 7], head: [-6, 0, 0], ...perchRake('L') } },
      { t: PERCH_BEATS.loop, ease: 'outCubic', pose: { ...PERCH_UP, ...perchCarry('L') } },
    ],
  },
  grabReach: { // COLOSSUS: both hands lunge out low to seize the target
    dur: 0.3, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.14, ease: 'outCubic', pose: { torso: [22, 0, 0], head: [-10, 0, 0], shoulderL: [-78, 12, -6], shoulderR: [-78, -12, 6], elbowL: [-16, 0, 0], elbowR: [-16, 0, 0], hipsPos: [0, -0.22, 0], hipsRot: [8, 0, 0] } },
    ],
  },
  liftHold: { // hoisting the catch overhead — arms drive straight up, back sets
    dur: 0.45, hold: true,
    keys: [
      { t: 0, pose: { torso: [18, 0, 0], shoulderL: [-95, 0, -10], shoulderR: [-95, 0, 10], elbowL: [-20, 0, 0], elbowR: [-20, 0, 0], hipsPos: [0, -0.2, 0] } },
      { t: 0.45, ease: 'outBack', pose: { torso: [-10, 0, 0], head: [-16, 0, 0], shoulderL: [-172, 0, -8], shoulderR: [-172, 0, 8], elbowL: [-6, 0, 0], elbowR: [-6, 0, 0], hipsPos: [0, 0.1, 0], hipsRot: [-4, 0, 0] } },
    ],
  },
  throwHeave: { // the launch: whole frame whips forward, arms hurl down the line
    dur: 0.5,
    keys: [
      { t: 0, pose: { torso: [-10, 0, 0], head: [-16, 0, 0], shoulderL: [-172, 0, -8], shoulderR: [-172, 0, 8], elbowL: [-6, 0, 0], elbowR: [-6, 0, 0], hipsPos: [0, 0.1, 0] } },
      { t: 0.16, ease: 'inCubic', pose: { torso: [34, 0, 0], head: [6, 0, 0], shoulderL: [-58, 0, -10], shoulderR: [-58, 0, 10], elbowL: [-14, 0, 0], elbowR: [-14, 0, 0], hipsPos: [0, -0.3, 0.1], hipsRot: [10, 0, 0] } },
      { t: 0.5, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], hipsPos: [0, 0, 0], hipsRot: [0, 0, 0] } },
    ],
    events: [{ t: 0.1, type: 'sfx', arg: 'whooshBig' }, { t: 0.16, type: 'shake', arg: 0.5 }],
  },
  hangGrab: { // wall grab — punch hand locked onto the building, body hanging, legs braced
    dur: 0.25, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.25, ease: 'outQuad', pose: { shoulderL: [-160, 0, -12], elbowL: [-16, 0, 0], shoulderR: [-42, 0, 24], elbowR: [-68, 0, 0], torso: [10, 0, -6], head: [-16, 0, 0], thighL: [-26, 0, -6], thighR: [-40, 0, 8], kneeL: [42, 0, 0], kneeR: [60, 0, 0], ankleL: [-14, 0, 0], ankleR: [-22, 0, 0], hipsRot: [6, 0, 0] } },
    ],
  },

  // ---------- KONGA: a knuckle-walker fights by REARING UP off his arms ----
  // Every one of his blows starts from four-point stance, so the wind-up is
  // always the same beat: the trunk comes UP off the knuckles (hipsPos rises,
  // torso pitches back) before the arm is free to throw anything. That rear-up
  // IS his tell, and it is why his blows are slow and enormous.
  kongaSlam: { // heavy: rears to full height, both fists overhead, DRIVES down
    dur: 1.02,
    keys: [
      { t: 0, pose: {} },
      // rear up onto the back legs, fists gathering high and back
      { t: 0.30, ease: 'outCubic', pose: { hipsPos: [0, 0.62, -0.2], hipsRot: [-16, 0, 0], torso: [-30, 0, 0], head: [-24, 0, 0], shoulderL: [-158, 10, -26], shoulderR: [-158, -10, 26], elbowL: [-52, 0, 0], elbowR: [-52, 0, 0], thighL: [16, 0, -6], thighR: [16, 0, 6], kneeL: [-14, 0, 0], kneeR: [-14, 0, 0] } },
      // hang at the apex for a beat — the moment the shadow lands on you
      { t: 0.44, ease: 'inOutQuad', pose: { hipsPos: [0, 0.68, -0.22], torso: [-34, 0, 0], head: [-28, 0, 0], shoulderL: [-168, 12, -30], shoulderR: [-168, -12, 30] } },
      // DOWN — the whole mass behind two fists
      { t: 0.60, ease: 'outQuad', pose: { hipsPos: [0, -0.34, 0.26], hipsRot: [22, 0, 0], torso: [46, 0, 0], head: [22, 0, 0], shoulderL: [-16, 0, -14], shoulderR: [-16, 0, 14], elbowL: [-8, 0, 0], elbowR: [-8, 0, 0], thighL: [-24, 0, -8], thighR: [-24, 0, 8], kneeL: [40, 0, 0], kneeR: [40, 0, 0] } },
      // settle back onto the knuckles
      { t: 1.02, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0] } },
    ],
    events: [
      { t: 0.12, type: 'sfx', arg: 'whooshBig' }, { t: 0.44, type: 'sfx', arg: 'charge' },
      { t: 0.60, type: 'hit', arg: 0 }, { t: 0.60, type: 'sfx', arg: 'hitHeavy' }, { t: 0.61, type: 'shake', arg: 0.75 },
    ],
  },
  chestBeat: { // special: rears up and DRUMS the chest — alternating fists
    dur: 1.30, strikeArm: 'R',
    keys: [
      { t: 0, pose: {} },
      { t: 0.26, ease: 'outCubic', pose: { hipsPos: [0, 0.66, -0.22], hipsRot: [-18, 0, 0], torso: [-26, 0, 0], head: [-30, 0, 0], shoulderL: [-96, 20, -34], shoulderR: [-96, -20, 34], elbowL: [-118, 0, 0], elbowR: [-118, 0, 0], thighL: [18, 0, -6], thighR: [18, 0, 6], kneeL: [-16, 0, 0], kneeR: [-16, 0, 0] } },
      // drum: right in, left in, right in — torso jolts on each strike
      { t: 0.42, ease: 'outQuad', pose: { torso: [-18, 10, 0], shoulderR: [-72, -6, 12], elbowR: [-142, 0, 0], shoulderL: [-104, 24, -40], elbowL: [-108, 0, 0] } },
      { t: 0.58, ease: 'outQuad', pose: { torso: [-18, -10, 0], shoulderL: [-72, 6, -12], elbowL: [-142, 0, 0], shoulderR: [-104, -24, 40], elbowR: [-108, 0, 0] } },
      { t: 0.74, ease: 'outQuad', pose: { torso: [-22, 8, 0], shoulderR: [-72, -6, 12], elbowR: [-142, 0, 0], shoulderL: [-104, 24, -40], elbowL: [-108, 0, 0] } },
      // arms FLUNG wide on the last beat — the shout
      { t: 0.92, ease: 'outBack', pose: { torso: [-34, 0, 0], head: [-34, 0, 0], shoulderL: [-58, 30, -76], shoulderR: [-58, -30, 76], elbowL: [-40, 0, 0], elbowR: [-40, 0, 0] } },
      { t: 1.30, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0] } },
    ],
    events: [
      { t: 0.42, type: 'sfx', arg: 'hitHeavy' }, { t: 0.42, type: 'shake', arg: 0.3 },
      { t: 0.58, type: 'sfx', arg: 'hitHeavy' }, { t: 0.58, type: 'shake', arg: 0.3 },
      { t: 0.74, type: 'sfx', arg: 'hitHeavy' }, { t: 0.74, type: 'shake', arg: 0.35 },
      { t: 0.92, type: 'fire' },
    ],
  },
  kongaLob: { // ranged: HUNCHES FORWARD over the knuckles and holds while the
    // racks empty. He used to rear BACK for this, which tipped the pods'
    // mouths at the sky and turned a direct-fire salvo into a lob — the
    // rockets left along a barrel line that was no longer the one he was
    // looking down. Leaning INTO the shot keeps the shoulder mounts level and
    // pointed where the body is pointed (the pods themselves are held flat by
    // SIGNATURES.konga), so what the animation says and what the missiles do
    // are the same thing. The arms still drop and open outward, which is what
    // clears the racks over the top of them.
    dur: 0.86, upper: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, ease: 'outCubic', pose: { torso: [14, 0, 0], head: [-10, 0, 0], shoulderL: [-24, 16, -34], shoulderR: [-24, -16, 34], elbowL: [-64, 0, 0], elbowR: [-64, 0, 0] } },
      { t: 0.46, ease: 'inOutQuad', pose: { torso: [17, 0, 0], head: [-13, 0, 0] } },
      { t: 0.86, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0] } },
    ],
    events: [{ t: 0.24, type: 'fire' }, { t: 0.24, type: 'sfx', arg: 'missile' }],
  },
  kongaPound: { // ULT beat: one fist gathered high and DRIVEN into the road.
    // Upper-body only, deliberately — the ult lets him keep walking while he
    // does it (Fighter._ultMove), so the legs stay on the locomotion layer and
    // he can march the shockwaves onto someone. Short, so the beats can
    // alternate fast enough to read as drumming rather than as repeated slams.
    dur: 0.52, upper: true, strikeArm: 'R',
    keys: [
      { t: 0, pose: {} },
      // gather: this fist up and back over the shoulder, the chest opening
      { t: 0.18, ease: 'outCubic', pose: { hipsRot: [-10, 0, 0], torso: [-18, -12, 0], head: [-14, 0, 0], shoulderR: [-150, -14, 26], elbowR: [-46, 0, 0], shoulderL: [-14, 0, -12], elbowL: [-24, 0, 0] } },
      // DOWN — the whole shoulder behind it, hips punched into the floor
      { t: 0.30, ease: 'outQuad', pose: { hipsPos: [0, -0.22, 0.14], hipsRot: [16, 0, 0], torso: [30, 8, 0], head: [18, 0, 0], shoulderR: [-8, 0, 12], elbowR: [-6, 0, 0], shoulderL: [-6, 0, -14], elbowL: [-20, 0, 0] } },
      // recover onto the knuckles, ready for the other hand
      { t: 0.52, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0] } },
    ],
    events: [
      { t: 0.10, type: 'sfx', arg: 'whooshBig' },
      { t: 0.30, type: 'fire' }, { t: 0.30, type: 'sfx', arg: 'slam' }, { t: 0.31, type: 'shake', arg: 0.45 },
    ],
  },

  // ---------- TRITONE: everything is thrown with the NECK ------------------
  // Six tonnes on four columns cannot pivot, so his blows are head sweeps and
  // horn tosses: the body sets the line, the neck delivers. hipsRot does the
  // aiming, head/torso do the swing.
  tritoneGore: { // light: a short brutal horn jab, head down and drive
    dur: 0.62, strikeArm: 'R',
    keys: [
      { t: 0, pose: {} },
      { t: 0.16, ease: 'outCubic', pose: { hipsRot: [-5, -12, 0], torso: [-8, -14, 0], head: [-12, -16, 0], shoulderR: [8, 0, 14], shoulderL: [-6, 0, -8] } },
      // the jab lands by throwing the NECK, not by dropping the chest onto the
      // front feet — his toes went 1.3 units under the road doing the latter
      { t: 0.28, ease: 'outBack', pose: { hipsPos: [0, -0.03, 0.16], hipsRot: [4, 8, 0], torso: [10, 14, 0], head: [24, 18, 0], shoulderR: [-10, 0, 8], shoulderL: [4, 0, -12] } },
      { t: 0.40, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0.06], hipsRot: [2, 4, 0], torso: [6, 8, 0], head: [12, 8, 0] } },
      { t: 0.62, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10] } },
    ],
    events: [{ t: 0.22, type: 'sfx', arg: 'whoosh' }, { t: 0.28, type: 'hit', arg: 0 }],
  },
  tritoneToss: { // heavy: horns dig LOW then rip up and over — the launcher
    dur: 0.98,
    keys: [
      { t: 0, pose: {} },
      // set the feet and drop the head — the shovel going in
      { t: 0.30, ease: 'outCubic', pose: { hipsPos: [0, -0.24, -0.14], hipsRot: [-16, 0, 0], torso: [-26, 0, 0], head: [-46, 0, 0], thighL: [-18, 0, -6], thighR: [-18, 0, 6], kneeL: [30, 0, 0], kneeR: [30, 0, 0], shoulderL: [14, 0, -10], shoulderR: [14, 0, 10] } },
      { t: 0.42, ease: 'inOutQuad', pose: { head: [-52, 0, 0], torso: [-30, 0, 0] } },
      // RIP UP — the whole front end comes off the ground
      { t: 0.58, ease: 'outBack', pose: { hipsPos: [0, 0.30, 0.24], hipsRot: [26, 0, 0], torso: [40, 0, 0], head: [52, 0, 0], thighL: [8, 0, -6], thighR: [8, 0, 6], kneeL: [-10, 0, 0], kneeR: [-10, 0, 0], shoulderL: [-40, 0, -16], shoulderR: [-40, 0, 16] } },
      { t: 0.74, ease: 'inOutQuad', pose: { hipsPos: [0, 0.08, 0.1], hipsRot: [12, 0, 0], torso: [20, 0, 0], head: [26, 0, 0] } },
      { t: 0.98, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], thighL: [0, 0, 0], thighR: [0, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0] } },
    ],
    events: [
      { t: 0.34, type: 'sfx', arg: 'charge' }, { t: 0.58, type: 'hit', arg: 0 },
      { t: 0.58, type: 'sfx', arg: 'hitHeavy' }, { t: 0.59, type: 'shake', arg: 0.7 },
    ],
  },
  tritoneBrace: { // ranged/ult: plants all four legs and squats into the recoil
    dur: 0.9, hold: true,
    keys: [
      { t: 0, pose: {} },
      // PLANTED, not sat down: the squat that reads as bracing on a biped just
      // drags his tail through the road, so the recoil is taken on stiff legs
      // and a braced neck instead.
      { t: 0.28, ease: 'outCubic', pose: { hipsPos: [0, -0.08, -0.06], hipsRot: [-2, 0, 0], torso: [-5, 0, 0], head: [-6, 0, 0], thighL: [-7, 0, -10], thighR: [-7, 0, 10], kneeL: [13, 0, 0], kneeR: [13, 0, 0], ankleL: [-6, 0, 0], ankleR: [-6, 0, 0], shoulderL: [8, 0, -14], shoulderR: [8, 0, 14], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0] } },
      { t: 0.9, ease: 'inOutQuad', pose: { hipsPos: [0, -0.07, -0.06], head: [-4, 0, 0] } },
    ],
    events: [{ t: 0.3, type: 'sfx', arg: 'charge' }],
  },
};

// mirror a raw clip left<->right: swap L/R joint names, negate the y/z
// rotation components, and flip hipsPos.x — used to author one-sided
// attacks once and fire them from either arm
function mirrorRaw(raw) {
  const swap = (j) => (j.endsWith('L') ? j.slice(0, -1) + 'R' : j.endsWith('R') ? j.slice(0, -1) + 'L' : j);
  return {
    ...raw,
    // a mirrored one-armed blow is thrown with the OTHER arm...
    strikeArm: raw.strikeArm === 'L' ? 'R' : raw.strikeArm === 'R' ? 'L' : raw.strikeArm,
    // ...and a mirrored kick lands on the other foot
    strikeLimb: raw.strikeLimb ? raw.strikeLimb.replace(/([LR])$/, (c) => (c === 'L' ? 'R' : 'L')) : raw.strikeLimb,
    keys: raw.keys.map((k) => {
      const pose = {};
      for (const [j, v] of Object.entries(k.pose)) {
        pose[swap(j)] = j === 'hipsPos' ? [-v[0], v[1], v[2]] : [v[0], -v[1], -v[2]];
      }
      return { ...k, pose };
    }),
  };
}
CLIPS_RAW.braceL = mirrorRaw(CLIPS_RAW.brace); // colossus fires the OTHER cannon
CLIPS_RAW.shootL = mirrorRaw(CLIPS_RAW.shoot); // frogger's other gunk cannon
CLIPS_RAW.shootLoopL = mirrorRaw(CLIPS_RAW.shootLoop); // channel held in the LEFT hand (glacier's cryo beam)
CLIPS_RAW.gatlingLoopL = mirrorRaw(CLIPS_RAW.gatlingLoop); // vulcan's OTHER gatling takes the lead
CLIPS_RAW.fistLaunchL = mirrorRaw(CLIPS_RAW.fistLaunch); // titanus' other rocket fist
CLIPS_RAW.fistCatchL = mirrorRaw(CLIPS_RAW.fistCatch);   // ...and catching it back
CLIPS_RAW.bigPunch2 = mirrorRaw(CLIPS_RAW.bigPunch1); // right haymaker, same wind-up
CLIPS_RAW.punchHold2 = mirrorRaw(CLIPS_RAW.punchHold1); // right-arm charge
CLIPS_RAW.punchRelease2 = mirrorRaw(CLIPS_RAW.punchRelease1);
CLIPS_RAW.jerryRakeL = mirrorRaw(CLIPS_RAW.jerryRakeR); // the other claw's rake
CLIPS_RAW.stomp2 = mirrorRaw(CLIPS_RAW.stomp); // left-foot trample
CLIPS_RAW.rollUpL = mirrorRaw(CLIPS_RAW.rollUpR); // righting roll the other way
// Opposite-arm twins of the shared punch trio, so a light combo can be thrown
// off either lead (see LIGHT_ARM below and Fighter.doLight).
CLIPS_RAW.light1R = mirrorRaw(CLIPS_RAW.light1); // right jab
CLIPS_RAW.light2L = mirrorRaw(CLIPS_RAW.light2); // left cross
CLIPS_RAW.light3L = mirrorRaw(CLIPS_RAW.light3); // left uppercut
// TRITONE gores off alternate horns, so his combo swings the neck both ways.
CLIPS_RAW.tritoneGoreL = mirrorRaw(CLIPS_RAW.tritoneGore);
// KONGA's ult drums the ground with alternating fists — same beat, other hand.
CLIPS_RAW.kongaPoundL = mirrorRaw(CLIPS_RAW.kongaPound);

// ---------- smash mirrors ----------
// The shared overhead smash winds the body onto ONE side (hips/torso yaw)
// and slams back through it. Repeating it beat after beat read as canned,
// so every clip in the smash family gets a mirrored twin and the fighter
// alternates (Fighter.smashClip). The twins are compiled below under the
// ORIGINAL clip's name, so downstream checks keyed on the clip name —
// animator.isPlaying, the def.heavyClip lookups behind heavySpin /
// heavyDrive / heavyFlare, the charge-hold loop — match either side.
export const SMASH_MIRRORS = {
  heavy: 'heavyMirror',         // the shared two-hand overhead smash
  poundHold: 'poundHoldMirror', // TITANUS / COLOSSUS charged pound: the loop...
  poundSlam: 'poundSlamMirror', // ...and the discharge it lands on
};
for (const [base, twin] of Object.entries(SMASH_MIRRORS)) CLIPS_RAW[twin] = mirrorRaw(CLIPS_RAW[base]);

// ---------- compile: degrees -> radians, sparse per-joint tracks ----------
const D2R = Math.PI / 180;

// Exported so the pose workbench can compile an EDITED key list into a clip the
// animator will play (`?debug=pose` previews edits by handing the animator its
// own recompiled copy). Everything else should use CLIPS.
export function compileClip(name, raw) { return compile(name, raw); }

function compile(name, raw) {
  const tracks = {};
  const keys = [...raw.keys].sort((a, b) => a.t - b.t);
  for (const key of keys) {
    for (const [joint, v] of Object.entries(key.pose)) {
      if (!tracks[joint]) tracks[joint] = [];
      const isPos = joint === 'hipsPos';
      tracks[joint].push({
        t: key.t,
        ease: key.ease || 'inOutQuad',
        v: isPos ? [v[0], v[1], v[2]] : [v[0] * D2R, v[1] * D2R, v[2] * D2R],
      });
    }
  }
  return {
    name,
    dur: raw.dur,
    loop: !!raw.loop,
    hold: !!raw.hold,
    upper: !!raw.upper,
    // A FLOURISH, not a commitment: the round-start intro and the taunt own
    // the legs, so a player who starts running the moment control returns
    // slides with no walk cycle under them. Control implies ANIMATION
    // control — fighter.update drops these the instant a real input arrives.
    // Attacks deliberately do NOT carry it; those you are committed to.
    cancelOnMove: !!raw.cancelOnMove,
    strikeArm: raw.strikeArm || null, // 'L'/'R' on a ONE-ARMED blow, else null
    // Which limb the blow is RESOLVED on (combat/hurtbox.js): a part name
    // like 'footR'. Only needed where the auto-detection — "whichever
    // extremity leads furthest forward at the hit frame" — could pick the
    // wrong one, i.e. a kick thrown while an arm is also out front.
    strikeLimb: raw.strikeLimb || null,
    tracks,
    events: raw.events || [],
  };
}

// The ROLLOVER family — anything that has the body over on its back. Code that
// assumes an UPRIGHT mech has to stand down while one of these plays: a
// floor-relative arm clamp, a walk carry, an attack wind-up all read the pose
// as broken otherwise (see the CRANKY profile in glbanim.js).
export const PRONE_CLIPS = new Set(['flipOver', 'proneBack', 'rollUpR', 'rollUpL']);

export const CLIPS = {};
for (const [name, raw] of Object.entries(CLIPS_RAW)) CLIPS[name] = compile(name, raw);
// recompile the smash twins under their base name (see SMASH_MIRRORS)
for (const [base, twin] of Object.entries(SMASH_MIRRORS)) CLIPS[twin] = compile(base, CLIPS_RAW[twin]);

// ---------- per-mech clip variants (roster-def driven) ----------
// One shared `ball` tuck can't fit every silhouette — a crab's claws, a
// wolf's spine and a spring-legged shrimp all curl differently. A roster def
// may carry `ballPose`: a sparse { joint: [x,y,z] degrees } that REPLACES
// those joints' values in the tuck key (the rest of the tuck stays shared),
// compiled once per mech under the same 'ball' name so everything keyed on
// the clip name — the fighter, isPlaying, the workbenches — matches. The
// Animator resolves these between profile clipOverrides and CLIPS (play()),
// and the workbench adapter derives from the same function, so an edited
// ballPose shows up everywhere with no hand-copying.
// ---------- THE FORELIMB CARRY CLAMP (roster `foreCarry`) ----------
//
// SOME ARMS ARE WEAPONS HELD IN FRONT, and the shared clip library does not
// know it. Every shared clip is authored for a humanoid brawler, where an arm
// swung back is a windup, a balance counter, or simply where a hand ends up on
// the way to the floor — and, crucially, where NEUTRAL is `shoulder: 0`, arms
// hanging at the sides. A raptor's neutral is nothing like that: SAURION rests
// at shoulder -52 with the elbow folded to -78, claws up under the chest. So
// every shared clip that returned an arm "to neutral" dropped his claws behind
// him, and every one that threw an arm back for balance pointed his weapons
// at the wrong half of the world.
//
// Measured on saurion (`node tools/scratch/armband.mjs`, hand offset from its
// own shoulder along his facing, fraction of body height):
//
//   shoulder   0  elbow -12  ->  hand -0.11   (the shared neutral: BEHIND him)
//   shoulder +20 elbow -40   ->  hand -0.16   (the intro/getup crouch)
//   shoulder -30 elbow -55   ->  hand +0.17
//   shoulder -52 elbow -78   ->  hand +0.26   (his own rest — the carry)
//   shoulder -165 elbow -30  ->  hand -0.02   (victory's raised arm, thrown
//                                              back over his own head)
//
// The elbow crosses in front of the shoulder at about -20 of pitch and the
// hand goes back again past about -155, which is the band: a def carrying
// `foreCarry: { pitch: [lo, hi], elbow: [lo, hi] }` has EVERY clip's shoulder
// and elbow pitch clamped into it at COMPILE time.
//
// CLAMPED IN THE DATA, not at playback, and that is the whole design. A
// runtime clamp fights the clip silently: the pose workbench shows one thing
// and the body does another, and every measurement taken off the clip is a
// measurement of something that never plays. Clamping the compiled keys means
// what is authored is what plays, the keys still interpolate smoothly between
// each other (a clamped key is a key), and the workbenches, the probes and the
// game all see one clip.
//
// It is a FLOOR, not a pose: a clip whose arms are already in front is
// returned untouched (`byte-identical` — the variant map only carries clips
// that actually moved), so a mech's own authored forms are unaffected and a
// claw CHAMBERED high and outside before a rake — the one time a forelimb
// legitimately travels back — is well inside the band and stays as authored.
const ARM_PITCH = ['shoulderL', 'shoulderR'];
const ARM_ELBOW = ['elbowL', 'elbowR'];
function clampCarry(clip, carry) {
  const pitch = carry.pitch ? carry.pitch.map((d) => d * D2R) : null;
  const elbow = carry.elbow ? carry.elbow.map((d) => d * D2R) : null;
  let hit = false;
  const tracks = {};
  for (const [joint, keys] of Object.entries(clip.tracks)) {
    const band = ARM_PITCH.includes(joint) ? pitch : ARM_ELBOW.includes(joint) ? elbow : null;
    if (!band) { tracks[joint] = keys; continue; }
    tracks[joint] = keys.map((k) => {
      const x = Math.min(Math.max(k.v[0], band[0]), band[1]);
      if (x === k.v[0]) return k;
      hit = true;
      return { ...k, v: [x, k.v[1], k.v[2]] };
    });
  }
  return hit ? { ...clip, tracks } : null;
}

const _defClips = new Map();
export function defClipVariants(def) {
  if (_defClips.has(def.id)) return _defClips.get(def.id);
  let out = null;
  if (def.ballPose) {
    const raw = CLIPS_RAW.ball;
    const tuck = { ...raw.keys[raw.keys.length - 1].pose, ...def.ballPose };
    out = {
      ball: compile('ball', {
        ...raw,
        keys: [...raw.keys.slice(0, -1), { ...raw.keys[raw.keys.length - 1], pose: tuck }],
      }),
    };
  }
  if (def.foreCarry) {
    // every clip, including a variant this def has already reshaped above
    for (const [name, clip] of Object.entries(CLIPS)) {
      const held = clampCarry(out?.[name] || clip, def.foreCarry);
      if (held) (out ||= {})[name] = held;
    }
  }
  _defClips.set(def.id, out);
  return out;
}

// ---------- which arm a light-combo clip throws with ----------
// The authored punch trio is jab-LEFT, cross-RIGHT, uppercut-RIGHT — so the
// right arm threw two blows in a row and the uppercut was always the same
// hand. Fighter.doLight alternates arms across the combo instead and mirrors
// a clip whose authored arm isn't the one the pattern wants; this table is
// what tells it which arm each clip already uses, and what its twin is called.
//
// A clip listed here can be thrown either way. A clip NOT listed is used
// exactly as authored — that's the escape hatch for the bespoke cycles
// (viper's sword forms, saurion's kick/rake mix) whose moves are not
// symmetrical and have no mirrored twin.
//
// Unlike SMASH_MIRRORS above, these twins keep their OWN names rather than
// being compiled under the base one: nothing downstream keys on a light clip's
// name (the smash twins have to answer to `heavy` for def.heavyClip and
// isPlaying), and distinct names make each punch inspectable on its own in
// ?showcase=<id>&anim=light3L.
export const LIGHT_ARM = {
  light1: { arm: 'L', twin: 'light1R' },
  light2: { arm: 'R', twin: 'light2L' },
  light3: { arm: 'R', twin: 'light3L' },
  light1R: { arm: 'R', twin: 'light1' },
  light2L: { arm: 'L', twin: 'light2' },
  light3L: { arm: 'L', twin: 'light3' },
  // The haymaker pair TITANUS / COLOSSUS list as their light cycle. Both are
  // `punchHold` mechs today, so their blows actually come out of the
  // charge-and-release path (punchHold1/2 → punchRelease1/2, which alternates
  // on its own) and never reach doLight — these entries are here so the cycle
  // is described correctly if either ever drops the hold.
  bigPunch1: { arm: 'L', twin: 'bigPunch2' },
  bigPunch2: { arm: 'R', twin: 'bigPunch1' },
  // jerry's claw rakes: the alternation machinery works the same, the finisher
  // (jerryRake2) is two-armed and symmetric so it has no twin and no entry
  jerryRakeR: { arm: 'R', twin: 'jerryRakeL' },
  jerryRakeL: { arm: 'L', twin: 'jerryRakeR' },
};

// ---------- GLB clip variants (glbanim clipOverrides) ----------
// Compiled with the ORIGINAL clip's name so fighter machinery keyed on
// def.heavyClip (heavyFlare / heavyRaise / hold logic) still matches.
//
// wraithLasers for the GLB: the procedural wraith LIFTS OFF and hovers while
// his own cloak fans; the GLB body instead just LEANS INTO the mark a little
// and lets the attached procedural cape (glbanim wraith.build) do the show.
// Same duration and hit/sfx timings — gameplay identical.
// frogger for the GLB: the shared `shoot` throws the RIGHT arm out and up as
// if the gun were in the hand, but this model's gunk cannons are hull mounts
// (the manifest pins muzzleR/muzzleL to cannon BONES, nowhere near the hands),
// so raising an arm just waves an empty fist through the shot line. Same
// duration and the same `fire` event time — only the body sells it now: a
// twist onto the firing side, then a hard recoil kick back through torso and
// hips. Arms are left untouched so the combat carriage holds. shootL is the
// mirror, for the alternating other cannon (fighter.doRanged picks the side).
// JERRY's Bilge Spit fires from the CANNON PODS bolted to his shell (the
// manifest pins muzzleR/L to the strutMid pod bones, and the glbanim hook
// swings the firing pod onto his facing), so the shared `shoot` clip was wrong
// twice over: the raised arm hoisted a giant claw for no reason, and — the
// part that showed downrange — its torso YAW (-18° at t=0) carried the pods
// off the fire line, since they are parented to the torso the clip twists.
// Measured: with the pod swung fully onto the facing, the shared clip still
// left the left barrel 13° across his body and the right 14° wide; with the
// pods solved statically the residual is 0.02°. So the recoil here is
// PITCH-ONLY — the shell nods and the hips dip, nothing yaws — and the claws
// are left entirely to the combat carriage. One clip serves both sides: the
// asymmetry is the pod swing itself, not the body.
const JERRY_SHOOT_GLB = {
  dur: 0.5, upper: true,
  keys: [
    { t: 0, pose: { torso: [2, 0, 0], head: [2, 0, 0] } },
    { t: 0.12, ease: 'outBack', pose: { torso: [-5, 0, 0], head: [-5, 0, 0], hipsPos: [0, -0.07, -0.03], hipsRot: [-2, 0, 0] } },
    { t: 0.3, ease: 'outQuad', pose: { torso: [3, 0, 0], head: [1, 0, 0], hipsPos: [0, -0.02, 0], hipsRot: [0, 0, 0] } },
    { t: 0.5, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsPos: [0, 0, 0] } },
  ],
  events: [{ t: 0.1, type: 'fire' }],
};

const FROGGER_SHOOT_GLB = {
  // THE CANNONS DO THE AIMING, SO THE CLIP MUST NOT — jerry's rule, and frogger
  // needs it for the same reason: his gunk guns are HULL mounts (the manifest
  // pins muzzleR to a head-block bone and muzzleL to a hull bone), and
  // world.js fires each shot down its own barrel's live +Z (barrelDeflect). So
  // every degree the clip YAWS the torso or the head is a degree the shot flies
  // wide, faithfully.
  //
  // It used to yaw the torso -10 and the head +7, mirrored on the off side —
  // which alternated the whole hull left-right-left as he fired and threw the
  // globs 5-7 degrees either side of the target, shot about shot. Measured on
  // the barrels: 0.0 deg of yaw at rest, -4.4 to -7.0 through the clip. It is a
  // PITCH-ONLY recoil now: the body sinks and rocks back over the shot, the
  // barrels stay on the line, and the measured yaw is 0.0 all the way through.
  // AND THE RECOIL COMES AFTER THE SHOT, not under it. The rock-back used to
  // peak right where the `fire` event sits, so the glob left a barrel already
  // pitched 6.5 degrees up — a shot that sails over an enemy's head at a dozen
  // units. The body is held level through the fire frame (measured 0.9 deg, the
  // barrel's own rest angle) and rocks afterwards, which is also the way round
  // a recoil actually reads.
  dur: 0.5, upper: true,
  keys: [
    { t: 0, pose: { torso: [0, 0, 0], head: [0, 0, 0] } },
    { t: 0.08, ease: 'linear', pose: { torso: [0, 0, 0], head: [0, 0, 0] } },
    { t: 0.2, ease: 'outBack', pose: { torso: [-8, 0, 0], head: [-6, 0, 0], hipsPos: [0, -0.09, 0] } },
    { t: 0.36, ease: 'outQuad', pose: { torso: [6, 0, 0], head: [2, 0, 0], hipsPos: [0, -0.02, 0] } },
    { t: 0.5, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsPos: [0, 0, 0] } },
  ],
  events: [{ t: 0.06, type: 'fire' }],
};

// inferno for the GLB: the shared `shootLoop` folds both elbows in tight, and
// this model's flame barrels are FOREARM mounts (the manifest pins muzzleR/L to
// forearm bones), so a folded elbow aims the torches up over his own shoulder —
// the flames sprayed skyward instead of at the target. Straighten both arms out
// along the aim line and keep the loop's breathing motion in the torso/shoulders
// so the barrels stay level and the jets travel forward.
const INFERNO_FLAME_GLB = {
  dur: 0.36, upper: true, loop: true,
  keys: [
    { t: 0, pose: { shoulderR: [-78, 0, 6], elbowR: [8, 0, 0], shoulderL: [-79, 8, -6], elbowL: [8, 18, 0], torso: [2, -8, 0], head: [0, 5, 0] } },
    { t: 0.18, ease: 'inOutQuad', pose: { shoulderR: [-80, 0, 6], elbowR: [10, 0, 0], shoulderL: [-81, 8, -6], elbowL: [10, 18, 0], torso: [0, -6, 0] } },
    { t: 0.36, ease: 'inOutQuad', pose: { shoulderR: [-78, 0, 6], elbowR: [8, 0, 0], shoulderL: [-79, 8, -6], elbowL: [8, 18, 0], torso: [2, -8, 0] } },
  ],
};

// SAURION for the GLB: this model's arms are SHORT next to its long skull and
// deep chest, so the shared raptor forms — authored against the procedural
// body's reach — land well behind the enemy. Measured against a target at the
// light move's own range (3.5), the claw rakes stopped ~1.8 units short: the
// jaws arrived, the claws swiped the air in front of his own chest.
// Both variants below drive the strike THROUGH the target instead of across
// the body: the shoulder opens to nearly straight-out, the elbow extends at
// the impact frame instead of staying folded, and the hips shift forward so
// the whole frame commits to the reach. Chamber and recovery are untouched, so
// the rake still reads as a rake.
const SAURION_CLAW_R_GLB = {
  dur: 0.46,
  keys: [
    { t: 0, pose: {} },
    { t: 0.12, ease: 'outCubic', pose: { torso: [6, -12, 0], head: [-4, 8, 0], hipsRot: [0, -10, 0], hipsPos: [0, -0.08, -0.1], shoulderR: [-76, 26, 24], elbowR: [-78, 0, 0], handR: [-18, 0, -14], shoulderL: [-30, 0, -8], elbowL: [-58, 0, 0] } },
    { t: 0.22, ease: 'outBack', pose: { torso: [-8, 10, 0], head: [10, -12, 0], hipsRot: [0, 12, 0], hipsPos: [0, 0.02, 0.46], shoulderR: [-100, -6, 6], elbowR: [-6, 0, 0], handR: [-4, 0, -6], shoulderL: [-52, 0, -10], elbowL: [-34, 0, 0] } },
    { t: 0.33, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0.16], shoulderR: [-70, -24, 0], elbowR: [-28, 0, 0], handR: [10, 0, -8] } },
    { t: 0.46, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsRot: [0, 0, 0], hipsPos: [0, 0, 0], shoulderR: [-34, 0, 7], elbowR: [-62, 0, 0], handR: [28, 0, -10], shoulderL: [-34, 0, -7], elbowL: [-62, 0, 0] } },
  ],
  events: [{ t: 0.16, type: 'sfx', arg: 'whoosh' }, { t: 0.22, type: 'hit', arg: 1 }],
};
// The sickle kicks already arrived at range, but with the leg still folded —
// the toe-claw got there and the shin didn't. Straighten the knee through the
// snap and drive the hips forward with it, so the kick reads as full-stretch
// and the claw carries past the target instead of stopping on it.
const SAURION_KICK1_GLB = {
  strikeLimb: 'footR',
  dur: 0.5,
  keys: [
    { t: 0, pose: {} },
    { t: 0.12, ease: 'outCubic', pose: { torso: [4, -6, 0], head: [-2, 4, 0], hipsPos: [0, -0.14, -0.1], hipsRot: [0, -8, 0], thighR: [-62, 0, -4], kneeR: [38, 0, 0], ankleR: [-12, 0, 0], shoulderL: [-40, 0, -10], elbowL: [-66, 0, 0], handL: [30, 0, 10], shoulderR: [-26, 0, 10], elbowR: [-56, 0, 0], handR: [26, 0, -10] } },
    { t: 0.22, ease: 'outBack', pose: { torso: [-20, 6, 0], head: [16, -4, 0], hipsPos: [0, 0.04, 0.6], hipsRot: [0, 6, 0], thighR: [-64, 0, -8], kneeR: [-72, 0, 0], ankleR: [64, 0, 0], shoulderL: [-56, 0, -12], elbowL: [-30, 0, 0], shoulderR: [-46, 0, 12], elbowR: [-34, 0, 0] } },
    { t: 0.32, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0.18], thighR: [-48, 0, -6], kneeR: [-46, 0, 0], ankleR: [42, 0, 0] } },
    { t: 0.5, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], thighR: [0, 0, 0], kneeR: [0, 0, 0], ankleR: [0, 0, 0], shoulderL: [-34, 0, -7], elbowL: [-62, 0, 0], handL: [28, 0, 10], shoulderR: [-34, 0, 7], elbowR: [-62, 0, 0], handR: [28, 0, -10] } },
  ],
  events: [{ t: 0.18, type: 'sfx', arg: 'whoosh' }, { t: 0.22, type: 'hit', arg: 0 }],
};
// left eagle kick — written out rather than mirrorRaw'd off kick1 because it
// carries its OWN timing and combo index (dur 0.52, hit arg 1), and mirrorRaw
// copies `events` and key times through verbatim
const SAURION_KICK2_GLB = {
  strikeLimb: 'footL',
  dur: 0.52,
  keys: [
    { t: 0, pose: {} },
    { t: 0.12, ease: 'outCubic', pose: { torso: [4, 6, 0], head: [-2, -4, 0], hipsPos: [0, -0.14, -0.1], hipsRot: [0, 8, 0], thighL: [-52, 0, 4], kneeL: [34, 0, 0], ankleL: [-12, 0, 0], shoulderR: [-40, 0, 10], elbowR: [-66, 0, 0], handR: [30, 0, -10], shoulderL: [-26, 0, -10], elbowL: [-56, 0, 0], handL: [26, 0, 10] } },
    { t: 0.24, ease: 'outBack', pose: { torso: [-20, -6, 0], head: [16, 4, 0], hipsPos: [0, 0.04, 0.4], hipsRot: [0, -6, 0], thighL: [-66, 0, 8], kneeL: [-86, 0, 0], ankleL: [68, 0, 0], shoulderR: [-56, 0, 12], elbowR: [-30, 0, 0], shoulderL: [-46, 0, -12], elbowL: [-34, 0, 0] } },
    { t: 0.34, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0.18], thighL: [-46, 0, 6], kneeL: [-58, 0, 0], ankleL: [46, 0, 0] } },
    { t: 0.52, ease: 'inOutQuad', pose: { torso: [0, 0, 0], head: [0, 0, 0], hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], thighL: [0, 0, 0], kneeL: [0, 0, 0], ankleL: [0, 0, 0], shoulderL: [-34, 0, -7], elbowL: [-62, 0, 0], handL: [28, 0, 10], shoulderR: [-34, 0, 7], elbowR: [-62, 0, 0], handR: [28, 0, -10] } },
  ],
  events: [{ t: 0.2, type: 'sfx', arg: 'whoosh' }, { t: 0.24, type: 'hit', arg: 1 }],
};

// COLOSSUS for the GLB: a THUNDERCLAP in place of the shared overhead pound.
//
// THIS MODEL is the widest shell on the roster (body.scale 1.3 on top of torsoW
// 1.3 / bulk 1.15), and poundSlam's follow-through — both arms driven from
// overhead down past the hips — dragged its forearms straight THROUGH the chest
// and belly slabs. The clap swings in the HORIZONTAL plane instead: the arms
// stretch out wide to either side of that body on the wind-up, then scythe
// forward and slam shut on the centreline in front of the chest. Nothing crosses
// the torso volume at any point.
//
// GLB-ONLY on purpose. It was posed against these proportions, and the
// PROCEDURAL colossus can't reproduce it: its forearms are shorter, so folding
// them in doesn't buy enough closing distance and the fists stop ~2.0 units apart
// (against 0.86 here) — a two-fisted push, not a clap. That build keeps the
// pound, which suits it and never clipped on it. Both are hand-authored in
// ?debug=pose; see MECH_ART_GUIDE §4 for judging them.
//
// Compiled under the POUND's names below, which is what keeps the charge
// machinery working: def.heavyClip/heavyReleaseClip stay 'poundHold'/'poundSlam',
// so updateHeavyHold's isPlaying check, the mirror alternation and
// inTwoFistSmash all match either model. Both mirror names map here too — the
// clap is symmetric about the centreline, so its two "sides" are the same pose,
// and without those entries half of the GLB's heavies would fall through to the
// mirrored POUND.
const COLOSSUS_CLAP_HOLD = { // charged clap wind-up: the span held open and
  // quaking until Y releases.
  // HAND-AUTHORED (owner's pose, squared up L/R — a dragged pose lands a few
  // degrees off symmetry and a clap's wind-up shows that). Upper arms out wide
  // and level at roll 96; past roll 90 the shoulder's pitch channel twists the
  // arm about its own axis rather than lifting it, so pitch -58 is what swings
  // the ELBOWS forward, and elbow -58 folds the forearms in ahead of the chest.
  // Reads as a bear-hug cocked to snap shut, and the fists start the swing
  // already on the plane they end it on.
  dur: 0.8, loop: true,
  keys: [
    { t: 0, pose: { hipsPos: [0, -0.261, -0.05], hipsRot: [-6, 0, 0], torso: [-16, 0, 0], shoulderL: [-58, -16, -96], shoulderR: [-58, 16, 96], elbowL: [-58, 0, 0], elbowR: [-58, 0, 0], kneeL: [20, 0, 0], kneeR: [20, 0, 0], thighL: [-10, 0, 0], thighR: [-10, 0, 0] } },
    { t: 0.4, ease: 'inOutQuad', pose: { hipsPos: [0, -0.3, -0.06], torso: [-18, 0, 0], shoulderL: [-61, -19, -100], shoulderR: [-61, 19, 100], elbowL: [-54, 0, 0], elbowR: [-54, 0, 0] } },
    { t: 0.8, ease: 'inOutQuad', pose: { hipsPos: [0, -0.261, -0.05], torso: [-16, 0, 0], shoulderL: [-58, -16, -96], shoulderR: [-58, 16, 96], elbowL: [-58, 0, 0], elbowR: [-58, 0, 0] } },
  ],
};
const COLOSSUS_CLAP = { // the banked clap discharges. Same 0.7s / hit-at-0.18
  // shape as poundSlam, so the charged heavy plays identically either way.
  dur: 0.7,
  keys: [
    // t=0 IS the hold's base pose — the release takes the handover at fade 0, so
    // any drift here reads as a hitch mid-charge. Keep them equal.
    { t: 0, pose: { hipsPos: [0, -0.261, -0.05], hipsRot: [-6, 0, 0], torso: [-16, 0, 0], shoulderL: [-58, -16, -96], shoulderR: [-58, 16, 96], elbowL: [-58, 0, 0], elbowR: [-58, 0, 0], kneeL: [20, 0, 0], kneeR: [20, 0, 0], thighL: [-10, 0, 0], thighR: [-10, 0, 0] } },
    // Impact, HAND-AUTHORED (owner's keys, squared L/R). The fists shut on the
    // centreline by FOLDING THE FOREARMS IN — elbow yaw ~40deg — instead of
    // rolling the whole arm across the chest at roll 58 like the first pass did.
    // The upper arms stay out where the shoulders can reach and the closing
    // distance is bought at the elbow, so the span reads wider at the moment of
    // impact and the shoulders never wrench inward.
    { t: 0.18, ease: 'inCubic', pose: { hipsPos: [0, -0.44, 0.12], hipsRot: [8, 0, 0], torso: [22, 0, 0], head: [8, 0, 0], shoulderL: [-65, 3.1, 33.3], shoulderR: [-65, -3.1, -33.3], elbowL: [-26, 39.4, 0], elbowR: [-26, -39.4, 0], kneeL: [40, 0, 0], kneeR: [40, 0, 0], thighL: [-20, 0, 0], thighR: [-20, 0, 0], ankleL: [-16, 0, 0], ankleR: [-16, 0, 0] } },
    // The clap JAMS: the fists stay locked together and the whole span settles as
    // the frame rides the blow out. The arms drop further than the first pass let
    // them (shoulder pitch -39 against -76) and the forearms stay folded, so from
    // the front the fists sit low over the belly — but they are well FORWARD of
    // it, nothing intersects (checked from the side in ?showcase).
    { t: 0.36, ease: 'outQuad', pose: { hipsPos: [0, -0.34, 0.06], torso: [17, 0, 0], shoulderL: [-39, 2.2, 39.4], shoulderR: [-39, -2.2, -39.4], elbowL: [-8.5, 48.9, -22.2], elbowR: [-8.5, -48.9, 22.2] } },
    // recovery UNROLLS before it drops. Falling straight from the clapped pose to
    // rest swept both fists down across the belly plates — the very clipping this
    // clip exists to avoid. Open back to shoulder width first, then let the arms
    // fall outside the hips.
    { t: 0.5, ease: 'inOutQuad', pose: { hipsPos: [0, -0.2, 0.02], torso: [10, 0, 0], head: [4, 0, 0], shoulderL: [-46, 0, -4], shoulderR: [-46, 0, 4], elbowL: [-18, 0, 0], elbowR: [-18, 0, 0] } },
    { t: 0.7, ease: 'inOutQuad', pose: REST_FULL },
  ],
  events: [{ t: 0.1, type: 'sfx', arg: 'whooshBig' }, { t: 0.18, type: 'hit', arg: 0 }, { t: 0.2, type: 'shake', arg: 0.5 }],
};

// ===========================================================================
// TRITONE — the shared clips, re-authored for a ceratopsian.
//
// Every one of these exists for the same reason, and it is worth stating once
// rather than six times. The shared clips were authored against a HUMANOID: a
// body with a metre of leg to spend on a crouch, and a head that is a small
// ball on top of it, so "drop the hips 0.7 and pitch the torso 50 degrees
// forward" moves the skull through empty air. TRITONE has neither. He is a
// long, low bridge on four columns — his whole chassis spans a fifth of its
// own length in height — with a metre of armoured skull, three horns and a
// jaw hanging off the front, already close to the ground when he is simply
// standing. Measured with tools/groundprobe.mjs, the shared numbers put his
// jaw 1.2 units under the road on the charge, his brow 1.2 under on the plunge
// landing, and his chin 1.7 under in the air tuck.
//
// So they are re-authored around what the animal actually does:
//
//   THE LEGS BARELY BEND. A columnar quadruped absorbs and loads through the
//     shoulder and the neck, not by squatting: hip travel here is a tenth of
//     the humanoid's, and every crouch that was worth 0.5-1.0 is worth 0.10.
//   THE POWER IS IN THE NECK. Where a biped winds up by arching back and
//     swinging its arms overhead, he REARS — the front end lifts, the skull
//     goes up and back — and then drives the horns down and forward. The
//     wind-up is the head going UP, which is also what keeps it out of the
//     floor.
//   NOSE-DOWN IS EXPENSIVE, so it is spent deliberately and briefly. The head
//     may pitch down hard at the moment of a strike and nowhere else; the
//     recovery takes it straight back above the shoulder line.
//   THE FRONT LIFTS INSTEAD OF THE BACK DROPPING. Anywhere the humanoid clip
//     said "hipsPos down", the ceratopsian says "hipsRot nose-up" — the same
//     read of effort, from a body that cannot squat.
// ===========================================================================

// GORE CHARGE loop (replaces chargeLean): head low and LEVEL, horns out front,
// shoulders driving. The sway is in the shoulders and the neck, not the hips —
// a body this long does not roll, it swings its head.
const TRITONE_CHARGE = {
  dur: 0.5, loop: true,
  keys: [
    { t: 0, pose: { hipsPos: [0, -0.08, 0], hipsRot: [3, 0, 0], torso: [8, 3, -3], head: [-10, -4, 0], shoulderL: [16, 0, -12], shoulderR: [16, 0, 12], elbowL: [-14, 0, 0], elbowR: [-14, 0, 0], thighL: [-6, 0, -4], thighR: [-6, 0, 4], kneeL: [10, 0, 0], kneeR: [10, 0, 0] } },
    { t: 0.25, ease: 'inOutQuad', pose: { hipsPos: [0, -0.11, 0], torso: [10, -3, 3], head: [-12, 4, 0], shoulderL: [12, 0, -14], shoulderR: [20, 0, 10] } },
    { t: 0.5, ease: 'inOutQuad', pose: { hipsPos: [0, -0.08, 0], torso: [8, 3, -3], head: [-10, -4, 0], shoulderL: [16, 0, -12], shoulderR: [16, 0, 12] } },
  ],
};

// THE SLAM (replaces the shared overhead smash AND the plunge landing): he
// rears, then drives the whole skull down. The wind-up is a rear — front end
// up, chin up, weight back over the hips — and the strike is a neck-driven
// drop that stops with the horns at the deck rather than through it.
const TRITONE_SLAM = {
  dur: 0.98,
  keys: [
    { t: 0, pose: {} },
    // REAR: front end climbs, head goes up and back, hind legs take the load
    // A REAR LIFTS THE FRONT END, not the whole animal. Raising the hips while
    // BENDING the hind knees takes his back feet off the floor with him —
    // measured as the body hovering a unit clear for the whole plunge. The
    // hind legs straighten instead and stay planted; what climbs is the chest,
    // on the front legs coming up.
    { t: 0.34, ease: 'inOutCubic', pose: { hipsPos: [0, 0.04, -0.06], hipsRot: [-10, 0, 0], torso: [-16, 0, 0], head: [26, 0, 0], shoulderL: [-54, 0, -16], shoulderR: [-54, 0, 16], elbowL: [-30, 0, 0], elbowR: [-30, 0, 0], thighL: [-4, 0, -4], thighR: [-4, 0, 4], kneeL: [4, 0, 0], kneeR: [4, 0, 0], ankleL: [-4, 0, 0], ankleR: [-4, 0, 0] } },
    // DRIVE: the whole front end comes down on the horns
    { t: 0.52, ease: 'inCubic', pose: { hipsPos: [0, -0.04, 0.12], hipsRot: [9, 0, 0], torso: [12, 0, 0], head: [-14, 0, 0], shoulderL: [18, 0, -8], shoulderR: [18, 0, 8], elbowL: [-6, 0, 0], elbowR: [-6, 0, 0], thighL: [-8, 0, -4], thighR: [-8, 0, 4], kneeL: [12, 0, 0], kneeR: [12, 0, 0], ankleL: [-6, 0, 0], ankleR: [-6, 0, 0] } },
    { t: 0.7, ease: 'outQuad', pose: { hipsPos: [0, -0.03, 0.08], hipsRot: [6, 0, 0], torso: [9, 0, 0], head: [-8, 0, 0] } },
    { t: 0.98, ease: 'inOutQuad', pose: REST_FULL },
  ],
  events: [{ t: 0.46, type: 'sfx', arg: 'whooshBig' }, { t: 0.52, type: 'hit', arg: 0 }, { t: 0.54, type: 'shake', arg: 0.5 }],
};

// LANDING, on four columns. A quadruped spreads a landing across all four
// legs and keeps its head UP through it — nothing about the impact should
// send the skull toward the ground it just hit.
const TRITONE_LAND_STRETCH = { hipsPos: [0, 0.08, 0], hipsRot: [-4, 0, 0], torso: [-4, 0, 0], head: [8, 0, 0], thighL: [-8, 0, -3], thighR: [-8, 0, 3], kneeL: [10, 0, 0], kneeR: [10, 0, 0], ankleL: [-14, 0, 0], ankleR: [-14, 0, 0], shoulderL: [-16, 0, -14], shoulderR: [-16, 0, 14], elbowL: [-10, 0, 0], elbowR: [-10, 0, 0] };
const TRITONE_LAND = {
  dur: 0.62,
  keys: [
    { t: 0, pose: TRITONE_LAND_STRETCH },
    { t: 0.1, ease: 'outCubic', pose: { hipsPos: [0, -0.12, 0.02], hipsRot: [2, 0, 0], torso: [7, 0, 0], head: [4, 0, 0], thighL: [-16, 0, -4], thighR: [-16, 0, 4], kneeL: [30, 0, 0], kneeR: [30, 0, 0], ankleL: [-16, 0, 0], ankleR: [-16, 0, 0], shoulderL: [14, 0, -12], shoulderR: [14, 0, 12], elbowL: [-16, 0, 0], elbowR: [-16, 0, 0] } },
    { t: 0.22, ease: 'outQuad', pose: { hipsPos: [0, -0.07, 0.02], torso: [4, 0, 0], head: [2, 0, 0], thighL: [-10, 0, -4], thighR: [-10, 0, 4], kneeL: [20, 0, 0], kneeR: [20, 0, 0], ankleL: [-10, 0, 0], ankleR: [-10, 0, 0] } },
    { t: 0.62, ease: 'inOutQuad', pose: REST_FULL },
  ],
  events: [{ t: 0.02, type: 'sfx', arg: 'land' }],
};
const TRITONE_LAND_REACH = {
  dur: 0.2, hold: true,
  keys: [{ t: 0, pose: {} }, { t: 0.2, ease: 'outQuad', pose: TRITONE_LAND_STRETCH }],
};

// TAUNT: he has no arm to wave. TRITONE — he REARS. An elephant, not a horse: up onto the hind legs, held
// there at the top for a beat while the whole front of him hangs in the air,
// then dropped so the forefeet SMASH back into the pavement.
//
// HIS FACE DOES NOT MOVE. No head, no frill, no jaw in any key — the skull is a
// third of his silhouette and swinging it about turned the rear into a shake.
// He is additive over restPose, so leaving those joints unnamed leaves them
// exactly in his carriage and lets the body carry them up and down.
//
// HIS BACK LEGS STAY ON THE GROUND, AND STRAIGHT, and that is what the thigh
// keys are for. A thigh is a CHILD of the hips: pitch the hips back 48 degrees
// to rear him and the hind legs are carried back 48 degrees with them, so the
// feet leave the pavement and swing out behind him like a deckchair. Every key
// below gives the thighs back EXACTLY the hips' own pitch (`+48` against
// `hipsRot -48`), which leaves the hind legs standing where they stood while
// the body rotates about them, with the knees and ankles at rest because a
// straight leg is a leg with nothing added to it. The hips barely rise: a rear
// gets its height from the body PITCHING about the hip joint, not from the hip
// joint going up — his head climbs about 4 units on the pitch alone.
//
// AND THE TAIL GETS OUT OF THE WAY BY ITSELF. It is nine units long and hangs
// off the same hips, so the same rotation drove it several units under the
// pavement, where the floor guard (combat/floorguard.js) obediently servoed the
// whole animal up into the air — the "propped up on his own tail" read. It is
// not fixed here, because a keyed angle would be wrong the moment the timing
// changed: `tailFloor` in his rig turns on animator.js' tailFloorGuard, which
// re-aims any tail segment that would point below the FEET.
const TRITONE_TAUNT = {
  dur: 2.4, cancelOnMove: true,
  keys: [
    { t: 0, pose: {} },
    // gather — weight back onto the hinds before anything leaves the ground
    { t: 0.22, ease: 'outQuad', pose: { hipsPos: [0, -0.18, -0.2], hipsRot: [6, 0, 0],
      thighL: [16, 0, 0], thighR: [16, 0, 0], kneeL: [12, 0, 0], kneeR: [12, 0, 0],
      shoulderL: [16, 0, -4], shoulderR: [16, 0, 4], elbowL: [-14, 0, 0], elbowR: [-14, 0, 0] } },
    // UP. The pitch is the whole rear; the thighs give it straight back so the
    // hind feet stay planted underneath him.
    { t: 0.62, ease: 'outCubic', pose: { hipsPos: [0, 0.02, 0.04], hipsRot: [-42, 0, 0],
      thighL: [42, 0, 0], thighR: [42, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0],
      ankleL: [0, 0, 0], ankleR: [0, 0, 0],
      shoulderL: [-58, 0, -12], shoulderR: [-58, 0, 12], elbowL: [-64, 0, 0], elbowR: [-64, 0, 0] } },
    // …higher still, and HELD: the pause at the top is the whole gesture
    { t: 0.92, ease: 'outQuad', pose: { hipsPos: [0, 0.03, 0.05], hipsRot: [-56, 0, 0],
      thighL: [56, 0, 0], thighR: [56, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0],
      ankleL: [0, 0, 0], ankleR: [0, 0, 0],
      shoulderL: [-70, 0, -16], shoulderR: [-70, 0, 16], elbowL: [-52, 0, 0], elbowR: [-52, 0, 0] } },
    { t: 1.42, ease: 'linear', pose: { hipsPos: [0, 0.03, 0.05], hipsRot: [-55, 0, 0],
      thighL: [55, 0, 0], thighR: [55, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0],
      ankleL: [0, 0, 0], ankleR: [0, 0, 0],
      shoulderL: [-68, 0, -16], shoulderR: [-68, 0, 16], elbowL: [-54, 0, 0], elbowR: [-54, 0, 0] } },
    // and DOWN, hard
    { t: 1.62, ease: 'inQuad', pose: { hipsPos: [0, -0.3, -0.1], hipsRot: [10, 0, 0],
      thighL: [-10, 0, 0], thighR: [-10, 0, 0], kneeL: [14, 0, 0], kneeR: [14, 0, 0],
      ankleL: [-6, 0, 0], ankleR: [-6, 0, 0],
      shoulderL: [10, 0, -2], shoulderR: [10, 0, 2], elbowL: [-6, 0, 0], elbowR: [-6, 0, 0] } },
    { t: 1.82, ease: 'outQuad', pose: { hipsPos: [0, 0.06, 0], hipsRot: [-3, 0, 0],
      thighL: [3, 0, 0], thighR: [3, 0, 0], kneeL: [4, 0, 0], kneeR: [4, 0, 0] } },
    { t: 2.4, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0],
      thighL: [0, 0, 0], thighR: [0, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0],
      ankleL: [0, 0, 0], ankleR: [0, 0, 0],
      shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0] } },
  ],
  events: [{ t: 0.62, type: 'sfx', arg: 'taunt' },
    { t: 1.62, type: 'sfx', arg: 'slam' }, { t: 1.63, type: 'shake', arg: 0.55 }],
};

// ---------- PER-MECH TAUNTS ----------
// The shared `taunt` is a beckoning arm — right for a humanoid brawler and
// meaningless on a crab, a wolf or a hologram. Each of these is compiled under
// the name `taunt` (so every check keyed on the clip name still matches) and
// hung off that mech's glbanim profile `clipOverrides`; the procedural build of
// the same mech keeps the shared one.
//
// TWO THINGS TO REMEMBER WHEN EDITING THESE. Clip values on the LEGS, TORSO and
// HEAD are ADDITIVE over the mech's restPose (Animator.restBias) while the arms
// are ABSOLUTE — so `torso: [-30, 0, 0]` on saurion means "thirty degrees back
// from the hunch he stands in", not "thirty degrees back from vertical". And
// `hipsPos` is in the model's own scale units, so the same number is a bigger
// hop on a bigger body, which is what you want.
//
// All of them carry `cancelOnMove` (compile() reads it): a taunt is a flourish,
// and the instant a real input arrives the body is the player's again.

// KONGA — the silverback. Chest OUT (torso back, not forward, which is the
// whole read), then the fists come up and beat it, alternating, finishing on a
// two-handed double beat. The arms stay wide of the chest plate at the strike
// — a gorilla's forearms cross in front of the sternum, and driving these ones
// to the centreline pushes them through it.
const KONGA_TAUNT = {
  dur: 1.9, cancelOnMove: true,
  keys: [
    { t: 0, pose: {} },
    // THE FIST HAS TO ARRIVE AT THE CHEST, and on this ape that is a matter of
    // shoulder YAW, not pitch. His arms are the longest on the roster (roster
    // armLen 1.64), so the pitch-and-roll a biped beats its chest with swings
    // these hands clean over his own head — the first pass had him drumming the
    // sky. Measured on the model (chest bone at y=4.62 of an 8.68 body): the
    // BEAT pose lands the fist at 4.66, a third of a body width inboard, and
    // the COCK pose drops it to 3.69 and twice as far out, so each strike is a
    // real travel of about a metre in and up.
    { t: 0.24, ease: 'outBack', pose: { torso: [-17, 0, 0], head: [-8, 0, 0], hipsPos: [0, 0.07, 0],
      shoulderL: [-30, -30, -22], shoulderR: [-30, 30, 22], elbowL: [-95, 0, 0], elbowR: [-95, 0, 0] } },
    // …AND THE FOREARM ROLLS ACROSS, which is the half a fold cannot say. A
    // beat authored as elbow PITCH alone drives the fist up the centre line and
    // the knuckles arrive edge-on; the owner's pass (pose workbench, 2026-08-02)
    // puts real yaw/roll into each elbow so the fist turns over and lands FLAT
    // on the pec, and gives the off arm its own cocked angle instead of the
    // mirrored pitch it used to hold.
    { t: 0.42, ease: 'inQuad', pose: { shoulderL: [-7.1, 28.96, -18.96], elbowL: [-17.07, -49.94, 78.25], elbowR: [-129.49, 37.89, 56.17] } },  // L beat
    { t: 0.58, ease: 'outQuad', pose: { shoulderL: [-30, -30, -22], elbowL: [-95, 0, 0], shoulderR: [-14, -40, 4], elbowR: [32.82, 30.12, -121.64] } },
    { t: 0.74, ease: 'inQuad', pose: { shoulderL: [16, 29.78, -10.5], elbowL: [-47.58, -43.19, 53.1], shoulderR: [-30, 30, 22], elbowR: [-95, 0, 0] } },
    { t: 0.90, ease: 'outQuad', pose: { shoulderL: [-30, -30, -22], elbowL: [-95, 0, 0], shoulderR: [-14, -40, 4], elbowR: [42.11, 15.89, -121.64] } },
    // both fists together, the punctuation
    { t: 1.08, ease: 'inQuad', pose: { torso: [-21, 0, 0], head: [-12, 0, 0], hipsPos: [0, 0.10, 0],
      shoulderL: [-16, 42, -4], shoulderR: [-16, -42, 4],
      elbowL: [-1.79, -37.32, 88.94], elbowR: [-103.32, 41.94, 46.32] } },
    // the release OPENS rather than flings: the wide cock pose held here read
    // as a wing on the way back to rest. The owner's second pass (pose
    // workbench, 2026-08-03) turned the punctuation over too — the double beat
    // lands the LEFT forearm rolled across the chest instead of folded under
    // it, and the right arm comes out of the release unfolded and open rather
    // than still cocked at -104.
    { t: 1.34, ease: 'outQuad', pose: { torso: [-14, 0, 0], shoulderL: [-20, -20, -12], shoulderR: [-20, 20, 12], elbowL: [-104, 0, 0], elbowR: [-11.97, -2.94, -41.07] } },
    { t: 1.9, ease: 'inOutQuad', pose: REST_FULL },
  ],
  events: [{ t: 0.42, type: 'sfx', arg: 'taunt' }, { t: 0.74, type: 'sfx', arg: 'hit' },
    { t: 1.08, type: 'sfx', arg: 'hitHeavy' }, { t: 1.10, type: 'shake', arg: 0.2 }],
};

// CRANKY — claws up, and a little side-to-side hop. The lateral travel is
// `hipsPos` rather than a leg pass: four of his six legs are the hex gait's and
// two are the game's, and a dance that keyed either would be arguing with the
// gait about where a foot goes. The shell leans INTO each hop (hipsRot roll —
// his profile damps torso yaw/roll during a non-looping clip to keep a crab
// from boxing, and roll on the HIPS is the one that survives it).
const CRANKY_TAUNT = {
  // CRANKY — claws up, and a little side-to-side hop.
  //
  // THE HOP IS `hipsPos`, not a leg pass: four of his six legs belong to the hex
  // gait and two carry the game's leg joints, so a dance keyed on either would
  // be arguing with the gait about where a foot goes. The shell leans INTO each
  // hop on hipsRot ROLL — his profile damps torso yaw and roll through a
  // non-looping clip to stop a crab boxing, and roll on the HIPS is the one that
  // survives it.
  //
  // THE CLAW WORK IS THE OWNER'S, posed by hand in the pose workbench: the
  // elbows wind further out and further open on every beat (-69 at the top,
  // -95 by the third hop, -109 on the far claw) instead of being thrown up once
  // and held, and the thighs take a few degrees of their own so the two game
  // legs are not rigid under a moving shell. It ends with the claws still UP
  // rather than dropped to rest — the fade-out carries them down, which reads
  // as him finishing the dance rather than switching it off.
  dur: 2.1, cancelOnMove: true,
  keys: [
    { t: 0, pose: { elbowL: [-69.45, -13.45, -7.81], elbowR: [-72.76, 10.75, 13.58], thighL: [-1.15, 0.99, -9.39], thighR: [0.37, 1.28, -13.81] } },
    { t: 0.26, ease: 'outBack', pose: { hipsPos: [0, 0.14, 0], hipsRot: [-1, -0.58, -9.28], shoulderL: [-52, 0, -46], elbowL: [-54, 0, 0], shoulderR: [-52, 0, 46], elbowR: [-54, 0, 0], thighL: [2.46, -1.49, 16.68], thighR: [-0.2, -0.54, 5.14] } },
    { t: 0.46, ease: 'outQuad', pose: { hipsPos: [-0.26, 0.34, 0], hipsRot: [0, 0, 8], thighL: [-1.29, 1.27, -6.16], thighR: [-0.25, 1.73, -11.71] } },
    { t: 0.64, ease: 'inQuad', pose: { hipsPos: [-0.3, 0.02, 0], hipsRot: [0, 0, 5], thighR: [-0.26, 1.01, -4.49] } },
    { t: 0.84, ease: 'outQuad', pose: { hipsPos: [0.26, 0.34, 0], hipsRot: [0, 0, -8], thighL: [1.23, -1.36, 16.44], thighR: [-0.83, -0.61, 8.56] } },
    { t: 1.02, ease: 'inQuad', pose: { hipsPos: [0.3, 0.02, 0], hipsRot: [0, 0, -5], elbowL: [-71.08, -27.83, -15.59], elbowR: [-57.74, 31.59, 3.25], thighL: [0.28, -0.77, 8.05] } },
    { t: 1.22, ease: 'outQuad', pose: { hipsPos: [-0.26, 0.34, 0], hipsRot: [0, 0, 8], thighL: [-0.74, 1.49, -9.53], thighR: [0.65, 1.35, -7.8] } },
    { t: 1.4, ease: 'inQuad', pose: { hipsPos: [-0.3, 0.02, 0], hipsRot: [0, 0, 5], elbowL: [-95.66, -38.78, -25.95], elbowR: [-78.55, 49.12, 8.6] } },
    { t: 1.6, ease: 'outQuad', pose: { hipsPos: [0.26, 0.34, 0], hipsRot: [0, 0, -8], elbowR: [-109.29, 69.46, 11.98], thighL: [2.51, -3.28, 12.02], thighR: [0.47, -2.1, 7.21] } },
    { t: 1.78, ease: 'inQuad', pose: { hipsPos: [0.3, 0.02, 0], hipsRot: [0, 0, -5], elbowL: [-81.1, -46.86, -10.53], shoulderR: [-58.78, -14.31, 17.56], thighR: [0.41, -2.42, 9.39] } },
    { t: 2.1, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [-82.63, 10.9, -44.15], elbowL: [-12, 0, 0], shoulderR: [-92.41, 38.12, -21.79], elbowR: [-12, 0, 0], thighL: [0, 0, 0], kneeL: [0, 0, 0], ankleL: [0, 0, 0], thighR: [0, 0, 0], kneeR: [0, 0, 0], ankleR: [0, 0, 0] } },
  ],
  // the claws snap open on the way up, then a beat per landing
  events: [{ t: 0.26, type: 'sfx', arg: 'taunt' }, { t: 0.64, type: 'sfx', arg: 'block' },
    { t: 1.02, type: 'sfx', arg: 'block' }, { t: 1.40, type: 'sfx', arg: 'block' },
    { t: 1.78, type: 'sfx', arg: 'block' }],
};

// FENRIR — muzzle to the sky and HOWL. Head and torso are additive over the
// digitigrade rest, so these are degrees off his own carriage. The TAIL is not
// keyed here: it is gait data (applyTailGait) and a clip track would replace
// its droop and its measured straightening along with the wag. The whip is a
// post-pass on the fenrir profile instead, ADDED to whatever the gait left.
const FENRIR_TAUNT = {
  dur: 2.0, cancelOnMove: true,
  keys: [
    { t: 0, pose: {} },
    { t: 0.32, ease: 'outCubic', pose: { torso: [-26, 0, 0], head: [-72, 0, 0], hipsPos: [0, 0.08, 0] } },
    { t: 0.6, ease: 'inOutQuad', pose: { head: [-84, 0, 0], torso: [-30, 0, 0] } },
    { t: 1.35, ease: 'inOutQuad', pose: { head: [-80, 0, 0], torso: [-30, 0, 0] } },
    { t: 1.65, ease: 'inOutQuad', pose: { head: [-34, 0, 0], torso: [-12, 0, 0] } },
    { t: 2.0, ease: 'inOutQuad', pose: REST_FULL },
  ],
  events: [{ t: 0.42, type: 'sfx', arg: 'taunt' }],
};

// FROGGER — arms and cannons thrown out into an X, then a deep bounce: all the
// way down onto folded knees and all the way back up onto straight ones. The
// legs are additive over a restPose that already stands him in a 55° crouch,
// so the DOWN keys add fold and the UP keys subtract it.
const FROGGER_TAUNT = {
  // FROGGER — arms and cannons thrown out into an X, then a deep bounce between
  // a full crouch and full height.
  //
  // THE CROUCH IS A REAL ONE. The first pass folded the knees about 40 percent
  // of the way and read as a bob rather than a squat, which on a FROG is the
  // whole gag. These are the duck layer's own numbers (animator.js: thigh 60
  // degrees forward of vertical, knee folded 115, ankle levelling the foot at
  // -54) — additive over a restPose that already stands him in a 55-degree
  // crouch, so the DOWN key is the deepest squat this body has. The hip drop is
  // the one the duck layer DERIVES from that fold rather than a guess: 1.60
  // world units on this rig, less the 0.21 the measurement says this pose does not
  // need (1.24 authored — clip hipsPos is scaled by the model, animator.js).
  // That is what keeps the soles ON the floor rather than through it:
  // `node tools/groundprobe.mjs frogger` reads 0.000 under for this clip.
  dur: 2.0, cancelOnMove: true,
  keys: [
    { t: 0, pose: {} },
    { t: 0.24, ease: 'outBack', pose: { shoulderL: [-8, 0, -84], shoulderR: [-8, 0, 84],
      elbowL: [-6, 0, 0], elbowR: [-6, 0, 0], hipsPos: [0, 0.34, 0], thighL: [24, 0, 0], thighR: [24, 0, 0], kneeL: [-40, 0, 0], kneeR: [-40, 0, 0], ankleL: [16, 0, 0], ankleR: [16, 0, 0], torso: [-6, 0, 0], head: [-6, 0, 0] } },
    { t: 0.50, ease: 'inQuad', pose: { hipsPos: [0, -1.24, 0], thighL: [-60, 0, -8], thighR: [-60, 0, 8], kneeL: [115, 0, 0], kneeR: [115, 0, 0], ankleL: [-54, 0, 0], ankleR: [-54, 0, 0], torso: [30, 0, 0], head: [-22, 0, 0], shoulderL: [4, 0, -78], shoulderR: [4, 0, 78] } },
    { t: 0.78, ease: 'outQuad', pose: { hipsPos: [0, 0.34, 0], thighL: [24, 0, 0], thighR: [24, 0, 0], kneeL: [-40, 0, 0], kneeR: [-40, 0, 0], ankleL: [16, 0, 0], ankleR: [16, 0, 0], torso: [-6, 0, 0], head: [-6, 0, 0], shoulderL: [-14, 0, -88], shoulderR: [-14, 0, 88] } },
    { t: 1.06, ease: 'inQuad', pose: { hipsPos: [0, -1.24, 0], thighL: [-60, 0, -8], thighR: [-60, 0, 8], kneeL: [115, 0, 0], kneeR: [115, 0, 0], ankleL: [-54, 0, 0], ankleR: [-54, 0, 0], torso: [30, 0, 0], head: [-22, 0, 0], shoulderL: [4, 0, -78], shoulderR: [4, 0, 78] } },
    { t: 1.34, ease: 'outQuad', pose: { hipsPos: [0, 0.34, 0], thighL: [24, 0, 0], thighR: [24, 0, 0], kneeL: [-40, 0, 0], kneeR: [-40, 0, 0], ankleL: [16, 0, 0], ankleR: [16, 0, 0], torso: [-6, 0, 0], head: [-6, 0, 0], shoulderL: [-14, 0, -88], shoulderR: [-14, 0, 88] } },
    { t: 1.62, ease: 'inQuad', pose: { hipsPos: [0, -1.24, 0], thighL: [-60, 0, -8], thighR: [-60, 0, 8], kneeL: [115, 0, 0], kneeR: [115, 0, 0], ankleL: [-54, 0, 0], ankleR: [-54, 0, 0], torso: [30, 0, 0], head: [-22, 0, 0], shoulderL: [0, 0, -70], shoulderR: [0, 0, 70] } },
    { t: 2.0, ease: 'inOutQuad', pose: REST_FULL },
  ],
  events: [{ t: 0.24, type: 'sfx', arg: 'taunt' }, { t: 0.50, type: 'sfx', arg: 'land' },
    { t: 1.06, type: 'sfx', arg: 'land' }, { t: 1.62, type: 'sfx', arg: 'land' }],
};

// JERRY — he goes TWITCHY. The point is that nothing moves together: every key
// jerks a different part by a small amount on its own beat, with `linear` and
// `outQuad` eases so each one arrives as a snap rather than a swing. Small is
// the whole design — a big amplitude on this splayed crustacean rig reads as
// broken skinning, not as a nervous system.
const JERRY_TAUNT = {
  // JERRY — he goes TWITCHY. The point is that nothing moves together: every key
  // jerks a different part by a small amount on its own beat, with `linear` and
  // `outQuad` eases so each one arrives as a snap rather than a swing.
  //
  // THE CLAW WORK IS THE OWNER'S, posed by hand. The first pass kept every joint
  // small on the theory that a big amplitude on this splayed crustacean rig
  // reads as broken skinning; the claws in particular barely moved, which made
  // the whole thing a head twitch. They swing properly now — a shoulder reaching
  // -159 degrees at the peak — and it reads as a nervous system rather than a
  // loose bolt, because the rest of the body is still ticking underneath in
  // small increments and no two parts arrive on the same beat.
  dur: 1.7, cancelOnMove: true,
  keys: [
    { t: 0, pose: {  } },
    { t: 0.1, ease: 'linear', pose: { torso: [3.08, 12.51, 16.08], head: [-9.03, 12.92, 0.78], shoulderL: [-42.31, 10.14, -39.75], shoulderR: [-34.05, -11.61, 44.35] } },
    { t: 0.18, ease: 'linear', pose: { head: [2, -6, 4], elbowL: [34, 0, 0], shoulderR: [-34.74, 2.79, 6.63] } },
    { t: 0.26, ease: 'linear', pose: { hipsPos: [0.05, 0, 0], torso: [4, -7, 3], shoulderL: [-77.37, 17.05, -21.56] } },
    { t: 0.34, ease: 'linear', pose: { head: [-11, -14, -3], shoulderL: [-40.24, 0.38, -17.99], shoulderR: [-24, 0, 9], elbowR: [12, 0, 0] } },
    { t: 0.44, ease: 'outQuad', pose: { hipsPos: [-0.06, 0.03, 0], torso: [-3, 9, 2], elbowL: [14, 0, 0], shoulderR: [-112.28, 12.49, 16.94] } },
    { t: 0.52, ease: 'linear', pose: { head: [5, 10, -5], shoulderL: [-22, 0, -8], shoulderR: [-74.95, -11.36, 18.4] } },
    { t: 0.62, ease: 'linear', pose: { hipsPos: [0.04, 0, 0], torso: [2, -4, -4], shoulderL: [-120.85, 14.67, -15.02], shoulderR: [-42, 0, 22], elbowR: [30, 0, 0] } },
    { t: 0.72, ease: 'linear', pose: { head: [-8, 16, 2], shoulderL: [-140.24, 10.26, -21.44], elbowL: [30, 0, 0] } },
    { t: 0.84, ease: 'outQuad', pose: { hipsPos: [0, 0.04, 0], torso: [3, 6, 4], shoulderL: [-38, 0, -20], shoulderR: [-87.96, 33.8, 34.47] } },
    { t: 0.94, ease: 'linear', pose: { head: [-2, -12, -4], shoulderR: [-94.36, 18.62, 57.08], elbowR: [9.69, -2.7, -5.13] } },
    { t: 1.04, ease: 'linear', pose: { hipsPos: [-0.05, 0, 0], torso: [-2, -6, 3], elbowL: [26, 0, 0] } },
    { t: 1.16, ease: 'linear', pose: { head: [-10, 8, 5], shoulderL: [-34, 0, -16], shoulderR: [-38, 0, 20] } },
    { t: 1.28, ease: 'outQuad', pose: { hipsPos: [0.03, 0.02, 0], torso: [1, 3, -2], head: [-4, -5, -2], shoulderL: [-159.12, 0.44, -32.62], elbowR: [24, 0, 0] } },
    { t: 1.7, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], elbowL: [-12, 0, 0], shoulderR: [0, 0, 10], elbowR: [-12, 0, 0], thighL: [0, 0, 0], kneeL: [0, 0, 0], ankleL: [0, 0, 0], thighR: [0, 0, 0], kneeR: [0, 0, 0], ankleR: [0, 0, 0] } },
  ],
  events: [{ t: 0.05, type: 'sfx', arg: 'taunt' },
    { t: 0.10, type: 'sfx', arg: 'servo' }, { t: 0.44, type: 'sfx', arg: 'servo' },
    { t: 0.84, type: 'sfx', arg: 'servo' }, { t: 1.16, type: 'sfx', arg: 'servo' }],
};

// NULLBOT — the jitter of a body being drawn by something that has lost the
// file. Not a shiver: on each beat a DIFFERENT part snaps to an angle a body
// does not have — a head wrenched round past the shoulder, an elbow bent the
// wrong way, a torso wrung out sideways — and then to another one, with no
// smoothing between (`linear` on every key). The limbs never pass through the
// pose in between, which is exactly what a corrupt frame looks like.
//
// THE ARMS ARE THE PLACE TO BE EXTREME, because they are absolute: an elbow at
// +70 is a joint bending backwards, which no clip on the roster does anywhere
// else. Legs and torso are additive over rest and are kept smaller — a mech
// whose knees invert falls over rather than glitching.
// THE GLITCH POSES ARE A LIST, played through twice — the same corrupt frames
// in the same order, which is right for a thing repeating a broken loop rather
// than improvising, and doubles the length without inventing twelve more poses
// that would each need judging. `cycles` is the dial.
const NULLBOT_GLITCH = [
  // the head goes round further than a neck goes
  { head: [-24, 118, 22], torso: [14, -26, 16],
    shoulderR: [-116, 54, 74], elbowR: [42, 0, 0], handR: [0, 0, 60] },
  { head: [30, -104, -26], torso: [2, 30, -20],
    shoulderL: [-128, -60, -86], elbowL: [56, 0, 0], shoulderR: [-20, 0, 16], elbowR: [-70, 0, 0] },
  { head: [-38, 20, 0], torso: [18, 0, 4],
    shoulderL: [26, 40, -8], elbowL: [-150, 0, 0], shoulderR: [24, -40, 8], elbowR: [-150, 0, 0],
    hipsPos: [0.12, -0.1, 0], hipsRot: [0, 14, 0] },
  { head: [12, -76, 30], torso: [6, -22, -18],
    shoulderL: [-96, 0, -120], elbowL: [-10, 0, 0], shoulderR: [-96, 0, 120], elbowR: [-10, 0, 0],
    hipsPos: [-0.1, 0.04, 0], hipsRot: [0, -12, 0] },
  { head: [-30, 132, -18], torso: [16, 24, 22],
    shoulderR: [58, -70, 40], elbowR: [64, 0, 0], shoulderL: [-40, 0, -22], elbowL: [-84, 0, 0] },
  { head: [24, 0, 40], torso: [0, -30, -8],
    shoulderL: [70, 62, -34], elbowL: [58, 0, 0], shoulderR: [-132, 0, 96], elbowR: [-26, 0, 0],
    hipsPos: [0.08, -0.14, 0] },
  { head: [-44, -60, 12], torso: [22, 12, 26],
    shoulderL: [-150, 0, -40], elbowL: [-4, 0, 0], shoulderR: [-150, 0, 40], elbowR: [-4, 0, 0],
    hipsPos: [0, 0.06, 0], hipsRot: [0, 8, 0] },
  { head: [8, 96, -34], torso: [-6, -18, 14],
    shoulderL: [10, -50, -70], elbowL: [-166, 0, 0], shoulderR: [-72, 34, 20], elbowR: [30, 0, 0] },
  { head: [-20, -30, 26], torso: [20, 26, -22],
    shoulderL: [-110, 0, -96], elbowL: [48, 0, 0], shoulderR: [-14, 0, 12], elbowR: [-120, 0, 0],
    hipsPos: [-0.14, -0.06, 0], hipsRot: [0, -16, 0] },
  { head: [34, 14, -40], torso: [4, -8, 18],
    shoulderL: [-30, 0, -26], elbowL: [-90, 0, 0], shoulderR: [66, 58, 30], elbowR: [52, 0, 0] },
  { head: [-26, -120, 8], torso: [18, -28, -14],
    shoulderL: [-140, 44, -60], elbowL: [-16, 0, 0], shoulderR: [-140, -44, 60], elbowR: [-16, 0, 0],
    hipsPos: [0.1, 0.02, 0] },
  { head: [16, 62, 34], torso: [8, 20, 24],
    shoulderL: [40, 0, -14], elbowL: [40, 0, 0], shoulderR: [-88, 0, 62], elbowR: [-60, 0, 0] },
];

export const NULLBOT_JITTER = {
  lead: 0.1,     // squaring up before the signal goes
  beat: 0.104,   // one corrupt frame
  cycles: 2,     // times through the list
  snap: 0.12,    // …and back to something almost normal, which is the punchline
  out: 0.32,
  zapEvery: 4,   // one buzz in four beats
};

function nullbotJitterClip(J = NULLBOT_JITTER) {
  const keys = [{ t: 0, pose: {} }];
  const events = [];
  let t = J.lead;
  keys.push({ t, ease: 'linear', pose: { torso: [10, 0, 0], head: [-16, 0, 0], hipsPos: [0, -0.06, 0],
    shoulderL: [-34, 0, -30], shoulderR: [-34, 0, 30], elbowL: [-78, 0, 0], elbowR: [-78, 0, 0] } });
  const n = NULLBOT_GLITCH.length * J.cycles;
  for (let i = 0; i < n; i++) {
    t = +(t + J.beat).toFixed(3);
    keys.push({ t, ease: 'linear', pose: { ...NULLBOT_GLITCH[i % NULLBOT_GLITCH.length] } });
    if (i % J.zapEvery === 1) events.push({ t, type: 'sfx', arg: 'zap' });
  }
  t = +(t + J.snap).toFixed(3);
  keys.push({ t, ease: 'linear', pose: { head: [-14, 0, 0], torso: [10, 0, 0], hipsPos: [0, -0.04, 0], hipsRot: [0, 0, 0],
    shoulderL: [-32, 0, -28], shoulderR: [-32, 0, 28], elbowL: [-80, 0, 0], elbowR: [-80, 0, 0],
    handL: [0, 0, 0], handR: [0, 0, 0] } });
  t = +(t + J.out).toFixed(3);
  keys.push({ t, ease: 'inOutQuad', pose: REST_FULL });
  return { dur: t, cancelOnMove: true, keys, events };
}

const NULLBOT_TAUNT = nullbotJitterClip();

// RHINO — the heavyweight warming up: knees driven high and stamped back down,
// with both fists cocked in a punch wind-up the whole way through. Alternating
// legs, so the body rocks between them; his profile only reinterprets `shoot`,
// so nothing here is fighting a hook.
// THE STAMPS ARE GENERATED, so `steps` is one number. Six of them now: three
// read as clearing his throat, six as a man settling in to work.
export const RHINO_STOMP = {
  lead: 0.22,    // fists up and cocked back
  rise: 0.24,    // knee driven up
  drop: 0.18,    // …and STAMPED down
  steps: 6,
  square: 0.28,  // squaring back up over the fists before letting go
  out: 0.4,
};

function rhinoStompClip(S = RHINO_STOMP) {
  const keys = [{ t: 0, pose: {} }];
  // fists up and cocked back — held for the whole taunt
  const events = [{ t: S.lead, type: 'sfx', arg: 'taunt' }];
  keys.push({ t: S.lead, ease: 'outBack', pose: { torso: [-6, 0, 0], head: [-6, 0, 0],
    shoulderL: [-34, 22, -30], shoulderR: [-34, -22, 30], elbowL: [-116, 0, 0], elbowR: [-116, 0, 0] } });
  let t = S.lead;
  for (let i = 0; i < S.steps; i++) {
    const R = i % 2 === 0, s = R ? 'R' : 'L', o = R ? 'L' : 'R', sgn = R ? 1 : -1;
    t = +(t + S.rise).toFixed(3);
    keys.push({ t, ease: 'outQuad', pose: { hipsPos: [0, 0.10, 0], hipsRot: [0, 0, -5 * sgn], torso: [-8, 0, 3 * sgn],
      ['thigh' + s]: [-74, 0, 4 * sgn], ['knee' + s]: [86, 0, 0], ['ankle' + s]: [22, 0, 0],
      ['thigh' + o]: [4, 0, 0], ['knee' + o]: [-6, 0, 0] } });
    t = +(t + S.drop).toFixed(3);
    keys.push({ t, ease: 'inQuad', pose: { hipsPos: [0, -0.12, 0], hipsRot: [0, 0, 0], torso: [-4, 0, 0],
      ['thigh' + s]: [8, 0, 0], ['knee' + s]: [-4, 0, 0], ['ankle' + s]: [0, 0, 0],
      ['thigh' + o]: [0, 0, 0], ['knee' + o]: [0, 0, 0] } });
    events.push({ t, type: 'sfx', arg: 'slam' }, { t: +(t + 0.02).toFixed(3), type: 'shake', arg: 0.22 });
  }
  t = +(t + S.square).toFixed(3);
  keys.push({ t, ease: 'outQuad', pose: { torso: [-10, 0, 0], head: [-8, 0, 0], hipsPos: [0, 0.04, 0],
    shoulderL: [-40, 24, -34], shoulderR: [-40, -24, 34], elbowL: [-124, 0, 0], elbowR: [-124, 0, 0] } });
  t = +(t + S.out).toFixed(3);
  keys.push({ t, ease: 'inOutQuad', pose: REST_FULL });
  return { dur: t, cancelOnMove: true, keys, events };
}

const RHINO_TAUNT = rhinoStompClip();

// SAURION — SOMETHING REGISTERS. He STOPS, stands up out of the hunt crouch and
// snatches both claws up under his chin, freezes there, takes a sniff of the
// air, then turns his skull hard to one side, all the way across to the other,
// and back to centre — holding still for half a second at every one of those.
// It is a LISTENING animal rather than a jeering one, which is the point: run
// together the same poses are a nervous tic, and the pauses are what make it a
// predator working out where you are.
//
// THIS CLIP IS THE OWNER'S, exported from the pose workbench key by key, and it
// is written out flat FOR THAT REASON. It was generated from a table for one
// release — which is the right shape while the rhythm is still being dialled in
// — and the moment the poses and the timings started coming back hand-tuned
// (the sniff that now comes down in two stages, the tail lopped off) a
// generator stopped saving work and started standing between the workbench and
// the file. A flat key list is a paste; a generator is a re-derivation.
//
// THE ALERT is the owner's pose too: both claws snatched up under the chin, the
// right one curled, the skull cocked over. Arms are ABSOLUTE, so these land the
// same whatever the spine is doing; the head is additive over restPose, so
// [2.2, 4.32, 6.94] is a small cock off his own resting carriage and doubles as
// the CENTRE the scan swings either side of.
const SAURION_ALERT = {
  shoulderR: [-91.74, -8.84, 16.74], shoulderL: [-79.6, 9.41, -3.18],
  elbowR: [-80.97, 11.21, -38.58], elbowL: [-86.44, -0.01, 28.22],
  handR: [35.16, 18.79, 1.76],
};
const SAURION_ALERT_HEAD = [2.2, 4.32, 6.94];
// WHICH WAY IS LEFT, and which way is UP — measured on his own snout rather
// than guessed (tripoHead_4 in the mech's own frame, where -x is his left):
// head yaw -90 takes the snout to x -1.12, +90 to +0.83, so NEGATIVE YAW IS
// HIS LEFT; head pitch -20 lifts the snout 4.81 -> 5.06, so NEGATIVE PITCH IS
// NOSE UP, which is what a sniff is.
//
// IT ENDS ON THE HOLD, with no key easing him back to rest — the owner cut the
// second sniff and the relax. So the arms stay in the alert tuck to the last
// frame (a track a key is silent about keeps its last value) and the crossfade
// out of the clip is what puts him down, which is the same way wraith's loom
// ends.
// SAURION's VICTORY — the shared one is a fist punched up over the head, which
// on a raptor is the one thing his forelimbs cannot do: the arm goes back over
// his own skull and the claws end up behind him (measured -0.09 of body height
// behind the shoulder, in the chest's own frame). So he wins the way he hunts.
// He rears up out of the hunting pitch, throws his head back and SHRIEKS
// twice, with the claws held exactly where his taunt holds them — up under the
// chest, in front — snapping once on each cry. Leg/torso/head values are
// deltas over his raptor rest pose; arm values are absolute.
const SAURION_SNAP = {
  shoulderR: [-104, -9, 17], shoulderL: [-94, 9, -3],
  elbowR: [-58, 11, -39], elbowL: [-62, 0, 28],
  handR: [40, 19, 2], handL: [40, -19, -2],
};
const SAURION_VICTORY = {
  dur: 2.6, hold: true,
  keys: [
    { t: 0, pose: {} },
    // up out of the crouch, claws to the alert carry (his rest is a 27 degree
    // forward pitch, so -34 stands him just past upright)
    { t: 0.4, ease: 'outBack', pose: { torso: [-34, 0, 0], head: [8, 0, 0], hipsPos: [0, 0.3, 0],
      thighL: [24, 0, 6], thighR: [20, 0, -6], kneeL: [-46, 0, 0], kneeR: [-40, 0, 0],
      ankleL: [22, 0, 0], ankleR: [18, 0, 0], ...SAURION_ALERT, handL: [35, -19, -2] } },
    // FIRST CRY — head thrown back, claws snap out and open
    { t: 0.72, ease: 'outCubic', pose: { torso: [-40, 0, 0], head: [34, 0, 0], ...SAURION_SNAP } },
    { t: 1.06, ease: 'inOutQuad', pose: { torso: [-34, 0, 0], head: [8, 0, 0],
      ...SAURION_ALERT, handL: [35, -19, -2] } },
    // …and again, harder
    { t: 1.42, ease: 'outCubic', pose: { torso: [-42, 0, 0], head: [40, 0, 0], ...SAURION_SNAP } },
    { t: 1.86, ease: 'inOutQuad', pose: { torso: [-34, 0, 0], head: [6, 0, 0],
      ...SAURION_ALERT, handL: [35, -19, -2] } },
    // held: standing tall over the kill, claws up
    { t: 2.6, ease: 'inOutQuad', pose: { torso: [-32, 0, 0], head: [2, 0, 0], hipsPos: [0, 0.26, 0] } },
  ],
  events: [{ t: 0.4, type: 'sfx', arg: 'powerup' }, { t: 0.72, type: 'sfx', arg: 'howl' },
    { t: 1.42, type: 'sfx', arg: 'howl' }],
};

const SAURION_TAUNT = {
  dur: 4.48, cancelOnMove: true,
  keys: [
    { t: 0, pose: {} },
    // HE HEARS SOMETHING — additive over restPose, which is why the torso key
    // is a big negative: his rest IS a 27 degree forward pitch, so -30 stands
    // him just past upright. The arms arrive on an outBack, so the snatch under
    // the chin overshoots and settles.
    { t: 0.20, ease: 'outBack', pose: { torso: [-30, 0, 0], head: SAURION_ALERT_HEAD, hipsPos: [0, 0.26, 0],
      thighL: [22, 0, 6], thighR: [18, 0, -6], kneeL: [-44, 0, 0], kneeR: [-38, 0, 0],
      ankleL: [20, 0, 0], ankleR: [17, 0, 0], ...SAURION_ALERT } },
    { t: 0.34, ease: 'linear', pose: { head: SAURION_ALERT_HEAD } },
    { t: 0.84, ease: 'linear', pose: { torso: [-30, 0, 0], head: SAURION_ALERT_HEAD } },
    // the sniff — nose up, then down in TWO stages: a quick drop most of the
    // way and a slow one the rest, which is a nose settling rather than a head
    // snapping back
    { t: 1.00, ease: 'outQuad', pose: { torso: [-24.45, -3.05, 0.3], head: [-20.79, 10.85, 0.25] } },
    { t: 1.1802, ease: 'inQuad', pose: { torso: [-35.93, -4.15, -0.47], head: [-14.97, 8.77, -1.58] } },
    { t: 1.66, ease: 'linear', pose: { torso: [-35.93, -4.15, -0.47], head: [4.42, 8.87, -0.76] } },
    // THE SCAN. Each look is a real three-axis pose — pitched down and rolled
    // over as it turns, which is how an animal points an eye at something — and
    // each one OVERSHOOTS and settles back a few degrees, so the head arrives
    // rather than stops. Then it HOLDS, which is the half-second that makes the
    // difference between a scan and a twitch.
    { t: 1.96, ease: 'outQuad', pose: { torso: [-30, -5, 0], head: [-40.39, -70.41, -62.43] } },
    { t: 2.10, ease: 'linear', pose: { head: [-26.62, -62.52, -54.86] } },
    { t: 2.60, ease: 'linear', pose: { torso: [-30, -5, 0], head: [-26.62, -62.52, -54.86] } },
    // all the way across — the long sweep, and the only slow move in the clip
    { t: 3.04, ease: 'inOutQuad', pose: { torso: [-30, 5, 0], head: [-91.58, 58.51, 109.4] } },
    { t: 3.18, ease: 'linear', pose: { head: [-57.23, 59.9, 66.9] } },
    { t: 3.68, ease: 'linear', pose: { torso: [-30, 5, 0], head: [-57.23, 59.9, 66.9] } },
    // …and home
    { t: 3.98, ease: 'inOutQuad', pose: { torso: [-30, 0, 0], head: [4.61, 6.85, -1.35] } },
    { t: 4.48, ease: 'linear', pose: { torso: [-30, 0, 0], head: [4.61, 6.85, -1.35] } },
  ],
  events: [{ t: 0.20, type: 'sfx', arg: 'taunt' }, { t: 3.98, type: 'sfx', arg: 'howl' }],
};

// TEMPEST — the chest OPENS and both arms go wide and back: hug-the-world, if
// the world were something you meant to electrocute. He holds it while the
// static crawls all over him (Fighter.arcTaunt — the arcs are FX between named
// points on the body, not anything a pose can express), then folds the arms
// slowly back in.
// THE THREE SHOULDER POSES ARE THE OWNER'S, set by hand in the pose workbench,
// and they are not a tidy pair of mirrored numbers — the two arms differ by a
// few degrees on every key (-74.97 against -77.45, -69.40 against -70.84) and
// that near-symmetry is deliberate, not an error to round out. The span moved
// from a shallow pitch carrying most of it in roll (-16 / -104) to a deep one
// (-75 / -121), which turns the arms so they open OUT AND FORWARD with the
// palms and wrist bands presented at you, instead of sweeping back where the
// camera cannot read them.
const TEMPEST_TAUNT = {
  dur: 2.4, cancelOnMove: true,
  keys: [
    { t: 0, pose: {} },
    { t: 0.38, ease: 'outBack', pose: { torso: [-16, 0, 0], head: [-14, 0, 0], hipsPos: [0, 0.06, 0],
      shoulderL: [-74.97, -1.84, -121], shoulderR: [-77.45, -4.32, 121.08], elbowL: [-8, 0, 0], elbowR: [-8, 0, 0],
      handL: [0, 0, -22], handR: [0, 0, 22] } },
    // he keeps opening, a slow swell rather than a held statue
    { t: 1.30, ease: 'inOutQuad', pose: { torso: [-20, 0, 0], head: [-18, 0, 0],
      shoulderL: [-69.4, -5.9, -128.51], shoulderR: [-70.84, 2.75, 129.69] } },
    { t: 1.95, ease: 'inOutQuad', pose: { torso: [-12, 0, 0], head: [-10, 0, 0],
      shoulderL: [-74.76, -13.42, -103.5], shoulderR: [-84.5, 10.94, 105.56], elbowL: [-26, 0, 0], elbowR: [-26, 0, 0] } },
    { t: 2.4, ease: 'inOutQuad', pose: REST_FULL },
  ],
  events: [{ t: 0.38, type: 'sfx', arg: 'zap' }, { t: 1.30, type: 'sfx', arg: 'thunder' }],
};

// VIPER — arms locked BEHIND THE BACK with the two blade tips touching at the
// centre of his spine, and then seven full seconds of Irish jig danced with the
// legs alone. The upper body is the joke: a jig is danced with a DEAD still
// carriage, hands out of the way, everything happening below the hips.
//
// THE ARM POSE IS MEASURED, NOT AUTHORED. His blades are fused to the forearms,
// so where the TIP ends up is two joints away from any number you can type, and
// the two obvious levers fight: shoulder yaw that pulls the tips in toward the
// centre line also swings them FORWARD, while pitching the arm back puts them
// behind him but leaves them a body's width apart. `tools/scratch/armsweep.mjs`
// swept pitch x yaw x roll x elbow and scored on (tips together) + (on the
// centreline) + (behind the torso); these are the winner. THE TIP IS THE REAL
// ONE — the farthest skinned vertex the forearm/hand owns, taken into the hand
// bone's local frame once and carried by the bone through each candidate.
// Guessing it as "a hand-length or so past the hand" is what the first attempt
// did, and it was off by a factor of two, so the arms it chose crossed the
// blades in an X across his shoulder blades. Measured with the torso at
// [0, 4.83, 0]: tipL [-0.02, 3.17, -1.21], tipR [-0.02, 3.16, -1.22] — 0.03
// apart, on the centre line, at the small of his back. Do not "tidy" the
// yaw/roll pair; they are what closes the gap.
const VIPER_ARMS = {
  shoulderL: [60, 20, 40], shoulderR: [60, -20, -40],
  elbowL: [-20, 0, 0], elbowR: [-20, 0, 0],
};

// THE JIG IS GENERATED, because it is a rhythm rather than a pose: fourteen
// beats hand-written is fourteen chances to typo one, and the thing you tune is
// the BAR, not the fiftieth key. Each beat lifts one knee to a pointed toe and
// snaps it back down under him with a hop in the hips; every fourth beat is a
// TREBLE instead — the low forward brush a jig punctuates with — so the step
// does not read as a metronome. The arms are repeated on EVERY key, verbatim: a
// clip track is sparse, so a pose named once and not again slides away over the
// next seven seconds.
// THE LEGS AND THE BODY RUN ON DIFFERENT CLOCKS, and that is the whole reason
// this is generated rather than typed. Speeding the step up is a legs-only ask:
// a hip bob keyed once per step goes up with it, and six bounces a second is a
// mech vibrating, not a dancer. So `beat` is the STEP and `bob` is how many
// steps one rise-and-fall of the hips spans — 3, which puts the body back on the
// half-second it bounced at before the legs got quick. The hips are then sampled
// off their own triangle at every key rather than keyed per step, so the two
// rhythms cross without either one snapping to the other.
//
// HIS FEET COME DOWN UNDER HIM. A jig is danced on a narrow base: `adduct` rolls
// both thighs toward the midline and the ankles take the same angle back out, so
// the sole stays flat on the floor instead of landing on its edge. (The owner's
// pose-workbench pass is where the idea and the rough size came from — theirs
// carried a per-key yaw wobble too, which is a hand-set pose rather than a rule,
// so what is kept here is the adduction.)
export const VIPER_JIG = {
  lead: 0.34,    // getting the hands behind his back
  beat: 0.167,   // one STEP — a third of the first pass' half-second
  beats: 42,     // 42 x 0.167 = the seven seconds asked for
  bob: 3,        // steps per body bounce: 3 x 0.167 = the original 0.5s
  out: 0.42,     // unwinding to rest
  lift: 0.12,    // how far the bounce takes the hips up
  drop: -0.05,   // …and down
  knee: 98,      // the raised knee, degrees forward of rest
  adduct: 9,     // degrees of thigh roll toward the midline (feet closer in)
  sfxEvery: 3,   // one footfall sound in three; forty-two is a machine gun
};

// The body's own bounce, sampled at time `t`: a triangle with the ORIGINAL
// period, peaking just after a step lands and bottoming a little past halfway.
function viperBob(t, J) {
  const P = J.beat * J.bob;
  const up = 0.04, dn = 0.56;
  let ph = (((t - J.lead) % P + P) % P) / P;
  if (ph < up) ph += 1;
  return ph < dn
    ? J.lift + (J.drop - J.lift) * ((ph - up) / (dn - up))
    : J.drop + (J.lift - J.drop) * ((ph - dn) / (1 + up - dn));
}

function viperJigKeys(J = VIPER_JIG) {
  const A = J.adduct;
  const keys = [{ t: 0, pose: {} },
    { t: J.lead, ease: 'outQuad', pose: { torso: [-3, 0, 0], head: [-2, 0, 0], ...VIPER_ARMS } }];
  for (let i = 0; i < J.beats; i++) {
    const t = J.lead + i * J.beat;
    const R = i % 2 === 0, s = R ? 'R' : 'L', o = R ? 'L' : 'R';
    // roll toward the midline: +z on the LEFT leg, -z on the right
    const roll = (side) => (side === 'L' ? 1 : -1);
    const treble = i % 4 === 3;
    const tUp = t + J.beat * 0.04, tDn = t + J.beat * 0.56;
    // up: the working leg's knee at its top (or thrown forward low, on a treble)
    keys.push({ t: tUp, ease: 'outQuad', pose: { ...VIPER_ARMS,
      hipsPos: [0, viperBob(tUp, J), 0],
      ['thigh' + s]: treble ? [-42, 0, A * roll(s)] : [-J.knee + 8, 0, A * roll(s)],
      ['knee' + s]: treble ? [-16, 0, 0] : [J.knee + 10, 0, 0],
      ['ankle' + s]: treble ? [34, 0, -A * roll(s)] : [28, 0, -A * roll(s)],
      ['thigh' + o]: [7, 0, A * roll(o)], ['knee' + o]: [-7, 0, 0],
      ['ankle' + o]: [0, 0, -A * roll(o)] } });
    // down: back under him, taking the weight
    keys.push({ t: tDn, ease: 'inQuad', pose: { ...VIPER_ARMS,
      hipsPos: [0, viperBob(tDn, J), 0],
      ['thigh' + s]: [11, 0, A * roll(s)], ['knee' + s]: [-9, 0, 0],
      ['ankle' + s]: [0, 0, -A * roll(s)] } });
  }
  keys.push({ t: J.lead + J.beats * J.beat + J.out, ease: 'inOutQuad', pose: REST_FULL });
  return keys;
}

const VIPER_TAUNT = {
  dur: VIPER_JIG.lead + VIPER_JIG.beats * VIPER_JIG.beat + VIPER_JIG.out,
  cancelOnMove: true,
  keys: viperJigKeys(),
  events: Array.from({ length: VIPER_JIG.beats }, (_, i) => i)
    .filter((i) => i % (VIPER_JIG.sfxEvery || 1) === 0)
    .map((i) => ({ t: VIPER_JIG.lead + i * VIPER_JIG.beat + VIPER_JIG.beat * 0.56, type: 'sfx', arg: 'land' })),
};

// TITANUS — the capoeira GINGA, the rocking triangular base step: weight back
// onto one leg with the opposite arm up across the face, then across to the
// other side. It is a SWAY, not a march — every key moves the hips laterally
// and the shoulders counter it, and the guard arm is always the one opposite
// the back foot.
const TITANUS_TAUNT = {
  dur: 3.3, cancelOnMove: true,
  keys: [
    { t: 0, pose: {} },
    // settle into the base: knees soft, weight centred, hands up
    { t: 0.26, ease: 'outQuad', pose: { hipsPos: [0, -0.24, 0], torso: [6, 0, 0], head: [-6, 0, 0],
      thighL: [-16, 0, -6], thighR: [-16, 0, 6], kneeL: [30, 0, 0], kneeR: [30, 0, 0], ankleL: [-14, 0, 0], ankleR: [-14, 0, 0],
      shoulderL: [-40, 0, -22], shoulderR: [-40, 0, 22], elbowL: [-96, 0, 0], elbowR: [-96, 0, 0] } },
    // LEFT back, right arm across the face
    { t: 0.62, ease: 'inOutQuad', pose: { hipsPos: [0.22, -0.3, -0.18], hipsRot: [0, 16, 0], torso: [8, -14, -6], head: [-6, 18, 0],
      thighL: [12, 0, -8], kneeL: [46, 0, 0], ankleL: [-20, 0, 0], thighR: [-30, 0, 8], kneeR: [24, 0, 0], ankleR: [-10, 0, 0],
      shoulderR: [-78, -18, 34], elbowR: [-112, 0, 0], shoulderL: [-14, 0, -16], elbowL: [-56, 0, 0] } },
    { t: 0.96, ease: 'inOutQuad', pose: { hipsPos: [0, -0.26, 0], hipsRot: [0, 0, 0], torso: [6, 0, 0], head: [-6, 0, 0],
      thighL: [-16, 0, -6], thighR: [-16, 0, 6], kneeL: [30, 0, 0], kneeR: [30, 0, 0], ankleL: [-14, 0, 0], ankleR: [-14, 0, 0],
      shoulderL: [-40, 0, -22], shoulderR: [-40, 0, 22], elbowL: [-96, 0, 0], elbowR: [-96, 0, 0] } },
    // RIGHT back, left arm across
    { t: 1.32, ease: 'inOutQuad', pose: { hipsPos: [-0.22, -0.3, -0.18], hipsRot: [0, -16, 0], torso: [8, 14, 6], head: [-6, -18, 0],
      thighR: [12, 0, 8], kneeR: [46, 0, 0], ankleR: [-20, 0, 0], thighL: [-30, 0, -8], kneeL: [24, 0, 0], ankleL: [-10, 0, 0],
      shoulderL: [-78, 18, -34], elbowL: [-112, 0, 0], shoulderR: [-14, 0, 16], elbowR: [-56, 0, 0] } },
    { t: 1.66, ease: 'inOutQuad', pose: { hipsPos: [0, -0.26, 0], hipsRot: [0, 0, 0], torso: [6, 0, 0], head: [-6, 0, 0],
      thighL: [-16, 0, -6], thighR: [-16, 0, 6], kneeL: [30, 0, 0], kneeR: [30, 0, 0], ankleL: [-14, 0, 0], ankleR: [-14, 0, 0],
      shoulderL: [-40, 0, -22], shoulderR: [-40, 0, 22], elbowL: [-96, 0, 0], elbowR: [-96, 0, 0] } },
    { t: 2.02, ease: 'inOutQuad', pose: { hipsPos: [0.22, -0.3, -0.18], hipsRot: [0, 16, 0], torso: [8, -14, -6], head: [-6, 18, 0],
      thighL: [12, 0, -8], kneeL: [46, 0, 0], ankleL: [-20, 0, 0], thighR: [-30, 0, 8], kneeR: [24, 0, 0], ankleR: [-10, 0, 0],
      shoulderR: [-78, -18, 34], elbowR: [-112, 0, 0], shoulderL: [-14, 0, -16], elbowL: [-56, 0, 0] } },
    // …AND THE FOURTH. The ginga is a two-count step, so three sways left him
    // stopped on the wrong foot with the dance visibly unfinished; the fourth
    // takes him back through centre and onto the right side, which is where the
    // step started, so he can stand up out of it.
    { t: 2.36, ease: 'inOutQuad', pose: { hipsPos: [0, -0.26, 0], hipsRot: [0, 0, 0], torso: [6, 0, 0], head: [-6, 0, 0],
      thighL: [-16, 0, -6], thighR: [-16, 0, 6], kneeL: [30, 0, 0], kneeR: [30, 0, 0], ankleL: [-14, 0, 0], ankleR: [-14, 0, 0],
      shoulderL: [-40, 0, -22], shoulderR: [-40, 0, 22], elbowL: [-96, 0, 0], elbowR: [-96, 0, 0] } },
    { t: 2.72, ease: 'inOutQuad', pose: { hipsPos: [-0.22, -0.3, -0.18], hipsRot: [0, -16, 0], torso: [8, 14, 6], head: [-6, -18, 0],
      thighR: [12, 0, 8], kneeR: [46, 0, 0], ankleR: [-20, 0, 0], thighL: [-30, 0, -8], kneeL: [24, 0, 0], ankleL: [-10, 0, 0],
      shoulderL: [-78, 18, -34], elbowL: [-112, 0, 0], shoulderR: [-14, 0, 16], elbowR: [-56, 0, 0] } },
    { t: 3.3, ease: 'inOutQuad', pose: REST_FULL },
  ],
  events: [{ t: 0.26, type: 'sfx', arg: 'taunt' }, { t: 0.62, type: 'sfx', arg: 'servo' },
    { t: 1.32, type: 'sfx', arg: 'servo' }, { t: 2.02, type: 'sfx', arg: 'servo' },
    { t: 2.72, type: 'sfx', arg: 'servo' }],
};

// VULCAN — arms straight out and the upper body SPUN, once each way. The turn
// is keyed as a plain torso yaw running past 360 rather than a post-pose
// accumulator (fighter.js heavySpin): a clip track is a linear ramp between
// keys, so a value of −380 really does sweep a full turn and a bit, and it
// unwinds honestly on the way back instead of snapping to a whole rotation.
const VULCAN_TAUNT = {
  dur: 2.6, cancelOnMove: true,
  keys: [
    { t: 0, pose: {} },
    { t: 0.26, ease: 'outBack', pose: { torso: [0, 0, 0], head: [-6, 0, 0], hipsPos: [0, 0.04, 0],
      shoulderL: [-4, 0, -92], shoulderR: [-4, 0, 92], elbowL: [-4, 0, 0], elbowR: [-4, 0, 0] } },
    { t: 1.12, ease: 'inOutCubic', pose: { torso: [0, -380, 0], head: [-6, 0, 0] } },   // one turn, right
    { t: 1.34, ease: 'outQuad', pose: { torso: [0, -360, 0] } },                        // settle onto the turn
    { t: 2.20, ease: 'inOutCubic', pose: { torso: [0, 20, 0] } },                       // and back the other way
    { t: 2.6, ease: 'inOutQuad', pose: REST_FULL },
  ],
  events: [{ t: 0.26, type: 'sfx', arg: 'servo' }, { t: 0.4, type: 'sfx', arg: 'whoosh' },
    { t: 1.5, type: 'sfx', arg: 'whoosh' }],
};

// WRAITH — HE JUST GETS BIGGER, and then he comes apart into bats. THE GROWTH
// IS THE EFFECT (`tauntGrow`, fighter.js growTaunt — the render group, the
// combat radius/height, and Animator.sizeMul with them), so the pose's whole
// job is to not get in its way: he draws himself up, tips a little forward onto
// you, and holds it. The cloak takes a wind for the duration and the hood stays
// on your face; the exit is the giant being replaced by the mech on one frame,
// with the bats carrying the apparition away.
//
// IT IS TWO KEYS, AND IT USED TO BE FIVE. The earlier version arrived at the
// draw-up and then kept going — the spine curling to 46°, the hips to 14, the
// arms closing down and around, "a loom is a thing that keeps arriving". The
// owner's call is that it isn't: a body that goes on folding forward while it
// scales is TWO effects competing for the same silhouette, and the one you can
// actually read at arena distance is the size. So the deepening keys are gone.
// He reaches the drawn-up lean (a 10.4° tip at the hips against a 5° torso
// counter, so the spine carries about 5° of forward — a lean, not a fold) and
// STAYS THERE for the remaining second and a half while the growth does the
// work.
//
// IT DOES NOT UNWIND, and that survives the trim. Every other taunt here ends
// on REST_FULL; this one simply has no key after the one it reaches, so the
// held pose runs to the last frame. The exit is not the body relaxing — a key
// easing him back to rest would play a huge ghost standing up straight first.
//
// WHICH WAY IS FORWARD (`tools/scratch/leansign.mjs`): POSITIVE torso pitch and
// POSITIVE hipsRot both tip a mech FORWARD, onto its own facing, and the head
// counters with a NEGATIVE value to lift the face back up. That is the rule on
// every rig; there is no per-mech sign to look up.
//
// MEASURE A BONE ABOVE THE PIVOT. An early pass measured his HANDS and
// concluded the opposite — `torso: [25,0,0]` walked them from z +0.4 to z -0.2,
// which looks exactly like the top of the body going backward. It isn't: a
// rotation about the torso joint carries everything ABOVE it forward and
// everything BELOW it back, and his hands hang at y 2.5 under a torso joint at
// y 4.8. So the sign came out inverted and he leaned away from you for a whole
// release. Read the HEAD (or the hood), never a hanging limb.
// THE HOLD IS THE ONLY PART THAT SHORTENED. He reaches the drawn-up lean at
// 1.396s and the rest of the clip is him standing in it; `dur` 2.9 spent 1.504s
// there, which is a long time to look at a pose that has stopped changing. It
// is 0.902s now — 40% off the PAUSE, with the draw-up itself untouched, because
// the rise is the part that is still moving and cutting into it would only make
// the growth snap. Everything else is timed off this: the fighter reads `dur`
// for when to hand over, so the dispersal simply arrives sooner.
const WRAITH_TAUNT = {
  dur: 2.3, cancelOnMove: true,
  keys: [
    { t: 0, pose: {} },
    // drawing himself UP and slightly OVER you — chin lifting, arms opening,
    // the hips carrying the forward tip. Held from here to the last frame.
    { t: 1.3964, ease: 'outCubic', pose: { hipsPos: [0, 0.12, 0], hipsRot: [10.37, 1.65, -0.1],
      torso: [-5, 0, 0], head: [-8, 0, 0],
      shoulderL: [-16, 0, -42], elbowL: [-30, 0, 0], shoulderR: [-16, 0, 42], elbowR: [-30, 0, 0] } },
  ],
  events: [{ t: 0.1, type: 'sfx', arg: 'cloak' }, { t: 0.55, type: 'sfx', arg: 'powerup' }],
};

// INFERNO — arms CROSSED over the chest while the machine vents. His taunt is
// the one that is all effect (stackToot in stackfx.js: the burners go dark and
// he blows soot out of every nozzle in a toot-toot rhythm), so the pose exists
// to give the venting a body to happen on: planted, arms folded, chin up, doing
// nothing about you at all.
//
// THE FOREARMS RUN SIDEWAYS, NOT UPWARD, and that is a shoulder YAW rather than
// the pitch-and-fold a person would guess at. Measured on the model (hand
// against elbow): the first pass' deep fold left each forearm tilted 31 degrees
// UP with the fists stacked in front of his chin; these numbers put the tilt at
// -1.9 degrees, 69% of the forearm's length running laterally, and each hand a
// little past the far side of his centreline. That is arms crossed.
// INFERNO'S VENT RHYTHM — one set of numbers that BOTH the pose and the smoke
// are built from.
//
// The taunt is a body and an effect doing the same thing: arms crossed while he
// blows, arms down while he does not. Those were two hand-written schedules
// once — key times in the clip, window times in fighter.js — which is two
// places to edit and one of them silently wrong the moment they disagree. Now
// the clip's keys are GENERATED from this table (infernoVentPlan below) and
// Fighter.tauntVenting reads the same plan for its emission windows, so a
// change here moves the arms and the smoke together.
//
// Seconds. The shape is: cross the arms, PUFF, breathe, PUFF, hold the pose a
// beat longer, drop the arms and wait — then do it all again.
export const INFERNO_VENT = {
  lead: 0.34,     // arms come up into the fold
  puff: 0.4,      // one puff of smoke
  gap: 0.3,       // between the two puffs of a pair
  hold: 0.2,      // arms stay crossed after the second puff
  relax: 1.5,     // arms down, waiting, between pairs
  cross: 0.28,    // how long the arms take to fold / unfold
  cycles: 1,      // pairs of puffs (press taunt again for another)
  out: 0.45,      // the last drop back to rest
};

/**
 * The rhythm above, resolved into absolute times. One source for the clip's
 * keyframes and for the emission windows — see INFERNO_VENT.
 * Returns { dur, cycles: [{ cross, puffs: [[a,b],[a,b]], crossEnd }] }.
 */
export function infernoVentPlan(V = INFERNO_VENT) {
  const cycleLen = 2 * V.puff + V.gap + V.hold + V.relax;
  const cycles = [];
  for (let c = 0; c < V.cycles; c++) {
    const s = V.lead + c * cycleLen;
    cycles.push({
      cross: s,                                        // arms folded BY here
      puffs: [[s, s + V.puff], [s + V.puff + V.gap, s + 2 * V.puff + V.gap]],
      crossEnd: s + 2 * V.puff + V.gap + V.hold,       // …and start unfolding
    });
  }
  const last = cycles[cycles.length - 1];
  return { cycles, dur: last.crossEnd + V.out, V };
}

// The fold itself — the owner's, set by hand in the pose workbench.
//
// (Do not tidy the right shoulder's euler. 120.9 / -82.35 / 166.68 looks like a
// mistake next to the left arm's numbers and is the same orientation reached
// the other way round the gimbal — it is what the gizmo produced, and
// "simplifying" it moves the arm.)
const INFERNO_FOLD = {
  torso: [-6, 0, 0], head: [-10, 0, 0], hipsPos: [0, 0.04, 0],
  shoulderL: [-69.15, 73.87, 25.75], elbowL: [-73.52, 1.68, 0.44],
  shoulderR: [120.9, -82.35, 166.68], elbowR: [-51.84, -13.94, -0.93],
};
// …and what he stands in between the pairs: arms down at his sides, still up on
// his toes about it. NOT rest — rest is where the clip ENDS, and dropping all
// the way there mid-taunt reads as the taunt finishing twice.
const INFERNO_EASY = {
  torso: [-2, 0, 0], head: [-4, 0, 0], hipsPos: [0, 0.01, 0],
  shoulderL: [-10, 8, -6], elbowL: [-26, 0, 0],
  shoulderR: [-10, -8, 6], elbowR: [-26, 0, 0],
};

// INFERNO — arms folded while the machine vents, in pairs, relaxing between.
// Every key time comes off INFERNO_VENT, so the pose cannot drift out of step
// with the smoke; the FOLD is repeated verbatim on each key that holds it,
// because a clip track is sparse and an arm named once and then not again
// until the rest key does not hold, it drifts there across the whole clip.
const INFERNO_TAUNT = (() => {
  const plan = infernoVentPlan();
  const V = plan.V;
  const keys = [{ t: 0, pose: {} }];
  plan.cycles.forEach((cy, i) => {
    // fold (the first one rises out of the neutral start, later ones out of the
    // relaxed carriage they were left in)
    keys.push({ t: cy.cross, ease: 'outBack', pose: { ...INFERNO_FOLD } });
    // …held, dead still, right through both puffs and the extra beat after
    keys.push({ t: cy.crossEnd, ease: 'linear', pose: { ...INFERNO_FOLD } });
    if (i < plan.cycles.length - 1) {
      keys.push({ t: cy.crossEnd + V.cross, ease: 'inOutQuad', pose: { ...INFERNO_EASY } });
      keys.push({ t: plan.cycles[i + 1].cross - V.cross, ease: 'linear', pose: { ...INFERNO_EASY } });
    }
  });
  keys.push({ t: plan.dur, ease: 'inOutQuad', pose: REST_FULL });
  return {
    dur: plan.dur, cancelOnMove: true, keys,
    events: [{ t: V.lead, type: 'sfx', arg: 'taunt' }],
  };
})();

// HOW LONG HE STANDS THERE AFTER THE ICE GOES. Read by BOTH the clip below and
// Fighter.iceTaunt, which is the point: the block vanishing and the pose that
// is on screen when it does are one event, and two hand-kept schedules for it
// is one of them silently wrong the moment either moves.
export const GLACIER_FREEZE = {
  still: 1.0,    // frozen solid, in the fog, before anything moves
  relax: 0.45,   // …and unwinding out of it
};
const GLACIER_ICE_OUT = 2.30;          // when the block goes
const GLACIER_FROZEN = {
  torso: [6, 0, 0], head: [3, 0, 0], hipsPos: [0, -0.2, 0],
  shoulderL: [0, 6, 2], shoulderR: [0, -6, -2], elbowL: [-10, 0, 0], elbowR: [-10, 0, 0],
  handL: [0, 0, -6], handR: [0, 0, 6],
  thighL: [-5, 0, 7], thighR: [-5, 0, -7], kneeL: [13, 0, 0], kneeR: [13, 0, 0],
  ankleL: [-8, 0, 0], ankleR: [-8, 0, 0],
};
const GLACIER_TAUNT = {
  // GLACIER — he freezes himself SOLID. For most of this clip he is not on
  // screen at all: he cross-fades into a single block of ice (Fighter.iceTaunt,
  // roster `tauntIce`), and at the end the block is simply GONE, in one frame,
  // in a burst of frost.
  //
  // SO THE POSE IS THE PART YOU CAN SEE, AND IT IS A BODY COMING TO A STOP.
  // Arms DOWN at his sides — the elbows barely bent, nothing raised, nothing
  // held out — knees drawn together, head level: a column, because that is what
  // the ice has to be able to be. The keys are spaced so the motion decelerates
  // (0.3s to most of the way, another 0.5s to the rest of it) and then he is
  // dead still for the two seconds the block stands, which is the difference
  // between a frozen mech and a mech holding a pose.
  //
  // He holds it while frozen — the fade is on the RENDER, the animator keeps
  // running underneath — so he comes back out in the pose he went in.
  dur: GLACIER_ICE_OUT + GLACIER_FREEZE.still + GLACIER_FREEZE.relax, cancelOnMove: true,
  keys: [
    { t: 0, pose: {} },
    // most of the way there, fast
    { t: 0.30, ease: 'outQuad', pose: { torso: [4, 0, 0], head: [2, 0, 0], hipsPos: [0, -0.14, 0],
      shoulderL: [-2, 4, 4], shoulderR: [-2, -4, -4], elbowL: [-16, 0, 0], elbowR: [-16, 0, 0],
      thighL: [-4, 0, 5], thighR: [-4, 0, -5], kneeL: [10, 0, 0], kneeR: [10, 0, 0] } },
    // …and the last of it slowly, so he SETTLES rather than arriving
    { t: 0.80, ease: 'outCubic', pose: { torso: [6, 0, 0], head: [3, 0, 0], hipsPos: [0, -0.2, 0],
      shoulderL: [0, 6, 2], shoulderR: [0, -6, -2], elbowL: [-10, 0, 0], elbowR: [-10, 0, 0],
      handL: [0, 0, -6], handR: [0, 0, 6],
      thighL: [-5, 0, 7], thighR: [-5, 0, -7], kneeL: [13, 0, 0], kneeR: [13, 0, 0], ankleL: [-8, 0, 0], ankleR: [-8, 0, 0] } },
    // frozen: not one joint moves. TWO of these — the block goes at the first
    // (GLACIER_FREEZE.still + .relax before the end, which Fighter.iceTaunt
    // reads off the same table) and he is still standing in it, in the fog, for
    // a whole second before the second one lets him unwind. He used to come
    // back and move on the same instant, which read as the ice turning into a
    // mech mid-stride instead of something thawing out.
    { t: GLACIER_ICE_OUT, ease: 'linear', pose: { ...GLACIER_FROZEN } },
    { t: GLACIER_ICE_OUT + GLACIER_FREEZE.still, ease: 'linear', pose: { ...GLACIER_FROZEN } },
    { t: GLACIER_ICE_OUT + GLACIER_FREEZE.still + GLACIER_FREEZE.relax, ease: 'outBack', pose: REST_FULL },
  ],
  events: [{ t: 0.30, type: 'sfx', arg: 'freeze' }],
};

// COLOSSUS — the SLOW CLAP.
//
// THE TWO POSES ARE THE OWNER'S, hand-set in the pose workbench, and the rest of
// the clip is those two repeated. What they fix is the READ: the first version
// reused the span and contact angles of his HEAVY's clap, which is a weapon —
// arms thrown wide and driven together on the horizontal — and a sarcastic clap
// is not a strike. These are asymmetric (one hand carried high and one low,
// meeting between them, and elbows folded across rather than out), so the hands
// come together UP AND DOWN in front of his chest. Small and unhurried; that is
// the whole joke.
//
// THE PAUSE IS THE CLAP. A slow clap is not four fast claps spaced out — the
// hands MEET and then STAY met, half a second, long enough that you can see him
// deciding whether to bother with the next one. So every contact is TWO keys
// carrying the identical pose with `linear` between them (interpolating a pose
// to itself is a hold), and the beat is generated from the table rather than
// hand-typed eight times, so the pause is one number to move.
export const COLOSSUS_SLOWCLAP = {
  lead: 0.34,    // arms up into the open pose
  close: 0.28,   // the hands coming together
  hold: 0.5,     // …and STAYING together
  open: 0.4,     // drawing them apart again
  claps: 4,
  out: 0.38,     // the last drop back to rest
};

const COLOSSUS_OPEN = { shoulderL: [-15.12, 13.73, -14.67], shoulderR: [-79.75, -6.3, 11.95],
  elbowL: [-30, 0, 0], elbowR: [-30, 0, 0] };
const COLOSSUS_SHUT = { shoulderL: [-44, 3, 30], shoulderR: [-44, -3, -30],
  elbowL: [6.26, -36.86, 37.78], elbowR: [-57.83, -85.37, -15.7] };

function colossusClapClip(C = COLOSSUS_SLOWCLAP) {
  const keys = [{ t: 0, pose: {} },
    { t: C.lead, ease: 'outQuad', pose: { torso: [-6, 0, 0], head: [-8, 0, 0], ...COLOSSUS_OPEN } }];
  const events = [];
  let t = C.lead;
  for (let i = 0; i < C.claps; i++) {
    t += C.close;
    keys.push({ t, ease: 'inQuad', pose: { ...COLOSSUS_SHUT } });
    events.push({ t, type: 'sfx', arg: 'block' });
    t += C.hold;
    keys.push({ t, ease: 'linear', pose: { ...COLOSSUS_SHUT } });   // the pause
    if (i === C.claps - 1) break;
    t += C.open;
    keys.push({ t, ease: 'outQuad', pose: { ...COLOSSUS_OPEN } });
  }
  keys.push({ t: t + C.out, ease: 'inOutQuad', pose: REST_FULL });
  return { dur: t + C.out, cancelOnMove: true, keys, events };
}

const COLOSSUS_TAUNT = colossusClapClip();

export const GLB_CLIP_VARIANTS = {
  tritoneChargeGlb: compile('chargeLean', TRITONE_CHARGE),
  tritoneSlamGlb: compile('heavy', TRITONE_SLAM),
  tritonePoundGlb: compile('groundPound', TRITONE_SLAM),
  tritoneLandGlb: compile('land', TRITONE_LAND),
  tritoneLandReachGlb: compile('landReach', TRITONE_LAND_REACH),
  tritoneTauntGlb: compile('taunt', TRITONE_TAUNT),
  colossusClapHoldGlb: compile('poundHold', COLOSSUS_CLAP_HOLD),
  colossusClapGlb: compile('poundSlam', COLOSSUS_CLAP),
  saurionClawRGlb: compile('saurionClawR', SAURION_CLAW_R_GLB),
  saurionClawLGlb: compile('saurionClawL', mirrorRaw(SAURION_CLAW_R_GLB)),
  saurionKick1Glb: compile('saurionKick1', SAURION_KICK1_GLB),
  saurionKick2Glb: compile('saurionKick2', SAURION_KICK2_GLB),
  infernoFlameGlb: compile('shootLoop', INFERNO_FLAME_GLB),
  // …and its mirror, for the LEFT torch's turn (roster `channelClipL`). Without
  // it the left-hand loop falls through to the shared `shootLoopL`, whose folded
  // elbow aims a forearm-mounted barrel over his own shoulder — the exact thing
  // INFERNO_FLAME_GLB exists to stop.
  infernoFlameLGlb: compile('shootLoopL', mirrorRaw(INFERNO_FLAME_GLB)),
  froggerShootGlb: compile('shoot', FROGGER_SHOOT_GLB),
  froggerShootLGlb: compile('shootL', mirrorRaw(FROGGER_SHOOT_GLB)),
  // jerry's is NOT mirrored for the L side: the body motion is symmetric on
  // purpose (any yaw moves the pods), so both compile from the same raw
  jerryShootGlb: compile('shoot', JERRY_SHOOT_GLB),
  jerryShootLGlb: compile('shootL', JERRY_SHOOT_GLB),
  kongaTaunt: compile('taunt', KONGA_TAUNT),
  tempestTaunt: compile('taunt', TEMPEST_TAUNT),
  viperTaunt: compile('taunt', VIPER_TAUNT),
  titanusTaunt: compile('taunt', TITANUS_TAUNT),
  vulcanTaunt: compile('taunt', VULCAN_TAUNT),
  wraithTaunt: compile('taunt', WRAITH_TAUNT),
  infernoTaunt: compile('taunt', INFERNO_TAUNT),
  glacierTaunt: compile('taunt', GLACIER_TAUNT),
  colossusTaunt: compile('taunt', COLOSSUS_TAUNT),
  crankyTaunt: compile('taunt', CRANKY_TAUNT),
  fenrirTaunt: compile('taunt', FENRIR_TAUNT),
  froggerTaunt: compile('taunt', FROGGER_TAUNT),
  jerryTaunt: compile('taunt', JERRY_TAUNT),
  nullbotTaunt: compile('taunt', NULLBOT_TAUNT),
  rhinoTaunt: compile('taunt', RHINO_TAUNT),
  saurionTaunt: compile('taunt', SAURION_TAUNT),
  saurionVictory: compile('victory', SAURION_VICTORY),
  // SAURION's guard, the owner's, set in the pose workbench. A PER-MECH variant
  // rather than an edit to CLIPS.block, because that clip is the whole roster's
  // guard and these angles are his: the shared one crosses two humanoid
  // forearms in front of the chest, and a raptor's arms are short, held high
  // and tucked, so it needs the shoulders further back and the elbows folded
  // harder to put anything between him and you. `upper`/`hold` come from the
  // shared clip's flags and must stay — a guard is held, and it owns the arms
  // only so he can still walk under it.
  // THE GUARD IS PER-MECH from here on, for the same reason saurion's is: the
  // shared CLIPS.block crosses two humanoid forearms in front of the chest, and
  // these four bodies are not that. All of them keep the shared clip's
  // `upper`/`hold` flags — a guard is HELD, and it owns the upper body only so
  // the mech can still walk under it.
  //
  // NOTE what `upper: true` means for authoring (animator.js): the clip's
  // tracks are filtered to UPPER_JOINTS — torso, head, shoulders, elbows, hands
  // — plus hipsPos/hipsRot. A leg key in a block clip is SILENTLY DROPPED, so
  // the legs stay with the locomotion layer and a guarding mech can still walk.
  // Jerry's export arrived with thighR/kneeR on it; they are left out here
  // because the animator would ignore them and a key that does nothing is worse
  // in the file than absent.
  tritoneBlockGlb: compile('block', {
    dur: 0.22, upper: true, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, ease: 'outCubic', pose: { torso: [10, 0, 0], head: [8, 0, 0],
        shoulderL: [16.69, 30.1, -27.25], elbowL: [-15.77, -14.89, 44.16],
        shoulderR: [25.97, -28.1, 30.72], elbowR: [-16.45, 15.53, -31.8] } },
    ],
  }),
  froggerBlockGlb: compile('block', {
    dur: 0.22, upper: true, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, ease: 'outCubic', pose: { torso: [10, 0, 0], head: [8, 0, 0],
        shoulderL: [-96.28, 35.49, 2.35], elbowL: [-27.47, 13.75, 12.52],
        shoulderR: [-70, -30, 10], elbowR: [-50.7, 1.85, -22.87] } },
    ],
  }),
  jerryBlockGlb: compile('block', {
    dur: 0.22, upper: true, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, ease: 'outCubic', pose: { torso: [10, 0, 0], head: [8, 0, 0],
        shoulderL: [-96.25, 18.27, -9.01], elbowL: [-0.07, 5.55, 57.81],
        shoulderR: [-92.98, -35.11, 16.49], elbowR: [24.35, -4.17, -71.22] } },
    ],
  }),
  kongaBlockGlb: compile('block', {
    dur: 0.22, upper: true, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, ease: 'outCubic', pose: { torso: [10, 0, 0], head: [8, 0, 0],
        shoulderL: [-16.36, 6.02, -17.54], elbowL: [-105, 0, 0],
        shoulderR: [-19.46, -27.98, 47.07], elbowR: [-105, 0, 0] } },
    ],
  }),
  saurionBlockGlb: compile('block', {
    dur: 0.22, upper: true, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, ease: 'outCubic', pose: { torso: [10, 0, 0], head: [15.29, 2.29, 5.41],
        shoulderL: [-91.84, 13.08, -29.43], elbowL: [-115.93, 4.95, 0.27],
        // BOTH wrists are posed. Only the right one was, which left the left
        // claw hanging at its rest angle behind a guard the rest of the body
        // had committed to — and a wrist nobody looked at is a wrist nobody
        // noticed was skinned badly (that is how the left-hand bind above got
        // found; see the manifest's handL rebind + feather).
        handL: [-31.64, 14.94, 1.4],
        shoulderR: [-98.46, -13.22, 42.27], elbowR: [-105, 0, 0],
        handR: [-72.72, -42.83, -38.81] } },
    ],
  }),
  // WRAITH's is per-mech for a different reason from the four above: his body IS
  // a humanoid, but his hands are not empty. The shared pose stood his RIFLE
  // straight up on end beside his head, which guards nothing and reads as a
  // salute; the owner's drops that shoulder ~12° and rolls the wrist 56°, so the
  // weapon comes DOWN ACROSS his chest and the receiver is what the blow lands
  // on. A rifle held as a bar, which is what you do with one.
  // THESE NUMBERS ARE TRACK SPACE, NOT JOINT SPACE, and on this mech the two
  // differ: his profile carries `mirrorArms`, so the right-arm tracks are what
  // actually drive the LEFT arm — the one holding the gun — with yaw and roll
  // negated on the way (animator.js, and `config.anim.trackFor` is the same
  // mapping for the pose workbench). That is why the gun arm is authored on
  // `shoulderR`/`handR`, and why reading these as "his right arm" is wrong.
  wraithBlockGlb: compile('block', {
    dur: 0.22, upper: true, hold: true,
    keys: [
      { t: 0, pose: {} },
      { t: 0.22, ease: 'outCubic', pose: { torso: [10, 0, 0], head: [8, 0, 0],
        shoulderL: [-57.64, 27.22, -11.26], elbowL: [-105, 0, 0],
        shoulderR: [-70, -30, 10], elbowR: [-105, 0, 0],
        handR: [-4.1, 5.92, -56.07] } },
    ],
  }),
  wraithLasersGlb: compile('wraithLasers', {
    dur: 1.45,
    keys: [
      { t: 0, pose: {} },
      { t: 0.3, ease: 'outCubic', pose: { hipsPos: [0, -0.06, 0], hipsRot: [3, 0, 0], torso: [10, 0, 0], head: [-6, 0, 0], shoulderL: [-18, 0, -30], shoulderR: [-18, 0, 30], elbowL: [-10, 0, 0], elbowR: [-10, 0, 0], kneeL: [10, 0, 0], kneeR: [10, 0, 0] } },
      { t: 0.68, ease: 'inOutCubic', pose: { hipsPos: [0, -0.1, 0], hipsRot: [5, 0, 0], torso: [16, 0, 0], head: [-8, 0, 0], shoulderL: [-26, 0, -38], shoulderR: [-26, 0, 38] } },
      { t: 0.95, ease: 'inOutQuad', pose: { hipsPos: [0, -0.08, 0], torso: [14, 0, 0], head: [-4, 0, 0] } },
      { t: 1.15, ease: 'inOutQuad', pose: { hipsPos: [0, -0.04, 0], torso: [8, 0, 0] } },
      { t: 1.45, ease: 'inOutQuad', pose: { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0], torso: [0, 0, 0], head: [0, 0, 0], shoulderL: [0, 0, -10], shoulderR: [0, 0, 10], elbowL: [-12, 0, 0], elbowR: [-12, 0, 0], kneeL: [0, 0, 0], kneeR: [0, 0, 0] } },
    ],
    events: [{ t: 0.14, type: 'sfx', arg: 'charge' }, { t: 0.6, type: 'sfx', arg: 'charge' }, { t: 0.88, type: 'hit', arg: 0 }, { t: 0.88, type: 'sfx', arg: 'railgun' }, { t: 0.92, type: 'shake', arg: 0.45 }],
  }),
};
