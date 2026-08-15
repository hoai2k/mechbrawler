// Check the spoken lines: that every one is registered, delivered, reachable
// from a move, and — the reason this file exists — that the LENGTH written in
// config_audio.js still matches the mp3 on disk.
//
// That last one is the whole point. A spoken line is a wind-up: the game holds
// the fighter's pose and lands the move a fraction of the way through it, and
// that fraction is computed from SPOKEN_LINES, never measured from the audio
// (gameplay must not depend on whether a file finished downloading). So the
// number in the config IS the frame data. Re-roll a line, get a shorter take,
// and the move now fires after the voice has stopped — with nothing in the game
// to say so. This says so.
//
//   node tools/check_voice.mjs
//
// Since the Mech Mayhem bank replaced the JJK one (tools/sfx_intake.mjs) the
// spoken-line tables are empty and the live risk moved: the game's call sites
// still use their JJK-era names and reach the new bank only through
// SFX_ALIASES. So this now also audits every literal `playSfx("…")` and
// `sfx: "…"` across src/ and fails on any name that resolves to nothing —
// silence a player cannot debug — plus the grunt/KO tables in audio.js.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SFX, SFX_ALIASES, MOVE_CALL, DOMAIN_CALL, ELEMENT_HIT_SFX, SPOKEN_LINES, SPOKEN_TIMING, SFX_ALTERNATES, SIGNATURE_SFX } from "../src/config_audio.js";
import { CHARACTERS } from "../src/characters.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SFX_DIR = path.join(ROOT, "assets", "sfx");

// Every file here is CBR 128 kbps out of tools/generate_voice.py, so bytes and
// bitrate give the duration directly. An ID3/Xing header is a frame or two of
// slop, well inside the tolerance below.
const BITRATE = 128000;
const TOLERANCE = 0.15; // seconds

function mp3Seconds(file) {
  const buf = fs.readFileSync(file);
  let start = 0;
  if (buf.slice(0, 3).toString("latin1") === "ID3") {
    // Syncsafe integer: 7 bits per byte.
    start = 10 + ((buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]);
  }
  return ((buf.length - start) * 8) / BITRATE;
}

const problems = [];
const rows = [];

// Which move, if any, reaches each line. A recorded, registered line that no
// move names is a line nobody will ever hear.
const reachable = new Map();
for (const [charKey, moves] of Object.entries(MOVE_CALL)) {
  for (const [moveName, key] of Object.entries(moves)) reachable.set(key, `${charKey} — ${moveName}`);
}
for (const [charKey, key] of Object.entries(DOMAIN_CALL)) {
  reachable.set(key, `${charKey} — Domain Expansion`);
}

for (const [key, declared] of Object.entries(SPOKEN_LINES)) {
  const entry = SFX[key];
  if (!entry) {
    problems.push(`${key}: in SPOKEN_LINES but not registered in SFX`);
    continue;
  }
  const file = path.join(SFX_DIR, entry.file);
  if (!fs.existsSync(file)) {
    problems.push(`${key}: no such file — ${entry.file}`);
    continue;
  }
  const actual = mp3Seconds(file);
  const drift = actual - declared;
  const { fraction, min, max, commit } = SPOKEN_TIMING;
  const lead = Math.min(max, Math.max(min, declared * fraction));
  const commitAt = Math.min(lead, declared * commit);
  const where = reachable.get(key);
  if (!where) problems.push(`${key}: registered and delivered, but no move names it`);
  if (Math.abs(drift) > TOLERANCE) {
    problems.push(
      `${key}: SPOKEN_LINES says ${declared.toFixed(2)}s, file is ${actual.toFixed(2)}s ` +
      `(${drift > 0 ? "+" : ""}${drift.toFixed(2)}s) — the move fires ${lead.toFixed(2)}s in, ` +
      `${lead > actual ? "AFTER the line has finished" : "which is now the wrong fraction"}`
    );
  }
  rows.push({ key, declared, actual, lead, commitAt, where: where || "—" });
}

// A move mapped to a line with no length has no wind-up at all: it would fire
// on the frame of the shout, which is the behaviour this feature replaced.
for (const [key, where] of reachable) {
  if (!SPOKEN_LINES[key] && SFX[key]) {
    problems.push(`${key} (${where}): spoken by a move but has no SPOKEN_LINES length — it will fire with no wind-up`);
  }
}

// A MOVE_CALL row naming a move that does not exist never matches. audio.js
// warns about this at runtime; catching it here means never shipping it.
for (const [charKey, moves] of Object.entries(MOVE_CALL)) {
  const char = CHARACTERS[charKey];
  if (!char) {
    problems.push(`MOVE_CALL names no such fighter: ${charKey}`);
    continue;
  }
  const known = new Set([
    ...Object.values(char.specials || {}).map((s) => s.name),
    char.ultimate?.name,
    ...(char.domains || []).map((d) => d.name),
  ]);
  for (const name of Object.keys(moves)) {
    if (!known.has(name)) problems.push(`MOVE_CALL.${charKey} names no such move: ${name}`);
  }
}

// Alternate takes are never played by the game, so nothing else would ever
// notice one whose file went missing — the workbench would simply offer a
// silent button, which is the least debuggable outcome available.
let altCount = 0;
for (const [key, list] of Object.entries(SFX_ALTERNATES)) {
  if (!SFX[key]) problems.push(`SFX_ALTERNATES.${key}: no such registry key to stand beside`);
  for (const alt of list) {
    for (const f of [alt.file].flat()) {
      altCount++;
      if (!fs.existsSync(path.join(SFX_DIR, f))) problems.push(`SFX_ALTERNATES.${key}: no such file — ${f}`);
    }
    if (!alt.note) problems.push(`SFX_ALTERNATES.${key}: an alternate with no note is a file nobody can choose between`);
  }
}

// SIGNATURE_SFX records sounds a HANDLER plays rather than a move declares, so
// the audio bench can list them. It is a duplication by construction — the
// handler is still the thing that plays them — and the two halves can drift
// apart silently. What can be checked is checked: the fighter is real, the
// registry key is real, and the file behind it exists. The attribution itself
// cannot be, which is why each row carries a note saying where it is played.
let sigCount = 0;
for (const [charKey, list] of Object.entries(SIGNATURE_SFX)) {
  if (!CHARACTERS[charKey]) problems.push(`SIGNATURE_SFX: no such fighter — ${charKey}`);
  for (const sig of list) {
    sigCount++;
    const entry = SFX[sig.sfx];
    if (!entry) {
      problems.push(`SIGNATURE_SFX.${charKey}: no such registry key — ${sig.sfx}`);
      continue;
    }
    for (const f of [entry.file].flat()) {
      if (!fs.existsSync(path.join(SFX_DIR, f))) {
        problems.push(`SIGNATURE_SFX.${charKey}: ${sig.sfx} names a missing file — ${f}`);
      }
    }
    if (!sig.note) problems.push(`SIGNATURE_SFX.${charKey}: needs a note saying WHERE it is played`);
  }
}

// ---- every name the game calls resolves to a delivered sound.
//
// entryFor (audio.js) tries SFX[name] then SFX[SFX_ALIASES[name]]; a name that
// misses both is a silent no-op by design, which is exactly why nothing at
// runtime will ever complain about it. Collect every literal call.
const resolves = (name) => !!(SFX[name] || SFX[SFX_ALIASES[name]]);
const called = new Map(); // name -> first file:line seen
function scanDir(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) { scanDir(full); continue; }
    if (!f.name.endsWith(".js")) continue;
    if (f.name === "config_audio.js") continue; // defines the names; its comments mention playSfx
    // Strip line comments so documentation examples don't read as call sites.
    const src = fs.readFileSync(full, "utf8").replace(/^\s*\/\/.*$/gm, "");
    for (const m of src.matchAll(/(?:playSfx|playCharSfx\([^,]+,)\s*\(?\s*"([^"]+)"|\bsfx:\s*"([^"]+)"/g)) {
      const name = m[1] || m[2];
      if (name && !called.has(name)) called.set(name, path.relative(ROOT, full));
    }
  }
}
scanDir(path.join(ROOT, "src"));
let calledCount = 0;
for (const [name, where] of called) {
  calledCount++;
  if (!resolves(name)) problems.push(`${where} plays "${name}" — resolves to nothing (add it to SFX_ALIASES)`);
}

// An alias pointing at a missing key is the same silence one hop later; the
// loops and layers audio.js starts by name are call sites the regex cannot see.
for (const [name, target] of Object.entries(SFX_ALIASES)) {
  if (!SFX[target]) problems.push(`SFX_ALIASES.${name} -> "${target}": no such registry key`);
}
for (const name of ["shield", "domainInterior", "fireBurnLoop", ...Object.values(ELEMENT_HIT_SFX)]) {
  if (!resolves(name)) problems.push(`audio-internal sound "${name}" resolves to nothing`);
}

// The grunt/KO casting (audio.js) must name registered sounds for the whole
// roster — a mech missing from GRUNT_GROUPS attacks and dies in silence.
globalThis.window ??= { addEventListener() {}, removeEventListener() {} }; // audio.js registers unlock listeners at import
const { GRUNT_GROUPS, KO_FOR_GROUP } = await import("../src/audio.js").catch((e) => {
  problems.push(`could not import src/audio.js to audit GRUNT_GROUPS: ${e}`);
  return {};
});
if (GRUNT_GROUPS) {
  for (const key of Object.keys(CHARACTERS)) {
    const group = GRUNT_GROUPS[key];
    if (!group) { problems.push(`GRUNT_GROUPS: ${key} has no voice`); continue; }
    if (!SFX[group]) problems.push(`GRUNT_GROUPS.${key} -> "${group}": no such registry key`);
    const ko = KO_FOR_GROUP[group];
    if (!ko) problems.push(`KO_FOR_GROUP: no KO sound for group "${group}" (${key})`);
    else if (!SFX[ko]) problems.push(`KO_FOR_GROUP.${group} -> "${ko}": no such registry key`);
  }
}

// Every registered file must exist — the bank and the registry are generated
// together, so a miss here means a hand edit or a bad copy.
for (const [key, entry] of Object.entries(SFX)) {
  for (const f of [entry.file].flat()) {
    if (!fs.existsSync(path.join(SFX_DIR, f))) problems.push(`SFX.${key}: no such file — ${f}`);
  }
}

rows.sort((a, b) => a.key.localeCompare(b.key));
console.log(`${rows.length} spoken lines · fires ${SPOKEN_TIMING.fraction * 100}% in (clamped to ` +
            `${SPOKEN_TIMING.min}–${SPOKEN_TIMING.max}s) · interruptible for the first ` +
            `${SPOKEN_TIMING.commit * 100}% of the line\n`);
for (const r of rows) {
  console.log(`  ${r.key.padEnd(24)} ${r.declared.toFixed(2)}s  interruptible to ${r.commitAt.toFixed(2)}s  ` +
              `move at ${r.lead.toFixed(2)}s   ${r.where}`);
}

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log("  " + p);
  process.exit(1);
}
console.log(`\n  ${altCount} alternate take(s) on ${Object.keys(SFX_ALTERNATES).length} sounds, all present`);
console.log(`  ${sigCount} handler-played signature sound(s) named and present`);
console.log(`  ${calledCount} distinct sfx name(s) called across src/ — every one resolves to a delivered sound`);
console.log(`  ${Object.keys(GRUNT_GROUPS || {}).length} fighter(s) cast to a registered voice and KO sound`);
console.log("  every spoken line is registered, delivered, reachable and the right length");
