// THE EFFECT WORKBENCH — every shared drawing in the game, beside the mech
// that throws it, at the size the game paints it.
//
// The JJK base's sprite workbench was a tool for placing CHARACTER art: two
// thousand poses, per-frame ground contact, approval queues, redraw flags. None
// of that survives the conversion, because mechs are rigged models and there is
// no pose to place. What survives is the half of that tool nobody built it for
// — its "Other Sprites" view, where the shared effect art was sized and nudged
// — and here that half is the whole thing.
//
// WHAT THIS ANSWERS
//
// Sizing an effect is a question about a RATIO: how big is this next to the
// machine that fires it. You cannot answer it from the plate, because the plate
// is 500px of picture with no scale, and you cannot answer it from the number,
// because "84 game pixels" means nothing without a mech beside it. So every
// card renders the mech — the real rig, in the real pose the move plays — and
// draws the art against it at the height the kit declares.
//
//   art a mech throws     that mech, in that move's own animation state,
//                         frozen at the moment of release, with the drawing at
//                         the point the move spawns it from
//   art nobody throws     a hazard, a status, the KO burst — the roster's
//                         median mech, standing idle, purely as a ruler
//
// ONE GRID, NO FILTERS. Every drawing is on screen at once, in one list. The
// old tool opened on a character picker and a filter bar, which is the right
// shape for two thousand poses across seventeen fighters and the wrong one for
// sixty effects: the question here is nearly always "do these look right
// together", and a filter is a way of not answering it.
//
// WHAT IT WRITES
//
// Nothing, directly. "Copy config" puts the whole EFFECT_PLACEMENT object on
// the clipboard, to be pasted into src/config_effects.js — the same shape that
// file already has. A workbench that wrote to disk would need a server route
// with a write path, and this one runs against a static file server.

import {
  getImage, loadSharedImage, sharedSpriteKeys, forgetSharedMirror,
} from "../src/assets.js";
import {
  sharedSpriteInfo, sharedAdjust, sharedHit, sharedAttack, clearSharedRegistry,
} from "../src/shared_sprites.js";
import { EFFECT_PLACEMENT } from "../src/config_effects.js";
import { initRenderBackend, preloadChar, currentFrame, drawCharFrame } from "../src/render_backend.js";
import { firingUse, referenceMech, LAUNCH_TIME } from "./usage.js";

// ---------------------------------------------------------------- the store
//
// The edits live in one object, seeded from the config file, and every read in
// this tool goes through the game's own accessors — `sharedAdjust`,
// `sharedHit`, `sharedAttack`. That is deliberate: a workbench with its own
// idea of what a number means is a workbench that lies, and the way to stop it
// having one is to make the game's resolution the only resolution.
//
// The bridge is `spriteManifest.otherSprites`, which those accessors consult
// first (see `entryOf`). It is a leftover of the character-manifest era with
// exactly one live user — this file — and it earns its keep: an unsaved edit
// has to win over the saved value it is replacing, on the very next frame, in
// the game's own code path rather than in a copy of it.

const store = {};
let manifestBridge = null;

/** Seed the store from the config file and hand it to the game's accessors. */
async function initStore() {
  for (const [key, entry] of Object.entries(EFFECT_PLACEMENT)) {
    store[key] = structuredClone(entry);
  }
  // `spriteManifest` is a module-level `let` exported by assets.js, so it
  // cannot be assigned from here. It is null in this game and the accessors
  // fall through to EFFECT_PLACEMENT — which is the config, not the store. So
  // the store IS the bridge: it is passed as `otherSprites` by patching the
  // one object the accessors read.
  const assets = await import("../src/assets.js");
  manifestBridge = { otherSprites: store };
  // assets.js keeps `spriteManifest` in a module binding it also exports; the
  // export is live, so writing through the module namespace is not possible in
  // strict ESM. The supported seam is `__setSpriteManifest`, added for exactly
  // this caller.
  assets.__setSpriteManifest(manifestBridge);
}

/** The stored entry for a drawing, created on demand. */
function entry(key) {
  store[key] ||= {};
  return store[key];
}

/** Has this drawing been given anything? Drives the dirty dot and the export —
 *  an entry of all-defaults is not a decision anybody made. */
function isSet(key) {
  const e = store[key];
  if (!e) return false;
  return Object.keys(e).length > 0;
}

/** Write a field, dropping it when it goes back to its default so the exported
 *  config stays a list of decisions rather than of everything. */
function setField(key, field, value, dflt) {
  const e = entry(key);
  if (value === dflt || value === null || value === undefined) delete e[field];
  else e[field] = value;
  if (field === "faceLeft") forgetSharedMirror(key);
  clearSharedRegistry();
  scheduleDraw(key);
  markDirty();
}

// ------------------------------------------------------------------ the list

/** Every drawing worth a card, grouped so the grid reads in a useful order.
 *
 *  Kit art first and by mech, because that is the comparison that matters most
 *  — a mech's gun, special and ultimate should look like they came out of the
 *  same machine. Then the hazards, by board. Then the shared feedback, which
 *  belongs to everyone. */
function buildList() {
  const keys = sharedSpriteKeys().filter((k) => k.startsWith("effect:") || k.startsWith("stagefx:"));
  const cards = [];
  for (const key of keys) {
    const info = sharedSpriteInfo(key);
    const use = firingUse(key);
    cards.push({ key, info, use });
  }
  const rank = (c) => (c.use ? 0 : c.key.startsWith("stagefx:") ? 1 : 2);
  return cards.sort((a, b) => rank(a) - rank(b)
    || (a.use?.charName || a.info?.board || "").localeCompare(b.use?.charName || b.info?.board || "")
    || a.key.localeCompare(b.key));
}

// ---------------------------------------------------------------- the canvas

// The card's canvas, in device pixels, and the scene inside it, in GAME pixels.
// The two are kept apart on purpose: everything this tool draws — the mech, the
// drawing, the hit shape, the launch cross — is positioned in the game's own
// coordinates and the whole scene is then scaled to fit the card. That is the
// one rule the viewer must never break, because sizing an effect is a question
// about a ratio: scale the art and the mech by different numbers and the answer
// on screen is not the answer in the game.
const CARD_W = 420;
const CARD_H = 300;

/** Where the mech stands, in game pixels from the left of the scene, and the
 *  floor they stand on. Left of centre so there is room in front of them for
 *  the thing they just fired. */
const MECH_GX = 110;
const GROUND_GY = 0;      // the scene's origin IS the floor; up is negative

/** A mech is about this tall in game pixels (config_tuning HEIGHT_BASE_PX), and
 *  the scene is never framed tighter than that — a card showing a 40px tracer
 *  should still show the whole machine that fired it, or the ratio it exists to
 *  demonstrate is off the top of the frame. */
const MECH_H = 149;

/** The zoom the grid asks for. A card draws at this or at whatever smaller
 *  number makes its contents fit, whichever is less — see `viewOf`. */
let zoom = 1;
let showHit = true;
let showLaunch = true;

/** Which pose to stand the mech in.
 *
 *  "launch" is what this tool is for: the mech in the animation state the move
 *  actually plays, frozen at release. It is NOT the default yet, and that is a
 *  statement about the rigs rather than about the tool — most of the mech
 *  clips other than the gaits are still mis-mapped or mis-oriented in
 *  render3d's manifest (checkpoint K5 in docs/mech-conversion-plan.md, still
 *  open), so a card defaulting to `specialNeutral` today shows a machine lying
 *  on its face and tells you nothing about how big your drawing is.
 *
 *  "stance" is a gait frame, which renders correctly on every mech today, and a
 *  ruler is all the reference has to be to answer the size question. When K5
 *  lands, flipping the default here is the whole change. */
let poseMode = "stance";

/** The card that owns each canvas, so a redraw can find its data. */
const cardOf = new Map();
const pending = new Set();
let frame = 0;

function scheduleDraw(key) {
  if (key) pending.add(key);
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const todo = pending.size ? [...pending] : [...cardOf.keys()];
    pending.clear();
    for (const k of todo) drawCard(k);
  });
}

/** The reference mech for a drawing, and the pose to freeze them in.
 *
 *  A mech nobody can name gets the roster median, dimmed — see `referenceMech`
 *  for why the median rather than anybody in particular. */
function referenceFor(card) {
  const ruler = !card.use;
  const charKey = card.use ? card.use.charKey : referenceMech();
  if (poseMode === "launch" && card.use) {
    return { charKey, anim: card.use.anim, t: LAUNCH_TIME, ruler };
  }
  // The gait frame that stands in while K5 is open. `walk` at a quarter second
  // is a mech standing square with one foot forward, which is what a ruler
  // should be: the same recognisable stance on every card.
  return { charKey, anim: "walk", t: 0.25, ruler, stance: true };
}

/** Where the drawing sits, in GAME pixels relative to the mech's feet, before
 *  its own nudge.
 *
 *  Three cases, and they are the three the registry already distinguishes:
 *
 *    a LAUNCH point    the move says where it leaves the mech (`launch` on the
 *                      registry entry: forward from their feet, and up). This
 *                      is the honest place for anything a kit throws, and the
 *                      whole reason a card can show a shot leaving a muzzle.
 *    a GROUND drawing  anchored "feet" with no launch — a hazard, a wall, a
 *                      column. It stands on the floor, ahead of the mech.
 *    everything else   centred at chest height ahead of them.
 */
function placement(card) {
  const { info } = card;
  const anchor = info?.anchor || "centre";
  if (info?.launch) {
    return { x: MECH_GX + info.launch.forward, y: GROUND_GY + info.launch.y, anchor };
  }
  if (anchor === "feet") return { x: MECH_GX + 200, y: GROUND_GY, anchor };
  if (anchor === "top") return { x: MECH_GX + 200, y: GROUND_GY - 230, anchor };
  return { x: MECH_GX + 200, y: GROUND_GY - 90, anchor };
}

/** The height the drawing is painted at, in game pixels, size included.
 *  Art the spawn site sizes per instance has no declared height — its own plate
 *  stands in for one, which keeps the Size control honest about being a ratio
 *  rather than an absolute. */
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

/**
 * THE CARD'S VIEW: how game space maps onto its canvas.
 *
 * `z` is the scale — game pixels to canvas pixels — and it is the grid's zoom
 * unless the scene is too big for the card, in which case the WHOLE SCENE comes
 * down together rather than the drawing alone. Shrinking one and not the other
 * is the failure this is written to prevent: a 1000px tsunami wall clamped to
 * the canvas beside a mech drawn at full size is a picture of a small wave.
 *
 * `fitted` says that happened, so the card can admit it instead of quietly
 * showing a different zoom from its neighbours.
 */
function viewOf(card) {
  const art = artRect(card);
  // The scene's bounds in game space, floor at y=0 and up negative. The mech is
  // always in it, so a card never frames tighter than the machine.
  let minX = MECH_GX - 60, maxX = MECH_GX + 60;
  let minY = -MECH_H;
  if (art) {
    minX = Math.min(minX, art.x - art.w / 2);
    maxX = Math.max(maxX, art.x + art.w / 2);
    minY = Math.min(minY, art.top);
  }
  const padX = 16, padY = 14;
  const fit = Math.min((CARD_W - padX * 2) / Math.max(1, maxX - minX),
                       (CARD_H - padY * 2) / Math.max(1, -minY + 18));
  const z = Math.min(zoom, fit);
  // Centre what there is horizontally, and stand the floor near the bottom.
  const originX = (CARD_W - (maxX - minX) * z) / 2 - minX * z;
  const originY = CARD_H - padY - 10;
  return { z, originX, originY, fitted: z < zoom - 1e-6, art };
}

function drawCard(key) {
  const card = cardOf.get(key);
  if (!card?.canvas) return;
  const ctx = card.canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, CARD_W, CARD_H);

  const view = viewOf(card);
  card.view = view;            // the drag needs the same z the paint used
  ctx.setTransform(view.z, 0, 0, view.z, view.originX, view.originY);

  // The floor. Drawn across the whole card rather than the scene, so it reads
  // as a ground line instead of as a bar under the subject.
  ctx.save();
  ctx.strokeStyle = "rgba(120, 200, 255, 0.22)";
  ctx.lineWidth = 1 / view.z;
  ctx.beginPath();
  ctx.moveTo(-view.originX / view.z, GROUND_GY);
  ctx.lineTo((CARD_W - view.originX) / view.z, GROUND_GY);
  ctx.stroke();
  ctx.restore();

  drawReferenceMech(ctx, referenceFor(card));

  const art = view.art;
  if (!art) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    ctx.fillStyle = "rgba(180, 200, 230, 0.5)";
    ctx.font = "500 12px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("loading…", CARD_W / 2, CARD_H / 2);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.translate(art.x, art.top + art.h / 2);
  if (art.adj.rot) ctx.rotate(art.adj.rot);
  // Drawn AS FIRED, the way a player sees it: `getImage` has already applied
  // the Mirror flag, and the renderer flips a shot travelling right. Showing
  // the raw plate while the game shows the flip is exactly how a drawing that
  // already points the right way gets "corrected" into flying backwards.
  ctx.drawImage(art.img, -art.w / 2, -art.h / 2, art.w, art.h);
  ctx.restore();

  if (showLaunch) drawLaunchPoint(ctx, art.at, card, view);
  if (showHit) drawHitShape(ctx, card, art, view);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Only the fit is worth saying on the card. Which pose the mechs are in is
  // one fact about the whole grid, so it is said once, in the bar — repeating
  // it sixty times would be the loudest text on the page and never news.
  if (view.fitted) {
    ctx.save();
    ctx.fillStyle = "rgba(160, 180, 210, 0.6)";
    ctx.font = "500 10px Inter, system-ui, sans-serif";
    ctx.fillText(`view ${(view.z * 100).toFixed(0)}% — too big for the card, scene and mech scaled together`, 8, 14);
    ctx.restore();
  }
  card.canvas.classList.toggle("is-dirty", isSet(key));
}

/** The mech, rendered by render3d at the game's own scale.
 *
 *  `drawCharFrame` is the game's call, unchanged — same rig, same clip, same
 *  height solve — so the mech in this card is the size it is in a match. The
 *  render is cached per pose by render3d's scene cache, which is why sixty
 *  cards of seventeen mechs costs seventeen renders rather than sixty. */
function drawReferenceMech(ctx, ref) {
  ctx.save();
  // A mech standing purely as a ruler is dimmed: on those cards the subject is
  // the hazard, and a fully-lit mech beside it reads as part of the picture.
  const alpha = ref.ruler ? 0.5 : 1;
  ctx.globalAlpha = alpha;
  const token = currentFrame(ref.charKey, ref.anim, ref.t);
  // Drawn in game space, on the transform the card is already under, so the
  // mech is scaled by exactly the number the drawing is scaled by.
  const drew = drawCharFrame(ctx, ref.charKey, token, MECH_GX, GROUND_GY, {
    facing: 1, alpha,
  });
  ctx.restore();
  if (drew) return;
  // No rig yet — they load lazily and a card drawn in the first second will
  // beat its mech there. A box the right height is better than a hole: it is
  // still a ruler, and the card redraws when the rig lands.
  ctx.save();
  ctx.strokeStyle = "rgba(120, 200, 255, 0.3)";
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(MECH_GX - 26, GROUND_GY - MECH_H, 52, MECH_H);
  ctx.restore();
}

/** The point the move actually launches from — the thing the drawing has to be
 *  aligned TO, and the one thing no amount of looking at the plate reveals. */
function drawLaunchPoint(ctx, at, card, view) {
  if (!card.info?.launch) return;
  ctx.save();
  ctx.strokeStyle = "rgba(120, 255, 190, 0.9)";
  ctx.lineWidth = 1.5 / view.z;
  const r = 8 / view.z;
  ctx.beginPath();
  ctx.moveTo(at.x - r, at.y); ctx.lineTo(at.x + r, at.y);
  ctx.moveTo(at.x, at.y - r); ctx.lineTo(at.x, at.y + r);
  ctx.stroke();
  ctx.restore();
}

/** The shape the move COLLIDES on, drawn about the spawn point and corrected by
 *  the drawing's own `hit` offset.
 *
 *  Nothing here changes play: every number is one the kit already declares. It
 *  is drawn so the art can be matched to it — a bolt painted twice the width of
 *  its radius looks like it should clip somebody it passes straight through,
 *  and that is invisible in the picture and invisible in the number. */
function drawHitShape(ctx, card, art, view) {
  const hit = card.info?.hit;
  if (!hit) {
    // A creature's hurt box IS its drawing, so the one shape worth placing by
    // hand is the part it hits WITH.
    if (card.info?.anchor === "feet" && card.use) drawAttackBox(ctx, card, art, view);
    return;
  }
  const adj = sharedHit(card.key);
  const at = placement(card);
  const cx = at.x + adj.dx;
  const cy = at.y + adj.dy;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 120, 120, 0.85)";
  ctx.fillStyle = "rgba(255, 90, 90, 0.10)";
  ctx.lineWidth = 1.5 / view.z;
  ctx.setLineDash([5 / view.z, 4 / view.z]);
  if (hit.shape === "circle") {
    const r = hit.r * adj.scale;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    const w = hit.w * adj.scale;
    const h = hit.h * adj.scale;
    // A melee box is measured from the FIGHTER, not from the drawing — so it is
    // drawn there, beside the mech, and the fact line says whose it is.
    const bx = hit.melee ? MECH_GX + hit.melee.forward - w / 2 : cx - w / 2;
    const by = hit.melee ? GROUND_GY + hit.melee.y - h / 2 : cy - h;
    ctx.fillRect(bx, by, w, h);
    ctx.strokeRect(bx, by, w, h);
  }
  ctx.restore();
}

/** The part of a body-shaped drawing that actually hits, as fractions of the
 *  drawing — so it travels with the art when it is resized or redrawn. */
function drawAttackBox(ctx, card, art, view) {
  const box = sharedAttack(card.key) || { x: 0.28, y: 0.52, w: 0.44, h: 0.76 };
  const cx = art.x + box.x * art.w;
  const cy = art.top + art.h - box.y * art.h;
  const w = box.w * art.w;
  const h = box.h * art.h;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 190, 90, 0.85)";
  ctx.fillStyle = "rgba(255, 190, 90, 0.10)";
  ctx.lineWidth = 1.5 / view.z;
  ctx.setLineDash([4 / view.z, 3 / view.z]);
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
}

// ------------------------------------------------------------- the card's DOM

/** What this drawing is, in the fewest words that are still true. Every line is
 *  read off the registry rather than written here, so a change to the drawing
 *  code shows up as a change in the panel instead of as a stale note. */
function factLines(card) {
  const { info, use } = card;
  const img = getImage(card.key);
  const out = [];
  if (use) out.push(["thrown by", `${use.charName} — ${use.move} (${use.slotLabel})`]);
  else if (info?.board) out.push(["hazard", `the ${info.board} board`]);
  else out.push(["belongs to", info?.owner || "shared feedback — anyone, any match"]);
  out.push(["painted at", Number.isFinite(info?.h)
    ? `${Math.round(info.h)}px tall · ${info.what}`
    : info?.what || "sized by the code that spawns it"]);
  out.push(["anchor", info?.anchor === "feet" ? "stands ON the spawn point"
    : info?.anchor === "top" ? "hangs FROM the spawn point"
    : "painted AROUND the spawn point"]);
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

const num = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toString();

function buildControls(card, host) {
  const key = card.key;
  const sizable = card.info?.sizable !== false;
  // A spawn site that paints the drawing itself never reads `sharedAdjust`, so
  // a nudge or a tilt set against it is stored and inert. The registry knows
  // which sites those are, so the controls can be visibly dead rather than
  // silently ignored — a slider that moves the picture here and nothing in the
  // game is worse than no slider at all.
  const placeable = card.info?.nudge !== false;
  const inert = placeable ? null
    : `stored but INERT — ${card.info.nudgeSite} paints this drawing itself and never reads the nudge`;
  const rows = [
    { field: "renderScale", label: "Size", min: 0.15, max: 3, step: 0.01, dflt: 1,
      disabled: !sizable,
      hint: sizable ? null : "the spawn site fixes this height; the slider cannot move it" },
    { field: "dx", label: "X", min: -160, max: 160, step: 1, dflt: 0,
      disabled: !placeable, hint: inert },
    { field: "dy", label: "Y", min: -160, max: 160, step: 1, dflt: 0,
      disabled: !placeable, hint: inert },
    { field: "rotationDeg", label: "Rotate", min: -180, max: 180, step: 1, dflt: 0,
      disabled: !placeable, hint: inert },
  ];
  for (const row of rows) {
    const wrap = document.createElement("label");
    wrap.className = "ctrl" + (row.disabled ? " is-off" : "");
    wrap.title = row.hint || "";
    const name = document.createElement("span");
    name.className = "ctrl-name";
    name.textContent = row.label;
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = row.min; slider.max = row.max; slider.step = row.step;
    slider.value = store[key]?.[row.field] ?? row.dflt;
    slider.disabled = !!row.disabled;
    const out = document.createElement("output");
    out.textContent = num(Number(slider.value));
    slider.addEventListener("input", () => {
      const v = Number(slider.value);
      out.textContent = num(v);
      setField(key, row.field, v, row.dflt);
      wrap.classList.toggle("is-set", v !== row.dflt);
    });
    // Double-click a control to put it back — the fastest way to ask "was that
    // better?" and the reason an edit is stored as a decision rather than as a
    // value that happens to equal the default.
    wrap.addEventListener("dblclick", () => {
      slider.value = row.dflt;
      slider.dispatchEvent(new Event("input"));
    });
    wrap.classList.toggle("is-set", Number(slider.value) !== row.dflt);
    wrap.append(name, slider, out);
    host.append(wrap);
  }

  const flip = document.createElement("label");
  flip.className = "ctrl ctrl--check";
  flip.title = "Everything that travels is drawn pointing LEFT and mirrored when it flies right. Tick this for a plate that arrived pointing the other way.";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = !!store[key]?.faceLeft;
  box.addEventListener("change", () => {
    setField(key, "faceLeft", box.checked || null, null);
    flip.classList.toggle("is-set", box.checked);
  });
  flip.classList.toggle("is-set", box.checked);
  const flipName = document.createElement("span");
  flipName.className = "ctrl-name";
  flipName.textContent = "Mirror";
  flip.append(flipName, box);
  host.append(flip);
}

function buildCard(card) {
  const el = document.createElement("article");
  el.className = "card";
  el.id = `card-${card.key.replace(/[:]/g, "-")}`;

  const head = document.createElement("header");
  head.className = "card-head";
  const title = document.createElement("h2");
  title.textContent = card.key.split(":").pop().replace(/_/g, " ");
  const kind = document.createElement("span");
  kind.className = "card-kind";
  kind.textContent = card.key.startsWith("stagefx:") ? "hazard"
    : card.use ? card.use.charName : "shared";
  const dot = document.createElement("i");
  dot.className = "dot";
  dot.title = "edited — this drawing is in the exported config";
  head.append(title, kind, dot);

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  canvas.className = "card-canvas";
  card.canvas = canvas;
  attachDrag(card, canvas);

  const facts = document.createElement("dl");
  facts.className = "facts";
  for (const [k, v] of factLines(card)) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    if (k.startsWith("⚠")) dd.className = "warn";
    facts.append(dt, dd);
  }

  const ctrls = document.createElement("div");
  ctrls.className = "ctrls";
  buildControls(card, ctrls);

  el.append(head, canvas, facts, ctrls);
  return el;
}

/** Drag the drawing on the canvas. The gesture is in canvas pixels and the
 *  stored number is in game pixels, so it is divided by the zoom on the way in
 *  — otherwise a nudge made at 2× would be twice the nudge it looked like. */
function attachDrag(card, canvas) {
  let from = null;
  // The canvas is laid out at `width: 100%` and has a fixed backing size, so a
  // pointer offset is in CSS pixels and everything drawn is in backing pixels.
  // Without this the drag drifts by however much the grid column differs from
  // 420px — which is nearly always, and is exactly the kind of small wrongness
  // a placement tool must not have.
  const cssToCanvas = () => CARD_W / (canvas.getBoundingClientRect().width || CARD_W);
  canvas.addEventListener("pointerdown", (e) => {
    if (card.info?.nudge === false) return;   // stored, inert: do not pretend
    canvas.setPointerCapture(e.pointerId);
    from = { x: e.offsetX, y: e.offsetY,
             dx: store[card.key]?.dx ?? 0, dy: store[card.key]?.dy ?? 0 };
    canvas.classList.add("is-dragging");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!from) return;
    // The gesture is in canvas pixels and the stored number is in game pixels,
    // so it is divided by THIS CARD'S zoom — not the grid's. A card that had to
    // shrink to fit would otherwise move by more than the pointer did.
    const z = (card.view?.z || zoom) / cssToCanvas();
    setField(card.key, "dx", Math.round(from.dx + (e.offsetX - from.x) / z), 0);
    setField(card.key, "dy", Math.round(from.dy + (e.offsetY - from.y) / z), 0);
    syncControls(card);
  });
  const end = () => { from = null; canvas.classList.remove("is-dragging"); };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  // Wheel sizes it, because size is the question this tool exists for and
  // reaching for a slider to ask it is one motion too many.
  canvas.addEventListener("wheel", (e) => {
    if (card.info?.sizable === false) return;
    e.preventDefault();
    const cur = store[card.key]?.renderScale ?? 1;
    const next = Math.min(3, Math.max(0.15, cur * (e.deltaY < 0 ? 1.06 : 1 / 1.06)));
    setField(card.key, "renderScale", Math.round(next * 100) / 100, 1);
    syncControls(card);
  }, { passive: false });
}

/** Put the sliders back in step with a value changed on the canvas. */
function syncControls(card) {
  const el = document.getElementById(`card-${card.key.replace(/[:]/g, "-")}`);
  if (!el) return;
  const fields = ["renderScale", "dx", "dy", "rotationDeg"];
  const dflts = { renderScale: 1, dx: 0, dy: 0, rotationDeg: 0 };
  el.querySelectorAll(".ctrl:not(.ctrl--check)").forEach((wrap, i) => {
    const field = fields[i];
    const v = store[card.key]?.[field] ?? dflts[field];
    const slider = wrap.querySelector("input");
    const out = wrap.querySelector("output");
    if (slider) slider.value = v;
    if (out) out.textContent = num(v);
    wrap.classList.toggle("is-set", v !== dflts[field]);
  });
}

// --------------------------------------------------------------------- export

/** The store as the source of src/config_effects.js — the whole object, with
 *  the empty entries dropped, so pasting it over the old one is the whole
 *  save. Sorted by key so two exports of the same state are the same text and
 *  a diff shows what actually changed. */
function exportConfig() {
  const lines = ["export const EFFECT_PLACEMENT = {"];
  for (const key of Object.keys(store).sort()) {
    const e = store[key];
    if (!e || !Object.keys(e).length) continue;
    const fields = Object.entries(e)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join(", ");
    lines.push(`  ${JSON.stringify(key)}: { ${fields} },`);
  }
  lines.push("};");
  return lines.join("\n");
}

let dirty = false;
function markDirty() {
  dirty = true;
  const btn = document.getElementById("copyConfig");
  if (btn) btn.classList.add("is-dirty");
}

// ----------------------------------------------------------------------- boot

async function main() {
  const status = document.getElementById("status");
  status.textContent = "loading…";

  await initStore();
  // The 3D backend, the same one the game boots: the reference renders ARE the
  // game's renders, which is the only way a size read here means anything.
  await initRenderBackend();

  const cards = buildList();
  const grid = document.getElementById("grid");
  for (const card of cards) {
    cardOf.set(card.key, card);
    grid.append(buildCard(card));
  }
  document.getElementById("count").textContent = `${cards.length} drawings`;

  // Lazily: a card fetches its plate and warms its mech's rig when it is about
  // to be looked at. Seventeen rigs at eight to forty megabytes each is not a
  // page load, and sixty plates is not one either.
  const seen = new Set();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const key = e.target.dataset.key;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const card = cardOf.get(key);
      loadSharedImage(key).then(() => scheduleDraw(key));
      preloadChar(referenceFor(card).charKey, true);
      // The rig lands asynchronously with no event to hang off, so the card is
      // redrawn a few times over the next couple of seconds. Cheap: a redraw
      // whose pose is already cached is a blit.
      for (const ms of [400, 1200, 2600, 5000]) setTimeout(() => scheduleDraw(key), ms);
    }
  }, { rootMargin: "300px" });
  for (const [key] of cardOf) {
    const el = document.getElementById(`card-${key.replace(/[:]/g, "-")}`);
    if (!el) continue;
    el.dataset.key = key;
    io.observe(el);
  }

  document.getElementById("zoom").addEventListener("input", (e) => {
    zoom = Number(e.target.value);
    document.getElementById("zoomOut").textContent = `${zoom.toFixed(2)}×`;
    scheduleDraw();
  });
  document.getElementById("showHit").addEventListener("change", (e) => {
    showHit = e.target.checked; scheduleDraw();
  });
  document.getElementById("showLaunch").addEventListener("change", (e) => {
    showLaunch = e.target.checked; scheduleDraw();
  });
  document.getElementById("pose").addEventListener("change", (e) => {
    poseMode = e.target.value;
    document.getElementById("poseNote").hidden = poseMode !== "stance";
    // Switching pose asks for clips that have not been rendered yet; the scene
    // cache fills as they are asked for, so the redraws that follow catch up.
    scheduleDraw();
    for (const ms of [500, 1500]) setTimeout(() => scheduleDraw(), ms);
  });
  document.getElementById("copyConfig").addEventListener("click", async (e) => {
    const text = exportConfig();
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = "config copied — paste it over EFFECT_PLACEMENT in src/config_effects.js";
    } catch {
      // Clipboard access needs a secure context, which a plain http dev server
      // is not on every browser. Showing the text is the fallback that always
      // works, and it is the thing being copied either way.
      document.getElementById("dump").value = text;
      document.getElementById("dump").hidden = false;
      status.textContent = "clipboard unavailable — the config is in the box below";
    }
    e.target.classList.remove("is-dirty");
  });

  status.textContent = "ready";
  scheduleDraw();
}

main().catch((err) => {
  document.getElementById("status").textContent = `failed: ${err.message}`;
  console.error(err);
});
