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

import { CONTROL_ROWS, padTips } from "./config_controls.js";
import { THROW_ENABLED } from "./flags.js";

/** The pad button bound to an action, by name — "RT", "LB". Read from the
 *  control map so a string can never name a button the game does not use. */
function padName(id) {
  return CONTROL_ROWS.find((row) => row.id === id)?.pad || "?";
}

// (The JJK-era "simple cards" grid tile set was removed in the mech
// conversion; the roster grid draws the hero cards.)

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
    key: "power",
    label: "Power",
    members: ["titanus", "colossus", "rhino", "konga", "tritone"],
  },
  {
    key: "speed",
    label: "Speed",
    members: ["viper", "saurion", "fenrir", "tempest", "wraith", "frogger", "jerry"],
  },
  {
    key: "tech",
    label: "Tech",
    members: ["vulcan", "inferno", "glacier", "cranky", "nullbot"],
  },
];

// The Random tile is not a fighter, so it sits in its own trailing group rather
// than inside a category. Set `show: false` to drop it from the select screen.
export const RANDOM_GROUP = {
  key: "random",
  label: "Wildcard",
  show: true,
};

// THE SPOKEN LINES, and there are TWO of them per mech, not one.
//
// A fighter says one thing walking on and another thing standing over the
// wreckage, and characters.js has carried both since C1 (`quotes.intro` /
// `quotes.win`). This table only exists to OVERRIDE that pair per screen when
// a menu wants a different line from the one the dossier gives — which nobody
// does today, so it is empty and every mech speaks its own written line.
//
// Resolution order, per screen (ui.js quoteFor):
//   CHARACTER_QUOTES[key][kind]  ->  characters.js quotes[kind]
//                               ->  characters.js quotes.intro  ->  epithet
//
// The intro fallback matters: a mech may be given a walk-on line before its
// victory line is written, and the results screen should still say something
// in its voice rather than dropping to the epithet.
//
// (This closes the C4 half that was a wiring bug rather than content: the
// results screen used to call the same quote the VS splash did, so every
// mech's `win` line — all seventeen of them, already written — was never
// spoken anywhere in the game.)
export const CHARACTER_QUOTES = {};

/** Which line a screen asks for. `intro` is the VS splash, `win` the results
 *  podium. Anything else falls through to the intro line. */
export const QUOTE_INTRO = "intro";
export const QUOTE_WIN = "win";

// Every player-facing string in the game. Values that take an argument are
// written as functions so word order stays translatable.
export const TEXT = {
  // The title splash — the first screen of the game.
  title: {
    logoAlt: "Mech Brawler",
    // Deliberately the arcade formula, not a sentence: this line is furniture
    // every player already knows how to read.
    pressStart: "Press Start",
    credit: "A mech brawler by Hoai and Francis Nguyen",
    // Says what each input actually does, because they differ: a pad press
    // takes the game fullscreen, a mouse click deliberately does not.
    hint: "Start on a controller · Enter · or click to begin",
  },

  // Fighter select
  menu: {
    eyebrow: "Neon mech platform fighter",
    logoAlt: "Mech Brawler",
    startReady: "Choose Stage",
    startWaiting: "Waiting for fighters…",
    hintPicking: "Pick a fighter to lock in. B / Backspace un-readies · LB/RB cycles the corner menus.",
    hintReady: "All fighters locked — confirm again (A / Enter) to choose the stage. B / Backspace un-readies.",
    // One-player only, once you have locked yourself in: the selector is still
    // live, and what it is choosing now is who you are about to fight.
    hintOpponent: "Locked in — now pick your opponent. A / Enter chooses the stage · B / Backspace re-picks your fighter.",
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
    // The die is part of the pitch: this button is a DRAW (it runs the roulette
    // in ui.js), and it should read like a gamble worth taking, not a fallback
    // for players who could not decide.
    random: "🎲 Random Stage",
    back: "Back",
  },

  moves: {
    kicker: "Controller guide",
    heading: (name, epithet) => `${name} — ${epithet}`,
    prev: "◀ Prev",
    next: "Next ▶",
    back: "Back",
    sectionTitle: "Signature techniques",
    // Button names come from the control map (config_controls.js), so a
    // rebinding rewrites the move list rather than leaving it lying.
    ranged: `${padName("ranged")} · Ranged`,
    specialNeutral: `${padName("special")} · Special`,
    specialSide: `Side + ${padName("special")}`,
    specialDown: `Down + ${padName("special")}`,
    ultimate: padName("domain"),
    ultimateNote: "Costs a FULL Energy bar.",
    // Multi-player split view: every human player reads their own fighter at
    // the same time instead of taking turns paging through one shared list.
    splitKicker: "Move lists",
    splitHeading: "Every player's fighter",
    playerBadge: (id) => `P${id}`,
    browseAll: "Browse all fighters",
    backToPlayers: "Your fighters",
    tips: [
      // Dash is not listed here: it has no button, so padTips() carries it as
      // its own double-tap row rather than it being said twice.
      ["Down in air", "Fast-fall"],
      ["Shield + direction", "Dodge"],
      ["Tap shield on impact", "Parry"],
      ...padTips(),
      // Grab detail rows only exist while the mechanic does — on by default,
      // gone in a `?throw=false` session. The grab row itself arrives via
      // padTips() from the control map.
      ...(THROW_ENABLED ? [
        ["While holding a grab", "Direction throws · Light pummels"],
        ["When grabbed", "Mash buttons to break free"],
      ] : []),
      ["Right stick, while a smash charges", "Angle the swing high or low"],
    ],
    // The game is played on controllers: one pad per player, up to four.
    stickHint:
      `The left stick moves, ${padName("jump")} jumps and ${padName("special")} is special; `
      + "SHOVE the stick from centre to dash — roll it out gently and you walk — or double-tap a "
      + `direction. Attacking out of a run throws that fighter's dash attack: ${padName("light")} `
      + `for the lunge, ${padName("heavy")} for the charge, both of them committal. `
      + `${padName("ranged")} fires the mech's RANGED weapon and ${padName("domain")} the Ultimate at full Energy. `
      + "Ranged shots and specials spend INHERENT ENERGY — the slim cyan bar, always refilling; "
      + "moving, dashing and shielding never do. "
      + "The RIGHT STICK throws tilt attacks — flick it for the tilt or aerial in that direction, or hold it "
      + `while a smash charges to angle the swing. The D-pad steers any summon you have on the stage; ${padName("taunt")} taunts.`
      + (THROW_ENABLED
        ? ` ${padName("grab")} GRABS: it beats shields, a direction throws them, Light pummels,`
          + " and a grabbed fighter mashes buttons to break free."
        : ""),
  },

  // The battle-intro VS splash: full-bleed hero art panels slamming in before
  // the READY…GO! countdown. Seat chips say who is driving each fighter.
  intro: {
    vs: "VS",
    seatPlayer: (n) => `P${n}`,
    seatCpu: "CPU",
    stageLabel: (name) => name,
    // Only ever seen when a fighter's art is still streaming as the match
    // starts; the splash carries the bar so the screen is the VS screen either
    // way, rather than a loading screen standing in front of it.
    loading: "Summoning fighters",
  },

  pause: {
    eyebrow: "Match paused",
    title: "Paused",
    resume: "Resume",
    reset: "Reset",
    quit: "Main Menu",
    // A seated controller stopped answering, so the match stopped too. Says
    // what will happen on resume, because resuming without the pad hands that
    // fighter to the CPU rather than leaving it standing still.
    disconnected: (players) =>
      `${players} controller disconnected. Reconnect it to carry on — resuming without it hands that fighter to the CPU.`,
    playerList: (ids) => ids.map((id) => `Player ${id}'s`).join(" and "),
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
    // How the match ended, over the winner's name. A KO needs no explanation;
    // the other two do, because the player did not necessarily see the moment
    // it was decided.
    kickerFor: {
      ko: "Match complete",
      time: "Time up — decided on stocks",
      suddenDeath: "Sudden death",
    },
    winner: (name) => `${name} wins!`,
    teamWinner: (side) => `${side} win!`,
    // The podium: the ribbon over the winner's card, and the placement over
    // everyone else's ("2nd", "3rd", …).
    winnerBadge: "WINNER",
    place: (n) => {
      const teens = n % 100 >= 11 && n % 100 <= 13;
      const suffix = teens ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th";
      return `${n}${suffix}`;
    },
    players: "Players",
    cpus: "CPUs",
    draw: "Draw",
    rematch: "Rematch",
    stageSelect: "Change Stage",
    fighterSelect: "Fighter Select",
    // The scoreboard. Column order here is the order it renders in.
    stats: {
      place: "#",
      fighter: "Fighter",
      dealt: "Dealt",
      taken: "Taken",
      kos: "KOs",
      falls: "Falls",
      combo: "Best combo",
      duration: (clock) => `Match length ${clock}`,
      comboValue: (n) => (n > 1 ? `${n} hits` : "—"),
    },
  },

  settings: {
    eyebrow: "Options",
    title: "Settings",
    music: (mode) => `Music: ${mode}`,
    musicVolume: (pct) => `Music Volume: ${pct}%`,
    sfxVolume: (pct) => `Sound FX Volume: ${pct}%`,
    cpu: (level) => `CPU Difficulty: ${level}`,
    stocks: (n) => `Lives per fighter: ${n}`,
    timeLimit: (label) => `Time limit: ${label}`,
    timeOff: "None",
    activeBoards: (on) => `Active Boards: ${on ? "On" : "Off"}`,
    sfxEnabled: (on) => `Sound Effects: ${on ? "On" : "Off"}`,
    // How the bodies MOVE: "Smooth" samples the clips the way Mech Mayhem
    // plays them; "On Twos" is JJK Brawler's stepped, drawn-on-paper sampling
    // (~13 Hz, contact frames preserved). Live — no reload.
    frames: (style) => `Animation: ${style === "twos" ? "On Twos" : "Smooth"}`,
    // How the bodies are SHADED: the delivered PBR paint jobs, or the anime
    // two-band ramp with ink outlines. Needs a reload (render_backend says
    // why), so the label says so while a match is in the way.
    render: (style) => `Shading: ${style === "toon" ? "Anime Toon" : "Neon Metal"}`,
    renderPending: (style) =>
      `Shading: ${style === "toon" ? "Anime Toon" : "Neon Metal"} (on restart)`,
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
    // The live combo readout on a fighter's panel. Only ever shown from two
    // hits up: "1 hit" is just a hit.
    combo: (n) => `${n} HITS`,
    ultimateReady: "ULTIMATE READY",
    // Only in a team match: which side a fighter's panel belongs to.
    playerSide: "TEAM",
    cpuSide: "CPU",
  },

  controllers: {
    vsCpu: "VS CPU",
    joined: (n) => `${n} players joined`,
    allJoined: (who) => `${who} — A locks your fighter, A again starts · B backs out · LB/RB corner menus`,
  },
};
