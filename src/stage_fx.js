// Stage gameplay identities ("Active Boards") — the 12 Mech Mayhem arena
// hazards, designed in docs/arenas.md. Each stage owns one signature hazard —
// a scheduled event, a platform behaviour or a field modifier — built from
// the shared helpers here and run as a single scripted entity in
// state.entities.
//
// Ground rules (docs/arenas.md, "Rules every hazard obeys"):
//   1. Telegraph first — nothing hits without ≥0.8s of visible+audible
//      wind-up, and the telegraph is diegetic (a lamp, a crack, a horn).
//   2. Fair to both — hazards key off position, never off who is winning.
//   3. A camera cue on the big beat (cameraCue).
//   4. Ambient FX are constant, hazards are periodic; the rhythm is learnable.
//   5. Hazard damage is meaningful but never lethal from full health; the
//      KILL is always the blast zone, the hazard is the setup.
// The main platform's ledges always work. The Settings toggle
// (state.activeBoards) turns all of this off and returns every board to its
// static layout.

import { state } from "./state.js";
import { getStage, mainPlatform } from "./stages.js";
import { playSfx } from "./audio.js";
import { burst, dust, popup, banner, ring, sparkLine, spriteFlash } from "./particles.js";
import { getImage } from "./assets.js";
import { hitboxRect, shieldBreak } from "./combat.js";
import { clamp, sign } from "./utils.js";
// Camera cues: each gimmick pokes the 2.5D rig at its big moment. A no-op in
// flat mode (camera_mode.js swallows the call when no rig is listening), so
// nothing here needs to know which renderer is running.
import { cameraCue } from "./camera_mode.js";

// ------------------------------------------------------------------ set-up

// Called from resetMatch() after platforms and fighters exist. Installs the
// stage's field modifiers and gimmick entity — or a neutral no-op when the
// player has switched Active Boards off.
export function initStageFx() {
  state.stageMods = { gravityMul: 1, frictionPow: 1 };
  state.hazardZones = [];
  if (!state.activeBoards) return;

  const stage = getStage(state.stageKey);
  if (stage.mods) Object.assign(state.stageMods, stage.mods);

  const make = STAGE_FX[stage.key];
  if (make) state.entities.push({ owner: null, ...make(stage) });
}

// ----------------------------------------------------------------- helpers

function fighters() {
  return state.fighters.filter((f) => !f.dead && f.respawnTimer <= 0);
}

// A hazard landing on a fighter. Deliberately simpler than combat.applyHit:
// no attacker exists, so there is no meter economy, staling or passives —
// just damage, a fixed launch, and respect for the defensive layer (invuln
// frames dodge it, shields block it for chip). `iframes` is the per-fighter
// re-hit lockout so a lingering hazard connects once, not sixty times a second.
function stageHit(f, { dmg, vx = 0, vy = 0, color = "#ffd35a", label = "", iframes = 0.7 }) {
  if (f.dead || f.respawnTimer > 0 || f.invuln > 0) return false;
  if ((f.hazardIv || 0) > state.matchTime) return false;
  f.hazardIv = state.matchTime + iframes;
  if (f.shielding) {
    f.shield = Math.max(0, f.shield - dmg * 1.5);
    f.vx += vx * 0.35;
    playSfx("guardHit", 0.7);
    burst(f.x, f.y - 90, "#cfe4ff", 10, 0.6);
    if (f.shield <= 0) shieldBreak(f);
    return true;
  }
  f.damage = Math.min(999, f.damage + dmg);
  f.hitstun = Math.max(f.hitstun, 0.26);
  f.vx = vx;
  f.vy = vy;
  if (vy < 0) f.grounded = false;
  if (label) popup(f.x, f.y - 175, label, color, 17);
  popup(f.x, f.y - 150, `${dmg}%`, color, 21);
  burst(f.x, f.y - 80, color, 14, 0.9);
  playSfx("hitMedium", 0.8);
  state.camera.shake = Math.max(state.camera.shake, 4);
  return true;
}

// A soft floor hazard tick (foundry pour, volcano edge surge, frozen plunge):
// damage without interruption — no hitstun, no launch. MM's lava rule.
function softTick(f, dmg, color, label) {
  if (f.dead || f.respawnTimer > 0 || f.invuln > 0) return false;
  if ((f.softIv || 0) > state.matchTime) return false;
  f.softIv = state.matchTime + 0.5;
  f.damage = Math.min(999, f.damage + dmg);
  popup(f.x, f.y - 150, label || `${dmg}%`, color, 16);
  burst(f.x, f.y - 40, color, 6, 0.5);
  return true;
}

const setBurn = (f) => { if (!f.statuses.burn) { f.statuses.burn = { t: 1.6, tick: 0.45, dmg: 1.0, from: f }; popup(f.x, f.y - 172, "BURN", "#ff8c3a", 14); } };

// Advertise a danger area so the CPU can walk out of it (ai.js). Optional
// yMin/yMax confine the zone vertically (a strike on the high platforms
// shouldn't scare a fighter standing on the ground below it).
function warnZone(x, w, dur, opts = {}) {
  // prune spent zones on the way in so the list never grows across a match
  state.hazardZones = state.hazardZones.filter((z) => z.until > state.matchTime);
  state.hazardZones.push({ x, w, until: state.matchTime + dur, ...opts });
}

// Move a platform and carry everything attached to it: fighters standing on
// it ride along, and a fighter hanging from its ledge keeps their grip.
function movePlatform(plat, nx, ny) {
  const dx = nx - plat.x;
  const dy = ny - plat.y;
  if (!dx && !dy) return;
  plat.x = nx;
  plat.y = ny;
  for (const f of state.fighters) {
    if (f.dead) continue;
    if (f.grounded && f.currentPlatform === plat) {
      f.x += dx;
      f.y = plat.y;
    }
    if (f.ledge && f.ledge.plat === plat) f.ledge.edgeX += dx;
  }
}

const smoothstep = (t) => t * t * (3 - 2 * t);

// The topmost landable surface under a world x — where a dropped object
// (container, car husk) actually comes to rest. Falls back to the main.
function surfaceUnder(x) {
  let best = null;
  for (const p of state.platforms) {
    if (p.ghost || x < p.x || x > p.x + p.w) continue;
    if (!best || p.y < best.y) best = p;
  }
  return best || mainPlatform(state.platforms);
}

// Soft telegraph glow over a platform section.
function glowRect(ctx, x, y, w, h, color, alpha) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

// A delivered hazard sprite (assets/sprites/effects, K9), anchored at its
// bottom-centre by default. Returns false while the art is still streaming so
// every call site can keep its procedural drawing as the fallback — the
// hazards ran placeholder-drawn before the round landed and still can.
function drawFx(ctx, key, x, y, h, { flip = false, alpha = 1, rot = 0, anchor = "bottom", glow = null } = {}) {
  const img = getImage(key);
  if (!img) return false;
  const w = img.width * h / img.height;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (flip) ctx.scale(-1, 1);
  ctx.globalAlpha = alpha;
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 16; }
  ctx.drawImage(img, -w / 2, anchor === "bottom" ? -h : -h / 2, w, h);
  ctx.restore();
  return true;
}

// Total stocks on the board — watched by Desert Ruins to rebuild its columns
// during the KO pause ("the dig crew works fast").
const totalStocks = () => state.fighters.reduce((a, f) => a + (f.stocks || 0), 0);

// ------------------------------------------------------------ stage table

const STAGE_FX = {
  // -- NEON DISTRICT — THE TRAIN. Every ~22s a maglev crosses the track
  // platform. Track lights ripple in the travel direction + a station chime
  // (~1.6s), then the train crosses in ~0.9s. Anyone ON the track is hit
  // hard in the travel direction; anyone below is safe — the track is the
  // dangerous high ground. Alternates direction.
  neon(stage) {
    const PERIOD = 22, TELEGRAPH = 1.6, CROSS = 0.9;
    const track = state.platforms[1]; // the monorail track (stages.js)
    let train = null; // { x, dir, hit:Set }
    let warned = -1, launched = -1;
    const motes = Array.from({ length: 12 }, (_, i) => ({ seed: i * 53.7, t: 0 }));
    return {
      update(dt) {
        const n = Math.floor(state.matchTime / PERIOD);
        const t = state.matchTime % PERIOD;
        const dir = n % 2 === 0 ? 1 : -1;
        const goAt = PERIOD - CROSS - 0.1;
        if (t >= goAt - TELEGRAPH && warned !== n) {
          warned = n;
          playSfx("hazardSignalChirp", 0.7, 1.1); // the station chime, two beats
          warnZone(track.x, track.w, TELEGRAPH + CROSS, { yMin: track.y - 90, yMax: track.y + 24 });
        }
        if (t >= goAt && launched !== n && !train) {
          launched = n;
          train = { x: dir > 0 ? track.x - 240 : track.x + track.w + 240, dir, hit: new Set() };
          playSfx("hazardTrafficPass", 0.9, 0.8);
          cameraCue("surge", dir); // the camera leads the pass
        }
        if (train) {
          const span = track.w + 480;
          train.x += train.dir * (span / CROSS) * dt;
          for (const f of fighters()) {
            if (train.hit.has(f.id)) continue;
            const onTrack = f.y > track.y - 66 && f.y < track.y + 26 &&
              f.x > track.x - 20 && f.x < track.x + track.w + 20;
            if (onTrack && Math.abs(f.x - train.x) < 90) {
              train.hit.add(f.id);
              stageHit(f, { dmg: 30, vx: train.dir * 540, vy: -140, color: "#ff4dd8", label: "MAGLEV", iframes: 1.2 });
            }
          }
          if (train.x < track.x - 260 || train.x > track.x + track.w + 260) train = null;
        }
        // ambient: drifting neon motes
        for (const m of motes) m.t = state.matchTime * 0.2 + m.seed;
      },
      draw(ctx) {
        const t = state.matchTime % PERIOD;
        const n = Math.floor(state.matchTime / PERIOD);
        const dir = n % 2 === 0 ? 1 : -1;
        const goAt = PERIOD - CROSS - 0.1;
        // telegraph: lights rippling along the track in the travel direction
        if (t >= goAt - TELEGRAPH && t < goAt && !train) {
          const prog = (t - (goAt - TELEGRAPH)) / TELEGRAPH;
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          const count = Math.floor(track.w / 60);
          for (let i = 0; i < count; i++) {
            const k = dir > 0 ? i / count : 1 - i / count;
            const on = ((state.matchTime * 3 + k * -2) % 1) < 0.4;
            ctx.globalAlpha = on ? 0.35 + prog * 0.4 : 0.08;
            ctx.fillStyle = "#53e8ff";
            ctx.fillRect(track.x + i * 60 + 20, track.y - 4, 24, 4);
          }
          ctx.restore();
        }
        if (train) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          // light streak behind the nose, magenta body
          const grad = ctx.createLinearGradient(train.x - train.dir * 320, 0, train.x + train.dir * 40, 0);
          grad.addColorStop(0, "rgba(83, 232, 255, 0)");
          grad.addColorStop(0.75, "rgba(255, 77, 216, 0.55)");
          grad.addColorStop(1, "rgba(255, 240, 252, 0.95)");
          ctx.fillStyle = grad;
          ctx.fillRect(Math.min(train.x, train.x - train.dir * 320), track.y - 52, 320 + 40, 46);
          ctx.restore();
          // the maglev itself (delivered sprite; nose drawn facing left)
          drawFx(ctx, "effect:monorail_train", train.x, track.y + 2, 76, { flip: train.dir > 0, glow: "#ff4dd8" });
        }
        // ambient neon motes
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (const m of motes) {
          const x = ((m.seed * 97 + m.t * 40) % 1360) - 40;
          const y = 120 + ((m.seed * 61) % 380) + Math.sin(m.t * 2) * 14;
          ctx.globalAlpha = 0.2 + 0.12 * Math.sin(m.t * 3);
          ctx.fillStyle = m.seed % 2 < 1 ? "#ff4dd8" : "#53e8ff";
          ctx.fillRect(x, y, 3, 3);
        }
        ctx.restore();
      },
    };
  },

  // -- IRONWORKS FOUNDRY — THE POUR. Every ~20s the furnace tips and pours
  // onto a marked strip of the left floor: klaxon + white tap-hole glow
  // (1.2s), then molten metal sheets down for 1.5s — grounded fighters in
  // the strip take soft burn ticks (MM's lava rule: it only burns the
  // GROUNDED — jumping the pour is the answer). Leaves a cooling glow patch.
  // Secondary: the hook platform has suspension — it dips under weight.
  foundry(stage) {
    const PERIOD = 20, TELEGRAPH = 1.2, POUR = 1.5, COOL = 4;
    const plat = mainPlatform(state.platforms);
    const hook = state.platforms[2]; // the hanging hook platform (stages.js)
    const hookBase = { x: hook.x, y: hook.y };
    let hookDip = 0;
    const strip = { x: plat.x + 24, w: 210 };
    let warned = -1, poured = -1;
    let patchUntil = -1e9;
    const embers = Array.from({ length: 14 }, (_, i) => ({ seed: i * 71.3, t: 0 }));
    return {
      update(dt) {
        // hook suspension + gentle sway
        const laden = fighters().some((f) => f.grounded && f.currentPlatform === hook);
        hookDip += ((laden ? 6 : 0) - hookDip) * Math.min(1, dt * 8);
        const sway = Math.sin(state.matchTime * 0.9) * 10;
        movePlatform(hook, hookBase.x + sway, hookBase.y + hookDip + Math.sin(state.matchTime * 1.7) * 2);

        const n = Math.floor(state.matchTime / PERIOD);
        const t = state.matchTime % PERIOD;
        const pourAt = PERIOD - POUR - 0.1;
        if (t >= pourAt - TELEGRAPH && warned !== n) {
          warned = n;
          playSfx("hazardBell", 0.7, 0.6); // the klaxon
          warnZone(strip.x, strip.w, TELEGRAPH + POUR + 0.5, { yMin: plat.y - 80 });
        }
        if (t >= pourAt && poured !== n) {
          poured = n;
          playSfx("hazardFirePatch", 0.8);
          cameraCue("rattle"); // the furnace drum grinding over
          patchUntil = state.matchTime + POUR + COOL;
        }
        const pouring = t >= pourAt && t < pourAt + POUR && poured === n;
        if (pouring) {
          if (Math.random() < dt * 30) burst(strip.x + Math.random() * strip.w, plat.y - 6, "#ffb45a", 2, 0.5);
          for (const f of fighters()) {
            const inStrip = f.grounded && f.x > strip.x - 10 && f.x < strip.x + strip.w + 10 &&
              Math.abs(f.y - plat.y) < 26;
            if (inStrip && softTick(f, 12, "#ff9e40", "MOLTEN 12%")) setBurn(f);
          }
        }
        // ambient embers rise
        for (const e of embers) e.t = state.matchTime * 0.6 + e.seed;
      },
      draw(ctx) {
        const t = state.matchTime % PERIOD;
        const pourAt = PERIOD - POUR - 0.1;
        // telegraph: the tap-hole glows white over the strip
        if (t >= pourAt - TELEGRAPH && t < pourAt) {
          const a = ((t - (pourAt - TELEGRAPH)) / TELEGRAPH);
          glowRect(ctx, strip.x, plat.y - 8, strip.w, 10, "#fff3d0", 0.15 + a * 0.35);
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.5 + 0.3 * Math.sin(state.matchTime * 16);
          ctx.fillStyle = "#fff8e8";
          ctx.beginPath();
          ctx.arc(strip.x + strip.w / 2, 210, 10 + a * 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        // the pour itself: the tilting crucible sprite (delivered art) with the
        // procedural molten sheet kept underneath for the heat-haze fill
        if (t >= pourAt && t < pourAt + POUR) {
          const fade = Math.min(1, (t - pourAt) * 6) * Math.min(1, (pourAt + POUR - t) * 3);
          drawFx(ctx, "effect:ladle_pour", strip.x + strip.w / 2, plat.y + 6, 330, { alpha: fade * 0.9, glow: "#ff9e40" });
        }
        if (t >= pourAt && t < pourAt + POUR) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          const grad = ctx.createLinearGradient(0, 200, 0, plat.y);
          grad.addColorStop(0, "rgba(255, 248, 220, 0.95)");
          grad.addColorStop(1, "rgba(255, 130, 40, 0.55)");
          ctx.fillStyle = grad;
          const wob = Math.sin(state.matchTime * 22) * 6;
          ctx.fillRect(strip.x + 30 + wob, 200, strip.w - 60, plat.y - 200);
          ctx.restore();
        }
        // cooling patch
        const left = patchUntil - state.matchTime;
        if (left > 0 && left < POUR + COOL) {
          const a = clamp(left / COOL, 0, 1) * 0.4;
          glowRect(ctx, strip.x, plat.y - 6, strip.w, 8, "#ff7a2a", a + 0.08 * Math.sin(state.matchTime * 9));
        }
        // hook chain
        ctx.save();
        ctx.strokeStyle = "rgba(120, 96, 64, 0.9)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(hook.x + hook.w / 2, 150);
        ctx.lineTo(hook.x + hook.w / 2, hook.y);
        ctx.stroke();
        ctx.restore();
        // ambient embers
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (const e of embers) {
          const x = 80 + ((e.seed * 137) % 1140) + Math.sin(e.t * 1.6) * 20;
          const y = 700 - ((e.t * 46 + e.seed * 31) % 620);
          ctx.globalAlpha = 0.25 + 0.2 * Math.sin(e.t * 4);
          ctx.fillStyle = "#ffb45a";
          ctx.fillRect(x, y, 3, 3);
        }
        ctx.restore();
      },
    };
  },

  // -- UPTOWN PLAZA — no hazard. Every roster needs its Final Destination;
  // this is it. Fountain jets and drifting leaves only.
  uptown() {
    const leaves = [];
    let jetT = 0;
    let taxi = null; // { x, y, dir } — a passing air-taxi silhouette
    let taxiAt = 8 + Math.random() * 8;
    return {
      update(dt) {
        // the drone taxi crosses the skyline every ~15-25s, background only
        taxiAt -= dt;
        if (!taxi && taxiAt <= 0) {
          const dir = Math.random() < 0.5 ? 1 : -1;
          taxi = { x: dir > 0 ? -80 : 1360, y: 110 + Math.random() * 120, dir };
          taxiAt = 15 + Math.random() * 10;
        }
        if (taxi) {
          taxi.x += taxi.dir * 130 * dt;
          if (taxi.x < -120 || taxi.x > 1400) taxi = null;
        }
        if (leaves.length < 12 && Math.random() < dt * 2.5) {
          leaves.push({
            x: Math.random() * 1280, y: -20,
            vx: 16 + Math.random() * 26, vy: 36 + Math.random() * 36,
            rot: Math.random() * Math.PI * 2, spin: 1 + Math.random() * 2,
            color: Math.random() < 0.7 ? "#8fce7a" : "#d8c36a",
          });
        }
        for (let i = leaves.length - 1; i >= 0; i--) {
          const l = leaves[i];
          l.x += (l.vx + Math.sin(state.matchTime * 2 + l.rot) * 22) * dt;
          l.y += l.vy * dt;
          l.rot += l.spin * dt;
          if (l.y > 740) leaves.splice(i, 1);
        }
        jetT -= dt;
        if (jetT <= 0) {
          jetT = 0.5;
          dust(640 + (Math.random() - 0.5) * 60, 330, 2); // the bandshell fountain
        }
      },
      draw(ctx) {
        // the holographic ad panel (delivered art), glitching between frames:
        // a two-beat flicker plus the occasional one-frame horizontal tear
        const beat = Math.floor(state.matchTime * 1.6) % 2 === 0;
        const tear = Math.sin(state.matchTime * 23) > 0.96 ? 6 : 0;
        drawFx(ctx, "effect:billboard_ad", 1120 + tear, 268, 150, {
          alpha: (beat ? 0.5 : 0.34) + 0.05 * Math.sin(state.matchTime * 9),
        });
        if (taxi) {
          drawFx(ctx, "effect:drone_taxi", taxi.x, taxi.y, 44, {
            anchor: "center", alpha: 0.55, flip: taxi.dir < 0,
          });
        }
        ctx.save();
        for (const l of leaves) {
          ctx.save();
          ctx.translate(l.x, l.y);
          ctx.rotate(l.rot);
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = l.color;
          ctx.fillRect(-4, -2, 8, 4);
          ctx.restore();
        }
        ctx.restore();
      },
    };
  },

  // -- HARBOR DOCKS — THE CRANE. The spreader platform traverses the full
  // stage width on a ~14s cycle, pausing at each end. Every third pass it
  // carries a container (visibly hanging + a horn); over the middle it DROPS
  // it — crush, strong spike — and the container remains as temporary
  // terrain until it takes 3 hits.
  harbor(stage) {
    const CYCLE = 14, PAUSE = 2;
    const spreader = state.platforms[5]; // the crane spreader (stages.js)
    const X_MIN = 210, X_MAX = 670;
    let pass = 0, lastLeg = -1;
    let carrying = false;
    let dropped = null;   // falling container { x, y, vy, landY }
    let block = null;     // landed container platform (in state.platforms)
    let blockHits = 0;
    let blockIv = 0;
    return {
      update(dt) {
        // traversal: pause | cross | pause | cross, one leg per CYCLE/2
        const leg = Math.floor(state.matchTime / (CYCLE / 2)); // even: L→R, odd: R→L
        const legT = state.matchTime % (CYCLE / 2);
        const goingRight = leg % 2 === 0;
        if (leg !== lastLeg) {
          lastLeg = leg;
          pass += 1;
          carrying = pass % 3 === 0 && !dropped && !block;
          if (carrying) playSfx("hazardBell", 0.75, 0.5); // the horn
        }
        const k = smoothstep(clamp((legT - PAUSE / 2) / (CYCLE / 2 - PAUSE), 0, 1));
        const nx = goingRight ? X_MIN + (X_MAX - X_MIN) * k : X_MAX - (X_MAX - X_MIN) * k;
        movePlatform(spreader, nx, spreader.y);

        // the drop, over the middle
        const mid = spreader.x + spreader.w / 2;
        if (carrying && Math.abs(mid - 640) < 14) {
          carrying = false;
          const landY = surfaceUnder(mid).y;
          dropped = { x: mid, y: spreader.y + 30, vy: 0, landY };
          playSfx("hazardTelegraph", 0.6, 0.7);
          warnZone(mid - 70, 140, 1.2, { yMin: landY - 120 });
          cameraCue("fangSnap", sign(640 - state.camera.x) || 1);
        }
        if (dropped) {
          dropped.vy += 1900 * dt;
          dropped.y += dropped.vy * dt;
          for (const f of fighters()) {
            if (Math.abs(f.x - dropped.x) < 66 && f.y > dropped.y - 20 && f.y < dropped.y + 60) {
              const spike = !f.grounded;
              stageHit(f, { dmg: 26, vx: sign(f.x - dropped.x) * 90, vy: spike ? 480 : -260, color: "#ff8a54", label: "CRUSHED", iframes: 1.1 });
            }
          }
          if (dropped.y >= dropped.landY - 17) {
            // it lands and becomes terrain: a destructible cover block
            block = { x: dropped.x - 65, y: dropped.landY - 44, w: 130, h: 15, kind: "side", container: true };
            state.platforms.push(block);
            blockHits = 0;
            burst(dropped.x, dropped.landY - 20, "#ffb493", 22, 1.2);
            dust(dropped.x, dropped.landY, 14);
            playSfx("explosionSmall", 0.6, 0.7);
            state.camera.shake = Math.max(state.camera.shake, 6);
            cameraCue("punch");
            dropped = null;
          }
        }
        // the container block soaks 3 hits, then breaks up
        if (block) {
          if (blockIv < state.matchTime) {
            for (const hb of state.hitboxes) {
              if (hb.age < 0) continue;
              const r = hitboxRect(hb);
              if (r.x < block.x + block.w && r.x + r.w > block.x &&
                  r.y < block.y + 30 && r.y + r.h > block.y - 14) {
                blockHits += 1;
                blockIv = state.matchTime + 0.4;
                dust(block.x + block.w / 2, block.y + 10, 6);
                playSfx("hitLight", 0.5, 0.7);
                break;
              }
            }
          }
          if (blockHits >= 3) {
            const i = state.platforms.indexOf(block);
            if (i >= 0) state.platforms.splice(i, 1);
            burst(block.x + block.w / 2, block.y, "#c8907a", 26, 1.2);
            playSfx("explosionSmall", 0.5);
            block = null;
          }
        }
      },
      draw(ctx) {
        // crane cables down to the spreader
        ctx.save();
        ctx.strokeStyle = "rgba(60, 52, 70, 0.85)";
        ctx.lineWidth = 2.5;
        for (const cx of [spreader.x + 26, spreader.x + spreader.w - 26]) {
          ctx.beginPath();
          ctx.moveTo(cx, 90);
          ctx.lineTo(cx, spreader.y);
          ctx.stroke();
        }
        ctx.restore();
        // the crane hook, swinging idle under the spreader between carries
        if (!carrying) {
          drawFx(ctx, "effect:crane_hook", spreader.x + spreader.w / 2 + Math.sin(state.matchTime * 1.3) * 6, spreader.y + 96, 84, { alpha: 0.92 });
        }
        // the hanging container while carried
        if (carrying) {
          const cx = spreader.x + spreader.w / 2;
          if (!drawFx(ctx, "effect:cargo_container", cx, spreader.y + 116, 76, { glow: "#53e8ff" })) {
            ctx.save();
            ctx.strokeStyle = "rgba(70, 60, 60, 0.9)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx - 40, spreader.y + 15);
            ctx.lineTo(cx - 55, spreader.y + 44);
            ctx.moveTo(cx + 40, spreader.y + 15);
            ctx.lineTo(cx + 55, spreader.y + 44);
            ctx.stroke();
            ctx.fillStyle = "#b25438";
            ctx.strokeStyle = "#5e2c1c";
            ctx.fillRect(cx - 62, spreader.y + 44, 124, 40);
            ctx.strokeRect(cx - 62, spreader.y + 44, 124, 40);
            ctx.restore();
          }
        }
        if (dropped) {
          // the falling box and its floor shadow
          ctx.save();
          ctx.globalAlpha = 0.42;
          ctx.fillStyle = "#1a1210";
          ctx.beginPath();
          ctx.ellipse(dropped.x, dropped.landY + 4, 60, 8, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          if (!drawFx(ctx, "effect:cargo_container", dropped.x, dropped.y + 20, 76)) {
            ctx.save();
            ctx.fillStyle = "#b25438";
            ctx.strokeStyle = "#5e2c1c";
            ctx.fillRect(dropped.x - 62, dropped.y - 20, 124, 40);
            ctx.strokeRect(dropped.x - 62, dropped.y - 20, 124, 40);
            ctx.restore();
          }
        }
        if (block) {
          // the landed container's body below its walkable top
          if (drawFx(ctx, "effect:cargo_container", block.x + block.w / 2, block.y + block.h + 32, 78, { alpha: blockHits >= 2 ? 0.72 : 1 })) {
            if (blockHits > 0) {
              ctx.save();
              ctx.strokeStyle = "rgba(10, 6, 4, 0.8)";
              ctx.lineWidth = 2;
              ctx.beginPath();
              for (let i = 0; i < blockHits; i++) {
                ctx.moveTo(block.x + 20 + i * 38, block.y + 6);
                ctx.lineTo(block.x + 44 + i * 38, block.y + 34);
              }
              ctx.stroke();
              ctx.restore();
            }
            return;
          }
          ctx.save();
          ctx.fillStyle = blockHits >= 2 ? "#8a4630" : "#b25438";
          ctx.strokeStyle = "#5e2c1c";
          ctx.fillRect(block.x, block.y + block.h, block.w, 30);
          ctx.strokeRect(block.x, block.y + block.h, block.w, 30);
          if (blockHits > 0) {
            ctx.strokeStyle = "rgba(30, 16, 10, 0.8)";
            ctx.beginPath();
            for (let i = 0; i < blockHits; i++) {
              ctx.moveTo(block.x + 20 + i * 38, block.y + 6);
              ctx.lineTo(block.x + 44 + i * 38, block.y + 34);
            }
            ctx.stroke();
          }
          ctx.restore();
        }
      },
    };
  },

  // -- SKY TERRACE — THE WIND. Every ~25s a gust crosses the terrace:
  // 1.5s of wind-streak telegraph, then 2.5s of steady horizontal push
  // (stronger airborne). It never kills on its own — it re-prices every
  // edge guard while it blows. Direction alternates and is always visible.
  skyterrace() {
    const PERIOD = 25, TELEGRAPH = 1.5, GUST = 2.5;
    let warned = -1, cued = -1;
    const streaks = Array.from({ length: 16 }, (_, i) => ({ seed: i * 43.1 }));
    return {
      update(dt) {
        const n = Math.floor(state.matchTime / PERIOD);
        const t = state.matchTime % PERIOD;
        const dir = n % 2 === 0 ? 1 : -1;
        const gustAt = PERIOD - GUST - 0.1;
        if (t >= gustAt - TELEGRAPH && warned !== n) {
          warned = n;
          playSfx("hazardTelegraph", 0.5, 1.35); // the glass rail singing
        }
        if (t >= gustAt) {
          if (cued !== n) {
            cued = n;
            playSfx("hazardWaterSurge", 0.55, 1.5); // the gust itself
            cameraCue("wind", dir);
          }
          for (const f of fighters()) {
            if (f.ledge) continue;
            f.x += dir * (f.grounded ? 46 : 82) * dt;
          }
        }
      },
      draw(ctx) {
        const t = state.matchTime % PERIOD;
        const n = Math.floor(state.matchTime / PERIOD);
        const dir = n % 2 === 0 ? 1 : -1;
        const gustAt = PERIOD - GUST - 0.1;
        const inTele = t >= gustAt - TELEGRAPH && t < gustAt;
        const inGust = t >= gustAt;
        if (!inTele && !inGust) return;
        const a = inGust ? 0.5 : 0.22 * ((t - (gustAt - TELEGRAPH)) / TELEGRAPH);
        const speed = inGust ? 900 : 380;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = "#d8f2ff";
        ctx.lineWidth = 2;
        for (const s of streaks) {
          const len = 60 + (s.seed % 70);
          const x = ((s.seed * 173 + state.matchTime * speed * dir) % 1560 + 1560) % 1560 - 140;
          const y = 80 + ((s.seed * 91) % 520) + Math.sin(state.matchTime * 2 + s.seed) * 10;
          ctx.globalAlpha = a * (0.4 + 0.6 * ((s.seed % 10) / 10));
          // every third streak is the delivered gust ribbon; the rest stay lines
          if (s.seed % 3 < 1 && drawFx(ctx, "effect:wind_streak", x, y, 34, { flip: dir < 0, anchor: "center", alpha: a })) continue;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - dir * len, y + 4);
          ctx.stroke();
        }
        ctx.restore();
      },
    };
  },

  // -- SCRAPYARD 7 — THE MAGNET. The crane magnet traverses above on a ~18s
  // cycle, stops over a fighter's zone, hums with a building glow (1.2s),
  // then SNAPS a 0.8s upward pull: anyone in the column is yanked skyward —
  // death off the top mid-recovery, an unforced juggle on the ground. Then
  // it swings away and drops a car husk on a marked spot.
  scrapyard(stage) {
    const PERIOD = 18, HUM = 1.2, SNAP = 0.8;
    const plat = mainPlatform(state.platforms);
    const MAG_Y = 200;
    let mx = 640;          // magnet x
    let phase = "roam";    // roam | hum | snap | away
    let phaseT = 0, cycle = -1;
    let husk = null;       // { x, y, vy, landY }
    let debris = null;     // { x, y, until }
    return {
      update(dt) {
        const n = Math.floor(state.matchTime / PERIOD);
        const t = state.matchTime % PERIOD;
        phaseT += dt;
        if (phase === "roam") {
          // drift lazily; late in the cycle, track the nearest fighter and lock
          const target = t < PERIOD - HUM - SNAP - 1.5
            ? 640 + Math.sin(state.matchTime * 0.5) * 300
            : (fighters().sort((a, b) => Math.abs(a.x - mx) - Math.abs(b.x - mx))[0]?.x ?? 640);
          mx += clamp(target - mx, -220 * dt, 220 * dt);
          if (t >= PERIOD - HUM - SNAP && cycle !== n) {
            cycle = n;
            phase = "hum";
            phaseT = 0;
            playSfx("hazardTelegraph", 0.6, 0.55); // the hum
            warnZone(mx - 70, 140, HUM + SNAP);
            cameraCue("rattle", 0.6);
          }
        } else if (phase === "hum") {
          if (phaseT >= HUM) {
            phase = "snap";
            phaseT = 0;
            playSfx("hazardElectricArc", 0.8, 0.7);
            cameraCue("fangSnap", sign(mx - state.camera.x) || 1);
          }
        } else if (phase === "snap") {
          for (const f of fighters()) {
            if (Math.abs(f.x - mx) < 70 && f.y > MAG_Y) {
              if (!f.magnetized || f.magnetized < state.matchTime - 2) {
                f.magnetized = state.matchTime;
                popup(f.x, f.y - 160, "MAGNETIZED", "#d6a060", 16);
              }
              f.grounded = false;
              f.vy = Math.min(f.vy, -560); // the reverse-spike: yanked upward
              f.vx += clamp(mx - f.x, -40, 40) * dt * 8;
            }
          }
          if (Math.random() < dt * 20) sparkLine(mx + (Math.random() - 0.5) * 60, MAG_Y + 40 + Math.random() * 200, 1, "#ffd35a", 3);
          if (phaseT >= SNAP) {
            phase = "away";
            phaseT = 0;
            // it drops what it caught: a car husk on a marked spot
            const hx = clamp(mx + (Math.random() < 0.5 ? -180 : 180), plat.x + 60, plat.x + plat.w - 60);
            const landY = surfaceUnder(hx).y;
            husk = { x: hx, y: -40, vy: 0, landY };
            warnZone(hx - 60, 120, 1.4, { yMin: landY - 100 });
          }
        } else if (phase === "away") {
          mx += clamp(200 - mx, -160 * dt, 160 * dt);
          if (phaseT >= 3) { phase = "roam"; phaseT = 0; }
        }
        if (husk) {
          husk.vy += 1800 * dt;
          husk.y += husk.vy * dt;
          if (husk.y >= husk.landY - 14) {
            for (const f of fighters()) {
              if (Math.abs(f.x - husk.x) < 58 && f.y > husk.landY - 70 && f.y < husk.landY + 30) {
                stageHit(f, { dmg: 12, vx: sign(f.x - husk.x) * 180, vy: -300, color: "#d6a060", label: "SCRAP" });
              }
            }
            burst(husk.x, husk.landY - 12, "#c8a072", 22, 1.1);
            dust(husk.x, husk.landY, 12);
            playSfx("explosionSmall", 0.55, 0.8);
            cameraCue("punch", 0.7);
            debris = { x: husk.x, y: husk.landY, until: state.matchTime + 4 };
            husk = null;
          }
        }
        if (debris && debris.until < state.matchTime) debris = null;
      },
      draw(ctx) {
        // the magnet on its cable
        ctx.save();
        ctx.strokeStyle = "rgba(80, 66, 48, 0.9)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(mx, 60);
        ctx.lineTo(mx, MAG_Y);
        ctx.stroke();
        if (!drawFx(ctx, "effect:magnet_crane", mx, MAG_Y + 44, 84, { glow: phase === "hum" || phase === "snap" ? "#ffd35a" : null })) {
          ctx.fillStyle = "#7a5c3a";
          ctx.strokeStyle = "#3d2c1a";
          ctx.beginPath();
          ctx.arc(mx, MAG_Y + 14, 26, Math.PI, 0);
          ctx.fill();
          ctx.stroke();
        }
        if (phase === "hum" || phase === "snap") {
          const a = phase === "snap" ? 0.55 : 0.15 + (phaseT / HUM) * 0.3;
          ctx.globalCompositeOperation = "lighter";
          const grad = ctx.createLinearGradient(0, MAG_Y, 0, 620);
          grad.addColorStop(0, `rgba(255, 211, 90, ${a})`);
          grad.addColorStop(1, "rgba(255, 211, 90, 0)");
          ctx.fillStyle = grad;
          ctx.fillRect(mx - 66, MAG_Y + 14, 132, 620 - MAG_Y);
        }
        ctx.restore();
        if (husk || debris) {
          const h = husk || debris;
          ctx.save();
          if (husk) {
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = "#241a10";
            ctx.beginPath();
            ctx.ellipse(h.x, h.landY + 4, 54, 8, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          const y = husk ? h.y : h.y - 10;
          if (!drawFx(ctx, "effect:car_husk", h.x, y + 6, 66, { alpha: debris ? Math.min(1, (debris.until - state.matchTime)) : 1 })) {
            ctx.fillStyle = "#8a6a4a";
            ctx.strokeStyle = "#3d2c1a";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(h.x - 48, y);
            ctx.lineTo(h.x - 30, y - 26);
            ctx.lineTo(h.x + 34, y - 24);
            ctx.lineTo(h.x + 48, y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
          ctx.restore();
        }
      },
    };
  },

  // -- CRYSTAL QUARRY — THE BLASTING ROUND. Mining charges on a ~24s cycle:
  // three marked drill-spots glow amber in sequence (klaxon + blinking LED,
  // 1.5s each), then detonate one-two-three. The SEQUENCE is readable — the
  // third spot is safe until the second fires — a positional dance.
  quarry(stage) {
    const PERIOD = 24, STEP = 1.5;
    const plat = mainPlatform(state.platforms);
    const spots = [plat.x + 130, plat.x + plat.w / 2, plat.x + plat.w - 130];
    let armedCycle = -1;
    const fired = [false, false, false];
    let cued = -1;
    return {
      update() {
        const n = Math.floor(state.matchTime / PERIOD);
        const t = state.matchTime % PERIOD;
        const seqStart = PERIOD - STEP * 3 - 0.1;
        if (t >= seqStart && armedCycle !== n) {
          armedCycle = n;
          fired[0] = fired[1] = fired[2] = false;
          playSfx("hazardSignalChirp", 0.7, 0.8); // the blasting klaxon
          cameraCue("rattle", 0.5);
        }
        if (armedCycle !== n || t < seqStart) return;
        for (let i = 0; i < 3; i++) {
          const detAt = seqStart + STEP * (i + 1);
          if (t >= detAt - STEP && t < detAt && cued !== n * 10 + i) {
            cued = n * 10 + i;
            warnZone(spots[i] - 80, 160, STEP, { yMin: plat.y - 110 });
            playSfx("hazardTelegraph", 0.45, 1 + i * 0.15);
          }
          if (t >= detAt && !fired[i]) {
            fired[i] = true;
            for (const f of fighters()) {
              const inBlast = Math.abs(f.x - spots[i]) < 95 && f.y > plat.y - 120 && f.y < plat.y + 30;
              if (inBlast) {
                stageHit(f, { dmg: 22, vx: sign(f.x - spots[i]) * 260 || 260, vy: -430, color: "#ffb43c", label: "BLASTED", iframes: 1.0 });
              }
            }
            burst(spots[i], plat.y - 20, "#ffb43c", 30, 1.4);
            ring(spots[i], plat.y - 20, "#b46bff", 110);
            dust(spots[i], plat.y, 14);
            playSfx("explosionSmall", 0.85, 1 - i * 0.08);
            state.camera.shake = Math.max(state.camera.shake, 6);
            cameraCue("punch");
            // Detonations RING the crystals — hit sounds chime for 3s after.
            // TODO(flavour): needs a hook in audio.js's hit-sfx path; skipped.
          }
        }
      },
      draw(ctx) {
        const n = Math.floor(state.matchTime / PERIOD);
        const t = state.matchTime % PERIOD;
        const seqStart = PERIOD - STEP * 3 - 0.1;
        if (armedCycle !== n || t < seqStart) return;
        for (let i = 0; i < 3; i++) {
          const detAt = seqStart + STEP * (i + 1);
          if (t >= detAt - STEP && t < detAt) {
            // blinking amber LED + drill-spot glow
            const blink = Math.floor(state.matchTime * 8) % 2 === 0;
            glowRect(ctx, spots[i] - 78, plat.y - 8, 156, 10, "#ffb43c", blink ? 0.4 : 0.15);
            // the charge itself: stacked red sticks + warning ring (delivered art)
            drawFx(ctx, "effect:blast_charge", spots[i], plat.y + 2, 48, { alpha: blink ? 1 : 0.8 });
            ctx.save();
            ctx.fillStyle = blink ? "#ffb43c" : "#7a5620";
            ctx.beginPath();
            ctx.arc(spots[i], plat.y - 18, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
      },
    };
  },

  // -- VOLCANIC FORGE — THE FISSURES. The floor's fissure network runs on a
  // ~19s cycle: one of three branches brightens and hisses (1.4s), then
  // flame jets erupt along it for 1.2s — grounded only, the air is safe
  // (MM's lava rule). Secondary: every ~45s the lava lake SURGES and both
  // edge zones vent steam — 3s where edge-hugging is taxed.
  volcano(stage) {
    const PERIOD = 19, TELEGRAPH = 1.4, JET = 1.2;
    const SURGE_EVERY = 45, SURGE = 3;
    const plat = mainPlatform(state.platforms);
    const third = plat.w / 3;
    const branches = [
      { x: plat.x + 30, w: third - 40 },
      { x: plat.x + third + 20, w: third - 40 },
      { x: plat.x + third * 2 + 10, w: third - 40 },
    ];
    let warned = -1, jetted = -1;
    let surged = -1;
    const embers = Array.from({ length: 12 }, (_, i) => ({ seed: i * 83.7, t: 0 }));
    return {
      update(dt) {
        const n = Math.floor(state.matchTime / PERIOD);
        const t = state.matchTime % PERIOD;
        const branch = branches[n % 3]; // which branch is armed rotates — readable
        const jetAt = PERIOD - JET - 0.1;
        if (t >= jetAt - TELEGRAPH && warned !== n) {
          warned = n;
          playSfx("hazardTelegraph", 0.5, 0.8); // the hiss
          warnZone(branch.x, branch.w, TELEGRAPH + JET, { yMin: plat.y - 90 });
        }
        if (t >= jetAt) {
          if (jetted !== n) {
            jetted = n;
            playSfx("hazardFirePatch", 0.85);
            cameraCue("surge", sign(branch.x + branch.w / 2 - 640) || 1);
          }
          if (Math.random() < dt * 26) burst(branch.x + Math.random() * branch.w, plat.y - 10, "#ff6a3d", 3, 0.7);
          for (const f of fighters()) {
            const grounded = f.grounded && Math.abs(f.y - plat.y) < 26;
            if (grounded && f.x > branch.x - 10 && f.x < branch.x + branch.w + 10) {
              if (stageHit(f, { dmg: 14, vx: 0, vy: -330, color: "#ff6a3d", label: "ERUPTION", iframes: 1.0 })) setBurn(f);
            }
          }
        }
        // the lava lake surge: edge zones taxed
        const sn = Math.floor(state.matchTime / SURGE_EVERY);
        const st = state.matchTime % SURGE_EVERY;
        if (st >= SURGE_EVERY - SURGE) {
          if (surged !== sn) {
            surged = sn;
            playSfx("hazardWaterSurge", 0.6, 0.6);
            banner("THE LAKE SURGES", "#ff6a3d", { y: 240, size: 30, life: 1.3 });
            cameraCue("frenzy", 0.5);
            warnZone(plat.x, 60, SURGE, { yMin: plat.y - 80 });
            warnZone(plat.x + plat.w - 60, 60, SURGE, { yMin: plat.y - 80 });
          }
          for (const f of fighters()) {
            const grounded = f.grounded && Math.abs(f.y - plat.y) < 26;
            const atEdge = f.x < plat.x + 60 || f.x > plat.x + plat.w - 60;
            if (grounded && atEdge) softTick(f, 6, "#ff8a5a", "STEAM 6%");
          }
          if (Math.random() < dt * 10) {
            const ex = Math.random() < 0.5 ? plat.x + Math.random() * 60 : plat.x + plat.w - Math.random() * 60;
            dust(ex, plat.y, 3);
          }
        }
        for (const e of embers) e.t = state.matchTime * 0.5 + e.seed;
      },
      draw(ctx) {
        const n = Math.floor(state.matchTime / PERIOD);
        const t = state.matchTime % PERIOD;
        const branch = branches[n % 3];
        const jetAt = PERIOD - JET - 0.1;
        // faint permanent fissure glow across the floor, brighter when armed
        for (let i = 0; i < 3; i++) {
          const b = branches[i];
          const armed = i === n % 3 && t >= jetAt - TELEGRAPH;
          const a = armed
            ? (t >= jetAt ? 0.5 : 0.18 + ((t - (jetAt - TELEGRAPH)) / TELEGRAPH) * 0.3 + 0.08 * Math.sin(state.matchTime * 14))
            : 0.07 + 0.03 * Math.sin(state.matchTime * 2 + i * 2);
          glowRect(ctx, b.x, plat.y - 5, b.w, 8, "#ff6a3d", a);
        }
        // the jets
        if (t >= jetAt) {
          // the delivered lava-burst sprite, one gout per jet mouth, pulsing
          const gouts = Math.max(2, Math.round(branch.w / 110));
          for (let i = 0; i < gouts; i++) {
            const gx = branch.x + (i + 0.5) * (branch.w / gouts);
            const gh = 130 + 30 * Math.sin(state.matchTime * 15 + i * 2.4);
            drawFx(ctx, "effect:magma_gout", gx, plat.y + 4, gh, { alpha: 0.9, glow: "#ff6a3d" });
          }
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          const count = Math.max(3, Math.round(branch.w / 60));
          for (let i = 0; i < count; i++) {
            const jx = branch.x + (i + 0.5) * (branch.w / count);
            const h = 70 + 26 * Math.sin(state.matchTime * 17 + i * 2);
            const grad = ctx.createLinearGradient(0, plat.y, 0, plat.y - h);
            grad.addColorStop(0, "rgba(255, 200, 90, 0.9)");
            grad.addColorStop(1, "rgba(255, 80, 30, 0)");
            ctx.fillStyle = grad;
            ctx.fillRect(jx - 12, plat.y - h, 24, h);
          }
          ctx.restore();
        }
        // ambient embers + ash
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (const e of embers) {
          const x = 100 + ((e.seed * 149) % 1080) + Math.sin(e.t * 1.4) * 24;
          const y = 700 - ((e.t * 40 + e.seed * 47) % 600);
          ctx.globalAlpha = 0.22 + 0.18 * Math.sin(e.t * 5);
          ctx.fillStyle = e.seed % 3 < 1 ? "#8a8a92" : "#ff9a4a";
          ctx.fillRect(x, y, 3, 3);
        }
        ctx.restore();
      },
    };
  },

  // -- FROZEN OUTPOST — THE FLOE. The centre third of the floor is sea ice.
  // On a ~26s cycle it groans and web-cracks (2s), then BREAKS: a 3s hole
  // into black water — falling in costs 10% and a waterlogged slow, plus a
  // scramble-out hop; it is not a pit KO. Then it refreezes shiny.
  frozen(stage) {
    const PERIOD = 26, CRACK = 2, HOLE = 3;
    const plat = mainPlatform(state.platforms);
    const zone = { x: plat.x + plat.w / 3, w: plat.w / 3 };
    let warned = -1, broke = -1;
    let shineUntil = -1e9;
    const flakes = Array.from({ length: 20 }, (_, i) => ({ seed: i * 37.9, t: 0 }));
    return {
      update(dt) {
        const n = Math.floor(state.matchTime / PERIOD);
        const t = state.matchTime % PERIOD;
        const breakAt = PERIOD - HOLE - 0.1;
        if (t >= breakAt - CRACK && warned !== n) {
          warned = n;
          playSfx("hazardTelegraph", 0.55, 0.5); // the groan
          warnZone(zone.x, zone.w, CRACK + HOLE, { yMin: plat.y - 60 });
        }
        const holed = t >= breakAt && t < breakAt + HOLE;
        if (holed && broke !== n) {
          broke = n;
          playSfx("hazardFangSnap", 0.7, 0.6); // the crack-through
          dust(zone.x + zone.w / 2, plat.y, 16);
          cameraCue("rattle");
        }
        if (holed) {
          for (const f of fighters()) {
            const onIce = f.grounded && Math.abs(f.y - plat.y) < 26 &&
              f.x > zone.x && f.x < zone.x + zone.w;
            if (onIce && softTick(f, 10, "#54b4ff", "PLUNGED 10%")) {
              // GUNK-like waterlogged slow (the drench status), and the
              // scramble-out hop toward the nearest solid edge
              f.statuses.drench = Math.max(f.statuses.drench || 0, 2.6);
              f.grounded = false;
              f.vy = -440;
              f.vx = sign(f.x - (zone.x + zone.w / 2)) * 200 || 200;
              burst(f.x, plat.y, "#bfe6ff", 16, 1);
              playSfx("hazardWaterSurge", 0.6, 1.2);
            }
          }
        }
        if (t >= breakAt + HOLE && broke === n && shineUntil < state.matchTime - PERIOD / 2) {
          shineUntil = state.matchTime + 2; // it refreezes shiny
        }
        for (const fl of flakes) fl.t = state.matchTime * 0.4 + fl.seed;
      },
      draw(ctx) {
        const t = state.matchTime % PERIOD;
        const breakAt = PERIOD - HOLE - 0.1;
        // web cracks spreading during the telegraph
        if (t >= breakAt - CRACK && t < breakAt) {
          const prog = (t - (breakAt - CRACK)) / CRACK;
          ctx.save();
          ctx.strokeStyle = `rgba(210, 240, 255, ${0.4 + prog * 0.4})`;
          ctx.lineWidth = 1.5;
          const cx = zone.x + zone.w / 2;
          for (let i = 0; i < 7; i++) {
            const ang = (i / 7) * Math.PI - Math.PI;
            const len = (zone.w / 2) * prog * (0.6 + (i % 3) * 0.2);
            ctx.beginPath();
            ctx.moveTo(cx, plat.y + 2);
            ctx.lineTo(cx + Math.cos(ang) * len, plat.y + 2 + Math.abs(Math.sin(ang)) * 4);
            ctx.stroke();
          }
          ctx.restore();
        }
        // the hole: black water, with broken floe slabs bobbing in it
        if (t >= breakAt && t < breakAt + HOLE) {
          ctx.save();
          ctx.fillStyle = "#04101e";
          ctx.fillRect(zone.x, plat.y, zone.w, 16);
          ctx.globalAlpha = 0.5 + 0.2 * Math.sin(state.matchTime * 6);
          ctx.strokeStyle = "#54b4ff";
          ctx.strokeRect(zone.x, plat.y, zone.w, 16);
          ctx.restore();
          for (let i = 0; i < 2; i++) {
            const fx = zone.x + zone.w * (0.3 + i * 0.4) + Math.sin(state.matchTime * 1.6 + i * 2.4) * 12;
            const bob = Math.sin(state.matchTime * 2.2 + i * 1.9) * 3;
            drawFx(ctx, "effect:ice_floe", fx, plat.y + 12 + bob, 34, { alpha: 0.95, rot: Math.sin(state.matchTime * 1.1 + i) * 0.06 });
          }
        }
        // refrozen gleam
        const shine = shineUntil - state.matchTime;
        if (shine > 0) glowRect(ctx, zone.x, plat.y - 4, zone.w, 6, "#d8f4ff", shine * 0.2);
        // ambient snowfall
        ctx.save();
        for (const fl of flakes) {
          const x = ((fl.seed * 113 + Math.sin(fl.t) * 40) % 1320 + 1320) % 1320 - 20;
          const y = ((fl.t * 50 + fl.seed * 67) % 740) - 20;
          ctx.globalAlpha = 0.5 + 0.3 * Math.sin(fl.t * 2);
          ctx.fillStyle = "#eaf6ff";
          ctx.fillRect(x, y, 2.5, 2.5);
        }
        ctx.restore();
      },
    };
  },

  // -- DESERT RUINS — THE COLLAPSE. The colonnade is structural: heavy hits
  // near its two standing columns crack them (three stages). When one
  // breaks — grinding, dust, a 1s lean — the LINTEL FALLS (crush along its
  // length) and the left platform is gone for the stock. The dig crew
  // rebuilds it during the KO pause. Secondary: periodic sand gusts.
  ruins(stage) {
    const lintel = state.platforms[1]; // the colonnade lintel (stages.js)
    const home = { x: lintel.x, y: lintel.y };
    const plat = mainPlatform(state.platforms);
    const columns = [
      { x: home.x + 22, hits: 0, iv: 0 },
      { x: home.x + 250 - 52, hits: 0, iv: 0 },
    ];
    const COL_W = 30;
    let falling = null; // { t } — the 1s lean, then the drop
    let fallen = false;
    let stocksSeen = -1;
    const GUST_EVERY = 35, GUST = 2;
    let gustCued = -1;
    return {
      update(dt) {
        // the dig crew: rebuild between stocks
        const stocks = totalStocks();
        if (stocksSeen < 0) stocksSeen = stocks;
        if (stocks < stocksSeen) {
          stocksSeen = stocks;
          if (fallen || falling) {
            fallen = false;
            falling = null;
            lintel.ghost = false;
            movePlatform(lintel, home.x, home.y);
            for (const c of columns) c.hits = 0;
            dust(home.x + 125, plat.y, 14);
            popup(home.x + 125, home.y - 40, "REBUILT", "#ffca6e", 15);
          }
        }
        if (!fallen && !falling) {
          // heavy hits near a standing column damage it (three crack stages)
          for (const c of columns) {
            if (c.iv > state.matchTime) continue;
            for (const hb of state.hitboxes) {
              if (hb.age < 0 || !(hb.heavy || hb.dmg >= 11)) continue;
              const r = hitboxRect(hb);
              const colRect = { x: c.x - 14, y: home.y, w: COL_W + 28, h: plat.y - home.y };
              if (r.x < colRect.x + colRect.w && r.x + r.w > colRect.x &&
                  r.y < colRect.y + colRect.h && r.y + r.h > colRect.y) {
                c.hits += 1;
                c.iv = state.matchTime + 0.5;
                dust(c.x + COL_W / 2, home.y + (plat.y - home.y) / 2, 8);
                playSfx("hitLight", 0.5, 0.6);
                if (c.hits >= 3) {
                  falling = { t: 0 };
                  playSfx("hazardTelegraph", 0.7, 0.4); // grinding stone
                  warnZone(lintel.x - 20, lintel.w + 40, 1.6, { yMin: home.y - 60 });
                  cameraCue("rattle");
                }
                break;
              }
            }
          }
        }
        if (falling) {
          falling.t += dt;
          if (falling.t < 1) {
            // the lean: dust streams off the cracked column
            if (Math.random() < dt * 16) dust(lintel.x + Math.random() * lintel.w, home.y + 8, 2);
          } else {
            // THE LINTEL FALLS — crush along its length, then it is gone
            const drop = Math.min(1, (falling.t - 1) / 0.3);
            movePlatform(lintel, home.x, home.y + (plat.y - 15 - home.y) * drop * drop);
            for (const f of fighters()) {
              const under = f.x > lintel.x - 10 && f.x < lintel.x + lintel.w + 10 &&
                f.y > lintel.y - 4 && f.y < plat.y + 20 && f.currentPlatform !== lintel;
              if (under) {
                stageHit(f, { dmg: 28, vx: sign(f.x - (lintel.x + lintel.w / 2)) * 220 || 220, vy: -300, color: "#ffca6e", label: "COLLAPSE", iframes: 1.2 });
              }
            }
            if (drop >= 1) {
              falling = null;
              fallen = true;
              lintel.ghost = true;
              movePlatform(lintel, home.x, home.y); // parked home, intangible
              burst(home.x + lintel.w / 2, plat.y - 20, "#e8c690", 30, 1.4);
              dust(home.x + lintel.w / 2, plat.y, 20);
              // the column-collapse dust bloom (delivered art)
              spriteFlash(home.x + lintel.w / 2, plat.y - 70, "effect:collapse_dust", { h: 220, life: 0.9, grow: 1.5, alpha: 0.85, additive: false });
              playSfx("explosionSmall", 0.8, 0.6);
              state.camera.shake = Math.max(state.camera.shake, 8);
              cameraCue("lightning", 0.6); // the big beat
              banner("THE COLONNADE FALLS", "#ffca6e", { y: 240, size: 30, life: 1.4 });
            }
          }
        }
        // sand gusts: visual + faint push, half the terrace wind
        const gn = Math.floor(state.matchTime / GUST_EVERY);
        const gt = state.matchTime % GUST_EVERY;
        if (gt >= GUST_EVERY - GUST) {
          const dir = gn % 2 === 0 ? 1 : -1;
          if (gustCued !== gn) {
            gustCued = gn;
            cameraCue("wind", dir * 0.5);
          }
          for (const f of fighters()) {
            if (f.ledge) continue;
            f.x += dir * (f.grounded ? 22 : 40) * dt;
          }
          if (Math.random() < dt * 12) dust(dir > 0 ? -10 : 1290, 300 + Math.random() * 260, 2);
        }
      },
      draw(ctx) {
        if (lintel.ghost) return; // columns draw only while they stand
        ctx.save();
        for (const c of columns) {
          // the two standing columns under the lintel
          ctx.fillStyle = "#c9a877";
          ctx.strokeStyle = "#8a6c42";
          ctx.lineWidth = 2;
          const lean = falling && falling.t < 1 ? Math.sin(falling.t * 9) * 3 : 0;
          ctx.fillRect(c.x + lean, lintel.y + 14, COL_W, plat.y - lintel.y - 14);
          ctx.strokeRect(c.x + lean, lintel.y + 14, COL_W, plat.y - lintel.y - 14);
          // crack stages
          ctx.strokeStyle = "rgba(60, 40, 20, 0.85)";
          ctx.beginPath();
          for (let i = 0; i < c.hits; i++) {
            const cy = lintel.y + 40 + i * 34;
            ctx.moveTo(c.x + 4, cy);
            ctx.lineTo(c.x + COL_W - 4, cy + 12);
          }
          ctx.stroke();
        }
        ctx.restore();
      },
    };
  },

  // -- JUNGLE TEMPLE — THE CANOPY. On a ~20s cycle the liana curtain on the
  // right draws taut under a shower of leaves (1.2s), then WHIPS across the
  // right half — a strong horizontal knock toward CENTRE. It throws you
  // into the fight, never off the stage.
  jungle(stage) {
    const PERIOD = 20, TELEGRAPH = 1.2, SWEEP = 0.45;
    const plat = mainPlatform(state.platforms);
    const RIGHT_EDGE = plat.x + plat.w + 40;
    let whip = null; // { x, hit:Set }
    let warned = -1, launched = -1;
    const leaves = [];
    return {
      update(dt) {
        const n = Math.floor(state.matchTime / PERIOD);
        const t = state.matchTime % PERIOD;
        const whipAt = PERIOD - SWEEP - 0.1;
        if (t >= whipAt - TELEGRAPH && warned !== n) {
          warned = n;
          playSfx("hazardTelegraph", 0.5, 1.1);
          warnZone(640, plat.x + plat.w - 640, TELEGRAPH + SWEEP);
          // the leaf shower over the right half
          for (let i = 0; i < 14; i++) {
            leaves.push({
              x: 660 + Math.random() * 560, y: 100 + Math.random() * 150,
              vy: 90 + Math.random() * 80, rot: Math.random() * 7, spin: 2 + Math.random() * 3,
            });
          }
        }
        if (t >= whipAt && launched !== n && !whip) {
          launched = n;
          whip = { x: RIGHT_EDGE, hit: new Set() };
          playSfx("hazardWaterSurge", 0.7, 1.7); // the lash through the air
          cameraCue("surge", -1);
        }
        if (whip) {
          whip.x -= ((RIGHT_EDGE - 640) / SWEEP) * dt;
          for (const f of fighters()) {
            if (whip.hit.has(f.id)) continue;
            const inLash = f.x > 640 && Math.abs(f.x - whip.x) < 60 &&
              f.y > plat.y - 240 && f.y < plat.y + 30;
            if (inLash) {
              whip.hit.add(f.id);
              stageHit(f, { dmg: 16, vx: -430, vy: -240, color: "#62ff9a", label: "VINE WHIP", iframes: 1.0 });
            }
          }
          if (whip.x <= 640) whip = null;
        }
        for (let i = leaves.length - 1; i >= 0; i--) {
          const l = leaves[i];
          l.y += l.vy * dt;
          l.x -= 20 * dt;
          l.rot += l.spin * dt;
          if (l.y > 700) leaves.splice(i, 1);
        }
        // ambient: a slow drip of canopy leaves anywhere
        if (leaves.length < 6 && Math.random() < dt * 1.5) {
          leaves.push({ x: Math.random() * 1280, y: -10, vy: 50 + Math.random() * 40, rot: Math.random() * 7, spin: 1 + Math.random() * 2 });
        }
      },
      draw(ctx) {
        const t = state.matchTime % PERIOD;
        const whipAt = PERIOD - SWEEP - 0.1;
        // the vines drawing back taut
        if (t >= whipAt - TELEGRAPH && t < whipAt) {
          const prog = (t - (whipAt - TELEGRAPH)) / TELEGRAPH;
          ctx.save();
          ctx.strokeStyle = `rgba(98, 255, 154, ${0.3 + prog * 0.4})`;
          ctx.lineWidth = 3;
          for (let i = 0; i < 5; i++) {
            const vx = 1150 + i * 22 + prog * 60;
            ctx.beginPath();
            ctx.moveTo(vx, 80);
            ctx.quadraticCurveTo(vx + 40 * prog, 300, vx - 20 + prog * 30, plat.y);
            ctx.stroke();
          }
          ctx.restore();
        }
        if (whip) {
          ctx.save();
          ctx.strokeStyle = "#62ff9a";
          ctx.lineWidth = 5;
          ctx.globalAlpha = 0.85;
          ctx.beginPath();
          ctx.moveTo(whip.x + 60, 90);
          ctx.quadraticCurveTo(whip.x + 20, 340, whip.x, plat.y + 10);
          ctx.stroke();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.35;
          ctx.lineWidth = 14;
          ctx.stroke();
          ctx.restore();
          // the vine itself (delivered art), leaning into the lash
          drawFx(ctx, "effect:vine_whip", whip.x, plat.y + 12, plat.y - 70, { alpha: 0.95, rot: -0.12, glow: "#62ff9a" });
        }
        // drifting glowing spore puffs (delivered art), slow ambient layer
        for (let i = 0; i < 3; i++) {
          const sx = ((i * 460 + state.matchTime * 26) % 1400) - 60;
          const sy = 140 + i * 130 + Math.sin(state.matchTime * 0.7 + i * 2.1) * 26;
          drawFx(ctx, "effect:spore_cloud", sx, sy, 60, { anchor: "center", alpha: 0.16 + 0.06 * Math.sin(state.matchTime * 1.3 + i) });
        }
        ctx.save();
        for (const l of leaves) {
          ctx.save();
          ctx.translate(l.x, l.y);
          ctx.rotate(l.rot);
          ctx.globalAlpha = 0.75;
          ctx.fillStyle = "#4fae62";
          ctx.beginPath();
          ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      },
    };
  },

  // -- ORBITAL PLATFORM — LOW GRAVITY + THE DEBRIS PASS. Gravity runs 12%
  // low for everyone (stages.js `mods`). The robotic arm's forearm drifts
  // through three positions on a ~16s loop, pausing at each. And every ~30s
  // station debris crosses the sky lane: proximity alarm + tracking
  // brackets on two entry points (1.5s), then two satellite chunks streak
  // through the upper platform zone — the high ground is periodically
  // artillery country.
  orbital(stage) {
    const arm = state.platforms[1]; // the robotic arm's forearm (stages.js)
    const ARM_STOPS = [{ x: 280, y: 430 }, { x: 540, y: 405 }, { x: 760, y: 435 }];
    const ARM_LOOP = 16, GLIDE = 2;
    let armLeg = -1;
    let glide = null;

    const PERIOD = 30, TELEGRAPH = 1.5, PASS = 0.7;
    const LANE = { yMin: 260, yMax: 460 };
    let chunks = null; // [{ x, y, vx, vy, hit:Set }]
    let warned = -1, launched = -1;
    let entries = null; // the two telegraphed entry points
    return {
      update(dt) {
        // the arm's three-stop drift
        const leg = Math.floor(state.matchTime / (ARM_LOOP / 3));
        if (leg !== armLeg) {
          armLeg = leg;
          const to = ARM_STOPS[leg % 3];
          glide = { from: { x: arm.x, y: arm.y }, to, t: 0 };
        }
        if (glide) {
          glide.t += dt;
          const k = smoothstep(Math.min(1, glide.t / GLIDE));
          movePlatform(arm, glide.from.x + (glide.to.x - glide.from.x) * k,
            glide.from.y + (glide.to.y - glide.from.y) * k);
          if (glide.t >= GLIDE) glide = null;
        }

        // the debris pass
        const n = Math.floor(state.matchTime / PERIOD);
        const t = state.matchTime % PERIOD;
        const passAt = PERIOD - PASS - 0.1;
        if (t >= passAt - TELEGRAPH && warned !== n) {
          warned = n;
          const dir = n % 2 === 0 ? 1 : -1;
          entries = [
            { x: dir > 0 ? -30 : 1310, y: LANE.yMin + 30, dir },
            { x: dir > 0 ? -30 : 1310, y: LANE.yMax - 40, dir },
          ];
          playSfx("hazardSignalChirp", 0.75, 0.7); // the proximity alarm
          warnZone(200, 880, TELEGRAPH + PASS, { yMin: LANE.yMin - 60, yMax: LANE.yMax + 20 });
        }
        if (t >= passAt && launched !== n && entries) {
          launched = n;
          chunks = entries.map((e) => ({
            x: e.x, y: e.y - 40,
            vx: e.dir * 1650, vy: 240, hit: new Set(),
          }));
          entries = null;
          playSfx("hazardTrafficPass", 0.8, 1.3);
          cameraCue("lightning", 0.5);
        }
        if (chunks) {
          let anyLive = false;
          for (const c of chunks) {
            c.x += c.vx * dt;
            c.y += c.vy * dt;
            if (c.x > -120 && c.x < 1400) anyLive = true;
            if (Math.random() < dt * 18) burst(c.x, c.y, "#9adcff", 2, 0.4);
            for (const f of fighters()) {
              if (c.hit.has(f.id)) continue;
              if (Math.abs(f.x - c.x) < 60 && Math.abs(f.y - 40 - c.y) < 60) {
                c.hit.add(f.id);
                const spike = !f.grounded;
                stageHit(f, { dmg: 20, vx: sign(c.vx) * 240, vy: spike ? 420 : -300, color: "#9adcff", label: "DEBRIS", iframes: 1.1 });
              }
            }
          }
          if (!anyLive) chunks = null;
        }
      },
      draw(ctx) {
        // tracking brackets on the entry points
        if (entries) {
          const blink = Math.floor(state.matchTime * 7) % 2 === 0;
          if (blink) {
            ctx.save();
            ctx.strokeStyle = "#ff4d5e";
            ctx.lineWidth = 2;
            for (const e of entries) {
              const bx = e.dir > 0 ? 40 : 1240;
              ctx.strokeRect(bx - 22, e.y - 22, 44, 44);
              ctx.beginPath();
              ctx.moveTo(bx - 34, e.y);
              ctx.lineTo(bx - 22, e.y);
              ctx.moveTo(bx + 22, e.y);
              ctx.lineTo(bx + 34, e.y);
              ctx.stroke();
            }
            ctx.restore();
          }
        }
        if (chunks) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          for (const c of chunks) {
            const grad = ctx.createLinearGradient(c.x - sign(c.vx) * 180, 0, c.x + sign(c.vx) * 20, 0);
            grad.addColorStop(0, "rgba(154, 220, 255, 0)");
            grad.addColorStop(1, "rgba(240, 250, 255, 0.9)");
            ctx.fillStyle = grad;
            ctx.fillRect(Math.min(c.x, c.x - sign(c.vx) * 180), c.y - 8, 200, 16);
            ctx.fillStyle = "#dff2ff";
            ctx.fillRect(c.x - 10, c.y - 10, 20, 20);
          }
          ctx.restore();
          // the tumbling satellite chunk (delivered art) over the streak
          for (const c of chunks) {
            drawFx(ctx, "effect:debris_sat", c.x, c.y, 62, { anchor: "center", rot: state.matchTime * 3.4 + c.y, flip: c.vx < 0 });
          }
        }
      },
    };
  },
};
