// Scene setup and per-frame entry for the 2.5D camera (`?camera=3d`).
//
// Loaded lazily by main.js — flat mode never imports this file, so it pays
// zero bytes and zero startup cost, and the no-dependency property of the
// default game stays literally true (three.js is only fetched here).
//
// Draw flow in 3d mode (render.js drives it):
//   rig.update(state)      consumes the same cam.x/y/zoom/shake/kick
//   render3d.draw(state)   WebGL: backdrop, platforms, fighter quads, projectiles
//   ...then render.js draws everything else on the transparent top canvas,
//   positioned by the rig's overlay projection.

import { Scene, WebGLRenderer, SRGBColorSpace } from "../../vendor/three/three.module.js";
import {
  camera, updateRig, overlayTransform, worldToScreen,
  resetRig as resetRigState,
} from "./rig.js";
import { makeSimGroup, updatePlatforms, makeBackdrop, updateBackdrop } from "./stage_geo.js";
import { makeModels } from "./models.js";
import { makeGarnish } from "./garnish.js";
import { WORLD } from "../constants.js";

export { worldToScreen, overlayTransform };

/** What the last frame actually drew, for tools/smoke_camera3d.mjs. A scene
 *  that renders nothing throws no errors, so "no page errors" alone is not
 *  evidence the mode works — these counts are. */
export function debugStats() {
  // Read off LIVE materials, not off the constants that set them, so the
  // smoke test fails if the flags are changed rather than if a comment is.
  const plat = scene?.userData.platMeshes?.[0];
  return {
    models: models ? models.count() : 0,
    garnish: garnish ? garnish.count() : 0,
    standing: garnish ? garnish.standing() : 0,
    camera: camera.position.toArray(),
    fov: camera.fov,
    // The flag that keeps the stage from cutting holes in the fighters.
    //
    // THIS FUNCTION USED TO THROW. It read `quad` and `behindQuad` — the
    // billboard card layer and the layer behind it — and neither has been a
    // binding in this module since fighters became real geometry (see the note
    // in the draw loop below). `ReferenceError: quad is not defined` came out
    // of the first `debugStats()` call, which is the first thing
    // tools/smoke_camera3d.mjs does per board, so that entire tool died on its
    // opening measurement and had done since the card layer was removed.
    //
    // Reporting the two dead flags as `null` would have been the smaller edit
    // and the wrong one: null reads as "could not measure", and the truth is
    // that there is nothing there to measure. They are gone, and the smoke
    // test's assertions on them go with them.
    layering: {
      platformFaceDepthWrite: plat ? plat.children[1]?.material.depthWrite : null,
    },
  };
}

/** The live scene graph, for tools that need to measure what is actually in
 *  it (tools/debug/probe_sink.mjs): where a rig's feet ended up, where a
 *  platform's top face ended up. Nothing in the game reads this. */
export function debugScene() {
  return { scene, models: models?.group ?? null, camera };
}

let renderer = null;
let scene = null;
let simGroup = null;
let backdrop = null;
let models = null;
let garnish = null;

/** Between matches: the rig's smoothed framing and every garnish card go back
 *  to nothing, so a new board does not inherit the last one's sky. */
export function resetRig() {
  resetRigState();
  garnish?.reset();
}

/** Create the WebGL context and the scene skeleton. Returns false when WebGL
 *  is unavailable — the caller runs flat, never a broken screen. */
export function initRender3d() {
  const canvas = document.getElementById("glCanvas");
  if (!canvas) return false;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true });
  } catch {
    return false;
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x05070f, 1);

  scene = new Scene();
  backdrop = makeBackdrop();
  scene.add(backdrop);
  simGroup = makeSimGroup();
  scene.add(simGroup);
  // Rigs go in WORLD space, not the sim group: that group scales by (S, -S, 1)
  // and a negative Y mirrors a model and inverts its winding. models.js maps
  // sim coords itself.
  models = makeModels();
  scene.add(models.group);
  // Garnish stays in the sim group: its cards position in sim pixels like
  // everything else, and the group's z scale is 1, so a card's depth is
  // written in world units directly.
  garnish = makeGarnish();
  simGroup.add(garnish.group);

  resize();
  window.addEventListener("resize", resize);
  return true;
}

/** Mirror of main.js resizeCanvas for the GL canvas: backing store at DPR,
 *  aspect fixed by the CSS letterbox exactly as the 2D canvas is. */
export function resize() {
  if (!renderer) return;
  const canvas = renderer.domElement;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  renderer.setPixelRatio(dpr);
  renderer.setSize(Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)), false);
  camera.aspect = WORLD.w / WORLD.h;
  camera.updateProjectionMatrix();
}

let lastDrawAt = 0;

/** One frame: pose the rig from state.camera, refresh the scene from state,
 *  render. Called from render.js before the overlay draws. Keeps its own
 *  clock so the render.js call site stays signature-identical to flat mode. */
export function draw(st) {
  const now = performance.now();
  const dt = Math.min(Math.max((now - lastDrawAt) / 1000, 0), 1 / 30);
  lastDrawAt = now;
  updateRig(st, dt);
  updatePlatforms(scene, st.platforms);
  updateBackdrop(backdrop, st, camera.position.z, camera.fov);
  // Every fighter is real geometry now — there is no card layer behind this
  // any more, so a fighter models.update does not draw is a fighter who is not
  // on screen. backend.js warns once per missing rig; see its header.
  models.update(st);
  garnish.update(st, dt);
  renderer.render(scene, camera);
}
