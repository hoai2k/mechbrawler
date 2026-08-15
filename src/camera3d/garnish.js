// Garnish cards: flat textured quads OFF the gameplay plane, per board.
//
// This is the layer that pays off the whole 2.5D scene. Everything else in
// 3d mode is the same fight at z = 0 seen through a better lens; a card at
// z = +1 is something the flat renderer cannot draw at all, because it passes
// BETWEEN the camera and the fighters. Traffic crossing in front of a duel is
// the single clearest "this is 3D now" moment in the game, and it costs no new
// art — every texture here is drawn procedurally, in the same idiom as the
// canvas stage effects in stage_fx.js.
//
// Two rules keep it garnish rather than clutter:
//
//   * NOTHING HERE TOUCHES THE SIMULATION. Cards are spawned, moved and
//     retired entirely inside this module from the clock and from stage cues.
//     No card has a hitbox, blocks a ledge, or is visible to the AI.
//   * READABILITY WINS. Anything that crosses in front of the fighters is
//     fast, additive and semi-transparent (you can read a body through it), or
//     it is confined to a band of the screen the fight does not occupy —
//     lanterns hang in the rafters, leaves drift the full height but are small.
//
// Cards follow the board's own gimmick rather than running on a private clock:
// the traffic cards are spawned by the same cue that fires when stage_fx.js
// launches its cars, so the foreground streaks and the hazard that can hit you
// are the same event seen from two places. Boards with no entry in SYSTEMS get
// no cards, which is why this file can grow one board at a time.

import {
  AdditiveBlending, NormalBlending, CanvasTexture, SRGBColorSpace,
} from "../../vendor/three/three.module.js";
import { makeQuadPool, rectMatrix, ORDER } from "./quads.js";
import { addCameraCueListener } from "../camera_mode.js";
import { GARNISH } from "../config_camera.js";
import { mainPlatform } from "../stages.js";
import { getImage, sharedArtSettled } from "../assets.js";

// ----------------------------------------------------------------- textures
//
// Procedural, cached forever, drawn once at first use. Sizes are texture
// pixels and have nothing to do with how big the card is in the world — that
// is the card's own w/h in sim pixels.

const texCache = new Map();

function texture(key, w, h, paint) {
  let tex = texCache.get(key);
  if (tex) return tex;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d"), w, h);
  tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

/** The delivered card for this element, or null if nobody has drawn it.
 *
 *  Round 18F is optional by construction: every card below has a procedural
 *  drawing, and the art replaces the TEXTURE and nothing else — the motion,
 *  the depth, the spawning and the per-board wiring are unchanged. So each of
 *  these calls falls back on its own, and a half-delivered set is a set where
 *  half the cards are paintings and half are canvas primitives, which is fine.
 *
 *  Cached in the same map as the procedural textures, under a distinct key, so
 *  a card that arrives mid-session is picked up on its next spawn rather than
 *  after a reload.
 */
function artTexture(name) {
  const key = `art:${name}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const img = getImage(`garnish:${name}`);
  if (!img) return null;
  const tex = new CanvasTexture(img);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  texCache.set(key, tex);
  return tex;
}

/** A leaf: a soft lozenge with a centre vein, in the board's foliage colours. */
function leafTexture(color) {
  // The delivered pair is a summer leaf and a turning one; the procedural
  // version had only the colour to tell them apart.
  const art = artTexture(color === "#8fce7a" ? "leaf_green" : "leaf_gold");
  if (art) return art;
  return texture(`leaf:${color}`, 64, 32, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w * 0.46, h * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.28)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.08, h / 2);
    ctx.lineTo(w * 0.92, h / 2);
    ctx.stroke();
  });
}

/** A paper lantern hanging close to the lens: an opaque silhouette with the
 *  corridor's light leaking around one edge, so it reads as a solid thing
 *  BETWEEN the viewer and the scene rather than as a tinted window onto it. */
const lanternTexture = () => {
  // Two were delivered — a lit paper lantern and a cold iron one — and picking
  // between them per spawn is the variety the request asked them for. One
  // delivered on its own still works; the other side falls through.
  const art = artTexture(Math.random() < 0.5 ? "lantern_paper" : "lantern_iron")
           || artTexture("lantern_paper") || artTexture("lantern_iron");
  return art || lanternDrawn();
};

const lanternDrawn = () => texture("lantern", 96, 160, (ctx, w, h) => {
  const bodyTop = h * 0.18;
  const bodyH = h * 0.68;
  const cx = w / 2;
  const cy = bodyTop + bodyH / 2;
  const rx = w * 0.44;

  // The cord, first, so the body caps it.
  ctx.strokeStyle = "#0b0806";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, bodyTop);
  ctx.stroke();

  // Opaque body. Near-black on the shadow side warming to a lit edge — a lamp
  // this close is backlit by the corridor, not by itself.
  const grad = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
  grad.addColorStop(0, "#1a0d07");
  grad.addColorStop(0.55, "#0c0705");
  grad.addColorStop(0.88, "#5c2a14");
  grad.addColorStop(1, "#b4652c");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, bodyH / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ribs, as darker bands across the body.
  ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
  ctx.lineWidth = 2;
  for (let i = 1; i < 5; i++) {
    const y = bodyTop + (bodyH * i) / 5;
    const half = rx * Math.sin(Math.acos((y - cy) / (bodyH / 2)) || 0);
    ctx.beginPath();
    ctx.moveTo(cx - half, y);
    ctx.lineTo(cx + half, y);
    ctx.stroke();
  }

  // The rim of light down the lit side.
  ctx.strokeStyle = "rgba(255, 186, 96, 0.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx - 1, bodyH / 2 - 1, 0, -Math.PI * 0.42, Math.PI * 0.42);
  ctx.stroke();

  // Cap and base blocks.
  ctx.fillStyle = "#0b0806";
  ctx.fillRect(cx - w * 0.16, bodyTop - h * 0.035, w * 0.32, h * 0.05);
  ctx.fillRect(cx - w * 0.16, bodyTop + bodyH - h * 0.015, w * 0.32, h * 0.05);
});

/** A vehicle passing close to the lens: a dark body smearing into its own
 *  motion trail, with the headlights blown out at the leading end. Drawn
 *  pointing right; a leftward card is mirrored.
 *
 *  Deliberately NOT a pure emissive streak. This board's backdrop is a lit
 *  neon street, and additive light over bright ground adds almost nothing —
 *  the same reason the strike arcs paint a dark band under their glow
 *  (render.js, strikeArc). What sells "this passed between you and the fight"
 *  is OCCLUSION: a solid shape that briefly covers what is behind it. The
 *  lights are the part that glows; the body is the part that hides. */
const VEHICLES = ["car_sedan", "car_van", "car_bike"];

const vehicleTexture = () => {
  // Three shapes so two passes never look identical — the procedural card was
  // one silhouette, which read as the same car going round the block.
  const drawn = VEHICLES.map(artTexture).filter(Boolean);
  return drawn.length ? drawn[Math.floor(Math.random() * drawn.length)] : vehicleDrawn();
};

const vehicleDrawn = () => texture("vehicle", 512, 128, (ctx, w, h) => {
  const roof = h * 0.30;
  const belt = h * 0.56;   // where the cabin meets the body
  const sill = h * 0.82;   // where the body meets the wheels
  const DARK = "#070a12";

  // The motion smear the car drags behind it, laid down first so the solid
  // body sits on top of its own tail.
  const smear = ctx.createLinearGradient(0, 0, w * 0.62, 0);
  smear.addColorStop(0, "rgba(7, 10, 18, 0)");
  smear.addColorStop(1, "rgba(7, 10, 18, 0.85)");
  ctx.fillStyle = smear;
  ctx.fillRect(0, belt * 0.95, w * 0.62, sill - belt * 0.95);

  // The silhouette: a hatchback in one path — nose at the right, raked
  // windscreen, roof, tapered tail.
  ctx.fillStyle = DARK;
  ctx.beginPath();
  ctx.moveTo(w * 0.26, sill);
  ctx.lineTo(w * 0.30, belt);
  ctx.quadraticCurveTo(w * 0.36, roof, w * 0.50, roof);
  ctx.lineTo(w * 0.68, roof);
  ctx.quadraticCurveTo(w * 0.80, roof, w * 0.86, belt);
  ctx.lineTo(w * 0.95, belt * 1.04);
  ctx.quadraticCurveTo(w, belt * 1.06, w, sill * 0.92);
  ctx.lineTo(w, sill);
  ctx.closePath();
  ctx.fill();

  // Wheels, just proud of the sill.
  for (const cx of [w * 0.38, w * 0.86]) {
    ctx.beginPath();
    ctx.ellipse(cx, sill, w * 0.045, (h - sill) * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Lit windows — the one warm note, so the shape reads as a vehicle rather
  // than as a hole punched in the scene.
  ctx.fillStyle = "rgba(150, 205, 255, 0.30)";
  ctx.beginPath();
  ctx.moveTo(w * 0.35, belt * 0.97);
  ctx.quadraticCurveTo(w * 0.39, roof * 1.12, w * 0.51, roof * 1.10);
  ctx.lineTo(w * 0.66, roof * 1.10);
  ctx.quadraticCurveTo(w * 0.76, roof * 1.14, w * 0.81, belt * 0.97);
  ctx.closePath();
  ctx.fill();

  // Headlights and the cone they throw ahead — a soft blob, never a filled
  // rect, so there is no hard edge anywhere on the card.
  const beam = ctx.createRadialGradient(w * 0.985, belt * 1.16, 1, w * 0.985, belt * 1.16, w * 0.16);
  beam.addColorStop(0, "rgba(255, 255, 255, 1)");
  beam.addColorStop(0.22, "rgba(200, 235, 255, 0.7)");
  beam.addColorStop(1, "rgba(120, 190, 255, 0)");
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.arc(w * 0.985, belt * 1.16, w * 0.16, 0, Math.PI * 2);
  ctx.fill();

  // Tail lamp, and its own small smear back down the trail.
  const tail = ctx.createRadialGradient(w * 0.28, belt * 1.12, 1, w * 0.28, belt * 1.12, w * 0.07);
  tail.addColorStop(0, "rgba(255, 120, 110, 0.95)");
  tail.addColorStop(1, "rgba(255, 60, 60, 0)");
  ctx.fillStyle = tail;
  ctx.beginPath();
  ctx.arc(w * 0.28, belt * 1.12, w * 0.07, 0, Math.PI * 2);
  ctx.fill();
});

/** A chunk of masonry, angular and unlit. */
const rubbleTexture = (i) => artTexture(`rubble_${"abc"[i % 3]}`) || rubbleDrawn(i);

const rubbleDrawn = (i) => texture(`rubble:${i}`, 48, 48, (ctx, w, h) => {
  const pts = 5 + (i % 3);
  ctx.fillStyle = i % 2 ? "#6c7d8c" : "#4d5a68";
  ctx.strokeStyle = "rgba(12, 16, 22, 0.8)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let k = 0; k <= pts; k++) {
    const a = (k / pts) * Math.PI * 2 + i;
    const r = w * (0.28 + 0.16 * ((k * 7 + i * 3) % 5) / 5);
    const x = w / 2 + Math.cos(a) * r;
    const y = h / 2 + Math.sin(a) * r;
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
});

/** A distant hoarding on its gantry: a lit panel, its dark frame, and the legs
 *  holding it up. Kept dim and desaturated — this board's backdrop painting is
 *  already a wall of neon, so these are here to add DEPTH to it, not to
 *  compete with it. The lightning cue is what makes them briefly loud. */
const billboardTexture = (i) => artTexture(`hoarding_${"abc"[i % 3]}`) || billboardDrawn(i);

const billboardDrawn = (i) => texture(`billboard:${i}`, 160, 128, (ctx, w, h) => {
  const panelH = h * 0.62;
  // Legs first, so the frame caps them.
  ctx.strokeStyle = "rgba(10, 13, 22, 0.9)";
  ctx.lineWidth = 4;
  for (const x of [w * 0.28, w * 0.72]) {
    ctx.beginPath();
    ctx.moveTo(x, panelH * 0.9);
    ctx.lineTo(x + (x < w / 2 ? -6 : 6), h);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(w * 0.28, h * 0.82);
  ctx.lineTo(w * 0.72, h * 0.82);
  ctx.stroke();
  // The frame, then the lit face inside it.
  ctx.fillStyle = "#0a0d16";
  ctx.fillRect(0, 0, w, panelH);
  const hues = ["#c4406f", "#3a7fb8", "#c2a24a"];
  ctx.fillStyle = hues[i % hues.length];
  ctx.globalAlpha = 0.62;
  ctx.fillRect(w * 0.06, panelH * 0.1, w * 0.88, panelH * 0.8);
  // Illegible copy — enough texture to read as signage at this distance.
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "#02040a";
  for (let k = 0; k < 4; k++) {
    ctx.fillRect(w * 0.12, panelH * (0.2 + k * 0.17), w * (0.28 + 0.44 * ((k * 5 + i) % 4) / 4), panelH * 0.09);
  }
  ctx.globalAlpha = 1;
});

// ------------------------------------------------------------------- boards
//
// Each system owns two optional hooks:
//   ambient(dt, ctx)   run every frame — spawn on a timer, from the clock
//   cue(name, s, ctx)  a stage moment fired by stage_fx.js
//
// `ctx` gives them `spawn(card)`, the live state and the main platform. A card
// is plain data; `update` below moves and retires every one the same way.

const rand = (a, b) => a + Math.random() * (b - a);

const SYSTEMS = {
  // The calmest board, and the one the plan tunes the rig on: falling leaves
  // drifting past the lens sell depth where nothing else is happening.
  trainingBridge: {
    every: 0.55,
    ambient(ctx) {
      const near = Math.random() < 0.35;
      ctx.spawn({
        x: rand(-200, 1480), y: rand(-160, -40),
        // A near leaf is bigger, faster and fainter — the three things that
        // together read as "close to the lens" rather than "a big leaf".
        z: near ? rand(2.6, 4.2) : rand(0.9, 1.8),
        w: near ? rand(46, 74) : rand(22, 34),
        h: 0, // set from the texture's aspect below
        tex: leafTexture(Math.random() < 0.7 ? "#8fce7a" : "#d8c36a"),
        alpha: near ? rand(0.4, 0.6) : rand(0.7, 0.9),
        vx: rand(20, 62), vy: rand(70, 130),
        rot: rand(0, Math.PI * 2), spin: rand(-2.4, 2.4),
        sway: rand(18, 46), swayRate: rand(1.4, 2.6),
        life: 14,
      });
    },
  },

  // The instant depth showcase: lantern silhouettes swinging past the camera.
  // They ride the TOP of the frame — the corridor's lanterns hang from the
  // rafters — so the biggest cards in the game never cover a fighter.
  lanternCorridor: {
    every: 3.2,
    ambient(ctx) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      ctx.spawn({
        x: dir > 0 ? -320 : 1600,
        // High enough that the frame CROPS them: a foreground element reads as
        // foreground when it intrudes from the edge, and a lantern hanging
        // fully inside the picture just covers the fight. Only their lower
        // halves hang into view, which is also what a real ceiling lamp does.
        y: rand(70, 170),
        z: rand(1.6, 2.6),
        w: rand(84, 132), h: 0,
        tex: lanternTexture(),
        alpha: 1,
        // Brisk, because parallax is the point: a thing this close to the lens
        // has to outrun the background for the depth to read.
        vx: dir * rand(80, 145), vy: 0,
        rot: 0, spin: 0,
        // Hanging things swing; the sway is horizontal, so it reads as a
        // pendulum rather than as the card bobbing.
        sway: rand(14, 30), swayRate: rand(0.8, 1.5), swayAxis: "x",
        tilt: rand(0.05, 0.13), tiltRate: rand(0.8, 1.5),
        life: 70,
      });
    },
  },

  // THE showcase. stage_fx.js cues `surge` with the traffic's direction at the
  // exact moment it launches its cars, so these streaks are the same run of
  // traffic — the ones that can hit you pass at ground level behind, and these
  // pass in front of the whole fight.
  crosswalkRush: {
    // The signal gantry is the one card in 18F with no procedural ancestor: it
    // was asked for as a new element rather than a replacement, so it appears
    // only once its art exists. Static and near the lens, hanging into the top
    // of frame the way a real signal arm does — the traffic passes under it.
    setup(ctx, settled) {
      const tex = artTexture("signal_gantry");
      // Not yet decoded — say so, so the caller tries again rather than
      // leaving the board permanently bare. This card has no procedural
      // ancestor, so once the loader has settled there is nothing to place.
      if (!tex) return settled ? undefined : false;
      ctx.spawn({
        x: rand(240, 460), y: rand(-40, 40),
        z: rand(2.2, 3.0),
        w: rand(300, 380), h: 0,
        tex,
        alpha: 0.92,
        vx: 0, vy: 0, rot: 0, spin: 0,
        // A signal on an arm sways barely at all; enough to not read as a decal.
        sway: 6, swayRate: 0.5, swayAxis: "x",
        life: Infinity,
      });
    },
    cue(name, strength, ctx) {
      if (name !== "surge" || !ctx.plat) return;
      const dir = Math.sign(strength) || 1;
      const plat = ctx.plat;
      for (let i = 0; i < 3; i++) {
        ctx.spawn({
          x: dir > 0 ? plat.x - 620 - i * 700 : plat.x + plat.w + 620 + i * 700,
          // A card off the gameplay plane does NOT land where the same sim y
          // would land at z = 0: it is nearer the camera, so the small downward
          // pitch throws it further below the centre of frame and magnifies it.
          // These sit well above the stage in sim space to come out riding
          // along its front edge on screen, with the roofline crossing the
          // fighters' legs — the pass reads as happening in FRONT of them while
          // their heads, the thing you actually read a fight from, stay clear.
          y: plat.y - rand(128, 168),
          z: rand(1.8, 2.6),
          w: rand(430, 570), h: 0,
          tex: vehicleTexture(),
          flipX: dir < 0,
          // Solid enough that occlusion reads — that is the whole point — but
          // held just under opaque so a fighter caught behind one is still
          // faintly there, and it clears the screen in well under a second.
          alpha: rand(0.76, 0.88),
          vx: dir * rand(2000, 2500), vy: 0,
          rot: 0, spin: 0,
          life: 3,
        });
      }
    },
  },

  // Rubble falling toward the lens as a rooftop gives way, on the same cue
  // that shakes the camera.
  emptyCity: {
    cue(name, strength, ctx) {
      if (name !== "rattle") return;
      for (let i = 0; i < 7; i++) {
        ctx.spawn({
          x: rand(180, 1100), y: rand(-80, 240),
          z: rand(0.5, 1.6),
          w: rand(26, 58), h: 0,
          tex: rubbleTexture(i),
          alpha: rand(0.65, 0.9),
          vx: rand(-70, 70), vy: rand(180, 420),
          rot: rand(0, Math.PI * 2), spin: rand(-5, 5),
          gravity: 900,
          life: 3.5,
        });
      }
    },
  },

  // The skyline layer, BEHIND the stage: hoardings that catch the storm. They
  // are static scenery, respawned once per match rather than on a timer, and
  // the lightning cue flashes them.
  billboardRoof: {
    every: 0,
    setup(ctx, settled) {
      // Placed once and standing for the match, so it is worth waiting for the
      // drawn hoardings rather than freezing the procedural ones in front of
      // the player for the whole round.
      if (!settled && !artTexture("hoarding_a")) return false;
      for (let i = 0; i < 5; i++) {
        ctx.spawn({
          // Spread across the middle band, clear of the corners the HUD
          // panels occupy — garnish must never fight the damage readout.
          x: 235 + i * 205, y: rand(215, 330),
          z: rand(-5.5, -3.4),
          w: rand(120, 175), h: 0,
          tex: billboardTexture(i),
          alpha: rand(0.6, 0.78),
          vx: 0, vy: 0, rot: 0, spin: 0,
          behind: true,
          life: Infinity,
          flicker: 0,
        });
      }
    },
    cue(name, strength, ctx) {
      if (name !== "lightning") return;
      for (const c of ctx.cards) if (c.behind) c.flicker = 0.5;
    },
  },
};

// -------------------------------------------------------------------- layer

export function makeGarnish() {
  const pool = makeQuadPool();
  const cards = [];
  let stageKey = null;
  let spawnT = 0;
  let setupDone = false;

  const ctx = {
    cards,
    plat: null,
    spawn(card) {
      // A card's height comes from its texture's aspect unless it asked for
      // one, so every system only ever states a width.
      if (!card.h) {
        const img = card.tex.image;
        card.h = card.w * (img.height / img.width);
      }
      card.maxLife = card.life;
      card.t = 0;
      cards.push(card);
    },
  };

  addCameraCueListener((name, strength) => {
    if (!GARNISH.enabled) return;
    const sys = SYSTEMS[stageKey];
    if (sys?.cue) sys.cue(name, strength, ctx);
  });

  /** Drop every card — a new match on a new board starts with a clean sky. */
  function reset() {
    cards.length = 0;
    stageKey = null;
    spawnT = 0;
    setupDone = false;
  }

  function update(st, dt) {
    const sys = SYSTEMS[st.stageKey];
    ctx.plat = st.platforms.length ? mainPlatform(st.platforms) : null;
    // Two independent reasons for a board to have no cards, and both have to
    // clear an existing sky rather than just stop spawning into it: GARNISH
    // can be switched off mid-match from the config, and Active Boards off
    // returns every stage to its static v1 self — these cards are that
    // stage's character, so they go quiet with it.
    const wanted = GARNISH.enabled && st.activeBoards;

    if (st.stageKey !== stageKey) {
      cards.length = 0;
      stageKey = st.stageKey;
      spawnT = 0;
      setupDone = false;
    }
    if (!wanted) {
      if (cards.length) cards.length = 0;
      setupDone = false;
    } else if (sys?.setup && !setupDone) {
      // Standing scenery (Billboard Roof's hoardings) is placed once. Keyed on
      // a flag rather than on the stage change so switching GARNISH back on
      // mid-match puts it back, instead of leaving that board bare until the
      // next round. A setup that returns false could not place its scenery
      // yet — delivered art decodes some way after the match starts, and the
      // shared group is a long queue — so the flag stays down and the next
      // frame tries again. Latching it unconditionally is what left Crosswalk
      // Rush's signal gantry missing for a whole match, every match.
      //
      // The deferral is bounded by the loader rather than by a timer: once the
      // shared group has settled, whatever is missing is missing for good, so
      // the board places its procedural fallbacks and stops asking.
      const settled = sharedArtSettled();
      const placed = sys.setup(ctx, settled);
      setupDone = placed !== false || settled;
    }

    if (wanted && sys?.ambient && sys.every > 0) {
      spawnT -= dt;
      if (spawnT <= 0) {
        spawnT = sys.every * (GARNISH.interval || 1);
        sys.ambient(ctx);
      }
    }

    pool.begin();
    for (let i = cards.length - 1; i >= 0; i--) {
      const c = cards[i];
      c.t += dt;
      if (c.t >= c.life) { cards.splice(i, 1); continue; }

      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (c.gravity) c.vy += c.gravity * dt;
      c.rot += c.spin * dt;
      if (c.flicker > 0) c.flicker = Math.max(0, c.flicker - dt);

      // Sway: a leaf wanders horizontally as it falls, a lantern swings.
      let sx = 0;
      let rot = c.rot;
      if (c.sway) {
        const s = Math.sin(c.t * c.swayRate);
        sx = s * c.sway;
        if (c.tilt) rot += Math.sin(c.t * c.tiltRate) * c.tilt;
      }

      // Fade in and out at the ends of a finite life, so nothing pops.
      let alpha = c.alpha;
      if (Number.isFinite(c.life)) {
        alpha *= Math.min(1, c.t / 0.35) * Math.min(1, (c.life - c.t) / 0.5);
      }
      // A lightning flash blows out the hoardings it lights.
      if (c.flicker > 0) alpha = Math.min(1, alpha + c.flicker * 1.2);

      // Off the sides for good: retire rather than wait out the life. The
      // margin is wide because a card is allowed to be STAGED well outside the
      // frame — the traffic queues up several screen-widths back so the cars
      // arrive spaced out — and a bound tight enough to look reasonable culls
      // those before their first frame.
      if (c.x < -3000 || c.x > 4300 || c.y > 1200) { cards.splice(i, 1); continue; }

      pool.draw(c.tex, rectMatrix(c.x + sx, c.y, c.w, c.h, { rotation: rot, flipX: c.flipX }), {
        z: c.z,
        alpha,
        blending: c.additive ? AdditiveBlending : NormalBlending,
        order: c.behind ? ORDER.garnishBack : ORDER.garnishFront,
      });
    }
    pool.end();
  }

  return {
    group: pool.group,
    update,
    reset,
    count: () => cards.length,
    // Cards that were placed once and stand for the match — the part of the
    // layer that cannot recover from a missed placement, and so the part worth
    // counting on its own.
    standing: () => cards.filter((c) => c.life === Infinity).length,
  };
}
