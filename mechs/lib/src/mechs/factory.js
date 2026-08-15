// Mech factory: builds the joint rig, materials, and shared body structure,
// then hands off to the per-mech design function for unique armor & weapons.
import * as THREE from 'three';
import { Assembler } from './parts.js';
import { platingTextures } from '../core/textures.js';
import { skinMaterial } from '../core/pbrtex.js';
import { DESIGNS } from './designs.js';
import { warnContract } from './contract.js';

// Joint conventions: mech faces +Z. X = pitch, Y = yaw, Z = roll.
// Arms hang along -Y; shoulder.rotation.x = -PI/2 points the arm forward.

export function computeDims(def) {
  const b = def.body;
  const s = b.scale;
  return {
    scale: s,
    bulk: b.bulk,                        // limb thickness multiplier
    hipHeight: 3.15 * s * b.legLen,
    thighLen: 1.55 * s * b.legLen,
    shinLen: 1.45 * s * b.legLen,
    hipW: 0.55 * s * b.hipW,
    torsoH: 1.75 * s * b.torsoH,
    torsoW: 1.35 * s * b.torsoW,
    torsoD: 0.9 * s * b.torsoW,
    headSize: 0.42 * s * b.headSize,
    shoulderW: 1.12 * s * b.torsoW,
    upperArmLen: 1.15 * s * b.armLen,
    foreArmLen: 1.1 * s * b.armLen,
    footLen: 0.85 * s,
  };
}

// shared battle-worn gunmetal under-frame (cached inside pbrtex by recipe)
const FRAME_RECIPE = {
  base: 0x33373e, metal: 0x767c86, wear: 0.4, grime: 0.45,
  panelDepth: 3, roughPaint: 0.5, metalPaint: 0.72, seed: 3,
  frameBucket: true, // texture-pack mode: use the gunmetal frame material
};

export function makeMaterials(def) {
  const c = def.colors;

  // PBR skin path: recipe-driven albedo/normal/rough/metal (concept-derived)
  if (def.skin) {
    const mats = {
      primary: skinMaterial({ seed: def.seed, ...def.skin.primary }),
      accent: skinMaterial({ seed: def.seed + 5, ...def.skin.accent }),
      frame: skinMaterial(FRAME_RECIPE),
      metal: new THREE.MeshStandardMaterial({ color: 0x99a0aa, roughness: 0.28, metalness: 0.98 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xa8823c, roughness: 0.34, metalness: 0.95 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.7, metalness: 0.6 }),
      glow: new THREE.MeshStandardMaterial({
        color: c.glow, emissive: c.glow, emissiveIntensity: 2.6, roughness: 0.4, metalness: 0.1,
      }),
      glowSoft: new THREE.MeshStandardMaterial({
        color: c.glow, emissive: c.glow, emissiveIntensity: 1.1, roughness: 0.5, metalness: 0.2,
      }),
    };
    if (c.glow2) {
      mats.glow2 = new THREE.MeshStandardMaterial({
        color: c.glow2, emissive: c.glow2, emissiveIntensity: 2.4, roughness: 0.4, metalness: 0.1,
      });
    }
    return mats;
  }

  const primaryTex = platingTextures(c.primary, def.seed, { stripes: c.stripes });
  const accentTex = platingTextures(c.accent, def.seed + 5);

  const mats = {
    primary: new THREE.MeshStandardMaterial({
      color: 0xffffff, map: primaryTex.map, bumpMap: primaryTex.bumpMap, bumpScale: 0.6,
      roughness: 0.52, metalness: 0.72,
    }),
    accent: new THREE.MeshStandardMaterial({
      color: 0xffffff, map: accentTex.map, bumpMap: accentTex.bumpMap, bumpScale: 0.5,
      roughness: 0.48, metalness: 0.75,
    }),
    frame: new THREE.MeshStandardMaterial({ // dark under-structure
      color: 0x23262c, roughness: 0.6, metalness: 0.85,
    }),
    metal: new THREE.MeshStandardMaterial({ // bare steel details
      color: 0x8a929c, roughness: 0.32, metalness: 0.95,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: 0x101216, roughness: 0.7, metalness: 0.6,
    }),
    glow: new THREE.MeshStandardMaterial({
      color: c.glow, emissive: c.glow, emissiveIntensity: 2.6,
      roughness: 0.4, metalness: 0.1,
    }),
    glowSoft: new THREE.MeshStandardMaterial({
      color: c.glow, emissive: c.glow, emissiveIntensity: 1.1,
      roughness: 0.5, metalness: 0.2,
    }),
  };
  return mats;
}

export function buildRig(D) {
  const J = {};
  const g = (name, parent, x = 0, y = 0, z = 0) => {
    const o = new THREE.Group();
    o.name = name;
    o.position.set(x, y, z);
    if (parent) parent.add(o);
    J[name] = o;
    return o;
  };

  const root = g('root', null);
  const hips = g('hips', root, 0, D.hipHeight, 0);
  const torso = g('torso', hips, 0, 0.18 * D.scale, 0);
  g('head', torso, 0, D.torsoH, 0.05 * D.scale);

  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? -1 : 1;
    const sh = g('shoulder' + side, torso, sx * D.shoulderW, D.torsoH * 0.82, 0);
    const el = g('elbow' + side, sh, sx * 0.08 * D.scale, -D.upperArmLen, 0);
    g('hand' + side, el, 0, -D.foreArmLen, 0);

    const th = g('thigh' + side, hips, sx * D.hipW, -0.1 * D.scale, 0);
    const kn = g('knee' + side, th, 0, -D.thighLen, 0);
    g('ankle' + side, kn, 0, -D.shinLen, 0.02 * D.scale);
  }
  return { root, joints: J };
}

// ---------- shared body builders (used by most designs) ----------

export function baseFrame(A, D) {
  // pelvis block
  A.taper('hips', 'frame', [D.torsoW * 0.92, 0.55 * D.scale, D.torsoD * 0.85], 1.15, 1.0, {
    p: [0, -0.1 * D.scale, 0],
  });
  A.box('hips', 'primary', [D.torsoW * 0.55, 0.42 * D.scale, D.torsoD * 0.55], {
    p: [0, -0.18 * D.scale, D.torsoD * 0.3],
  });
  // spine column
  A.tube('torso', 'frame', 0.16 * D.scale, 0.2 * D.scale, D.torsoH * 0.9, {
    p: [0, D.torsoH * 0.45, -D.torsoD * 0.15],
  });
}

export function standardArm(A, D, side, opts = {}) {
  const sx = side === 'L' ? -1 : 1;
  const bulk = (opts.bulk ?? 1) * D.bulk;
  const s = D.scale;
  const sh = 'shoulder' + side, el = 'elbow' + side, ha = 'hand' + side;

  // shoulder joint ball + upper arm
  A.ball(sh, 'frame', 0.24 * s * bulk, { p: [0, 0, 0] });
  A.tube(sh, 'frame', 0.14 * s * bulk, 0.17 * s * bulk, D.upperArmLen, {
    p: [sx * 0.04 * s, -D.upperArmLen / 2, 0],
  });
  if (opts.upperArmor !== false) {
    A.taper(sh, 'primary', [0.42 * s * bulk, D.upperArmLen * 0.8, 0.44 * s * bulk], 0.8, 0.85, {
      p: [sx * 0.05 * s, -D.upperArmLen * 0.52, 0],
    });
  }
  // elbow + forearm
  A.part(el, 'metal', new THREE.CylinderGeometry(0.16 * s * bulk, 0.16 * s * bulk, 0.3 * s * bulk, 10), {
    r: [0, 0, Math.PI / 2],
  });
  A.tube(el, 'frame', 0.13 * s * bulk, 0.15 * s * bulk, D.foreArmLen * 0.95, {
    p: [0, -D.foreArmLen / 2, 0],
  });
  if (opts.foreArmor !== false) {
    A.taper(el, 'accent', [0.46 * s * bulk, D.foreArmLen * 0.75, 0.48 * s * bulk], 1.15, 1.1, {
      p: [0, -D.foreArmLen * 0.55, 0],
    });
  }
  if (opts.fist !== false) {
    A.fist(ha, 'frame', 'dark', 0.34 * s * bulk, { side: sx });
  }
}

export function standardLeg(A, D, side, opts = {}) {
  const sx = side === 'L' ? -1 : 1;
  const bulk = (opts.bulk ?? 1) * D.bulk;
  const s = D.scale;
  const th = 'thigh' + side, kn = 'knee' + side, an = 'ankle' + side;

  // hip ball
  A.ball(th, 'frame', 0.26 * s * bulk, {});
  // thigh
  A.tube(th, 'frame', 0.17 * s * bulk, 0.2 * s * bulk, D.thighLen, { p: [0, -D.thighLen / 2, 0] });
  A.taper(th, 'primary', [0.52 * s * bulk, D.thighLen * 0.85, 0.56 * s * bulk], 0.85, 0.9, {
    p: [0, -D.thighLen * 0.48, 0.03 * s],
  });
  // knee cap
  A.part(kn, 'metal', new THREE.CylinderGeometry(0.2 * s * bulk, 0.2 * s * bulk, 0.34 * s * bulk, 10), {
    r: [0, 0, Math.PI / 2],
  });
  A.taper(kn, 'accent', [0.34 * s * bulk, 0.42 * s * bulk, 0.3 * s * bulk], 0.7, 0.7, {
    p: [0, -0.05 * s, 0.24 * s * bulk],
  });
  // shin
  A.tube(kn, 'frame', 0.14 * s * bulk, 0.18 * s * bulk, D.shinLen, { p: [0, -D.shinLen / 2, 0] });
  A.taper(kn, 'primary', [0.44 * s * bulk, D.shinLen * 0.8, 0.5 * s * bulk], 1.25, 1.15, {
    p: [0, -D.shinLen * 0.55, 0.04 * s],
  });
  // foot
  if (opts.foot !== 'none') {
    A.taper(an, 'frame', [0.5 * s * bulk, 0.3 * s, D.footLen], 0.85, 0.6, {
      p: [0, -0.16 * s, 0.16 * s],
    });
    A.box(an, 'primary', [0.46 * s * bulk, 0.2 * s, 0.42 * s], {
      p: [0, -0.05 * s, 0.3 * s],
    });
    // heel
    A.sharpBox(an, 'dark', [0.4 * s * bulk, 0.18 * s, 0.24 * s], {
      p: [0, -0.2 * s, -0.2 * s],
    });
  }
}

// Digitigrade legs (raptor style) for fast mechs: same joints, angled rest pose.
export function raptorLeg(A, D, side, opts = {}) {
  const sx = side === 'L' ? -1 : 1;
  const bulk = (opts.bulk ?? 0.85) * D.bulk;
  const s = D.scale;
  const th = 'thigh' + side, kn = 'knee' + side, an = 'ankle' + side;

  A.ball(th, 'frame', 0.24 * s * bulk, {});
  A.tube(th, 'frame', 0.15 * s * bulk, 0.18 * s * bulk, D.thighLen, { p: [0, -D.thighLen / 2, 0] });
  A.blade(th, 'primary', D.thighLen * 0.95, 0.44 * s * bulk, 0.4 * s * bulk, {
    p: [0, -D.thighLen * 0.45, 0.05 * s], r: [Math.PI, 0, 0], taper: 0.55,
  });
  A.part(kn, 'metal', new THREE.CylinderGeometry(0.17 * s * bulk, 0.17 * s * bulk, 0.3 * s * bulk, 10), {
    r: [0, 0, Math.PI / 2],
  });
  A.tube(kn, 'frame', 0.11 * s * bulk, 0.14 * s * bulk, D.shinLen, { p: [0, -D.shinLen / 2, 0] });
  A.taper(kn, 'accent', [0.3 * s * bulk, D.shinLen * 0.7, 0.36 * s * bulk], 1.3, 1.2, {
    p: [0, -D.shinLen * 0.5, 0.02 * s],
  });
  // clawed foot: three toes
  for (let i = -1; i <= 1; i++) {
    A.spike(an, 'dark', 0.09 * s, 0.42 * s, {
      p: [i * 0.14 * s * bulk, -0.14 * s, 0.3 * s],
      r: [Math.PI / 2.4, 0, 0], seg: 6,
    });
  }
  A.taper(an, 'frame', [0.4 * s * bulk, 0.24 * s, 0.5 * s], 0.8, 0.5, { p: [0, -0.08 * s, 0.1 * s] });
  // rear dew claw
  A.spike(an, 'dark', 0.07 * s, 0.3 * s, { p: [0, -0.1 * s, -0.22 * s], r: [-Math.PI / 2.6, 0, 0], seg: 6 });
}

// ---------- main entry ----------

export function buildMech(def) {
  const D = computeDims(def);
  const materials = makeMaterials(def);
  const { root, joints } = buildRig(D);

  const A = new Assembler();
  const anchors = {}; // filled by design: muzzleL/R, core, etc.
  const design = DESIGNS[def.id];
  if (!design) throw new Error('No design for mech ' + def.id);
  design(A, D, joints, anchors, def);
  // shoulder axles: chest geometry varies per design, and many designs push
  // the shoulder JOINTS wider than the rig default (glacier +0.55s, rhino,
  // inferno, ...) — so bridge each joint's ACTUAL post-design position to
  // the torso with a dark cylindrical axle + collar + fixed socket ball so
  // the arm always reads attached, whatever the design did
  for (const side of ['L', 'R']) {
    const jp = joints['shoulder' + side].position; // in torso space
    const sxn = Math.sign(jp.x) || 1;
    const len = Math.abs(jp.x) * 0.85;
    A.tube('torso', 'dark', 0.11 * D.scale * D.bulk, 0.13 * D.scale * D.bulk, len, {
      p: [jp.x - sxn * len / 2, jp.y, jp.z], r: [0, 0, Math.PI / 2] });
    A.ring('torso', 'dark', 0.16 * D.scale * D.bulk, 0.032 * D.scale, {
      p: [jp.x - sxn * 0.24 * D.scale, jp.y, jp.z], r: [0, Math.PI / 2, 0] });
    A.ball('torso', 'frame', 0.18 * D.scale * D.bulk, { p: [jp.x, jp.y, jp.z] });
  }
  A.build(joints, materials);

  // ensure default anchors exist
  if (!anchors.muzzleR) anchors.muzzleR = addAnchor(joints['handR'], 0, -0.2 * D.scale, 0.4 * D.scale);
  if (!anchors.muzzleL) anchors.muzzleL = addAnchor(joints['handL'], 0, -0.2 * D.scale, 0.4 * D.scale);
  if (!anchors.core) anchors.core = addAnchor(joints['torso'], 0, D.torsoH * 0.5, D.torsoD * 0.4);
  // BOOSTER NOZZLES — where the hover jets' flame comes out. The default is
  // the obvious one, under each SOLE. POSITION only: with no authored `rot`
  // the thrust runs straight down the body (fighter.boosterJets), which is
  // what a foot jet does whatever the ankle is doing. A mech that wants its
  // thrust somewhere else — a back pack, wing pods — drags these in the
  // animation workbench and exports a `muzzles` entry, and a `rot` in that
  // entry aims the exhaust along the anchor's +Z instead.
  for (const side of ['L', 'R']) {
    const k = 'boost' + side;
    if (!anchors[k]) anchors[k] = addAnchor(joints['ankle' + side], 0, -0.34 * D.scale, 0);
  }
  anchors.overhead = addAnchor(joints['root'], 0, D.hipHeight + D.torsoH + D.headSize * 2 + 1.2 * D.scale, 0);

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  // colored core light gives each mech presence, especially in night arenas
  const coreLight = new THREE.PointLight(def.colors.glow, 14, 11 * D.scale, 2);
  anchors.core.add(coreLight);

  const mech = { group: root, joints, anchors, materials, dims: D, def };
  warnContract(mech); // §5 contract check — warns instead of failing silently
  return mech;
}

export function addAnchor(parent, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

// Cheap COMBAT-TIME copy of an already-built mech (SAURION's raptor pack).
// buildMech mid-match is a frame-killer: geometry sculpting + PBR texture
// synthesis, plus a new PointLight that forces a shader recompile across
// the scene. This instead shares every geometry and texture with the
// source, clones only the material objects (so the copy can be re-tinted
// safely), and strips lights / charge shells / FX sprites — microseconds,
// not hundreds of milliseconds.
export function cloneMech(src) {
  // GLB bodies are SkinnedMeshes — a plain Object3D.clone(true) shares the
  // skeleton and leaves the copy welded to the source's bones (invisible /
  // torn). buildGlbMech stamps a cloneGLB() that rebuilds a correct, fully
  // rigged copy from the cached gltf; use it (SAURION's raptor pack on GLBs).
  if (src.isGLB && src.cloneGLB) return src.cloneGLB();
  // stamp anchor names on the source once so the clone can re-find them
  for (const [k, a] of Object.entries(src.anchors)) {
    if (!a.name) a.name = '__anchor__' + k;
  }
  const group = src.group.clone(true);
  group.position.set(0, 0, 0);
  group.rotation.set(0, 0, 0);
  group.scale.set(1, 1, 1);
  // dynamic extras that don't belong on a fresh body
  const drop = [];
  group.traverse((o) => {
    if (o.userData.chargeShell || o.isLight || o.isSprite) drop.push(o);
  });
  for (const o of drop) o.parent?.remove(o);
  // re-resolve the joint & anchor maps by name
  const joints = {};
  for (const k of Object.keys(src.joints)) joints[k] = group.getObjectByName(k);
  const anchors = {};
  for (const k of Object.keys(src.anchors)) {
    anchors[k] = group.getObjectByName('__anchor__' + k) || joints.torso;
  }
  // fresh material instances (texture references shared — no re-synthesis)
  const matMap = new Map();
  const materials = {};
  for (const [k, m] of Object.entries(src.materials)) {
    if (m && m.isMaterial) {
      const c = m.clone();
      matMap.set(m, c);
      materials[k] = c;
    }
  }
  group.traverse((o) => {
    if (o.isMesh && matMap.has(o.material)) o.material = matMap.get(o.material);
  });
  return { group, joints, anchors, materials, dims: src.dims, def: src.def };
}
