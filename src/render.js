import { state } from "./state.js";
import { getImage } from "./assets.js";
import { sharedAdjust, AURA_H, AURA_PULSE, AURA_FOOT_DY } from "./shared_sprites.js";
import { getStage } from "./stages.js";
import { drawCharFrame, currentFrame } from "./render_backend.js";
import { getActor } from "./characters.js";
import { fighterTransform, trailStrength } from "./motion.js";
import { TRAIL_ALPHA, STRIKE_ARC } from "./config_tuning.js";
import { drawParticles, drawPopupsWorld, drawBannersScreen } from "./particles.js";
import { hitboxRect, hurtbox, summonBox } from "./combat.js";
import { applyCamera, releaseCamera } from "./camera.js";
import { cameraMode, camera3d } from "./camera_mode.js";
import {
  WORLD, SHIELD_MAX, PARRY_WINDOW, SAKURAI, SAKURAI_POP,
  RESPAWN_WAIT, RESPAWN_PLATFORM_Y, RESPAWN_PLATFORM_HALF_W, RESPAWN_PLATFORM_TIME,
} from "./constants.js";
import { clamp, colorAlpha } from "./utils.js";
import { PROJ_TRAIL } from "./config_fx.js";
import { headHeightTarget } from "./heights.js";
import { strikeArcs, visibleArtReach, swingExtent } from "./moves.js";
import { bodyWidth } from "./silhouette.js";
import { strikePoint, STRIKE_STATES } from "./strike_points.js";
import { respawnX } from "./fighter.js";
import { isFoe } from "./teams.js";

export function draw(ctx) {
  if (cameraMode === "3d" && camera3d) {
    draw3d(ctx);
    return;
  }
  ctx.clearRect(0, 0, WORLD.w, WORLD.h);
  applyCamera(ctx);

  drawBackdrop(ctx);
  drawDomainBackdrop(ctx);
  drawPlatforms(ctx);

  for (const e of state.entities) if (e.draw) e.draw(ctx);
  drawProjectiles(ctx);
  drawFighters(ctx);
  // Over the fighters, not behind them: the arc is light cutting through the
  // air in front of the swing, and additive light over the art is what sells
  // that. It sits far enough out (strikeArcs measures from the hitbox edge)
  // that it never covers the body it came from.
  drawStrikeArcs(ctx);
  if (state.debugHitboxes) drawDebug(ctx);
  drawParticles(ctx);
  drawPopupsWorld(ctx);
  // Stage effects that must cover the fighters (Mist Pier's fog, Quiet Hall's
  // hush) draw here, above the scene but still in world space.
  for (const e of state.entities) if (e.drawTop) e.drawTop(ctx);

  releaseCamera(ctx);

  drawDomainOverlay(ctx);
  drawBannersScreen(ctx);
  drawVignette(ctx);
  drawScreenFlash(ctx);
}

// The 2.5D frame (docs/2.5d-camera-plan.md §6). The WebGL canvas underneath
// takes the scene — backdrop, domain planes, platforms, fighter and projectile
// billboards — posed by the camera rig; this canvas keeps everything else,
// exactly as the flat path draws it, positioned by the rig's projection of the
// gameplay plane. Because every world-space overlay draw sits on z = 0 and the
// rig's yaw/pitch are clamped tiny, one affine transform lands them all on the
// fighters with zero per-effect changes.
function draw3d(ctx) {
  camera3d.draw(state);

  ctx.clearRect(0, 0, WORLD.w, WORLD.h);
  const t = camera3d.overlayTransform();
  ctx.save();
  ctx.transform(t.a, t.b, t.c, t.d, t.e, t.f);

  // `e.draw` is NOT here — it is a quad in the scene, behind the fighters
  // (src/camera3d/effects.js). This canvas sits above the whole WebGL layer,
  // so drawing an entity on it can only ever put it in FRONT of every
  // fighter, and these are the biggest pictures in the game: an ultimate wave
  // painted here erased the fighter it was cast at and the one across the
  // stage with it. `e.drawTop` still runs below, because effects that mean to
  // cover the fighters are exactly what that hook is for.
  //
  // Projectile bodies are billboards in the scene; their comet trails are
  // additive strokes and stay here, over the scene like every other glow.
  for (const p of state.projectiles) drawProjectileTrail(ctx, p);
  drawFighters(ctx, { bodies: false });
  drawStrikeArcs(ctx);
  if (state.debugHitboxes) drawDebug(ctx);
  drawParticles(ctx);
  drawPopupsWorld(ctx);
  for (const e of state.entities) if (e.drawTop) e.drawTop(ctx);

  releaseCamera(ctx);

  drawDomainOverlay(ctx);
  drawBannersScreen(ctx);
  drawVignette(ctx);
  drawScreenFlash(ctx);
}

function drawBackdrop(ctx) {
  const stage = getStage(state.stageKey);
  const img = getImage(`bg:${stage.key}`);
  if (img) {
    const scale = Math.max(WORLD.w / img.width, WORLD.h / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (WORLD.w - w) / 2, (WORLD.h - h) / 2, w, h);
  } else {
    ctx.fillStyle = cachedGradient("backdrop", () => {
      const grad = ctx.createLinearGradient(0, 0, 0, WORLD.h);
      grad.addColorStop(0, "#141b33");
      grad.addColorStop(1, "#05070f");
      return grad;
    });
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  }
  ctx.fillStyle = "rgba(3, 5, 12, 0.30)";
  ctx.fillRect(-200, -200, WORLD.w + 400, WORLD.h + 400);
  ctx.fillStyle = stage.tint;
  ctx.fillRect(-200, -200, WORLD.w + 400, WORLD.h + 400);
}

function drawPlatforms(ctx) {
  for (const p of state.platforms) drawPlatformShape(ctx, p);
}

// Exported so the sprite workbench can show a real platform to align feet
// against, rather than an approximation that could drift from the game.
// Active Boards may tag a platform: `ghost` (phased out — skeletal outline,
// no collision), `shakeMag` (crumble tremor), `accent` (edge-light override).
// Canvas gradients are objects the context builds on demand, and several of the
// ones below were being rebuilt every frame out of values that never change: a
// stage with forty platforms allocated forty gradients a frame for six fixed
// colours, and the two full-screen vignettes rebuilt theirs on every frame they
// were visible. They are memoised here instead, keyed by everything that shapes
// them.
//
// Gradient coordinates are resolved against the transform in force when the
// gradient is USED, not when it is built — which is what lets a platform's
// gradient be built once in its own 0..w space and then be moved to wherever
// that platform currently is (see below). That is the whole trick, and it is
// why moving platforms do not defeat this.
const gradientCache = new Map();

function cachedGradient(key, build) {
  let grad = gradientCache.get(key);
  if (!grad) {
    // Nothing here has an unbounded key space — platform widths, character
    // themes — but a cache that can only grow is a leak waiting for a stage
    // that does something unexpected, so it resets rather than climbing.
    if (gradientCache.size > 200) gradientCache.clear();
    grad = build();
    gradientCache.set(key, grad);
  }
  return grad;
}

function platformGradient(ctx, kind, w) {
  return cachedGradient(`plat:${kind}:${Math.round(w)}`, () => {
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    if (kind === "main") {
      grad.addColorStop(0, "#263044");
      grad.addColorStop(0.5, "#111827");
      grad.addColorStop(1, "#4d3a19");
    } else {
      grad.addColorStop(0, "#1d2739");
      grad.addColorStop(0.5, "#111827");
      grad.addColorStop(1, "#2a2f3f");
    }
    return grad;
  });
}

export function drawPlatformShape(ctx, p) {
  ctx.save();
  if (p.shakeMag) ctx.translate((Math.random() - 0.5) * p.shakeMag, (Math.random() - 0.5) * p.shakeMag * 0.5);
  if (p.ghost) {
    ctx.globalAlpha = 0.3;
    ctx.setLineDash([7, 6]);
    ctx.strokeStyle = "rgba(180, 200, 230, 0.8)";
    ctx.lineWidth = 2;
    roundRect(ctx, p.x, p.y, p.w, p.h, 8);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.fillStyle = "rgba(2, 3, 8, 0.45)";
  roundRect(ctx, p.x + 8, p.y + 12, p.w, p.h, 8);
  ctx.fill();

  // Moved to the platform rather than rebuilt at it: the cached gradient spans
  // 0..w in local space and the translate places it.
  ctx.save();
  ctx.translate(p.x, 0);
  ctx.fillStyle = platformGradient(ctx, p.kind, p.w);
  roundRect(ctx, 0, p.y, p.w, p.h, 8);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = p.accent || (p.kind === "main" ? "rgba(255, 211, 92, 0.55)" : "rgba(97, 216, 255, 0.45)");
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x + 6, p.y + 1);
  ctx.lineTo(p.x + p.w - 6, p.y + 1);
  ctx.stroke();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// The comet tail sampled in updateProjectiles: segments thin and fade toward
// the oldest point, in the projectile's own colour.
function drawProjectileTrail(ctx, p) {
  const pts = p.trailPts;
  if (!PROJ_TRAIL.enabled || !pts || pts.length < 4) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = p.color;
  ctx.lineCap = "round";
  const segs = pts.length / 2 - 1;
  for (let i = 0; i < segs; i++) {
    const t = (i + 1) / (segs + 1); // 0 at the tail tip, ~1 at the head
    ctx.globalAlpha = PROJ_TRAIL.alpha * t;
    ctx.lineWidth = Math.max(1, p.r * PROJ_TRAIL.width * t);
    ctx.beginPath();
    ctx.moveTo(pts[i * 2], pts[i * 2 + 1]);
    ctx.lineTo(pts[i * 2 + 2], pts[i * 2 + 3]);
    ctx.stroke();
  }
  ctx.restore();
}

function drawProjectiles(ctx) {
  for (const p of state.projectiles) {
    drawProjectileTrail(ctx, p);
    const sprite = p.sprite ? getImage(p.sprite) : null;
    if (sprite) {
      // The drawing's own adjustment (src/shared_sprites.js). `spriteH` has the
      // scale folded in already — it is a kit number — so only the nudge is
      // read here, and it moves the PICTURE, never `p.x`/`p.y`, which are what
      // the projectile collides on.
      const adj = sharedAdjust(p.sprite);
      const h = p.spriteH || p.r * 3;
      const w = sprite.width * h / sprite.height;
      ctx.save();
      ctx.translate(p.x, p.y + (p.wave ? p.r * 0.68 : 0));
      // Point the art along its actual flight path. An arcing shot used to
      // hold one orientation the whole way, which read as a sliding decal.
      // The art faces LEFT natively and is mirrored when travelling right, so
      // the nose already points along vx; the rotation only has to add the
      // vertical component, measured in that same mirrored frame.
      const flip = p.vx > 0 ? -1 : 1;
      if (p.vy) ctx.rotate(Math.atan2(-flip * p.vy, -flip * p.vx));
      ctx.scale(flip, 1);
      if (adj.rot) ctx.rotate(adj.rot);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      // Inside the mirrored frame, so a nudge follows the drawing rather than
      // reversing when the shot travels the other way.
      ctx.drawImage(sprite, -w / 2 + adj.dx, -h / 2 + adj.dy, w, h);
      ctx.restore();
      continue;
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const grad = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.45, p.color);
    // Fade to a transparent version of the projectile's OWN colour — a fixed
    // blue outer stop made every fallback fire/blood orb glow blue at the rim.
    grad.addColorStop(1, colorAlpha(p.color, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// The crescent of energy a swing cuts through the air, drawn on the arc the
// blow actually travels: centred on the fighter, curved around them at exactly
// the distance the hitbox reaches, for exactly the frames it is live.
//
// It is doing a job, not just decorating. Melee boxes still reach past the
// painted art — deliberately now, by a fixed grace margin per move type rather
// than by whatever each character's drawing happened to allow (MELEE_GRACE in
// config_tuning.js) — so without a mark at the real edge those hits land out of
// thin air. The arc is that mark, and because strikeArcs() measures it off the
// hitbox, retuning a move's reach moves the arc with it.
//
// It carries three readings, not one:
//
//   distance   the radius, which IS the hitbox's far edge
//   strength   thickness, brightness and trail length, off the move's damage
//              and how long the smash was charged
//   angle      a short arrow at the leading edge, pointing the way the hit
//              will throw whoever it catches
//
// plus a brighter ring at the sweetspot, where the move has one, so spacing
// for the tip of a long weapon is something you can see.
//
// Everything about WHERE it goes lives in strikeArcs (moves.js); this draws it.
function drawStrikeArcs(ctx) {
  for (const hb of state.hitboxes) {
    if (hb.age < 0 || hb.age > hb.dur) continue;               // active frames only
    const f = hb.owner;
    if (!f || f.dead || !f.char) continue;                     // summons have no theme
    // Note that hitPause is NOT skipped: the hitbox freezes with its owner, and
    // the arc freezing alongside it is the impact holding on screen. Dropping
    // it here would blink the swing out at the exact moment it connected.
    const facing = hb.facing ?? f.facing;
    const bodyH = headHeightTarget(f.spriteChar || f.charKey) || 175;
    const k = clamp(hb.age / Math.max(hb.dur, 0.001), 0, 1);
    const color = f.char.theme || "#8fd3ff";
    const power = arcPower(hb);
    // Where along the arc the move is strongest, if it has such a place. A
    // derived tip band carries its own draw radius; an authored one (Nanami's
    // 7:3) is a centre-to-centre distance, so it comes in by half a body.
    const sweet = hb.critBand
      ? hb.critBand.ring ?? hb.critBand.center - bodyWidth(f.spriteChar || f.charKey) * 0.5
      : 0;
    for (const a of strikeArcs(hb, bodyH)) {
      strikeArc(ctx, f.x, f.y + a.pivotY, facing, a, k, color, power, hb, sweet);
    }
  }
}

/** How heavy a swing reads, 0.35-1.6ish. Damage against the reference, plus
 *  whatever the player put into charging it. */
function arcPower(hb) {
  const A = STRIKE_ARC;
  const raw = (hb.dmg || 0) / A.powerRef * (1 + (hb.charge || 0) * A.chargeBoost);
  return clamp(raw, A.powerMin, A.powerMax);
}

/** One crescent, `a` as returned by strikeArcs, `k` the fraction of the active
 *  window elapsed. Drawn as a run of short arc strokes: a canvas gradient
 *  cannot follow a curve, and stepping along it also buys the taper toward the
 *  tips and the bright head that runs the length of the swing. */
function strikeArc(ctx, x, y, facing, a, k, color, power = 1, hb = null, sweet = 0) {
  const A = STRIKE_ARC;
  // Out to full reach over the opening of the window, so the crescent travels
  // outward instead of switching on at its final size. The HITBOX uses the same
  // curve (swingExtent, moves.js), so the crescent is not an impression of the
  // swing — it is where the swing has actually got to.
  const radius = a.radius * swingExtent(k);
  // Swell and fade over the whole of it.
  const fade = Math.sin(k * Math.PI) ** 0.7 * (1 + (power - 1) * A.powerAlpha);
  if (fade <= 0.01) return;
  // A heavy swing cuts a heavier line. Both the band's weight and the length of
  // its trail come off the same power, so a jab and a charged smash are told
  // apart at a glance rather than by reading a damage popup afterwards.
  const thick = clamp(radius * A.thickness, A.thicknessMin, A.thicknessMax)
    * (1 + (power - 1) * A.powerThickness);
  const echoes = clamp(Math.round(A.echoes * power), A.echoesMin, A.echoesMax);
  // Where the bright head has got to, in the arc's own -1..1 coordinate.
  const head = -1 + 2 * (k < 0.5 ? 2 * k * k : 1 - (1 - k) ** 2 * 2);

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);       // arcs are authored facing +x; mirror the frame
  ctx.lineCap = "round";

  const STEPS = 18;
  // A dark band under the leading crescent, in normal compositing, before any
  // of the additive light goes down. Additive alone adds nothing over bright
  // ground, so on a sunlit stage the arc would fade out in exactly the frame it
  // matters; this is what it sits on. Tapered like the band it backs, so it
  // never shows past the tips.
  ctx.strokeStyle = "rgba(8,10,20,1)";
  for (let i = 0; i < STEPS; i++) {
    const t0 = -1 + 2 * (i / STEPS);
    const t1 = -1 + 2 * ((i + 1) / STEPS);
    const taper = Math.cos(((t0 + t1) / 2) * Math.PI / 2) ** 0.8;
    ctx.globalAlpha = fade * taper * A.shadeAlpha;
    ctx.lineWidth = thick * (0.45 + 0.55 * taper) * A.shadeWidth;
    ctx.beginPath();
    ctx.arc(0, 0, radius, a.aim + a.span * t0, a.aim + a.span * t1);
    ctx.stroke();
  }

  ctx.globalCompositeOperation = "lighter";
  // The leading crescent first, then its trail: each echo a step further in and
  // fainter, with its bright head lagging behind the one in front of it.
  for (let e = 0; e < echoes; e++) {
    const er = radius * (1 - e * A.echoStep);
    const eSpan = a.span * (1 - e * A.echoNarrow);
    const eFade = fade * A.echoFade ** e;
    const eHead = head - e * A.echoLag;
    if (er < A.minRadius * 0.5) break;
    for (let i = 0; i < STEPS; i++) {
      const t0 = -1 + 2 * (i / STEPS);
      const t1 = -1 + 2 * ((i + 1) / STEPS);
      const mid = (t0 + t1) / 2;
      // Tapered to nothing at both tips, and brightest wherever the head is.
      const taper = Math.cos(mid * Math.PI / 2) ** 0.8;
      const lit = Math.exp(-(((mid - eHead) / A.headWidth) ** 2));
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, er, a.aim + eSpan * t0, a.aim + eSpan * t1);
      // A soft halo the whole length of the reach, so the arc is legible as a
      // shape even where the swing has not got to yet.
      ctx.globalAlpha = eFade * taper * A.glowAlpha;
      ctx.lineWidth = thick * A.glowWidth;
      ctx.stroke();
      // The band itself, swelling where the swing is.
      ctx.globalAlpha = eFade * taper * (A.alpha + A.headAlpha * lit);
      ctx.lineWidth = thick * (0.45 + 0.55 * taper) * (0.6 + 0.6 * lit);
      ctx.stroke();
      // And a thin white core along the lit stretch — the edge doing the
      // cutting. Only the leading crescent has one; a trail has no edge.
      if (e === 0 && lit > 0.3) {
        ctx.globalAlpha = eFade * taper * lit * 0.8;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = Math.max(1.4, thick * 0.2);
        ctx.stroke();
      }
    }
  }

  // The sweetspot, where the move has one: a bright thin ring at the distance
  // it hits hardest. Drawn inside the arc's own frame, so it curves with the
  // swing and sits exactly where the band is tested. Only worth drawing on a
  // forward swing whose reach it actually falls inside.
  if (sweet > A.minRadius * 0.5 && sweet <= a.radius * 1.02) {
    const sr = Math.min(sweet, radius);
    ctx.globalAlpha = fade * A.sweetAlpha;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = A.sweetWidth;
    ctx.beginPath();
    ctx.arc(0, 0, sr, a.aim - a.span * 0.8, a.aim + a.span * 0.8);
    ctx.stroke();
  }

  // The point of contact: a small bloom riding the arc where the head is.
  const hx = Math.cos(a.aim + a.span * head) * radius;
  const hy = Math.sin(a.aim + a.span * head) * radius;
  const bloom = ctx.createRadialGradient(hx, hy, 0, hx, hy, thick * 1.3);
  bloom.addColorStop(0, "#ffffff");
  bloom.addColorStop(0.3, color);
  bloom.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = fade * 0.5;
  ctx.fillStyle = bloom;
  ctx.beginPath();
  ctx.arc(hx, hy, thick * 1.3, 0, Math.PI * 2);
  ctx.fill();

  // And where it will send them. A short arrow off the contact point along the
  // launch vector — the one property of an attack that used to be completely
  // invisible until after it had landed, which made spacing against an unknown
  // character guesswork. Drawn in the mirrored frame, so +x is forward and the
  // arrow reads correctly whichever way the fighter faces.
  if (hb) drawAngleTick(ctx, hx, hy, hb, fade, power, color);
  ctx.restore();
}

/** The launch-direction arrow at the leading edge of a swing. */
function drawAngleTick(ctx, hx, hy, hb, fade, power, color) {
  const A = STRIKE_ARC;
  // The Sakurai angle has no fixed value — it depends on the victim's state at
  // the moment of contact (combat.js) — so it is shown at the angle it takes
  // once the hit is strong enough to launch, which is the case that matters.
  const raw = hb.angle ?? 0.35;
  const angle = raw === SAKURAI ? SAKURAI_POP : raw;
  const len = A.angleTick * power;
  const dx = Math.cos(Math.abs(angle)) * len;
  const dy = -Math.sin(angle) * len;          // canvas y grows downward
  ctx.globalAlpha = fade * A.angleTickAlpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = A.angleTickWidth * power;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx + dx, hy + dy);
  ctx.stroke();
  // Arrowhead: two short barbs swept back from the tip.
  const head = Math.atan2(dy, dx);
  const barb = len * 0.36;
  for (const s of [0.5, -0.5]) {
    ctx.beginPath();
    ctx.moveTo(hx + dx, hy + dy);
    ctx.lineTo(hx + dx - Math.cos(head + s) * barb, hy + dy - Math.sin(head + s) * barb);
    ctx.stroke();
  }
}

// `bodies: false` is the 2.5D overlay pass: the body art, its shadow and its
// afterimages are billboards in the WebGL scene, so this canvas draws only the
// adornments around them — markers, revival platforms, auras, bubbles, meters,
// status effects. Everything positions in the same sim coordinates either way.
function drawFighters(ctx, { bodies = true } = {}) {
  const sorted = [...state.fighters].sort((a, b) => a.y - b.y);
  for (const f of sorted) {
    if (f.dead) continue;
    if (f.respawnTimer > 0) {
      // Still blacked out: only the marker showing where they are about to
      // come back, so the other players can read it before it happens.
      drawIncomingMarker(ctx, respawnX(f), RESPAWN_PLATFORM_Y, f.char.theme, f.respawnTimer);
      continue;
    }
    // Back, standing on their revival platform — and drawn normally, because
    // they are playing. The platform goes UNDER them.
    if (f.respawnPlat) drawRevivalPlatform(ctx, f);
    if (bodies) drawShadow(ctx, f);
    // The aura goes UNDER the body, which this canvas can only manage while
    // the body is also on it. In the 2.5D pass the body is in the WebGL layer
    // and this canvas is strictly above it, so drawing here painted the aura
    // over the fighter it belongs to — billboards.js draws it in the scene
    // instead, between the shadow and the body, exactly as here.
    if (bodies) drawInstallAura(ctx, f);

    // A transformed fighter (Megumi as Mahoraga) draws from another actor's
    // sprite set for the duration of the install; everything else about them —
    // kit, controls, hurtbox — is unchanged.
    const spriteKey = f.spriteChar || f.charKey;
    const spriteActor = getActor(spriteKey) || f.char;
    const frameKey = currentFrame(spriteKey, f.animKey, f.animTime);
    const flicker = f.invuln > 0.1 && Math.floor(f.invuln * 16) % 2 === 0;
    const shakeX = f.shakeMag > 0 ? (Math.random() - 0.5) * f.shakeMag : 0;
    const glowing = ["specialNeutral", "specialSide", "specialDown", "ult", "charge"].includes(f.animKey) || f.installs;

    const transformed = bodies && f.installs?.sprite ? getImage(f.installs.sprite) : null;
    if (transformed) {
      const h = 210;
      const w = transformed.width * h / transformed.height;
      ctx.save();
      ctx.translate(f.x + shakeX, f.y + 10);
      ctx.scale(f.facing > 0 ? -1 : 1, 1);
      ctx.globalAlpha = flicker ? 0.6 : 1;
      ctx.shadowColor = f.installs.color || f.char.shadow;
      ctx.shadowBlur = 24;
      ctx.drawImage(transformed, -w / 2, -h, w, h);
      ctx.restore();
    } else if (bodies) {
      drawTrail(ctx, f);
      const m = fighterTransform(f);
      const drew = drawCharFrame(ctx, spriteKey, frameKey, f.x + shakeX, f.y, {
        scale: spriteActor.scale,
        facing: f.facingVis,
        // Strike aiming, for backends that pose per draw (billboards): an
        // explicit controller point when input has set one on the fighter,
        // otherwise the nearest live opponent. The sprite backend ignores it —
        // a drawing cannot re-aim.
        aim: f.aimPoint || nearestOpponentPoint(f),
        // The attack's own hitbox delay, for backends that pose per draw: the
        // clip's contact frame snaps to it, so the visual hit and the live
        // hitbox agree per move and per character (moves are speed-scaled;
        // the state table's beat is one global number). animTime and the
        // action run on the same clock — beginAction rewinds both.
        beat: actionBeat(f),
        // Where the current state was cut from (fighter.js setAnim), for
        // backends that cross-fade a state change instead of snapping.
        prevAnim: f.prevAnim,
        alpha: flicker ? 0.6 : 1,
        rotation: m.rotation,
        scaleX: m.scaleX,
        scaleY: m.scaleY,
        offsetX: m.offsetX,
        offsetY: m.offsetY,
        // A frame with a ledge-grip anchor is hung from that hand on the real
        // platform corner, instead of standing its feet in mid-air beside it.
        anchorTo: f.ledge
          ? { name: "ledge", x: f.ledge.edgeX, y: f.ledge.plat.y }
          : null,
        glow: glowing ? (f.installs ? f.installs.color : f.char.shadow) : f.char.shadow,
        glowBlur: glowing ? 26 : 12,
      });
      // Art that did not load leaves a fighter who is simply not on screen —
      // still fighting, still taking damage, invisible. Draw the space they
      // occupy instead, so a missing sprite reads as a missing sprite rather
      // than as a bug in the game.
      if (!drew) drawMissingArt(ctx, f, flicker);
    }

    if (f.shielding) drawShieldBubble(ctx, f);
    if (f.dizzy > 0) drawDizzyStars(ctx, f);
    if (f.counter) drawCounterAura(ctx, f);
    if (f.simpleDomain) drawSimpleDomain(ctx, f);
    if (f.statuses.nailMarks > 0) drawNailMarks(ctx, f);
    if (f.statuses.blind > 0) drawBlindSplatter(ctx, f);
    if (f.grabbedBy) drawGrabStruggle(ctx, f);
    drawShieldMeter(ctx, f);
  }
}

// The instant this fighter's current attack turns its hitbox on, in seconds
// from action start, or undefined outside an attack (or when the anim has
// already moved on — a landed jab cut into hitstun must not carry its beat).
function actionBeat(f) {
  const d = f.action?.move?.delay;
  return typeof d === "number" && f.action.anim === f.animKey ? d : undefined;
}

// Auto-aim target: the nearest live opponent's chest, or null alone on stage.
// Only consumed by pose-per-draw backends; computed here because "who is the
// nearest opponent" is game state the renderer should not go digging for.
function nearestOpponentPoint(f) {
  let best = null;
  let bestD = Infinity;
  for (const o of state.fighters) {
    if (o.dead || o.respawnTimer > 0 || !isFoe(f, o)) continue;
    const d = Math.abs(o.x - f.x) + Math.abs(o.y - f.y);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best ? { x: best.x, y: best.y - 80 } : null;
}

// Afterimages behind a dash, roll, air dodge or tumble. The cheapest possible
// "this is fast" signal, and the one that costs no new art at all.
function drawTrail(ctx, f) {
  const strength = trailStrength(f);
  if (!strength || f.trail.length < 2) return;
  ctx.save();
  ctx.shadowColor = f.char.theme;
  ctx.shadowBlur = 10;
  for (let i = 0; i < f.trail.length; i++) {
    const g = f.trail[i];
    const fade = ((i + 1) / f.trail.length) * TRAIL_ALPHA * strength;
    drawCharFrame(ctx, f.charKey, g.frame, g.x, g.y, {
      scale: f.char.scale,
      facing: g.facing,
      alpha: fade,
      rotation: g.rot,
    });
  }
  ctx.restore();
}

function drawShadow(ctx, f) {
  const groundY = groundBelow(f);
  ctx.save();
  ctx.globalAlpha = clamp(0.42 - (groundY - f.y) / 900, 0.08, 0.42);
  ctx.fillStyle = "#020308";
  ctx.beginPath();
  ctx.ellipse(f.x, groundY + 8, 34, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function groundBelow(f) {
  let best = 700;
  for (const p of state.platforms) {
    if (f.x >= p.x - 20 && f.x <= p.x + p.w + 20 && p.y >= f.y - 4 && p.y < best) best = p.y;
  }
  return best;
}

function drawInstallAura(ctx, f) {
  if (!f.installs) return;
  const art = f.installs.aura ? getImage(f.installs.aura) : null;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const pulse = AURA_PULSE.base + AURA_PULSE.amp * Math.sin(state.matchTime * AURA_PULSE.rate);
  if (art) {
    // An aura's height is a constant here rather than a kit number, so the
    // drawing's own scale has to be read at the draw — the kit-side folding in
    // shared_sprites.js never reaches it.
    const adj = sharedAdjust(f.installs.aura);
    const h = AURA_H * pulse * adj.scale;
    const w = art.width * h / art.height;
    ctx.globalAlpha = 0.72;
    ctx.shadowColor = f.installs.color;
    ctx.shadowBlur = 18;
    if (adj.rot) {
      // About the point it is painted on — the fighter's feet — so a tilt
      // leans the aura rather than sliding it.
      ctx.translate(f.x, f.y + AURA_FOOT_DY);
      ctx.rotate(adj.rot);
      ctx.translate(-f.x, -(f.y + AURA_FOOT_DY));
    }
    ctx.drawImage(art, f.x - w / 2 + adj.dx, f.y + AURA_FOOT_DY - h + adj.dy, w, h);
    ctx.restore();
    return;
  }
  paintProceduralAura(ctx, f, f.x, f.y + AURA_ELLIPSE.dy);
  ctx.restore();
}

/** The procedural aura's geometry, so a caller that has to size a surface for
 *  it (the 2.5D scene bakes it into a texture) does not have to guess. `dy` is
 *  the ellipse centre's offset from the fighter's feet; the radii are the
 *  furthest the drawing reaches, which is the ring, not the ellipse. */
export const AURA_ELLIPSE = { dy: -60, rx: 84, ry: 84 * 1.45 };

/** The aura an install falls back to when its kit names no art, painted about
 *  (cx, cy) — the ellipse's own centre. Exported because `?camera=3d` draws
 *  the aura as a quad in the WebGL scene (so it lands BEHIND the fighter) and
 *  bakes this same drawing into that quad's texture: one implementation, so
 *  the two layers cannot drift apart. The caller owns the composite mode. */
export function paintProceduralAura(ctx, f, cx, cy) {
  ctx.globalAlpha = 0.24 + 0.1 * Math.sin(state.matchTime * 8);
  ctx.fillStyle = f.installs.color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 56, 96, 0, 0, Math.PI * 2);
  ctx.fill();
  // Distortion Solo: the aura's edge clips like an overdriven signal — a
  // square-wave ring stepping between two radii, not a smooth ellipse.
  if (!f.installs.ampUp) return;
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = f.installs.color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  const steps = 22;
  const spin = state.matchTime * 1.7;
  for (let i = 0; i <= steps; i++) {
    const a = spin + (i / steps) * Math.PI * 2;
    const r = i % 2 === 0 ? 66 : 84;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r * 1.45;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
}

/** Stand-in for a fighter whose art failed to load. Their hurtbox is the honest
 *  size to draw, being what the game is actually hitting, and the character's
 *  own shadow colour keeps two of them apart. Deliberately ugly: this is a
 *  fault, and it should look like one rather than like a style. */
function drawMissingArt(ctx, f, flicker) {
  const box = hurtbox(f);
  ctx.save();
  ctx.globalAlpha = flicker ? 0.35 : 0.65;
  ctx.fillStyle = f.char.shadow || "#ff5a6e";
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#ff5a6e";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  ctx.setLineDash([]);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("ART MISSING", box.x + box.w / 2, box.y - 6);
  ctx.restore();
}

function drawShieldBubble(ctx, f) {
  const pct = f.shield / SHIELD_MAX;
  const fresh = state.matchTime - f.shieldRaisedAt <= PARRY_WINDOW;
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = fresh ? "#ffffff" : f.char.theme;
  ctx.lineWidth = 2 + pct * 5;
  ctx.fillStyle = f.char.shadow;
  ctx.beginPath();
  ctx.arc(f.x, f.y - 70, 52 + pct * 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawShieldMeter(ctx, f) {
  if (f.shield > 99 && !f.shielding) return;
  const pct = f.shield / SHIELD_MAX;
  ctx.save();
  ctx.fillStyle = "rgba(6, 10, 20, 0.7)";
  ctx.fillRect(f.x - 35, f.y - 148, 70, 7);
  ctx.fillStyle = pct > 0.35 ? f.char.theme : "#ff5a5a";
  ctx.fillRect(f.x - 34, f.y - 147, 68 * pct, 5);
  ctx.restore();
}

// A fighter in someone's grip (?throw=true — src/grab.js): the shrinking bar
// is the hold itself, drawn over the VICTIM because escaping is their job —
// it drains on its own and every mash visibly bites a piece out of it. The
// grip ring pulses at the pair's join so a hold reads as a hold from across
// the stage, in every camera mode (this pass draws over the scene in 2.5D/3D
// exactly as it does flat).
function drawGrabStruggle(ctx, f) {
  const g = f.grabbedBy?.grab;
  if (!g) return;
  const pct = clamp(g.holdT / g.holdMax, 0, 1);
  ctx.save();
  // grip ring between the two bodies
  const gx = (f.x + f.grabbedBy.x) / 2;
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.45 + 0.25 * Math.sin(state.matchTime * 18);
  ctx.strokeStyle = f.grabbedBy.char.theme;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(gx, f.y - 78, 30 + 4 * Math.sin(state.matchTime * 12), 0, Math.PI * 2);
  ctx.stroke();
  // the escape bar: amber draining to red, over the victim's head
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(6, 10, 20, 0.7)";
  ctx.fillRect(f.x - 35, f.y - 168, 70, 8);
  ctx.fillStyle = pct > 0.4 ? "#ffd35a" : "#ff5a5a";
  ctx.fillRect(f.x - 34, f.y - 167, 68 * pct, 6);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("MASH!", f.x, f.y - 173);
  ctx.restore();
}

function drawDizzyStars(ctx, f) {
  ctx.save();
  ctx.fillStyle = "#ffd35a";
  for (let i = 0; i < 3; i++) {
    const a = state.matchTime * 5 + (i * Math.PI * 2) / 3;
    ctx.beginPath();
    ctx.arc(f.x + Math.cos(a) * 30, f.y - 130 + Math.sin(a) * 8, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCounterAura(ctx, f) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.5 + 0.3 * Math.sin(state.matchTime * 20);
  ctx.strokeStyle = "#a8e6ff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(f.x, f.y - 70, 62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// New Shadow Style: Simple Domain. Drawn as what it is: a circle on the floor
// with a hard rim, not an aura — the technique is a boundary, and the player
// needs to read where it ends. Wider and steadier than the counter shimmer it
// sits under, so the two do not read as one effect.
function drawSimpleDomain(ctx, f) {
  const { radius, color } = f.simpleDomain;
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(f.x, f.y - 6, radius, radius * 0.3, 0, 0, Math.PI * 2);
  ctx.stroke();
  // the standing wall, faint, so the circle reads as a volume
  ctx.globalAlpha = 0.22;
  ctx.beginPath();
  ctx.ellipse(f.x, f.y - 110, radius, radius * 1.1, 0, 0, Math.PI * 2);
  ctx.stroke();
  // ticks around the rim, turning slowly — the technique is holding, not idling
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + state.matchTime * 0.9;
    const x = f.x + Math.cos(a) * radius;
    const y = f.y - 6 + Math.sin(a) * radius * 0.3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 14);
    ctx.stroke();
  }
  ctx.restore();
}

// Earthen Insect Trance: the sacs burst over the eyes. Drawn on the VICTIM
// rather than over the screen — four players share one screen, so a full-screen
// blind would blind everybody, and this has to read as "they cannot see" to the
// other player too.
function drawBlindSplatter(ctx, f) {
  ctx.save();
  ctx.globalAlpha = 0.6 * Math.min(1, f.statuses.blind);
  ctx.fillStyle = "#4a2b1c";
  for (let i = 0; i < 5; i++) {
    const a = i * 1.7 + Math.floor(state.matchTime * 3) * 0.6;
    ctx.beginPath();
    ctx.ellipse(f.x - 22 + i * 11, f.y - 150 + Math.sin(a) * 4,
                7 + (i % 3) * 3, 5 + (i % 2) * 3, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Straw-doll nails: in the anime a planted nail KEEPS glowing — the payoff
// Hairpin cashes in should be visible as live cursed energy, not inert dots.
function drawNailMarks(ctx, f) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const pulse = 0.7 + 0.3 * Math.sin(state.matchTime * 9);
  for (let i = 0; i < f.statuses.nailMarks; i++) {
    const x = f.x - 24 + i * 10;
    const y = f.y - 156;
    ctx.globalAlpha = 0.55 * pulse;
    ctx.fillStyle = "#ff9a6a";
    ctx.beginPath();
    ctx.arc(x, y, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffd7b8";
    ctx.beginPath();
    ctx.arc(x, y, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Where a KO'd fighter is about to reappear, drawn during the blackout: a ring
// closing on the spot with the platform fading up under it. It is the only
// warning the other players get, and the only thing telling the player who was
// KO'd that they are a moment away from holding a stick again.
//
// It replaced a ghost idle pose standing on a platform. That drawing was there
// because a respawning fighter used to be a spectator for a second and a half;
// now they are back and playing almost immediately, and their REAL body is what
// stands on the platform (drawRevivalPlatform below).
function drawIncomingMarker(ctx, x, y, color, timeLeft) {
  const p = clamp(1 - timeLeft / RESPAWN_WAIT, 0, 1);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.25 + 0.5 * p;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 + 2 * p;
  ctx.beginPath();
  ctx.ellipse(x, y + 6, RESPAWN_PLATFORM_HALF_W * (2.2 - 1.2 * p), 16 * (2.2 - 1.2 * p), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.15 + 0.35 * p;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y + 6, RESPAWN_PLATFORM_HALF_W * p, 11 * p, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// The revival platform the fighter is standing on and playing from. It dims and
// then blinks as its time runs out, so "you are about to lose this" is readable
// without a timer — the same job the summon expiry flash does.
function drawRevivalPlatform(ctx, f) {
  const plat = f.respawnPlat;
  const p = clamp(plat.t / RESPAWN_PLATFORM_TIME, 0, 1);
  const urgent = p < 0.34;
  const blink = urgent ? 0.55 + 0.45 * Math.sin(state.matchTime * 26) : 1;
  ctx.save();
  ctx.globalAlpha = (0.35 + 0.45 * p) * blink;
  ctx.fillStyle = f.char.theme;
  ctx.beginPath();
  ctx.ellipse(plat.x, plat.y + 6, RESPAWN_PLATFORM_HALF_W, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = (0.4 + 0.4 * p) * blink;
  ctx.strokeStyle = urgent ? "#ffffff" : f.char.theme;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(plat.x, plat.y + 6, RESPAWN_PLATFORM_HALF_W, 11, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Boxes over the art, on the debug toggle (main.js). Everything the audit in
// docs/hitbox-audit.md measured offline is checkable here by eye: the red box
// is what the swing hits, the white outline is what can be hit, the amber line
// is where the ART stops — so the amber-to-red gap IS the grace margin, and it
// should look the same width on every character.
function drawDebug(ctx) {
  ctx.save();
  for (const hb of state.hitboxes) {
    if (hb.age < 0) continue;
    const r = hitboxRect(hb);
    ctx.fillStyle = "rgba(255, 80, 80, 0.32)";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    // The sweetspot, as the distance band it actually is.
    if (hb.critBand) {
      const facing = hb.facing ?? hb.owner.facing;
      ctx.strokeStyle = "rgba(255, 211, 92, 0.85)";
      ctx.lineWidth = 1.5;
      for (const d of [-hb.critBand.tolerance, hb.critBand.tolerance]) {
        const x = hb.owner.x + facing * (hb.critBand.center + d);
        ctx.beginPath();
        ctx.moveTo(x, r.y);
        ctx.lineTo(x, r.y + r.h);
        ctx.stroke();
      }
    }
  }
  // Summons carry the same two shapes a fighter does, and for the same reason:
  // white is what it can be hit ON (the whole drawing), red is what it hits
  // WITH (summons.js — the front of the creature by default, or wherever the
  // sprite workbench put it). They used to be one box, which is how a dog's
  // tail came to bite.
  for (const e of state.entities) {
    if (e.kind !== "summon" || e.dead || e.intangible) continue;
    const b = summonBox(e);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    const a = e.attackRect?.();
    if (a) {
      ctx.fillStyle = "rgba(255, 80, 80, 0.22)";
      ctx.fillRect(a.x, a.y, a.w, a.h);
      ctx.strokeStyle = "rgba(255, 120, 120, 0.85)";
      ctx.strokeRect(a.x, a.y, a.w, a.h);
    }
  }
  // Projectiles: the circle the flight test actually uses (combat.js).
  ctx.strokeStyle = "rgba(255, 120, 120, 0.85)";
  ctx.lineWidth = 1;
  for (const p of state.projectiles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Ad-hoc shapes the special/ultimate scripts registered (combat.js
  // debugShape): the inline rects and circles their scripts test hurtboxes
  // against, which this overlay was blind to. They decay here so a one-frame
  // detonation still shows for a beat.
  for (let i = state.debugShapes.length - 1; i >= 0; i--) {
    const s = state.debugShapes[i];
    s.ttl -= 1 / 60;
    if (s.ttl <= 0) { state.debugShapes.splice(i, 1); continue; }
    ctx.fillStyle = "rgba(255, 80, 80, 0.18)";
    ctx.strokeStyle = "rgba(255, 120, 120, 0.8)";
    if (s.r != null) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.strokeRect(s.x, s.y, s.w, s.h);
    }
  }
  for (const f of state.fighters) {
    if (f.dead) continue;
    const r = hurtbox(f);
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    // Where this character's artwork actually reaches, measured from their own
    // frames (silhouette.js). A hitbox extending far past this is a hit that
    // will land out of thin air.
    // Where the blow itself is (strike_points.js): the fist, foot or blade,
    // as opposed to the box it threatens with. Ringed rather than filled, and
    // colour-coded by how well it is known — cyan where a person checked it,
    // amber where it is the model's measurement, faint where it is derived
    // from the body. Only while this fighter is actually swinging.
    if (STRIKE_STATES.has(f.animKey)) {
      const sp = strikePoint(f.spriteChar || f.charKey, f.animKey);
      const px = f.x + f.facing * sp.x;
      const py = f.y + sp.y;
      ctx.strokeStyle = sp.source === "human" ? "rgba(120, 240, 255, 0.95)"
        : sp.source === "model" ? "rgba(255, 190, 90, 0.9)" : "rgba(160,170,190,0.5)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px - 10, py); ctx.lineTo(px + 10, py);
      ctx.moveTo(px, py - 10); ctx.lineTo(px, py + 10);
      ctx.stroke();
    }
    const reach = visibleArtReach(f.char);
    if (reach) {
      const x = f.x + f.facing * reach;
      ctx.strokeStyle = "rgba(255, 190, 90, 0.7)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, f.y - r.h * 1.15);
      ctx.lineTo(x, f.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
}

// The bulk of a domain's atmosphere is painted BEHIND the fighters: a domain
// runs for seconds while both players are still fighting, so tinting over the
// characters would bury the thing the player most needs to read.
function drawDomainBackdrop(ctx) {
  const d = state.domainOverlay;
  if (!d) return;
  const a = clamp(d.life / d.maxLife, 0, 1);
  ctx.save();
  // dim the stage first, then place any domain-specific environment above it
  ctx.globalAlpha = Math.min(0.72, a * 0.8);
  ctx.fillStyle = "rgba(2, 2, 8, 0.78)";
  ctx.fillRect(-200, -200, WORLD.w + 400, WORLD.h + 400);
  const art = d.sprite ? getImage(d.sprite) : null;
  if (art) {
    const scale = Math.max(WORLD.w / art.width, WORLD.h / art.height);
    const w = art.width * scale;
    const h = art.height * scale;
    ctx.globalAlpha = Math.min(0.82, a * 1.35);
    ctx.drawImage(art, (WORLD.w - w) / 2, (WORLD.h - h) / 2, w, h);
  }
  // finish with a light color grade
  ctx.globalAlpha = Math.min(0.18, a * 0.22);
  ctx.fillStyle = d.color;
  ctx.fillRect(-200, -200, WORLD.w + 400, WORLD.h + 400);
  ctx.restore();
}

// On top, only a soft edge vignette — enough to sell the enclosure without
// washing out the fighters.
function drawDomainOverlay(ctx) {
  const d = state.domainOverlay;
  if (!d) return;
  const a = clamp(d.life / d.maxLife, 0, 1);
  ctx.save();
  ctx.globalAlpha = Math.min(0.26, a * 0.3);
  ctx.fillStyle = cachedGradient(`domain:${d.color}`, () => {
    const grad = ctx.createRadialGradient(640, 360, 420, 640, 360, 900);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, d.color);
    return grad;
  });
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  ctx.restore();
}

function drawScreenFlash(ctx) {
  const fl = state.screenFlash;
  if (!fl) return;
  ctx.save();
  ctx.globalAlpha = clamp(fl.life / fl.maxLife, 0, 1) * 0.5;
  ctx.fillStyle = fl.color;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  ctx.restore();
}

// Black Flash's beat: the edges of the world drop into dark red while the
// centre — where the hit is — stays clear. Set by fx.js, stepped in main.js.
function drawVignette(ctx) {
  const v = state.vignette;
  if (!v) return;
  ctx.save();
  ctx.globalAlpha = clamp(v.life / v.maxLife, 0, 1) * v.alpha;
  ctx.fillStyle = cachedGradient(`vignette:${v.color}`, () => {
    const g = ctx.createRadialGradient(
      WORLD.w / 2, WORLD.h / 2, WORLD.h * 0.32,
      WORLD.w / 2, WORLD.h / 2, WORLD.w * 0.62,
    );
    g.addColorStop(0, colorAlpha(v.color, 0));
    g.addColorStop(1, v.color);
    return g;
  });
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  ctx.restore();
}
