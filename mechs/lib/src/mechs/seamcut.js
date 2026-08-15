// SEAM CUTS — separate two body parts the mesher welded into one surface.
//
// THE PROBLEM. A service auto-mesher returns one continuous shell. Where two
// parts sit close together at bind pose — jerry's claw-arm wrists resting
// against his shell — it happily runs triangles from one to the other. No
// weighting can fix that: the geometry itself claims the hand and the torso are
// the same surface, so when the arm swings, whichever end loses the argument is
// dragged across the arena as a fan of shards. (That is findings 1-3 of
// `?edit=skindebug&mech=jerry`: 240x and 280x stretch, in every clip that moves
// an arm.)
//
// reskin.js already has `cutWelds` for the same illness, and DELETES the
// offending triangles. That is right for rhino, where the weld is a hidden
// membrane spanning an air gap: dropping it leaves a hole nobody can see. It is
// wrong here. Jerry's bridge triangles are ordinary-sized surface (median area
// half the mesh's own), part of the visible shell around the arm root — delete
// them and you punch a window into the robot.
//
// SO THIS ONE CUTS RATHER THAN DELETES:
//
//  1. SPLIT. Every triangle that spans the two sides is assigned to ONE of them
//     (by which side carries more skin weight across its three corners). Any
//     corner belonging to the other side is replaced by a DUPLICATE vertex —
//     same position, same UV, bound to the side the triangle went to. The two
//     surfaces now share no vertices, so nothing pulls on anything.
//     At bind pose not one pixel moves: the duplicates sit exactly on top of
//     the originals. The split only becomes visible when the arm does.
//
//  2. UNBLEND. A vertex on the torso keeps no hand weight, and a vertex on the
//     hand keeps no torso weight (renormalized over what is left). This is the
//     other half of the same fix: the geometry stops being shared AND the
//     weights stop reaching across.
//
//  3. CAP. Splitting a closed shell leaves each side open along the cut, and an
//     open shell renders as a hole into an unlit interior the moment the joint
//     swings. So each rim is closed with a fan to its own centre — its own
//     vertices, its own flat normal, its own side's bone, wound to match the
//     side it caps. Two lids that start out coincident and part with the joint,
//     which is exactly what an armour gap should do.
//
// DRIVEN BY THE MANIFEST, per model, because which parts are wrongly welded is
// a fact about one mesh and not about the game:
//
//   "seamCuts": [{ "a": ["handL", "handR"], "b": ["torso"], "cap": true }]
//
// A vertex is on side `a` / `b` when its DOMINANT bone is named there; a rule
// with no bridging triangles is a no-op, so a rule can stay in the manifest
// after a re-mesh fixes the model. Runs immediately after skinOps in
// buildGlbMech (it reads the final weights, so it sees the hand-authored
// rebinds), once per geometry — the shell is shared by every clone.
import * as THREE from 'three';

// Once per geometry, for the same reason reskin.js keeps its own: clone() hands
// the copy the SAME userData object, so a flag stored there would mark the
// shared cached geometry too and every later build would skip its cut.
const CUT_GEOMETRIES = new WeakSet();

const NONE = 0, A = 1, B = 2;

/**
 * Apply a model's seam cuts. Mutates the geometry (index + attributes grow).
 * @param {THREE.SkinnedMesh} mesh
 * @param {Array} cuts  manifest `seamCuts` entries: { a:[bone], b:[bone], cap }
 * @returns {null|{rules:[], addedVerts:number, addedTris:number}} report, or null
 */
export function applySeamCuts(mesh, cuts) {
  const geo = mesh.geometry;
  if (!cuts?.length || !geo?.index) return null;
  if (CUT_GEOMETRIES.has(geo)) return null;
  CUT_GEOMETRIES.add(geo);

  const boneIndex = new Map(mesh.skeleton.bones.map((b, i) => [b.name, i]));
  const n0 = geo.attributes.position.count;

  // Working copies as plain arrays so vertices can be appended; written back
  // once, at the end, however many rules ran.
  const w = {
    pos: Array.from(geo.attributes.position.array),
    nor: geo.attributes.normal ? Array.from(geo.attributes.normal.array) : null,
    uv: geo.attributes.uv ? Array.from(geo.attributes.uv.array) : null,
    si: Array.from(geo.attributes.skinIndex.array),
    sw: Array.from(geo.attributes.skinWeight.array),
    idx: Array.from(geo.index.array),
    // where each vertex came from, so a workbench can still address the model
    // by its ORIGINAL vertex ids (the skin tool edits the uncut raw file)
    src: Array.from({ length: n0 }, (_, i) => i),
    // original edges already closed by a lid, so a second rule cannot cap the
    // same rim twice
    capped: new Set(),
    // [startTri, endTri) ranges of the index that are LID, not shell — the cut
    // is invisible at bind pose, so a viewer needs to be told where it is
    lids: [],
    // WHICH SIDE OF WHICH CUT each vertex ended on (0 = not on a cut). Two
    // vertices sharing a position but tagged to opposite sides of the same cut
    // are MEANT to come apart; the skin audit reads this so it does not report
    // the cut it was built to make as a fresh crack.
    seamId: new Array(n0).fill(0),
    seamSide: new Array(n0).fill(0),
  };

  const report = { rules: [], addedVerts: 0, addedTris: 0 };
  cuts.forEach((rule, i) => {
    const r = cutOne(w, rule, boneIndex, i + 1);
    if (r) report.rules.push(r);
  });
  if (!report.rules.length) return null;
  report.addedVerts = w.src.length - n0;
  report.addedTris = (w.idx.length - geo.index.count) / 3;

  geo.setAttribute('position', new THREE.Float32BufferAttribute(w.pos, 3));
  if (w.nor) geo.setAttribute('normal', new THREE.Float32BufferAttribute(w.nor, 3));
  if (w.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(w.uv, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(w.si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w.sw, 4));
  // a 16-bit index cannot address a vertex the cut just added past 65535
  const IndexArray = w.src.length > 65535 ? Uint32Array : Uint16Array;
  geo.setIndex(new THREE.BufferAttribute(new IndexArray(w.idx), 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  // Vertex-id translation for the tools. The skin workbench and the rig editor
  // both work on the RAW file, which has none of these extra vertices, so a
  // finding measured on the built model has to be able to name itself in the
  // file's own numbering.
  // The compact form of the same fact, as plain arrays: which vertices sit on
  // which side of which cut. The typed arrays above are for this session; THIS
  // is what survives being written into a .glb (tools/bake-glb.mjs keeps it as
  // mesh extras), so a BAKED model can still tell the skin audit that its
  // coincident vertices were split on purpose rather than cracked.
  const seams = [];
  for (let rule = 1; rule <= cuts.length; rule++) {
    const a = [], b = [];
    for (let v = 0; v < w.seamId.length; v++) {
      if (w.seamId[v] !== rule) continue;
      (w.seamSide[v] === A ? a : b).push(v);
    }
    if (a.length || b.length) seams.push({ id: rule, a, b });
  }
  geo.userData = {
    ...geo.userData,
    seamCut: {
      count0: n0, source: new Int32Array(w.src), lids: w.lids,
      seamId: new Int32Array(w.seamId), seamSide: new Uint8Array(w.seamSide),
      seams,
    },
  };
  report.seams = seams;
  return report;
}

/** Dominant bone of vertex v, and the total weight it carries on `set`. */
function domOf(w, v) {
  let bw = -1, bi = 0;
  for (let k = 0; k < 4; k++) {
    const x = w.sw[v * 4 + k];
    if (x > bw) { bw = x; bi = w.si[v * 4 + k]; }
  }
  return bi;
}
function weightOn(w, v, set) {
  let s = 0;
  for (let k = 0; k < 4; k++) if (set.has(w.si[v * 4 + k])) s += w.sw[v * 4 + k];
  return s;
}

/** Drop every influence in `strip` from vertex v and renormalize what is left.
 *  Returns false when that would leave nothing (caller binds it rigidly). */
function stripWeights(w, v, strip) {
  let sum = 0;
  for (let k = 0; k < 4; k++) if (!strip.has(w.si[v * 4 + k])) sum += w.sw[v * 4 + k];
  if (sum <= 1e-6) return false;
  for (let k = 0; k < 4; k++) {
    if (strip.has(w.si[v * 4 + k])) { w.si[v * 4 + k] = 0; w.sw[v * 4 + k] = 0; }
    else w.sw[v * 4 + k] /= sum;
  }
  return true;
}
function bindRigid(w, v, bone) {
  w.si[v * 4] = bone; w.si[v * 4 + 1] = 0; w.si[v * 4 + 2] = 0; w.si[v * 4 + 3] = 0;
  w.sw[v * 4] = 1; w.sw[v * 4 + 1] = 0; w.sw[v * 4 + 2] = 0; w.sw[v * 4 + 3] = 0;
}
/** Append a copy of vertex `from`; returns the new index. */
function cloneVert(w, from) {
  const v = w.src.length;
  for (let k = 0; k < 3; k++) w.pos.push(w.pos[from * 3 + k]);
  if (w.nor) for (let k = 0; k < 3; k++) w.nor.push(w.nor[from * 3 + k]);
  if (w.uv) for (let k = 0; k < 2; k++) w.uv.push(w.uv[from * 2 + k]);
  for (let k = 0; k < 4; k++) { w.si.push(w.si[from * 4 + k]); w.sw.push(w.sw[from * 4 + k]); }
  w.src.push(w.src[from]);
  w.seamId.push(w.seamId[from]);
  w.seamSide.push(w.seamSide[from]);
  return v;
}

function cutOne(w, rule, boneIndex, ruleNo) {
  const named = (list) => {
    const s = new Set();
    for (const name of list || []) {
      const i = boneIndex.get(name);
      if (i === undefined) console.warn(`seamCut: no bone named "${name}"`);
      else s.add(i);
    }
    return s;
  };
  const setA = named(rule.a);
  const setB = named(rule.b);
  if (!setA.size || !setB.size) return null;

  const nV = w.src.length;
  const side = new Uint8Array(nV);
  for (let v = 0; v < nV; v++) {
    const d = domOf(w, v);
    side[v] = setA.has(d) ? A : setB.has(d) ? B : NONE;
  }

  // ---- which triangles span the two sides ----
  const tris = w.idx.length / 3;
  const triSide = new Uint8Array(tris);           // A / B / NONE, for EVERY triangle
  const bridges = [];
  for (let t = 0; t < tris; t++) {
    const a = w.idx[t * 3], b = w.idx[t * 3 + 1], c = w.idx[t * 3 + 2];
    const s = [side[a], side[b], side[c]];
    const hasA = s.includes(A), hasB = s.includes(B);
    if (!(hasA && hasB)) {
      // not a bridge, but it still has a side as far as the cut is concerned —
      // the lid has to know which surface each triangle beside the tear is on
      triSide[t] = hasA ? A : hasB ? B : NONE;
      continue;
    }
    // the side that owns more of this triangle keeps it
    const wa = weightOn(w, a, setA) + weightOn(w, b, setA) + weightOn(w, c, setA);
    const wb = weightOn(w, a, setB) + weightOn(w, b, setB) + weightOn(w, c, setB);
    triSide[t] = wa >= wb ? A : B;
    bridges.push(t);
  }
  if (!bridges.length) return null;

  // ---- which side does each corner of a bridge triangle belong to? ----
  // Its own dominant bone decides; a corner on NEITHER side (a wrist vertex
  // dominated by the elbow, say) goes to whichever side already claims more of
  // the triangles it sits in, so it cannot silently keep the two shells pinned
  // together at one point.
  const home = new Int16Array(nV).fill(-1);
  const votes = new Map();
  for (const t of bridges) {
    for (let k = 0; k < 3; k++) {
      const v = w.idx[t * 3 + k];
      if (side[v] !== NONE) { home[v] = side[v]; continue; }
      let e = votes.get(v);
      if (!e) { e = [0, 0]; votes.set(v, e); }
      e[triSide[t] === A ? 0 : 1]++;
    }
  }
  for (const [v, [va, vb]] of votes) home[v] = va >= vb ? A : B;

  // ---- the bone each duplicate should ride ----
  // The modal dominant bone of the same-side corners of the bridge triangles
  // the duplicate will serve: a hand-side copy of a torso vertex follows
  // whichever hand bone its new neighbours follow.
  const boneVotes = new Map();                    // `${v}|${side}` -> Map(bone -> n)
  for (const t of bridges) {
    const s = triSide[t];
    const want = s === A ? setA : setB;
    for (let k = 0; k < 3; k++) {
      const v = w.idx[t * 3 + k];
      if (home[v] === s) continue;                // stays as it is
      const key = `${v}|${s}`;
      let m = boneVotes.get(key);
      if (!m) { m = new Map(); boneVotes.set(key, m); }
      for (let j = 0; j < 3; j++) {
        const u = w.idx[t * 3 + j];
        const d = domOf(w, u);
        if (want.has(d)) m.set(d, (m.get(d) || 0) + 1);
      }
    }
  }
  const fallback = (s) => [...(s === A ? setA : setB)][0];
  const pickBone = (key, s) => {
    const m = boneVotes.get(key);
    if (!m || !m.size) return fallback(s);
    let best = fallback(s), bn = -1;
    for (const [bone, cnt] of m) if (cnt > bn) { bn = cnt; best = bone; }
    return best;
  };

  // ---- duplicate, and point the bridge triangles at the copies ----
  const dup = new Map();                          // `${v}|${side}` -> new index
  for (const t of bridges) {
    const s = triSide[t];
    for (let k = 0; k < 3; k++) {
      const v = w.idx[t * 3 + k];
      if (home[v] === s) continue;
      const key = `${v}|${s}`;
      let nv = dup.get(key);
      if (nv === undefined) {
        w.seamId[v] = ruleNo; w.seamSide[v] = home[v];
        nv = cloneVert(w, v);
        const bone = pickBone(key, s);
        // the copy belongs to ONE side now, so the other side's influence goes
        if (!stripWeights(w, nv, s === A ? setB : setA)) bindRigid(w, nv, bone);
        w.seamId[nv] = ruleNo; w.seamSide[nv] = s;
        dup.set(key, nv);
      }
      w.idx[t * 3 + k] = nv;
    }
  }

  // A UV seam means one point on the surface can be several vertices, and only
  // the ones the bridge triangles happened to name were tagged above. Tag every
  // vertex sharing a cut position, on the side its own weights put it, or the
  // audit sees the untagged twin part company with a duplicate and calls the
  // deliberate cut a crack.
  {
    const at = new Map();                         // position key -> vertex list
    const keyOf = (v) => `${Math.round(w.pos[v * 3] * 1e4)},${Math.round(w.pos[v * 3 + 1] * 1e4)},${Math.round(w.pos[v * 3 + 2] * 1e4)}`;
    for (let v = 0; v < w.src.length; v++) {
      const k = keyOf(v);
      let l = at.get(k);
      if (!l) { l = []; at.set(k, l); }
      l.push(v);
    }
    for (const list of at.values()) {
      if (!list.some((v) => w.seamId[v] === ruleNo)) continue;
      // the side the tagged members agree on, for anything with no side of its own
      let na = 0, nb = 0;
      for (const v of list) {
        if (w.seamId[v] !== ruleNo) continue;
        if (w.seamSide[v] === A) na++; else if (w.seamSide[v] === B) nb++;
      }
      for (const v of list) {
        if (w.seamId[v] === ruleNo) continue;
        w.seamId[v] = ruleNo;
        w.seamSide[v] = side[v] !== NONE ? side[v] : (na >= nb ? A : B);
      }
    }
  }

  // ---- unblend everything, not just the seam ----
  // "The torso geometry carries no hand component and vice versa": a vertex
  // whose dominant bone is on one side keeps no influence from the other.
  let unblended = 0;
  for (let v = 0; v < nV; v++) {
    if (side[v] === NONE) continue;
    const strip = side[v] === A ? setB : setA;
    if (weightOn(w, v, strip) <= 1e-6) continue;
    if (!stripWeights(w, v, strip)) bindRigid(w, v, domOf(w, v));
    unblended++;
  }

  const capped = rule.cap === false ? 0 : capCut(w, triSide);
  return {
    a: [...setA], b: [...setB],
    bridgeTris: bridges.length, duplicated: dup.size, unblended, capTris: capped,
  };
}

/**
 * Close both sides of the cut.
 *
 * WHERE THE TEAR IS. An edge is a cut boundary when the two triangles sharing
 * it ended up on opposite sides — that, and not "do the two triangles still
 * name the same vertices", is the honest test: a bridge triangle tears away
 * from a plain neighbour that kept the original vertex just as it does from
 * another bridge triangle.
 *
 * ADJACENCY IS BY POSITION, NOT BY VERTEX ID. These meshes are split along
 * every UV seam, so two triangles that share an edge on the surface usually
 * name it with four different vertex ids; matching ids finds barely a tenth of
 * the real neighbours. Everything here therefore keys on WELDED position, the
 * same way analyzeSkin and reskin's relaxation do.
 *
 * Winding comes for free from the DIRECTED edges: an interior edge of a closed
 * shell is traversed once each way, so the lid closing a rim edge u->v is the
 * triangle (v, u, centre). Each side is capped separately, with its own rim
 * vertices and its own flat normal, so the two lids part with the joint.
 */
function capCut(w, triSide) {
  const nV = w.src.length;
  // welded representative of every vertex, by position
  const rep = new Int32Array(nV);
  {
    const first = new Map();
    for (let v = 0; v < nV; v++) {
      const k = `${Math.round(w.pos[v * 3] * 1e4)},${Math.round(w.pos[v * 3 + 1] * 1e4)},${Math.round(w.pos[v * 3 + 2] * 1e4)}`;
      const f = first.get(k);
      if (f === undefined) { first.set(k, v); rep[v] = v; } else rep[v] = f;
    }
  }
  const key2 = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  const tris = w.idx.length / 3;
  const edges = new Map();               // welded edge -> [{ su, sv, side }, …]
  for (let t = 0; t < tris; t++) {
    const v = [w.idx[t * 3], w.idx[t * 3 + 1], w.idx[t * 3 + 2]];
    for (let k = 0; k < 3; k++) {
      const su = v[k], sv = v[(k + 1) % 3];
      const k2 = key2(rep[su], rep[sv]);
      let list = edges.get(k2);
      if (!list) { list = []; edges.set(k2, list); }
      list.push({ su, sv, side: triSide[t] });
    }
  }
  // a rim edge is a directed edge of a triangle whose neighbour across it went
  // to the other side
  const rim = [];
  for (const [k2, recs] of edges) {
    if (recs.length < 2) continue;                       // an original open edge
    const hasA = recs.some((r) => r.side === A);
    const hasB = recs.some((r) => r.side === B);
    if (!hasA || !hasB) continue;
    if (w.capped.has(k2)) continue;                      // an earlier rule closed this
    w.capped.add(k2);
    for (const r of recs) if (r.side === A || r.side === B) rim.push(r);
  }
  if (!rim.length) return 0;

  // group into loops: welded position (so a rim broken into chains by a UV seam
  // is still ONE hole), kept apart per side
  const parent = new Map();
  const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
  const add = (v) => { if (!parent.has(v)) parent.set(v, v); };
  for (const e of rim) {
    const ru0 = rep[e.su], rv0 = rep[e.sv];
    add(ru0); add(rv0);
    const ru = find(ru0), rv = find(rv0);
    if (ru !== rv) parent.set(rv, ru);
  }
  const loops = new Map();
  for (const e of rim) {
    const k = `${find(rep[e.su])}|${e.side}`;
    let list = loops.get(k);
    if (!list) { list = []; loops.set(k, list); }
    list.push(e);
  }

  let capTris = 0;
  const lidFrom = w.idx.length / 3;
  for (const list of loops.values()) {
    const verts = new Set();
    for (const e of list) { verts.add(e.su); verts.add(e.sv); }
    if (verts.size < 3) continue;
    const c = [0, 0, 0];
    for (const v of verts) for (let k = 0; k < 3; k++) c[k] += w.pos[v * 3 + k];
    for (let k = 0; k < 3; k++) c[k] /= verts.size;
    // the lid's own flat normal, summed over the triangles it is about to make
    const nrm = [0, 0, 0];
    for (const { su, sv } of list) {
      const ux = w.pos[su * 3] - c[0], uy = w.pos[su * 3 + 1] - c[1], uz = w.pos[su * 3 + 2] - c[2];
      const vx = w.pos[sv * 3] - c[0], vy = w.pos[sv * 3 + 1] - c[1], vz = w.pos[sv * 3 + 2] - c[2];
      nrm[0] += vy * uz - vz * uy;
      nrm[1] += vz * ux - vx * uz;
      nrm[2] += vx * uy - vy * ux;
    }
    const len = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
    for (let k = 0; k < 3; k++) nrm[k] /= len;

    // The lid gets its OWN rim vertices: the shell's normals point out of the
    // model and would shade a lid made from them as though it were still hull.
    const copy = new Map();
    const lidVert = (v) => {
      let nv = copy.get(v);
      if (nv === undefined) {
        nv = cloneVert(w, v);
        if (w.nor) for (let k = 0; k < 3; k++) w.nor[nv * 3 + k] = nrm[k];
        copy.set(v, nv);
      }
      return nv;
    };
    const centre = cloneVert(w, [...verts][0]);
    for (let k = 0; k < 3; k++) w.pos[centre * 3 + k] = c[k];
    if (w.nor) for (let k = 0; k < 3; k++) w.nor[centre * 3 + k] = nrm[k];
    // rigid on the rim's most common bone: interior armour has no business
    // blending across the gap it exists to hide
    const tally = new Map();
    for (const v of verts) { const d = domOf(w, v); tally.set(d, (tally.get(d) || 0) + 1); }
    let bone = domOf(w, [...verts][0]), bn = -1;
    for (const [d, cnt] of tally) if (cnt > bn) { bn = cnt; bone = d; }
    bindRigid(w, centre, bone);

    for (const { su, sv } of list) {
      w.idx.push(lidVert(sv), lidVert(su), centre);
      capTris++;
    }
  }
  if (capTris) w.lids.push([lidFrom, w.idx.length / 3]);
  return capTris;
}
