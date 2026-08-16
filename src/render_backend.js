// The seam between "what the game wants drawn" and "how a character is drawn".
//
// Everything in this game that puts a CHARACTER on screen — fighters, their
// afterimages, the brawler summons — goes through exactly three questions:
//
//   currentFrame   which pose is showing right now
//   cyclePhase     where the playhead sits inside the looped cycle
//   drawCharFrame  draw that pose here, this big, facing this way
//
// Those three are the entire surface. Combat, movement, AI, hitboxes, the HUD,
// stage effects and domains never touch artwork at all: they work in `x`, `y`,
// `animKey` and `animTime`, and a character becomes pixels only at the four
// call sites that reach through here.
//
// ---------------------------------------------------------------------------
// WHY THIS FILE IS STILL HERE WITH ONE BACKEND BEHIND IT
//
// It used to be a registry. Three backends were registered — 2D sprite sheets,
// 2.5D billboarded cards, and live rigged 3D — and `?render=` picked between
// them, with every backend falling through to sprites per character when its
// own art had not arrived.
//
// The mech conversion retired the first two. Sprite sheets are the wrong
// delivery format for this game's content: a mech is authored as a rigged GLB
// with a colour scheme, not as a few hundred hand-drawn frames, and the
// billboard path existed only as the stepping stone from one to the other.
// Both are gone, and with them the fallthrough — there is nothing left to fall
// through TO, which is why a rig that fails to load now draws the placeholder
// body rather than silently becoming a sprite.
//
// What is left is a pass-through, and it is deliberate. The three questions are
// still the waist the rest of the game leans on, and keeping the waist named
// means the day a second way to draw a mech is worth having (a low-detail
// impostor for distant fighters, say) it is a change in this file rather than a
// fork of render.js. The registry is gone; the seam is not.
//
// ---------------------------------------------------------------------------
// WHAT THE BACKEND OWES THE GAME
//
// Two promises that are easy to break and expensive to debug:
//
//   * `drawCharFrame` returns FALSE when it could not draw. render.js paints a
//     placeholder body on false (drawMissingArt), because a character who is
//     silently absent still fights, still takes damage, and reads as a bug in
//     the game rather than as missing art. Returning undefined turns every
//     failure back into that invisible-fighter bug.
//
//   * `drawCharFrame` leaves the context exactly as it found it. It is called
//     mid-scene, between a shadow and a shield bubble, and inside `lighter`
//     composite blocks the caller set up (see summons.js drawActor). Anything
//     it changes and does not restore lands on the rest of the frame.
//
// `currentFrame` returns an opaque token, not a filename: the game passes
// whatever comes out straight back into `drawCharFrame` and stores it on the
// afterimage trail (fighter.js), and never inspects it.
//
// ---------------------------------------------------------------------------
// WHAT IS DELIBERATELY NOT HERE
//
// How big a fighter IS — height, reach, hurtbox — is a GAMEPLAY number, not a
// drawing question, and it does not come through this seam. It is measured from
// the rig's own geometry at load and may be overridden per mech; heights.js and
// silhouette.js own that, and combat.js reads it from them. A matchup must play
// identically whatever the renderer is doing.

import * as render3d from "../render3d/src/backend.js";

/** Human-readable name of the renderer, for the boot log and debug overlays. */
export const RENDER_BACKEND_LABEL = "3D rigged models";

/** Start the renderer's async load — the 3D engine, the manifest and the rigs.
 *  Called once at boot from main.js, before anything draws. Drawing before it
 *  resolves paints the placeholder body, which is the load being honest rather
 *  than a race.
 *
 *  RETURNS THE PROMISE. It used to call `init()` and return undefined, so a
 *  caller that wrote `await initRenderBackend()` awaited nothing and carried on
 *  with no engine, no manifest and no rigs — a race that looks like a load bug
 *  and reads, at the call site, like it cannot happen. */
export function initRenderBackend() {
  return render3d.init();
}

// The dispatchers. One property lookup per call, which is nothing against the
// draw that follows, and it keeps the indirection in one place instead of
// making every call site reach into render3d directly.

/** Which pose `animKey` is showing at `animTime`. The result is opaque — pass
 *  it back to `drawCharFrame`, do not parse it. */
export function currentFrame(charKey, animKey, animTime) {
  return render3d.currentFrame(charKey, animKey, animTime);
}

/** `{ phase, frames }` — where the playhead sits in the whole looped cycle
 *  (0..1) and how many frames that cycle resolved to. motion.js sways once per
 *  cycle and bobs once per footfall off this. */
export function cyclePhase(charKey, animKey, animTime) {
  return render3d.cyclePhase(charKey, animKey, animTime);
}

/** Draw `frameKey` with its feet at (x, y). Returns false when nothing could be
 *  drawn — see the contract note above; the caller decides what goes in the
 *  hole. */
export function drawCharFrame(ctx, charKey, frameKey, x, y, opts) {
  return render3d.drawCharFrame(ctx, charKey, frameKey, x, y, opts);
}

/** Warm the heavy per-character assets for `charKey` — called from the select
 *  screen when a player hovers or commits to a fighter, so menu time pays the
 *  rig load instead of match time. */
export function preloadChar(charKey, commit = false) {
  render3d.preload?.(charKey, commit);
}

// The two looks the Settings screen offers. They are drawing questions through
// and through — no gameplay number moves — so they belong on this seam rather
// than in `state`, and the UI never reaches into render3d for them.

/** "smooth" | "twos" — the animation frame style. "twos" is JJK Brawler's own
 *  stepped, drawn-on-twos sampling; "smooth" is Mech Mayhem's. */
export function frameStyle() {
  return render3d.frameStyle();
}

/** Switch the frame style. Takes effect on the next frame drawn. */
export function setFrameStyle(style) {
  render3d.setFrameStyle(style);
}

/** "pbr" | "toon" — the material/lighting style this page is drawing with. */
export function renderStyle() {
  return render3d.renderStyle();
}

/** Choose a render style. Returns TRUE when the page has to reload for it to
 *  show: materials are converted once at rig load and the light rig is built
 *  once at scene init, so a live swap would mean re-materialing every loaded
 *  rig and rebuilding the scene — the reload is the honest version. */
export function setRenderStyle(style) {
  return render3d.setRenderStyle(style);
}

/** How a character presents inside the real 3D scene.
 *
 *  The three questions above are about a 2D CONTEXT. The camera has a scene
 *  instead, and asking it to accept a flat drawing would throw away exactly
 *  what a rigged model is for — so the rig is handed over as geometry and the
 *  game's own perspective camera renders it, with real foreshortening and real
 *  depth against the stage. */
export function sceneAdapter() {
  return render3d.scene3d || null;
}
