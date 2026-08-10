// ---------------------------------------------------------------------------
// Content configuration — the file to edit for roster grouping and wording.
//
// Nothing here affects game mechanics. Reorder the groups, rename them, move a
// fighter between them, or rewrite any player-facing string, and the game picks
// it up on reload. Fighter stats and kits live in characters.js; this file is
// only about how the roster is organised and what the game says.
//
// The other two files meant for hand editing: config_tuning.js for how the
// game FEELS (sprite motion, tumble, DI, move staling) and constants.js for
// physics and match rules.
// ---------------------------------------------------------------------------

/** Which art the character-select GRID uses.
 *
 *  Two different jobs were being done by one file. A hero card is a full-bleed
 *  painted scene — Gojo on a neon skyline, Panda outside a shrine at dusk —
 *  and at hero size, in the picker at the top of the screen, that is exactly
 *  right. Down in the grid the player is scanning two dozen thumbnails for the
 *  one they want, and the scene is noise; worse, `layoutCharacterGrid()` crops
 *  the tile from the top as the roster grows, so a big roster reduces each
 *  fighter to a letterbox strip of a painting.
 *
 *  So round 17D drew a second set for that job: chest-up portraits on a flat
 *  field in the fighter's theme colour, `assets/cards/simple/<key>_tile.jpg`.
 *  ON, this is what the grid draws — the picker and the in-match portrait go on
 *  using the hero card either way. OFF, the grid uses hero cards too, which is
 *  how the screen worked before the tiles existed.
 */
export const USE_SIMPLE_CARDS = false;

// Fighter-select categories, in the order they appear on screen. Each group's
// `members` are character keys from CHARACTERS in characters.js, shown left to
// right.
//
// This array is the ONLY thing to edit to change the roster's shape. All of
// these work by editing it and reloading, with no other change anywhere:
//
//   * reorder the categories       — move the objects around
//   * reorder fighters in one      — move the keys inside `members`
//   * recategorise a fighter       — move its key to another group's `members`
//   * add a category               — add `{ key, label, members: [...] }`
//   * delete a category            — remove the object (or empty its `members`)
//   * rename a category            — change its `label`
//
// The select grid, the move list, the load order and CHARACTER_KEYS all read
// from here, so there is one roster ordering rather than several that drift.
// Widths come from each group's member count, so any number of categories of
// any size lays itself out.
//
// Hand edits get checked rather than trusted, and each problem warns to the
// console instead of breaking the screen: a key with no fighter is dropped, a
// fighter left in two categories keeps its first placement, a category with
// nothing usable in it is hidden, and a playable fighter in no category at all
// is reported as unreachable. See RESOLVED_GROUPS in characters.js.

export const CHARACTER_GROUPS = [
  {
    key: "students",
    label: "Students",
    members: ["yuji", "nobara", "megumi", "yuta", "maki", "inumaki", "panda", "mechamaru", "todo", "momo"],
  },
  {
    key: "faculty",
    label: "Faculty",
    members: ["gojo", "nanami", "meimei", "gakuganji"],
  },
  {
    key: "sorcerers",
    label: "Other Sorcerers",
    members: ["toji", "yuki", "hakari", "uro", "reggie"],
  },
  {
    key: "curses",
    label: "Curses and Curse Users",
    members: ["mahito", "jogo", "hanami", "dagon", "kurourushi", "geto", "choso", "sukuna"],
  },
];

// The Random tile is not a fighter, so it sits in its own trailing group rather
// than inside a category. Set `show: false` to drop it from the select screen.
export const RANDOM_GROUP = {
  key: "random",
  label: "Wildcard",
  show: true,
};

// Every player-facing string in the game. Values that take an argument are
// written as functions so word order stays translatable.
export const TEXT = {
  // Fighter select
  menu: {
    eyebrow: "Cursed energy platform fighter",
    logoAlt: "JJK Brawler II",
    startReady: "Choose Stage",
    startWaiting: "Waiting for fighters…",
    hintPicking: "Pick a fighter to lock in. B / Backspace un-readies · LB/RB cycles the corner menus.",
    hintReady: "All fighters locked — confirm again (A / Enter) to choose the stage. B / Backspace un-readies.",
    // Shown while the roster streams in behind the select screen. Any fighter
    // is playable before this finishes; picking one just pulls their art to the
    // front of the queue. Hidden once every fighter is in memory.
    loadingRoster: (ready, total) => `Loading fighters… ${ready}/${total} ready · pick anyone, yours loads first`,
  },

  // The four hero cards above the roster
  slot: {
    player: (n) => `Player ${n}`,
    cpu: "CPU",
    empty: "Choose a fighter",
    emptyGlyph: "?",
    randomName: "Random",
    randomGlyph: "?",
    randomBlurb: "Drawn fresh every round",
    unknownUltimate: "???",
    readyBadge: "Ready",
    randomBadge: "Random",
    ultimateLabel: "Ultimate",
    stats: { speed: "Speed", power: "Power", weight: "Weight" },
  },

  loading: {
    eyebrow: "Summoning fighters",
    title: "Loading…",
    failed: (message) => `Asset load failed: ${message}`,
  },

  stages: {
    eyebrow: "Choose arena",
    title: "Stages",
    random: "Random Stage",
    back: "Back",
  },

  moves: {
    kicker: "Controller guide",
    heading: (name, epithet) => `${name} — ${epithet}`,
    prev: "◀ Prev",
    next: "Next ▶",
    back: "Back",
    sectionTitle: "Signature techniques",
    specialNeutral: "RT · Special",
    specialSide: "Side + RT",
    specialDown: "Down + RT",
    ultimate: "LB / RB",
    ultimateNote: "Costs a FULL Cursed Energy bar.",
    domainSectionTitle: "Domain Expansion",
    domainInput: "D-pad",
    // The d-pad arrows that open one of a fighter's domains. Handed the
    // directions rather than working them out, because which arrow opens what
    // depends on how many domains the fighter has — domains.js owns that rule
    // and ui.js asks it (domainDirsFor).
    domainArrows: { up: "▲", left: "◀", right: "▶", down: "▼" },
    domainInputAlt: (dirs) => `D-pad ${dirs.join(" / ")}`,
    domainNote: "Costs a FULL Cursed Energy bar.",
    domainHowTo: "How it plays:",
    domainNone: "This fighter has no Domain Expansion. Only sorcerers who have mastered one can open a domain — for everyone else a full bar means one thing: the ultimate.",
    // Multi-player split view: every human player reads their own fighter at
    // the same time instead of taking turns paging through one shared list.
    splitKicker: "Move lists",
    splitHeading: "Every player's fighter",
    playerBadge: (id) => `P${id}`,
    browseAll: "Browse all fighters",
    backToPlayers: "Your fighters",
    yourKeys: (id) => `Keyboard P${id}:`,
    keyLines: {
      1: "WASD move · J light · K heavy · L special · I ultimate · Q dash · U domain · Left Shift shield · TFGH steer summons",
      2: "Arrows move · , light · . heavy · / special · ' ultimate · \\ dash · ; domain · Right Shift shield · 8456 steer summons",
      3: "Gamepad only",
      4: "Gamepad only",
    },
    tips: [
      ["Left stick twice", "Dash"],
      ["Down in air", "Fast-fall"],
      ["Shield + direction", "Dodge"],
      ["Tap shield on impact", "Parry"],
      ["D-pad (any)", "Domain Expansion"],
      ["B", "Dash"],
      ["Right stick", "Steer your summons"],
      ["Right stick ▲", "Summon jumps (flyers climb)"],
      ["Right stick + RT", "Aim and fly Nue / cursed spirits"],
    ],
    keyboardHint:
      "Keyboard: P1 uses WASD + J/K/L/I + Left Shift, Q to dash, U for Domain, TFGH to steer summons. P2 uses arrows + ,/./&#47;/&#39; + Right Shift, \\ to dash, ; for Domain, 8/4/5/6 to steer summons. On a controller special is the RIGHT TRIGGER and B dashes; the whole D-pad is the domain pad, so move with the left stick, and the right stick takes over any summon you have on the stage.",
  },

  pause: {
    eyebrow: "Match paused",
    title: "Paused",
    resume: "Resume",
    reset: "Reset",
    quit: "Main Menu",
  },

  // Match modes, chosen from the VS badge in the middle of the select screen.
  // `blurb` is the one line under each option in the picker; `note` is what the
  // select screen says once a mode other than the default is chosen — it never
  // names the CPU fighters, because they are drawn at the start of the match.
  modes: {
    title: "Match mode",
    hint: "Click the VS badge to change the match mode.",
    versus: {
      label: "Vs Battle",
      blurb: "Everyone for themselves.",
      note: () => "",
    },
    playersVsCpus: {
      label: "Players vs CPUs",
      blurb: "Teams: every player against an equal number of CPUs.",
      note: (n) => `Your team fights ${n} random CPU ${n === 1 ? "fighter" : "fighters"}. Teammates cannot hurt each other.`,
    },
    royal1: {
      label: "Battle Royal +1",
      blurb: "One extra CPU joins the brawl.",
      note: () => "1 random CPU fighter joins when the match starts.",
    },
    royal2: {
      label: "Battle Royal +2",
      blurb: "Two extra CPUs join the brawl.",
      note: () => "2 random CPU fighters join when the match starts.",
    },
  },

  roundOver: {
    kicker: "Match complete",
    winner: (name) => `${name} wins!`,
    teamWinner: (side) => `${side} win!`,
    players: "Players",
    cpus: "CPUs",
    draw: "Draw",
    rematch: "Rematch",
    fighterSelect: "Fighter Select",
  },

  settings: {
    eyebrow: "Options",
    title: "Settings",
    music: (mode) => `Music: ${mode}`,
    musicVolume: (pct) => `Music Volume: ${pct}%`,
    sfxVolume: (pct) => `Sound FX Volume: ${pct}%`,
    cpu: (level) => `CPU Difficulty: ${level}`,
    stocks: (n) => `Lives per fighter: ${n}`,
    sprites: (set) => `Sprites: ${set}`,
    spriteDefault: "Default",
    spriteAlternate: "Alternate",
    activeBoards: (on) => `Active Boards: ${on ? "On" : "Off"}`,
    sfxEnabled: (on) => `Sound Effects: ${on ? "On" : "Off"}`,
    back: "Back",
  },

  // Toolbar buttons in the top-right corner.
  utility: {
    moves: "Controls and move list",
    settings: "Settings",
    fullscreen: "Toggle fullscreen",
    mute: "Mute sound",
    unmute: "Unmute sound",
  },

  hud: {
    ultimateReady: "ULTIMATE READY",
    domainReady: "DOMAIN READY",
    // A full bar buys either one, so a fighter with a domain is being offered a
    // choice and the HUD has to say so.
    superChoiceReady: "ULTIMATE / DOMAIN",
    // Only in a team match: which side a fighter's panel belongs to.
    playerSide: "TEAM",
    cpuSide: "CPU",
  },

  controllers: {
    vsCpu: "VS CPU",
    joined: (n) => `${n} players joined`,
    waiting: (who) => `${who} — move a stick or press a button on another controller to join`,
    allJoined: (who) => `${who} — A locks your fighter, A again starts · B backs out · LB/RB corner menus`,
  },
};
