// Rewrite src/config_cards.js from a card-workbench export.
//
// The workbench (/workbench/?edit=cards) persists nothing — its export is the
// only record of a session — so this is the other half of that loop: hand it
// the JSON and CARD_FOCUS is rebuilt WHOLESALE from it, not patched. That is
// deliberate: the export carries every card, tuned or not, so a rebuild can
// drop an entry that was reset, which a merge could not.
//
// Dry runs by default and prints the table it would write, like the other
// intake tools. Add --apply to land it.
//
//   node tools/apply_card_focus.mjs ~/Downloads/mechbrawler-card-focus-2026-08-16.json
//   node tools/apply_card_focus.mjs <file> --apply

import { readFileSync, writeFileSync } from "node:fs";
import { CHARACTERS, CHARACTER_KEYS } from "../src/characters.js";
import { CARD_FOCUS } from "../src/config_cards.js";

const CONFIG = new URL("../src/config_cards.js", import.meta.url);
const SCHEMA = "mechbrawler.card-focus";
const MARK_OPEN = "export const CARD_FOCUS = {";
const MARK_CLOSE = "};";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const file = args.find((a) => !a.startsWith("--"));

if (!file) {
  console.error("usage: node tools/apply_card_focus.mjs <export.json> [--apply]");
  process.exit(2);
}

let snap;
try {
  snap = JSON.parse(readFileSync(file, "utf8"));
} catch (err) {
  console.error(`could not read ${file}: ${err.message}`);
  process.exit(1);
}

if (snap.schema !== SCHEMA) {
  console.error(`not a card-focus export (schema "${snap.schema}", wanted "${SCHEMA}")`);
  process.exit(1);
}

// A card the roster no longer has is a stale export, not a new character: say
// so and drop it rather than writing a key nothing will ever read.
const known = new Set(CHARACTER_KEYS);
const unknown = Object.keys(snap.cards || {}).filter((k) => !known.has(k));
const missing = CHARACTER_KEYS.filter((k) => !(k in (snap.cards || {})));

const rows = [];
for (const key of CHARACTER_KEYS) {
  const entry = snap.cards?.[key];
  if (!entry || !entry.set) continue;
  const focus = Number(entry.focus);
  if (!Number.isFinite(focus) || focus < 0 || focus > 100) {
    console.error(`${key}: focus ${entry.focus} is not a percentage — refusing to write`);
    process.exit(1);
  }
  rows.push({ key, focus: Math.round(focus * 10) / 10, name: CHARACTERS[key]?.name || key });
}

const width = Math.max(0, ...rows.map((r) => r.key.length));
const body = rows.length
  ? rows.map((r) => `  ${(r.key + ":").padEnd(width + 1)} ${r.focus},`.padEnd(width + 9)
      + ` // ${r.name}`).join("\n")
  : "  // titanus: 18,";

const source = readFileSync(CONFIG, "utf8");
const open = source.indexOf(MARK_OPEN);
const close = source.indexOf(`\n${MARK_CLOSE}`, open);
if (open < 0 || close < 0) {
  console.error("could not find the CARD_FOCUS block in src/config_cards.js");
  process.exit(1);
}
const next = `${source.slice(0, open + MARK_OPEN.length)}\n${body}\n${source.slice(close + 1)}`;

// What actually changes, per card, against what is committed today.
const changes = [];
for (const key of CHARACTER_KEYS) {
  const was = CARD_FOCUS[key];
  const now = rows.find((r) => r.key === key)?.focus;
  if (was === now) continue;
  changes.push(`  ${key.padEnd(width)}  ${was === undefined ? "—" : `${was}%`} -> ${now === undefined ? "— (dropped)" : `${now}%`}`);
}

console.log(`${file}`);
console.log(`  generated ${snap.generatedAt || "?"} · ${rows.length}/${CHARACTER_KEYS.length} cards tuned`);
if (unknown.length) console.log(`  ignored, not on the roster: ${unknown.join(", ")}`);
if (missing.length) console.log(`  absent from the export, left untuned: ${missing.join(", ")}`);
console.log(changes.length ? `\nchanges:\n${changes.join("\n")}` : "\nno changes — the config already says this");

if (!apply) {
  console.log("\ndry run — pass --apply to write src/config_cards.js");
  process.exit(0);
}
if (!changes.length) {
  console.log("\nnothing to write");
  process.exit(0);
}
writeFileSync(CONFIG, next);
console.log("\nwrote src/config_cards.js");
