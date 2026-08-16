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

/** Pick a number by whether the PAINTED plate is the one being drawn.
 *
 *  A procedural card and its delivered painting are not interchangeable at the
 *  same alpha. The drawings here are thin by construction — a few translucent
 *  gradient bands — while a painted plate is a finished picture with its own
 *  internal density and its own bright core. Handed the same additive alpha,
 *  the painting reads several times heavier: the aurora that was a suggestion
 *  behind the outpost became a green wash over the whole arena the day its
 *  plate landed.
 *
 *  So the spawn states BOTH numbers rather than one, and the fallback keeps
 *  the values it was tuned at. Same card, same motion, same depth — only the
 *  weight differs, because the two textures genuinely differ. */
const byArt = (name, painted, drawn) => (artTexture(name) ? painted : drawn);

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

/** A soft radial dot — embers, motes, snow, stars, fireflies: one texture
 *  helper, coloured per board. The colour carries its own alpha. */
const dotTexture = (key, color) => texture(`dot:${key}`, 64, 64, (ctx, w, h) => {
  const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
});

/** A soft horizontal streak fading at both ends — sand on the wind, a debris
 *  glint crossing the deck. */
const streakTexture = (key, color) => texture(`streak:${key}`, 256, 24, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, "rgba(0, 0, 0, 0)");
  g.addColorStop(0.5, color);
  g.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, h * 0.3, w, h * 0.4);
});

/** A falling rain thread, bright at the bottom the way a lit drop reads. */
const rainTexture = () => texture("rain", 8, 128, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "rgba(180, 230, 255, 0)");
  g.addColorStop(0.75, "rgba(190, 235, 255, 0.75)");
  g.addColorStop(1, "rgba(240, 252, 255, 0.95)");
  ctx.fillStyle = g;
  ctx.fillRect(w * 0.3, 0, w * 0.4, h);
});

/** A cloud wisp: overlapping soft blobs, three variants so the deck varies. */
const cloudTexture = (i) => artTexture("cloud_wisp") || cloudDrawn(i);

const cloudDrawn = (i) => texture(`cloud:${i % 3}`, 256, 96, (ctx, w, h) => {
  for (let k = 0; k < 7; k++) {
    const x = w * (0.15 + 0.7 * (((k * 5 + i * 3) % 7) / 7));
    const y = h * (0.35 + 0.3 * (((k * 3 + i) % 5) / 5));
    const r = w * (0.1 + 0.08 * (((k + i) % 4) / 4));
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, "rgba(255, 255, 255, 0.55)");
    g.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
});

/** The aurora: a striated green curtain, hung far behind the outpost. */
const auroraTexture = () => artTexture("aurora_curtain") || auroraDrawn();

const auroraDrawn = () => texture("aurora", 512, 256, (ctx, w, h) => {
  for (let i = 0; i < 24; i++) {
    const a = 0.1 + 0.16 * Math.abs(Math.sin(i * 1.7));
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `rgba(46, 232, 154, ${a})`);
    g.addColorStop(0.6, `rgba(46, 232, 154, ${a * 0.45})`);
    g.addColorStop(1, "rgba(46, 232, 154, 0)");
    ctx.fillStyle = g;
    ctx.fillRect((i / 24) * w, 0, w / 24 + 2, h);
  }
});

/** A god-ray shaft, widening as it falls through the canopy. */
const rayTexture = () => artTexture("godray_shaft") || rayDrawn();

const rayDrawn = () => texture("godray", 96, 512, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "rgba(214, 255, 224, 0.5)");
  g.addColorStop(1, "rgba(160, 255, 190, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(w * 0.32, 0);
  ctx.lineTo(w * 0.68, 0);
  ctx.lineTo(w * 0.95, h);
  ctx.lineTo(w * 0.05, h);
  ctx.closePath();
  ctx.fill();
});

/** A gull: the two-arc silhouette every sunset painting uses. */
const gullTexture = () => artTexture("gull") || gullDrawn();

const gullDrawn = () => texture("gull", 96, 40, (ctx, w, h) => {
  ctx.strokeStyle = "rgba(28, 20, 32, 0.9)";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(4, 10);
  ctx.quadraticCurveTo(w * 0.3, h * 0.9, w / 2, h * 0.55);
  ctx.quadraticCurveTo(w * 0.7, h * 0.9, w - 4, 10);
  ctx.stroke();
});

// ------------------------------------------------------------------- boards
//
// One system per arena (docs/arena-polish-plan.md §1). Each owns up to three
// optional hooks:
//   ambient(ctx)       spawn on a timer (`every` seconds), from the clock
//   setup(ctx, settled) standing scenery, placed once per match
//   cue(name, s, ctx)  a stage moment fired by stage_fx.js
//
// `ctx` gives them `spawn(card)`, the live card list and the main platform. A
// card is plain data; `update` below moves and retires every one the same way.
//
// UPTOWN PLAZA has no entry ON PURPOSE: it is the tournament flat, the
// daylight reference the other eleven are loud against — and the smoke test's
// negative control. Its leaves and fountain live in stage_fx.js at z = 0.

const rand = (a, b) => a + Math.random() * (b - a);

const SYSTEMS = {
  // -- NEON DISTRICT, the flagship. Rain threads past the lens; a paper
  // lantern off the torii market rides the top of frame now and then; the
  // skyline hoardings hang behind and FLICKER when the maglev passes; and the
  // pass itself sends street traffic across the foreground — the same `surge`
  // cue, seen from two places.
  neon: {
    every: 0.26,
    ambient(ctx) {
      if (Math.random() < 0.03) {
        // A lantern string's stray, hanging into the top of frame so the frame
        // crops it — a foreground element reads as foreground when it intrudes
        // from the edge. Only its lower half hangs into view.
        const dir = Math.random() < 0.5 ? 1 : -1;
        ctx.spawn({
          x: dir > 0 ? -320 : 1600, y: rand(70, 160),
          z: rand(1.6, 2.6),
          w: rand(74, 110), h: 0,
          tex: lanternTexture(),
          alpha: 1,
          vx: dir * rand(80, 140), vy: 0,
          rot: 0, spin: 0,
          sway: rand(14, 30), swayRate: rand(0.8, 1.5), swayAxis: "x",
          tilt: rand(0.05, 0.13), tiltRate: rand(0.8, 1.5),
          life: 70,
        });
        return;
      }
      // The rain: thin lit threads, faster and fainter the nearer the lens.
      ctx.spawn({
        x: rand(-200, 1480), y: rand(-260, 200),
        z: rand(0.8, 2.6),
        w: rand(4, 8), h: 0,
        tex: rainTexture(),
        alpha: rand(0.22, 0.42),
        vx: rand(-70, -30), vy: rand(750, 1050),
        rot: 0.05, spin: 0,
        additive: true,
        life: 1.6,
      });
    },
    setup(ctx, settled) {
      // Standing scenery is placed once and stands for the match, so it is
      // worth waiting for the delivered art rather than freezing procedural
      // hoardings in front of the player for the whole round. The signal
      // gantry has no procedural ancestor at all — it appears only once its
      // art exists. Not yet decoded → return false so the caller retries;
      // once the loader has settled, whatever is missing is missing for good.
      const gantry = artTexture("signal_gantry");
      if (!settled && (!gantry || !artTexture("hoarding_a"))) return false;
      if (gantry) {
        ctx.spawn({
          x: rand(240, 460), y: rand(-40, 40),
          z: rand(2.2, 3.0),
          w: rand(300, 380), h: 0,
          tex: gantry,
          alpha: 0.92,
          vx: 0, vy: 0, rot: 0, spin: 0,
          sway: 6, swayRate: 0.5, swayAxis: "x",
          life: Infinity,
        });
      }
      // The hoardings, behind the stage: depth for a backdrop that is already
      // a wall of neon. Spread across the middle band, clear of the HUD.
      for (let i = 0; i < 5; i++) {
        ctx.spawn({
          x: 235 + i * 205, y: rand(215, 330),
          z: rand(-5.5, -3.4),
          w: rand(120, 175), h: 0,
          tex: billboardTexture(i),
          alpha: rand(0.55, 0.72),
          vx: 0, vy: 0, rot: 0, spin: 0,
          behind: true,
          life: Infinity,
          flicker: 0,
        });
      }
    },
    cue(name, strength, ctx) {
      if (name !== "surge" || !ctx.plat) return;
      // The district reacts to the pass: the hoardings flicker...
      for (const c of ctx.cards) if (c.behind) c.flicker = 0.4;
      // ...and the street traffic surges with it, crossing the foreground.
      const dir = Math.sign(strength) || 1;
      const plat = ctx.plat;
      for (let i = 0; i < 2; i++) {
        ctx.spawn({
          x: dir > 0 ? plat.x - 620 - i * 760 : plat.x + plat.w + 620 + i * 760,
          // A card off the gameplay plane does NOT land where the same sim y
          // would land at z = 0: it is nearer the camera, so the small
          // downward pitch throws it further below frame centre and magnifies
          // it. These sit well above the stage in sim space to come out
          // riding its front edge on screen, roofline crossing the fighters'
          // LEGS — heads, the thing you read a fight from, stay clear.
          y: plat.y - rand(128, 168),
          z: rand(1.8, 2.6),
          w: rand(430, 570), h: 0,
          tex: vehicleTexture(),
          flipX: dir < 0,
          // Solid enough that occlusion reads, held just under opaque so a
          // fighter behind one is still faintly there — and gone in well
          // under a second.
          alpha: rand(0.76, 0.88),
          vx: dir * rand(2000, 2500), vy: 0,
          rot: 0, spin: 0,
          life: 3,
        });
      }
    },
  },

  // -- IRONWORKS FOUNDRY. Embers climbing past the lens all match; the pour's
  // white-hot telegraph (the bloom cue) sends up a flurry from the strip.
  foundry: {
    every: 0.4,
    ambient(ctx) {
      ctx.spawn({
        x: rand(-100, 1380), y: rand(500, 760),
        z: rand(0.6, 2.4),
        w: rand(5, 12), h: 0,
        tex: dotTexture("ember", "rgba(255, 180, 90, 0.9)"),
        alpha: rand(0.35, 0.6),
        vx: rand(-16, 16), vy: rand(-150, -70),
        rot: 0, spin: 0,
        sway: rand(8, 22), swayRate: rand(1.2, 2.4),
        additive: true,
        life: 8,
      });
    },
    cue(name, strength, ctx) {
      if (name !== "bloom") return;
      for (let i = 0; i < 10; i++) {
        ctx.spawn({
          x: rand(180, 460), y: rand(420, 620),
          z: rand(0.8, 2.6),
          w: rand(6, 14), h: 0,
          tex: dotTexture("ember", "rgba(255, 180, 90, 0.9)"),
          alpha: rand(0.5, 0.75),
          vx: rand(-30, 30), vy: rand(-380, -220),
          rot: 0, spin: 0,
          additive: true,
          life: 2.5,
        });
      }
    },
  },

  // -- HARBOR DOCKS. The water glitters behind the quay; a gull crosses the
  // sunset now and then, high in the sky band and BEHIND the play space.
  harbor: {
    every: 0.5,
    ambient(ctx) {
      if (Math.random() < 0.06) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        ctx.spawn({
          // BEHIND, not in front. A near-lens card is magnified and pushed
          // away from the frame's centre by the perspective, and a card that
          // is already near the top of the world is pushed clean off the top
          // of the screen: the gulls spawned, flew and retired without ever
          // being drawn where anyone could see them (`debugStats().garnish`
          // counted them the whole time). Deep in the sunset they read the way
          // a distant bird should — small, slow, and behind the fight.
          x: dir > 0 ? -120 : 1400, y: rand(150, 300),
          z: rand(-2.5, -1.2),
          w: rand(40, 64), h: 0,
          tex: gullTexture(),
          flipX: dir < 0,
          alpha: rand(0.6, 0.8),
          vx: dir * rand(90, 150), vy: 0,
          rot: 0, spin: 0,
          tilt: 0.1, tiltRate: rand(1.6, 2.4), sway: 8, swayRate: rand(1.6, 2.4),
          life: 20,
        });
        return;
      }
      const left = Math.random() < 0.5;
      ctx.spawn({
        x: left ? rand(0, 190) : rand(1090, 1280), y: rand(590, 690),
        z: rand(-3.5, -1.5),
        w: rand(14, 26), h: 0,
        tex: dotTexture("sun-glint", "rgba(255, 217, 160, 0.85)"),
        alpha: rand(0.3, 0.55),
        vx: rand(-8, 8), vy: 0,
        rot: 0, spin: 0,
        behind: true,
        additive: true,
        life: rand(1.5, 2.8),
      });
    },
  },

  // -- SKY TERRACE. The cloud deck drifts far behind between gusts; the gust
  // itself (the same `wind` cue that pushes the fighters) streams wisps
  // across the foreground in its direction, fast and near-transparent.
  skyterrace: {
    every: 2.8,
    ambient(ctx) {
      ctx.spawn({
        x: rand(-400, 1500), y: rand(430, 620),
        z: rand(-8, -5),
        w: rand(280, 520), h: 0,
        tex: cloudTexture(Math.floor(rand(0, 3))),
        alpha: rand(0.25, 0.4),
        vx: rand(20, 45), vy: 0,
        rot: 0, spin: 0,
        behind: true,
        life: 40,
      });
    },
    cue(name, strength, ctx) {
      if (name !== "wind") return;
      const dir = Math.sign(strength) || 1;
      for (let i = 0; i < 4; i++) {
        ctx.spawn({
          x: dir > 0 ? rand(-2200, -400) : rand(1680, 3480),
          y: rand(-40, 260),
          z: rand(1.4, 2.6),
          w: rand(220, 380), h: 0,
          tex: cloudTexture(i),
          alpha: rand(0.25, 0.4),
          vx: dir * rand(1300, 1800), vy: 0,
          rot: 0, spin: 0,
          life: 3,
        });
      }
    },
  },

  // -- SCRAPYARD 7. Sepia dust rides the +X wind; the magnet's SNAP kicks
  // scrap tumbling toward the lens (the proven rubble recipe).
  scrapyard: {
    every: 0.6,
    ambient(ctx) {
      ctx.spawn({
        x: rand(-100, 1380), y: rand(80, 520),
        z: rand(0.7, 2),
        w: rand(4, 9), h: 0,
        tex: dotTexture("sand-mote", "rgba(214, 176, 136, 0.8)"),
        alpha: rand(0.2, 0.35),
        vx: rand(40, 90), vy: rand(-6, 10),
        rot: 0, spin: 0,
        sway: 10, swayRate: rand(0.8, 1.6),
        life: 10,
      });
    },
    cue(name, strength, ctx) {
      if (name !== "fangSnap") return;
      for (let i = 0; i < 6; i++) {
        ctx.spawn({
          x: rand(300, 980), y: rand(-60, 200),
          z: rand(0.5, 1.6),
          w: rand(24, 52), h: 0,
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

  // -- CRYSTAL QUARRY. The crystals glitter behind the benches; each
  // detonation's punch throws a little masonry dust near the lens.
  quarry: {
    every: 0.55,
    ambient(ctx) {
      ctx.spawn({
        x: rand(80, 1200), y: rand(240, 560),
        z: rand(-4.5, -2.2),
        w: rand(8, 18), h: 0,
        tex: dotTexture("crystal", "rgba(180, 107, 255, 0.9)"),
        alpha: rand(0.35, 0.6),
        vx: 0, vy: rand(-12, -4),
        rot: 0, spin: 0,
        behind: true,
        additive: true,
        life: rand(1.8, 3),
      });
    },
    cue(name, strength, ctx) {
      if (name !== "punch") return;
      for (let i = 0; i < 4; i++) {
        ctx.spawn({
          x: rand(300, 980), y: rand(0, 220),
          z: rand(0.6, 1.6),
          w: rand(16, 34), h: 0,
          tex: rubbleTexture(i),
          alpha: rand(0.4, 0.6),
          vx: rand(-90, 90), vy: rand(160, 360),
          rot: rand(0, Math.PI * 2), spin: rand(-6, 6),
          gravity: 900,
          life: 2.5,
        });
      }
    },
  },

  // -- VOLCANIC FORGE. Ember columns climb the edge bands — in front, but
  // confined where the fight rarely lives; the lake's vent (frenzy) fills
  // the air with them for a beat.
  volcano: {
    every: 0.32,
    ambient(ctx) {
      const left = Math.random() < 0.5;
      const hot = Math.random() < 0.7;
      ctx.spawn({
        x: left ? rand(60, 300) : rand(980, 1220), y: rand(420, 720),
        z: rand(0.7, 2.2),
        w: rand(5, 12), h: 0,
        tex: hot ? dotTexture("ember-hot", "rgba(255, 150, 70, 0.95)")
                 : dotTexture("ash", "rgba(150, 150, 160, 0.7)"),
        alpha: rand(0.4, 0.65),
        vx: rand(-14, 14), vy: hot ? rand(-260, -140) : rand(-90, -40),
        rot: 0, spin: 0,
        sway: 12, swayRate: rand(1.2, 2.2),
        additive: hot,
        life: 6,
      });
    },
    cue(name, strength, ctx) {
      if (name !== "frenzy") return;
      for (let i = 0; i < 10; i++) {
        ctx.spawn({
          x: rand(-60, 1340), y: rand(380, 700),
          z: rand(0.8, 2.6),
          w: rand(6, 14), h: 0,
          tex: dotTexture("ember-hot", "rgba(255, 150, 70, 0.95)"),
          alpha: rand(0.5, 0.75),
          vx: rand(-40, 40), vy: rand(-420, -240),
          rot: 0, spin: 0,
          additive: true,
          life: 3,
        });
      }
    },
  },

  // -- FROZEN OUTPOST. The aurora hangs and breathes far behind; snow falls
  // past the lens (near flakes bigger, faster, fainter); the floe's open
  // hole (the fog cue) steams.
  frozen: {
    every: 0.32,
    setup(ctx, settled) {
      // Standing for the match: hold out for the painted curtain while the
      // loader is still working; fall back for good once it has settled.
      if (!settled && !artTexture("aurora_curtain")) return false;
      for (let i = 0; i < 2; i++) {
        ctx.spawn({
          x: 300 + i * 460, y: rand(90, 140),
          z: -9 + i,
          w: byArt("aurora_curtain", 470, 620) - i * 80, h: 0,
          tex: auroraTexture(),
          alpha: byArt("aurora_curtain", 0.17, 0.35) - i * (0.07 * byArt("aurora_curtain", 0.5, 1)),
          vx: 0, vy: 0, rot: 0, spin: 0,
          sway: 26 + i * 8, swayRate: 0.12 - i * 0.03, swayAxis: "x",
          behind: true,
          additive: true,
          life: Infinity,
        });
      }
    },
    ambient(ctx) {
      const near = Math.random() < 0.3;
      ctx.spawn({
        x: rand(-200, 1480), y: rand(-160, -40),
        z: near ? rand(2.4, 4) : rand(0.7, 1.6),
        w: near ? rand(10, 20) : rand(5, 9),
        h: 0,
        tex: dotTexture("snow", "rgba(234, 246, 255, 0.95)"),
        alpha: near ? rand(0.3, 0.45) : rand(0.5, 0.75),
        vx: rand(-24, 24), vy: near ? rand(190, 280) : rand(90, 160),
        rot: 0, spin: 0,
        sway: rand(14, 34), swayRate: rand(0.8, 1.8),
        life: 14,
      });
    },
    cue(name, strength, ctx) {
      if (name !== "fog") return;
      for (let i = 0; i < 5; i++) {
        ctx.spawn({
          x: rand(430, 850), y: rand(430, 540),
          z: rand(1, 2),
          w: rand(120, 200), h: 0,
          tex: cloudTexture(i),
          alpha: 0.3,
          vx: rand(-16, 16), vy: rand(-110, -60),
          rot: 0, spin: 0,
          life: 3,
        });
      }
    },
  },

  // -- DESERT RUINS. Sand streams past on the wind cycle (the same signed
  // `wind` cue as the push), and the collapse (`layout`) kicks masonry
  // toward the lens.
  ruins: {
    every: 0.5,
    ambient(ctx) {
      ctx.spawn({
        x: rand(-300, 1100), y: rand(120, 560),
        z: rand(0.8, 2.2),
        w: rand(60, 130), h: 0,
        tex: streakTexture("sand", "rgba(230, 196, 140, 0.7)"),
        alpha: rand(0.16, 0.3),
        vx: rand(260, 480), vy: rand(-8, 12),
        rot: 0, spin: 0,
        life: 4,
      });
    },
    cue(name, strength, ctx) {
      if (name === "wind") {
        const dir = Math.sign(strength) || 1;
        for (let i = 0; i < 8; i++) {
          ctx.spawn({
            x: dir > 0 ? rand(-1400, -200) : rand(1480, 2680),
            y: rand(100, 560),
            z: rand(0.8, 2.4),
            w: rand(80, 160), h: 0,
            tex: streakTexture("sand", "rgba(230, 196, 140, 0.7)"),
            flipX: dir < 0,
            alpha: rand(0.2, 0.35),
            vx: dir * rand(700, 1100), vy: rand(-10, 14),
            rot: 0, spin: 0,
            life: 4,
          });
        }
      }
      if (name === "layout") {
        for (let i = 0; i < 8; i++) {
          ctx.spawn({
            x: rand(140, 620), y: rand(-60, 240),
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
      }
    },
  },

  // -- JUNGLE TEMPLE. God-ray shafts hang far behind and flare on the
  // re-light (`bloom`); leaves drift past the lens; fireflies weave between;
  // the whip's `surge` gusts a shower toward centre.
  jungle: {
    every: 0.5,
    setup(ctx, settled) {
      // Standing for the match: hold out for the painted shafts while the
      // loader is still working; fall back for good once it has settled.
      if (!settled && !artTexture("godray_shaft")) return false;
      for (let i = 0; i < 3; i++) {
        ctx.spawn({
          x: 260 + i * 340, y: rand(120, 180),
          z: -8 + i * 0.5,
          // The painting is a WIDE cone (about 1.6 tall per unit wide) where
          // the drawing was a narrow shaft (5.3), so taking its height from
          // its aspect gives a stub of light that stops in mid-air instead of
          // a beam falling through the canopy. The shaft states its own height
          // when the plate is in play — a soft vertical gradient stretches
          // without artefact, and the length IS the read.
          w: byArt("godray_shaft", rand(200, 270), rand(140, 190)),
          h: byArt("godray_shaft", rand(460, 560), 0),
          tex: rayTexture(),
          // The plate is painted very pale — a light shaft, not a light. Against
          // a canopy backdrop that is already bright green, additive at the
          // drawing's 0.35 added nothing visible; this is the value the shafts
          // actually read at. `bloom` still flickers them brighter from here.
          alpha: byArt("godray_shaft", 0.8, 0.35),
          vx: 0, vy: 0, rot: 0, spin: 0,
          sway: 8, swayRate: 0.05, swayAxis: "x",
          behind: true,
          additive: true,
          life: Infinity,
          flicker: 0,
        });
      }
    },
    ambient(ctx) {
      if (Math.random() < 0.25) {
        ctx.spawn({
          x: rand(-60, 1340), y: rand(160, 520),
          z: rand(0.3, 1.2),
          w: rand(5, 8), h: 0,
          tex: dotTexture("firefly", "rgba(98, 255, 154, 0.95)"),
          alpha: rand(0.5, 0.85),
          vx: rand(-24, 24), vy: rand(-14, 14),
          rot: 0, spin: 0,
          sway: 16, swayRate: rand(0.8, 1.4),
          additive: true,
          life: rand(3, 5),
        });
        return;
      }
      const near = Math.random() < 0.35;
      ctx.spawn({
        x: rand(-200, 1480), y: rand(-160, -40),
        // A near leaf is bigger, faster and fainter — the three things that
        // together read as "close to the lens" rather than "a big leaf".
        z: near ? rand(2.6, 4.2) : rand(0.9, 1.8),
        w: near ? rand(46, 74) : rand(22, 34),
        h: 0,
        tex: leafTexture(Math.random() < 0.85 ? "#8fce7a" : "#d8c36a"),
        alpha: near ? rand(0.4, 0.6) : rand(0.7, 0.9),
        vx: rand(20, 62), vy: rand(70, 130),
        rot: rand(0, Math.PI * 2), spin: rand(-2.4, 2.4),
        sway: rand(18, 46), swayRate: rand(1.4, 2.6),
        life: 14,
      });
    },
    cue(name, strength, ctx) {
      if (name === "bloom") {
        for (const c of ctx.cards) if (c.behind) c.flicker = 0.6;
      }
      if (name === "surge") {
        for (let i = 0; i < 8; i++) {
          ctx.spawn({
            x: rand(900, 2200), y: rand(-80, 300),
            z: rand(1.2, 3),
            w: rand(28, 50), h: 0,
            tex: leafTexture("#8fce7a"),
            alpha: rand(0.5, 0.75),
            vx: rand(-520, -320), vy: rand(60, 160),
            rot: rand(0, Math.PI * 2), spin: rand(-6, 6),
            life: 4,
          });
        }
      }
    },
  },

  // -- ORBITAL PLATFORM. The starfield drifts far behind, patient; the
  // debris pass (`lightning`) sends glint streaks through the upper lane in
  // front — the same event as the chunks that can hit you.
  orbital: {
    every: 0.7,
    ambient(ctx) {
      if (Math.random() < 0.12) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        ctx.spawn({
          x: dir > 0 ? -160 : 1440, y: rand(0, 240),
          z: rand(0.8, 1.8),
          w: rand(60, 110), h: 0,
          tex: streakTexture("star-glint", "rgba(200, 235, 255, 0.8)"),
          flipX: dir < 0,
          alpha: rand(0.25, 0.4),
          vx: dir * rand(180, 300), vy: rand(10, 40),
          rot: 0, spin: 0,
          additive: true,
          life: 8,
        });
        return;
      }
      ctx.spawn({
        x: rand(-100, 1380), y: rand(-40, 420),
        z: rand(-10, -6),
        w: rand(3, 7), h: 0,
        tex: dotTexture("star", "rgba(240, 248, 255, 0.95)"),
        alpha: rand(0.4, 0.8),
        vx: -6, vy: 0, rot: 0, spin: 0,
        behind: true,
        additive: true,
        life: 26,
      });
    },
    cue(name, strength, ctx) {
      if (name !== "lightning") return;
      for (let i = 0; i < 2; i++) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        ctx.spawn({
          x: dir > 0 ? rand(-800, -200) : rand(1480, 2080),
          y: rand(-60, 120),
          z: rand(1.2, 2),
          w: rand(160, 260), h: 0,
          tex: streakTexture("star-glint", "rgba(200, 235, 255, 0.8)"),
          flipX: dir < 0,
          alpha: rand(0.4, 0.55),
          vx: dir * rand(2200, 2600), vy: rand(120, 220),
          rot: 0, spin: 0,
          additive: true,
          life: 1.5,
        });
      }
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
