// Action Workbench (`workbench/?edit=actions`) — play any character action and
// jump straight to the sprites it uses.
//
// Like the sprite workbench, every pixel goes through the GAME'S OWN modules
// (assets.js, sprites.js, characters.js, moves.js), so the playback here is the
// same animation the match plays: same frames, same fps, same startup/active/
// recovery timing derived from moves.js. Nothing is re-implemented, which is
// the whole point — a pose that looks wrong here is wrong in the game.

import {
  loadCoreAssets, loadSharedImage, loadFrame, frameImage, frameMeta, getImage, spriteManifest,
} from "../src/assets.js";
import {
  drawCharFrame, currentFrame, warmAnchors, anchorScreenPos, resolvedAnim, animsOf,
} from "../src/sprites.js";
import { drawPlatformShape } from "../src/render.js";
import { CHARACTERS, CHARACTER_KEYS, animFor } from "../src/characters.js";
import { lightMove, heavyMove } from "../src/moves.js";
import { fighterTransform } from "../src/motion.js";
import { initTooltips } from "./tooltip.js";
import { makeCharLoader, frameLoaded } from "./lazy_sprites.js";
import { fitStageCanvas } from "./fit_stage.js";
import { SHIELD_MAX, MAX_FALL } from "../src/constants.js";
import { TUMBLE_SPIN_MAX, LAND_SQUASH_TIME, TAKEOFF_STRETCH_TIME } from "../src/config_tuning.js";

const $ = (id) => document.getElementById(id);
const view = $("actionsView");

const GROUND_Y = 470;
const AIR_LIFT = 150;          // how far off the floor aerial actions are drawn
const LOOP_HOLD = 1.6;         // seconds to run a looping anim before it ends

const BACKGROUNDS = [
  ["#12151f", "dark"], ["#5c6478", "grey"], ["#f2f4f8", "white"],
  ["#0f7a3d", "green"], ["#ff00ff", "magenta"], ["#7a3d0f", "brown"],
];

// Grounded movement / reaction states, in the order they read as a kit.
const STATES = [
  ["idle", "Idle"], ["run", "Run"], ["dash", "Dash"], ["jump", "Jump", true],
  ["fall", "Fall", true], ["land", "Land"], ["crouch", "Crouch"],
  ["shield", "Shield"], ["dodge", "Dodge"],
  // The two states a match actually plays; `dodge` above is only the fallback
  // for characters whose round-6 art never landed.
  ["dodge_roll", "Roll"], ["dodge_air", "Air dodge", true],
  ["ledge", "Ledge hang", true],
  ["hurt", "Hurt"], ["dizzy", "Dizzy"], ["charge", "Charge (smash)"],
  ["win", "Victory"],
];

const LIGHTS = [
  ["jab", "Jab 1", 0], ["jab", "Jab 2", 1], ["jab", "Jab 3 (finisher)", 2],
  ["side", "Side tilt"], ["up", "Up tilt"], ["down", "Down tilt (crouch)"],
  ["air", "Air light", 0, true], ["upAir", "Up air", 0, true], ["downAir", "Down air", 0, true],
];

const HEAVIES = [
  ["side", "Side smash"], ["up", "Up smash"], ["down", "Down smash"],
  ["air", "Air heavy", true],
];

const state = {
  char: "gojo",
  action: null,
  t: 0,
  playing: false,
  loop: true,
  speed: 1,
  zoom: 1.9,
  facing: 1,
  bg: BACKGROUNDS[0][0],
};

let canvas, ctx;

// ------------------------------------------------------- re-pointing actions
//
// Which sprite an action draws is `animOverrides` in the manifest: the game
// reads it in animsOf(), so a re-point needs no change to characters.js. This
// page writes the same structure the sprite workbench does, and exports it in
// the same shape, so one apply script serves both.
//
// "Original" means what is COMMITTED — the manifest as it loaded, overrides
// included. Reverting a slot returns to the file, not to whatever the kit said
// before some previous session's export.

/** charKey -> { animName: [frameKey, ...] }, captured before any edit. */
const originalAnims = {};

function rememberAnims(charKey) {
  if (originalAnims[charKey]) return;
  const snap = {};
  // Snapshot what the page actually DRAWS, not what the kit declares. The two
  // differ wherever an animation names art that has not been delivered — the
  // wind-up/strike pairs declare attack_heavy_a/_b for the whole roster and
  // resolve to the delivered single pose until it lands. Snapshotting the
  // declaration would mark every one of those slots as changed on sight.
  for (const name of Object.keys(animsOf(charKey))) {
    snap[name] = resolvedAnim(charKey, name).frames.slice();
  }
  originalAnims[charKey] = snap;
}

function originalFrames(charKey, animName) {
  return originalAnims[charKey]?.[animName] ?? null;
}

/** Point one slot of one animation at a different sprite. */
function setActionFrame(charKey, animName, index, frameKey) {
  rememberAnims(charKey);
  spriteManifest.animOverrides ||= {};
  const forChar = (spriteManifest.animOverrides[charKey] ||= {});
  const original = originalFrames(charKey, animName);
  const current = (forChar[animName] || original || []).slice();
  current[index] = frameKey;
  // Back to exactly what was committed: drop the override rather than storing a
  // copy of it, so an export never carries a change that changes nothing.
  if (original && current.length === original.length && current.every((f, i) => f === original[i])) {
    delete forChar[animName];
  } else {
    forChar[animName] = current;
  }
  if (!Object.keys(forChar).length) delete spriteManifest.animOverrides[charKey];
}

/** Animations this character has re-pointed away from what is committed. */
function dirtyActions(charKey) {
  const out = {};
  const overrides = spriteManifest?.animOverrides?.[charKey] || {};
  for (const [name, frames] of Object.entries(overrides)) {
    if (!Array.isArray(frames) || !frames.length) continue;
    const original = originalFrames(charKey, name);
    if (!original || frames.length !== original.length || frames.some((f, i) => f !== original[i])) {
      out[name] = frames;
    }
  }
  return out;
}

function editedCharacters() {
  return Object.keys(originalAnims).filter((c) => Object.keys(dirtyActions(c)).length);
}

// ---------------------------------------------------------- related sprites
//
// What to offer when re-pointing an action. A jump should list the jumping
// poses, not thirty silhouettes — but the last word belongs to whoever is
// looking, so the modal can always expand to the character's whole set. An
// unconventional choice is a legitimate one; it just should not be the default
// thing on screen.
const RELATED = [
  [/^idle$/, [/^idle/, /^r0c/]],
  [/^(run|dash)$/, [/^run/, /^dash$/, /^r1c/]],
  [/^(jump|fall|dodge_air)$/, [/^jump/, /^fall$/, /^dodge_air$/, /^r2c/]],
  [/^(land|crouch|crouchAttack)$/, [/^land$/, /^crouch/, /^r4c/]],
  [/^shield$/, [/^guard$/, /^r4c/]],
  [/^(dodge|dodge_roll)$/, [/^dodge/, /^r1c2$/]],
  [/^ledge$/, [/^ledge/]],
  [/^hurt$/, [/^hurt$/, /^dizzy$/]],
  [/^dizzy$/, [/^dizzy$/, /^hurt$/]],
  [/^charge$/, [/^charge$/, /^attack_heavy/]],
  [/^win$/, [/^victory$/, /^idle/]],
  [/(Heavy|Light|light)$/, [/^attack_/, /^r2c/, /^r3c/]],
  [/^special/, [/^special_/, /^r3c/]],
  [/^ult$/, [/^ult_/, /^r3c/]],
];

function allFramesOf(charKey) {
  return Object.keys(spriteManifest?.characters?.[charKey] || {});
}

/** Sprites worth offering for this animation, in manifest order. Falls back to
 *  the whole set when an animation matches no family — better an unfiltered
 *  list than an empty one. */
function relatedFrames(charKey, animName) {
  const rules = RELATED.find(([test]) => test.test(animName))?.[1];
  if (!rules) return allFramesOf(charKey);
  const hit = allFramesOf(charKey).filter((k) => rules.some((r) => r.test(k)));
  return hit.length ? hit : allFramesOf(charKey);
}

// ------------------------------------------------------------ action model

/** Every "effect:*" / "summon:*" image referenced anywhere inside a params
 *  object. Specials hide them under different keys (sprite, aura,
 *  domainSprite, …), so scan by value rather than guessing key names. */
function spriteRefs(obj, out = []) {
  if (!obj || typeof obj !== "object") return out;
  for (const v of Object.values(obj)) {
    if (typeof v === "string" && /^(effect|summon):/.test(v)) {
      if (!out.includes(v)) out.push(v);
    } else if (v && typeof v === "object") spriteRefs(v, out);
  }
  return out;
}

function fmt(n) {
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "—";
}

function attackAction(id, label, move, group, air) {
  const total = (move.delay || 0) + (move.dur || 0) + (move.recover || 0);
  return {
    id, label, group, air,
    anim: move.anim,
    duration: total,
    move,
    facts: [
      `${fmt(move.dmg)} dmg`,
      `kb ${fmt(move.baseKb)}/${fmt(move.growth)}`,
      `startup ${Math.round(move.delay * 1000)}ms`,
      `active ${Math.round(move.dur * 1000)}ms`,
      `recover ${Math.round(move.recover * 1000)}ms`,
      ...(move.effect ? [move.effect] : []),
      ...(move.spike ? ["spike"] : []),
    ],
    sub: move.label || null,
  };
}

/** Every action a character can be seen performing, grouped for the panel. */
function actionsFor(charKey) {
  const char = CHARACTERS[charKey];
  const groups = [];

  groups.push({
    name: "States",
    items: STATES.map(([anim, label, air]) => {
      const a = resolvedAnim(charKey, anim);
      return {
        id: `state:${anim}`, label, group: "States", anim, air,
        duration: Math.max(a.frames.length / (a.fps || 1), 0.3),
        loopAnim: !!a.loop,
        facts: [`${a.frames.length} frame${a.frames.length === 1 ? "" : "s"}`,
                `${a.fps} fps`, a.loop ? "loops" : "one-shot"],
      };
    }),
  });

  groups.push({
    name: "Light attacks",
    items: LIGHTS.map(([variant, label, step = 0, air]) =>
      attackAction(`light:${variant}:${step}`, label,
        lightMove(char, variant, step), "Light attacks", air)),
  });

  groups.push({
    name: "Heavy attacks",
    items: HEAVIES.map(([variant, label, air]) =>
      attackAction(`heavy:${variant}`, label,
        heavyMove(char, variant, 0), "Heavy attacks", air)),
  });

  const slots = [["neutral", "specialNeutral", "Neutral B"],
                 ["side", "specialSide", "Side B"],
                 ["down", "specialDown", "Down B"]];
  groups.push({
    name: "Specials",
    items: slots.flatMap(([slot, anim, prefix]) => {
      const cfg = char.specials?.[slot];
      if (!cfg) return [];
      const a = resolvedAnim(charKey, anim);
      return [{
        id: `special:${slot}`, label: `${prefix} — ${cfg.name}`, group: "Specials", anim,
        duration: a.loop ? LOOP_HOLD : Math.max(a.frames.length / (a.fps || 1), 0.45),
        desc: cfg.desc,
        extras: spriteRefs(cfg.p),
        facts: [cfg.type, `${fmt(cfg.cooldown)}s cooldown`,
                ...(cfg.p?.dmg ? [`${fmt(cfg.p.dmg)} dmg`] : [])],
      }];
    }),
  });

  if (char.ultimate) {
    const a = resolvedAnim(charKey, "ult");
    groups.push({
      name: "Ultimate",
      items: [{
        id: "ult", label: char.ultimate.name, group: "Ultimate", anim: "ult",
        duration: a.loop ? LOOP_HOLD : Math.max(a.frames.length / (a.fps || 1), 0.8),
        desc: char.ultimate.desc,
        extras: spriteRefs(char.ultimate.p),
        facts: [char.ultimate.type,
                ...(char.ultimate.p?.dmg ? [`${fmt(char.ultimate.p.dmg)} dmg`] : []),
                ...(char.ultimate.p?.duration ? [`${fmt(char.ultimate.p.duration)}s`] : [])],
      }],
    });
  }

  return groups;
}

// ------------------------------------------------------- procedural motion
//
// Most states are one still frame, so the game leans, tumbles, swings and
// breathes them procedurally (src/motion.js). Judging that here means standing
// up the fighter state the real match would be in while this action plays —
// the transform itself then comes from the game's own code, unmodified.

function mockFighter(a) {
  const f = {
    id: 1, charKey: state.char, char: CHARACTERS[state.char],
    x: 0, y: 0, vx: 0, vy: 0, facing: state.facing,
    animKey: a.anim, animTime: state.t,
    spin: 0, spinAngle: 0, hitstun: 0, dizzy: 0, ledge: null,
    action: null, charging: null, shielding: false,
    grounded: !a.air, dashT: 0, dashDir: state.facing, turnLock: 0,
    shield: SHIELD_MAX, landT: 0, takeoffT: 0, shakeMag: 0, fastFalling: false,
  };
  const k = state.t / Math.max(a.duration, 1e-3);

  if (a.move) {
    f.action = { kind: "attack", t: state.t, dur: a.duration, move: a.move };
    return f;
  }
  switch (a.anim) {
    case "dodge_roll": case "dodge":
      f.action = { kind: "dodge", t: state.t, dur: a.duration };
      f.vx = 500 * state.facing;
      break;
    case "dodge_air":
      f.action = { kind: "dodge", t: state.t, dur: a.duration };
      f.grounded = false; f.vx = 340 * state.facing;
      break;
    case "run": f.vx = f.char.stats.speed * state.facing; break;
    case "dash": f.dashT = 0.2; f.vx = f.char.stats.speed * 1.45 * state.facing; break;
    case "jump":
      f.grounded = false; f.vy = -f.char.stats.jump;
      f.takeoffT = TAKEOFF_STRETCH_TIME * (1 - k);
      break;
    case "fall":
      f.grounded = false; f.vy = MAX_FALL * 0.8; f.fastFalling = true;
      f.vx = f.char.stats.airSpeed * 0.7 * state.facing;
      break;
    case "land": f.landT = LAND_SQUASH_TIME * (1 - k); break;
    case "charge": f.charging = { t: state.t, variant: "side" }; break;
    case "shield": f.shielding = true; f.shield = SHIELD_MAX * (1 - k * 0.9); break;
    case "dizzy": f.dizzy = 1; break;
    case "ledge":
      f.grounded = false;
      f.ledge = { side: state.facing === 1 ? -1 : 1, edgeX: 0, plat: { y: 0 } };
      break;
    case "hurt":
      // show the tumble, which is the whole point of a one-frame hurt pose
      f.grounded = false; f.hitstun = 1; f.vx = 700 * -state.facing;
      f.spin = TUMBLE_SPIN_MAX * 0.45 * -state.facing;
      f.spinAngle = f.spin * state.t;
      break;
  }
  return f;
}

// ------------------------------------------------------------------- draw

function activeWindow(a) {
  if (!a?.move) return null;
  return [a.move.delay || 0, (a.move.delay || 0) + (a.move.dur || 0)];
}

function drawBoxes(a, cx, feetY) {
  const z = state.zoom;
  // Hurtbox: combat.js measures it from the fighter's feet in world px, so it
  // only needs the viewer zoom — the sprite scale is already baked into the art.
  const crouch = a.anim === "crouch" || a.anim === "crouchAttack";
  const hb = crouch ? { x: -36, y: -68, w: 72, h: 68 }
           : a.anim === "ledge" ? { x: -30, y: -82, w: 60, h: 84 }
           : { x: -32, y: -108, w: 64, h: 108 };
  ctx.strokeStyle = "rgba(120, 190, 255, 0.75)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(cx + hb.x * z, feetY + hb.y * z, hb.w * z, hb.h * z);
  ctx.setLineDash([]);

  const win = activeWindow(a);
  if (!win || state.t < win[0] || state.t >= win[1]) return;
  const m = a.move;
  // Mirrors combat.hitboxRect: ox is measured from the fighter's front edge.
  const x = state.facing === 1 ? cx + m.ox * z : cx - (m.ox + m.w) * z;
  ctx.fillStyle = "rgba(255, 90, 120, 0.22)";
  ctx.strokeStyle = "rgba(255, 90, 120, 0.9)";
  ctx.fillRect(x, feetY + m.oy * z, m.w * z, m.h * z);
  ctx.strokeRect(x, feetY + m.oy * z, m.w * z, m.h * z);
}

function render() {
  ctx.fillStyle = state.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const a = state.action;
  if (!a) return;

  const cx = canvas.width / 2;
  const feetY = GROUND_Y - (a.air ? AIR_LIFT : 0);

  if ($("aShowPlatform").checked) {
    ctx.save();
    ctx.translate(0, GROUND_Y);
    drawPlatformShape(ctx, { x: cx - 340, y: 0, w: 680, h: 42, kind: "main" });
    ctx.restore();
  }

  const frame = currentFrame(state.char, a.anim, state.t);
  // Art streams in per character, so playback can reach a frame before its
  // image has. drawCharFrame draws nothing in that case, which would read as a
  // hole in the animation — hold the spinner over it instead.
  if (!frameLoaded(state.char, frame)) { drawLoadingSpinner(cx, feetY, frame); return; }
  const m = $("aMotion").checked ? fighterTransform(mockFighter(a)) : null;
  drawCharFrame(ctx, state.char, frame, cx, feetY, {
    scale: CHARACTERS[state.char].scale * state.zoom,
    facing: state.facing,
    rotation: m?.rotation ?? 0,
    scaleX: m?.scaleX ?? 1,
    scaleY: m?.scaleY ?? 1,
    offsetX: m?.offsetX ?? 0,
    offsetY: m?.offsetY ?? 0,
  });

  if ($("aShowAnchor").checked) drawComMarker(frame, cx, feetY);
  if ($("aShowBoxes").checked) drawBoxes(a, cx, feetY);

  const win = activeWindow(a);
  const phase = !win ? "" : state.t < win[0] ? "startup"
              : state.t < win[1] ? "ACTIVE" : "recovery";
  $("aFrameTag").innerHTML =
    `${state.char}/<b>${frame}</b> <span class="state">${a.anim}</span>` +
    (phase ? ` <span class="${phase === "ACTIVE" ? "flag" : "state"}">${phase}</span>` : "");

  paintTimeline();
  // The sprite tiles deliberately do NOT follow the playhead. They are a
  // control surface — click one to inspect or re-point it — and a tile that
  // highlights itself as the animation runs reads as a selection nobody made.
}

/** The pivot the motion above turns about, so a rotation that looks wrong can
 *  be traced to its anchor and fixed in the sprite workbench. */
function drawComMarker(frameKey, cx, feetY) {
  const p = anchorScreenPos(state.char, frameKey, cx, feetY, {
    scale: CHARACTERS[state.char].scale * state.zoom, facing: state.facing, name: "com",
  });
  if (!p) return;
  const px = p.x, py = p.y;
  ctx.save();
  ctx.strokeStyle = "rgba(120, 235, 190, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px - 13, py); ctx.lineTo(px - 3, py);
  ctx.moveTo(px + 3, py); ctx.lineTo(px + 13, py);
  ctx.moveTo(px, py - 13); ctx.lineTo(px, py - 3);
  ctx.moveTo(px, py + 3); ctx.lineTo(px, py + 13);
  ctx.stroke();
  ctx.restore();
}

function paintTimeline() {
  const a = state.action;
  const bar = $("aTimeline");
  if (!a) return;
  const pct = Math.min(1, state.t / a.duration) * 100;
  bar.querySelector(".play-head").style.left = `${pct}%`;
  $("aTime").textContent = `${state.t.toFixed(2)}s / ${a.duration.toFixed(2)}s`;
}

function buildTimeline() {
  const a = state.action;
  const bar = $("aTimeline");
  bar.innerHTML = "";
  if (!a) return;
  const win = activeWindow(a);
  const seg = (from, to, cls, title) => {
    const d = document.createElement("div");
    d.className = `seg ${cls}`;
    d.style.left = `${(from / a.duration) * 100}%`;
    d.style.width = `${((to - from) / a.duration) * 100}%`;
    d.title = title;
    bar.appendChild(d);
  };
  if (win) {
    seg(0, win[0], "startup", "startup");
    seg(win[0], win[1], "active", "active");
    seg(win[1], a.duration, "recover", "recovery");
  } else {
    seg(0, a.duration, "neutral", a.anim);
  }
  // Frame boundaries, so a two-frame swing shows exactly when it switches.
  const anim = resolvedAnim(state.char, a.anim);
  const step = 1 / (anim.fps || 1);
  for (let t = step; t < a.duration - 1e-3; t += step) {
    const d = document.createElement("div");
    d.className = "tick";
    d.style.left = `${(t / a.duration) * 100}%`;
    bar.appendChild(d);
  }
  const head = document.createElement("div");
  head.className = "play-head";
  bar.appendChild(head);
}

// -------------------------------------------------------------- the drawer

function spriteTile({ href, thumb, title, sub, key, badge, changed, was, pending }) {
  const el = document.createElement(href ? "a" : "div");
  el.className = "sprite-tile" + (changed ? " changed" : "");
  if (href) el.href = href;
  if (key) el.dataset.frame = key;
  if (changed) el.title = `re-pointed from ${was}`;
  const box = document.createElement("div");
  box.className = "thumb";
  if (thumb) {
    const img = document.createElement("img");
    img.src = thumb;
    box.appendChild(img);
  } else if (pending) {
    // Frames stream in per character, so "no image yet" is the normal state
    // for a drawer opened while the fetch is still in flight — and the canvas
    // beside it animates fine, because the player loads what it draws. Saying
    // "missing" there accused the art of not existing. Wait for the frame the
    // way the sprite picker does, and only call it missing if it really is.
    box.classList.add("missing");
    box.textContent = "loading…";
    loadFrame(pending.char, pending.key).then(() => {
      if (!box.isConnected) return;
      const late = frameImage(pending.char, pending.key);
      box.textContent = late ? "" : "missing";
      if (!late) return;
      box.classList.remove("missing");
      const im = document.createElement("img");
      im.src = late.src;
      box.appendChild(im);
    });
  } else {
    box.classList.add("missing");
    box.textContent = "missing";
  }
  if (badge) {
    const b = document.createElement("i");
    b.className = "slot-badge";
    b.textContent = badge;
    box.appendChild(b);
  }
  const name = document.createElement("strong");
  name.textContent = title;
  const note = document.createElement("span");
  note.textContent = sub;
  el.append(box, name, note);
  return el;
}

// ------------------------------------------------------- tile context menu

function closeTileMenu() {
  document.querySelector(".tile-menu")?.remove();
  document.removeEventListener("mousedown", onTileMenuOutside, true);
}

function onTileMenuOutside(e) {
  if (!e.target.closest(".tile-menu, .sprite-tile")) closeTileMenu();
}

/** Two things you can do with a sprite an action uses: go look at it properly,
 *  or point the action at a different one. */
function openTileMenu(tile, action, index, frameKey) {
  const open = document.querySelector(".tile-menu");
  closeTileMenu();
  if (open?.dataset.slot === `${action.anim}:${index}`) return;   // click again to close

  const menu = document.createElement("div");
  menu.className = "tile-menu";
  menu.dataset.slot = `${action.anim}:${index}`;

  const item = (label, sub, onPick) => {
    const b = document.createElement("button");
    b.innerHTML = `<span>${label}</span>` + (sub ? `<i>${sub}</i>` : "");
    b.onclick = (e) => { e.stopPropagation(); closeTileMenu(); onPick(); };
    menu.appendChild(b);
  };

  // Built from the CURRENT frame, so after a re-point this opens the sprite the
  // action actually draws rather than the one it shipped with.
  item("View in sprite workbench", frameKey, () => {
    window.location.href = `./?char=${state.char}&frame=${encodeURIComponent(frameKey)}`;
  });
  item("Change sprite…", `slot ${index + 1} of "${action.anim}"`,
       () => openSpritePicker(action, index, frameKey));

  const committed = originalFrames(state.char, action.anim)?.[index];
  if (committed !== undefined && committed !== frameKey) {
    item("Revert to committed", committed, () => {
      setActionFrame(state.char, action.anim, index, committed);
      afterActionEdit(action);
    });
  }

  const box = tile.getBoundingClientRect();
  menu.style.left = `${Math.min(box.left, window.innerWidth - 260)}px`;
  menu.style.top = `${Math.min(box.bottom + 4, window.innerHeight - 140)}px`;
  document.body.appendChild(menu);
  document.addEventListener("mousedown", onTileMenuOutside, true);
}

/** Redraw everything a re-point changes: the tiles, the timeline, the export
 *  button, and the animation itself — which is the point of the exercise. */
function afterActionEdit(action) {
  openDrawer(action);
  buildTimeline();
  refreshExportState();
  state.t = 0;
  replay();
}

function openDrawer(a) {
  const drawer = $("aDrawer");
  drawer.classList.add("open");
  document.body.classList.add("drawer-open");
  $("aDrawerTitle").textContent = a.label;
  $("aDrawerSub").textContent =
    `${CHARACTERS[state.char].name} · anim "${a.anim}"` + (a.sub ? ` · ${a.sub}` : "");
  $("aDrawerFacts").innerHTML = (a.facts || [])
    .map((f) => `<span class="fact">${f}</span>`).join("");
  $("aDrawerDesc").textContent = a.desc || "";
  $("aDrawerDesc").hidden = !a.desc;

  rememberAnims(state.char);
  const anim = resolvedAnim(state.char, a.anim);
  const grid = $("aSprites");
  grid.innerHTML = "";
  // One tile per SLOT rather than per distinct sprite: a slot is what a
  // re-point addresses, and two slots showing the same drawing is a fact about
  // the animation worth seeing rather than one to collapse away.
  anim.frames.forEach((key, index) => {
    const img = frameImage(state.char, key);
    const meta = frameMeta(state.char, key);
    const committed = originalFrames(state.char, a.anim)?.[index];
    const changed = committed !== undefined && committed !== key;
    const tile = spriteTile({
      thumb: img?.src,
      title: key,
      sub: meta?.file ? meta.file.split("/").pop() : "not in manifest",
      key,
      pending: { char: state.char, key },
      badge: anim.frames.length > 1 ? `${index + 1} of ${anim.frames.length}` : "",
      changed,
      was: changed ? committed : "",
    });
    tile.onclick = (e) => {
      e.preventDefault();
      openTileMenu(tile, a, index, key);
    };
    grid.appendChild(tile);
  });

  // Effects and summons the move spawns. They live outside the character
  // manifest, so there is nothing for the sprite workbench to edit — the tile
  // opens the PNG itself instead.
  const extras = a.extras || [];
  $("aExtrasWrap").hidden = extras.length === 0;
  const ex = $("aExtras");
  const drawExtras = () => {
    ex.innerHTML = "";
    for (const ref of extras) {
      const img = getImage(ref);
      ex.appendChild(spriteTile({
        href: img?.src,
        thumb: img?.src,
        title: ref.split(":")[1],
        sub: ref.startsWith("summon:") ? "summon" : "effect",
      }));
    }
  };
  drawExtras();
  // Effects and summons are no longer bulk-loaded at boot, so the two or three
  // this move spawns are fetched on their own and the tiles redrawn once they
  // land. Redrawn only if this drawer is still showing the same action.
  const forAction = a;
  Promise.all(extras.filter((ref) => !getImage(ref)).map(loadSharedImage))
    .then((got) => { if (got.some(Boolean) && state.action === forAction) drawExtras(); });
}

// ----------------------------------------------------------------- export
//
// Same payload shape the sprite workbench exports, so one apply script serves
// both pages and neither has to know the other exists.

function exportPayloads() {
  return editedCharacters().sort().map((char) => ({
    character: char,
    animOverrides: dirtyActions(char),
  }));
}

function refreshExportState() {
  const payloads = exportPayloads();
  const slots = payloads.reduce(
    (n, p) => n + Object.keys(p.animOverrides).length, 0);
  const json = payloads.length
    ? JSON.stringify(payloads.length === 1 ? payloads[0] : payloads, null, 2)
    : "";
  $("aExportOut").value = json || "// no changes yet";
  $("aExport").disabled = !payloads.length;
  $("aExportCount").textContent = payloads.length
    ? `${slots} action${slots === 1 ? "" : "s"} across ${payloads.length} character${payloads.length === 1 ? "" : "s"}`
    : "none yet";
}

function downloadExport() {
  const payloads = exportPayloads();
  if (!payloads.length) return;
  const json = JSON.stringify(payloads.length === 1 ? payloads[0] : payloads, null, 2);
  // Named after what is in it, like the sprite workbench's export: a folder of
  // these should be readable months later without opening them.
  const who = payloads.length === 1 ? payloads[0].character : "roster";
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${who}-actions.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ------------------------------------------------------------ sprite picker

let pickerAll = false;   // survives reopening, so "show everything" stays on

function openSpritePicker(action, index, currentKey) {
  document.querySelector(".picker-modal")?.remove();

  const modal = document.createElement("div");
  modal.className = "picker-modal";
  const backdrop = document.createElement("div");
  backdrop.className = "picker-backdrop";
  backdrop.onclick = () => modal.remove();

  const panel = document.createElement("div");
  panel.className = "picker-panel";

  const head = document.createElement("header");
  const heading = document.createElement("div");
  heading.innerHTML = `<strong>Choose a sprite</strong>`
    + `<span class="sub">${CHARACTERS[state.char].name} · ${action.label}`
    + ` · slot ${index + 1} of "${action.anim}"</span>`;
  const buttons = document.createElement("div");
  buttons.className = "picker-actions";
  const expand = document.createElement("button");
  expand.className = "ghost sm";
  const close = document.createElement("button");
  close.className = "ghost sm";
  close.textContent = "Close";
  close.onclick = () => modal.remove();
  buttons.append(expand, close);
  head.append(heading, buttons);

  const grid = document.createElement("div");
  grid.className = "picker-grid";

  const draw = () => {
    const related = relatedFrames(state.char, action.anim);
    const all = allFramesOf(state.char);
    // Expanding is additive and keeps the related ones first, so the sensible
    // choices do not get shuffled into the middle of the full set.
    const keys = pickerAll ? [...related, ...all.filter((k) => !related.includes(k))] : related;
    expand.textContent = pickerAll
      ? `Showing all ${all.length} — show only related`
      : `Show all ${all.length} sprites`;
    grid.innerHTML = "";
    if (!keys.length) {
      const p = document.createElement("p");
      p.className = "note";
      p.textContent = "This character has no sprites in the manifest.";
      grid.appendChild(p);
    }
    let firstUnrelated = true;
    for (const key of keys) {
      if (pickerAll && !related.includes(key) && firstUnrelated) {
        firstUnrelated = false;
        const sep = document.createElement("p");
        sep.className = "picker-sep";
        sep.textContent = "Everything else";
        grid.appendChild(sep);
      }
      grid.appendChild(pickerTile(action, index, key, currentKey, modal));
    }
  };
  expand.onclick = () => { pickerAll = !pickerAll; draw(); };
  draw();

  panel.append(head, grid);
  modal.append(backdrop, panel);
  document.body.appendChild(modal);

  const onKey = (e) => {
    if (e.key !== "Escape") return;
    modal.remove();
    document.removeEventListener("keydown", onKey, true);
  };
  document.addEventListener("keydown", onKey, true);
}

function pickerTile(action, index, key, currentKey, modal) {
  const meta = frameMeta(state.char, key);
  const img = frameImage(state.char, key);
  const el = document.createElement("button");
  el.className = "picker-tile" + (key === currentKey ? " current" : "");
  const box = document.createElement("div");
  box.className = "thumb";
  if (img) {
    const im = document.createElement("img");
    im.src = img.src;
    box.appendChild(im);
  } else {
    // The streamer fetches this character's frames in the background, so a
    // sprite can be pickable before its art has arrived.
    box.classList.add("missing");
    box.textContent = "loading…";
    loadFrame(state.char, key).then(() => {
      const late = frameImage(state.char, key);
      if (!late || !box.isConnected) return;
      box.classList.remove("missing");
      box.textContent = "";
      const im = document.createElement("img");
      im.src = late.src;
      box.appendChild(im);
    });
  }
  const label = document.createElement("span");
  label.innerHTML = `${key}<i>${meta?.file ? meta.file.split("/").pop() : "not in manifest"}</i>`;
  el.append(box, label);
  el.onclick = () => {
    modal.remove();
    if (key === currentKey) return;
    setActionFrame(state.char, action.anim, index, key);
    afterActionEdit(action);
  };
  return el;
}

function closeDrawer() {
  $("aDrawer").classList.remove("open");
  document.body.classList.remove("drawer-open");
}

// ------------------------------------------------------------------ panel

function buildActionList() {
  const wrap = $("aActions");
  wrap.innerHTML = "";
  for (const group of actionsFor(state.char)) {
    if (!group.items.length) continue;
    const h = document.createElement("label");
    h.textContent = group.name;
    wrap.appendChild(h);
    const list = document.createElement("div");
    list.className = "action-list";
    for (const item of group.items) {
      const b = document.createElement("button");
      b.className = "action-btn" + (state.action?.id === item.id ? " sel" : "");
      b.innerHTML = `<span>${item.label}</span><em>${item.anim}</em>`;
      b.onclick = () => playAction(item);
      list.appendChild(b);
    }
    wrap.appendChild(list);
  }
  // Keep the playing action visible when it was chosen by URL or carried over
  // from another character rather than clicked. Scrolling the panel directly
  // (rather than scrollIntoView) keeps the page itself put.
  const sel = wrap.querySelector(".action-btn.sel");
  if (sel) wrap.scrollTop = Math.max(0, sel.offsetTop - wrap.clientHeight / 2);
}

function playAction(a) {
  state.action = a;
  state.t = 0;
  state.playing = true;
  rememberInUrl();
  // The pose this action opens on may still be queued behind the rest of the
  // set; pull it forward so playback starts on art rather than a spinner.
  charLoader.prioritize(currentFrame(state.char, a.anim, 0));
  buildActionList();
  buildTimeline();
  openDrawer(a);
  render();
}

function replay() {
  if (!state.action) return;
  state.t = 0;
  state.playing = true;
}

/** Shown where the pose will be while its art is still on the way. The action
 *  workbench already runs a rAF loop, so this needs no animation of its own. */
function drawLoadingSpinner(cx, feetY, frameKey) {
  const t = performance.now() / 1000;
  const cy = feetY - 150;
  ctx.save();
  ctx.strokeStyle = "rgba(120, 170, 255, 0.28)";
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "rgba(120, 170, 255, 0.95)";
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(cx, cy, 26, t * 4, t * 4 + 1.5); ctx.stroke();
  ctx.fillStyle = "rgba(154, 164, 192, 0.9)";
  ctx.font = "600 12px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`loading ${state.char}/${frameKey}…`, cx, cy + 52);
  ctx.restore();
}

// ------------------------------------------------------------------- loop

let last = 0;
function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const a = state.action;
  if (a && state.playing) {
    state.t += dt * state.speed;
    if (state.t >= a.duration) {
      if (state.loop) state.t = 0;
      else { state.t = a.duration; state.playing = false; $("aPlay").textContent = "▶ Replay"; }
    }
  }
  render();
  requestAnimationFrame(tick);
}

// ------------------------------------------------------------------ chrome

function markup() {
  view.className = "layout";
  view.innerHTML = `
    <section class="stage-col">
      <div class="stage-fit">
        <div class="stage-wrap">
          <canvas id="aStage" width="760" height="620"></canvas>
          <div id="aFrameTag" class="frame-tag">pick an action →</div>
        </div>
      </div>

      <div class="transport">
        <button id="aPlay" class="ghost sm">▶ Replay</button>
        <div id="aTimeline" class="timeline"></div>
        <span id="aTime" class="mono dim">0.00s</span>
      </div>

      <div class="row">
        <div class="group grow">
          <label>Viewer zoom <span class="sub" id="aZoomVal">1.9x</span></label>
          <input type="range" id="aZoom" min="0.6" max="5" step="0.05" value="1.9">
        </div>
        <div class="group grow">
          <label>Playback speed <span class="sub" id="aSpeedVal">1x</span></label>
          <input type="range" id="aSpeed" min="0.1" max="1.5" step="0.05" value="1">
        </div>
        <div class="group">
          <label>Background</label>
          <div id="aBg" class="swatches"></div>
        </div>
      </div>

      <div class="group">
        <label data-help="Frames, fps and startup/active/recovery come from the game&apos;s own &lt;code&gt;characters.js&lt;/code&gt; and &lt;code&gt;moves.js&lt;/code&gt;, so the playback above is what a match plays. Aerials are drawn off the floor.&lt;br&gt;&lt;br&gt;&lt;b&gt;Procedural motion&lt;/b&gt; runs the real &lt;code&gt;motion.js&lt;/code&gt; against the fighter state this action implies — the tumble on Hurt, the roll on Roll, the swing arc on attacks. Untick to see the raw frames. Anything that pivots wrongly is an anchor to fix in the sprite workbench.">Options</label>
        <div class="chips">
          <label class="chip"><input type="checkbox" id="aLoop" checked> Loop</label>
          <label class="chip"><input type="checkbox" id="aShowPlatform" checked> Game platform</label>
          <label class="chip"><input type="checkbox" id="aShowBoxes"> Hurtbox / hitbox</label>
          <label class="chip"><input type="checkbox" id="aFlip"> Face left</label>
          <label class="chip"><input type="checkbox" id="aMotion" checked> Procedural motion</label>
          <label class="chip"><input type="checkbox" id="aShowAnchor"> Centre of mass</label>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="group">
        <label for="aChar">Character</label>
        <select id="aChar"></select>
      </div>
      <div id="aActions" class="actions-panel"></div>

      <div class="group" id="aExportGroup">
        <label data-help="Re-pointing an action writes &lt;code&gt;animOverrides&lt;/code&gt; into the manifest in memory. This downloads those changes for &lt;b&gt;every character edited this session&lt;/b&gt;, in the same shape the sprite workbench exports, so &lt;code&gt;tools/apply_sprite_adjustments.py&lt;/code&gt; applies both without knowing which page produced them.">Changes <span class="sub" id="aExportCount">none yet</span></label>
        <button id="aExport" class="ghost sm" disabled>Download JSON</button>
        <textarea id="aExportOut" class="export-out" rows="4" readonly
                  placeholder="// no changes yet"></textarea>
      </div>
    </section>

    <div id="aDrawer" class="drawer">
      <div class="drawer-bar">
        <div>
          <strong id="aDrawerTitle">—</strong>
          <span id="aDrawerSub" class="dim"></span>
        </div>
        <div id="aDrawerFacts" class="facts"></div>
        <button id="aDrawerClose" class="ghost sm">Close</button>
      </div>
      <p id="aDrawerDesc" class="note" hidden></p>
      <label>Sprites used <span class="sub">click one to view it or point this action at a different sprite</span></label>
      <div id="aSprites" class="sprite-grid"></div>
      <div id="aExtrasWrap" hidden>
        <label>Effects &amp; summons <span class="sub">opens the PNG</span></label>
        <div id="aExtras" class="sprite-grid"></div>
      </div>
    </div>`;
}

async function boot() {
  markup();
  canvas = $("aStage");
  ctx = canvas.getContext("2d");
  fitStageCanvas(canvas);

  const sel = $("aChar");
  for (const key of CHARACTER_KEYS) {
    const o = document.createElement("option");
    o.value = key; o.textContent = CHARACTERS[key].name;
    sel.appendChild(o);
  }
  sel.onchange = () => setChar(sel.value);

  const sw = $("aBg");
  BACKGROUNDS.forEach(([colour, name], i) => {
    const b = document.createElement("button");
    b.style.background = colour; b.title = name;
    if (i === 0) b.classList.add("on");
    b.onclick = () => {
      state.bg = colour;
      [...sw.children].forEach((c) => c.classList.remove("on"));
      b.classList.add("on");
    };
    sw.appendChild(b);
  });

  $("aZoom").oninput = (e) => {
    state.zoom = parseFloat(e.target.value);
    $("aZoomVal").textContent = `${state.zoom.toFixed(2)}x`;
  };
  $("aSpeed").oninput = (e) => {
    state.speed = parseFloat(e.target.value);
    $("aSpeedVal").textContent = `${state.speed.toFixed(2)}x`;
  };
  $("aLoop").onchange = (e) => {
    state.loop = e.target.checked;
    if (state.loop) replay();
  };
  $("aFlip").onchange = (e) => { state.facing = e.target.checked ? -1 : 1; };
  $("aPlay").onclick = () => { replay(); $("aPlay").textContent = "▶ Replay"; };
  $("aDrawerClose").onclick = () => closeDrawer();
  $("aExport").onclick = downloadExport;
  refreshExportState();

  $("aTimeline").onclick = (e) => {
    if (!state.action) return;
    const r = e.currentTarget.getBoundingClientRect();
    state.t = ((e.clientX - r.left) / r.width) * state.action.duration;
    state.playing = false;
    $("aPlay").textContent = "▶ Replay";
  };

  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
    if (e.code === "Space") { e.preventDefault(); replay(); }
    if (e.key === "Escape") closeDrawer();
  });

  initTooltips();

  // The manifest carries every timing and measurement the panels read, so the
  // page is fully usable off it; sprite art follows per character.
  await loadCoreAssets();
  warmAnchors(CHARACTER_KEYS);
  $("loadState").textContent = "manifest loaded";

  const params = new URLSearchParams(location.search);
  const wantedChar = params.get("char");
  const wantedAction = params.get("action");
  setChar(CHARACTER_KEYS.includes(wantedChar) ? wantedChar : "gojo", wantedAction);

  requestAnimationFrame((t) => { last = t; tick(t); });
}

function setChar(charKey, wantedAction = null) {
  state.char = charKey;
  $("aChar").value = charKey;
  const keep = wantedAction || state.action?.id;
  const items = actionsFor(charKey).flatMap((g) => g.items);
  const next = items.find((i) => i.id === keep) || items[0];
  // Fetch the pose this action opens on first, so playback has something to
  // show immediately rather than after the whole set has arrived.
  charLoader.start(charKey, next ? currentFrame(charKey, next.anim, 0) : null);
  if (next) playAction(next); else buildActionList();
}

// Streams the current character's frames. The rAF loop repaints continuously,
// so arrivals need no redraw of their own — only the status line does.
const charLoader = makeCharLoader({
  onFirst: refreshLoadState,
  onFrame: refreshLoadState,
  onDone: refreshLoadState,
});

function refreshLoadState() {
  const el = $("loadState");
  if (!el) return;
  const left = charLoader.remaining;
  el.classList.toggle("spinning", charLoader.waiting || left > 0);
  el.classList.toggle("done", !charLoader.waiting && left === 0);
  el.textContent = charLoader.waiting ? `loading ${state.char}…`
    : left ? `${state.char}: ${left} more frame${left === 1 ? "" : "s"}…`
    : "assets loaded";
}

/** Keep the address bar on the current character and action, so a reload comes
 *  back to what you were looking at. `replaceState` so flipping through actions
 *  does not fill the back button. */
function rememberInUrl() {
  const url = new URL(location.href);
  const char = state.char;
  const action = state.action?.id || null;
  if (url.searchParams.get("char") === char && url.searchParams.get("action") === action) return;
  url.searchParams.set("char", char);
  if (action) url.searchParams.set("action", action); else url.searchParams.delete("action");
  history.replaceState(null, "", url);
}

// `spriteManifest` is only read through the game's helpers, but a missing
// manifest means nothing can draw — surface that instead of a blank canvas.
boot().catch((err) => {
  $("loadState").textContent = `failed: ${err.message}`;
  console.error(err, spriteManifest);
});
