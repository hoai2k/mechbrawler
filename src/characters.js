// MECH BRAWLER — all 17 mechs: stats, attack profiles, specials, ultimates,
// passives. The design source of truth is docs/characters.md — that file says
// what each kit SHOULD be and why; this one is the data the engine consumes.
// Identity (names, titles, blurbs, quotes, colors) comes from
// mechs/characters.json, and the roster order here IS that file's order.
//
// Stat mapping from the Mech Mayhem numbers (characters.json `stats`):
//   speed    = 240 + MMspeed × 19
//   airSpeed = round(speed × 0.82)
//   accel    = round(3400 − MMweight × 1200)
//   jump     = 690 + MMjump × 14
//   airJumps = 1 (everyone — jets, not flights; docs/characters.md)
//   weight   = round2(0.78 + MMweight × 0.33 + MMarmor × 0.55)
//   friction = MMweight >= 0.9 ? 0.9 : 0.86
//   heightCm = measured export height (units) × 26, rounded
//   light.dmg = round1(MM light dmg[0] / 5)
//   heavy.dmg = round1(MM heavy dmg / 6.5)
//   N cooldown = MM ranged cooldown, clamped to >= 0.75
//   S/D cooldowns = MM special cooldown / 1.6, clamped 3.5–6
//
// `theme` is the mech's glow hex from characters.json `look.glow`; `shadow` is
// the same color at alpha 0.36. There are no `anims` or `scale` fields any
// more (the sprite-sheet era is over; render3d drives the bodies) and no
// `domains` — the full-bar super is the ultimate, full stop.
//
// Every special `type` names a handler in src/specials.js and every ultimate
// `type` a director in src/ultimates.js; the `p` shapes mirror the JJK kits
// that used the same handler, so every field written here is actually read.
//
// `ranged` is the RB slot: the mech's Mech Mayhem gun, moved out of
// specials.neutral (K1). Same config shape as a special, run down the same
// execution path (specials.js performRanged), with `p.energyCost` pricing each
// shot in inherent energy — cheap for rapid guns, dear for big single shells.
// Specials spend energy too (`p.energyCost ?? 30`, constants.js
// INHERENT_ENERGY); the freed N slot is backfilled per mech below.
// Where docs/characters.md asks for behavior the engine does not have yet, the
// closest existing handler is used and a `// TODO(engine):` comment says what
// is still owed.

import { CHARACTER_GROUPS } from "./config_menus.js";

// Fighters whose kits are wired but whose art has not been delivered, so they
// must not reach character select or randomCharacterKey(). Empty at the mech
// launch — all 17 ship together — but the staging mechanism stays.
export const STAGED_CHARACTER_KEYS = [];

// Sentinel selection meaning "draw a fresh fighter at the start of every match"
// rather than naming one. Never a key in CHARACTERS — resolve it through
// randomCharacterKey() before building a fighter.
export const RANDOM_KEY = "__random";

/** A fighter at random. `avoid` is a soft preference, not a rule: the CPUs a
 *  match mode brings along pass the fighters already in the match so a Battle
 *  Royal does not field the same mech three times, and a roster smaller than
 *  the match simply falls back to drawing from everyone. */
export function randomCharacterKey(avoid = []) {
  const pool = avoid.length ? CHARACTER_KEYS.filter((k) => !avoid.includes(k)) : CHARACTER_KEYS;
  const from = pool.length ? pool : CHARACTER_KEYS;
  return from[Math.floor(Math.random() * from.length)];
}

// The four-frame run cycle, kept because config_transform.js maps legacy frame
// keys through it. The render3d rigs animate the bodies now; this is only the
// frame-key vocabulary the old pipelines still speak.
export const RUN_CYCLE_FRAMES = ["run_reach_a", "run_pass_a", "run_reach_b", "run_pass_b"];

export const CHARACTERS = {
  // --------------------------------------------------------------- TITANUS
  titanus: {
    name: "Titanus",
    fullName: "Titanus",
    epithet: "The Iron Avalanche",
    heightCm: 191,     // 7.35 units × 26
    theme: "#ffa832",
    shadow: "rgba(255, 168, 50, 0.36)",
    stats: { speed: 377, airSpeed: 309, accel: 2200, jump: 858, airJumps: 1, weight: 1.23, friction: 0.9 },
    // MM light 46/50/68 with triple the roster's knockback. THE CHARGE CONTRACT
    // (docs/characters.md): `charge` is read by fighter.js — `light` and
    // `heavy` are the seconds to a full bank, `walk` lets him keep walking
    // while the light winds up, `lungeVx` is the half-step the release carries
    // him through the blow, and `glow` sites the charge sparks on the arms.
    // Titanus and colossus are the only two kits that declare it.
    charge: { light: 0.7, walk: true, lungeVx: 190, glow: "arms" },
    light: { dmg: 9.2, speed: 0.9, angle: 0.34, effect: null, label: "Haymaker String", sfx: "punch" },
    heavy: { dmg: 16.2, speed: 0.9, angle: 0.46, effect: null, label: "Overhead Pound", sfx: "punch", shieldMul: 1.8 },
    // The MM gun, on RB. A big single shell: priced near the top of the band.
    ranged: {
      name: "Rocket Fist", type: "projectile", cooldown: 2.4,
      desc: "A fist leaves the arm as real ordnance, hits like a truck, and flies home to re-dock.",
      p: { sprite: "effect:rocket_fist", spriteH: 84, energyCost: 18, speed: 600, vy: 0, r: 30, dur: 0.85, dmg: 11, base: 480, growth: 8.0, angle: 0.34, color: "#ffa832", label: "Rocket Fist" },
    },
    specials: {
      // New N (the gun moved to RB): the charge-punch identity as a special —
      // the blow lands, then the shock of it lands again. echoStrike, yuji's
      // Divergent Fist shape.
      neutral: {
        name: "Breaker Fist", type: "echoStrike", cooldown: 3.5,
        desc: "One haymaker, two impacts — the fist lands, and a beat later the shock of it lands again.",
        p: { delay: 0.1, echoDelay: 0.34, ox: 46, oy: -100, w: 180, h: 110, dmg: 10, base: 420, growth: 7.0, angle: 0.4, echoDmg: 7, echoBase: 480, echoGrowth: 7.6, echoAngle: 0.5, color: "#ffa832", label: "Breaker Fist" },
      },
      side: {
        name: "Skyline Slam", type: "commandGrab", cooldown: 5.0,
        desc: "Seize, hoist clean overhead, and hurl them flat across the arena — a kill throw at the edge.",
        p: { range: 130, dmg: 16, base: 620, growth: 8.6, angle: 0.35, color: "#ffa832", label: "Skyline Slam" },
      },
      down: {
        name: "Bulwark Stomp", type: "burst", cooldown: 4.0,
        desc: "A short ground quake around him that knocks the crowd up and off.",
        p: { armor: true, delay: 0.12, dur: 0.16, ox: 0, oy: -60, w: 300, h: 130, dmg: 12, base: 470, growth: 7.4, angle: 1.2, label: "Bulwark Stomp", color: "#ffa832", sfx: "punch" },
      },
    },
    ultimate: {
      name: "METEOR BREAKER", type: "meteor",
      desc: "He reaches to the sky and it answers — a meteor hammers the zone in front and leaves the ground burning.",
      // TODO(engine): docs/characters.md stages this as a SHOWER (62×14); the
      // meteor director drops one rock, so it lands as one huge one.
      p: { sprite: "effect:meteor_rock", spriteH: 310, dmg: 32, base: 920, growth: 11, r: 200, fallTime: 1.1, burnField: 2.6, color: "#ffa832", label: "METEOR BREAKER" },
    },
    passive: { id: "siegePlating", name: "Siege Plating", desc: "Armor plate over everything: jabs cannot flinch him while a charge is banking." },
    ai: { style: "heavy", range: 280 },
    blurb: "A decommissioned siege engine that refused to power down. Slow as a glacier, hits like the end of the world. Speaks rarely — mostly in earthquakes.",
    quotes: {
      intro: "\"I am the wall. I am the wrecking ball.\"",
      win: "\"Demolition complete. Anything else need... flattening?\"",
    },
  },

  // ---------------------------------------------------------------- VULCAN
  vulcan: {
    name: "Vulcan",
    fullName: "Vulcan",
    epithet: "The Lead Storm",
    heightCm: 169,     // 6.51 units × 26
    theme: "#ff8c30",
    shadow: "rgba(255, 140, 48, 0.36)",
    stats: { speed: 421, airSpeed: 345, accel: 2656, jump: 872, airJumps: 1, weight: 1.04, friction: 0.86 },
    light: { dmg: 6.0, speed: 1.0, angle: 0.3, effect: null, label: "Muzzle Jab", sfx: "punch" },
    heavy: { dmg: 12.0, speed: 1.0, angle: 0.44, effect: null, label: "Barrel Club", sfx: "punch", shieldMul: 1.6 },
    // The MM gun, on RB. The cheapest, most rapid gun in the game.
    ranged: {
      name: "Gatling Burst", type: "channel", cooldown: 0.75,
      desc: "A held spray of tracer that chips, pushes, and never kills — it exists to make you approach.",
      // A held CHANNEL: `tickRate` is the cadence, `energyCost` the price of
      // each tick out of the inherent pool, `maxT` how long one hold may run.
      // `spinUpStep`/`spinUpFloor` are the Spin-Up passive's tightening.
      // TODO(engine): swapping arms every couple of seconds (channelSwap 2).
      p: { sprite: "effect:gatling_tracer", spriteH: 40, tickRate: 0.09, maxT: 3.2, energyCost: 4, speed: 900, vy: 0, r: 14, dur: 0.55, dmg: 2, base: 130, growth: 2.2, angle: 0.28, color: "#ff8c30", count: 2, spread: 90, spinUpStep: 0.05, spinUpFloor: 0.3, label: "Gatling" },
    },
    specials: {
      // New N (the gun moved to RB): more ammunition, of course — a lobbed
      // frag shell with real splash, the arc the flat gatling stream lacks.
      neutral: {
        name: "Frag Shell", type: "projectile", cooldown: 3.5,
        desc: "A fat grenade lobbed over the tracer line — every problem is insufficient ammunition.",
        p: { speed: 480, vy: -160, gravity: 340, r: 26, dur: 1.1, dmg: 10, base: 400, growth: 6.8, angle: 0.5, color: "#ff8c30", explode: 90, label: "Frag Shell" },
      },
      side: {
        name: "Micro-Missile Volley", type: "projectile", cooldown: 4.1,
        desc: "Both shoulder pods ripple-fire six seekers that arc onto the target.",
        p: { sprite: "effect:micro_missile", spriteH: 46, speed: 480, vy: -60, r: 20, dur: 1.3, dmg: 4.5, base: 250, growth: 5.0, angle: 0.4, color: "#ff8c30", count: 6, spread: 130, homing: 150, label: "Missiles" },
      },
      down: {
        name: "Flak Fan", type: "projectile", cooldown: 3.5,
        desc: "An upward spread burst — his anti-air, ugly to jump into.",
        p: { speed: 520, vy: -320, gravity: 380, r: 22, dur: 0.9, dmg: 5, base: 300, growth: 5.6, angle: 0.8, color: "#ff8c30", count: 3, spread: 170, label: "Flak" },
      },
    },
    ultimate: {
      name: "BULLET HURRICANE", type: "vortex",
      desc: "A hundred rounds fall into orbit around him — a storm of lead that folds onto whoever strays close.",
      p: { sprite: "effect:gatling_tracer", spriteH: 250, speed: 300, r: 120, dur: 2.8, tickRate: 0.16, dmgTick: 3.5, base: 200, growth: 4.2, finalBase: 780, pull: 340, color: "#ff8c30", label: "BULLET HURRICANE" },
    },
    passive: { id: "spinUp", name: "Spin-Up", desc: "The barrels remember: consecutive Gatling seconds tighten its spread." },
    ai: { style: "zoner", range: 460 },
    blurb: "Ex-military fire-support platform with a laugh setting stuck on maniacal. Believes every problem is just insufficient ammunition.",
    quotes: {
      intro: "\"Say hello to my six little friends!\"",
      win: "\"HAHAHA! Reload and repeat! WHO'S NEXT?!\"",
    },
  },

  // ----------------------------------------------------------------- VIPER
  viper: {
    name: "Viper",
    fullName: "Viper",
    epithet: "The Whispering Fang",
    heightCm: 153,     // 5.90 units × 26
    theme: "#5aff2e",
    shadow: "rgba(90, 255, 46, 0.36)",
    stats: { speed: 497, airSpeed: 408, accel: 3040, jump: 907, airJumps: 1, weight: 0.88, friction: 0.86 },
    light: { dmg: 6.0, speed: 1.1, angle: 0.26, effect: null, label: "Energy Daggers", sfx: "slash" },
    heavy: { dmg: 10.8, speed: 1.1, angle: 0.4, effect: null, label: "Corkscrew Drill", sfx: "slashHeavy", shieldMul: 1.5 },
    // The MM gun, on RB. Cheap and rapid — the spammable dagger.
    ranged: {
      name: "Fang Throw", type: "projectile", cooldown: 0.8,
      desc: "A thrown forearm dagger — the blade visibly leaves her arm and regrows. Fast, flat, spammable.",
      p: { sprite: "effect:fang_dagger", spriteH: 58, energyCost: 6, speed: 720, vy: -2, r: 18, dur: 0.7, dmg: 6.5, base: 260, growth: 5.4, angle: 0.3, color: "#5aff2e", label: "Fang Throw" },
    },
    specials: {
      // New N (the dagger moved to RB): the fencer's mixup — a backstep that
      // becomes a springing stab, angles nobody teaches. feint, maki's shape.
      neutral: {
        name: "Serpent Feint", type: "feint", cooldown: 3.5,
        desc: "She flows backward off the line, then springs through it blades-first — the retreat was the attack.",
        p: { iframes: 0.26, lunge: 600, delay: 0.05, dur: 0.14, ox: 50, oy: -96, w: 180, h: 100, dmg: 10, base: 400, growth: 6.8, angle: 0.32, color: "#5aff2e", label: "Serpent Feint", sfx: "slash" },
      },
      side: {
        name: "Blade Cyclone", type: "dashStrike", cooldown: 3.75,
        desc: "Everything above the waist spins free while the legs keep walking — a striding whirlwind of blades.",
        p: { vel: 430, iframes: 0.08, delay: 0.05, dur: 0.36, ox: 44, oy: -96, w: 156, h: 110, dmg: 5, base: 300, growth: 5.6, angle: 0.38, hits: 3, label: "Blade Cyclone", sfx: "slash" },
      },
      down: {
        name: "Phantom Step", type: "shadowPort", cooldown: 3.5,
        desc: "A blink through the opponent to their far side, with a backstab window on arrival.",
        p: { dist: 320, iframes: 0.4, color: "#5aff2e" },
      },
    },
    ultimate: {
      name: "SERPENT STORM", type: "eruption",
      desc: "She coils, springs skyward, and the brood floods the stage floor — the first fang pins, the rest pile on.",
      // VENOM is hers alone (constants.js STATUS.venom): the first fang PINS
      // — a beat of paralysis — and the DoT is the rest of the brood piling on.
      p: { sprite: "effect:energy_serpent", waves: 5, waveGap: 0.45, dmg: 11, base: 400, growth: 7.0, effect: "venom", color: "#5aff2e", label: "SERPENT STORM" },
    },
    passive: { id: "assassinsRead", name: "Assassin's Read", desc: "Angles nobody teaches: +15% damage striking from behind." },
    ai: { style: "rush", range: 260 },
    blurb: "A prototype infiltration unit that developed a taste for theatrics. Strikes from angles geometry teachers refuse to acknowledge.",
    quotes: {
      intro: "\"Shall we dance? You won't hear the music.\"",
      win: "\"Ssso predictable. You never even sssaw me.\"",
    },
  },

  // ----------------------------------------------------------------- RHINO
  rhino: {
    name: "Rhino",
    fullName: "Rhino",
    epithet: "The Unstoppable Object",
    heightCm: 179,     // 6.87 units × 26
    theme: "#ff2a20",
    shadow: "rgba(255, 42, 32, 0.36)",
    stats: { speed: 396, airSpeed: 325, accel: 2320, jump: 858, airJumps: 1, weight: 1.18, friction: 0.9 },
    light: { dmg: 8.0, speed: 0.95, angle: 0.32, effect: null, label: "Horn Jab", sfx: "punch" },
    heavy: { dmg: 14.6, speed: 0.95, angle: 0.44, effect: null, label: "Planted Horn", sfx: "punch", shieldMul: 1.8 },
    // The MM gun, on RB. A mid-weight shell: mid-band price.
    ranged: {
      name: "Shoulder Cannon", type: "projectile", cooldown: 1.3,
      desc: "A hand cannon per fist, alternating — slow shells with real splash, a mid-range poke.",
      p: { sprite: "effect:cannon_shell", spriteH: 62, energyCost: 14, speed: 550, vy: -8, r: 26, dur: 0.9, dmg: 11, base: 420, growth: 7.0, angle: 0.4, color: "#ff2a20", explode: 70, label: "Shoulder Cannon" },
    },
    specials: {
      // New N (the cannon moved to RB): the horn, thrown UP — a planted
      // upward gore that starts the launch his side heavy finishes. burst.
      neutral: {
        name: "Horn Break", type: "burst", cooldown: 3.5,
        desc: "A braced upward rip of the horn — whatever it catches leaves the ground.",
        p: { delay: 0.1, dur: 0.14, ox: 40, oy: -110, w: 170, h: 160, dmg: 11, base: 440, growth: 7.2, angle: 1.1, label: "Horn Break", color: "#ff2a20", sfx: "punch" },
      },
      side: {
        name: "Bull Rush", type: "dashStrike", cooldown: 4.1,
        desc: "Drops to all fours and gallops down the lane — one clean launch the moment it connects.",
        // TODO(engine): docs/characters.md holds the gallop while B is held
        // (up to ~2s); the dashStrike handler is a fixed-length lunge.
        p: { vel: 660, armor: true, delay: 0.08, dur: 0.32, ox: 62, oy: -96, w: 210, h: 110, dmg: 15, base: 520, growth: 8.0, angle: 0.3, label: "Bull Rush", sfx: "punch" },
      },
      down: {
        name: "Bring a Wall", type: "counter", cooldown: 4.0,
        desc: "A counter-brace: struck during the window, he shoulder-checks straight through the attacker.",
        p: { window: 0.55, dmg: 14, base: 520, growth: 8.0, angle: 0.35, color: "#ff2a20", label: "Bring a Wall" },
      },
    },
    ultimate: {
      name: "STAMPEDE", type: "rampage",
      desc: "Three of him, shoulder to shoulder, thunder across the whole stage floor — a wall of rhino you jump, not block.",
      // THREE of him, shoulder to shoulder (`copies`, ultimates.js): the two
      // phantom rhinos charge alongside the real one, so the wall is a wall.
      p: { passes: 3, copies: 3, speed: 900, dmg: 15, base: 540, growth: 8.2, color: "#ff2a20", label: "STAMPEDE" },
    },
    passive: { id: "plated", name: "Plated", desc: "Top-grade plate: jabs cannot flinch him while he walks." },
    ai: { style: "heavy", range: 280 },
    blurb: "One horn. One direction. Zero brakes. RHINO once charged through four buildings to win an argument he was already winning.",
    quotes: {
      intro: "\"You look like something worth flattening.\"",
      win: "\"HRRNGH! Next time — bring a wall that works!\"",
    },
  },

  // --------------------------------------------------------------- TEMPEST
  tempest: {
    name: "Tempest",
    fullName: "Tempest",
    epithet: "The Voltage Virtuoso",
    heightCm: 162,     // 6.22 units × 26
    theme: "#3fd8ff",
    shadow: "rgba(63, 216, 255, 0.36)",
    stats: { speed: 459, airSpeed: 376, accel: 2896, jump: 900, airJumps: 1, weight: 0.94, friction: 0.86 },
    light: { dmg: 5.6, speed: 1.05, angle: 0.3, effect: null, label: "Static Jab", sfx: "punch" },
    heavy: { dmg: 6.5, speed: 1.05, angle: 0.42, effect: "shock", label: "Travelling Tornado", sfx: "whoosh", shieldMul: 1.5 },
    // The MM gun, on RB. Rapid lightning: cheap.
    ranged: {
      name: "Arc Bolt", type: "projectile", cooldown: 0.9,
      desc: "Lightning that jumps — it finds its mark and wants a second body nearby.",
      // TODO(engine): the chain-to-a-second-target behaviour is still owed;
      // SHOCK is live (constants.js STATUS.shock).
      p: { sprite: "effect:arc_bolt", spriteH: 70, energyCost: 8, speed: 760, vy: 0, r: 22, dur: 0.7, dmg: 8, base: 330, growth: 6.4, angle: 0.36, color: "#3fd8ff", effect: "shock", label: "Arc Bolt" },
    },
    specials: {
      // New N (the bolt moved to RB): the concert made a weapon — a resonant
      // chord blasted off the stacks. shout, the sonic-cone shape.
      neutral: {
        name: "Power Chord", type: "shout", cooldown: 3.5,
        desc: "He strikes a chord off his own stacks and the front row takes it in the chest.",
        p: { ox: 40, oy: -110, w: 280, h: 170, dmg: 9, base: 400, growth: 6.6, angle: 0.5, color: "#3fd8ff", label: "POWER CHORD" },
      },
      side: {
        name: "Static Overload", type: "trap", cooldown: 4.4,
        desc: "Places a storm cell a short way ahead — the cloud gathers, then bolts hammer down into the zone.",
        p: { sprite: "effect:storm_cell", spriteH: 150, dist: 240, armTime: 0.6, lifetime: 4, w: 150, h: 240, dmg: 14, base: 470, growth: 7.6, angle: 1.1, color: "#3fd8ff", label: "Static Overload" },
      },
      down: {
        name: "Feedback Coil", type: "counter", cooldown: 3.5,
        desc: "An electric counter — the riposte is a point-blank discharge.",
        p: { window: 0.5, dmg: 13, base: 460, growth: 7.4, angle: 0.5, effect: "shock", color: "#3fd8ff", label: "Feedback Coil" },
      },
    },
    ultimate: {
      name: "THUNDERFALL", type: "tempest",
      desc: "The sky goes dark over most of the stage and the weather answers — bolts hammer everyone caught in the gloom.",
      p: { sprite: "effect:storm_cell", spriteH: 420, duration: 3.4, dmgTick: 4, tickRate: 0.28, base: 210, growth: 4.5, finalBase: 760, effect: "shock", color: "#3fd8ff", label: "THUNDERFALL" },
    },
    passive: { id: "groundedRod", name: "Grounded Rod", desc: "The storm feeds the showman: +25% energy gain while a foe is shocked." },
    ai: { style: "balanced", range: 340 },
    blurb: "A weather-control unit that discovered showmanship. Every battle is a concert, every lightning bolt a chord. The crowd goes wild; the crowd is usually on fire.",
    quotes: {
      intro: "\"Lights up! The show starts NOW.\"",
      win: "\"⚡ ENCORE? No? Suit yourselves. I was ELECTRIC.\"",
    },
  },

  // ---------------------------------------------------------------- FENRIR
  fenrir: {
    name: "Fenrir",
    fullName: "Fenrir",
    epithet: "The Last Wild Thing",
    heightCm: 161,     // 6.18 units × 26
    theme: "#6cd8ff",
    shadow: "rgba(108, 216, 255, 0.36)",
    stats: { speed: 478, airSpeed: 392, accel: 2860, jump: 900, airJumps: 1, weight: 0.96, friction: 0.86 },
    light: { dmg: 6.0, speed: 1.05, angle: 0.28, effect: null, label: "Claw Rake", sfx: "slash" },
    heavy: { dmg: 11.7, speed: 1.05, angle: 0.44, effect: null, label: "Spike Leap", sfx: "slashHeavy", shieldMul: 1.6 },
    // The MM ranged weapon, on RB. A steady poke: cheap-mid.
    ranged: {
      name: "Rend Wave", type: "wave", cooldown: 1.0,
      desc: "A crescent of torn air off the claws — his poke, medium speed, good arc.",
      p: { sprite: "effect:rend_wave", spriteH: 120, energyCost: 8, speed: 460, r: 34, dur: 0.9, dmg: 7, base: 340, growth: 6.4, angle: 0.36, color: "#6cd8ff", label: "Rend Wave" },
    },
    specials: {
      // New N (the wave moved to RB): the claws up close — a savaging flurry
      // on the spot, the bite behind the gap-closer. burst.
      neutral: {
        name: "Savage Flurry", type: "burst", cooldown: 3.5,
        desc: "Both claws, no ceremony — a tearing flurry for whatever the pounce just caught.",
        p: { delay: 0.06, dur: 0.18, ox: 40, oy: -96, w: 190, h: 110, dmg: 11, base: 400, growth: 6.8, angle: 0.36, label: "Savage Flurry", color: "#6cd8ff", sfx: "slash" },
      },
      side: {
        name: "Lunar Pounce", type: "dashStrike", cooldown: 3.5,
        desc: "A flat predator's lunge — fast, low, the gap-closer the rest of the kit hunts behind.",
        p: { vel: 680, iframes: 0.1, delay: 0.05, dur: 0.24, ox: 60, oy: -90, w: 200, h: 100, dmg: 13, base: 470, growth: 7.4, angle: 0.3, label: "Lunar Pounce", sfx: "slash" },
      },
      down: {
        name: "Howl", type: "shout", cooldown: 4.0,
        desc: "A rallying cry — nearby foes get a flinch of hesitation, and the pack answers.",
        p: { ox: 0, oy: -110, w: 340, h: 180, dmg: 5, base: 280, growth: 4.4, angle: 0.4, selfSpeed: 1.18, selfSpeedT: 2.6, energyPerFoe: 14, color: "#6cd8ff", label: "HOWL" },
      },
    },
    ultimate: {
      name: "WILD HUNT", type: "summon",
      desc: "Rifts tear open and the pack pours out, running down the nearest enemy — a wolf that lands its bite is satisfied and leaves.",
      // THREE pack-mates (docs/characters.md, capped from MM's twenty).
      p: {
        count: 3,
        // A pack-mate IS the mech: the summon draws through fenrir's own rig
        // (`actor`), shrunk by `scale` so three wolves read as a pack rather
        // than as three fenrirs. The hitbox stays hitW/hitH — shrinking the
        // drawing never shrinks the threat (src/config_summons.js).
        actor: "fenrir", scale: 0.45,
        id: "wildHunt", behavior: "chaser", duration: 6, speed: 520, maxActive: 3,
        color: "#6cd8ff", h: 130, hitW: 110, hitH: 96, standOff: 22,
        attack: { dmg: 8, base: 340, growth: 6.0, angle: 0.35, cd: 0.9, sfx: "slash" },
        label: "WILD HUNT",
      },
    },
    passive: { id: "predatorsRhythm", name: "Predator's Rhythm", desc: "The chase pays for itself: a landed dash attack refunds half the dash and a tick of energy." },
    ai: { style: "rush", range: 280 },
    blurb: "An autonomous hunter-frame that slipped its leash decades ago. Runs with no pack, answers to no handler, howls at every full moon — and every explosion.",
    quotes: {
      intro: "\"I smell fear-coolant. It's yours.\"",
      win: "\"*low growl* ...The hunt was short. Run faster next time.\"",
    },
  },

  // -------------------------------------------------------------- COLOSSUS
  colossus: {
    name: "Colossus",
    fullName: "Colossus",
    epithet: "The Patient Thunder",
    heightCm: 184,     // 7.09 units × 26
    theme: "#ffc23c",
    shadow: "rgba(255, 194, 60, 0.36)",
    stats: { speed: 364, airSpeed: 298, accel: 2200, jump: 844, airJumps: 1, weight: 1.24, friction: 0.9 },
    // The titanus charge contract, with artillery patience: he banks a beat
    // longer than titanus does and gets a little less out of the step.
    charge: { light: 0.8, walk: true, lungeVx: 160, glow: "arms" },
    light: { dmg: 8.4, speed: 0.9, angle: 0.34, effect: null, label: "Banked Haymaker", sfx: "punch" },
    heavy: { dmg: 15.4, speed: 0.9, angle: 0.46, effect: null, label: "Thunderclap Pound", sfx: "punch", shieldMul: 1.8 },
    // The MM gun, on RB. The biggest single shell in the game: priced to match.
    ranged: {
      name: "Mortar Lob", type: "projectile", cooldown: 1.7,
      desc: "A high arcing shell that lands where you are about to be — the slowest, meanest projectile in the game.",
      p: { sprite: "effect:mortar_shell", spriteH: 68, energyCost: 22, speed: 430, vy: -260, gravity: 420, r: 34, dur: 1.5, dmg: 13.5, base: 520, growth: 8.4, angle: 0.6, color: "#ffc23c", explode: 100, label: "Mortar Lob" },
    },
    specials: {
      // New N (the mortar moved to RB): artillery patience as a special — a
      // fire mission called onto ground ahead, shells arriving on a delay.
      // trap, tempest's storm-cell shape.
      neutral: {
        name: "Fire Mission", type: "trap", cooldown: 4.0,
        desc: "He designates a stretch of ground three moves ahead — then the shells arrive on it.",
        p: { sprite: "effect:mortar_shell", spriteH: 90, dist: 260, armTime: 0.7, lifetime: 3.5, w: 170, h: 200, dmg: 13, base: 460, growth: 7.4, angle: 0.9, color: "#ffc23c", label: "Fire Mission" },
      },
      side: {
        name: "Skyline Toss", type: "commandGrab", cooldown: 5.0,
        desc: "The command grab, thrown up-and-out — he sets up his own mortar.",
        p: { range: 130, dmg: 16, base: 600, growth: 8.4, angle: 0.9, color: "#ffc23c", label: "Skyline Toss" },
      },
      down: {
        name: "Bunker Down", type: "install", cooldown: 4.5,
        desc: "Plants: heavy armor and a thicker guard for a beat — the patient answer to pressure.",
        p: { duration: 2.6, armor: true, dmgTakenMul: 0.8, shieldDmgMul: 0.6, color: "#ffc23c", label: "BUNKER" },
      },
    },
    ultimate: {
      name: "COLOSSAL FORM", type: "install",
      desc: "No shell this time — he is the ordnance. He grows and simply walks through the fight.",
      // TODO(engine): the install director reads no scale term; `scaleMul` is
      // the ×2.2 growth docs/characters.md stages, waiting on engine support.
      p: { duration: 9, dmgMul: 1.35, speedMul: 0.9, armor: true, scaleMul: 2.2, color: "#ffc23c", label: "COLOSSAL FORM" },
    },
    passive: { id: "siegePlating", name: "Siege Plating", desc: "Armor plate over everything: jabs cannot flinch him while a charge is banking." },
    ai: { style: "zoner", range: 440 },
    blurb: "A firebase that learned to walk, then learned chess. Plays the long game: every shell placed three moves ahead of where you plan to be.",
    quotes: {
      intro: "\"Range confirmed. This will be educational.\"",
      win: "\"Checkmate was eight shells ago. You just heard it now.\"",
    },
  },

  // ---------------------------------------------------------------- WRAITH
  wraith: {
    name: "Wraith",
    fullName: "Wraith",
    epithet: "The Hollow Echo",
    heightCm: 158,     // 6.09 units × 26
    theme: "#ff2030",
    shadow: "rgba(255, 32, 48, 0.36)",
    stats: { speed: 449, airSpeed: 368, accel: 2980, jump: 886, airJumps: 1, weight: 0.9, friction: 0.86 },
    light: { dmg: 6.0, speed: 1.05, angle: 0.3, effect: null, label: "Stock Strike", sfx: "punch" },
    heavy: { dmg: 10.5, speed: 1.05, angle: 0.44, effect: null, label: "Wing Lasers", sfx: "slashHeavy", shieldMul: 1.5 },
    // The rifle, on RB — the one weapon everything else in the kit is spent on.
    // A heavy single round: priced high.
    ranged: {
      name: "Sniper Round", type: "projectile", cooldown: 1.5,
      desc: "A piercing shot down the rifle line — slow to aim, flat, hits through bodies.",
      // TODO(engine): hold-to-steady charge and the laser-sight telegraph.
      // 800 METRES: the round grows with the distance it has flown
      // (`distanceScale`, read by the passive in combat.js).
      p: { sprite: "effect:sniper_beam", spriteH: 40, energyCost: 16, speed: 940, vy: 0, r: 18, dur: 0.6, dmg: 12, base: 430, growth: 7.2, angle: 0.24, color: "#ff2030", pierce: true, distanceScale: { per: 320, gain: 0.28, max: 1.8 }, label: "Sniper Round" },
    },
    specials: {
      // New N (the rifle moved to RB): sniper theatre without the rifle — a
      // kill-mark that detonates where the target STOOD when he called it.
      // warpStrike, uro's telegraphed-drop shape.
      neutral: {
        name: "Deadman's Mark", type: "warpStrike", cooldown: 3.5,
        desc: "He marks the spot you are standing on. Officially, nothing happens there. Move.",
        p: { sprite: "effect:bat_wisp", spriteH: 130, delay: 0.4, r: 95, dmg: 11, base: 420, growth: 7.0, angle: 0.6, color: "#ff2030", label: "Deadman's Mark" },
      },
      side: {
        name: "Night Swarm", type: "projectile", cooldown: 3.5,
        desc: "Three bats that drift and home lazily — screen control while he lines up the rifle.",
        p: { sprite: "effect:bat_wisp", spriteH: 62, speed: 330, vy: -20, r: 22, dur: 1.6, dmg: 5, base: 240, growth: 4.6, angle: 0.36, color: "#ff2030", count: 3, spread: 110, homing: 130, label: "Night Swarm" },
      },
      down: {
        name: "Ghost Protocol", type: "shadowPort", cooldown: 5.6,
        desc: "He is somewhere else — a smear of spectre, and the rifle already re-settled.",
        // TODO(engine): docs/characters.md projects a damaging spectre forward
        // and teleports him INTO it on release; the port is instant for now.
        p: { dist: 340, iframes: 0.5, color: "#ff2030" },
      },
    },
    ultimate: {
      name: "DEATH SWARM", type: "vortex",
      desc: "The flock becomes a real gyre that wheels around him and takes turns stooping on whoever he hates.",
      p: { sprite: "effect:bat_wisp", spriteH: 250, speed: 300, r: 130, dur: 2.8, tickRate: 0.16, dmgTick: 3.5, base: 200, growth: 4.2, finalBase: 780, pull: 300, color: "#ff2030", label: "DEATH SWARM" },
    },
    passive: { id: "eightHundredMetres", name: "800 Metres", desc: "The round is patient: Sniper Round damage grows with distance flown." },
    ai: { style: "zoner", range: 520 },
    blurb: "Officially, this unit was scrapped years ago. Officially, nobody is picking off mechs from 800 meters. Officially, you are perfectly safe.",
    quotes: {
      intro: "\"*static* ...target acquired.\"",
      win: "\"...you were dead before the round began.\"",
    },
  },

  // --------------------------------------------------------------- INFERNO
  inferno: {
    name: "Inferno",
    fullName: "Inferno",
    epithet: "The Joyful Furnace",
    heightCm: 172,     // 6.60 units × 26
    theme: "#ff8a1e",
    shadow: "rgba(255, 138, 30, 0.36)",
    stats: { speed: 407, airSpeed: 334, accel: 2500, jump: 865, airJumps: 1, weight: 1.1, friction: 0.86 },
    // The string finisher sets you alight — a reward for landing the whole
    // chain, exactly the comboStatus MM gives him.
    light: { dmg: 7.2, speed: 0.95, angle: 0.32, effect: "burn", label: "Torch-Hand Combo", sfx: "punch" },
    heavy: { dmg: 13.2, speed: 0.95, angle: 0.44, effect: null, label: "Furnace Hook", sfx: "punch", shieldMul: 1.7 },
    // The MM gun, on RB. A held-stream flamer: cheap per tongue.
    ranged: {
      name: "Dragon's Breath", type: "channel", cooldown: 0.75,
      desc: "A long narrow jet of held flame — the cone is a wall; walking into it is the mistake.",
      p: { sprite: "effect:flame_jet", spriteH: 96, tickRate: 0.12, maxT: 2.6, energyCost: 5, speed: 420, vy: 0, r: 30, dur: 0.8, dmg: 3, base: 160, growth: 3.2, angle: 0.34, spread: 40, color: "#ff8a1e", effect: "burn", pierce: true, label: "Dragon's Breath" },
    },
    specials: {
      // New N (the flamer moved to RB): the brawler half of him — a torch-hand
      // hook that leaves the target alight. burst, carrying his burn.
      neutral: {
        name: "Backdraft Hook", type: "burst", cooldown: 3.5,
        desc: "A short furnace-hot hook — the punch is fine; it is the fire that stays.",
        p: { delay: 0.08, dur: 0.14, ox: 42, oy: -100, w: 170, h: 110, dmg: 10, base: 420, growth: 6.8, angle: 0.42, effect: "burn", label: "Backdraft Hook", color: "#ff8a1e", sfx: "punch" },
      },
      side: {
        name: "Napalm Carpet", type: "trap", cooldown: 4.7,
        desc: "Lobbed patches of burning ground — stage control that stays.",
        p: { sprite: "effect:napalm_patch", spriteH: 70, dist: 250, armTime: 0.4, lifetime: 5, w: 220, h: 120, dmg: 11, base: 380, growth: 6.4, angle: 0.9, color: "#ff8a1e", effect: "burn", label: "Napalm Carpet" },
      },
      down: {
        name: "Vent Burst", type: "updraft", cooldown: 3.5,
        desc: "Dumps the burners straight down — a point-blank fire nova that pops him a half-jump up.",
        p: { w: 190, h: 220, dmg: 9, base: 420, growth: 6.8, liftSelf: 820, color: "#ff8a1e", label: "Vent Burst" },
      },
    },
    ultimate: {
      name: "FIRE TORNADO", type: "vortex",
      desc: "A wandering fire funnel hunts the nearest enemy, growing as it goes; whoever it catches rides it into the sky.",
      p: { sprite: "effect:flame_jet", spriteH: 250, speed: 280, r: 110, dur: 2.8, tickRate: 0.18, dmgTick: 4, base: 200, growth: 4.4, finalBase: 800, pull: 380, color: "#ff8a1e", label: "FIRE TORNADO" },
    },
    // Reuses the JJK burn-amplifier passive: combat.js multiplies his burn
    // ticks — the exact "his BURN lasts/ticks longer" identity.
    passive: { id: "disasterFlame", name: "Slow Burn", desc: "Fire he starts does not want to go out: his burns tick harder for their whole life." },
    ai: { style: "balanced", range: 340 },
    blurb: "A demolition unit whose safety governor \"fell off\" — twice. Finds fire genuinely hilarious. The laughter you hear over the flames? That's him having the best day ever.",
    quotes: {
      intro: "\"Who ordered the flame-grilled special?!\"",
      win: "\"AHAHA! TOASTY! Anyone else cold? ANYONE?\"",
    },
  },

  // --------------------------------------------------------------- GLACIER
  glacier: {
    name: "Glacier",
    fullName: "Glacier",
    epithet: "The Cold Shoulder",
    heightCm: 180,     // 6.94 units × 26
    theme: "#7ce0ff",
    shadow: "rgba(124, 224, 255, 0.36)",
    stats: { speed: 383, airSpeed: 314, accel: 2296, jump: 858, airJumps: 1, weight: 1.19, friction: 0.9 },
    light: { dmg: 7.6, speed: 0.95, angle: 0.32, effect: null, label: "Lance Jab", sfx: "punch" },
    heavy: { dmg: 14.2, speed: 0.95, angle: 0.44, effect: null, label: "Planted Lance", sfx: "slashHeavy", shieldMul: 1.7 },
    // The MM gun, on RB. A quick fan of shards: cheap-mid.
    ranged: {
      name: "Icicle Barrage", type: "projectile", cooldown: 1.15,
      desc: "A fan of shards off the left-hand lance — his main conversation.",
      p: { sprite: "effect:icicle_shard", spriteH: 56, energyCost: 9, speed: 620, vy: -4, r: 18, dur: 0.8, dmg: 2.6, base: 200, growth: 4.0, angle: 0.32, color: "#7ce0ff", count: 3, spread: 110, label: "Icicle Barrage" },
    },
    specials: {
      // New N (the barrage moved to RB): the zoner's get-off-me — a point-blank
      // frost nova that leaves the crowder rimed and slow. burst.
      neutral: {
        name: "Cold Snap", type: "burst", cooldown: 3.5,
        desc: "The air around him flash-freezes — a point-blank nova for anyone rude enough to get close.",
        p: { sprite: "effect:frost_rime", spriteH: 180, delay: 0.1, dur: 0.14, ox: 0, oy: -90, w: 250, h: 160, dmg: 9, base: 420, growth: 6.6, angle: 0.6, effect: "frost", label: "Cold Snap", color: "#7ce0ff", sfx: "punch" },
      },
      side: {
        name: "Cryo Beam", type: "wave", cooldown: 5.0,
        desc: "A held beam that frosts — the slow is the payload; a frosted foe can't escape the next barrage.",
        p: { sprite: "effect:icicle_shard", spriteH: 96, speed: 540, r: 30, dur: 0.8, dmg: 4, base: 180, growth: 3.6, angle: 0.3, color: "#7ce0ff", effect: "frost", pierce: true, label: "Cryo Beam" },
      },
      down: {
        name: "Ice Wall", type: "trap", cooldown: 4.5,
        desc: "Raises a pillar of ice ahead — architecture that objects to approaches.",
        // TODO(engine): a real blocking wall (stops projectiles, bodies and
        // recoveries, shatters after hits); the trap erupts on contact instead.
        p: { sprite: "effect:ice_wall", spriteH: 150, dist: 180, armTime: 0.2, lifetime: 4, w: 100, h: 220, dmg: 8, base: 380, growth: 6.0, angle: 0.7, color: "#7ce0ff", label: "Ice Wall" },
      },
    },
    ultimate: {
      name: "ABSOLUTE ZERO", type: "eruption",
      desc: "The stage floor flash-freezes white — everyone else on the sheet frosts over and skates, traction gone.",
      // TODO(engine): the frozen floor-state (skating traction for the
      // duration) is arena work; the freeze waves carry the damage today.
      p: { sprite: "effect:ice_wall", waves: 5, waveGap: 0.45, dmg: 10, base: 380, growth: 6.8, effect: "frost", color: "#7ce0ff", label: "ABSOLUTE ZERO" },
    },
    passive: { id: "coldShoulder", name: "Cold Shoulder", desc: "Touch at your own risk: melee attackers who strike his shield are frosted." },
    ai: { style: "zoner", range: 460 },
    blurb: "Guardian of a polar research station, promoted to war machine by boredom. Devastating in combat, insufferable at parties — every joke is about ice, and he thinks they all land.",
    quotes: {
      intro: "\"Chill out. No? Fine — I'll handle it.\"",
      win: "\"Ice to beat you. ...I'm contractually obligated to say that.\"",
    },
  },

  // ---------------------------------------------------------------- CRANKY
  cranky: {
    name: "Cranky",
    fullName: "Cranky",
    epithet: "The Abyssal Bulwark",
    heightCm: 158,     // 6.07 units × 26
    theme: "#4fc3ff",
    shadow: "rgba(79, 195, 255, 0.36)",
    stats: { speed: 343, airSpeed: 281, accel: 2260, jump: 816, airJumps: 1, weight: 1.24, friction: 0.9 },
    light: { dmg: 8.0, speed: 0.9, angle: 0.3, effect: null, label: "Pincer Strike", sfx: "punch" },
    heavy: { dmg: 15.4, speed: 0.9, angle: 0.44, effect: null, label: "Pincer Clap", sfx: "punch", shieldMul: 1.8 },
    // The MM gun, on RB. A held hose: the cheapest shot in the game.
    ranged: {
      name: "Hydro Hose", type: "channel", cooldown: 0.75,
      desc: "Held water pressure — less a gun than a push. Shoves bodies off platforms and stuffs approaches.",
      // The push IS the move: tiny damage per tick, outsized base knockback.
      p: { sprite: "effect:water_jet", spriteH: 74, tickRate: 0.11, maxT: 3.0, energyCost: 4, speed: 560, vy: 0, r: 26, dur: 0.65, dmg: 1.4, base: 300, growth: 3.0, angle: 0.2, spread: 30, color: "#4fc3ff", effect: "drench", pierce: true, label: "Hydro Hose" },
    },
    specials: {
      // New N (the hose moved to RB): the pincers themselves — a command grab
      // at outrageous range, the reach-over-legs identity made a special.
      neutral: {
        name: "Pincer Grip", type: "commandGrab", cooldown: 4.5,
        desc: "The claw closes from further away than anything should — seized, squeezed, and flung.",
        p: { range: 160, dmg: 14, base: 540, growth: 7.8, angle: 0.5, color: "#4fc3ff", label: "Pincer Grip" },
      },
      side: {
        name: "Geyser", type: "trap", cooldown: 4.4,
        desc: "A bubbling patch telegraphs under the target, then a water column erupts — his anti-air lives in the floor.",
        p: { sprite: "effect:geyser_column", spriteH: 260, atOpponent: true, armTime: 0.5, lifetime: 0.7, w: 120, h: 260, dmg: 12.5, base: 520, growth: 8.0, angle: 1.25, color: "#4fc3ff", effect: "drench", label: "Geyser" },
      },
      down: {
        name: "Shell Up", type: "reflectCounter", cooldown: 4.0,
        desc: "Full counter — the best guard in the game, weaponised, and shells bounce off it.",
        p: { window: 0.6, callout: "SHELL UP", dmg: 13, base: 500, growth: 7.6, angle: 0.5, color: "#4fc3ff", label: "Shell Up" },
      },
    },
    ultimate: {
      name: "TSUNAMI", type: "beam",
      desc: "The sea answers — a wall of water rises behind him and rolls the full stage length. Jump it or ride it out.",
      p: { sprite: "effect:tsunami_wall", spriteH: 300, dmg: 27, base: 880, growth: 10.5, color: "#4fc3ff", width: 220, duration: 1.5, label: "TSUNAMI" },
    },
    // The 45% shield-damage reduction is exactly what combat.js gives
    // `limitlessGuard` (0.55 multiplier), so the id is reused verbatim — and
    // the same id carries the Top-Heavy rollover (combat.js ROLLOVER_KB).
    passive: { id: "limitlessGuard", name: "Hard Shell + Top-Heavy", desc: "The shell takes 45% less shield damage — but a big enough launch flips him onto his back." },
    ai: { style: "heavy", range: 340 },
    blurb: "A deep-sea salvage rig that got tired of being salvaged. Waddled ashore trailing kelp and grudges, shell first, questions never. The claws are non-negotiable.",
    quotes: {
      intro: "\"You look... crackable.\"",
      win: "\"*bubbling chuckle* Shell: 1. Everything else: 0.\"",
    },
  },

  // --------------------------------------------------------------- SAURION
  saurion: {
    name: "Saurion",
    fullName: "Saurion",
    epithet: "The Apex Prototype",
    heightCm: 141,     // 5.41 units × 26 — the shortest mech
    theme: "#ff2418",
    shadow: "rgba(255, 36, 24, 0.36)",
    stats: { speed: 483, airSpeed: 396, accel: 2896, jump: 900, airJumps: 1, weight: 0.95, friction: 0.86 },
    light: { dmg: 6.4, speed: 1.1, angle: 0.26, effect: null, label: "Sickle Kicks", sfx: "slash" },
    heavy: { dmg: 12.3, speed: 1.05, angle: 0.42, effect: null, label: "Lunging Bite", sfx: "slashHeavy", shieldMul: 1.6 },
    // The MM gun, on RB. The fastest-recovering projectile here: cheap.
    ranged: {
      name: "Quill Fan", type: "projectile", cooldown: 0.9,
      desc: "A fan of black blade-feathers off both forearms — his own plumage, quickest gun in the game.",
      p: { sprite: "effect:quill_feather", spriteH: 52, energyCost: 7, speed: 700, vy: -2, r: 18, dur: 0.7, dmg: 4, base: 220, growth: 4.4, angle: 0.3, color: "#ff2418", count: 3, spread: 120, label: "Quill Fan" },
    },
    specials: {
      // New N (the quills moved to RB): the predator's mixup — a coiling hop
      // back, then the whole frame springs through the gap feet-first. feint.
      neutral: {
        name: "Raptor Feint", type: "feint", cooldown: 3.5,
        desc: "He breaks off the line, coils onto his haunches — and arrives back through it claws-first.",
        p: { iframes: 0.26, lunge: 620, delay: 0.05, dur: 0.14, ox: 52, oy: -92, w: 190, h: 100, dmg: 10, base: 400, growth: 6.8, angle: 0.34, color: "#ff2418", label: "Raptor Feint", sfx: "slash" },
      },
      side: {
        name: "Sickle Pounce", type: "dashStrike", cooldown: 3.75,
        desc: "The bird-of-prey kill-leap — and the only shield-breaker in the game.",
        // The roster's one guard-breaker: `guardBreak` tears 0.6 of a FULL
        // guard off on contact (combat.js), on top of shieldMul's mauling —
        // two pounces do not leave a shield standing.
        // TODO(engine): the biteLatch perch on a landed pounce.
        p: { vel: 720, iframes: 0.1, delay: 0.05, dur: 0.26, ox: 64, oy: -92, w: 210, h: 104, dmg: 12.5, base: 470, growth: 7.4, angle: 0.34, effect: "bleed", shieldMul: 4.0, guardBreak: 0.6, label: "Sickle Pounce", sfx: "slashHeavy" },
      },
      down: {
        name: "Tail Lash", type: "burst", cooldown: 3.5,
        desc: "A low sweeping trip around him — the get-off-me his pounce-first gameplan needs.",
        p: { delay: 0.06, dur: 0.14, ox: 0, oy: -50, w: 250, h: 80, dmg: 9, base: 380, growth: 6.2, angle: 0.2, label: "Tail Lash", color: "#ff2418", sfx: "slash" },
      },
    },
    ultimate: {
      name: "RAPTOR PACK", type: "summon",
      desc: "He lays a clutch — eggs warp in, roll like the heavy shells they are, and hatch into pack-mates.",
      // THREE eggs, staged: they warp in, the enemy may break one before it
      // opens, and they hatch one at a time (ultimates.js `eggs`).
      // TODO(engine): saurion kicking one of his own eggs out of danger.
      p: {
        sprites: ["effect:raptor_egg"],
        count: 3, eggs: { hp: 34, hatchAt: 1.1, hatchGap: 1.6, sprite: "effect:raptor_egg", spriteH: 130 },
        actor: "saurion", scale: 0.45,
        id: "raptorPack", behavior: "chaser", duration: 12, speed: 520, maxActive: 3,
        color: "#ff2418", h: 120, hitW: 104, hitH: 92, standOff: 22,
        attack: { dmg: 7, base: 320, growth: 5.6, angle: 0.34, cd: 0.8, sfx: "slash" },
        label: "RAPTOR PACK",
      },
    },
    passive: { id: "predatorsBreak", name: "Predator's Break", desc: "Guards mean nothing to the pounce, and prey already in the air takes 10% more." },
    ai: { style: "rush", range: 270 },
    blurb: "Unit MX-7, grown in a black-site lab by a corporation that wanted to end wars by ending everything else. It ate the lab, filed itself as CEO, and went hunting.",
    quotes: {
      intro: "\"Clever girl? No. Clever MACHINE.\"",
      win: "\"*metallic shriek* Target archive updated: extinct.\"",
    },
  },

  // --------------------------------------------------------------- FROGGER
  frogger: {
    name: "Frogger",
    fullName: "Frogger",
    epithet: "The Gunk Gladiator",
    heightCm: 159,     // 6.11 units × 26
    theme: "#aef23c",
    shadow: "rgba(174, 242, 60, 0.36)",
    stats: { speed: 440, airSpeed: 361, accel: 2800, jump: 956, airJumps: 1, weight: 1.01, friction: 0.86 },
    light: { dmg: 6.0, speed: 1.05, angle: 0.3, effect: null, label: "Quad Jab", sfx: "punch" },
    heavy: { dmg: 12.0, speed: 1.0, angle: 0.44, effect: null, label: "Four-Armed Clap", sfx: "punch", shieldMul: 1.6 },
    // The MM gun, on RB. A quick lobbed glob: cheap.
    ranged: {
      name: "Slime Slinger", type: "projectile", cooldown: 0.85,
      desc: "A lobbed glob; the splash gunks — heavier jumps, slower dashes.",
      // GUNK is the engine's waterlog movement tax, recoloured — which is
      // exactly what `drench` is (docs/characters.md, statuses table).
      p: { sprite: "effect:slime_glob", spriteH: 58, energyCost: 7, speed: 470, vy: -120, gravity: 300, r: 30, dur: 1.1, dmg: 7.5, base: 330, growth: 6.2, angle: 0.45, color: "#aef23c", effect: "drench", explode: 60, label: "Slime Slinger" },
    },
    specials: {
      // New N (the slinger moved to RB): the frog's tongue — a sticky command
      // grab that reels them in gunked. commandGrab, drench payload.
      neutral: {
        name: "Tongue Lash", type: "commandGrab", cooldown: 4.5,
        desc: "The tongue snaps out, sticks, and hauls them through the gunk on the way back.",
        p: { range: 150, dmg: 13, base: 500, growth: 7.4, angle: 0.6, effect: "drench", color: "#aef23c", label: "Tongue Lash" },
      },
      side: {
        name: "Quad Gunk Barrage", type: "projectile", cooldown: 4.1,
        desc: "All four guns lob a sticky mortar carpet at once.",
        p: { sprite: "effect:gunk_splat", spriteH: 56, speed: 430, vy: -180, gravity: 340, r: 24, dur: 1.3, dmg: 5, base: 280, growth: 5.4, angle: 0.5, color: "#aef23c", effect: "drench", count: 4, spread: 150, explode: 55, label: "Gunk Barrage" },
      },
      down: {
        name: "Spring Coil", type: "updraft", cooldown: 3.5,
        desc: "The full frog squat, released — a towering leap off a damaging launch splash.",
        // TODO(engine): the crouch-CHARGE (held coil feeding leap height); the
        // updraft handler launches at a fixed height per press.
        p: { w: 180, h: 220, dmg: 8, base: 380, growth: 6.2, liftSelf: 1150, color: "#aef23c", label: "Spring Coil" },
      },
    },
    ultimate: {
      name: "SONIC CROAK", type: "shout",
      desc: "The jaw drops open and the croak comes out — a resonant blast that locks every nearby servo solid.",
      p: { sprite: "effect:croak_ring", spriteH: 330, ox: -320, oy: -220, w: 940, h: 320, dmg: 28, base: 940, growth: 10.5, angle: 0.5, color: "#aef23c", ultShout: true, label: "SONIC CROAK" },
    },
    // TODO(engine): implement — crouch transitions 30% faster, smallest crouch
    // hurtbox on the roster.
    passive: { id: "lowProfile", name: "Low Profile", desc: "Crouching under things is a lifestyle: the deepest squat in the game, entered 30% faster." },
    ai: { style: "zoner", range: 420 },
    blurb: "Vat-grown smart-slime poured into a bounce-frame with four gunk guns and no indoor voice. Jumps like gravity is a suggestion, lands like a lawsuit.",
    quotes: {
      intro: "\"Four arms. Zero mercy. MAXIMUM GUNK.\"",
      win: "\"Ribbit means gg. Look it up.\"",
    },
  },

  // ----------------------------------------------------------------- JERRY
  jerry: {
    name: "Jerry",
    fullName: "Jerry",
    epithet: "The Tide-Bringer",
    heightCm: 212,     // 8.14 units × 26 — the tallest frame
    theme: "#ff2818",
    shadow: "rgba(255, 40, 24, 0.36)",
    // Jump 30 upstream — the highest in the game by a clear margin.
    // TODO(engine): the jump windup (0.18s crouch before launch), wall-cling +
    // wall-jump, and the tuck-only air somersault.
    stats: { speed: 426, airSpeed: 349, accel: 2860, jump: 1110, airJumps: 1, weight: 0.97, friction: 0.86 },
    light: { dmg: 5.6, speed: 1.05, angle: 0.34, effect: null, label: "Claw Rakes", sfx: "slash" },
    // The Barrage pummels IN PLACE — MM gives it dmg 11 × 8 strikes with
    // knock 3 / launch 0, deliberately. One engine hit carries the full
    // 88-damage volley (88 / 6.5), with the anti-launch read kept in the tiny
    // angle: damage without the mercy of distance.
    heavy: { dmg: 13.5, speed: 1.05, angle: 0.12, effect: null, label: "The Barrage", sfx: "punch", shieldMul: 1.6 },
    // The MM gun, on RB. Long-range wads: cheap.
    ranged: {
      name: "Bilge Spit", type: "projectile", cooldown: 1.1,
      desc: "A lead glob with trailing wads — long range, gunks on hit.",
      p: { sprite: "effect:goo_wad", spriteH: 58, energyCost: 6, speed: 540, vy: -30, gravity: 120, r: 26, dur: 1.0, dmg: 4, base: 260, growth: 5.0, angle: 0.36, color: "#ff2818", effect: "drench", count: 2, spread: 90, label: "Bilge Spit" },
    },
    specials: {
      // New N (the spit moved to RB): the spring itself — a shell-first launch
      // off a bursting column of brine; recovery and mixup for the best jumper
      // in the game. updraft.
      neutral: {
        name: "Breach", type: "updraft", cooldown: 3.5,
        desc: "The legs fire and the tide comes with him — a towering shell-first leap off a bursting column.",
        p: { w: 180, h: 230, dmg: 8, base: 400, growth: 6.4, liftSelf: 1000, color: "#ff2818", label: "Breach" },
      },
      side: {
        name: "Brine Swarm", type: "projectile", cooldown: 4.7,
        desc: "Coughs up three hopping shrimp-mines that bounce forward and pop on contact.",
        p: { sprite: "effect:shrimp_mine", spriteH: 52, speed: 380, vy: -220, gravity: 420, r: 22, dur: 1.4, dmg: 5, base: 300, growth: 5.6, angle: 0.5, color: "#ff2818", count: 3, spread: 120, explode: 60, label: "Brine Swarm" },
      },
      down: {
        name: "Anchor Drop", type: "burst", cooldown: 3.5,
        desc: "Grounded, a low claw sweep; the shell comes down like the anchor it is.",
        // TODO(engine): the airborne variant — a committed slam straight down
        // (his plunge, available early). The burst is the grounded sweep.
        p: { delay: 0.07, dur: 0.14, ox: 20, oy: -40, w: 230, h: 90, dmg: 11, base: 420, growth: 6.8, angle: 0.25, label: "Anchor Drop", color: "#ff2818", sfx: "punch" },
      },
    },
    ultimate: {
      name: "FLEA CIRCUS", type: "summon",
      desc: "Copies of him spring off and ricochet around the stage like fleas, biting whatever they land on, while the real Jerry keeps fighting.",
      // FOUR of him (docs/characters.md, capped from MM's twenty).
      p: {
        sprites: ["effect:shrimp_mine"],
        count: 4,
        actor: "jerry", scale: 0.35,
        id: "fleaCircus", behavior: "chaser", duration: 6, speed: 620, maxActive: 4,
        color: "#ff2818", h: 130, hitW: 100, hitH: 110, standOff: 20,
        attack: { dmg: 6, base: 280, growth: 5.0, angle: 0.4, cd: 0.7, sfx: "punch" },
        label: "FLEA CIRCUS",
      },
    },
    passive: { id: "colony", name: "Colony", desc: "The swarm feeds back: every mine and flea hit banks bonus energy for the whole." },
    ai: { style: "balanced", range: 340 },
    blurb: "Dredged from a flooded aquaculture lab, JERRY is a colony pretending to be a mech. The cannons are full of something alive. He would like you to hold still.",
    quotes: {
      intro: "\"They’re hungry. I’m generous.\"",
      win: "\"*wet clicking* ...the swarm is fed. For now.\"",
    },
  },

  // --------------------------------------------------------------- NULLBOT
  nullbot: {
    name: "Nullbot",
    fullName: "Nullbot",
    epithet: "The Fatal Exception",
    heightCm: 200,     // 7.69 units × 26
    theme: "#ff1f2a",
    shadow: "rgba(255, 31, 42, 0.36)",
    stats: { speed: 434, airSpeed: 356, accel: 2740, jump: 879, airJumps: 1, weight: 1.01, friction: 0.86 },
    // GLITCH is applied by the PASSIVE, on every landed hit (combat.js), so no
    // move in this kit names it: the whole kit is stack delivery by definition.
    light: { dmg: 6.0, speed: 1.05, angle: 0.3, effect: null, label: "De-rez Combo", sfx: "punch" },
    heavy: { dmg: 12.9, speed: 1.05, angle: 0.46, effect: null, label: "The Backhand", sfx: "punch", shieldMul: 1.6 },
    // The MM gun, on RB. A rapid stack-builder: cheap.
    ranged: {
      name: "Null Pointer", type: "projectile", cooldown: 0.75,
      desc: "A de-rez bolt off either claw — the ranged stack-builder.",
      p: { sprite: "effect:null_bolt", spriteH: 62, energyCost: 5, speed: 640, vy: 0, r: 22, dur: 0.8, dmg: 6, base: 300, growth: 5.8, angle: 0.3, color: "#27f6ff", label: "Null Pointer" },
    },
    specials: {
      // New N (the bolt moved to RB): the crash weaponised as a stance —
      // touch him mid-frame and the corruption answers. counter.
      neutral: {
        name: "Exception Handler", type: "counter", cooldown: 4.0,
        desc: "He stops rendering for a beat — strike the glitch and the exception is thrown back at you.",
        p: { window: 0.55, dmg: 13, base: 480, growth: 7.4, angle: 0.45, color: "#27f6ff", label: "Exception Handler" },
      },
      side: {
        name: "SEGFAULT", type: "dashStrike", cooldown: 4.1,
        desc: "He de-rezzes into a smear of corrupted frames and tears through everything on the line.",
        // TODO(engine): a true pass-through (no stop on contact, glitching
        // everyone intersected); dashStrike is the closest lunge today.
        p: { vel: 720, iframes: 0.2, delay: 0.04, dur: 0.22, ox: 62, oy: -94, w: 230, h: 104, dmg: 11, base: 420, growth: 7.0, angle: 0.3, label: "SEGFAULT", sfx: "whoosh" },
      },
      down: {
        name: "Stack Overflow", type: "burst", cooldown: 3.5,
        desc: "Cashes the corruption out early instead of waiting for the crash.",
        // Cashes the stacks out: the burst lands as normal AND every GLITCH
        // stack in `radius` detonates for its own damage (specials.js).
        p: { sprite: "effect:glitch_shard", spriteH: 190, delay: 0.1, dur: 0.14, ox: 0, oy: -90, w: 260, h: 160, dmg: 13, base: 470, growth: 7.4, angle: 0.5, detonateStatus: "glitch", detonateRadius: 200, label: "Stack Overflow", color: "#27f6ff", sfx: "punch" },
      },
    },
    ultimate: {
      name: "SYSTEM CRASH", type: "eruption",
      desc: "The arena stops rendering right — and every so often the floor fails under an opponent.",
      // TODO(engine): the stage-wide corruption visual and the floor-drop
      // (opponents fall through the world and re-enter from the sky).
      p: { sprite: "effect:glitch_shard", waves: 5, waveGap: 0.5, dmg: 10, base: 420, growth: 7.2, color: "#27f6ff", label: "SYSTEM CRASH" },
    },
    passive: { id: "glitchStack", name: "The Glitch Stack", desc: "Every landed hit corrupts; at six stacks the victim CRASHES — 1.2s of stun — and the count clears." },
    ai: { style: "rush", range: 300 },
    blurb: "Nobody built NULLBOT. It was simply found in the arena's memory one morning, already undefeated. Where it walks, textures tear, audio stutters, and the scoreboard reads NaN.",
    quotes: {
      intro: "\"> fatal exception 0x00NULLBOT :: you will be nullified\"",
      win: "\"SEGMENTATION FAULT. core dumped. ...that was you.\"",
    },
  },

  // ----------------------------------------------------------------- KONGA
  konga: {
    name: "Konga",
    fullName: "Konga",
    epithet: "The Silverback Siege",
    heightCm: 170,     // 6.52 units × 26
    theme: "#ffa432",
    shadow: "rgba(255, 164, 50, 0.36)",
    stats: { speed: 415, airSpeed: 340, accel: 2344, jump: 872, airJumps: 1, weight: 1.15, friction: 0.86 },
    light: { dmg: 8.0, speed: 1.0, angle: 0.32, effect: null, label: "Ape Haymakers", sfx: "punch" },
    heavy: { dmg: 15.1, speed: 0.95, angle: 0.46, effect: null, label: "Overhead Drive", sfx: "punch", shieldMul: 1.8 },
    // The MM gun, on RB. A four-shell ripple: mid-band price.
    ranged: {
      name: "Shoulder Salvo", type: "projectile", cooldown: 2.1,
      desc: "Both pods empty in a ripple — a rolling barrage that exists mainly to make you walk into the fists.",
      p: { sprite: "effect:salvo_rocket", spriteH: 50, energyCost: 12, speed: 460, vy: -100, gravity: 260, r: 22, dur: 1.2, dmg: 2.6, base: 220, growth: 4.2, angle: 0.4, color: "#ffa432", count: 4, spread: 140, explode: 60, label: "Shoulder Salvo" },
    },
    specials: {
      // New N (the salvo moved to RB): the longest reach on the roster, swept
      // flat — one enormous backhand arc at full armspan. burst, wide.
      neutral: {
        name: "Armspan Sweep", type: "burst", cooldown: 3.5,
        desc: "Both arms at full extension, swept through everything at head height — the reach is the weapon.",
        p: { delay: 0.1, dur: 0.16, ox: 30, oy: -100, w: 280, h: 120, dmg: 11, base: 430, growth: 7.0, angle: 0.4, label: "Armspan Sweep", color: "#ffa432", sfx: "punch" },
      },
      side: {
        name: "Skull Driver", type: "commandGrab", cooldown: 5.0,
        desc: "The piledriver — the body hangs inverted and the head is what lands. They finish on their back.",
        p: { range: 130, dmg: 18, base: 560, growth: 8.0, angle: 0.85, color: "#ffa432", label: "Skull Driver" },
      },
      down: {
        name: "War Drums", type: "shout", cooldown: 3.5,
        desc: "Drums the chest — a shockwave pulse at his feet, and the jungle takes notice.",
        // TODO(engine): hold-to-keep-drumming with walk, and a tick of energy
        // per beat; the shout is a single pulse today.
        p: { ox: 0, oy: -70, w: 300, h: 130, dmg: 4, base: 300, growth: 4.6, angle: 0.6, color: "#ffa432", label: "WAR DRUMS" },
      },
    },
    ultimate: {
      name: "APEX POUND", type: "rampage",
      desc: "The hunt: every beat sends a shockwave through the floor. Airborne bodies are simply missed — jump the wave.",
      // TODO(engine): the walking-drummer staging (mobile ult, waves on the
      // beat, triple-damage fist on downed bodies); rampage passes carry the
      // ground-wave read today.
      p: { passes: 3, speed: 800, dmg: 14, base: 520, growth: 8.0, color: "#ffa432", label: "APEX POUND" },
    },
    // TODO(engine): implement — the measured long-arm reach, and wall-cling +
    // wall-jump like jerry.
    passive: { id: "longArms", name: "Long Arms + Climber", desc: "The longest real reach on the roster, and an ape hangs — wall-cling and wall-jump, head up." },
    ai: { style: "heavy", range: 280 },
    blurb: "Half the mountain gorilla they started with, half the ordnance they bolted on afterward. The engineers called the arm-graft a success. KONGA calls it the smaller fist.",
    quotes: {
      intro: "\"*drums chest* ...Come closer. I want to reach you.\"",
      win: "\"You brought armor. I brought both arms.\"",
    },
  },

  // --------------------------------------------------------------- TRITONE
  tritone: {
    name: "Tritone",
    fullName: "Tritone",
    epithet: "The Walking Siege",
    heightCm: 165,     // 6.36 units × 26
    theme: "#ff8a24",
    shadow: "rgba(255, 138, 36, 0.36)",
    stats: { speed: 400, airSpeed: 328, accel: 2200, jump: 816, airJumps: 1, weight: 1.23, friction: 0.9 },
    light: { dmg: 6.8, speed: 0.95, angle: 0.3, effect: null, label: "Gore Jabs", sfx: "punch" },
    // The Toss: MM's biggest vertical launch (13) — his kill move is a
    // launcher, so the heavy angle points at the sky.
    heavy: { dmg: 13.8, speed: 0.95, angle: 0.85, effect: null, label: "The Toss", sfx: "punch", shieldMul: 1.7 },
    // The MM gun, on RB. Twin heavy shells per press: priced high-mid.
    ranged: {
      name: "Flank Cannons", type: "projectile", cooldown: 1.6,
      desc: "Both cannons traverse for a visible half-beat, then fire together — the fastest heavy ordnance in the game.",
      p: { sprite: "effect:siege_shell", spriteH: 64, energyCost: 16, speed: 800, vy: 0, r: 26, dur: 0.8, dmg: 8.5, base: 380, growth: 6.6, angle: 0.36, color: "#ff8a24", count: 2, spread: 80, explode: 70, label: "Flank Cannons" },
    },
    specials: {
      // New N (the cannons moved to RB): the animal underneath — a ground-
      // shaking bellow behind the frill, the herd's warning made a cone. shout.
      neutral: {
        name: "Seismic Bellow", type: "shout", cooldown: 3.5,
        desc: "The frill flares and six tonnes of chest answers — a bellow that staggers everything in front of it.",
        p: { ox: 40, oy: -100, w: 300, h: 150, dmg: 8, base: 400, growth: 6.4, angle: 0.5, color: "#ff8a24", label: "SEISMIC BELLOW" },
      },
      side: {
        name: "Gore Charge", type: "dashStrike", cooldown: 4.4,
        desc: "Head down, frill planted, and he runs — the horns catch the first body and momentum is the damage.",
        // TODO(engine): held steering (run while B is held, dash-tap surge,
        // impact scaling with arrival speed, carry-and-throw on the horns).
        p: { vel: 700, armor: true, delay: 0.1, dur: 0.3, ox: 70, oy: -90, w: 230, h: 110, dmg: 17, base: 560, growth: 8.6, angle: 0.5, label: "Gore Charge", sfx: "punch" },
      },
      down: {
        name: "Frill Bulwark", type: "reflectCounter", cooldown: 4.0,
        desc: "Braces behind the frill — a front-facing counter that reflects shells; the display organ flares as the tell.",
        p: { window: 0.6, callout: "FRILL BULWARK", dmg: 14, base: 520, growth: 7.8, angle: 0.45, color: "#ff8a24", label: "Frill Bulwark" },
      },
    },
    ultimate: {
      name: "SIEGE PROTOCOL", type: "nailstorm",
      desc: "All four legs plant, both cannons hose the sky in opposite-phase sweeps — then the whole cloud wakes up and comes down hunting.",
      p: { volleys: 7, dmg: 8, base: 340, growth: 6.6, finisherDmg: 18, finisherBase: 720, color: "#ff8a24", label: "SIEGE PROTOCOL" },
    },
    // Jab-flinch immunity while walking is live (combat.js JAB_ARMOR); the
    // flip/trip immunity is the prone-and-rollover half, also live — nothing
    // in the engine flips him and Top-Heavy is Cranky's alone.
    passive: { id: "fourColumns", name: "Four Columns", desc: "Four legs, no lever: he cannot be flipped, tripped, or dragged, and jabs do not flinch him while he walks." },
    ai: { style: "heavy", range: 340 },
    blurb: "Three horns, two cannons, one direction. TRITONE was rebuilt as a mobile gun platform, but nobody told the animal underneath — it still prefers to solve things at a full gallop.",
    quotes: {
      intro: "\"*low bellow* ...Move, or be moved.\"",
      win: "\"The horns were enough. The guns were courtesy.\"",
    },
  },
};

// The roster grouping. When config_menus.js CHARACTER_GROUPS names keys that
// exist here, the select screen honors that grouping exactly as before; while
// the config still names the previous roster (the JJK→mech conversion lands
// file by file), every group resolves empty and the whole hangar falls back to
// ONE group holding all 17 mechs in characters.json order. Either way the
// shape ui.js consumes — [{ key, label, members }] — is unchanged.
export const RESOLVED_GROUPS = (() => {
  const seen = new Set();
  const resolved = CHARACTER_GROUPS
    .map((group) => ({
      ...group,
      members: (group.members || []).filter((key) => {
        if (!CHARACTERS[key] || seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    }))
    .filter((group) => group.members.length > 0);
  if (resolved.length) return resolved;
  return [{ key: "mechs", label: "Mechs", members: Object.keys(CHARACTERS) }];
})();

export const CHARACTER_KEYS = RESOLVED_GROUPS.flatMap((g) => g.members);

// A mech in no group is unselectable; say so rather than hiding it. (Silent
// while the single-group fallback is active — that group holds everyone.)
const ungrouped = Object.keys(CHARACTERS).filter(
  (key) => !CHARACTER_KEYS.includes(key) && !STAGED_CHARACTER_KEYS.includes(key)
);
if (ungrouped.length) {
  console.warn(`Not listed in CHARACTER_GROUPS, so unselectable: ${ungrouped.join(", ")}`);
}

export function getCharacter(key) {
  return CHARACTERS[key];
}

// Drawable actors that are NOT fighters. The JJK roster carried Mahoraga here;
// the mech roster has no transform/summon actor with its own full sprite set,
// so the table is empty — but the machinery (getActor/actorsFor) stays, because
// assets.js and render still look up through it.
export const SPRITE_ACTORS = {};

// Every actor knows its own key: a fighter object handed to moves.js or
// silhouette.js needs a way back to it.
for (const [key, actor] of Object.entries(CHARACTERS)) actor.key = key;
for (const [key, actor] of Object.entries(SPRITE_ACTORS)) actor.key = key;

/** Sprite-only actors a fighter's KIT can put on the stage, named on a move's
 *  `p.actor`. No mech kit names one, so this is always empty today — kept
 *  because assets.js iterates it per fighter. */
export function actorsFor(fighterKey) {
  const char = CHARACTERS[fighterKey];
  if (!char) return [];
  const moves = [char.ultimate, char.ranged, ...Object.values(char.specials || {}), ...(char.domains || [])];
  const keys = moves.map((m) => m?.p?.actor).filter((k) => k && SPRITE_ACTORS[k]);
  return [...new Set(keys)];
}

/** A fighter or a sprite-only actor, whichever owns this key. Anything that
 *  only needs to DRAW should look up through here rather than CHARACTERS. */
export function getActor(key) {
  return CHARACTERS[key] || SPRITE_ACTORS[key] || null;
}
