// Domain Expansion — the second, larger super.
//
// An ultimate costs a full bar and fires once (see ultimates.js). A domain
// costs that same full bar, runs for several seconds, and is the only super the
// player keeps *playing* while it is open: each one binds a live interaction to
// SPECIAL (and, for Sukuna, to LIGHT/HEAVY afterwards). That is the whole design
// brief — a domain you watch is a cutscene, a domain you operate is a move.
//
// Only the ten sorcerers who canonically have a domain get one; seven of those
// are on the roster. `char.domains` is an array so a fighter with more than one
// can bind them to different d-pad directions; nobody has two yet, but the
// input path and the moves screen already handle it.

import { state } from "./state.js";
import { foesOf } from "./teams.js";
import { clamp, sign, rand, rectsOverlap, circleRectOverlap } from "./utils.js";
import { burst, dust, ring, popup, banner } from "./particles.js";
import { playSfx, playGrunt } from "./audio.js";
import { applyHit, opponentOf, hurtbox, spawnMelee, applyStatus } from "./combat.js";
import { applyInstall } from "./specials.js";
import { getImage } from "./assets.js";
import { DOMAIN_METER_COST } from "./constants.js";

const GROUND = () => state.platforms[0]?.y ?? 568;

/** The domain a fighter currently has open, or null. */
// Each domain's signature sound, layered under the shared expansion sting.
// Keyed by the backdrop sprite because that is what a domain definition
// actually carries at runtime.
const DOMAIN_STING = {
  "domain:unlimited_void": "domainUnlimitedVoid",
  "domain:malevolent_shrine": "domainMalevolentShrine",
  "domain:shadow_garden": "domainShadowGarden",
  "domain:self_embodiment": "domainSelfEmbodiment",
  "domain:iron_mountain": "domainIronMountain",
  "domain:idle_death_gamble": "domainIdleDeathGamble",
  "domain:mutual_love": "domainMutualLove",
  "domain:captivating_skandha": "domainCaptivatingSkandha",
};

export function activeDomain(f) {
  const d = state.domain;
  return d && d.owner === f && !d.dead ? d : null;
}

/** True while ANY domain is open — used to stop two from overlapping. */
export function domainOpen() {
  return !!(state.domain && !state.domain.dead);
}

export function canOpenDomain(f, slot = 0) {
  const list = f.char.domains;
  if (!list || !list[slot]) return false;
  return f.meter >= DOMAIN_METER_COST && !domainOpen() && !f.dead && f.respawnTimer <= 0;
}

export function performDomain(f, slot = 0) {
  const def = f.char.domains?.[slot];
  if (!def) return;
  if (domainOpen()) {
    popup(f.x, f.y - 170, "A DOMAIN IS ALREADY OPEN", "#9aa4c0", 15);
    return;
  }
  if (f.meter < DOMAIN_METER_COST) {
    popup(f.x, f.y - 160, "NEEDS A FULL BAR", "#9aa4c0", 15);
    return;
  }
  f.meter = 0;

  const p = def.p || {};
  const color = p.color || f.char.theme;

  // Opening cinematic. Deliberately louder than an ultimate's: this is the
  // biggest thing in the game and it costs everything the fighter has banked.
  state.slowMo = Math.max(state.slowMo, 0.6);
  state.screenFlash = { color, life: 0.5, maxLife: 0.5 };
  state.camera.shake = Math.max(state.camera.shake, 16);
  banner("DOMAIN EXPANSION", color, { y: 150, size: 34, life: 2.0 });
  banner(def.name.toUpperCase(), color, { y: 205, size: 50, life: 2.2 });
  playSfx("domainExpansion", 1);
  // Signature layer under the shared sting, keyed off the domain's backdrop
  // sprite — the one stable identifier a domain definition carries.
  playSfx(DOMAIN_STING[p.bg], 1);
  playGrunt(f.charKey);
  ring(f.x, f.y - 90, color, 260);
  burst(f.x, f.y - 90, color, 60, 2.2);

  // The barrier itself: a full-screen environment swap that the renderer
  // already knows how to draw (state.domainOverlay), plus the live entity.
  state.domainOverlay = {
    color, life: p.duration, maxLife: p.duration,
    label: def.name, ownerId: f.id, sprite: p.bg,
  };

  const dom = makeDomain(f, def, p, color);
  state.domain = dom;
  state.entities.push(dom);

  // A domain sets its own opening pose; the fighter is briefly untouchable
  // while the barrier goes up, exactly like an ultimate's startup.
  f.action = { kind: "ult", t: 0, dur: 0.9, anim: "ult", lockMovement: true, uninterruptible: true };
  f.animTime = 0;
  f.animKey = "ult";
  f.invuln = Math.max(f.invuln, 1.1);
}

function makeDomain(owner, def, p, color) {
  const handler = HANDLERS[def.type] || {};
  const dom = {
    kind: "domain",
    owner, def, p, color,
    t: 0, dead: false,
    // per-domain scratch space
    s: handler.init ? handler.init(owner, p) : {},
    update(dt) {
      this.t += dt;
      const done = this.t >= p.duration || owner.dead || owner.respawnTimer > 0;
      if (done) {
        this.dead = true;
        if (handler.close) handler.close(this, owner);
        if (state.domain === this) state.domain = null;
        if (state.domainOverlay && state.domainOverlay.ownerId === owner.id) {
          state.domainOverlay = null;
        }
        popup(owner.x, owner.y - 176, "DOMAIN CLOSED", "#9aa4c0", 16);
        return;
      }
      if (handler.update) handler.update(this, owner, dt);
    },
    draw(ctx) {
      if (handler.draw) handler.draw(this, owner, ctx);
    },
  };
  return dom;
}

/** Routed from fighter.js: the domain owner pressed a button while it is open.
 *  Returns true when the domain consumed the press. */
/** Which Domain Expansion a d-pad direction opens, or -1 for none pressed.
 *
 *  Every direction opens a domain — a fighter with one opens it from any of
 *  the four, which is the case for the whole roster today. Only a fighter with
 *  more than one splits the pad, and then it splits in halves you can find
 *  without looking: **up and left are the first, down and right the second.**
 *
 *  The arithmetic is that rule written once so it degrades rather than
 *  needing a new branch per count. `ORDER` is up, left, right, down, and the
 *  index is scaled into the number of domains available: at one they all land
 *  on 0, at two the first pair lands on 0 and the second on 1, at four each
 *  direction gets its own.
 */
export const DOMAIN_DPAD_ORDER = ["up", "left", "right", "down"];

export function domainSlotFor(dir, count) {
  if (!dir || count <= 0) return -1;
  const i = DOMAIN_DPAD_ORDER.indexOf(dir);
  if (i < 0) return -1;
  return Math.min(Math.floor((i * count) / DOMAIN_DPAD_ORDER.length), count - 1);
}

/** Which d-pad directions open domain `slot`, for the controls screen. Derived
 *  from the same function the game reads, so the screen cannot describe a
 *  mapping the sim does not have. */
export function domainDirsFor(slot, count) {
  return DOMAIN_DPAD_ORDER.filter((dir) => domainSlotFor(dir, count) === slot);
}

export function domainInput(f, input) {
  const dom = activeDomain(f);
  if (!dom) return false;
  const handler = HANDLERS[dom.def.type];
  return handler && handler.input ? !!handler.input(dom, f, input) : false;
}

/** Knockback scaling a domain grants its owner (Chimera Shadow Garden). */
export function domainKnockbackMul(f) {
  const dom = activeDomain(f);
  return dom?.p.kbTakenMul ?? 1;
}

// ---------------------------------------------------------------- helpers

/** True while this fighter is holding New Shadow Style: Simple Domain
 *  (specials.js). The circle's whole purpose is that a domain's guaranteed hit
 *  stops being guaranteed, so it is asked about here rather than in the kits. */
export function simpleDomainActive(f) {
  return !!(f.simpleDomain && f.simpleDomain.t > 0);
}

/** Foes a domain's AUTOMATIC effect may touch — the sure-hit half: Unlimited
 *  Void's paralysis, the Shrine's rain, the Iron Mountain's floor, Skandha's
 *  fish. A Simple Domain neutralises exactly this and nothing else: the domain
 *  stays open, and anything its owner aims by hand still connects. */
function sureHitFoesOf(f) {
  return foesOf(f).filter((t) => !simpleDomainActive(t));
}

function tick(dom, key, period, fn) {
  dom.s[key] = (dom.s[key] ?? 0) - 1 / 60;
  if (dom.s[key] > 0) return;
  dom.s[key] = period;
  fn();
}

// ---------------------------------------------------------------- handlers

const HANDLERS = {
  // GOJO — Unlimited Void. The enemy receives infinite information and can act
  // on none of it: they are locked in place for the duration. Every hit Gojo
  // lands banks an orb; closing the domain detonates the lot.
  unlimitedVoid: {
    init: () => ({ orbs: 0, lastDamage: new Map() }),
    update(dom, f) {
      for (const t of sureHitFoesOf(f)) {
        // total information paralysis — held, not damaged
        t.hitstun = Math.max(t.hitstun, 0.25);
        t.vx *= 0.82;
        if (!t.grounded) t.vy = Math.min(t.vy, 60);
        const prev = dom.s.lastDamage.get(t) ?? t.damage;
        if (t.damage > prev + 0.01 && dom.s.orbs < dom.p.maxOrbs) {
          dom.s.orbs += 1;
          playSfx("blast", 0.35, 1.6);
        }
        dom.s.lastDamage.set(t, t.damage);
        if (Math.random() < 0.35) {
          burst(t.x + rand(-90, 90), t.y - rand(0, 190), dom.color, 2, 0.5);
        }
      }
    },
    close(dom, f) {
      const n = dom.s.orbs;
      if (!n) return;
      for (const t of foesOf(f)) {
        applyHit(f, t, {
          dmg: dom.p.orbDmg * n, baseKb: dom.p.orbBase * n, growth: 8, angle: 0.55,
          label: `VOID ×${n}`, sfx: "blast", unblockable: true, heavy: true,
        }, "script");
      }
      state.camera.shake = Math.max(state.camera.shake, 18);
      state.slowMo = Math.max(state.slowMo, 0.3);
    },
    draw(dom, f, ctx) {
      // banked orbs circle Gojo
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < dom.s.orbs; i++) {
        const a = (i / Math.max(1, dom.s.orbs)) * Math.PI * 2 + dom.t * 1.6;
        const r = 92 + Math.sin(dom.t * 2 + i) * 10;
        const x = f.x + Math.cos(a) * r;
        const y = f.y - 100 + Math.sin(a) * r * 0.45;
        const g = ctx.createRadialGradient(x, y, 1, x, y, 15);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(1, dom.color);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 13, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      hint(ctx, `INFORMATION OVERLOAD — ${dom.s.orbs} ORBS BANKED`, dom.color);
    },
  },

  // SUKUNA — Malevolent Shrine. Blades orbit; slashes rain automatically.
  // SPECIAL snatches a blade, then LIGHT/HEAVY throws it as a huge Cleave.
  malevolentShrine: {
    init: (f, p) => ({ blades: p.blades, held: false, rain: 0 }),
    update(dom, f) {
      tick(dom, "rain", dom.p.rainTick, () => {
        for (const t of sureHitFoesOf(f)) {
          if (t.invuln > 0) continue;
          t.damage = Math.min(999, t.damage + dom.p.rainDmg);
          t.hitstun = Math.max(t.hitstun, 0.12);
          const sx = t.x + rand(-60, 60), sy = t.y - rand(20, 150);
          burst(sx, sy, dom.color, 6, 0.8);
          popup(t.x, t.y - 150, `${dom.p.rainDmg}%`, dom.color, 13);
        }
        playSfx("slash", 0.3, 1.4);
      });
    },
    input(dom, f, input) {
      if (input.specialP && !dom.s.held && dom.s.blades > 0) {
        dom.s.held = true;
        dom.s.blades -= 1;
        popup(f.x, f.y - 180, "BLADE TAKEN", dom.color, 20);
        playSfx("slash", 0.8, 0.8);
        burst(f.x + f.facing * 50, f.y - 110, dom.color, 14, 1);
        return true;
      }
      if ((input.lightP || input.heavyP) && dom.s.held) {
        dom.s.held = false;
        // the more blades still orbiting, the heavier the throw
        const mul = 1 + dom.s.blades * 0.12;
        spawnMelee(f, {
          delay: 0.06, dur: 0.16, ox: 40, oy: -120, w: 320, h: 200,
          dmg: dom.p.cleaveDmg * mul, base: dom.p.cleaveBase * mul,
          growth: dom.p.cleaveGrowth, angle: 0.45,
          label: "CLEAVE", sfx: "slashHeavy", unblockable: true, heavy: true,
        });
        popup(f.x, f.y - 190, `CLEAVE ×${mul.toFixed(2)}`, dom.color, 24);
        state.camera.shake = Math.max(state.camera.shake, 10);
        state.slowMo = Math.max(state.slowMo, 0.14);
        return true;
      }
      return false;
    },
    draw(dom, f, ctx) {
      const g = GROUND();
      // The shrine itself, behind the blades. This art was drawn for Sukuna's
      // old shrine ultimate; the domain is where it actually belongs.
      const shrine = getImage("effect:shrine");
      if (shrine) {
        const fade = Math.min(1, dom.t / 0.5) * Math.min(1, (dom.p.duration - dom.t) / 0.5);
        const h = 470;
        const w = shrine.width * h / shrine.height;
        ctx.save();
        ctx.globalAlpha = 0.62 * fade;
        ctx.shadowColor = dom.color;
        ctx.shadowBlur = 34;
        ctx.drawImage(shrine, 640 - w / 2, g - h, w, h);
        ctx.restore();
      }
      ctx.save();
      for (let i = 0; i < dom.s.blades; i++) {
        const a = (i / dom.p.blades) * Math.PI * 2 + dom.t * 0.9;
        const x = 640 + Math.cos(a) * 330;
        const y = g - 250 + Math.sin(a) * 120;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a + Math.PI / 2 + Math.sin(dom.t * 3 + i) * 0.12);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = dom.color;
        ctx.shadowColor = dom.color;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.moveTo(0, -46); ctx.lineTo(9, 14); ctx.lineTo(0, 40); ctx.lineTo(-9, 14);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      if (dom.s.held) {
        // the taken blade rides above Sukuna until it is thrown
        ctx.save();
        ctx.translate(f.x, f.y - 210 + Math.sin(dom.t * 7) * 6);
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = "#fff";
        ctx.shadowColor = dom.color;
        ctx.shadowBlur = 26;
        ctx.beginPath();
        ctx.moveTo(0, -60); ctx.lineTo(13, 18); ctx.lineTo(0, 52); ctx.lineTo(-13, 18);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      hint(ctx, dom.s.held ? "LIGHT / HEAVY — UNLEASH THE CLEAVE"
                           : `SPECIAL — TAKE A BLADE  (${dom.s.blades} LEFT)`, dom.color);
    },
  },

  // MEGUMI — Chimera Shadow Garden. Unlimited shadow-ports on SPECIAL, each
  // one loosing a shikigami as he resurfaces. Shadow also cushions him.
  shadowGarden: {
    init: () => ({}),
    update(dom, f) {
      const g = GROUND();
      if (Math.random() < 0.25) dust(rand(140, 1140), g, 2);
    },
    input(dom, f, input) {
      if (!input.specialP) return false;
      const opp = opponentOf(f);
      if (!opp) return false;
      const side = f.x < opp.x ? 1 : -1;         // resurface on their far side
      burst(f.x, f.y - 70, dom.color, 20, 1);
      f.x = clamp(opp.x + side * 78, 80, 1200);
      f.y = opp.y;
      f.facing = -side;
      f.grounded = false;
      f.invuln = Math.max(f.invuln, 0.22);
      burst(f.x, f.y - 70, dom.color, 22, 1.1);
      playSfx("whoosh", 0.9, 0.75);
      spawnMelee(f, {
        delay: 0.04, dur: 0.14, ox: 26, oy: -110, w: 190, h: 130,
        dmg: dom.p.portDmg, base: dom.p.portBase, growth: dom.p.portGrowth,
        angle: 0.45, label: "Shikigami", sfx: "slashHeavy", effect: "snare",
      });
      return true;
    },
    draw(dom, f, ctx) {
      const g = GROUND();
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = "#0a0c1c";
      ctx.fillRect(0, g - 10, 1280, 200);
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = dom.color;
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const y = g + 6 + i * 14;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(320, y - 8 * Math.sin(dom.t * 2 + i), 900, y + 8 * Math.cos(dom.t * 1.7 + i), 1280, y);
        ctx.stroke();
      }
      ctx.restore();
      hint(ctx, "SPECIAL — SINK AND STRIKE FROM THEIR SHADOW", dom.color);
    },
  },

  // MAHITO — Self-Embodiment of Perfection. Everything is unblockable and every
  // landed hit stacks Distortion; five stacks collapse the soul.
  selfEmbodiment: {
    init: () => ({ stacks: 0, last: new Map() }),
    update(dom, f) {
      for (const t of sureHitFoesOf(f)) {
        const prev = dom.s.last.get(t) ?? t.damage;
        if (t.damage > prev + 0.01) {
          dom.s.stacks += 1;
          popup(t.x, t.y - 165, `DISTORTION ${dom.s.stacks}/${dom.p.stacksToBurst}`, dom.color, 17);
          if (dom.s.stacks >= dom.p.stacksToBurst) {
            dom.s.stacks = 0;
            applyHit(f, t, {
              dmg: dom.p.burstDmg, baseKb: dom.p.burstBase, growth: dom.p.burstGrowth,
              angle: 0.6, label: "SOUL COLLAPSE", sfx: "blast",
              unblockable: true, heavy: true,
            }, "script");
            ring(t.x, t.y - 90, dom.color, 200);
            burst(t.x, t.y - 90, dom.color, 44, 1.7);
            state.camera.shake = Math.max(state.camera.shake, 14);
            state.slowMo = Math.max(state.slowMo, 0.22);
          }
        }
        dom.s.last.set(t, t.damage);
      }
    },
    draw(dom, f, ctx) {
      // reaching hands along the floor
      const g = GROUND();
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = dom.color;
      ctx.lineWidth = 3;
      for (let i = 0; i < 9; i++) {
        const x = 80 + i * 140;
        const h = 40 + 26 * Math.sin(dom.t * 2.2 + i);
        ctx.beginPath();
        ctx.moveTo(x, g);
        ctx.lineTo(x - 8, g - h);
        ctx.moveTo(x, g);
        ctx.lineTo(x + 2, g - h * 1.15);
        ctx.moveTo(x, g);
        ctx.lineTo(x + 11, g - h * 0.9);
        ctx.stroke();
      }
      ctx.restore();
      hint(ctx, `NOTHING CAN BE BLOCKED — DISTORTION ${dom.s.stacks}/${dom.p.stacksToBurst}`, dom.color);
    },
  },

  // JOGO — Coffin of the Iron Mountain. Burning floor, and SPECIAL erupts a
  // geyser under the enemy for free.
  ironMountain: {
    init: () => ({ floor: 0 }),
    update(dom, f) {
      tick(dom, "floor", dom.p.floorTick, () => {
        const g = GROUND();
        for (const t of sureHitFoesOf(f)) {
          if (t.invuln > 0 || !t.grounded) continue;
          t.damage = Math.min(999, t.damage + dom.p.floorDmg);
          burst(t.x, g - 10, "#ff7a2f", 5, 0.5);
        }
      });
    },
    input(dom, f, input) {
      if (!input.specialP) return false;
      const opp = opponentOf(f);
      if (!opp) return false;
      const g = GROUND();
      const tx = opp.x;
      burst(tx, g - 60, "#ff5a1f", 26, 1.3);
      ring(tx, g - 40, "#ffd35a", 130);
      dust(tx, g, 14);
      playSfx("blast", 0.85, 0.85);
      state.camera.shake = Math.max(state.camera.shake, 7);
      for (const t of foesOf(f)) {
        if (Math.abs(t.x - tx) < 80 && Math.abs(t.y - g) < 220) {
          applyHit(f, t, {
            dmg: dom.p.geyserDmg, baseKb: dom.p.geyserBase, growth: dom.p.geyserGrowth,
            angle: 1.2, label: "GEYSER", sfx: "blast", effect: "burn",
          }, "script");
        }
      }
      return true;
    },
    draw(dom, f, ctx) {
      const g = GROUND();
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#ff5a1f";
      for (let i = 0; i < 14; i++) {
        const x = 60 + i * 92;
        const h = 20 + 16 * Math.sin(dom.t * 9 + i * 1.6);
        ctx.beginPath();
        ctx.moveTo(x - 16, g);
        ctx.quadraticCurveTo(x, g - h * 2.2, x + 16, g);
        ctx.fill();
      }
      ctx.restore();
      hint(ctx, "SPECIAL — ERUPT A GEYSER UNDER THEM (FREE)", dom.color);
    },
  },

  // HAKARI — Idle Death Gamble. Three reels; SPECIAL stops the next one.
  // All three matching is the jackpot.
  idleDeathGamble: {
    init: (f, p) => ({
      spin: [0, 0, 0],
      stopped: [null, null, null],
      resolved: false,
    }),
    update(dom, f, dt) {
      for (let i = 0; i < dom.p.reels; i++) {
        if (dom.s.stopped[i] === null) dom.s.spin[i] += dt * (9 + i * 2.5);
      }
      if (!dom.s.resolved && dom.s.stopped.every((v) => v !== null)) {
        dom.s.resolved = true;
        resolveReels(dom, f);
      }
    },
    input(dom, f, input) {
      if (!input.specialP) return false;
      const i = dom.s.stopped.findIndex((v) => v === null);
      if (i < 0) return false;
      dom.s.stopped[i] = Math.floor(dom.s.spin[i]) % dom.p.symbols;
      playSfx("blast", 0.5, 1.5);
      burst(f.x, f.y - 150, dom.color, 12, 0.8);
      popup(f.x, f.y - 190, `REEL ${i + 1}`, dom.color, 20);
      return true;
    },
    draw(dom, f, ctx) {
      const SYM = ["7", "★", "♦", "●"];
      ctx.save();
      const w = 74, gap = 14;
      const total = dom.p.reels * w + (dom.p.reels - 1) * gap;
      let x = 640 - total / 2;
      for (let i = 0; i < dom.p.reels; i++) {
        const stopped = dom.s.stopped[i] !== null;
        const sym = stopped ? SYM[dom.s.stopped[i]] : SYM[Math.floor(dom.s.spin[i]) % dom.p.symbols];
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "rgba(8,6,16,0.85)";
        ctx.fillRect(x, 120, w, 88);
        ctx.strokeStyle = stopped ? "#ffd35a" : dom.color;
        ctx.lineWidth = 3;
        ctx.strokeRect(x, 120, w, 88);
        ctx.fillStyle = stopped ? "#ffd35a" : "#fff";
        ctx.font = "900 46px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.globalAlpha = stopped ? 1 : 0.75;
        ctx.fillText(sym, x + w / 2, 166);
        x += w + gap;
      }
      ctx.restore();
      hint(ctx, dom.s.resolved ? "REELS SETTLED" : "SPECIAL — STOP A REEL", dom.color);
    },
  },

  // DAGON — Horizon of the Captivating Skandha. A sunny tropical shore with an
  // ocean that does not end, and inside it his shikigami do not travel to their
  // target: they are simply already there. That is the domain's sure-hit, and it
  // is the whole reason the fight against him was unwinnable from the inside.
  //
  // Automatic: fish bite on a timer, no aiming, no dodging — they soak the
  // victim as they go, which is what the rest of his kit is built around.
  // SPECIAL: Death Swarm, the endless surge he used to blind Naobito's defence.
  captivatingSkandha: {
    init: () => ({ bite: 0, cd: 0 }),
    update(dom, f, dt) {
      dom.s.cd = Math.max(0, dom.s.cd - dt);
      tick(dom, "bite", dom.p.biteTick, () => {
        for (const t of sureHitFoesOf(f)) {
          if (t.invuln > 0) continue;
          t.damage = Math.min(999, t.damage + dom.p.biteDmg);
          t.hitstun = Math.max(t.hitstun, 0.1);
          applyStatus("drench", f, t);
          burst(t.x + rand(-50, 50), t.y - rand(30, 130), dom.color, 7, 0.8);
          popup(t.x, t.y - 150, `${dom.p.biteDmg}%`, dom.color, 13);
        }
        playSfx("slash", 0.28, 1.7);
      });
    },
    input(dom, f, input) {
      if (!input.specialP || dom.s.cd > 0) return false;
      const opp = opponentOf(f);
      if (!opp) return false;
      dom.s.cd = dom.p.surgeCd;
      popup(f.x, f.y - 186, "DEATH SWARM", dom.color, 22);
      playSfx("blast", 0.9, 0.7);
      state.camera.shake = Math.max(state.camera.shake, 10);
      burst(opp.x, opp.y - 100, dom.color, 40, 1.6);
      ring(opp.x, opp.y - 100, dom.color, 200);
      applyHit(f, opp, {
        dmg: dom.p.surgeDmg, baseKb: dom.p.surgeBase, growth: dom.p.surgeGrowth,
        angle: 0.5, label: "DEATH SWARM", sfx: "blast",
        effect: "drench", unblockable: true, heavy: true,
      }, "script");
      return true;
    },
    draw(dom, f, ctx) {
      const g = GROUND();
      // the shoreline: a shallow sea lying over the stage floor
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = "#17537f";
      ctx.fillRect(0, g - 8, 1280, 210);
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "#7fc9ec";
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const y = g + 2 + i * 16;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(340, y - 10 * Math.sin(dom.t * 2.2 + i), 940, y + 10 * Math.cos(dom.t * 1.9 + i), 1280, y);
        ctx.stroke();
      }
      // fish circling the victim — the domain's threat, made visible
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = dom.color;
      for (const t of foesOf(f)) {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + dom.t * 2.1;
          const x = t.x + Math.cos(a) * 120;
          const y = t.y - 90 + Math.sin(a) * 60;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(a + Math.PI / 2);
          ctx.beginPath();
          ctx.ellipse(0, 0, 6, 16, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();
      hint(ctx, dom.s.cd > 0 ? "THE SHOAL IS REGATHERING"
                             : "SPECIAL — DEATH SWARM (THEY CANNOT BE MISSED)", dom.color);
    },
  },

  // YUTA — Authentic Mutual Love. Rika is whole inside it: constant healing,
  // and SPECIAL commands a bite.
  mutualLove: {
    init: () => ({ cd: 0 }),
    update(dom, f, dt) {
      dom.s.cd = Math.max(0, dom.s.cd - dt);
      f.damage = Math.max(0, f.damage - dom.p.healPerSec * dt);
      if (Math.random() < 0.2) burst(f.x + rand(-40, 40), f.y - rand(40, 150), dom.color, 2, 0.4);
    },
    input(dom, f, input) {
      if (!input.specialP || dom.s.cd > 0) return false;
      const opp = opponentOf(f);
      if (!opp) return false;
      dom.s.cd = dom.p.biteCd;
      burst(opp.x, opp.y - 100, dom.color, 30, 1.5);
      ring(opp.x, opp.y - 100, dom.color, 170);
      playSfx("slashHeavy", 0.95, 0.8);
      state.camera.shake = Math.max(state.camera.shake, 9);
      applyHit(f, opp, {
        dmg: dom.p.biteDmg, baseKb: dom.p.biteBase, growth: dom.p.biteGrowth,
        angle: 0.5, label: "RIKA", sfx: "blast", unblockable: true, heavy: true,
      }, "script");
      return true;
    },
    draw(dom, f, ctx) {
      const img = getImage("summon:rika");
      if (img) {
        const h = 330;
        const w = img.width * h / img.height;
        ctx.save();
        ctx.translate(f.x - f.facing * 70, f.y + 20);
        ctx.scale(f.facing > 0 ? -1 : 1, 1);
        ctx.globalAlpha = 0.5 + 0.12 * Math.sin(dom.t * 3);
        ctx.shadowColor = dom.color;
        ctx.shadowBlur = 26;
        ctx.drawImage(img, -w / 2, -h, w, h);
        ctx.restore();
      }
      hint(ctx, dom.s.cd > 0 ? "RIKA IS RECOVERING" : "SPECIAL — SEND RIKA", dom.color);
    },
  },
};

function resolveReels(dom, f) {
  const [a, b, c] = dom.s.stopped;
  const jackpot = a === b && b === c;
  const pair = !jackpot && (a === b || b === c || a === c);
  if (jackpot) {
    banner("JACKPOT!!", "#ffd35a", { y: 250, size: 56, life: 1.8 });
    state.screenFlash = { color: "#ffd35a", life: 0.4, maxLife: 0.4 };
    state.camera.shake = Math.max(state.camera.shake, 18);
    state.slowMo = Math.max(state.slowMo, 0.3);
    f.damage = 0;
    applyInstall(f, {
      t: dom.p.jackpotDur, label: "JACKPOT", color: "#ff62cf",
      healPerSec: 3.2, armor: true, dmgMul: 1.35, speedMul: 1.15,
      aura: "effect:aura_pink",
    }, 2);
    playSfx("ult", 1);
  } else if (pair) {
    banner("TWO OF A KIND", "#ffd35a", { y: 250, size: 34, life: 1.2 });
    applyInstall(f, { t: 5, label: "HOT STREAK", color: "#ff62cf", dmgMul: 1.18 }, 2);
    f.damage = Math.max(0, f.damage - 12);
  } else {
    banner("NO MATCH", "#9aa4c0", { y: 250, size: 30, life: 1.0 });
    f.damage = Math.max(0, f.damage - 4);
  }
}

/** One-line prompt telling the player what the domain's live button does.
 *  Drawn low so it never sits under the HUD or the domain banner. */
function hint(ctx, text, color) {
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.font = "800 17px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width + 34;
  ctx.fillStyle = "rgba(4,6,14,0.72)";
  ctx.fillRect(640 - w / 2, 636, w, 32);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(640 - w / 2, 636, w, 32);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, 640, 653);
  ctx.restore();
}
