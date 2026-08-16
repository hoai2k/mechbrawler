#!/usr/bin/env node
// Verify every kit in characters.js is one the engine can actually run.
//
// The companion to check_imports.mjs, and it exists for the same reason: there
// is no build step, so a kit that names a handler nobody wrote fails at the
// moment the move is pressed rather than at load. That is survivable for a
// fighter on the roster — somebody presses the button within a minute of
// playing them — and not survivable for a STAGED fighter, whose moves nothing
// exercises until the day their art lands and they are promoted.
//
// So: cross-check every `type` a kit names against the handler tables, and
// every `passive.id` against the code that reads it.
//
// Usage:  node tools/check_kits.mjs
// Exits non-zero on the first broken reference, so it can gate a commit.

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

/** Keys of a top-level object literal — `const HANDLERS = { name(f, p) {…} }`.
 *  Two-space indentation is the whole convention in src/, and these tables are
 *  always at module top level, so the indent is what scopes the match. */
function tableKeys(source, declaration) {
  const at = source.indexOf(declaration);
  if (at < 0) throw new Error(`no ${declaration} in the source`);
  const body = source.slice(at);
  const end = body.indexOf("\n};");
  return new Set(
    [...body.slice(0, end < 0 ? undefined : end).matchAll(/^ {2}([A-Za-z_$][\w$]*)\s*[:(]/gm)]
      .map((m) => m[1])
  );
}

const specialTypes = tableKeys(read("src/specials.js"), "const HANDLERS = {");
const ultimateTypes = tableKeys(read("src/ultimates.js"), "const DIRECTORS = {");

// A passive is not a table — it is a `passive.id === "…"` test wherever it acts.
// Any kit whose id appears nowhere is a passive that does nothing at all, which
// has happened and is invisible in play.
const passiveSources = ["src/combat.js", "src/fighter.js", "src/specials.js", "src/ultimates.js"]
  .map(read).join("\n");

// …except the passives that are implemented as DATA rather than as a branch
// (e.g. an extra `airJumps` on the stats, a `critBand` on a move). Their ids
// are correctly read by nothing, so they are named here rather than reported
// every run. None on the mech roster today.
const DATA_PASSIVES = new Set([]);

// …and the mech passives that are still owed to the engine. Each of these is a
// `// TODO(engine):` in characters.js (docs/mech-conversion-plan.md): the id is
// authored, the behaviour is not wired yet. Named here so the check stays a
// gate for ACCIDENTAL dead ids — remove an entry the day its passive lands.
const TODO_PASSIVES = new Set([
  // Frogger's Low Profile: "crouch transitions 30% faster" has nothing to be
  // faster THAN — the engine's crouch is instantaneous for everyone, so the
  // passive is owed a crouch-transition system before it can be owed a number.
  "lowProfile",
  // Konga's Long Arms + Climber: the reach half is real and already measured
  // (config_model_reach.js drives his hitboxes), but the CLIMBER half —
  // wall-cling and wall-jump, shared with Jerry — needs stage wall geometry
  // that does not exist yet.
  "longArms",
]);

const { CHARACTERS, STAGED_CHARACTER_KEYS } = await import("../src/characters.js");

const problems = [];
for (const [key, char] of Object.entries(CHARACTERS)) {
  const where = STAGED_CHARACTER_KEYS.includes(key) ? `${key} (staged)` : key;
  for (const [slot, special] of Object.entries(char.specials || {})) {
    if (!specialTypes.has(special.type)) {
      problems.push(`${where}: ${slot} special type "${special.type}" has no handler in specials.js`);
    }
  }
  // The ranged slot (RB) runs down the same execution path as a special, so
  // its type resolves against the same handler table.
  if (!char.ranged) problems.push(`${where}: no ranged weapon`);
  else if (!specialTypes.has(char.ranged.type)) {
    problems.push(`${where}: ranged type "${char.ranged.type}" has no handler in specials.js`);
  }
  if (char.ultimate && !ultimateTypes.has(char.ultimate.type)) {
    problems.push(`${where}: ultimate type "${char.ultimate.type}" has no director in ultimates.js`);
  }
  const id = char.passive?.id;
  if (!id) problems.push(`${where}: no passive`);
  else if (!passiveSources.includes(`"${id}"`) && !DATA_PASSIVES.has(id) && !TODO_PASSIVES.has(id)) {
    problems.push(`${where}: passive "${id}" is read by nothing and is not listed in DATA_PASSIVES`);
  }
}

if (problems.length) {
  for (const p of problems) console.error(p);
  console.error(`\n${problems.length} broken kit reference(s)`);
  process.exit(1);
}

const total = Object.keys(CHARACTERS).length;
console.log(`all kits resolve: ${total} fighters (${STAGED_CHARACTER_KEYS.length} staged), ` +
  `${specialTypes.size} special types, ${ultimateTypes.size} ultimate types`);
