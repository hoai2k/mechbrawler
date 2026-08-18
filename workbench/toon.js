// THE TOON WORKBENCH — one mech, drawn the way the toon style draws it, with
// the palette that decision produced laid out beside it and every swatch
// editable.
//
// WHAT IT IS FOR. The cel palette (render3d/src/cel_palette.js) turns a
// delivery's PBR albedo into a handful of flat cartoon fills, and every part
// of that is a judgement: how many colours a body is made of, which of them
// are the scheme and which are grime, and what each one should be painted
// once it is brightened. Those judgements were made by NUMBERS — cluster
// counts and ratio gates — tuned by eye against four mechs and applied to
// seventeen. The ones that are wrong are wrong per character, and there was
// no way to see a mech's palette at all, let alone change it.
//
// So this tool answers two questions and lets you act on both:
//
//   * WHAT COLOURS IS THIS MECH MADE OF? The rail lists the palette the
//     analysis actually chose — every fill, how much of the texture wears it,
//     and the source colour it was graded from. That alone is the readout
//     that was missing: "inferno is two reds and a brown" is a fact you could
//     previously only get by squinting at a render.
//   * WOULD IT LOOK BETTER LIKE THIS? Every swatch is a colour picker, and
//     every knob that decides which region gets which fill is a slider. Both
//     repaint the LIVE RIG — the same texture the viewer is rendering — so
//     the answer is the mech itself, not a preview of one.
//
// WHY IT IS FAST ENOUGH TO DRAG. A swatch edit changes only what a region is
// painted, never which region is which, so cel_palette repaints from the
// cached texel assignment instead of re-clustering a 2048² texture. The
// grouping knobs do force the full re-analysis; those are debounced and say
// so. The split is the whole reason a colour picker is usable here.
//
// NOTHING IS SAVED. Edits live in memory for the session, exactly like the
// effect workbench: "Export JSON" downloads a complete snapshot of every
// mech's block, and until it is downloaded the bar says there are unexported
// changes. The file is applied to render3d/assets/manifest.json as each
// character's `toon.cel`, which is the block the engine already reads
// (render3d/src/toon.js makeToonMaterial).
//
// THE STYLE IS FORCED. Everything here is about the toon pass, and the render
// style is fixed for the page's life (render3d/src/style.js), so the router
// redirects to `?render=toon` before a single renderer module is imported.

import {
  bootRenderer, MECHS, drawMech, drawGhost, mechFrameBox,
  ensureRig, rigReady, whenRigReady, rigRoot, rigEntry, three, clearPoseCache,
  attachOrbit, setOrbit, inGameCameraDeg,
} from "./rig_view.js";
import { recelFor } from "../render3d/src/toon.js";
import { CEL, CEL_KEYS, PLAN_KEYS, BAKE_KEYS } from "../render3d/src/cel_palette.js";
import { attachSheets } from "./sheet.js";

const el = (id) => document.getElementById(id);

// ------------------------------------------------------------- the knobs
//
// Grouped the way the pipeline is: the three sections are the three questions
// the analysis asks in order, and a knob's section is what tells you what it
// can possibly affect. `replan` marks the ones that force a re-clustering —
// the slow path, and the ones whose slider is committed on release rather
// than live.

const GROUPS = [
  {
    title: "Which colours this body is made of",
    note: "The clustering and grouping pass. Moving these re-analyses the texture — a second or two — and can change how many swatches there are.",
    knobs: [
      ["clusters", "Clusters", 2, 24, 1,
        "How many colours k-means starts from, before they group into paints. More clusters find rarer colours; they still merge if they are the same paint."],
      ["mergeDist", "Merge distance", 0, 120, 1,
        "Centres closer than this in RGB are one paint outright, no questions asked."],
      ["groupValueRatio", "Same-paint value floor", 0.2, 0.95, 0.01,
        "How much of its brightness a shade must keep to still be the same paint. This is the gate that keeps a scheme two-tone: raise it and dark accents split off, lower it and a shading ramp collapses into one fill."],
      ["groupSatRatio", "Same-paint saturation floor", 0, 0.95, 0.01,
        "How much saturation two colours must share. Wear is duller than the paint under it; a different material in the same hue family is not."],
      ["groupHue", "Same-paint hue window", 0, 0.25, 0.005,
        "How far apart around the colour wheel two colours may be and still be one paint."],
      ["greySat", "Grey threshold", 0, 0.3, 0.005,
        "Below this saturation a colour counts as grey: it keeps its lack of hue through the grade, and is compared by brightness rather than by hue."],
    ],
  },
  {
    title: "How each fill is brightened",
    note: "The cartoon grade — what turns a photographic paint colour into a drawn one. These re-analyse too, but never change the number of swatches.",
    knobs: [
      ["valueFloor", "Value floor", 0, 0.5, 0.01,
        "How light the darkest possible fill comes out. Lift this and nothing on the body is ever truly black."],
      ["valueGamma", "Value curve", 0.3, 1.5, 0.01,
        "Below 1 lifts the dark end and leaves the light end alone. Push it too far and a two-tone mech goes monochrome, because the dark accent climbs to meet the main colour."],
      ["satGain", "Saturation gain", 0.5, 2.5, 0.01,
        "How much more vivid a fill gets, scaled by how bright it came out — so main colours go vivid and dark accents stay muted paint."],
      ["satAdd", "Saturation lift", 0, 0.4, 0.005,
        "A flat push on top of the gain, also scaled by brightness."],
      ["familyPull", "Family pull", 0, 1, 0.01,
        "How far fills in one paint family draw toward the family's cleanest colour. At 0 a rusted plate is its own colour; at 1 it becomes the clean one. In between it reads as tone rather than as camouflage."],
      ["familyHue", "Family hue window", 0, 0.3, 0.005,
        "How far apart in hue two fills can be and still count as one family, for that pull and for the blob absorption below."],
      ["familyValueRatio", "Family value floor", 0.1, 0.9, 0.01,
        "How much brightness family members must share. This is what stops a bright trim line being absorbed into the dark plate it crosses."],
    ],
  },
  {
    title: "Which regions get which fill",
    note: "The bake. These do not re-analyse: the palette keeps exactly the colours it has and only the texels move between them. They still re-run the flood fill, so give them a moment.",
    knobs: [
      ["classifyBlur", "Classify blur", 0, 0.02, 0.0005,
        "Texels are assigned from a blurred read of the texture, as a fraction of its edge, so a fleck of grime votes with its neighbourhood instead of flipping its own texel. Raise it for calmer, chunkier regions."],
      ["minPlate", "Minimum region", 0, 0.08, 0.001,
        "A same-paint island smaller than this share of the texture is treated as wear and folds into the paint around it. Raise it to sweep away speckle; raise it too far and a real detail colour is swallowed."],
    ],
  },
];

const KNOB_SPEC = new Map();
for (const g of GROUPS) for (const k of g.knobs) KNOB_SPEC.set(k[0], { group: g, spec: k });

/** Does this knob force the texture to be re-analysed? */
const isReplan = (key) => PLAN_KEYS.includes(key);

// -------------------------------------------------------------- the state
//
// One document per mech: the knobs that differ from the roster default, and
// the palette colours that have been pinned. Both are exactly the shape of a
// manifest `toon.cel` block, so the export is the document rather than a
// translation of it — there is no second format to get wrong.
//
// `palette` is keyed by SOURCE TEXTURE NAME because a mech may carry several
// (jerry has nine materials), then by group index. Group indices are stable:
// cel_palette orders groups by how much of the texture they cover, so group 0
// is always the body colour.

/** charKey -> { knobs: {name: value}, palette: {texName: {index: [r,g,b]}} } */
let docs = {};

const view = {
  mech: MECHS[0]?.key || "titanus",
  orbit: null,
  raf: 0,
  plans: [],       // [{ name, plan }] for the mech on screen
  busy: false,
  dirty: false,
};

const emptyDoc = () => ({ knobs: {}, palette: {} });
const docFor = (mech) => docs[mech] || seedDoc(mech);

/** The `toon.cel` block a mech is currently being drawn with — exactly what
 *  goes in the manifest and exactly what cel_palette merges onto CEL, so the
 *  live rig and the export can never be showing different things. */
function celOpts(mech) {
  const doc = docFor(mech);
  const palette = {};
  for (const [texName, groups] of Object.entries(doc.palette)) {
    const entries = Object.keys(groups)
      .map(Number)
      .sort((a, b) => a - b)
      .map((g) => ({ group: g, to: groups[g] }));
    if (entries.length) palette[texName] = entries;
  }
  return {
    ...doc.knobs,
    ...(Object.keys(palette).length ? { palette } : {}),
  };
}

/** A mech's document, seeded from whatever its manifest entry ALREADY says.
 *
 *  Without this the tool would open every character on the roster defaults
 *  and then export that as the truth — quietly deleting art direction someone
 *  committed last week. Seeding also makes the rail honest on open: the
 *  swatches marked as pinned are the ones the manifest pins. */
function seedDoc(mech) {
  if (docs[mech]) return docs[mech];
  const doc = emptyDoc();
  const cel = rigEntry(mech)?.toon?.cel;
  if (cel) {
    for (const key of CEL_KEYS) {
      if (cel[key] !== undefined) doc.knobs[key] = cel[key];
    }
    const pal = cel.palette;
    // Both shapes the engine accepts: a bare list for a one-texture rig, or a
    // map keyed by source texture name.
    const byTex = Array.isArray(pal) ? { "": pal } : (pal || {});
    for (const [texName, entries] of Object.entries(byTex)) {
      for (const entry of entries || []) {
        const g = Number(entry?.group);
        if (Number.isInteger(g) && Array.isArray(entry?.to)) {
          (doc.palette[texName] ||= {})[g] = entry.to.slice(0, 3);
        }
      }
    }
  }
  docs[mech] = doc;
  return doc;
}

/** Is anything set on this mech at all? */
const isEdited = (mech) => {
  const d = docs[mech];
  return !!d && (Object.keys(d.knobs).length > 0
    || Object.values(d.palette).some((t) => Object.keys(t).length > 0));
};

// ------------------------------------------------------------ undo / redo
//
// Snapshots of the WHOLE document set, not of one mech: an undo that stopped
// at the mech boundary would silently strand an edit you made a minute ago
// behind a dropdown change. They are a few dozen numbers, so the whole
// session's history costs less than one texture.

const undos = { past: [], future: [] };
const HISTORY_MAX = 200;

const snapshot = () => JSON.parse(JSON.stringify(docs));

/** Take a checkpoint BEFORE a change lands. Every path that mutates `docs`
 *  calls this first, which is what makes undo mean "the state before the
 *  thing I just did" rather than "some earlier state". */
function checkpoint() {
  undos.past.push(snapshot());
  if (undos.past.length > HISTORY_MAX) undos.past.shift();
  undos.future.length = 0;
}

function undo() {
  if (!undos.past.length) return;
  undos.future.push(snapshot());
  docs = undos.past.pop();
  afterHistory();
}

function redo() {
  if (!undos.future.length) return;
  undos.past.push(snapshot());
  docs = undos.future.pop();
  afterHistory();
}

function afterHistory() {
  markDirty();
  syncKnobs();
  applyEdits();
  syncHistoryButtons();
}

function syncHistoryButtons() {
  for (const [id, on] of [["undo", undos.past.length], ["redo", undos.future.length]]) {
    const b = el(id);
    if (b) b.disabled = !on;
  }
}

// -------------------------------------------------------------- the apply
//
// The one path that puts the document onto the rig. Everything else changes
// `docs` and calls this.
//
// Debounced, because the slow knobs re-cluster a 2048² texture and a slider
// drag would otherwise queue a dozen of those. The fast path — a palette
// swatch — still goes through the same debounce, but cel_palette repaints it
// from the cached assignment, so it lands within a frame or two of the drag.

let applyTimer = 0;

function applyEdits(delay = 30) {
  clearTimeout(applyTimer);
  applyTimer = setTimeout(runApply, delay);
}

function runApply() {
  const mech = view.mech;
  const root = rigRoot(mech);
  if (!root) { renderPalette(); return; }
  view.busy = true;
  say(`repainting ${mech}…`);
  // Yielded to the browser so the "repainting" line actually paints before a
  // re-analysis blocks the main thread for a second or two. Without this the
  // status only ever appears after the work it was announcing.
  requestAnimationFrame(() => {
    const t0 = performance.now();
    try {
      view.plans = recelFor(three(), root, celOpts(mech));
    } catch (err) {
      console.error(err);
      say(`repaint failed: ${err.message}`, true);
      view.busy = false;
      return;
    }
    // The cache holds pixels rendered from the OLD texture. Without this the
    // viewer redraws happily and shows the pre-edit mech.
    clearPoseCache();
    adoptTextureNames(mech);
    view.busy = false;
    const ms = Math.round(performance.now() - t0);
    say(`${mech} · ${swatchCount()} colours · repainted in ${ms} ms`);
    renderPalette();
    draw();
  });
}

/** A palette seeded from a manifest block written in the one-texture
 *  shorthand is keyed `""`; the rail keys by the source texture's real name.
 *  Once the rig has loaded the name is known, so the shorthand is resolved to
 *  it — otherwise the swatches for a hand-authored block would show as
 *  unpinned and the next export would drop the pins. */
function adoptTextureNames(mech) {
  const doc = docs[mech];
  const loose = doc?.palette?.[""];
  if (!loose || view.plans.length !== 1) return;
  const name = view.plans[0].name;
  if (!name) return;
  doc.palette[name] = { ...loose, ...(doc.palette[name] || {}) };
  delete doc.palette[""];
}

const swatchCount = () =>
  view.plans.reduce((n, t) => n + (t.plan?.fills?.length || 0), 0);

// --------------------------------------------------------------- the rail

const hex = ([r, g, b]) =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;

const unhex = (s) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function renderPalette() {
  const host = el("palette");
  if (!host) return;
  if (!view.plans.length) {
    host.innerHTML = `<p class="muted">${rigReady(view.mech)
      ? "This rig carries no cel-flattened texture — nothing to show."
      : "Waiting for the rig to load…"}</p>`;
    return;
  }
  const doc = docFor(view.mech);
  const many = view.plans.length > 1;
  host.innerHTML = view.plans.map(({ name, plan }, ti) => {
    if (!plan) return "";
    const pinned = doc.palette[name] || {};
    const rows = plan.fills.map((fill, g) => {
      const isPinned = pinned[g] != null;
      // Both colours are worth showing: what the analysis GRADED this fill to
      // and what it is painted now are the same number until you touch it,
      // and once you have, the difference is the edit.
      const auto = plan.auto[g];
      const pct = (plan.shares[g] * 100).toFixed(1);
      return `<div class="swatch${isPinned ? " is-pinned" : ""}">
          <input class="swatch-dot" type="color" value="${hex(fill)}"
                 data-tex="${escapeAttr(name)}" data-group="${g}"
                 aria-label="Fill ${g} colour">
          <div class="swatch-body">
            <div class="swatch-head">
              <strong>${g === 0 ? "body" : `fill ${g}`}</strong>
              <span class="swatch-pct">${pct}%</span>
            </div>
            <div class="swatch-meta">
              <code>${hex(fill)}</code>
              ${isPinned ? `<span class="swatch-auto">was ${hex(auto)}</span>` : ""}
            </div>
          </div>
          <button class="swatch-revert" type="button" data-revert="${escapeAttr(name)}"
                  data-group="${g}" ${isPinned ? "" : "disabled"}
                  title="Put this fill back to the colour the grade chose">↺</button>
        </div>`;
    }).join("");
    return `${many ? `<p class="palette-tex muted">texture <code>${name || "unnamed"}</code></p>` : ""}
      <div class="swatches">${rows}</div>`;
  }).join("");
}

const escapeAttr = (s) => String(s).replace(/"/g, "&quot;");

/** Every knob's control, with the live value and a reset when it is off the
 *  roster default. Built once; `syncKnobs` moves them afterwards. */
function knobsHTML() {
  return GROUPS.map((g) => `
    <section class="knobgroup">
      <h3>${g.title}</h3>
      <p class="muted knobgroup-note">${g.note}</p>
      ${g.knobs.map(([key, label, min, max, step, help]) => `
        <div class="knob" id="knob-${key}">
          <div class="knob-head">
            <label for="k-${key}">${label}</label>
            <output id="o-${key}"></output>
            <button class="knob-reset" type="button" data-reset="${key}"
                    title="Back to the roster default (${CEL[key]})">↺</button>
          </div>
          <input id="k-${key}" type="range" min="${min}" max="${max}" step="${step}"
                 value="${CEL[key]}" data-knob="${key}"
                 ${isReplan(key) ? 'data-slow="1"' : ""}>
          <p class="knob-help muted">${help}</p>
        </div>`).join("")}
    </section>`).join("");
}

/** Put every control back in step with the document — after an undo, a mech
 *  change, or a reset. */
function syncKnobs() {
  const doc = docFor(view.mech);
  for (const [key] of KNOB_SPEC) {
    const value = doc.knobs[key] ?? CEL[key];
    const input = el(`k-${key}`);
    const out = el(`o-${key}`);
    const row = el(`knob-${key}`);
    if (input) input.value = String(value);
    if (out) out.textContent = fmt(value);
    const set = doc.knobs[key] !== undefined;
    row?.classList.toggle("is-set", set);
    const reset = row?.querySelector(".knob-reset");
    if (reset) reset.disabled = !set;
  }
  const mechSel = el("mech");
  if (mechSel) mechSel.value = view.mech;
  if (el("mMech")) el("mMech").textContent =
    MECHS.find((m) => m.key === view.mech)?.name || view.mech;
  for (const b of document.querySelectorAll("#mechList .pick")) {
    b.classList.toggle("is-on", b.dataset.mech === view.mech);
    b.classList.toggle("is-dirty", isEdited(b.dataset.mech));
  }
  syncHistoryButtons();
}

/** Numbers as a human reads them: the ratios and windows are small fractions
 *  and a raw toFixed(4) on a cluster count reads as a bug. */
function fmt(v) {
  if (Number.isInteger(v)) return String(v);
  const abs = Math.abs(v);
  return v.toFixed(abs < 0.01 ? 4 : abs < 1 ? 3 : 2);
}

// ------------------------------------------------------------- the export

const EXPORT_SCHEMA = "mechbrawler.toon-cel";
const EXPORT_VERSION = 1;

function exportJSON() {
  const characters = {};
  for (const m of MECHS) {
    if (!isEdited(m.key)) continue;
    const doc = docs[m.key];
    const cel = { ...doc.knobs };
    const palette = {};
    for (const [texName, groups] of Object.entries(doc.palette)) {
      const keys = Object.keys(groups).map(Number).sort((a, b) => a - b);
      if (!keys.length) continue;
      // `hex` rides along for the human reading the diff; the engine reads
      // `to`, and cel_palette ignores anything else on the entry.
      palette[texName] = keys.map((g) => ({ group: g, to: groups[g], hex: hex(groups[g]) }));
    }
    if (Object.keys(palette).length) cel.palette = palette;
    characters[m.key] = { toon: { cel } };
  }
  const payload = {
    schema: EXPORT_SCHEMA,
    version: EXPORT_VERSION,
    generatedBy: "Mech Brawler toon workbench (/workbench/?edit=toon) — nothing is persisted in the browser; this file is the only record of the session's edits.",
    generatedAt: new Date().toISOString(),
    applyTo: "render3d/assets/manifest.json — characters.<key>.toon.cel",
    howToApply: "Merge each entry's `toon.cel` into that character's manifest entry, keeping whatever else the entry's `toon` block already carries. Only characters that were EDITED appear here; anything absent is on the roster defaults below and needs no block. In `palette`, the outer key is the SOURCE texture's name and `group` is the fill's index — cel_palette orders groups by how much of the texture each covers, so group 0 is the largest. `hex` is informational; `to` is the value the engine reads. NOTE: a pinned palette entry is tied to the group indices the CURRENT analysis knobs produce — changing a clustering knob later can renumber them, so re-check a mech's swatches after moving one.",
    rosterDefaults: Object.fromEntries([...PLAN_KEYS, ...BAKE_KEYS].map((k) => [k, CEL[k]])),
    counts: { roster: MECHS.length, edited: Object.keys(characters).length },
    characters,
  };
  const text = JSON.stringify(payload, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mechbrawler-toon-cel-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  view.dirty = false;
  el("dirtyFlag").hidden = true;
  say(`exported ${a.download} — ${payload.counts.edited} mech${payload.counts.edited === 1 ? "" : "es"} edited`);
}

function markDirty() {
  view.dirty = true;
  const flag = el("dirtyFlag");
  if (flag) flag.hidden = false;
}

// --------------------------------------------------------------- the draw
//
// The same framing the pose workbench uses, and for the same reason: the
// default view is the game's own camera, and the orbit is an offset on it.

let canvas = null;

function paint() {
  if (!canvas) return;
  const stage = canvas.parentElement.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(240, Math.floor(stage.width));
  const h = Math.max(200, Math.floor(stage.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  setOrbit(view.orbit.orbit);

  const box = mechFrameBox(view.mech);
  const pad = w < 520 ? 18 : 70;
  const z = Math.min((w - pad) / box.side, (h - pad * 0.85) / box.side);
  const originX = w / 2;
  const originY = (h - box.side * z) / 2 + box.above * z;
  ctx.setTransform(z * dpr, 0, 0, z * dpr, originX * dpr, originY * dpr);

  // A floor line only: this tool is about colour, and the pose workbench's
  // measuring grid would be furniture competing with the thing being judged.
  ctx.save();
  ctx.strokeStyle = "rgba(120, 200, 255, 0.18)";
  ctx.lineWidth = 1 / z;
  ctx.beginPath();
  ctx.moveTo(-originX / z, 0);
  ctx.lineTo((w - originX) / z, 0);
  ctx.stroke();
  ctx.restore();

  const drew = drawMech(ctx, view.mech, "idle", 0, 0, 0, { facing: 1 });
  if (!drew) drawGhost(ctx, view.mech, 0, 0, 1 / z);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.save();
  ctx.font = "500 11px Inter, system-ui, sans-serif";
  ctx.fillStyle = "rgba(160, 180, 210, 0.75)";
  const o = view.orbit.orbit;
  ctx.fillText(view.orbit.moved()
    ? `orbited ${o.yawDeg.toFixed(0)}° / ${o.pitchDeg.toFixed(0)}° / ${o.dolly.toFixed(2)}× — Reset returns to the game's camera`
    : `idle · the game's own camera (${inGameCameraDeg()}° yaw) · toon style`, 12, 20);
  ctx.restore();
}

function draw() {
  if (view.raf) return;
  view.raf = requestAnimationFrame(() => { view.raf = 0; paint(); });
}

/** Every repaint bumps `data-rev` on the status line. Two consecutive edits
 *  can leave the SAME sentence there — same mech, same colour count, same
 *  milliseconds — and then nothing on the page says the second one landed.
 *  The counter is what a watcher (a person waiting, or a smoke test) can
 *  actually tell apart. */
let statusRev = 0;

function say(text, bad = false) {
  const s = el("status");
  if (!s) return;
  s.textContent = text;
  s.dataset.rev = String(++statusRev);
  s.classList.toggle("is-bad", bad);
}

// -------------------------------------------------------------- the shell

function shell() {
  const mechOpts = MECHS.map((m) => `<option value="${m.key}">${m.name}</option>`).join("");
  return `
    <header class="bar">
      <div class="bar-title">
        <strong>Toon workbench</strong>
        <span class="muted">${MECHS.length} mechs · cel palette</span>
        <a class="bar-link" href="./">← effect workbench</a>
        <a class="bar-link" href="?edit=pose">pose workbench →</a>
      </div>
      <div class="bar-tools bar-tools--desk">
        <label class="tool">Mech <select id="mech">${mechOpts}</select></label>
        <button id="undo" type="button" title="Undo (Ctrl+Z)" disabled>↶ Undo</button>
        <button id="redo" type="button" title="Redo (Ctrl+Shift+Z)" disabled>↷ Redo</button>
        <button id="revertMech" type="button" title="Put this mech back on the roster defaults">Revert mech</button>
        <button id="reset" type="button">Reset view</button>
        <button id="exportBtn" type="button" class="primary">Export JSON</button>
        <span id="dirtyFlag" class="flag" hidden title="Nothing is saved anywhere — reloading this page loses these edits.">unexported changes</span>
      </div>
      <p id="status" class="muted">booting…</p>
    </header>

    <main class="split split--pose">
      <section class="viewer">
        <div class="viewer-stage"><canvas id="toonCanvas"></canvas></div>
        <p class="viewer-note muted">
          The mech in its <strong>idle pose</strong> under the toon style, on the
          game's own ${inGameCameraDeg()}° lens. <strong>Drag</strong> to orbit,
          <strong>scroll</strong> to dolly. Every edit in the rail repaints
          <strong>this rig's actual texture</strong> — what you are looking at is
          the change, not a preview of it.
        </p>
      </section>
      <aside id="rail" class="rail rail--toon">
        <h2 class="rail-head">Palette</h2>
        <p class="muted rail-note">
          The fills the analysis chose for this mech, ordered by how much of the
          texture wears each — so <strong>body</strong> is the mech's largest
          area, which is not always the colour you would name it by.
          <strong>Click a swatch</strong> to paint it something else; the rig
          repaints as you drag, because a colour change never moves a region
          boundary.
        </p>
        <div id="palette" class="palette"></div>

        <h2 class="rail-head">Parameters</h2>
        <div id="knobs">${knobsHTML()}</div>

        <p class="muted rail-foot">
          Nothing here is saved. <strong>Export JSON</strong> downloads every
          edited mech's <code>toon.cel</code> block for
          <code>render3d/assets/manifest.json</code>; the roster defaults live in
          <code>render3d/src/cel_palette.js</code>.
        </p>
      </aside>
    </main>

    <nav class="mbar">
      <div class="mrow">
        <button class="mbtn" type="button" data-sheet="mech">
          <span class="mbtn-k">Mech</span><span class="mbtn-v" id="mMech">—</span>
        </button>
        <button class="mbtn" type="button" data-sheet="rail">
          <span class="mbtn-k">Palette</span><span class="mbtn-v">&amp; knobs</span>
        </button>
        <button class="mbtn mbtn--icon" id="undoM" type="button" aria-label="Undo">↶</button>
        <button class="mbtn mbtn--icon" id="redoM" type="button" aria-label="Redo">↷</button>
        <button class="mbtn mbtn--icon" id="resetM" type="button" aria-label="Reset the view">⟳</button>
      </div>
    </nav>

    <section class="sheet" id="sheetMech">
      <h3 class="sheet-title">Which mech · ${MECHS.length} in the roster</h3>
      <div class="picklist" id="mechList"></div>
    </section>`;
}

// ----------------------------------------------------------------- boot

let sheets = null;

export async function boot(root) {
  readURL();
  root.innerHTML = shell();
  syncKnobs();

  say("loading the renderer…");
  const { style } = await bootRenderer();
  if (style !== "toon") {
    // The router redirects before any renderer module loads, so this can only
    // mean the redirect did not happen. Say so rather than showing a PBR mech
    // and a palette rail that will never populate.
    say("this page is not in the toon style — reload with ?render=toon", true);
  }

  canvas = el("toonCanvas");
  view.orbit = attachOrbit(canvas, () => draw());
  new ResizeObserver(() => draw()).observe(canvas.parentElement);

  buildMechList();
  sheets = attachSheets(root, {
    mech: { el: el("sheetMech"), title: "Mech" },
    rail: { el: el("rail"), title: "Palette & parameters" },
  });

  wireControls();
  document.addEventListener("keydown", onKey);

  await selectMech(view.mech);
}

function readURL() {
  const mech = new URLSearchParams(location.search).get("mech");
  if (MECHS.some((m) => m.key === mech)) view.mech = mech;
}

function writeURL() {
  const url = new URL(location.href);
  url.searchParams.set("edit", "toon");
  url.searchParams.set("render", "toon");
  url.searchParams.set("mech", view.mech);
  history.replaceState(null, "", url);
}

function buildMechList() {
  const host = el("mechList");
  for (const m of MECHS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pick";
    b.dataset.mech = m.key;
    b.innerHTML = `<span>${m.name}</span><span class="pick-sub">${m.key}</span>`;
    b.addEventListener("click", () => { selectMech(m.key); sheets?.close(); });
    host.append(b);
  }
}

/** Show a mech: wait for its rig, then read the palette off it. The rig's
 *  textures were already cel'd at load with whatever the manifest said, so
 *  the first apply is what puts THIS SESSION's document onto them — including
 *  the empty document, which is simply the defaults. */
async function selectMech(key) {
  if (!MECHS.some((m) => m.key === key)) return;
  view.mech = key;
  view.plans = [];
  writeURL();
  syncKnobs();
  renderPalette();
  draw();

  if (!rigReady(key)) {
    say(`loading ${key}'s rig…`);
    ensureRig(key);
    const ok = await whenRigReady(key);
    if (view.mech !== key) return;      // the dropdown moved on while it loaded
    if (!ok) { say(`${key}'s rig did not load`, true); return; }
  }
  if (view.mech !== key) return;
  applyEdits(0);
}

function wireControls() {
  el("mech").addEventListener("change", (e) => selectMech(e.target.value));
  el("exportBtn").addEventListener("click", exportJSON);
  for (const id of ["undo", "undoM"]) el(id).addEventListener("click", undo);
  for (const id of ["redo", "redoM"]) el(id).addEventListener("click", redo);
  for (const id of ["reset", "resetM"]) {
    el(id).addEventListener("click", () => { view.orbit.reset(); draw(); });
  }
  el("revertMech").addEventListener("click", () => {
    if (!isEdited(view.mech)) return;
    checkpoint();
    docs[view.mech] = emptyDoc();
    markDirty();
    syncKnobs();
    applyEdits();
  });

  // KNOBS. A slider fires `input` continuously and `change` on release, and
  // the two are wired differently on purpose: the checkpoint is taken once,
  // on the FIRST input of a drag, so undoing a drag returns to before it
  // rather than stepping back through every intermediate value.
  const knobs = el("knobs");
  let dragging = null;
  knobs.addEventListener("input", (e) => {
    const key = e.target.dataset?.knob;
    if (!key) return;
    if (dragging !== key) { checkpoint(); dragging = key; }
    setKnob(key, Number(e.target.value));
    // The slow knobs re-cluster the texture, so they wait for the drag to
    // settle; the fast ones repaint from the cached assignment and can keep up.
    applyEdits(isReplan(key) ? 260 : 40);
  });
  knobs.addEventListener("change", (e) => {
    if (e.target.dataset?.knob) dragging = null;
  });
  knobs.addEventListener("click", (e) => {
    const key = e.target.closest("[data-reset]")?.dataset.reset;
    if (!key || docFor(view.mech).knobs[key] === undefined) return;
    checkpoint();
    delete docFor(view.mech).knobs[key];
    markDirty();
    syncKnobs();
    applyEdits();
  });

  // SWATCHES. Same drag rule: one checkpoint per picker session.
  const palette = el("palette");
  let picking = null;
  palette.addEventListener("input", (e) => {
    const dot = e.target.closest(".swatch-dot");
    if (!dot) return;
    const id = `${dot.dataset.tex}#${dot.dataset.group}`;
    if (picking !== id) { checkpoint(); picking = id; }
    const rgb = unhex(dot.value);
    if (!rgb) return;
    setSwatch(dot.dataset.tex, Number(dot.dataset.group), rgb);
    applyEdits(40);
  });
  palette.addEventListener("change", () => { picking = null; });
  palette.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-revert]");
    if (!btn) return;
    const tex = btn.dataset.revert;
    const g = Number(btn.dataset.group);
    const pinned = docFor(view.mech).palette[tex];
    if (!pinned || pinned[g] == null) return;
    checkpoint();
    delete pinned[g];
    markDirty();
    applyEdits();
  });

  // The one thing this tool can lose that cannot be recovered.
  window.addEventListener("beforeunload", (e) => {
    if (!view.dirty) return;
    e.preventDefault();
    e.returnValue = "";
  });
}

function setKnob(key, value) {
  docFor(view.mech).knobs[key] = value;
  markDirty();
  const out = el(`o-${key}`);
  if (out) out.textContent = fmt(value);
  const row = el(`knob-${key}`);
  row?.classList.add("is-set");
  const reset = row?.querySelector(".knob-reset");
  if (reset) reset.disabled = false;
  syncHistoryButtons();
}

function setSwatch(texName, group, rgb) {
  const doc = docFor(view.mech);
  (doc.palette[texName] ||= {})[group] = rgb;
  markDirty();
  syncHistoryButtons();
}

function onKey(e) {
  // Not while a text field or a colour picker has the caret: Ctrl+Z there is
  // the field's own undo and stealing it is worse than not having a shortcut.
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" && document.activeElement.type !== "range") return;
  const mod = e.ctrlKey || e.metaKey;
  if (!mod || e.key.toLowerCase() !== "z") return;
  e.preventDefault();
  if (e.shiftKey) redo(); else undo();
}
