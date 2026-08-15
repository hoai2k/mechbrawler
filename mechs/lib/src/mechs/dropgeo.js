// BONE DROP — delete the geometry a bone owns, and close the hole it leaves.
//
// THE PROBLEM. A sculpted model sometimes carries geometry that is standing in
// for something the ENGINE does better. Inferno's shoulder stacks end in two
// frozen tongues of "flame", inherited from the concept image: a fixed lump of
// triangles that cannot flicker, cannot trail smoke, and reads as a plastic
// horn the moment the mech moves. The fix is not to reskin it — it is to take
// it off the model and let the particle system do the job.
//
// So a manifest entry may name bones whose geometry is SURPLUS:
//
//   "dropBones": ["stackL", "stackR"]
//
// A vertex belongs to a bone when that bone is its DOMINANT weight (the same
// rule seamcut.js and the skin audit use). Every triangle with a corner on a
// dropped bone goes, which puts the new boundary entirely on KEPT vertices —
// the surface the drop cuts into is never left with a half-weighted rim.
//
// AND THEN IT CAPS. Cutting a lump off a closed shell opens it, and an open
// shell renders as a window into an unlit interior — inferno's stacks would
// become two black pipes. Each boundary loop is closed with a fan to its own
// centre: a new vertex at the loop's average position, bound rigidly to the
// bone most of the loop already answers to, wound from the loop's own directed
// edges so the lid faces the same way the shell around it does. The stacks end
// in a sealed chimney mouth, which is exactly what should be there once the
// flame is a particle emitter (see Fighter.updateStackFlames).
//
// The bones themselves STAY. They carry no skin any more, but they still ride
// the animation, and the manifest hangs the flame anchors on them — which is
// the whole point: the emitter tracks the chimney through every clip instead
// of sitting at a fixed offset from a shoulder.
//
// ...AND WHEN THE LUMP HAS NO BONE OF ITS OWN. Not every surplus lump is as
// tidy as inferno's. TEMPEST's chimneys end in two sculpted "spark" squiggles
// weighted to the same two bones as the entire shoulder pauldron, so naming a
// bone would take the shoulders with them. What they DO have is their own
// connected component — lumps resting on the chimney mouth, sharing no vertex
// with it — so a second manifest key selects geometry directly:
//
//   "dropGeo": [ { "verts": [12043, 12044, …] } ]
//
// A vertex index is a property of the GEOMETRY, which no re-rig can renumber
// (the same reason skinOps are pinned to vertex lists on export). Find the
// islands and write the lists with `node tools/geodrop.mjs <mech> --pick`.
// Everything past the selection — the triangle cull, the rim, the cap — is one
// shared implementation, so the two keys differ only in what they point at.
//
// Runs immediately after skinOps in buildGlbMech (so it reads the final
// weights). `dropGeo` goes FIRST, before seamCuts: a cut appends duplicate
// vertices and re-points triangle corners at them, and a vertex list authored
// against the raw file has no way to name a duplicate that did not exist when
// it was written. `dropBones` names bones, so it is immune and stays last.
import * as THREE from 'three';

// Once per geometry, per key: the stock GLB path shares one cached scene
// between every clone, so a second build must not cut the same shell twice.
// (The custom-rig path clones the geometry per build, where this never fires.)
const BONE_DROPPED = new WeakSet();
const GEO_DROPPED = new WeakSet();

/**
 * Delete every triangle touching the named bones' geometry and cap the rims.
 * @param {THREE.SkinnedMesh} mesh
 * @param {string[]} boneNames  manifest `dropBones`
 * @returns {null|{what:string[], verts:number, tris:number, caps:number}}
 */
export function applyBoneDrop(mesh, boneNames) {
  const geo = mesh.geometry;
  if (!boneNames?.length || !geo?.index) return null;
  if (BONE_DROPPED.has(geo)) return null;
  BONE_DROPPED.add(geo);

  const bones = mesh.skeleton.bones;
  const drop = new Set();
  const named = [];
  for (const name of boneNames) {
    const i = bones.findIndex((b) => b.name === name);
    if (i < 0) console.warn(`dropBones: no bone named "${name}"`);
    else { drop.add(i); named.push(name); }
  }
  if (!drop.size) return null;

  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const n0 = geo.attributes.position.count;
  const isDropped = new Uint8Array(n0);
  let dropVerts = 0;
  for (let v = 0; v < n0; v++) {
    let bw = -1, bi = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(v, k);
      if (w > bw) { bw = w; bi = si.getComponent(v, k); }
    }
    if (drop.has(bi)) { isDropped[v] = 1; dropVerts++; }
  }
  if (!dropVerts) return null;
  return dropAndCap(mesh, isDropped, dropVerts, named, 'boneDrop');
}

/**
 * Same cut, selected by explicit vertex list instead of by bone.
 * @param {THREE.SkinnedMesh} mesh
 * @param {Array<{verts:number[]}>} sels  manifest `dropGeo`
 * @returns {null|{what:string[], verts:number, tris:number, caps:number}}
 */
export function applyGeoDrop(mesh, sels) {
  const geo = mesh.geometry;
  if (!sels?.length || !geo?.index) return null;
  if (GEO_DROPPED.has(geo)) return null;
  GEO_DROPPED.add(geo);

  const n0 = geo.attributes.position.count;
  const isDropped = new Uint8Array(n0);
  const named = [];
  let dropVerts = 0, stale = 0;
  for (const sel of sels) {
    let k = 0;
    for (const v of sel.verts || []) {
      if (v < 0 || v >= n0) { stale++; continue; }
      if (isDropped[v]) continue;
      isDropped[v] = 1; dropVerts++; k++;
    }
    named.push(`${k} verts`);
  }
  // A list authored against a DIFFERENT export of the model is the one way this
  // goes quietly wrong — it would delete a random handful of triangles from
  // somewhere else on the body. Out-of-range indices are the only symptom that
  // can be detected from here, so say so.
  if (stale) console.warn(`dropGeo: ${stale} vertex index(es) past the end of the mesh — list authored against another export?`);
  if (!dropVerts) return null;
  return dropAndCap(mesh, isDropped, dropVerts, named, 'geoDrop');
}

// ---------------------------------------------------------------------------
// The cut itself, shared by both selectors: cull every triangle with a corner
// on a dropped vertex, then close whatever rim that opens.
function dropAndCap(mesh, isDropped, dropVerts, named, tag) {
  const geo = mesh.geometry;
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const n0 = geo.attributes.position.count;

  // A rim is only a closed ring in WELDED space. An auto-meshed model splits
  // vertices along every uv seam, so the boundary of the removed patch arrives
  // as a handful of open arcs that end wherever a seam crosses it — cap those
  // and you get inferno's first attempt: fourteen slivers and daylight through
  // the chimney. Everything topological below is therefore done on a
  // POSITION-WELDED representative per vertex; only the triangles that come
  // out the far end use real indices.
  const posArr = geo.attributes.position.array;
  const rep = new Int32Array(n0);
  {
    const at = new Map();
    for (let v = 0; v < n0; v++) {
      const k = `${posArr[v * 3].toFixed(5)},${posArr[v * 3 + 1].toFixed(5)},${posArr[v * 3 + 2].toFixed(5)}`;
      const first = at.get(k);
      if (first === undefined) { at.set(k, v); rep[v] = v; } else rep[v] = first;
    }
  }

  // ---- 1. keep every triangle that has no corner on a dropped bone --------
  const idx = geo.index.array;
  const kept = [];
  // directed boundary edges: each edge of a REMOVED triangle whose two ends
  // both survive. An edge shared by two removed triangles shows up once in
  // each direction and cancels — what is left is the open rim, already wound
  // the way the removed surface was.
  const edgeKey = (a, b) => a * n0 + b;
  const pending = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (!isDropped[a] && !isDropped[b] && !isDropped[c]) { kept.push(a, b, c); continue; }
    if (!isDropped[a] && !isDropped[b]) pending.push(a, b);
    if (!isDropped[b] && !isDropped[c]) pending.push(b, c);
    if (!isDropped[c] && !isDropped[a]) pending.push(c, a);
  }
  const removedTris = (idx.length - kept.length) / 3;
  const live = new Map();   // welded directed edge -> the real index pair
  for (let i = 0; i < pending.length; i += 2) {
    const a = pending[i], b = pending[i + 1];
    const back = edgeKey(rep[b], rep[a]);
    if (live.has(back)) { live.delete(back); continue; }  // the pair cancels
    live.set(edgeKey(rep[a], rep[b]), [a, b]);
  }
  const rim = [];         // flat [a, b, a, b, …] — the surviving rim edges
  for (const [a, b] of live.values()) rim.push(a, b);

  // ---- 2. fan each rim shut ---------------------------------------------
  // NOT by walking an ordered loop: a sculpted, auto-meshed rim is not a clean
  // manifold ring — a vertex can carry two outgoing boundary edges, and a walk
  // that assumes one closes a quarter of the mouth and calls it a lid (which
  // is what inferno's chimneys did: ten fragments and a hole you could see the
  // sky through). Instead the rim edges are grouped into CONNECTED COMPONENTS
  // (union-find, no ordering needed) and every edge of a component gets a
  // triangle to that component's single centre vertex. A ring gives the same
  // fan a walk would; a branched or doubled rim still comes out closed.
  const pos = Array.from(geo.attributes.position.array);
  const nor = geo.attributes.normal ? Array.from(geo.attributes.normal.array) : null;
  const uv = geo.attributes.uv ? Array.from(geo.attributes.uv.array) : null;
  const jArr = Array.from(si.array), wArr = Array.from(sw.array);

  const parent = new Map();
  const find = (x) => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(x) !== r) { const nx = parent.get(x); parent.set(x, r); x = nx; }
    return r;
  };
  for (const v of rim) if (!parent.has(rep[v])) parent.set(rep[v], rep[v]);
  for (let i = 0; i < rim.length; i += 2) {
    const ra = find(rep[rim[i]]), rb = find(rep[rim[i + 1]]);
    if (ra !== rb) parent.set(ra, rb);
  }
  // per component: centroid, average shell normal, and which bone owns most of it
  const comps = new Map();
  const compOf = new Map();   // welded representative -> component
  for (const v of [...parent.keys()]) {
    const r = find(v);
    let c = comps.get(r);
    if (!c) comps.set(r, c = { n: 0, p: [0, 0, 0], nrm: [0, 0, 0], uv: [0, 0], tally: new Map(), edges: 0 });
    compOf.set(v, c);
    c.n++;
    c.p[0] += pos[v * 3]; c.p[1] += pos[v * 3 + 1]; c.p[2] += pos[v * 3 + 2];
    if (nor) { c.nrm[0] += nor[v * 3]; c.nrm[1] += nor[v * 3 + 1]; c.nrm[2] += nor[v * 3 + 2]; }
    if (uv) { c.uv[0] += uv[v * 2]; c.uv[1] += uv[v * 2 + 1]; }
    let bw = -1, bi = 0;
    for (let k = 0; k < 4; k++) {
      const w = wArr[v * 4 + k];
      if (w > bw) { bw = w; bi = jArr[v * 4 + k]; }
    }
    c.tally.set(bi, (c.tally.get(bi) || 0) + 1);
  }
  for (let i = 0; i < rim.length; i += 2) compOf.get(rep[rim[i]]).edges++;

  let caps = 0;
  for (const c of comps.values()) {
    if (c.edges < 3) continue;   // a stray edge or two closes nothing
    let owner = 0, best = -1;
    for (const [bi, k] of c.tally) if (k > best) { best = k; owner = bi; }
    c.centre = pos.length / 3;
    pos.push(c.p[0] / c.n, c.p[1] / c.n, c.p[2] / c.n);
    if (nor) {
      const l = Math.hypot(...c.nrm) || 1;
      nor.push(c.nrm[0] / l, c.nrm[1] / l, c.nrm[2] / l);
    }
    if (uv) uv.push(c.uv[0] / c.n, c.uv[1] / c.n);
    jArr.push(owner, 0, 0, 0);
    wArr.push(1, 0, 0, 0);
    caps++;
  }
  // the lid triangles, wound from the rim's own directed edges — so each one
  // faces the way the surface it grew out of faced
  for (let i = 0; i < rim.length; i += 2) {
    const c = compOf.get(rep[rim[i]]);
    if (c.centre === undefined) continue;
    kept.push(rim[i], rim[i + 1], c.centre);
  }

  // ---- 3. write it back --------------------------------------------------
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (nor) geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(jArr, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wArr, 4));
  const IndexArray = pos.length / 3 > 65535 ? Uint32Array : Uint16Array;
  geo.setIndex(new THREE.BufferAttribute(new IndexArray(kept), 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  const report = { what: named, verts: dropVerts, tris: removedTris, caps };
  geo.userData = { ...geo.userData, [tag]: report };
  return report;
}
