import { CONFIG } from '../core/config.js';
import { applyMechText } from '../core/text.js';

// The roster: proportions, palettes, stats, personalities, move sets.
// All combat numbers live here so balance is tuned in one place.
// (Color-scheme math lives in colorscheme.js — this file stays data.)

// the digitigrade "raptor-leg" rest stance shared by the beast mechs
// (read-only — never mutate; defs share the reference)
const DIGITIGRADE_REST = { thighL: [-31, 0, 0], thighR: [-31, 0, 0], kneeL: [57, 0, 0], kneeR: [57, 0, 0], ankleL: [-26, 0, 0], ankleR: [-26, 0, 0] };

export const ROSTER = [
  {
    id: 'titanus', name: 'TITANUS', title: 'The Iron Avalanche', icon: '👊', seed: 11,
    blurb: 'A decommissioned siege engine that refused to power down. Slow as a glacier, hits like the end of the world. Speaks rarely — mostly in earthquakes.',
    quotes: { win: '"Demolition complete. Anything else need... flattening?"', intro: '"I am the wall. I am the wrecking ball."' },
    colors: { primary: 0xbd9226, accent: 0x3e4148, glow: 0xffa832, stripes: true },
    skin: {
      primary: { base: 0xbd9226, base2: 0xa07a1e, metal: 0x7e838c, wear: 0.7, grime: 0.62, panelDepth: 4, roughPaint: 0.55, metalPaint: 0.28, normalStrength: 1.2 },
      accent: { base: 0x3e4148, base2: 0x34373d, metal: 0x8a8f96, wear: 0.6, grime: 0.6, panelDepth: 3, roughPaint: 0.55, metalPaint: 0.45, normalStrength: 1.1 },
    },
    body: { scale: 1.28, torsoW: 1.25, torsoH: 1.05, headSize: 0.9, armLen: 1.15, legLen: 1.0, hipW: 1.15, bulk: 1.1 },
    stats: { hp: 1250, speed: 7.2, jump: 12, weight: 1.0, armor: 0.22, blockMult: 0.09 },
    ui: { power: 10, speed: 3, defense: 9 },
    // telegraphed haymakers: full wind-up, and a landed punch sends the
    // victim FLYING — nobody else's fists move people like this. Both the
    // punch (hold X) and the overhead pound (hold Y) are CHARGEABLE: the
    // arm stays wound/raised while held, release strikes with banked power
    lightClips: ['bigPunch1', 'bigPunch2', 'light3'],
    punchHold: true,
    heavyClip: 'poundHold',
    heavyHold: true,
    heavyReleaseClip: 'poundSlam',
    chargeGlow: 'arms', // both raised pound arms flicker as power banks
    rangedClip: 'fistLaunch',
    rangedClipL: 'fistLaunchL', // throws alternate fists — see Fighter.doRanged
    moves: {
      light: { dmg: [46, 50, 68], knock: [16, 18, 30], range: 3.4 },
      heavy: { dmg: 105, knock: 38, range: 3.8, launch: 9 },
      ranged: { name: 'Rocket Fist', type: 'fist', dmg: 55, speed: 46, cooldown: 2.4, range: 42, knock: 14 },
      special: { id: 'grabThrow', name: 'Skyline Slam', cooldown: 8, dmg: 88, range: 4.2, throw: 32, radius: 5 },
      ult: { id: 'meteorBreaker', name: 'METEOR BREAKER', dmg: 62, count: 14, radius: 16, knock: 18 },
    },
  },
  {
    id: 'vulcan', name: 'VULCAN', title: 'The Lead Storm', icon: '🔫', seed: 22,
    blurb: 'Ex-military fire-support platform with a laugh setting stuck on maniacal. Believes every problem is just insufficient ammunition.',
    quotes: { win: '"HAHAHA! Reload and repeat! WHO\'S NEXT?!"', intro: '"Say hello to my six little friends!"' },
    // palette derived from the canonical concept image: bone-white plate,
    // oxide red panels, gunmetal frame, orange visor, red pod lenses
    colors: { primary: 0xcfc9bd, accent: 0x9c2f28, glow: 0xff8c30, glow2: 0xff2822, stripes: false },
    skin: {
      primary: { base: 0xcfc9bd, base2: 0xbdb7a9, metal: 0x8a8f96, wear: 0.4, grime: 0.4, panelDepth: 3, roughPaint: 0.5, metalPaint: 0.3, normalStrength: 1.1 },
      accent: { base: 0x9c2f28, base2: 0x8a2822, metal: 0x8a8f96, wear: 0.48, grime: 0.42, panelDepth: 3, roughPaint: 0.52, metalPaint: 0.3, normalStrength: 1.1 },
    },
    body: { scale: 1.16, torsoW: 1.28, torsoH: 1.0, headSize: 0.85, armLen: 0.95, legLen: 1.0, hipW: 1.1, bulk: 1.12 },
    stats: { hp: 950, speed: 9.5, jump: 13, weight: 0.62, armor: 0.1, blockMult: 0.12 },
    ui: { power: 7, speed: 5, defense: 5 },
    levelHands: true, // wrist counter-pitch keeps the hand hardware on the aim line (signatures.js)
    channelClip: 'gatlingLoop', // gun arm punched forward, torso twist eased — barrel on the aim line
    channelClipL: 'gatlingLoopL', // ...and its mirror, so BOTH gatlings take a turn leading
    channelSwap: 2, // seconds per hand before he swaps guns (~24 rounds a side)
    moves: {
      light: { dmg: [30, 32, 44], knock: [4, 5, 11], range: 2.9 },
      heavy: { dmg: 78, knock: 18, range: 3.2, launch: 7 },
      ranged: { name: 'Gatling Burst', type: 'gatling', dmg: 9, speed: 90, cooldown: 0.085, spread: 0.05, ammo: 160 },
      special: { id: 'missileVolley', name: 'Micro-Missile Volley', cooldown: 6.5, dmg: 22, count: 6 },
      ult: { id: 'bulletHurricane', name: 'BULLET HURRICANE', dmg: 2.6, count: 100, duration: 9 },
    },
  },
  {
    id: 'viper', name: 'VIPER', title: 'The Whispering Fang', icon: '🗡️', seed: 44,
    blurb: 'A prototype infiltration unit that developed a taste for theatrics. Strikes from angles geometry teachers refuse to acknowledge.',
    quotes: { win: '"Ssso predictable. You never even sssaw me."', intro: '"Shall we dance? You won\'t hear the music."' },
    colors: { primary: 0x4a3566, accent: 0x1a1522, glow: 0x5aff2e, stripes: false },
    skin: {
      primary: { base: 0x4a3566, base2: 0x3c2b54, metal: 0x767c86, wear: 0.36, grime: 0.28, panelDepth: 4, roughPaint: 0.46, metalPaint: 0.35, normalStrength: 1.15 },
      accent: { base: 0x1a1522, base2: 0x14101c, metal: 0x767c86, wear: 0.42, grime: 0.28, panelDepth: 4, roughPaint: 0.5, metalPaint: 0.35, normalStrength: 1.15 },
    },
    body: { scale: 1.0, torsoW: 0.85, torsoH: 0.95, headSize: 0.85, armLen: 1.05, legLen: 1.12, hipW: 0.85, bulk: 0.85 },
    restPose: DIGITIGRADE_REST,
    stats: { hp: 780, speed: 13.5, jump: 15.5, weight: 0.3, armor: 0, blockMult: 0.2 },
    gait: 'sprint', // fastest thing on the roster — it must RUN, not walk quickly
    ui: { power: 6, speed: 10, defense: 2 },
    // signature combat stance (additive over restPose; default carriage)
    combatPose: { hipsPos: [0, -0.22, 0], hipsRot: [0, 14, 0], torso: [8, -18, 0], head: [0, 16, 0], shoulderL: [-64, -10, -14], elbowL: [-30, 0, 0], shoulderR: [-20, 0, 18], elbowR: [-95, 0, 0], thighL: [-16, 0, -6], thighR: [6, 0, 6], kneeL: [20, 0, 0], kneeR: [10, 0, 0] },
    // ninja sword forms: blade-led slashes and lunging stabs off the forearm
    // energy daggers — never a punch that happens to hold a sword. The heavy
    // is a corkscrew DRILL flight: coil, then fly flat with both blades
    // speared forward, barrel-rolling through the target
    lightClips: ['viperSlash1', 'viperSlash2', 'viperStab'],
    heavyClip: 'viperDrill',
    heavySpin: { joint: 'hips', axis: 'y', rate: 30, t0: 0.34, t1: 0.74 },
    heavyDrive: { t0: 0.34, t1: 0.74, speed: 30, hold: true },
    bladeTrail: { anchors: ['bladeL', 'bladeR'], color: 0x5aff2e },
    moves: {
      // BALANCE: 94 -> 106. Viper and wraith shared the roster's lowest light
      // combo AND the only two zero-armour stat lines, which put their melee
      // exchange rate against the field at 0.49 — a quarter below the next
      // lowest (tempest, 0.64) and a QUARTER of titanus' 1.91. The design
      // answer to a thin trade is speed, and it only pays against a brick too
      // slow to close: measured, viper walks cranky (5.4 speed) 4-0 and loses
      // to titanus (7.2) 0-4 at an 80% HP margin. This narrows the trade
      // without touching what makes her a glass cannon — still the lowest
      // combo on the roster, still no armour.
      light: { dmg: [30, 32, 44], knock: [3, 4, 9], range: 3.2 },
      heavy: { dmg: 70, knock: 15, range: 3.6, launch: 8 },
      ranged: { name: 'Fang Throw', type: 'blade', dmg: 32, speed: 55, cooldown: 0.8 },
      special: { id: 'bladeCyclone', name: 'Blade Cyclone', cooldown: 6, dmg: 20 },
      ult: { id: 'serpentStorm', name: 'SERPENT STORM', dmg: 5, count: 60, paralyze: 2.4, poison: 8, poisonT: 3 },
    },
  },
  {
    id: 'rhino', name: 'RHINO', title: 'The Unstoppable Object', icon: '🐂', seed: 66,
    blurb: 'One horn. One direction. Zero brakes. RHINO once charged through four buildings to win an argument he was already winning.',
    quotes: { win: '"HRRNGH! Next time — bring a wall that works!"', intro: '"You look like something worth flattening."' },
    colors: { primary: 0x5c6066, accent: 0x8c3a32, glow: 0xff2a20, stripes: false },
    skin: {
      primary: { base: 0x5c6066, base2: 0x4c5056, metal: 0x8a8f96, wear: 0.72, grime: 0.62, panelDepth: 4, roughPaint: 0.58, metalPaint: 0.42, normalStrength: 1.25 },
      accent: { base: 0x8c3a32, base2: 0x74302a, metal: 0x8a8f96, wear: 0.74, grime: 0.62, panelDepth: 4, roughPaint: 0.58, metalPaint: 0.42, normalStrength: 1.25 },
    },
    body: { scale: 1.22, torsoW: 1.2, torsoH: 1.0, headSize: 0.95, armLen: 1.08, legLen: 0.98, hipW: 1.12, bulk: 1.1 },
    stats: { hp: 1150, speed: 8.2, jump: 12, weight: 0.9, armor: 0.18, blockMult: 0.05 },
    ui: { power: 9, speed: 4, defense: 7 },
    // signature combat stance (additive over restPose; default carriage)
    combatPose: { hipsPos: [0, -0.2, 0], hipsRot: [6, 0, 0], torso: [16, 0, 0], head: [-14, 0, 0], shoulderL: [-20, 0, -18], shoulderR: [-20, 0, 18], elbowL: [-70, 0, 0], elbowR: [-70, 0, 0], thighL: [-18, 0, -8], thighR: [-2, 0, 8], kneeL: [26, 0, 0], kneeR: [14, 0, 0] },
    moves: {
      light: { dmg: [40, 44, 60], knock: [6, 6, 14], range: 3.4 },
      heavy: { dmg: 95, knock: 24, range: 3.8, launch: 9 },
      ranged: { name: 'Shoulder Cannon', type: 'shell', dmg: 56, speed: 42, cooldown: 1.3, splash: 3, ammo: 14 },
      special: { id: 'bullRush', name: 'Bull Rush', cooldown: 6.5, dmg: 75, knock: 26, dashLen: 16 },
      ult: { id: 'stampede', name: 'STAMPEDE', dmg: 70, copies: 10, knock: 26, range: 46 },
    },
  },
  {
    id: 'tempest', name: 'TEMPEST', title: 'The Voltage Virtuoso', icon: '⚡', seed: 77,
    blurb: 'A weather-control unit that discovered showmanship. Every battle is a concert, every lightning bolt a chord. The crowd goes wild; the crowd is usually on fire.',
    quotes: { win: '"⚡ ENCORE? No? Suit yourselves. I was ELECTRIC."', intro: '"Lights up! The show starts NOW."' },
    // THE STATIC CRAWL of his taunt: the hot points an arc may jump between
    // (Fighter.arcTaunt). Two shoulder stacks, the crest on his head, the
    // crystal in his abdomen and both wrist bands — each arc picks a random
    // PAIR, so the charge finds a different path every time.
    arcTaunt: { color: 0x9fe4ff, nodes: [
      { a: 'stackL' }, { a: 'stackR' }, { j: 'head', up: 0.5 },
      { j: 'torso', up: -0.35 }, { j: 'handL' }, { j: 'handR' },
    ] },
    colors: { primary: 0x2a3560, accent: 0x1e2740, glow: 0x3fd8ff, stripes: false },
    skin: {
      primary: { base: 0x2a3560, base2: 0x222b50, metal: 0x767c86, wear: 0.3, grime: 0.22, panelDepth: 4, roughPaint: 0.44, metalPaint: 0.4, normalStrength: 1.1 },
      accent: { base: 0x1e2740, base2: 0x181f34, metal: 0x767c86, wear: 0.34, grime: 0.22, panelDepth: 4, roughPaint: 0.46, metalPaint: 0.4, normalStrength: 1.1 },
    },
    body: { scale: 1.06, torsoW: 0.95, torsoH: 1.0, headSize: 0.85, armLen: 1.02, legLen: 1.08, hipW: 0.9, bulk: 0.9 },
    // light athletic crouch — dead-straight legs read stiff in motion
    restPose: { thighL: [-13, 0, 0], thighR: [-13, 0, 0], kneeL: [24, 0, 0], kneeR: [24, 0, 0], ankleL: [-11, 0, 0], ankleR: [-11, 0, 0] },
    stats: { hp: 880, speed: 11.5, jump: 15, weight: 0.42, armor: 0.04, blockMult: 0.14 },
    gait: 'sprint', // light and quick: reaching stride, driving arms
    ui: { power: 7, speed: 8, defense: 3 },
    // HIS CHIMNEYS CRACKLE. The GLB carried two sculpted "spark" squiggles on
    // the stack mouths — a frozen zigzag of triangles standing in for
    // electricity, which is the one thing electricity is never still enough to
    // be. `dropGeo` takes them off (they share their bones with the whole
    // shoulder pauldron, so unlike inferno there was no bone to name) and this
    // burns in their place: bursts of little sparks popping out of each mouth,
    // a lip glow pulsing with them, and the odd short arc licking off the rim.
    // Same block as inferno's burners with `kind: 'spark'` — see stackfx.js.
    // `anchors` are the manifest anchors on the chimney bones; `joints` is the
    // fallback for the procedural body, which has no chimneys at all.
    stackFx: {
      kind: 'spark',
      anchors: ['stackL', 'stackR'], joints: ['shoulderL', 'shoulderR'], lift: 1.15,
      sparkGap: 0.09, color: 0xd8f6ff, color2: 0x3fd8ff, arc: 0x9fdcff,
    },
    // signature combat stance (additive over restPose; default carriage)
    combatPose: { hipsPos: [0, -0.12, 0], hipsRot: [0, -18, 0], torso: [4, 20, 0], head: [0, -16, 0], shoulderR: [-72, -10, 6], elbowR: [-24, 0, 0], shoulderL: [-14, -6, -26], elbowL: [-60, 0, 0], thighL: [6, 0, -6], thighR: [-22, 0, 6], kneeL: [10, 0, 0], kneeR: [28, 0, 0] },
    // heavy: spins up into a grinding tornado that TRAVELS — real forward
    // drive while whirling, two hit beats (dmg per-beat), and the hits
    // launch/knock down like any other heavy
    heavyClip: 'tempestTornado',
    // spin: 20% faster than the original 24 rad/s and the whirl runs 35%
    // longer (0.6s -> 0.81s), so the clip carries a longer recovery tail;
    // the drive window stretches with it so the tornado keeps travelling for
    // as long as it keeps turning
    // the tornado's whole shape is arms-OUT, so it opts out of the strike
    // servo's palm convergence (fighter.js doHeavy) — that servo is built for
    // a two-fisted pound and would drag the T back onto the body
    heavyNoStrikeAim: true,
    heavySpin: { joint: 'hips', axis: 'y', rate: 28.8, t0: 0.26, t1: 1.07 },
    heavyDrive: { t0: 0.3, t1: 1.03, speed: 18 },
    heavyAura: 'tornado',
    moves: {
      light: { dmg: [28, 30, 44], knock: [4, 4, 10], range: 3.2 },
      heavy: { dmg: 42, knock: 16, range: 3.6, launch: 9 },
      ranged: { name: 'Arc Bolt', type: 'lightning', dmg: 40, cooldown: 0.9, chainRange: 8, ammo: 20 },
      special: { id: 'staticField', name: 'Static Overload', cooldown: 7, dmg: 70, radius: 8 },
      ult: { id: 'thunderfall', name: 'THUNDERFALL', dmg: 13, radius: 26, duration: 3.4 },
    },
  },
  {
    id: 'fenrir', name: 'FENRIR', title: 'The Last Wild Thing', icon: '🐺', seed: 88,
    blurb: 'An autonomous hunter-frame that slipped its leash decades ago. Runs with no pack, answers to no handler, howls at every full moon — and every explosion.',
    quotes: { win: '"*low growl* ...The hunt was short. Run faster next time."', intro: '"I smell fear-coolant. It\'s yours."' },
    colors: { primary: 0xb4b9c0, accent: 0x3a3e44, glow: 0x6cd8ff, stripes: false },
    skin: {
      primary: { base: 0xb4b9c0, base2: 0x9aa0a8, metal: 0xd0d4da, wear: 0.46, grime: 0.36, panelDepth: 4, roughPaint: 0.38, metalPaint: 0.62, normalStrength: 1.15 },
      accent: { base: 0x3a3e44, base2: 0x30343a, metal: 0x8a8f96, wear: 0.5, grime: 0.36, panelDepth: 3, roughPaint: 0.5, metalPaint: 0.5, normalStrength: 1.1 },
    },
    body: { scale: 1.05, torsoW: 1.0, torsoH: 0.95, headSize: 0.9, armLen: 1.08, legLen: 1.1, hipW: 0.9, bulk: 0.92 },
    restPose: DIGITIGRADE_REST,
    stats: { hp: 900, speed: 12.5, jump: 15, weight: 0.45, armor: 0.05, blockMult: 0.13 },
    ui: { power: 7, speed: 9, defense: 3 },
    // signature combat stance (additive over restPose; default carriage)
    combatPose: { hipsPos: [0, -0.18, 0], hipsRot: [8, 0, 0], torso: [10, 0, 0], head: [-10, 0, 0], shoulderL: [-42, 6, -10], shoulderR: [-42, -6, 10], elbowL: [-56, 0, 0], elbowR: [-56, 0, 0], handL: [24, 0, 0], handR: [24, 0, 0], thighL: [-14, 0, -7], thighR: [-2, 0, 7], kneeL: [20, 0, 0], kneeR: [10, 0, 0] },
    gait: 'quad', // wolf lope: fronts reach, hinds drive together
    // the spike LEAP is the whole body as the weapon: let the strike servo
    // steer the claws through the arms only, never by slewing the shell, or
    // he lunges off at an angle and stays there (see fighter.twistLocked)
    noTwistClips: ['fenrirSpike'],
    // heavy: he leaps first and the spiked mane flares out DURING the jump —
    // porcupine-style, growing all flight long and peaking exactly at the
    // moment of impact — so the target meets the ruff at its biggest
    heavyClip: 'fenrirSpike',
    heavyDrive: { t0: 0.38, t1: 0.68, speed: 24, up: 8 },
    heavyFlare: { joint: 'mane', scale: [2.4, 2.4, 2.4], t0: 0.29, t1: 0.82 },
    moves: {
      light: { dmg: [30, 32, 46], knock: [4, 5, 11], range: 3.3 },
      heavy: { dmg: 76, knock: 18, range: 3.7, launch: 8 },
      ranged: { name: 'Rend Wave', type: 'wave', dmg: 36, speed: 34, cooldown: 1.0, ammo: 18 },
      special: { id: 'pounce', name: 'Lunar Pounce', cooldown: 5.5, dmg: 65, leap: 14 },
      // WILD HUNT: the pack rifts in all over the arena and runs the nearest
      // enemy down. TWO lifetimes — `duration` is how long a wolf that has
      // already bitten sticks around, `huntMax` how long one that has NOT
      // keeps hunting (it spawned across the block; it should get there).
      ult: { id: 'wildHunt', name: 'WILD HUNT', dmg: 9, count: 20, radius: 20, duration: 4.5, huntMax: 10 },
    },
  },
  {
    id: 'colossus', name: 'COLOSSUS', title: 'The Patient Thunder', icon: '💣', seed: 99,
    blurb: 'A firebase that learned to walk, then learned chess. Plays the long game: every shell placed three moves ahead of where you plan to be.',
    quotes: { win: '"Checkmate was eight shells ago. You just heard it now."', intro: '"Range confirmed. This will be educational."' },
    colors: { primary: 0xa08a64, accent: 0x4a4640, glow: 0xffc23c, stripes: true },
    skin: {
      primary: { base: 0xa08a64, base2: 0x8a7654, metal: 0x7e838c, wear: 0.66, grime: 0.62, panelDepth: 4, roughPaint: 0.6, metalPaint: 0.26, normalStrength: 1.2 },
      accent: { base: 0x4a4640, base2: 0x3c3934, metal: 0x7e838c, wear: 0.6, grime: 0.62, panelDepth: 3, roughPaint: 0.58, metalPaint: 0.38, normalStrength: 1.15 },
    },
    body: { scale: 1.3, torsoW: 1.3, torsoH: 1.0, headSize: 0.85, armLen: 1.05, legLen: 0.95, hipW: 1.2, bulk: 1.15 },
    stats: { hp: 1300, speed: 6.5, jump: 11, weight: 1.0, armor: 0.24, blockMult: 0.09 },
    ui: { power: 9, speed: 2, defense: 9 },
    // same doctrine as TITANUS: wind the fist all the way back, then send
    // whatever it lands on across the street — punches (hold X) and the
    // overhead pound (hold Y) both charge while held.
    // On his GLB the pound is REPLACED by a thunderclap (glbanim's colossus
    // clipOverrides): that shell is too wide for a pound's follow-through past
    // the hips, which swept the forearms through the chest slab. Same clip
    // names, same timings — so these two lines are the whole charge contract
    // either way, and the procedural build still pounds.
    lightClips: ['bigPunch1', 'bigPunch2', 'light3'],
    punchHold: true,
    heavyClip: 'poundHold',
    heavyHold: true,
    heavyReleaseClip: 'poundSlam',
    chargeGlow: 'arms', // both loaded heavy arms flicker as power banks
    // GLB: the cockpit head is welded into the chest slab (the retarget maps
    // `head` onto a spine bone that carries chest geometry), so it never
    // rotates on its own — the torso turns the whole shell
    rigidShell: true,
    moves: {
      light: { dmg: [42, 46, 62], knock: [15, 17, 28], range: 3.5 },
      heavy: { dmg: 100, knock: 36, range: 3.9, launch: 9 },
      ranged: { name: 'Mortar Lob', type: 'mortar', dmg: 68, speed: 30, cooldown: 1.7, splash: 5.5, ammo: 10 },
      special: { id: 'grabThrow', name: 'Skyline Toss', cooldown: 8, dmg: 85, range: 4.5, throw: 36, radius: 5 },
      ult: { id: 'colossalForm', name: 'COLOSSAL FORM', dmg: 34, scale: 4, duration: 9 },
    },
  },
  {
    id: 'wraith', name: 'WRAITH', title: 'The Hollow Echo', icon: '🎯', seed: 110,
    blurb: 'Officially, this unit was scrapped years ago. Officially, nobody is picking off mechs from 800 meters. Officially, you are perfectly safe.',
    quotes: { win: '"...you were dead before the round began."', intro: '"*static* ...target acquired."' },
    // HE LOOMS when he taunts: 1.6x for the length of the clip, and back down
    // the moment it ends or a hit interrupts it (Fighter.growTaunt).
    tauntGrow: 1.6,
    colors: { primary: 0x232228, accent: 0x1a191e, glow: 0xff2030, stripes: false },
    skin: {
      primary: { base: 0x232228, base2: 0x1c1b21, metal: 0x5e626a, wear: 0.42, grime: 0.42, panelDepth: 4, roughPaint: 0.68, metalPaint: 0.15, normalStrength: 1.15 },
      accent: { base: 0x1a191e, base2: 0x141319, metal: 0x5e626a, wear: 0.48, grime: 0.42, panelDepth: 4, roughPaint: 0.68, metalPaint: 0.15, normalStrength: 1.15 },
    },
    body: { scale: 1.02, torsoW: 0.85, torsoH: 1.0, headSize: 0.9, armLen: 1.05, legLen: 1.1, hipW: 0.85, bulk: 0.82 },
    restPose: { thighL: [-26, 0, 0], thighR: [-26, 0, 0], kneeL: [49, 0, 0], kneeR: [49, 0, 0], ankleL: [-23, 0, 0], ankleR: [-23, 0, 0] },
    stats: { hp: 800, speed: 11, jump: 14, weight: 0.35, armor: 0, blockMult: 0.2 },
    gait: 'sprint', // a stalker who covers ground in long, low strides
    ui: { power: 8, speed: 7, defense: 2 },
    // signature combat stance (additive over restPose; default carriage)
    combatPose: { hipsPos: [0, -0.16, 0], hipsRot: [0, 16, 0], torso: [10, -20, 0], head: [-6, 18, 0], shoulderL: [-46, -12, -10], elbowL: [-40, 0, 0], shoulderR: [-10, 6, 14], elbowR: [-30, 0, 0], thighL: [-16, 0, -5], thighR: [4, 0, 7], kneeL: [24, 0, 0], kneeR: [10, 0, 0] },
    // heavy: the tattered cloak spreads into a vast wing-wall, then the two
    // spike-wing halves ROLL outward and up — fanning open like wings until
    // the blades point above his head — and only then do the wing-tips fire
    heavyClip: 'wraithLasers',
    heavyFx: 'wingLasers',
    heavyFlare: { joint: 'cloak', scale: [2.8, 2.2, 1.4], t0: 0.08, t1: 1.12 },
    heavyRaise: [
      { joint: 'cloakL', rot: [0, 0, -2.2], t0: 0.3, t1: 1.1, ramp: 0.34 },
      { joint: 'cloakR', rot: [0, 0, 2.2], t0: 0.3, t1: 1.1, ramp: 0.34 },
    ],
    moves: {
      // BALANCE: 94 -> 106, the same trade-rate fix as viper's above (they
      // shared the number and both carry zero armour). His reach stays the
      // shortest on the roster at 3.0.
      light: { dmg: [30, 32, 44], knock: [3, 4, 9], range: 3.0 },
      heavy: { dmg: 68, knock: 15, range: 3.4, launch: 7 },
      ranged: { name: 'Night Swarm', type: 'bats', dmg: 26, count: 3, speed: 24, cooldown: 1.5, ammo: 12 },
      special: { id: 'ghostWalk', name: 'Ghost Protocol', cooldown: 9, dmg: 60, speed: 17, duration: 5 },
      ult: { id: 'deathSwarm', name: 'DEATH SWARM', dmg: 4, count: 150, duration: 7 },
    },
  },
  {
    id: 'inferno', name: 'INFERNO', title: 'The Joyful Furnace', icon: '🔥', seed: 121,
    blurb: 'A demolition unit whose safety governor "fell off" — twice. Finds fire genuinely hilarious. The laughter you hear over the flames? That\'s him having the best day ever.',
    quotes: { win: '"AHAHA! TOASTY! Anyone else cold? ANYONE?"', intro: '"Who ordered the flame-grilled special?!"' },
    colors: { primary: 0x8a3626, accent: 0x2a2624, glow: 0xff8a1e, stripes: true },
    skin: {
      primary: { base: 0x8a3626, base2: 0x6e2a1e, metal: 0x6e737c, wear: 0.75, grime: 0.7, panelDepth: 4, roughPaint: 0.62, metalPaint: 0.3, normalStrength: 1.25 },
      accent: { base: 0x2a2624, base2: 0x201d1c, metal: 0x6e737c, wear: 0.6, grime: 0.7, panelDepth: 3, roughPaint: 0.6, metalPaint: 0.4, normalStrength: 1.2 },
    },
    body: { scale: 1.18, torsoW: 1.18, torsoH: 1.0, headSize: 0.9, armLen: 1.05, legLen: 0.98, hipW: 1.08, bulk: 1.05 },
    stats: { hp: 1050, speed: 8.8, jump: 12.5, weight: 0.75, armor: 0.14, blockMult: 0.11 },
    ui: { power: 8, speed: 4, defense: 6 },
    levelHands: true, // wrist counter-pitch keeps the hand hardware on the aim line (signatures.js)
    // BOTH TORCHES TAKE A TURN. He carries a flame barrel on each forearm, and
    // until now every jet left the right one while the left arm held the same
    // pose for nothing. Same mechanism as vulcan's twin gatlings — a mirrored
    // channel clip plus a swap CLOCK, because a flame ticks every 0.09s and
    // trading hands per tick would just average into one half-raised stance.
    channelClip: 'shootLoop',
    channelClipL: 'shootLoopL',
    channelSwap: 1.3,
    // HIS CHIMNEYS BURN. The GLB used to carry two sculpted tongues of flame on
    // the shoulder stacks; `dropBones` takes that geometry off and caps the
    // mouths, and Fighter.updateStackFlames burns here instead — flickering
    // tongues, embers, and a smoke column he walks out from under. `anchors`
    // are manifest anchors on the chimney bones; `joints` is the fallback for
    // the procedural body, which has no chimneys (lifted `lift` above the
    // shoulder). Gaps are SECONDS BETWEEN particles at a standstill; `smokeRun`
    // is how much more smoke a full sprint makes.
    // THE BURNERS. Four now, not two: the shoulder chimneys and both HAND
    // TORCHES, whose sculpted flame tongues the manifest drops exactly as it
    // drops the chimneys' (dropBones nozzleL/nozzleR — the bones stay, so the
    // muzzle anchors that ride them are untouched). `torches` names which of
    // the anchors burn small, and `flameH` halves the height of the column the
    // chimneys throw.
    stackFx: {
      anchors: ['stackL', 'stackR', 'muzzleR', 'muzzleL'],
      joints: ['shoulderL', 'shoulderR', 'handR', 'handL'], lift: 0.9,
      // the torches are HALF the chimneys again — a pilot light on a barrel,
      // not a second pair of stacks — and they burn down the barrel's own +Z
      // rather than upward, so each one reads as a little flamethrower held in
      // the hand and swings with the arm
      torches: ['muzzleR', 'muzzleL'], torchSize: 0.5, torchH: 0.25,
      flameH: 0.5,
      flameGap: 0.055, smokeGap: 0.14, smokeRun: 2.4,
    },
    // signature combat stance (additive over restPose; default carriage)
    combatPose: { hipsPos: [0, -0.12, 0], torso: [8, 0, 0], head: [-6, 0, 0], shoulderL: [-44, 10, -12], shoulderR: [-44, -10, 12], elbowL: [-30, 0, 0], elbowR: [-30, 0, 0], thighL: [-12, 0, -8], thighR: [0, 0, 8], kneeL: [18, 0, 0], kneeR: [10, 0, 0] },
    moves: {
      // …and the FINISHER SETS YOU ALIGHT. Only the last blow of the string
      // carries it (fighter.js doLight reads `comboStatus` on the final index),
      // so it is a reward for landing the whole combo rather than something a
      // single poke hands out — 18 damage over 3s, about a third of the punch
      // that delivered it.
      light: { dmg: [36, 38, 54], knock: [5, 5, 12], range: 3.3, comboStatus: { burn: 6, burnT: 3 } },
      heavy: { dmg: 86, knock: 20, range: 3.7, launch: 8 },
      // reach 12 -> 16 and the cone tightened (see the flame handler in
      // world.js): a longer, narrower jet rather than a short wide wash
      ranged: { name: 'Dragon\'s Breath', type: 'flame', dmg: 6.5, cooldown: 0.09, range: 16, ammo: 130 },
      special: { id: 'napalm', name: 'Napalm Carpet', cooldown: 7.5, dmg: 14, patches: 5, duration: 5 },
      ult: { id: 'fireTornado', name: 'FIRE TORNADO', dmg: 130, radius: 4.5, duration: 7 },
    },
  },
  {
    id: 'glacier', name: 'GLACIER', title: 'The Cold Shoulder', icon: '❄️', seed: 132,
    blurb: 'Guardian of a polar research station, promoted to war machine by boredom. Devastating in combat, insufferable at parties — every joke is about ice, and he thinks they all land.',
    quotes: { win: '"Ice to beat you. ...I\'m contractually obligated to say that."', intro: '"Chill out. No? Fine — I\'ll handle it."' },
    // HIS TAUNT FREEZES HIM SOLID — the model is swapped for a single block of
    // ice his own size, steaming, until the clip ends or he is hit
    // (Fighter.iceTaunt).
    tauntIce: true,
    colors: { primary: 0x9fb2c2, accent: 0x4c5560, glow: 0x7ce0ff, stripes: false },
    skin: {
      primary: { base: 0x9fb2c2, base2: 0xd0dce6, metal: 0x7e838c, wear: 0.5, grime: 0.28, panelDepth: 4, roughPaint: 0.5, metalPaint: 0.3, normalStrength: 1.2 },
      accent: { base: 0x4c5560, base2: 0x3e4650, metal: 0x8a8f96, wear: 0.44, grime: 0.3, panelDepth: 3, roughPaint: 0.52, metalPaint: 0.45, normalStrength: 1.1 },
    },
    body: { scale: 1.24, torsoW: 1.22, torsoH: 1.0, headSize: 0.9, armLen: 1.08, legLen: 0.98, hipW: 1.1, bulk: 1.08 },
    stats: { hp: 1200, speed: 7.5, jump: 12, weight: 0.92, armor: 0.2, blockMult: 0.10 },
    ui: { power: 8, speed: 3, defense: 8 },
    // the icicle launcher IS the ice lance, and he carries it in his LEFT hand
    // — fire from that barrel with the mirrored shot clip so the barrage
    // leaves the weapon instead of the empty claw (glbanim levels the lance)
    rangedClip: 'shootL',
    primaryMuzzle: 'muzzleL',
    channelClip: 'shootLoopL', // the Cryo Beam pours out of the lance, so the LEFT arm holds it up
    // GLB: the skull is sunk into the chest block — no neck, so the head never
    // rotates against the torso (animator shell-lock + fighter.js turn-lead)
    rigidShell: true,
    moves: {
      light: { dmg: [38, 42, 58], knock: [5, 6, 13], range: 3.4 },
      heavy: { dmg: 92, knock: 22, range: 3.8, launch: 9 },
      ranged: { name: 'Icicle Barrage', type: 'shard', dmg: 13, count: 6, speed: 48, cooldown: 1.15, ammo: 22 },
      special: { id: 'freezeBeam', name: 'Cryo Beam', cooldown: 8, dmg: 12, duration: 1.8, slow: 0.45 },
      ult: { id: 'absoluteZero', name: 'ABSOLUTE ZERO', dmg: 9, radius: 14 },
    },
  },
  {
    id: 'cranky', name: 'CRANKY', title: 'The Abyssal Bulwark', icon: '🦀', seed: 137,
    // a crab does not counter-rotate its waist: he keeps turning as one body
    // rather than walking his splayed legs off in another direction (see
    // Animator.legFrame). Jerry and fenrir are excluded by their own gaits.
    strafeLegs: false,
    // SIX LEGS ON ONE PHASE. His custom rig carries all of them as real bones
    // and the BACK pair is the game's own leg joints, so the hexapod gait drives
    // two of them through the ordinary stride and the other four through its
    // `hex` block — one clock, one cadence, matched to how fast he is actually
    // travelling (see GAITS.hexapod).
    gait: 'hexapod',
    blurb: 'A deep-sea salvage rig that got tired of being salvaged. Waddled ashore trailing kelp and grudges, shell first, questions never. The claws are non-negotiable.',
    quotes: { win: '"*bubbling chuckle* Shell: 1. Everything else: 0."', intro: '"You look... crackable."' },
    // canonical image: rust-orange patchy shell over dark steel, blue-steel
    // water cannons + tanks on the shoulders, quad blue LED eyes
    colors: { primary: 0xa64a28, accent: 0x46759e, glow: 0x4fc3ff, stripes: false },
    skin: {
      primary: { base: 0xa64a28, base2: 0x7c3a1e, metal: 0x564e46, wear: 0.78, grime: 0.7, panelDepth: 4, roughPaint: 0.62, metalPaint: 0.3, normalStrength: 1.3 },
      accent: { base: 0x46759e, base2: 0x3a6288, metal: 0x9aa2aa, wear: 0.55, grime: 0.5, panelDepth: 3, roughPaint: 0.45, metalPaint: 0.5, normalStrength: 1.15 },
    },
    body: { scale: 1.3, torsoW: 1.5, torsoH: 0.85, headSize: 0.6, armLen: 1.18, legLen: 0.85, hipW: 1.32, bulk: 1.25 },
    restPose: { shoulderL: [8, 0, -26], shoulderR: [8, 0, 26], elbowL: [-38, 0, 0], elbowR: [-38, 0, 0], thighL: [-8, 0, -8], thighR: [-8, 0, 8], kneeL: [16, 0, 0], kneeR: [16, 0, 0], ankleL: [-8, 0, 0], ankleR: [-8, 0, 0] },
    // SPEED 5.4 IS DELIBERATE, AND MAKING HIM FASTER MADE HIM WORSE — measured,
    // so that the next person to look at this table does not spend the
    // afternoon re-deriving it. He has the roster's third-best melee exchange
    // rate (1.83 against the field, behind only titanus and colossus) and looks
    // like he can never spend it, so 6.5 was tried on exactly that reasoning.
    // Against konga, who did not change, it went from 1W 3L / -42% to
    // 0W 5L 1D / -71% over six matches (tools/scratch/arena1v1.mjs) — and one
    // of those was a 90-second stalemate at 100% each, two mechs that never
    // engaged at all. Against titanus it moved -59% -> -50%, inside the noise.
    // The reading: at 5.4 he is slow enough that the AI plays him as a ZONER
    // and keeps him at hose range; at 6.5 he starts trying to close, and
    // arrives in melee having spent the approach being hit. If he needs help it
    // is his REACH that wants it, not his legs.
    stats: { hp: 1300, speed: 5.4, jump: 9, weight: 0.95, armor: 0.26, blockMult: 0.04 },
    ui: { power: 8, speed: 3, defense: 10 },
    levelHands: true, // wrist counter-pitch keeps the hand hardware on the aim line (signatures.js)
    // signature combat stance (additive over restPose; default carriage)
    combatPose: { hipsPos: [0, -0.1, 0], torso: [6, 0, 0], head: [-4, 0, 0], shoulderL: [-38, 0, -14], shoulderR: [-38, 0, 14], elbowL: [-26, 0, 0], elbowR: [-26, 0, 0], thighL: [-6, 0, -6], thighR: [-6, 0, 6] },
    // TOP-HEAVY SHELL: a big enough blow doesn't just floor him, it turns him
    // clean over onto his back — legs at the sky, stranded until he rolls
    // himself upright. Threshold + odds live in fighter.js (ROLLOVER_*), keyed
    // off the damage DEALT: nothing VIPER throws can do it, a fully charged
    // COLOSSUS haymaker is a coin flip, his charged heavy nearly always does.
    rollover: true,
    heavyClip: 'clawSnap', // giant pincer SNAP, not a pound
    // the pincer clap is ARM-driven: hold off the torso/head aim twist so the
    // claws yaw out and back in without the shell slewing round (fighter.js)
    noTwistClips: ['clawSnap'],
    // GLB: head + mouth + torso are one crab carapace — the head never rotates
    // against the shell (fighter.js turn-lead; glbanim pins the pose side)
    rigidShell: true,
    channelClip: 'shootLow', // hose cannons fire from the hip, never raised
    // HE STEPS INTO THE CLAP. `clawSnap` is a symmetric pincer clap — the arms
    // go WIDE and smash together on the centreline, so its travel is lateral
    // and it reaches nowhere forward at all (measured limb extension 2.58,
    // against titanus' 3.50). Titanus closes that gap by walking into his own
    // swing: his punchHold release fires a `_chargeLunge` that carries him
    // 1.0-1.5 units through the blow, which cranky, having no charge mechanic,
    // never got. `heavyDrive` is the same thing as plain data — a forward push
    // over a window of the clip, the mechanism aegis' lance lunge and saurion's
    // bite already use. The window brackets the hit at 0.32, so he arrives WITH
    // the claws rather than after them.
    heavyDrive: { t0: 0.10, t1: 0.36, speed: 7 },
    moves: {
      // BALANCE: 3.6 -> 4.6 and 3.9 -> 4.7. `range` is NOT the reach — it sets
      // the swing capsule's radius and how far past the fist it extends
      // (Fighter.strikeVolume); the hit is the swept LIMB against the victim's
      // hurtbox, so the roster number is an ALLOWANCE ADDED TO THE MODEL, not a
      // description of it — the game's reach is always the limb plus padding,
      // never less than the limb, and how much padding each mech gets was never
      // checked against how far its arms actually go. Cranky's number is
      // already above titanus' and konga's and he still reaches far less far
      // than either. Measured forward extension of the striking limb itself
      // (tools/scratch/fistreach.mjs): konga 4.43, titanus 3.17, cranky 2.67 —
      // his pincers sit out to the sides of a wide shell instead of punching
      // forward. Titanus ALSO steps 1.0-1.5 into his own swing where cranky and
      // konga step nothing, so the end-to-end number below bundles limb,
      // allowance, step-in and the victim's own capsules; do not read it as
      // limb length alone. Measured
      // (tools/scratch/meleereach.mjs, victim pinned dead ahead, last distance
      // that still connects): cranky light 6.5 against titanus 9.0 and konga
      // 10.25 — titanus' JAB out-reaches cranky's HEAVY (7.75). That is the
      // shortfall behind "great trade rate, never gets to spend it": he has to
      // walk a full body-length further in than anyone else, and eats a hit
      // doing it, every single time. After: light 7.5, heavy 8.75 — 40% of the
      // gap closed, and his heavy now reaches about as far as titanus'.
      //
      // IT WILL NOT MOVE HIS CPU WIN RATE, AND THAT IS NOT A FAILURE OF THIS
      // NUMBER. ai.js classifies him by his ranged weapon: a `hose` gets
      // preferredRange 9, `melee` is rangedPref <= 6, so the CPU holds him at
      // nine units and actively BACKS OFF inside 5.4. Every melee reach he has,
      // old or new, sits inside the band his own AI is retreating from — the
      // bench cannot see this change by construction, and it measured -65% vs
      // konga against -71% before, which is the same number twice. The benefit
      // is for a human, who does close.
      light: { dmg: [40, 44, 60], knock: [6, 7, 14], range: 4.6 },
      heavy: { dmg: 100, knock: 24, range: 4.7, launch: 9 },
      ranged: { name: 'Hydro Hose', type: 'hose', dmg: 7, cooldown: 0.075, range: 20, ammo: 150 },
      special: { id: 'geyser', name: 'Geyser', cooldown: 7, dmg: 62, radius: 11, launch: 15, duration: 6 },
      ult: { id: 'tsunami', name: 'TSUNAMI', dmg: 135, width: 30, range: 48, knock: 20 },
    },
  },
  {
    id: 'saurion', name: 'SAURION', title: 'The Apex Prototype', icon: '🦖', seed: 151,
    blurb: 'Unit MX-7, grown in a black-site lab by a corporation that wanted to end wars by ending everything else. It ate the lab, filed itself as CEO, and went hunting.',
    quotes: { win: '"*metallic shriek* Target archive updated: extinct."', intro: '"Clever girl? No. Clever MACHINE."' },
    // canonical image: gunmetal-black raptor, robotic blade-feathers,
    // red eye/core glow, white unit decals, chrome sickle toe-claws
    colors: { primary: 0x33343a, accent: 0x17181c, glow: 0xff2418, stripes: false },
    skin: {
      primary: { base: 0x484a54, base2: 0x383a42, metal: 0x8a8f98, wear: 0.5, grime: 0.4, panelDepth: 4, roughPaint: 0.34, metalPaint: 0.62, normalStrength: 1.25 },
      accent: { base: 0x24262c, base2: 0x1a1c22, metal: 0x6a6e76, wear: 0.5, grime: 0.4, panelDepth: 3, roughPaint: 0.36, metalPaint: 0.58, normalStrength: 1.15 },
    },
    // 20% shorter than he was built (owner call). The GLB is pinned by
    // `modelScale`, so the manifest carries the matching `heightScale: 0.8`
    // — this number only sizes the PROCEDURAL body and the dims everything
    // derived from it (anchors, muzzle units, canonical height) reads.
    body: { scale: 0.896, torsoW: 0.95, torsoH: 0.9, headSize: 1.0, armLen: 1.0, legLen: 1.15, hipW: 0.95, bulk: 0.95 },
    // velociraptor stance (the Jurassic Park read): spine pitched forward
    // over deeply-bent digitigrade legs SET APART and staggered — one leg
    // leading, coiled to spring — shoulders DROPPED with the forearms
    // half-raised in front, wrists curled so the claws hang ready, and the
    // head craned back up, alert on the prey
    restPose: {
      torso: [27, 0, 0], head: [-25, 0, 0],
      // the FORELIMBS carried higher — the Jurassic Park raptor's hands held up
      // under the chest rather than hanging. Arm values in a clip are ABSOLUTE
      // (only legs/torso/head take the restPose bias — Animator.restBias), so
      // raising these changes his standing carriage and nothing a clip does.
      shoulderL: [-52, 0, -9], shoulderR: [-52, 0, 9],
      elbowL: [-78, 0, 0], elbowR: [-78, 0, 0],
      handL: [28, 0, 10], handR: [28, 0, -10],
      thighL: [-50, 0, -14], thighR: [-40, 0, 14],
      kneeL: [80, 0, 0], kneeR: [70, 0, 0],
      ankleL: [-37, 0, 0], ankleR: [-31, 0, 0],
    },
    stats: { hp: 1080, speed: 12.8, jump: 15, weight: 0.42, armor: 0.06, duck: 0.75, blockMult: 0.16, guardBreak: 0.6 },
    // air-somersault tuck, reshaped for the raptor frame (see the `ball`
    // clip + defClipVariants): clips ADD the restPose bias back on
    // legs/torso/head, and this body's deep digitigrade bend + spine hunch
    // on top of the shared tuck hyper-folded the knees (206°) and buried
    // the snout. These values land the TOTALS where the shared clip puts a
    // plain biped: knees ~130° folded, spine ~55° curled, claws in.
    ballPose: { torso: [28, 0, 0], thighL: [-52, 0, -8], thighR: [-56, 0, 8], kneeL: [52, 0, 0], kneeR: [48, 0, 0] },
    ui: { power: 7, speed: 10, defense: 3 },
    // signature combat stance (additive over restPose; default carriage)
    combatPose: { hipsPos: [0, -0.16, 0], hipsRot: [4, 0, 0], torso: [6, 0, 0], head: [-8, 0, 0], shoulderL: [-14, 0, -5], shoulderR: [-14, 0, 5], elbowL: [-18, 0, 0], elbowR: [-18, 0, 0], thighL: [-10, 0, -6], thighR: [-4, 0, 6], kneeL: [10, 0, 0], kneeR: [6, 0, 0] },
    // raptor doctrine: he fights with his FEET — the light combo is all
    // sickle toe-claw kicks; the heavy coils him back onto his haunches and
    // springs the whole frame forward into a lunging BITE (heavyDrive);
    // ranged throws a fan of BLACK quills off both hands/forearms (his own
    // plumage — no ammo)
    // HIS CLAWS ARE ALWAYS IN FRONT OF HIM. The shared clip library speaks
    // humanoid — its neutral is `shoulder: 0`, arms hanging at the sides, and
    // it throws an arm back for balance whenever a body is crouching, landing,
    // flinching or getting up. On a raptor that points his weapons backwards:
    // measured (`node tools/scratch/armband.mjs saurion`), the shared neutral
    // put his hand 0.11 of a body height BEHIND its own shoulder, and the
    // intro/getup crouch 0.16 behind.
    // `foreCarry` is the floor that stops it — every clip's shoulder and elbow
    // pitch clamped into a measured band at compile time (animations.js
    // defClipVariants). The band's near end is where the elbow crosses in
    // front of the shoulder (-30, with the elbow folded past -34 so the claws
    // are up — far enough to let a rake EXTEND the arm, not so far that the
    // shared clips can straighten it into a hanging limb); its far end is
    // where an arm raised high starts going back over
    // his own head (-150, which is what victory and groundPound were doing at
    // -165 and -168). His own forms are all inside it and come through
    // untouched, a chambered claw included — that being the one time a
    // forelimb legitimately travels back.
    foreCarry: { pitch: [-132, -30], elbow: [-120, -34] },
    lightClips: ['saurionKick1', 'saurionKick2', 'saurionKick3'],
    heavyClip: 'saurionBite',
    rangedClip: 'saurionQuillFan', // both arms slung forward — see animations.js
    heavyDrive: { t0: 0.32, t1: 0.56, speed: 22, up: 5 },
    moves: {
      light: { dmg: [32, 34, 48], knock: [4, 5, 12], range: 3.5 },
      heavy: { dmg: 80, knock: 19, range: 3.8, launch: 8 },
      ranged: { name: 'Quill Fan', type: 'spikes', dmg: 20, count: 3, speed: 54, cooldown: 0.9 },
      special: { id: 'sickleRush', name: 'Sickle Pounce', cooldown: 6, dmg: 62, bleed: 9, leap: 22 },
      ult: { id: 'raptorPack', name: 'RAPTOR PACK', count: 3, hpFrac: 0.35, duration: 18 },
    },
  },
  {
    id: 'frogger', name: 'FROGGER', title: 'The Gunk Gladiator', icon: '🐸', seed: 163,
    blurb: 'Vat-grown smart-slime poured into a bounce-frame with four gunk guns and no indoor voice. Jumps like gravity is a suggestion, lands like a lawsuit.',
    quotes: { win: '"Ribbit means gg. Look it up."', intro: '"Four arms. Zero mercy. MAXIMUM GUNK."' },
    // canonical image: lime-green plate + translucent dripping slime,
    // black joint frame, glass-dome bug eyes, four slime cannons
    colors: { primary: 0x7cb420, accent: 0x262b20, glow: 0xaef23c, stripes: false },
    skin: {
      primary: { base: 0x7cb420, base2: 0x639414, metal: 0x6e7860, wear: 0.42, grime: 0.4, panelDepth: 3, roughPaint: 0.35, metalPaint: 0.25, normalStrength: 1.1 },
      accent: { base: 0x262b20, base2: 0x1c2018, metal: 0x5a6054, wear: 0.46, grime: 0.42, panelDepth: 3, roughPaint: 0.45, metalPaint: 0.45, normalStrength: 1.1 },
    },
    body: { scale: 1.1, torsoW: 1.2, torsoH: 0.95, headSize: 0.7, armLen: 1.0, legLen: 1.05, hipW: 1.05, bulk: 1.05 },
    restPose: { thighL: [-30, 0, -6], thighR: [-30, 0, 6], kneeL: [55, 0, 0], kneeR: [55, 0, 0], ankleL: [-25, 0, 0], ankleR: [-25, 0, 0] },
    stats: { hp: 1000, speed: 10.5, jump: 19, weight: 0.5, armor: 0.12, duck: 1.0, blockMult: 0.14 },
    ui: { power: 6, speed: 8, defense: 5 },
    // signature combat stance (additive over restPose; default carriage)
    combatPose: { hipsPos: [0, -0.18, 0], torso: [8, 0, 0], head: [-6, 0, 0], shoulderL: [-36, 8, -10], shoulderR: [-36, -8, 10], elbowL: [-44, 0, 0], elbowR: [-44, 0, 0], thighL: [-10, 0, -6], thighR: [-10, 0, 6], kneeL: [14, 0, 0], kneeR: [14, 0, 0] },
    moves: {
      light: { dmg: [30, 32, 44], knock: [4, 5, 11], range: 3.0 },
      heavy: { dmg: 78, knock: 18, range: 3.3, launch: 9 },
      ranged: { name: 'Slime Slinger', type: 'slime', dmg: 38, speed: 36, cooldown: 0.85, splash: 2.4, ammo: 20 },
      special: { id: 'slimeBarrage', name: 'Quad Gunk Barrage', cooldown: 6.5, dmg: 24, count: 11, radius: 8 },
      ult: { id: 'sonicCroak', name: 'SONIC CROAK', dmg: 140, radius: 30, paralyze: 2.2 },
    },
  },
  {
    id: 'jerry', name: 'JERRY', title: 'The Tide-Bringer', icon: '\u{1F990}', seed: 179,
    gait: 'arthropod', // crustacean scuttle: short quick splayed steps, claws carried, shell waggle
    // Lights are OVERHAND CLAW RAKES (bespoke — the shared jab trio is a
    // boxer's kit and read as torso-twists with claw passengers): each claw
    // chambers up over the shell and slams down-and-forward, alternating, and
    // the third blow brings BOTH claws down together. Heavy is the BARRAGE —
    // rear back, then eight quick forward-and-downward strikes, arms
    // alternating; it replaced the pincer clap (clawSnap), which replaced the
    // overhead smash that read as a faceplant on this body.
    lightClips: ['jerryRakeR', 'jerryRakeL', 'jerryRake2'],
    heavyClip: 'jerryBarrage',
    blurb: 'Dredged from a flooded aquaculture lab, JERRY is a colony pretending to be a mech. The cannons are full of something alive. He would like you to hold still.',
    quotes: { win: '"*wet clicking* ...the swarm is fed. For now."', intro: '"They\u2019re hungry. I\u2019m generous."' },
    // canonical image: weathered coral-pink shrimp carapace over black mech
    // frame, olive seam bands, red bead eyes / cannon bores, rusty wear
    colors: { primary: 0xb9816b, accent: 0x35291f, glow: 0xff2818, stripes: false },
    skin: {
      primary: { base: 0xb9816b, base2: 0xa5583c, metal: 0x6e6258, wear: 0.66, grime: 0.58, panelDepth: 4, roughPaint: 0.58, metalPaint: 0.24, normalStrength: 1.3 },
      accent: { base: 0x35291f, base2: 0x271e17, metal: 0x6e6258, wear: 0.55, grime: 0.55, panelDepth: 3, roughPaint: 0.55, metalPaint: 0.4, normalStrength: 1.2 },
    },
    body: { scale: 1.22, torsoW: 1.15, torsoH: 1.15, headSize: 0.75, armLen: 0.95, legLen: 1.28, hipW: 1.18, bulk: 0.95 },
    // grasshopper crouch: legs splayed wide, deeply folded, ready to spring
    restPose: { torso: [14, 0, 0], head: [-8, 0, 0], shoulderL: [-30, 0, -14], shoulderR: [-30, 0, 14], elbowL: [22, 0, 0], elbowR: [22, 0, 0], thighL: [-26, 0, -24], thighR: [-26, 0, 24], kneeL: [58, 0, 4], kneeR: [58, 0, -4], ankleL: [-30, 0, 20], ankleR: [-30, 0, -20] },
    // jumpWindup: he CROUCHES first, then launches — highest jump in the game
    // by a clear margin (nothing else is over 24). He FLIES like everyone else
    // too (he carried `noHover: true` for a while, on the theory that the
    // walls were his height and the jets would make them pointless; they
    // don't — a jet gets you UP, the walls get you AROUND), so his air game is
    // spring, then jets, then the WALL (see `climb` below + combat/climb.js).
    stats: { hp: 980, speed: 9.8, jump: 30, jumpWindup: 0.18, weight: 0.45, armor: 0.08, duck: 0.9, blockMult: 0.15 },
    // SURFACE WALKING (combat/climb.js; shared feel in TUNING.climb). The
    // splayed arthropod legs that make him look wrong as a biped make him right
    // as a SPIDER, so he does not walk on the FLOOR, he walks on the WORLD: up
    // a facade, over its lip, across the roof, down the far side, over the
    // crates on the way, with his body riding the average orientation of
    // whatever is under his feet. His four limbs are a STEPPER, not a gait:
    // each plants on the nearest surface its full extension can reach, pinned
    // while the body moves, swinging to a new home when it falls a stride
    // behind — diagonal pairs alternating, in ANY direction, which is also his
    // crab scuttle on open ground under target lock (strafe: right limbs lead;
    // backpedal: roles reversed). There is no mode and no moment of attaching —
    // walking at a wall simply becomes walking up it. The way off is the jump:
    // with a direction, a leap that way; with nothing held, he lets go and
    // drops.
    //   speed   — climbing pace, x his own walk speed (only at full tilt: over
    //             a low bump he keeps his ordinary pace)
    //   reach   — how far from his feet a surface is FELT, x body height. This
    //             is the one number that decides the whole feel: it is the
    //             radius of the field the walker averages, so it is both how
    //             early a wall starts tipping him onto it and how far he can
    //             stray from a surface before he is simply falling.
    //   pose    — additive body-space bias while on the wall, faded in with the
    //             tilt. `hipsPos` is in the same units as combatPose (x
    //             dims.scale) and is the important one: a mech STANDING on a
    //             wall is not climbing it, because a standing body's hands are
    //             nowhere near the floor (measured: 5.4 units off it). Dropping
    //             the belly toward the surface is what brings all four limbs
    //             onto it — then the claws reach ahead up the face, the shell
    //             flattens, and the head cranes back to look where he is going.
    climb: {
      speed: 0.72, reach: 0.3,
      // HOW FAR A LEADING LIMB REACHES, x its own full extension. 0.82 of
      // his 6.04-unit front limb is 4.95 units — the same absolute reach
      // KONGA gets by stretching out (0.95 x 5.23 = 4.97), which is the
      // point: the two climbers cover the same ground per grab. Jerry's
      // limbs are the LONGER pair, so the same distance leaves them bent.
      grab: 0.82,
      // RESTING ON A WALL, he just stands on it: the crouch below is the
      // climbing carriage, and holding it while parked reads as a mech
      // permanently mid-scramble. Easing off the stick unfolds nearly all
      // of it and he settles into his ordinary walking pose, still pinned
      // to the facade by the limb stepper.
      idleRelax: 0.85,
      pose: {
        hipsPos: [0, -2.3, 0],
        torso: [-30, 0, 0], head: [34, 0, 0],
        // (the z term is arm SPREAD. Wide reads as a starfish pinned to the
        //  wall; the claws want to be ahead of the shell, up the face)
        shoulderL: [-46, 0, -10], shoulderR: [-46, 0, 10],
        elbowL: [-20, 0, 0], elbowR: [-20, 0, 0],
        thighL: [8, 0, -14], thighR: [8, 0, 14],
        kneeL: [16, 0, 0], kneeR: [16, 0, 0],
      },
    },
    // air somersault: a BIG frame on a middleweight stat line — the shell
    // alone is a storey tall — so he CURLS into the ball but never
    // cartwheels (the same tuck-without-spin the weight>0.8 heavies get,
    // opted in by flag since his combat weight stays 0.45). His GLB's leg
    // bones also under-fold against the virtual rig, so a spin never read
    // as a ball on him anyway (tools/rollpivot.mjs: feet sweeping ~1.6x
    // the head's circle even after the ballPose below).
    tuckOnly: true,
    // ...and the tuck reshaped for the grasshopper legs (see the `ball`
    // clip + defClipVariants): clips add the restPose bias back on
    // legs/torso/head, and this frame's deep splayed crouch on top of the
    // shared fold wrapped the knees to 184° with the feet thrown wide.
    // These land the totals at a plain biped's tuck (thigh ~-98, knee
    // ~128) and cancel the splay so the feet ride the ball's surface.
    ballPose: { torso: [40, 0, 0], thighL: [-72, 0, 20], thighR: [-72, 0, -20], kneeL: [70, 0, -4], kneeR: [70, 0, 4], ankleL: [0, 0, -20], ankleR: [0, 0, 20] },
    ui: { power: 6, speed: 8, defense: 4 },
    // signature combat stance (additive over restPose; default carriage)
    combatPose: { hipsPos: [0, -0.14, 0], torso: [6, 0, 0], shoulderL: [-16, 0, -6], shoulderR: [-16, 0, 6], elbowL: [-24, 0, 0], elbowR: [-24, 0, 0], thighL: [-8, 0, -4], thighR: [-8, 0, 4], kneeL: [12, 0, 0], kneeR: [12, 0, 0] },
    moves: {
      light: { dmg: [28, 30, 44], knock: [4, 4, 10], range: 3.4 },
      // PER HIT: jerryBarrage lands 8 hit events, so this is 8 x 11 = 88
      // potential (a shared heavy is ~76 in one blow; the barrage trades a
      // launcher for chip volume). Knock small on purpose — the victim is
      // pummelled in place through the flurry, not launched off the second hit.
      heavy: { dmg: 11, knock: 3, range: 3.6, launch: 0 },
      // BILGE SPIT: a short burst of black sticky goo out of ONE cannon pod
      // (alternating), thrown much further than CRANKY's water hose and
      // gunking whoever it lands on like FROGGER's slime. `ticks` wads per
      // press — the first is the lead glob (splash + the heavy slow), the
      // rest trail behind it. `range` is both the jet's reach and the wads'
      // kill line, so the stream and the damage stop at the same distance.
      ranged: { name: 'Bilge Spit', type: 'goo', dmg: 18, speed: 42, cooldown: 1.1, splash: 2.2, range: 46, ticks: 4, ammo: 16 },
      special: { id: 'fleaSwarm', name: 'Brine Swarm', cooldown: 7.5, dmg: 26, count: 6 },
      ult: { id: 'fleaCircus', name: 'FLEA CIRCUS', dmg: 14, count: 20, duration: 6 },
    },
  },
  {
    id: 'nullbot', name: 'NULLBOT', title: 'The Fatal Exception', icon: '👾', seed: 197,
    blurb: 'Nobody built NULLBOT. It was simply found in the arena\'s memory one morning, already undefeated. Where it walks, textures tear, audio stutters, and the scoreboard reads NaN.',
    quotes: { win: '"SEGMENTATION FAULT. core dumped. ...that was you."', intro: '"> fatal exception 0x00NULLBOT :: you will be nullified"' },
    // canonical image (docs/canonical/mech_null.png): void-black jagged
    // plate with a faint violet sheen, twin red eyes, red null-sigil core,
    // and multicolor data-corruption flickering off shoulders/arms/shins
    // (the flicker itself is runtime FX — see fighter.updateNullbotAura)
    // …and his TAUNT drops the whole body in and out like a lost connection —
    // Fighter.holoTaunt, which is a render effect and not a pose, so it rides
    // on top of the jitter his taunt clip animates.
    holoTaunt: true,
    colors: { primary: 0x17131e, accent: 0x0a080d, glow: 0xff1f2a, glow2: 0x27f6ff, stripes: false },
    skin: {
      primary: { base: 0x14111a, base2: 0x0b0910, metal: 0x2e2a38, wear: 0.3, grime: 0.38, panelDepth: 4, roughPaint: 0.56, metalPaint: 0.32, normalStrength: 1.25 },
      accent: { base: 0x09080c, base2: 0x050408, metal: 0x242130, wear: 0.34, grime: 0.4, panelDepth: 4, roughPaint: 0.6, metalPaint: 0.3, normalStrength: 1.2 },
    },
    // tall and lean: long legs and long clawed arms, narrow waist
    body: { scale: 1.26, torsoW: 0.98, torsoH: 1.08, headSize: 0.82, armLen: 1.14, legLen: 1.12, hipW: 0.85, bulk: 0.88 },
    stats: { hp: 1020, speed: 10.2, jump: 13.5, weight: 0.55, armor: 0.08, blockMult: 0.12 },
    ui: { power: 8, speed: 7, defense: 4 },
    // combat doctrine: the punches LOOK ordinary — it's the impacts that
    // corrupt. Every landed punch, backhand or bolt turns a piece of the
    // victim into flickering data (a glitch stack, kept for the round);
    // the 10th stack crashes them outright: 3s engulfed + stunned and
    // helpless, then the corruption clears and the count restarts.
    combatPose: { hipsPos: [0, -0.1, 0], torso: [6, -8, 0], head: [-4, 6, 0], shoulderL: [-24, 0, -16], elbowL: [-46, 0, 0], shoulderR: [-24, 0, 14], elbowR: [-40, 0, 0], thighL: [-10, 0, -5], thighR: [2, 0, 5], kneeL: [14, 0, 0], kneeR: [6, 0, 0] },
    heavyClip: 'nullBackhand',
    moves: {
      light: { dmg: [30, 32, 46], knock: [4, 5, 11], range: 3.4, status: { glitch: 1 } },
      heavy: { dmg: 84, knock: 30, range: 3.7, launch: 9, status: { glitch: 1 } },
      ranged: { name: 'Null Pointer', type: 'glitch', dmg: 30, speed: 50, cooldown: 0.75, ammo: 18 },
      special: { id: 'segfault', name: 'SEGFAULT', cooldown: 6.5, dmg: 55, dashLen: 14 },
      ult: { id: 'systemCrash', name: 'SYSTEM CRASH', dmg: 50, duration: 7 },
    },
  },
  {
    // KONGA — the arms are the whole design. They are longer than his legs,
    // they carry him when he walks (gait 'knuckle'), and they are what he
    // hits with; the ordnance is bolted on TOP of an animal that was already
    // dangerous. So: enormous melee numbers, a slow committed heavy, and a
    // ranged option that exists mainly to make you walk into the fists.
    id: 'konga', name: 'KONGA', title: 'The Silverback Siege', icon: '🦍', seed: 211,
    blurb: 'placeholder — see src/core/text.js',
    quotes: { win: '', intro: '' },
    colors: { primary: 0x33302e, accent: 0xa8532c, glow: 0xffa432, stripes: false },
    skin: {
      primary: { base: 0x33302e, base2: 0x272423, metal: 0x7e838a, wear: 0.6, grime: 0.58, panelDepth: 3, roughPaint: 0.74, metalPaint: 0.22, normalStrength: 1.3 },
      accent: { base: 0xa8532c, base2: 0x8a4224, metal: 0x8a8f96, wear: 0.78, grime: 0.62, panelDepth: 4, roughPaint: 0.6, metalPaint: 0.44, normalStrength: 1.25 },
    },
    // LONG arms, SHORT legs — the proportion that makes a knuckle-walk read.
    body: { scale: 1.24, torsoW: 1.24, torsoH: 1.0, headSize: 0.95, armLen: 1.64, legLen: 0.86, hipW: 1.12, bulk: 1.16 },
    // rest is the four-point stance: arms reaching forward-down onto the
    // knuckles, back legs folded under the hips
    restPose: { shoulderL: [-8, 0, -7], shoulderR: [-8, 0, 7], elbowL: [-10, 0, 0], elbowR: [-10, 0, 0], thighL: [-12, 0, -8], thighR: [-12, 0, 8], kneeL: [30, 0, 0], kneeR: [30, 0, 0], ankleL: [-16, 0, 0], ankleR: [-16, 0, 0] },
    stats: { hp: 1200, speed: 9.2, jump: 13, weight: 0.88, armor: 0.15, blockMult: 0.08 },
    ui: { power: 10, speed: 5, defense: 7 },
    // guard is a hunched shoulder-wall with the head tucked behind the arms
    combatPose: { hipsPos: [0, -0.10, 0], hipsRot: [8, 0, 0], torso: [14, 0, 0], head: [-14, 0, 0], shoulderL: [-10, 5, -10], shoulderR: [-10, -5, 10], elbowL: [-18, 0, 0], elbowR: [-18, 0, 0], thighL: [-10, 0, -8], thighR: [-3, 0, 8], kneeL: [22, 0, 0], kneeR: [15, 0, 0] },
    gait: 'knuckle',
    // A JUMP IS THE FIRST HALF OF A GRAB (animator.js `airReach`): both arms
    // go up and open the moment he leaves the ground, ready to catch a ledge
    // on the way past. The ape is the only body this is right for.
    airReach: true,
    // SURFACE WALKING, APE-STYLE (combat/climb.js; `style: 'ape'` picks the
    // brachiator rules out of the shared stepper). The body carriage is
    // jerry's — the same field of nearby geometry, the same continuous
    // orientation, the same "flat ground is not climbing" hand-back — but the
    // LIMBS work the way an animal with arms longer than its legs works:
    //   • he hangs from ONE arm, not a diagonal pair, so the alternation gate
    //     is arm-against-arm and the legs are free;
    //   • the arms reach AHEAD along the travel and UP, grab, and the body
    //     swings past the grip before the other arm goes out — reach, grab,
    //     pull through, reach again;
    //   • a foot only plants on something GROUND-ORIENTED (a ledge, a roof, a
    //     crate top). On a sheer face there is nothing to stand on, so the
    //     legs hang under him and the arms carry him.
    // `reach` is bigger than jerry's because his arms ARE bigger: the field
    // radius has to cover the span he can actually grab across.
    climb: {
      speed: 0.66, reach: 0.42, style: 'ape',
      // AS FAR AS THE ARM GOES. He is the short-armed one of the two
      // (5.23 units to jerry's 6.04), so he spends all of it on every
      // reach and arrives at the same 4.97 units jerry gets bent.
      grab: 0.95,
      // RESTING IS NOT THE ABSENCE OF CLIMBING for an ape — it is a HANG.
      // The right arm goes straight overhead and the body drops under it,
      // knees folded and loose, which is what a gorilla does on a wall
      // with nowhere to stand. Faded in by `_climbIdle`, on top of the
      // climbing carriage rather than instead of it (idleRelax stays 0:
      // he never lets go of the wall to stand on nothing).
      idlePose: {
        hipsPos: [0, -1.1, 0],
        torso: [8, 0, 0], head: [-16, 0, 0],
        shoulderR: [-52, 0, 6], elbowR: [-14, 0, 0],
        shoulderL: [26, 0, -12], elbowL: [40, 0, 0],
        thighL: [26, 0, -8], thighR: [26, 0, 8],
        kneeL: [40, 0, 0], kneeR: [40, 0, 0],
      },
      // HE STAYS THE RIGHT WAY UP. `upright` is how much he refuses to lie
      // down on a surface (0 = become part of it, jerry's insect answer; 1 =
      // never tilt at all). An ape has shoulders: he climbs a facade standing
      // vertically and REACHING, and he comes down it backwards with his head
      // still up, because that is the only way an arm works. The movement
      // plane is still the wall's — climb.js maps the stick through the
      // SURFACE and the body's posture separately — so up is still up the
      // face however vertical he is holding himself.
      upright: 0.82,
      // hanging, not pinned: the belly drops less than a spider's (he is
      // holding on above his head, not lying on the wall), the chest opens
      // toward the surface and the arms go high
      pose: {
        hipsPos: [0, -3.6, 0],
        torso: [-16, 0, 0], head: [26, 0, 0],
        shoulderL: [-62, 0, -14], shoulderR: [-62, 0, 14],
        elbowL: [-26, 0, 0], elbowR: [-26, 0, 0],
        thighL: [10, 0, -6], thighR: [10, 0, 6],
        kneeL: [26, 0, 0], kneeR: [26, 0, 0],
      },
    },
    lightClips: ['bigPunch1', 'bigPunch2', 'light3'],
    heavyClip: 'kongaSlam',
    heavyFx: 'apeQuake',
    rangedClip: 'kongaLob',
    // the slam is a straight overhead drive — never let the strike servo slew
    // the whole body onto a target, or the two-fisted read becomes a swipe
    noTwistClips: ['kongaSlam'],
    primaryMuzzle: 'podR',
    moves: {
      light: { dmg: [40, 44, 62], knock: [6, 7, 15], range: 3.5 },
      heavy: { dmg: 98, knock: 26, range: 4.0, launch: 10 },
      // BOTH PODS EMPTY THEMSELVES: a ripple of small missiles alternating
      // shoulder to shoulder (world.js `salvo`), not one big rocket.
      ranged: { name: 'Shoulder Salvo', type: 'salvo', dmg: 13, count: 10, speed: 34, cooldown: 2.1, splash: 1.8, ammo: 12 },
      // THE PILEDRIVER (specials.js headSlam): grabbed by the head with the
      // nearer fist, hoisted upside down and driven skull-first into the
      // floor — or, for a victim as big as he is, taken across both palms
      // like colossus and slammed down instead of thrown. Either way they
      // finish on their back.
      special: { id: 'headSlam', name: 'Skull Driver', cooldown: 8, dmg: 96, range: 4.2, knock: 16, radius: 6 },
      // APEX POUND (specials.js): he drops onto his knuckles and drums the
      // ROAD, fist after fist, each blow throwing a travelling shockwave that
      // sweeps anyone standing off their feet. `slamDmg` is the payoff — a
      // fist landing on a body that is already down, which is what he walks
      // forward to do (the ult is the one that hands the legs back).
      // TEN SECONDS, deliberately: the move is a hunt, not a burst, and the
      // walk to a downed victim has to fit inside it. `dmg`/`slamDmg` are
      // sized against that length — measured on tritone with the victim held
      // underfoot for the whole duration (the worst case a player can make),
      // it comes to ~876, two thirds of his bar, for ten seconds of standing
      // in fist range.
      ult: {
        id: 'apexPound', name: 'APEX POUND', dmg: 18, slamDmg: 54, knock: 12,
        radius: 13, waveSpeed: 30, beat: 0.58, fistRange: 3.6, duration: 10,
      },
    },
  },
  {
    // TRITONE — six tonnes on four columns. He cannot turn quickly and he
    // cannot jump, so everything is built around the one thing he does better
    // than anyone: pick a line and arrive at the end of it. The cannons are
    // what he does while he waits to be pointed at something.
    id: 'tritone', name: 'TRITONE', title: 'The Walking Siege', icon: '🦕', seed: 223,
    blurb: 'placeholder — see src/core/text.js',
    quotes: { win: '', intro: '' },
    colors: { primary: 0x62684a, accent: 0xa8532c, glow: 0xff8a24, stripes: false },
    skin: {
      primary: { base: 0x62684a, base2: 0x51563d, metal: 0x8a8f96, wear: 0.66, grime: 0.6, panelDepth: 4, roughPaint: 0.66, metalPaint: 0.34, normalStrength: 1.28 },
      accent: { base: 0xa8532c, base2: 0x8a4224, metal: 0x8a8f96, wear: 0.72, grime: 0.6, panelDepth: 4, roughPaint: 0.62, metalPaint: 0.4, normalStrength: 1.25 },
    },
    // long, wide and low — a gun platform, not a torso on legs
    // SIZE: 12% smaller than he was (scale 1.3 -> 1.144). Two knobs move
    // together or he desyncs — `body.scale` is the GAMEPLAY body (Fighter reads
    // it for scale/radius/hitRadius, and mech.dims for height) while the GLB's
    // rendered size is `modelScale x heightScale` in the manifest, frozen and
    // independent of dims. Change one and the model no longer matches the
    // hitbox; the manifest's heightScale went 0.825 -> 0.726 with this.
    body: { scale: 1.144, torsoW: 1.35, torsoH: 0.92, headSize: 1.18, armLen: 0.98, legLen: 0.94, hipW: 1.32, bulk: 1.24 },
    // columnar stance: all four legs nearly straight under the body
    restPose: { shoulderL: [2, 0, -3], shoulderR: [2, 0, 3], elbowL: [0, 0, 0], elbowR: [0, 0, 0], thighL: [-2, 0, -5], thighR: [-2, 0, 5], kneeL: [4, 0, 0], kneeR: [4, 0, 0], ankleL: [-2, 0, 0], ankleR: [-2, 0, 0] },
    stats: { hp: 1320, speed: 8.4, jump: 9, weight: 1.0, armor: 0.22, blockMult: 0.06 },
    ui: { power: 9, speed: 4, defense: 9 },
    // guard is a braced head-down wall of frill and horn
    combatPose: { hipsPos: [0, -0.06, 0], hipsRot: [-3, 0, 0], torso: [-4, 0, 0], head: [-12, 0, 0], shoulderL: [-2, 0, -5], shoulderR: [-2, 0, 5], elbowL: [-4, 0, 0], elbowR: [-4, 0, 0], thighL: [-5, 0, -6], thighR: [-1, 0, 6], kneeL: [12, 0, 0], kneeR: [7, 0, 0] },
    gait: 'trike',
    lightClips: ['tritoneGore', 'tritoneGoreL', 'tritoneGore'],
    heavyClip: 'tritoneToss',
    heavyFx: 'hornQuake',
    rangedClip: 'tritoneBrace',
    // the head IS the weapon: let the neck aim it, never the whole chassis
    noTwistClips: ['tritoneToss'],
    // a body this long does not counter-rotate its waist to sidestep
    strafeLegs: false,
    // THE AIR TUCK, for a body with no waist to curl. The shared ball folds a
    // biped nose-to-knees, which on him swings the skull down and through the
    // floor on landing (measured: chin 1.7 units under). A quadruped in the
    // air pulls all four legs in under the belly and keeps its head UP —
    // which is both what the animal does and what keeps the horns clear.
    ballPose: {
      hipsPos: [0, -0.06, 0], hipsRot: [-3, 0, 0], torso: [-6, 0, 0], head: [18, 0, 0],
      thighL: [-40, 0, -6], thighR: [-42, 0, 6], kneeL: [76, 0, 0], kneeR: [74, 0, 0],
      ankleL: [-26, 0, 0], ankleR: [-26, 0, 0],
      shoulderL: [-38, 8, -10], shoulderR: [-38, -8, 10], elbowL: [-64, 0, 0], elbowR: [-64, 0, 0],
      handL: [10, 0, 0], handR: [10, 0, 0],
    },
    // HE KEEPS HIS CHIN UP (combat/floorguard.js). A metre of skull, three
    // horns and a jaw hang off the front of a body that is already low, so
    // every shared clip's forward pitch — authored for a humanoid, where the
    // head is a small ball on top — drove his face through the road. Measured
    // with tools/groundprobe.mjs: jaw 3.4 units under on the gore charge, brow
    // 4.0 under on the plunge landing. The guard watches the tips that can
    // actually reach the floor and pitches the neck back exactly far enough.
    floorGuard: true,
    moves: {
      light: { dmg: [34, 36, 54], knock: [7, 7, 16], range: 4.2 },
      heavy: { dmg: 90, knock: 30, range: 4.4, launch: 13 },
      // BOTH cannons at once, each aimed by its own traversing mount. The
      // trigger opens a one-second aiming window rather than firing on a
      // keyframe: the turrets lead the target and let go when they are on it
      // (combat/cannonaim.js). `aimWindup` is what puts a mech on that path.
      ranged: {
        name: 'Flank Cannons', type: 'siege', dmg: 42, speed: 62, cooldown: 1.6,
        splash: 2.6, knock: 11, ammo: 14, aimWindup: 1.0,
      },
      // HELD, not tapped: the trigger runs the charge for as long as it is
      // down and the tank lasts, and everything it hits is paid for out of
      // the speed he arrived at. See specials.js goreCharge.
      special: { id: 'goreCharge', name: 'Gore Charge', cooldown: 7, dmg: 88, knock: 30, launch: 12, hold: true },
      // SIEGE PROTOCOL (specials.js): both mounts leave the aim solver and
      // sweep a full 180° in opposite phase, hosing energy particles at the
      // sky. Each one flies dumb for `seekTime` and then hunts — so `count` is
      // a cloud, and `dmg` is per particle rather than per shell.
      ult: {
        id: 'siegeProtocol', name: 'SIEGE PROTOCOL', dmg: 20, count: 96,
        duration: 6.5, radius: 3.2, speed: 38, seekTime: 0.62, sweep: 1.5,
      },
    },
  },
];

// Names, titles, bios, round quotes and move names are NOT authored here —
// every player-visible string in the game lives in src/core/text.js and is
// stamped onto these defs at import time, so `def.name` keeps working while
// the words stay translatable in one file.
ROSTER.forEach(applyMechText);

export const ROSTER_BY_ID = Object.fromEntries(ROSTER.map((m) => [m.id, m]));

// Work-in-progress mechs carry `hidden: true`. The workbenches (?showcase,
// ?rigedit, the pose/skin tools, ?battle=...) always see the FULL ROSTER so
// they can keep iterating; the game itself only offers the playable set
// unless SETTINGS → SHOW ALL ROBOTS is on.
export function playableRoster() {
  return CONFIG.showAllRobots ? ROSTER : ROSTER.filter((m) => !m.hidden);
}

// Is this mech id offerable in the game right now?
export function isPlayable(id) {
  const m = ROSTER_BY_ID[id];
  return !!m && (CONFIG.showAllRobots || !m.hidden);
}
