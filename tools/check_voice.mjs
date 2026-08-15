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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SFX, MOVE_CALL, DOMAIN_CALL, SPOKEN_LINES, SPOKEN_TIMING, SFX_ALTERNATES, SIGNATURE_SFX } from "../src/config_audio.js";
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
console.log("  every spoken line is registered, delivered, reachable and the right length");
