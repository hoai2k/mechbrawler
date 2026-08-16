// The two PRESENTATION preferences — how a mech is shaded, and how its motion
// is sampled — in one place, because both are read at module load by different
// files (toon.js and pose.js) and both are set from the same Settings screen.
//
//   RENDER STYLE   "pbr" (default) | "toon"
//     PBR is the delivery's own baked metal/rough materials under an MM-style
//     grade — how Mech Mayhem draws these bodies, and what the paint jobs were
//     authored against. Toon is the anime pass this engine was built with for
//     the JJK roster: two-band ramp, painted shade tint, ink outline shells.
//     Materials are converted once, at rig load, and the light rig and tone
//     mapping are chosen once, at scene init — so this one is FIXED FOR THE
//     PAGE'S LIFE and a change takes a reload. The UI does the reload.
//
//   FRAME STYLE    "smooth" (default) | "twos"
//     "twos" is JJK Brawler's animation frame style: clip time quantised to
//     ~13 Hz so motion holds and snaps like limited animation drawn on twos,
//     with the contact beat always landing on a sampled frame. Smooth samples
//     at 30 Hz instead — indistinguishable from full rate at these clip speeds
//     and still cheap enough for the pose cache. Mech Mayhem animates smoothly
//     and the mechs are its bodies, so smooth is the default; on twos is the
//     hand-drawn look, kept as a choice rather than a dead dial. This one is
//     live — pose.js reads DIALS every pose, so switching only has to drop the
//     pose cache.
//
// PRECEDENCE, both keys: `?render=`/`?frames=` in the URL beats the stored
// preference, which beats the default. The URL wins so a link can pin a style
// for a comparison without disturbing what the player chose, and so the
// workbenches and smoke tools keep their flag-driven behaviour.

const RENDER_KEY = "mechbrawler.renderStyle";
const FRAME_KEY = "mechbrawler.frameStyle";

function stored(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function store(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode: session-only */ }
}

function pick(param, key, allowed, fallback) {
  const search = typeof location !== "undefined" ? location.search : "";
  const q = (new URLSearchParams(search).get(param) ?? "").trim().toLowerCase();
  if (allowed.includes(q)) return q;
  const s = stored(key);
  return allowed.includes(s) ? s : fallback;
}

/** "pbr" | "toon". Constant for the page's life — see above. */
export const RENDER_STYLE = pick("render", RENDER_KEY, ["pbr", "toon"], "pbr");

/** "smooth" | "twos". The value the page BOOTED with; pose.js copies it into
 *  DIALS.onTwos, and the live setting is that dial, not this. */
export const FRAME_STYLE = pick("frames", FRAME_KEY, ["smooth", "twos"], "smooth");

/** Remember a render style for the next load. Does not change this page. */
export function storeRenderStyle(style) {
  store(RENDER_KEY, style === "toon" ? "toon" : "pbr");
}

/** Remember a frame style. The live switch is backend.setFrameStyle. */
export function storeFrameStyle(style) {
  store(FRAME_KEY, style === "twos" ? "twos" : "smooth");
}
