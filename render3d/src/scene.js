// The offscreen scene: (character, state, time, live layers) -> a texture of
// the anime-shaded figure, cached.
//
// The billboard renderer's shape, kept deliberately — one shared WebGL canvas,
// one render only when the cache misses, foot line at a known row so the blit
// anchors feet with no per-pose measuring — with the three changes this
// backend exists for:
//
//   * PERSPECTIVE, NOT ORTHO. A long lens (FOV 15°) framing the fighter: limbs
//     stay undistorted, but a strike toward the lens actually foreshortens —
//     sprites never could. The camera still aims horizontally at the frustum
//     centre, so the foot-line guarantee survives (see frameCamera).
//   * SUPERSAMPLE 2×. Rendered at twice the cached size and downsampled once,
//     which is what keeps 1-px ink lines crisp instead of shimmering.
//     Premultiplied alpha, so edges composite cleanly over painted stages.
//   * LIT BY THE ROOM. The light rig re-keys per stage: key color from the
//     stage `tint`, rim pushed into the toon materials. The light key joins
//     the pose token, so a stage change (or a domain) re-renders instead of
//     serving stale light from the cache.
//
// THE CACHE still carries the economics: on-twos sampling (pose.js) means a
// fighter re-renders SAMPLE_HZ times a second at worst, and the 17 held
// states collapse to almost nothing. The floor on CACHE_MAX is the afterimage
// trail window, same as billboards. Same token -> same pixels, byte for byte
// — the determinism smoke asserts it, because the trail replays tokens.

import { clipNameFor, aimable } from "./states.js";
import { swayChains, simulateChains, simulates } from "./props.js";
import { state } from "../../src/state.js";
import { getStage } from "../../src/stages.js";
import { DIALS, sampleTime, poseRig } from "./pose.js";
import { setRimColor, TOON } from "./toon.js";
import { LIGHT_RIG } from "./light_rig.js";
import { setWorldWidth, OUTLINE } from "./outline.js";

export const TEX_SIZE = 384;
export const SUPERSAMPLE = 2;
/** Fraction of the frame height under the foot line (world y = 0). */
export const FOOT_FRAC = 0.10;
/** Frustum height as a multiple of rig height: headroom for raised arms and
 *  lunges toward the lens. */
const FRAME_MUL = 1.5;
const FOV_DEG = 15;

const CACHE_MAX = 160; // floor set by the trail window, same as billboards

let THREE = null;
let renderer = null;
let scene = null;
let camera = null;
let keyLight = null;
let hemiLight = null;
let rimStage = null; // last stage key the light rig was derived from
let neutralRim = null; // toon.js's own rim, captured before any stage override
let contextLost = false;
let mounted = null; // the rig root currently in the scene (renderPose swaps it)

const cache = new Map(); // token -> { canvas, heightM, rowsPerMetre, yawed }
export const stats = { renders: 0, hits: 0, misses: 0, evictions: 0, lostFrames: 0 };

// Recycled cache canvases. A miss used to allocate a fresh 384² canvas — at
// CACHE_MAX 160 that is ~94 MB of backing store churning through the GC as
// entries evict. Evicted (and cleared) entries hand their canvas back here
// instead, so a full cache allocates its canvases exactly once.
const canvasPool = [];
function takeCanvas() {
  const c = canvasPool.pop();
  if (c) return c;
  const fresh = document.createElement("canvas");
  fresh.width = TEX_SIZE;
  fresh.height = TEX_SIZE;
  return fresh;
}
/** Empty the cache, returning every entry's canvas to the pool. */
function dropCache() {
  for (const entry of cache.values()) canvasPool.push(entry.canvas);
  cache.clear();
}

export function initScene(three) {
  THREE = three;
  const canvas = document.createElement("canvas");
  canvas.width = TEX_SIZE * SUPERSAMPLE;
  canvas.height = TEX_SIZE * SUPERSAMPLE;
  // No MSAA: the render is already 2× supersampled and downsampled into the
  // cache texture, so multisampling on top was pure fill-rate cost for pixels
  // the downsample averages anyway.
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
  renderer.setClearColor(0x000000, 0);
  // Colour management stated rather than inherited: the output space and the
  // absence of tone mapping are both load-bearing for the toon ramp (a filmic
  // curve would re-grade the two bands), so they are set here even where they
  // match the three.js defaults of the vendored build.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  scene = new THREE.Scene();
  hemiLight = new THREE.HemisphereLight(LIGHT_RIG.hemi.sky, LIGHT_RIG.hemi.ground, LIGHT_RIG.hemi.intensity);
  keyLight = new THREE.DirectionalLight(LIGHT_RIG.key.color, LIGHT_RIG.key.intensity);
  keyLight.position.set(...LIGHT_RIG.key.position);
  scene.add(hemiLight, keyLight);
  camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.05, 80);
  _proj = new THREE.Vector3();

  // A LOST CONTEXT MUST NOT REACH THE CACHE.
  //
  // three's renderer makes `render()` a silent no-op while the GPU context is
  // gone, and this function's next act is to copy the canvas into a cache entry
  // keyed by the pose. Nothing about that key mentions the context, so a render
  // taken during the outage is stored as if it were the fighter — and every
  // later request for that pose is a HIT on a blank. The context comes back,
  // three re-uploads everything, and the roster is still dark, because the
  // darkness is in the cache rather than on the GPU. Walking the whole roster
  // in the idle review is how you fill the cache with them: one browser hiccup
  // partway through and all twenty-seven come out dark and stay dark.
  //
  // preventDefault is what makes the restore happen at all — without it the
  // browser is entitled to keep the context gone for good.
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    contextLost = true;
  });
  canvas.addEventListener("webglcontextrestored", () => {
    contextLost = false;
    // Whatever landed during the outage is unreliable, and it is cheaper to
    // redraw the roster than to work out which entries are blank.
    dropCache();
  });

  if (typeof window !== "undefined") {
    window.__render3d = window.__render3d || {};
    window.__render3d.stats = stats;
    // The offscreen renderer is otherwise unreachable, which makes the case
    // above untestable — a fault you cannot trigger on purpose is one you fix
    // by argument. smoke_render3d.mjs takes the context away through this.
    window.__render3d.renderer = renderer;
    Object.defineProperty(window.__render3d, "contextLost", { get: () => contextLost });
  }
}

/** Point the key light somewhere else — the workbench's sweeping-light check
 *  for edited normals. angleRad orbits the light around the figure. */
export function setKeyLightAngle(angleRad, elevRad = 0.8) {
  keyLight.position.set(
    Math.sin(angleRad) * 2.5,
    Math.sin(elevRad) * 3.0,
    Math.cos(angleRad) * 2.5,
  );
}

// ------------------------------------------------------- stage light rig

/** Parse the "rgba(r, g, b, a)" strings stages.js uses. */
function parseTint(tint) {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(tint || "");
  return m ? [m[1] / 255, m[2] / 255, m[3] / 255] : null;
}

/** The part of the cache key that owns lighting: when the stage (or a
 *  domain) re-keys the light, tokens change and stale renders age out of
 *  the LRU instead of being served. */
export function lightKey() {
  return `${state.stageKey || "-"}${state.domain ? "+dom" : ""}`;
}

/** The stage's light, as numbers — key colour and rim colour derived from the
 *  stage `tint`. Exported because the 2.5D camera builds its OWN light rig
 *  (it puts the actual rig in its own scene rather than taking a texture from
 *  this one) and both must agree, or the same fighter is lit two ways
 *  depending on a URL flag. Returns null for a stage with no tint. */
export function stageLightTint() {
  const tint = parseTint(getStage?.(state.stageKey)?.tint);
  if (!tint) return null;
  const boost = 0.55;
  return {
    // Key colour leans toward the stage tint...
    key: [1 - (1 - tint[0]) * 0.35, 1 - (1 - tint[1]) * 0.35, 1 - (1 - tint[2]) * 0.35],
    // ...and the rim takes it brightened — the thin stage-coloured line that
    // seats a figure against a painted room.
    rim: [tint[0] + (1 - tint[0]) * boost,
          tint[1] + (1 - tint[1]) * boost,
          tint[2] + (1 - tint[2]) * boost],
  };
}

function syncStageLight() {
  const key = lightKey();
  if (key === rimStage) return;
  rimStage = key;
  const t = stageLightTint();
  // A stage with no tint gets the NEUTRAL rig — white key, toon.js's own rim
  // — instead of whatever the previous stage left in the lights. This resets
  // once per stage change (rimStage is already recorded above), so it does
  // not re-light on every sync, which is the cost that kept an earlier
  // version of this branch out (353 pose-cache hits fell to 162 when the
  // reset ran unconditionally). No shipped stage is tintless today; this is
  // the line that keeps the first one from inheriting the last stage's light.
  if (!t) {
    if (neutralRim) {
      keyLight.color.setRGB(1, 1, 1);
      setRimColor(...neutralRim);
    }
    return;
  }
  // Captured before the first stage override, so "neutral" stays the toon
  // config's own rim rather than a previous stage's.
  if (!neutralRim) neutralRim = [...TOON.rimColor];
  keyLight.color.setRGB(...t.key);
  setRimColor(...t.rim);
}

// ------------------------------------------------------------ framing

/**
 * FREE LOOK, for inspecting a model rather than playing it.
 *
 * The match camera is fixed on purpose: one ¾ angle for the whole roster, so
 * every fighter is drawn under the same lens and can be compared. But a
 * delivery has to be LOOKED at — is the back of the coat modelled, does the
 * hair intersect the shoulder, is that hand a hand — and none of that is
 * answerable from the one angle the game happens to use.
 *
 * So the orbit is a workbench-only offset ON the match camera, not a second
 * camera: same framing arithmetic, same lens, same lights. Zeroed, it is
 * exactly the shot the game renders, which is what makes turning it off a
 * return to the truth rather than to another approximation.
 */
const orbit = { yawRad: 0, pitchRad: 0, dolly: 1 };

export function setOrbit({ yawDeg = 0, pitchDeg = 0, dolly = 1 } = {}) {
  orbit.yawRad = (yawDeg * Math.PI) / 180;
  // Short of the poles: at 90° the camera is looking straight down its own up
  // vector and lookAt has no answer, which shows up as the model flipping.
  orbit.pitchRad = (Math.max(-80, Math.min(80, pitchDeg)) * Math.PI) / 180;
  orbit.dolly = Math.max(0.3, Math.min(4, dolly));
}

/** Part of the pose-cache key: a different angle is different pixels. */
export function orbitKey() {
  return orbit.yawRad || orbit.pitchRad || orbit.dolly !== 1
    ? `${Math.round((orbit.yawRad * 180) / Math.PI)},${Math.round((orbit.pitchRad * 180) / Math.PI)},${orbit.dolly.toFixed(2)}`
    : "";
}

function frameCamera(height, parallaxRad = 0) {
  // Same guarantee as the billboard renderer, restated for perspective: the
  // camera aims HORIZONTALLY at the frustum's world-space centre cy, and its
  // distance is chosen so the frustum spans frameH at the character plane —
  // so world y=0 lands exactly FOOT_FRAC up from the frame bottom, and
  // blit.js can anchor feet from two constants. The ¾ view is yaw-only; the
  // micro-parallax rides on top of the base yaw.
  const frameH = height * FRAME_MUL;
  const cy = frameH * (0.5 - FOOT_FRAC);
  const dist = (frameH / 2) / Math.tan((FOV_DEG / 2) * Math.PI / 180);
  // Yaw. Two things must hold at once, and eyeballing a 384px render gets one
  // of them wrong every time — so they are stated as dot products and measured
  // (tools/smoke_facing.mjs):
  //
  //   forward · cameraRight  > 0   the fighter faces SCREEN-RIGHT
  //   forward · (-cameraFwd) > 0   and his FRONT is toward the lens
  //
  // With the rig's forward at +Z (the delivery spec), those are -sin(yaw) and
  // cos(yaw) — both positive only for -90° < yaw < 0°. -60° puts forward
  // mostly across the screen (0.87) with the chest still turned toward the
  // viewer (0.5): the three-quarter the sprite art is drawn at. The original
  // +30° satisfied neither, which is why every fighter strode into the screen
  // and showed their back.
  const yaw = CAMERA_YAW_RAD + parallaxRad + orbit.yawRad;
  // The orbit rides on top: same aim point, same framing, a different seat.
  const d = dist / orbit.dolly;
  const flat = Math.cos(orbit.pitchRad) * d;
  camera.position.set(Math.sin(yaw) * flat, cy + Math.sin(orbit.pitchRad) * d, Math.cos(yaw) * flat);
  camera.lookAt(0, cy, 0);
  camera.updateProjectionMatrix();
}

export const CAMERA_YAW_DEG = -60;
const CAMERA_YAW_RAD = (CAMERA_YAW_DEG * Math.PI) / 180;

/**
 * The rig yaw that makes a fighter face SCREEN-LEFT with his front still
 * toward the lens — this backend's answer to facing, since it turns the model
 * rather than mirroring the picture.
 *
 * It is NOT 180°. Turning a fighter around in place only reads as a
 * turnaround when the camera is side-on; under a three-quarter camera it
 * hands the viewer his BACK, which is exactly what it did — Yuji faced away
 * whenever he moved left, while the billboard backend (which mirrors the
 * texture) looked right.
 *
 * The yaw wanted is the one that REFLECTS his forward across the camera's
 * view plane, because that is what mirroring the picture does geometrically.
 * Reflecting (0,0,1) in the plane whose normal is the camera's right axis
 * (cos θ, 0, −sin θ) gives (sin 2θ, 0, cos 2θ) — a rig yaw of exactly 2θ. At
 * θ = −60° that is −120°, not 180°, and the two coincide only at θ = ±90°:
 * a side-on camera, which is the case the 180° was silently assuming.
 *
 * Rotating rather than mirroring is still the point: the model is never
 * flipped, so an asymmetric costume, a scar or a one-shouldered cloak stays
 * on the side it belongs on. The viewer simply sees his other flank, which is
 * what really happens when someone turns to face the other way.
 *
 * IT REFLECTS (0,0,1), AND THAT IS AN ASSUMPTION ABOUT THE RIGS. A delivered
 * model is turned at the root by its own `yawOffsetDeg` (loader.js), so this
 * is only the right yaw while that offset genuinely CANCELS the model's own
 * framing error — leaving a fighter whose forward really is +Z before the
 * turnaround. That is exactly what the offset is for, so the assumption is
 * fair; it is just load-bearing, and silently so.
 *
 * When an offset is merely eyeballed close, the residual error does not stay
 * put: it lands on the far side of the reflection with its sign flipped, so a
 * fighter who looks nearly right facing right is off by TWICE that facing
 * left. That is why turning around used to be so much worse than not, and it
 * is a reason to measure the offsets rather than nudge them —
 * `tools/check_model_facing.mjs` scores both facings against the drawing, and
 * `--solve` reads the offset off the art.
 */
export function turnaroundYaw() {
  return 2 * CAMERA_YAW_RAD;
}

/**
 * WHICH WAY A FIGHTER STANDS when the camera is HEAD-ON rather than three-
 * quarter — the game's own perspective camera in `?camera=3d`, which looks
 * down the stage at the action (src/camera3d/rig.js).
 *
 * The two paths reach the same picture from opposite ends, and it is worth
 * saying which is which because getting them confused is what broke this. The
 * FLAT path leaves the fighter at 0 and puts the CAMERA at −60°, so the three-
 * quarter comes out of the lens position. In a real scene the camera belongs
 * to the game and points where the fight is, so the ¾ has to come out of the
 * FIGHTER instead: they carry the same 60°, and carry it mirrored, which is
 * the whole of this function.
 *
 * Both facings therefore keep the fighter's front partly toward the lens, and
 * left is right's mirror image — a fighter turning round shows you their other
 * flank, never their back. That is also what the sprites do, and the reason
 * these two backends can draw the same fight.
 *
 * It is NOT 0 and 180°. That pair was here, with a comment arguing that a
 * head-on camera makes a half-turn the honest answer, and it is exactly
 * backwards: at 0 the fighter's forward is +Z, which under this camera is
 * STRAIGHT AT THE LENS rather than along the stage, and the half-turn from
 * there points them straight away from it. So facing right read as staring
 * down the barrel and facing left read as showing their back, which is what
 * was reported from the game.
 */
export const THREE_QUARTER_RAD = -CAMERA_YAW_RAD;

export function sceneFacingYaw(facing) {
  // Continuous on purpose: this path is live geometry with no pose cache, so
  // the turnaround can ride fighter.js's facingVis sweep directly — the body
  // yaws through the lens over TURN_TIME instead of snapping between ±¾.
  // At rest facingVis sits at ±1 and this is exactly the old two-pole answer.
  return THREE_QUARTER_RAD * Math.max(-1, Math.min(1, facing));
}

// ------------------------------------------------------------- the render

/** The cache key for one drawable pose. Every live layer is quantised by the
 *  caller, so the dimensions stay small; facing joins as the turn yaw (the
 *  turnaround replaces blit-time mirroring). */
/** `layers` with the rig's own stance folded in, unless the caller pinned
 *  one (the workbench does, while the slider is being dragged). */
function withStance(rig, layers) {
  const deg = layers.stanceDeg ?? rig?.stanceDeg ?? 0;
  return deg ? { ...layers, stanceDeg: deg } : layers;
}

export function poseToken(charKey, animKey, animTime, layers) {
  const s = sampleTime(animKey, animTime, layers.beat);
  const q = Math.round(s * 720); // exact at any sane sample rate
  // A move-synced contact beat moves the snapped sample AND the reach/morph
  // ramps, so it is part of the pose. Moves' delays are a small discrete set
  // per character, so the key stays dense.
  const bt = layers.beat ? `~k${Math.round(layers.beat * 1000)}` : "";
  // The cross-fade: the outgoing clip, its frozen playhead, and the fade
  // step. Quantised to quarters by the backend, so a transition adds at most
  // four tokens — and blended frames are different pixels, so a cache that
  // ignored them would serve the finished pose for the whole fade.
  const bl = layers.blend
    ? `~B${clipNameFor(layers.blend.key)}@${Math.round(layers.blend.sampled * 720)}k${Math.round(layers.blend.k * 4)}`
    : "";
  const aim = aimable(animKey) && layers.aimRad ? `~a${Math.round((layers.aimRad * 180) / Math.PI)}` : "";
  const look = layers.lookRad ? `~l${Math.round((layers.lookRad * 180) / Math.PI)}` : "";
  const fl = layers.flinch ? `~f${layers.flinch}` : "";
  // The turn yaw in whole degrees. It used to be a boolean ("turned or not"),
  // which was all there was to say while facing was binary; the facing sweep
  // (backend.js facingK) yaws partway through a turnaround, and each step is
  // a different pose. The locomotion mirror keys off the same sweep, and
  // turnYawRad encodes it one-to-one, so this fragment covers both.
  const turn = layers.turnYawRad ? `~y${Math.round((layers.turnYawRad * 180) / Math.PI)}` : "";
  // Reach joins the key: two strikes solved onto different targets are two
  // different poses, and a cache that ignored that would serve the first one
  // for every angle after it.
  const rch = layers.reach && aimable(animKey)
    ? `~r${layers.reach.dx},${layers.reach.dy}` : "";
  const par = layers.parallaxDeg ? `~p${layers.parallaxDeg}` : "";
  // Stance changes the silhouette, so it changes the pose, so it changes the
  // key — a cache that ignored it would keep serving the old stance.
  const st = layers.stanceDeg ? `~s${layers.stanceDeg}` : "";
  // Workbench pose edits: never set in game, but when they are set they change
  // pixels, so they have to change the token or the cache serves the un-edited
  // body forever.
  const ed = layers.editKey ? `~e${layers.editKey}` : "";
  // The proof body is a different body: same character, same pose, different
  // pixels, so it cannot share a cache entry with the model.
  const mq = layers.mannequin ? "~M" : "";
  // A rig check throws the clip away entirely (pose.js poseRigCheck), so the
  // state and the clip time in this key describe a pose that is not on screen
  // — without this every rig check would collide with the idle it was opened
  // from, and with the other rig check.
  const rc = layers.rigCheck ? `~C${layers.rigCheck}` : "";
  const orb = orbitKey();
  return `${charKey}/${clipNameFor(animKey)}@${q}${bt}${bl}${aim}${look}${fl}${turn}${rch}${par}${st}${ed}${mq}${rc}`
    + `${orb ? `~o${orb}` : ""}~L${lightKey()}`;
}

/** For the determinism smoke: drop every cached render. */
export function clearCache() {
  dropCache();
}

/**
 * The posed, toon-shaded character as a canvas, plus the metres->rows
 * mapping the blit needs. Returns null when the character has no rig or no
 * resolvable clip — the caller falls back to sprites.
 */
/** The camera, for the facing/framing probes. */
export function __cam() { return camera; }

// ------------------------------------------------- workbench: bone gizmos
//
// The pose editor draws a handle on every joint and drags them, which needs
// two things the render path does not expose: world matrices that MATCH the
// pixels on screen, and the projection that put them there. A cache hit never
// poses the rig, so the handles would drift onto a pose that is no longer
// drawn — hence a preview pass that poses and frames without rendering.

/** Pose `rig` and frame the camera exactly as `renderPose` would, but draw
 *  nothing. Returns false when there is nothing to pose. */
export function posePreview(charKey, animKey, animTime, rig, resolved, layers = {}) {
  if (!rig || !resolved) return false;
  layers = withStance(rig, layers);
  const sampled = sampleTime(animKey, animTime, layers.beat);
  poseRig(rig, animKey, sampled, resolved.clip, { ...layers, charKey });
  swayChains(rig.root, sampled, charKey);
  frameCamera(rig.height, (layers.parallaxDeg || 0) * Math.PI / 180);
  rig.root.updateMatrixWorld(true);
  return true;
}

/** A world point -> pixel coordinates in the cached TEX_SIZE texture, under
 *  the camera framing left by the last render or preview. The workbench turns
 *  those into canvas pixels with blit.js's placement arithmetic. */
export function projectToTexture(worldVec, out = {}) {
  if (!camera) return null;
  const v = _proj.copy(worldVec).project(camera);
  out.u = (v.x * 0.5 + 0.5) * TEX_SIZE;
  out.v = (0.5 - v.y * 0.5) * TEX_SIZE;
  out.z = v.z; // NDC depth: >1 is behind the camera, and must not draw
  return out;
}
let _proj = null;

/** Real seconds since the last simulated frame — see the same helper in
 *  billboards/src/renderer.js for why simulated chains need wall-clock time
 *  rather than clip time. */
let _lastSimT = 0;
function frameDelta() {
  const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
  const dt = _lastSimT ? now - _lastSimT : 1 / 60;
  _lastSimT = now;
  return dt;
}

export function renderPose(charKey, animKey, animTime, rig, resolved, layers = {}) {
  // The fighter's stance rides on the RIG, not on the caller. Every layer
  // above is something about this moment — where they are aiming, who hit
  // them — while stance is a fact about the fighter, so taking it from the
  // rig here means the game, the workbench and the 2.5D camera all get it
  // without three copies of the same lookup drifting apart.
  layers = withStance(rig, layers);
  const token = poseToken(charKey, animKey, animTime, layers);
  // Simulated chains carry state, so the same token draws different pixels by
  // design — such a fighter neither reads nor writes the cache. props.js
  // simulateChains states the trade; the note in billboards/src/renderer.js
  // spells out what a stale hit would look like.
  const live = simulates(charKey);
  const hit = live ? null : cache.get(token);
  if (hit) {
    stats.hits++;
    cache.delete(token);
    cache.set(token, hit); // refresh LRU position
    return hit;
  }
  stats.misses++;
  if (!rig || !resolved || !renderer) return null;

  syncStageLight();
  const sampled = sampleTime(animKey, animTime, layers.beat);
  poseRig(rig, animKey, sampled, resolved.clip, { ...layers, charKey });
  // Secondary motion on the same quantised clock as the pose — cache-honest.
  swayChains(rig.root, sampled, charKey);
  // ...except chains that asked to be simulated, driven by real elapsed time.
  if (live) simulateChains(THREE, rig.root, frameDelta(), charKey);
  frameCamera(rig.height, (layers.parallaxDeg || 0) * Math.PI / 180);

  // Outline width: OUTLINE.px is in blitted pixels; the texture holds
  // frameH world-units across TEX_SIZE of them.
  const frameH = rig.height * FRAME_MUL;
  setWorldWidth(rig.root, frameH / TEX_SIZE);

  // The rig stays mounted between renders — adding and removing it around
  // every render forced a render-list rebuild each time. Only an actual
  // character change swaps the child.
  if (mounted !== rig.root) {
    if (mounted) scene.remove(mounted);
    scene.add(rig.root);
    mounted = rig.root;
  }
  renderer.render(scene, camera);
  rig.root.rotation.y = 0;
  if (contextLost) {
    // Nothing was drawn. Draw NOTHING rather than cache the blank: a missing
    // frame is a fighter who does not appear for a moment, and a cached blank
    // is a fighter who is dark until the page reloads.
    stats.lostFrames++;
    return null;
  }
  stats.renders++;

  // Downsample the supersampled render once, into a (recycled) cache texture.
  const canvas = takeCanvas();
  const c2 = canvas.getContext("2d");
  // A recycled canvas still holds its previous pose; drawImage alone would
  // leave the old pixels showing through the new render's transparent parts.
  c2.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
  c2.drawImage(renderer.domElement, 0, 0, TEX_SIZE, TEX_SIZE);

  const entry = {
    canvas,
    heightM: rig.height,
    // The hand scale dial (loader.js). Kept beside the height rather than
    // folded into it, so `heightM` stays the honest measurement and every
    // consumer applies the artist's intent explicitly.
    renderScale: rig.renderScale ?? 1,
    rowsPerMetre: TEX_SIZE / frameH,
    // With the turnaround on, facing lives in the render (yaw 0 or 180°) and
    // the blit must NOT mirror; with it off, blit-time mirroring owns facing.
    yawed: DIALS.turnaround,
    source: resolved.source,
  };
  if (live) return entry;   // never stored: see the note at the cache read
  cache.set(token, entry);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    canvasPool.push(cache.get(oldest).canvas);
    cache.delete(oldest);
    stats.evictions++;
  }
  return entry;
}
