// ---------------------------------------------------------------------------
// Sound-effect configuration — the registry, the mix, and the categories.
//
// Every sound the game can play is declared here as
//   key: { file, category, gain?, start?, loop? }
// and referenced from code as `playSfx("key")` or from a move config as
// `sfx: "key"`. A key with no entry is a silent no-op, so a missing delivery
// degrades to silence rather than an error.
//
// `gain` is a per-sound trim applied on top of its category, for the cases
// where one clip lands hotter or quieter than its neighbours. Prefer fixing
// the file; use gain when the file is right and only its role in the mix is
// wrong.
//
// Generation prompts for all of these live in docs/audio-requests-history.md —
// that round is delivered, but the prompts are what tools/generate_sfx.py reads
// to regenerate or re-roll a file, so they stay live input.
// ---------------------------------------------------------------------------

export const SFX_DIR = "assets/sfx/";

// ---------------------------------------------------------------- the mix
//
// Relative levels between the two buses and between categories. The Settings
// sliders scale the two MASTER values; everything else here is fixed balance
// that a player never sees.
//
// SFX sits well above music on purpose: this is a fighting game, and the hit
// feedback is information, not decoration. Music is atmosphere and should duck
// under a busy exchange rather than compete with it.
export const AUDIO_MIX = {
  // Default slider positions (0..1). Players override these in Settings.
  musicVolume: 0.28,
  sfxVolume: 0.20,

  // Hard ceiling applied after everything else, so a stacked frame — several
  // hits, a grunt and a hazard in the same 100 ms — cannot clip.
  master: 0.9,

  // Per-category trim. Combat is the reference at 1.0; everything else is
  // placed relative to it.
  categories: {
    combat: 1.00,   // hits, slashes, blocks — the loudest, most frequent layer
    movement: 0.55, // jumps, landings, dashes: constant, must not fatigue
    voice: 0.80,    // grunts sit just under their own hit so they blend
    ui: 0.45,       // menus should never be as loud as a fight
    stinger: 0.85,  // countdown, match end, meter full — occasional and big
    energy: 0.90,   // projectiles, summons, installs
    domain: 1.00,   // the biggest moments in the game
    hazard: 0.65,   // stage gimmicks are ambience with teeth, not attacks
  },
};

// How many one-shots may overlap. Past this, new calls are dropped rather than
// queued — a fighting game would otherwise pile up dozens of voices per second
// during a combo and turn to mush.
export const MAX_VOICES = 24;

// --------------------------------------------------------------- registry

export const SFX = {
  // ---- Tier 1: core combat
  hitLight: { file: "hit_light.mp3", category: "combat" },
  hitMedium: { file: "hit_medium.mp3", category: "combat" },
  hitHeavy: { file: "hit_heavy.mp3", category: "combat" },
  hitCrit: { file: "hit_crit.mp3", category: "combat" },
  blackFlash: { file: "black_flash.mp3", category: "combat", gain: 1.1 },
  slashLight: { file: "slash_light.mp3", category: "combat" },
  slashHeavy: { file: "slash_heavy.mp3", category: "combat" },
  swingWhiff: { file: "swing_whiff.mp3", category: "combat", gain: 0.7 },
  guardHit: { file: "guard_hit.mp3", category: "combat" },
  guardBreak: { file: "guard_break.mp3", category: "combat", gain: 1.1 },
  parry: { file: "parry.mp3", category: "combat", gain: 1.1 },
  launch: { file: "launch.mp3", category: "combat" },

  // ---- Tier 2: movement and match flow
  jump: { file: "jump.mp3", category: "movement" },
  landSoft: { file: "land_soft.mp3", category: "movement" },
  landHeavy: { file: "land_heavy.mp3", category: "movement" },
  dash: { file: "dash.mp3", category: "movement" },
  respawn: { file: "respawn.mp3", category: "stinger", gain: 0.8 },
  meterFull: { file: "meter_full.mp3", category: "stinger" },
  countdownReady: { file: "countdown_ready.mp3", category: "stinger" },
  countdownGo: { file: "countdown_go.mp3", category: "stinger" },
  matchEnd: { file: "match_end.mp3", category: "stinger" },

  // ---- Tier 3: character voices. Groups are picked in GRUNT_GROUPS (audio.js)
  // and one variant is drawn at random per call, so a repeated special does not
  // loop the identical sample.
  gruntYoungMale: { file: ["grunt_young_male_1.mp3", "grunt_young_male_2.mp3", "grunt_young_male_3.mp3"], category: "voice" },
  gruntAdultMale: { file: ["grunt_adult_male_1.mp3", "grunt_adult_male_2.mp3", "grunt_adult_male_3.mp3"], category: "voice" },
  gruntBig: { file: ["grunt_big_1.mp3", "grunt_big_2.mp3", "grunt_big_3.mp3"], category: "voice" },
  gruntFemale: { file: ["grunt_female_1.mp3", "grunt_female_2.mp3", "grunt_female_3.mp3"], category: "voice" },
  gruntMonster: { file: ["grunt_monster_1.mp3", "grunt_monster_2.mp3", "grunt_monster_3.mp3"], category: "voice" },
  gruntAnimal: { file: ["grunt_animal_1.mp3", "grunt_animal_2.mp3", "grunt_animal_3.mp3"], category: "voice" },

  koYoungMale: { file: "ko_young_male.mp3", category: "voice" },
  koAdultMale: { file: "ko_adult_male.mp3", category: "voice" },
  koBig: { file: "ko_big.mp3", category: "voice" },
  koFemale: { file: "ko_female.mp3", category: "voice" },
  koMonster: { file: "ko_monster.mp3", category: "voice" },
  koAnimal: { file: "ko_animal.mp3", category: "voice" },

  // ---- Tier 4: menus
  uiMove: { file: "ui_move.mp3", category: "ui" },
  uiSelect: { file: "ui_select.mp3", category: "ui" },
  uiBack: { file: "ui_back.mp3", category: "ui" },
  uiLockIn: { file: "ui_lock_in.mp3", category: "ui", gain: 1.2 },
  uiDenied: { file: "ui_denied.mp3", category: "ui" },
  uiStart: { file: "ui_start.mp3", category: "ui", gain: 1.2 },
  uiPause: { file: "ui_pause.mp3", category: "ui" },

  // ---- Tier 5: cursed energy, summons, domains
  energyCharge: { file: "energy_charge.mp3", category: "energy", loop: true, gain: 0.7 },
  projectileFire: { file: "projectile_fire.mp3", category: "energy" },
  projectileHit: { file: "projectile_hit.mp3", category: "energy" },
  explosionSmall: { file: "explosion_small.mp3", category: "energy" },
  explosionLarge: { file: "explosion_large.mp3", category: "energy" },
  summonAppear: { file: "summon_appear.mp3", category: "energy" },
  summonAttack: { file: "summon_attack.mp3", category: "energy" },
  ultimate: { file: "ultimate_activate.mp3", category: "domain" },
  domainExpansion: { file: "domain_expansion.mp3", category: "domain" },
  domainCollapse: { file: "domain_collapse.mp3", category: "domain" },
  installActivate: { file: "install_activate.mp3", category: "energy" },

  // Per-domain signature layers, played under domainExpansion.
  domainUnlimitedVoid: { file: "domain_unlimited_void.mp3", category: "domain", gain: 0.8 },
  domainMalevolentShrine: { file: "domain_malevolent_shrine.mp3", category: "domain", gain: 0.8 },
  domainShadowGarden: { file: "domain_shadow_garden.mp3", category: "domain", gain: 0.8 },
  domainSelfEmbodiment: { file: "domain_self_embodiment.mp3", category: "domain", gain: 0.8 },
  domainIronMountain: { file: "domain_iron_mountain.mp3", category: "domain", gain: 0.8 },
  domainIdleDeathGamble: { file: "domain_idle_death_gamble.mp3", category: "domain", gain: 0.8 },
  domainMutualLove: { file: "domain_mutual_love.mp3", category: "domain", gain: 0.8 },

  // ---- Tier 6: stage hazards (Active Boards)
  hazardTelegraph: { file: "hazard_telegraph.mp3", category: "hazard" },
  hazardWaterSurge: { file: "hazard_water_surge.mp3", category: "hazard" },
  hazardFangSnap: { file: "hazard_fang_snap.mp3", category: "hazard" },
  hazardBloom: { file: "hazard_bloom.mp3", category: "hazard" },
  hazardBell: { file: "hazard_bell.mp3", category: "hazard" },
  hazardFirePatch: { file: "hazard_fire_patch.mp3", category: "hazard", loop: true, gain: 0.7 },
  hazardElectricArc: { file: "hazard_electric_arc.mp3", category: "hazard" },
  hazardTrafficPass: { file: "hazard_traffic_pass.mp3", category: "hazard" },
  hazardSignalChirp: { file: "hazard_signal_chirp.mp3", category: "hazard" },
  hazardCurseLatch: { file: "hazard_curse_latch.mp3", category: "hazard" },

  // ---- Tier 7a: element hit layers, played UNDER the normal hit sound (see
  // ELEMENT_HIT_SFX below). Seasoning, not the meal: combat.js already scales
  // them by damage, and the trim here keeps even a big hit's layer under the
  // impact it is dressing.
  hitFire: { file: "hit_fire.mp3", category: "combat", gain: 0.5 },
  hitBlood: { file: "hit_blood.mp3", category: "combat", gain: 0.5 },
  hitSteel: { file: "hit_steel.mp3", category: "combat", gain: 0.5 },
  hitWind: { file: "hit_wind.mp3", category: "combat", gain: 0.5 },
  hitSound: { file: "hit_sound.mp3", category: "combat", gain: 0.5 },
  hitShadow: { file: "hit_shadow.mp3", category: "combat", gain: 0.5 },
  hitSoul: { file: "hit_soul.mp3", category: "combat", gain: 0.5 },

  // ---- Tier 7b: signature one-shots. Each is the sound of one technique, so
  // they sit with the layer they belong to rather than in a group of their own.
  boogieClap: { file: "boogie_clap.mp3", category: "combat", gain: 1.1 },
  seamCrack: { file: "seam_crack.mp3", category: "combat" },
  powerChord: { file: "power_chord.mp3", category: "energy" },
  crowCaw: { file: "crow_caw.mp3", category: "energy" },
  paperRustle: { file: "paper_flutter.mp3", category: "energy" },
  soulReshape: { file: "soul_reshape.mp3", category: "energy" },
  healChime: { file: "rct_chime.mp3", category: "energy", gain: 0.9 },
  // Held under anything currently on fire — burn ticks, Furnace Shell — the
  // way `shield` sits under a raised guard. See the fire loop in audio.js.
  fireBurnLoop: { file: "fire_burn_loop.mp3", category: "energy", loop: true, gain: 0.55 },

  // ---- Originals kept for the shield loop, which has no replacement yet.
  shield: { file: "sound_shield.mp3", category: "combat", gain: 0.6, loop: true },
};

// Element hit layers — played UNDER the normal hit sound when a hit's
// fxElement (config_fx.js / characters.js) matches, at reduced gain. All seven
// are delivered and registered in SFX above; playSfx treats an unregistered
// name as silence, so an element listed here with no entry up there is simply
// silent. Remove a row to silence that element.
export const ELEMENT_HIT_SFX = {
  fire: "hitFire",
  blood: "hitBlood",
  steel: "hitSteel",
  wind: "hitWind",
  sound: "hitSound",
  shadow: "hitShadow",
  soul: "hitSoul",
};

// Legacy keys from before the round-8 sound pass. Call sites and move configs
// still name these; each maps to whichever new sound now covers that role, so
// the old names keep working and can be migrated at leisure.
export const SFX_ALIASES = {
  punch: "hitMedium",
  melee: "hitMedium",
  blast: "explosionSmall",
  block: "guardHit",
  slash: "slashLight",
  miss: "swingWhiff",
  landing: "landSoft",
  gone: "launch",
  whoosh: "swingWhiff",
  ult: "ultimate",
};
