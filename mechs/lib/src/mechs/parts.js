// Mech construction kit: geometry helpers + an Assembler that merges parts
// per (joint, material) into single meshes to keep draw calls low.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

// ---------- geometry builders ----------

export function roundedBox(w, h, d, r) {
  const radius = Math.min(r ?? Math.min(w, h, d) * 0.16, Math.min(w, h, d) * 0.49);
  return new RoundedBoxGeometry(w, h, d, 2, radius);
}

// Box whose top face is scaled relative to bottom — the workhorse armor shape.
export function taperBox(wBot, h, dBot, wTopF = 0.7, dTopF = 0.7) {
  const g = new THREE.BoxGeometry(wBot, h, dBot);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) {
      pos.setX(i, pos.getX(i) * wTopF);
      pos.setZ(i, pos.getZ(i) * dTopF);
    }
  }
  g.computeVertexNormals();
  return g;
}

export function cyl(rTop, rBot, h, seg = 12) {
  return new THREE.CylinderGeometry(rTop, rBot, h, seg);
}

export function sphere(r, seg = 14) {
  return new THREE.SphereGeometry(r, seg, Math.max(8, (seg / 2) | 0));
}

export function cone(r, h, seg = 10) {
  return new THREE.ConeGeometry(r, h, seg);
}

export function torus(r, tube, seg = 20) {
  return new THREE.TorusGeometry(r, tube, 8, seg);
}

// Thin blade / fin: tapered box, very shallow depth.
export function fin(len, wide, thick, taper = 0.25) {
  return taperBox(wide, len, thick, taper, 0.8);
}

// ---------- curved / sculpted forms (concept-fidelity vocabulary) ----------

// Smooth revolved bulge through profile control points [[y, radius], ...].
// scaleX/scaleZ squash the revolution into an elliptical cross-section.
export function bulgeLathe(profile, { seg = 24, scaleX = 1, scaleZ = 1 } = {}) {
  const pts = profile.map(([y, r]) => new THREE.Vector2(Math.max(0.001, r), y));
  // resample through a smooth curve for organic silhouettes
  const curve = new THREE.SplineCurve(pts);
  const smooth = curve.getPoints(Math.max(8, profile.length * 5));
  const g = new THREE.LatheGeometry(smooth.map((p) => new THREE.Vector2(Math.max(0.001, p.x), p.y)), seg);
  if (scaleX !== 1 || scaleZ !== 1) {
    g.scale(scaleX, 1, scaleZ);
    g.computeVertexNormals();
  }
  return g;
}

// Chamfered column: N-sided prism bulging through rBot -> rMid -> rTop.
// 8 sides reads as a machined rhomboid housing, 6 as a hex slab.
export function facetBulge(rBot, rMid, rTop, h, { sides = 8, scaleX = 1, scaleZ = 1 } = {}) {
  const lower = new THREE.CylinderGeometry(rMid, rBot, h / 2, sides, 1);
  lower.translate(0, -h / 4, 0);
  const upper = new THREE.CylinderGeometry(rTop, rMid, h / 2, sides, 1);
  upper.translate(0, h / 4, 0);
  const g = BufferGeometryUtils.mergeGeometries(
    [lower.toNonIndexed(), upper.toNonIndexed()], false);
  lower.dispose(); upper.dispose();
  g.rotateY(Math.PI / sides); // flat face forward
  if (scaleX !== 1 || scaleZ !== 1) g.scale(scaleX, 1, scaleZ);
  g.computeVertexNormals();
  return g;
}

// Beveled plate extruded from a rounded 2D outline (in the XY plane,
// thickness along +Z). outline: array of [x, y]; corners get rounded.
export function beveledPlate(outline, thickness, { bevel = 0.06, round = 0.12 } = {}) {
  const shape = new THREE.Shape();
  const n = outline.length;
  for (let i = 0; i <= n; i++) {
    const [x0, y0] = outline[i % n];
    const [x1, y1] = outline[(i + 1) % n];
    const [xp, yp] = outline[(i - 1 + n) % n];
    // move toward corner, round with quadratic through it
    const inA = { x: x0 + (xp - x0) * round, y: y0 + (yp - y0) * round };
    const inB = { x: x0 + (x1 - x0) * round, y: y0 + (y1 - y0) * round };
    if (i === 0) shape.moveTo(inB.x, inB.y);
    else {
      shape.lineTo(inA.x, inA.y);
      shape.quadraticCurveTo(x0, y0, inB.x, inB.y);
    }
  }
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thickness, bevelEnabled: true, bevelThickness: bevel,
    bevelSize: bevel, bevelSegments: 2, curveSegments: 6,
  });
  g.translate(0, 0, -thickness / 2);
  // normalize UVs to ~0..1 so skins read at a sane scale
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const uv = g.attributes.uv;
  const sx = 1 / Math.max(0.001, bb.max.x - bb.min.x);
  const sy = 1 / Math.max(0.001, bb.max.y - bb.min.y);
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) - bb.min.x) * sx, (uv.getY(i) - bb.min.y) * sy);
  }
  return g;
}

// Classic mech shield outline (knee pads, chest plates, skirts): a tapered
// pentagon, pointing -Y. w/h are full width/height.
export function shieldOutline(w, h, { taper = 0.72, tip = 0.3 } = {}) {
  const hw = w / 2, hh = h / 2;
  return [
    [-hw, hh], [hw, hh],                       // top edge
    [hw * taper, -hh + h * tip],               // lower sides taper in
    [0, -hh],                                  // bottom tip
    [-hw * taper, -hh + h * tip],
  ];
}

// Rhomboid (elongated hex) outline — side plates, fins.
export function rhombOutline(w, h, { cut = 0.3 } = {}) {
  const hw = w / 2, hh = h / 2;
  return [
    [-hw * (1 - cut), hh], [hw * (1 - cut), hh],
    [hw, 0],
    [hw * (1 - cut), -hh], [-hw * (1 - cut), -hh],
    [-hw, 0],
  ];
}

// ---------- assembler ----------
// Collect geometries per joint & material key, then merge into one mesh each.

export class Assembler {
  constructor() {
    this.buckets = new Map(); // `${joint}|${mat}` -> geometry[]
    this.customs = [];        // {joint, material, geo, opts} — unmerged one-offs (decal plates)
  }

  // A part with its own THREE.Material (e.g. decal-textured plates).
  custom(joint, material, geo, opts = {}) {
    this.customs.push({ joint, material, geo, opts });
    return this;
  }

  part(joint, mat, geo, opts = {}) {
    const p = opts.p || [0, 0, 0];
    const r = opts.r || [0, 0, 0];
    let s = opts.s ?? 1;
    if (typeof s === 'number') s = [s, s, s];
    _e.set(r[0], r[1], r[2]);
    _q.setFromEuler(_e);
    _p.set(p[0], p[1], p[2]);
    _s.set(s[0], s[1], s[2]);
    _m.compose(_p, _q, _s);
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(_m);
    const key = `${joint}|${mat}`;
    if (!this.buckets.has(key)) this.buckets.set(key, []);
    this.buckets.get(key).push(g);
    geo.dispose();
    return this;
  }

  // convenience wrappers
  box(joint, mat, [w, h, d], opts = {}) {
    return this.part(joint, mat, roundedBox(w, h, d, opts.bevel), opts);
  }
  sharpBox(joint, mat, [w, h, d], opts = {}) {
    return this.part(joint, mat, new THREE.BoxGeometry(w, h, d), opts);
  }
  taper(joint, mat, [w, h, d], wTopF, dTopF, opts = {}) {
    return this.part(joint, mat, taperBox(w, h, d, wTopF, dTopF), opts);
  }
  tube(joint, mat, rt, rb, h, opts = {}) {
    return this.part(joint, mat, cyl(rt, rb, h, opts.seg ?? 12), opts);
  }
  ball(joint, mat, r, opts = {}) {
    return this.part(joint, mat, sphere(r, opts.seg ?? 14), opts);
  }
  spike(joint, mat, r, h, opts = {}) {
    return this.part(joint, mat, cone(r, h, opts.seg ?? 10), opts);
  }
  ring(joint, mat, r, tube, opts = {}) {
    return this.part(joint, mat, torus(r, tube, opts.seg ?? 20), opts);
  }
  blade(joint, mat, len, wide, thick, opts = {}) {
    return this.part(joint, mat, fin(len, wide, thick, opts.taper ?? 0.2), opts);
  }
  lathe(joint, mat, profile, opts = {}) {
    return this.part(joint, mat, bulgeLathe(profile, opts), opts);
  }
  facet(joint, mat, rBot, rMid, rTop, h, opts = {}) {
    return this.part(joint, mat, facetBulge(rBot, rMid, rTop, h, opts), opts);
  }
  plate(joint, mat, outline, thickness, opts = {}) {
    return this.part(joint, mat, beveledPlate(outline, thickness, opts), opts);
  }
  capsule(joint, mat, r, len, opts = {}) {
    return this.part(joint, mat, new THREE.CapsuleGeometry(r, len, 4, 12), opts);
  }

  // ---------- compound helpers ----------

  // Boxy mech fist with knuckle ridge; palm faces -Y when arm hangs down.
  fist(joint, matA, matB, size, opts = {}) {
    const p = opts.p || [0, 0, 0];
    this.box(joint, matA, [size, size * 1.15, size * 1.1], { p });
    // knuckles
    for (let i = -1; i <= 1; i++) {
      this.box(joint, matB, [size * 0.26, size * 0.3, size * 0.34], {
        p: [p[0] + i * size * 0.3, p[1] - size * 0.35, p[2] + size * 0.48],
      });
    }
    // thumb
    this.box(joint, matB, [size * 0.24, size * 0.4, size * 0.3], {
      p: [p[0] + (opts.side || 1) * size * 0.55, p[1] - size * 0.1, p[2] + size * 0.28],
    });
    return this;
  }

  // Exhaust / booster nozzle pointing along -Z unless rotated.
  thruster(joint, matMetal, matGlow, r, len, opts = {}) {
    const p = opts.p || [0, 0, 0];
    const rot = opts.r || [Math.PI / 2, 0, 0];
    this.part(joint, matMetal, cyl(r, r * 0.72, len, 12), { p, r: rot });
    this.part(joint, matGlow, cyl(r * 0.62, r * 0.5, len * 0.24, 12), {
      p: [p[0], p[1], p[2]], r: rot, s: [1, 1, 1],
    });
    return this;
  }

  // Grill of thin slats (vents) across width w.
  vents(joint, mat, count, w, h, d, opts = {}) {
    const p = opts.p || [0, 0, 0];
    const gap = w / count;
    for (let i = 0; i < count; i++) {
      this.sharpBox(joint, mat, [gap * 0.55, h, d], {
        p: [p[0] - w / 2 + gap * (i + 0.5), p[1], p[2]],
        r: opts.r,
      });
    }
    return this;
  }

  // Antenna: thin rod + tip ball.
  antenna(joint, matMetal, matGlow, len, opts = {}) {
    const p = opts.p || [0, 0, 0];
    const rot = opts.r || [0, 0, 0];
    this.part(joint, matMetal, cyl(0.02, 0.035, len, 6), { p: [p[0], p[1] + len / 2, p[2]], r: rot });
    this.ball(joint, matGlow, 0.06, { p: [p[0], p[1] + len, p[2]], seg: 8 });
    return this;
  }

  // Cluster of gun barrels arranged in a circle, pointing +Z.
  barrelCluster(joint, mat, count, clusterR, barrelR, len, opts = {}) {
    const p = opts.p || [0, 0, 0];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const x = Math.cos(a) * clusterR, y = Math.sin(a) * clusterR;
      this.part(joint, mat, cyl(barrelR, barrelR, len, 8), {
        p: [p[0] + x, p[1] + y, p[2]],
        r: [Math.PI / 2, 0, 0],
      });
    }
    return this;
  }

  // Segmented shoulder pauldron (overlapping curved plates).
  pauldron(joint, mat, w, h, d, opts = {}) {
    const p = opts.p || [0, 0, 0];
    const tilt = opts.tilt ?? 0.25;
    for (let i = 0; i < 3; i++) {
      const f = 1 - i * 0.16;
      this.taper(joint, mat, [w * f, h * 0.42, d * f], 0.72, 0.85, {
        p: [p[0], p[1] - i * h * 0.24, p[2]],
        r: [0, 0, (opts.side || 1) * tilt * (1 + i * 0.25)],
      });
    }
    return this;
  }

  // Piston detail between two local points (visual only).
  piston(joint, matMetal, from, to, r = 0.05) {
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
    // orientation: rotate Y axis onto direction
    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const eul = new THREE.Euler().setFromQuaternion(quat);
    this.part(joint, matMetal, cyl(r, r, len * 0.94, 8), { p: mid, r: [eul.x, eul.y, eul.z] });
    return this;
  }

  // Merge everything into meshes and attach to the joint groups.
  build(jointGroups, materials, { castShadow = true } = {}) {
    for (const [key, geos] of this.buckets) {
      const [jointName, matKey] = key.split('|');
      const joint = jointGroups[jointName];
      const mat = materials[matKey];
      if (!joint || !mat) {
        console.warn('Assembler: missing joint or material', jointName, matKey);
        continue;
      }
      const merged = BufferGeometryUtils.mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = false;
      joint.add(mesh);
    }
    this.buckets.clear();

    for (const c of this.customs) {
      const joint = jointGroups[c.joint];
      if (!joint) continue;
      const mesh = new THREE.Mesh(c.geo, c.material);
      const p = c.opts.p || [0, 0, 0];
      const r = c.opts.r || [0, 0, 0];
      mesh.position.set(p[0], p[1], p[2]);
      mesh.rotation.set(r[0], r[1], r[2]);
      // `s` takes the same forms as part()'s: a number OR a per-axis triple.
      // It used to be setScalar() only, so a design passing [1, 0.88, 1] —
      // which is exactly how every OTHER builder here squashes a ring —
      // assigned the ARRAY to x/y/z and produced a NaN world matrix. The
      // part then rendered as nothing (jerry lost his three torso seam bands)
      // and poisoned any Box3 taken over the mech, silently.
      if (c.opts.s !== undefined) {
        const s = c.opts.s;
        if (typeof s === 'number') mesh.scale.setScalar(s);
        else mesh.scale.set(s[0], s[1], s[2]);
      }
      mesh.castShadow = castShadow;
      joint.add(mesh);
    }
    this.customs.length = 0;
  }
}
