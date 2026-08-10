// Ultimate attacks. Each character's `ultimate.type` maps to a director here.
// An ultimate costs the FULL bar (ULT_METER_COST) and is the cinematic
// centrepiece of a kit. A Domain Expansion costs the same full bar, so the
// fighters who have one (see domains.js) are choosing between the two every
// time the meter fills.

import { state } from "./state.js";
import { clamp, sign, rand } from "./utils.js";
import { spawnMelee, spawnProjectile, opponentOf, applyHit, hurtbox, ownerStick } from "./combat.js";
import { burst, dust, ring, popup, banner } from "./particles.js";
import { applyInstall } from "./specials.js";
import { spawnSummon } from "./summons.js";
import { TRANSFORM_POSES, TRANSFORM_POSE_ALTERNATIVES } from "./config_transform.js";
import { frameMeta } from "./assets.js";
import { playSfx, playGrunt } from "./audio.js";
import { critFinisherFx, dismantleLatticeFx, steelInstallFx } from "./fx.js";
import { CHAR_FX } from "./config_fx.js";
import { rumbleEvent } from "./rumble.js";
import { circleRectOverlap } from "./utils.js";
import { ULT_METER_COST, METER_MAX } from "./constants.js";
import { getImage } from "./assets.js";
import { isFoe } from "./teams.js";

function cinematic(f, name, color) {
  state.slowMo = Math.max(state.slowMo, 0.45);
  state.screenFlash = { color, life: 0.32, maxLife: 0.32 };
  banner(name, color, { y: 210, size: 46, life: 1.5 });
  playSfx("ult", 1);
  playGrunt(f.charKey);
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

/** Does this actor own every pose anything animating it could ask for? A
 *  half-delivered set would pop holes mid-fight — a missing frame draws
 *  NOTHING — so both callers below use this to fall back to something whole
 *  rather than to a hole. */
export function actorPosesReady(actorKey) {
  const has = (pose) => !!frameMeta(actorKey, pose);
  return TRANSFORM_POSES.every((pose) =>
    has(pose) || (TRANSFORM_POSE_ALTERNATIVES[pose]?.every(has) ?? false));
}

// A transform only runs when it is switched on AND its actor's art is complete.
export function transformReady(cfg) {
  if (!cfg?.enabled) return false;
  return actorPosesReady(cfg.actor);
}

export function performUltimate(f) {
  const ult = f.char.ultimate;
  if (!ult) return;
  // The whole bar. Firing this is choosing it over a domain, not a step on the
  // way to one.
  f.meter = Math.max(0, f.meter - ULT_METER_COST);
  cinematic(f, ult.name, ult.p.color || f.char.theme);
  DIRECTORS[ult.type](f, ult.p, ult);
}

const DIRECTORS = {
  // Gojo — Hollow Purple: a massive erasing mass that crosses the stage.
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

  // Megumi — Mahoraga. He is SUMMONED, not worn: the ritual finishes and the
  // shikigami drops onto the stage as its own actor, walking, jumping and
  // swinging a real move set that its own AI picks (behavior "brawler" in
  // summons.js). Megumi keeps his own body and his own controls and fights
  // beside it — and, like every other summon, the right stick takes the reins
  // if the player would rather drive it than let it hunt.
  //
  // It used to be a transformation (config_transform.js), which put the player
  // in Mahoraga's body but took Megumi off the board; a general who adapts to
  // whatever is in front of him is a character, so he is played as one.
  summon(f, p) {
    beginUltAction(f, 0.9);
    // The install is Megumi's half of the ritual: the shikigami's presence
    // covering him while it is out. Only the label and the guard — the body
    // stays his.
    applyInstall(f, { t: p.duration, label: p.label, color: p.color, dmgTakenMul: p.selfDamageMul }, 2);
    const opp = opponentOf(f);
    const dir = opp ? sign(opp.x - f.x) || 1 : 1;
    spawnSummon(f, {
      label: p.label,
      ...p,
      // Animated from the actor's own sprite set where that set is complete;
      // where it is not, the summon falls back to the single still image in
      // `p.sprites` rather than to a hole in the stage.
      actor: p.actor && actorPosesReady(p.actor) ? p.actor : null,
      // Between Megumi and whoever he is fighting, facing the fight.
      offsetX: dir * 150,
      backOff: 0,
    });
    state.camera.shake = Math.max(state.camera.shake, 10);
  },

  // Jogo — Maximum: Meteor.
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
              ctx.save();
              ctx.translate(tx, my);
              ctx.shadowColor = p.color;
              ctx.shadowBlur = 24;
              ctx.drawImage(img, -w / 2, -h / 2, w, h);
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

  // Geto — Maximum: Uzumaki.
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
          for (const t of state.fighters) {
            if (!isFoe(f, t) || t.dead || t.respawnTimer > 0) continue;
            if (circleRectOverlap(this.x, this.y, p.r * 1.3, hurtbox(t))) {
              applyHit(f, t, {
                dmg: 16, baseKb: p.finalBase, growth: p.growth * 2, angle: 0.7,
                label: "UZUMAKI", sfx: "blast", unblockable: true, heavy: true,
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

  // Momo — Maximum: Great Tempest.
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

  // Install ultimates: Hakari Jackpot, Mahito True Form, Maki Awakening, Yuta Rika.
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
      echoDamage: p.echoDamage, dmgTakenMul: p.dmgTakenMul, aura: p.aura,
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

  // Flurry rushes: Nanami, Toji, Todo.
  flurry(f, p, ult) {
    const opp = opponentOf(f);
    const inRange = opp && !opp.dead && opp.respawnTimer <= 0 && Math.abs(opp.x - f.x) < 640;
    if (!inRange) {
      beginUltAction(f, 0.7);
      f.vx = f.facing * 700;
      spawnMelee(f, {
        delay: 0.1, dur: 0.3, ox: 50, oy: -100, w: 220, h: 120,
        dmg: 14, base: 520, growth: 8, angle: 0.4, label: ult.name, sfx: "slashHeavy", heavy: true,
      });
      f.meter = clamp(f.meter + ULT_METER_COST * 0.5, 0, METER_MAX); // partial refund on a whiffed read
      popup(f.x, f.y - 170, "MISSED THE MARK", "#9aa4c0", 16);
      return;
    }
    const total = p.hits * 0.15 + 0.7;
    beginUltAction(f, total);
    f.invuln = Math.max(f.invuln, total);
    opp.hitstun = Math.max(opp.hitstun, total);
    let i = 0;
    const events = [];
    for (; i < p.hits; i++) {
      events.push({
        at: 0.3 + i * 0.15,
        fn: (self) => {
          const t = opponentOf(self);
          if (!t || t.dead || t.respawnTimer > 0 || t.invuln > 0.3) return;
          const side = p.teleport ? (Math.random() < 0.5 ? -1 : 1) : (self.x < t.x ? -1 : 1);
          self.x = clamp(t.x + side * 70, 60, 1220);
          self.facing = sign(t.x - self.x) || 1;
          t.hitstun = Math.max(t.hitstun, 0.5);
          t.damage = Math.min(999, t.damage + p.dmg);
          t.shakeMag = 5;
          burst(t.x, t.y - 90, ult.p.color, 12, 1);
          // Sukuna's barrage: the world is CUT — thin white slash lines
          // flash across the target with every volley.
          if (p.lattice) dismantleLatticeFx(t.x, t.y - 90, CHAR_FX.dismantleLines);
          popup(t.x + rand(-30, 30), t.y - 120 - rand(0, 40), `${p.dmg}%`, "#ffffff", 16);
          playSfx(Math.random() < 0.5 ? "punch" : "slash", 0.85);
          state.camera.shake = Math.max(state.camera.shake, 5);
          if (p.teleport) burst(self.x, self.y - 80, ult.p.color, 8, 0.7);
        },
      });
    }
    events.push({
      at: 0.3 + p.hits * 0.15 + 0.15,
      fn: (self) => {
        const t = opponentOf(self);
        if (!t || t.dead || t.respawnTimer > 0) return;
        // the full lattice appears as the finisher lands
        if (p.lattice) dismantleLatticeFx(t.x, t.y - 90, CHAR_FX.dismantleFinisher);
        applyHit(self, t, {
          dmg: p.finisherDmg, baseKb: p.finisherBase, growth: p.growth, angle: 0.55,
          label: ult.p.label, sfx: "blast", unblockable: true, heavy: true,
          effect: p.silence ? "silence" : null,
        }, "script");
        if (p.crit) {
          popup(t.x, t.y - 180, p.critLabel ? p.critLabel + "!!" : "7:3!!", p.critColor || "#ffd35a", 30);
          // the Black Flash treatment at reduced strength, in the crit's colour
          critFinisherFx(t.x, t.y - 96, p.critColor || "#ffd35a");
        }
        state.slowMo = Math.max(state.slowMo, 0.3);
      },
    });
    f.action.events = events;
  },

  // Hanami — waves of roots erupt across the whole floor.
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
              ctx.drawImage(roots, px - drawW / 2, groundY - drawH, drawW, drawH);
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

  // Nobara — Deluxe Resonance nail storm.
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
              label: "Nail Storm", sprite: "effect:nail", spriteH: 58,
            });
            if (!fromAbove) {
              spawnProjectile(f, {
                dir: sign(opp.x - f.x) || f.facing, speed: 900, ox: 60, oy: -96,
                r: 16, dur: 0.8, dmg: p.dmg, base: p.base, growth: p.growth,
                angle: 0.4, color: p.color, effect: "nailMark", label: "Nail Storm",
                sprite: "effect:nail", spriteH: 58,
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
            ctx.save();
            ctx.translate(f.x + f.facing * w * 0.3, f.y - 105);
            ctx.scale(f.facing > 0 ? -1 : 1, 1);
            ctx.globalAlpha = Math.max(0, a) * 0.85;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 24;
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
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

  // Choso — Supernova: blood orbs ring the enemy, then all detonate inward.
  supernova(f, p, ult) {
    beginUltAction(f, 1.0);
    const opp = opponentOf(f);
    const cx = clamp(opp && !opp.dead ? opp.x : f.x + f.facing * 300, 140, 1140);
    const cy = opp && !opp.dead ? opp.y - 90 : f.y - 90;
    const orbGap = 0.12;
    state.entities.push({
      owner: f, t: 0, fired: 0, dead: false,
      update(dt) {
        this.t += dt;
        if (this.t <= p.delay) return;
        const target = opponentOf(f);
        const should = Math.min(p.orbs, Math.floor((this.t - p.delay) / orbGap) + 1);
        while (this.fired < should) {
          this.fired += 1;
          playSfx("blast", 0.45, 1.3);
          if (target && !target.dead && target.respawnTimer <= 0 && target.invuln <= 0 &&
              Math.hypot(target.x - cx, (target.y - 90) - cy) < p.radius) {
            target.damage = Math.min(999, target.damage + p.dmgPerOrb);
            target.hitstun = Math.max(target.hitstun, 0.2);
            burst(target.x, target.y - 90, p.color, 8, 0.8);
            popup(target.x, target.y - 140, `${p.dmgPerOrb}%`, p.color, 14);
          }
        }
        if (this.fired >= p.orbs && this.t > p.delay + p.orbs * orbGap + 0.25) {
          this.dead = true;
          burst(cx, cy, p.color, 50, 1.8);
          ring(cx, cy, p.color, 260);
          playSfx("blast", 1, 0.6);
          state.camera.shake = Math.max(state.camera.shake, 14);
          if (target && !target.dead && target.respawnTimer <= 0 &&
              Math.hypot(target.x - cx, (target.y - 90) - cy) < p.radius * 1.1) {
            applyHit(f, target, {
              dmg: p.finalDmg, baseKb: p.finalBase, growth: p.finalGrowth, angle: 0.6,
              label: "SUPERNOVA", sfx: "blast", unblockable: true, heavy: true,
            }, "script");
          }
        }
      },
      draw(ctx) {
        const img = p.sprite ? getImage(p.sprite) : null;
        const windup = Math.min(1, this.t / p.delay);
        ctx.save();
        for (let i = 0; i < p.orbs; i++) {
          if (i < this.fired) continue; // converged already
          const a = (i / p.orbs) * Math.PI * 2 + this.t * 0.8;
          const rr = p.radius * (1.25 - windup * 0.25);
          const ox = cx + Math.cos(a) * rr;
          const oy = cy + Math.sin(a) * rr * 0.6;
          if (img) {
            const h = (p.spriteH || 88) * 0.7;
            const w = img.width * h / img.height;
            ctx.globalAlpha = 0.5 + windup * 0.5;
            ctx.drawImage(img, ox - w / 2, oy - h / 2, w, h);
          } else {
            ctx.globalAlpha = 0.6 + windup * 0.4;
            const grad = ctx.createRadialGradient(ox, oy, 3, ox, oy, 20);
            grad.addColorStop(0, "#ffe0e6");
            grad.addColorStop(1, p.color);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(ox, oy, 18, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      },
    });
  },

  // Mei Mei — Bird Strike: one crow past its limits, then the flock.
  birdstrike(f, p, ult) {
    beginUltAction(f, 0.9);
    state.entities.push({
      owner: f, t: 0, dead: false,
      update(dt) {
        this.t += dt;
        if (this.t > 0.5 && !this.fired) {
          this.fired = true;
          spawnProjectile(f, {
            speed: p.speed, ox: 80, oy: -100, r: p.r, dur: 1.6,
            dmg: p.dmg, base: p.base, growth: p.growth, angle: 0.42,
            color: p.color, pierce: true, unblockable: true,
            label: "BIRD STRIKE", sprite: p.sprite, spriteH: p.spriteH,
          });
          for (let i = 0; i < p.followers; i++) {
            spawnProjectile(f, {
              speed: p.speed * 0.55, ox: 40 - i * 30, oy: -80 - (i % 2) * 60,
              r: 26, dur: 1.8, dmg: p.followerDmg, base: p.followerBase, growth: 5.5,
              angle: 0.38, color: p.color, homing: 120,
              label: "Crow", sprite: "effect:crow", spriteH: 84,
            });
          }
          playSfx("blast", 1, 0.75);
          state.camera.shake = Math.max(state.camera.shake, 12);
          state.slowMo = Math.max(state.slowMo, 0.18);
        }
        if (this.t > 0.9) this.dead = true;
      },
      draw(ctx) {
        if (this.t >= 0.5) return;
        // the flock gathers behind her
        const g = this.t / 0.5;
        ctx.save();
        ctx.globalAlpha = 0.6 * g;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        for (let i = 0; i < 5; i++) {
          const bx = f.x - f.facing * (60 + i * 26) + Math.sin(this.t * 9 + i) * 10;
          const by = f.y - 130 - i * 22;
          ctx.beginPath();
          ctx.arc(bx, by, 10, Math.PI * 0.15, Math.PI * 0.85, true);
          ctx.stroke();
        }
        ctx.restore();
      },
    });
  },

  // Uro — Inverted Sky: the sky folds shut around the enemy and slams them
  // back into the earth.
  skyInvert(f, p, ult) {
    const opp = opponentOf(f);
    if (!opp || opp.dead || opp.respawnTimer > 0 || Math.abs(opp.x - f.x) > p.range) {
      beginUltAction(f, 0.6);
      f.meter = clamp(f.meter + ULT_METER_COST * 0.5, 0, METER_MAX); // partial refund, matching flurry
      popup(f.x, f.y - 170, "THE SKY IS EMPTY", "#9aa4c0", 16);
      return;
    }
    beginUltAction(f, 1.9);
    state.domainOverlay = { color: p.color, life: 1.9, maxLife: 1.9, label: "Inverted Sky", ownerId: f.id };
    opp.hitstun = Math.max(opp.hitstun, 1.7);
    state.entities.push({
      owner: f, t: 0, phase: 0, dead: false,
      update(dt) {
        this.t += dt;
        const t2 = opponentOf(f);
        if (!t2 || t2.dead || t2.respawnTimer > 0) { this.dead = true; return; }
        if (this.phase === 0 && this.t > 0.25) {
          this.phase = 1;
          t2.vy = -1100;
          t2.grounded = false;
          burst(t2.x, t2.y - 90, p.color, 26, 1.2);
          playSfx("whoosh", 1, 0.7);
        }
        if (this.phase === 1) {
          t2.hitstun = Math.max(t2.hitstun, 0.6);
          if (this.t > 0.25 + p.liftTime) {
            this.phase = 2;
            t2.vy = 1500;
            t2.vx = 0;
            state.screenFlash = { color: p.color, life: 0.25, maxLife: 0.25 };
            playSfx("blast", 1, 0.6);
          }
        }
        if (this.phase === 2 && (t2.grounded || this.t > 2.2)) {
          this.dead = true;
          applyHit(f, t2, {
            dmg: p.dmg, baseKb: p.base, growth: p.growth, angle: 0.7,
            label: "INVERTED SKY", sfx: "blast", unblockable: true, heavy: true,
          }, "script");
          state.camera.shake = Math.max(state.camera.shake, 16);
          burst(t2.x, t2.y - 40, p.color, 44, 1.8);
          ring(t2.x, t2.y - 40, p.color, 240);
        }
      },
      draw(ctx) {
        const t2 = opponentOf(f);
        if (!t2) return;
        const img = p.sprite ? getImage(p.sprite) : null;
        ctx.save();
        if (img) {
          const h = (p.spriteH || 260) * (0.7 + Math.min(1, this.t) * 0.5);
          const w = img.width * h / img.height;
          ctx.translate(t2.x, t2.y - 140);
          ctx.rotate(Math.sin(this.t * 3) * 0.15);
          ctx.globalAlpha = 0.8;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 24;
          ctx.drawImage(img, -w / 2, -h / 2, w, h);
        } else {
          // cracked-sky shards closing around the victim
          ctx.globalAlpha = 0.55;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 4;
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + this.t * 1.4;
            const rr = 150 - Math.min(1, this.t / 1.1) * 90;
            const sx = t2.x + Math.cos(a) * rr;
            const sy = t2.y - 90 + Math.sin(a) * rr * 0.8;
            ctx.beginPath();
            ctx.moveTo(sx - 12, sy + 16);
            ctx.lineTo(sx, sy - 18);
            ctx.lineTo(sx + 12, sy + 16);
            ctx.closePath();
            ctx.stroke();
          }
        }
        ctx.restore();
      },
    });
  },

  // Reggie — Grand Contract. The sedan falls onto the main platform, bounces
  // on its suspension with the wheels screaming, and — the moment they bite —
  // launches whichever way Reggie's RIGHT STICK says. Untouched, it charges at
  // the opponent, so ignoring the stick still produces the old move.
  //
  // Anyone it lands on or runs over is knocked FLAT (`knockdown` in applyHit):
  // being hit by a car is not something you flinch through.
  cardrop(f, p, ult) {
    beginUltAction(f, 1.0);
    const opp = opponentOf(f);
    const tx = clamp(opp ? opp.x : f.x + f.facing * 300, 180, 1100);
    const bounceDur = p.bounceDur ?? 0.85;
    state.entities.push({
      owner: f, t: 0, dead: false,
      phase: "falling",             // falling -> bouncing -> driving
      phaseT: 0,
      x: tx, dir: 0,                // dir picked during the bounce
      hit: new Set(),
      update(dt) {
        this.t += dt;
        this.phaseT += dt;
        const groundY = state.platforms[0]?.y ?? 568;

        if (this.phase === "falling" && this.t >= 0.5 + p.fallTime) {
          this.phase = "bouncing";
          this.phaseT = 0;
          playSfx("blast", 1, 0.6);
          state.camera.shake = Math.max(state.camera.shake, 16);
          state.slowMo = Math.max(state.slowMo, 0.22);
          state.screenFlash = { color: p.color, life: 0.25, maxLife: 0.25 };
          burst(tx, groundY - 50, p.color, 60, 2.0);
          ring(tx, groundY - 50, p.color, 240);
          for (const t of state.fighters) {
            if (!isFoe(f, t) || t.dead || t.respawnTimer > 0) continue;
            if (circleRectOverlap(tx, groundY - 50, p.r, hurtbox(t))) {
              this.hit.add(t);
              applyHit(f, t, {
                dmg: p.dmg, baseKb: p.base, growth: p.growth, angle: 0.8,
                label: "LUXURY SEDAN", sfx: "blast", unblockable: true, heavy: true,
                knockdown: true,
              }, "script");
            }
          }
        }

        if (this.phase === "bouncing") {
          // The stick is read for the whole bounce and the LAST push wins, so
          // the player can change their mind right up until traction.
          const stick = ownerStick(f);
          if (stick.x) this.dir = sign(stick.x);
          if (Math.random() < dt * 30) dust(this.x + rand(-70, 70), groundY, 3);
          if (this.phaseT >= bounceDur) {
            this.phase = "driving";
            this.phaseT = 0;
            // No input: charge the opponent, which is what the old move did.
            if (!this.dir) this.dir = opp && !opp.dead ? sign(opp.x - this.x) || f.facing : f.facing;
            playSfx("swingWhiff", 1, 0.55);   // the tyres finally biting
            burst(this.x - this.dir * 110, groundY - 20, p.color, 24, 1.2);
            state.camera.shake = Math.max(state.camera.shake, 8);
          }
        }

        if (this.phase === "driving") {
          this.x += this.dir * p.slideSpeed * dt;
          for (const t of state.fighters) {
            if (!isFoe(f, t) || t.dead || t.respawnTimer > 0 || this.hit.has(t)) continue;
            if (Math.abs(t.x - this.x) < 90 && Math.abs(t.y - groundY) < 130) {
              this.hit.add(t);
              applyHit(f, t, {
                dmg: p.slideDmg, baseKb: p.slideBase, growth: 7.5, angle: 0.5,
                label: "Runaway Sedan", sfx: "blast", heavy: true,
                knockdown: true,
              }, "script");
            }
          }
          if (Math.random() < dt * 10) dust(this.x - this.dir * 60, groundY, 5);
          if (this.phaseT >= p.slideDur || this.x < -160 || this.x > 1440) this.dead = true;
        }
      },
      draw(ctx) {
        const groundY = state.platforms[0]?.y ?? 568;
        const img = p.sprite ? getImage(p.sprite) : null;
        const carH = p.spriteH || 170;
        const carW = img ? img.width * carH / img.height : 300;
        const face = this.dir || f.facing;
        ctx.save();
        if (this.phase === "falling") {
          ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.t * 16);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(tx, groundY - 4, 150, 18, 0, 0, Math.PI * 2);
          ctx.stroke();
          if (this.t > 0.5) {
            const prog = (this.t - 0.5) / p.fallTime;
            const y = -200 + prog * (groundY + 200);
            ctx.globalAlpha = 1;
            ctx.translate(tx, y);
            ctx.rotate(f.facing * 0.25 * (1 - prog));
            if (img) ctx.drawImage(img, -carW / 2, -carH / 2, carW, carH);
            else { ctx.fillStyle = p.color; ctx.fillRect(-140, -50, 280, 100); }
          }
          ctx.restore();
        } else {
          // Suspension bounce: decaying hops after the landing, a residual
          // rock while the wheels spin, dead level once it is driving.
          let lift = 0;
          let rock = 0;
          if (this.phase === "bouncing") {
            const k = this.phaseT / bounceDur;
            lift = Math.abs(Math.sin(k * Math.PI * 3)) * 34 * (1 - k) * (1 - k);
            rock = Math.sin(this.phaseT * 40) * 0.02 * (1 - k);
          }
          ctx.translate(this.x, groundY - lift);
          ctx.rotate(rock);
          ctx.scale(face > 0 ? 1 : -1, 1);
          if (img) ctx.drawImage(img, -carW / 2, -carH, carW, carH);
          else { ctx.fillStyle = p.color; ctx.fillRect(-140, -carH, 280, 100); }
          ctx.restore();
          if (this.phase === "bouncing") {
            // Spinning wheels as skid blurs under each axle, brightening toward
            // traction so the launch is telegraphed rather than sudden.
            const k = this.phaseT / bounceDur;
            ctx.save();
            ctx.globalAlpha = 0.35 + 0.45 * k;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 5;
            for (const ax of [-carW * 0.3, carW * 0.3]) {
              for (let i = 0; i < 3; i++) {
                const len = 14 + i * 10 + k * 26;
                ctx.beginPath();
                ctx.moveTo(this.x + ax - len, groundY - 6 - i * 3);
                ctx.lineTo(this.x + ax + len, groundY - 6 - i * 3);
                ctx.stroke();
              }
            }
            ctx.restore();
          }
        }
      },
    });
  },

  // Gakuganji — Encore: sound waves roll off him until the closing chord.
  concert(f, p, ult) {
    beginUltAction(f, p.duration, { lockMovement: true });
    state.domainOverlay = { color: p.color, life: p.duration + 0.4, maxLife: p.duration + 0.4, label: "Deadly Melody", ownerId: f.id };
    state.entities.push({
      owner: f, t: 0, tick: 0.35, dead: false,
      update(dt) {
        this.t += dt;
        if (f.dead || f.respawnTimer > 0) { this.dead = true; return; }
        if (this.t >= p.duration) {
          this.dead = true;
          ring(f.x, f.y - 90, p.color, 320);
          playSfx("blast", 1, 0.6);
          state.camera.shake = Math.max(state.camera.shake, 14);
          for (const t of state.fighters) {
            if (!isFoe(f, t) || t.dead || t.respawnTimer > 0) continue;
            if (Math.abs(t.x - f.x) < p.radius * 1.2) {
              applyHit(f, t, {
                dmg: p.finalDmg, baseKb: p.finalBase, growth: p.finalGrowth, angle: 0.55,
                label: "ENCORE", sfx: "blast", unblockable: true, heavy: true,
              }, "script");
            }
          }
          return;
        }
        this.tick -= dt;
        if (this.tick <= 0) {
          this.tick = p.tickRate;
          playSfx("blast", 0.4, 1.4);
          ring(f.x, f.y - 90, p.color, 140 + rand(0, 80));
          for (const t of state.fighters) {
            if (!isFoe(f, t) || t.dead || t.respawnTimer > 0 || t.invuln > 0) continue;
            if (Math.abs(t.x - f.x) < p.radius) {
              t.damage = Math.min(999, t.damage + p.dmgTick);
              t.hitstun = Math.max(t.hitstun, 0.15);
              t.vx += sign(t.x - f.x) * 120; // waves push outward
              burst(t.x, t.y - 80, p.color, 5, 0.7);
              popup(t.x, t.y - 140, `${p.dmgTick}%`, p.color, 13);
            }
          }
        }
      },
      draw(ctx) {
        const img = p.sprite ? getImage(p.sprite) : null;
        if (img) {
          const pulse = 0.8 + 0.25 * Math.sin(this.t * 9);
          const h = (p.spriteH || 300) * pulse;
          const w = img.width * h / img.height;
          ctx.save();
          ctx.globalAlpha = 0.6;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 24;
          ctx.drawImage(img, f.x - w / 2, f.y - 110 - h / 2, w, h);
          ctx.restore();
          return;
        }
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4;
        for (let i = 0; i < 4; i++) {
          const rr = ((this.t * 420 + i * 130) % p.radius);
          ctx.beginPath();
          ctx.arc(f.x, f.y - 90, rr, -0.7, 0.7);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(f.x, f.y - 90, rr, Math.PI - 0.7, Math.PI + 0.7);
          ctx.stroke();
        }
        ctx.restore();
      },
    });
  },

  // Mechamaru — Mode: Absolute. Seventeen years, five months and six days of
  // banked cursed energy spent in one sequence: the tracking volley (Pigeon
  // Viola) to take away the ground, then the three-barrel Ultimate Cannon.
  //
  // The charge is deliberately long and deliberately visible. Everything he
  // saved is going into it, and the opponent gets to see it coming — which is
  // exactly how the fight with Mahito went.
  cannonade(f, p) {
    const charge = p.charge ?? 0.7;
    beginUltAction(f, charge + 0.9);
    state.entities.push({
      owner: f, t: 0, dead: false, volleyed: false, fired: false,
      update(dt) {
        this.t += dt;
        if (!this.volleyed && this.t >= charge) {
          this.volleyed = true;
          // Pigeon Viola: five orbs that follow until they meet something.
          for (let i = 0; i < p.orbs; i++) {
            spawnProjectile(f, {
              speed: 460, ox: 54, oy: -150 + i * 34, r: 22, dur: 1.9,
              dmg: p.orbDmg, base: p.orbBase, growth: p.orbGrowth, angle: 0.4,
              color: p.color, homing: 190, fxElement: "machine",
              label: "Pigeon Viola", sprite: p.orbSprite, spriteH: p.orbSpriteH || 64,
            });
          }
          playSfx("blast", 0.7, 1.3);
        }
        if (!this.fired && this.t >= charge + 0.45) {
          this.fired = true;
          spawnProjectile(f, {
            speed: 940, ox: 96, oy: -100, r: (p.width || 170) / 2, dur: p.duration || 1.2,
            dmg: p.dmg, base: p.base, growth: p.growth, angle: 0.36,
            color: p.color, pierce: true, unblockable: true, clearsProjectiles: true,
            fxElement: "machine", fxRing: 8,
            label: "ULTIMATE CANNON", sprite: p.sprite, spriteH: p.spriteH,
          });
          playSfx("blast", 1, 0.55);
          state.camera.shake = Math.max(state.camera.shake, 16);
          state.slowMo = Math.max(state.slowMo, 0.22);
          state.screenFlash = { color: p.color, life: 0.26, maxLife: 0.26 };
        }
        if (this.t > charge + 0.9) this.dead = true;
      },
      draw(ctx) {
        if (this.t >= charge + 0.45) return;
        // the barrels spooling up: three cores converging on the muzzle line
        const g = Math.min(1, this.t / (charge + 0.45));
        const cx = f.x + f.facing * 92;
        const cy = f.y - 100;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + this.t * 7;
          const rr = (1 - g) * 70;
          const x = cx + Math.cos(a) * rr;
          const y = cy + Math.sin(a) * rr * 0.6;
          const grad = ctx.createRadialGradient(x, y, 2, x, y, 16 + g * 22);
          grad.addColorStop(0, "#ffffff");
          grad.addColorStop(0.5, p.color);
          grad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(x, y, 16 + g * 22, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      },
    });
  },

  // Yuki — Star Rage: Maximum Mass. One blow, with as much virtual mass behind
  // it as she can hold. The wind-up is the whole move: land it and the fight is
  // over, whiff it and everybody watched her wind up for nothing.
  massDrive(f, p) {
    const charge = p.charge ?? 0.65;
    beginUltAction(f, charge + 0.7);
    state.entities.push({
      owner: f, t: 0, dead: false, struck: false,
      update(dt) {
        this.t += dt;
        if (this.struck) { if (this.t > charge + 0.7) this.dead = true; return; }
        if (this.t < charge) return;
        this.struck = true;
        const ix = f.x + f.facing * 150;
        const iy = f.y - 100;
        playSfx("blast", 1, 0.5);
        state.camera.shake = Math.max(state.camera.shake, 20);
        state.slowMo = Math.max(state.slowMo, 0.28);
        state.screenFlash = { color: p.color, life: 0.3, maxLife: 0.3 };
        burst(ix, iy, p.color, 60, 2.2);
        ring(ix, iy, "#ffffff", p.radius);
        for (const t of state.fighters) {
          if (!isFoe(f, t) || t.dead || t.respawnTimer > 0) continue;
          const inCore = circleRectOverlap(ix, iy, p.radius, hurtbox(t));
          const inWave = circleRectOverlap(f.x, f.y - 90, p.shockwave, hurtbox(t));
          if (!inCore && !inWave) continue;
          // The core is the fist. The shockwave is the mass arriving after it,
          // and it is deliberately survivable — being near her is not the same
          // as being hit by her.
          applyHit(f, t, {
            dmg: inCore ? p.dmg : p.dmg * 0.35,
            baseKb: inCore ? p.base : p.base * 0.4,
            growth: inCore ? p.growth : p.growth * 0.5,
            angle: 0.45, label: p.label || "BOMBAYE", sfx: "blast",
            unblockable: inCore, heavy: true,
          }, "script");
        }
      },
      draw(ctx) {
        const img = p.sprite ? getImage(p.sprite) : null;
        if (this.struck) {
          if (!img) return;
          const fade = Math.max(0, 1 - (this.t - charge) / 0.5);
          const h = (p.spriteH || 280) * (1 + (1 - fade) * 0.5);
          const w = img.width * h / img.height;
          ctx.save();
          ctx.globalAlpha = fade;
          ctx.translate(f.x + f.facing * 150, f.y - 100);
          ctx.scale(f.facing > 0 ? -1 : 1, 1);
          ctx.drawImage(img, -w / 2, -h / 2, w, h);
          ctx.restore();
          return;
        }
        // mass gathering at the fist: a dense core that gets heavier, not bigger
        const g = this.t / charge;
        const cx = f.x + f.facing * 70;
        const cy = f.y - 110;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 30 + g * 26);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.35, p.color);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, 30 + g * 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      },
    });
  },

  // Dagon — Death Swarm. Shikigami without end, thrown at one target until
  // there is nothing left to throw them at. Outside his domain they have to
  // travel, so they home rather than simply arriving — the sure-hit version is
  // what the domain buys him (domains.js).
  deathSwarm(f, p) {
    beginUltAction(f, 0.8);
    state.entities.push({
      owner: f, t: 0, fired: 0, dead: false, gap: 0,
      update(dt) {
        this.t += dt;
        this.gap -= dt;
        if (this.gap > 0) return;
        this.gap = p.gap;
        const last = this.fired >= p.volleys;
        spawnProjectile(f, {
          speed: last ? 620 : 520,
          ox: 60, oy: -140 + (this.fired % 4) * 40,
          r: last ? 46 : 26, dur: 2.0,
          dmg: last ? p.finalDmg : p.dmg,
          base: last ? p.finalBase : p.base,
          growth: p.growth, angle: 0.42,
          color: p.color, homing: p.homing, fxElement: "water",
          effect: "drench", unblockable: last, heavy: last,
          label: last ? "DEATH SWARM" : "Shikigami",
          sprite: p.sprite, spriteH: last ? (p.spriteH || 90) * 1.8 : p.spriteH,
        });
        playSfx("whoosh", last ? 1 : 0.4, last ? 0.6 : 1.4);
        if (last) {
          state.camera.shake = Math.max(state.camera.shake, 12);
          this.dead = true;
        }
        this.fired += 1;
      },
      draw(ctx) {
        // the water he is drawing them out of, boiling at his feet
        const g = state.platforms[0]?.y ?? 568;
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = p.color;
        for (let i = 0; i < 5; i++) {
          const x = f.x + Math.sin(this.t * 6 + i * 1.3) * 60;
          const h = 16 + 20 * Math.abs(Math.sin(this.t * 8 + i));
          ctx.beginPath();
          ctx.ellipse(x, g - h * 0.4, 22, h, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      },
    });
  },

  // Kurourushi — Parthenogenesis. It does not power up: it REPRODUCES. The
  // offspring fight beside it, and while the brood is out the appetite runs
  // hot (installs.lifesteal, read by feedHunger in combat.js), so every bite
  // anywhere on the stage puts the parent back together.
  parthenogenesis(f, p, ult) {
    beginUltAction(f, 0.9);
    const ok = applyInstall(f, {
      t: p.duration, label: p.label || ult.name, color: p.color,
      lifesteal: p.lifesteal, dmgMul: p.dmgMul, aura: p.aura,
    }, 2);
    if (!ok) return;
    banner(p.label || ult.name, p.color, { y: 250, size: 40, life: 1.2 });
    for (let i = 0; i < (p.brood || 2); i++) {
      spawnSummon(f, {
        ...p.offspring,
        label: ult.name,
        duration: p.duration,
        backOff: 70 + i * 60,
        firstAttackDelay: 0.4 + i * 0.35,
      });
    }
    ring(f.x, f.y - 90, p.color, 200);
    burst(f.x, f.y - 90, p.color, 40, 1.5);
    playSfx("blast", 0.9, 0.8);
  },
};
