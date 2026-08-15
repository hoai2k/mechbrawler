// Custom rig: replace a GLB's (often scrambled) auto-rig skeleton with a
// clean, hand-placed one whose bones ARE the game joints, then rebind the mesh
// to it with per-part rigid weights. For hard-surface mechs this is exactly
// right — each shell part rides one bone — and it lets a crab's giant claws be
// real independent arms instead of geometry welded to a leg bone.
//
// A rig is data (see src/mechs/rigs/<id>.js), authored/tuned live in the
// ?rigedit tool:
//   { bones: [{ name, parent, pos:[x,y,z] }, ...] }   // pos in MESH-LOCAL space
// Bone names that match game joints (shoulderL, handR, thighL, ...) are what
// the RigAdapter drives; extra bones (name not a joint) hold static geometry
// (a crab's spare walking legs) so it doesn't follow a driven limb.
import * as THREE from 'three';

// Geometries whose spurious welds have already been cut. Keyed by the geometry
// OBJECT so a clone is a different entry — see cutWeldTriangles.
const CUT_GEOMETRIES = new WeakSet();

const _v = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _av = new THREE.Vector3();

// nearest point-to-segment squared distance (segment a→b)
function segDist2(px, py, pz, a, b) {
  _ab.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  _av.set(px - a[0], py - a[1], pz - a[2]);
  const len2 = _ab.lengthSq();
  const t = len2 > 1e-9 ? Math.max(0, Math.min(1, _av.dot(_ab) / len2)) : 0;
  const dx = _av.x - _ab.x * t, dy = _av.y - _ab.y * t, dz = _av.z - _ab.z * t;
  return dx * dx + dy * dy + dz * dz;
}

// The spans a rig's bones compete over — every vertex joins the bone whose
// span it sits nearest. Which span a bone gets depends on `rig.skinSpan`:
//
//   'parent' (DEFAULT) — one span per bone, bone→its parent. The original
//     behaviour; cranky/glacier/jerry are placed and bias-tuned against it.
//   'child' — one span per bone→child pair (a leaf gets a point at its own
//     position), so a bone owns the limb hanging BELOW it.
//
// 'child' is the one that deforms correctly. three.js pivots a bone's
// vertices about that bone's OWN origin, so the slice a joint should carry is
// the one on the far side of it from the body: under 'parent' the upper arm
// belongs to `elbow`, and bending the elbow swings the upper arm around the
// elbow — the shoulder end flies off the body — instead of swinging the
// forearm. Opt in per rig; it changes which bone every vertex lands on, so an
// existing rig can't be switched without re-tuning its `bias` values.
function skinSpans(rig) {
  const index = Object.fromEntries(rig.bones.map((b, i) => [b.name, i]));
  const span = (b, other) => ({ idx: index[b.name], a: b.pos, b: other, bias: b.bias || 1 });
  if (rig.skinSpan !== 'child') {
    return rig.bones.map((b) => span(b,
      b.parent && index[b.parent] !== undefined ? rig.bones[index[b.parent]].pos : b.pos));
  }
  const kids = new Map();
  for (const b of rig.bones) {
    if (!b.parent || index[b.parent] === undefined) continue;
    if (!kids.has(b.parent)) kids.set(b.parent, []);
    kids.get(b.parent).push(b);
  }
  const spans = [];
  for (const b of rig.bones) {
    const cs = kids.get(b.name);
    if (!cs?.length) spans.push(span(b, b.pos));            // leaf: a point at the tip
    else for (const c of cs) spans.push(span(b, c.pos));    // one span per limb below it
  }
  return spans;
}

// Compute a per-vertex bone assignment for `rig` against `mesh` geometry
// (mesh-local positions). Each vertex → the bone whose span (see skinSpans) is
// nearest. Returns {skinIndex, skinWeight}.
//
// RIGID by default (weight 1 on the winner): every shell part rides exactly one
// bone, which is what hard-surface mechs want.
//
// `rig.softSkin = <rings>` opts into a SOFT SEAM instead: after the rigid
// assignment, the weights are relaxed across the mesh's own CONNECTIVITY for
// that many rings, so a boundary becomes a short gradient over the triangles
// that actually cross it.
//
// Why it's needed: a service GLB is one welded shell — the arm surface runs
// continuously into the torso at the armpit/waist. A rigid split there is a
// hard tear: the vertices on the body side stay put while their triangle-mates
// on the arm side fly away, so a raised arm drags a FAN of stretched polygons
// (measured on rhino: +0.83 mesh units, clearly visible in the uppercut).
//
// Why it relaxes over CONNECTIVITY and not distance: rhino's arm hangs a few
// centimetres from his hip, so a distance band blends the pauldron's inner face
// with the body it merely floats next to — half the shoulder plate then drags
// on a hip turn. Topology can tell the two apart: the weld strip is a handful
// of triangles wide, while the facing surfaces across an air gap are far apart
// on the mesh graph and stay rigid. Position-welded duplicates (UV/normal seam
// splits) are unified first, or the relaxation would stop dead at every seam.
export function computeWeights(mesh, rig) {
  const pos = mesh.geometry.attributes.position;
  const n = pos.count;
  // a bone may over-reach: `bias` widens (<1) / narrows (>1) its win radius
  const segs = skinSpans(rig);
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const dom = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let best = 0, bestD = Infinity;
    for (const s of segs) {
      const d = segDist2(x, y, z, s.a, s.b) * s.bias;
      if (d < bestD) { bestD = d; best = s.idx; }
    }
    dom[i] = best;
    skinIndex[i * 4] = best;
    skinWeight[i * 4] = 1;
  }
  // cut spurious limb-to-limb welds BEFORE relaxing: the relaxation walks mesh
  // connectivity, and diffusing weights across a membrane that is about to be
  // deleted would smear the arm's weights onto the hip for nothing
  if (rig.cutWelds) {
    const cut = cutWeldTriangles(mesh, rig, dom, typeof rig.cutWelds === 'number' ? rig.cutWelds : 3);
    if (cut) console.debug(`reskin: cut ${cut} weld triangle(s) bridging unrelated limbs`);
  }
  const rings = rig.softSkin | 0;
  if (rings > 0) relaxWeights(mesh, skinIndex, skinWeight, dom, rings);
  return { skinIndex, skinWeight };
}

// Relax rigid weights across mesh connectivity (see computeWeights). Each pass
// mixes a vertex's weights with the mean of its neighbours', keeping the top 4
// influences (three.js' limit). In place on skinIndex/skinWeight.
function relaxWeights(mesh, skinIndex, skinWeight, dom, rings) {
  const geo = mesh.geometry;
  const idx = geo.index;
  if (!idx) return;
  const pos = geo.attributes.position;
  const n = pos.count;
  // ---- weld map: vertices at the same position are one surface point ----
  const rep = new Int32Array(n);
  const firstAt = new Map();
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    const f = firstAt.get(key);
    if (f === undefined) { firstAt.set(key, i); rep[i] = i; } else rep[i] = f;
  }
  // ---- neighbour lists over welded representatives (CSR) ----
  const deg = new Uint16Array(n);
  const bump = (a, b) => { if (a !== b) { deg[a]++; deg[b]++; } };
  for (let t = 0; t < idx.count; t += 3) {
    const a = rep[idx.getX(t)], b = rep[idx.getX(t + 1)], c = rep[idx.getX(t + 2)];
    bump(a, b); bump(b, c); bump(c, a);
  }
  const start = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) start[i + 1] = start[i] + deg[i];
  const adj = new Uint32Array(start[n]);
  const fill = start.slice(0, n);
  const put = (a, b) => { if (a !== b) { adj[fill[a]++] = b; adj[fill[b]++] = a; } };
  for (let t = 0; t < idx.count; t += 3) {
    const a = rep[idx.getX(t)], b = rep[idx.getX(t + 1)], c = rep[idx.getX(t + 2)];
    put(a, b); put(b, c); put(c, a);
  }
  // ---- iterate: w = 0.5*own + 0.5*neighbour mean, truncated to 4 bones ----
  let curI = skinIndex, curW = skinWeight;
  let nxtI = new Uint16Array(n * 4), nxtW = new Float32Array(n * 4);
  const accB = new Int32Array(16), accW = new Float64Array(16);
  for (let pass = 0; pass < rings; pass++) {
    for (let i = 0; i < n; i++) {
      const r = rep[i];
      if (r !== i) continue;                        // duplicates copied below
      let m = 0;
      const add = (bone, w) => {
        for (let k = 0; k < m; k++) if (accB[k] === bone) { accW[k] += w; return; }
        if (m < 16) { accB[m] = bone; accW[m] = w; m++; }
      };
      for (let k = 0; k < 4; k++) if (curW[i * 4 + k] > 0) add(curI[i * 4 + k], curW[i * 4 + k] * 0.5);
      const s = start[r], e = start[r + 1];
      const share = e > s ? 0.5 / (e - s) : 0;
      for (let p = s; p < e; p++) {
        const j = adj[p];
        for (let k = 0; k < 4; k++) if (curW[j * 4 + k] > 0) add(curI[j * 4 + k], curW[j * 4 + k] * share);
      }
      // keep the 4 heaviest, renormalized; a vertex whose neighbourhood agrees
      // stays exactly rigid (one bone at weight 1)
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        let bi = -1, bw = 0;
        for (let q = 0; q < m; q++) if (accW[q] > bw) { bw = accW[q]; bi = q; }
        if (bi < 0) { nxtI[i * 4 + k] = 0; nxtW[i * 4 + k] = 0; continue; }
        nxtI[i * 4 + k] = accB[bi]; nxtW[i * 4 + k] = bw; sum += bw;
        accW[bi] = 0;
      }
      if (sum > 0) for (let k = 0; k < 4; k++) nxtW[i * 4 + k] /= sum;
    }
    for (let i = 0; i < n; i++) {
      const r = rep[i];
      if (r === i) continue;
      for (let k = 0; k < 4; k++) { nxtI[i * 4 + k] = nxtI[r * 4 + k]; nxtW[i * 4 + k] = nxtW[r * 4 + k]; }
    }
    const ti = curI, tw = curW;
    curI = nxtI; curW = nxtW;
    nxtI = ti === skinIndex ? new Uint16Array(n * 4) : ti;
    nxtW = tw === skinWeight ? new Float32Array(n * 4) : tw;
  }
  if (curI !== skinIndex) { skinIndex.set(curI); skinWeight.set(curW); }
  // dominant bone is unchanged by design (relaxation only softens the edges),
  // so analyzeSkin/skinOps island ids stay stable
  for (let i = 0; i < n; i++) {
    if (skinWeight[i * 4] > 0) continue;
    skinIndex[i * 4] = dom[i]; skinWeight[i * 4] = 1;
  }
}

// Cut the shell where it welds two limbs that NO joint connects.
//
// A service auto-mesher returns one continuous shell: rhino's arms hang a few
// centimetres from his hips, and the mesher spans that air gap with a hidden
// membrane joining the inner arm to the hip armour. It is invisible at rest —
// and then an uppercut drags it out into a metre-long fan of shards, because
// its two ends ride limbs that swing apart. No weighting fixes that: the
// geometry itself claims the arm and the hip are one surface.
//
// So drop those triangles. The rule is conservative: only cut a triangle whose
// vertices land on bones at least `minDist` links apart in the rig (default 3).
// Every real armour joint — knee/thigh, elbow/shoulder, torso/hips — is 1 or 2
// links, so those seams are never touched; 3+ means "arm welded to hip", which
// on a mech is always spurious. The hole left behind sits inside the gap the
// membrane was spanning, hidden by the surrounding plates.
//
// Enable with `cutWelds: true` (or a number = minDist) on the rig. A pair that
// the distance rule can't reach — a shoulder welded to the hip it hangs beside
// is only 2 links apart, via the torso — is named explicitly in
// `cutPairs: [['hips','shoulderL'], ...]`; those two bones then never share a
// triangle. Use it only for surfaces that face each other across a gap, never
// for a real joint (thigh/hips is also 2 links, and cutting it would hole the
// pelvis).
function cutWeldTriangles(mesh, rig, dom, minDist) {
  const geo = mesh.geometry;
  const idx = geo.index;
  if (!idx) return 0;
  // once per geometry: ?rigedit re-runs computeWeights on every gizmo move, and
  // a second cut would erode the mesh further with each nudge (the triangles
  // removed the first time can never come back).
  //
  // The mark lives in a WeakSet, NOT in geometry.userData: BufferGeometry.clone()
  // hands the clone the SAME userData object, so a userData flag set on one
  // build's private clone marked the shared cached geometry too — and every
  // later build of that GLB then skipped its cut and kept the welds. That is
  // what made the same model render differently depending on what had been
  // loaded before it (arm-to-hip membranes present, stretching but not
  // following the arm).
  if (CUT_GEOMETRIES.has(geo)) return 0;
  CUT_GEOMETRIES.add(geo);
  // hierarchy distance between rig bones (BFS over parent links)
  const order = rig.bones.map((b) => b.name);
  const at = new Map(order.map((n, i) => [n, i]));
  const nB = order.length;
  const adjB = rig.bones.map(() => []);
  rig.bones.forEach((b, i) => {
    const p = at.get(b.parent);
    if (p !== undefined) { adjB[i].push(p); adjB[p].push(i); }
  });
  const dist = new Uint8Array(nB * nB).fill(255);
  for (let s = 0; s < nB; s++) {
    const q = [s]; dist[s * nB + s] = 0;
    while (q.length) {
      const u = q.shift();
      for (const v of adjB[u]) if (dist[s * nB + v] === 255) { dist[s * nB + v] = dist[s * nB + u] + 1; q.push(v); }
    }
  }
  // explicit never-share pairs, as a symmetric lookup
  const banned = new Set();
  for (const [x, y] of rig.cutPairs || []) {
    const i = at.get(x), j = at.get(y);
    if (i === undefined || j === undefined) { console.warn(`reskin: cutPairs names an unknown bone (${x}/${y})`); continue; }
    banned.add(i * nB + j); banned.add(j * nB + i);
  }
  const src = idx.array;
  const keep = new (src.constructor)(src.length);
  let w = 0, cut = 0;
  const bad = (p, q) => dist[p * nB + q] >= minDist || banned.has(p * nB + q);
  for (let t = 0; t < src.length; t += 3) {
    const a = dom[src[t]], b = dom[src[t + 1]], c = dom[src[t + 2]];
    if (bad(a, b) || bad(b, c) || bad(a, c)) { cut++; continue; }
    keep[w++] = src[t];
    keep[w++] = src[t + 1];
    keep[w++] = src[t + 2];
  }
  if (!cut) return 0;
  const kept = dropCutFragments(keep.slice(0, w), src, geo.attributes.position.count);
  if (kept.length !== w) console.debug(`reskin: dropped ${(w - kept.length) / 3} orphan fragment triangle(s)`);
  geo.setIndex(new THREE.BufferAttribute(kept, 1));
  return cut;
}

// After a cut, the membrane rarely comes away whole: a few hundred triangles of
// it stay attached to the arm as an ISLAND floating in the gap. At rest it's
// buried; raise the arm and it sails out as loose chunks. So drop the small
// islands the cut created — identified as components that both (a) touch a
// vertex the cut orphaned and (b) are a rounding error next to the body. A part
// the model always had as its own island is untouched: it never lost an edge.
function dropCutFragments(keptIdx, srcIdx, nVerts) {
  const touched = new Uint8Array(nVerts);          // verts that lost a triangle
  {
    const still = new Set();
    for (let i = 0; i < keptIdx.length; i++) still.add(keptIdx[i]);
    const seenTri = new Set();
    for (let t = 0; t < keptIdx.length; t += 3) seenTri.add(`${keptIdx[t]},${keptIdx[t + 1]},${keptIdx[t + 2]}`);
    for (let t = 0; t < srcIdx.length; t += 3) {
      if (seenTri.has(`${srcIdx[t]},${srcIdx[t + 1]},${srcIdx[t + 2]}`)) continue;
      touched[srcIdx[t]] = 1; touched[srcIdx[t + 1]] = 1; touched[srcIdx[t + 2]] = 1;
    }
    if (!still.size) return keptIdx;
  }
  // union-find over the surviving triangles
  const par = new Int32Array(nVerts).fill(-1);
  const find = (a) => { let r = a; while (par[r] >= 0) r = par[r]; while (par[a] >= 0) { const q = par[a]; par[a] = r; a = q; } return r; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[b] = a; };
  for (let t = 0; t < keptIdx.length; t += 3) { uni(keptIdx[t], keptIdx[t + 1]); uni(keptIdx[t + 1], keptIdx[t + 2]); }
  const size = new Int32Array(nVerts), hit = new Uint8Array(nVerts);
  for (let t = 0; t < keptIdx.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const r = find(keptIdx[t + k]);
      size[r]++;
      if (touched[keptIdx[t + k]]) hit[r] = 1;
    }
  }
  const limit = Math.max(64, nVerts * 0.005);
  let w = 0;
  const out = new (keptIdx.constructor)(keptIdx.length);
  for (let t = 0; t < keptIdx.length; t += 3) {
    const r = find(keptIdx[t]);
    if (hit[r] && size[r] < limit) continue;
    out[w++] = keptIdx[t]; out[w++] = keptIdx[t + 1]; out[w++] = keptIdx[t + 2];
  }
  return w === keptIdx.length ? keptIdx : out.slice(0, w);
}

// Build a bone hierarchy from rig data. Positions are MESH-LOCAL; bind pose is
// rotation-free so each bone's LOCAL position = its world pos minus the
// parent's. Returns { bones, byName, root }.
export function buildSkeletonBones(rig) {
  const byName = {};
  const bones = [];
  // NO BONE BELOW THE FLOOR. Rig positions are mesh-local with y 0 = the ground
  // the mech stands on (see any rigs/*.rig.js header), so a negative y is a bone
  // UNDER the arena floor — and the geometry it owns is dragged down there with
  // it. That is easy to author by accident when dropping an ankle onto a sole
  // (the sole IS y 0) and easier still on the bones parented under it, which
  // inherit the move. Clamp instead of trusting it, and say so once: a silent
  // buried foot reads as "the model sinks" and sends the search into the
  // animator. `node tools/ankleprobe.mjs` is the measurement that proves the
  // shipped rigs are clear of the floor, and it fails loudly if one isn't.
  const buried = rig.bones.filter((bd) => bd.pos[1] < 0);
  if (buried.length) {
    console.warn('rig: bone(s) below the floor, clamped to y 0 — '
      + buried.map((bd) => `${bd.name} (${bd.pos[1].toFixed(3)})`).join(', '));
  }
  const rigBones = buried.length
    ? rig.bones.map((bd) => (bd.pos[1] < 0 ? { ...bd, pos: [bd.pos[0], 0, bd.pos[2]] } : bd))
    : rig.bones;
  rig = { ...rig, bones: rigBones };
  for (const bd of rig.bones) {
    const bone = new THREE.Bone();
    bone.name = bd.name;
    byName[bd.name] = bone;
    bones.push(bone);
  }
  let root = null;
  for (const bd of rig.bones) {
    const bone = byName[bd.name];
    if (bd.parent && byName[bd.parent]) {
      const pp = rig.bones.find((b) => b.name === bd.parent).pos;
      byName[bd.parent].add(bone);
      bone.position.set(bd.pos[0] - pp[0], bd.pos[1] - pp[1], bd.pos[2] - pp[2]);
    } else {
      bone.position.set(bd.pos[0], bd.pos[1], bd.pos[2]);
      root = bone;
    }
  }
  return { bones, byName, root };
}

// Wire visible "posts" (metal rods) through the rig — for every bone flagged
// `post` in the rig, a cylinder from its PARENT to it, parented to the parent
// bone so it follows the animation and bends at each joint. Purely generated
// from the current bone positions, so it survives any rig edit: move a bone and
// the post moves, add a bone (with post) and a new segment appears. Fills in a
// limb the GLB never modeled (jerry's back legs). Returns the meshes so the
// caller can dispose + rebuild them after an edit. General — any rig can use it.
//   bone.post: true | { radius?, color? }
export function buildRigPosts(byName, rig, opts = {}) {
  const meshes = [];
  const up = new THREE.Vector3(0, 1, 0);
  const to = new THREE.Vector3();
  const byBd = Object.fromEntries(rig.bones.map((b) => [b.name, b]));
  for (const bd of rig.bones) {
    if (!bd.post || !bd.parent) continue;
    const bone = byName[bd.name], parent = byName[bd.parent];
    if (!bone || !parent) continue;
    to.copy(bone.position);                 // child's local offset from parent (bind)
    const len = to.length();
    if (len < 1e-4) continue;
    const cfg = typeof bd.post === 'object' ? bd.post : {};
    const r = cfg.radius ?? opts.radius ?? 0.02;
    const geo = new THREE.CylinderGeometry(r, r, len, 10);
    geo.translate(0, len / 2, 0);           // base at the parent joint, extends toward the child
    const mat = new THREE.MeshStandardMaterial({
      color: cfg.color ?? opts.color ?? 0x0b0b0e, roughness: 0.45, metalness: 0.85,
    });
    const m = new THREE.Mesh(geo, mat);
    m.quaternion.setFromUnitVectors(up, to.clone().normalize());
    m.castShadow = true;
    m.userData.rigPost = bd.name;
    parent.add(m);
    meshes.push(m);
    // a little cap sphere at the joint so segments read as one continuous rod
    if (byBd[bd.name]?.post) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 1.25, 10, 8), mat);
      bone.add(cap); meshes.push(cap);
    }
  }
  return meshes;
}

// Re-write the mesh's per-vertex weights from the current rig (used live by
// ?rigedit after a bone is moved) without touching the skeleton binding.
export function setWeights(mesh, rig) {
  const { skinIndex, skinWeight } = computeWeights(mesh, rig);
  mesh.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  mesh.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
}

// Recapture the CURRENT bone poses as the bind pose (so the mesh renders at
// rest for whatever positions the bones are in now). Used after a gizmo move
// so editing bind positions never deforms the model.
export function rebindRest(mesh, bones) {
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones), mesh.matrixWorld.clone());
}

// Replace `mesh`'s skeleton with a fresh hand-placed one and rebind. The bones
// are placed in mesh-LOCAL space and parented under the mesh's own parent, so
// they inherit the model's transform (scale/ground/yaw) exactly like the
// original armature did. Returns { bones, byName, root, skeleton }.
export function applyCustomRig(mesh, rig) {
  // Own the geometry before rewriting skin weights. cloneSkinned shares
  // geometry across clones (and the cached gltf scene), so re-skinning in place
  // would corrupt every other user of this GLB — notably a same-file variant
  // (glacier's `alt` is the same GLB as its Tripo primary). A private clone
  // keeps the re-skin local to this build.
  mesh.geometry = mesh.geometry.clone();
  const { bones, byName, root } = buildSkeletonBones(rig);
  // No root = an empty rig, or every bone naming a parent (typo/cycle). Say so
  // instead of letting the next line throw on null — callers (createMech, the
  // ?rigedit preflight) can then report something a human can act on.
  if (!root) {
    throw new Error(`custom rig has no root bone (${rig.bones?.length || 0} bones): `
      + 'exactly one bone must have parent: null');
  }

  // place the bone tree in the SAME space the geometry lives in. mesh.matrix
  // maps mesh-local → parent space; bones authored in mesh-local must be
  // pre-multiplied by it so they land on the geometry when parented to
  // mesh.parent (Tripo SkinnedMeshes usually sit at identity, but don't assume).
  const parent = mesh.parent || mesh;
  mesh.updateMatrix();
  root.applyMatrix4(mesh.matrix);   // fold mesh-local→parent-space into the root
  parent.add(root);
  parent.updateMatrixWorld(true);

  const { skinIndex, skinWeight } = computeWeights(mesh, rig);
  mesh.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  mesh.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));

  const skeleton = new THREE.Skeleton(bones);
  mesh.updateMatrixWorld(true);
  mesh.bind(skeleton, mesh.matrixWorld.clone());
  return { bones, byName, root, skeleton };
}
