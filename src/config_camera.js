// Every dial of the 2.5D camera (docs/arena-polish-plan.md owns the per-arena
// personality), in one place, in the same comment-every-dial style as
// config_tuning.js. Nothing here affects flat mode or the simulation — these
// numbers only exist once the 3D camera has loaded src/camera3d/.

export const CAMERA = {
  // 100 sim pixels = 1 world unit. Every mapping in camera3d goes through this.
  simScale: 1 / 100,
  // Stage centre (sim x = 640) sits at world origin; sim y = 568 — the typical
  // main-platform top — is world y = 0. Chosen so "the floor" is the origin
  // plane and dolly/yaw numbers read in human units.
  originX: 640,
  originY: 568,

  // Vertical field of view, degrees. Long lens on purpose: at 30 degrees a
  // fighter at the screen edge barely distorts, which is what keeps the game
  // reading as "2D with depth" rather than as a fishbowl.
  fov: 30,
  near: 0.1,
  far: 60,

  // The camera floats slightly above the tracked point and looks marginally
  // down — the Smash stage-view posture. World units / degrees.
  heightBias: 0.4,
  pitch: -2,

  // Yaw toward the action as the camera tracks sideways: degrees of yaw per
  // world unit the tracked point is off stage centre, clamped. Small on
  // purpose — at ±4 degrees the gameplay plane's projection is still almost
  // affine, which §5 of the plan depends on for the overlay transform.
  yawPerUnit: 0.9,
  yawMax: 4,

  // Lookahead: the lookAt point leads the average alive-fighter x-velocity
  // (sim px/s) by this factor, clamped to ±lookaheadMax world units. Fast
  // horizontal exchanges lead the frame like a tracked anime shot.
  lookahead: 0.06 / 100,
  lookaheadMax: 0.5,

  // How fast the rig's own smoothed values (yaw, roll, dolly bias, FOV) chase
  // their targets: per-second lerp base, same convention as camera.js —
  // factor = 1 - damping^dt. Smaller = snappier.
  damping: 0.002,

  // cam.shake (sim px) becomes positional noise on the camera's local x/y,
  // scaled by simScale times this.
  shakeScale: 1.0,

  // cam.kick (combat.js sets 0.14 on heavy hits) becomes an FOV punch:
  // fov -> fov - kickFovDrop over kickIn seconds, decaying back over kickOut.
  kickFovDrop: 2.5,
  kickIn: 0.06,
  kickOut: 0.18,
};

// Drama hooks — camera moves driven entirely by state the sim already sets.
export const DRAMA = {
  // Round intro (introT > 0): start pulled out and angled, ease to standard
  // framing while READY…/GO! plays. These are the defaults — each arena can
  // override them with an `intro` block in BOARD_CAMERA below.
  introDolly: 1.25,    // × the standard dolly distance
  introYaw: 6,         // degrees
  introTime: 1.6,      // matches introT in main.js

  // Ult cast: dolly in on the caster with a touch of dutch, hold, ease back.
  ultDolly: 0.8,
  ultRoll: 2.5,        // degrees, signed by which side of centre the caster is
  ultIn: 0.25,         // seconds to arrive

  // Domain cast: same arrival, then a slow drift back out while the domain
  // overlay owns the screen.
  domainDolly: 0.8,
  domainDrift: 8,      // seconds of drift back to 1.0

  // GAME (endT > 0, slow-mo running): frame the winner, easing yaw to face
  // them head-on — the Smash final-blow shot.
  endDolly: 0.7,
};

// Garnish cards — the flat quads OFF the gameplay plane (leaves, lanterns,
// traffic, rubble, hoardings; src/camera3d/garnish.js).
//
// `enabled: false` turns every card off everywhere and leaves the rest of the
// 2.5D camera exactly as it is: the scene, the rig, the drama shots and the
// per-board cues all keep running. Worth its own switch because garnish is the
// only part of this mode that deliberately puts things BETWEEN the lens and
// the fight — so it is the first thing to reach for if a board ever reads as
// too busy, and the one part a player might simply not want.
export const GARNISH = {
  enabled: true,
  // Scales the gap between ambient spawns (leaves, lanterns). Above 1 is
  // sparser, below 1 denser. Cue-driven cards — traffic, rubble — are tied to
  // their hazard's own timing and ignore this.
  interval: 1,
};

// Per-board camera personality — one row per arena (docs/arena-polish-plan.md
// §1). Any field omitted falls back to the global rig above. Dials:
// `yawBias`/`yawMax` (degrees), `heightBias` (world units), `fovNudge`
// (degrees), `dampingMul` (< 1 glides, > 1 snaps), `lookaheadMul`,
// `driftFollow` (blend of the MAIN platform's drift into the tracked x — only
// meaningful on a board whose main moves).
//
// `intro` is the arena's establishing shot, riding the same READY…GO! envelope
// as DRAMA's global intro: { dolly?, yaw?, time? }, each falling back to
// DRAMA.introDolly / introYaw / introTime. The yaw is a full override, not an
// addition — an intro that wants the global angle just omits it.
export const BOARD_CAMERA = {
  // The street canyon stacks in depth; the train re-prices the mid lane, so
  // the lens leads a little harder. Intro rakes down the street.
  neon: { yawBias: 1.5, lookaheadMul: 1.2, intro: { yaw: 10, dolly: 1.3 } },
  // Catwalk tiers: float the lens a touch higher. Intro starts tight and hot.
  foundry: { heightBias: 0.5, intro: { dolly: 1.1, yaw: -6 } },
  // The tournament flat is deliberately the reference shot — default dials,
  // just a breath of daylight air. Intro is a high, clean crane-down.
  uptown: { fovNudge: 0.5, intro: { dolly: 1.4, yaw: 0 } },
  // Sunset side: a persistent lean toward the water. Intro from off the quay.
  harbor: { yawBias: -1.5, lookaheadMul: 1.2, intro: { yaw: -9, dolly: 1.3 } },
  // The small scrappy stage: thinner air, twitchier frame. Intro pulls right
  // out to the cloud sea before diving in.
  skyterrace: { fovNudge: 1, dampingMul: 0.8, intro: { dolly: 1.45 } },
  // The buried hand's fingers stack in depth under a yaw bias.
  scrapyard: { yawBias: 2, dampingMul: 0.9, intro: { yaw: 8, dolly: 1.2 } },
  // The terraced pit: higher, statelier. Intro looks down into the workings.
  quarry: { heightBias: 0.55, dampingMul: 1.1, intro: { dolly: 1.35, yaw: 5 } },
  // Hug the fissured floor; the heat widens the lens slightly.
  volcano: { fovNudge: 0.8, heightBias: 0.35, intro: { dolly: 1.1, yaw: -5 } },
  // Glacial calm between the floe's beats. Intro is a slow, wide aurora shot.
  frozen: { dampingMul: 1.25, lookaheadMul: 0.9, intro: { dolly: 1.4, time: 2.0 } },
  // The colonnade rakes into depth on the left. Intro down the processional way.
  ruins: { yawBias: -2, intro: { yaw: -10, dolly: 1.25 } },
  // Pyramid tiers and canopy: a taller frame with a slight lean.
  jungle: { heightBias: 0.6, yawBias: 1, intro: { dolly: 1.15, yaw: 6 } },
  // Low gravity: floatier fights get a floatier frame (the proven low-g
  // recipe). Intro starts wide against the planet and takes its time.
  orbital: { heightBias: 0.7, dampingMul: 0.7, intro: { dolly: 1.5, time: 2.0 } },
};

// Cue treatments the rig knows, poked by stage_fx.js through cameraCue().
// Each is { dolly?, yaw?, roll?, fov?, shake?, attack, hold?, release }:
// scaled by the cue's strength, eased in over `attack` seconds, held `hold`,
// released over `release`. Dolly is a multiplier delta (−0.07 ≈ push in to
// 0.93×D); yaw/roll/fov are degrees; shake is sim-px camera noise.
export const CUES = {
  // The quarry's arming sequence: the pit holds its breath — slow push in,
  // yaw to zero — while the LEDs count one-two-three, then the punches land.
  hush:      { dolly: -0.07, attack: 2.0, hold: 2.0, release: 1.2, yawTo0: true },
  // A crossing hazard the camera leads: the neon maglev, a volcano fissure
  // arming, the jungle whip. Signed by strength: cue with ±1 for direction.
  surge:     { pan: 0.6, roll: 1.5, attack: 0.3, hold: 1.2, release: 0.8 },
  // The volcano's lake surge: the lens widens while the caldera vents.
  frenzy:    { fov: 3, attack: 0.6, hold: 8.0, release: 1.2 },
  // A hazard releasing at a spot: the harbor's container let go, the
  // scrapyard magnet's snap — a 60 ms punch toward that side.
  fangSnap:  { dolly: -0.05, yaw: 2, attack: 0.06, hold: 0.05, release: 0.25 },
  // Light itself as the event: the foundry tap-hole going white-hot, the
  // jungle's god-rays re-angling — a gentle drift toward the glow.
  bloom:     { dolly: -0.03, attack: 0.5, hold: 1.0, release: 1.0 },
  // Container landing / husk landing / quarry detonation: a micro punch.
  punch:     { fov: -1.2, attack: 0.04, hold: 0.02, release: 0.3 },
  // Available, unused: ease the yaw so a stage face catches light.
  wallYaw:   { yaw: 3, attack: 0.8, hold: 6.0, release: 1.0 },
  // Grinding machinery / cracking ice / cracking stone: sustained micro-shake
  // (the foundry drum, the magnet hum, the floe break, the column hits).
  rattle:    { shake: 3, attack: 0.1, hold: 0.8, release: 0.3 },
  // The stage just permanently changed: the ruins' lintel is down — a
  // deliberate pull-back to take in the new layout, then re-frame.
  layout:    { dolly: 0.15, attack: 0.8, hold: 1.6, release: 1.2 },
  // The frozen floe's open hole: steam off black water — dolly IN while it
  // gapes, claustrophobia instead of blindness. Sized to the 3 s hole.
  fog:       { dolly: -0.1, attack: 1.0, hold: 2.5, release: 1.5 },
  // The caldera draws breath before the lake surges: the camera is being
  // inhaled too, and the release kicks as the vent lets go.
  inhale:    { dolly: -0.05, attack: 1.5, hold: 1.5, release: 0.2, kickOnRelease: 0.1 },
  // The terrace gust / the ruins' sand: wind made visible with zero
  // particles. Signed; the hold spans the whole blow.
  wind:      { roll: 1.3, attack: 1.0, hold: 13.0, release: 1.0 },
  // Orbital debris streaking through / the colonnade coming down: the
  // strongest shake in the game.
  lightning: { shake: 14, fov: -2, attack: 0.02, hold: 0.08, release: 0.5 },
};
