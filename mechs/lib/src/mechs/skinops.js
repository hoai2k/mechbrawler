// Skin-repair engine for GLB mechs.
//
// Tripo auto-rigs frequently weight geometry to the WRONG bone — a hip plate
// to a forearm, a back banner to an arm, both legs to one chain. For rigid
// hard-surface robots the right skinning is per-part rigid binding, so repair
// is expressible as data: "this geometric part belongs to that bone".
//
// This module is the ONE implementation of that idea, shared by three users
// so component ids always agree:
//   • the runtime loader (gltf.js) applies a mech's manifest `skinOps`
//   • the ?debug=skin workbench previews/authored ops live in the browser
//   • the offline audit (tools/skinaudit.mjs) flags suspect bones
//
// Geometry model: each vertex has a DOMINANT BONE (max skin weight). Within
// one bone's vertex set, verts welded by position (1e-4 grid) or joined by
// triangle edges form BONE-ISLANDS — contiguous patches of geometry owned by
// that bone. (Whole-mesh connectivity is useless here: Tripo meshes are one
// fully-connected shell, but a hip plate bled onto a forearm is still a
// separate ISLAND of the forearm's vertex set.) An island is addressed as
// {bone: <name>, comp: <n>} = the n-th largest island of that bone (omit n
// for "all of them"), or globally as {comp: <globalIndex>}. Ordering is
// deterministic: vert count desc, then centroid y desc, x, z — stable across
// sessions and environments.
//
// An op: { sel: {bone, comp?} | {comp}, to: '<boneName>' }
// Applying an op binds every vertex of the selected component(s) RIGIDLY
// (weight 1.0) to the target bone — correct for mech parts, and exactly what
// hand-rigged hard-surface models do.
//
// A part that SHOULD share (a shoulder pad that wants to follow the torso but
// bend a little with the arm) takes the weighted form instead:
//   { sel: ..., weights: { '<boneA>': 0.7, '<boneB>': 0.3 } }
// up to 4 bones, renormalized on apply — authored in the ?debug=skin
// workbench's "Bind Geometry" panel.
import * as THREE from 'three';
// circular by design and safe: feather.js reads boneHierDist from here, and
// both sides are hoisted function declarations called only at runtime.
import { featherSkin } from './feather.js';

// Analyze one SkinnedMesh: dominant bone per vertex + bone-islands.
// Returns { compId: Int32Array per vertex, comps: [{id, count, boneIndex,
// boneName, centroid, min, max, verts}], domBone: Int32Array } with comps
// sorted deterministically (the array order IS the global island index).
export function analyzeSkin(mesh) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const jnt = geo.attributes.skinIndex;
  const wgt = geo.attributes.skinWeight;
  const n = pos.count;
  const bones = mesh.skeleton.bones;

  // ---- dominant bone per vertex ----
  const domBone = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    let bw = -1, bi = 0;
    for (let k = 0; k < 4; k++) {
      const w = wgt.getComponent(i, k);
      if (w > bw) { bw = w; bi = jnt.getComponent(i, k); }
    }
    domBone[i] = bi;
  }

  // ---- union-find, joining verts ONLY within the same dominant bone ----
  const parent = new Int32Array(n).fill(-1);
  const find = (a) => { let r = a; while (parent[r] >= 0) r = parent[r]; while (parent[a] >= 0) { const p = parent[a]; parent[a] = r; a = p; } return r; };
  const union = (a, b) => { if (domBone[a] !== domBone[b]) return; a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  // weld-mates (UV/normal seam duplicates at the same position)
  {
    const firstOfWeld = new Map();
    for (let i = 0; i < n; i++) {
      const key = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
      const f = firstOfWeld.get(key);
      if (f === undefined) firstOfWeld.set(key, i);
      else union(f, i);
    }
  }
  // triangle edges
  const idx = geo.index;
  if (idx) {
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      union(a, b); union(a, c); union(b, c);
    }
  } else {
    for (let t = 0; t < n; t += 3) { union(t, t + 1); union(t, t + 2); union(t + 1, t + 2); }
  }

  // ---- collect islands ----
  const byRoot = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let comp = byRoot.get(r);
    if (!comp) {
      comp = { verts: [], count: 0, boneIndex: domBone[i],
               centroid: [0, 0, 0], min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
      byRoot.set(r, comp);
    }
    comp.verts.push(i);
    comp.count++;
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    comp.centroid[0] += x; comp.centroid[1] += y; comp.centroid[2] += z;
    comp.min[0] = Math.min(comp.min[0], x); comp.min[1] = Math.min(comp.min[1], y); comp.min[2] = Math.min(comp.min[2], z);
    comp.max[0] = Math.max(comp.max[0], x); comp.max[1] = Math.max(comp.max[1], y); comp.max[2] = Math.max(comp.max[2], z);
  }
  const comps = [...byRoot.values()];
  for (const c of comps) {
    c.centroid = c.centroid.map((v) => v / c.count);
    c.boneName = bones[c.boneIndex]?.name || `joint${c.boneIndex}`;
  }
  // deterministic global order
  comps.sort((a, b) => b.count - a.count
    || b.centroid[1] - a.centroid[1] || a.centroid[0] - b.centroid[0] || a.centroid[2] - b.centroid[2]);
  const compId = new Int32Array(n);
  comps.forEach((c, ci) => { c.id = ci; for (const v of c.verts) compId[v] = ci; });
  return { compId, comps, domBone };
}

// Bone hierarchy distance matrix (BFS over parent/child links). Shared by
// the far-blend detector, the purgeFar op, and the audit tools.
export function boneHierDist(bones) {
  const nB = bones.length;
  const idxOf = new Map(bones.map((b, i) => [b, i]));
  const adj = bones.map(() => []);
  bones.forEach((b, i) => {
    const p = idxOf.get(b.parent);
    if (p !== undefined) { adj[i].push(p); adj[p].push(i); }
  });
  const dist = new Uint8Array(nB * nB).fill(255);
  for (let s = 0; s < nB; s++) {
    const q = [s]; dist[s * nB + s] = 0;
    while (q.length) {
      const u = q.shift();
      for (const v of adj[u]) {
        if (dist[s * nB + v] === 255) { dist[s * nB + v] = dist[s * nB + u] + 1; q.push(v); }
      }
    }
  }
  return dist;
}

// FAR-BLEND ("rubber") scan: find vertices strongly weighted to two bones
// that are DISTANT in the hierarchy (A-B-C-D: strong on A and D, skipping
// B/C). Such a vertex is AVERAGED between unrelated limbs whenever they move
// apart — it doesn't tear (the seam-stretch audit misses it), it smears:
// rubbery boots, waist tugs. For rigid mechs any strong cross-limb blend is
// wrong. Returns clusters keyed by dominant->far bone pair.
export function farBlendScan(mesh, { minDist = 3, minW = 0.2 } = {}) {
  const geo = mesh.geometry;
  const jnt = geo.attributes.skinIndex;
  const wgt = geo.attributes.skinWeight;
  const bones = mesh.skeleton.bones;
  const nB = bones.length;
  const dist = boneHierDist(bones);
  const pairs = new Map(); // "dom>far" -> {dom, far, verts:[], wSum}
  for (let i = 0; i < jnt.count; i++) {
    let bw = -1, bi = 0;
    for (let k = 0; k < 4; k++) {
      const w = wgt.getComponent(i, k);
      if (w > bw) { bw = w; bi = jnt.getComponent(i, k); }
    }
    for (let k = 0; k < 4; k++) {
      const w = wgt.getComponent(i, k);
      if (w < minW || w >= bw) continue;             // minority far weights only
      const fj = jnt.getComponent(i, k);
      if (dist[bi * nB + fj] < minDist) continue;    // near blends are legit joints
      const key = bi + '>' + fj;
      let rec = pairs.get(key);
      if (!rec) { rec = { dom: bones[bi]?.name, far: bones[fj]?.name, verts: [], wSum: 0 }; pairs.set(key, rec); }
      rec.verts.push(i);
      rec.wSum += w;
    }
  }
  return [...pairs.values()].sort((a, b) => b.verts.length - a.verts.length);
}

// purgeFar: strip minority far-bone weights from every vertex and
// renormalize what remains — the gentle fix for far-blend rubber (keeps the
// legitimate local blend instead of hard-snapping the vertex to one bone).
export function purgeFarWeights(mesh, { minDist = 3, minW = 0.05 } = {}) {
  const geo = mesh.geometry;
  const jnt = geo.attributes.skinIndex;
  const wgt = geo.attributes.skinWeight;
  const bones = mesh.skeleton.bones;
  const nB = bones.length;
  const dist = boneHierDist(bones);
  let touched = 0;
  for (let i = 0; i < jnt.count; i++) {
    let bw = -1, bi = 0;
    for (let k = 0; k < 4; k++) {
      const w = wgt.getComponent(i, k);
      if (w > bw) { bw = w; bi = jnt.getComponent(i, k); }
    }
    let sum = 0, changed = false;
    const keep = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      let w = wgt.getComponent(i, k);
      const fj = jnt.getComponent(i, k);
      if (w >= minW && w < bw && dist[bi * nB + fj] >= minDist) { w = 0; changed = true; }
      keep[k] = w;
      sum += w;
    }
    if (!changed || sum <= 0) continue;
    touched++;
    wgt.setXYZW(i, keep[0] / sum, keep[1] / sum, keep[2] / sum, keep[3] / sum);
  }
  if (touched) { wgt.needsUpdate = true; }
  return touched;
}

// ---- ENCLAVE detection ----------------------------------------------------
// The pattern human eyes catch instantly in the ?debug=skin color view: a
// small patch of one bone's color sitting inside an otherwise-solid region of
// ANOTHER bone (a hip plate bound to a hand, a knuckle bound to a thigh).
// Almost never intentional on a rigid mech, and the fix is exactly what a
// human does: rebind the patch to the bone that owns everything around it.
//
// Detection is a pure graph property — no pose sweep, no thresholds on
// motion: an island whose BOUNDARY (triangle edges + coincident-position weld
// pairs, since auto-rigs often butt separate shells together) is mostly one
// other bone is an enclave of that bone.

// Cross-island adjacency: islandId -> Map(islandId -> contactCount), from
// shared triangle edges AND position-welded vertex pairs (hard seams between
// separate shells have no shared triangles — the weld pairs are the contact).
export function buildIslandAdjacency(mesh, analysis) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const idx = geo.index;
  const compId = analysis.compId;
  const adj = new Map();
  const bump = (a, b) => {
    if (a === b) return;
    let m = adj.get(a); if (!m) { m = new Map(); adj.set(a, m); }
    m.set(b, (m.get(b) || 0) + 1);
    let m2 = adj.get(b); if (!m2) { m2 = new Map(); adj.set(b, m2); }
    m2.set(a, (m2.get(a) || 0) + 1);
  };
  if (idx) {
    const seen = new Set();
    const edge = (u, v) => {
      if (compId[u] === compId[v]) return;
      const key = u < v ? u * 4000000 + v : v * 4000000 + u;
      if (seen.has(key)) return;
      seen.add(key);
      bump(compId[u], compId[v]);
    };
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      edge(a, b); edge(a, c); edge(b, c);
    }
  }
  // weld pairs across islands
  const weld = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    const f = weld.get(key);
    if (f === undefined) weld.set(key, i);
    else if (compId[f] !== compId[i]) bump(compId[f], compId[i]);
  }
  return adj;
}

// ---- BLEND PATCH ----------------------------------------------------------
// The other half of the skin-repair problem. `analyzeSkin` partitions geometry
// by DOMINANT bone, so a region that is 70% torso / 30% shoulderR lives inside
// the torso island and cannot be addressed on its own — but it is exactly the
// geometry a player sees wiggle with the arm when it should hold still on the
// chest, and rebinding the WHOLE torso island to fix it throws away every
// legitimate blend the rest of the chest has.
//
// A blend patch is that sub-region: from a seed vertex, the connected run of
// geometry that (a) has the SAME dominant bone as the seed and (b) carries a
// minority weight on the same FOREIGN bone. Condition (a) is what stops the
// flood at the arm — where shoulderR takes over as dominant, the patch ends —
// so the result is "the part of the torso that follows shoulderR", nothing
// more. The ?debug=skin workbench selects one with shift-click.
//
// Returns { verts, dom, domName, foreign, foreignName, avgW } (verts empty if
// the seed carries no secondary influence at all).
export function blendPatch(mesh, seed, { minW = 0.02, foreign = null, adjacency = null } = {}) {
  const geo = mesh.geometry;
  const jnt = geo.attributes.skinIndex;
  const wgt = geo.attributes.skinWeight;
  const bones = mesh.skeleton.bones;
  const wOn = (v, bi) => {
    let s = 0;
    for (let k = 0; k < 4; k++) if (jnt.getComponent(v, k) === bi) s += wgt.getComponent(v, k);
    return s;
  };
  const domOf = (v) => {
    let bw = -1, bi = 0;
    for (let k = 0; k < 4; k++) {
      const w = wgt.getComponent(v, k);
      if (w > bw) { bw = w; bi = jnt.getComponent(v, k); }
    }
    return bi;
  };
  const dom = domOf(seed);
  // the seed's strongest NON-dominant influence, unless the caller named one
  let fb = foreign;
  if (fb == null) {
    let bw = -1;
    for (let k = 0; k < 4; k++) {
      const w = wgt.getComponent(seed, k), b = jnt.getComponent(seed, k);
      if (b === dom || w <= 0) continue;
      if (w > bw) { bw = w; fb = b; }
    }
  }
  if (fb == null || wOn(seed, fb) < minW) {
    return { verts: [], dom, domName: bones[dom]?.name || null, foreign: null, foreignName: null, avgW: 0 };
  }
  const adj = adjacency || weldedAdjacency(mesh);
  const inPatch = (v) => domOf(v) === dom && wOn(v, fb) >= minW;
  const seen = new Uint8Array(jnt.count);
  const out = [];
  const queue = [seed];
  seen[seed] = 1;
  let wSum = 0;
  while (queue.length) {
    const v = queue.pop();
    out.push(v);
    wSum += wOn(v, fb);
    for (const n of adj.neighbours(v)) {
      if (seen[n] || !inPatch(n)) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return { verts: out, dom, domName: bones[dom]?.name || null,
    foreign: fb, foreignName: bones[fb]?.name || null, avgW: out.length ? wSum / out.length : 0 };
}

// Vertex adjacency over the mesh's own surface, with position-welded
// duplicates (UV/normal seam splits) treated as one point — otherwise a flood
// fill stops dead at every texture seam. Build once per geometry and reuse:
// topology never changes, only weights do.
export function weldedAdjacency(mesh) {
  const geo = mesh.geometry;
  if (geo.userData.__weldAdj) return geo.userData.__weldAdj;
  const pos = geo.attributes.position;
  const n = pos.count;
  const rep = new Int32Array(n);
  const twins = new Map();                 // representative -> [all verts there]
  {
    const firstAt = new Map();
    for (let i = 0; i < n; i++) {
      const key = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
      const f = firstAt.get(key);
      if (f === undefined) { firstAt.set(key, i); rep[i] = i; } else rep[i] = f;
      const r = rep[i];
      let t = twins.get(r); if (!t) twins.set(r, t = []);
      t.push(i);
    }
  }
  const link = new Map();                  // representative -> Set(representative)
  const bump = (a, b) => {
    if (a === b) return;
    let s = link.get(a); if (!s) link.set(a, s = new Set());
    s.add(b);
    let s2 = link.get(b); if (!s2) link.set(b, s2 = new Set());
    s2.add(a);
  };
  const idx = geo.index;
  const edge = (a, b) => bump(rep[a], rep[b]);
  if (idx) {
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      edge(a, b); edge(b, c); edge(c, a);
    }
  } else {
    for (let t = 0; t + 2 < n; t += 3) { edge(t, t + 1); edge(t + 1, t + 2); edge(t + 2, t); }
  }
  const api = {
    // every vertex sharing a surface edge with `v`, plus v's own weld twins
    neighbours(v) {
      const r = rep[v];
      const out = [];
      for (const t of twins.get(r) || []) if (t !== v) out.push(t);
      for (const nr of link.get(r) || []) for (const t of twins.get(nr) || []) out.push(t);
      return out;
    },
    rep,
  };
  geo.userData.__weldAdj = api;
  return api;
}

// Scan for enclaves and produce the rebind ops that dissolve them.
// IMPORTANT composition contract: `analysis` must be the PRISTINE partition
// with comps[].boneName reflecting the CURRENT (post-committed-ops) owner —
// exactly what applySkinOps leaves behind. Returned ops select pristine
// island ids, so appending them after the mech's existing manifest skinOps
// reproduces this scan's result at load. Iterates to a fixpoint (dissolving
// one enclave can expose another).
export function enclaveScan(mesh, analysis, {
  maxCount = 800,       // an enclave is a PATCH, not a limb
  minSurround = 0.7,    // boundary share one other bone must own
  minBoundary = 6,      // ignore degenerate contacts
  rounds = 4,
} = {}) {
  const adj = buildIslandAdjacency(mesh, analysis);
  const comps = analysis.comps;
  const ops = [];
  const report = [];
  for (let r = 0; r < rounds; r++) {
    let changed = 0;
    for (const c of comps) {
      if (c.count > maxCount) continue;
      const m = adj.get(c.id);
      if (!m) continue;
      let tot = 0;
      const votes = new Map();
      for (const [nid, n] of m) {
        tot += n;
        const nb = comps[nid].boneName;
        if (nb !== c.boneName) votes.set(nb, (votes.get(nb) || 0) + n);
      }
      if (tot < minBoundary) continue;
      let top = null, topN = 0;
      for (const [bn, n] of votes) if (n > topN) { topN = n; top = bn; }
      if (!top || topN / tot < minSurround) continue;
      ops.push({ sel: { comp: c.id }, to: top });
      report.push({ island: c.id, from: c.boneName, to: top, count: c.count,
        surround: +(topN / tot).toFixed(2), round: r });
      c.boneName = top; // virtual apply — next round sees the merged region
      changed++;
    }
    if (!changed) break;
  }
  return { ops, report };
}

// Resolve an op's selection to a list of components.
export function selectComps(analysis, sel) {
  if (sel.comp !== undefined && sel.bone === undefined) {
    const c = analysis.comps[sel.comp];
    return c ? [c] : [];
  }
  const owned = analysis.comps.filter((c) => c.boneName === sel.bone);
  // per-bone index: order = global order (already size-desc deterministic)
  if (sel.comp === undefined) return owned;
  const c = owned[sel.comp];
  return c ? [c] : [];
}

// purgePair: two bones that must never share a vertex (e.g. the two thighs —
// Tripo mirror-bleeds weights across symmetric limbs, so wiggling one leg
// bulges the other). Any vertex weighted to BOTH loses the smaller of the two
// weights; the rest renormalizes. Pair distance is often only 2 in the
// hierarchy (siblings), which the purgeFar minDist=3 default deliberately
// spares — this is the targeted version.
export function purgePairWeights(mesh, aName, bName) {
  const geo = mesh.geometry;
  const jnt = geo.attributes.skinIndex;
  const wgt = geo.attributes.skinWeight;
  const bones = mesh.skeleton.bones;
  const ai = bones.findIndex((b) => b.name === aName);
  const bi = bones.findIndex((b) => b.name === bName);
  if (ai < 0 || bi < 0) { console.warn('purgePair: unknown bone', aName, bName); return 0; }
  let touched = 0;
  for (let i = 0; i < jnt.count; i++) {
    let ka = -1, kb = -1;
    for (let k = 0; k < 4; k++) {
      const j = jnt.getComponent(i, k);
      if (j === ai && wgt.getComponent(i, k) > 0) ka = k;
      else if (j === bi && wgt.getComponent(i, k) > 0) kb = k;
    }
    if (ka < 0 || kb < 0) continue;
    const drop = wgt.getComponent(i, ka) < wgt.getComponent(i, kb) ? ka : kb;
    let sum = 0;
    const keep = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) { keep[k] = k === drop ? 0 : wgt.getComponent(i, k); sum += keep[k]; }
    if (sum <= 0) continue;
    touched++;
    wgt.setXYZW(i, keep[0] / sum, keep[1] / sum, keep[2] / sum, keep[3] / sum);
  }
  if (touched) wgt.needsUpdate = true;
  return touched;
}

// Turn an authored { boneName: weight } map into up to 4 normalized
// { i, w, name } slots, biggest first. Unknown bones and non-positive weights
// are dropped; anything past the GPU's 4-influence limit is dropped too (a
// 5th influence would be silently ignored by three.js, so cut it visibly).
export function resolveWeightSlots(bones, weights) {
  const slots = [];
  for (const [name, w] of Object.entries(weights || {})) {
    const i = bones.findIndex((b) => b.name === name);
    if (i < 0) { console.warn('skinOps: unknown bone in weights', name); continue; }
    if (!(w > 0)) continue;
    slots.push({ i, w: +w, name });
  }
  slots.sort((a, b) => b.w - a.w);
  if (slots.length > 4) {
    console.warn('skinOps: weights list past 4 bones truncated:', slots.slice(4).map((s) => s.name).join(', '));
    slots.length = 4;
  }
  const sum = slots.reduce((s, x) => s + x.w, 0);
  if (sum > 0) for (const s of slots) s.w /= sum;
  return slots;
}

// Apply ops to a SkinnedMesh's geometry: rigid-bind selected components to
// the target bone. Mutates skinIndex/skinWeight in place. Returns a summary.
export function applySkinOps(mesh, ops, analysis = null) {
  if (!ops?.length) return { applied: 0, verts: 0 };
  const a = analysis || analyzeSkin(mesh);
  const geo = mesh.geometry;
  const jnt = geo.attributes.skinIndex;
  const wgt = geo.attributes.skinWeight;
  const bones = mesh.skeleton.bones;
  let applied = 0, total = 0;
  for (const op of ops) {
    // global weight-hygiene op: strip far-hierarchy minority weights
    // ({"purgeFar": true, "minDist"?, "minW"?}) — see purgeFarWeights
    if (op.purgeFar) {
      const n = purgeFarWeights(mesh, { minDist: op.minDist, minW: op.minW });
      if (n) { applied++; total += n; }
      continue;
    }
    // {"feather": {radius, rigid, maxLinks, …}} — SOFTEN every bone border on
    // the mesh (feather.js). A whole-model op like purgeFar, and the LAST one
    // a list should carry: it reads the partition the rebinds leave behind and
    // grows each bone's influence out of its own region, so an op after it
    // would slam a rigid weight back over the gradient. Dominance is preserved
    // by construction, so island ordinals below it stay valid either way.
    if (op.feather) {
      const res = featherSkin(mesh, op.feather);
      if (res.blended) { applied++; total += res.blended; }
      continue;
    }
    // {"purgePair": ["boneA", "boneB"]} — these two bones never share a vertex
    if (op.purgePair) {
      const n = purgePairWeights(mesh, op.purgePair[0], op.purgePair[1]);
      if (n) { applied++; total += n; }
      continue;
    }
    // {"sel":{...}, "weights":{bone: w, ...}} — bind the selection to a BLEND
    // of up to 4 bones instead of rigidly to one. Authored in the ?debug=skin
    // "Bind Geometry" panel; weights are renormalized here, so the authored
    // numbers can be written as any ratio (0.7/0.3, 7/3 — same result).
    if (op.weights) {
      const slots = resolveWeightSlots(bones, op.weights);
      if (!slots.length) { console.warn('skinOps: no known bones in weights', JSON.stringify(op.weights)); continue; }
      const verts = op.sel && Array.isArray(op.sel.verts)
        ? op.sel.verts
        : selectComps(a, op.sel || {}).flatMap((c) => c.verts);
      if (!verts.length) { console.warn('skinOps: selection matched nothing', JSON.stringify(op.sel)); continue; }
      for (const v of verts) {
        jnt.setXYZW(v, slots[0].i, slots[1]?.i || 0, slots[2]?.i || 0, slots[3]?.i || 0);
        wgt.setXYZW(v, slots[0].w, slots[1]?.w || 0, slots[2]?.w || 0, slots[3]?.w || 0);
      }
      // keep the analysis' owner in step with the new dominant bone, so a
      // later op selecting {bone: ...} sees what this one left behind
      if (!(op.sel && Array.isArray(op.sel.verts))) {
        for (const c of selectComps(a, op.sel || {})) { c.boneIndex = slots[0].i; c.boneName = slots[0].name; }
      }
      applied++; total += verts.length;
      continue;
    }
    // {"sel":{"verts":[i,j,...]}, "to":bone} — bind an explicit vertex set
    // rigidly to the target bone. Emitted by the ?debug=skin paint brush to
    // split one island across two bones by hand; vertex indices are stable for
    // a given GLB so this re-applies deterministically at load.
    if (op.sel && Array.isArray(op.sel.verts)) {
      const vti = bones.findIndex((b) => b.name === op.to);
      if (vti < 0) { console.warn('skinOps: unknown target bone', op.to); continue; }
      for (const v of op.sel.verts) { jnt.setXYZW(v, vti, 0, 0, 0); wgt.setXYZW(v, 1, 0, 0, 0); }
      applied++; total += op.sel.verts.length;
      continue;
    }
    const ti = bones.findIndex((b) => b.name === op.to);
    if (ti < 0) { console.warn('skinOps: unknown target bone', op.to); continue; }
    const targets = selectComps(a, op.sel || {});
    if (!targets.length) { console.warn('skinOps: selection matched nothing', JSON.stringify(op.sel)); continue; }
    for (const c of targets) {
      for (const v of c.verts) {
        jnt.setXYZW(v, ti, 0, 0, 0);
        wgt.setXYZW(v, 1, 0, 0, 0);
      }
      c.boneIndex = ti;
      c.boneName = op.to;
      total += c.count;
    }
    applied++;
  }
  jnt.needsUpdate = true;
  wgt.needsUpdate = true;
  return { applied, verts: total };
}

// Runtime entry: apply a manifest's skinOps to a loaded gltf ONCE (the
// geometry is shared by every clone, so a per-fighter application would
// double-apply; the guard makes this idempotent).
export function applySkinOpsToGltf(gltfScene, ops) {
  if (!ops?.length) return;
  gltfScene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    if (o.geometry.userData.__skinOpsApplied) return;
    o.geometry.userData.__skinOpsApplied = true;
    const res = applySkinOps(o, ops);
    if (res.applied) console.info(`skinOps: ${res.applied} op(s), ${res.verts} verts rebound`);
  });
}

// ---- op-list hygiene -------------------------------------------------------
// The ?debug=skin workbench emits FULL-REPLACEMENT op lists, so a mech that
// went through several sessions accumulates superseded ops: {comp:50 → A}
// ... {comp:50 → B} — only the last rebind of a component survives
// applySkinOps (later ops overwrite the same verts), the earlier ones are
// noise a reader must mentally execute. compactSkinOps drops them.
//
// Scope of the guarantee: only PURE global-ordinal selectors ({sel:{comp:N}}
// with no bone key) are deduped — rigid (`to`) and weighted (`weights`) alike,
// since both rewrite every vertex of the component. Global ordinals are assigned once by
// analyzeSkin and never shift, so keep-last is exact. {bone,comp} selectors
// are ordinals WITHIN the bone's current group — earlier rebinds move
// components in/out of groups and shift those ordinals — so ops using them
// (none in today's manifest) are kept untouched, as are purgeFar/purgePair.
// (purge ops between duplicates don't break the dedupe: they act per-vertex
// on weights, and the surviving later rebind overwrites the component's
// verts entirely either way.)
export function compactSkinOps(ops) {
  if (!ops?.length) return ops || [];
  const lastForComp = new Map(); // comp ordinal -> index of last pure-comp rebind
  ops.forEach((op, i) => {
    if (op.sel && op.sel.comp !== undefined && op.sel.bone === undefined) {
      lastForComp.set(op.sel.comp, i);
    }
  });
  return ops.filter((op, i) => {
    if (op.sel && op.sel.comp !== undefined && op.sel.bone === undefined) {
      return lastForComp.get(op.sel.comp) === i;
    }
    return true; // bone selectors + global ops: never dropped
  });
}

/**
 * PIN every whole-island selector to the vertex list it means RIGHT NOW.
 *
 * `{"comp": 25}` is an ORDINAL into the proximity partition the CURRENT rig
 * produces, so it only means what its author meant while that rig is in place.
 * Move one bone and the partition is redrawn — 69 islands become 47 — and every
 * id lands on different geometry, silently: this is how jerry's back once ended
 * up bound to his foot, and how a viper skin patch authored on the previous rig
 * came back selecting his elbows. A VERTEX INDEX is a property of the geometry,
 * which no rig edit can renumber, so that is the form a saved op takes.
 *
 * The cost is file size (an island of 1,300 vertices is ~9 KB of numbers against
 * 20 bytes for the ordinal), which is why the workbench still WORKS in islands —
 * it only pins them on the way out.
 *
 * Selectors that are not a bare island (`verts`, `bone`, `comp` + `bone`) are
 * passed through untouched: they either already name geometry or mean something
 * the partition can't renumber.
 */
export function pinSkinOps(ops, analysis) {
  if (!ops?.length || !analysis?.comps) return ops || [];
  return ops.map((op) => {
    const sel = op?.sel;
    if (!sel || sel.comp === undefined || sel.bone !== undefined) return op;
    const comp = analysis.comps[sel.comp];
    if (!comp?.verts?.length) return op;          // unknown id: leave it alone
    return { ...op, sel: { ...sel, comp: undefined, verts: comp.verts.slice().sort((a, b) => a - b) } };
  }).map((op) => {
    // drop the now-undefined `comp` key so the JSON stays clean
    if (op.sel && 'comp' in op.sel && op.sel.comp === undefined) {
      const { comp, ...rest } = op.sel;
      return { ...op, sel: rest };
    }
    return op;
  });
}

// Serialize an op list one op per line — a 100-op list stays ~100 lines
// instead of the ~800 that pretty-printed JSON produces in manifest.json.
export function skinOpsToJson(ops, indent = '  ') {
  if (!ops?.length) return '[]';
  return '[\n' + ops.map((o) => indent + '  ' + JSON.stringify(o)).join(',\n') + '\n' + indent + ']';
}
