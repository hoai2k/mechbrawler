// Cross-checks the music on disk against the stage list and config_music.js.
//
//   node tools/check_music.mjs           report only
//   node tools/check_music.mjs --write   rewrite BOARD_TRACKS / UNUSED_BOARD_TRACKS
//
// Run it after adding, renaming or deleting anything under assets/music/. It
// catches the three failures that are otherwise silent: a board track whose
// filename does not match a stage name (so it never plays), a config entry with
// no file behind it (so the game 404s), and a missing menu or fallback track.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = path.join(ROOT, "src/config_music.js");
const AUDIO_EXT = /\.(mp3|ogg|wav|m4a)$/i;

const { STAGES } = await import(path.join(ROOT, "src/stages.js"));
const config = await import(path.join(ROOT, "src/config_music.js"));
const { BOARD_MUSIC_DIR, BOARD_TRACKS, FALLBACK_TRACKS, MENU_TRACK, MUSIC_DIR, UNUSED_BOARD_TRACKS } = config;

const write = process.argv.includes("--write");
const CONFIG_SRC = fs.readFileSync(CONFIG_PATH, "utf8");
const stageNames = STAGES.map((s) => s.name);
const stageNameSet = new Set(stageNames);

const listAudio = (dir) => {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full)
    .filter((f) => AUDIO_EXT.test(f))
    .map((f) => path.basename(f, path.extname(f)))
    .sort();
};

const onDisk = listAudio(BOARD_MUSIC_DIR);
const rootTracks = new Set(listAudio(MUSIC_DIR));

// Nearest stage name, to turn "no match" into an actionable suggestion.
function nearest(name) {
  const distance = (a, b) => {
    const m = [];
    for (let i = 0; i <= b.length; i++) m[i] = [i];
    for (let j = 0; j <= a.length; j++) m[0][j] = j;
    for (let i = 1; i <= b.length; i++)
      for (let j = 1; j <= a.length; j++)
        m[i][j] = b[i - 1] === a[j - 1]
          ? m[i - 1][j - 1]
          : Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
    return m[b.length][a.length];
  };
  const lower = name.toLowerCase();
  return stageNames
    .map((s) => ({ stage: s, d: distance(s.toLowerCase(), lower) }))
    .sort((a, b) => a.d - b.d)[0];
}

const problems = [];
const notes = [];

// 1. Menu and fallback tracks must exist.
if (!rootTracks.has(MENU_TRACK.file)) {
  problems.push(`Menu track missing from ${MUSIC_DIR}: "${MENU_TRACK.file}"`);
}
for (const t of FALLBACK_TRACKS) {
  if (!rootTracks.has(t.file)) problems.push(`Fallback track missing from ${MUSIC_DIR}: "${t.file}"`);
}

// 2. Config entries with no file behind them would 404 at runtime.
const diskSet = new Set(onDisk);
for (const name of BOARD_TRACKS) {
  if (!diskSet.has(name)) problems.push(`BOARD_TRACKS lists "${name}" but no such file in ${BOARD_MUSIC_DIR}`);
}

// 3. Config entries that match no stage would never be selected.
for (const name of BOARD_TRACKS) {
  if (!stageNameSet.has(name)) {
    const near = nearest(name);
    problems.push(`BOARD_TRACKS "${name}" matches no stage — nearest is "${near.stage}" (distance ${near.d})`);
  }
}

// 4. Files on disk nobody references.
const unusedSet = new Set(UNUSED_BOARD_TRACKS);
const configured = new Set(BOARD_TRACKS);
for (const name of onDisk) {
  if (configured.has(name) || unusedSet.has(name)) continue;
  const near = nearest(name);
  const hint = near.d <= 4 ? ` — did you mean "${near.stage}"?` : ` — nearest stage "${near.stage}" (distance ${near.d})`;
  problems.push(`${BOARD_MUSIC_DIR}${name} is not used by any stage${hint}`);
}

// 5. Declared-unused entries that no longer exist, or that are real stages.
for (const name of UNUSED_BOARD_TRACKS) {
  if (!diskSet.has(name)) notes.push(`UNUSED_BOARD_TRACKS lists "${name}" but the file is gone — drop the entry`);
  if (stageNameSet.has(name)) problems.push(`UNUSED_BOARD_TRACKS lists "${name}", which IS a stage — move it to BOARD_TRACKS`);
}

// 6. Informational: stages that fall back to the originals.
const withoutTrack = stageNames.filter((n) => !configured.has(n));
if (withoutTrack.length) notes.push(`Stages using the fallback originals (${withoutTrack.length}): ${withoutTrack.join(", ")}`);

if (write) {
  const matched = onDisk.filter((n) => stageNameSet.has(n));
  const unmatched = onDisk.filter((n) => !stageNameSet.has(n));
  const render = (names) => (names.length ? `\n${names.map((n) => `  "${n}",`).join("\n")}\n` : "");
  let src = CONFIG_SRC;
  src = src.replace(/export const BOARD_TRACKS = \[[\s\S]*?\];/,
    `export const BOARD_TRACKS = [${render(matched)}];`);
  src = src.replace(/export const UNUSED_BOARD_TRACKS = \[[\s\S]*?\];/,
    `export const UNUSED_BOARD_TRACKS = [${render(unmatched)}];`);
  fs.writeFileSync(CONFIG_PATH, src);
  console.log(`Rewrote config_music.js: ${matched.length} board tracks, ${unmatched.length} unused.`);
  console.log("Re-run without --write to check the result.");
  process.exit(0); // the checks above ran against the pre-write config
}

console.log(`Stages: ${stageNames.length} · board files: ${onDisk.length} · configured: ${BOARD_TRACKS.length}`);
for (const n of notes) console.log(`  note:    ${n}`);
for (const p of problems) console.log(`  PROBLEM: ${p}`);
if (!problems.length) console.log("  No problems found.");
process.exit(problems.length ? 1 : 0);
