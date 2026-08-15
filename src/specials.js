// Special-move behaviors. Each character defines three specials in
// characters.js whose `type` maps to a handler here. Signature mechanics
// (Boogie Woogie, Idle Transfiguration, throat strain, gambles, mode cores)
// get bespoke handlers; common shapes share primitives.

import { state } from "./state.js";
// Effects spawned from CODE draw here rather than through render.js, so the
// per-drawing nudge has to be applied at each of them or the workbench dial
// silently does nothing for exactly the art that needs it most: a wall, a
// pillar, a ward — pieces that stand ON the floor, where being a few pixels
// off the ground line is the whole difference between planted and hovering.
import { sharedAdjust } from "./shared_sprites.js";
import { clamp, sign, rand, chance } from "./utils.js";
// The scaled spawns: kit blocks author oy/h for the reference body, and these
// wrappers size them to the caster (combat.js spawnMeleeScaled) — the same
// height-normalisation moves.js applies to normals.
import { spawnMeleeScaled as spawnMelee, spawnProjectileScaled as spawnProjectile, opponentOf, applyHit, hurtbox, applyStatus, ownerStick, debugShape } from "./combat.js";
import { burst, dust, ring, popup, banner } from "./particles.js";
import { playSfx, playGrunt, moveCallFor, spokenLead, spokenCommitAt, cutSfx, playCutGrunt } from "./audio.js";
import { METER_MAX } from "./constants.js";
import { rectsOverlap, circleRectOverlap } from "./utils.js";
import { getImage } from "./assets.js";
import { spawnSummon } from "./summons.js";
import { dashLaunchFx, muzzleFx, glints, steelInstallFx } from "./fx.js";
import { CHAR_FX } from "./config_fx.js";
import { isFoe } from "./teams.js";

// Installs have priorities: ultimate transformations (2) cannot be
// overwritten by special-move buffs (1).
export function applyInstall(f, install, priority = 1) {
  if (f.installs && (f.installs.priority || 1) > priority) {
    popup(f.x, f.y - 170, "ALREADY SURGING", "#9aa4c0", 15);
    return false;
  }
  f.installs = { ...install, priority };
  return true;
}

// How long the wind-up action outlives the event that ends it. fighter.js ticks
// action events before it ages actions, but an action whose duration is exactly
// its event's time can still expire on the frame the event is due; a few frames
// of tail removes the race entirely.
const SPOKEN_HOLD_TAIL = 0.1;

// True only while a deferred handler is running — that is, while a move that
// was introduced by a spoken line is finally happening. The line was played at
// the top of the cast, seconds earlier; without this the handler's own call to
// `effortSound` would say it a second time, on the frame of the hit.
//
// Set and cleared around one synchronous call, so it cannot leak between
// fighters or across frames.
let lineAlreadySpoken = false;

/** The noise a handler makes when its move goes off: the fighter's line if the
 *  move has one and has not already said it, otherwise their effort grunt. */
function effortSound(f, cfg) {
  if (lineAlreadySpoken) return;
  playGrunt(f.charKey, cfg?.name);
}

/**
 * The interruptible half of a spoken wind-up: how long it may be knocked out
 * of the fighter, and what that looks and sounds like when it is.
 *
 * Spread into the wind-up action by all three casters — specials, ultimates
 * and domains — so being shouted down is one behaviour with one definition
 * rather than three that drift apart.
 *
 * `lineEl` is the handle for the line currently being spoken, so the sentence
 * actually stops mid-word instead of finishing over a fighter who is no longer
 * saying it. That is the whole tell: you hear the command stop.
 */
export function spokenCast(f, lineEl, call) {
  return {
    commitAt: spokenCommitAt(call),
    onInterrupt: () => {
      cutSfx(lineEl);
      playCutGrunt(f.charKey);
      // Deliberately small. A cut-off command is a thing that DIDN'T happen —
      // it gets a puff of breath at head height and a quiet word, not a hit's
      // worth of spectacle, and no screen shake at all. The fighter is about to
      // be in hitstun from whatever cut them off, and that is the loud part.
      dust(f.x + f.facing * 18, f.y - 132, 6);
      burst(f.x + f.facing * 18, f.y - 132, "#9aa4c0", 7, 0.5);
      popup(f.x, f.y - 168, "CUT OFF", "#9aa4c0", 15);
    },
  };
}

function beginSpecialAction(f, slot, dur, opts = {}) {
  f.action = { kind: "special", t: 0, dur, anim: slotAnim(slot), events: [], ...opts };
  f.animTime = 0;
  f.animKey = slotAnim(slot);
}

function slotAnim(slot) {
  return slot === "neutral" ? "specialNeutral" : slot === "side" ? "specialSide" : "specialDown";
}

// The direction a fighter is aiming with the d-pad, as a unit vector, or
// null when the stick is centred. Null means "fire it the usual way" — aiming
// is opt-in per press, so nothing changes for a player who never touches it.
function aimVector(f) {
  const stick = ownerStick(f);
  const len = Math.hypot(stick.x, stick.y);
  if (!len) return null;
  return { x: stick.x / len, y: stick.y / len };
}

export function performSpecial(f, slot) {
  const cfg = f.char.specials[slot] || f.char.specials.neutral;
  if (!cfg) return;
  if (f.cooldowns[slot] > 0) return;
  if (f.statuses.silence > 0) {
    popup(f.x, f.y - 160, "TECHNIQUE SEALED", "#a8aeb8", 16);
    return;
  }
  if (f.char.passive.id === "throatStrain") {
    if (f.throatLock > 0) {
      popup(f.x, f.y - 160, "*cough*", "#d7d9e7", 16);
      return;
    }
  }

  const handler = HANDLERS[cfg.type];
  if (!handler) return;

  // What the move costs, charged the moment it actually goes off. For an
  // ordinary special that is now; for a spoken one it is the end of the line,
  // so a command that gets cut off costs nothing and can be tried again.
  const spend = () => {
    f.cooldowns[slot] = cfg.cooldown || 1.2;
    if (f.char.passive.id === "throatStrain" && cfg.strain) {
      f.throatStrain += cfg.strain;
      if (f.throatStrain >= 3) {
        f.throatStrain = 0;
        f.throatLock = 2.5;
        popup(f.x, f.y - 176, "THROAT STRAIN!", "#ff8a8a", 18);
      }
    }
  };

  // A move with a spoken line is introduced by it: the command comes first, the
  // fighter holds the special's own pose while it is said, and the move itself
  // runs near the end of the line (SPOKEN_TIMING, config_audio.js).
  //
  // The whole handler is deferred rather than each handler learning to delay
  // its own effect. That is what makes this general — a line given to any of
  // the twenty-odd special types works with no further code — and it means the
  // move's internal timing is untouched: when the handler finally runs it runs
  // exactly as it always did, just later.
  //
  // The hold is an ordinary special action, so being hit during the command
  // clears it and the pending event dies with it — the command was cut off. It
  // costs nothing: `spend()` has not run, so the cooldown is untouched and the
  // throat is unstrained, and he can say it again straight away. Speaking is
  // the commitment; the sentence is where an opponent gets to answer it.
  const call = moveCallFor(f.charKey, cfg.name);
  const lead = spokenLead(call);
  if (lead > 0) {
    const lineEl = playGrunt(f.charKey, cfg.name);
    // Held a little past the event so the action cannot expire on the same
    // frame the move is due — fighter.js ticks events before it ages actions.
    beginSpecialAction(f, slot, lead + SPOKEN_HOLD_TAIL, {
      lockMovement: true, ...spokenCast(f, lineEl, call),
    });
    f.action.events.push({ at: lead, fn: () => {
      spend();
      lineAlreadySpoken = true;
      try { handler(f, cfg.p || {}, cfg, slot); } finally { lineAlreadySpoken = false; }
    } });
    return;
  }
  spend();
  handler(f, cfg.p || {}, cfg, slot);
}

// The last creature each fighter rolled out of each summon pool, so the next
// cast can avoid repeating it. A WeakMap because fighters are rebuilt every
// match and nothing should outlive them.
const lastRoll = new WeakMap();

/**
 * Which creature this cast puts on the stage.
 *
 * A summon special names a POOL (config_summons.js) and one entry is rolled
 * per cast, so Megumi's shikigami and Mahito's transfigurations are a draw
 * rather than a fixture. Never the same entry twice running: a technique that
 * happens to repeat reads as a technique that only has one creature, which is
 * the exact impression the pools exist to kill. With one entry left there is
 * nothing to avoid, so a single-entry pool just returns it.
 */
function rollSummon(f, cfg, p) {
  if (!p.pool?.length) return null;
  if (p.pool.length === 1) return p.pool[0];
  const seen = lastRoll.get(f) || {};
  const previous = seen[cfg.name];
  const options = p.pool.filter((o) => o !== previous);
  const choice = options[Math.floor(Math.random() * options.length)];
  seen[cfg.name] = choice;
  lastRoll.set(f, seen);
  return choice;
}

const HANDLERS = {
  // Persistent minions (see summons.js). `p` is the summon config; `p.pool`
  // rolls which creature it is this time, and `units` spawns several minions
  // per cast with per-unit overrides (Megumi's two Divine Dogs).
  summon(f, p, cfg) {
    beginSpecialAction(f, currentSlot(cfg, f), 0.5);
    effortSound(f, cfg);
    const rolled = rollSummon(f, cfg, p);
    // The roll wins over the special's shared defaults, and `pool` itself is
    // dropped so it never travels into a summon's own config.
    const { pool, ...base } = p;
    const spec = { ...base, ...rolled };
    for (const unit of spec.units || [{}]) {
      spawnSummon(f, { label: cfg.name, ...spec, ...unit });
    }
    // Name what answered. With five shikigami on one button, the player has to
    // be told which one they got — the creature is the information, not the
    // technique, and its own art may not be drawn yet.
    if (rolled?.name) popup(f.x, f.y - 176, rolled.name.toUpperCase(), spec.color || f.char.theme, 18);
    ring(f.x, f.y - 80, spec.color || f.char.theme, 110);
    playSfx("blast", 0.6, 1.2);
    grantSummonMeter(f, cfg);
  },

  projectile(f, p, cfg) {
    beginSpecialAction(f, currentSlot(cfg, f), 0.42);
    effortSound(f, cfg);
    // Blood Manipulation (Choso): blood techniques are paid for in blood
    if (p.bloodCost) {
      f.damage = Math.min(999, f.damage + p.bloodCost);
      burst(f.x, f.y - 90, "#c22e4a", 6, 0.5);
    }
    // Distortion Solo (Gakuganji): amped Power Chords fire an extra wave
    let count = p.count || 1;
    if (p.ampable && f.installs && f.installs.ampUp) count += 1;
    // A steerable shot fired while the d-pad is held launches along the
    // stick instead of straight ahead. The spread is kept as an offset
    // PERPENDICULAR to that heading, so an aimed volley fans exactly the way a
    // forward one does, just rotated.
    const aim = p.steerable ? aimVector(f) : null;
    for (let i = 0; i < count; i++) {
      const spreadVy = count > 1 ? (i - (count - 1) / 2) * (p.spread || 100) : 0;
      // `spritePool` picks a different look per shot — Geto's volley throws a
      // random cursed spirit each time rather than the same orb three times.
      // Cosmetic only: the hitbox is identical whichever is drawn.
      const sprite = p.spritePool
        ? p.spritePool[Math.floor(Math.random() * p.spritePool.length)]
        : p.sprite;
      if (aim) {
        const speed = p.speed ?? 500;
        spawnProjectile(f, {
          ...p, sprite,
          x: f.x + aim.x * (p.ox ?? 70),
          y: f.y - 86 + aim.y * (p.ox ?? 70),
          vx: aim.x * speed - aim.y * spreadVy,
          vy: aim.y * speed + aim.x * spreadVy,
        });
      } else {
        spawnProjectile(f, { ...p, vy: (p.vy || 0) + spreadVy, sprite });
      }
    }
    muzzleFx(p.fxElement, f.x + f.facing * 70, f.y - 86, f.facing, p.color || f.char.theme);
    // A signature firing sound (Gakuganji's chord, Mei Mei's caw). Silence
    // until the file is delivered and registered.
    if (p.fireSfx) playSfx(p.fireSfx, 0.9);
    grantSummonMeter(f, cfg);
  },

  wave(f, p, cfg) {
    beginSpecialAction(f, currentSlot(cfg, f), 0.46);
    effortSound(f, cfg);
    const count = p.count || 1;
    for (let i = 0; i < count; i++) {
      // Only override the sprite when a per-shot list is supplied. Passing
      // `sprite: undefined` unconditionally shadowed `p.sprite` from the
      // spread, so every single-sprite wave (Geto's dragon) drew nothing.
      const sprite = p.sprites ? p.sprites[i % p.sprites.length] : p.sprite;
      spawnProjectile(f, { ...p, wave: true, ox: 60 + i * 54, sprite });
    }
    dust(f.x + f.facing * 50, f.y, 10);
    // Same signature-sound field the projectile handler reads, and it belongs
    // here for the same reason: a wave is a thing that LEAVES, and the moment
    // it leaves is the moment worth scoring. Dagon's tide was silent on release
    // until this line existed — the only thing you could hear of the biggest
    // water move in the game was the element layer under its impact.
    if (p.fireSfx) playSfx(p.fireSfx, 0.9);
    grantSummonMeter(f, cfg);
  },

  dashStrike(f, p, cfg) {
    // `lunge`, not `keepMomentum`. The two are not the same thing wearing one
    // name: keepMomentum means "the speed you already had carries through this
    // move" — the dash attack, the roll, the dash grab, all of which set their
    // own distance and want no drag. This move SETS the speed, several times a
    // run, and held it flat for the whole action: 520 px/s for 0.58 s is 302 px
    // of travel with movement locked, ending at 426 px/s and then stopping
    // dead. That is the "sliding fast in one direction" nobody asked for.
    // `lunge` decays instead (fighter.js LUNGE_DRAG) and can be stopped by the
    // ledge brake, which keepMomentum actions still cannot.
    beginSpecialAction(f, currentSlot(cfg, f), (p.delay || 0.06) + (p.dur || 0.2) + 0.22, { lockMovement: true, lunge: true });
    effortSound(f, cfg);
    f.vx = f.facing * (p.vel || 520);
    if (p.iframes) f.invuln = Math.max(f.invuln, p.iframes);
    if (p.armor) f.armorT = (p.delay || 0.06) + (p.dur || 0.2) + 0.15;
    spawnMelee(f, { ...p, base: p.base });
    dust(f.x - f.facing * 30, f.y, 10);
    dashLaunchFx(f, p.color || f.char.theme, p.fxElement || f.char.fxElement);
  },

  burst(f, p, cfg) {
    beginSpecialAction(f, currentSlot(cfg, f), (p.delay || 0.1) + (p.dur || 0.16) + 0.26);
    effortSound(f, cfg);
    spawnMelee(f, { ...p });
    if (p.sprite) spawnSummonFlash(f, p.sprite, 0.52, p.spriteH || 220, p.spriteForward || 105);
    if (p.unblockable) ring(f.x + f.facing * 70, f.y - 90, p.color || f.char.theme, 80);
  },

  commandGrab(f, p, cfg) {
    beginSpecialAction(f, currentSlot(cfg, f), 0.5);
    effortSound(f, cfg);
    if (p.castSfx) playSfx(p.castSfx, 0.9);
    spawnMelee(f, {
      delay: 0.12, dur: 0.14, ox: 24, oy: -104, w: p.range || 120, h: 110,
      dmg: p.dmg, base: p.base, growth: p.growth, angle: p.angle,
      effect: p.effect, label: cfg.name, unblockable: true, sfx: "blast",
    });
    if (p.sprite) spawnSummonFlash(f, p.sprite, 0.5, p.spriteH || 150, p.spriteForward || 78);
    burst(f.x + f.facing * 70, f.y - 96, p.color || f.char.theme, 18, 0.8);
  },

  counter(f, p, cfg) {
    beginSpecialAction(f, currentSlot(cfg, f), p.window || 0.55, { lockMovement: true });
    f.counter = {
      t: p.window || 0.55, holdStill: true,
      dmg: p.dmg, baseKb: p.base, growth: p.growth, angle: p.angle,
      label: cfg.name, name: "INFINITY",
    };
    ring(f.x, f.y - 90, p.color || f.char.theme, 100);
    playSfx("shield", 0.7, 1.4);
  },

  install(f, p, cfg) {
    beginSpecialAction(f, currentSlot(cfg, f), 0.5);
    effortSound(f, cfg);
    const ok = applyInstall(f, {
      t: p.duration, label: p.label || cfg.name, color: p.color || f.char.theme,
      speedMul: p.speedMul, dmgMul: p.dmgMul, armor: p.armor,
      unblockable: p.unblockable, healPerSec: p.healPerSec,
      contactBurn: p.contactBurn, dmgTakenMul: p.dmgTakenMul, aura: p.aura,
      ampUp: p.ampUp, selfDrainPerSec: p.selfDrainPerSec,
    });
    if (!ok) return;
    banner(p.label || cfg.name, p.color || f.char.theme, { y: 240, size: 38, life: 1.0 });
    ring(f.x, f.y - 90, p.color || f.char.theme, 140);
    // Steel fighters power up with speed-lines and dust, never a glow.
    if (f.char.fxElement === "steel") steelInstallFx(f);
    else burst(f.x, f.y - 90, p.color || f.char.theme, 26, 1.2);
    playSfx("ult", 0.6);
  },

  trap(f, p, cfg) {
    beginSpecialAction(f, currentSlot(cfg, f), 0.48);
    effortSound(f, cfg);
    const opp = opponentOf(f);
    const tx = p.atOpponent && opp ? opp.x : f.x + f.facing * (p.dist || 220);
    const ground = groundYAt();
    state.entities.push(makeTrap(f, clamp(tx, 80, 1200), ground, p, cfg.name));
  },

  swap(f, p, cfg) {
    const opp = opponentOf(f);
    beginSpecialAction(f, currentSlot(cfg, f), 0.5);
    if (p.sprite) spawnSummonFlash(f, p.sprite, 0.42, p.spriteH || 190, 0);
    if (!opp || opp.dead || Math.abs(opp.x - f.x) > (p.range || 560) || opp.respawnTimer > 0) {
      popup(f.x, f.y - 160, "clap.", "#b66cff", 18);
      playSfx("miss", 0.8);
      return;
    }
    effortSound(f, cfg);
    if (opp.ledge) { opp.ledge = null; opp.ledgeCooldown = 0.5; }
    if (f.ledge) { f.ledge = null; f.ledgeCooldown = 0.5; }
    const fx = f.x, fy = f.y, ox = opp.x, oy = opp.y;
    burst(fx, fy - 90, p.color, 20, 1);
    burst(ox, oy - 90, p.color, 20, 1);
    f.x = clamp(ox, 90, 1190); f.y = oy;
    opp.x = clamp(fx, 90, 1190); opp.y = fy;
    // The canon read of Boogie Woogie is the discontinuity itself: both
    // fighters' trail buffers still hold their pre-swap positions, so boosting
    // the afterimages paints each body's ghost where it stood a frame ago.
    f.fxTrailT = Math.max(f.fxTrailT, CHAR_FX.swapTrailTime);
    opp.fxTrailT = Math.max(opp.fxTrailT, CHAR_FX.swapTrailTime);
    f.grounded = false; opp.grounded = false;
    f.vy = Math.min(f.vy, 0); opp.vy = Math.min(opp.vy, 0);
    f.facing = sign(opp.x - f.x) || f.facing;
    popup(f.x, f.y - 170, "BOOGIE WOOGIE", p.color, 22);
    playSfx("blast", 0.8, 1.3);
    playSfx("boogieClap", 1); // the dry, huge clap: the technique IS this sound
    state.camera.shake = Math.max(state.camera.shake, 6);
    // followup window: quick strike as they reel
    spawnMelee(f, {
      delay: 0.08, dur: 0.16, ox: 30, oy: -100, w: 170, h: 110,
      dmg: 11, base: 380, growth: 6.6, angle: 0.4, label: "Boogie Woogie", sfx: "punch",
    });
  },

  shadowPort(f, p, cfg) {
    beginSpecialAction(f, currentSlot(cfg, f), 0.34);
    burst(f.x, f.y - 70, p.color || "#20244a", 22, 1);
    dust(f.x, f.y, 12);
    f.x = clamp(f.x + f.facing * (p.dist || 300), 70, 1210);
    f.invuln = Math.max(f.invuln, p.iframes || 0.4);
    burst(f.x, f.y - 70, p.color || "#20244a", 22, 1);
    playSfx("whoosh", 0.9, 0.8);
  },

  heal(f, p, cfg) {
    beginSpecialAction(f, currentSlot(cfg, f), p.duration || 1.4, { lockMovement: true });
    f.healing = { t: p.duration || 1.4, rate: p.healPerSec || 8 };
    ring(f.x, f.y - 90, p.color || "#a5ffd8", 90);
    playSfx("shield", 0.5, 1.5);
    if (p.castSfx) playSfx(p.castSfx, 0.8);
  },

  gamble(f, p, cfg) {
    beginSpecialAction(f, currentSlot(cfg, f), 0.5);
    effortSound(f, cfg);
    if (p.takada) {
      f.meter = clamp(f.meter + 8, 0, METER_MAX);
      f.damage = Math.max(0, f.damage - 2);
      popup(f.x, f.y - 170, "TAKADA-CHAN ♥", "#ffd6f2", 22);
      ring(f.x, f.y - 90, "#ffd6f2", 110);
      return;
    }
    const roll = Math.random();
    if (roll < 0.35) {
      f.meter = clamp(f.meter + 18, 0, METER_MAX);
      popup(f.x, f.y - 170, "REACH! +METER", "#ffd35a", 20);
    } else if (roll < 0.6) {
      f.damage = Math.max(0, f.damage - 8);
      popup(f.x, f.y - 170, "LUCKY! HEALED", "#a5ffd8", 20);
    } else if (roll < 0.8) {
      if (applyInstall(f, { t: 4, label: "HOT STREAK", color: "#ff62cf", dmgMul: 1.15 })) {
        popup(f.x, f.y - 170, "HOT STREAK!", "#ff62cf", 20);
      }
    } else {
      f.meter = clamp(f.meter - 6, 0, METER_MAX);
      popup(f.x, f.y - 170, "BUST… -METER", "#ff8a8a", 18);
    }
    burst(f.x, f.y - 100, "#ffd35a", 18, 0.9);
  },

  modeToggle(f, p, cfg) {
    beginSpecialAction(f, currentSlot(cfg, f), 0.4);
    if (f.installs && f.installs.id === "gorilla") {
      f.installs = null;
      popup(f.x, f.y - 170, "PANDA CORE", "#8ea0b8", 20);
      return;
    }
    effortSound(f, cfg);
    const ok = applyInstall(f, {
      id: "gorilla", t: p.duration, label: p.label, color: p.color,
      dmgMul: p.dmgMul, speedMul: p.speedMul, armor: p.armor, aura: p.aura,
    });
    if (!ok) return;
    banner(p.label, p.color, { y: 240, size: 36, life: 0.9 });
    burst(f.x, f.y - 100, p.color, 26, 1.2);
    state.camera.shake = Math.max(state.camera.shake, 5);
  },

  shout(f, p, cfg) {
    beginSpecialAction(f, currentSlot(cfg, f), 0.5);
    // The command itself, where every other handler puts its effort grunt.
    // This one and `crush` below are Inumaki's alone and were the two that
    // never called playGrunt at all — his loudest moves, made by the one
    // fighter whose technique is his voice, and silent of him.
    effortSound(f, cfg);
    spawnMelee(f, {
      delay: 0.1, dur: 0.12, ox: p.ox ?? 40, oy: p.oy ?? -120, w: p.w, h: p.h,
      dmg: p.dmg, base: p.base, growth: p.growth, angle: p.angle,
      label: cfg.name, sfx: "blast", unblockable: !!p.ultShout,
    });
    // Sound made visible: stacked concentric wavefronts and a cone of
    // streaks, not one lonely ring.
    ring(f.x + f.facing * 80, f.y - 100, p.color, 60);
    ring(f.x + f.facing * 80, f.y - 100, p.color, 120);
    ring(f.x + f.facing * 80, f.y - 100, "#ffffff", 180);
    glints(f.x + f.facing * 40, f.y - 100, f.facing, 8, 0.9, [p.color, "#ffffff"]);
    playSfx("blast", 0.9, 1.2);
  },

  crush(f, p, cfg) {
    beginSpecialAction(f, currentSlot(cfg, f), 0.5);
    const opp = opponentOf(f);
    if (!opp || opp.dead || Math.abs(opp.x - f.x) > p.range || opp.respawnTimer > 0) {
      popup(f.x, f.y - 160, "…too far", "#9aa4c0", 15);
      return;
    }
    // After the range check, like every other handler that guards first: a
    // command with nobody in reach is not spoken, it is not even attempted.
    effortSound(f, cfg);
    ring(opp.x, opp.y - 90, p.color, 100);
    const res = applyHit(f, opp, {
      dmg: p.dmg, baseKb: p.base, growth: p.growth, angle: 0.1,
      label: cfg.name, sfx: "blast",
    }, "script");
    if (res === "hit") {
      opp.vy = 860;
      opp.vx *= 0.3;
      opp.grounded = false;
    }
  },

  detonate(f, p, cfg) {
    beginSpecialAction(f, currentSlot(cfg, f), 0.44);
    const opp = opponentOf(f);
    const marks = opp ? opp.statuses.nailMarks : 0;
    if (!opp || marks <= 0) {
      popup(f.x, f.y - 160, "no nails set…", "#9aa4c0", 15);
      return;
    }
    effortSound(f, cfg);
    burst(opp.x, opp.y - 90, "#ff9a6a", 16 + marks * 8, 1 + marks * 0.2);
    ring(opp.x, opp.y - 90, "#ff9a6a", 70 + marks * 25);
    applyHit(f, opp, {
      dmg: p.dmgPerMark * marks,
      baseKb: p.base + marks * 40,
      growth: p.growthPerMark * marks,
      angle: p.angle, label: `Hairpin ×${marks}`, sfx: "blast",
    }, "script");
    opp.statuses.nailMarks = 0;
    opp.statuses.nailT = 0;
  },

  resonance(f, p, cfg) {
    beginSpecialAction(f, currentSlot(cfg, f), 0.55);
    const opp = opponentOf(f);
    const marks = opp ? opp.statuses.nailMarks : 0;
    if (!opp || marks <= 0) {
      popup(f.x, f.y - 160, "no nails set…", "#9aa4c0", 15);
      return;
    }
    if (opp.invuln > 0 || opp.respawnTimer > 0 || opp.dead) {
      popup(f.x, f.y - 160, "…no resonance", "#9aa4c0", 15);
      return;
    }
    effortSound(f, cfg);
    const dmg = Math.round(p.dmgPerMark * marks * 10) / 10;
    opp.damage = Math.min(999, opp.damage + dmg);
    opp.hitstun = Math.max(opp.hitstun, p.hitstun);
    opp.statuses.nailMarks = Math.floor(marks / 2);
    burst(opp.x, opp.y - 90, p.color, 26, 1.1);
    ring(opp.x, opp.y - 90, p.color, 120);
    popup(opp.x, opp.y - 140, `RESONANCE ${dmg}%`, p.color, 22);
    popup(f.x, f.y - 160, "…hurts, right?", "#d86a4a", 15);
    playSfx("blast", 0.9, 0.8);
    state.camera.shake = Math.max(state.camera.shake, 7);
  },

  updraft(f, p, cfg) {
    beginSpecialAction(f, currentSlot(cfg, f), 0.42);
    effortSound(f, cfg);
    const x = f.x + f.facing * 90;
    state.entities.push(makeWindColumn(f, x, p));
    f.vy = Math.min(f.vy, -(p.liftSelf ? 650 : 0));
    f.fastFalling = false;
    playSfx("whoosh", 1, 0.7);
  },

  feint(f, p, cfg) {
    beginSpecialAction(f, currentSlot(cfg, f), 0.55, { lockMovement: true, keepMomentum: true, events: [] });
    f.vx = -f.facing * 520;
    f.invuln = Math.max(f.invuln, p.iframes || 0.28);
    dust(f.x, f.y, 10);
    f.action.events.push({
      at: 0.18,
      fn: (self) => {
        self.vx = self.facing * (p.lunge || 560);
        spawnMelee(self, { ...p, delay: 0.04 });
        playSfx("whoosh", 0.9, 1.2);
      },
    });
  },

  // Yuji — Divergent Fist: the punch lands, then the cursed energy lands.
  echoStrike(f, p, cfg) {
    const dur = (p.delay || 0.08) + (p.echoDelay || 0.34) + 0.28;
    beginSpecialAction(f, currentSlot(cfg, f), dur, { events: [] });
    effortSound(f, cfg);
    spawnMelee(f, { ...p, label: p.label || cfg.name });
    f.action.events.push({
      at: (p.delay || 0.08) + (p.echoDelay || 0.34),
      fn: (self) => {
        spawnMelee(self, {
          delay: 0.02, dur: 0.1, ox: p.ox, oy: p.oy,
          w: (p.w || 170) * 1.15, h: (p.h || 104) * 1.15,
          dmg: p.echoDmg, base: p.echoBase, growth: p.echoGrowth, angle: p.echoAngle,
          label: "Divergent Impact", sfx: "blast",
        });
        burst(self.x + self.facing * 80, self.y - 96, p.color || self.char.theme, 18, 1.0);
        if (p.sprite) spawnSummonFlash(self, p.sprite, 0.3, p.spriteH || 140, 80);
        playSfx("blast", 0.85, 1.1);
      },
    });
  },

  // Mei Mei — Advance Payment: spend meter now, collect damage later.
  payToWin(f, p, cfg) {
    if (f.meter < p.cost) {
      f.cooldowns[currentSlot(cfg, f)] = 0.6; // a declined card shouldn't cost the full cooldown
      popup(f.x, f.y - 160, "INSUFFICIENT FUNDS", "#9aa4c0", 15);
      playSfx("miss", 0.8);
      return;
    }
    beginSpecialAction(f, currentSlot(cfg, f), 0.45);
    effortSound(f, cfg);
    f.meter = clamp(f.meter - p.cost, 0, METER_MAX);
    if (!applyInstall(f, { t: p.duration, label: p.label || cfg.name, color: p.color, dmgMul: p.dmgMul })) return;
    banner(p.label || cfg.name, p.color, { y: 240, size: 34, life: 0.9 });
    ring(f.x, f.y - 90, p.color, 120);
    burst(f.x, f.y - 100, p.color, 20, 1.0);
    playSfx("ult", 0.5);
  },

  // Uro — Sky Fold: a counter stance that also bends projectiles back.
  reflectCounter(f, p, cfg) {
    beginSpecialAction(f, currentSlot(cfg, f), p.window || 0.55, { lockMovement: true });
    f.counter = {
      t: p.window || 0.55, holdStill: true,
      dmg: p.dmg, baseKb: p.base, growth: p.growth, angle: p.angle,
      label: cfg.name, name: "SKY FOLD",
    };
    f.reflect = { t: p.window || 0.55, color: p.color || f.char.theme };
    ring(f.x, f.y - 90, p.color || f.char.theme, 110);
    playSfx("shield", 0.7, 1.2);
  },

  // Mechamaru and Yuki — New Shadow Style: Simple Domain.
  //
  // Not a Domain Expansion: it is the anti-domain counter-measure both of them
  // canonically carry (Kokichi loaded it into Mode: Absolute as cartridges,
  // Yuki taught it to Todo). Two jobs, and they are the same idea twice: inside
  // the circle, nothing arrives unopposed.
  //
  //   * anything that reaches the circle is turned — the same counter stance
  //     Infinity uses, so one attack is answered and eaten;
  //   * while it holds, an enemy Domain Expansion's sure-hit effect does not
  //     land on the holder (domains.js asks via simpleDomainActive).
  //
  // It is a stance, not a parry window: it holds for its whole duration, which
  // is what makes it a real answer to a domain rather than a guess at one.
  simpleDomain(f, p, cfg) {
    const dur = p.duration || 1.6;
    beginSpecialAction(f, currentSlot(cfg, f), dur, { lockMovement: true });
    const color = p.color || f.char.theme;
    f.counter = {
      t: dur, holdStill: true,
      dmg: p.dmg, baseKb: p.base, growth: p.growth, angle: p.angle,
      label: cfg.name, name: "SIMPLE DOMAIN", color,
    };
    f.simpleDomain = { t: dur, radius: p.radius || 132, color };
    ring(f.x, f.y - 90, color, (p.radius || 132) * 1.4);
    playSfx("shield", 0.8, 0.9);
  },

  // Dagon — Undertow. He pulls the water back in, and everything swimming in
  // it comes with it. No launch of its own: it drags them into his reach and
  // leaves them soaked, which is where the rest of his kit wants them.
  undertow(f, p, cfg) {
    beginSpecialAction(f, currentSlot(cfg, f), 0.5);
    effortSound(f, cfg);
    const color = p.color || f.char.theme;
    playSfx("whoosh", 0.9, 0.7);
    for (const t of state.fighters) {
      if (!isFoe(f, t) || t.dead || t.respawnTimer > 0 || t.invuln > 0) continue;
      const dx = f.x - t.x;
      if (Math.abs(dx) > (p.range || 520)) continue;
      const pull = (p.pull || 520) * (1 - Math.abs(dx) / ((p.range || 520) * 1.6));
      t.vx += sign(dx) * pull;
      t.vy -= 90;
      t.grounded = false;
      t.damage = Math.min(999, t.damage + (p.dmg || 6));
      t.hitstun = Math.max(t.hitstun, 0.2);
      applyStatus(p.effect || "drench", f, t);
      popup(t.x, t.y - 140, "UNDERTOW", color, 16);
      burst(t.x, t.y - 60, color, 16, 0.9);
    }
    // the water itself, spiralling in around him
    state.entities.push({
      owner: f, t: 0, dead: false,
      update(dt) { this.t += dt; if (this.t > 0.6) this.dead = true; },
      draw(ctx) {
        const g = groundYAt();
        const prog = this.t / 0.6;
        ctx.save();
        ctx.globalAlpha = 0.5 * (1 - prog);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        for (let i = 0; i < 4; i++) {
          const rr = (p.range || 520) * (1 - prog) * (0.35 + i * 0.2);
          ctx.beginPath();
          ctx.ellipse(f.x, g - 18, rr, rr * 0.22, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      },
    });
  },

  // Uro — Sky Warp Palm: a telegraphed strike that falls out of the air on
  // the spot the target held when she cast it. Dodge by not standing there.
  warpStrike(f, p, cfg) {
    beginSpecialAction(f, currentSlot(cfg, f), 0.4);
    effortSound(f, cfg);
    const opp = opponentOf(f);
    const tx = opp && !opp.dead ? opp.x : f.x + f.facing * 240;
    const ty = opp && !opp.dead ? opp.y - 70 : f.y - 70;
    const delay = p.delay || 0.32;
    state.entities.push({
      owner: f, t: 0, dead: false,
      update(dt) {
        this.t += dt;
        if (this.t < delay) return;
        this.dead = true;
        burst(tx, ty, p.color, 20, 1.0);
        ring(tx, ty, p.color, 90);
        playSfx("blast", 0.85, 1.15);
        debugShape({ x: tx, y: ty, r: p.r || 95 });
        for (const t of state.fighters) {
          if (!isFoe(f, t) || t.dead || t.respawnTimer > 0) continue;
          if (circleRectOverlap(tx, ty, p.r || 95, hurtbox(t))) {
            applyHit(f, t, {
              dmg: p.dmg, baseKb: p.base, growth: p.growth, angle: p.angle,
              label: cfg.name, sfx: "blast",
            }, "script");
          }
        }
      },
      draw(ctx) {
        const prog = Math.min(1, this.t / delay);
        const img = p.sprite ? getImage(p.sprite) : null;
        ctx.save();
        ctx.globalAlpha = 0.35 + prog * 0.45;
        if (img) {
          const h = (p.spriteH || 150) * (0.6 + prog * 0.5);
          const w = img.width * h / img.height;
          const adj = sharedAdjust(p.sprite);
          ctx.drawImage(img, tx - w / 2 + adj.dx, ty - h / 2 + adj.dy, w, h);
        } else {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(tx, ty, 20 + prog * 50, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      },
    });
  },

  // Reggie — Insecticide: a lingering poison cloud. Gas doesn't care about
  // shields; it does gentle ticks with no launch, an attrition zone.
  cloudField(f, p, cfg) {
    beginSpecialAction(f, currentSlot(cfg, f), 0.46);
    effortSound(f, cfg);
    const x = clamp(f.x + f.facing * (p.dist || 210), 80, 1200);
    const groundY = groundYAt();
    state.entities.push({
      kind: "cloud", owner: f, x, y: groundY, t: 0, tick: 0.15, dead: false,
      update(dt) {
        this.t += dt;
        if (this.t >= p.duration) { this.dead = true; return; }
        this.tick -= dt;
        if (this.tick > 0) return;
        this.tick = p.tickRate;
        const rect = { x: this.x - p.w / 2, y: this.y - p.h, w: p.w, h: p.h };
        debugShape(rect);
        for (const t of state.fighters) {
          if (!isFoe(f, t) || t.dead || t.respawnTimer > 0 || t.invuln > 0) continue;
          if (rectsOverlap(rect, hurtbox(t))) {
            t.damage = Math.min(999, t.damage + p.tickDmg);
            applyStatus(p.effect, f, t);
            burst(t.x, t.y - 70, p.color, 4, 0.4);
            popup(t.x, t.y - 130, `${p.tickDmg}%`, p.color, 12);
          }
        }
      },
      draw(ctx) {
        const fade = Math.min(1, this.t * 3) * Math.min(1, (p.duration - this.t) * 2);
        const img = p.sprite ? getImage(p.sprite) : null;
        ctx.save();
        if (img) {
          const h = p.spriteH || p.h;
          const w = img.width * h / img.height;
          const adj = sharedAdjust(p.sprite);
          ctx.globalAlpha = 0.6 * fade;
          ctx.drawImage(img, this.x - w / 2 + adj.dx, this.y - h + adj.dy, w, h);
        } else {
          ctx.globalAlpha = 0.3 * fade;
          ctx.fillStyle = p.color;
          for (let i = 0; i < 4; i++) {
            const wob = Math.sin(this.t * 2.4 + i * 1.7);
            ctx.beginPath();
            ctx.ellipse(this.x + (i - 1.5) * p.w * 0.22 + wob * 8, this.y - p.h * (0.3 + 0.16 * i),
                        p.w * 0.26, p.h * 0.2, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      },
    });
  },

  // Reggie — Big-Ticket Item: something heavy falls where the enemy stood.
  // What, exactly, depends on the receipt he tears.
  randomDrop(f, p, cfg) {
    beginSpecialAction(f, currentSlot(cfg, f), 0.5);
    effortSound(f, cfg);
    const opp = opponentOf(f);
    const tx = clamp(opp && !opp.dead ? opp.x : f.x + f.facing * 260, 100, 1180);
    const drop = p.drops[Math.floor(Math.random() * p.drops.length)];
    const groundY = groundYAt();
    const fallT = p.armTime || 0.55;
    state.entities.push({
      owner: f, t: 0, dead: false, landed: false,
      update(dt) {
        this.t += dt;
        if (this.t >= fallT && !this.landed) {
          this.landed = true;
          dust(tx, groundY, 14);
          burst(tx, groundY - drop.h * 0.4, p.color, 20, 1.1);
          playSfx("blast", 0.85, drop.dud ? 1.5 : 0.8);
          state.camera.shake = Math.max(state.camera.shake, drop.dud ? 2 : 7);
          popup(tx, groundY - drop.h - 30, drop.name.toUpperCase(), p.color, 16);
          const rect = { x: tx - drop.w / 2, y: groundY - drop.h, w: drop.w, h: drop.h };
          debugShape(rect);
          for (const t of state.fighters) {
            if (!isFoe(f, t) || t.dead || t.respawnTimer > 0) continue;
            if (rectsOverlap(rect, hurtbox(t))) {
              applyHit(f, t, {
                dmg: drop.dmg, baseKb: drop.base, growth: drop.growth, angle: 0.9,
                label: drop.name, sfx: "blast", heavy: !drop.dud,
              }, "script");
            }
          }
        }
        if (this.t >= fallT + 0.6) this.dead = true;
      },
      draw(ctx) {
        const img = getImage(drop.key);
        const prog = Math.min(1, this.t / fallT);
        const y = this.landed ? groundY : -140 + prog * (groundY + 140);
        ctx.save();
        if (!this.landed) {
          ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.t * 14);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(tx, groundY - 4, drop.w * 0.7, 14, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else {
          ctx.globalAlpha = Math.max(0, 1 - (this.t - fallT) / 0.6);
        }
        if (img) {
          const w = img.width * drop.h / img.height;
          ctx.drawImage(img, tx - w / 2, y - drop.h, w, drop.h);
        } else {
          ctx.fillStyle = p.color;
          ctx.globalAlpha *= 0.8;
          ctx.fillRect(tx - drop.w / 2, y - drop.h, drop.w, drop.h);
        }
        ctx.restore();
      },
    });
  },
};

function spawnSummonFlash(owner, spriteKey, duration, height, forward) {
  state.entities.push({
    owner, t: 0, dead: false,
    update(dt) {
      this.t += dt;
      if (this.t >= duration || owner.dead) this.dead = true;
    },
    draw(ctx) {
      const img = getImage(spriteKey);
      if (!img) return;
      const h = height;
      const w = img.width * h / img.height;
      const adj = sharedAdjust(spriteKey);
      const alpha = Math.sin(Math.min(1, this.t / duration) * Math.PI) * 0.9;
      ctx.save();
      ctx.translate(owner.x + owner.facing * forward, owner.y + 12);
      ctx.scale(owner.facing > 0 ? -1 : 1, 1);
      ctx.globalAlpha = alpha;
      ctx.shadowColor = "#dfe8ff";
      ctx.shadowBlur = 18;
      // Inside the mirrored frame, so the nudge follows the drawing rather
      // than reversing when the fighter turns round (render.js does the same).
      ctx.drawImage(img, -w / 2 + adj.dx, -h + adj.dy, w, h);
      ctx.restore();
    },
  });
}

function currentSlot(cfg, f) {
  const s = f.char.specials;
  if (s.neutral === cfg) return "neutral";
  if (s.side === cfg) return "side";
  return "down";
}

function grantSummonMeter(f, cfg) {
  const id = f.char.passive.id;
  if (id === "tenShadows") f.meter = clamp(f.meter + 3, 0, METER_MAX);
  if (id === "curseHoard") f.meter = clamp(f.meter + 4, 0, METER_MAX);
}

function groundYAt() {
  return state.platforms.length ? state.platforms[0].y : 568;
}

function makeTrap(owner, x, groundY, p, name) {
  return {
    kind: "trap",
    owner,
    x, y: groundY,
    t: 0, armTime: p.armTime, lifetime: p.armTime + p.lifetime,
    w: p.w, h: p.h, fired: false, dead: false, color: p.color,
    hit: new Set(),
    update(dt) {
      this.t += dt;
      if (this.t >= this.lifetime) this.dead = true;
      if (this.t < this.armTime) return;
      if (!this.fired) {
        this.fired = true;
        burst(this.x, this.y - this.h * 0.4, this.color, 24, 1.2);
        dust(this.x, this.y, 14);
        playSfx("blast", 0.8, 0.9);
        state.camera.shake = Math.max(state.camera.shake, 5);
      }
      const rect = { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
      debugShape(rect);
      for (const t of state.fighters) {
        if (!isFoe(owner, t) || t.dead || t.respawnTimer > 0 || this.hit.has(t)) continue;
        if (rectsOverlap(rect, hurtbox(t))) {
          this.hit.add(t);
          applyHit(owner, t, {
            dmg: p.dmg, baseKb: p.base, growth: p.growth, angle: p.angle,
            effect: p.effect, label: name, sfx: "blast",
          }, "script");
        }
      }
    },
    draw(ctx) {
      const armed = this.t >= this.armTime;
      const prog = Math.min(1, this.t / this.armTime);
      ctx.save();
      if (!armed) {
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.x, this.y - 6, 16 + prog * 26, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.25 + prog * 0.3;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.ellipse(this.x, this.y - 4, 30 + prog * 18, 9, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const fade = 1 - (this.t - this.armTime) / (this.lifetime - this.armTime);
        const sprite = p.sprite ? getImage(p.sprite) : null;
        if (sprite) {
          const h = p.spriteH || this.h;
          const w = sprite.width * h / sprite.height;
          const adj = sharedAdjust(p.sprite);
          ctx.globalAlpha = Math.min(1, fade * 1.35);
          ctx.shadowColor = this.color;
          ctx.shadowBlur = 14;
          ctx.drawImage(sprite, this.x - w / 2 + adj.dx, this.y - h + adj.dy, w, h);
          ctx.restore();
          return;
        }
        ctx.globalAlpha = 0.75 * fade;
        ctx.fillStyle = this.color;
        const w = this.w, h = this.h * (0.6 + 0.4 * fade);
        // jagged pillar
        ctx.beginPath();
        ctx.moveTo(this.x - w / 2, this.y);
        ctx.lineTo(this.x - w / 4, this.y - h * 0.7);
        ctx.lineTo(this.x, this.y - h);
        ctx.lineTo(this.x + w / 4, this.y - h * 0.65);
        ctx.lineTo(this.x + w / 2, this.y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    },
  };
}

function makeWindColumn(owner, x, p) {
  return {
    kind: "wind",
    owner,
    x, t: 0, dur: 0.55, dead: false, hit: new Set(),
    update(dt) {
      this.t += dt;
      if (this.t >= this.dur) { this.dead = true; return; }
      const groundY = groundYAt();
      const rect = { x: this.x - p.w / 2, y: groundY - p.h, w: p.w, h: p.h };
      debugShape(rect);
      for (const t of state.fighters) {
        if (!isFoe(owner, t) || t.dead || t.respawnTimer > 0 || this.hit.has(t)) continue;
        if (rectsOverlap(rect, hurtbox(t))) {
          this.hit.add(t);
          const res = applyHit(owner, t, {
            dmg: p.dmg, baseKb: p.base, growth: p.growth, angle: 1.45,
            label: "Updraft", sfx: "whoosh", effect: "gust",
          }, "script");
          if (res === "hit") t.vy = Math.min(t.vy, -720);
        }
      }
    },
    draw(ctx) {
      const groundY = groundYAt();
      const fade = 1 - this.t / this.dur;
      ctx.save();
      ctx.globalAlpha = 0.4 * fade;
      ctx.strokeStyle = p.color || "#d5d6ff";
      ctx.lineWidth = 4;
      for (let i = 0; i < 4; i++) {
        const off = ((this.t * 700 + i * 80) % p.h);
        ctx.beginPath();
        ctx.ellipse(this.x, groundY - off, p.w * 0.4, 12, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

// Per-frame special bookkeeping: timed action events.
export function updateSpecialState(f, dt) {
  if (f.action && f.action.events && f.action.events.length) {
    for (const ev of f.action.events) {
      if (!ev.fired && f.action.t >= ev.at) {
        ev.fired = true;
        ev.fn(f);
      }
    }
  }
}
