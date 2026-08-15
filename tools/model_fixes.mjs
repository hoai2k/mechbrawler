// THE BAKE LIST — what the engine is still correcting on top of the delivered
// .glb files, per fighter, and what baking each correction would actually be.
//
// This exists because the corrections are invisible by design: a fighter whose
// head was modelled looking down looks RIGHT in the game, because pose.js
// tilts it back on every frame. The only way to know that the .glb is still
// wrong — and therefore still on somebody's list — is to read the numbers off
// the manifest, which is what this does.
//
// The workflow it serves: bake one fighter's corrections into their model,
// zero their numbers in the manifest, and they drop off this report. When the
// report is empty, `setModelFixesEnabled(false)` (rig_fixes.js) is a no-op and
// the whole layer can be deleted.
//
//   node tools/model_fixes.mjs            # fighters with pending corrections
//   node tools/model_fixes.mjs --all      # every fighter, clean ones included
//   node tools/model_fixes.mjs --json     # the same thing, machine-readable
//   node tools/model_fixes.mjs uro maki   # just these
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = JSON.parse(
  readFileSync(join(ROOT, "render3d/assets/manifest.json"), "utf8"));

// The engine's own bake list, imported rather than restated — a report that
// keeps its own copy of the key list goes stale the first time somebody adds
// a correction, and goes stale silently, which is the worst way for a "what
// is left to do" tool to fail.
const { MODEL_FIXES, MODEL_FIX_KEYS, RIG_FIXES, pendingFixes } =
  await import(join(ROOT, "render3d/src/rig_fixes.js"));

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const showAll = args.includes("--all");
const only = new Set(args.filter((a) => !a.startsWith("--")));

const rows = [];
for (const [key, entry] of Object.entries(MANIFEST.characters || {})) {
  if (only.size && !only.has(key)) continue;
  // The stand-in mannequin takes none of these, and neither does a model
  // nobody has approved — reporting an unapproved fighter's numbers as "to
  // bake" would put work on the list for a file that is going to be replaced.
  if (!entry?.model) continue;
  const fixes = pendingFixes(key, entry);
  // The alternate .glb carries its OWN corrections (they are facts about that
  // file, not about the character), so it is a separate line on the list.
  const alt = entry.alt ? pendingFixes(key, entry.alt) : {};
  const n = Object.keys(fixes).length + Object.keys(alt).length;
  if (!n && !showAll) continue;
  rows.push({ key, approved: entry.approved === true, fixes,
              alt: Object.keys(alt).length ? alt : null, count: n });
}
rows.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

if (asJson) {
  console.log(JSON.stringify({ fixes: MODEL_FIXES, characters: rows }, null, 2));
  process.exit(0);
}

const fmt = (k, v) => {
  if (k === "bones") {
    return Object.entries(v)
      .map(([bone, r]) => `${bone} [${r.join(", ")}]`).join("; ");
  }
  if (k === "symmetry") return String(v);
  if (k === "shoulderOutCm") return `${v}cm out`;
  if (k === "renderScale") return `×${v}`;
  return `${v}°`;
};

console.log("PENDING GLB CORRECTIONS");
console.log("Numbers the engine applies on every frame because the model does");
console.log("not. Each one is a modelling job; baking it and zeroing the");
console.log("manifest key must leave the fighter looking identical.\n");

let total = 0;
for (const row of rows) {
  const mark = row.approved ? " " : "?";
  const parts = Object.entries(row.fixes).map(([k, v]) => `${k} ${fmt(k, v)}`);
  console.log(`${mark} ${row.key.padEnd(12)} ${parts.join("  ") || "clean"}`);
  if (row.alt) {
    const ap = Object.entries(row.alt).map(([k, v]) => `${k} ${fmt(k, v)}`);
    console.log(`  ${"".padEnd(12)} alt: ${ap.join("  ")}`);
  }
  total += row.count;
}

console.log(`\n${rows.length} fighter(s), ${total} correction(s) outstanding.`);
console.log("? = model not approved yet; its numbers may still move.\n");
console.log("WHAT EACH ONE MEANS:");
for (const key of [...MODEL_FIX_KEYS, "bones"]) {
  const f = MODEL_FIXES[key];
  if (!f) continue;
  console.log(`  ${key} (${f.where})`);
  console.log(`    is:   ${f.means}`);
  console.log(`    bake: ${f.bake}`);
}
if (!Object.keys(RIG_FIXES).length) {
  console.log("\n  (RIG_FIXES is empty — no per-bone bind corrections yet.)");
}
