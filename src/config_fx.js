// FX dials — every hand-tweakable number for the effects system that
// docs/effects-plan.md builds: element hit recipes, dash streaks, projectile
// trails, the Black Flash treatment, controller rumble.
//
// Same contract as config_tuning.js: nothing here is load-bearing. No value
// changes what a hit connects with or how the simulation steps — the worst a
// bad number does is look or feel wrong. Edit freely.

// Master scale on every recipe's particle counts. 0.5 halves everything on
// screen, 0 turns element particles off entirely (hits still popup and shake).
export const FX_DENSITY = 1;

// ------------------------------------------------------------- element hits
//
// What lands when a hit connects, per element. A move's `fxElement` wins over
// the character's `fxElement` (characters.js); no element at all means
// "energy", which is exactly the pre-FX look: a theme-colour burst and a white
// spark line. Counts are the base at 0%; damage scales them on top.
//
// The rule these recipes exist to enforce: Maki, Toji and Panda have NO cursed
// energy, so "steel" draws white glints, sparks and dust — never a coloured
// glow.

export const HIT_RECIPES = {
  energy: { burst: 14, sparks: 8 },
  fire:   { flames: 9, embers: 7, smoke: 3 },
  blood:  { droplets: 12, mist: 6 },
  steel:  { glints: 9, sparks: 5, dust: 6 },
  wind:   { streaks: 12, dust: 5 },
  sound:  { rings: 2, streaks: 7 },
  shadow: { smoke: 7, burst: 10 },
  soul:   { ripple: 1, smoke: 6 },
  // Round 15 — the four staged fighters.
  // Dagon generates water out of nothing, so a hit throws spray and a ring of
  // surge rather than a glow.
  water:  { droplets: 14, spray: 8, rings: 1 },
  // Mechamaru is a cursed corpse with cannons in it: metal glints and sparks
  // like `steel`, plus the vented steam a machine working past its rating puts
  // out. Not the same element as steel — he DOES have cursed energy, and the
  // cannon shots keep their colour.
  machine: { glints: 8, sparks: 6, smoke: 4 },
  // Kurourushi's hits are always partly the roaches: specks that scatter and
  // crawl, over a dark chitinous burst.
  swarm:  { specks: 14, smoke: 4, burst: 8 },
};

// Colour ramps per element. A particle with a ramp walks it over its life —
// fire cools white → orange → deep red, smoke darkens, blood dries.
export const ELEMENT_PALETTES = {
  fire:   ["#fff1b8", "#ffb14a", "#ff6a00", "#8a1b00"],
  ember:  ["#ffd24a", "#ff7a2f", "#b23a10"],
  blood:  ["#c8102e", "#8f0f20", "#4a0308"],
  steel:  ["#ffffff", "#dfe6f2", "#9aa6b8"],
  wind:   ["#f4fbf7", "#dff5e8", "#b8dcc8"],
  sound:  ["#f5e7c4", "#e8d5a8"],
  shadow: ["#3a3f68", "#20244a", "#101228"],
  soul:   ["#d9d2f2", "#a99ede", "#7f74b8"],
  smoke:  ["rgba(120,126,140,0.55)", "rgba(84,88,100,0.45)", "rgba(50,52,62,0.3)"],
  water:  ["#eaf7ff", "#7fc9ec", "#2f8fd8", "#17537f"],
  steam:  ["rgba(214,224,232,0.5)", "rgba(160,174,188,0.38)", "rgba(96,108,120,0.22)"],
  swarm:  ["#5a2f38", "#3b1d26", "#1a0e12"],
};

// --------------------------------------------------------- projectile trails
//
// Every projectile drags a fading comet tail of its own colour, sampled from
// where it has actually been (so an arcing or steered shot's tail bends with
// it), and an element-tagged one sheds matching particles in flight.
export const PROJ_TRAIL = {
  enabled: true,
  step: 0.02,   // seconds between tail samples
  len: 7,       // samples kept — tail length is roughly step * len of travel
  alpha: 0.34,  // opacity at the head of the tail (fades to 0 at the tip)
  width: 0.6,   // head width as a fraction of the projectile's radius
};

// Particles per second shed in flight, per fxElement tag. Anything not listed
// (or 0) sheds nothing — the trail alone carries it.
export const PROJ_EMIT = {
  fire: 30, blood: 22, feather: 10, wind: 16, sound: 5, shadow: 16, soul: 12,
  water: 26, machine: 14, swarm: 20,
};

// ------------------------------------------------------ per-character extras
export const CHAR_FX = {
  counterShimmer: 13,   // particles/sec orbiting a held counter (Infinity, Sky Fold)
  healMotes: 24,        // gold motes/sec while Reverse Cursed Technique channels
  dismantleLines: 3,    // slash lines per hit of Sukuna's barrage…
  dismantleFinisher: 9, // …and across the finisher
  dismantleSpan: 150,   // slash line length, px
  seamLength: 100,      // Nanami's 7:3 seam length, px
  swapTrailTime: 0.3,   // afterimage seconds left at both Boogie Woogie positions
};

// --------------------------------------------------------------- Black Flash
//
// The show's flashiest single effect: a crimson core, jagged BLACK lightning
// fractures, and the world dropping dark for a beat. Shared by Yuji's passive
// proc and the two crit-finisher ultimates.
export const BLACK_FLASH = {
  forks: 12,                       // crackle branch count
  reach: 90,                       // how far the forks reach, px
  colors: ["#e01b1b", "#7a0000", "#000000", "#000000"],  // black twice: half the forks are black
  flashSize: 52,                   // the one-frame white core, px
  vignetteAlpha: 0.42,             // peak darkness of the red edge vignette
  vignetteTime: 0.28,              // seconds it takes to fade
  vignetteColor: "#2a0000",
  duckTo: 0.2,                     // music drops to this fraction…
  duckTime: 0.4,                   // …for this long (the near-silence beat)
  critVignetteScale: 0.6,          // the crit finishers reuse the vignette, softer
};

// -------------------------------------------------------------------- rumble
//
// Controller vibration (Gamepad vibrationActuator; feature-detected, silently
// absent where unsupported). Only the affected player's pad rumbles; big
// screen shakes reach every human pad as a low ambient. s = strong motor
// (low-frequency thump), w = weak motor (high-frequency buzz), t = seconds.
export const RUMBLE = {
  enabled: true,
  hitScale: 0.045,     // strong magnitude per % of damage taken
  hitTime: 0.1,        // seconds per hit pulse
  attackerEcho: 0.35,  // fraction of the victim's rumble the attacker feels
  shakeFloor: 6,       // camera shake below this rumbles nobody
  shakeScale: 0.04,    // ambient weak magnitude per shake unit above the floor
  shakeMax: 0.55,
  events: {
    parry:       { s: 0.15, w: 0.9, t: 0.07 },
    shieldBreak: { s: 1.0, w: 0.5, t: 0.55 },
    launch:      { s: 0.75, w: 0.3, t: 0.28 },
    ko:          { s: 1.0, w: 1.0, t: 0.8 },
    ult:         { s: 0.45, w: 0.7, t: 0.45 },
    // tick … beat … slam, matching the visual
    blackFlash:  [{ s: 0.25, w: 0.7, t: 0.05 }, { delay: 0.12, s: 1.0, w: 0.4, t: 0.22 }],
  },
};

// --------------------------------------------------------------- dash strike
//
// The twelve side-specials that share `dashStrike` used to spawn ten dust
// motes and nothing else. Now: a fan of velocity-aligned streaks at launch,
// and a boosted afterimage trail for the lunge.
export const DASH_FX = {
  streaks: 9,          // launch streak count (before FX_DENSITY)
  trailTime: 0.3,      // seconds of boosted afterimages after launch
  trailStrength: 0.65, // afterimage strength during it (a plain dash is 0.6)
};
