// Stage gameplay identities ("Active Boards"). Each stage owns one gimmick —
// a hazard, a platform behaviour or a field modifier — built from the shared
// helpers here and run as a single scripted entity in state.entities.
//
// Ground rules (docs/stage-variety-ideas.md): hazard damage stays in the
// 4–8% band with light fixed knockback angled inward or upward (never a
// spike, never toward a blast zone), every danger is telegraphed for at
// least a second, the main platform's ledges always work, and a hazard can
// never KO on its own. The Settings toggle (state.activeBoards) turns all of
// this off and returns every board to its static layout.
//
// Visuals are procedural canvas drawings; where a polish sprite exists
// (round 9D, loaded as optional `stagefx:*` keys) it replaces the procedural
// look, and a missing file changes nothing.

import { state } from "./state.js";
import { getStage, mainPlatform } from "./stages.js";
import { getImage } from "./assets.js";
import { sharedAdjust } from "./shared_sprites.js";
import { playSfx } from "./audio.js";
import { burst, dust, popup, banner, ring, sparkLine } from "./particles.js";
import { hitboxRect, shieldBreak } from "./combat.js";
import { clamp, sign } from "./utils.js";
import { METER_MAX } from "./constants.js";
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

const fxImage = (name) => getImage(`stagefx:${name}`);
// The per-drawing adjustment for a hazard's art (src/shared_sprites.js). Each
// hazard's size is a constant at its own draw site, so the workbench's Size
// reaches these only by being read here; `dx`/`dy` move the picture and never
// the hazard, whose position is what it hits you with.
const fxAdjust = (name) => sharedAdjust(`stagefx:${name}`);

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

// Advertise a danger area so the CPU can walk out of it (ai.js). Optional
// yMin/yMax confine the zone vertically (a rooftop strike shouldn't scare a
// fighter standing on the ground below it).
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
// (lantern, fang) actually comes to rest now that layouts have rafters and
// bridges above the main floor. Falls back to the main platform.
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

// ------------------------------------------------------------ stage table

const STAGE_FX = {
  // -- Training Bridge: the declared baseline. Falling leaves only; the one
  // board that is exactly what it looks like.
  trainingBridge() {
    const leaves = [];
    return {
      update(dt) {
        if (leaves.length < 14 && Math.random() < dt * 3) {
          leaves.push({
            x: Math.random() * 1280, y: -20,
            vx: 20 + Math.random() * 30, vy: 40 + Math.random() * 40,
            rot: Math.random() * Math.PI * 2, spin: 1 + Math.random() * 2,
            color: Math.random() < 0.7 ? "#8fce7a" : "#d8c36a",
          });
        }
        for (let i = leaves.length - 1; i >= 0; i--) {
          const l = leaves[i];
          l.x += (l.vx + Math.sin(state.matchTime * 2 + l.rot) * 26) * dt;
          l.y += l.vy * dt;
          l.rot += l.spin * dt;
          if (l.y > 740) leaves.splice(i, 1);
        }
      },
      draw(ctx) {
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

  // -- Quiet Hall: the silence bell. Every ~25 s the hall hushes for 4 s and
  // every technique is sealed — a pure-melee window for both players.
  quietHall() {
    const PERIOD = 25, TELEGRAPH = 2, HUSH = 4;
    let announced = false;
    return {
      update() {
        const t = state.matchTime % PERIOD;
        const hushStart = PERIOD - HUSH;
        const inTelegraph = t >= hushStart - TELEGRAPH && t < hushStart;
        const inHush = t >= hushStart;
        if (inTelegraph && !announced) {
          announced = true;
          playSfx("hazardBell", 0.55);
        }
        if (!inTelegraph && !inHush) announced = false;
        if (inHush) {
          const left = PERIOD - t;
          for (const f of fighters()) {
            if (f.statuses.silence < left - 0.05) {
              f.statuses.silence = left;
              popup(f.x, f.y - 150, "TECHNIQUE SEALED", "#a8aeb8", 15);
            }
          }
          if (!this.hushBanner || this.hushBanner !== Math.floor(state.matchTime / PERIOD) + 1) {
            this.hushBanner = Math.floor(state.matchTime / PERIOD) + 1;
            banner("THE HALL FALLS SILENT", "#c9cede", { y: 240, size: 34, life: 1.4 });
            cameraCue("hush"); // a held breath: slow push-in, yaw to zero
          }
        }
      },
      drawTop(ctx) {
        const t = state.matchTime % PERIOD;
        const hushStart = PERIOD - HUSH;
        let a = 0;
        if (t >= hushStart) a = Math.min(1, (t - hushStart) * 3) * Math.min(1, (PERIOD - t) * 2);
        else if (t >= hushStart - TELEGRAPH) a = ((t - (hushStart - TELEGRAPH)) / TELEGRAPH) * 0.4;
        if (a <= 0) return;
        ctx.save();
        ctx.globalAlpha = a * 0.24;
        ctx.fillStyle = "#05060d";
        ctx.fillRect(-200, -200, 1680, 1120);
        ctx.restore();
      },
    };
  },

  // -- Flooded Gate: the surge. A knee-high wave sweeps the main platform
  // and shoves grounded fighters along — jump it or ride it. Push only, no
  // damage; the wave is the one hazard here that can't even chip.
  floodedGate(stage) {
    const PERIOD = 20, TELEGRAPH = 1.5;
    // The wave needs ~2.5 s to cross, so it launches with time left in its
    // own cycle rather than at the wrap (where `t % PERIOD` never lands).
    const WAVE_AT = PERIOD - 3.2;
    const plat = mainPlatform(state.platforms);
    let wave = null;
    let warned = -1;
    let spawned = -1;
    return {
      update(dt) {
        const n = Math.floor(state.matchTime / PERIOD);
        const t = state.matchTime % PERIOD;
        const dir = n % 2 === 0 ? 1 : -1;
        if (t >= WAVE_AT - TELEGRAPH && warned !== n) {
          warned = n;
          playSfx("hazardTelegraph", 0.55);
          warnZone(plat.x, plat.w, TELEGRAPH + 3);
        }
        if (t >= WAVE_AT && spawned !== n && !wave) {
          spawned = n;
          wave = { x: dir > 0 ? plat.x - 60 : plat.x + plat.w + 60, dir, hit: new Set() };
          playSfx("hazardWaterSurge", 0.7);
          cameraCue("surge", dir); // the camera leads the wave, boat-footage roll
        }
        if (wave) {
          wave.x += wave.dir * 430 * dt;
          for (const f of fighters()) {
            if (wave.hit.has(f.id)) continue;
            const onMain = f.grounded && f.currentPlatform && f.currentPlatform.kind === "main";
            if (onMain && Math.abs(f.x - wave.x) < 46) {
              wave.hit.add(f.id);
              f.vx = wave.dir * 300;
              f.vy = -170;
              f.grounded = false;
              popup(f.x, f.y - 150, "SWEPT", "#9fd8ff", 17);
              dust(f.x, f.y, 12);
              playSfx("hazardWaterSurge", 0.4, 1.6);
            }
          }
          if (Math.random() < 0.5) dust(wave.x, plat.y, 2);
          if (wave.x < plat.x - 120 || wave.x > plat.x + plat.w + 120) wave = null;
        }
      },
      draw(ctx) {
        const t = state.matchTime % PERIOD;
        if (t >= WAVE_AT - TELEGRAPH && t < WAVE_AT && !wave) {
          const a = ((t - (WAVE_AT - TELEGRAPH)) / TELEGRAPH) * 0.4;
          glowRect(ctx, plat.x, plat.y - 8, plat.w, 10, "#6baed6", a);
        }
        if (!wave) return;
        ctx.save();
        const grad = ctx.createLinearGradient(wave.x, plat.y - 62, wave.x, plat.y);
        grad.addColorStop(0, "rgba(214, 240, 255, 0.9)");
        grad.addColorStop(1, "rgba(107, 174, 214, 0.25)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(wave.x, plat.y, 52, 60, 0, Math.PI, 0);
        ctx.fill();
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = "#eaf6ff";
        ctx.beginPath();
        ctx.ellipse(wave.x - wave.dir * 20, plat.y - 52, 22, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      },
    };
  },

  // -- Shibuya Night: the curtain falls. For 8 s in every 30 the arena is
  // sealed and cursed energy runs dense — everyone's meter builds fast.
  // Ultimates and domains flow on this board; that's the incident.
  shibuyaNight() {
    const PERIOD = 30, CURTAIN = 8;
    let announced = -1;
    return {
      update(dt) {
        const n = Math.floor(state.matchTime / PERIOD);
        const t = state.matchTime % PERIOD;
        const start = PERIOD - CURTAIN;
        if (t >= start) {
          if (announced !== n) {
            announced = n;
            banner("A CURTAIN FALLS", "#b06cff", { y: 240, size: 36, life: 1.5 });
            playSfx("hazardBell", 0.5, 0.7);
            cameraCue("frenzy"); // the busiest skyline gets the busiest lens
          }
          for (const f of fighters()) f.meter = clamp(f.meter + 2.4 * dt, 0, METER_MAX);
          if (Math.random() < dt * 10) {
            burst(Math.random() * 1280, 600 + Math.random() * 80, "#8a5cff", 2, 0.4);
          }
        }
      },
      draw(ctx) {
        const t = state.matchTime % PERIOD;
        const start = PERIOD - CURTAIN;
        if (t < start) return;
        const a = Math.min(1, (t - start) * 1.2) * Math.min(1, (PERIOD - t) * 1.5);
        ctx.save();
        const grad = ctx.createRadialGradient(640, 380, 240, 640, 380, 900);
        grad.addColorStop(0, "rgba(30, 8, 60, 0)");
        grad.addColorStop(1, "rgba(24, 4, 52, 0.85)");
        ctx.globalAlpha = a * 0.6;
        ctx.fillStyle = grad;
        ctx.fillRect(-200, -200, 1680, 1120);
        ctx.restore();
      },
    };
  },

  // -- Curse Maw: it bites. The outer thirds of the jaw glow, then fangs
  // snap up at both edges. Centre stage is always safe; ledge camping isn't.
  curseMaw(stage) {
    const PERIOD = 20, TELEGRAPH = 1.3, SNAP = 0.35;
    const plat = mainPlatform(state.platforms);
    const zoneW = plat.w * 0.3;
    const zones = [
      { x: plat.x, w: zoneW },
      { x: plat.x + plat.w - zoneW, w: zoneW },
    ];
    let warned = -1;
    let snapped = -1;
    return {
      update() {
        const n = Math.floor(state.matchTime / PERIOD);
        const t = state.matchTime % PERIOD;
        const snapStart = PERIOD - SNAP;
        const teleStart = snapStart - TELEGRAPH;
        if (t >= teleStart && warned !== n) {
          warned = n;
          playSfx("hazardTelegraph", 0.5, 0.75);
          for (const z of zones) warnZone(z.x, z.w, TELEGRAPH + SNAP);
        }
        if (t >= snapStart) {
          // The jaws are heard closing whether or not they catch anyone.
          if (snapped !== n) {
            snapped = n;
            playSfx("hazardFangSnap", 0.85);
            // punch-in biased toward whichever edge the camera is already near
            cameraCue("fangSnap", sign(state.camera.x - 640) || 1);
          }
          for (const z of zones) {
            for (const f of fighters()) {
              const low = f.y > plat.y - 70 && f.y <= plat.y + 30;
              if (low && f.x > z.x && f.x < z.x + z.w) {
                const toCenter = f.x < 640 ? 1 : -1;
                stageHit(f, { dmg: 7, vx: toCenter * 150, vy: -430, color: "#3cd7da", label: "CHOMP" });
              }
            }
          }
        }
      },
      draw(ctx) {
        const t = state.matchTime % PERIOD;
        const snapStart = PERIOD - SNAP;
        const teleStart = snapStart - TELEGRAPH;
        if (t >= teleStart && t < snapStart) {
          const a = 0.18 + 0.22 * Math.sin(state.matchTime * 18);
          for (const z of zones) glowRect(ctx, z.x, plat.y - 6, z.w, 10, "#3cd7da", Math.max(0.1, a));
        }
        if (t >= snapStart) {
          const rise = Math.sin(((t - snapStart) / SNAP) * Math.PI); // up then back down
          const img = fxImage("stage_fang");
          for (const z of zones) {
            const count = Math.max(3, Math.round(z.w / 46));
            for (let i = 0; i < count; i++) {
              const fx = z.x + (i + 0.5) * (z.w / count);
              const fa = fxAdjust("stage_fang");
              const h = (34 + (i % 3) * 14) * rise * fa.scale;
              if (img) {
                const w = img.width * (h * 2) / img.height;
                ctx.save();
                ctx.translate(fx, plat.y + 6);
                ctx.drawImage(img, -w / 2 + fa.dx, -h * 2 + fa.dy, w, h * 2);
                ctx.restore();
              } else {
                ctx.save();
                ctx.fillStyle = "#dff6f6";
                ctx.strokeStyle = "#3cd7da";
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(fx - 12, plat.y + 6);
                ctx.lineTo(fx, plat.y + 6 - h);
                ctx.lineTo(fx + 12, plat.y + 6);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.restore();
              }
            }
          }
        }
      },
    };
  },

  // -- Garden Steps: the blooming. A flower opens on a random platform;
  // the first fighter to touch it heals 8% — the game's only healing,
  // rationed and contested. (The terrace layout lives in stages.js.)
  gardenSteps(stage) {
    const PERIOD = 25, SPROUT = 1.2, OPEN = 6;
    let bloom = null;
    let cycle = -1;
    return {
      update() {
        const n = Math.floor(state.matchTime / PERIOD);
        const t = state.matchTime % PERIOD;
        const start = PERIOD - SPROUT - OPEN;
        if (t >= start && cycle !== n) {
          cycle = n;
          const plat = state.platforms[Math.floor(Math.random() * state.platforms.length)];
          bloom = { plat, x: plat.x + plat.w * (0.25 + Math.random() * 0.5), born: state.matchTime };
          // The flower opening is worth hearing on its own — it is an
          // invitation to walk over, not just a pickup that pays out later.
          playSfx("hazardBloom", 0.45, 0.9);
          cameraCue("bloom"); // a gentle drift toward the flower
        }
        if (!bloom) return;
        const age = state.matchTime - bloom.born;
        if (age > SPROUT + OPEN) { bloom = null; return; }
        if (age < SPROUT) return;
        for (const f of fighters()) {
          const near = Math.abs(f.x - bloom.x) < 42 && Math.abs(f.y - bloom.plat.y) < 30;
          if (near && f.grounded) {
            f.damage = Math.max(0, f.damage - 8);
            popup(f.x, f.y - 150, "-8%", "#8fe6a4", 24);
            burst(bloom.x, bloom.plat.y - 30, "#a4f0b6", 20, 1);
            ring(bloom.x, bloom.plat.y - 20, "#8fe6a4", 70);
            playSfx("hazardBloom", 0.8);
            bloom = null;
            return;
          }
        }
      },
      draw(ctx) {
        if (!bloom) return;
        const age = state.matchTime - bloom.born;
        const y = bloom.plat.y;
        const grow = Math.min(1, age / SPROUT);
        const img = fxImage("stage_flower");
        ctx.save();
        if (img && grow >= 1) {
          const fa = fxAdjust("stage_flower");
          const h = 46 * fa.scale;
          const w = img.width * h / img.height;
          ctx.drawImage(img, bloom.x - w / 2 + fa.dx, y - h + fa.dy, w, h);
        } else {
          // stem
          ctx.strokeStyle = "#5aa86a";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(bloom.x, y);
          ctx.lineTo(bloom.x, y - 26 * grow);
          ctx.stroke();
          if (grow >= 1) {
            const pulse = 1 + 0.08 * Math.sin(state.matchTime * 6);
            ctx.fillStyle = "#ffd9ec";
            for (let i = 0; i < 5; i++) {
              const a = (i / 5) * Math.PI * 2 + state.matchTime * 0.4;
              ctx.beginPath();
              ctx.arc(bloom.x + Math.cos(a) * 9 * pulse, y - 26 + Math.sin(a) * 9 * pulse, 6, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.fillStyle = "#ffd35a";
            ctx.beginPath();
            ctx.arc(bloom.x, y - 26, 5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      },
    };
  },

  // -- Lantern Corridor: a lantern shakes loose, falls, and burns a patch of
  // floor for a moment. The status system already knows how to burn.
  lanternCorridor(stage) {
    const PERIOD = 18, TELEGRAPH = 1.5, PATCH = 2.5;
    const plat = mainPlatform(state.platforms);
    let lantern = null; // { x, y, phase: swing|fall|patch, t }
    let cycle = -1;
    return {
      update(dt) {
        const n = Math.floor(state.matchTime / PERIOD);
        const t = state.matchTime % PERIOD;
        if (t >= PERIOD - TELEGRAPH - 1.2 && cycle !== n) {
          cycle = n;
          const x = plat.x + 80 + Math.random() * (plat.w - 160);
          // the lantern lands on whatever is under it — a rafter counts
          const landY = surfaceUnder(x).y;
          lantern = { x, y: 236, phase: "swing", t: 0, vy: 0, landY };
          playSfx("hazardBell", 0.5);
          warnZone(x - 60, 120, TELEGRAPH + PATCH + 1.4, { yMin: landY - 90, yMax: landY + 30 });
        }
        if (!lantern) return;
        lantern.t += dt;
        if (lantern.phase === "swing" && lantern.t >= TELEGRAPH) {
          lantern.phase = "fall";
        } else if (lantern.phase === "fall") {
          lantern.vy += 2000 * dt;
          lantern.y += lantern.vy * dt;
          if (lantern.y >= lantern.landY - 6) {
            lantern.phase = "patch";
            lantern.t = 0;
            burst(lantern.x, lantern.landY - 10, "#ffb45a", 22, 1.2);
            playSfx("hazardFirePatch", 0.75);
            cameraCue("punch"); // micro-shake on the lantern's impact
          }
        } else if (lantern.phase === "patch") {
          if (lantern.t >= PATCH) { lantern = null; return; }
          if (Math.random() < dt * 22) burst(lantern.x + (Math.random() - 0.5) * 100, lantern.landY - 8, "#ff8c3a", 2, 0.5);
          for (const f of fighters()) {
            const inPatch = f.grounded && Math.abs(f.x - lantern.x) < 58 && Math.abs(f.y - lantern.landY) < 26;
            if (inPatch && !f.statuses.burn) {
              f.statuses.burn = { t: 1.1, tick: 0.45, dmg: 1.0, from: f };
              popup(f.x, f.y - 150, "SCORCHED", "#ff8c3a", 15);
            }
          }
        }
      },
      draw(ctx) {
        if (!lantern) return;
        ctx.save();
        if (lantern.phase === "patch") {
          const a = 0.35 * Math.min(1, (PATCH - lantern.t) * 2);
          glowRect(ctx, lantern.x - 58, lantern.landY - 14, 116, 16, "#ff8c3a", a + 0.12 * Math.sin(state.matchTime * 20));
        } else {
          const sway = lantern.phase === "swing" ? Math.sin(lantern.t * 9) * (6 + lantern.t * 10) : 0;
          const x = lantern.x + sway;
          const img = fxImage("stage_lantern");
          if (lantern.phase === "swing") {
            ctx.strokeStyle = "rgba(90, 70, 40, 0.8)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(lantern.x, 190);
            ctx.lineTo(x, lantern.y - 16);
            ctx.stroke();
          }
          if (img) {
            const fa = fxAdjust("stage_lantern");
            const h = 44 * fa.scale;
            const w = img.width * h / img.height;
            ctx.drawImage(img, x - w / 2 + fa.dx, lantern.y - 16 + fa.dy, w, h);
          } else {
            ctx.fillStyle = "#c8452e";
            ctx.strokeStyle = "#5a2618";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(x, lantern.y + 6, 13, 18, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.5 + 0.2 * Math.sin(state.matchTime * 11);
          const grad = ctx.createRadialGradient(x, lantern.y + 6, 2, x, lantern.y + 6, 34);
          grad.addColorStop(0, "rgba(255, 200, 110, 0.9)");
          grad.addColorStop(1, "rgba(255, 160, 60, 0)");
          ctx.fillStyle = grad;
          ctx.fillRect(x - 34, lantern.y - 28, 68, 68);
          ctx.restore();
        }
        ctx.restore();
      },
    };
  },

  // -- Sunken Crossing: the mirror. The flooded street is slick — the
  // friction change itself lives in stages.js `mods`; this entity only adds
  // the tells (a wet sheen and ripples off a sliding fighter).
  sunkenCrossing() {
    for (const p of state.platforms) p.accent = "rgba(159, 216, 255, 0.6)";
    let rippleT = 0;
    return {
      update(dt) {
        rippleT -= dt;
        for (const f of fighters()) {
          if (f.grounded && Math.abs(f.vx) > 300 && rippleT <= 0) {
            rippleT = 0.22;
            ring(f.x, f.y - 4, "#9fd8ff", 26);
          }
        }
      },
      draw() {},
    };
  },

  // -- Neon Split: the alley's energy bolt re-strikes down the centre line
  // and holds for a few seconds. Crossing it costs 6% — or a clean dodge.
  neonSplit(stage) {
    const PERIOD = 22, TELEGRAPH = 1.5, WALL = 5;
    const plat = mainPlatform(state.platforms);
    let warned = -1;
    let struck = -1;
    return {
      update() {
        const n = Math.floor(state.matchTime / PERIOD);
        const t = state.matchTime % PERIOD;
        const wallStart = PERIOD - WALL;
        const teleStart = wallStart - TELEGRAPH;
        if (t >= teleStart && warned !== n) {
          warned = n;
          playSfx("hazardTelegraph", 0.5, 1.15);
          warnZone(640 - 34, 68, TELEGRAPH + WALL);
        }
        if (t >= wallStart) {
          // The arc is audible from the moment it lands, not only on contact.
          if (struck !== n) {
            struck = n;
            playSfx("hazardElectricArc", 0.9);
            // ease the yaw around the wall so its face catches the light
            cameraCue("wallYaw", sign(state.camera.x - 640) || 1);
          }
          for (const f of fighters()) {
            if (Math.abs(f.x - 640) < 22 && f.y > 170 && f.y < plat.y + 40) {
              const away = sign(f.x - 640) || f.facing * -1 || 1;
              if (stageHit(f, { dmg: 6, vx: away * 270, vy: -250, color: "#e052c0", label: "ZAPPED", iframes: 0.9 })) {
                cameraCue("punch"); // crossing the arc earns an FOV punch
              }
            }
          }
        }
      },
      draw(ctx) {
        const t = state.matchTime % PERIOD;
        const wallStart = PERIOD - WALL;
        const teleStart = wallStart - TELEGRAPH;
        if (t < teleStart) return;
        const active = t >= wallStart;
        const a = active ? 0.75 * Math.min(1, (PERIOD - t) * 2) : 0.25 + 0.15 * Math.sin(state.matchTime * 24);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = "#ff6ad5";
        ctx.shadowColor = "#e052c0";
        ctx.shadowBlur = active ? 22 : 8;
        ctx.lineWidth = active ? 5 : 2;
        ctx.globalAlpha = a;
        ctx.beginPath();
        let y = 150;
        ctx.moveTo(640, y);
        while (y < plat.y + 10) {
          y += 34;
          ctx.lineTo(640 + (Math.random() - 0.5) * (active ? 22 : 10), y);
        }
        ctx.stroke();
        ctx.restore();
        if (active && Math.random() < 0.3) sparkLine(640, 200 + Math.random() * 350, Math.random() < 0.5 ? -1 : 1, "#ff6ad5", 3);
      },
    };
  },

  // -- Bone Sanctum: brittle bones. Each drop-through platform rattles for a
  // second, phases intangible for three, then re-knits. Offset cycles keep
  // something solid at all times; the main floor never phases.
  boneSanctum() {
    const PERIOD = 12, RATTLE = 1, GHOST = 3;
    const plats = state.platforms.filter((p) => p.kind !== "main");
    return {
      update() {
        plats.forEach((p, i) => {
          const t = (state.matchTime + i * (PERIOD / plats.length)) % PERIOD;
          const rattleStart = PERIOD - GHOST - RATTLE;
          const ghostStart = PERIOD - GHOST;
          const wasRattling = p.shakeMag > 0;
          p.shakeMag = t >= rattleStart && t < ghostStart ? 2.5 : 0;
          // 1:1 micro-shake synced to the rattle, so the camera trembles with
          // the bone that is about to give way.
          if (p.shakeMag > 0 && !wasRattling) cameraCue("rattle", 0.5);
          const wasGhost = p.ghost;
          p.ghost = t >= ghostStart;
          if (p.ghost && !wasGhost) playSfx("hazardElectricArc", 0.3, 1.5);
        });
      },
      draw() {},
    };
  },

  // -- Bridge Duel: the bridge never sits still. The whole main platform —
  // ledges, fighters and all — drifts slowly side to side under fixed
  // rooftop platforms.
  bridgeDuel() {
    const plat = mainPlatform(state.platforms);
    const baseX = plat.x;
    return {
      update() {
        const nx = baseX + Math.sin(state.matchTime * (Math.PI * 2) / 8) * 70;
        movePlatform(plat, nx, plat.y);
      },
      draw() {},
    };
  },

  // -- Academy Hall: class change. On the bell, the three drop-through
  // platforms glide between preset arrangements. Solid the whole way.
  academyHall() {
    const PERIOD = 30, GLIDE = 2;
    const plats = state.platforms.filter((p) => p.kind !== "main");
    // Arrangements for [side A (w220), side B (w220), top C (w256),
    // lectern D (w160)] — assembly, both staircases, and study rows with the
    // lectern raised to a summit. Steps stay ≤140 px (the reach budget).
    const LAYOUTS = [
      [{ x: 250, y: 446 }, { x: 810, y: 446 }, { x: 512, y: 320 }, { x: 560, y: 452 }],
      [{ x: 170, y: 470 }, { x: 430, y: 390 }, { x: 660, y: 310 }, { x: 930, y: 470 }],
      [{ x: 890, y: 470 }, { x: 630, y: 390 }, { x: 364, y: 310 }, { x: 190, y: 470 }],
      [{ x: 280, y: 456 }, { x: 780, y: 456 }, { x: 512, y: 352 }, { x: 560, y: 238 }],
    ];
    let layout = 0;
    let glide = null; // { from: [{x,y}], to: [{x,y}], t }
    let rung = -1;
    return {
      update(dt) {
        const n = Math.floor(state.matchTime / PERIOD);
        const t = state.matchTime % PERIOD;
        if (n > 0 && t < GLIDE + 0.5 && rung !== n) {
          rung = n;
          layout = (layout + 1) % LAYOUTS.length;
          glide = { from: plats.map((p) => ({ x: p.x, y: p.y })), to: LAYOUTS[layout], t: 0 };
          playSfx("hazardBell", 0.6, 1.25);
          banner("CLASS CHANGE", "#d8b06a", { y: 230, size: 30, life: 1.2 });
          cameraCue("layout"); // pull back so the whole reshuffle is seen
        }
        if (glide) {
          glide.t += dt;
          const k = smoothstep(Math.min(1, glide.t / GLIDE));
          plats.forEach((p, i) => {
            const a = glide.from[i];
            const b = glide.to[i];
            movePlatform(p, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k);
          });
          if (glide.t >= GLIDE) glide = null;
        }
      },
      draw() {},
    };
  },

  // -- Mist Pier: the fog rolls in. For six seconds both fighters are dim
  // silhouettes — spacing goes by memory and muzzle flash. Purely visual.
  mistPier() {
    const PERIOD = 30, FOG = 6;
    let cued = -1;
    return {
      update() {
        const n = Math.floor(state.matchTime / PERIOD);
        const t = state.matchTime % PERIOD;
        if (t >= PERIOD - FOG && cued !== n) {
          cued = n;
          cameraCue("fog"); // dolly IN while visibility is low — claustrophobia
        }
      },
      drawTop(ctx) {
        const t = state.matchTime % PERIOD;
        const start = PERIOD - FOG;
        if (t < start) return;
        const a = Math.min(1, (t - start) * 1.2) * Math.min(1, (PERIOD - t) * 1.2);
        ctx.save();
        ctx.globalAlpha = a * 0.78;
        ctx.fillStyle = "#b9c6d4";
        ctx.fillRect(-200, -200, 1680, 1120);
        // drifting fog bands give the wall some body
        ctx.globalAlpha = a * 0.2;
        ctx.fillStyle = "#dfe8f2";
        for (let i = 0; i < 4; i++) {
          const y = 120 + i * 160 + Math.sin(state.matchTime * 0.5 + i * 2) * 30;
          const x = ((state.matchTime * (14 + i * 8)) % 1880) - 300;
          ctx.beginPath();
          ctx.ellipse(x, y, 340, 60, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // each fighter keeps a faint theme-coloured glow so they can be tracked
        ctx.globalCompositeOperation = "lighter";
        for (const f of fighters()) {
          ctx.globalAlpha = a * 0.3;
          const grad = ctx.createRadialGradient(f.x, f.y - 70, 4, f.x, f.y - 70, 60);
          grad.addColorStop(0, f.char.theme);
          grad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = grad;
          ctx.fillRect(f.x - 60, f.y - 130, 120, 120);
        }
        ctx.restore();
      },
    };
  },

  // -- Crosswalk Rush: don't stand in the road. Signal chirps, arrows flash,
  // then light-trail traffic races across at ground level.
  crosswalkRush(stage) {
    const PERIOD = 15, TELEGRAPH = 1.5;
    const plat = mainPlatform(state.platforms);
    let cars = null; // [{x, started}], plus dir
    let warned = -1;
    return {
      update(dt) {
        const n = Math.floor(state.matchTime / PERIOD);
        const t = state.matchTime % PERIOD;
        const runStart = PERIOD - 1.4;
        const teleStart = runStart - TELEGRAPH;
        const dir = n % 2 === 0 ? 1 : -1;
        if (t >= teleStart && warned !== n) {
          warned = n;
          playSfx("hazardSignalChirp", 0.7);
          warnZone(plat.x, plat.w, TELEGRAPH + 1.6);
        }
        if (t >= runStart && !cars) {
          cars = { dir, list: [0, 0.35, 0.7].map((d) => ({ delay: d, x: dir > 0 ? plat.x - 160 : plat.x + plat.w + 160 })) };
          playSfx("hazardTrafficPass", 0.85);
          cameraCue("surge", dir * 0.6); // a light lateral drift with the traffic
        }
        if (cars) {
          let allGone = true;
          for (const c of cars.list) {
            if (c.delay > 0) { c.delay -= dt; allGone = false; continue; }
            c.x += cars.dir * 900 * dt;
            if (cars.dir > 0 ? c.x < plat.x + plat.w + 200 : c.x > plat.x - 200) allGone = false;
            for (const f of fighters()) {
              const low = f.y > plat.y - 58 && f.y < plat.y + 30;
              if (low && Math.abs(f.x - c.x) < 60) {
                stageHit(f, { dmg: 5, vx: cars.dir * 140, vy: -380, color: "#4cabff", label: "TRAFFIC" });
              }
            }
          }
          if (allGone) cars = null;
        }
      },
      draw(ctx) {
        const t = state.matchTime % PERIOD;
        const runStart = PERIOD - 1.4;
        const teleStart = runStart - TELEGRAPH;
        if (t >= teleStart && t < runStart) {
          // blinking hazard arrows at both ends of the roadway
          const blink = Math.floor(state.matchTime * 6) % 2 === 0;
          if (blink) {
            ctx.save();
            ctx.fillStyle = "#ffd35a";
            for (const ax of [plat.x + 30, plat.x + plat.w - 30]) {
              ctx.beginPath();
              ctx.moveTo(ax - 12, plat.y - 26);
              ctx.lineTo(ax + 12, plat.y - 26);
              ctx.lineTo(ax, plat.y - 44);
              ctx.closePath();
              ctx.fill();
            }
            ctx.restore();
          }
          glowRect(ctx, plat.x, plat.y - 8, plat.w, 10, "#ffd35a", 0.12);
        }
        if (cars) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          for (const c of cars.list) {
            if (c.delay > 0) continue;
            const grad = ctx.createLinearGradient(c.x - cars.dir * 150, 0, c.x + cars.dir * 40, 0);
            grad.addColorStop(0, "rgba(76, 171, 255, 0)");
            grad.addColorStop(0.8, "rgba(120, 200, 255, 0.75)");
            grad.addColorStop(1, "rgba(240, 252, 255, 0.95)");
            ctx.fillStyle = grad;
            ctx.fillRect(Math.min(c.x, c.x - cars.dir * 150), plat.y - 46, 150 + 40, 34);
          }
          ctx.restore();
        }
      },
    };
  },

  // -- Cursed Teeth: it swallows. Fangs drop from above on a shadow
  // telegraph, and every so often the whole stage inhales.
  cursedTeeth(stage) {
    const FANG_EVERY = 12, INHALE_EVERY = 25, INHALE = 2;
    const plat = mainPlatform(state.platforms);
    let fang = null; // { x, y, phase: shadow|fall, t }
    let fangCycle = -1;
    let inhaled = -1;
    return {
      update(dt) {
        // falling fang
        const fn = Math.floor(state.matchTime / FANG_EVERY);
        const ft = state.matchTime % FANG_EVERY;
        if (ft >= FANG_EVERY - 2.2 && fangCycle !== fn) {
          fangCycle = fn;
          const x = plat.x + 60 + Math.random() * (plat.w - 120);
          // fangs pierce down to the topmost surface — a platform can be hit
          const landY = surfaceUnder(x).y;
          fang = { x, y: -60, phase: "shadow", t: 0, landY };
          warnZone(x - 55, 110, 2.4, { yMin: landY - 90, yMax: landY + 30 });
        }
        if (fang) {
          fang.t += dt;
          if (fang.phase === "shadow" && fang.t >= 1.1) {
            fang.phase = "fall";
            playSfx("hazardTelegraph", 0.45, 0.8);
          } else if (fang.phase === "fall") {
            fang.y += 1500 * dt;
            if (fang.y >= fang.landY - 10) {
              for (const f of fighters()) {
                const low = f.y > fang.landY - 70 && f.y < fang.landY + 30;
                if (low && Math.abs(f.x - fang.x) < 48) {
                  const away = sign(f.x - fang.x) || 1;
                  stageHit(f, { dmg: 6, vx: away * 160, vy: -350, color: "#b06cff", label: "FANG" });
                }
              }
              burst(fang.x, fang.landY - 16, "#e6dcff", 20, 1.1);
              playSfx("hazardFangSnap", 0.8);
              state.camera.shake = Math.max(state.camera.shake, 3);
              cameraCue("punch", 0.7);
              fang = null;
            }
          }
        }
        // the inhale
        const it = state.matchTime % INHALE_EVERY;
        const inum = Math.floor(state.matchTime / INHALE_EVERY);
        if (it >= INHALE_EVERY - INHALE) {
          if (inhaled !== inum) {
            inhaled = inum;
            playSfx("hazardTelegraph", 0.4, 0.5);
            popup(640, 300, "IT INHALES…", "#b06cff", 20);
            cameraCue("inhale"); // the camera is being inhaled too
          }
          for (const f of fighters()) {
            const dir = sign(640 - f.x);
            if (dir) f.vx += dir * (f.grounded ? 150 : 230) * dt;
          }
        }
      },
      draw(ctx) {
        if (fang) {
          ctx.save();
          // shadow on the ground grows as the drop nears
          const spread = fang.phase === "shadow" ? 20 + (fang.t / 1.1) * 26 : 46;
          ctx.globalAlpha = 0.42;
          ctx.fillStyle = "#1a0b2e";
          ctx.beginPath();
          ctx.ellipse(fang.x, fang.landY + 4, spread, 7, 0, 0, Math.PI * 2);
          ctx.fill();
          if (fang.phase === "fall") {
            const img = fxImage("stage_fang");
            ctx.globalAlpha = 1;
            if (img) {
              const fa = fxAdjust("stage_fang");
              const h = 72 * fa.scale;
              const w = img.width * h / img.height;
              ctx.translate(fang.x, fang.y);
              ctx.rotate(Math.PI); // art points up; this one dives
              ctx.drawImage(img, -w / 2 + fa.dx, -h / 2 + fa.dy, w, h);
            } else {
              ctx.fillStyle = "#efe6ff";
              ctx.strokeStyle = "#b06cff";
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(fang.x - 14, fang.y - 34);
              ctx.lineTo(fang.x + 14, fang.y - 34);
              ctx.lineTo(fang.x, fang.y + 30);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
            }
          }
          ctx.restore();
        }
        const it = state.matchTime % INHALE_EVERY;
        if (it >= INHALE_EVERY - INHALE) {
          // streaking motes flowing toward the gullet
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.strokeStyle = "rgba(176, 108, 255, 0.4)";
          ctx.lineWidth = 2;
          for (let i = 0; i < 10; i++) {
            const seed = i * 131;
            const prog = ((state.matchTime * 0.7 + i * 0.1) % 1);
            const sx = 640 + ((seed % 2 === 0 ? 1 : -1) * (620 - prog * 560));
            const sy = 140 + ((seed * 37) % 420);
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + sign(640 - sx) * 26, sy + sign(360 - sy) * 6);
            ctx.stroke();
          }
          ctx.restore();
        }
      },
    };
  },

  // -- River Gate: the river breeze. A gentle crosswind alternates direction
  // and drifts airborne fighters only; the petals always show which way.
  riverGate() {
    const FLIP = 15, WIND = 42;
    const petals = [];
    const windDir = () => (Math.floor(state.matchTime / FLIP) % 2 === 0 ? 1 : -1);
    let cuedDir = 0;
    return {
      update(dt) {
        const dir = windDir();
        if (dir !== cuedDir) {
          cuedDir = dir;
          cameraCue("wind", dir); // sustained roll with the wind, flips when it flips
        }
        for (const f of fighters()) {
          if (!f.grounded && !f.ledge) f.x += dir * WIND * dt;
        }
        if (petals.length < 18 && Math.random() < dt * 6) {
          petals.push({
            x: dir > 0 ? -20 : 1300, y: 80 + Math.random() * 420,
            vy: 14 + Math.random() * 26, seed: Math.random() * 10,
          });
        }
        for (let i = petals.length - 1; i >= 0; i--) {
          const p = petals[i];
          p.x += dir * (70 + Math.sin(state.matchTime * 2 + p.seed) * 24) * dt;
          p.y += p.vy * dt;
          if (p.x < -40 || p.x > 1320 || p.y > 700) petals.splice(i, 1);
        }
      },
      draw(ctx) {
        ctx.save();
        for (const p of petals) {
          ctx.globalAlpha = 0.75;
          ctx.fillStyle = Math.floor(p.seed * 10) % 3 === 0 ? "#ffd9a0" : "#ffc9d8";
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(state.matchTime * 2 + p.seed);
          ctx.beginPath();
          ctx.ellipse(0, 0, 5, 3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      },
    };
  },

  // -- School Wing: something in the windows. A weak curse wanders the
  // grounds — pop it for meter before it latches onto someone.
  schoolWing(stage) {
    const SPAWN_EVERY = 20, LIFE = 8;
    const plat = mainPlatform(state.platforms);
    let blob = null;
    let cycle = -1;
    return {
      update(dt) {
        const n = Math.floor(state.matchTime / SPAWN_EVERY);
        const t = state.matchTime % SPAWN_EVERY;
        if (t >= SPAWN_EVERY - LIFE - 0.5 && cycle !== n && !blob) {
          cycle = n;
          const fromLeft = Math.random() < 0.5;
          blob = {
            x: fromLeft ? plat.x + 40 : plat.x + plat.w - 40,
            vx: (fromLeft ? 1 : -1) * 58,
            life: LIFE,
          };
          popup(blob.x, plat.y - 90, "A CURSE CREEPS OUT", "#b06cff", 14);
        }
        if (!blob) return;
        blob.life -= dt;
        blob.x += blob.vx * dt;
        if (blob.x < plat.x + 30 || blob.x > plat.x + plat.w - 30) blob.vx *= -1;
        const bx = blob.x;
        const by = plat.y;

        // popped by any attack hitbox or projectile → meter for the attacker
        const rect = { x: bx - 30, y: by - 60, w: 60, h: 60 };
        let popper = null;
        for (const hb of state.hitboxes) {
          if (hb.age < 0) continue;
          const r = hitboxRect(hb);
          if (r.x < rect.x + rect.w && r.x + r.w > rect.x && r.y < rect.y + rect.h && r.y + r.h > rect.y) {
            popper = hb.owner;
            break;
          }
        }
        if (!popper) {
          for (const p of state.projectiles) {
            if (Math.abs(p.x - bx) < 40 && Math.abs(p.y - (by - 30)) < 44) { popper = p.owner; break; }
          }
        }
        if (popper) {
          popper.meter = clamp(popper.meter + 8, 0, METER_MAX);
          popup(bx, by - 90, "+8 CE", "#b06cff", 22);
          burst(bx, by - 30, "#b06cff", 22, 1.1);
          playSfx("hazardCurseLatch", 0.6, 1.2);
          cameraCue("punch", 0.5); // blob pop: a 40 ms micro-punch
          blob = null;
          return;
        }
        // …or it latches onto whoever it touches
        for (const f of fighters()) {
          if (Math.abs(f.x - bx) < 42 && Math.abs(f.y - by) < 40) {
            const away = sign(f.x - bx) || 1;
            if (stageHit(f, { dmg: 4, vx: away * 180, vy: -220, color: "#b06cff", label: "LATCHED" })) {
              burst(bx, by - 30, "#7d58d8", 16, 0.9);
              blob = null;
              return;
            }
          }
        }
        if (blob.life <= 0) {
          dust(bx, by, 10);
          blob = null;
        }
      },
      draw(ctx) {
        if (!blob) return;
        const bx = blob.x;
        const by = mainPlatform(state.platforms).y;
        const squish = 1 + 0.12 * Math.sin(state.matchTime * 9);
        const img = fxImage("stage_weak_curse");
        ctx.save();
        if (img) {
          const fa = fxAdjust("stage_weak_curse");
          const h = 60 * fa.scale;
          const w = img.width * h / img.height;
          ctx.translate(bx, by);
          ctx.scale(blob.vx > 0 ? -1 : 1, 1);
          ctx.drawImage(img, -w / 2 + fa.dx, -h + fa.dy, w, h);
        } else {
          ctx.fillStyle = "#4b2d73";
          ctx.strokeStyle = "#b06cff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(bx, by - 24, 26 / squish, 24 * squish, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#ffd35a";
          ctx.beginPath();
          ctx.arc(bx + sign(blob.vx) * 8, by - 30, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#1a0b2e";
          ctx.beginPath();
          ctx.arc(bx + sign(blob.vx) * 10, by - 30, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      },
    };
  },

  // -- Empty City: decay. Both derelict rooftops (the "top" platforms)
  // crumble under weight and reform independently; the low ledges are sound.
  emptyCity() {
    const roofs = state.platforms.filter((p) => p.kind === "top");
    const st = roofs.map(() => ({ crumbleT: 0, reformT: 0 }));
    return {
      update(dt) {
        roofs.forEach((roof, i) => {
          const s = st[i];
          if (roof.ghost) {
            s.reformT -= dt;
            if (s.reformT <= 0) {
              roof.ghost = false;
              s.crumbleT = 0;
              dust(roof.x + roof.w / 2, roof.y, 12);
              cameraCue("punch", 0.4); // a soft focus pull as the roof re-knits
            }
            return;
          }
          const loaded = fighters().some((f) => f.grounded && f.currentPlatform === roof);
          if (loaded) {
            s.crumbleT += dt;
            roof.shakeMag = 1.5 + (s.crumbleT / 1.2) * 3;
            if (s.crumbleT >= 1.2) {
              roof.ghost = true;
              roof.shakeMag = 0;
              s.reformT = 5;
              burst(roof.x + roof.w / 2, roof.y + 6, "#9fbdd6", 24, 1.2);
              playSfx("explosionSmall", 0.5, 0.8);
              cameraCue("rattle"); // the crumble carries into the lens
            }
          } else {
            s.crumbleT = Math.max(0, s.crumbleT - dt * 2);
            roof.shakeMag = s.crumbleT > 0 ? 1.5 : 0;
          }
        });
      },
      draw() {},
    };
  },

  // -- Billboard Roof: the storm. Two flashes, then lightning takes the top
  // platform. Strongest position between strikes, a trap during them.
  billboardRoof() {
    const PERIOD = 22, STRIKE_AT = PERIOD - 0.3;
    const top = state.platforms.find((p) => p.kind === "top") || state.platforms[3];
    let warned = -1;
    let boltT = 0;
    return {
      update(dt) {
        const n = Math.floor(state.matchTime / PERIOD);
        const t = state.matchTime % PERIOD;
        if (t >= STRIKE_AT - 1.8 && warned !== n) {
          warned = n;
          playSfx("hazardTelegraph", 0.45, 1.2);
          warnZone(top.x - 20, top.w + 40, 2.1, { yMax: top.y + 40 });
        }
        boltT = Math.max(0, boltT - dt);
        if (t >= STRIKE_AT && t < STRIKE_AT + 0.1 && boltT <= 0) {
          boltT = 0.25;
          playSfx("hazardElectricArc", 0.95);
          state.camera.shake = Math.max(state.camera.shake, 8);
          cameraCue("lightning"); // the strongest shake in the game
          for (const f of fighters()) {
            const onTop = (f.grounded && f.currentPlatform === top) ||
              (f.x > top.x - 14 && f.x < top.x + top.w + 14 && f.y > top.y - 70 && f.y < top.y + 24);
            if (onTop) {
              const toCenter = f.x < 640 ? 1 : -1;
              stageHit(f, { dmg: 8, vx: toCenter * 210, vy: -260, color: "#fff3a0", label: "STRUCK" });
            }
          }
        }
      },
      draw(ctx) {
        const t = state.matchTime % PERIOD;
        // two warning flashes on the clouds
        const f1 = Math.abs(t - (STRIKE_AT - 1.6));
        const f2 = Math.abs(t - (STRIKE_AT - 0.8));
        const flash = Math.max(0, 0.12 - Math.min(f1, f2)) / 0.12;
        if (flash > 0) {
          ctx.save();
          ctx.globalAlpha = flash * 0.22;
          ctx.fillStyle = "#eaf2ff";
          ctx.fillRect(-200, -200, 1680, 500);
          ctx.restore();
        }
        if (boltT > 0) {
          const a = boltT / 0.25;
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.strokeStyle = "#ffffff";
          ctx.shadowColor = "#8fd0ff";
          ctx.shadowBlur = 26;
          ctx.lineWidth = 5 * a;
          ctx.globalAlpha = Math.min(1, a * 1.4);
          const cx = top.x + top.w / 2;
          ctx.beginPath();
          let y = -80;
          ctx.moveTo(cx, y);
          while (y < top.y) {
            y += 46;
            ctx.lineTo(cx + (Math.random() - 0.5) * 46, Math.min(y, top.y));
          }
          ctx.stroke();
          ctx.restore();
          glowRect(ctx, top.x, top.y - 6, top.w, 10, "#cfe8ff", a * 0.5);
        }
      },
    };
  },

  // -- Domain Core: inside a domain. Low gravity (stages.js `mods`) while
  // the side platforms drift in slow orbits around the core.
  domainCore() {
    const sides = state.platforms.filter((p) => p.kind === "side");
    const bases = sides.map((p) => ({ x: p.x, y: p.y }));
    const motes = Array.from({ length: 10 }, (_, i) => ({ seed: i * 97.3 }));
    return {
      update() {
        const w = (state.matchTime * Math.PI * 2) / 9;
        sides.forEach((p, i) => {
          // phases spread evenly around the circle, however many shards orbit
          const phase = (i * Math.PI * 2) / sides.length;
          movePlatform(p, bases[i].x + Math.cos(w + phase) * 46, bases[i].y + Math.sin(w + phase) * 24);
        });
      },
      draw(ctx) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (const m of motes) {
          const t = state.matchTime * 0.3 + m.seed;
          const x = 640 + Math.cos(t) * (240 + (m.seed % 160));
          const y = 340 + Math.sin(t * 1.4) * 150;
          ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 3);
          ctx.fillStyle = "#6cffe6";
          ctx.beginPath();
          ctx.moveTo(x, y - 7);
          ctx.lineTo(x + 4, y);
          ctx.lineTo(x, y + 7);
          ctx.lineTo(x - 4, y);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      },
    };
  },
};
