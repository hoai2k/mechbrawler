// Per-drawing adjustments for the shared `effect:*` and `summon:*` art.
//
// These sprites belong to no fighter. They have no manifest entry of their own
// and no placement data: the code that spawns each one decides where it goes
// and how big it is, from `sprite` and `spriteH` in the kit that throws it.
// That is the right shape — a projectile's size is a property of the move, not
// of the picture — but it leaves two things nobody can fix without editing a
// kit by hand:
//
//   faceLeft     art that arrived drawn facing the wrong way. Every fighter's
//                sheet is drawn facing right and the renderer mirrors it; an
//                effect that points left is simply wrong, everywhere it is
//                used. Applied in assets.js, at the one place a drawing is
//                read, so no spawn site has to know about that one file.
//
//   renderScale  art delivered at the wrong size RELATIVE to the character who
//                throws it. The kits declare a height in pixels each; rather
//                than re-authoring fifty numbers by eye, the workbench tunes
//                one multiplier against the character it is drawn beside, and
//                it is folded into those declared heights here.
//
//                Kit `spriteH` is not the only place a size comes from, and it
//                used to be the only one this reached — so a scale set on a
//                summon, an install aura or a stage hazard was stored, showed
//                in the workbench, and did nothing on stage. `sharedScale()`
//                is now read at those draw sites too.
//
//   dx, dy       where the picture sits relative to the point the game spawns
//                it on. Art arrives off-centre in its plate and the collision
//                point is not negotiable, so the drawing moves.
//
//   rotationDeg  a standing tilt correction, about the same point. Art that
//                arrives at an angle is otherwise unusable for anything the
//                engine turns itself.
//
// Both are written by the sprite workbench's Other Sprites view and stored in
// `otherSprites` in the manifest, beside the review flags that already live
// there.

import { CHARACTERS, CHARACTER_KEYS } from "./characters.js";
import { spriteManifest } from "./assets.js";

/** How a kit node names a shared drawing, and which field holds the height that
 *  drawing is painted at.
 *
 *  There is no single convention and there does not need to be — a projectile's
 *  `spriteH`, a pigeon orb's `orbSpriteH` and a dropped vending machine's plain
 *  `h` are each the natural name in their own move. What matters is that every
 *  one of them is listed here, because a pair that is missing is a drawing the
 *  workbench cannot size and the usage index reports as unused. Three moves'
 *  worth of art sat in exactly that hole: Reggie's drops, Mechamaru's orbs.
 *
 *  A null height means the drawing is sized by the renderer rather than by the
 *  kit — auras and domain backdrops — and is handled at those draw sites.
 */
// The third element, where present, is the field's OWN hit numbers. A node can
// declare two drawings at once — Mechamaru's ultimate names the cannon under
// `sprite` and the five orbs it opens with under `orbSprite` — and the node's
// hit numbers describe only the first of them. Without this the orbs inherited
// the cannon's, and a 64px pigeon was shown against a 170px shot.
const SPRITE_FIELDS = [
  // A list per field, first one present wins: Yuta's side special names Rika
  // under `sprite` but declares her height as plain `h`, so a single partner
  // name would leave that one drawing unscalable.
  ["sprite", ["spriteH", "h"]],
  ["orbSprite", ["orbSpriteH"], { r: "orbR" }],
  ["key", ["h"]],          // a random-drop entry: `{ key: "effect:…", w, h }`
  ["aura", []],
  ["domainSprite", []],
];

/** Fields holding a LIST of interchangeable drawings that share one declared
 *  height, and the field that declares it.
 *
 *  `sprites` is a preference list — the first drawing that has loaded is the
 *  one used, the rest are stand-ins. `spritePool` is a random pick: Geto's
 *  volley throws one of four curses per shot, all painted at the same
 *  `spriteH`. Both are one height for several keys, so a size set on any
 *  member is a statement about all of them — which is honest, because the move
 *  declares one number and there is nowhere to put a second.
 *
 *  `spritePool` was missing here, and it is the whole reason the four curses
 *  could be sized in the workbench with nothing happening on stage and be
 *  reported as belonging to a summon they are only the stand-in for. It is the
 *  same hole this file's header describes Reggie's drops falling into. */
const SPRITE_LIST_FIELDS = [
  ["sprites", "spriteH"],
  ["spritePool", "spriteH"],
];

/** The list fields' names, for the checker that polices this contract. */
export const SPRITE_LIST_KEY_FIELDS = SPRITE_LIST_FIELDS.map(([f]) => f);

/**
 * The box a CREATURE hits with, as fractions of its own drawing.
 *
 * Its hurt box is the whole sprite — a dog drawn 205 px long is hit anywhere
 * along those 205 px, which is what a hurt box should be. Its ATTACK box is not
 * the same shape and never was: a dog bites with its head, and being brushed by
 * the tail of a passing shikigami should not take 6.5%. Fighters have had the
 * two separate since the beginning; this gives creatures the same split.
 *
 *   x  centre of the box, FORWARD from the middle of the drawing, in fractions
 *      of its width. Positive is the way the creature faces, so it mirrors.
 *   y  centre of the box above the feet, in fractions of the drawing's height.
 *   w  width, as a fraction of the drawing's width.
 *   h  height, as a fraction of the drawing's height.
 *
 * Fractions rather than pixels, so the box travels with the art: rescale the
 * creature in the workbench, or redraw it bigger, and the bite stays on the
 * mouth. Stored per creature in `otherSprites`, beside the size and the nudge,
 * and edited on the canvas.
 */
export function sharedAttack(key) {
  const box = entryOf(key)?.attackBox;
  if (!box) return null;
  const n = (v, d) => (Number.isFinite(v) ? v : d);
  return { x: n(box.x, 0.25), y: n(box.y, 0.5), w: n(box.w, 0.5), h: n(box.h, 0.8) };
}

/** Field names that hold a shared-sprite key, for callers that only need those. */
export const SPRITE_KEY_FIELDS = [
  ...SPRITE_FIELDS.map(([f]) => f),
  ...SPRITE_LIST_FIELDS.map(([f]) => f),
];

const isSharedKey = (v) => typeof v === "string"
  && (v.startsWith("effect:") || v.startsWith("summon:") || v.startsWith("stagefx:"));

/** The stored entry for a shared drawing, following the one inheritance rule
 *  this map has: a summon POSE (`summon:nue:idle_a`) falls back to its creature
 *  (`summon:nue`). The six poses of a creature are one drawing at one zoom, so
 *  a size set on any of them is a statement about the creature; without this,
 *  adjusting the pose you happen to be looking at silently does nothing. */
function entryOf(key) {
  const all = spriteManifest?.otherSprites;
  if (!all) return null;
  if (all[key]) return all[key];
  const parts = String(key).split(":");
  if (parts[0] === "summon" && parts.length === 3) return all[`${parts[0]}:${parts[1]}`] || null;
  return null;
}

function scaleOf(key) {
  const scale = entryOf(key)?.renderScale;
  return Number.isFinite(scale) && scale > 0 ? scale : null;
}

/**
 * Every per-drawing adjustment for a shared sprite, resolved.
 *
 *   scale   a multiplier on whatever height the drawing is drawn at, wherever
 *           that height comes from — a kit's `spriteH`, a creature's `h` in
 *           config_summons.js, the install aura's own constant, a stage
 *           hazard's. One knob, because "this art is delivered too big" is one
 *           fact about the picture and should not need finding in four files.
 *   dx, dy  a nudge in game pixels, applied where the drawing is painted and
 *           NOT to anything it collides with. That is the point: art arrives
 *           off-centre in its plate — an egg at one end of a long trail, a
 *           creature drawn to one side — and the fix is to move the picture
 *           onto the point the game is actually using, rather than to move the
 *           point. Positive dy is DOWN, matching canvas coordinates.
 *
 * Returns the identity adjustment for a drawing nobody has touched, so callers
 * can use it unconditionally.
 */
export function sharedAdjust(key) {
  const e = entryOf(key);
  const scale = Number.isFinite(e?.renderScale) && e.renderScale > 0 ? e.renderScale : 1;
  const deg = Number.isFinite(e?.rotationDeg) ? e.rotationDeg : 0;
  return {
    scale,
    dx: Number.isFinite(e?.dx) ? e.dx : 0,
    dy: Number.isFinite(e?.dy) ? e.dy : 0,
    // Radians, about the drawing's own anchor. A projectile already turns to
    // follow its flight path; this is the standing correction on top of that,
    // for art delivered at a tilt.
    rot: deg * Math.PI / 180,
    deg,
  };
}

/** Just the size multiplier, for the call sites that only need that. */
export function sharedScale(key) {
  return scaleOf(key) ?? 1;
}

/** Fold each shared sprite's scale into the `spriteH` of every kit entry that
 *  draws it, once, after the manifest has loaded.
 *
 *  The declared heights are the only size the spawn sites read, so multiplying
 *  them here reaches every one — including the effects drawn by code that has
 *  no idea the workbench exists. Idempotent: the baseline is remembered per
 *  node, so re-running after an edit re-derives rather than compounding.
 */
export function applySharedSpriteScales() {
  const seen = new Set();
  const visit = (node) => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    for (const [field, heightFields] of SPRITE_FIELDS) {
      if (!isSharedKey(node[field])) continue;
      const heightField = heightFields.find((h) => Number.isFinite(node[h]));
      if (!heightField) continue;
      // Remembered on first visit, so an edit in the workbench scales the
      // authored height rather than the one the last edit left behind.
      const base = `${heightField}Base`;
      if (!Number.isFinite(node[base])) node[base] = node[heightField];
      const scale = scaleOf(node[field]);
      node[heightField] = scale ? node[base] * scale : node[base];
    }
    // A list of drawings under one declared height (SPRITE_LIST_FIELDS): the
    // first member with a scale set decides it, because there is a single
    // number to fold it into.
    for (const [field, heightField] of SPRITE_LIST_FIELDS) {
      if (!Array.isArray(node[field]) || !Number.isFinite(node[heightField])) continue;
      const base = `${heightField}Base`;
      if (!Number.isFinite(node[base])) node[base] = node[heightField];
      const scale = node[field].filter(isSharedKey).map(scaleOf).find((s) => s !== null);
      node[heightField] = scale ? node[base] * scale : node[base];
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") visit(value);
    }
  };
  for (const key of CHARACTER_KEYS) {
    const char = CHARACTERS[key];
    visit(char?.specials);
    visit(char?.ultimate);
  }
}

// ---------------------------------------------------------------- the registry
//
// What the game does with each shared drawing: how tall it paints it, and which
// point on the picture it paints AT. Both were spread across four files and
// knowable only by reading them, which is why the workbench could offer a size
// slider that did nothing and a nudge with nothing to nudge against.
//
// `anchor` is the part of the drawing that lands on the spawn point:
//
//   centre   painted around the point — projectiles, impacts, the diving fang
//   feet     painted standing ON the point — creatures, auras, most hazards
//
// Everything here is derived from the code that actually draws, so a change
// there shows up as a change here rather than as a stale note.

import {
  SHIKIGAMI_POOL, TRANSFIGURED_POOL, CURSE_POOL, INVENTORY_POOL,
} from "./config_summons.js";

/** The install aura's nominal painted height (src/render.js, drawInstallAura). */
export const AURA_H = 220;

/** The aura breathes rather than sitting still, so `AURA_H` is never the height
 *  it is actually painted at: the drawing is `AURA_H * pulse`, and the pulse
 *  swings between 0.82 and 0.94. Lives here with the height because three files
 *  paint this one drawing — the flat renderer, the 2.5D scene, and the
 *  workbench's preview of it — and a breath that differs between them is a
 *  preview that lies about the size by a tenth. */
export const AURA_PULSE = { base: 0.88, amp: 0.06, rate: 8 };

/** The aura stands this many pixels BELOW the fighter's feet, so the glow skirts
 *  the floor they are standing on rather than being cut off by it. */
export const AURA_FOOT_DY = 10;

/** The height a STILL picture of an aura should use — the middle of the breath.
 *  The workbench renders on demand rather than every frame, so it has to pick a
 *  moment, and the mid-point is the only defensible one. */
export const AURA_PREVIEW_H = Math.round(AURA_H * AURA_PULSE.base);

/** Hazard art, with the height and anchor each draw site uses (stage_fx.js). */
const STAGE_FX = {
  "stagefx:stage_fang": { h: 72, anchor: "centre", what: "a rising fang, and the diving one" },
  "stagefx:stage_flower": { h: 46, anchor: "feet", what: "a bloom on the platform" },
  "stagefx:stage_lantern": { h: 44, anchor: "top", what: "a lantern hung from its cord" },
  "stagefx:stage_weak_curse": { h: 60, anchor: "feet", what: "the curse that wanders the stage" },
};

const POOLS = [SHIKIGAMI_POOL, TRANSFIGURED_POOL, CURSE_POOL, INVENTORY_POOL];

/** The usual answer: this drawing's spawn site reads sharedAdjust, so a dx/dy
 *  and a tilt set against it are honoured. Spread into an entry rather than
 *  assumed, so the two sites that do NOT (DRAW_SITES below) read as a decision
 *  rather than as a field somebody forgot. */
const NUDGED = { nudge: true };

let registry = null;

/** The region of the world this drawing's move actually acts on, if the kit
 *  declares one.
 *
 *  This is the thing art has to agree with and cannot be measured from the
 *  picture: a bolt drawn twice the width of its `r` looks like it should clip
 *  somebody it passes straight through. Every shape here is a number a move
 *  already declares — nothing new is invented, and nothing here changes play.
 */
function hitOfNode(node) {
  if (Number.isFinite(node.r)) {
    return { shape: "circle", r: node.r, from: "r",
             what: "the radius it collides on" };
  }
  // A `width` is not a band. Both moves that declare one — Gojo's Purple and
  // Mechamaru's cannon — spawn an ordinary projectile with `r: width / 2`
  // (ultimates.js), so what they actually collide on is a circle that crosses
  // the stage. Drawing it as a screen-wide beam described the fiction rather
  // than the code, and put a 190px band over art that hits on 95px.
  if (Number.isFinite(node.width) && Number.isFinite(node.duration)) {
    return { shape: "circle", r: node.width / 2, from: "width",
             what: "the radius it collides on, half the move's width" };
  }
  if (Number.isFinite(node.w) && Number.isFinite(node.h)) {
    // `hBase` is the authored height, before applySharedSpriteScales folded a
    // workbench size into it — the same number the drawing is measured from,
    // so the two cannot disagree about what "1×" means.
    return { shape: "rect", w: node.w, h: node.hBase ?? node.h, from: "w/h",
             what: "the box it lands in" };
  }
  return null;
}

/** A secondary drawing's own hit numbers, named by its SPRITE_FIELDS entry.
 *  Absent numbers mean no shape rather than the node's: a drawing whose spawn
 *  site invents its collision is one the kit cannot describe, and guessing
 *  there is how the orbs ended up wearing the cannon's. */
function hitOfField(node, spec) {
  if (spec.r && Number.isFinite(node[spec.r])) {
    return { shape: "circle", r: node[spec.r], from: spec.r,
             what: "the radius it collides on" };
  }
  return null;
}

function buildRegistry() {
  const out = new Map();
  const put = (key, info) => {
    if (!isSharedKey(key) || out.has(key)) return;
    out.set(key, info);
  };
  // A creature's SECOND and later drawings are stand-ins: summons.js draws the
  // first of them that has loaded, so once the creature's own art is delivered
  // the rest are never reached. They are still worth an entry — a drawing with
  // no entry reads as unused — but they must not outrank a usage that really
  // draws, which is what happened while the pools were walked first and first
  // put won. `effect:curse_c` is Geto's volley, and was being described as a
  // Smallpox Deity it has not been drawn as since the Deity got her own set.
  const standIns = [];
  // The pools are reached twice: once here, with the creature's height, hit box
  // and name, and again by the generic kit walk below, which finds the same
  // `sprites` arrays hanging off `p.pool` and knows none of that. Pass 1 wins by
  // having the walk skip the ARRAYS it has already described — not the entries
  // themselves, because a pool entry can also name art the walk is the only
  // route to (the Inventory Curse's cursed tool, nested in its projectile).
  const poolLists = new Set();

  // 1. Creatures: `h` in config_summons.js, standing on the point.
  for (const pool of POOLS) {
    for (const entry of pool || []) {
      const h = entry.h ?? 110;
      // No authored pair means the box is measured off the drawing at spawn
      // (derivedBox, summons.js). There is nothing fixed to draw against then —
      // the box IS the picture — so the workbench says so instead of showing a
      // shape that would only ever trace the art it is already looking at.
      const hitOf = (e) => (Number.isFinite(e.hitW) && Number.isFinite(e.hitH)
        ? { shape: "rect", w: e.hitW, h: e.hitH, from: "hitW/hitH", what: "what it can be hit on, and hits with" }
        : null);
      const measured = !(Number.isFinite(entry.hitW) && Number.isFinite(entry.hitH));
      const owner = entry.name || entry.id || "a summon";
      const creature = (keys, height, hit) => (poolLists.add(keys), keys).forEach((key, i) => {
        const info = { h: height, anchor: "feet", owner, hit, measuredBox: measured, ...NUDGED,
                       what: i === 0
                         ? "the creature's height on stage (config_summons.js)"
                         : `a STAND-IN for ${owner} — only drawn if that creature's own art is missing (config_summons.js)` };
        if (i === 0) put(key, info); else standIns.push([key, info]);
      });
      creature(entry.sprites || [], h, hitOf(entry));
      for (const member of entry.units || entry.members || []) {
        creature(member.sprites || [], member.h ?? h, hitOf(member) || hitOf(entry));
      }
    }
  }

  // 2. Hazards.
  for (const [key, fx] of Object.entries(STAGE_FX)) {
    put(key, { h: fx.h, anchor: fx.anchor, owner: "a stage hazard", ...NUDGED,
               what: `${fx.what} — its height in stage_fx.js` });
  }

  // 3. Everything a kit names, walked exactly as the scale fold walks it.
  const seen = new Set();
  // WHO draws it decides where it is painted, and that is the special's `type`
  // rather than anything about the key. `summon:nue` is a projectile — Megumi
  // throws the bird — while Yuta's Rika, under the same prefix, is a summon
  // that stands on the stage. Reading the prefix instead got Nue exactly
  // backwards.
  //
  // `nudge` is the other half of what a spawn site decides: whether it reads
  // sharedAdjust at all. The two that place a drawing on a moving thing do —
  // render.js for projectiles and auras, summons.js for creatures — and the
  // handlers that paint a set piece themselves do not. A drawing they own can
  // still be sized, because the size is folded into the kit's own height
  // before it reaches them, but a dx/dy or a tilt set against one is stored and
  // inert. Saying so here is what stops the workbench offering a control the
  // game ignores.
  //
  // Every entry below was read off its handler. Where a handler paints at a
  // height of its own rather than the kit's, that height is here too and
  // `sizable: false` says the slider cannot move it.
  const SELF = (site) => ({ nudge: false, site });
  // WHERE it leaves the fighter, in game pixels from their feet, forward being
  // the way they face. Read off each handler, and where the handler defaults a
  // kit field the default is here too — `spawnProjectile` puts a shot at
  // `ox ?? 70` forward and `oy ?? -86` up, which is chest height on a fighter.
  //
  // This is what lets the workbench stand the drawing where the move actually
  // puts it, beside the pose that throws it, instead of alone in the middle of
  // a canvas: a beam can be lined up with the hand that fires it.
  const LAUNCH = {
    projectile: (n) => ({ forward: n.ox ?? 70, y: n.oy ?? -86 }),
    // The wave handler overrides ox itself, one wave per 54px: `ox: 60 + i * 54`.
    wave: (n) => ({ forward: 60, y: n.oy ?? -86 }),
    // spawnSummonFlash: on the ground at the fighter's feet (`owner.y + 12`),
    // `forward` px ahead of them, each handler passing its own.
    swap: () => ({ forward: 0, y: 12 }),
    echoStrike: () => ({ forward: 80, y: 12 }),
    burst: (n) => ({ forward: n.spriteForward ?? 105, y: 12 }),
    commandGrab: (n) => ({ forward: n.spriteForward ?? 78, y: 12 }),
    // Planted on the ground ahead of them, at the move's own reach — unless it
    // is planted at the OPPONENT's feet instead, which is a distance this
    // canvas has no second fighter to show.
    trap: (n) => (n.atOpponent ? null : { forward: n.dist ?? 220, y: 0 }),
    cloudField: (n) => ({ forward: n.dist ?? 210, y: 0 }),
    // Rika stands BEHIND Yuta — `f.x - f.facing * 58` — and the transformed
    // body replaces the fighter where they stand.
    install: () => ({ forward: -58, y: 18 }),
    rampage: () => ({ forward: 0, y: 10 }),
  };
  // The MOVE's own hitbox, for the handlers whose art is a flash beside a melee
  // swing. Its `w`/`h` sit on the same node as the drawing and read like the
  // drawing's own box, and they are nothing of the kind: spawnMelee puts them on
  // the FIGHTER, at its own offset, while the art stands somewhere else
  // entirely. Drawing that rectangle around the picture claimed a shape the
  // game never tests there.
  const MELEE = {
    burst: (n) => ({ forward: n.ox ?? 40, y: n.oy ?? -96, w: n.w ?? 160, h: n.h ?? 100 }),
    echoStrike: (n) => ({ forward: n.ox ?? 40, y: n.oy ?? -96, w: n.w ?? 160, h: n.h ?? 100 }),
    // This one's numbers are in the handler, not the kit: `ox: 24, oy: -104`.
    commandGrab: (n) => ({ forward: 24, y: -104, w: n.range ?? 120, h: 110 }),
  };
  // Which pose the fighter is in while it happens. A special plays the anim for
  // its slot (slotAnim, specials.js); an ultimate plays `ult`.
  const SLOT_ANIM = { neutral: "specialNeutral", side: "specialSide", down: "specialDown",
                      ult: "ult" };
  const DRAW_SITES = {
    // --- drawn by render.js / summons.js, on something that moves ---------
    summon: { anchor: "feet", nudge: true },
    // A projectile is drawn centred on its own position, which IS the circle it
    // collides on, and mirrored to the way it is travelling.
    projectile: { anchor: "centre", nudge: true, travels: true },
    // `mirrored` is the same fact for art that does not fly: spawnSummonFlash
    // and the two install bodies scale by `facing > 0 ? -1 : 1`, so what a
    // player sees a right-facing fighter produce is the mirror of the plate,
    // exactly as with a shot travelling right.
    wave: { anchor: "centre", nudge: true, travels: true },
    beam: { anchor: "centre", nudge: true, travels: true },
    cannonade: { anchor: "centre", nudge: true, travels: true },
    birdstrike: { anchor: "centre", nudge: true, travels: true },
    deathSwarm: { anchor: "centre", nudge: true, travels: true },
    parthenogenesis: { anchor: "feet", nudge: true },

    // --- painted by their own handler, straight from getImage -------------
    // Standing on the ground: `-h` under the point, or drawn at a ground line
    // the handler works out for itself.
    trap: { anchor: "feet", ...SELF("makeTrap (src/specials.js)") },
    randomDrop: { anchor: "feet", ...SELF("randomDrop (src/specials.js)") },
    cloudField: { anchor: "feet", ...SELF("cloudField (src/specials.js)") },
    // A tornado stands on the floor and rises out of it — `translate(640, 595)`
    // then `-h` — so it is a ground drawing, not one centred on a point in the
    // air, however much a centred crosshair suggested otherwise.
    tempest: { anchor: "feet", ...SELF("tempest (src/ultimates.js)") },
    eruption: { anchor: "feet", ...SELF("eruption (src/ultimates.js)") },
    cardrop: { anchor: "feet", ...SELF("cardrop (src/ultimates.js)") },
    // Centred on the point the handler puts them on: a falling meteor, a ring
    // of blood orbs, a shout in front of the mouth.
    meteor: { anchor: "centre", ...SELF("meteor (src/ultimates.js)") },
    vortex: { anchor: "centre", ...SELF("vortex (src/ultimates.js)") },
    nailstorm: { anchor: "centre", ...SELF("nailstorm (src/ultimates.js)") },
    shout: { anchor: "centre", ...SELF("shout (src/ultimates.js)") },
    skyInvert: { anchor: "centre", ...SELF("skyInvert (src/ultimates.js)") },
    massDrive: { anchor: "centre", ...SELF("massDrive (src/ultimates.js)") },
    supernova: { anchor: "centre", ...SELF("supernova (src/ultimates.js)") },
    concert: { anchor: "centre", ...SELF("concert (src/ultimates.js)") },
    warpStrike: { anchor: "centre", ...SELF("warpStrike (src/specials.js)") },
    // A one-shot flash of art beside the fighter — Todo's clap, Yuji's
    // divergent impact, Rika's fist, Todo's drum. spawnSummonFlash stands it on
    // the ground at the fighter's feet and mirrors it with their facing, at the
    // move's own `spriteH`; it never reads the nudge.
    swap: { anchor: "feet", mirrored: true, ...SELF("spawnSummonFlash (src/specials.js)") },
    echoStrike: { anchor: "feet", mirrored: true, ...SELF("spawnSummonFlash (src/specials.js)") },
    burst: { anchor: "feet", mirrored: true, ...SELF("spawnSummonFlash (src/specials.js)") },
    commandGrab: { anchor: "feet", mirrored: true, ...SELF("spawnSummonFlash (src/specials.js)") },

    // --- a second body for the fighter, at a height the RENDERER fixes -----
    // Yuta's Rika stands behind him at 238px; Panda's triceratops replaces his
    // body at 210px. Neither reads the kit's height, so the Size slider has
    // nothing to multiply — which is why it is marked unsizable rather than
    // left looking live.
    install: { anchor: "feet", spriteH: 238, sizable: false, mirrored: true,
               ...SELF("install (src/ultimates.js)") },
    rampage: { anchor: "feet", spriteH: 210, sizable: false, mirrored: true,
               ...SELF("the transformed-body branch of drawFighters (src/render.js)") },
  };
  // `bodyH` is the nearest enclosing creature's own height. A summon declared
  // inline in a special — Dagon's shikigami, Mahoraga, Kurourushi's brood —
  // never passes through the pool walk above, and its size is `h` on the config
  // rather than a `spriteH` on the move, so reading only the kit fields left
  // every one of them "sized by the code that spawns it". It is carried down
  // because a per-unit override names the art while the config above it
  // declares the size, which is the same merge specials.js does at spawn.
  const visit = (node, who, drawnBy = "centre", bodyH = null, nudge = NUDGED, site = null,
                 slot = null, launch = null, melee = null) => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (typeof node.type === "string" && DRAW_SITES[node.type]) {
      site = DRAW_SITES[node.type];
      drawnBy = site.anchor;
      const shown = { travels: !!site.travels, mirrored: !!site.travels || !!site.mirrored };
      nudge = site.nudge
        ? { nudge: true, ...shown }
        : { nudge: false, nudgeSite: site.site, ...shown };
      launch = LAUNCH[node.type] || null;
      melee = MELEE[node.type] || null;
    }
    if (Number.isFinite(node.h)) bodyH = node.h;
    // A creature config, wherever it hangs. `behavior` is the field spawnSummon
    // steers by and every creature has one, which makes it a better mark than
    // the special's `type`: Kurourushi's brood is `offspring` on an ULTIMATE, so
    // it never passes a `type: "summon"` node and was being filed as a
    // centre-anchored effect of unknown size.
    // A creature is drawn by summons.js wherever it hangs — including inside a
    // move whose own flash art is painted by hand — so it stands on its feet
    // AND gets its nudge back. Inheriting `nudge: false` from the move above it
    // would have taken the offset control off every creature declared inside a
    // burst.
    if (typeof node.behavior === "string" && Array.isArray(node.sprites)) {
      drawnBy = "feet";
      nudge = { nudge: true, travels: false };
      site = null;
    }
    if (isSharedKey(node.aura)) {
      // The mid-breath height, not `AURA_H`: this number is what a viewer draws
      // the picture at, and the game never draws it at the nominal one.
      // `footDy` travels with it because the aura's feet are not the fighter's
      // — anything previewing this has to stand it on the same line.
      put(node.aura, { h: AURA_PREVIEW_H, footDy: AURA_FOOT_DY, anchor: "feet",
                       owner: who, ...NUDGED, kind: "aura", installColor: node.color || null,
                       what: "the install aura's height around the fighter (render.js)" });
    }
    // A melee move's box belongs to the fighter, so it is described that way
    // rather than as something the drawing sits inside.
    const meleeBox = melee ? melee(node) : null;
    const hit = meleeBox
      ? { shape: "rect", w: meleeBox.w, h: meleeBox.h, from: "w/h", melee: meleeBox,
          what: "the box the SWING lands in — on the fighter, not on this drawing" }
      : hitOfNode(node);
    for (const [field, heightFields, ownHit] of SPRITE_FIELDS) {
      if (field === "aura" || !isSharedKey(node[field])) continue;
      const hf = heightFields.find((h) => Number.isFinite(node[`${h}Base`]) || Number.isFinite(node[h]));
      const h = hf ? (node[`${hf}Base`] ?? node[hf]) : null;
      // A drop declares one `h` and uses it twice — the height it is painted at
      // and the height of the box it lands in (randomDrop, specials.js) — so a
      // size set here moves the box with the art. That is the opposite of every
      // other hit shape, which is a number the art has to be matched TO, and
      // the workbench has to say which of the two it is showing.
      // Only where the box IS the drawing's own height (a drop). A melee box
      // shares the field name and nothing else.
      const followsSize = !!hit && !hit.melee && hit.from === "w/h" && hf === "h";
      // A handler that paints at a height of its own overrides the kit for the
      // one field it paints — `sprite`. Its `aura` and `domainSprite` are drawn
      // somewhere else entirely and keep their own answers.
      const fixed = site && field === "sprite" && Number.isFinite(site.spriteH) ? site : null;
      // A domain's backdrop is not placed on anything. It is cover-fitted to
      // the whole stage behind the fight (drawDomainBackdrop, render.js), so it
      // has no spawn point, no nudge and no size — the fit decides all three,
      // and the only thing the art has to get right is what it looks like at
      // the stage's own 1280x720 shape.
      if (field === "domainSprite") {
        put(node[field], { h: null, anchor: "centre", owner: who, nudge: false, sizable: false,
                           kind: "domain",
                           what: "cover-fitted to the whole stage behind the fight (render.js)" });
        continue;
      }
      put(node[field], { h: fixed ? fixed.spriteH : h, anchor: drawnBy, owner: who, ...nudge,
                         ...(fixed ? { sizable: false } : {}),
                         // Only the field the handler actually launches — a move's
                         // aura hangs on the fighter, not at the muzzle.
                         ...(launch && field === "sprite" && launch(node)
                           ? { launch: { ...launch(node), anim: SLOT_ANIM[slot] || null } } : {}),
                         hit: ownHit ? hitOfField(node, ownHit)
                                     : (followsSize ? { ...hit, followsSize } : hit),
                         what: fixed
                           ? `a height ${fixed.site} fixes at ${fixed.spriteH}px — the kit does not set it and neither can the slider`
                           : h ? "the height its move declares (the kit's own number)"
                               : "sized by the code that spawns it" });
    }
    for (const [field, heightField] of SPRITE_LIST_FIELDS) {
      if (!Array.isArray(node[field]) || poolLists.has(node[field])) continue;
      let h = node[`${heightField}Base`] ?? node[heightField] ?? null;
      let what = h ? "the height its move declares (the kit's own number)"
                   : "sized by the code that spawns it";
      // `sprites` is a creature's still list and nothing else, so a summon that
      // declares no `spriteH` is not unsized — it is drawn at its body height,
      // and at summons.js's own 110 when it does not name one either.
      if (h === null && field === "sprites" && drawnBy === "feet") {
        h = bodyH ?? 110;
        what = "the creature's height on stage (its kit's own `h`)";
      }
      for (const key of node[field]) put(key, { h, anchor: drawnBy, owner: who, hit, what, ...nudge });
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") {
        visit(value, who, drawnBy, bodyH, nudge, site, slot, launch, melee);
      }
    }
  };
  for (const key of CHARACTER_KEYS) {
    const c = CHARACTERS[key];
    // Slot by slot rather than the whole `specials` object at once: which slot a
    // move sits in IS which pose the fighter is in while they throw it, and that
    // is the pose the workbench has to stand beside the drawing.
    for (const [slot, def] of Object.entries(c?.specials || {})) {
      visit(def, c?.name || key, "centre", null, NUDGED, null, slot);
    }
    visit(c?.ultimate, c?.name || key, "centre", null, NUDGED, null, "ult");
  }
  // Stand-ins last: anything a real usage claimed keeps that usage.
  for (const [key, info] of standIns) put(key, info);

  return out;
}

/**
 * What the game does with this drawing, or null if nothing draws it.
 *
 *   h        the height it is painted at BEFORE the workbench's scale — null
 *            when the spawn site decides per instance
 *   anchor   which part of the drawing lands on the spawn point
 *   owner    who puts it on screen, for the panel to name
 *   nudge    whether that spawn site reads sharedAdjust, so a dx/dy and a tilt
 *            reach the screen. False for the two that paint straight from
 *            getImage, with `nudgeSite` naming which.
 *   hit      the region its move acts on, or null where the spawn site invents
 *            one the kit cannot describe. `followsSize` marks the one case
 *            where the box is the art's own height rather than a target for it.
 */
export function sharedSpriteInfo(key) {
  if (!key) return null;
  registry ||= buildRegistry();
  if (String(key).startsWith("domain:")) {
    return { h: null, anchor: "screen", owner: "a domain",
             what: "a full-screen backdrop, fitted to the stage — nothing to size or move" };
  }
  // A summon pose inherits its creature's entry, the same way its scale does.
  const parts = String(key).split(":");
  if (parts[0] === "summon" && parts.length === 3) {
    return registry.get(key) || registry.get(`${parts[0]}:${parts[1]}`) || null;
  }
  return registry.get(key) || null;
}

/** Forget the derived registry — the workbench rebuilds kits as it edits. */
export function clearSharedRegistry() { registry = null; }
