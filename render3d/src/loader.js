// The render3d rig registry: which characters have a 3D body, which clip
// answers each animation state — and the material pass every body goes
// through on the way in. Since K6 the DEFAULT pass is native PBR: the mech
// exports' own baked metal/rough materials, kept as delivered. The old
// conversion (toon materials + ink outlines) survives behind `?render=toon`.
//
// The one rig registry for both 3D backends. It used to have a twin in
// billboards/, and the two
// backends share one asset truth: the same delivery spec, the same standard
// skeleton, the same clip names — a rig approved for billboards is a valid
// intake candidate here the day it lands (render3d/docs/asset-requests.md).
// What differs is the registry itself (each backend loads its own manifest
// from its own assets/) and the intake conversion above.
//
// CLIP RESOLUTION — for character C in state S, first answer wins:
//   1. manifest characters[C].clips[S].glb    (the rig's OWN exported clip,
//      by its export name; optional `.freeze: <s>` holds it at one time)
//   2. manifest characters[C].clips[S].from   (hand-set override, another rig)
//   3. C's own rig clip named S               (how the mannequin's spec-built
//      set answers — its clips are keyed by state name)
//   4. manifest characters[C].inheritClips    (whole-set fallback, no chains)
// ...then characters[C].clips[S].mirror / characters[C].mirrorClips may flip
// the answer left-right (see finishClip below).
//
// A mech state nothing answers resolves null and draws the placeholder
// loudly. The JJK-era pose libraries and the loader's default pose set that
// used to sit in this chain were DELETED in K7 (K5 had already cut them out
// of resolution): every pose on a mech comes from the mech's own export.
//
// ALL-OR-NOTHING per fighter: only `approved: true` manifest entries
// register, exactly like billboards — art is in the repo before it is in the
// game, and what players see is what was reviewed.

import { clipNameFor } from "./states.js";
import { mirrorClip } from "./clips.js";
import { buildMannequin, buildBoneProxy, MANNEQUIN_HEIGHT_M } from "./mannequin.js";
import { clone as cloneSkinned } from "../../vendor/three/utils/SkeletonUtils.js";
import { applyToonMaterials, applyNativeMaterials, characterToon, TOON_STYLE } from "./toon.js";
import { addOutlines, setOutlineFor } from "./outline.js";
import { captureCleanPose, poseRig, measureBindMetrics } from "./pose.js";
import { reachChain } from "./ik.js";

/** charKey -> { root, height, clips: Map, mixer, actions: Map, entry } */
const RIGS = new Map();

let MANIFEST = { characters: {} };
let THREE = null;

const BASE = new URL("../", import.meta.url); // render3d/

export function hasRig(charKey) {
  return RIGS.has(charKey);
}

export function getRig(charKey) {
  return RIGS.get(charKey) || null;
}

export function rigCount() {
  return RIGS.size;
}


export function rigManifest() {
  return MANIFEST;
}

/** The clip character `charKey` plays for `state`, per the resolution order
 *  above, with its provenance (`source`) for the workbench. */
export function resolveClip(charKey, state) {
  const name = clipNameFor(state);
  const entry = MANIFEST.characters?.[charKey];
  const own = RIGS.get(charKey);
  const answer = (clip, source) => finishClip(clip, source, name, entry);

  // The mech path, FIRST: `clips[name].glb` names one of the rig's OWN
  // exported animations (Mech Mayhem clip names — walk, clawSnap,
  // viperSlash1 …). This is how the 26-state contract maps onto a GLB whose
  // clips were named by a different game; tools/mech_intake.mjs writes the
  // table. It comes first on purpose (K5): a manifest glb mapping is an
  // EXPLICIT decision about this rig, and nothing may outrank it. (The
  // pose-library branch that used to sit below it — Mixamo-boned, empty on
  // the mech skeletons — was deleted in K7.)
  //
  // `clips[name].freeze: <seconds>` freezes the named clip: the state holds
  // the pose the clip has at that time (K5 — idle is the first frame of the
  // mech's own heavy wind-up, charge its mid-wind-up). The frozen clip is a
  // real AnimationClip with constant tracks, so the mixer, the pose cache and
  // the additive breath layer all treat it exactly like any other clip.
  const glbName = entry?.clips?.[name]?.glb;
  if (glbName && own?.clips?.has(glbName)) {
    const src = own.clips.get(glbName);
    const freezeT = Number(entry?.clips?.[name]?.freeze);
    if (Number.isFinite(freezeT) && THREE) {
      return answer(freezeClip(src, freezeT), `glb:${glbName}@${freezeT}s`);
    }
    return answer(src, `glb:${glbName}`);
  }

  const override = entry?.clips?.[name]?.from;
  if (override) {
    const clip = RIGS.get(override)?.clips?.get(name);
    if (clip) return answer(clip, `from:${override}`);
  }

  // The rig's own clip named for the state. This is also how a MANNEQUIN
  // stand-in answers everything: its spec-built clip set (mannequin.js
  // buildDefaultClips) is registered as its OWN clips, keyed by state name.
  if (own?.clips?.has(name)) return answer(own.clips.get(name), "own");

  const inherit = entry?.inheritClips;
  if (inherit && inherit !== "default") {
    const clip = RIGS.get(inherit)?.clips?.get(name);
    if (clip) return answer(clip, `inherit:${inherit}`);
  }

  // MM CLIPS ONLY (K5, files deleted in K7): there is no default pose set
  // to fall through to any more. A state the intake gave no mapping is a
  // hole to fix in tools/mech_intake.mjs, and it should look like one — the
  // fighter draws the placeholder body loudly (backend.js handles the null),
  // not an old pose silently.
  if (isMechEntry(entry) && !own?.isMannequin) warnNoMechClip(charKey, name);
  return null;
}

/** A manifest entry whose clip table names the rig's own exported GLB
 *  animations — the mech delivery shape. Such a rig animates from its export
 *  ONLY: no pose-library build, no default pose set. */
function isMechEntry(entry) {
  const clips = entry?.clips;
  if (!clips) return false;
  for (const k in clips) if (clips[k]?.glb) return true;
  return false;
}

const WARNED_NO_CLIP = new Set();
function warnNoMechClip(charKey, name) {
  const key = `${charKey}:${name}`;
  if (WARNED_NO_CLIP.has(key)) return;
  WARNED_NO_CLIP.add(key);
  console.warn(`render3d: ${charKey} has no glb mapping for "${name}" — drawing the placeholder (mechs animate from their own export only; fix tools/mech_intake.mjs).`);
}

// FREEZE FRAMES (K5). A frozen state is the source clip sampled once, at
// `freeze` seconds, and held: every track is collapsed to two identical keys
// (t=0 and the source's duration, so loop math and one-shot clamps both stay
// sane). Built by evaluating each track's own interpolant — never subclip,
// whose frame-snapping misses a freeze time that sits between keyframes.
// Cached per source clip AND per time, so repeat resolves hand back the SAME
// AnimationClip object: the mixer's action cache (`action.getClip() !== clip`)
// and the mirror cache above both key on object identity.
/** srcClip -> Map(freezeT -> frozen AnimationClip) */
const FROZEN = new WeakMap();

function freezeClip(src, freezeT) {
  let byT = FROZEN.get(src);
  if (!byT) { byT = new Map(); FROZEN.set(src, byT); }
  const held = byT.get(freezeT);
  if (held) return held;
  const t = Math.max(0, Math.min(freezeT, Math.max(src.duration - 1e-4, 0)));
  const span = Math.max(src.duration, 1e-3);
  const tracks = src.tracks.map((track) => {
    // The interpolant clamps outside the track's own key range, so t=0 on a
    // track whose first key is later still answers with that first key.
    const value = Array.from(track.createInterpolant().evaluate(t));
    return new track.constructor(track.name, [0, span], [...value, ...value]);
  });
  const frozen = new THREE.AnimationClip(`${src.name}@${freezeT}`, span, tracks);
  byT.set(freezeT, frozen);
  return frozen;
}

// Mirrored clips, same manifest keys:
// `characters[C].clips[S].mirror` flips one state's resolved clip left-right,
// `characters[C].mirrorClips` flips the whole set (a per-state `mirror` then
// exempts a clip). This is POSE data changing hands, not facing: the
// turnaround still yaws the rig, and a mirrored punch extends exactly as far
// forward with the other fist (clips.js mirrorClip), so a flipped model keeps
// every state's read. Built lazily, cached per source clip.
const MIRRORED = new WeakMap();

function finishClip(clip, source, name, entry) {
  const flip = !!entry?.mirrorClips !== !!entry?.clips?.[name]?.mirror;
  if (!flip || !THREE) return { clip, source };
  let m = MIRRORED.get(clip);
  if (!m) {
    m = mirrorClip(THREE, clip);
    MIRRORED.set(clip, m);
  }
  return { clip: m, source: `${source}+mirror` };
}

// ---------------------------------------------------------------- instances
//
// The registry holds ONE rig object per character, which is all the flat path
// needs: it poses that object, renders it to a texture, and moves on, so two
// Gojos on screen simply take turns. A caller that puts rigs in a LIVE scene
// (the 2.5D camera) cannot do that — the same Object3D cannot stand in two
// places at once, and posing it for one fighter would visibly re-pose the
// other.
//
// So that caller asks for an INSTANCE: a skeleton-aware clone with its own
// mixer, cached per instance id (the fighter's id). Clips are shared — they
// are read-only keyframe data and bind by bone name — so an instance costs a
// cloned scene graph and nothing else.

/** instanceId -> { charKey, root, height, clips, mixer, actions } */
const INSTANCES = new Map();

/** A private posable copy of `charKey`'s rig for `instanceId`. Returns null
 *  when the character has no rig. Repeat calls return the same instance. */
export function acquireInstance(charKey, instanceId) {
  const key = `${charKey}#${instanceId}`;
  const held = INSTANCES.get(key);
  if (held) return held;
  const base = RIGS.get(charKey);
  if (!base) return null;
  // cloneSkinned rebinds SkinnedMesh skeletons onto the cloned bones; a plain
  // Object3D.clone() would leave every copy driven by the original's skeleton.
  const root = cloneSkinned(base.root);
  // The clone copies the base's CURRENT transforms, which may be mid-pose, so
  // it takes the base's remembered bind pose rather than its own.
  captureCleanPose(root, base.root);
  root.userData.yawOffsetRad = base.yawOffset ?? 0;
  const inst = {
    charKey, root, height: base.height, clips: base.clips,
    renderScale: base.renderScale ?? 1, yawOffset: base.yawOffset ?? 0,
    mixer: new THREE.AnimationMixer(root), actions: new Map(),
  };
  // The GLB corrections come across too. They are facts about the FILE, so the
  // in-game copy of a fighter has to carry exactly what the workbench copy
  // does — a shoulder correction that only existed on the base rig meant the
  // number was dialled in the review and then never seen in a match.
  copyModelFixes(inst, base);
  // The bind-pose constants come across rather than being re-measured: an
  // instance is a clone of a rig that may already be mid-pose, so its own bind
  // is only recoverable from the base's. Same file, same numbers.
  inst._compass = base._compass;
  inst._soleDelta = base._soleDelta;
  INSTANCES.set(key, inst);
  return inst;
}

/** Drop instances whose id is not in `live` — fighters that left the match. */
export function releaseInstancesExcept(live) {
  for (const [key, inst] of INSTANCES) {
    if (live.has(key)) continue;
    inst.mixer.stopAllAction();
    inst.root.removeFromParent();
    INSTANCES.delete(key);
  }
}

// ---------------------------------------------------- size and orientation
//
// Two per-character facts about a DELIVERY that no clip and no engine layer
// can be responsible for, both edited in the workbench and both stored in the
// manifest:
//
//   renderScale  How big to draw this rig, as a multiplier on the character's
//                head-height target. It exists because "how tall the character
//                is" and "how tall the model measures" are different numbers:
//                a model in its idle pose is shorter than the person (nobody
//                idles at full stretch, and a stance with the legs apart drops
//                the hips), while the top of the art is hair, not skull. The
//                dial is deliberately a HAND setting rather than a measurement
//                — the measurement is offered below as a reading, because
//                which of those effects should be corrected for is a judgement
//                about how the fighter should read next to their sprite, not
//                an arithmetic fact.
//
//   stanceDeg    How far apart the fighter plants their feet in idle, degrees
//   armDeg       How far the arms hang out from the body in idle, degrees
//   shoulderOutCm  How far the arm roots move out from the body, centimetres
//   kneeDeg      How far each leg is turned about its own length to square the
//                knee to the front, degrees, positive inward. Generated legs
//                arrive screwed outward at the hip — kneecap and toe both
//                pointing away from the midline — and it is a fault in the
//                FILE, so it is corrected under every state (ik.js
//                applyKneeTurn) rather than posed around
//                of thigh splay per leg. Their sprite's stance is part of how
//                big they READ, so this sits beside renderScale rather than
//                being a posing afterthought (ik.js applyStance).
//
//   yawOffsetDeg Which way the rig faces. The delivery spec says forward is
//                +Z; a model that arrives built the other way round faces
//                backwards in every state, and there is nothing to fix in the
//                clips — the whole rig is turned. 180 is the common case.
//
// Both default to "as delivered" (1 and 0), so a rig that honours the spec
// needs neither.

/**
 * Read the manifest's size/orientation/look settings onto a rig entry.
 *
 * NONE OF THE DELIVERY CORRECTIONS APPLY TO A MANNEQUIN. `renderScale`,
 * `yawOffsetDeg` and the outline width all describe one specific .glb — how
 * that model was built, how tall it measures, how heavy a line its costume
 * wants. The stand-in is a different body entirely: built to spec by
 * mannequin.js, facing +Z, measuring its own declared height, wearing nothing.
 *
 * Handing it the delivery's numbers made the stand-in wrong in exactly the way
 * the delivery was: while Dagon's model was still downloading, his mannequin
 * stood turned 80° — his file's error, applied to a body that does not have
 * it — and then snapped straight when the real rig arrived. Which is a worse
 * failure than it looks, because the stand-in is what you are looking at when
 * you are trying to decide whether the ORIENTATION DATA IS RIGHT: it lies
 * about the one thing it is on screen to help you check.
 *
 * `stanceDeg` is the exception and stays: how wide a fighter plants their feet
 * is a fact about the CHARACTER, not about the file they arrived in, and the
 * stand-in should stand the way they stand.
 */
function applyEntrySettings(rig, entry) {
  const delivered = !rig.isMannequin;
  // Line weight is per character where the manifest says so (the toon block's
  // one non-material knob); the ramp knobs in that block were already applied
  // when the materials were built. The mannequin takes neither — it is
  // deliberately built without this character's toon overrides too.
  setOutlineFor(rig.root, (delivered && entry?.toon?.outlinePx) ?? null);
  const scale = Number(entry?.renderScale);
  rig.renderScale = delivered && Number.isFinite(scale) && scale > 0 ? scale : 1;
  const yaw = Number(entry?.yawOffsetDeg);
  rig.yawOffsetDeg = delivered && Number.isFinite(yaw) ? yaw : 0;
  rig.yawOffset = (rig.yawOffsetDeg * Math.PI) / 180;
  // Stamped on the root as well as the rig entry: every layer that NODS asks
  // the root which way this fighter faces (ik.js characterLateral), and it has
  // only the object to ask — a rig posed without its offset to hand nods about
  // an axis that is wrong by exactly the offset.
  rig.root.userData.yawOffsetRad = rig.yawOffset;
  // How the head is carried. A correction to the MODEL's mesh, so the stand-in
  // — built to spec, head level — does not take it either.
  const tilt = Number(entry?.headTiltDeg);
  rig.headTiltDeg = delivered && Number.isFinite(tilt) ? tilt : 0;
  // Whether the engine rebuilds this fighter's idle arms. A fact about the
  // DELIVERY — "the pose this model came with is the one we want" — so the
  // stand-in, which came with no pose at all, always takes the rule.
  rig.idleArms = delivered ? entry?.idleArms !== false : true;
  // Stance is the character's, not the file's.
  const stance = Number(entry?.stanceDeg);
  rig.stanceDeg = Number.isFinite(stance) ? stance : 0;
  // How far the arms hang from the body, same idea one axis up. Null rather
  // than 0 when unset, so pose.js can tell "this fighter wants none" from
  // "nobody has said", and fall back to the roster's number for the second.
  const arm = Number(entry?.armDeg);
  rig.armDeg = Number.isFinite(arm) ? arm : null;
  // How far the arm roots move out from the body, in centimetres. A fact about
  // the DELIVERY -- a generated clavicle that came out short -- so the stand-in
  // does not take it.
  const shoulder = Number(entry?.shoulderOutCm);
  rig.shoulderOutCm = delivered && Number.isFinite(shoulder) ? shoulder : 0;
  // How far the legs are turned to square the knees, degrees. Also a fact
  // about the DELIVERY — a mannequin's legs are built straight — so the
  // stand-in does not take it.
  const knee = Number(entry?.kneeDeg);
  rig.kneeDeg = delivered && Number.isFinite(knee) ? knee : 0;
}

/** Carry the GLB correction layer from one rig object to another — a fresh
 *  instance, or a base rig whose numbers just changed under the workbench.
 *
 *  One list, one place: every key here is in `MODEL_FIX_KEYS` (rig_fixes.js),
 *  and anything added there has to be added here or it stops at the base rig.
 *  `renderScale` and `yawOffset` are handled by their callers, which have to
 *  restamp the root's userData alongside them. */
function copyModelFixes(dst, src) {
  dst.headTiltDeg = src.headTiltDeg ?? 0;
  dst.shoulderOutCm = src.shoulderOutCm ?? 0;
  dst.kneeDeg = src.kneeDeg ?? 0;
  return dst;
}

/** Set them live, from the workbench. */
export function setRigSettings(charKey, { renderScale, yawOffsetDeg, stanceDeg, headTiltDeg, armDeg, shoulderOutCm, kneeDeg } = {}) {
  const rig = RIGS.get(charKey);
  if (!rig) return null;
  if (renderScale !== undefined && Number.isFinite(renderScale) && renderScale > 0) {
    rig.renderScale = renderScale;
  }
  if (yawOffsetDeg !== undefined && Number.isFinite(yawOffsetDeg)) {
    rig.yawOffsetDeg = yawOffsetDeg;
    rig.yawOffset = (yawOffsetDeg * Math.PI) / 180;
    // The presentation compass is calibrated against the bind pose AT this
    // offset — "which way the delivery faces" is the whole question it answers
    // — so turning the delivery re-opens it.
    measureBindMetrics(rig);
  }
  if (headTiltDeg !== undefined && Number.isFinite(headTiltDeg)) rig.headTiltDeg = headTiltDeg;
  rig.root.userData.yawOffsetRad = rig.yawOffset;
  if (stanceDeg !== undefined && Number.isFinite(stanceDeg)) rig.stanceDeg = stanceDeg;
  if (armDeg !== undefined) rig.armDeg = Number.isFinite(armDeg) ? armDeg : null;
  if (shoulderOutCm !== undefined) rig.shoulderOutCm = Number.isFinite(shoulderOutCm) ? shoulderOutCm : 0;
  if (kneeDeg !== undefined) rig.kneeDeg = Number.isFinite(kneeDeg) ? kneeDeg : 0;
  // Instances already handed out share the character's settings.
  for (const inst of INSTANCES.values()) {
    if (inst.charKey !== charKey) continue;
    inst.renderScale = rig.renderScale;
    inst.yawOffset = rig.yawOffset;
    inst._compass = rig._compass;
    inst._soleDelta = rig._soleDelta;
    copyModelFixes(inst, rig);
    inst.root.userData.yawOffsetRad = rig.yawOffset;
  }
  return rig;
}

/** Meshes that count as the body. A raised spear, a swinging braid and the
 *  ink outline shells are all excluded: none of them is how tall someone is. */
function bodyMeshes(root) {
  const out = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline) return;
    for (let p = o; p; p = p.parent) {
      if (/^(Prop_|Chain_)/.test(p.name || "")) return;
    }
    out.push(o);
  });
  return out;
}

/**
 * Measure `rigEntry` posed at the start of its idle, foot line to top of head,
 * in metres. `clip` overrides the resolved idle clip, which is how the
 * workbench re-measures while an idle pose is being edited.
 *
 * Returns null when there is nothing measurable, and the caller keeps the
 * declared height.
 */
export function measureIdleHeight(charKey, rigEntry = null, clip = null) {
  const rig = rigEntry || RIGS.get(charKey);
  if (!rig) return null;
  const idle = clip || resolveClip(charKey, "idle")?.clip;
  if (!idle) return null;
  // With the fighter's own stance: widening the legs shortens them, so a
  // height measured with the feet closed is not the height being drawn — and
  // the "fit height" reading would ask for a scale the stance then spends.
  poseRig(rig, "idle", 0, idle, { charKey, stanceDeg: rig.stanceDeg || 0 });
  rig.root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  let any = false;
  for (const mesh of bodyMeshes(rig.root)) {
    // `precise` runs the vertices through their bone transforms, so this is
    // the POSED silhouette and not the bind pose's bounding box.
    box.expandByObject(mesh, true);
    any = true;
  }
  if (!any || !Number.isFinite(box.min.y) || !Number.isFinite(box.max.y)) return null;
  const h = box.max.y - box.min.y;
  return h > 0.2 ? h : null;
}

/**
 * WHERE AN EXPORTED ANCHOR IS, posed — the instrument behind
 * tools/derive_muzzles.mjs.
 *
 * Every mech leaves MM's exporter with a set of empty nodes named
 * `anchor_<name>` (mechs/<key>.json lists them): `core` on the torso,
 * `overhead` on the head, `boostL`/`boostR` on the feet, and `muzzleL`/
 * `muzzleR` on whatever fires — a cannon, a hand, a rifle tip. They are the
 * game's own statement about where a shot leaves that machine, they are
 * parented to the bones that carry them, and so they move with the animation.
 *
 * Nothing read them until now: tools/mech_intake.mjs imports geometry, height
 * and clips, and plan task M6 ("Anchors: muzzle/boost/core/overhead as FX
 * attachment points") was never started — so combat.js spawned every shot in
 * the game from a reference offset scaled by height instead.
 *
 * Returns `{ f, u }` per requested anchor in METRES in the rig's own frame
 * (+z forward, +y up, origin at the feet), the same frame and units
 * `measureAttackReach` reports its strike points in, so a caller converts with
 * the same `targetPx * renderScale / heightM`.
 */
export function measureAnchors(charKey, names, state = "idle", t = 0) {
  const rig = RIGS.get(charKey);
  if (!rig || rig.isMannequin) return null;
  const resolved = resolveClip(charKey, state) || resolveClip(charKey, "idle");
  if (!resolved) return null;
  // Posed, not in bind: a muzzle rides the arm that raises it, and the pose a
  // shot leaves from is the one worth measuring.
  poseRig(rig, state, t, resolved.clip, { charKey, stanceDeg: rig.stanceDeg || 0 });
  rig.root.updateMatrixWorld(true);
  const out = {};
  for (const name of names) {
    const node = rig.root.getObjectByName(`anchor_${name}`);
    if (!node) continue;
    const world = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);
    const local = rig.root.worldToLocal(world);
    out[name] = { f: local.z, u: local.y };
  }
  return { clip: resolved.clip, source: resolved.source, anchors: out };
}

/**
 * Measure how far forward (and how high) a rig's attack clips actually reach,
 * in METRES from the root origin — the instrument behind
 * tools/derive_attack_envelopes.mjs.
 *
 * Poses each state at its contact beat (and a step before it) with no aim
 * layers, so the reading is the clip's own committed extension, then takes
 * the posed bounding box of everything that can hit: body AND props — a
 * naginata's reach is the whole point — but never outline shells or hidden
 * helper geometry. Forward is +Z (the frame the reach solver builds in;
 * facingYaw's base correction is applied by poseRig).
 *
 * Also reports the STRIKE POINT: where the blow actually is at the beat —
 * the business end of the striking limb (ik.js REACH names it per state, and
 * it is a FOOT for the aerial), or the weapon's far end when the fighter
 * swings one, since a naginata connects at the blade and not at the hands.
 * That is the point the impact FX want and the point a radial tipper would
 * measure from, and it is the estimate a human then checks against the
 * sprite in the verification bench.
 *
 * Returns { state: { fwd, top, strike: {f, u}, via } } in metres, or null for
 * a character without a real rig. Callers convert to game px with
 * targetPx * renderScale / heightM — the same ratio the blit draws with.
 */
export function measureAttackReach(charKey, states, beats = {}, layersFor = {}) {
  const rig = RIGS.get(charKey);
  if (!rig || rig.isMannequin) return null;
  const box = new THREE.Box3();
  const propBox = new THREE.Box3();
  const out = {};
  for (const state of states) {
    const resolved = resolveClip(charKey, state);
    if (!resolved) continue;
    const beat = beats[state] ?? 0.1;
    let fwd = -Infinity, top = -Infinity;
    let strike = null, via = null;
    for (const t of [beat, beat * 0.6]) {
      // WITH the aim and reach layers the game applies to an unaimed strike
      // (the caller solves them — see derive_attack_envelopes.mjs). Measuring
      // the bare clip instead reads where the library pose left the hand,
      // which for several fighters is still behind them at the contact beat;
      // what a player sees is the solved limb, so that is what is measured.
      poseRig(rig, state, t, resolved.clip,
        { charKey, stanceDeg: rig.stanceDeg || 0, ...(layersFor[state] || {}) });
      rig.root.updateMatrixWorld(true);
      box.makeEmpty();
      let any = false;
      rig.root.traverse((o) => {
        if (!o.isMesh || o.userData.isOutline || !o.visible) return;
        box.expandByObject(o, true);
        any = true;
      });
      if (!any || !Number.isFinite(box.max.z)) continue;
      fwd = Math.max(fwd, box.max.z);
      top = Math.max(top, box.max.y);
      // The strike point is read at the BEAT itself (the first pass), which is
      // the frame the hitbox goes live; the earlier sample only widens the
      // envelope above.
      if (t === beat) {
        const point = strikePointOf(rig, state, box, propBox);
        if (point) { strike = point.local; via = point.via; }
      }
    }
    if (fwd > -Infinity) {
      out[state] = { fwd, top };
      if (strike) { out[state].strike = strike; out[state].via = via; }
    }
  }
  return Object.keys(out).length ? out : null;
}

/** Where the blow is, in the rig's own frame ({f} forward, {u} up, metres).
 *  The weapon's far end when one is held and it leads the hand, otherwise the
 *  striking limb's own end bone. Null when the rig names neither. */
function strikePointOf(rig, state, bodyBox, propBox) {
  const chain = reachChain(state);
  const endName = chain?.[chain.length - 1];
  const hand = endName ? rig.root.getObjectByName(endName) : null;
  if (!hand) return null;
  const handWorld = new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld);
  let best = handWorld;
  let via = endName;

  // A prop's far end: the corner of its posed bounds furthest from the grip.
  // Measured off the geometry rather than off `lengthM`, so a weapon that was
  // re-gripped or rescued at conform reports where it actually is.
  propBox.makeEmpty();
  let hasProp = false;
  rig.root.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline || !o.visible) return;
    for (let p = o; p; p = p.parent) {
      if (/^Prop_/.test(p.name || "")) { propBox.expandByObject(o, true); hasProp = true; return; }
    }
  });
  if (hasProp && !propBox.isEmpty()) {
    const corner = new THREE.Vector3();
    let far = null, farD = -1;
    for (const x of [propBox.min.x, propBox.max.x]) {
      for (const y of [propBox.min.y, propBox.max.y]) {
        for (const z of [propBox.min.z, propBox.max.z]) {
          corner.set(x, y, z);
          const d = corner.distanceTo(handWorld);
          if (d > farD) { farD = d; far = corner.clone(); }
        }
      }
    }
    // Only when the weapon actually LEADS: a sword held back in a wind-up, or
    // a broom trailing behind a kick, is not where that blow lands.
    if (far && far.z > handWorld.z) { best = far; via = "prop"; }
  }

  const local = rig.root.worldToLocal(best.clone());
  return { local: { f: local.z, u: local.y }, via };
}

/** What the scale dial would have to be for the model to stand exactly its
 *  head-height target — offered to the workbench as a READING next to the dial,
 *  never applied on its own. `clip` lets the workbench measure an idle it is
 *  in the middle of editing. */
export function suggestedScale(charKey, clip = null) {
  const rig = RIGS.get(charKey);
  if (!rig) return null;
  const measured = measureIdleHeight(charKey, rig, clip);
  if (!measured) return null;
  return { measured, declared: rig.declaredHeight ?? rig.height,
           scale: (rig.declaredHeight ?? rig.height) / measured };
}

// ------------------------------------------------------------- the bone proxy
//
// THE RIG, DRAWN. Not a mannequin retargeted onto a fighter — that is a
// different question and a misleading answer, because a delivered clip is
// authored in ITS OWN rig's bind pose and playing it on a T-pose stand-in
// produces a pose neither rig has. What this draws is the fighter's OWN
// skeleton, in the fighter's own pose, as boxes: one down every bone, a cube
// at every joint, warm on their left and cool on their right, with a nose and
// a chest plate along the head's and the chest's own +Z.
//
// It exists because "the arm looks wrong" has two possible causes and they
// need different fixes. If the BONES are where the drawing wants them and the
// mesh is not, the delivery's skinning is wrong. If the bones are wrong too,
// it is the pose. Every fighter with a suspicious limb has been that question,
// and answering it meant opening the .glb in another tool.
//
// The skin is hidden rather than removed while it is on, so it comes back
// exactly as it was — including the outline shells, which are meshes too and
// would otherwise leave a fighter-shaped ink ghost around the boxes.

/** root -> { proxy: Mesh[], skin: Mesh[] } */
const PROXIES = new WeakMap();

/** Draw `charKey`'s skeleton instead of their model, or put the model back.
 *  Returns false when there is no rig to do it to. */
export function setBoneProxy(charKey, on) {
  const rig = RIGS.get(charKey);
  if (!rig || !THREE) return false;
  let held = PROXIES.get(rig.root);
  if (!held) {
    if (!on) return false;
    held = buildBoneProxy(THREE, rig.root, rig.declaredHeight || rig.height);
    PROXIES.set(rig.root, held);
  }
  for (const m of held.proxy) m.visible = on;
  for (const m of held.skin) m.visible = !on;
  return true;
}

// -------------------------------------------------------------------- setup

function registerRig(charKey, { root, height, clips, isMannequin = false }, entry = null) {
  const mixer = new THREE.AnimationMixer(root);
  // The bind pose, taken here because here is the last moment it is certainly
  // the bind pose — every pose from now on starts by restoring it (pose.js).
  captureCleanPose(root);
  // `declaredHeight` is what the manifest says the character is; `height` is
  // what the model measures in its idle pose, filled in by calibrateHeight
  // once every rig is registered (the measurement needs the clip set).
  // `charKey` rides on the rig so the GLB correction layer (pose.js) can find
  // a fighter's per-bone fixes without the caller remembering to pass it —
  // a correction that only lands when someone sets `layers.charKey` is a
  // correction that silently does not land in half the game.
  const rig = { charKey, root, height, declaredHeight: height, clips, mixer,
                actions: new Map(), entry, isMannequin };
  applyEntrySettings(rig, entry);
  // The per-rig constants that are facts about the FILE — the presentation
  // compass and the mesh's sole offset — taken here, from the bind pose, while
  // the skeleton is still certainly in it. Measuring them lazily at the first
  // pose made both depend on which state happened to render first (pose.js
  // measureBindMetrics says what that cost).
  measureBindMetrics(rig);
  RIGS.set(charKey, rig);
}

async function loadGlbRig(charKey, entry, GLTFLoader) {
  const url = new URL(`assets/${entry.model}`, BASE).href;
  const gltf = await new GLTFLoader().loadAsync(url);
  // The material pass, per style (K6). DEFAULT: the delivery's OWN baked PBR
  // materials, untouched — the mech exports carry real metal/rough textures
  // authored for exactly this body, and scene.js grades them the way Mech
  // Mayhem does. `?render=toon` keeps the old anime pass: every material
  // becomes a toon material (manifest `toon` overrides + the .glb's extras)
  // and every mesh grows its ink shell.
  if (TOON_STYLE) {
    applyToonMaterials(THREE, gltf.scene, characterToon(entry));
    addOutlines(THREE, gltf.scene);
  } else {
    applyNativeMaterials(gltf.scene);
  }
  const clips = new Map(gltf.animations.map((c) => [c.name, c]));
  registerRig(charKey, {
    root: gltf.scene,
    height: entry.heightM || MANNEQUIN_HEIGHT_M,
    clips,
  }, entry);
}

/** The rig key an alternate model is registered under.
 *
 *  A SECOND MODEL OF THE SAME FIGHTER, kept so two generations can be judged
 *  against each other rather than from memory. It is registered as its own rig
 *  under its own key, which is what makes the comparison honest: the size,
 *  yaw, stance and head carriage in `entry.alt` describe THAT .glb and travel
 *  with it. Sharing the character's settings would dress the old model in the
 *  new one's corrections and quietly answer the question being asked — the
 *  alternate would look wrong for a reason that has nothing to do with the
 *  alternate. The manifest keeps them apart; so does this.
 */
export const altKey = (charKey) => `${charKey}#alt`;

/** Does this fighter have a second model on file? */
export function hasAlt(charKey) {
  return !!MANIFEST?.characters?.[charKey]?.alt?.model;
}

/** The alternate's own manifest block — what the review dials edit when the
 *  comparison is showing it. */
export function altEntry(charKey) {
  return MANIFEST?.characters?.[charKey]?.alt || null;
}

/** Load a fighter's alternate model on demand, under `altKey(charKey)`. */
export async function ensureAltRig(charKey, GLTFLoader) {
  const alt = altEntry(charKey);
  if (!alt?.model) return false;
  const key = altKey(charKey);
  if (RIGS.has(key)) return true;
  if (!inFlight.has(key)) {
    // `alt` IS the entry — height, scale, yaw, stance, toon, all of it. That
    // is the whole point; see altKey above.
    inFlight.set(key, loadGlbRig(key, alt, GLTFLoader)
      .catch((err) => {
        console.warn(`render3d: alternate rig for "${charKey}" failed to load (${err.message})`);
      })
      .finally(() => inFlight.delete(key)));
  }
  await inFlight.get(key);
  return RIGS.has(key);
}

/** Load one delivered rig on demand, if it is not already in.
 *
 *  Twenty-seven models is 56 MB of glTF and twenty-seven textures to decode,
 *  and asking for all of it up front is what made the workbench unusable on a
 *  phone: iOS Safari runs out of memory partway through, the module's
 *  top-level await never settles, and NOTHING after it runs — so every button
 *  on a fully rendered page silently does nothing. The game still loads the
 *  roster eagerly (a match needs whoever is in it, immediately), but a tool
 *  that looks at one fighter at a time should pay for one fighter at a time.
 *
 *  Resolves to true when the character has a rig afterwards, however it got
 *  one; concurrent calls for the same character share a single load. */
const inFlight = new Map();
export async function ensureRig(charKey, GLTFLoader) {
  const entry = MANIFEST?.characters?.[charKey];
  if (!entry?.approved || !entry.model) return RIGS.has(charKey);
  const existing = RIGS.get(charKey);
  if (existing && !existing.isMannequin) return true;
  if (!inFlight.has(charKey)) {
    inFlight.set(charKey, loadGlbRig(charKey, entry, GLTFLoader)
      .catch((err) => {
        console.warn(`render3d: rig for "${charKey}" failed to load (${err.message})`);
      })
      .finally(() => inFlight.delete(charKey)));
  }
  await inFlight.get(charKey);
  return RIGS.has(charKey);
}

/** Load the manifest, the approved rigs, and any mannequin stand-ins —
 *  `mannequinFor` from the URL (`?mannequin=all` or a key list), never
 *  displacing a delivered rig.
 *
 *  `eager` limits WHICH delivered rigs are fetched now: a list of keys loads
 *  only those and leaves the rest to `ensureRig`. Omitted means all of them,
 *  which is what a match wants. */
/** APPROVED IS NOT THE SAME AS READY TO PLAY. `approved` says the delivery
 *  passed intake and belongs in the repo; `inGame: false` says this particular
 *  body is not fit to be seen by a player yet — Mei Mei's arm is 151% of a
 *  normal one, Kurourushi is mid-rebuild — while still being exactly what the
 *  workbench exists to look at. Two flags because they answer two questions,
 *  and collapsing them would mean un-approving an asset to hide it, which also
 *  hides it from the tool that would fix it.
 *
 *  Absent means yes: a fighter is in the game unless someone says otherwise. */
export function inGame(charKey) {
  return MANIFEST?.characters?.[charKey]?.inGame !== false;
}

export async function initRigs(three, GLTFLoader, mannequinFor = [], allCharKeys = [],
                               eager = null, opts = {}) {
  THREE = three;

  try {
    const res = await fetch(new URL("assets/manifest.json", BASE).href, { cache: "no-cache" });
    MANIFEST = await res.json();
  } catch (err) {
    console.warn(`render3d: manifest failed to load (${err.message}) — no delivered rigs will register.`);
    MANIFEST = { characters: {} };
  }

  const loads = [];
  const wanted = eager ? new Set(eager) : null;
  for (const [charKey, entry] of Object.entries(MANIFEST.characters || {})) {
    if (!entry?.approved || !entry.model) continue;
    // Held back from PLAY, not from the tools. The default is the cautious
    // one, so a caller that has not thought about it — the game, and anything
    // added later — gets the fighter's sprites rather than a body somebody
    // marked as not ready. The workbenches opt in.
    if (entry.inGame === false && !opts.includeDisabled) continue;
    if (wanted && !wanted.has(charKey)) continue;
    loads.push(loadGlbRig(charKey, entry, GLTFLoader).catch((err) => {
      console.warn(`render3d: rig for "${charKey}" failed to load — drawing their sprites instead. ${err.message}`);
    }));
  }
  await Promise.all(loads);

  const wantAll = mannequinFor.includes("all");
  const keys = wantAll ? allCharKeys : mannequinFor;
  for (const charKey of keys) {
    if (RIGS.has(charKey)) continue;
    const m = buildMannequin(THREE, charKey);
    // In the toon style the proof body goes through the same anime pass as a
    // delivery — a grey toon-ramped, ink-outlined mannequin. Under the PBR
    // default it keeps its own flat materials: there is no baked PBR to
    // honour, and a plain grey stand-in is exactly what a stand-in should be.
    if (TOON_STYLE) {
      applyToonMaterials(THREE, m.root);
      addOutlines(THREE, m.root);
    }
    // Flagged, so a later ensureRig() knows a stand-in is still standing in
    // and goes and fetches the real delivery. The mannequin's spec-built clip
    // set registers as its OWN clips (keyed by state name), which is how it
    // animates now that the loader's default-pose fallback is gone (K7).
    registerRig(charKey, { root: m.root, height: m.height, clips: m.clips,
      isMannequin: true },
      MANIFEST.characters?.[charKey] || null);
  }

}
