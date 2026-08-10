// ---------------------------------------------------------------------------
// Summon art and summon variety.
//
// Two things live here because they are the same subject from two directions:
// what a summoned creature LOOKS like (SUMMON_ART, SUMMON_POSES) and WHICH
// creature a summon special puts on the stage this time (the pools).
//
// ART. Every summon used to be one still image held for its whole lifetime,
// which is why summons.js swayed and leaned them — a single drawing pinned to
// the stage reads as a decal. They now animate off a small, fixed pose set,
// the same way a fighter does off theirs, and the still is the fallback: a
// creature whose frames have not been delivered draws exactly as it did
// before. Nothing here is required art (see `delivered`), so a pose that does
// not exist yet costs nothing.
//
// VARIETY. A summon special used to be one creature, every cast, forever.
// Megumi has ten shikigami and Mahito reshapes souls into whatever he likes,
// and casting the same dog for the ninth time in a match said neither of those
// things. Each summon special now names a POOL and rolls one entry per cast —
// never the same one twice in a row (specials.js) — so the technique is the
// move and the creature is the draw.
//
// A pool entry is a partial summon config: it is spread over the special's
// base `p`, so it only says what makes that creature different. Balance is
// kept by giving each entry a comparable job (a chaser trades reach for
// staying power, a swarm trades hit for numbers) rather than by making them
// numerically identical, which would defeat the point of rolling.
// ---------------------------------------------------------------------------

// Every pose a summon can be asked to draw, and the whole of what round 16
// asks for per creature. Deliberately tiny next to a fighter's 33: a summon is
// read at a glance while the player is watching their own fighter, so what it
// needs is a breath, a stride, a strike and a flinch — not a move set.
export const SUMMON_POSES = ["idle_a", "idle_b", "move_a", "move_b", "attack", "hurt"];

// How those poses play. `attack` and `hurt` are one-shots held for as long as
// the state that asked for them lasts; idle and move loop.
export const SUMMON_ANIMS = {
  idle: { frames: ["idle_a", "idle_b"], fps: 2.4, loop: true },
  move: { frames: ["move_a", "move_b"], fps: 8, loop: true },
  attack: { frames: ["attack"], fps: 1, loop: false },
  hurt: { frames: ["hurt"], fps: 1, loop: false },
};

// Every creature's art, keyed the way kits name it (`summon:<key>`).
//   file       basename under assets/sprites/summons/
//   delivered  the single still exists and is fetched. Off for a creature
//              whose art round 16 has not brought in yet: it draws the
//              borrowed stand-in its kit names, or the procedural glow.
//   poses      the SUMMON_POSES frames exist as `<file>_<pose>.png` and are
//              fetched (individually optional, so a half-delivered set is
//              fine — a missing pose falls back to the still).
//   faceRight  the art is drawn facing right, against the renderer's
//              face-left default.
//
// BOTH FLAGS DEFAULT OFF, and turning one on is what integrating a delivery
// means here — the same shape as staging a fighter or switching on a
// transform. Nothing is fetched speculatively, so a creature nobody has drawn
// costs no requests.
//
// A STAGED fighter's summon is not listed here: its art is fetched per
// character through STAGED_SUMMON_KEYS (assets.js) so it is only downloaded
// once that fighter is in the match, which is the whole point of staging. It
// belongs here — and can have poses drawn for it — once that fighter ships.
// Everything else in this file already applies to them: a staged summon
// animates, flinches and staggers like any other, it just has one drawing to
// do it with.
export const SUMMON_ART = {
  // ---- delivered
  divineDogWhite: { file: "divine_dog_white", delivered: true, faceRight: true, poses: true },
  divineDogBlack: { file: "divine_dog_black", delivered: true, faceRight: true, poses: true },
  rainbowDragon: { file: "rainbow_dragon", delivered: true, faceRight: true, poses: true },
  transfiguredHuman: { file: "transfigured_human", delivered: true, poses: true },
  inventoryCurse: { file: "inventory_curse", delivered: true, poses: true },

  // ---- Megumi's other shikigami (round 16B)
  greatSerpent: { file: "great_serpent", poses: true },
  toad: { file: "toad", poses: true },
  maxElephant: { file: "max_elephant", poses: true },
  rabbitEscape: { file: "rabbit_escape", poses: true },

  // ---- Mahito's other transfigurations (round 16B)
  transfiguredHulk: { file: "transfigured_hulk", poses: true },
  transfiguredCrawler: { file: "transfigured_crawler", poses: true },
  transfiguredSpitter: { file: "transfigured_spitter", poses: true },

  // ---- Geto's other stored curses (round 16B)
  smallpoxDeity: { file: "smallpox_deity", poses: true },
  curseHound: { file: "curse_hound", poses: true },
  cursedWomb: { file: "cursed_womb", poses: true },

  // ---- Toji's other inventory curses (round 16B)
  coilCurse: { file: "coil_curse", poses: true },
  huskCurse: { file: "husk_curse", poses: true },
};

// ---------------------------------------------------------------- the pools

// Megumi — Ten Shadows. Five of the ten, one per cast. The dogs are the
// baseline; everything else trades something for something.
export const SHIKIGAMI_POOL = [
  {
    name: "Divine Dogs", label: "Divine Dogs",
    behavior: "chaser", duration: 6, speed: 470, maxActive: 2,
    faceRight: true, h: 118, hitW: 90, hitH: 96, standOff: 24,
    attack: { dmg: 6.5, base: 240, growth: 4.6, angle: 0.34, cd: 0.9, effect: "snare", sfx: "slash" },
    units: [
      { sprites: ["summon:divineDogWhite"], backOff: 40 },
      { sprites: ["summon:divineDogBlack"], backOff: 90, firstAttackDelay: 0.9 },
    ],
  },
  {
    // Reach and speed, no snare and not much staying power: it is a knife.
    name: "Great Serpent", label: "Great Serpent",
    behavior: "chaser", duration: 6, speed: 540, maxActive: 1, hp: 38,
    faceRight: true, h: 104, hitW: 158, hitH: 78, standOff: 34, bobAmp: 5,
    sprites: ["summon:greatSerpent", "effect:curse_dragon"],
    attack: { dmg: 12, base: 320, growth: 5.6, angle: 0.3, cd: 1.1, sfx: "slash" },
  },
  {
    // The one that holds ground instead of taking it: it sits behind Megumi
    // and lashes, which is cover rather than pressure.
    name: "Toad", label: "Toad",
    behavior: "support", duration: 7, maxActive: 1, hp: 40,
    h: 92, hitW: 78, hitH: 70, hover: { back: 64, up: 96 },
    sprites: ["summon:toad", "effect:cursed_spirit_orb"],
    attack: {
      cd: 1.0,
      projectile: { speed: 720, r: 18, dur: 0.6, dmg: 7, base: 280, growth: 5.2, angle: 0.28, color: "#8fd8a0", effect: "snare" },
    },
  },
  {
    // Slow, enormous, and very hard to remove. Cross the stage and it is still
    // there.
    name: "Max Elephant", label: "Max Elephant",
    behavior: "chaser", duration: 7, speed: 250, maxActive: 1, hp: 96,
    h: 190, hitW: 156, hitH: 156, standOff: 46, knockTake: 0.45,
    sprites: ["summon:maxElephant", "effect:triceratops"],
    attack: { dmg: 14, base: 440, growth: 6.4, angle: 0.44, cd: 1.4, sfx: "slashHeavy" },
  },
  {
    // Numbers instead of weight: three of them, each barely worth killing,
    // all of them in the way.
    name: "Rabbit Escape", label: "Rabbits",
    behavior: "bomber", duration: 5, speed: 560, maxActive: 3, hp: 12,
    h: 62, hitW: 48, hitH: 54, knockTake: 1.7,
    sprites: ["summon:rabbitEscape", "effect:curse_a"],
    attack: { dmg: 5, base: 200, growth: 3.6, angle: 0.5, r: 64 },
    units: [
      { backOff: 30 },
      { backOff: 78, firstAttackDelay: 0.25 },
      { backOff: 126, firstAttackDelay: 0.45 },
    ],
  },
];

// Mahito — a stored soul reshaped into whatever he felt like today.
export const TRANSFIGURED_POOL = [
  {
    name: "Transfigured Human", label: "Transfigured Human",
    behavior: "bomber", duration: 4.5, speed: 330, maxActive: 2,
    h: 104, hitW: 64, hitH: 88,
    sprites: ["summon:transfiguredHuman", "effect:soul_isomer"],
    attack: { dmg: 12, base: 400, growth: 6.8, angle: 0.6, r: 90, effect: "soulMark" },
  },
  {
    // Reshaped for mass. It does not burst — it walks over and keeps hitting.
    name: "Bloated Hulk", label: "Bloated Hulk",
    behavior: "chaser", duration: 6, speed: 265, maxActive: 1, hp: 74,
    h: 152, hitW: 96, hitH: 132, standOff: 32, knockTake: 0.5,
    sprites: ["summon:transfiguredHulk", "effect:soul_isomer"],
    attack: { dmg: 11, base: 400, growth: 6.4, angle: 0.42, cd: 1.2, effect: "soulMark", sfx: "slashHeavy" },
  },
  {
    // Reshaped for speed: two of them, low to the ground, cheap to lose.
    name: "Crawlers", label: "Crawler",
    behavior: "bomber", duration: 4.5, speed: 480, maxActive: 2, hp: 12,
    h: 70, hitW: 62, hitH: 56, knockTake: 1.6,
    sprites: ["summon:transfiguredCrawler", "effect:curse_b"],
    attack: { dmg: 7, base: 280, growth: 5.0, angle: 0.5, r: 72, effect: "soulMark" },
    units: [{ backOff: 44 }, { backOff: 96, firstAttackDelay: 0.3 }],
  },
  {
    // Reshaped for range. It stays with him and spits what is left of the soul
    // it was made from.
    name: "Spitter", label: "Spitter",
    behavior: "support", duration: 6, maxActive: 1, hp: 32,
    h: 108, hitW: 66, hitH: 92, hover: { back: 72, up: 148 },
    sprites: ["summon:transfiguredSpitter", "effect:soul_isomer"],
    attack: {
      cd: 1.0,
      projectile: { speed: 640, r: 20, dur: 0.7, dmg: 6.5, base: 280, growth: 5.4, angle: 0.32, color: "#b56cff", effect: "soulMark" },
    },
  },
];

// Geto — whatever came out of the jar. His whole technique is a collection, so
// this is the pool that most deserves to be one.
export const CURSE_POOL = [
  {
    name: "Rainbow Dragon", label: "Rainbow Dragon",
    behavior: "chaser", duration: 5, speed: 380, maxActive: 1,
    faceRight: true, h: 170, hitW: 130, hitH: 130, standOff: 40,
    sprites: ["summon:rainbowDragon", "effect:curse_dragon"],
    attack: { dmg: 11, base: 380, growth: 6.6, angle: 0.42, cd: 1.05, effect: "curseDrain", sfx: "slashHeavy" },
  },
  {
    // Plague at a distance: it never closes, it just keeps coughing on you.
    name: "Smallpox Deity", label: "Smallpox Deity",
    behavior: "support", duration: 6.5, maxActive: 1, hp: 36,
    h: 128, hitW: 76, hitH: 112, hover: { back: 78, up: 162 },
    sprites: ["summon:smallpoxDeity", "effect:curse_c"],
    attack: {
      cd: 1.0,
      projectile: { speed: 560, r: 22, dur: 0.8, dmg: 6.5, base: 260, growth: 5.0, angle: 0.3, color: "#9fd07a", effect: "poison" },
    },
  },
  {
    // The cheap curses he keeps by the handful. Two, fast, disposable.
    name: "Curse Hounds", label: "Curse Hound",
    behavior: "chaser", duration: 5.5, speed: 505, maxActive: 2, hp: 32,
    h: 96, hitW: 84, hitH: 84, standOff: 22,
    sprites: ["summon:curseHound", "effect:curse_a"],
    attack: { dmg: 6, base: 240, growth: 4.4, angle: 0.34, cd: 0.85, effect: "curseDrain", sfx: "slash" },
    units: [{ backOff: 46 }, { backOff: 96, firstAttackDelay: 0.8 }],
  },
  {
    // One trip across the stage and one detonation, and it hurts.
    name: "Cursed Womb", label: "Cursed Womb",
    behavior: "bomber", duration: 5, speed: 300, maxActive: 1, hp: 26,
    h: 120, hitW: 82, hitH: 100, knockTake: 0.8,
    sprites: ["summon:cursedWomb", "effect:curse_d"],
    attack: { dmg: 14, base: 430, growth: 7.0, angle: 0.58, r: 104, effect: "curseDrain" },
  },
];

// Toji — no cursed energy of his own, so every one of these is something he
// keeps rather than something he makes. The inventory is the variety.
export const INVENTORY_POOL = [
  {
    name: "Inventory Curse", label: "Inventory Curse",
    behavior: "support", duration: 6, maxActive: 1,
    h: 96, hover: { back: 76, up: 158 },
    sprites: ["summon:inventoryCurse", "effect:cursed_spirit_orb"],
    attack: {
      cd: 1.15,
      projectile: { speed: 760, r: 20, dur: 0.7, dmg: 7, base: 300, growth: 5.6, angle: 0.3, color: "#cfd6de", effect: "heavenly", sprite: "effect:cursed_tool", spriteH: 70 },
    },
  },
  {
    // The one he lets off the leash: it goes and gets them.
    name: "Coil Curse", label: "Coil Curse",
    behavior: "chaser", duration: 5.5, speed: 480, maxActive: 1, hp: 42,
    h: 112, hitW: 96, hitH: 100, standOff: 26,
    sprites: ["summon:coilCurse", "effect:chain"],
    attack: { dmg: 8, base: 300, growth: 5.2, angle: 0.32, cd: 0.95, effect: "heavenly", sfx: "slash" },
  },
  {
    // A husk with a tool still in it. It carries the blade over and lets go.
    name: "Husk Curse", label: "Husk Curse",
    behavior: "bomber", duration: 4.5, speed: 380, maxActive: 1, hp: 20,
    h: 100, hitW: 70, hitH: 88,
    sprites: ["summon:huskCurse", "effect:cursed_spirit_orb"],
    attack: { dmg: 13, base: 410, growth: 6.6, angle: 0.5, r: 92, effect: "weaponBreak" },
  },
];
