#!/usr/bin/env node
// MODEL-DERIVED ATTACK REACH — measured from the rigs, regenerated on demand.
//
//     node server.mjs &
//     node tools/derive_attack_envelopes.mjs           # measure, write config
//     node tools/derive_attack_envelopes.mjs --check   # stale? exit 1 (no browser)
//
// WHY. Melee range is measured from the art (src/silhouette.js), and the art
// used to mean sprites — whose swing frames can carry energy clouds, painted
// smears and weapons drawn past their cell, all of which read as "reach" to a
// silhouette scan. A rigged model is a cleaner witness: bones and prop shafts
// are exactly the things that can hit, and nothing else. Where a character
// has a delivered rig, their committed reach is measured from it (posed at
// each attack's contact beat, body + weapon, loader.measureAttackReach);
// characters without one keep the sprite measurement, outlier-dropping and
// all. The result feeds bodyMetrics through src/config_model_reach.js, so
// tips, grace, pricing, sweetspots, the AI's spacing and the debug overlay
// all follow it with no further wiring.
//
// THE MODELS ARE IN FLUX, so this is a PIPELINE, not a one-off: the generated
// config records a fingerprint of everything the measurement depends on — the
// .glb files themselves, both manifests (dials and head-heights), and the
// pose libraries that build the clips. `--check` recomputes the fingerprint
// without a browser and exits 1 when anything moved; tools/audit_hitboxes.mjs
// runs that check, so a stale config fails the audit loudly instead of
// quietly shipping ranges measured from bodies that no longer exist.

import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src", "config_model_reach.js");
const BASE = process.env.BASE || "http://127.0.0.1:5174";
const CHECK = process.argv.includes("--check");

// Everything the measurement is a function of. A change to any of these can
// move a measured reach, so any of them changing marks the config stale.
const POSE_SOURCES = [
  // The JJK pose-library files that used to sit here were deleted in K7 —
  // every pose comes from the mech exports (hashed as `models` below) and
  // the solver/correction layers listed here.
  "render3d/src/states.js", "render3d/src/pose.js",
  "render3d/src/rig_fixes.js", "render3d/src/props.js",
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
    sprites: fileSha("sprites/assets/manifest.json"),
    poses: sha(POSE_SOURCES.map(fileSha).join("|")),
    models,
  };
}

function loadStored() {
  if (!existsSync(OUT)) return null;
  const text = readFileSync(OUT, "utf8");
  const m = /export const ENVELOPE_INPUTS = (\{[\s\S]*?\n\});/.exec(text);
  try { return m ? JSON.parse(m[1]) : null; } catch { return null; }
}

if (CHECK) {
  const stored = loadStored();
  if (!stored) {
    console.error("config_model_reach.js missing or unreadable — run: node tools/derive_attack_envelopes.mjs");
    process.exit(1);
  }
  const now = currentInputs();
  const diffs = [];
  if (stored.manifest !== now.manifest) diffs.push("render3d manifest");
  if (stored.sprites !== now.sprites) diffs.push("sprite manifest (head heights)");
  if (stored.poses !== now.poses) diffs.push("pose libraries");
  for (const k of new Set([...Object.keys(stored.models || {}), ...Object.keys(now.models)])) {
    if ((stored.models || {})[k] !== now.models[k]) diffs.push(`model: ${k}`);
  }
  if (diffs.length) {
    console.error(`model reach config is STALE (${diffs.join(", ")}) — `
      + "run: node server.mjs & node tools/derive_attack_envelopes.mjs");
    process.exit(1);
  }
  console.log("model reach config is current");
  process.exit(0);
}

// ------------------------------------------------------------- measurement

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--no-proxy-server", "--enable-unsafe-swiftshader"],
}).catch(async () => chromium.launch({ args: ["--no-proxy-server", "--enable-unsafe-swiftshader"] }));
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("PAGEERROR", String(e).slice(0, 200)));

// `rigs=eager` is load-bearing, not a nicety. Rigs load LAZILY by default —
// a mech GLB is 8-46 MB and a match needs at most four of them, so
// render3d/src/backend.js warms them on demand and `hasRig` is false for
// everyone at page load. This tool measures the WHOLE roster in one pass off
// `hasRig`, so under the default it found nothing and said "no rigs measured —
// is the server running with rigs approved?", which sounds like a rig problem
// and is not one. Nothing was wrong except that nobody had asked for them.
await page.goto(`${BASE}/index.html?render=3d&camera=flat&rigs=eager`, { waitUntil: "load" });
// Eager means init awaits every rig in the roster before it reports ready, so
// this wait is minutes rather than seconds on a cold cache.
await page.waitForFunction(() => window.__render3d?.ready === true, { timeout: 600000 });

const measured = await page.evaluate(async () => {
  const loader = await import("/render3d/src/loader.js");
  const { STATES, clipNameFor, aimSolve, aimable } = await import("/render3d/src/states.js");
  const { headHeightTarget } = await import("/src/heights.js");
  const { artReach } = await import("/src/silhouette.js");
  const { COM_BODY_FRAC } = await import("/src/config_tuning.js");
  const { CHARACTER_KEYS } = await import("/src/characters.js");
  const ATTACKS = ["light", "sideHeavy", "upHeavy", "downHeavy", "crouchAttack", "airLight"];
  const beats = {};
  for (const s of ATTACKS) beats[s] = STATES[clipNameFor(s)]?.beat ?? 0.1;
  const out = {};
  for (const charKey of CHARACTER_KEYS) {
    if (!loader.hasRig(charKey)) continue;
    const rig = loader.getRig(charKey);
    if (!rig || rig.isMannequin) continue;
    // The layers an UNAIMED strike carries in game (backend.js liveLayers with
    // no aim point): the state's own allowed elevation, solved onto this
    // fighter's own reach. Measuring without them reads the library pose's
    // hand rather than the limb a player sees.
    const targetPx = headHeightTarget(charKey);
    const layersFor = {};
    for (const s of ATTACKS) {
      const solved = aimSolve(0, 0, -targetPx * COM_BODY_FRAC, null, 1, s, artReach(charKey));
      if (!solved) continue;
      layersFor[s] = {
        aimRad: aimable(s) ? solved.pitch : 0,
        reach: { dx: solved.dx, dy: solved.dy, targetPx },
      };
    }
    const m = loader.measureAttackReach(charKey, ATTACKS, beats, layersFor);
    if (!m) continue;
    const pxPerM = (headHeightTarget(charKey) * (rig.renderScale ?? 1)) / rig.height;
    const states = {};
    let reach = 0;
    for (const [state, v] of Object.entries(m)) {
      const fwd = Math.round(v.fwd * pxPerM);
      states[state] = { fwd, top: Math.round(v.top * pxPerM) };
      // The strike point, in the game's own convention: x forward along the
      // facing from the centre line, y UP from the foot line (canvas y grows
      // downward, so consumers negate — see src/strike_points.js).
      if (v.strike) {
        states[state].sx = Math.round(v.strike.f * pxPerM);
        states[state].sy = Math.round(v.strike.u * pxPerM);
        states[state].via = v.via;
      }
      reach = Math.max(reach, fwd);
    }
    out[charKey] = { reach, states };
  }
  return out;
});

await browser.close();

const chars = Object.keys(measured).sort();
if (!chars.length) {
  console.error("no rigs measured — is the server running with rigs approved?");
  process.exit(1);
}

const inputs = currentInputs();
const body = chars.map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(measured[k])},`).join("\n");
writeFileSync(OUT, `// GENERATED by tools/derive_attack_envelopes.mjs — do not edit by hand.
//
// Committed attack reach per character, in game px from the centre line,
// measured from their DELIVERED RIG posed at each attack's contact beat
// (body + weapon props; loader.measureAttackReach). Consumed by
// src/silhouette.js ahead of the sprite measurement: bones and prop shafts
// are exactly what can hit, where a sprite scan also reads energy clouds and
// painted smears as reach. Characters absent here (no rig, or held out of
// game) keep the sprite-derived measurement.
//
// Regenerate whenever models, manifests or pose libraries change:
//     node server.mjs &
//     node tools/derive_attack_envelopes.mjs
// tools/audit_hitboxes.mjs fails while this file is stale (--check).

export const MODEL_REACH = {
${body}
};

export const ENVELOPE_INPUTS = ${JSON.stringify(inputs, null, 2)};
`);

console.log(`measured ${chars.length} rig(s) -> src/config_model_reach.js`);
for (const k of chars) {
  const s = measured[k].states.light || {};
  const via = s.via === "prop" ? " (weapon)" : "";
  console.log(`  ${k.padEnd(12)} reach ${String(measured[k].reach).padStart(4)} px`
    + `   jab strike ${String(s.sx ?? "-").padStart(4)},${String(s.sy ?? "-").padStart(4)}${via}`);
}
