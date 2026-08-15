// Every dial of the 2.5D camera (docs/2.5d-camera-plan.md), in one place, in
// the same comment-every-dial style as config_tuning.js. Nothing here affects
// flat mode or the simulation — these numbers only exist once `?camera=3d` has
// loaded src/camera3d/.

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
  // framing while READY…/GO! plays.
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

// Per-board camera personality. Any field omitted falls back to the global
// rig above. `yawMax`/`heightBias`/`fovNudge`/`dampingMul` are the dials the
// plan names; boards not listed get the global feel.
export const BOARD_CAMERA = {
  // The neutral baseline — the global rig is tuned here.
  trainingBridge: {},
  // Left→right terraces: a persistent yaw bias makes the stairs visibly stack
  // in depth — the stage whose layout the 3D camera flatters most.
  gardenSteps: { yawBias: 2.5 },
  // The slick floor communicated through the lens: the camera itself glides
  // and overshoots slightly.
  sunkenCrossing: { dampingMul: 0.5 },
  // Low gravity: floatier fights get a floatier frame.
  domainCore: { heightBias: 0.7, dampingMul: 0.7 },
  // The drifting main platform is the anchor: blend 40% of its drift into the
  // tracked x, so the world visibly slides under the fight.
  bridgeDuel: { driftFollow: 0.4 },
  // The busiest skyline gets the busiest lens.
  shibuyaNight: { fovNudge: 1, lookaheadMul: 1.5 },
};

// Cue treatments the rig knows, poked by stage_fx.js through cameraCue().
// Each is { dolly?, yaw?, roll?, fov?, shake?, attack, hold?, release }:
// scaled by the cue's strength, eased in over `attack` seconds, held `hold`,
// released over `release`. Dolly is a multiplier delta (−0.07 ≈ push in to
// 0.93×D); yaw/roll/fov are degrees; shake is sim-px camera noise.
export const CUES = {
  // Quiet Hall's silence seal: a held breath — slow push in, yaw to zero.
  // The hush lasts 4 s; the push arrives with it held and lets go as it lifts.
  hush:      { dolly: -0.07, attack: 2.0, hold: 2.0, release: 1.2, yawTo0: true },
  // Flooded Gate's surge: the camera leads the wave, like footage from a boat.
  // Signed by strength: cue with strength ±1 for direction.
  surge:     { pan: 0.6, roll: 1.5, attack: 0.3, hold: 1.2, release: 0.8 },
  // Shibuya's curtain window: the lens widens for the frenzy.
  frenzy:    { fov: 3, attack: 0.6, hold: 8.0, release: 1.2 },
  // Curse Maw's fang snap at an edge: a 60 ms punch toward that side.
  fangSnap:  { dolly: -0.05, yaw: 2, attack: 0.06, hold: 0.05, release: 0.25 },
  // Garden Steps' bloom heal: a gentle drift toward the flower.
  bloom:     { dolly: -0.03, attack: 0.5, hold: 1.0, release: 1.0 },
  // Lantern fall / curse blob pop / crossing hit: a micro punch.
  punch:     { fov: -1.2, attack: 0.04, hold: 0.02, release: 0.3 },
  // Neon Split's wall: ease the yaw around the wall so its face catches light.
  wallYaw:   { yaw: 3, attack: 0.8, hold: 6.0, release: 1.0 },
  // Bone Sanctum's rattle / Empty City's crumble: sustained micro-shake.
  rattle:    { shake: 3, attack: 0.1, hold: 0.8, release: 0.3 },
  // Academy Hall's bell reshuffle: a deliberate pull-back to watch the layout
  // glide, then re-frame.
  layout:    { dolly: 0.15, attack: 0.8, hold: 1.6, release: 1.2 },
  // Mist Pier's fog bank: dolly IN while visibility is low — claustrophobia
  // instead of blindness.
  fog:       { dolly: -0.1, attack: 2.0, hold: 6.0, release: 2.0 },
  // Cursed Teeth's inhale: the camera is being inhaled too.
  inhale:    { dolly: -0.05, attack: 1.5, hold: 1.5, release: 0.2, kickOnRelease: 0.1 },
  // River Gate's crosswind: wind made visible with zero particles. Signed;
  // re-cued on every 15 s flip, so the hold spans a whole leg of the cycle.
  wind:      { roll: 1.3, attack: 1.0, hold: 13.0, release: 1.0 },
  // Billboard Roof's lightning: the strongest shake in the game.
  lightning: { shake: 14, fov: -2, attack: 0.02, hold: 0.08, release: 0.5 },
  // Bridge Duel: not a cue — see rig.js driftFollow, blended every frame.
};
