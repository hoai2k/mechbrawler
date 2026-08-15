// GLB character pipeline: loads rigged humanoid models (Meshy / Tripo /
// Mixamo auto-rigs) described in public/models/manifest.json and drives them
// with the game's existing animation system via RigAdapter.
//
// Manifest format (public/models/manifest.json):
// {
//   "titanus": {
//     "url": "models/titanus.glb",
//     "bindPose": "tpose",            // tpose | apose | native | {joint:[x,y,z]°}
//     "boneOverrides": { "torso": "Spine2" },   // optional explicit bone names
//     "heightScale": 1.0,             // fine-tune vs the mech's gameplay height
//     "yawOffset": 0,                 // degrees, if the model faces the wrong way
//     "emissiveBoost": 1.5,           // multiply emissive intensity on materials
//     "stretch": { "elbowL": 1.2 },   // lengthen a limb segment: multiplies the
//                                     // mapped bone's local offset from its
//                                     // parent (the skin follows) — fix models
//                                     // whose proportions undershoot the mech
//     "seamCuts": [                   // separate parts the mesher wrongly WELDED
//       {"a":["handL"],"b":["torso"],"cap":true}   // — see seamcut.js
//     ],
//     "dropBones": ["stackL"],        // DELETE the geometry these bones own and
//                                     // cap the hole — for a lump the engine
//                                     // does better (inferno's sculpted flame
//                                     // tongues, now particles) — see dropgeo.js
//     "dropGeo": [{"verts":[1,2,3]}]  // the same cut, selected by VERTEX, for a
//                                     // lump that shares its bone with armour
//                                     // you keep (tempest's spark squiggles);
//                                     // author with tools/geodrop.mjs
//   }, ...
// }
// Any mech missing from the manifest (or failing to load) falls back to the
// procedural model — the game always works.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { dequantizeScene } from './dequantize.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { buildMech, buildRig, computeDims, addAnchor } from './factory.js';
import { Animator, LIMP_ROOTS } from './animator.js';
import { RigAdapter, mapBones, JOINT_ORDER } from './rigadapter.js';
import { GLB_DRESS } from './designs.js';
import { profileFor as glbProfileFor } from './glbanim.js';
import { applySkinOpsToGltf, applySkinOps } from './skinops.js';
import { applySeamCuts } from './seamcut.js';
import { applyBoneDrop, applyGeoDrop } from './dropgeo.js';
import { rigFor } from './rigs/index.js';
import { applyCustomRig, buildRigPosts } from './reskin.js';
import { buildFistSplit } from './fistsplit.js';
import { recolorMaterial } from './recolorglb.js';
import { clamp } from '../core/utils.js';
import { warnContract } from './contract.js';

let manifest = null;
let manifestPromise = null;

// Every key buildGlbMech (or the tool path) actually reads from a manifest
// entry. `alt` is a complete standalone sub-entry (see buildGlbForTool).
const KNOWN_ENTRY_KEYS = new Set([
  'url', 'bindPose', 'boneOverrides', 'heightScale', 'yawOffset',
  'emissiveBoost', 'stretch', 'bonePos', 'boneCorrections', 'noHeadMatch',
  'skinOps', 'seamCuts', 'dropBones', 'dropGeo', 'limpChains', 'tailFloor', 'reparent', 'muzzles', 'profileKey', 'alt', 'rig', 'modelScale',
]);
const _entryWarned = new Set(); // "<id>|<msg>" — each complaint fires once per entry
// Fields of a manifest entry that decide where the bones end up, and
// therefore what anything measured off this build is true of. See mech.glbKey.
const SKELETON_KEYS = ['url', 'rig', 'boneOverrides', 'stretch', 'bonePos',
  'boneCorrections', 'reparent', 'skinOps', 'seamCuts', 'dropBones', 'dropGeo', 'modelScale', 'heightScale', 'noHeadMatch'];
function glbBuildKey(entry) {
  return SKELETON_KEYS.map((k) => (entry?.[k] === undefined ? '' : JSON.stringify(entry[k]))).join('|');
}

// One line per model whose shell was cut, so a silent no-op rule is visible in
// the console rather than only in the geometry.
function reportSeamCuts(id, report) {
  if (!report) return;
  const what = report.rules
    .map((r) => `${r.bridgeTris} tri, +${r.duplicated} vert, ${r.capTris} lid tri, ${r.unblended} unblended`)
    .join(' · ');
  console.info(`seamCuts[${id}]: ${what}`);
}

// Same, for `dropBones`/`dropGeo` (dropgeo.js): a rule that matched nothing — a
// renamed bone, geometry already rebound away, a vertex list authored against
// another export — must not pass for a silent success.
function reportDrop(id, key, report) {
  if (!report) return;
  console.info(`${key}[${id}]: ${report.what.join('+')} — ${report.tris} tri, `
    + `${report.verts} vert removed, ${report.caps} lid`);
}

// Seam cuts, for the BAKE path. Same call the game makes, then the bulky
// session-only bookkeeping is dropped: only `rwSeam` (plain arrays saying which
// vertices sit on which side of which cut) is left on the mesh, because that is
// what the exporter can write into the glb as extras — and what lets the skin
// audit still tell a deliberate split from a crack once the cut IS the asset.
function bakeSeamCuts(sk, entry) {
  if (!entry.seamCuts?.length) return null;
  const report = applySeamCuts(sk, entry.seamCuts);
  if (!report) return null;
  sk.geometry.userData = { rwSeam: report.seams || [] };
  return report;
}

function warnEntryOnce(id, msg) {
  const key = id + '|' + msg;
  if (_entryWarned.has(key)) return;
  _entryWarned.add(key);
  console.warn(`manifest[${id}]: ${msg}`);
}
const gltfCache = new Map(); // url -> Promise<GLTF>
const loader = new GLTFLoader();
// EXT_meshopt_compression support. The distribution build (tools/dist.mjs)
// compresses every model; the models in the repo are uncompressed and load
// through the same path untouched, so this is registered unconditionally —
// one decoder that reads both. It is a bundled module, not a fetched wasm
// blob, so it costs a chunk rather than a round trip.
loader.setMeshoptDecoder(MeshoptDecoder);
// Per-ENTRY cache of everything buildGlbMech MEASURES off the geometry (the
// scale/ground fit, the head match, the foot calibration). See the note at the
// `fit` lookup in buildGlbMech — it is what keeps SAURION's raptor pack from
// costing three ~50ms frames. WeakMap on the entry object, so a manifest reload
// (which parses fresh entries) starts clean.
const fitCache = new WeakMap();
const _gcTmp = new THREE.Vector3();   // groundClamp scratch
const _gcTmp2 = new THREE.Vector3();
const PRONE_SINK = 0.08;              // see groundClamp / bodyH

// The GLB models are the DEFAULT: any mech with a manifest url renders from
// its service model, and only `?debug=fallback` forces the whole roster back
// to the procedural bodies (the hand-sculpted route-B mechs, still the
// fallback for any mech missing from the manifest or whose GLB fails to
// load). `?debug=3d` still means GLB — it stays valid so the older tool URLs
// and docs keep working, it just isn't needed any more.
// When GLBs are on, menus/previews show a spinner instead of the procedural
// stand-in while a GLB downloads, then swap the GLB in.
export const FALLBACK_PARAM = 'fallback';
export function is3dMode() {
  return new URLSearchParams(location.search).get('debug') !== FALLBACK_PARAM;
}

// Sync check — only meaningful once loadManifest() has resolved (which the
// boot flow awaits before building any screen). Under ?debug=fallback the
// manifest is forced empty, so this is always false and callers show
// procedural.
export function manifestHasGlb(id) {
  return !!(manifest && manifest[id]?.url);
}

// WHERE THE ASSETS LIVE. Model urls in the manifest ("models/mech_x.glb") are
// relative, and until the workbenches moved to their own page that was always
// relative to the game's index.html. /workbench/ is one directory deeper, so a
// page there must say so once, at boot, or every url resolves under
// /workbench/ and quietly 404s into "no GLB for this mech".
let assetBase = document.baseURI;
export function setAssetBase(href) { assetBase = new URL(href, document.baseURI).href; }
export function assetUrl(rel) { return new URL(rel, assetBase).href; }

// One fetch+parse of public/models/manifest.json, shared by every manifest
// reader. Missing/broken file resolves {} so the game always works. NOT
// cached: loadManifest keeps its own promise cache, and the tool/raw readers
// deliberately re-read the on-disk file each call.
function fetchManifestJson() {
  return fetch(assetUrl('models/manifest.json'))
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
}

export function loadManifest() {
  if (!manifestPromise) {
    // GLB overrides are ON by default; ?debug=fallback is the one value that
    // forces the procedural roster (see is3dMode).
    if (!is3dMode()) {
      manifestPromise = Promise.resolve({}).then((m) => { manifest = m; return m; });
      return manifestPromise;
    }
    manifestPromise = fetchManifestJson().then((m) => { manifest = m; return m; });
  }
  return manifestPromise;
}

function loadGLTF(url) {
  if (!gltfCache.has(url)) {
    gltfCache.set(url, new Promise((resolve, reject) => {
      loader.load(assetUrl(url), resolve, undefined, reject);
    }).then((gltf) => {
      // Fold KHR_mesh_quantization back into the vertices before ANYTHING
      // else sees the scene — rig rebuilds, skinOps, hurtbox measurement and
      // anchor placement all read geometry directly and would otherwise be
      // wrong by the quantization matrix. Runs once per URL (this cache is
      // the single load point) and is a no-op on unquantized models.
      dequantizeScene(gltf.scene);
      return gltf;
    }));
  }
  return gltfCache.get(url);
}

// Force-build a GLB mech straight from the on-disk manifest, bypassing the
// ?debug=3d gate. Used by the ?debug=models and ?debug=pose workbenches.
// `entryOverride` lets
// the caller preview edited manifest fields (bindPose/boneCorrections/...)
// without touching the committed file. Pass {alt:true} in opts to build the
// mech's ALTERNATE model: manifest[id].alt is a complete standalone entry
// (own url/boneOverrides/yaw/size intake — deliberately NOT merged with the
// primary entry, whose tuning belongs to different geometry). The game itself
// never reads .alt; a promotion = copying it over the primary entry.
export async function buildGlbForTool(def, entryOverride, opts = {}) {
  const m = await fetchManifestJson();
  const baseEntry = opts.alt ? m[def.id]?.alt : m[def.id];
  const entry = { ...(baseEntry || {}), ...(entryOverride || {}) };
  if (!entry.url) return { mech: buildMech(def), entry: null };
  const gltf = await loadGLTF(entry.url);
  return { mech: buildGlbMech(def, entry, gltf), entry };
}

// Read the raw manifest file (tool/debug use; not the ?debug=3d gate).
export async function fetchRawManifest() {
  return fetchManifestJson();
}

// Drop every parsed GLB, so the next build re-reads the file and re-applies the
// manifest from scratch. For the workbenches' "load from manifest" button: the
// manifest json is re-read on every buildGlbForTool, but skinOps are baked into
// the SHARED cached geometry exactly once (applySkinOpsToGltf's idempotence
// guard), so a rebuild alone would keep showing the skinning that was current
// when the page loaded. The game never calls this — nothing in a match edits
// the manifest underneath itself.
export function clearGlbCache() {
  gltfCache.clear();
}

// Load a mech's RAW gltf scene at bind pose — no rig, no retarget, no
// skinOps — with PRIVATE geometry so callers may mutate skin weights freely
// (SkeletonUtils.clone shares geometry; the game cache must stay pristine).
// For the ?debug=skin workbench and the skin audit.
export async function loadRawGlbScene(id, opts = {}) {
  const m = await fetchRawManifest();
  const entry = opts.alt ? m[id]?.alt : m[id];
  if (!entry?.url) return null;
  const gltf = await loadGLTF(entry.url);
  const scene = cloneSkinned(gltf.scene);
  scene.traverse((o) => {
    if (o.isSkinnedMesh) {
      o.geometry = o.geometry.clone();
      // clone() hands over the SAME userData object — take a private copy
      // before clearing the flag, or the cached geometry loses it too and the
      // next game build re-applies skinOps on top of itself.
      o.geometry.userData = { ...o.geometry.userData };
      delete o.geometry.userData.__skinOpsApplied;
    }
  });
  // custom-rig entries: re-skin to the OFFICIAL hand-authored skeleton so the
  // workbench colors/edits/wiggles the same skinning the game actually uses
  // (game-joint bones), not the raw Tripo weights that are never rendered.
  // skinOps the tool exports then layer on top exactly as buildGlbMech applies
  // them. Comp ids stay in sync because both sides analyze this identical rig.
  const customRig = entry.rig ? rigFor(entry.rig) : null;
  if (customRig) {
    let sk = null;
    scene.traverse((o) => { if (o.isSkinnedMesh && !sk) sk = o; });
    if (sk) applyCustomRig(sk, customRig);
  }
  // `{drops: true}` — also take off the surplus lumps the manifest names
  // (dropGeo/dropBones), so a tool that only LOOKS at the model shows what the
  // game builds instead of a stray blob floating beside it. Opt-in, and NOT
  // for a tool that applies skinOps itself: the game drops them AFTER the ops,
  // and a `{comp:N}` ordinal is drawn on the undropped mesh (see
  // applyEntryDrops).
  if (opts.drops) {
    let sk = null;
    scene.traverse((o) => { if (o.isSkinnedMesh && !sk) sk = o; });
    if (sk) applyEntryDrops(sk, entry);
  }
  return { scene, entry };
}

// The manifest's geometry drops, in the game's own order, on a mesh a tool
// already owns. The skin workbench calls it AFTER its ops+analysis pass, which
// is the same order buildGlbMech uses and the only order that leaves island
// ordinals meaning what their author meant. Returns what came off.
export function applyEntryDrops(mesh, entry) {
  return {
    geo: applyGeoDrop(mesh, entry?.dropGeo),
    bones: applyBoneDrop(mesh, entry?.dropBones),
  };
}

// ---- shared geometry-edit helpers (load path AND bake path) ---------------
// Factored so buildGlbMech and bakeMechScene apply identical edits — the bake
// can never drift from what the game renders.

// manifest `reparent`: {"childBone": "newParentBone"}. attach() preserves the
// child's world transform, so the bind-pose skin stays valid (boneInverses
// unchanged); the child just starts following its new parent.
function applyReparent(model, reparent) {
  if (!reparent) return;
  model.updateMatrixWorld(true);
  const byName = new Map();
  model.traverse((o) => { if (o.isBone) byName.set(o.name, o); });
  for (const [childName, parentName] of Object.entries(reparent)) {
    const c = byName.get(childName), p = byName.get(parentName);
    if (c && p) p.attach(c);
    else console.warn('reparent: unknown bone', childName, '->', parentName);
  }
}

// bind-skeleton nudges from the ?debug=pose workbench: `stretch` lengthens a bone's
// offset from its parent; `bonePos` translates a bone's rest position. Both act
// on the mapped bones (in bone-local units) before offset capture / export.
function applyBoneNudges(boneMap, entry) {
  if (entry.stretch) {
    for (const [jname, k] of Object.entries(entry.stretch)) boneMap[jname]?.position.multiplyScalar(k);
  }
  if (entry.bonePos) {
    for (const [jname, d] of Object.entries(entry.bonePos)) {
      const b = boneMap[jname];
      if (b) b.position.set(b.position.x + d[0], b.position.y + d[1], b.position.z + d[2]);
    }
  }
}

// Finalization baker: produce the fully-EDITED scene subtree (mesh + skeleton +
// skin) at BIND POSE, ready to hand to GLTFExporter.
//
// WHAT IT FOLDS IN, and the rule for what belongs here: anything that is a
// PROPERTY OF THE MODEL — its geometry, its skeleton, its weights, which way it
// faces and how big it is — is baked, because the file is the natural place for
// it and a correction layer that describes it is a second copy to keep in step.
// So: reparent, custom rig, skinOps, rig posts, dropGeo, seamCuts, dropBones,
// stretch, bonePos, bone NAMES (below) and the model TRANSFORM (below).
//
// WHAT STAYS BEHIND is what is a property of the GAME rather than of the model:
// the virtual rig and its retarget, the gait, the anchors combat spawns from,
// and `boneCorrections` — which cannot be baked even in principle, because
// applyCustomRig's rebindRest and RigAdapter's rest-offset capture
// (offset = jointWorld⁻¹ · boneWorld) cancel a bind-pose rotation exactly, and
// viper's is the RAMPING form anyway: a function of how far the joint has swung.
//
// Returns { model, entry, boneMap, customRig, renames, transform } or null.
// tools/bake-glb.mjs + src/dev/bake.js drive this. Uses the tool-path reader
// (bypasses the 3d gate).
export async function bakeMechScene(id, opts = {}) {
  const m = await fetchRawManifest();
  const entry = m[id];
  if (!entry?.url) return null;
  const gltf = await loadGLTF(entry.url);
  const model = cloneSkinned(gltf.scene);
  // private geometry so the edits never touch the shared gltf cache
  model.traverse((o) => {
    if (o.isSkinnedMesh) { o.geometry = o.geometry.clone(); delete o.geometry.userData.__skinOpsApplied; }
  });

  applyReparent(model, entry.reparent);

  const bones = [], meshes = [];
  model.traverse((o) => { if (o.isBone) bones.push(o); if (o.isMesh || o.isSkinnedMesh) meshes.push(o); });

  // rig + skin — mirrors buildGlbMech's resolution: a custom rig re-skins to
  // game-joint bones (+ optional skinOps + rig-post rods baked AS geometry),
  // else stock mapBones + skinOps on the auto-rig skeleton.
  const customRig = entry.rig ? rigFor(entry.rig) : null;
  let boneMap;
  if (customRig) {
    const sk = meshes.find((mm) => mm.isSkinnedMesh);
    boneMap = {};
    if (sk) {
      const { byName } = applyCustomRig(sk, customRig);
      for (const j of JOINT_ORDER) if (byName[j]) boneMap[j] = byName[j];
      buildRigPosts(byName, customRig);
      if (entry.skinOps?.length) applySkinOps(sk, entry.skinOps);
      // The drops and the cut, in the GAME'S OWN ORDER (see buildGlbMech):
      // dropGeo names RAW VERTEX INDICES, which a seam cut invalidates by
      // appending duplicates, so it goes first; dropBones names bones, is
      // immune to renumbering, and goes last so a rim it opens is capped by
      // its own fan rather than by the cut's.
      applyGeoDrop(sk, entry.dropGeo);
      bakeSeamCuts(sk, entry);
      applyBoneDrop(sk, entry.dropBones);
      // prune the now-orphaned original auto-rig skeleton so the baked GLB
      // carries ONLY the custom bones (no dead Tripo bones). Safe: the mesh was
      // rebound to the new skeleton, and the originals sit in a separate subtree
      // (verified never the mesh's transform ancestors — guarded below anyway).
      const keep = new Set(sk.skeleton.bones);
      const ancestors = new Set(); for (let a = sk; a; a = a.parent) ancestors.add(a);
      const dead = [];
      model.traverse((o) => { if (o.isBone && !keep.has(o) && !ancestors.has(o)) dead.push(o); });
      for (const d of dead) d.removeFromParent();
    }
  } else {
    boneMap = mapBones(bones, entry.boneOverrides || {});
    if (entry.skinOps?.length) {
      for (const mm of meshes) if (mm.isSkinnedMesh) applySkinOps(mm, entry.skinOps);
    }
    for (const mm of meshes) if (mm.isSkinnedMesh) {
      applyGeoDrop(mm, entry.dropGeo);       // same order as the branch above
      bakeSeamCuts(mm, entry);
      applyBoneDrop(mm, entry.dropBones);
    }
  }

  applyBoneNudges(boneMap, entry);
  normalizeSkinnedNodes(model);
  const renames = renameBonesToJoints(boneMap, customRig);
  // THE TRANSFORM IS FOR THE EXPORT, NOT FOR THE GAME — see bakeModelTransform.
  const transform = opts.transform ? bakeModelTransform(model, entry) : null;
  return { model, entry, boneMap, customRig: !!customRig, renames, transform };
}

// ---- the skinned mesh's own node --------------------------------------------
// A SKINNED MESH NODE'S TRANSFORM IS IGNORED BY THE glTF SPEC — a skin is
// defined entirely by its joints and their inverse binds — so a non-identity
// one is a transform that some readers apply and others drop. It survives in
// the game only because nothing round-trips through a file: `applyCustomRig`
// folds `mesh.matrix` into the bone root it installs ("Tripo SkinnedMeshes
// usually sit at identity, but don't assume"), and the bind matrix carries it
// too, so the two agree in memory and disagree the moment they are written out
// and read back.
//
// JERRY IS THE ONE THAT HAS IT: his mesh node sits 4.42 up, and baked he
// rendered 4.42 higher than his own skeleton — the rig posts under his thighs
// stayed exactly put while the body floated off them, 45% of extra height with
// all 15 joints still perfect to 0.0001.
//
// Fold it into the geometry and leave the node at identity, so there is nothing
// left to disagree about.
function normalizeSkinnedNodes(model) {
  const I = new THREE.Matrix4();
  const done = new Set();
  const changed = [];
  const skins = [];
  model.updateMatrixWorld(true);
  model.traverse((o) => { if (o.isSkinnedMesh) skins.push(o); });
  for (const o of skins) {
    const bind = o.bindMatrix.clone();
    if (bind.equals(I) && o.matrix.equals(I)) continue;
    // The geometry moves into the SKIN's space — which is what glTF stores —
    // rather than staying in the node's. `bindMatrix` is exactly that mapping,
    // and it is the piece with nowhere to live in a file.
    if (!done.has(o.geometry)) { done.add(o.geometry); o.geometry.applyMatrix4(bind); }
    // ...and the node itself goes to the model root with no transform of its
    // own, so there is nothing left for a reader to apply or ignore.
    model.add(o);
    o.position.set(0, 0, 0);
    o.quaternion.identity();
    o.scale.set(1, 1, 1);
    o.updateMatrix();
    o.bind(o.skeleton, new THREE.Matrix4());
    changed.push(o.name || 'mesh');
  }
  if (!changed.length) return null;
  model.updateMatrixWorld(true);
  return changed;
}

// ---- bone NAMES ------------------------------------------------------------
// A custom rig's bones already ARE the game joints, name and all. An auto-rig's
// are opaque (`bone_28`, `tripo0_Left_Limb_1`) and the manifest's
// `boneOverrides` is the map that says which is which — a correction layer whose
// whole content is "this bone is really the left shoulder". Baking it means
// renaming the bone, after which every baked mech carries one skeleton naming
// convention and `mapBones` finds all 15 by name alone.
//
// It returns the map it applied, because a bone NAME is referenced from outside
// the skeleton: `muzzles[*].bone` is the one that matters (the house rule that
// re-rigging never loses an anchor), plus `reparent`, `dropBones` and
// `limpChains`. tools/bake-glb.mjs rewrites those through this map.
//
// A joint whose target name is already taken by a DIFFERENT bone is left alone
// and reported: renaming it would make two bones answer to one name, and
// mapBones would then pick by traversal order rather than by the mapping.
function renameBonesToJoints(boneMap, customRig) {
  if (customRig) return {};                       // already named as joints
  const taken = new Map();                        // name -> bone
  for (const [j, b] of Object.entries(boneMap)) if (b) taken.set(b.name, b);
  const renames = {}, skipped = [];
  for (const jname of JOINT_ORDER) {
    const bone = boneMap[jname];
    if (!bone || bone.name === jname) continue;
    const clash = taken.get(jname);
    if (clash && clash !== bone) { skipped.push(jname); continue; }
    renames[bone.name] = jname;
    taken.delete(bone.name);
    taken.set(jname, bone);
    bone.name = jname;
  }
  if (skipped.length) console.warn('bake: bone name already in use, left as-is:', skipped.join(', '));
  return renames;
}

// ---- orientation and size --------------------------------------------------
// `yawOffset` and `modelScale` x `heightScale` describe the MODEL — which way it
// faces and how big it is — so they belong in the file rather than in a table
// the loader has to consult.
//
// IT IS FOR THE EXPORT ONLY (`opts.transform`), and that is a finding rather
// than a preference. The GAME derives live quantities from the model's runtime
// `scale` — RigAdapter's `hipsScale` converts the virtual rig's hip travel into
// bone-local units, calibrateFeet measures a boot depth against it, sizeMul
// re-times the gait — so moving the size out of `modelScale` and into the file
// leaves those reading 1 where they used to read 5.77. Measured on saurion: the
// joints stayed correct to 0.0002 and his head and neck collapsed into his
// shoulders (tools/scratch/bakeshot.mjs — the picture is what said so; every
// number except the hips' own world position looked fine). Nothing downstream
// of an EXPORT has that runtime, so there the fold is unambiguous and it is
// exactly what another engine needs; in the game the three numbers cost nothing
// and stay the artist's knobs.
//
// IT IS BAKED INTO THE DATA, NOT ONTO A NODE, and that is the other lesson.
// A wrapper node is the obvious way to write a transform and it does not
// survive: a glTF SCENE carries no transform of its own, and per the spec a
// SKINNED MESH node's transform must be ignored, so the scale ends up applied
// by some readers and not others — measured on saurion, 5.77 asked for and
// 5.77² rendered, while the joint check happily reported 0.0001 because every
// joint was in the right place RELATIVE TO THE HIPS. Re-capturing the inverse
// binds did not fix it either. So the transform goes into the vertices, the
// bone rest offsets and the inverse binds, leaving a file with NO wrapper node
// and every bone scale at 1 — native units are game units, which is also
// exactly what another engine wants to import.
//
// The mesh is NOT re-grounded here: buildGlbMech's rescaleAndReground centres
// and grounds on the rendered box every build and is absolute rather than
// cumulative, so it lands on the same place whether or not the file arrives
// pre-grounded — and doing it here as well would bake a second, staler answer.
function bakeModelTransform(model, entry) {
  const yaw = entry.yawOffset ? entry.yawOffset * Math.PI / 180 : 0;
  const S = (typeof entry.modelScale === 'number' && entry.modelScale > 0 ? entry.modelScale : 1)
    * (entry.heightScale ?? 1);
  if (!yaw && Math.abs(S - 1) < 1e-9) return null;
  const R = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const M = new THREE.Matrix4().compose(new THREE.Vector3(), R, new THREE.Vector3(S, S, S));
  const underBone = (o) => { for (let p = o.parent; p; p = p.parent) if (p.isBone) return true; return false; };

  // 1) the geometry the SKIN deforms, in the mesh's own space. Shared geometry
  //    is transformed once (`seen`) or a second user would double it.
  const seen = new Set();
  model.traverse((o) => {
    if (!o.geometry || underBone(o) || seen.has(o.geometry)) return;
    seen.add(o.geometry);
    o.geometry.applyMatrix4(M);          // positions, normals and tangents
  });

  // 2) the skeleton. Every bone's rest OFFSET from its parent scales; only the
  //    ROOT bones take the rotation, because a child's offset is already
  //    expressed in its rotated parent's frame. The result is the whole
  //    skeleton through M with every bone scale left at 1, which is the shape
  //    an importer wants — a scale on a root bone would propagate to children
  //    that have already been scaled here.
  const bones = [];
  model.traverse((o) => { if (o.isBone) bones.push(o); });
  for (const b of bones) {
    b.position.multiplyScalar(S);
    if (!b.parent?.isBone) { b.position.applyQuaternion(R); b.quaternion.premultiply(R); }
  }

  // 3) geometry HANGING OFF a bone (custom-rig posts — jerry's back legs) rides
  //    its bone through step 2, so it needs the scale only, on the node.
  model.traverse((o) => {
    if (o.isBone || !underBone(o)) return;
    o.position.multiplyScalar(S);
    o.scale.multiplyScalar(S);
  });

  model.updateMatrixWorld(true);
  // 4) the inverse binds are BY DEFINITION the inverse of each bone's world
  //    matrix at bind pose, and both sides of that have just moved.
  model.traverse((o) => {
    if (!o.isSkinnedMesh || !o.skeleton) return;
    o.skeleton.calculateInverses();
    o.bind(o.skeleton, o.matrixWorld);
  });
  return { yawOffset: entry.yawOffset ?? 0, scale: S };
}

// Preload the models for a set of mech ids (call during select/loading).
export async function preloadMechModels(ids) {
  const m = await loadManifest();
  await Promise.allSettled(ids.filter((id) => m[id]?.url).map((id) => loadGLTF(m[id].url)));
}

/**
 * Build a mech: GLB-backed when the manifest has an entry, procedural
 * otherwise. Async — callers awaiting battle start use this; menus keep
 * using the sync procedural buildMech for instant previews.
 */
export async function createMech(def) {
  const m = await loadManifest();
  const entry = m[def.id];
  if (!entry?.url) return buildMech(def);
  try {
    const gltf = await loadGLTF(entry.url);
    return buildGlbMech(def, entry, gltf);
  } catch (e) {
    console.warn(`GLB for ${def.id} failed (${e.message}); using procedural model`);
    return buildMech(def);
  }
}

function buildGlbMech(def, entry, gltf) {
  const D = computeDims(def);
  const { root, joints } = buildRig(D); // invisible virtual skeleton (no geometry)

  // light manifest hygiene: flag typo'd/stale entry keys (once per entry)
  for (const k of Object.keys(entry)) {
    if (!KNOWN_ENTRY_KEYS.has(k)) warnEntryOnce(def.id, `unknown key "${k}"`);
  }

  // clone the scene so several fighters can use the same mech
  const model = cloneSkinned(gltf.scene);

  // manifest `reparent`: {"childBone": "newParentBone"} — fix auto-rig
  // hierarchy mistakes (fenrir's front paws hang off tripoRoot instead of the
  // forearm chains). attach() preserves the world transform, so the bind-pose
  // skin is untouched (boneInverses stay valid); the child simply starts
  // FOLLOWING its new parent. Applied per-clone, before the RigAdapter reads
  // the hierarchy. Only touches the CLONE's hierarchy — skinOps below runs on
  // the CACHED scene, so purgeFar keeps its committed hierarchy-distance
  // semantics regardless of order.
  applyReparent(model, entry.reparent);

  // collect skeleton bones + meshes
  const bones = [];
  const meshes = [];
  model.traverse((o) => {
    if (o.isBone) bones.push(o);
    if (o.isMesh || o.isSkinnedMesh) meshes.push(o);
  });

  // CUSTOM RIG (src/mechs/rigs/<name>.rig.js): when an auto-rig is too scrambled
  // to fix by remapping (a crab with both claws welded to one leg bone), a
  // hand-placed skeleton — authored in ?rigedit — REPLACES it. The mesh is
  // re-skinned to bones that ARE the game joints, so the retarget drives real,
  // correctly-located limbs. Supersedes boneOverrides + skinOps for that entry.
  // Keyed on the ENTRY's `rig` field (not the mech id) so a model VARIANT (an
  // `alt`) can carry a custom rig while the primary keeps its stock rig — the
  // ?debug=models "Compare Alternate GLB" toggle then shows old vs new rig.
  const customRig = entry.rig ? rigFor(entry.rig) : null;
  let boneMap;
  let rigBones = null;   // custom-rig bones by name (see mech.rigBones below)
  if (customRig) {
    const sk = meshes.find((m) => m.isSkinnedMesh);
    boneMap = {};
    if (sk) {
      const { byName } = applyCustomRig(sk, customRig);
      for (const j of JOINT_ORDER) if (byName[j]) boneMap[j] = byName[j];
      rigBones = byName;
      buildRigPosts(byName, customRig); // black rods through `post` bones (jerry's back legs)
      // skinOps refine the CUSTOM rig's proximity skinning too: the ?debug=skin
      // workbench shows this exact custom-rig skinning (see loadRawGlbScene), so
      // a rebind it exports lands here. applyCustomRig clones the geometry per
      // build, so this is a per-clone application — no shared-scene guard needed.
      if (entry.skinOps?.length) applySkinOps(sk, entry.skinOps);
      // ...then take off the lumps named by VERTEX (dropgeo.js — tempest's
      // sculpted spark squiggles). Before the seam cuts, which append duplicate
      // vertices: a list authored against the raw file cannot name those.
      reportDrop(def.id, 'dropGeo', applyGeoDrop(sk, entry.dropGeo));
      // ...and THEN cut the parts the mesher wrongly welded into one surface
      // (seamcut.js). After skinOps on purpose: it reads the final weights, so
      // "hand" and "torso" mean whatever the hand-authored rebinds made them.
      reportSeamCuts(def.id, applySeamCuts(sk, entry.seamCuts));
      // ...and LAST, take off the geometry a bone was only standing in for
      // (dropgeo.js — inferno's sculpted flame tongues, now particles). After
      // the cuts so a rim it opens is capped by its own fan, not by theirs.
      reportDrop(def.id, 'dropBones', applyBoneDrop(sk, entry.dropBones));
    }
  } else {
    // Map GLB bones onto the virtual rig's joints EARLY (mapBones is pure
    // name-matching) and bail to the procedural model before paying for
    // skinOps/scaling/dressing/Animator.
    boneMap = mapBones(bones, entry.boneOverrides || {});
  }
  const mapped = Object.keys(boneMap).length;
  if (mapped < 10) {
    console.warn(`GLB for ${def.id}: only ${mapped} bones mapped — falling back to procedural`);
    return buildMech(def);
  }
  // manifest hygiene: entries naming bones/joints that don't resolve. (mapBones
  // silently ignores an override whose bone name doesn't exist; stretch/bonePos
  // skip unmapped joints — surface those, once.) Skipped under a custom rig,
  // which ignores those manifest fields.
  if (!customRig) {
    for (const [joint, boneName] of Object.entries(entry.boneOverrides || {})) {
      if (!bones.some((b) => b.name === boneName)) {
        warnEntryOnce(def.id, `boneOverrides.${joint}: no bone named "${boneName}"`);
      }
    }
    for (const key of ['stretch', 'bonePos']) {
      for (const jname of Object.keys(entry[key] || {})) {
        if (!boneMap[jname]) warnEntryOnce(def.id, `${key}.${jname}: joint not mapped to a bone`);
      }
    }
    // manifest `skinOps`: rebind auto-rig weight mistakes to the right bone —
    // see skinops.js. Applied to the CACHED scene once (idempotent guard on the
    // geometry); clones share it, so applying after cloneSkinned still fixes
    // this clone. (A custom rig takes its own skinOps in the branch above.)
    applySkinOpsToGltf(gltf.scene, entry.skinOps);
    // and the seam cuts on top of them, same order and same reason as the
    // custom-rig branch above
    if (entry.seamCuts?.length || entry.dropBones?.length || entry.dropGeo?.length) {
      const sk = meshes.find((m) => m.isSkinnedMesh);
      if (sk) {
        reportDrop(def.id, 'dropGeo', applyGeoDrop(sk, entry.dropGeo));
        reportSeamCuts(def.id, applySeamCuts(sk, entry.seamCuts));
        reportDrop(def.id, 'dropBones', applyBoneDrop(sk, entry.dropBones));
      }
    }
  }

  // Alternate paint scheme (colorscheme.js): repaint the baked GLB textures so
  // a "blue Inferno" is actually blue. variant 0 / no recolor => untouched.
  const recolor = def.recolor && def.recolor.variant ? def.recolor : null;
  // Own each material once per build (dedup by source uuid) before mutating it:
  // clones share the cached gltf's materials/textures, so recolor / emissive
  // boost must never write through to them.
  const _owned = new Map(); // srcMat.uuid -> cloned material
  const ownMat = (o) => {
    const src = o.material;
    if (!src) return null;
    let c = _owned.get(src.uuid);
    if (!c) { c = src.clone(); _owned.set(src.uuid, c); }
    o.material = c;
    return c;
  };
  // Own EVERY material, not just the ones a recolor/boost is about to edit.
  // The whole-body tints (Fighter.applyWhiteout for the cryo freeze,
  // applyCharring for the flame finisher, applyGlitchTint for corruption, the
  // poison wound flush) all drive `mech.materials`, which the GLB route used to
  // leave empty — so on a GLB body they silently did nothing, and any that DID
  // reach a shared cached material would have tinted every other fighter using
  // the same model at the same time. One clone set per build fixes both: the
  // tints work on GLB bodies and stay local to one fighter. Textures are shared
  // by reference, so a clone set is cheap.
  const glbMats = {};
  let matN = 0;
  for (const o of meshes) {
    o.castShadow = true;
    o.frustumCulled = false; // skinned bounds are unreliable mid-animation
    const mat = ownMat(o);
    if (!mat) continue;
    if (recolor && !mat.userData.__recolored) {
      recolorMaterial(mat, recolor);
      mat.userData.__recolored = true;
    }
    if (entry.emissiveBoost && mat.emissive && !mat.userData.__eBoosted) {
      mat.emissiveIntensity = (mat.emissiveIntensity || 1) * entry.emissiveBoost;
      mat.userData.__eBoosted = true;
    }
    // register once per distinct material (ownMat dedups by source uuid)
    if (!mat.userData.__slot) {
      mat.userData.__slot = 'glb' + matN++;
      glbMats[mat.userData.__slot] = mat;
    }
  }

  // ---- detachable fist (TITANUS' rocket punch) --------------------------
  // Runs HERE, after the material loop, on purpose: it turns the mesh's single
  // material into an ARRAY (one entry per cut piece) and the ownMat/recolor
  // paths above read `o.material` as a single material. See fistsplit.js for
  // how the cut is derived. Only mechs whose rig carries `fistL`/`fistR` tip
  // bones with a painted selection get a split; everyone else gets null and
  // keeps the old whole-joint behaviour.
  let fistSplit = null;   // handed to `mech` once that object exists, below
  if (rigBones?.fistR || rigBones?.fistL) {
    const sk = meshes.find((m) => m.isSkinnedMesh);
    if (sk) {
      try {
        fistSplit = buildFistSplit(sk);
      } catch (e) {
        warnEntryOnce(def.id, `fist split failed (${e.message}); rocket fist stays attached`);
      }
    }
  }

  // scale + ground the model to the mech's gameplay height.
  // NOTE: measure the SKINNED vertices, not Box3.setFromObject — skinned
  // verts follow bones and ignore the mesh node's own transform chain
  // (Tripo GLBs carry an Armature offset there), so a geometry-box ground
  // puts the rendered skin meters underground.
  const targetH = (D.hipHeight + D.torsoH + D.headSize * 2); // heightScale applied once, at the end
  // EVERY MEASUREMENT BELOW IS A PROPERTY OF THE FILE, not of this copy: the
  // same entry rebuilt gives the same box, the same head match and the same
  // foot depth, because the geometry, the skinOps and the rig are the same. A
  // battle only ever rebuilds one when SAURION calls his pack — three clones,
  // each paying ~50ms of vertex sweeps (skinnedBox walks 20k verts per rescale,
  // calibrateFeet the whole 138k-vertex skinIndex per foot), which lands as
  // three ~50ms hitches half a second apart. So the fit is measured ONCE per
  // entry and replayed. Keyed on the ENTRY OBJECT: a manifest reload parses
  // fresh objects, so the workbenches' re-read drops the cache by construction
  // and never shows stale numbers for an edited model.
  const fit = fitCache.get(entry) || { steps: [], head: null, foot: null };
  fitCache.set(entry, fit);
  const box = fit.steps.length ? null : skinnedBox(model);
  const size = box ? box.getSize(new THREE.Vector3()) : null;
  // ---- FROZEN MODEL SCALE -------------------------------------------------
  // `modelScale` is the absolute scale applied to the GLB's native units, and
  // when it is set it is the ONLY thing that decides the model's size: both
  // head-height matching passes below are skipped. That is deliberate and it is
  // the rule for this pipeline — a GLB's rendered size must be a function of
  // the FILE plus this number, never of where the rig's bones sit or of which
  // bone owns which vertices. The head match was only ever a bootstrap for
  // sizing a brand-new GLB; leaving it live meant any re-rig silently resized
  // the character (re-rigging TITANUS moved his "head region" off the back
  // exhaust towers and onto his actual head, which grew him 5.7%). Pin the
  // scale once with tools/pin-modelscale.mjs and rig edits can never change
  // height again. `heightScale` still multiplies on top as the artist knob.
  const pinnedScale = typeof entry.modelScale === 'number' && entry.modelScale > 0
    ? entry.modelScale : null;
  let scale = 1;
  const container = new THREE.Group();
  container.add(model);
  // Multiply the running model scale by k, then ground/center on the box the
  // shader will actually render: assemble first, refresh matrices +
  // attached-mode bindMatrixInverse, re-measure, then correct the residual.
  // (Predicting this analytically breaks on rigs whose mesh-node chain
  // carries offsets — Tripo's Armature does.) Used for the initial height
  // fit and every later rescale (head matches, heightScale); callers that
  // exist after the RigAdapter is built must also refresh adapter.hipsScale.
  // Steps are replayed BY ORDINAL and only while the requested factor still
  // matches what was recorded — a build that asks for a different k (a mech
  // whose head match landed elsewhere) measures from that step on and re-records
  // the tail, so the cache can never answer a question it wasn't asked.
  let stepI = 0;
  const rescaleAndReground = (k) => {
    const step = fit.steps[stepI];
    if (step && Math.abs(step.k - k) < 1e-9) {
      scale = step.scale;
      model.scale.setScalar(scale);
      model.position.set(step.px, step.py, step.pz);
      container.updateMatrixWorld(true);
      stepI++;
      return;
    }
    fit.steps.length = stepI;
    scale *= k;
    model.scale.setScalar(scale);
    container.updateMatrixWorld(true);
    const rb = skinnedBox(container);
    const c = rb.getCenter(new THREE.Vector3());
    model.position.x -= c.x;
    model.position.y -= rb.min.y;
    model.position.z -= c.z;
    fit.steps[stepI++] = {
      k, scale, px: model.position.x, py: model.position.y, pz: model.position.z,
    };
  };
  rescaleAndReground(pinnedScale
    ?? (size ? (size.y > 0.01 ? targetH / size.y : 1) : fit.steps[0].k));
  if (entry.yawOffset) container.rotation.y = entry.yawOffset * Math.PI / 180;
  root.add(container);

  // `materials` carries this build's OWN material clones (see glbMats above) so
  // the whole-body tints reach a GLB body; GLB_DRESS may add named slots on top.
  const mech = { group: root, joints, anchors: {}, materials: glbMats, dims: D, def, isGLB: true };
  // Identity of THIS BUILD's skeleton+geometry, for caches keyed on "same
  // bones in the same places" (hurtbox.js measures its capsules once per
  // model and shares them across clones). The url alone is not enough: a
  // mech's primary and `alt` entries routinely point at the SAME file and
  // differ only in how it is rigged — inferno, rhino, titanus and vulcan all
  // do — so an alt would silently inherit the primary's measurements.
  mech.glbKey = glbBuildKey(entry);
  mech.fistSplit = fistSplit;   // Fighter.launchFist/catchFist + WEAPONS.fist
  // reinterpret shared anims for this model. entry.profileKey lets a model
  // VARIANT (e.g. an alt whose weapon sits in the other hand) carry its own
  // glbanim profile ('aegis_alt') instead of the mech's default one.
  mech.animProfile = glbProfileFor(entry.profileKey || def.id);

  // muzzleR / muzzleL (projectile-spawn anchors) are created below, AFTER the
  // boneMap is resolved — they may pin to a real GLB bone, not just a virtual
  // joint (see installMuzzles).
  mech.anchors.core = addAnchor(joints.torso, 0, D.torsoH * 0.5, D.torsoD * 0.4);
  mech.anchors.overhead = addAnchor(joints.root, 0, targetH + 1.2 * D.scale, 0);
  // BOOSTER NOZZLES: default under each sole, POSITION only — with no authored
  // `rot` the thrust runs down the body (fighter.boosterJets). A `muzzles`
  // entry named boostL/boostR re-points them onto any joint or bone (the loop
  // below re-parents an anchor that already exists) and, with a `rot`, aims
  // the exhaust — which is how a mech moves its thrust off its feet with no
  // line of code here.
  for (const side of ['L', 'R']) {
    mech.anchors['boost' + side] = addAnchor(joints['ankle' + side], 0, -0.34 * D.scale, 0);
  }
  const coreLight = new THREE.PointLight(def.colors.glow, 14, 11 * D.scale, 2);
  mech.anchors.core.add(coreLight);

  // per-mech dressing over the model (glow shards, signature lights)
  GLB_DRESS[def.id]?.(mech);

  // rest pose must be applied before offset capture -> create the Animator now
  mech.premadeAnimator = new Animator(mech);

  // head-height match: rescale the visual model so its head bone sits at the
  // same height as the procedural head joint. Keying the size on the HEAD
  // (rather than the raw bbox top) keeps GLB and procedural bodies the same
  // general size — a raised tail, weapon, or crystal spire no longer shrinks
  // the whole body to fit under the height cap. entry.heightScale still
  // scales this target for manual per-mech tuning.
  // Skipped entirely for a pinned `modelScale` — see FROZEN MODEL SCALE above.
  if (!pinnedScale && boneMap.head && !entry.noHeadMatch) {
    root.updateWorldMatrix(true, true);
    const targetHeadY = joints.head.getWorldPosition(new THREE.Vector3()).y;
    const glbHeadY = boneMap.head.getWorldPosition(new THREE.Vector3()).y; // feet grounded at 0
    if (glbHeadY > 0.05 && targetHeadY > 0.05) {
      rescaleAndReground(targetHeadY / glbHeadY);
    }
  }
  // limb stretch + per-bone rest-position nudge (?debug=pose), applied to the
  // bind skeleton before offset capture. Shared with bakeMechScene.
  applyBoneNudges(boneMap, entry);
  const adapter = new RigAdapter(joints, boneMap, {
    bindPose: entry.bindPose ?? 'tpose',
    hipsScale: 1 / (scale || 1),
    corrections: entry.boneCorrections, // from the ?debug=pose workbench
  });
  mech.postAnimate = () => { adapter.sync(); mech.postDress?.(); };
  mech.boneMap = boneMap;   // pose tool reaches bones by virtual-joint name
  // EVERY BONE BY NAME, including the ones that are NOT game joints (fenrir's
  // tail0..5, claws, paws, jerry's cannon-pod struts). adapter.sync() only
  // writes the 15 mapped joints, so these are free for a glbanim profile's post
  // hook to animate — that's how a GLB gets back a personality joint the
  // procedural design creates and the retarget has no route for.
  //
  // Filled in for a stock skeleton too, NOT just a custom rig. Baking a mech
  // (tools/bake-glb.mjs) folds its custom rig into the asset and there is no
  // rig object afterwards — but the BONES are still there under the same names,
  // and a profile that reaches for them must keep working. Leaving this null
  // for baked models is what silently stopped jerry's pods aiming his Bilge
  // Spit: the hook bails on `if (!bones) return`, and his shots went back to
  // flying out sideways with nothing in the fidelity check to catch it.
  mech.rigBones = rigBones || Object.fromEntries(bones.map((b) => [b.name, b]));
  // WHAT GOES LIMP when he goes down (animator.js limpTail) — and, by exactly
  // the same list, what the prone floor clamp must not stand him up on. A rig
  // declares it, a manifest entry can declare it for a mech that has no custom
  // rig, and `tail0` is the default every tailed body already answers to.
  mech.limpChains = entry.limpChains || customRig?.limpChains || LIMP_ROOTS;
  // A TAIL IS NOT A KICKSTAND (animator.js tailFloorGuard). Opt-in per rig,
  // because it costs a per-segment solve every frame and only a body whose
  // POSE can swing its tail under the pavement needs it — tritone rears.
  mech.tailFloor = entry.tailFloor ?? customRig?.tailFloor ?? false;
  mech.adapter = adapter;

  // Muzzle (projectile-spawn) anchors — the SINGLE source of every ranged /
  // cannon / special spawn origin for this GLB (combat reads ONLY
  // anchors.muzzleR / muzzleL, in world.js + specials.js). A GLB's guns sit at
  // model-specific spots the generic in-hand offset misses — Cranky's water
  // cannons ride the SHELL, not the claws; Saurion breathes from the SKULL;
  // Frogger's slime guns and Inferno's torches sit at forearm barrel tips — so
  // a per-mech `muzzles` manifest entry pins each side explicitly:
  //   "muzzles": { "R": { "joint": "torso", "offset": [x,y,z] }, "L": {...} }
  //   • "joint": a VIRTUAL rig joint — canonical frame (+Z fwd, +Y up), offset
  //     in mech-scale units. Best for body/hand-mounted guns on humanoid rigs.
  //   • "bone":  a mapped GLB bone (boneMap key, e.g. "head") — rides the real
  //     model geometry, for non-humanoid mounts a virtual joint can't reach
  //     (a raptor's skull sits nowhere near the biped head joint). Offset is in
  //     that bone's LOCAL frame, mech-scale units (model-scale compensated).
  // The anchor rides the animated joint/bone, so the spawn tracks the weapon
  // through the whole pose. No entry -> generic in-hand muzzle (unchanged for
  // mechs whose weapon really is at the hand).
  // Unit factors the offsets above are expressed in, captured at INSTALL time
  // (later rescales don't move an anchor's local position, so these stay the
  // exact inverse). ?debug=models' anchor editor divides by them to turn a
  // dragged local position back into manifest numbers that round-trip.
  mech.muzzleUnits = { joint: D.scale, bone: D.scale / (scale || 1) };
  // `existing` re-points an anchor that is ALREADY built (dress-created ones
  // like `core`, which carries the glow PointLight as a child) instead of
  // replacing it — a replacement would strand those children at the old spot.
  const installMuzzle = (side, existing) => {
    const spec = entry.muzzles?.[side];
    const o = spec?.offset || [0, -0.2, 0.4];
    let parent = null, k = D.scale;
    // "bone" resolves through the boneMap first (canonical joint keys), then
    // through a CUSTOM rig's extra bones (wraith's `rifleTip` — the gun is a
    // rigid body on the hand, so its muzzle is a bone, not an offset guess;
    // viper's `bladeLtip`/`bladeRtip` carry her blade-trail anchors), then as a
    // RAW bone name — for mounts on bones no combat joint maps to
    if (spec?.bone) {
      const b = boneMap[spec.bone] || rigBones?.[spec.bone] || bones.find((x) => x.name === spec.bone);
      // bone-local units are model-space (pre model.scale); divide so the
      // world offset matches the mech-scale numbers used for joint muzzles.
      if (b) { parent = b; k = mech.muzzleUnits.bone; }
    }
    // R/L default to the hands; named extras (podL...) fall back to torso
    if (!parent) parent = joints[spec?.joint] || joints['hand' + side] || joints.torso;
    const anchor = existing || new THREE.Object3D();
    parent.add(anchor);              // Object3D.add detaches from any old parent
    anchor.position.set(o[0] * k, o[1] * k, o[2] * k);
    return applyRot(anchor, spec);
  };
  // optional orientation (degrees, parent-local). Combat aims from the
  // fighter's facing, so this drives anchor-oriented FX / future use — it is
  // carried so the ?debug=models anchor editor's exports round-trip.
  function applyRot(anchor, spec) {
    const r = spec?.rot;
    anchor.rotation.set((r?.[0] || 0) * Math.PI / 180, (r?.[1] || 0) * Math.PI / 180, (r?.[2] || 0) * Math.PI / 180);
    // An authored rot means the anchor's +Z IS the barrel: combat deflects the
    // shot along it (world.js barrelDeflect). EVERY muzzle in the manifest now
    // carries one — the straight-ahead mechs have a baked rot that puts their
    // +Z on the mech's facing at rest, so they aim exactly as they always did
    // while going through the same path as a deliberately-splayed gun.
    // The flag stays conditional as a safety net: a muzzle added later WITHOUT
    // a rot would otherwise aim down whatever its parent bone happens to carry
    // (a raptor skull, a hand bone), which is meaningless as an aim vector —
    // so it falls back to today's straight-ahead behaviour until authored.
    anchor.userData.aimRot = !!r;
    // A HULL MOUNT AIMS IN YAW ONLY (`"aimFlat": true`). The deflection exists
    // so a barrel modelled splayed actually fires down its own line — which is
    // right in every axis for a gun the mech HOLDS, and wrong in the vertical
    // for one bolted to the chassis: the body's own forward lean tips the
    // barrel with it, and the shot obeys. Measured on frogger, whose gunk guns
    // are hull mounts: a 20-degree run lean fired the glob 19.9 degrees DOWN,
    // into the pavement in front of him, while fireRanged's vertical assist had
    // already put the aim on the enemy's height. With this set, the barrel's
    // horizontal splay still steers the shot and its pitch is left to the aim.
    anchor.userData.aimFlat = !!spec?.aimFlat;
    return anchor;
  }
  mech.anchors.muzzleR = installMuzzle('R');
  mech.anchors.muzzleL = installMuzzle('L');
  // Any OTHER key in entry.muzzles creates an anchor under its own name —
  // secondary weapon mounts combat already reads by name with a muzzle
  // fallback (e.g. Vulcan's shoulder missile pods: specials' muzzle(f,'podL')
  // prefers anchors.podL). Same joint/bone + offset semantics as R/L.
  for (const key of Object.keys(entry.muzzles || {})) {
    if (key === 'R' || key === 'L') continue;
    mech.anchors[key] = installMuzzle(key, mech.anchors[key]);
  }

  // Second-pass head-height match, on the VISIBLE head. The bind-time match
  // above is a rough pre-scale on the head bone; this pass poses one real
  // frame and scales so the GLB's rendered head-region top sits at the
  // procedural mech's rendered head-region top — the SAME canonical size in
  // every view (pose tool, showcase, battle, menus). Matching visible tops
  // (not the neck joint) is what makes the heads actually line up.
  // Skipped entirely for a pinned `modelScale` — see FROZEN MODEL SCALE above.
  // This is the pass that made size depend on the SKINNING (measureHeadTop
  // reads the verts the head bone owns), so it must not run once pinned.
  if (!pinnedScale && boneMap.head && !entry.noHeadMatch) {
    // measured once per entry (see the fit cache above) — posing a frame and
    // walking the head's verts costs the same on every rebuild and answers the
    // same, so a re-build replays it
    let head = fit.head;
    if (!head) {
      mech.premadeAnimator.poseStatic(); // deterministic neutral pose + postAnimate
      root.updateWorldMatrix(true, true);
      head = fit.head = {
        target: proceduralHeadTop(def) ?? joints.head.getWorldPosition(new THREE.Vector3()).y,
        have: measureHeadTop(mech),
      };
    }
    const targetHeadY = head.target, haveHeadY = head.have;
    mech._headDebug = { target: +targetHeadY?.toFixed(3), have0: +haveHeadY?.toFixed(3) };
    if (haveHeadY > 0.05 && targetHeadY > 0.05) {
      // clamp the correction: the first (bind-bone) pass already gets close, so
      // a large factor here means the head region was mis-measured (creatures
      // whose "head" is a pitched skull with a long vertical spread — saurion).
      // Cap it so a bad read can only nudge, never drastically resize.
      const k = clamp(targetHeadY / haveHeadY, 0.9, 1.12);
      mech._headDebug.k = +k.toFixed(3);
      if (Math.abs(k - 1) > 0.005) {
        rescaleAndReground(k);
        adapter.hipsScale = 1 / (scale || 1);
      }
    }
  }

  // Final per-mech size override. The head-match above brings the GLB to the
  // procedural canonical size (clamped); heightScale is a deliberate artist
  // tweak on TOP of that (uncapped) — e.g. "make viper 10% bigger". Applied
  // once, here, so it composes cleanly with the auto-match in every view.
  const hs = entry.heightScale ?? 1;
  const baseScale = scale;              // everything except heightScale
  if (Math.abs(hs - 1) > 1e-3) {
    rescaleAndReground(hs);
    adapter.hipsScale = 1 / (scale || 1);
  }
  // Expose the scale so tools/pin-modelscale.mjs can freeze it, and nag once
  // per entry while it is still being DERIVED (i.e. still rig-dependent).
  mech.modelScaleInfo = { base: baseScale, final: scale, pinned: !!pinnedScale };
  if (!pinnedScale && !entry.noHeadMatch) {
    warnEntryOnce(def.id, `modelScale not pinned — size is still derived from the rig `
      + `(add "modelScale": ${baseScale.toFixed(5)} to freeze it; see tools/pin-modelscale.mjs)`);
  }

  // Foot depth: the gait's ankle roll / toe-off is authored for the procedural
  // foot (sole 0.32 * scale under the ankle). Measure this model's real boot now
  // that the retarget is live, so the walk pushes off the GROUND rather than
  // driving the sole through it. See Animator.calibrateFeet.
  mech.premadeAnimator.calibrateFeet(fit);

  // ---- prone / dead floor clamp (GLB) -----------------------------------
  // The shared knockdown/death clips drop the hips by an amount tuned to the
  // PROCEDURAL body. Retargeted onto a GLB whose proportions differ, that same
  // drop leaves the prone body floating (inferno) or sunk through the floor
  // (nullbot). groundClamp(true) shifts the whole model vertically so its
  // LOWEST rendered point rests on the ground (root-local y = 0); (false)
  // restores the natural offset. The fighter calls this ONLY in grounded
  // down-states (knockdown / getup / dead) — upright stances keep the
  // retarget's own per-foot grounding, which is already correct.
  const clampBaseY = container.position.y;
  // HOW DEEP AN EXTREMITY MAY GO to put the body down, as a fraction of the
  // mech's height. About half a boot: the floor is opaque and a downed mech is
  // looked at from above, so a toe under the pavement is invisible while a
  // torso a tenth of a body height in the air is the thing that gets reported.
  const bodyH = targetH;
  // THE LOWEST PIXEL OF HIM, in world space — skin-aware, sampled on a stride
  // (a foot or a horn tip is hundreds of vertices wide, so 1500 samples find
  // it and a full scan would cost a frame). Shared by the prone clamp below
  // and the deep-penetration guard: both need the same number, and measuring
  // it twice two ways is how they would come to disagree.
  // WHICH VERTICES ARE "THE BODY". A prone mech should be resting on his BACK,
  // and the lowest-pixel rule cannot tell a back from a toe — so the clamp
  // measures both, and the core is what it tries to land (see groundClamp).
  // Named through boneMap, the only thing that knows what this rig calls its
  // spine: a raw name test would miss `tripo0_Right_Limb_1` and every other
  // auto-rig noun.
  const coreBones = new Set();
  for (const j of ['hips', 'torso', 'head']) {
    const b = boneMap?.[j];
    if (b) coreBones.add(b.name);
  }
  // …and which vertices the clamp must not measure AT ALL. A TAIL never carries
  // a body's weight — that is the premise the downed-tail ragdoll is built on
  // (Animator.limpTail lays the chain out ON the floor when he goes down). Left
  // in the measurement it pins `minY` to exactly the floor every frame, so the
  // clamp's sink allowance is spent on a tail that needed none and the body
  // stays in the air: the two corrections fight, and the tail wins because it
  // re-solves after every shift the clamp makes.
  // The WHOLE subtree under the chain root, not just the `tailN` run: a rig may
  // finish the chain with a differently-named leaf (tritone's `tailTip`), and
  // half a tail in the measurement props the body up exactly as all of it did.
  const skipBones = new Set();
  for (const rootName of mech.limpChains) {
    const r = rigBones?.[rootName];
    if (r) r.traverse((b) => { if (b.name) skipBones.add(b.name); });
  }
  const coreOf = new WeakMap();          // per mesh: is sampled vertex i core?
  const coreMask = (m) => {
    let mask = coreOf.get(m.geometry);
    if (mask) return mask;
    const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
    const names = m.skeleton?.bones.map((b) => b.name) || [];
    const n = m.geometry.attributes.position.count;
    mask = new Uint8Array(n);
    if (si && sw && coreBones.size) {
      for (let i = 0; i < n; i++) {
        let best = -1, bi = 0;
        for (let c = 0; c < 4; c++) {
          const w = sw.getComponent(i, c);
          if (w > best) { best = w; bi = si.getComponent(i, c); }
        }
        mask[i] = skipBones.has(names[bi]) ? 2 : coreBones.has(names[bi]) ? 1 : 0;
      }
    }
    coreOf.set(m.geometry, mask);
    return mask;
  };
  // Both heights in one sweep: the lowest pixel of ALL of him, and the lowest
  // pixel of his core.
  const lowestRenderedY = (wantCore) => {
    let minY = Infinity, minCore = Infinity, minTail = Infinity;
    for (const m of meshes) {
      const posAttr = m.geometry?.attributes?.position;
      if (!posAttr) continue;
      if (m.isSkinnedMesh) m.skeleton.update();
      const mask = wantCore && m.isSkinnedMesh ? coreMask(m) : null;
      const stride = Math.max(1, Math.floor(posAttr.count / 1500));
      for (let i = 0; i < posAttr.count; i += stride) {
        m.getVertexPosition(i, _gcTmp2);   // skin-aware on SkinnedMesh
        m.localToWorld(_gcTmp2);
        if (mask && mask[i] === 2) {
          if (_gcTmp2.y < minTail) minTail = _gcTmp2.y;
          continue;
        }
        if (_gcTmp2.y < minY) minY = _gcTmp2.y;
        if (mask && mask[i] === 1 && _gcTmp2.y < minCore) minCore = _gcTmp2.y;
      }
    }
    return wantCore ? { minY, minCore, minTail } : minY;
  };
  // `wantCore` passes straight through: callers that only need "the lowest
  // pixel" get a number, and callers that must tell a buried CHIN from a hand
  // pressed on the floor (combat/floorguard.js) get the split.
  mech.lowestRenderedY = (wantCore) => {
    root.updateWorldMatrix(true, true);
    for (const m of meshes) if (m.isSkinnedMesh) m.updateMatrixWorld();
    return lowestRenderedY(wantCore);
  };
  mech.groundClamp = (active) => {
    if (!active) {
      if (container.position.y !== clampBaseY) container.position.y = clampBaseY;
      return;
    }
    container.position.y = clampBaseY;
    root.updateWorldMatrix(true, true);
    // Refresh each skinned mesh's bindMatrixInverse to the just-reset pose.
    // getVertexPosition() reads bones' matrixWorld (which include the current
    // container offset) and cancels the rig frame with bindMatrixInverse; in
    // AttachedBindMode that inverse is only rebuilt by updateMatrixWorld(), NOT
    // updateWorldMatrix(). Skip it and the stale inverse leaves the container
    // shift double-counted (every measured Y moves ~2x the container delta), so
    // the correction below overshoots and the prone body sinks through / launches
    // off the floor — the reported knockdown bug. This resyncs it to 1:1.
    for (const m of meshes) if (m.isSkinnedMesh) m.updateMatrixWorld();
    const rootY = root.getWorldPosition(_gcTmp).y;
    const { minY, minCore, minTail } = lowestRenderedY(true);
    if (minY === Infinity) return;
    // container Y is root-local; root carries only translation + yaw, so a
    // local-Y delta equals a world-Y delta.
    //
    // TWO ANSWERS, AND THE BODY WINS WHERE IT CAN. Standing the LOWEST PIXEL on
    // the floor is right for a body lying flat and wrong the moment anything
    // narrow hangs below it — a pointed toe, a heel spur, a horn — because a
    // point is not a contact patch, and the whole mech ends up levitating on it
    // (measured before this: titanus 15.5% of his height off the ground resting
    // on `heelL`, tempest 10.7% on an ankle, viper 14.1%). So the clamp lands
    // his CORE instead, and only backs off when doing that would bury an
    // extremity deeper than `sink`. With sink 0 this is exactly the old rule.
    const lift = rootY - minY;
    const coreLift = minCore === Infinity ? lift : rootY - minCore;
    const sink = PRONE_SINK * (bodyH || 0);
    const y = clampBaseY + Math.max(coreLift, lift - sink);
    container.position.y = y;
    // HOW FAR THE TAIL ENDED UP UNDER THE FLOOR, handed back to the ragdoll.
    // Exempting the tail from the clamp is only honest if the ragdoll actually
    // lays it ON the ground, and the ragdoll works on the BONE LINE — which on a
    // thin blade is the tail and on a thick armoured one (tritone's) is the
    // middle of a slab, leaving half of it buried. Rather than measure a
    // thickness per rig, the error is reported here and the solver servos its
    // own floor up by it (Animator.limpTail): the surface lands wherever the
    // geometry actually is, in whatever pose it is in.
    mech.tailUnder = minTail === Infinity ? 0 : Math.max(0, -(minTail + (y - clampBaseY)));
  };

  // Visual-only floor lift for the ?debug=models workbench. Raises just the
  // rendered model (the container is a CHILD of the physics group), so it never
  // touches the fighter's pos — which IS group.position (aliased), meaning a
  // lift on the group corrupts physics: it accumulates (mech floats up) and
  // jerks pos.y during animation (twitch + spurious airborne/landing states).
  // dy is a root-local (= world) Y offset over the natural clamp base.
  mech.visualFloorLift = (dy) => { container.position.y = clampBaseY + (dy || 0); };
  // …and WHAT that moves, for anything that has to measure the same subtree it
  // lifts. A fighter's group carries more than the model — combat parents FX to
  // it (the guard bubble, auras) — and a floor clamp that measures those and
  // then lifts only the model is chasing a number it can never reach.
  mech.visual = container;

  // Synchronous, CORRECT clone for combat spawns (SAURION's raptor pack).
  // GLB bodies are SkinnedMeshes: Object3D.clone(true) shares the skeleton, so
  // the copy stays welded to the ORIGINAL's bones and renders invisible/torn.
  // Rebuild a fresh GLB mech from the already-cached gltf instead — no texture
  // re-synthesis (the frame-stall cloneMech avoids), a properly reskinned
  // clone, and its own rig / adapter / anchors / animation profile.
  mech.cloneGLB = () => buildGlbMech(def, entry, gltf);

  // profile build hook: attach extra PROCEDURAL geometry/joints to the
  // virtual rig (e.g. wraith's cape for the wing-laser heavy) — last, so it
  // sees the final joints/anchors/scale.
  mech.animProfile?.build?.(mech, def);

  warnContract(mech); // §5 contract check — warns instead of failing silently
  return mech;
}

// ---- visible head-height reference -------------------------------------
// The head JOINT sits at the neck; the visible head extends above it by a
// model-specific amount (crests, horns, crowns). Sizing on the joint/bone
// therefore leaves the rendered heads misaligned. Instead measure the top of
// the visible HEAD REGION and match those: procedural = geometry parented
// under J.head; GLB = skinned verts whose dominant bone is boneMap.head or a
// descendant. Robust to imperfect head-bone picks (a spine-ish head bone
// whose subtree still contains the head → its top is still the head top).
const _procHeadCache = new Map();
function pctileTop(ys, p = 0.97) {
  if (!ys.length) return null;
  ys.sort((a, b) => a - b);
  return ys[Math.min(ys.length - 1, Math.floor(ys.length * p))];
}

// World-space top of a mech's visible head region. Mech must be posed already.
export function measureHeadTop(mech) {
  const v = new THREE.Vector3();
  const ys = [];
  if (mech.isGLB && mech.boneMap?.head) {
    const headBones = new Set();
    mech.boneMap.head.traverse((o) => { if (o.isBone) headBones.add(o); });
    let sk = null;
    mech.group.traverse((o) => { if (o.isSkinnedMesh && !sk) sk = o; });
    if (sk) {
      sk.skeleton.update();
      const bi = new Map(sk.skeleton.bones.map((b, i) => [b, i]));
      const headIdx = new Set([...headBones].map((b) => bi.get(b)).filter((i) => i != null));
      const pos = sk.geometry.attributes.position;
      const ji = sk.geometry.attributes.skinIndex, wt = sk.geometry.attributes.skinWeight;
      const st = Math.max(1, Math.floor(pos.count / 14000));
      for (let i = 0; i < pos.count; i += st) {
        let b = ji.getX(i), w = wt.getX(i);
        if (wt.getY(i) > w) { w = wt.getY(i); b = ji.getY(i); }
        if (wt.getZ(i) > w) { w = wt.getZ(i); b = ji.getZ(i); }
        if (wt.getW(i) > w) { w = wt.getW(i); b = ji.getW(i); }
        if (headIdx.has(b)) { sk.getVertexPosition(i, v); sk.localToWorld(v); ys.push(v.y); }
      }
    }
    return pctileTop(ys) ?? mech.boneMap.head.getWorldPosition(v).y;
  }
  // procedural: geometry parented under the head joint
  const jh = mech.joints.head;
  jh.updateWorldMatrix(true, false);
  jh.traverse((o) => {
    if ((o.isMesh || o.isSkinnedMesh) && o.geometry?.attributes?.position) {
      const p = o.geometry.attributes.position;
      const st = Math.max(1, Math.floor(p.count / 4000));
      for (let i = 0; i < p.count; i += st) { v.fromBufferAttribute(p, i); o.localToWorld(v); ys.push(v.y); }
    }
  });
  // fallback (some designs don't parent head geo under J.head, e.g. frogger):
  // the head joint + ~2·headSize is the same estimate the old height cap used
  return pctileTop(ys) ?? (jh.getWorldPosition(v).y + (mech.dims?.headSize || 0.4) * 2);
}

function disposeMech(mech) {
  mech.group.traverse((o) => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) {
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) m[k]?.dispose?.();
      m.dispose?.();
    }
  });
}

// Visible procedural head-top for a mech id — built once, measured, cached,
// disposed. The head geometry is color-scheme-independent, so id is the key.
function proceduralHeadTop(def) {
  if (_procHeadCache.has(def.id)) return _procHeadCache.get(def.id);
  let top = null;
  try {
    const pm = buildMech(def);
    new Animator(pm).poseStatic(); // deterministic neutral pose
    pm.group.updateWorldMatrix(true, true);
    top = measureHeadTop(pm);
    disposeMech(pm);
  } catch (e) { /* fall back to joint-based below */ }
  _procHeadCache.set(def.id, top);
  return top;
}

// Bounding box of a model's RENDERED surface at bind: skinned meshes are
// sampled through getVertexPosition (applies bone transforms); plain meshes
// through their world matrix. Model must not yet be scaled/parented.
const _v = new THREE.Vector3();
export function skinnedBox(model) {
  model.updateMatrixWorld(true); // virtual dispatch → SkinnedMesh refreshes bindMatrixInverse
  const box = new THREE.Box3();
  model.traverse((o) => {
    if (o.isSkinnedMesh) o.skeleton.update();
    if (!o.isMesh && !o.isSkinnedMesh) return;
    const pos = o.geometry?.attributes?.position;
    if (!pos) return;
    const stride = Math.max(1, Math.floor(pos.count / 20000));
    for (let i = 0; i < pos.count; i += stride) {
      o.getVertexPosition(i, _v);       // skin-aware on SkinnedMesh
      o.localToWorld(_v);               // mesh-node frame -> model frame
      box.expandByPoint(_v);
    }
  });
  return box;
}

// SkinnedMesh-aware clone — three's reference implementation. (A previous
// hand-rolled version cloned Skeleton then remapped bones without rebuilding
// boneInverses pairing, which visibly tore Tripo rigs.)
function cloneSkinned(source) {
  return skeletonClone(source);
}
