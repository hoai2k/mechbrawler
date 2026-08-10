// Match modes — what the VS badge on the select screen chooses between.
//
// A mode answers three questions and nothing else: how many fighters are in
// the match, which of those slots are CPUs nobody picked, and who is on whose
// team. Everything downstream (roster resolution, spawns, the HUD, the win
// check) reads the plan rather than testing the mode by name.
import { state } from "./state.js";
import { TEXT } from "./config_menus.js";

export const MATCH_MODES = ["versus", "playersVsCpus", "royal1", "royal2"];

// Slots 1..4 are the human seats; the engine tops out at eight fighters, which
// is exactly four players and their four CPU opponents.
export const MAX_FIGHTERS = 8;

export const HUMAN_TEAM = 0;
export const CPU_TEAM = 1;

export function modeLabel(key) { return TEXT.modes[key].label; }
export function modeBlurb(key) { return TEXT.modes[key].blurb; }

/** The shape of the match a mode produces for a given number of human players.
 *
 *  `count`   how many fighters take the stage
 *  `cpuFrom` the first slot that is an unpicked CPU — those always draw a
 *            random fighter, so they are never shown on the select screen
 *  `added`   how many fighters the mode adds over a plain Vs Battle, which is
 *            what the select screen tells the player
 *  `teamOf`  a fighter's side; in a free-for-all every slot is its own side, so
 *            "different team" and "different fighter" mean the same thing */
export function matchPlan(mode = state.matchMode, humans = state.playerCount) {
  // A one-player game is really a two-fighter game: slot 2 is the CPU the
  // player picked an opponent for on the select screen.
  const base = humans === 1 ? 2 : humans;

  if (mode === "playersVsCpus") {
    const count = Math.min(MAX_FIGHTERS, humans * 2);
    return {
      mode, humans, count,
      cpuFrom: humans + 1,
      added: count - humans,
      teams: true,
      teamOf: (id) => (id <= humans ? HUMAN_TEAM : CPU_TEAM),
    };
  }

  const added = mode === "royal1" ? 1 : mode === "royal2" ? 2 : 0;
  return {
    mode, humans,
    count: Math.min(MAX_FIGHTERS, base + added),
    cpuFrom: base + 1,
    added,
    teams: false,
    teamOf: (id) => id,
  };
}
