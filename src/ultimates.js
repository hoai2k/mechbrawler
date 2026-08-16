// Ultimate attacks. Each character's `ultimate.type` maps to a director here.
// An ultimate costs the FULL bar (ULT_METER_COST) and is the cinematic
// centrepiece of a kit — the one thing a full Energy bar buys (Q3 in
// docs/mech-conversion-plan.md).

import { state } from "./state.js";
import { clamp, sign, rand } from "./utils.js";
// Scaled spawns: kit literals are authored for the reference body and sized
// to the caster here — see combat.js spawnMeleeScaled.
import { spawnMeleeScaled as spawnMelee, spawnProjectileScaled as spawnProjectile, opponentOf, applyHit, hurtbox, ownerStick, debugShape } from "./combat.js";
import { burst, dust, ring, popup, banner } from "./particles.js";
import { applyInstall, spokenCast } from "./specials.js";
import { spawnSummon } from "./summons.js";
import { playSfx, playGrunt, moveCallFor, spokenLead } from "./audio.js";
import { steelInstallFx } from "./fx.js";
import { rumbleEvent } from "./rumble.js";
import { circleRectOverlap } from "./utils.js";
import { ULT_METER_COST, METER_MAX } from "./constants.js";
import { getImage } from "./assets.js";
import { sharedAdjust } from "./shared_sprites.js";
import { isFoe } from "./teams.js";

// The two halves of an ultimate's opening. They fire on the same frame for the
// 26 fighters with nothing to say, and a spoken line pushes them apart: the
// announcement is what the fighter is DOING, the impact is what it DOES.
//
// `name` is the ultimate's own name, which is also how MOVE_CALL keys a spoken
// line — so a fighter with one says it here instead of grunting.
function announce(f, name, color) {
  banner(name, color, { y: 210, size: 46, life: 1.5 });
  return playGrunt(f.charKey, name);   // the handle, so the line can be cut
}

function impact(f, color) {
  state.slowMo = Math.max(state.slowMo, 0.45);
  state.screenFlash = { color, life: 0.32, maxLife: 0.32 };
  playSfx("ult", 1);
  state.camera.shake = Math.max(state.camera.shake, 9);
  ring(f.x, f.y - 90, color, 190);
  rumbleEvent(f, "ult"); // a low swell under the slow-mo
}

function beginUltAction(f, dur, opts = {}) {
  f.action = { kind: "ult", t: 0, dur, anim: "ult", lockMovement: true, uninterruptible: true, ...opts };
  f.animTime = 0;
  f.animKey = "ult";
  f.invuln = Math.max(f.invuln, Math.min(dur + 0.1, 1.2));
}

/** Does this actor own every pose anything animating it could ask for?
 *  Always yes now: an actor is a mech rig, and every rig carries the full
 *  universal clip set — the sprite-era "half-delivered sheet" failure this
 *  guarded against cannot happen. Kept as the seam (both callers still ask)
 *  so a future actor type with real gaps has somewhere to say so. */
export function actorPosesReady(actorKey) {
  return true;
}

// A transform only runs when it is switched on AND its actor's art is complete.
export function transformReady(cfg) {
  if (!cfg?.enabled) return false;
  return actorPosesReady(cfg.actor);
}

// Matches the special path: the hold outlives its event by a few frames so the
// action cannot expire on the frame the move is due.
const SPOKEN_HOLD_TAIL = 0.1;

export function performUltimate(f) {
  const ult = f.char.ultimate;
  if (!ult) return;
  // The whole bar. Firing this is choosing it over a domain, not a step on the
  // way to one.
  const color = ult.p.color || f.char.theme;
  const lineEl = announce(f, ult.name, color);

  // An ultimate with a spoken line is introduced by it, the same way a domain
  // is: the fighter holds the ult pose for the call and the move goes off near
  // the end of it. Also like a domain, the wind-up is interruptible and grants
  // no invulnerability, and **the bar is not spent until the move fires** — an
  // ultimate shouted down mid-sentence can be shouted again.
  const call = moveCallFor(f.charKey, ult.name);
  const lead = spokenLead(call);
  if (lead > 0) {
    f.action = {
      kind: "ult", t: 0, dur: lead + SPOKEN_HOLD_TAIL, anim: "ult",
      lockMovement: true, events: [], ...spokenCast(f, lineEl, call),
    };
    f.animTime = 0;
    f.animKey = "ult";
    f.action.events.push({ at: lead, fn: () => {
      if (f.dead || f.respawnTimer > 0 || state.phase !== "playing") return;
      f.meter = Math.max(0, f.meter - ULT_METER_COST);
      impact(f, color);
      DIRECTORS[ult.type](f, ult.p, ult);
    } });
    return;
  }
  f.meter = Math.max(0, f.meter - ULT_METER_COST);
  impact(f, color);
  DIRECTORS[ult.type](f, ult.p, ult);
}

/**
 * One egg of a staged clutch (Saurion's RAPTOR PACK).
 *
 * It is a `kind: "summon"` entity on purpose: that is the one thing on this
 * stage the combat layer already knows how to shoot at (combat.js
 * enemySummons/summonBox), so an egg is breakable by every attack in the game
 * without a second targeting system. Break it and `hatch` never runs — the
 * pack-mate inside it is gone. Let it sit and it opens on its own clock, one
 * egg at a time, which is what makes three raptors an event rather than a wall.
 */
function spawnEgg(f, p, offsetX, hatchAt, hatch) {
  const cfg = p.eggs;
  const gy = state.platforms[0]?.y ?? 568;
  const x = clamp(f.x + offsetX, 110, 1170);
  const egg = {
    kind: "summon", id: `${p.id}:egg`, owner: f, t: 0, dead: false,
    intangible: false, hurtT: 0, hatched: false,
    hp: cfg.hp ?? 34,
    x, y: gy,
    hitW: 76, hitH: 84,
    // Broken by the enemy: the counterplay, and it has to be loud enough that
    // whoever did it knows it worked.
    damage(amount) {
      if (this.dead) return false;
      this.hp -= amount;
      this.hurtT = 0.12;
      burst(this.x, this.y - 40, cfg.color || p.color, 8, 0.6);
      if (this.hp > 0) return false;
      this.dead = true;
      popup(this.x, this.y - 120, "EGG BROKEN", "#ffffff", 20);
      burst(this.x, this.y - 40, p.color, 26, 1.1);
      ring(this.x, this.y - 40, p.color, 90);
      playSfx("blast", 0.6, 1.2);
      return true;
    },
    update(dt) {
      this.t += dt;
      if (this.hurtT > 0) this.hurtT -= dt;
      if (this.t >= hatchAt) {
        this.dead = true;
        this.hatched = true;
        burst(this.x, this.y - 40, p.color, 22, 1);
        ring(this.x, this.y - 40, p.color, 80);
        hatch();
      }
    },
    draw(ctx) {
      const img = cfg.sprite ? getImage(cfg.sprite) : null;
      // Rocking harder the closer it is to opening — the tell that a body is
      // about to be on the board, and the timer on the counterplay.
      const k = clamp(this.t / hatchAt, 0, 1);
      const tilt = Math.sin(this.t * (5 + k * 12)) * (0.05 + k * 0.16);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(tilt);
      ctx.globalAlpha = this.hurtT > 0 ? 0.6 : 1;
      if (img) {
        const h = cfg.spriteH || 130;
        const w = img.width * h / img.height;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 14;
        ctx.drawImage(img, -w / 2, -h, w, h);
      } else {
        ctx.fillStyle = p.color;
        ctx.globalAlpha *= 0.85;
        ctx.beginPath();
        ctx.ellipse(0, -46, 34, 46, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
  };
  state.entities.push(egg);
  return egg;
}

/**
 * A phantom body running alongside a rampage (Rhino's STAMPEDE).
 *
 * Deliberately not a summon: it cannot be killed, it does not hunt, and it is
 * over when the ult is. It is the same charge, offset — one lane of a wall.
 */
function spawnCharger(f, p, total, offset) {
  state.entities.push({
    owner: f, t: 0, dead: false, dir: f.facing, x: clamp(f.x + offset, 130, 1150),
    y: f.y, hitCd: new Map(),
    update(dt) {
      this.t += dt;
      if (this.t >= total || f.dead) { this.dead = true; return; }
      this.y = f.y;
      this.x += this.dir * p.speed * dt;
      if ((this.dir === 1 && this.x > 1150) || (this.dir === -1 && this.x < 130)) {
        this.dir *= -1;
        dust(this.x, this.y, 10);
      }
      for (const t of state.fighters) {
        if (!isFoe(f, t) || t.dead || t.respawnTimer > 0) continue;
        if ((this.hitCd.get(t) || 0) > state.matchTime) continue;
        if (Math.abs(t.x - this.x) < 110 && Math.abs(t.y - this.y) < 130) {
          this.hitCd.set(t, state.matchTime + 0.5);
          applyHit(f, t, {
            dmg: p.dmg, baseKb: p.base, growth: p.growth, angle: 0.6,
            label: p.label, sfx: "punch", unblockable: true, heavy: true,
          }, "script");
        }
      }
      if (Math.random() < dt * 12) dust(this.x - this.dir * 40, this.y, 4);
    },
    draw(ctx) {
      // A ghost of the charger: the read is "there are more of him", and a
      // solid second body would only be confused for the one you can punish.
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y - 80, 74, 84, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 4;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(this.x - this.dir * (40 + i * 34), this.y - 30 - i * 8);
        ctx.lineTo(this.x - this.dir * (90 + i * 34), this.y - 30 - i * 8);
        ctx.stroke();
      }
      ctx.restore();
    },
  });
}

const DIRECTORS = {
  // A massive erasing beam that crosses the stage (Tritone — TSUNAMI).
  beam(f, p) {
    beginUltAction(f, 0.9);
    state.entities.push({
      owner: f, t: 0, dead: false,
      update(dt) {
        this.t += dt;
        if (this.t > 0.55 && !this.fired) {
          this.fired = true;
          spawnProjectile(f, {
            speed: 860, ox: 90, oy: -96, r: p.width / 2, dur: p.duration,
            dmg: p.dmg, base: p.base, growth: p.growth, angle: 0.4,
            color: p.color, pierce: true, unblockable: true,
            clearsProjectiles: true, label: "Hollow Purple",
            fxRing: 10, // erasure shedding rings as it crosses the stage
            sprite: p.sprite, spriteH: p.spriteH,
          });
          playSfx("blast", 1, 0.7);
          state.camera.shake = Math.max(state.camera.shake, 14);
          state.slowMo = Math.max(state.slowMo, 0.2);
        }
        if (this.t > 0.9) this.dead = true;
      },
      draw(ctx) {
        if (this.t < 0.55) {
          const g = Math.min(1, this.t / 0.55);
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.75;
          const cx = f.x + f.facing * 90;
          const cy = f.y - 96;
          const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 20 + g * 70);
          grad.addColorStop(0, "#ffffff");
          grad.addColorStop(0.5, p.color);
          grad.addColorStop(1, "rgba(181,108,255,0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(cx, cy, 20 + g * 70, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      },
    });
  },

  // Summon ultimates — a pack-mate dropped onto the stage as its own actor,
  // hunting with its own AI while the owner keeps fighting (Fenrir WILD HUNT,
  // Saurion RAPTOR PACK, Jerry FLEA CIRCUS). The right stick takes the reins
  // if the player would rather drive it than let it hunt.
  summon(f, p) {
    beginUltAction(f, 0.9);
    // The owner's half of the ritual: only the label and the guard.
    applyInstall(f, { t: p.duration, label: p.label, color: p.color, dmgTakenMul: p.selfDamageMul }, 2);
    const opp = opponentOf(f);
    const dir = opp ? sign(opp.x - f.x) || 1 : 1;
    // A pack, not a pet. docs/characters.md caps every summon ult at 2-4 bodies
    // (down from Mech Mayhem's twenty): each one bigger, legible, and worth
    // tracking on a screen two platforms wide. `count` is the kit's own number.
    const count = clamp(Math.round(p.count ?? 1), 1, 4);
    // Spread along the line between the owner and the fight, so three wolves
    // arrive as a line abreast rather than three bodies in one silhouette.
    const spotFor = (i) => dir * (150 + i * 130);
    const drop = (i) => spawnSummon(f, {
      label: p.label,
      ...p,
      // Animated from the actor's own set where one exists; otherwise the
      // summon falls back to `p.sprites`, and past that the procedural body.
      actor: p.actor && actorPosesReady(p.actor) ? p.actor : null,
      // Between the owner and whoever they are fighting, facing the fight.
      offsetX: spotFor(i),
      backOff: 0,
      // Every body of one cast shares the cap, so the pack does not dismiss
      // itself as it lands.
      maxActive: Math.max(p.maxActive || 1, count),
    });

    // THE EGG STAGING (Saurion's RAPTOR PACK) — the best idea in the upstream
    // ult, kept. The clutch warps in as breakable props: each egg has hit
    // points, the ENEMY can crack one before it opens, and they hatch one at a
    // time so the pack arrives as a threat you can still answer. Any kit that
    // declares `eggs` gets it; nothing else pays for it.
    if (p.eggs) {
      for (let i = 0; i < count; i++) spawnEgg(f, p, spotFor(i), p.eggs.hatchAt + i * p.eggs.hatchGap, () => drop(i));
    } else {
      for (let i = 0; i < count; i++) drop(i);
    }
    state.camera.shake = Math.max(state.camera.shake, 10);
  },

  // A falling mass onto the opponent (Titanus — METEOR BREAKER).
  meteor(f, p) {
    beginUltAction(f, 1.0);
    const opp = opponentOf(f);
    const tx = clamp(opp ? opp.x : f.x + f.facing * 300, 160, 1120);
    state.entities.push({
      owner: f, t: 0, dead: false, impactAt: p.fallTime + 0.5, exploded: false, burnT: 0,
      update(dt) {
        this.t += dt;
        if (!this.exploded && this.t >= this.impactAt) {
          this.exploded = true;
          playSfx("blast", 1, 0.6);
          state.camera.shake = Math.max(state.camera.shake, 18);
          state.slowMo = Math.max(state.slowMo, 0.25);
          state.screenFlash = { color: "#ff7a2f", life: 0.3, maxLife: 0.3 };
          const groundY = state.platforms[0]?.y ?? 568;
          burst(tx, groundY - 40, "#ff7a2f", 70, 2.2);
          ring(tx, groundY - 40, "#ffd35a", 260);
          debugShape({ x: tx, y: groundY - 40, r: p.r });
          for (const t of state.fighters) {
            if (!isFoe(f, t) || t.dead || t.respawnTimer > 0) continue;
            if (circleRectOverlap(tx, groundY - 40, p.r, hurtbox(t))) {
              applyHit(f, t, {
                dmg: p.dmg, baseKb: p.base, growth: p.growth, angle: 0.9,
                label: "MAXIMUM: METEOR", sfx: "blast", unblockable: true,
                effect: "burn", heavy: true,
              }, "script");
            }
          }
        }
        if (this.exploded) {
          this.burnT += dt;
          if (this.burnT > 0.4) {
            this.burnT = 0;
            const groundY = state.platforms[0]?.y ?? 568;
            for (const t of state.fighters) {
              if (!isFoe(f, t) || t.dead || t.respawnTimer > 0 || t.invuln > 0) continue;
              if (Math.abs(t.x - tx) < p.r && Math.abs(t.y - groundY) < 60) {
                t.damage = Math.min(999, t.damage + 1.6);
                burst(t.x, t.y - 60, "#ff7a2f", 6, 0.5);
              }
            }
          }
          if (this.t >= this.impactAt + p.burnField) this.dead = true;
        }
      },
      draw(ctx) {
        const groundY = state.platforms[0]?.y ?? 568;
        if (!this.exploded) {
          // warning marker
          ctx.save();
          ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.t * 16);
          ctx.strokeStyle = "#ff7a2f";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(tx, groundY - 4, 90, 16, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
          if (this.t > 0.5) {
            const prog = (this.t - 0.5) / p.fallTime;
            const my = -160 + prog * (groundY - 40 + 160);
            const img = p.sprite ? getImage(p.sprite) : null;
            if (img) {
              const h = p.spriteH || 310;
              const w = img.width * h / img.height;
              // The workbench's placement, read at the draw. A handler that
              // paints its own set piece used to ignore it, which made X/Y and
              // Rotate stored-but-inert for exactly the art nobody can place by
              // eye — a rock falling past the camera.
              const adj = sharedAdjust(p.sprite);
              ctx.save();
              ctx.translate(tx, my);
              if (adj.rot) ctx.rotate(adj.rot);
              ctx.shadowColor = p.color;
              ctx.shadowBlur = 24;
              ctx.drawImage(img, -w / 2 + adj.dx, -h / 2 + adj.dy, w, h);
              ctx.restore();
              return;
            }
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            const grad = ctx.createRadialGradient(tx, my, 10, tx, my, 90);
            grad.addColorStop(0, "#fff3d0");
            grad.addColorStop(0.4, "#ff9a3f");
            grad.addColorStop(1, "rgba(255,90,31,0)");
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(tx, my, 90, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        } else {
          const fade = 1 - (this.t - this.impactAt) / p.burnField;
          ctx.save();
          ctx.globalAlpha = 0.45 * Math.max(0, fade);
          ctx.fillStyle = "#ff5a1f";
          for (let i = -3; i <= 3; i++) {
            const fx = tx + i * (p.r / 3.4);
            const h = 26 + 16 * Math.sin(this.t * 11 + i * 2);
            ctx.beginPath();
            ctx.moveTo(fx - 14, groundY);
            ctx.quadraticCurveTo(fx, groundY - h * 2, fx + 14, groundY);
            ctx.fill();
          }
          ctx.restore();
        }
      },
    });
  },

  // A churning vortex of fire (Vulcan, Wraith, Inferno — the vortex ults).
  vortex(f, p) {
    beginUltAction(f, 0.9);
    state.entities.push({
      owner: f,
      x: f.x + f.facing * 130, y: f.y - 110, t: 0, tick: 0.4, dead: false,
      update(dt) {
        this.t += dt;
        this.x += f.facing * p.speed * dt;
        if (this.t >= p.dur || this.x < -100 || this.x > 1380) {
          this.dead = true;
          debugShape({ x: this.x, y: this.y, r: p.r * 1.3 });
          for (const t of state.fighters) {
            if (!isFoe(f, t) || t.dead || t.respawnTimer > 0) continue;
            if (circleRectOverlap(this.x, this.y, p.r * 1.3, hurtbox(t))) {
              applyHit(f, t, {
                dmg: 16, baseKb: p.finalBase, growth: p.growth * 2, angle: 0.7,
                label: p.label || "VORTEX", sfx: "blast", unblockable: true, heavy: true,
              }, "script");
            }
          }
          burst(this.x, this.y, p.color, 50, 1.8);
          ring(this.x, this.y, p.color, 240);
          return;
        }
        for (const t of state.fighters) {
          if (!isFoe(f, t) || t.dead || t.respawnTimer > 0 || t.hitstun > 0.5) continue;
          const d = Math.hypot(t.x - this.x, (t.y - 90) - this.y);
          if (d < p.pull) {
            t.vx += sign(this.x - t.x) * 780 * dt;
            if (t.y - 90 > this.y) t.vy -= 620 * dt;
          }
        }
        this.tick -= dt;
        if (this.tick <= 0) {
          this.tick = p.tickRate;
          debugShape({ x: this.x, y: this.y, r: p.r });
          for (const t of state.fighters) {
            if (!isFoe(f, t) || t.dead || t.respawnTimer > 0 || t.invuln > 0) continue;
            if (circleRectOverlap(this.x, this.y, p.r, hurtbox(t))) {
              t.damage = Math.min(999, t.damage + p.dmgTick);
              t.hitstun = Math.max(t.hitstun, 0.18);
              burst(t.x, t.y - 90, p.color, 6, 0.7);
              popup(t.x, t.y - 140, `${p.dmgTick}%`, p.color, 14);
            }
          }
        }
      },
      draw(ctx) {
        const img = p.sprite ? getImage(p.sprite) : null;
        if (img) {
          const h = p.spriteH || 250;
          const w = img.width * h / img.height;
          ctx.save();
          ctx.translate(this.x, this.y);
          ctx.rotate(this.t * 0.75);
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 24;
          ctx.drawImage(img, -w / 2, -h / 2, w, h);
          ctx.restore();
          return;
        }
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.t * 7);
        ctx.globalCompositeOperation = "lighter";
        for (let arm = 0; arm < 3; arm++) {
          ctx.rotate((Math.PI * 2) / 3);
          ctx.strokeStyle = arm % 2 ? "#9d7dff" : p.color;
          ctx.lineWidth = 10;
          ctx.beginPath();
          for (let a = 0; a < 2.4; a += 0.2) {
            const rr = 14 + a * (p.r / 2.6);
            ctx.lineTo(Math.cos(a * 2.4) * rr, Math.sin(a * 2.4) * rr);
          }
          ctx.stroke();
        }
        ctx.restore();
      },
    });
  },

  // A stage-wide storm (Tempest — THUNDERFALL).
  tempest(f, p) {
    beginUltAction(f, 0.9);
    state.domainOverlay = { color: p.color, life: p.duration + 0.4, maxLife: p.duration + 0.4, label: "Great Tempest", ownerId: f.id };
    state.entities.push({
      owner: f, t: 0, tick: 0.5, dead: false,
      update(dt) {
        this.t += dt;
        if (this.t >= p.duration) {
          this.dead = true;
          const opp = opponentOf(f);
          if (opp && !opp.dead && opp.respawnTimer <= 0) {
            applyHit(f, opp, {
              dmg: 12, baseKb: p.finalBase, growth: p.growth * 1.6, angle: 1.2,
              label: "GREAT TEMPEST", sfx: "blast", unblockable: true, heavy: true,
            }, "script");
          }
          return;
        }
        const opp = opponentOf(f);
        if (opp && !opp.dead && opp.respawnTimer <= 0) {
          opp.vx += Math.sin(this.t * 5) * 900 * dt;
          if (!opp.grounded) opp.vy -= 300 * dt;
          this.tick -= dt;
          if (this.tick <= 0 && opp.invuln <= 0) {
            this.tick = p.tickRate;
            opp.damage = Math.min(999, opp.damage + p.dmgTick);
            opp.hitstun = Math.max(opp.hitstun, 0.14);
            burst(opp.x + rand(-40, 40), opp.y - rand(30, 130), "#d5d6ff", 5, 0.8);
            popup(opp.x, opp.y - 140, `${p.dmgTick}%`, p.color, 13);
          }
        }
      },
      draw(ctx) {
        const img = p.sprite ? getImage(p.sprite) : null;
        if (img) {
          const h = p.spriteH || 650;
          const w = img.width * h / img.height;
          const sway = Math.sin(this.t * 2.6) * 34;
          ctx.save();
          ctx.translate(640 + sway, 595);
          ctx.globalAlpha = Math.min(0.78, this.t * 1.6) * Math.min(1, (p.duration - this.t) * 3);
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 28;
          ctx.drawImage(img, -w / 2, -h, w, h);
          ctx.restore();
          return;
        }
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        for (let i = 0; i < 8; i++) {
          const yy = ((this.t * 340 + i * 110) % 820) - 60;
          ctx.beginPath();
          ctx.moveTo(0, yy);
          ctx.bezierCurveTo(420, yy - 60 * Math.sin(this.t * 3 + i), 860, yy + 60 * Math.cos(this.t * 2.4 + i), 1280, yy - 30);
          ctx.stroke();
        }
        ctx.restore();
      },
    });
  },

  // Install ultimates — a timed buff worn on the fighter (Colossus — COLOSSAL FORM).
  install(f, p, ult) {
    beginUltAction(f, 0.8);
    if (p.domainSprite) {
      state.domainOverlay = {
        color: p.color, life: p.duration, maxLife: p.duration,
        label: p.label, ownerId: f.id, sprite: p.domainSprite,
      };
    }
    applyInstall(f, {
      t: p.duration, label: p.label, color: p.color,
      speedMul: p.speedMul, dmgMul: p.dmgMul, armor: p.armor,
      unblockable: p.unblockable, healPerSec: p.healPerSec,
      dmgTakenMul: p.dmgTakenMul, aura: p.aura,
    }, 2);
    // Maki's Awakening: power as the absence of glow — speed-lines and dust.
    if (f.char.fxElement === "steel") steelInstallFx(f);
    else burst(f.x, f.y - 90, p.color, 40, 1.6);
    if (p.sprite) {
      state.entities.push({
        owner: f, dead: false,
        update() {
          if (f.dead || !f.installs || f.installs.label !== p.label) this.dead = true;
        },
        draw(ctx) {
          const img = getImage(p.sprite);
          if (!img) return;
          const h = 238;
          const w = img.width * h / img.height;
          ctx.save();
          ctx.translate(f.x - f.facing * 58, f.y + 18);
          ctx.scale(f.facing > 0 ? -1 : 1, 1);
          ctx.globalAlpha = 0.58;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 20;
          ctx.drawImage(img, -w / 2, -h, w, h);
          ctx.restore();
        },
      });
    }
  },

  // Waves erupting across the whole floor (Viper, Glacier, Nullbot — the eruption ults).
  eruption(f, p) {
    beginUltAction(f, 1.0);
    state.entities.push({
      owner: f, t: 0, wave: 0, dead: false,
      update(dt) {
        this.t += dt;
        if (this.wave >= p.waves) { this.dead = true; return; }
        if (this.t >= this.wave * p.waveGap) {
          const groundY = state.platforms[0]?.y ?? 568;
          const originX = f.x;
          const spread = 150 + this.wave * 170;
          for (const dir of [-1, 1]) {
            const px = originX + dir * spread;
            if (px < 100 || px > 1180) continue;
            burst(px, groundY - 60, p.color, 18, 1.1);
            dust(px, groundY, 12);
            for (const t of state.fighters) {
              if (!isFoe(f, t) || t.dead || t.respawnTimer > 0) continue;
              if (Math.abs(t.x - px) < 90 && Math.abs(t.y - groundY) < 140) {
                applyHit(f, t, {
                  dmg: p.dmg, baseKb: p.base, growth: p.growth, angle: 1.1,
                  label: "Flowering Forest", sfx: "blast", effect: "rootSnare",
                }, "script");
              }
            }
          }
          playSfx("blast", 0.7, 0.85);
          state.camera.shake = Math.max(state.camera.shake, 7);
          this.wave += 1;
        }
      },
      draw(ctx) {
        const groundY = state.platforms[0]?.y ?? 568;
        const roots = p.sprite ? getImage(p.sprite) : null;
        ctx.save();
        ctx.globalAlpha = roots ? 0.85 : 0.5;
        ctx.fillStyle = p.color;
        for (let w = 0; w < this.wave; w++) {
          const spread = 150 + w * 170;
          for (const dir of [-1, 1]) {
            const px = f.x + dir * spread;
            if (px < 100 || px > 1180) continue;
            const age = this.t - w * p.waveGap;
            const h = Math.max(0, 130 * (1 - age * 0.8));
            if (h <= 4) continue;
            if (roots) {
              const drawH = h * 1.65;
              const drawW = roots.width * drawH / roots.height;
              const adj = sharedAdjust(p.sprite);
              // About the ground point each wave stands on, so a tilt leans the
              // whole column rather than sliding it off its own eruption.
              ctx.save();
              if (adj.rot) {
                ctx.translate(px, groundY);
                ctx.rotate(adj.rot);
                ctx.translate(-px, -groundY);
              }
              ctx.drawImage(roots, px - drawW / 2 + adj.dx, groundY - drawH + adj.dy, drawW, drawH);
              ctx.restore();
              continue;
            }
            ctx.beginPath();
            ctx.moveTo(px - 36, groundY);
            ctx.lineTo(px - 10, groundY - h * 0.8);
            ctx.lineTo(px, groundY - h);
            ctx.lineTo(px + 12, groundY - h * 0.7);
            ctx.lineTo(px + 36, groundY);
            ctx.closePath();
            ctx.fill();
          }
        }
        ctx.restore();
      },
    });
  },

  // A homing flechette volley with a marked finisher (Titanus — SIEGE PROTOCOL).
  nailstorm(f, p, ult) {
    beginUltAction(f, 1.0);
    state.entities.push({
      owner: f, t: 0, volley: 0, dead: false,
      update(dt) {
        this.t += dt;
        const opp = opponentOf(f);
        if (this.volley < p.volleys && this.t >= 0.3 + this.volley * 0.16) {
          this.volley += 1;
          if (opp && !opp.dead) {
            const fromAbove = this.volley % 2 === 0;
            spawnProjectile(f, {
              x: opp.x + rand(-120, 120), y: fromAbove ? -30 : f.y - 90,
              dir: 1, speed: 0, vy: fromAbove ? 980 : 0,
              r: 16, dur: 1.1, dmg: p.dmg, base: p.base, growth: p.growth,
              angle: fromAbove ? 1.2 : 0.4, color: p.color, effect: "nailMark",
              label: "Nail Storm", sprite: p.volleySprite || "effect:siege_shell",
              spriteH: p.volleySpriteH || 58,
            });
            if (!fromAbove) {
              spawnProjectile(f, {
                dir: sign(opp.x - f.x) || f.facing, speed: 900, ox: 60, oy: -96,
                r: 16, dur: 0.8, dmg: p.dmg, base: p.base, growth: p.growth,
                angle: 0.4, color: p.color, effect: "nailMark", label: "Nail Storm",
                sprite: p.volleySprite || "effect:siege_shell", spriteH: p.volleySpriteH || 58,
              });
            }
            playSfx("slash", 0.6, 1.3);
          }
        }
        if (this.volley >= p.volleys && this.t >= 0.3 + p.volleys * 0.16 + 0.5 && !this.finished) {
          this.finished = true;
          this.dead = true;
          if (opp && !opp.dead && opp.respawnTimer <= 0) {
            const marks = Math.max(1, opp.statuses.nailMarks);
            applyHit(f, opp, {
              dmg: p.finisherDmg + marks * 2, baseKb: p.finisherBase + marks * 30,
              growth: 9, angle: 0.6, label: ult.p.label, sfx: "blast",
              unblockable: true, heavy: true,
            }, "script");
            opp.statuses.nailMarks = 0;
            ring(opp.x, opp.y - 90, "#b56cff", 220);
          }
        }
      },
      draw(ctx) {
        const img = p.sprite ? getImage(p.sprite) : null;
        if (!img || this.t > 1.75) return;
        const h = p.spriteH || 290;
        const w = img.width * h / img.height;
        const travel = Math.min(1, this.t / 1.45);
        const x = f.facing > 0 ? -w / 2 + travel * (1280 + w) : 1280 + w / 2 - travel * (1280 + w);
        ctx.save();
        ctx.translate(x, 310);
        ctx.scale(f.facing > 0 ? -1 : 1, 1);
        ctx.globalAlpha = Math.min(0.82, this.t * 3) * Math.min(1, (1.75 - this.t) * 4);
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 20;
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.restore();
      },
    });
  },

  // Inumaki — a stage-buckling scream.
  shout(f, p, ult) {
    beginUltAction(f, 1.1);
    spawnMelee(f, {
      delay: 0.45, dur: 0.2, ox: p.ox, oy: p.oy, w: p.w, h: p.h,
      dmg: p.dmg, base: p.base, growth: p.growth, angle: p.angle,
      label: ult.name, sfx: "blast", unblockable: true, heavy: true,
    });
    state.entities.push({
      owner: f, t: 0, dead: false,
      update(dt) {
        this.t += dt;
        if (this.t > 0.45 && !this.boomed) {
          this.boomed = true;
          state.camera.shake = Math.max(state.camera.shake, 16);
          state.screenFlash = { color: "#d7d9e7", life: 0.25, maxLife: 0.25 };
          ring(f.x, f.y - 100, "#d7d9e7", 320);
          playSfx("blast", 1, 0.6);
          f.throatLock = 4; // his throat pays the price
          popup(f.x, f.y - 180, "*cough cough*", "#ff8a8a", 16);
        }
        if (this.t > 1.0) this.dead = true;
      },
      draw(ctx) {
        if (this.t > 0.45) {
          const a = 1 - (this.t - 0.45) / 0.55;
          const img = p.sprite ? getImage(p.sprite) : null;
          if (img) {
            const h = (p.spriteH || 330) * (0.65 + (this.t - 0.45) * 1.2);
            const w = img.width * h / img.height;
            const adj = sharedAdjust(p.sprite);
            ctx.save();
            ctx.translate(f.x + f.facing * w * 0.3, f.y - 105);
            ctx.scale(f.facing > 0 ? -1 : 1, 1);
            // Inside the mirrored frame, so the nudge follows the drawing
            // rather than reversing when the fighter turns round.
            if (adj.rot) ctx.rotate(adj.rot);
            ctx.globalAlpha = Math.max(0, a) * 0.85;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 24;
            ctx.drawImage(img, -w / 2 + adj.dx, -h / 2 + adj.dy, w, h);
            ctx.restore();
            return;
          }
          ctx.save();
          ctx.globalAlpha = a * 0.5;
          ctx.strokeStyle = "#d7d9e7";
          ctx.lineWidth = 6;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(f.x, f.y - 100, 80 + i * 90 + (this.t - 0.45) * 700, -0.9, 0.9);
            ctx.stroke();
          }
          ctx.restore();
        }
      },
    });
  },

  // Panda — Triceratops stampede.
  rampage(f, p, ult) {
    const total = p.passes * 1.0;
    beginUltAction(f, total, { lockMovement: true });
    // A WALL of rhino (docs/characters.md STAMPEDE: three of him, shoulder to
    // shoulder). The real body charges; `copies - 1` phantoms run the same lane
    // beside him with their own hitboxes, so the thing that has to be JUMPED is
    // as wide as the move claims. Data-driven off the kit — an ult with no
    // `copies` is the single charger it always was (Konga's APEX POUND).
    for (let i = 1; i < clamp(Math.round(p.copies ?? 1), 1, 4); i++) {
      spawnCharger(f, p, total, (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 132);
    }
    applyInstall(f, { t: total, label: "TRICERATOPS", color: p.color, armor: true, dmgMul: 1.1, sprite: p.sprite }, 2);
    f.invuln = Math.max(f.invuln, 0.5);
    state.entities.push({
      owner: f, t: 0, pass: 0, dir: f.facing, dead: false, hitCd: new Map(),
      update(dt) {
        this.t += dt;
        if (this.t >= total || f.dead || f.respawnTimer > 0) {
          this.dead = true;
          if (f.action?.kind === "ult") f.action = null;
          return;
        }
        f.vx = this.dir * p.speed;
        f.facing = this.dir;
        // Turn at the edge of the platform he is ON, not at the stage bounds:
        // a stampede that charges off the end of the main platform just dumps
        // Panda into the blast zone mid-ultimate. The platform is found by
        // where his feet are, so a rampage started on a side platform paces
        // that platform instead.
        let left = 130;
        let right = 1150;
        if (f.grounded) {
          const plat = state.platforms.find((q) =>
            !q.ghost && Math.abs(q.y - f.y) <= 2 && f.x >= q.x - 30 && f.x <= q.x + q.w + 30);
          if (plat) {
            left = Math.max(left, plat.x + 45);
            right = Math.min(right, plat.x + plat.w - 45);
          }
        }
        if ((this.dir === 1 && f.x > right) || (this.dir === -1 && f.x < left)) {
          this.dir *= -1;
          this.pass += 1;
          dust(f.x, f.y, 16);
          state.camera.shake = Math.max(state.camera.shake, 6);
        }
        for (const t of state.fighters) {
          if (!isFoe(f, t) || t.dead || t.respawnTimer > 0) continue;
          const cd = this.hitCd.get(t) || 0;
          if (cd > state.matchTime) continue;
          if (Math.abs(t.x - f.x) < 110 && Math.abs(t.y - f.y) < 130) {
            this.hitCd.set(t, state.matchTime + 0.5);
            applyHit(f, t, {
              dmg: p.dmg, baseKb: p.base, growth: p.growth, angle: 0.6,
              label: "TRICERATOPS", sfx: "punch", unblockable: true, heavy: true,
            }, "script");
          }
        }
        if (Math.random() < dt * 14) dust(f.x - this.dir * 40, f.y, 5);
      },
      draw(ctx) {
        // The delivered ground-wave art (Konga's APEX POUND shockwave front)
        // rides just behind the charge; the speed lines stay underneath.
        const wave = p.waveSprite ? getImage(p.waveSprite) : null;
        if (wave) {
          const h = p.waveSpriteH || 150;
          const w = wave.width * h / wave.height;
          ctx.save();
          ctx.translate(f.x - this.dir * 60, f.y + 6);
          ctx.scale(this.dir > 0 ? -1 : 1, 1);
          ctx.globalAlpha = 0.8;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 16;
          ctx.drawImage(wave, -w / 2, -h, w, h);
          ctx.restore();
        }
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4;
        for (let i = 1; i <= 3; i++) {
          ctx.beginPath();
          ctx.moveTo(f.x - this.dir * (40 + i * 34), f.y - 30 - i * 8);
          ctx.lineTo(f.x - this.dir * (90 + i * 34), f.y - 30 - i * 8);
          ctx.stroke();
        }
        ctx.restore();
      },
    });
  },

};
