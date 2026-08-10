import { state } from "./state.js";
import { rand, clamp } from "./utils.js";

/** Low-level spawn for the element recipes in fx.js. Beyond the classic dot
 *  fields, a particle may carry:
 *    ramp      array of colours walked over its life (fire cooling, smoke
 *              darkening) — wins over `color`
 *    additive  false to draw with source-over (smoke, blood) instead of the
 *              default "lighter" glow
 *    shape     "streak" (a line along velocity — glints, speed lines) or
 *              "fork" (a jagged lightning branch, fixed at spawn) — default dot
 *    grow      per-frame size factor; >1 grows (smoke), default 0.985 shrinks
 *    wobbleAmp / wobbleFreq  sinusoidal lateral drift (feathers, petals)
 *    forkPts   the fork's own polyline, [[dx,dy],...], built at spawn */
export function emit(props) {
  if (state.particles.length > 700) return;
  state.particles.push({
    x: 0, y: 0, vx: 0, vy: 0, gravity: 0,
    size: 4, life: 0.4, maxLife: 0.4, color: "#ffffff",
    ...props,
  });
}

export function burst(x, y, color, count = 20, force = 1) {
  if (state.particles.length > 700) return;
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = (120 + rand(0, 420)) * force;
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 120,
      size: 3 + rand(0, 9),
      life: 0.28 + rand(0, 0.48),
      maxLife: 0.76,
      color,
    });
  }
}

export function dust(x, y, count = 10) {
  if (state.particles.length > 700) return;
  for (let i = 0; i < count; i++) {
    state.particles.push({
      x: x + rand(-18, 18), y,
      vx: rand(-90, 90),
      vy: -40 - rand(0, 120),
      gravity: 360,
      size: 5 + rand(0, 12),
      life: 0.22 + rand(0, 0.35),
      maxLife: 0.57,
      color: "rgba(188, 196, 220, 0.8)",
    });
  }
}

export function sparkLine(x, y, dirX, color, count = 12) {
  for (let i = 0; i < count; i++) {
    state.particles.push({
      x, y: y + rand(-14, 14),
      vx: dirX * (220 + rand(0, 480)),
      vy: rand(-140, 140),
      gravity: 60,
      size: 2 + rand(0, 6),
      life: 0.16 + rand(0, 0.3),
      maxLife: 0.46,
      color,
    });
  }
}

export function ring(x, y, color, radius = 60) {
  state.particles.push({ ringR: 8, ringMax: radius, x, y, life: 0.32, maxLife: 0.32, color, size: 0, vx: 0, vy: 0, gravity: 0 });
}

export function popup(x, y, text, color = "#ffffff", size = 26) {
  state.popups.push({ x: clamp(x, 60, 1220), y: clamp(y, 60, 660), vy: -46, text, color, size, life: 0.7, maxLife: 0.7 });
}

export function banner(text, color = "#ffffff", opts = {}) {
  state.banners.push({
    x: opts.x ?? 640, y: opts.y ?? 200,
    vy: opts.vy ?? -12,
    text, color,
    size: opts.size ?? 54,
    life: opts.life ?? 1.1,
    maxLife: opts.life ?? 1.1,
  });
}

export function updateParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.life -= dt;
    if (p.life <= 0) { state.particles.splice(i, 1); continue; }
    if (p.ringMax) {
      p.ringR += (p.ringMax - p.ringR) * dt * 14;
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.gravity * dt;
    if (p.wobbleAmp) {
      const age = p.maxLife - p.life;
      p.x += Math.sin(age * (p.wobbleFreq || 6) + (p.wobblePhase || 0)) * p.wobbleAmp * dt;
    }
    p.size *= Math.pow(p.grow ?? 0.985, dt * 60);
  }
  for (let i = state.popups.length - 1; i >= 0; i--) {
    const p = state.popups[i];
    p.life -= dt;
    p.y += p.vy * dt;
    if (p.life <= 0) state.popups.splice(i, 1);
  }
  for (let i = state.banners.length - 1; i >= 0; i--) {
    const b = state.banners[i];
    b.life -= dt;
    b.y += b.vy * dt;
    if (b.life <= 0) state.banners.splice(i, 1);
  }
}

// A ramped particle walks its colour list over its life: fire cools from
// white through orange to a dying red, smoke darkens as it thins.
function liveColor(p) {
  if (!p.ramp) return p.color;
  const t = clamp(1 - p.life / p.maxLife, 0, 0.999);
  return p.ramp[Math.floor(t * p.ramp.length)];
}

export function drawParticles(ctx) {
  ctx.save();
  let op = "lighter";
  ctx.globalCompositeOperation = op;
  for (const p of state.particles) {
    const alpha = clamp(p.life / 0.55, 0, 1);
    ctx.globalAlpha = alpha;
    const want = p.additive === false ? "source-over" : "lighter";
    if (want !== op) { op = want; ctx.globalCompositeOperation = op; }
    if (p.ringMax) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      // Floored: canvas throws on a negative radius, and an exception here
      // aborts the whole frame's rendering, not just this one ring.
      ctx.arc(p.x, p.y, Math.max(0, p.ringR), 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.shape === "streak") {
      // A line along the velocity — the particle IS its own motion blur.
      const k = p.streakLen || 0.045;
      ctx.strokeStyle = liveColor(p);
      ctx.lineWidth = Math.max(1, p.size / 2.5);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * k, p.y - p.vy * k);
      ctx.stroke();
    } else if (p.shape === "fork" && p.forkPts) {
      // A jagged branch, fixed where it spawned — lightning, cracks.
      ctx.strokeStyle = liveColor(p);
      ctx.lineWidth = Math.max(1.2, p.size / 3);
      ctx.lineJoin = "miter";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      for (const [dx, dy] of p.forkPts) ctx.lineTo(p.x + dx, p.y + dy);
      ctx.stroke();
    } else {
      ctx.fillStyle = liveColor(p);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, p.size / 2), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// popups float in world space (they follow fighters through the camera)
export function drawPopupsWorld(ctx) {
  ctx.save();
  ctx.textAlign = "center";
  for (const p of state.popups) {
    ctx.globalAlpha = clamp(p.life / 0.35, 0, 1);
    ctx.font = `900 ${p.size}px Inter, sans-serif`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.restore();
}

// banners are screen-space announcements
export function drawBannersScreen(ctx) {
  ctx.save();
  ctx.textAlign = "center";
  for (const b of state.banners) {
    ctx.globalAlpha = clamp(b.life / 0.35, 0, 1);
    ctx.font = `900 ${b.size}px Inter, sans-serif`;
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.9)";
    ctx.strokeText(b.text, b.x, b.y);
    ctx.fillStyle = b.color;
    ctx.fillText(b.text, b.x, b.y);
  }
  ctx.restore();
}
