// THE EFFECT WORKBENCH — every shared drawing in the game, beside the mech that
// throws it, in the pose it throws it from, at the size the game paints it.
//
// WHAT THIS ANSWERS
//
// Sizing an effect is a question about a RATIO: how big is this next to the
// machine that fires it, and does it leave from the right place. You cannot
// answer either from the plate, because the plate is 500px of picture with no
// scale, and you cannot answer them from the number, because "84 game pixels"
// means nothing without a mech beside it. So the viewer renders the mech — the
// real rig, in the real state the move plays — and draws the art against it at
// the height the kit declares, from the point the handler actually spawns it.
//
// THE LAYOUT, and why it changed. This used to be a wall of sixty cards, each
// with its own canvas and its own four sliders. Sixty small mechs is sixty
// renders of a machine too small to judge, and the sliders were in the one
// place that guaranteed you were looking at a thumbnail while you dragged them.
// So: ONE big viewer on the left showing the SELECTED drawing, and on the right
// a scrollable grid of every drawing with the parameters of whichever is
// selected in a single panel UNDERNEATH it. The grid is still every drawing at
// once with no filters — the question is nearly always "do these belong to the
// same game", and a filter is a way of not answering it.
//
// PREVIEW plays the thing. A still cannot tell you whether a shot leaves the
// muzzle or the knee, so the Preview lightbox runs the mech's launch clip and
// spawns the drawing at the moment and the point the game does, then flies it
// on the move's own numbers. Where the real handler cannot be driven headlessly
// the preview says so, on screen, rather than quietly showing something else.
//
// WHAT IT WRITES
//
// Nothing, anywhere. There is no localStorage, no IndexedDB and no write path
// to the repo: edits live in memory for the session. "Export JSON" downloads a
// complete snapshot of every drawing's parameters — a file to hand back, not a
// patch to reconcile — and until it is downloaded the bar says there are
// unexported changes, because with nothing persisted a reload loses them.

import {
  getImage, loadSharedImage, sharedSpriteKeys, forgetSharedMirror,
} from "../src/assets.js";
import {
  sharedSpriteInfo, sharedAdjust, sharedHit, sharedAttack, sharedScale,
  clearSharedRegistry,
} from "../src/shared_sprites.js";
import { EFFECT_PLACEMENT } from "../src/config_effects.js";
import { muzzlePoint } from "../src/body_points.js";
import { STATES, clipNameFor } from "../render3d/src/states.js";
import { firingUse, referenceMech, LAUNCH_TIME } from "./usage.js";
import {
  bootRenderer, drawMech, drawGhost, mechHeightPx, mechFrameBox, ensureRig,
  rigReady, whenRigReady, resolution, inGameCameraDeg,
} from "./rig_view.js";

// ---------------------------------------------------------------- the store
//
// The edits live in one object, seeded from the config file, and every read in
// this tool goes through the game's own accessors — `sharedAdjust`,
// `sharedHit`, `sharedAttack`. That is deliberate: a workbench with its own
// idea of what a number means is a workbench that lies, and the way to stop it
// having one is to make the game's resolution the only resolution.
//
// The bridge is `spriteManifest.otherSprites`, which those accessors consult
// first (see shared_sprites.entryOf). It has exactly one live user — this file
// — and it earns its keep: an unsaved edit has to win over the saved value it
// is replacing, on the very next frame, in the game's own code path rather than
// in a copy of it.

const store = {};

async function initStore() {
  for (const [key, entry] of Object.entries(EFFECT_PLACEMENT)) {
    store[key] = structuredClone(entry);
  }
  const assets = await import("../src/assets.js");
  assets.__setSpriteManifest({ otherSprites: store });
}

const entry = (key) => (store[key] ||= {});

/** Has this drawing been given anything? An entry of all-defaults is not a
 *  decision anybody made. */
function isSet(key) {
  return Object.keys(store[key] || {}).length > 0;
}

/** Write a field, dropping it when it goes back to its default so the snapshot
 *  stays a list of decisions rather than of everything. */
function setField(key, field, value, dflt) {
  const e = entry(key);
  if (value === dflt || value === null || value === undefined) delete e[field];
  else e[field] = value;
  if (field === "faceLeft") forgetSharedMirror(key);
  clearSharedRegistry();
  markDirty();
  refreshTile(key);
  draw();
}

// ------------------------------------------------------------------ the list

/** Every drawing worth a tile, grouped so the grid reads in a useful order: kit
 *  art first and by mech (a mech's gun, special and ultimate should look like
 *  they came out of the same machine), then the hazards by board, then the
 *  shared feedback, which belongs to everyone. */
function buildList() {
  const keys = sharedSpriteKeys().filter((k) => k.startsWith("effect:") || k.startsWith("stagefx:"));
  const cards = keys.map((key) => ({ key, info: sharedSpriteInfo(key), use: firingUse(key) }));
  const rank = (c) => (c.use ? 0 : c.key.startsWith("stagefx:") ? 1 : 2);
  return cards.sort((a, b) => rank(a) - rank(b)
    || (a.use?.charName || a.info?.board || "").localeCompare(b.use?.charName || b.info?.board || "")
    || a.key.localeCompare(b.key));
}

// ------------------------------------------------------------------ the scene
//
// Everything the viewer draws — the mech, the drawing, the hit shape, the launch
// cross — is positioned in the GAME's coordinates and the whole scene is then
// scaled to fit the canvas. That is the one rule the viewer must never break:
// scale the art and the mech by different numbers and the answer on screen is
// not the answer in the game.

const MECH_GX = 150;   // where the mech stands, game px from the scene's left
const GROUND_GY = 0;   // the scene's origin IS the floor; up is negative

let cards = [];
let byKey = new Map();
let selected = null;
let showHit = true;
let showLaunch = true;
let zoom = 1;
let poseMode = "launch";

const el = (id) => document.getElementById(id);

/** The mech to stand beside a drawing, and the pose to freeze them in. Art no
 *  kit throws gets the roster MEDIAN by height, dimmed — a ruler wants to be
 *  typical, and the tallest mech in the game would make every hazard look
 *  small. */
function referenceFor(card) {
  const ruler = !card.use;
  const charKey = card.use ? card.use.charKey : referenceMech();
  if (poseMode === "launch" && card.use) {
    return { charKey, anim: card.use.anim, t: LAUNCH_TIME, ruler };
  }
  return { charKey, anim: "idle", t: 0.4, ruler };
}

/** Where the drawing sits, in game pixels relative to the mech's feet, before
 *  its own nudge. Three cases, the three the registry already distinguishes:
 *  a declared LAUNCH point (anything a kit throws), a GROUND drawing anchored
 *  at the feet, and everything else at chest height ahead of them. */
function placement(card) {
  const { info } = card;
  const anchor = info?.anchor || "centre";
  if (info?.launch) {
    return { x: MECH_GX + info.launch.forward, y: GROUND_GY + info.launch.y, anchor };
  }
  if (anchor === "feet") return { x: MECH_GX + 220, y: GROUND_GY, anchor };
  if (anchor === "top") return { x: MECH_GX + 220, y: GROUND_GY - 240, anchor };
  return { x: MECH_GX + 220, y: GROUND_GY - 90, anchor };
}

/** The height the drawing is painted at, in game pixels, size included. Art the
 *  spawn site sizes per instance has no declared height — its own plate stands
 *  in for one, which keeps Size honest about being a ratio. */
function paintedHeight(card) {
  const img = getImage(card.key);
  const adj = sharedAdjust(card.key);
  const declared = card.info?.h;
  return (Number.isFinite(declared) ? declared : (img ? img.height * 0.5 : 120)) * adj.scale;
}

/** The drawing's rectangle in game space: where it is, how big, which way up. */
function artRect(card) {
  const img = getImage(card.key);
  if (!img) return null;
  const adj = sharedAdjust(card.key);
  const at = placement(card);
  const h = paintedHeight(card);
  const w = img.width * h / img.height;
  const x = at.x + adj.dx;
  const y = at.y + adj.dy;
  const top = at.anchor === "feet" ? y - h : at.anchor === "top" ? y : y - h / 2;
  return { img, adj, at, x, y, w, h, top };
}

// ------------------------------------------------------------- the left viewer

let canvas = null;
let view = null;      // the transform the last paint used, for the drag
let raf = 0;

function draw() {
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = 0; paint(); });
}

function sizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(320, Math.floor(rect.width));
  const h = Math.max(260, Math.floor(rect.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  }
  return { w, h, dpr };
}

function paint() {
  if (!canvas) return;
  const { w, h, dpr } = sizeCanvas();
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const card = selected;
  if (!card) return;

  const art = artRect(card);
  const refKey = card.use ? card.use.charKey : referenceMech();
  // The scene's bounds in game space. The mech's WHOLE RENDERED BOX is always
  // inside them (mechFrameBox says why that is bigger than its height), so a
  // wide brace or a lunge is never cropped at the hips.
  const box = mechFrameBox(refKey);
  let minX = MECH_GX - box.halfW, maxX = MECH_GX + box.halfW;
  let minY = -box.above, maxY = box.below;
  if (art) {
    minX = Math.min(minX, art.x - art.w / 2);
    maxX = Math.max(maxX, art.x + art.w / 2);
    minY = Math.min(minY, art.top);
    maxY = Math.max(maxY, art.top + art.h);
  }
  const padX = 36, padY = 26;
  const fit = Math.min((w - padX * 2) / Math.max(1, maxX - minX),
                       (h - padY * 2) / Math.max(1, maxY - minY));
  const z = fit * zoom;
  const originX = (w - (maxX - minX) * z) / 2 - minX * z;
  const originY = (h - (maxY - minY) * z) / 2 - minY * z;
  view = { z, originX, originY, dpr };

  ctx.setTransform(z * dpr, 0, 0, z * dpr, originX * dpr, originY * dpr);

  // The floor, across the whole viewer so it reads as ground rather than as a
  // bar under the subject.
  ctx.save();
  ctx.strokeStyle = "rgba(120, 200, 255, 0.22)";
  ctx.lineWidth = 1 / z;
  ctx.beginPath();
  ctx.moveTo(-originX / z, GROUND_GY);
  ctx.lineTo((w - originX) / z, GROUND_GY);
  ctx.stroke();
  ctx.restore();

  const ref = referenceFor(card);
  const alpha = ref.ruler ? 0.5 : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  const drew = drawMech(ctx, ref.charKey, ref.anim, ref.t, MECH_GX, GROUND_GY, { facing: 1, alpha });
  ctx.restore();
  if (!drew) drawGhost(ctx, ref.charKey, MECH_GX, GROUND_GY, 1 / z);

  if (art) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(art.x, art.top + art.h / 2);
    if (art.adj.rot) ctx.rotate(art.adj.rot);
    // Drawn AS FIRED: `getImage` has already applied the Mirror flag. Showing
    // the raw plate while the game shows the flip is exactly how a drawing that
    // already points the right way gets "corrected" into flying backwards.
    ctx.drawImage(art.img, -art.w / 2, -art.h / 2, art.w, art.h);
    ctx.restore();
    if (showLaunch) drawLaunchPoint(ctx, art.at, card, z);
    if (showHit) drawHitShape(ctx, card, art, z);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!art) {
    ctx.save();
    ctx.fillStyle = "rgba(180, 200, 230, 0.55)";
    ctx.font = "500 13px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("loading the plate…", w / 2, h / 2);
    ctx.restore();
  }
}

/** The point the move actually launches from — the thing the drawing has to be
 *  aligned TO, and the one thing no amount of looking at the plate reveals. */
function drawLaunchPoint(ctx, at, card, z) {
  if (!card.info?.launch) return;
  ctx.save();
  ctx.strokeStyle = "rgba(120, 255, 190, 0.9)";
  ctx.lineWidth = 1.5 / z;
  const r = 10 / z;
  ctx.beginPath();
  ctx.moveTo(at.x - r, at.y); ctx.lineTo(at.x + r, at.y);
  ctx.moveTo(at.x, at.y - r); ctx.lineTo(at.x, at.y + r);
  ctx.stroke();
  ctx.restore();
}

/** The shape the move COLLIDES on, drawn about the spawn point and corrected by
 *  the drawing's own `hit` offset. Nothing here changes play: every number is
 *  one the kit already declares. It is drawn so the art can be matched to it. */
function drawHitShape(ctx, card, art, z) {
  const hit = card.info?.hit;
  if (!hit) {
    if (card.info?.anchor === "feet" && card.use) drawAttackBox(ctx, card, art, z);
    return;
  }
  const adj = sharedHit(card.key);
  const at = placement(card);
  const cx = at.x + adj.dx;
  const cy = at.y + adj.dy;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 120, 120, 0.85)";
  ctx.fillStyle = "rgba(255, 90, 90, 0.10)";
  ctx.lineWidth = 1.5 / z;
  ctx.setLineDash([5 / z, 4 / z]);
  if (hit.shape === "circle") {
    ctx.beginPath();
    ctx.arc(cx, cy, hit.r * adj.scale, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  } else {
    const bw = hit.w * adj.scale;
    const bh = hit.h * adj.scale;
    // A melee box is measured from the FIGHTER, not from the drawing.
    const bx = hit.melee ? MECH_GX + hit.melee.forward - bw / 2 : cx - bw / 2;
    const by = hit.melee ? GROUND_GY + hit.melee.y - bh / 2 : cy - bh;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);
  }
  ctx.restore();
}

/** The part of a body-shaped drawing that actually hits, as fractions of the
 *  drawing — so it travels with the art when it is resized or redrawn. */
function drawAttackBox(ctx, card, art, z) {
  const box = sharedAttack(card.key) || { x: 0.28, y: 0.52, w: 0.44, h: 0.76 };
  const cx = art.x + box.x * art.w;
  const cy = art.top + art.h - box.y * art.h;
  const bw = box.w * art.w, bh = box.h * art.h;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 190, 90, 0.85)";
  ctx.fillStyle = "rgba(255, 190, 90, 0.10)";
  ctx.lineWidth = 1.5 / z;
  ctx.setLineDash([4 / z, 3 / z]);
  ctx.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
  ctx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);
  ctx.restore();
}

/** Drag the drawing on the viewer, wheel to size it. The gesture is in CSS
 *  pixels and the stored number is in game pixels, so it is divided by the
 *  scale the paint used — otherwise a nudge made zoomed in is not the nudge it
 *  looked like. */
function attachViewerInput() {
  let from = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (!selected || selected.info?.nudge === false) return;
    canvas.setPointerCapture(e.pointerId);
    from = { x: e.clientX, y: e.clientY,
             dx: store[selected.key]?.dx ?? 0, dy: store[selected.key]?.dy ?? 0 };
    canvas.classList.add("is-dragging");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!from || !selected) return;
    const z = view?.z || 1;
    setField(selected.key, "dx", Math.round(from.dx + (e.clientX - from.x) / z), 0);
    setField(selected.key, "dy", Math.round(from.dy + (e.clientY - from.y) / z), 0);
    syncParams();
  });
  const end = () => { from = null; canvas.classList.remove("is-dragging"); };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("wheel", (e) => {
    if (!selected || selected.info?.sizable === false) return;
    e.preventDefault();
    const cur = store[selected.key]?.renderScale ?? 1;
    const next = Math.min(3, Math.max(0.15, cur * (e.deltaY < 0 ? 1.06 : 1 / 1.06)));
    setField(selected.key, "renderScale", Math.round(next * 100) / 100, 1);
    syncParams();
  }, { passive: false });
}

// ------------------------------------------------------------------- the grid

function tileId(key) { return `tile-${key.replace(/[:]/g, "-")}`; }

function buildTile(card) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "tile";
  b.id = tileId(card.key);
  b.dataset.key = card.key;
  const thumb = document.createElement("span");
  thumb.className = "tile-thumb";
  const name = document.createElement("span");
  name.className = "tile-name";
  name.textContent = card.key.split(":").pop().replace(/_/g, " ");
  const who = document.createElement("span");
  who.className = "tile-who";
  who.textContent = card.key.startsWith("stagefx:") ? "hazard"
    : card.use ? card.use.charName : "shared";
  const dot = document.createElement("i");
  dot.className = "dot";
  dot.title = "edited this session — in the exported snapshot";
  b.append(thumb, name, who, dot);
  b.addEventListener("click", () => select(card.key));
  return b;
}

/** The tile's thumbnail, once the plate has loaded, and its edited dot. */
function refreshTile(key) {
  const b = el(tileId(key));
  if (!b) return;
  b.classList.toggle("is-dirty", isSet(key));
  const img = getImage(key);
  const thumb = b.querySelector(".tile-thumb");
  if (img && thumb && !thumb.dataset.filled) {
    thumb.dataset.filled = "1";
    const c = document.createElement("canvas");
    c.width = 72; c.height = 54;
    const g = c.getContext("2d");
    const s = Math.min(72 / img.width, 54 / img.height);
    g.drawImage(img, (72 - img.width * s) / 2, (54 - img.height * s) / 2,
                img.width * s, img.height * s);
    thumb.style.backgroundImage = `url(${c.toDataURL()})`;
  }
}

// ---------------------------------------------------------------- the params
//
// One panel, under the grid, editing whichever drawing is selected. It used to
// be four sliders per card, which put the controls next to a thumbnail too
// small to judge what they were doing.

const num = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toString();

const PARAM_ROWS = [
  { field: "renderScale", label: "Size", min: 0.15, max: 3, step: 0.01, dflt: 1 },
  { field: "dx", label: "X", min: -240, max: 240, step: 1, dflt: 0 },
  { field: "dy", label: "Y", min: -240, max: 240, step: 1, dflt: 0 },
  { field: "rotationDeg", label: "Rotate", min: -180, max: 180, step: 1, dflt: 0 },
];

function buildParams() {
  const host = el("params");
  host.textContent = "";
  const card = selected;
  if (!card) {
    host.innerHTML = `<p class="muted">Pick a drawing from the grid above.</p>`;
    return;
  }
  const head = document.createElement("div");
  head.className = "params-head";
  head.innerHTML = `<h2>${card.key.split(":").pop().replace(/_/g, " ")}</h2>
                    <code>${card.key}</code>`;
  host.append(head);

  host.append(factsList(card));

  const sizable = card.info?.sizable !== false;
  const placeable = card.info?.nudge !== false;
  const inert = placeable ? null
    : `stored but INERT — ${card.info.nudgeSite} paints this drawing itself and never reads the nudge`;

  const ctrls = document.createElement("div");
  ctrls.className = "ctrls";
  for (const row of PARAM_ROWS) {
    const disabled = row.field === "renderScale" ? !sizable : !placeable;
    const wrap = document.createElement("label");
    wrap.className = "ctrl" + (disabled ? " is-off" : "");
    wrap.dataset.field = row.field;
    wrap.title = disabled
      ? (row.field === "renderScale"
        ? "the spawn site fixes this height; the slider cannot move it" : inert || "")
      : "";
    const name = document.createElement("span");
    name.className = "ctrl-name";
    name.textContent = row.label;
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = row.min; slider.max = row.max; slider.step = row.step;
    slider.value = store[card.key]?.[row.field] ?? row.dflt;
    slider.disabled = disabled;
    const out = document.createElement("output");
    out.textContent = num(Number(slider.value));
    slider.addEventListener("input", () => {
      const v = Number(slider.value);
      out.textContent = num(v);
      setField(card.key, row.field, v, row.dflt);
      wrap.classList.toggle("is-set", v !== row.dflt);
    });
    // Double-click to put it back — the fastest way to ask "was that better?"
    // and the reason an edit is stored as a decision rather than as a value
    // that happens to equal the default.
    wrap.addEventListener("dblclick", () => {
      slider.value = row.dflt;
      slider.dispatchEvent(new Event("input"));
    });
    wrap.classList.toggle("is-set", Number(slider.value) !== row.dflt);
    wrap.append(name, slider, out);
    ctrls.append(wrap);
  }

  const flip = document.createElement("label");
  flip.className = "ctrl ctrl--check";
  flip.title = "Everything that travels is drawn pointing LEFT and mirrored when it flies right. Tick this for a plate that arrived pointing the other way.";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = !!store[card.key]?.faceLeft;
  box.addEventListener("change", () => {
    setField(card.key, "faceLeft", box.checked || null, null);
    flip.classList.toggle("is-set", box.checked);
  });
  flip.classList.toggle("is-set", box.checked);
  const flipName = document.createElement("span");
  flipName.className = "ctrl-name";
  flipName.textContent = "Mirror";
  flip.append(flipName, box);
  ctrls.append(flip);
  host.append(ctrls);
}

function factsList(card) {
  const facts = document.createElement("dl");
  facts.className = "facts";
  facts.id = "facts";
  for (const [k, v] of factLines(card)) {
    const dt = document.createElement("dt"); dt.textContent = k;
    const dd = document.createElement("dd"); dd.textContent = v;
    if (k.startsWith("⚠")) dd.className = "warn";
    facts.append(dt, dd);
  }
  return facts;
}

/** Redraw only the facts, not the controls.
 *
 *  The launch-pose line is `resolveClip`'s answer, and resolveClip cannot
 *  answer for a rig that has not landed — so the first paint after a selection
 *  would report "NOTHING" for a state that resolves perfectly well two seconds
 *  later. Rebuilding the whole panel would yank the sliders out from under a
 *  drag, so only the facts are replaced. */
function refreshFacts() {
  const old = el("facts");
  if (old && selected) old.replaceWith(factsList(selected));
}

/** Put the sliders back in step with a value changed on the canvas. */
function syncParams() {
  if (!selected) return;
  for (const row of PARAM_ROWS) {
    const wrap = el("params")?.querySelector(`.ctrl[data-field="${row.field}"]`);
    if (!wrap) continue;
    const v = store[selected.key]?.[row.field] ?? row.dflt;
    wrap.querySelector("input").value = v;
    wrap.querySelector("output").textContent = num(v);
    wrap.classList.toggle("is-set", v !== row.dflt);
  }
}

/** What this drawing is, in the fewest words that are still true. Every line is
 *  read off the registry rather than written here. */
function factLines(card) {
  const { info, use } = card;
  const img = getImage(card.key);
  const out = [];
  if (use) out.push(["thrown by", `${use.charName} — ${use.move} (${use.slotLabel})`]);
  else if (info?.board) out.push(["hazard", `the ${info.board} board`]);
  else out.push(["belongs to", info?.owner || "shared feedback — anyone, any match"]);
  if (use) {
    const r = resolution(use.charKey, use.anim);
    out.push(["launch pose", `${use.anim} → ${r.ok ? r.source : "NOTHING — this state has no clip"}`]);
  }
  out.push(["painted at", Number.isFinite(info?.h)
    ? `${Math.round(info.h)}px tall · ${info.what}`
    : info?.what || "sized by the code that spawns it"]);
  out.push(["anchor", info?.anchor === "feet" ? "stands ON the spawn point"
    : info?.anchor === "top" ? "hangs FROM the spawn point"
    : "painted AROUND the spawn point"]);
  if (info?.launch) {
    out.push(["leaves at", `${Math.round(info.launch.forward)}px forward, ${Math.round(-info.launch.y)}px up`]);
  }
  if (info?.hit) {
    out.push(["collides on", info.hit.shape === "circle"
      ? `a circle of r=${info.hit.r} (${info.hit.from})`
      : `${info.hit.w}×${info.hit.h} (${info.hit.from})`]);
  }
  if (info && info.nudge === false) {
    out.push(["⚠ nudge", `stored but INERT — ${info.nudgeSite} paints this itself, so Size reaches the screen and X/Y/Rotate do not`]);
  }
  if (info?.pending) {
    out.push(["⚠ not hung yet", "the plate is loaded and placeable; its hazard still paints itself"]);
  }
  if (img) out.push(["plate", `${img.width}×${img.height}`]);
  return out;
}

// ---------------------------------------------------------------- selection

function select(key) {
  const card = byKey.get(key);
  if (!card) return;
  selected = card;
  for (const b of document.querySelectorAll(".tile")) {
    b.classList.toggle("is-selected", b.dataset.key === key);
  }
  el(tileId(key))?.scrollIntoView({ block: "nearest" });
  const ref = referenceFor(card);
  ensureRig(ref.charKey);
  loadSharedImage(key).then(() => { refreshTile(key); buildParams(); draw(); });
  // A rig is 8-46 MB and lands whenever it lands, with no event to hang off —
  // and until it does, resolveClip cannot answer, so the launch-pose fact would
  // read "NOTHING" for a state that is fine. Waiting on the rig itself rather
  // than on a guess at how long it takes is what keeps the panel honest on a
  // slow load; the short timers are for the pose cache warming behind it.
  whenRigReady(ref.charKey).then(() => {
    if (selected?.key === key) { refreshFacts(); draw(); }
  });
  for (const ms of [400, 1200, 2600, 5000]) {
    setTimeout(() => { if (selected?.key === key) { refreshFacts(); draw(); } }, ms);
  }
  buildParams();
  draw();
  const url = new URL(location.href);
  url.searchParams.set("fx", key);
  history.replaceState(null, "", url);
  el("previewBtn").disabled = false;
}

// ------------------------------------------------------------------- preview
//
// HOW THE PREVIEW IS DRIVEN, and where it stops being the game.
//
// FAITHFUL: the mech's clip is the game's — the launch state for the slot
// (specials.js slotAnim), played on the state table's own duration, through the
// same currentFrame/drawCharFrame pair a match uses, so the presentation pin
// and the facing yaw are the real ones. The spawn POINT is combat.js's:
// `muzzlePoint(charKey, height, p.ox ?? 70, p.oy ?? -86)` — the verified muzzle
// where one exists, the height-scaled default where it does not. The flight is
// the projectile integrator's: vx = p.speed, vy accumulating p.gravity, life
// p.dur, one shot per `count` fanned by `p.spread`, and the art oriented and
// mirrored exactly as render.js drawProjectiles does it.
//
// APPROXIMATED, and said so on screen:
//   * the spawn INSTANT. The projectile handler spawns on the first frame of
//     the action; handlers with their own `delay` are honoured, and anything
//     else is treated as spawning at the start of the clip.
//   * homing, steering, piercing, explosions, and every hit reaction. There is
//     no opponent in the lightbox, so a seeker flies straight.
//   * anything a handler paints ITSELF (a burst, a trap, an install body): the
//     drawing is held at its spawn point for the move's duration rather than
//     animated, because the real motion lives in a handler that needs a live
//     match to run.

const preview = {
  open: false, playing: false, t: 0, raf: 0, last: 0, card: null, plan: null,
};

/** The move types whose drawing is carried across the stage by render.js's
 *  projectile list (shared_sprites DRAW_SITES marks them `travels`). Only these
 *  can be integrated here, and only when the kit declares the `speed` to
 *  integrate with. */
const TRAVELLERS = ["projectile", "wave", "beam", "cannonade", "birdstrike", "deathSwarm"];

/** The flight the preview will integrate, plus what it had to approximate. */
function launchPlan(card) {
  const use = card.use;
  if (!use) return null;
  const p = use.p || {};
  const anim = use.anim;
  const clipDur = STATES[clipNameFor(anim)]?.duration ?? 0.5;
  const notes = [];
  const flies = TRAVELLERS.includes(use.type) && Number.isFinite(p.speed);
  // combat.js spawnProjectileScaled: the verified muzzle if this mech has one,
  // else the reference offsets scaled by the body's height.
  const m = muzzlePoint(use.charKey, mechHeightPx(use.charKey), p.ox ?? 70, p.oy ?? -86);
  const origin = flies || card.info?.launch == null
    ? { x: m.x, y: m.y }
    : { x: card.info.launch.forward, y: card.info.launch.y };
  const spawnT = Number.isFinite(p.delay) ? p.delay : 0;
  if (!Number.isFinite(p.delay)) {
    notes.push("spawn instant approximated: the handler fires on the action's first frame, so the drawing appears at clip t=0");
  }
  const count = Math.max(1, p.count || 1);
  const shots = [];
  for (let i = 0; i < count; i++) {
    const spreadVy = count > 1 ? (i - (count - 1) / 2) * (p.spread || 100) : 0;
    // The wave handler overrides ox itself, one wave per 54px.
    const ox = use.type === "wave" ? 60 + i * 54 : origin.x;
    shots.push({ x0: ox, y0: origin.y, vx: p.speed ?? 0, vy: (p.vy || 0) + spreadVy });
  }
  if (p.homing) notes.push(`homing ${p.homing} ignored — there is no opponent in the lightbox, so the seekers fly straight`);
  if (p.explode) notes.push(`the ${p.explode}px detonation is not played — nothing here is hit`);
  if (!flies) {
    // Two different reasons a drawing does not move here, and they are not the
    // same fact: a `beam` or a `cannonade` really does travel, but its speed is
    // worked out by the ultimate's own handler rather than declared in the kit,
    // so there is nothing on the move to integrate. Everything else is painted
    // by a handler that needs a live match to run at all.
    notes.push(TRAVELLERS.includes(use.type)
      ? `the kit declares no \`speed\` for this ${use.type} — its handler works the flight out itself, so there is nothing here to integrate and the drawing is HELD at its spawn point`
      : `${use.type || "this move"} is painted by its own handler, which needs a live match — the drawing is HELD at its spawn point instead of animated`);
  }
  if (card.info?.nudge === false) {
    notes.push(`X/Y/Rotate are inert for this drawing (${card.info.nudgeSite}); only Size reaches the game`);
  }
  return {
    anim, clipDur, spawnT, flies, shots,
    gravity: p.gravity || 0,
    life: flies ? (p.dur ?? 0.9) : 0.6,
    color: p.color || "#8fd3ff",
    r: p.r ?? 30,
    spriteH: p.spriteH || (p.r ?? 30) * 3,
    total: Math.max(clipDur, spawnT + (flies ? (p.dur ?? 0.9) : 0.6)) + 0.25,
    notes,
  };
}

function openPreview() {
  if (!selected) return;
  preview.card = selected;
  preview.plan = launchPlan(selected);
  preview.t = 0;
  preview.playing = true;
  preview.open = true;
  preview.last = performance.now();
  el("lightbox").hidden = false;
  const plan = preview.plan;
  el("pvTitle").textContent = selected.key.split(":").pop().replace(/_/g, " ");
  // The scrub spans the whole launch — clip plus flight — so scrubbing lands
  // on the moment being judged rather than on a fraction of it.
  el("pvScrub").max = String((plan?.total ?? 1.2).toFixed(2));
  const notes = el("pvNotes");
  notes.textContent = "";
  if (!plan) {
    notes.innerHTML = `<p class="warn">No kit throws this drawing, so there is no launch to play — the mech beside it is a ruler only.</p>`;
  } else {
    const r = resolution(preview.card.use.charKey, plan.anim);
    const head = document.createElement("p");
    head.className = "pv-real";
    head.textContent = `Real: ${preview.card.use.charName} plays ${plan.anim} (${r.ok ? r.source : "NO CLIP — placeholder body"}) for ${plan.clipDur.toFixed(2)}s; the drawing spawns at the move's own muzzle point and flies on its kit numbers.`;
    notes.append(head);
    if (plan.notes.length) {
      const ul = document.createElement("ul");
      ul.className = "pv-approx";
      for (const n of plan.notes) {
        const li = document.createElement("li");
        li.textContent = n;
        ul.append(li);
      }
      const cap = document.createElement("p");
      cap.className = "warn";
      cap.textContent = "Approximated here:";
      notes.append(cap, ul);
    }
  }
  el("pvPlay").textContent = "Pause";
  stepPreview();
}

function closePreview() {
  preview.open = false;
  preview.playing = false;
  if (preview.raf) cancelAnimationFrame(preview.raf);
  preview.raf = 0;
  el("lightbox").hidden = true;
}

function stepPreview() {
  if (!preview.open) return;
  const now = performance.now();
  const dt = Math.min(0.05, (now - preview.last) / 1000);
  preview.last = now;
  if (preview.playing) {
    preview.t += dt;
    const total = preview.plan?.total ?? 1.2;
    if (preview.t > total) preview.t = 0;   // loop, so a launch can be watched twice
  }
  paintPreview();
  el("pvScrub").value = String(preview.t.toFixed(3));
  el("pvTime").textContent = `${preview.t.toFixed(2)}s`;
  preview.raf = requestAnimationFrame(stepPreview);
}

/** Everywhere the drawing gets to over the whole playback, in game pixels
 *  relative to the mech's feet — the drawing's own rectangle swept along each
 *  shot's path. Framing on this is what stops a huge effect from being blown up
 *  until the mech beside it is off screen, which would defeat the one comparison
 *  the tool exists to make. */
function previewSpan(card, plan) {
  const img = getImage(card.key);
  if (!plan || !img) return null;
  const hgt = plan.spriteH * sharedScale(card.key);
  const wid = img.width * hgt / img.height;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const shot of plan.shots) {
    // Start and end of the shot's life; a ballistic arc's extremes in y are at
    // one end or the other unless it peaks in between, so the apex is sampled
    // too rather than assumed away.
    const ts = [0, plan.life];
    if (plan.flies && plan.gravity) {
      const apex = -shot.vy / plan.gravity;
      if (apex > 0 && apex < plan.life) ts.push(apex);
    }
    for (const t of ts) {
      const x = shot.x0 + (plan.flies ? shot.vx * t : 0);
      const y = shot.y0 + (plan.flies ? shot.vy * t + 0.5 * plan.gravity * t * t : 0);
      minX = Math.min(minX, x - wid / 2); maxX = Math.max(maxX, x + wid / 2);
      minY = Math.min(minY, y - hgt / 2); maxY = Math.max(maxY, y + hgt / 2);
    }
  }
  return { minX, maxX, minY, maxY };
}

function paintPreview() {
  const c = el("pvCanvas");
  const card = preview.card;
  if (!c || !card) return;
  const rect = c.parentElement.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(480, Math.floor(rect.width));
  const h = Math.max(300, Math.floor(rect.height));
  if (c.width !== w * dpr || c.height !== h * dpr) {
    c.width = w * dpr; c.height = h * dpr;
    c.style.width = `${w}px`; c.style.height = `${h}px`;
  }
  const ctx = c.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const plan = preview.plan;
  const ref = referenceFor(card);
  const mechH = mechHeightPx(ref.charKey);
  const box = mechFrameBox(ref.charKey);
  const mechX = 120;
  // A FIXED stage for the whole playback, so the drawing MOVES across the frame
  // instead of the frame chasing it — the whole point is watching how far and
  // how fast it goes relative to the machine that fired it. The bounds are the
  // union of the mech's rendered box and everywhere the drawing gets to, so a
  // 300px tsunami is framed WITH the mech that raises it rather than over him.
  const span = previewSpan(card, plan);
  let minX = mechX - box.halfW, maxX = mechX + box.halfW;
  let minY = -box.above, maxY = box.below;
  if (span) {
    minX = Math.min(minX, mechX + span.minX);
    maxX = Math.max(maxX, mechX + span.maxX);
    minY = Math.min(minY, span.minY);
    maxY = Math.max(maxY, span.maxY);
  }
  // Travelling art gets a stage at least five body-heights wide even when the
  // shot dies sooner, so short-lived and long-lived shots are read at the same
  // scale.
  if (plan?.flies) maxX = Math.max(maxX, mechX + mechH * 4);
  const z = Math.min((w - 60) / Math.max(1, maxX - minX),
                     (h - 50) / Math.max(1, maxY - minY));
  const originX = (w - (maxX - minX) * z) / 2 - minX * z;
  const originY = (h - (maxY - minY) * z) / 2 - minY * z;
  ctx.setTransform(z * dpr, 0, 0, z * dpr, originX * dpr, originY * dpr);

  ctx.save();
  ctx.strokeStyle = "rgba(120, 200, 255, 0.2)";
  ctx.lineWidth = 1 / z;
  ctx.beginPath();
  ctx.moveTo(-originX / z, 0);
  ctx.lineTo((w - originX) / z, 0);
  ctx.stroke();
  ctx.restore();

  const anim = plan?.anim || "idle";
  const spec = STATES[clipNameFor(anim)];
  // A one-shot clamps just short of its end and holds, exactly as clipTime
  // does; a loop wraps.
  const at = spec?.loop ? preview.t % spec.duration
                        : Math.min(preview.t, (spec?.duration ?? 0.5) - 1e-4);
  const drew = drawMech(ctx, ref.charKey, anim, at, mechX, 0, { facing: 1 });
  if (!drew) drawGhost(ctx, ref.charKey, mechX, 0, 1 / z);

  if (!plan) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return; }

  const img = getImage(card.key);
  const age = preview.t - plan.spawnT;
  if (img && age >= 0 && age <= plan.life) {
    const hgt = plan.spriteH * sharedScale(card.key);
    const wid = img.width * hgt / img.height;
    const adj = sharedAdjust(card.key);
    for (const shot of plan.shots) {
      const px = mechX + shot.x0 + (plan.flies ? shot.vx * age : 0);
      const py = shot.y0 + (plan.flies ? shot.vy * age + 0.5 * plan.gravity * age * age : 0);
      const vy = plan.flies ? shot.vy + plan.gravity * age : 0;
      const vx = plan.flies ? shot.vx : 0;
      // render.js drawProjectiles, line for line: the art faces LEFT natively
      // and is mirrored when travelling right, so the nose already points along
      // vx and the rotation only adds the vertical component, measured in that
      // same mirrored frame.
      ctx.save();
      ctx.translate(px, py);
      const flip = vx > 0 ? -1 : 1;
      if (vy) ctx.rotate(Math.atan2(-flip * vy, -flip * vx));
      ctx.scale(flip, 1);
      if (adj.rot) ctx.rotate(adj.rot);
      ctx.shadowColor = plan.color;
      ctx.shadowBlur = 12;
      ctx.globalAlpha = plan.flies ? 1 : Math.max(0, 1 - age / plan.life);
      ctx.drawImage(img, -wid / 2 + adj.dx, -hgt / 2 + adj.dy, wid, hgt);
      ctx.restore();
      if (showHit && card.info?.hit?.shape === "circle") {
        ctx.save();
        ctx.strokeStyle = "rgba(255, 120, 120, 0.7)";
        ctx.lineWidth = 1.2 / z;
        ctx.setLineDash([5 / z, 4 / z]);
        ctx.beginPath();
        ctx.arc(px, py, card.info.hit.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
  // The muzzle cross stays put, so the drawing can be seen leaving it.
  ctx.save();
  ctx.strokeStyle = "rgba(120, 255, 190, 0.75)";
  ctx.lineWidth = 1.4 / z;
  const rr = 9 / z;
  const ox = mechX + plan.shots[0].x0, oy = plan.shots[0].y0;
  ctx.beginPath();
  ctx.moveTo(ox - rr, oy); ctx.lineTo(ox + rr, oy);
  ctx.moveTo(ox, oy - rr); ctx.lineTo(ox, oy + rr);
  ctx.stroke();
  ctx.restore();

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.save();
  ctx.fillStyle = "rgba(160, 180, 210, 0.75)";
  ctx.font = "500 11px Inter, system-ui, sans-serif";
  ctx.fillText(`${anim} @ ${at.toFixed(2)}s · camera ${inGameCameraDeg()}° (the game's own lens) · ${(z * 100).toFixed(0)}% of game scale`, 12, 18);
  ctx.restore();
}

// --------------------------------------------------------------- the export
//
// A DOWNLOAD, not a clipboard and not a save. Nothing in this tool persists:
// no localStorage, no server write. The file below is a COMPLETE snapshot —
// every drawing, whether or not it was touched — so whoever receives it can
// regenerate src/config_effects.js wholesale instead of reconciling a patch.

const EXPORT_SCHEMA = "mechbrawler.effect-placement";
const EXPORT_VERSION = 1;

function snapshot() {
  const effects = {};
  for (const card of cards) {
    const e = store[card.key] || {};
    effects[card.key] = {
      // `set` is the one thing a reader cannot derive: an entry equal to the
      // defaults and an entry nobody has touched export the same numbers, and
      // only the touched one belongs in EFFECT_PLACEMENT.
      set: isSet(card.key),
      renderScale: e.renderScale ?? 1,
      dx: e.dx ?? 0,
      dy: e.dy ?? 0,
      rotationDeg: e.rotationDeg ?? 0,
      faceLeft: !!e.faceLeft,
      hit: e.hit ?? null,
      attackBox: e.attackBox ?? null,
      meta: {
        thrownBy: card.use ? `${card.use.charName} — ${card.use.move} (${card.use.slotLabel})` : null,
        launchState: card.use?.anim ?? null,
        paintedAtPx: Number.isFinite(card.info?.h) ? card.info.h : null,
        anchor: card.info?.anchor ?? null,
        // A drawing whose spawn site paints itself ignores dx/dy/rotationDeg —
        // worth carrying so a reviewer of this file knows which numbers are
        // decorative before they wonder why nothing moved.
        nudgeReachesGame: card.info?.nudge !== false,
        sizeReachesGame: card.info?.sizable !== false,
      },
    };
  }
  return {
    schema: EXPORT_SCHEMA,
    version: EXPORT_VERSION,
    generatedBy: "Mech Brawler effect workbench (/workbench/) — nothing is persisted in the browser; this file is the only record of the session's edits.",
    generatedAt: new Date().toISOString(),
    applyTo: "src/config_effects.js — export const EFFECT_PLACEMENT",
    howToApply: "Complete snapshot of every shared drawing. Rebuild EFFECT_PLACEMENT from `effects`: emit an entry for each key whose `set` is true, carrying only the fields that differ from `defaults` (plus `hit`/`attackBox` when non-null). Keys with `set: false` are at their defaults and belong in no entry. `meta` is informational and must not be written into the config.",
    defaults: { renderScale: 1, dx: 0, dy: 0, rotationDeg: 0, faceLeft: false, hit: null, attackBox: null },
    counts: { effects: cards.length, edited: cards.filter((c) => isSet(c.key)).length },
    effects,
  };
}

function exportJSON() {
  const text = JSON.stringify(snapshot(), null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `mechbrawler-effects-config-${stamp}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  dirty = false;
  el("dirtyFlag").hidden = true;
  el("status").textContent = `exported ${a.download} — send it back to be committed`;
}

let dirty = false;
function markDirty() {
  dirty = true;
  el("dirtyFlag").hidden = false;
}

// ----------------------------------------------------------------- the shell

function shell() {
  return `
    <header class="bar">
      <div class="bar-title">
        <strong>Effect workbench</strong>
        <span id="count" class="muted">…</span>
        <a class="bar-link" href="?edit=pose">pose workbench →</a>
      </div>
      <div class="bar-tools">
        <label class="tool">Zoom
          <input id="zoom" type="range" min="0.4" max="2" step="0.05" value="1">
          <output id="zoomOut">1.00×</output>
        </label>
        <label class="tool tool--check"><input id="showHit" type="checkbox" checked> Hit shape</label>
        <label class="tool tool--check"><input id="showLaunch" type="checkbox" checked> Launch point</label>
        <label class="tool">Pose
          <select id="pose">
            <option value="launch" selected>The move's own pose</option>
            <option value="stance">Battle idle</option>
          </select>
        </label>
        <button id="previewBtn" type="button" class="primary" disabled>Preview ▶</button>
        <button id="exportBtn" type="button">Export JSON</button>
        <span id="dirtyFlag" class="flag" hidden title="Nothing is saved anywhere — reloading this page loses these edits.">unexported changes</span>
      </div>
      <p id="status" class="muted">booting…</p>
    </header>

    <main class="split">
      <section class="viewer">
        <div class="viewer-stage"><canvas id="viewCanvas"></canvas></div>
        <p class="viewer-note muted">
          The selected drawing, beside the mech that throws it, in that move's own
          animation state — rendered through the game's own camera
          (${inGameCameraDeg()}°). <strong>Drag</strong> to nudge the art,
          <strong>scroll</strong> to size it, <strong>double-click</strong> a
          control to put it back. The red shape is what the move collides on and
          the green cross is where it leaves the mech; neither is editable,
          because both are numbers the kit declares.
        </p>
      </section>

      <aside class="rail">
        <div id="grid" class="grid"></div>
        <section id="params" class="params"></section>
      </aside>
    </main>

    <div id="lightbox" class="lightbox" hidden>
      <div class="lb-panel">
        <header class="lb-bar">
          <strong id="pvTitle">Preview</strong>
          <button id="pvPlay" type="button">Pause</button>
          <input id="pvScrub" type="range" min="0" max="2" step="0.005" value="0">
          <output id="pvTime">0.00s</output>
          <button id="pvClose" type="button">Close ✕</button>
        </header>
        <div class="lb-stage"><canvas id="pvCanvas"></canvas></div>
        <div id="pvNotes" class="lb-notes"></div>
      </div>
    </div>`;
}

// ----------------------------------------------------------------------- boot

export async function boot(root) {
  root.innerHTML = shell();
  const status = el("status");
  status.textContent = "loading the renderer…";

  await initStore();
  await bootRenderer();

  cards = buildList();
  byKey = new Map(cards.map((c) => [c.key, c]));
  const grid = el("grid");
  for (const card of cards) grid.append(buildTile(card));
  el("count").textContent = `${cards.length} drawings`;

  canvas = el("viewCanvas");
  attachViewerInput();
  new ResizeObserver(() => draw()).observe(canvas.parentElement);

  // Every plate, fetched as the grid scrolls it into view — sixty plates is not
  // a page load.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const key = e.target.dataset.key;
      io.unobserve(e.target);
      loadSharedImage(key).then(() => {
        refreshTile(key);
        if (selected?.key === key) draw();
      });
    }
  }, { root: grid, rootMargin: "200px" });
  for (const b of grid.querySelectorAll(".tile")) io.observe(b);

  el("zoom").addEventListener("input", (e) => {
    zoom = Number(e.target.value);
    el("zoomOut").textContent = `${zoom.toFixed(2)}×`;
    draw();
  });
  el("showHit").addEventListener("change", (e) => { showHit = e.target.checked; draw(); });
  el("showLaunch").addEventListener("change", (e) => { showLaunch = e.target.checked; draw(); });
  el("pose").addEventListener("change", (e) => {
    poseMode = e.target.value;
    draw();
    for (const ms of [500, 1500]) setTimeout(draw, ms);
  });
  el("exportBtn").addEventListener("click", exportJSON);
  el("previewBtn").addEventListener("click", openPreview);
  el("pvClose").addEventListener("click", closePreview);
  el("pvPlay").addEventListener("click", () => {
    preview.playing = !preview.playing;
    el("pvPlay").textContent = preview.playing ? "Pause" : "Play";
  });
  el("pvScrub").addEventListener("input", (e) => {
    preview.playing = false;
    el("pvPlay").textContent = "Play";
    preview.t = Number(e.target.value);
    paintPreview();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && preview.open) closePreview();
  });
  // Nothing is persisted, so leaving with edits in memory loses them. Saying so
  // is the honest half of "no local save".
  window.addEventListener("beforeunload", (e) => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = "";
  });

  // Deep link: ?fx=<key> reopens on the same drawing.
  const wanted = new URLSearchParams(location.search).get("fx");
  select(byKey.has(wanted) ? wanted : cards[0]?.key);

  status.textContent = rigReady(cards[0]?.use?.charKey || referenceMech())
    ? "ready" : "ready — rigs load on demand, so a mech appears a moment after it is picked";
}
