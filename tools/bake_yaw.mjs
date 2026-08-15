#!/usr/bin/env node
// Bake each rig's `yawOffsetDeg` into the .glb, so the file itself faces the
// way the delivery spec says and the engine stops correcting it every frame.
//
//     node tools/bake_yaw.mjs                  # report what would change
//     node tools/bake_yaw.mjs --write          # write updates/<char>/<char>.glb
//     node tools/bake_yaw.mjs --write gojo uro # just these
//     node tools/bake_yaw.mjs --write --out /some/dir
//
// WHY THIS IS A JSON EDIT AND NOT A BLENDER ROUND TRIP
//
// Every delivered rig in this repo has exactly one scene root:
//
//     scene
//       └── Armature            no transform, not a skin joint, not animated
//            ├── <mesh>         skinned
//            └── Hips           the skeleton root
//
// Rotating `Armature` therefore turns the mesh and the skeleton together, in
// one number, with nothing downstream able to overwrite it: no animation
// channel targets that node (all 26 clips address the bones), and the glTF
// skinning spec computes joint matrices in world space, so a rotation on the
// joints' shared ancestor rotates the deformed result exactly as it rotates
// the bones. The binary chunk — every vertex, weight and keyframe — is copied
// through untouched.
//
// A Blender round trip would do the same job by re-exporting the whole file,
// which risks everything a re-encode can cost (extras, vertex colour channels,
// material graphs, keyframe resampling) to change one quaternion. It is the
// right tool for re-framing the BONE RESTS — making bone-local +Z the
// fighter's forward — but nothing in this engine reads bone-local forward any
// more: the layers all derive facing from the rig root's world quaternion
// (ik.js characterLateral) or measure it from the pose (the stance solver's
// hip axis). So the cheap bake is also the complete one.
//
// AFTER BAKING, the manifest's `yawOffsetDeg` MUST go to 0 for that character,
// or the rig is turned twice. The two changes belong in one commit; intake
// does the zeroing when the baked file is imported.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(ROOT, "render3d", "assets");
const MANIFEST = join(ASSETS, "manifest.json");

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const outIdx = args.indexOf("--out");
const OUT = outIdx >= 0 ? args[outIdx + 1] : join(ROOT, "updates");
const only = args.filter((a) => !a.startsWith("--") && a !== OUT);

const JSON_CHUNK = 0x4e4f534a; // 'JSON'
const BIN_CHUNK = 0x004e4942;  // 'BIN\0'

/** Split a .glb into its header, JSON and the chunks after it. */
function readGlb(path) {
  const buf = readFileSync(path);
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546c67) throw new Error(`${path}: not a .glb`);
  const version = buf.readUInt32LE(4);
  const chunks = [];
  let at = 12;
  while (at < buf.length) {
    const len = buf.readUInt32LE(at);
    const type = buf.readUInt32LE(at + 4);
    chunks.push({ type, data: buf.subarray(at + 8, at + 8 + len) });
    at += 8 + len + ((4 - (len % 4)) % 4);
  }
  const jsonChunk = chunks.find((c) => c.type === JSON_CHUNK);
  if (!jsonChunk) throw new Error(`${path}: no JSON chunk`);
  return { version, chunks, gltf: JSON.parse(jsonChunk.data.toString("utf8")) };
}

/** Re-assemble a .glb around an edited JSON, padding both chunks as the spec
 *  requires (JSON with spaces, BIN with zeros) and restamping the length. */
function writeGlb(path, { version, chunks, gltf }) {
  const out = [];
  for (const chunk of chunks) {
    const raw = chunk.type === JSON_CHUNK
      ? Buffer.from(JSON.stringify(gltf), "utf8")
      : chunk.data;
    const pad = (4 - (raw.length % 4)) % 4;
    const padded = pad
      ? Buffer.concat([raw, Buffer.alloc(pad, chunk.type === JSON_CHUNK ? 0x20 : 0x00)])
      : raw;
    const head = Buffer.alloc(8);
    head.writeUInt32LE(padded.length, 0);
    head.writeUInt32LE(chunk.type, 4);
    out.push(head, padded);
  }
  const body = Buffer.concat(out);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(version, 4);
  header.writeUInt32LE(12 + body.length, 8);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([header, body]));
}

/** q = yaw about +Y, in glTF's [x, y, z, w] order. */
const yawQuat = (deg) => {
  const h = (deg * Math.PI) / 360;
  return [0, Math.sin(h), 0, Math.cos(h)];
};

/** Hamilton product, [x, y, z, w] — applies `a` on top of `b`. */
function mulQuat(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/**
 * The one node a yaw may be baked onto: the scene's single root, provided it
 * is the plain container this pipeline produces. Anything else — several
 * roots, a root that is itself a joint, a root some clip animates — is a rig
 * shaped differently enough that turning it blind would be a guess, so it is
 * refused by name rather than handled by hope.
 */
function bakeTarget(gltf) {
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  const roots = scene?.nodes || [];
  if (roots.length !== 1) return { error: `${roots.length} scene roots, expected 1` };
  const idx = roots[0];
  const node = gltf.nodes[idx];
  const joints = new Set((gltf.skins || []).flatMap((s) => s.joints || []));
  if (joints.has(idx)) return { error: `root "${node.name}" is a skin joint` };
  for (const anim of gltf.animations || []) {
    for (const ch of anim.channels || []) {
      if (ch.target?.node === idx) {
        return { error: `root "${node.name}" is animated by "${anim.name}"` };
      }
    }
  }
  if (node.matrix) return { error: `root "${node.name}" carries a matrix, not a TRS` };
  return { idx, node };
}

// ------------------------------------------------------------------- run

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const chars = Object.entries(manifest.characters || {})
  .filter(([char, e]) => e?.model && (!only.length || only.includes(char)));

if (!chars.length) {
  console.log("no characters matched");
  process.exit(1);
}

const baked = [];
let skipped = 0, failed = 0;
for (const [char, entry] of chars) {
  const yaw = Number(entry.yawOffsetDeg) || 0;
  const src = join(ASSETS, entry.model);
  if (!existsSync(src)) {
    console.log(`FAIL ${char.padEnd(11)} missing ${entry.model}`);
    failed++;
    continue;
  }
  if (!yaw) {
    console.log(`  -- ${char.padEnd(11)} already 0° — nothing to bake`);
    skipped++;
    continue;
  }
  let glb;
  try {
    glb = readGlb(src);
  } catch (err) {
    console.log(`FAIL ${char.padEnd(11)} ${err.message}`);
    failed++;
    continue;
  }
  const target = bakeTarget(glb.gltf);
  if (target.error) {
    console.log(`FAIL ${char.padEnd(11)} ${target.error} — bake this one in Blender`);
    failed++;
    continue;
  }
  const before = target.node.rotation || [0, 0, 0, 1];
  const after = mulQuat(yawQuat(yaw), before);
  const dest = join(OUT, char, `${char}.glb`);
  console.log(`  ok ${char.padEnd(11)} ${String(yaw).padStart(4)}° onto "${target.node.name}"`
    + `  ${WRITE ? `-> ${dest.replace(ROOT + "/", "")}` : "(dry run)"}`);
  if (WRITE) {
    target.node.rotation = after.map((v) => +v.toFixed(9));
    writeGlb(dest, glb);
  }
  baked.push({ char, yawOffsetDeg: yaw, node: target.node.name, model: entry.model });
}

if (WRITE && baked.length) {
  // The receipt intake reads: which characters were turned, and by how much,
  // so the manifest zeroing is checked against what actually happened rather
  // than assumed from a filename.
  const receipt = {
    kind: "render3d-yaw-bake",
    baked: new Date().toISOString(),
    note: "Each .glb here has had its manifest yawOffsetDeg baked onto the scene "
      + "root node. On import, set yawOffsetDeg to 0 for these characters — the "
      + "rig is turned twice otherwise.",
    characters: Object.fromEntries(baked.map((b) => [b.char, b])),
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "baked.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`\nwrote ${baked.length} rig(s) + baked.json to ${OUT.replace(ROOT + "/", "")}`);
} else if (!WRITE) {
  console.log(`\n${baked.length} rig(s) would be baked, ${skipped} already 0°.`
    + " Re-run with --write.");
}
if (failed) {
  console.log(`${failed} rig(s) could not be baked automatically.`);
  process.exit(1);
}
