// Static audit of what the roster's attacks actually reach, and what the
// roster is actually shaped like — the measurements docs/hitbox-audit.md was
// written from, run against the live code so they cannot go stale.
//
// It answers the three questions the audit asked:
//
//   1. do hitboxes match the sprites?    the grace margin between the art's
//                                        painted reach and the hitbox's far
//                                        edge should be the SAME on everyone
//   2. is range variance meaningful?     spread across the roster, and whether
//                                        reach is priced in startup
//   3. does vertical work?               hurtbox coverage against drawn height,
//                                        and which platform gaps an up smash
//                                        can actually threaten
//
// Run: node tools/audit_hitboxes.mjs        (exit 1 on any invariant failure)

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

// src/assets.js loads the manifest over fetch, which does not do file URLs.
// Serve it off disk instead — this is the only thing standing between the game
// modules and running headless.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const href = typeof url === "string" ? url : url.href;
  if (!href.startsWith("file:")) return realFetch(url);
  const text = await readFile(fileURLToPath(href), "utf8");
  return { ok: true, json: async () => JSON.parse(text), text: async () => text };
};

const { loadCoreAssets } = await import("../src/assets.js");
await loadCoreAssets();

const { CHARACTERS, CHARACTER_KEYS } = await import("../src/characters.js");
const { spriteManifest } = await import("../src/assets.js");
const { lightMove, heavyMove } = await import("../src/moves.js");
const { bodyMetrics, rosterReach } = await import("../src/silhouette.js");
const { HURTBOX } = await import("../src/constants.js");
const { MELEE_GRACE } = await import("../src/config_tuning.js");
const { STAGES } = await import("../src/stages.js");

const n0 = (v) => Math.round(v).toString();
const n2 = (v) => v.toFixed(2);
const pad = (s, w) => String(s).padStart(w);

let errors = 0;
const fail = (msg) => { console.log("  FAIL " + msg); errors += 1; };

// ------------------------------------------------------------------- 1 & 2

const rows = CHARACTER_KEYS.map((key) => {
  const char = CHARACTERS[key];
  const b = bodyMetrics(key);
  const light = lightMove(char, "side");
  const heavy = heavyMove(char, "side");
  const up = heavyMove(char, "up");
  return {
    key, b,
    art: b.reach,
    lightTip: light.ox + light.w,
    heavyTip: heavy.ox + heavy.w,
    startup: heavy.delay * 1000,
    upTop: -up.oy,                       // how far above the feet it reaches
    sweet: heavy.critBand ? heavy.critBand.center : 0,
    measured: b.measured,
  };
});

console.log("\n=== reach, against the art it is drawn from ===");
console.log("char         drawnH  artReach  lightTip  heavyTip   grace  startup  upSmashTop  sweet");
for (const r of [...rows].sort((a, b) => b.heavyTip - a.heavyTip)) {
  console.log(
    r.key.padEnd(12), pad(n0(r.b.height), 6), pad(n0(r.art), 9), pad(n0(r.lightTip), 9),
    pad(n0(r.heavyTip), 9), pad(n0(r.heavyTip - r.art), 7), pad(n0(r.startup) + "ms", 8),
    pad(n0(r.upTop), 11), pad(r.sweet ? n0(r.sweet) : "-", 6),
    r.measured ? "" : "  (unmeasured art)");
}

// The whole point of deriving reach from the art: the invisible part of a swing
// is a fixed margin, so it is the same for everybody. It used to run 62-113 px
// depending on the character.
const graces = rows.map((r) => r.heavyTip - r.art);
const graceSpread = Math.max(...graces) - Math.min(...graces);
console.log(`\ngrace margin: ${n0(Math.min(...graces))}-${n0(Math.max(...graces))} px `
  + `(spread ${n0(graceSpread)}, was 62-113 before hitboxes came off the art)`);
if (graceSpread > 2) {
  fail(`grace margin varies by ${n0(graceSpread)} px across the roster — it should be `
    + `identical, since MELEE_GRACE.sideHeavy is a constant`);
}

// Which characters are being measured off art nobody has sized yet, and which
// have swing frames still waiting for the placement pass. An unplaced frame is
// skipped (src/silhouette.js), because a freshly delivered sprite sits at the
// intake pipeline's guess at its scale rather than a decision — so a character
// with unplaced swing art has a range that will move once somebody opens the
// workbench, and is worth knowing about before anyone tunes around it.
const pending = [];
for (const key of CHARACTER_KEYS) {
  const frames = spriteManifest.characters[key] || {};
  const swing = ["attack_light_a", "attack_light_b", "attack_heavy_a", "attack_heavy_b"]
    .filter((k) => frames[k]);
  const unplaced = swing.filter((k) => {
    const e = frames[k].edited;
    return !e || !["renderScale", "ox", "bodyBottom"].some((f) => f in e);
  });
  if (unplaced.length) pending.push(`${key} (${unplaced.join(", ")})`);
}
if (pending.length) {
  console.log(`\nswing frames still awaiting the placement pass — range is provisional for `
    + `${pending.length} fighter(s):`);
  for (const p of pending) console.log("  " + p);
}
const unmeasured = rows.filter((r) => !r.b.placed).map((r) => r.key);
if (unmeasured.length) {
  console.log(`\nno placed swing art at all (measured off raw delivery): ${unmeasured.join(", ")}`);
}

const tips = rows.map((r) => r.heavyTip);
const spread = Math.max(...tips) / Math.min(...tips);
console.log(`heavy tip: ${n0(Math.min(...tips))}-${n0(Math.max(...tips))} px, `
  + `spread ${n2(spread)}x (was 1.13x)`);
if (spread < 1.25) {
  fail(`range spread is only ${n2(spread)}x — the roster's art spans far more than that, `
    + `so something is flattening it`);
}

console.log(`\ncorrelations (n=${rows.length}):`);
const corr = (a, b) => {
  const ma = a.reduce((x, y) => x + y, 0) / a.length;
  const mb = b.reduce((x, y) => x + y, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
};
const rStart = corr(tips, rows.map((r) => r.startup));
console.log(`  reach <-> startup   ${n2(rStart)}   (was -0.08; range has to cost something)`);
if (rStart < 0.3) {
  fail(`reach and startup correlate at ${n2(rStart)} — REACH_PRICE is not biting, so long `
    + `arms are free`);
}

// ------------------------------------------------------- 2b: dash attacks

// The two attacks a run has (moves.js, variant "dash"). They are the same
// forward geometry as the standing pair, so they inherit the grace margin
// checked above — what needs watching is the TRADE, since a dash attack that
// reached further AND recovered faster than the tilt it replaces would simply
// retire the standing game.
console.log("\n=== dash attacks vs the standing move they replace ===");
console.log("char         lightTip  dashTip   lightEnd  dashEnd   heavyTip  dashHvyTip");
for (const key of CHARACTER_KEYS) {
  const char = CHARACTERS[key];
  const side = lightMove(char, "side");
  const dash = lightMove(char, "dash");
  const heavy = heavyMove(char, "side");
  const dashHeavy = heavyMove(char, "dash");
  const tip = (m) => m.ox + m.w;
  if (dash.recover <= side.recover) {
    fail(`${key}: the dash attack recovers in ${n0(dash.recover * 1000)}ms against the side `
      + `tilt's ${n0(side.recover * 1000)}ms — a run has to cost something`);
  }
  if (dashHeavy.recover <= heavy.recover) {
    fail(`${key}: the heavy dash attack recovers faster than the side smash it skips the `
      + `charge for`);
  }
  if (dash.dmg <= side.dmg) {
    fail(`${key}: the dash attack hits for ${dash.dmg} against the side tilt's ${side.dmg} — `
      + `it commits harder, so it has to pay better`);
  }
  console.log(key.padEnd(12), pad(n0(tip(side)), 9), pad(n0(tip(dash)), 8),
    pad(n0(side.recover * 1000) + "ms", 9), pad(n0(dash.recover * 1000) + "ms", 8),
    pad(n0(tip(heavy)), 9), pad(n0(tip(dashHeavy)), 11));
}

// ----------------------------------------------------------------------- 3

console.log("\n=== bodies ===");
console.log("char         drawnH  hurtW  hurtH  coverage");
for (const r of [...rows].sort((a, b) => b.b.height - a.b.height)) {
  const h = r.b.height * HURTBOX.standH;
  console.log(r.key.padEnd(12), pad(n0(r.b.height), 6), pad(n0(r.b.width), 6),
    pad(n0(h), 6), pad(n2(h / r.b.height) + "x", 9));
}
const heights = rows.map((r) => r.b.height);
const widths = rows.map((r) => r.b.width);
console.log(`\nheight ${n0(Math.min(...heights))}-${n0(Math.max(...heights))} `
  + `(spread ${n2(Math.max(...heights) / Math.min(...heights))}x), `
  + `width ${n0(Math.min(...widths))}-${n0(Math.max(...widths))} `
  + `(spread ${n2(Math.max(...widths) / Math.min(...widths))}x, was 1.00x — one box for everyone)`);
if (Math.max(...widths) === Math.min(...widths)) {
  fail("every fighter is the same width — hurtboxes are not coming off the art");
}

// Platform pressure. An opponent standing `gap` px above has a hurtbox whose
// bottom edge is at -gap; an up smash reaching `upTop` above the feet threatens
// them when it clears that. Whether a given platform is contestable is a real
// design decision — this reports which way each one currently falls, so it is
// a decision rather than an accident.
console.log("\n=== platform gaps vs up smash ===");
const upTops = rows.map((r) => r.upTop);
const [loUp, hiUp] = [Math.min(...upTops), Math.max(...upTops)];
console.log(`up smash reaches ${n0(loUp)}-${n0(hiUp)} px above the feet across the roster\n`);
const buckets = { none: [], some: [], all: [] };
for (const stage of STAGES) {
  const main = stage.platforms.find((p) => p.kind === "main");
  for (const p of stage.platforms) {
    if (p === main) continue;
    const gap = main.y - p.y;
    const who = upTops.filter((t) => t >= gap).length;
    const kind = who === 0 ? "none" : who === upTops.length ? "all" : "some";
    buckets[kind].push(`${stage.key}+${n0(gap)}`);
  }
}
console.log(`  every fighter can contest : ${buckets.all.length} platforms`);
console.log(`  only the tall ones can    : ${buckets.some.length} platforms  `
  + (buckets.some.slice(0, 6).join(", ") || ""));
console.log(`  nobody can                : ${buckets.none.length} platforms  `
  + (buckets.none.slice(0, 6).join(", ") || ""));
console.log("\n  (a mix is fine and wanted — this is here so the mix stays a decision.\n"
  + "   'only the tall ones' is the interesting bucket: those gaps are where being\n"
  + "   drawn tall buys real stage control.)");

// Hand-authored kit hitboxes. Special/ultimate `p` blocks write oy/w/h as
// literals for the reference body and are height-scaled at spawn
// (combat.js spawnMeleeScaled) — so the literals themselves must stay inside
// a reference-body sanity band, or a typo'd offset floats a hit above every
// head on the roster and nothing else would ever say so.
console.log("\n=== hand-authored special hitboxes (reference-body literals) ===");
let specialsChecked = 0;
const checkBlock = (key, name, p) => {
  if (!p || typeof p !== "object") return;
  if (p.w == null && p.h == null) return; // not a melee rect block
  specialsChecked++;
  if (p.oy != null && (p.oy < -300 || p.oy > 60)) {
    fail(`${key}.${name}: oy ${p.oy} is outside the reference band (-300..60) — `
      + `authored offsets are per reference body and scale at spawn`);
  }
  if (p.h != null && (p.h <= 0 || p.h > 360)) {
    fail(`${key}.${name}: h ${p.h} is outside the reference band (0..360)`);
  }
};
for (const key of CHARACTER_KEYS) {
  const char = CHARACTERS[key];
  for (const [slot, cfg] of Object.entries(char.specials || {})) {
    checkBlock(key, `specials.${slot}`, cfg?.p);
  }
  checkBlock(key, "ultimate", char.ultimate?.p);
}
console.log(`  ${specialsChecked} authored blocks checked against the reference band`);

// Model-derived reach must not go stale: the rigs and pose libraries are in
// flux, and a reach measured from a body that no longer exists is exactly the
// hand-typed-number problem this audit was written to end. The derive tool's
// --check recomputes the input fingerprint without a browser.
console.log("\n=== model reach envelopes ===");
try {
  const toolPath = fileURLToPath(new URL("./derive_attack_envelopes.mjs", import.meta.url));
  execFileSync(process.execPath, [toolPath, "--check"], { stdio: "pipe" });
  console.log("  config_model_reach.js is current with the rigs and pose libraries");
} catch (err) {
  fail(`model reach config is stale or missing — `
    + `${(err.stderr || err.stdout || "").toString().trim() || err.message}`);
}

console.log(`\nroster median art reach: ${n0(rosterReach())} px`
  + `   MELEE_GRACE.scale: ${MELEE_GRACE.scale}`);
console.log(errors ? `\n${errors} invariant(s) failed` : "\nall invariants hold");
process.exit(errors ? 1 : 0);
