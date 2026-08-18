#!/usr/bin/env node
// MODEL-DERIVED CENTRES OF MASS — where each mech's mass actually sits, measured
// from the body the game draws.
//
//     node server.mjs &
//     node tools/derive_com.mjs            # measure, write the config
//     node tools/derive_com.mjs --check    # stale? exit 1 (no browser)
//
// WHY THIS EXISTS. The centre of mass is the one point on a fighter that should
// hold STILL while everything else moves around it: the pivot a tumble turns
// about, the anchor an airborne body hangs from, the chest line an aim solves
// from, and the centre the sim hangs a launched hurtbox on. Every one of those
// asked src/body_points.js for `comFrac`, and with src/config_body_points.js
// empty — as it has always been — every one of them got COM_BODY_FRAC: 0.55, the
// same number for all seventeen machines, from Saurion's long low body to
// Titanus's top-heavy one.
//
// WHY NOT OFF THE SKELETON. Two attempts at reading it live from the rig failed,
// and it is worth recording why so nobody spends the afternoon again. Searching
// for a `torso`/`Spine` bone answers for the CHEST (0.60-0.74 across the twelve
// rigs that have such a bone) and answers nothing at all for the other five —
// saurion, rhino, tempest, frogger and nullbot are auto-rigged, with bones named
// `bone_5` and `tripoHead_3` and no naming convention to lean on. Weighing the
// skin weights on the bones is convention-free and correct in principle, but
// those same five bind their mesh to bones that all sit at the origin, so the
// weighted average is the origin. There are two rig families in this roster and
// no skeleton-level question has one answer across both.
//
// WHAT IS MEASURED INSTEAD is the drawing: the alpha-weighted centroid of the
// mech as the game actually renders it, as a fraction of that drawing's own
// height above its foot line. That is the honest reading of "where does this
// machine's mass look like it is", it is exactly the quantity every consumer
// wants (all of them scale it by drawn height), and it needs to know nothing
// about bones — so it answers for both rig families and for whatever the next
// delivery is rigged with. Measured through drawCharFrame, so it is the same
// pipeline the game draws with rather than a parallel one.
//
// PER STATE, not just per mech. A pose moves the mass: a fall tucks the legs and
// carries it up around a tenth of a body height, a knockdown puts it on the
// floor. The base is the idle stance and states are listed only where they
// differ from it by more than THRESHOLD, so the config stays about what actually
// varies. Runtime cost is a lookup — this is the whole reason the measurement is
// offline rather than in the frame loop.
//
// THE MODELS ARE IN FLUX, so this is a PIPELINE and not a one-off, exactly like
// tools/derive_muzzles.mjs: the generated config fingerprints everything the
// measurement depends on, and `--check` fails while it is stale.

import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src", "config_model_com.js");
const BASE = process.env.BASE || "http://127.0.0.1:5174";
const CHECK = process.argv.includes("--check");

// How far a state's centre must sit from the idle one to be worth storing.
// 0.02 of body height is about 3 px on a 150 px mech — under the width of the
// pivot dot the workbench draws, and well under anything a player could see.
const THRESHOLD = 0.02;

// The states worth asking about: everything the game plays while a body is off
// the ground or off its feet, which is where an anchor that disagrees with the
// pose is visible. A grounded stance is the base and does not need listing.
const STATES = [
  "fall", "jump", "hover", "hurt", "dizzy", "prone", "getup",
  "dodge_roll", "dodge_air", "ledge", "crouch", "land",
];

const POSE_SOURCES = [
  "render3d/src/states.js", "render3d/src/pose.js",
  "render3d/src/rig_fixes.js", "render3d/src/loader.js",
  "render3d/src/scene.js", "render3d/src/blit.js",
];

const sha = (buf) => createHash("sha1").update(buf).digest("hex").slice(0, 12);
const fileSha = (rel) => existsSync(join(ROOT, rel)) ? sha(readFileSync(join(ROOT, rel))) : "missing";

function currentInputs() {
  const manifest = JSON.parse(readFileSync(join(ROOT, "render3d/assets/manifest.json"), "utf8"));
  const models = {};
  for (const [key, entry] of Object.entries(manifest.characters || {})) {
    if (entry?.model) models[key] = fileSha(join("render3d/assets", entry.model));
  }
  return {
    manifest: fileSha("render3d/assets/manifest.json"),
    poses: sha(POSE_SOURCES.map(fileSha).join("|")),
    models,
  };
}

function loadStored() {
  if (!existsSync(OUT)) return null;
  const text = readFileSync(OUT, "utf8");
  const m = /export const COM_INPUTS = (\{[\s\S]*?\n\});/.exec(text);
  try { return m ? JSON.parse(m[1]) : null; } catch { return null; }
}

if (CHECK) {
  const stored = loadStored();
  if (!stored) {
    console.error("config_model_com.js missing or unreadable — run: node tools/derive_com.mjs");
    process.exit(1);
  }
  const now = currentInputs();
  const diffs = [];
  if (stored.manifest !== now.manifest) diffs.push("render3d manifest");
  if (stored.poses !== now.poses) diffs.push("pose libraries");
  for (const k of new Set([...Object.keys(stored.models || {}), ...Object.keys(now.models)])) {
    if ((stored.models || {})[k] !== now.models[k]) diffs.push(`model: ${k}`);
  }
  if (diffs.length) {
    console.error(`centre-of-mass config is STALE (${diffs.join(", ")}) — `
      + "run: node server.mjs & node tools/derive_com.mjs");
    process.exit(1);
  }
  console.log("centre-of-mass config is current");
  process.exit(0);
}

// ------------------------------------------------------------- measurement

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--no-proxy-server", "--enable-unsafe-swiftshader"],
}).catch(async () => chromium.launch({ args: ["--no-proxy-server", "--enable-unsafe-swiftshader"] }));
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.error("PAGEERROR", String(e).slice(0, 200)));

// `rigs=eager` for the same reason derive_muzzles.mjs needs it: every mech has to
// be measurable in one pass, and the lazy path only loads what a match asks for.
await page.goto(`${BASE}/?camera=flat&rigs=eager`);
await page.waitForFunction(() => window.__render3d?.ready === true, { timeout: 240000 });

const measured = await page.evaluate(async ({ STATES, THRESHOLD }) => {
  const rd = await import("/render3d/src/backend.js");
  const { CHARACTER_KEYS } = await import("/src/characters.js");

  // Big enough that a mech lands on a couple of hundred rows — the centroid is
  // an average over thousands of pixels, so this is already far more precision
  // than four decimal places of body height.
  const S = 512;
  const canvas = document.createElement("canvas");
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  /** The alpha-weighted centroid of one drawn pose, as a fraction of the drawn
   *  body's height above its lowest row. Null when nothing was drawn. */
  const measure = (key, animKey) => {
    ctx.clearRect(0, 0, S, S);
    const token = rd.currentFrame(key, animKey, 0.1);
    if (!token) return null;
    // Feet near the bottom of the square, body centred: a pose that reaches is
    // still inside the frame, and the measurement is of the pixels either way.
    if (!rd.drawCharFrame(ctx, key, token, S / 2, S * 0.92, { facing: 1, scale: 1 })) return null;
    const d = ctx.getImageData(0, 0, S, S).data;
    let top = Infinity, bottom = -Infinity, mass = 0, acc = 0;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        // 8/255 rather than 0: a premultiplied edge leaves a dusting of nearly
        // transparent pixels well outside the body, and letting those set the
        // bounds would stretch the height the fraction is taken against.
        const a = d[((y * S) + x) * 4 + 3];
        if (a < 8) continue;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        mass += a;
        acc += a * y;
      }
    }
    if (!(mass > 0) || !(bottom > top)) return null;
    // Image y grows DOWNWARD, so height above the foot line is bottom minus the
    // centroid, over the body's own span.
    return (bottom - (acc / mass)) / (bottom - top);
  };

  const rows = [];
  for (const key of CHARACTER_KEYS) {
    const base = measure(key, "idle");
    if (base == null) { rows.push({ key, error: "idle did not draw" }); continue; }
    const states = {};
    for (const st of STATES) {
      const v = measure(key, st);
      if (v == null) continue;
      if (Math.abs(v - base) > THRESHOLD) states[st] = +v.toFixed(4);
    }
    rows.push({ key, base: +base.toFixed(4), states });
  }
  return rows;
}, { STATES, THRESHOLD });

await browser.close();

const failed = measured.filter((r) => r.error);
const ok = measured.filter((r) => !r.error).sort((a, b) => a.key.localeCompare(b.key));

for (const r of ok) {
  const extra = Object.entries(r.states);
  console.log(`  ${r.key.padEnd(10)} ${r.base.toFixed(3)}`
    + (extra.length ? `   ${extra.map(([k, v]) => `${k} ${v.toFixed(2)}`).join(", ")}` : ""));
}
for (const r of failed) console.log(`  ${r.key.padEnd(10)} FAILED — ${r.error}`);

if (!ok.length) {
  console.error("nothing measured — is the server up?");
  process.exit(1);
}

const body = ok.map((r) => {
  const states = Object.keys(r.states).length ? `, "states":${JSON.stringify(r.states)}` : "";
  return `  "${r.key}": {"base":${r.base}${states}},`;
}).join("\n");

writeFileSync(OUT, `// GENERATED by tools/derive_com.mjs — do not edit by hand.
//
// Where each mech's mass sits, as a fraction of its DRAWN HEIGHT above its foot
// line. 0.5 is halfway up the body; larger is higher. This is the point that
// should hold still while everything else moves around it — the pivot a tumble
// turns about, the anchor an airborne body hangs from, the chest line an aim
// solves from, and the centre a launched hurtbox hangs on.
//
// Measured as the alpha-weighted centroid of the mech as the game draws it, in
// its idle stance (\`base\`) and again in the states that move the mass more than
// ${THRESHOLD} of body height (\`states\`) — a fall tucks the legs and carries the centre
// up, a knockdown puts it on the floor. Measured off the DRAWING rather than off
// the skeleton because this roster has two rig families and no bone-level
// question has one answer across both; tools/derive_com.mjs explains at length.
//
// Read by src/body_points.js BELOW a human decision in src/config_body_points.js
// and ABOVE the roster-wide COM_BODY_FRAC fallback: measurement beats the
// default, and somebody who has looked at the machine beats measurement.
//
// Regenerate whenever the models, the manifest or the pose stack change:
//     node server.mjs &
//     node tools/derive_com.mjs
// \`--check\` fails while this file is stale.

export const MODEL_COM = {
${body}
};

// Fingerprint of everything the measurement above is a function of.
// \`--check\` fails while this file is stale.
export const COM_INPUTS = ${JSON.stringify(currentInputs(), null, 2)};
`);

console.log(`\nmeasured ${ok.length} mech(s) -> src/config_model_com.js`);
if (failed.length) {
  console.error(`${failed.length} mech(s) could not be measured`);
  process.exit(1);
}
