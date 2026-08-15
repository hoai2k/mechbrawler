// Writes docs/image-requests.md — every 2D image the repo is waiting on, for
// every render mode, in one generation-ready file.
//
// ## Why this file exists
//
// Image requests used to be authored in two places and answered from four
// more, and the result was a list that said "the 2D rounds are closed" while
// round 20 sat open asking for 172 images — the grab poses and the dash attack
// among them, neither of which the roster has ever had. Two lessons came out
// of that, and the design here is both of them:
//
//   1. **Manifest-derived truth can only find art that is WRONG.** Flags and
//      stand-ins describe drawings that exist and are bad. A pose nobody has
//      ever drawn is in no manifest — no flag, standing in for nothing — so it
//      is invisible to every check of that kind. Only a request document knows
//      about art that is ABSENT.
//
//   2. **A request nobody reads is a request nobody fills.** Splitting them by
//      render mode meant each mode's readers saw their own and missed the
//      rest. So there is one destination file now; the modes are sections in
//      it, and every mode's own doc points here.
//
// ## The contract
//
// Requests are AUTHORED in the documents listed in `SOURCES` and nowhere else.
// This tool copies their open rounds through verbatim — prompts, constraints,
// tables and all, because the point of the output is that it can be generated
// from without opening a second file, and a summary of a prompt is not a
// prompt. It then resolves the per-fighter rounds against what is actually on
// disk, which is the part a document cannot do for itself.
//
// `--check` fails if the output is stale OR if a source has an open round this
// tool did not recognise. The second half is the guard: a new round written in
// a shape the parser does not match is exactly how 172 images went missing,
// and it now fails a check instead of going quiet.
//
//   node tools/build_image_requests.mjs           # write the doc
//   node tools/build_image_requests.mjs --check   # fail if stale or unparsed
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
// Which fighters carry a weapon, so DI5 knows who owes a second plate. Read
// from the engine's own table rather than listed again here.
import { CHARACTER_PROPS } from "../render3d/src/props.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs/image-requests.md");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

// Every document allowed to author an image request, and how its rounds are
// spelled. Adding a render mode means adding a row here — and that mode's own
// doc pointing at the output rather than growing a second list.
const SOURCES = [
  {
    mode: "sprite",
    heading: "The sprite game",
    blurb: [
      "Art for the game as a player sees it: `?render=sprite`, the default, and",
      "the path all 27 fighters actually ship on. Keyed plates, delivered to",
      "`assets/intake/`, trimmed and measured on import.",
    ],
    file: "docs/asset-requests.md",
    // "# Round 20 — open" opens the round; its sections are
    // "## 20A. Title — 44 sprites", and the count lives in the heading.
    open: /^# Round (\S+) — open$/m,
    section: /^## (\d+[A-Z])\. ([^\n]*?) — (\d+) (sprites?|images?)$/gm,
  },
  {
    mode: "render3d",
    heading: "The live-3D anime path",
    blurb: [
      "2D images the `?render=3d` pipeline consumes: inputs that models are",
      "GENERATED from, and textures the anime pass reads at runtime. They serve",
      "`?render=billboard` too, which reads the same rigs. These are NOT keyed",
      "plates — each round states its own delivery.",
    ],
    file: "render3d/docs/image-requests.md",
    // No "open round" marker: a DI round stays open per fighter until that
    // fighter's file exists, which is resolved in PER_FIGHTER below.
    open: null,
    section: /^## Round (DI\d) — ([^\n]*)$/gm,
  },
];

// ---------------------------------------------------------------- the sources

/** Character blocks: the design text, verbatim, from the 2D request doc. */
function characterBlocks() {
  const text = read("docs/asset-requests.md");
  const start = text.indexOf("## Character blocks");
  const out = new Map();
  for (const line of text.slice(start).split("\n")) {
    const m = line.match(/^\|\s*(\w+)\s*\|\s*(".*?")\s*(\*\(([^)]*)\)\*)?\s*\|$/);
    if (m) out.set(m[1], { block: m[2], note: m[4] || "" });
  }
  return out;
}

/** The roster table — height, archetype, per-fighter notes — from the
 *  billboard request doc, which owns it for both 3D backends. */
function rosterTable() {
  const text = read("billboards/docs/asset-requests.md");
  const start = text.indexOf("## The roster");
  const out = new Map();
  for (const line of text.slice(start).split("\n")) {
    const m = line.match(/^\|\s*`(\w+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|$/);
    if (m) out.set(m[1], { name: m[2], height: m[3], rig: m[4], archetype: m[5], notes: m[6] });
  }
  return out;
}

/** Where a round's text stops when it is the last one matched: at the next
 *  `##`. Without this, a file's trailing "Not requested here, on purpose"
 *  section would be copied in as though it were a request. */
function nextTopLevel(body, from) {
  const rest = body.slice(from + 1);
  const m = rest.match(/\n## /);
  return m ? from + 1 + m.index + 1 : body.length;
}

/** One source's open rounds, whole. */
function roundsFrom(source) {
  const text = read(source.file);
  let body = text;
  let round = null;
  if (source.open) {
    const m = text.match(source.open);
    if (!m) return { ...source, round: null, sections: [] };
    round = m[1];
    body = text.slice(m.index + m[0].length);
  }
  const hits = [...body.matchAll(source.section)];
  const sections = hits.map((hit, i) => ({
    id: hit[1],
    title: hit[2].replace(/\s*\*\(.*?\)\*\s*$/, "").trim(),
    count: hit[3] ? Number(hit[3]) : null,
    unit: hit[4] || "images",
    text: body.slice(hit.index, i + 1 < hits.length ? hits[i + 1].index : nextTopLevel(body, hit.index)).trim(),
  }));
  return { ...source, round, sections };
}

/** Fighters whose rig has already been delivered. */
function riggedFighters() {
  const file = "render3d/assets/manifest.json";
  if (!exists(file)) return new Map();
  return new Map(Object.entries(JSON.parse(read(file)).characters || {}));
}

/** Sprite poses outstanding by MANIFEST rather than by request: a workbench
 *  flag, or a pose drawing a file that is not its own. Both halves, because
 *  the second raises no flag — which is how seven stayed invisible until 18G.
 *  Neither half can see a pose that was never drawn; that is what the request
 *  documents are for. */
function spriteWork() {
  let flagged;
  try {
    flagged = JSON.parse(execFileSync("python3",
      [path.join(ROOT, "tools/list_replacements.py"), "--json"], { encoding: "utf8", cwd: ROOT }));
  } catch {
    return null; // say we did not check, rather than report a clean sheet
  }
  const man = JSON.parse(read("sprites/assets/manifest.json"));
  const standIns = [];
  for (const [char, poses] of Object.entries(man.characters || {})) {
    for (const [key, meta] of Object.entries(poses)) {
      if (!meta || typeof meta !== "object" || !meta.file) continue;
      const own = path.basename(meta.file, path.extname(meta.file));
      if (own !== key && !meta.awaitingApproval) standIns.push({ char, key, drawing: own });
    }
  }
  return { ...flagged, standIns };
}

// ------------------------------------------------------- per-fighter resolving
//
// What a document cannot say for itself: WHO still owes each per-fighter image.
// A round with no entry here is copied through and counted from its heading.

const blocks = characterBlocks();
const roster = rosterTable();
const rigs = riggedFighters();
const KEYS = [...roster.keys()];
const has = (p) => exists(p);

const PER_FIGHTER = {
  DI1: {
    note: "A fighter whose rig has already been delivered is NOT listed: a turnaround board's only job is to be the thing a model is generated from, and theirs exists.",
    pending: () => KEYS.filter((k) => !rigs.has(k) && !has(`render3d/docs/reference/${k}_turnaround.png`)),
  },
  DI2: {
    note: "Listed for delivered rigs too — this is what the face-first review gate reads AGAINST, so it is wanted whether or not the model exists.",
    pending: () => KEYS.filter((k) => !has(`render3d/docs/reference/${k}_face.png`)),
  },
  DI3: {
    note: "Listed for delivered rigs too: these numbers land in the rig's material extras at intake, and not one delivered rig carries a `toon` block today — all of them are running on engine defaults.",
    pending: () => KEYS.filter((k) => !has(`render3d/docs/reference/${k}_shade.png`)),
  },
  DI4: {
    note: "The shared eye-highlight texture is delivered; these are the optional per-fighter mouth sheets. Nothing ships blocked on one.",
    pending: () => KEYS.filter((k) => !has(`render3d/assets/textures/${k}_mouth_sheet.png`)),
  },
  DI5: {
    note: "Named by MEASUREMENT, not by eye: tools/audit_model_health.py weighs the mesh bound to each limb against the roster's median and reports what cannot be true of a body. A fighter leaves this list when a replacement board lands — not when their model is regenerated, since regenerating from the same board is what produced the fault.",
    // The one round whose list is not "who is missing a file" but "whose
    // delivered model is broken". Read from the audit's own output so the
    // request and the evidence cannot drift apart; the fallback is the
    // hand-listed five, so the doc still builds on a machine without Blender.
    pending: () => {
      const named = health().length ? health() : ["momo", "meimei", "maki", "gakuganji", "uro"];
      // Owed the board, and — for a fighter who carries one — the weapon plate
      // beside it. Uro has no weapon, so she owes one file and not two.
      return named.filter((k) => !has(`render3d/docs/reference/${k}_turnaround.png`)
        || ((CHARACTER_PROPS[k] || []).length && !has(`render3d/docs/reference/${k}_prop.png`)));
    },
  },
};

/** Fighters the model-health audit flags as unrepairable, newest run.
 *  Empty when the audit has never been run — the caller falls back. */
function health() {
  const p = "render3d/docs/reference/model-health.json";
  if (!exists(p)) return [];
  try {
    const rows = JSON.parse(read(p)).rows || [];
    return rows
      .filter((r) => (r.findings || []).some((f) => /NOT RECONSTRUCTED|FUSED INTO|ABOVE the head/.test(f)))
      .map((r) => r.char);
  } catch { return []; }
}

// ------------------------------------------------------------------- rendering

const linkTo = (file) => (file.startsWith("docs/") ? path.basename(file) : `../${file}`);

const fighterRow = (k) => {
  const r = roster.get(k) || {};
  const canon = ["_idle", "_anime", "_canon"]
    .map((s) => `assets/reference/canon/${k}${s}.png`).find(has) || "—";
  return { name: r.name || k, height: r.height || "—",
           archetype: r.archetype || "—", notes: r.notes || "", canon };
};

/** A copied section, with its links repointed at the file that owns it. Bare
 *  `#anchors` name headings that live THERE, not here, and a source outside
 *  docs/ has relative links rooted at its own directory. A link that silently
 *  goes nowhere is the failure check_doc_links.py exists to catch. */
function sectionText(section, source) {
  const dir = path.dirname(source.file);
  const owner = linkTo(source.file);
  let text = section.text.replace(/\]\(#/g, `](${owner}#`);
  if (dir !== "docs") {
    text = text.replace(/\]\((?!https?:|#|\.\.\/|\/)([^)\s]+)\)/g, (_, t) => `](../${dir}/${t})`);
    text = text.replace(/\]\(\.\.\/\.\.\/([^)\s]+)\)/g, "](../$1)");
  }
  return text;
}

function renderSection(section, source) {
  const out = [sectionText(section, source), ""];
  const per = PER_FIGHTER[section.id];
  if (!per) return out.join("\n");
  const pending = per.pending();
  out.push(`### ${section.id}: who is still owed one — ${pending.length} of ${KEYS.length}`, "", per.note, "");
  if (!pending.length) {
    out.push("**Nothing outstanding.** Every fighter has one.", "");
    return out.join("\n");
  }
  out.push("| Fighter | Key | Model at | Archetype | Canon reference | Notes |",
           "|---|---|---|---|---|---|");
  for (const k of pending) {
    const f = fighterRow(k);
    out.push(`| ${f.name} | \`${k}\` | ${f.height} | ${f.archetype} | \`${f.canon}\` | ${f.notes || "—"} |`);
  }
  out.push("");
  return out.join("\n");
}

const countOf = (s) => s.count ?? (PER_FIGHTER[s.id] ? PER_FIGHTER[s.id].pending().length : 0);
const totalOf = (source) => source.sections.reduce((n, s) => n + countOf(s), 0);

function modeSection(source) {
  const out = [`# ${source.heading}`, "", ...source.blurb, ""];
  if (!source.sections.length) {
    out.push(`**Nothing outstanding.** No open round in [${path.basename(source.file)}](${linkTo(source.file)}).`, "");
    return out.join("\n");
  }
  const total = totalOf(source);
  out.push(`**${total} image${total === 1 ? "" : "s"}${source.round ? `, round ${source.round}` : ""}.** Authored in`,
    `[${source.file}](${linkTo(source.file)}) and reproduced whole below.`, "");
  for (const s of source.sections) out.push(`- **${s.id}** — ${s.title} (${countOf(s)} ${s.unit})`);
  out.push("");
  for (const s of source.sections) out.push(renderSection(s, source));
  return out.join("\n");
}

function blocksSection(keys) {
  const out = ["# The character blocks", "",
    "Used **verbatim** as `[CHARACTER BLOCK]` in every prompt above — this is how",
    "a fighter stays the same character across their sprites, their card and",
    "their turnaround. Reproduced from",
    "[asset-requests.md](asset-requests.md#character-blocks), which owns them.",
    "",
    "**Where the block and the canon reference disagree, the reference wins.**",
    "Every fighter now has a `<char>_idle.png`, regenerated from their approved",
    "idle, and it carries the figure scale, palette and shading the delivered set",
    "actually has — which block text cannot. The wiki's (Anime) render answers",
    "design questions the reference leaves open, and is where the blocks came",
    "from: three were rewritten in round 9E because they described characters who",
    "looked nothing like their anime designs, and Uro's again in round 18 after an",
    "ambiguous sentence was drawn the wrong way twice.",
    "", "| Key | Block |", "|---|---|"];
  for (const k of keys) {
    // The block's key-screen marker is dropped here: whether a plate is keyed
    // depends on which round is drawing it, and both answers appear in this file.
    const b = blocks.get(k);
    if (b?.block) out.push(`| \`${k}\` | ${b.block} |`);
  }
  out.push("");
  return out.join("\n");
}

function manifestSection() {
  const work = spriteWork();
  const out = ["# Outstanding by manifest, not by request", "",
    "The other half of the question, and a narrower one: poses whose art EXISTS",
    "and is wrong. A workbench flag says so directly; a pose drawing a file that",
    "is not its own says so silently, which is how seven of them stayed invisible",
    "until round 18G. Neither can see a pose that was never drawn — that is what",
    "the rounds above are for.", ""];
  if (!work) {
    out.push("**Not checked**: `tools/list_replacements.py` would not run, and this",
      "section is worth nothing unless it actually read the manifest.", "");
    return out.join("\n");
  }
  const flagged = [...work.replacements, ...work.deletions];
  if (!flagged.length && !work.standIns.length) {
    out.push("**Nothing outstanding.** No pose carries a replacement flag, and no pose is",
      "drawing a file that is not its own.");
  } else {
    out.push(`**${flagged.length} flagged, ${work.standIns.length} drawing somebody else's art.**`, "",
      "| Fighter | Pose | Why |", "|---|---|---|");
    for (const r of flagged) out.push(`| ${r.char || r.character} | \`${r.key || r.frame}\` | ${r.kind || r.reason || "flagged"} |`);
    for (const s of work.standIns) out.push(`| ${s.char} | \`${s.key}\` | drawing \`${s.drawing}\` |`);
  }
  out.push("");
  if (work.improvements.length) {
    out.push(`Separately, **${work.improvements.length} improvement request${work.improvements.length === 1 ? "" : "s"}** — the art works and is just`,
      "not as good as it should be. Nothing is blocked by one, and the standing",
      "ones are alpha fixes to delivered files, which is repo work rather than a",
      "request.", "");
  }
  return out.join("\n");
}

// ---------------------------------------------------------------------- output

const sources = SOURCES.map(roundsFrom);
const total = sources.reduce((n, s) => n + totalOf(s), 0);

const doc = [
  "# Image Requests — every image still to draw",
  "",
  "**This is the one image-request document.** Every render mode's requests are",
  "here, in their own section, whatever pipeline they feed. If you are drawing",
  "or generating anything 2D for this project, this file is the list, and the",
  "per-mode documents point here rather than keeping their own.",
  "",
  "**It is generated** by `node tools/build_image_requests.mjs` from the",
  "documents that author each round, plus the manifests and the files on disk.",
  "Do not edit it; edit the source round and re-run. `--check` fails when it is",
  "stale, and also when a source has an open round the tool did not recognise —",
  "that second one is the guard, because a round written in an unexpected shape",
  "is exactly how 172 images once went missing from this list.",
  "",
  `**${total} images outstanding.**`,
  "",
  ...sources.map((s) => {
    const n = totalOf(s);
    return `- **${s.heading}** — ${n} image${n === 1 ? "" : "s"}${s.round ? `, round ${s.round}` : ""}`;
  }),
  "",
  "## Rules that hold everywhere here",
  "",
  "- **The canon reference is the subject.** A fighter's own `<char>_idle.png`",
  "  under `assets/reference/canon/` carries their costume, proportions, palette,",
  "  line weight and shading. The drawing is that character, not an",
  "  interpretation of them.",
  "- **The character block goes in the prompt verbatim.** All of them are at the",
  "  bottom of this file.",
  "- **Any subset is useful.** Everything here lands per fighter or per file, and",
  "  anything undelivered keeps whatever the engine does today. Nothing in this",
  "  file blocks play.",
  "",
  "**The modes want opposite deliveries, and it is the one thing worth not",
  "getting wrong.** Sprite rounds are keyed plates — flat magenta `#FF00FF` or",
  "grey `#808080` screen, one subject, margin on all four sides, trimmed at",
  "intake. The 3D inputs are the reverse: a turnaround wants clean white or",
  "transparency, a swatch sheet wants labels, and nothing about them is keyed or",
  "trimmed. Applying either mode's rules to the other produces a file its",
  "pipeline cannot use. Each section states its own.",
  "",
  "---",
  "",
  ...sources.map(modeSection).flatMap((s) => [s, "---", ""]),
  blocksSection(KEYS.filter((k) => blocks.has(k))),
  "---",
  "",
  manifestSection(),
].join("\n").replace(/\n{3,}/g, "\n\n");

// The guard: a source that has an open round we recognised nothing in.
const unparsed = sources.filter((s) => {
  if (s.sections.length) return false;
  if (s.open && !read(s.file).match(s.open)) return false; // no open round at all, fine
  return true;
});

if (process.argv.includes("--check")) {
  let failed = 0;
  for (const s of unparsed) {
    console.log(`FAIL ${s.file} has an open round this tool parsed nothing out of`);
    failed++;
  }
  if ((exists("docs/image-requests.md") ? read("docs/image-requests.md") : "") !== doc) {
    console.log("FAIL docs/image-requests.md is stale — run: node tools/build_image_requests.mjs");
    failed++;
  }
  if (!failed) console.log(`ok   docs/image-requests.md is up to date — ${total} image(s) outstanding`);
  process.exit(failed ? 1 : 0);
}

for (const s of unparsed) {
  console.log(`WARNING ${s.file} has an open round but nothing was parsed out of it`);
}
fs.writeFileSync(OUT, doc);
console.log(`wrote docs/image-requests.md — ${total} image(s) outstanding`);
for (const s of sources) {
  for (const sec of s.sections) {
    console.log(`  ${s.mode.padEnd(9)} ${sec.id.padEnd(4)} ${String(countOf(sec)).padStart(3)}  ${sec.title}`);
  }
}
