// Does every action draw the art that exists for it?
//
// A delivery of semantic poses does NOT reach the screen on its own. The art
// lands in `assets/sprites/<char>/<pose>.png` and gets registered, but which
// sprite an action plays is decided by the anim table in `src/characters.js` —
// and a sheet-era fighter's table names grid cells. Import fifteen new poses for
// Geto and the game keeps drawing the sprint cell for his jab until someone
// edits that table.
//
// Nothing failed when that happened. No error, no missing file, no visible
// break: the round simply had no effect, and the only way to notice was to open
// the fighter and look. That is the gap this closes. It asks the game's own
// modules — not a regex over the source — three questions per character:
//
//   1. Is a state drawing a grid cell while the semantic art it is named for
//      already exists on disk? That character is waiting to be re-pointed.
//   2. Is a state resolving to nothing at all? That is a hole on screen.
//   3. Is a pose flagged `needsReplacement` when the art that replaces it has
//      already landed? That is a stale request that would be re-issued.
//
// Run directly, or from intake_import.py, which calls it after every import so
// a delivery reports its own unfinished business.
//
//   node tools/check_pointing.mjs            # whole roster
//   node tools/check_pointing.mjs geto hakari
//
// Exit code is 0 when there is nothing to say and 1 when there is, so it can
// gate a check suite as well as inform a human.

import { readFile } from "fs/promises";

// The game reads its manifest over the network. `resolvedAnim` answers against
// the art that EXISTS, and it asks assets.js — so without this the module holds
// a null manifest, every lookup misses, and a state's `fallback` never resolves:
// the check would report seventeen fighters drawing nothing when they are all
// drawing their single delivered `attack_air` perfectly well.
const ROOT = new URL("../", import.meta.url);
globalThis.fetch = async (url) => {
  const body = await readFile(new URL(String(url).replace(/^\.?\//, ""), ROOT), "utf8");
  return { ok: true, json: async () => JSON.parse(body), text: async () => body };
};

const { CHARACTER_KEYS, SPRITE_ACTORS, SEMANTIC_ANIMS } = await import("../src/characters.js");
const { resolvedAnim, animsOf, replacementKind } = await import("../src/sprites.js");
const { loadCoreAssets } = await import("../src/assets.js");
await loadCoreAssets();

const man = JSON.parse(await readFile(new URL("assets/sprites/manifest.json", ROOT), "utf8"));
const isCell = (k) => /^r\d+c\d+$/.test(k);
// States the RUNTIME already redirects, so what the table says is not what
// plays. `dodge` is the pre-round-6 shared dodge frame; fighter.js picks
// `dodge_roll` / `dodge_air` whenever that art exists and only falls back to
// `dodge` when it does not (dodgeAnim), so every fighter who has the newer art
// draws it no matter what this entry names. Reporting it would put eleven
// permanent false positives in front of the real ones.
const REDIRECTED = new Set(["dodge"]);
const has = (char, key) => !!man.characters?.[char]?.[key];

const only = process.argv.slice(2);
const keys = [...CHARACTER_KEYS, ...Object.keys(SPRITE_ACTORS)]
  .filter((k) => !only.length || only.includes(k));

const findings = [];

for (const char of keys) {
  const anims = animsOf(char);

  // 1. An action still on a grid cell whose semantic art has arrived.
  const waiting = [];
  for (const [state, anim] of Object.entries(anims)) {
    if (REDIRECTED.has(state)) continue;
    const drawn = resolvedAnim(char, state).frames;
    if (!drawn.some(isCell)) continue;
    // What the shared semantic table would draw for this action, if it exists.
    const wants = (SEMANTIC_ANIMS[state]?.frames || []).filter((k) => has(char, k));
    if (wants.length) waiting.push(`${state}: draws ${drawn.join("+")} — ${wants.join("+")} is on disk`);
  }
  if (waiting.length) findings.push({ char, kind: "re-point", lines: waiting });

  // 2. An action resolving to nothing. Rare and serious: the fighter plays a
  //    blank where the move should be.
  const holes = Object.keys(anims).filter((s) => !resolvedAnim(char, s).frames.some((k) => has(char, k)));
  if (holes.length) findings.push({ char, kind: "no art", lines: holes });

  // 3. A replacement request left on art whose successor has landed. Not
  //    hypothetical: an intake clears the flag on the pose it overwrites, but a
  //    grid cell is replaced by a DIFFERENT pose key, so its flag survives the
  //    delivery that answered it and would go back out with the next request.
  const stale = [];
  for (const [key, meta] of Object.entries(man.characters?.[char] || {})) {
    if (!replacementKind(meta)) continue;
    const drawnBy = Object.keys(anims).filter((s) => resolvedAnim(char, s).frames.includes(key));
    if (!drawnBy.length) stale.push(`${key}: flagged '${replacementKind(meta)}', drawn by nothing`);
  }
  if (stale.length) findings.push({ char, kind: "stale flag", lines: stale });
}

if (!findings.length) {
  console.log(`every action draws its own art across ${keys.length} character(s)`);
  process.exit(0);
}

const HEAD = {
  "re-point": "STILL ON GRID CELLS — the art exists; src/characters.js has to name it",
  "no art": "NOTHING TO DRAW — these states resolve to no file",
  "stale flag": "STALE REQUESTS — flagged art that nothing draws any more",
};
for (const kind of ["no art", "re-point", "stale flag"]) {
  const group = findings.filter((f) => f.kind === kind);
  if (!group.length) continue;
  console.log(`\n${HEAD[kind]}`);
  for (const { char, lines } of group) {
    console.log(`  ${char}`);
    for (const line of lines) console.log(`    ${line}`);
  }
}
process.exit(1);
