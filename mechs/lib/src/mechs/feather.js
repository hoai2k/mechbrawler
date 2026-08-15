// FEATHERED SKIN SEAMS — the organic answer to a rigid bind.
//
// The rest of the skin pipeline is built for HARD-SURFACE robots: reskin.js
// hands every vertex to exactly one bone, and a `skinOps` paint stroke rebinds
// a vertex list rigidly (weight 1). That is correct for a plate that pivots on
// a hinge — and wrong for a body made of MUSCLE. KONGA is a cyborg gorilla:
// his shoulder should swell into his chest, his hip should carry a little of
// his belly, and the line between them should not be a line at all.
//
// Painting that by hand is the thing the paint brush cannot do. A brush writes
// ONE bone per vertex, so the finest border it can draw is still one vertex
// wide — a step, not a gradient — and getting a soft border out of it would
// mean hand-authoring a per-vertex weight ramp with a mouse.
//
// So the border is DERIVED instead. This pass takes the rigid partition the
// ops leave behind and grows each bone's influence OUT of its own region,
// across the mesh's own surface, dying away over `radius`:
//
//   w_b(v) = falloff( geodesic distance from v to bone b's region )
//
// with the vertex's own bone at 1. Two vertices either side of a border swap
// (1, ~1) for (~1, 1) — the weights cross over CONTINUOUSLY, and the further
// in you go the more one bone owns, so an arm raise pulls the chest with it a
// little and lets go gradually. Everything the pass needs is measured off the
// mesh; nothing is authored.
//
// THREE PROPERTIES IT KEEPS, deliberately:
//
//  • DOMINANCE NEVER FLIPS. A foreign bone's weight is capped just under the
//    vertex's own (`cap`), so `analyzeSkin`'s island partition — which every
//    `{comp:N}` selector, the skin audit and the hurtbox buckets read — is the
//    same before and after. Feathering softens a border; it never moves one.
//  • DISTANCE IS GEODESIC, over the mesh's own edges with UV/normal seam
//    duplicates welded — never straight-line. A gorilla's knuckle rests
//    against his shin, and a distance ball would bind them; the surface path
//    between them runs all the way up the arm and down the leg, so it does not.
//  • THE ROBOT PARTS STAY ROBOT. `rigid` names the bones that keep a hard edge
//    (konga's missile pods): they are neither a source nor a destination of
//    blend, and the flood does not travel THROUGH their geometry, so the seam
//    around a bolted-on launcher stays exactly as crisp as the paint left it.
//
// Authored as the last entry of a mech's manifest `skinOps`:
//
//   {"feather": {"radius": 0.05, "rigid": ["pod*"], "maxLinks": 2}}
//
// and tuned live in /workbench/?edit=skin (the FEATHER SEAMS panel, whose
// "blend colours" view mixes each vertex's bone colours by weight so the
// gradient is visible instead of implied).
import { boneHierDist } from './skinops.js';

export const FEATHER_DEFAULTS = {
  // Band width, as a fraction of the model's longest dimension. EITHER a
  // number for the whole body, OR a per-bone table keyed by name/`prefix*`
  // ({"*": 0.05, "pod*": 0.012}) for a body that is soft in most places and
  // mechanical in a few — a bolted-on launcher wants a hairline blend, not the
  // shoulder's. Where two bones with different bands meet, the TIGHTER one
  // wins, so the hard part keeps its edge from both sides.
  radius: 0.05,
  rigid: [],       // bone names (trailing `*` wildcard ok) that keep a hard edge
  maxLinks: 2,     // max hierarchy distance between two bones allowed to blend
  cap: 0.9,        // a foreign bone's weight ceiling, relative to the vertex's own
  minW: 0.02,      // drop influences below this (they cost a slot and show nothing)
  power: 1,        // >1 tightens the falloff toward the border, <1 widens it
};

// Welded-representative graph with real edge lengths (CSR). Cached on the
// geometry: topology never changes, only weights do.
function surfaceGraph(geo) {
  if (geo.userData.__featherGraph) return geo.userData.__featherGraph;
  const pos = geo.attributes.position;
  const n = pos.count;
  const rep = new Int32Array(n);
  const twins = new Map();
  const firstAt = new Map();
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    const f = firstAt.get(key);
    rep[i] = f === undefined ? (firstAt.set(key, i), i) : f;
    let t = twins.get(rep[i]);
    if (!t) twins.set(rep[i], t = []);
    t.push(i);
  }
  // undirected edge set over representatives
  const links = new Map();
  const bump = (a, b) => {
    if (a === b) return;
    let s = links.get(a); if (!s) links.set(a, s = new Set());
    s.add(b);
    let s2 = links.get(b); if (!s2) links.set(b, s2 = new Set());
    s2.add(a);
  };
  const idx = geo.index;
  if (idx) {
    for (let t = 0; t < idx.count; t += 3) {
      const a = rep[idx.getX(t)], b = rep[idx.getX(t + 1)], c = rep[idx.getX(t + 2)];
      bump(a, b); bump(b, c); bump(c, a);
    }
  } else {
    for (let t = 0; t + 2 < n; t += 3) { bump(rep[t], rep[t + 1]); bump(rep[t + 1], rep[t + 2]); bump(rep[t + 2], rep[t]); }
  }
  let deg = 0;
  for (const s of links.values()) deg += s.size;
  const start = new Uint32Array(n + 1);
  const adj = new Uint32Array(deg);
  const len = new Float32Array(deg);
  let w = 0;
  for (let i = 0; i < n; i++) {
    start[i] = w;
    const s = links.get(i);
    if (s) {
      for (const j of s) {
        adj[w] = j;
        const dx = pos.getX(i) - pos.getX(j), dy = pos.getY(i) - pos.getY(j), dz = pos.getZ(i) - pos.getZ(j);
        len[w] = Math.sqrt(dx * dx + dy * dy + dz * dz);
        w++;
      }
    }
  }
  start[n] = w;
  const g = { rep, twins, start, adj, len, n };
  geo.userData.__featherGraph = g;
  return g;
}

// binary min-heap over (node, dist) — a plain array sort is O(n log n) per pop
// and the bands are big enough for that to matter
function makeHeap() {
  const node = []; const dist = [];
  return {
    get size() { return node.length; },
    push(v, d) {
      let i = node.length;
      node.push(v); dist.push(d);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (dist[p] <= dist[i]) break;
        [node[p], node[i]] = [node[i], node[p]];
        [dist[p], dist[i]] = [dist[i], dist[p]];
        i = p;
      }
    },
    pop() {
      const v = node[0], d = dist[0], last = node.length - 1;
      node[0] = node[last]; dist[0] = dist[last];
      node.pop(); dist.pop();
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let s = i;
        if (l < node.length && dist[l] < dist[s]) s = l;
        if (r < node.length && dist[r] < dist[s]) s = r;
        if (s === i) break;
        [node[s], node[i]] = [node[i], node[s]];
        [dist[s], dist[i]] = [dist[i], dist[s]];
        i = s;
      }
      return [v, d];
    },
  };
}

const matches = (name, patterns) => patterns.some((p) => (p.endsWith('*')
  ? name.startsWith(p.slice(0, -1))
  : name === p));

/**
 * Feather every bone border on a SkinnedMesh, in place.
 * Returns { verts, blended, bones, radius, pairs } — `blended` is how many
 * vertices ended up carrying more than one influence, `pairs` the bone pairs
 * that now overlap, biggest first (what the workbench reports).
 */
export function featherSkin(mesh, opts = {}) {
  const o = { ...FEATHER_DEFAULTS, ...(opts === true ? {} : opts) };
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const jnt = geo.attributes.skinIndex;
  const wgt = geo.attributes.skinWeight;
  const bones = mesh.skeleton.bones;
  const n = pos.count;

  // ---- band width in model units: a fraction of the longest dimension, so a
  // radius authored on one mech means the same thing on another ----
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    for (let k = 0; k < 3; k++) { if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; }
  }
  const span = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  // per-bone band: a plain number is the same band everywhere
  const radiusOf = (name) => {
    if (typeof o.radius === 'number') return o.radius;
    let best = o.radius?.['*'] ?? FEATHER_DEFAULTS.radius;
    for (const [pat, r] of Object.entries(o.radius || {})) {
      if (pat !== '*' && matches(name, [pat])) best = r;   // a named bone beats '*'
    }
    return best;
  };
  const R = Math.max(...bones.map((b) => radiusOf(b.name || ''))) * span;
  if (!(R > 0)) return { verts: 0, blended: 0, bones: 0, radius: 0, pairs: [] };

  // ---- current dominant bone per vertex (what the ops left behind) ----
  const dom = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    let bw = -1, bi = 0;
    for (let k = 0; k < 4; k++) {
      const w = wgt.getComponent(i, k);
      if (w > bw) { bw = w; bi = jnt.getComponent(i, k); }
    }
    dom[i] = bi;
  }

  const g = surfaceGraph(geo);
  const { rep, twins, start, adj, len } = g;
  const hier = boneHierDist(bones);
  const nB = bones.length;
  const bandOf = bones.map((b) => (matches(b.name || '', o.rigid || []) ? 0 : radiusOf(b.name || '') * span));
  const hard = bandOf.map((r) => !(r > 0));

  // sources per bone, over representatives only
  const seeds = new Map();
  const repList = [];
  for (let i = 0; i < n; i++) {
    if (rep[i] !== i) continue;
    repList.push(i);
    if (hard[dom[i]]) continue;
    let s = seeds.get(dom[i]);
    if (!s) seeds.set(dom[i], s = []);
    s.push(i);
  }

  // ---- per-vertex foreign influences, gathered by one capped Dijkstra per
  // bone out of that bone's own region ----
  const cand = new Map();                       // rep -> [boneIdx, weight, ...]
  const dist = new Float32Array(n);
  const stamp = new Int32Array(n);              // which bone's sweep wrote dist
  const fall = (d, band) => {
    const t = Math.min(1, Math.max(0, d / band));
    const f = 0.5 * (1 + Math.cos(Math.PI * t));   // 1 at the border, 0 at the rim
    return o.power === 1 ? f : Math.pow(f, o.power);
  };
  let sweeps = 0;
  for (const [bi, src] of seeds) {
    sweeps++;
    const reach = bandOf[bi];             // how far THIS bone may spread at all
    const heap = makeHeap();
    for (const v of src) { dist[v] = 0; stamp[v] = sweeps; heap.push(v, 0); }
    while (heap.size) {
      const [v, d] = heap.pop();
      if (stamp[v] === sweeps && d > dist[v]) continue;
      if (d >= reach) continue;
      for (let p = start[v], e = start[v + 1]; p < e; p++) {
        const u = adj[p];
        if (hard[dom[u]]) continue;             // never flood through robot parts
        const nd = d + len[p];
        if (nd >= reach) continue;
        if (stamp[u] === sweeps && dist[u] <= nd) continue;
        stamp[u] = sweeps; dist[u] = nd;
        heap.push(u, nd);
        if (dom[u] === bi) continue;            // its own region: nothing to record
        if (hier[dom[u] * nB + bi] > o.maxLinks) continue;
        // the TIGHTER of the two bands governs the border between them
        const band = Math.min(reach, bandOf[dom[u]]);
        if (nd >= band) continue;
        const w = fall(nd, band);
        if (w < o.minW) continue;
        let c = cand.get(u);
        if (!c) cand.set(u, c = []);
        // keep the strongest claim per bone (a later, longer path is worse)
        let seen = false;
        for (let k = 0; k < c.length; k += 2) if (c[k] === bi) { if (w > c[k + 1]) c[k + 1] = w; seen = true; break; }
        if (!seen) c.push(bi, w);
      }
    }
  }

  // ---- write: own bone at 1, foreign claims capped under it, top 4, normalized ----
  const pairs = new Map();
  let blended = 0;
  const slotB = new Int32Array(8), slotW = new Float64Array(8);
  for (const r of repList) {
    const own = dom[r];
    const c = hard[own] ? null : cand.get(r);
    let m = 0;
    slotB[m] = own; slotW[m] = 1; m++;
    if (c) {
      for (let k = 0; k < c.length && m < 8; k += 2) {
        slotB[m] = c[k]; slotW[m] = Math.min(o.cap, c[k + 1]); m++;
      }
    }
    if (m > 1) {
      // biggest first (the own bone is always 1, so it stays slot 0), top 4
      for (let a = 1; a < m; a++) for (let b = a + 1; b < m; b++) {
        if (slotW[b] > slotW[a]) {
          const tb = slotB[a], tw = slotW[a];
          slotB[a] = slotB[b]; slotW[a] = slotW[b]; slotB[b] = tb; slotW[b] = tw;
        }
      }
      if (m > 4) m = 4;
      blended++;
      for (let k = 1; k < m; k++) {
        const key = own < slotB[k] ? `${bones[own]?.name}~${bones[slotB[k]]?.name}` : `${bones[slotB[k]]?.name}~${bones[own]?.name}`;
        pairs.set(key, (pairs.get(key) || 0) + 1);
      }
    }
    let sum = 0;
    for (let k = 0; k < m; k++) sum += slotW[k];
    for (const v of twins.get(r) || [r]) {
      jnt.setXYZW(v, slotB[0], m > 1 ? slotB[1] : 0, m > 2 ? slotB[2] : 0, m > 3 ? slotB[3] : 0);
      wgt.setXYZW(v, slotW[0] / sum, m > 1 ? slotW[1] / sum : 0, m > 2 ? slotW[2] / sum : 0, m > 3 ? slotW[3] / sum : 0);
    }
  }
  jnt.needsUpdate = true;
  wgt.needsUpdate = true;
  return {
    verts: n,
    blended,
    bones: seeds.size,
    radius: R,
    pairs: [...pairs.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ pair: k, verts: v })),
  };
}
