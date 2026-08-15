#!/usr/bin/env node
// NORMAL CONTINUITY — the intake gate the ink outline never had.
//
// The outline pass (render3d/src/outline.js) is an inverted hull: every vertex
// is pushed out along its own normal. Anywhere the geometry holds the SAME
// position twice with DIVERGENT normals — every UV seam, every hard edge, and
// every one of the disconnected shells a generated mesh arrives as — the hull
// tears open, and the line around the fighter breaks. The delivery spec asks
// for edited (averaged) normals for exactly this reason (plan.md §5), but
// until now the only gate was a human sweeping a light in the workbench.
//
// This reads each .glb directly (header + JSON chunk + BIN chunk — no three,
// no browser, no textures) and measures, per file:
//
//   shared    positions carried by 2+ vertices (the places a seam CAN split)
//   split     those whose normals diverge past the angle threshold
//   split%    the fraction — the number to gate on
//
// A soft-shaded delivery with averaged normals scores near zero. A patchwork
// of disjoint shells scores high, and its outline shows it.
//
//   node tools/check_model_normals.mjs                # report the roster
//   node tools/check_model_normals.mjs gojo uro       # just these
//   node tools/check_model_normals.mjs --strict 0.35  # exit 1 past 35%
//
// Default is a REPORT, not a gate: the current roster is generated art and
// much of it would fail an honest threshold today. `--strict` is for intake:
// run it against a NEW delivery so a regression arrives loudly.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(ROOT, "render3d", "assets");

const args = process.argv.slice(2);
const strictIdx = args.indexOf("--strict");
const STRICT = strictIdx >= 0 ? parseFloat(args[strictIdx + 1]) : null;
const only = args.filter((a, i) => !a.startsWith("--") && i !== strictIdx + 1);

// Normals within this angle of each other count as continuous. 60° forgives a
// deliberately hard edge on a prop or a jaw; a shell boundary is nearly always
// far past it (the two sides of a duplicated seam face opposite half-spaces).
const ANGLE_DEG = 60;
const COS_LIMIT = Math.cos((ANGLE_DEG * Math.PI) / 180);

function parseGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB");
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
  let off = 20 + jsonLen;
  let bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    if (type === 0x004e4942) bin = buf.subarray(off + 8, off + 8 + len);
    off += 8 + len;
  }
  return { json, bin };
}

/** Float32 VEC3 accessor -> flat array view descriptor. Returns null for any
 *  layout this tool does not speak (sparse, non-float) — skipped, not fatal. */
function vec3Accessor(gltf, bin, index) {
  const acc = gltf.accessors?.[index];
  if (!acc || acc.componentType !== 5126 || acc.type !== "VEC3" || acc.sparse) return null;
  const view = gltf.bufferViews?.[acc.bufferView];
  if (!view) return null;
  const stride = view.byteStride || 12;
  const base = (view.byteOffset || 0) + (acc.byteOffset || 0);
  return { bin, base, stride, count: acc.count };
}

const readV = (a, i, out) => {
  const o = a.base + i * a.stride;
  out[0] = a.bin.readFloatLE(o);
  out[1] = a.bin.readFloatLE(o + 4);
  out[2] = a.bin.readFloatLE(o + 8);
};

function measure(path) {
  const { json, bin } = parseGlb(path);
  // Quantise positions to 0.1 mm so float dust does not hide a real seam.
  const Q = 1e4;
  const byPos = new Map(); // "x,y,z" -> [nx,ny,nz, ...] flat
  const p = [0, 0, 0], n = [0, 0, 0];
  let verts = 0;
  for (const mesh of json.meshes || []) {
    for (const prim of mesh.primitives || []) {
      const pos = vec3Accessor(json, bin, prim.attributes?.POSITION);
      const nor = vec3Accessor(json, bin, prim.attributes?.NORMAL);
      if (!pos || !nor || nor.count !== pos.count) continue;
      verts += pos.count;
      for (let i = 0; i < pos.count; i++) {
        readV(pos, i, p);
        readV(nor, i, n);
        const key = `${Math.round(p[0] * Q)},${Math.round(p[1] * Q)},${Math.round(p[2] * Q)}`;
        let list = byPos.get(key);
        if (!list) byPos.set(key, (list = []));
        list.push(n[0], n[1], n[2]);
      }
    }
  }
  let shared = 0, split = 0;
  for (const list of byPos.values()) {
    const m = list.length / 3;
    if (m < 2) continue;
    shared++;
    let worst = 1;
    for (let i = 0; i < m; i++) {
      for (let j = i + 1; j < m; j++) {
        const dot = list[i * 3] * list[j * 3] + list[i * 3 + 1] * list[j * 3 + 1]
          + list[i * 3 + 2] * list[j * 3 + 2];
        if (dot < worst) worst = dot;
      }
    }
    if (worst < COS_LIMIT) split++;
  }
  return { verts, shared, split, frac: shared ? split / shared : 0 };
}

const manifest = JSON.parse(readFileSync(join(ASSETS, "manifest.json"), "utf8"));
const chars = Object.entries(manifest.characters || {})
  .filter(([k, e]) => e?.model && (!only.length || only.includes(k)));

if (!chars.length) {
  console.error("nothing to check — unknown character?");
  process.exit(2);
}

console.log(`normal continuity, split threshold ${ANGLE_DEG}°`
  + (STRICT != null ? `, strict gate ${(STRICT * 100).toFixed(0)}%` : " (report only)"));
console.log("char          verts   shared-pos   split   split%");

let failures = 0;
const rows = [];
for (const [key, entry] of chars) {
  const path = join(ASSETS, entry.model);
  if (!existsSync(path)) { console.log(`${key.padEnd(12)}  MISSING ${entry.model}`); continue; }
  try {
    const r = measure(path);
    rows.push([key, r]);
  } catch (err) {
    console.log(`${key.padEnd(12)}  unreadable: ${err.message}`);
    failures++;
  }
}
rows.sort((a, b) => b[1].frac - a[1].frac);
for (const [key, r] of rows) {
  const pct = (r.frac * 100).toFixed(1) + "%";
  const bad = STRICT != null && r.frac > STRICT;
  if (bad) failures++;
  console.log(`${key.padEnd(12)} ${String(r.verts).padStart(6)}   ${String(r.shared).padStart(10)}   ${String(r.split).padStart(5)}   ${pct.padStart(6)}${bad ? "  FAIL" : ""}`);
}
if (STRICT != null) {
  console.log(failures ? `\n${failures} file(s) past the gate` : "\nall inside the gate");
  process.exit(failures ? 1 : 0);
}
