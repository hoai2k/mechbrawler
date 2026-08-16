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
import { makeEffectLayer } from "./effects.js";
import { makeQuadPool, rectMatrix, ORDER } from "./quads.js";
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
    // Did the entity-effect layer (stage hazards, traps, waves — see
    // effects.js) actually put its quad in the scene this frame?
    fxLayer: fxDrew,
    camera: camera.position.toArray(),
    fov: camera.fov,
    layering: {
      platformFaceDepthWrite: plat ? plat.children[1]?.material.depthWrite : null,
      // The effect quad must never write depth: it is a picture ON the
      // gameplay plane, and stamping its rectangle into the depth buffer
      // would carve a hole the fighters could not draw into.
      effectDepthWrite: fxPool ? fxPool.group.children[0]?.material.depthWrite ?? null : null,
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
let fxLayer = null;
let fxPool = null;
let fxDrew = false;

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
  // The entity-effect layer (effects.js): everything in state.entities —
  // stage hazards, traps, ultimate waves — painted into one canvas and hung
  // in the scene as a single quad on the gameplay plane, BEHIND the fighters.
  // The overlay canvas sits above the whole WebGL layer, so drawing an entity
  // there could only ever put it in front of every fighter.
  fxLayer = makeEffectLayer();
  fxPool = makeQuadPool();
  simGroup.add(fxPool.group);

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
  // The entity-effect quad: repainted from state.entities, sized to the sim
  // rect the camera can see, a hair behind the gameplay plane so the
  // depth-tested rigs stand in front of it the way flat draw order had them.
  fxPool.begin();
  const fxRect = fxLayer.update(st);
  fxDrew = !!fxRect;
  if (fxRect) {
    fxPool.draw(fxLayer.texture,
      rectMatrix(fxRect.x + fxRect.w / 2, fxRect.y + fxRect.h / 2, fxRect.w, fxRect.h),
      { z: -0.02, order: ORDER.billboard - 1 });
  }
  fxPool.end();
  renderer.render(scene, camera);
}
