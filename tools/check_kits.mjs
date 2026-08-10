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
const domainTypes = tableKeys(read("src/domains.js"), "const HANDLERS = {");

// A passive is not a table — it is a `passive.id === "…"` test wherever it acts.
// Any kit whose id appears nowhere is a passive that does nothing at all, which
// has happened and is invisible in play.
const passiveSources = ["src/combat.js", "src/fighter.js", "src/specials.js", "src/ultimates.js", "src/domains.js"]
  .map(read).join("\n");

// …except the passives that are implemented as DATA rather than as a branch:
// Momo's third jump is `airJumps: 2` on her stats, Nanami's 7:3 is the
// `critBand` on his light and heavy, and Mahito's soul marks are the `effect`
// his moves already carry. Their ids are correctly read by nothing, so they are
// named here rather than reported every run.
const DATA_PASSIVES = new Set(["broomFlight", "sevenThree", "soulShaper"]);

const { CHARACTERS, STAGED_CHARACTER_KEYS } = await import("../src/characters.js");

const problems = [];
for (const [key, char] of Object.entries(CHARACTERS)) {
  const where = STAGED_CHARACTER_KEYS.includes(key) ? `${key} (staged)` : key;
  for (const [slot, special] of Object.entries(char.specials || {})) {
    if (!specialTypes.has(special.type)) {
      problems.push(`${where}: ${slot} special type "${special.type}" has no handler in specials.js`);
    }
  }
  if (char.ultimate && !ultimateTypes.has(char.ultimate.type)) {
    problems.push(`${where}: ultimate type "${char.ultimate.type}" has no director in ultimates.js`);
  }
  for (const domain of char.domains || []) {
    if (!domainTypes.has(domain.type)) {
      problems.push(`${where}: domain type "${domain.type}" has no handler in domains.js`);
    }
  }
  const id = char.passive?.id;
  if (!id) problems.push(`${where}: no passive`);
  else if (!passiveSources.includes(`"${id}"`) && !DATA_PASSIVES.has(id)) {
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
  `${specialTypes.size} special types, ${ultimateTypes.size} ultimate types, ${domainTypes.size} domain types`);
