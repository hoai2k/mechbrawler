// Sub-meshes of a GLB's one skinned mesh, scoped to a set of BONES.
//
// A procedural mech is a tree of real Object3Ds, so anything that wants to dress
// a limb — the charge-tell glow sheath, the rocket fist's cut interior — just
// traverses that limb's joint and works on the meshes it finds. A GLB has no
// geometry on the joints at all: it is ONE skinned mesh whose vertices ride
// bones. These helpers are the equivalent: pick the triangles that ride a limb's
// bones, and hand back a mesh over just those, SHARING the original's vertex
// buffers and skeleton so it deforms with the body and costs no extra memory.
import * as THREE from 'three';

// A geometry that SHARES another's vertex attributes but carries its own index —
// a sub-mesh with no duplicated vertex data.
export function subGeometry(src, triangles, idx) {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) {
    if (src.attributes[name]) g.setAttribute(name, src.attributes[name]);
  }
  const arr = new Uint32Array(triangles.length * 3);
  for (let i = 0; i < triangles.length; i++) {
    const t = triangles[i];
    arr[i * 3] = idx.getX(t * 3);
    arr[i * 3 + 1] = idx.getX(t * 3 + 1);
    arr[i * 3 + 2] = idx.getX(t * 3 + 2);
  }
  g.setIndex(new THREE.BufferAttribute(arr, 1));
  return g;
}

// Every bone index at or below `roots` in the skeleton. The procedural side
// traverses a joint's SUBTREE (dressing shoulderL also dresses the elbow, hand
// and fist hanging off it), so the bone version has to walk down too.
export function boneSubtreeIndices(mesh, roots) {
  const bones = mesh.skeleton.bones;
  const idxOf = new Map(bones.map((b, i) => [b, i]));
  const out = new Set();
  for (const r of roots) {
    if (!r) continue;
    r.traverse((o) => {
      const i = idxOf.get(o);
      if (i !== undefined) out.add(i);
    });
  }
  return out;
}

// Triangles whose every vertex rides one of `boneIndices`. Whole triangles only,
// so a shell never has torn edges hanging off the limb it dresses.
export function trianglesForBones(mesh, boneIndices) {
  const geo = mesh.geometry;
  const idx = geo.index;
  const si = geo.attributes.skinIndex;
  if (!idx || !si || !boneIndices.size) return [];
  const on = new Uint8Array(si.count);
  for (let i = 0; i < si.count; i++) if (boneIndices.has(si.getX(i))) on[i] = 1;
  const tris = [];
  for (let t = 0; t < idx.count / 3; t++) {
    const a = idx.getX(t * 3), b = idx.getX(t * 3 + 1), c = idx.getX(t * 3 + 2);
    if (on[a] && on[b] && on[c]) tris.push(t);
  }
  return tris;
}

// The GLB's one BODY mesh — the skinned mesh carrying the whole model, as
// opposed to the sub-meshes built above (charge shells, the fist socket's
// interior layer), which SHARE its vertex buffers and so can't be told apart by
// vertex count. They can by index count: the body owns every triangle.
export function bodySkinnedMesh(root) {
  let best = null, bestTris = -1;
  root.traverse((o) => {
    if (!o.isSkinnedMesh || !o.geometry?.index) return;
    const n = o.geometry.index.count;
    if (n > bestTris) { best = o; bestTris = n; }
  });
  return best;
}

// Lowest WORLD y of the geometry riding `rootBone`'s subtree, in whatever pose
// the skeleton is in RIGHT NOW. Full skinning math (bindMatrix / boneInverse),
// so it reports where those vertices actually render rather than where the bone
// sits. Weight-1 approximation: a vertex is placed by its primary bone only,
// which is what the callers want (how deep is this foot?), not a shaded normal.
const _m = new THREE.Matrix4();
const _b = new THREE.Matrix4();
const _v = new THREE.Vector3();
export function boneLowestY(mesh, rootBone) {
  const geo = mesh.geometry;
  const si = geo.attributes.skinIndex, pos = geo.attributes.position;
  if (!si || !pos || !rootBone) return null;
  const set = boneSubtreeIndices(mesh, [rootBone]);
  if (!set.size) return null;
  const bi = mesh.skeleton.bones.indexOf(rootBone);
  if (bi < 0) return null;
  mesh.updateMatrixWorld(true);
  rootBone.updateMatrixWorld(true);
  _m.multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse)
    .multiply(_b.multiplyMatrices(rootBone.matrixWorld, mesh.skeleton.boneInverses[bi]))
    .multiply(mesh.bindMatrix);
  let min = Infinity;
  for (let i = 0; i < si.count; i++) {
    if (!set.has(si.getX(i))) continue;
    _v.fromBufferAttribute(pos, i).applyMatrix4(_m);
    if (_v.y < min) min = _v.y;
  }
  return Number.isFinite(min) ? min : null;
}

// The SOLE of the foot riding `rootBone`: the lowest world y (as boneLowestY),
// plus a spread of sample points from the bottom `band` (fraction of the foot's
// height) expressed in the BONE'S OWN frame. Those points are pose-independent —
// nothing in the engine animates a toe or heel bone relative to its ankle — so a
// caller can find where the sole is in any later frame with a handful of matrix
// transforms instead of re-walking thousands of skinned vertices.
export function boneSoleSamples(mesh, rootBone, band = 0.25, maxPts = 24) {
  const geo = mesh.geometry;
  const si = geo.attributes.skinIndex, pos = geo.attributes.position;
  if (!si || !pos || !rootBone) return null;
  const set = boneSubtreeIndices(mesh, [rootBone]);
  const bi = mesh.skeleton.bones.indexOf(rootBone);
  if (!set.size || bi < 0) return null;
  mesh.updateMatrixWorld(true);
  rootBone.updateMatrixWorld(true);
  _m.multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse)
    .multiply(_b.multiplyMatrices(rootBone.matrixWorld, mesh.skeleton.boneInverses[bi]))
    .multiply(mesh.bindMatrix);
  const inv = rootBone.matrixWorld.clone().invert();
  const local = [];
  let lowest = Infinity, highest = -Infinity;
  for (let i = 0; i < si.count; i++) {
    if (!set.has(si.getX(i))) continue;
    const w = _v.fromBufferAttribute(pos, i).applyMatrix4(_m).y;
    if (w < lowest) lowest = w;
    if (w > highest) highest = w;
    local.push({ y: w, p: _v.clone().applyMatrix4(inv) });
  }
  if (!local.length || !Number.isFinite(lowest)) return null;
  const cut = lowest + Math.max(1e-4, (highest - lowest) * band);
  const sole = local.filter((q) => q.y <= cut);
  // thin down to `maxPts`, keeping the very lowest and an even spread of the rest
  sole.sort((a, c) => a.y - c.y);
  const step = Math.max(1, Math.ceil(sole.length / maxPts));
  const points = [];
  for (let i = 0; i < sole.length; i += step) points.push(sole[i].p);
  if (points[0] !== sole[0].p) points.unshift(sole[0].p);
  return { lowest, points };
}

/**
 * A SkinnedMesh over the limb(s) rooted at `rootBones`, sharing `mesh`'s vertex
 * buffers, skeleton and bind matrix — so it tracks the body exactly with no
 * transform bookkeeping of its own. Returns null when nothing rides those bones.
 */
export function buildBoneShell(mesh, rootBones, material, name = 'boneShell') {
  const tris = trianglesForBones(mesh, boneSubtreeIndices(mesh, rootBones));
  if (!tris.length) return null;
  const shell = new THREE.SkinnedMesh(subGeometry(mesh.geometry, tris, mesh.geometry.index), material);
  shell.name = name;
  shell.frustumCulled = false;
  shell.castShadow = false;
  // match the skinned mesh's own node transform, then share its bind matrix
  shell.position.copy(mesh.position);
  shell.quaternion.copy(mesh.quaternion);
  shell.scale.copy(mesh.scale);
  (mesh.parent || mesh).add(shell);
  shell.bind(mesh.skeleton, mesh.bindMatrix.clone());
  return shell;
}
