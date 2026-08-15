// TITANUS' rocket fist on the GLB route: cut the fist off the wrist cleanly so
// the REAL geometry flies away as the projectile and re-docks when it returns.
//
// The procedural body gets this for free — its fist is its own Object3D under
// joints.handR, so Fighter.launchFist() just scales that joint to nothing. A GLB
// is ONE skinned mesh: the fist is a few thousand vertices in the middle of an
// 84k-vertex buffer, driven by a bone. Hence this module.
//
// HOW THE FIST IS IDENTIFIED. The manifest skinOps bind the fist vertices to the
// rig's static `fistL`/`fistR` TIP bones (painted in ?debug=skin). Those bones
// are rigid, never-animated children of handL/handR, so that binding changes
// nothing whatsoever about how the mech deforms — it is purely a painted
// selection meaning "this is the fist".
//
// WHY THE SELECTION IS ONLY A SEED. Hand-painted weights have feathered edges; a
// break in solid armour must not. So: take the wrist->fist axis from the two
// vertex clouds' centroids, find the threshold ALONG that axis that best
// separates them, flood-fill the fist through the mesh from the seed without ever
// crossing back over that plane, and claim WHOLE TRIANGLES. The cut comes out
// flat to triangle resolution instead of ragged, no triangle is ever torn, and
// strays the artist left on a neighbouring bone still travel with the fist
// instead of being left hanging in the open socket.
//
// WHY GEOMETRY GROUPS. The cut triangles are moved into their own index range, so
// detaching the fist is one material's `.visible = false`. No second copy of an
// 84k-vertex buffer per fighter, and the body still draws in one call.
//
// HOW THE BREAK IS HIDDEN. Cutting a closed shell exposes its inside, which
// renders as unlit inside-out geometry (or as a hole in the silhouette). Rather
// than trying to geometrically cap the rim — a mech fist is ~20 separate armour
// plates, so there is no single rim, and boundary-loop extraction on that goes
// wrong at every non-manifold junction — both halves carry a dark BACKFACE
// layer: the same vertex buffers, indexed to just the shell around the cut, drawn
// with side: BackSide in gunmetal. On closed shell it is hidden behind the
// front faces; exactly where the fist tore away, it is what you see. That fills
// the break with a dark surface on the hand AND the arm, needs no rim geometry,
// and cannot leave a gap however jagged the cut is.
import * as THREE from 'three';
import { subGeometry } from './glbshell.js';

// `interior` is the set of bones whose shell the dark backface layer covers while
// that fist is away. It has to be the WHOLE ARM, not just the wrist: with the
// fist gone you are looking down an open tube, and the walls you see are the
// forearm and upper-arm shells (the elbow and shoulder bones), not the couple of
// centimetres of wrist right at the cut. Covering only the wrist left the arm
// see-through from the knuckles up.
const DEFAULT_PAIRS = [
  { side: 'R', hand: 'handR', tip: 'fistR', interior: ['handR', 'fistR', 'elbowR', 'shoulderR'] },
  { side: 'L', hand: 'handL', tip: 'fistL', interior: ['handL', 'fistL', 'elbowL', 'shoulderL'] },
];

// The exposed interior. Dark, but NOT near-black: at 0x15161b it read as a hole
// punched in the silhouette rather than a socket. Gunmetal with enough roughness
// for the ambient to land on, plus a trace of emissive so it never goes fully
// black in shadow. polygonOffset keeps it off the front faces on any part of the
// shell modelled as a single-thickness plane, which would otherwise z-fight.
function makeInteriorMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x33363f, roughness: 0.62, metalness: 0.72,
    side: THREE.BackSide,
    emissive: 0x0a0b0e, emissiveIntensity: 1,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
}

// Best 1-D split of two labelled point sets along one axis: the threshold that
// maximises (fist above) + (wrist below). Robust to a feathered selection on
// either side, which a min/max or percentile cut is not.
function bestThreshold(samples) {
  samples.sort((a, b) => a.t - b.t);
  let fistTotal = 0;
  for (const s of samples) if (s.fist) fistTotal++;
  let wristBelow = 0, fistBelow = 0, best = -Infinity, bestT = 0;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].fist) fistBelow++; else wristBelow++;
    const score = wristBelow + (fistTotal - fistBelow);
    if (score > best) {
      best = score;
      bestT = i + 1 < samples.length ? (samples[i].t + samples[i + 1].t) / 2 : samples[i].t;
    }
  }
  return { t: bestT, score: best, total: samples.length };
}

/**
 * Split the fist(s) off `mesh` into their own geometry groups, with a dark
 * interior layer for the break.
 * Call AFTER skinOps and after the build owns its materials — the mesh's
 * material becomes an ARRAY here, which the single-material paths upstream
 * would choke on.
 * Returns a handle, or null when this mesh carries no fist selection.
 */
export function buildFistSplit(mesh, pairs = DEFAULT_PAIRS) {
  const geo = mesh.geometry;
  const idx = geo.index;
  const pos = geo.attributes.position;
  const si = geo.attributes.skinIndex;
  if (!idx || !pos || !si || !mesh.skeleton) return null;
  if (Array.isArray(mesh.material)) return null;   // already split

  const bones = mesh.skeleton.bones;
  const boneIndexOf = (n) => bones.findIndex((b) => b.name === n);
  const triCount = Math.floor(idx.count / 3);
  const triOwner = new Int8Array(triCount).fill(-1);   // -1 body, else pair index
  const found = [];

  for (let pi = 0; pi < pairs.length; pi++) {
    const spec = pairs[pi];
    const hi = boneIndexOf(spec.hand), fi = boneIndexOf(spec.tip);
    if (hi < 0 || fi < 0) continue;

    // ---- the wrist+fist region. The cut plane is infinite, so without this a
    // thigh triangle that happens to sit past it would be swept into the fist.
    const region = new Uint8Array(pos.count);
    const seedFist = new Uint8Array(pos.count);
    let nFist = 0, nWrist = 0;
    const cF = new THREE.Vector3(), cW = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const b = si.getX(i);
      if (b !== hi && b !== fi) continue;
      region[i] = 1;
      v.fromBufferAttribute(pos, i);
      if (b === fi) { seedFist[i] = 1; cF.add(v); nFist++; } else { cW.add(v); nWrist++; }
    }
    if (!nFist || !nWrist) continue;
    cF.multiplyScalar(1 / nFist);
    cW.multiplyScalar(1 / nWrist);

    // ---- cut axis + plane, straight off the geometry (no hand-tuned numbers)
    const axis = cF.clone().sub(cW).normalize();
    const samples = [];
    const tAll = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      tAll[i] = v.dot(axis);
      if (region[i]) samples.push({ t: tAll[i], fist: !!seedFist[i] });
    }
    const cut = bestThreshold(samples);
    const past = new Uint8Array(pos.count);
    for (let i = 0; i < pos.count; i++) if (tAll[i] > cut.t) past[i] = 1;

    // ---- flood the fist through the mesh from the painted seed, never crossing
    // back over the plane. Cannot leak into the thigh the fist hangs beside:
    // separate shells share no vertices.
    const inFist = new Uint8Array(pos.count);
    for (let i = 0; i < pos.count; i++) if (seedFist[i] && past[i]) inFist[i] = 1;
    for (let pass = 0; pass < 24; pass++) {
      let added = 0;
      for (let t = 0; t < triCount; t++) {
        const i0 = idx.getX(t * 3), i1 = idx.getX(t * 3 + 1), i2 = idx.getX(t * 3 + 2);
        if (!past[i0] || !past[i1] || !past[i2]) continue;
        if (!inFist[i0] && !inFist[i1] && !inFist[i2]) continue;
        if (!inFist[i0]) { inFist[i0] = 1; added++; }
        if (!inFist[i1]) { inFist[i1] = 1; added++; }
        if (!inFist[i2]) { inFist[i2] = 1; added++; }
      }
      if (!added) break;
    }

    // ---- claim WHOLE triangles; collect the ARM shell for the interior layer
    // (see `interior` on the pair spec — the whole limb, not just the wrist)
    const armBones = new Set((spec.interior || [spec.hand, spec.tip])
      .map(boneIndexOf).filter((x) => x >= 0));
    const onArm = new Uint8Array(pos.count);
    for (let i = 0; i < pos.count; i++) if (armBones.has(si.getX(i))) onArm[i] = 1;
    let tris = 0;
    const armTris = [];
    for (let t = 0; t < triCount; t++) {
      const i0 = idx.getX(t * 3), i1 = idx.getX(t * 3 + 1), i2 = idx.getX(t * 3 + 2);
      const isFist = inFist[i0] && inFist[i1] && inFist[i2];
      if (isFist && triOwner[t] === -1) { triOwner[t] = pi; tris++; continue; }
      if (!isFist && onArm[i0] && onArm[i1] && onArm[i2]) armTris.push(t);
    }
    if (!tris) continue;
    found.push({
      ...spec, pairIndex: pi, axis, cutT: cut.t, tris, cut,
      handBone: bones[hi], handIndex: hi, armTris,
    });
  }
  if (!found.length) return null;

  // ---- rebuild the index buffer grouped [body, side0, side1, ...]
  const src = idx.array;
  const out = new Uint32Array(idx.count);
  let w = 0;
  const pushGroup = (owner) => {
    const start = w;
    for (let t = 0; t < triCount; t++) {
      if (triOwner[t] !== owner) continue;
      out[w++] = src[t * 3]; out[w++] = src[t * 3 + 1]; out[w++] = src[t * 3 + 2];
    }
    return { start, count: w - start };
  };
  const bodyG = pushGroup(-1);
  for (const f of found) f.group = pushGroup(f.pairIndex);

  geo.setIndex(new THREE.BufferAttribute(out, 1));
  geo.clearGroups();
  const baseMat = mesh.material;
  const mats = [baseMat];
  geo.addGroup(bodyG.start, bodyG.count, 0);
  for (const f of found) {
    // the fist renders with its OWN clone of the body material, so toggling
    // .visible detaches it without touching anything else
    const m = baseMat.clone();
    m.name = `${baseMat.name || 'body'}_fist${f.side}`;
    mats.push(m);
    f.material = m;
    geo.addGroup(f.group.start, f.group.count, mats.length - 1);
  }
  mesh.material = mats;

  // ---- the arm interior: a dark BackSide layer over the whole limb's shell,
  // sharing the mech's vertex buffers and skeleton so it deforms with the arm.
  // Shown only while that fist is away.
  const interiorMat = makeInteriorMaterial();
  for (const f of found) {
    if (!f.armTris.length) continue;
    const g = subGeometry(geo, f.armTris, idx);
    const inner = new THREE.SkinnedMesh(g, interiorMat);
    inner.name = `fistSocket${f.side}`;
    inner.frustumCulled = false;
    // match the skinned mesh's own node transform so the shared bind matrix and
    // skeleton land it exactly on the shell it shadows
    inner.position.copy(mesh.position);
    inner.quaternion.copy(mesh.quaternion);
    inner.scale.copy(mesh.scale);
    (mesh.parent || mesh).add(inner);
    inner.bind(mesh.skeleton, mesh.bindMatrix.clone());
    inner.visible = false;
    f.socket = inner;
  }

  const bySide = new Map(found.map((f) => [f.side, f]));
  return {
    mesh,
    sides: found.map((f) => f.side),
    info: () => found.map((f) => ({
      side: f.side, tris: f.tris, armTris: f.armTris.length,
      cutT: +f.cutT.toFixed(4), axis: f.axis.toArray().map((x) => +x.toFixed(3)),
      separation: +(f.cut.score / f.cut.total).toFixed(4),
      socket: !!f.socket, detached: !!f.detached,
    })),
    isDetached: (side) => !!bySide.get(side)?.detached,
    detach(side) {
      const f = bySide.get(side);
      if (!f || f.detached) return false;
      f.detached = true;
      f.material.visible = false;
      if (f.socket) f.socket.visible = true;
      return true;
    },
    attach(side) {
      const f = bySide.get(side);
      if (!f) return false;
      f.detached = false;
      f.material.visible = true;
      if (f.socket) f.socket.visible = false;
      return true;
    },
    /**
     * Bake the fist's CURRENT posed geometry into a standalone group for the
     * projectile to wear: real geometry, real material, real PBR maps, plus its
     * own dark interior layer so it is not hollow from behind.
     * Baked into a frame whose +Z is the punch axis, centred on the fist, because
     * the carrier orients itself by pointing its +Z down the velocity
     * (SPECS.fist.faceVel) and spins about its own centre.
     */
    snapshot(side) {
      const f = bySide.get(side);
      const g = f?.group;
      if (!g?.count) return null;
      // vertex -> world: mesh.matrixWorld * bindMatrixInverse * (bone.matrixWorld
      // * boneInverse) * bindMatrix  — three.js skinning with weight 1 on the
      // wrist. The fist rides the wrist AND its rigid tip child, whose
      // bind->current transforms are identical, so one matrix is exact for every
      // fist vertex however the two bones split them.
      mesh.updateMatrixWorld(true);
      f.handBone.updateMatrixWorld(true);
      const M = new THREE.Matrix4()
        .multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse)
        .multiply(new THREE.Matrix4().multiplyMatrices(
          f.handBone.matrixWorld, mesh.skeleton.boneInverses[f.handIndex]))
        .multiply(mesh.bindMatrix);
      const NM = new THREE.Matrix3().getNormalMatrix(M);

      const index = geo.index.array;
      const nrm = geo.attributes.normal, uv = geo.attributes.uv;
      const verts = [], norms = [], uvs = [], tri = [];
      const seen = new Map();
      const p = new THREE.Vector3();
      for (let i = g.start; i < g.start + g.count; i++) {
        const vi = index[i];
        let n = seen.get(vi);
        if (n === undefined) {
          n = verts.length / 3;
          seen.set(vi, n);
          p.fromBufferAttribute(pos, vi).applyMatrix4(M);
          verts.push(p.x, p.y, p.z);
          // carry the ORIGINAL normals and UVs: without uv the albedo/normal/
          // roughness maps all sample one texel and the fist flies as a flat blob
          if (nrm) {
            p.fromBufferAttribute(nrm, vi).applyMatrix3(NM).normalize();
            norms.push(p.x, p.y, p.z);
          }
          if (uv) uvs.push(uv.getX(vi), uv.getY(vi));
        }
        tri.push(n);
      }
      // local frame: +Z along the punch axis, origin at the fist's centre
      const axisW = f.axis.clone().transformDirection(M).normalize();
      const centre = new THREE.Vector3();
      for (let i = 0; i < verts.length; i += 3) {
        centre.x += verts[i]; centre.y += verts[i + 1]; centre.z += verts[i + 2];
      }
      centre.multiplyScalar(3 / verts.length);
      const q = new THREE.Quaternion().setFromUnitVectors(axisW, new THREE.Vector3(0, 0, 1));

      const arr = new Float32Array(verts.length);
      for (let i = 0; i < verts.length; i += 3) {
        p.set(verts[i], verts[i + 1], verts[i + 2]).sub(centre).applyQuaternion(q);
        arr[i] = p.x; arr[i + 1] = p.y; arr[i + 2] = p.z;
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      fg.setIndex(tri);
      if (uvs.length) fg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      if (norms.length === arr.length) {
        const na = new Float32Array(norms.length);
        for (let i = 0; i < norms.length; i += 3) {
          p.set(norms[i], norms[i + 1], norms[i + 2]).applyQuaternion(q).normalize();
          na[i] = p.x; na[i + 1] = p.y; na[i + 2] = p.z;
        }
        fg.setAttribute('normal', new THREE.Float32BufferAttribute(na, 3));
      } else {
        fg.computeVertexNormals();
      }

      const group = new THREE.Group();
      // The projectile's material is built ONCE per side and reused: the fist is
      // thrown every few seconds for the length of a match, and cloning a PBR
      // material (and stranding the last one) each time is a slow leak. The
      // geometry does have to be rebaked per throw — it captures the live pose —
      // so the previous bake is disposed here rather than left to the GC.
      if (!f.flyMaterial) {
        f.flyMaterial = f.material.clone();
        f.flyMaterial.visible = true;   // the on-body copy is hidden; this one is not
      }
      if (f.lastSnapGeo) f.lastSnapGeo.dispose();
      f.lastSnapGeo = fg;
      const fm = new THREE.Mesh(fg, f.flyMaterial);
      fm.castShadow = true;
      fm.frustumCulled = false;
      group.add(fm);
      // its own cut face: the same dark interior treatment as the socket
      const back = new THREE.Mesh(fg, interiorMat);
      back.frustumCulled = false;
      group.add(back);
      return group;
    },
  };
}
