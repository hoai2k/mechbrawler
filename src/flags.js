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
