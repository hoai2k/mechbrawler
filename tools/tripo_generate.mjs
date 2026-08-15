#!/usr/bin/env node
// Generate a rigged character model from 2D art, via the Tripo API.
//
// This is the step the pipeline was missing. The repo already had everything
// downstream — blender_conform.py to force a delivery into spec, and
// billboard_intake.mjs to validate/import/approve it — but "get a .glb from a
// generator" was a manual errand. It is 28 fighters of errand, so it is a
// script.
//
//     export TRIPO_API_KEY=tsk_...          # never pass it on the command line
//     node tools/tripo_generate.mjs yuji
//     node tools/tripo_generate.mjs yuji --image path/to/other.png
//
// Output lands at render3d/intake/<char>/_raw.glb — the input side of
// blender_conform.py, which is the next step it prints.
//
// ---------------------------------------------------------------------------
// TWO THINGS THAT COST AN AFTERNOON TO FIND, both pinned below as constants:
//
//  1. RIGGING MUST USE THE v1.0 MODEL. The rig API takes `spec: "mixamo"`,
//     which is what this repo's whole skeleton contract is built on
//     (billboards/docs/asset-requests.md: Mixamo-style bone naming, and
//     blender_conform.py strips the `mixamorig:` prefix). On the CURRENT rig
//     model (v2.5) that flag is accepted, echoed back in the task record, and
//     then ignored — the .glb comes out with `tripo::Spine_0` and `bone_14`,
//     names nothing can retarget onto, and `validate` rejects the rig with
//     "missing standard bones". On v1.0 the same request returns a clean
//     `mixamorig:` skeleton with all 22 bones the validator wants. Asking for
//     FBX instead does not help; the naming is the rig model's, not the
//     exporter's.
//
//  2. The two halves live on DIFFERENT API VERSIONS. Generation is v2
//     (api.tripo3d.ai/v2/openapi, poll GET /task/{id}); rigging is v3
//     (openapi.tripo3d.ai/v3/animations/rig, poll GET /v3/tasks/{id}). The
//     v3 task id is not queryable on v2 or vice versa.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const V2 = "https://api.tripo3d.ai/v2/openapi";
const V3 = "https://openapi.tripo3d.ai/v3";

// See note 1 above. Do not "upgrade" this without re-checking the bone names
// in the output — the failure is silent until intake rejects the rig.
const RIG_MODEL = "v1.0-20240301";

// The delivery spec's mesh budget (≤30k tris standard build).
const FACE_LIMIT = 30000;

const KEY = process.env.TRIPO_API_KEY;
if (!KEY) {
  console.error("TRIPO_API_KEY is not set. Export it; do not pass it as an argument —\n"
    + "a key on the command line lands in shell history and in process listings.");
  process.exit(2);
}

const argv = process.argv.slice(2);
// ONE INTAKE. The billboard backend draws render3d's rigs now, so there is a
// single place a delivery lands and `--backend` has nothing left to choose.
// It stayed here defaulting to `billboards/` long enough to drop a fresh
// generation into a directory nothing reads, while build_model.sh looked for
// it under render3d/ and rebuilt the PREVIOUS model without saying so.
const DIR = "render3d";
const imageArg = argv.includes("--image") ? argv[argv.indexOf("--image") + 1] : null;
// A WEAPON, generated on its own: no rig, no clips, one mesh that
// tools/blender_attach_prop.py puts in the fighter's hand afterwards. The
// seed is that fighter's DI5 weapon plate, and the output is the `_prop.glb`
// tools/build_model.sh looks for. See render3d/src/props.js for why the
// weapon is not in the fighter's own board any more.
const propMode = argv.includes("--prop");
const char = argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--image");
if (!char) {
  console.error("usage: tripo_generate.mjs <char> [--image <png>] [--prop]");
  process.exit(2);
}

/** Fighters whose `<char>_idle.png` is NOT their design authority.
 *
 *  assets/reference/canon/README.md carries this in prose, and prose is not
 *  something a generator can read: this script defaulted to `<char>_idle.png`
 *  for everyone, so Hanami — whose idle draws him as a bark-and-foliage tree
 *  and is EXPLICITLY retired as an authority ("his idle_a is what must not be
 *  matched") — was generated as the tree. A 3D model is the most expensive
 *  thing in the pipeline to redo, so the exception list lives here, in code,
 *  next to the default it overrides.
 *
 *  Two kinds of entry:
 *    * a retired idle (hanami, mahoraga) — the anime render is the authority;
 *    * a fighter with no delivered idle at all (round 15's four staged
 *      fighters) — the anime render IS their canon until an idle lands.
 *  Keep this in step with that README when a redraw lands. */
const CANON_OVERRIDE = {
  hanami: "hanami_anime.png",      // idle is the tree; canon is the pale humanoid curse
  mahoraga: "mahoraga_canon.png",  // set being redrawn from scratch (11A)
  mechamaru: "mechamaru_anime.png",
  yuki: "yuki_anime.png",
  dagon: "dagon_anime.png",
  kurourushi: "kurourushi_anime.png",
};

/** The fighter's canonical appearance reference — the same image every 2D
 *  round is matched against, and the best single seed we have when there is
 *  nothing better: full body, relaxed, clean alpha.
 *
 *  THE TURNAROUND BOARD IS BETTER, and is preferred whenever one exists. A
 *  canon idle is ONE view; a DI1/DI5 board is four, drawn for exactly this
 *  purpose — front, ¾, side and back at one scale, so the generator is told
 *  what the back of the coat looks like instead of inventing it. Every model
 *  the roster has today was seeded from a single idle, which is part of why
 *  the review found what it found. */
const canonName = CANON_OVERRIDE[char] || `${char}_idle.png`;
const board = join(ROOT, "render3d/docs/reference", `${char}_turnaround.png`);
const propPlate = join(ROOT, "render3d/docs/reference", `${char}_prop.png`);
const defaultImage = propMode ? propPlate
  : existsSync(board) ? board
  : join(ROOT, "assets/reference/canon", canonName);
const imagePath = imageArg ? join(ROOT, imageArg) : defaultImage;
// A board is only a multiview seed once it has been CUT UP. Sent whole to the
// single-image endpoint it is one picture of four people, and the generator
// models exactly that — see tools/slice_turnaround.py, which exists because
// five fighters came back as four statues each.
// The weapon plates are boards as well — four brooms, four axes — so prop
// mode takes the same route rather than modelling the whole plate.
const seedBoard = propMode ? propPlate : board;
const useMultiview = !imageArg && existsSync(seedBoard);
if (!imageArg && !propMode) {
  if (existsSync(board)) console.log(`seeding from the turnaround board — four views, sent separately`);
  else if (CANON_OVERRIDE[char]) {
    console.log(`canon: ${char}'s idle is retired as an authority — seeding from ${canonName}`);
  }
}

const auth = { Authorization: `Bearer ${KEY}` };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Code 2000 is "you have too many tasks in flight" — a QUEUEING signal, not a
// failure, and the account's real limit is smaller than a roster. Running a
// dozen fighters at once therefore burns most of them instantly: the ones over
// the line die at submit, having done nothing and cost nothing, and the batch
// script counts them as built. Waiting is the correct response to being told
// to wait, so this waits — honouring Retry-After when the server sends one.
const RATE_LIMITED = 2000;
const MAX_WAIT_MIN = 30;

async function api(url, opts = {}) {
  let waited = 0;
  let transient = 0;
  for (;;) {
    const res = await fetch(url, { ...opts, headers: { ...auth, ...(opts.headers || {}) } });
    // Not every reply is JSON. A gateway hiccup mid-generation answers with an
    // HTML error page, and parsing that threw `Unexpected token '<'` — which
    // killed a fighter twelve minutes into a run that was about to succeed.
    // The task itself is still queued server-side, so retrying the POLL is
    // both cheap and correct.
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      if (++transient <= 10) {
        process.stdout.write(`  non-JSON reply (HTTP ${res.status}) — retrying in 15s\n`);
        await sleep(15000);
        continue;
      }
      throw new Error(`${url.replace(/https:\/\/[^/]+/, "")} -> HTTP ${res.status}, `
        + `not JSON: ${text.slice(0, 120)}`);
    }
    if (body.code === 0) return body.data;
    if (body.code === RATE_LIMITED && waited < MAX_WAIT_MIN * 60) {
      const after = Number(res.headers.get("retry-after"));
      const delay = Number.isFinite(after) && after > 0 ? Math.min(after, 120) : 30;
      waited += delay;
      process.stdout.write(`  queue full — waiting ${delay}s (${waited}s so far)\n`);
      await sleep(delay * 1000);
      continue;
    }
    throw new Error(`${url.replace(/https:\/\/[^/]+/, "")} -> ${body.code} ${body.message || ""}`
      + (body.suggestion ? ` (${body.suggestion})` : ""));
  }
}

/** Poll until a task leaves the running states. `v3` selects which task
 *  endpoint to ask, because the two halves do not share an id space. */
async function waitFor(taskId, { v3 = false, label = "task" } = {}) {
  const url = v3 ? `${V3}/tasks/${taskId}` : `${V2}/task/${taskId}`;
  for (let i = 0; i < 240; i++) {
    const d = await api(url);
    if (["success", "failed", "banned", "cancelled", "expired"].includes(d.status)) {
      if (d.status !== "success") throw new Error(`${label} ${d.status}`);
      return d;
    }
    process.stdout.write(`\r  ${label}: ${d.status} ${d.progress ?? ""}%   `);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`${label} did not finish`);
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function upload(path) {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(path)], { type: "image/png" }), "seed.png");
  const up = await api(`${V2}/upload`, { method: "POST", body: form });
  return up.image_token;
}

/** The board's panels, cut and uploaded, in the slot order the API expects:
 *  [front, left, back, right]. We have no right-hand panel — the board draws a
 *  ¾ instead — and an ABSENT view is an empty object, not a repeat of another
 *  one. Padding the slot with the left view would tell the generator the
 *  fighter is symmetric front-to-back about the wrong axis. */
async function multiviewFiles() {
  const argsFor = [join(ROOT, "tools/slice_turnaround.py"), char];
  if (propMode) argsFor.push("--board", seedBoard);
  console.log(execFileSync("python3", argsFor, { encoding: "utf8" }).trimEnd());
  const dir = join(ROOT, "render3d/docs/reference/_views");
  const stem = propMode ? `${char}_prop` : char;
  const files = [];
  for (const slot of ["front", "left", "back"]) {
    const token = await upload(join(dir, `${stem}_${slot}.png`));
    console.log(`uploaded  ${slot.padEnd(5)} ${token}`);
    files.push({ type: "png", file_token: token });
  }
  files.push({});               // right: not drawn
  return files;
}

async function main() {
  if (!existsSync(imagePath)) throw new Error(`no seed image at ${imagePath}`);
  console.log(`seed: ${imagePath.replace(ROOT + "/", "")}`);

  // 1. Upload, and 2. mesh. pbr:false because the delivery spec wants
  //    baseColor only — the engine's toon pass supplies all shading, and
  //    anything pre-lit fights it.
  let body;
  if (useMultiview) {
    body = { type: "multiview_to_model", files: await multiviewFiles() };
  } else {
    const token = await upload(imagePath);
    console.log(`uploaded  ${token}`);
    body = { type: "image_to_model", file: { type: "png", file_token: token } };
  }
  const gen = await api(`${V2}/task`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...body,
      face_limit: FACE_LIMIT,
      texture: true,
      pbr: false,
    }),
  });
  console.log(`mesh task ${gen.task_id}`);
  const meshDone = await waitFor(gen.task_id, { label: "mesh" });
  console.log("\nmesh done");

  // A prop stops here. It is rigid geometry that hangs off a bone, so a
  // biped rig would be nonsense to ask for and nonsense to receive.
  if (propMode) {
    const outDir = join(ROOT, DIR, "intake", char);
    mkdirSync(outDir, { recursive: true });
    const out = join(outDir, "_prop.glb");
    await download(meshDone.output.pbr_model || meshDone.output.model, out);
    console.log(`\nwrote ${out.replace(ROOT + "/", "")}`);
    console.log(`\nnext: tools/build_model.sh ${char} --local picks it up after conform`);
    return;
  }

  // 3. Rig. See note 1: the model version is the whole ballgame.
  const rig = await api(`${V3}/animations/rig`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: gen.task_id,
      model: RIG_MODEL,
      rig_type: "biped",
      spec: "mixamo",
      out_format: "glb",
    }),
  });
  console.log(`rig task  ${rig.task_id}`);
  const done = await waitFor(rig.task_id, { v3: true, label: "rig" });
  console.log("\nrig done");

  const outDir = join(ROOT, DIR, "intake", char);
  mkdirSync(outDir, { recursive: true });
  const raw = join(outDir, "_raw.glb");
  await download(done.output.model_url, raw);

  // Fail loudly here rather than three steps later: if the rig came back with
  // generator-native bone names, nothing downstream can retarget onto it.
  const buf = readFileSync(raw);
  const gltf = JSON.parse(buf.slice(20, 20 + buf.readUInt32LE(12)).toString("utf8"));
  const names = (gltf.nodes || []).map((n) => n.name || "");
  const mixamo = names.filter((n) => n.startsWith("mixamorig:")).length;
  console.log(`\nwrote ${raw.replace(ROOT + "/", "")}  (${mixamo} mixamorig bones)`);
  if (mixamo < 20) {
    console.error(`\nWARNING: only ${mixamo} mixamorig bones — the rig model ignored spec:mixamo.\n`
      + `Bone names look like: ${names.filter(Boolean).slice(0, 4).join(", ")}\n`
      + `See note 1 at the top of this file; intake will reject this rig.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nnext:\n  <blender> --background --python tools/blender_conform.py -- \\`
    + `\n      --in ${DIR}/intake/${char}/_raw.glb --out ${DIR}/intake/${char}/${char}.glb --char ${char}`
    + `\n  node tools/billboard_intake.mjs validate ${char}`);
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
