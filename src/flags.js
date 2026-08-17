// Experimental feature flags, read once from the URL at module load.
//
// A flag here is a mechanic that ships dark: the code is on main, the game
// ignores it until the URL opts in, and when it graduates the flag comes out
// rather than becoming a setting. A flag that has been turned ON by default is
// half way through that graduation — the mechanic is the game now, and the
// switch survives only so it can be turned off to compare.
//
// Node-side tools (which import the control map, and have no `location`) get an
// empty parameter set, so every flag resolves to its DEFAULT there. That is what
// keeps the generated controls tables describing the game as it actually ships.

const params = typeof location !== "undefined"
  ? new URLSearchParams(location.search)
  : new URLSearchParams();

/** Smash-style grabbing and throwing on RT — **on by default**; `?throw=false`
 *  turns it off. While it is on, RT stops being the second jump button and
 *  becomes grab; everything else about the mechanic lives in src/grab.js. */
export const THROW_ENABLED = params.get("throw") !== "false";

/** `?debug=hitbox` starts the game with the hitbox overlay already on, so a
 *  capture (a smoke run, a bug report, someone watching a single trade in slow
 *  motion) does not depend on somebody remembering to hit backquote first. The
 *  parameter takes a comma-separated list — `?debug=hitbox,foo` — so future
 *  overlays can share it, and the backquote toggle still owns the switch from
 *  there on: this only decides where it starts. */
const DEBUG_MODES = new Set(
  (params.get("debug") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
);
export const DEBUG_HITBOXES = DEBUG_MODES.has("hitbox") || DEBUG_MODES.has("hitboxes");
