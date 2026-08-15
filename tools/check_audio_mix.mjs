// How loud is this game, actually?
//
// Written after the whole mix turned out to be about 9 dB under everything else
// on the web, for a reason nobody could have seen by reading config_audio.js:
// the numbers there are all RELATIVE — a category trim of 0.65, a per-sound
// gain of 1.1 — and they were all sensible. The absolute level was the product
// of five of them and the file's own peak, and no single line owned it.
//
// So this measures the product. For every registered sound it multiplies the
// mixer path out, reads the real peak off the file, and reports what actually
// reaches the speakers. That turns "it sounds quiet" from an opinion into a
// number, and turns a future gain edit from a guess into a check.
//
// It fails on two things, both of which are bugs rather than taste:
//
//   * a sound loud enough to clip on its own (peak > 1.0 after the mix)
//   * a sound so quiet it cannot be heard under the rest (below -40 dBFS)
//
// Everything between those is a judgement call and it only reports it. There is
// no correct loudness for a menu blip; there is a wrong one, twice.
//
// Needs an ffmpeg binary; `pip install imageio-ffmpeg` provides one, and this
// finds the same binary the generators use.
//
//   node tools/check_audio_mix.mjs [--all]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SFX, AUDIO_MIX } from "../src/config_audio.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SFX_DIR = path.join(ROOT, "assets", "sfx");
const MUSIC_DIR = path.join(ROOT, "assets", "music");
const showAll = process.argv.includes("--all");

const CLIP = 1.0;              // a single sound that alone reaches full scale
const FLOOR_DB = -40;          // quieter than this and it is lost under a fight

function ffmpeg() {
  for (const cmd of [process.env.FFMPEG, "ffmpeg"]) {
    if (!cmd) continue;
    try {
      execFileSync(cmd, ["-version"], { stdio: "ignore" });
      return cmd;
    } catch { /* keep looking */ }
  }
  // The generators get theirs from imageio-ffmpeg; use the same one.
  try {
    return execFileSync("python3",
      ["-c", "import imageio_ffmpeg,sys; sys.stdout.write(imageio_ffmpeg.get_ffmpeg_exe())"],
      { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}
const FFMPEG = ffmpeg();
if (!FFMPEG) {
  console.log("no ffmpeg — cannot measure levels. `pip install imageio-ffmpeg` and rerun.");
  process.exit(0);
}

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

/** Peak sample of a file, 0..1. Decoded to raw mono so the number is the
 *  waveform's rather than the container's idea of it. */
const peakCache = new Map();
function filePeak(file, dir = SFX_DIR, seconds = null) {
  if (peakCache.has(file)) return peakCache.get(file);
  const full = path.join(dir, file);
  if (!fs.existsSync(full)) return null;
  const args = ["-v", "error", "-i", full];
  if (seconds) args.push("-t", String(seconds));
  args.push("-f", "s16le", "-ac", "1", "-ar", "44100", "-");
  const raw = execFileSync(FFMPEG, args, { maxBuffer: 1 << 28 });
  let peak = 0;
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const v = Math.abs(raw.readInt16LE(i)) / 32768;
    if (v > peak) peak = v;
  }
  peakCache.set(file, peak);
  return peak;
}

// The sfx path, exactly as audio.js computes it (gainFor): category trim, the
// sound's own gain, the SFX slider, the master ceiling. Intensity is a per-call
// argument and defaults to 1, so the default is what gets checked.
const sfxMultiplier = (entry) =>
  Math.min(1, AUDIO_MIX.sfxVolume * AUDIO_MIX.master * (AUDIO_MIX.categories[entry.category] ?? 1) * (entry.gain ?? 1));

const rows = [];
const problems = [];
for (const [key, entry] of Object.entries(SFX)) {
  const mul = sfxMultiplier(entry);
  for (const file of [entry.file].flat()) {
    const peak = filePeak(file);
    if (peak === null) continue;   // check_voice.mjs owns "the file is missing"
    const out = peak * mul;
    rows.push({ key, file, category: entry.category, out });
    if (out > CLIP) problems.push(`${key} (${file}) peaks at ${out.toFixed(2)} — clips on its own`);
    if (db(out) < FLOOR_DB) problems.push(`${key} (${file}) reaches ${db(out).toFixed(1)} dBFS — inaudible in a fight`);
  }
}

// Music takes a different path and it matters: playMusic applies the music
// slider and the menu track's scale, and NOT the master ceiling. That asymmetry
// is why the music slider is the binding constraint on how loud this game can
// be made, so it is measured rather than assumed.
const musicFiles = fs.existsSync(path.join(MUSIC_DIR, "boards"))
  ? fs.readdirSync(path.join(MUSIC_DIR, "boards")).filter((f) => f.endsWith(".mp3")).slice(0, 5)
  : [];
const musicPeaks = musicFiles.map((f) => ({
  file: f,
  out: (filePeak(f, path.join(MUSIC_DIR, "boards"), 30) ?? 0) * AUDIO_MIX.musicVolume,
}));

rows.sort((a, b) => b.out - a.out);
const loudest = rows[0];
const quietest = rows[rows.length - 1];

console.log(`sfx slider ${AUDIO_MIX.sfxVolume} · music slider ${AUDIO_MIX.musicVolume} · master ${AUDIO_MIX.master}\n`);
console.log(`  loudest sound   ${loudest.key} — ${db(loudest.out).toFixed(1)} dBFS peak   (${loudest.file})`);
console.log(`  quietest sound  ${quietest.key} — ${db(quietest.out).toFixed(1)} dBFS peak   (${quietest.file})`);
if (musicPeaks.length) {
  const worst = musicPeaks.reduce((a, b) => (b.out > a.out ? b : a));
  console.log(`  loudest music   ${worst.file} — ${db(worst.out).toFixed(1)} dBFS peak`);
  console.log(`                  (music skips the master ceiling — see playMusic)`);
}

// Per category, because that is the dial somebody would actually reach for.
const byCat = new Map();
for (const r of rows) {
  if (!byCat.has(r.category) || r.out > byCat.get(r.category).out) byCat.set(r.category, r);
}
console.log("\n  loudest in each category:");
for (const [cat, r] of [...byCat].sort((a, b) => b[1].out - a[1].out)) {
  console.log(`    ${cat.padEnd(10)} ${db(r.out).toFixed(1).padStart(6)} dBFS   ${r.key}`);
}

if (showAll) {
  console.log("\n  every sound, loudest first:");
  for (const r of rows) console.log(`    ${db(r.out).toFixed(1).padStart(6)} dBFS  ${r.key.padEnd(22)} ${r.file}`);
}

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log("  " + p);
  process.exit(1);
}
console.log(`\n  ${rows.length} sound(s) measured — none clips on its own, none is under ${FLOOR_DB} dBFS`);
