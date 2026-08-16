#!/usr/bin/env node
// MODEL-DERIVED MUZZLE POINTS — where each mech's shot actually leaves it,
// measured from the anchors Mech Mayhem's exporter already ships.
//
//     node server.mjs &
//     node tools/derive_muzzles.mjs            # measure, write the config
//     node tools/derive_muzzles.mjs --check    # stale? exit 1 (no browser)
//
// WHY THIS EXISTS. Every mech leaves ROBOTWORLD's exporter carrying empty
// nodes named `anchor_<name>` — `core` on the torso, `overhead` on the head,
// `boostL`/`boostR` on the feet, and `muzzleL`/`muzzleR` on whatever fires:
// Colossus's shoulder cannons, Wraith's rifle tip, Tritone's barrels. They are
// listed in every mechs/<key>.json and they are MM's own answer to "where does
// a shot leave this machine".
//
// Nothing in this game ever read them. tools/mech_intake.mjs imports geometry,
// height and clip names; plan task M6 ("Anchors: muzzle/boost/core/overhead as
// FX attachment points") is still unstarted; and combat.js's
// `spawnProjectileScaled` asks body_points.muzzlePoint, which — with
// src/config_body_points.js empty, as it has always been — answers with the
// REFERENCE BODY's chest offsets scaled by height. That is 58% up the body and
// about half a body-height forward, for all seventeen of them. Every gun in the
// game fires out of the middle of its machine, and the effect workbench drawing
// that point beside the art is what made it visible.
//
// So this restores them from the source they were exported from.
//
// WHICH MUZZLE. The one that is FURTHER FORWARD in the firing pose, not the one
// called "R". The names do not mean what they look like across this roster —
// Wraith's `muzzleR` is on `rifleTip` and his `muzzleL` is on `handR`; Konga's
// `muzzleL` is the pod itself and `muzzleR` the pod's tip — so a left/right
// convention would pick the wrong barrel for several mechs. "The end that
// points at the enemy" is objective and needs no convention, and it is the same
// reasoning tools/check_model_facing.mjs uses for not trusting a rig's own idea
// of left and right.
//
// WHICH POSE. The mech's own shoot clip, a third of a second in — the state a
// gun plays (`specialNeutral`, per specials.js slotAnim) at the beat the
// workbench freezes a launch on (workbench/usage.js LAUNCH_TIME). A muzzle
// rides the arm that raises it, so measuring the bind pose would answer for a
// machine standing at rest rather than one shooting.
//
// THE MODELS ARE IN FLUX, so this is a PIPELINE and not a one-off, exactly like
// tools/derive_attack_envelopes.mjs: the generated config fingerprints
// everything the measurement depends on, and `--check` fails while it is stale.

import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src", "config_model_muzzles.js");
const BASE = process.env.BASE || "http://127.0.0.1:5174";
const CHECK = process.argv.includes("--check");

// Everything a measured muzzle is a function of: the rigs themselves, the
// manifest that names their clips and heights, and the pose stack that puts
// them in the firing position.
const POSE_SOURCES = [
  "render3d/src/states.js", "render3d/src/pose.js",
  "render3d/src/rig_fixes.js", "render3d/src/loader.js",
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
  const m = /export const MUZZLE_INPUTS = (\{[\s\S]*?\n\});/.exec(text);
  try { return m ? JSON.parse(m[1]) : null; } catch { return null; }
}

if (CHECK) {
  const stored = loadStored();
  if (!stored) {
    console.error("config_model_muzzles.js missing or unreadable — run: node tools/derive_muzzles.mjs");
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
    console.error(`muzzle config is STALE (${diffs.join(", ")}) — `
      + "run: node server.mjs & node tools/derive_muzzles.mjs");
    process.exit(1);
  }
  console.log("muzzle config is current");
  process.exit(0);
}

// ------------------------------------------------------------- measurement

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--no-proxy-server", "--enable-unsafe-swiftshader"],
}).catch(async () => chromium.launch({ args: ["--no-proxy-server", "--enable-unsafe-swiftshader"] }));
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("PAGEERROR", String(e).slice(0, 200)));

// `rigs=eager` for the same reason derive_attack_envelopes.mjs needs it: rigs
// load on demand in a match, so under the default every `hasRig` is false at
// page load and a roster-wide sweep measures nothing.
await page.goto(`${BASE}/index.html?render=3d&camera=flat&rigs=eager`, { waitUntil: "load" });
await page.waitForFunction(() => window.__render3d?.ready === true, { timeout: 600000 });

const measured = await page.evaluate(async () => {
  const loader = await import("/render3d/src/loader.js");
  const { headHeightTarget } = await import("/src/heights.js");
  const { CHARACTER_KEYS } = await import("/src/characters.js");

  // The state a gun plays (specials.js slotAnim) and the beat the workbench
  // freezes a launch at (workbench/usage.js LAUNCH_TIME) — the release, not the
  // wind-up and not the recovery.
  const SHOOT_STATE = "specialNeutral";
  const LAUNCH_T = 0.34;
  const MUZZLES = ["muzzleR", "muzzleL"];

  const out = {};
  for (const charKey of CHARACTER_KEYS) {
    if (!loader.hasRig(charKey)) continue;
    const rig = loader.getRig(charKey);
    if (!rig || rig.isMannequin) continue;
    const m = loader.measureAnchors(charKey, MUZZLES, SHOOT_STATE, LAUNCH_T);
    if (!m) continue;
    const found = Object.entries(m.anchors);
    if (!found.length) { out[charKey] = { missing: true }; continue; }
    // The barrel that points at the enemy, whatever it is called.
    const [name, at] = found.sort((a, b) => b[1].f - a[1].f)[0];
    const pxPerM = (headHeightTarget(charKey) * (rig.renderScale ?? 1)) / rig.height;
    const x = Math.round(at.f * pxPerM);
    const y = -Math.round(at.u * pxPerM);
    // IS THIS A POINT A SHOT CAN LEAVE FROM, in a game seen from the side?
    //
    // The anchors are MM's, and MM is a 3D game where a machine can carry an
    // artillery piece that fires over its own shoulder. Colossus does exactly
    // that: at the release beat of his brace clip the tube's mouth is 40px
    // BEHIND his centre line, which is a true fact about the model and an
    // unusable spawn point here — combat.js sends the shell forward from where
    // it appears, so it would start inside him and fly out through his chest.
    // Nullbot's pair are parented to `hips` with no offset and land under the
    // floor, which is the exporter failing to find a weapon rather than a
    // decision anybody made.
    //
    // Neither is a number to quietly ship, and neither is a number to quietly
    // invent a replacement for. They are REJECTED with a reason, they keep
    // today's fallback, and they are named on stdout as wanting a human muzzle
    // in src/config_body_points.js — which is what that file is for.
    const reject = x <= 0 ? "behind the centre line"
      : y >= 0 ? "at or below the foot line" : null;
    out[charKey] = {
      reject,
      // The game's convention (src/body_points.js): x forward from the centre
      // line, y from the foot line with UP NEGATIVE, because canvas y grows
      // downward. The rig reports up as positive, hence the flip.
      x, y,
      anchor: name,
      // `resolveClip().source` — the loader's own string for which branch won
      // ("glb:brace"), not the AnimationClip object.
      clip: m.source,
      heightPx: Math.round(headHeightTarget(charKey)),
      alt: found.length > 1
        ? Object.fromEntries(found.map(([n, v]) =>
          [n, { x: Math.round(v.f * pxPerM), y: -Math.round(v.u * pxPerM) }]))
        : null,
    };
  }
  return out;
});

await browser.close();

const chars = Object.keys(measured).filter((k) => !measured[k].missing && !measured[k].reject).sort();
const missing = Object.keys(measured).filter((k) => measured[k].missing).sort();
const rejected = Object.keys(measured).filter((k) => measured[k].reject).sort();
if (!chars.length) {
  console.error("no muzzles measured — is the server running, and do the exports carry anchor_muzzle* nodes?");
  process.exit(1);
}

const inputs = currentInputs();
const body = chars.map((k) => {
  const v = measured[k];
  return `  ${JSON.stringify(k)}: ${JSON.stringify({ x: v.x, y: v.y, anchor: v.anchor, clip: v.clip })},`;
}).join("\n");

writeFileSync(OUT, `// GENERATED by tools/derive_muzzles.mjs — do not edit by hand.
//
// Where a shot leaves each mech, in game px: x forward from the centre line,
// y from the foot line with UP NEGATIVE (the convention src/body_points.js
// and combat.js use). Measured from the \`anchor_muzzle*\` empty nodes Mech
// Mayhem's exporter ships in every mechs/*.glb, posed in that mech's own shoot
// clip at the release beat, taking whichever muzzle points further forward —
// the rigs do not agree about which one is "R".
//
// Read by src/body_points.js BELOW a human decision in src/config_body_points.js
// and ABOVE the reference-body fallback: measurement beats the roster default,
// and somebody who has looked at the machine beats measurement.
//
// Regenerate whenever the models, the manifest or the pose stack change:
//     node server.mjs &
//     node tools/derive_muzzles.mjs
// \`--check\` fails while this file is stale.

export const MODEL_MUZZLES = {
${body}
};

export const MUZZLE_INPUTS = ${JSON.stringify(inputs, null, 2)};
`);

console.log(`measured ${chars.length} muzzle(s) -> src/config_model_muzzles.js`);
for (const k of chars) {
  const v = measured[k];
  const up = (-v.y / v.heightPx * 100).toFixed(0);
  const fwd = (v.x / v.heightPx * 100).toFixed(0);
  console.log(`  ${k.padEnd(10)} ${String(v.x).padStart(4)}, ${String(v.y).padStart(4)} px`
    + `   (${fwd}% forward, ${up}% up a ${v.heightPx}px body)`
    + `   ${v.anchor} · ${v.clip}`);
}
if (missing.length) console.log(`no anchor_muzzle* node: ${missing.join(", ")}`);
for (const k of rejected) {
  const v = measured[k];
  console.log(`  ${k.padEnd(10)} REJECTED — ${v.reject}`
    + ` (${v.anchor} measured at ${v.x}, ${v.y})`
    + `; keeps the reference fallback until a human pins one in src/config_body_points.js`);
}
