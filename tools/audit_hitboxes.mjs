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

console.log(`\nroster median art reach: ${n0(rosterReach())} px`
  + `   MELEE_GRACE.scale: ${MELEE_GRACE.scale}`);
console.log(errors ? `\n${errors} invariant(s) failed` : "\nall invariants hold");
process.exit(errors ? 1 : 0);
