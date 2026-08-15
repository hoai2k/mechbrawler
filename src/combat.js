import { state } from "./state.js";
import { clamp, sign, rectsOverlap, circleRectOverlap } from "./utils.js";
import { burst, dust, sparkLine, ring, popup, banner } from "./particles.js";
import { hitFx, elementOf, burnTickFx, bleedTickFx, projectileEmit, explodeFx, blackFlashFx, ratioSeamFx, specks, spray } from "./fx.js";
import { PROJ_TRAIL, BLACK_FLASH, RUMBLE } from "./config_fx.js";
import { rumbleFighter, rumbleEvent } from "./rumble.js";
import { duckMusic } from "./audio.js";
import { ELEMENT_HIT_SFX } from "./config_audio.js";
import { playSfx, noteFireBurning } from "./audio.js";
import { domainKnockbackMul } from "./domains.js";
import { isFoe } from "./teams.js";
import {
  SHIELD_DAMAGE_MULT, SHIELD_BREAK_STUN, PARRY_WINDOW, METER_MAX,
  METER_ON_DEAL, METER_ON_TAKE, HURTBOX,
  GROUND_RELEASE, GROUND_SLIDE_BOOST, GROUND_SPIKE_BOUNCE,
  SAKURAI, SAKURAI_AIR, SAKURAI_LOW, SAKURAI_POP, SAKURAI_KB,
  COMBO_GRACE,
} from "./constants.js";
import { bodyMetrics } from "./silhouette.js";
import { comFrac, muzzlePoint, hurtboxFit } from "./body_points.js";
import { swingExtent } from "./moves.js";
import { breakGrabsOn } from "./grab.js";
import {
  TUMBLE_KB_MIN, TUMBLE_SPIN_PER_KB, TUMBLE_SPIN_MAX,
  DI_MAX_TURN, DI_SPEED, STALE_QUEUE, STALE_DMG_STEP, STALE_KB_STEP,
  HEIGHT_BASE_PX,
} from "./config_tuning.js";

// The aim pad (the d-pad) belonging to a fighter, or a centred one when they have no
// live input this step. CPU fighters always read as centred: aiming and steering
// are player affordances, and their kits behave exactly as they did before.
//
// Lives here rather than in summons.js because both summons and projectiles need
// it, and summons.js already depends on this module.
export function ownerStick(f) {
  const input = f?.lastInput;
  if (!input || f.aiState) return { x: 0, y: 0 };
  return { x: input.aimX || 0, y: input.aimY || 0 };
}

/**
 * The body a fighter can be hit on.
 *
 * Sized from their own art. This used to be one 64x108 box for the entire
 * roster — the same target for a 153 px Momo, a 192 px Hanami and the 222 px
 * Mahoraga an install draws — which left the top third of every character
 * unhittable and made a broad fighter no bigger a target than a slight one.
 * `bodyMetrics` (src/silhouette.js) supplies the height and width, measured
 * across the character's own poses and banded so the art can move without a
 * matchup moving; HURTBOX (constants.js) says what fraction of that each state
 * exposes.
 *
 * `standH` stops short of the full drawn height on purpose: the top of an anime
 * silhouette is hair, and hair is not a target.
 */
export function hurtbox(f) {
  const key = f.spriteChar || f.charKey;
  const b = bodyMetrics(key);
  const H = b.height, W = b.width;
  // A box grown or shrunk about its own bottom edge by a human-verified fit
  // (body_points.js, the "hurtbox-fit" review). 1x1 for anyone nobody has
  // checked, so this is a no-op until a decision lands.
  const fit = (box, caseKey) => {
    const m = hurtboxFit(key, caseKey);
    if (m.w === 1 && m.h === 1) return box;
    const w = box.w * m.w, h = box.h * m.h;
    return { x: box.x + (box.w - w) / 2, y: box.y + box.h - h, w, h };
  };
  if (f.ledge) {
    return fit({ x: f.x - W * HURTBOX.ledgeW / 2, y: f.y - H * HURTBOX.ledgeTop,
                 w: W * HURTBOX.ledgeW, h: H * HURTBOX.ledgeH }, "ledge");
  }
  // Tumbling near horizontal (motion.js draws the body spun by spinAngle): an
  // upright standing box on a body drawn sideways was the biggest remaining
  // silhouette/box divergence in the air. Long and low like prone, but hung
  // about the centre of mass — the point the spin pivots on.
  if (!f.grounded && Math.abs(Math.sin(f.spinAngle || 0)) > 0.7) {
    const bh = H * HURTBOX.proneH;
    const cy = f.y - H * comFrac(key);
    return fit({ x: f.x - H * HURTBOX.proneW / 2, y: cy - bh / 2,
                 w: H * HURTBOX.proneW, h: bh }, "prone");
  }
  // Lying flat: long and low, matching what is drawn. High pokes whiff over a
  // downed fighter, which is most of what makes a knockdown mean anything.
  if (f.prone > 0 && f.hitstun <= 0 && f.grounded) {
    return fit({ x: f.x - H * HURTBOX.proneW / 2, y: f.y - H * HURTBOX.proneH,
                 w: H * HURTBOX.proneW, h: H * HURTBOX.proneH }, "prone");
  }
  if (f.crouching) {
    // `b.crouch` is measured from this fighter's own crouch pose, not assumed:
    // most of the roster's crouch art does not actually duck yet, and a box
    // that ducked anyway would have them dodging attacks while standing up.
    const ch = H * b.crouch;
    return fit({ x: f.x - W * HURTBOX.crouchW / 2, y: f.y - ch,
                 w: W * HURTBOX.crouchW, h: ch }, "crouch");
  }
  // Doubled over by a hit: lower and wider than standing, which is what the
  // hurt pose is actually drawn as.
  if (f.hitstun > 0) {
    return fit({ x: f.x - W * HURTBOX.hurtW / 2, y: f.y - H * HURTBOX.hurtH,
                 w: W * HURTBOX.hurtW, h: H * HURTBOX.hurtH }, "hurt");
  }
  // Airborne: jump and fall poses tuck, so the box is the measured air height
  // (`b.air`, from this fighter's own jump/fall art) rather than full standing.
  if (!f.grounded) {
    const ah = H * b.air;
    return fit({ x: f.x - W / 2, y: f.y - ah, w: W, h: ah }, "air");
  }
  return fit({ x: f.x - W / 2, y: f.y - H * HURTBOX.standH,
               w: W, h: H * HURTBOX.standH }, "stand");
}

export function opponentOf(f) {
  const candidates = state.fighters.filter((o) => isFoe(f, o) && !o.dead && o.respawnTimer <= 0);
  if (!candidates.length) return state.fighters.find((o) => isFoe(f, o) && !o.dead) || null;
  return candidates.reduce((best, o) =>
    Math.abs(o.x - f.x) < Math.abs(best.x - f.x) ? o : best
  );
}

// ---------------------------------------------------------------- hitboxes

export function spawnMelee(owner, cfg) {
  state.hitboxes.push({
    owner,
    age: -(cfg.delay || 0),
    dur: cfg.dur || 0.12,
    ox: cfg.ox ?? 40, oy: cfg.oy ?? -96,
    w: cfg.w ?? 160, h: cfg.h ?? 100,
    dmg: cfg.dmg ?? 8,
    baseKb: cfg.baseKb ?? cfg.base ?? 300,
    growth: cfg.growth ?? 5.5,
    angle: cfg.angle ?? 0.32,
    effect: cfg.effect || null,
    label: cfg.label || null,
    sfx: cfg.sfx || "punch",
    shieldMul: cfg.shieldMul || 1,
    unblockable: !!cfg.unblockable,
    heavy: !!cfg.heavy,
    spike: !!cfg.spike,
    critBand: cfg.critBand || null,
    // Carried purely so the strike arc can show how hard this swing is
    // (drawStrikeArcs in render.js). Nothing in the simulation reads it.
    charge: cfg.charge || 0,
    critChance: cfg.critChance || 0,
    stunBonus: cfg.stunBonus || 0,
    maxHits: cfg.hits || 1,
    rehitRate: cfg.rehitRate || 0.16,
    facing: owner.facing, // snapshot: turning mid-swing must not teleport the hitbox
    swung: false,
    hits: new Map(), // fighter -> {count, nextAt}
  });
}

/** Height scale for hand-authored offsets: kit blocks write oy/h for the
 *  reference body (HEIGHT_BASE_PX), so a fighter drawn taller carries them
 *  proportionally. Normals already scale in moves.js (`g.vy`); the wrappers
 *  below do the same for the hand-authored half of the kit — specials and
 *  ultimates import them under the plain names, so every kit call site scales
 *  without being edited (docs/hitbox-audit.md item: "attack vertical offsets
 *  are absolute, not scaled" — fixed for normals, now fixed here too). */
function heightScaleOf(f) {
  return bodyMetrics(f.spriteChar || f.charKey).height / HEIGHT_BASE_PX;
}

/** Register an ad-hoc hit test's shape for the debug overlay (backquote
 *  toggles it — render.js drawDebug). The special/ultimate scripts test
 *  hurtboxes against inline rects and circles that the overlay could not see;
 *  each such site calls this beside its test. Rects are {x,y,w,h}, circles
 *  {x,y,r}. No-op with the overlay off. Shapes decay in the overlay itself,
 *  so a test that runs once (a detonation) still shows for a beat. */
export function debugShape(shape) {
  if (!state.debugHitboxes) return;
  state.debugShapes.push({ ...shape, ttl: 0.12 });
}

export function spawnMeleeScaled(owner, cfg) {
  const k = heightScaleOf(owner);
  return spawnMelee(owner, { ...cfg, oy: (cfg.oy ?? -96) * k, h: (cfg.h ?? 100) * k });
}

export function spawnProjectileScaled(owner, cfg) {
  // Spawn offsets only: the shot leaves the caster's hand, wherever that is on
  // this body — the shot's own size and flight are the move's, not the body's.
  // A verified muzzle (body_points.js, the "muzzle-points" review) wins; with
  // none, this is the reference offsets scaled by height, exactly as before.
  const key = owner.spriteChar || owner.charKey;
  const m = muzzlePoint(key, bodyMetrics(key).height, cfg.ox ?? 70, cfg.oy ?? -86);
  return spawnProjectile(owner, { ...cfg, ox: m.x, oy: m.y });
}

// ------------------------------------------------------------ hitting summons
//
// A summon is a target, not just a threat. Every enemy attack that overlaps one
// wears it down, and enough of them destroy it — so answering a shikigami is
// something a player can DO, rather than something they wait out.
//
// Deliberately not a fighter: no knockback, no hitstun, no shield, no percent.
// It has hit points and it bursts. Treating it as a fighter would mean a summon
// could be launched off the stage, which turns every summon into a free KO
// setup for whoever hits it hardest.

/** The box a summon occupies, in the same shape as a fighter's hurtbox. */
export function summonBox(s) {
  const w = s.hitW ?? 70;
  const h = s.hitH ?? 90;
  return { x: s.x - w / 2, y: s.y - h, w, h };
}

/** Live summons an attacker is entitled to hit: anyone else's. */
function enemySummons(attacker) {
  const out = [];
  for (const e of state.entities) {
    // `intangible` covers a summon that has not finished arriving and one that
    // is already dissipating: neither is on the board to be hit (summons.js).
    if (e.kind !== "summon" || e.dead || e.intangible || !e.damage) continue;
    // A summon is its owner's: an attack that cannot hit them cannot hit it.
    if (!isFoe(attacker, e.owner)) continue;
    out.push(e);
  }
  return out;
}

/**
 * Where a hitbox is, right now.
 *
 * A forward box TRAVELS: its far edge extends across the opening of the active
 * window instead of the whole box existing at full length from the first frame
 * (`swingExtent`, shared with the crescent that draws it). A fist that has not
 * got there yet should not be hitting anything, and it is what makes the tip of
 * a long weapon a question of timing as well as distance.
 *
 * A straddling box — an up smash, a quake, a meteor — does not, because it is
 * not a swing reaching outward from a shoulder; it comes out both sides at once
 * and growing it from the middle would be a different move.
 */
export function hitboxRect(hb) {
  const o = hb.owner;
  const facing = hb.facing ?? o.facing;
  const w = hb.ox >= 0
    ? hb.w * swingExtent(hb.age / Math.max(hb.dur, 0.001))
    : hb.w;
  const x = facing === 1 ? o.x + hb.ox : o.x - hb.ox - w;
  return { x, y: o.y + hb.oy, w, h: hb.h };
}

export function updateHitboxes(dt) {
  for (let i = state.hitboxes.length - 1; i >= 0; i--) {
    const hb = state.hitboxes[i];
    const o = hb.owner;
    if (o.hitPause > 0) continue; // hitboxes freeze with their owner
    hb.age += dt;
    if (hb.age > hb.dur || o.dead || (o.action == null && hb.age > 0.02)) {
      state.hitboxes.splice(i, 1);
      continue;
    }
    if (hb.age < 0) continue;
    if (!hb.swung) {
      hb.swung = true;
      playSfx("swingWhiff", 0.7);
    }
    const rect = hitboxRect(hb);
    for (const target of state.fighters) {
      if (!isFoe(o, target) || target.dead || target.respawnTimer > 0) continue;
      let rec = hb.hits.get(target);
      if (rec && (rec.count >= hb.maxHits || hb.age < rec.nextAt)) continue;
      if (!rectsOverlap(rect, hurtbox(target))) continue;
      const landed = applyHit(o, target, hb, "melee");
      if (landed !== "ignored") {
        if (!rec) rec = { count: 0, nextAt: 0 };
        rec.count += 1;
        rec.nextAt = hb.age + hb.rehitRate;
        hb.hits.set(target, rec);
      }
    }
    // Summons share the hitbox's own re-hit bookkeeping, so a multi-hit move
    // rakes one the same number of times it would rake a fighter.
    for (const s of enemySummons(o)) {
      let rec = hb.hits.get(s);
      if (rec && (rec.count >= hb.maxHits || hb.age < rec.nextAt)) continue;
      if (!rectsOverlap(rect, summonBox(s))) continue;
      s.damage(hb.dmg, o);
      if (!rec) rec = { count: 0, nextAt: 0 };
      rec.count += 1;
      rec.nextAt = hb.age + hb.rehitRate;
      hb.hits.set(s, rec);
    }
  }
}

// -------------------------------------------------------------- projectiles

export function spawnProjectile(owner, cfg) {
  const dir = cfg.dir ?? owner.facing;
  const p = {
    owner,
    x: cfg.x ?? owner.x + dir * (cfg.ox ?? 70),
    y: cfg.y ?? owner.y + (cfg.oy ?? -86),
    // An aimed shot supplies its own velocity vector; everything else flies
    // straight out along the caster's facing.
    vx: cfg.vx ?? dir * (cfg.speed ?? 500),
    vy: cfg.vy ?? 0,
    gravity: cfg.gravity ?? 0,
    r: cfg.r ?? 30,
    dur: cfg.dur ?? 0.9,
    age: 0,
    dmg: cfg.dmg ?? 10,
    baseKb: cfg.baseKb ?? cfg.base ?? 320,
    growth: cfg.growth ?? 6,
    angle: cfg.angle ?? 0.38,
    effect: cfg.effect || null,
    label: cfg.label || null,
    color: cfg.color || "#8fd3ff",
    pull: cfg.pull || 0,
    homing: cfg.homing || 0,
    pierce: !!cfg.pierce,
    explode: cfg.explode || 0,
    wave: !!cfg.wave,
    sprite: cfg.sprite || null,
    spriteH: cfg.spriteH || 0,
    // Element tag (config_fx.js): drives the in-flight emitter, the detonation
    // recipe, and — because the projectile object IS the hit descriptor — the
    // element of the hit sparks when it connects.
    fxElement: cfg.fxElement || null,
    trailPts: [], trailTick: 0,
    clearsProjectiles: !!cfg.clearsProjectiles,
    stunBonus: cfg.stunBonus || 0,
    unblockable: !!cfg.unblockable,
    shieldMul: cfg.shieldMul || 1,
    // Creature projectiles (Nue, Geto's cursed spirits) can be flown with the
    // d-pad. `steerRate` is how fast the flight path can be turned, in
    // radians per second.
    steerable: !!cfg.steerable,
    steerRate: cfg.steerRate ?? 5.2,
    hit: new Set(),
  };
  state.projectiles.push(p);
  return p;
}

function explodeProjectile(p) {
  explodeFx(p);
  playSfx("projectileHit", 0.9);
  for (const target of state.fighters) {
    if (!isFoe(p.owner, target) || target.dead || target.respawnTimer > 0) continue;
    if (circleRectOverlap(p.x, p.y, p.explode, hurtbox(target))) {
      applyHit(p.owner, target, { ...p, dmg: p.dmg, sfx: "blast" }, "projectile");
    }
  }
}

export function updateProjectiles(dt) {
  const groundY = state.platforms.length ? state.platforms[0].y : 568;
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    // Hitboxes freeze with their owner through hitlag (updateHitboxes above);
    // projectiles did not, so the frame a shot connected, everything froze for
    // the impact EXCEPT the shot that caused it, which slid visibly onward
    // through its own freeze frames.
    if (p.owner && p.owner.hitPause > 0) continue;
    p.age += dt;
    p.dur -= dt;
    // Comet tail: sample where the shot has actually been, so an arcing or
    // steered path's tail bends with it. Drawn in render.js.
    p.trailTick += dt;
    if (p.trailTick >= PROJ_TRAIL.step) {
      p.trailTick = 0;
      p.trailPts.push(p.x, p.y);
      if (p.trailPts.length > PROJ_TRAIL.len * 2) p.trailPts.splice(0, 2);
    }
    projectileEmit(p, dt);
    const target = state.fighters.find((f) => isFoe(p.owner, f) && !f.dead);

    // Flying it by hand. The path turns toward the stick at a limited rate
    // rather than snapping, so a steered curse arcs instead of teleporting its
    // heading, and its speed is preserved — steering redirects a shot, it does
    // not accelerate one.
    let steering = false;
    if (p.steerable) {
      const stick = ownerStick(p.owner);
      if (stick.x || stick.y) {
        steering = true;
        const speed = Math.hypot(p.vx, p.vy);
        const want = Math.atan2(stick.y, stick.x);
        const cur = Math.atan2(p.vy, p.vx);
        let delta = want - cur;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        const turn = clamp(delta, -p.steerRate * dt, p.steerRate * dt);
        p.vx = Math.cos(cur + turn) * speed;
        p.vy = Math.sin(cur + turn) * speed;
      }
    }

    // A hand-flown shot answers to the hand: its own homing and its arc would
    // otherwise fight the stick for the same velocity.
    if (p.homing && target && !steering) {
      const desired = sign(target.x - p.x);
      p.vx += desired * p.homing * dt * 8;
      const dy = (target.y - 60) - p.y;
      p.vy += clamp(dy, -220, 220) * dt * 3;
    }
    if (!steering) p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.wave) p.y = groundY - p.r * 0.7;

    if (p.pull && target && target.hitstun <= 0) {
      const dx = p.x - target.x;
      const dist = Math.abs(dx);
      if (dist < p.pull) {
        target.vx += sign(dx) * 520 * dt * (1 - dist / p.pull);
        if (target.y > p.y) target.vy -= 320 * dt * (1 - dist / p.pull);
      }
    }

    if (p.clearsProjectiles) {
      for (let j = state.projectiles.length - 1; j >= 0; j--) {
        const q = state.projectiles[j];
        if (q !== p && q.owner !== p.owner && Math.hypot(q.x - p.x, q.y - p.y) < q.r + p.r) {
          burst(q.x, q.y, q.color, 14, 0.9);
          state.projectiles.splice(j, 1);
          if (j < i) i -= 1;
        }
      }
    }

    let remove = p.dur <= 0 || p.x < -160 || p.x > 1440 || p.y > 1050;
    if (remove && p.explode && p.dur <= 0) explodeProjectile(p);

    // Summons are hit before fighters are considered, so a shikigami standing
    // between its owner and a projectile actually blocks it — which is half the
    // point of putting one on the stage. A piercing shot carries on through.
    if (!remove) {
      for (const s of enemySummons(p.owner)) {
        if (p.hit.has(s)) continue;
        if (!circleRectOverlap(p.x, p.y, p.r, summonBox(s))) continue;
        p.hit.add(s);
        s.damage(p.dmg, p.owner);
        burst(p.x, p.y, p.color, 10, 0.7);
        if (!p.pierce) {
          if (p.explode) explodeProjectile(p);
          remove = true;
          break;
        }
      }
    }

    if (!remove && target && target.respawnTimer <= 0 && !p.hit.has(target)) {
      const box = hurtbox(target);
      // Crouching under a high projectile dodges it. The threshold is this
      // fighter's own measured crouch top — a flat 70 px was over half of one
      // body and a third of another.
      const tb = bodyMetrics(target.spriteChar || target.charKey);
      const ducked = target.crouching && p.y < target.y - tb.height * tb.crouch;
      // Sky Fold (Uro): projectiles entering the folded sky are bent straight
      // back at their owner instead of landing
      if (!ducked && target.reflect && target.reflect.t > 0 &&
          circleRectOverlap(p.x, p.y, p.r + 30, box)) {
        p.owner = target;
        p.vx = -p.vx;
        p.vy = -p.vy * 0.4;
        p.hit.clear();
        p.dur = Math.max(p.dur, 0.7);
        burst(p.x, p.y, target.reflect.color || target.char.theme, 14, 0.9);
        ring(p.x, p.y, target.reflect.color || target.char.theme, 70);
        popup(target.x, target.y - 168, "RETURNED", target.char.theme, 20);
        playSfx("guardHit", 0.9, 1.3);
        continue;
      }
      if (!ducked && circleRectOverlap(p.x, p.y, p.r, box)) {
        if (p.explode) {
          explodeProjectile(p);
          remove = true;
        } else {
          const res = applyHit(p.owner, target, { ...p, sfx: "blast" }, "projectile");
          if (res !== "ignored") {
            p.hit.add(target);
            if (!p.pierce) remove = true;
          }
        }
      }
    }

    if (remove) state.projectiles.splice(i, 1);
  }
}

// ---------------------------------------------------------------- statuses

export function applyStatus(effect, owner, target, extra = {}) {
  if (!effect) return;
  const s = target.statuses;
  const immune = (target.char.passive.id === "heavenlyBody" &&
    ["burn", "snare", "soulMark", "rootSnare", "cursedSpeech"].includes(effect)) ||
    // Choso is made of the stuff — bleeding and poisoning blood is pointless
    (target.char.passive.id === "deathPainting" && ["bleed", "poison"].includes(effect)) ||
    // A curse born from the fear of drowning does not drown, and the cockroach
    // curse is not troubled by its own roaches. Only ever reachable in a mirror
    // match, but a fighter losing to their own signature status reads as a bug.
    (target.char.passive.id === "tideBorn" && effect === "drench") ||
    (target.char.passive.id === "infiniteHunger" && ["infest", "blind"].includes(effect));
  if (immune) {
    popup(target.x, target.y - 150, "IMMUNE", "#b8ffe2", 20);
    return;
  }
  switch (effect) {
    case "burn": {
      const mult = owner.char.passive.id === "disasterFlame" ? 1.5 : 1;
      s.burn = { t: 2.6, tick: 0.45, dmg: 1.2 * mult, from: owner };
      break;
    }
    case "bleed":
      s.bleed = { t: 3.2, tick: 0.5, dmg: 1.4, from: owner };
      break;
    case "poison":
      // ticks whether or not the victim moves, and slows them (see speedMul)
      s.poison = { t: 3.0, tick: 0.5, dmg: 1.1, from: owner };
      break;
    case "snare":
      s.snare = Math.max(s.snare || 0, 1.35);
      break;
    case "rootSnare":
      s.snare = Math.max(s.snare || 0, 2.0);
      s.bleed = { t: 1.2, tick: 0.5, dmg: 1.0, from: owner };
      break;
    case "soulMark":
      s.soulMark = Math.max(s.soulMark || 0, 3.4);
      break;
    case "nailMark": {
      const cap = owner.char.passive.id === "strawDoll" ? 6 : 3;
      const dur = owner.char.passive.id === "strawDoll" ? 6.5 : 3.2;
      s.nailMarks = Math.min(cap, (s.nailMarks || 0) + 1);
      s.nailT = dur;
      break;
    }
    case "cursedSpeech":
      s.snare = Math.max(s.snare || 0, 1.7);
      target.hitstun = Math.max(target.hitstun, 0.28 + (extra.stunBonus || 0));
      break;
    case "gust": {
      const dir = sign(target.x - owner.x) || 1;
      target.vx += dir * 90;
      target.vy -= 60;
      break;
    }
    case "heavenly":
      target.invuln = Math.min(target.invuln, 0.02);
      break;
    case "silence":
      s.silence = Math.max(s.silence || 0, 3.0);
      popup(target.x, target.y - 150, "TECHNIQUE SEALED", "#a8aeb8", 18);
      break;
    // Dagon — soaked to the bone. No damage of its own: waterlogged clothes and
    // a foot of standing water are a movement tax, and Dagon hits a soaked
    // target harder (his `tideBorn` passive).
    case "drench":
      s.drench = Math.max(s.drench || 0, 3.2);
      break;
    // Kurourushi — the Festering Life Sword's eggs hatch inside the wound.
    // Stacks: each new cut adds a generation, up to three, and the whole colony
    // ticks together. Unlike bleed it does not care whether the victim moves.
    case "infest": {
      const stacks = Math.min(3, (s.infest?.stacks || 0) + 1);
      s.infest = { t: 4.0, tick: 0.55, dmg: 0.9 + stacks * 0.5, stacks, from: owner };
      break;
    }
    // Kurourushi — Earthen Insect Trance. The sacs burst across the eyes: they
    // fight at a discount and their evasion is a guess (see fighter.js).
    case "blind":
      s.blind = Math.max(s.blind || 0, 2.4);
      popup(target.x, target.y - 150, "BLINDED", "#8f3b4e", 18);
      break;
    case "weaponBreak":
      break; // handled at shield contact
    default:
      break;
  }
}

export function updateStatuses(f, dt) {
  const s = f.statuses;
  if (s.burn) {
    noteFireBurning(); // the fire bed runs while anything is alight, not per tick
    s.burn.t -= dt;
    s.burn.tick -= dt;
    if (s.burn.tick <= 0) {
      s.burn.tick = 0.45;
      f.damage += s.burn.dmg;
      burnTickFx(f.x, f.y - 80);
    }
    if (s.burn.t <= 0) s.burn = null;
  }
  if (s.bleed) {
    s.bleed.t -= dt;
    s.bleed.tick -= dt;
    if (s.bleed.tick <= 0 && Math.abs(f.vx) > 130) {
      s.bleed.tick = 0.5;
      f.damage += s.bleed.dmg;
      bleedTickFx(f.x, f.y - 70, sign(f.vx) || 1);
    }
    if (s.bleed.t <= 0) s.bleed = null;
  }
  if (s.poison) {
    s.poison.t -= dt;
    s.poison.tick -= dt;
    if (s.poison.tick <= 0) {
      s.poison.tick = 0.5;
      f.damage += s.poison.dmg;
      burst(f.x, f.y - 80, "#9edb7e", 5, 0.4);
    }
    if (s.poison.t <= 0) s.poison = null;
  }
  if (s.infest) {
    s.infest.t -= dt;
    s.infest.tick -= dt;
    if (s.infest.tick <= 0) {
      s.infest.tick = 0.55;
      f.damage += s.infest.dmg;
      specks(f.x, f.y - 80, 5, 0.6);
      // The colony eats for its parent: Kurourushi's hunger is fed by the
      // infestation as well as by its own blows.
      feedHunger(s.infest.from, s.infest.dmg);
    }
    if (s.infest.t <= 0) s.infest = null;
  }
  if (s.snare > 0) s.snare -= dt;
  if (s.drench > 0) {
    s.drench -= dt;
    // still dripping — a soaked fighter reads as soaked between hits
    if (Math.random() < 3 * dt) spray(f.x + (Math.random() - 0.5) * 48, f.y - 30, 0, 1, 0.3);
  }
  if (s.blind > 0) s.blind -= dt;
  if (s.soulMark > 0) s.soulMark -= dt;
  if (s.silence > 0) s.silence -= dt;
  if (s.nailT > 0) {
    s.nailT -= dt;
    if (s.nailT <= 0) s.nailMarks = 0;
  }
}

/** Kurourushi's bottomless appetite: it recovers a fraction of everything it
 *  does to somebody. Called from every landed hit and from every infest tick,
 *  which is why it lives here rather than inside applyHit — the colony keeps
 *  eating long after the blow that planted it.
 *
 *  `Parthenogenesis` (its ultimate) raises the share through `installs.lifesteal`
 *  rather than adding a second path, so there is one rule for the appetite. */
export function feedHunger(owner, dmg) {
  if (!owner?.char || owner.char.passive.id !== "infiniteHunger" || !(dmg > 0)) return;
  const share = 0.12 + (owner.installs?.lifesteal || 0);
  owner.damage = Math.max(0, owner.damage - dmg * share);
}

// ------------------------------------------------------------------- hits

function shieldDamageMult(target) {
  return target.char.passive.id === "limitlessGuard" ? 0.55 : 1;
}

/** The victim's stick as a unit vector, or null when they aren't holding one. */
function diStick(target) {
  const i = target.input;
  if (!i) return null;
  const x = (i.right ? 1 : 0) - (i.left ? 1 : 0);
  const y = (i.down ? 1 : 0) - (i.up ? 1 : 0);
  if (!x && !y) return null;
  const m = Math.hypot(x, y);
  return { x: x / m, y: y / m };
}

/**
 * The angle a hit actually launches at.
 *
 * Almost every move names a fixed one. `SAKURAI` is the exception, and it is
 * Smash's angle 361: on an airborne target it is a clean 44 degrees, and on a
 * grounded one it runs nearly along the floor until the hit is strong enough to
 * lift them, at which point it snaps up. That single behaviour is what lets one
 * jab combo at low percent and push out at high percent instead of being two
 * different moves, and it is why jabs and tilts in Smash feel the way they do.
 */
function resolveAngle(hit, target, kb) {
  const a = hit.angle ?? 0.35;
  if (a !== SAKURAI) return a;
  if (!target.grounded) return SAKURAI_AIR;
  return kb < SAKURAI_KB ? SAKURAI_LOW : SAKURAI_POP;
}

/** Launch vector for an attack angle, in screen space (y grows downward). */
function launchVector(angle, dir) {
  return angle < 0
    ? { x: dir * Math.cos(Math.abs(angle)), y: Math.sin(-angle) }
    : { x: dir * Math.cos(Math.abs(angle)), y: -Math.sin(Math.abs(angle)) };
}

function diAngle(target, angle, dir) {
  const s = diStick(target);
  if (!s) return angle;
  const v = launchVector(angle, dir);
  // Cross product: how far off the launch line the stick sits, and which side.
  // Subtracted because a larger `angle` means a steeper *upward* launch, so
  // holding down has to reduce it — hold a direction, go that way.
  const cross = v.x * s.y - v.y * s.x;
  return angle - cross * DI_MAX_TURN * dir;
}

function diSpeedScale(target, angle, dir) {
  const s = diStick(target);
  if (!s) return 1;
  const v = launchVector(angle, dir);
  return 1 + (v.x * s.x + v.y * s.y) * DI_SPEED;   // dot: along = faster
}

// Move staling. Smash keeps a queue of recently-landed moves and weakens
// repeats, which is what stops a match collapsing into whichever single button
// kills best. Dodges already stale here (fighter.js); attacks did not.
/** Stable identity for a move, so the same attack stales across uses. */
function moveId(hit) {
  return hit.label || hit.anim || hit.sfx || "hit";
}

function staleCount(owner, id) {
  return owner.recentMoves ? owner.recentMoves.filter((m) => m === id).length : 0;
}

function pushStale(owner, id) {
  owner.recentMoves = owner.recentMoves || [];
  owner.recentMoves.push(id);
  if (owner.recentMoves.length > STALE_QUEUE) owner.recentMoves.shift();
}

/**
 * Where a hit visibly lands, for the impact FX.
 *
 * Melee: the seam between the swing's live rect and the victim's hurtbox —
 * x at the middle of their overlap, y at the ATTACKER's arm height clamped
 * into it (the swing rect is deliberately generous downward so it catches a
 * croucher, and the overlap's own midpoint would put every spark at the
 * waist). Projectiles: the shot's centre clamped into the box. Script hits
 * (ultimate set pieces) keep the old victim-centre offsets — their shapes
 * are ad hoc and their FX are usually the set piece itself.
 */
function contactPoint(owner, target, hit, source, dir) {
  const box = hurtbox(target);
  if (source === "projectile" && hit.x != null && hit.r != null) {
    return {
      x: clamp(hit.x, box.x, box.x + box.w),
      y: clamp(hit.y, box.y, box.y + box.h),
    };
  }
  if (source === "melee" && hit.owner === owner && hit.ox != null && hit.dur != null) {
    const r = hitboxRect(hit);
    const x0 = Math.max(r.x, box.x), x1 = Math.min(r.x + r.w, box.x + box.w);
    const y0 = Math.max(r.y, box.y), y1 = Math.min(r.y + r.h, box.y + box.h);
    if (x1 > x0 && y1 > y0) {
      const armY = owner.y - bodyMetrics(owner.spriteChar || owner.charKey).height * 0.55;
      return { x: (x0 + x1) / 2, y: clamp(armY, y0, y1) };
    }
  }
  return { x: target.x + dir * -14, y: target.y - 96 };
}

export function applyHit(owner, target, hit, source) {
  // The one gate every damage path funnels through, so friendly fire is off in
  // a team match no matter which kit spawned the hit (teams.js).
  if (!isFoe(owner, target)) return "ignored";
  if (target.invuln > 0 || target.dead || target.respawnTimer > 0) return "ignored";
  if (owner.dead || owner.respawnTimer > 0) return "ignored";

  const dir = sign(target.x - owner.x) || owner.facing;

  // active counter (Gojo Infinity)
  if (target.counter && target.counter.t > 0) {
    triggerCounter(target, owner);
    return "countered";
  }

  // A landed hit shakes any grab apart (?throw=true): striking the grabber
  // frees their victim, and a third party striking the victim knocks them out
  // of the hands holding them. The holder's own pummel is exempt (grab.js).
  breakGrabsOn(target, owner);

  let dmg = hit.dmg;
  let baseKb = hit.baseKb;
  let growth = hit.growth;
  let label = hit.label;

  // Staling is applied before every other multiplier so crits, installs and
  // passives scale the already-weakened value rather than papering over it.
  const mid = moveId(hit);
  const stale = staleCount(owner, mid);
  if (stale) {
    dmg *= Math.max(0.25, 1 - stale * STALE_DMG_STEP);
    baseKb *= Math.max(0.4, 1 - stale * STALE_KB_STEP);
    growth *= Math.max(0.4, 1 - stale * STALE_KB_STEP);
  }

  const unblockable = hit.unblockable || (owner.installs && owner.installs.unblockable);

  // shield
  if (target.shielding && !unblockable) {
    const sinceRaise = state.matchTime - target.shieldRaisedAt;
    if (sinceRaise <= PARRY_WINDOW) {
      // perfect shield
      popup(target.x, target.y - 160, "PARRY!", "#ffffff", 30);
      ring(target.x, target.y - 90, target.char.theme, 90);
      rumbleEvent(target, "parry");
      playSfx("guardHit", 1, 1.3);
      owner.hitPause = Math.max(owner.hitPause, 0.34);
      target.hitPause = Math.max(target.hitPause, 0.1);
      target.meter = clamp(target.meter + 6, 0, METER_MAX);
      state.camera.shake = Math.max(state.camera.shake, 5);
      return "parried";
    }
    let shieldDmg = dmg * SHIELD_DAMAGE_MULT * (hit.shieldMul || 1) * shieldDamageMult(target);
    if (hit.effect === "weaponBreak") shieldDmg += 18;
    if (hit.effect === "heavenly") shieldDmg += 14;
    target.shield -= shieldDmg;
    target.shieldStun = 0.1 + dmg * 0.012;
    target.vx += dir * (90 + dmg * 14);
    playSfx("guardHit", 0.85);
    burst(target.x + dir * -30, target.y - 90, "#cfe4ff", 14, 0.8);
    state.camera.shake = Math.max(state.camera.shake, 3);
    if (target.shield <= 0) shieldBreak(target);
    return "blocked";
  }

  // armor: damage but no launch
  const armored = (target.installs && target.installs.armor) || target.armorT > 0;

  // Sweetspot / sourspot. A `critBand` is a distance band: land inside it and
  // the hit is stronger, land outside it and — if the band says so — weaker.
  //
  // This began as Nanami's 7:3 and is now how range is paid for generally. A
  // swing drawn reaching well past the roster gets a band at the end of its arc
  // (tipBand in moves.js), so a long disjoint hits hardest at the very tip and
  // feebly up close. That is Marth's tipper, and it makes reach something a
  // player spaces for rather than a number they were handed. Nanami's authored
  // band still wins wherever he has one, with his own multipliers and caption.
  const dx = Math.abs(target.x - owner.x);
  const band = hit.critBand;
  let zone = null;
  if (band) {
    // A derived tipper (moves.js tipBand) is measured from the swinger's
    // centre, while `dx` is centre-to-centre — the band sits outside the tip
    // by the VICTIM's half-width. The baked `center` stood that in with a
    // fixed 30 px because the victim is unknown at build time; the victim is
    // known here, so use their real half-width (a tipper on a narrow target
    // sat outside anything the swing could touch, and inside a broad one).
    // An authored band (no `ring`) is a character decision and keeps its own
    // centre.
    const center = band.ring != null
      ? band.ring + bodyMetrics(target.spriteChar || target.charKey).width / 2
      : band.center;
    zone = Math.abs(dx - center) <= band.tolerance ? "sweet"
      : band.sourDmg || band.sourKb ? "sour" : null;
  }
  if (hit.critChance && Math.random() < hit.critChance) zone = "sweet";
  if (zone === "sweet") {
    dmg *= band?.dmg ?? 1.36;
    baseKb *= band?.kb ?? 1.22;
    growth *= band?.growth ?? 1.15;
    const caption = band?.label || "7:3!";
    label = caption.replace("!", "") + " " + (label || "");
    popup(target.x, target.y - 175, caption, "#ffd35a", 26);
    // The ratio drawn onto the target: a precise gold seam, sparks along it.
    ratioSeamFx(target.x, target.y - 96, dir);
    playSfx("hitCrit");
    playSfx("seamCrack", 0.9); // the seam snapping onto the target
  } else if (zone === "sour") {
    dmg *= band.sourDmg ?? 1;
    baseKb *= band.sourKb ?? 1;
    growth *= band.sourKb ?? 1;
  }

  // Black Flash (Yuji): cursed energy lands within a millionth of a second of
  // the fist. Rolled before the other multipliers so installs scale it too.
  if (owner.char.passive.id === "blackFlash" && source === "melee" && Math.random() < 0.12) {
    dmg *= 1.35; baseKb *= 1.15; growth *= 1.1;
    owner.meter = clamp(owner.meter + 10, 0, METER_MAX);
    popup(target.x, target.y - 178, "BLACK FLASH!", "#ff3b30", 26);
    playSfx("blackFlash");
    // The full canon treatment: white core, red-and-black lightning
    // fractures, the world dropping dark and quiet for a beat, and a
    // tick-then-slam rumble on both pads (config_fx.js BLACK_FLASH/RUMBLE).
    blackFlashFx(target.x, target.y - 96);
    duckMusic(BLACK_FLASH.duckTo, BLACK_FLASH.duckTime);
    rumbleEvent(owner, "blackFlash");
    rumbleEvent(target, "blackFlash");
    state.camera.shake = Math.max(state.camera.shake, 8);
    state.slowMo = Math.max(state.slowMo, 0.12);
  }

  // status & passive multipliers
  if (target.statuses.soulMark > 0) { dmg *= 1.18; growth *= 1.1; }
  // Kurourushi's blinding liquid: they are swinging at a shape, not a fighter.
  if (owner.statuses.blind > 0) dmg *= 0.88;
  // Dagon hits a soaked target harder — water conducts what he is.
  if (owner.char.passive.id === "tideBorn" && target.statuses.drench > 0) dmg *= 1.15;
  // Mechamaru's Heavenly Restriction is output, not muscle: it pays out on
  // everything that is NOT his own fists, and the puppet frame pays for it.
  if (owner.char.passive.id === "heavenlyOutput" && source !== "melee") dmg *= 1.15;
  if (target.char.passive.id === "heavenlyOutput") dmg *= 1.08;
  if (target.char.passive.id === "openSky" && !target.grounded) dmg *= 0.88;
  if (owner.char.passive.id === "kingsContempt" && target.damage >= 80) dmg *= 1.1;
  if (owner.char.passive.id === "rikaBond" && owner.damage >= 100) dmg *= 1.12;
  if (owner.installs && owner.installs.dmgMul) dmg *= owner.installs.dmgMul;
  if (target.installs && target.installs.dmgTakenMul) dmg *= target.installs.dmgTakenMul;
  if (target.char.passive.id === "barkArmor" && target.grounded) dmg *= 0.88;
  if (owner.cpuDamageMul) dmg *= owner.cpuDamageMul;

  dmg = Math.round(dmg * 10) / 10;
  target.damage = Math.min(999, target.damage + dmg);
  feedHunger(owner, dmg);  // Kurourushi eats what it hurts
  pushStale(owner, mid);   // only landed hits stale; whiffs cost nothing

  // meter economy
  let mGain = dmg * METER_ON_DEAL;
  if (owner.char.passive.id === "gamblersFlow") mGain *= 1.3;
  if (owner.char.passive.id === "warCompensation") mGain *= 1.25;
  owner.meter = clamp(owner.meter + mGain, 0, METER_MAX);
  target.meter = clamp(target.meter + dmg * METER_ON_TAKE, 0, METER_MAX);
  if (owner.char.passive.id === "heavenlyVoid") target.meter = clamp(target.meter - 4, 0, METER_MAX);
  if (owner.char.passive.id === "bestFriend" && hit.heavy) owner.meter = clamp(owner.meter + 8, 0, METER_MAX);

  // knockback
  let kb = (baseKb + target.damage * growth) / target.char.stats.weight;
  // Star Rage (Yuki): the mass is virtual, so it never weighs HER down — it is
  // only ever spent on whatever she hits.
  if (owner.char.passive.id === "virtualMass") kb *= 1.2;
  if (target.char.passive.id === "cursedCorpse") kb *= 0.9;
  if (target.char.passive.id === "openSky" && !target.grounded) kb *= 0.88;
  // Chimera Shadow Garden cushions its owner — the shadow takes the impact.
  kb *= domainKnockbackMul(target);
  const stunBonus = hit.stunBonus || 0;

  // Directional Influence. The victim's stick bends the launch angle and
  // nudges its magnitude, so surviving a hit is something the defender does
  // rather than something that happens to them. Without it every exchange is
  // decided entirely by the attacker and combos are all-or-nothing.
  //
  // Perpendicular DI: only stick input ACROSS the launch vector turns it,
  // which is what makes the classic "DI away to live, DI in to escape" read
  // work. Held toward/away instead trades a little launch speed.
  const authored = resolveAngle(hit, target, kb);
  const angle = diAngle(target, authored, dir);
  kb *= diSpeedScale(target, authored, dir);

  if (armored) {
    popup(target.x, target.y - 150, "ARMOR", "#c9b6ff", 20);
    target.vx += dir * 60;
  } else {
    // a hit knocks a hanging fighter off the ledge
    if (target.ledge) {
      target.ledge = null;
      target.ledgeCooldown = 0.5;
    }
    target.vx = dir * Math.cos(Math.abs(angle)) * kb;
    let slammed = false;
    // Where the hit sends them. Three cases, and which one applies is the
    // difference between a game that has a grounded layer and one that does
    // not — every hit used to add a flat 120 px/s of lift and clear `grounded`,
    // so nothing could ever travel along the floor and no angle under about 30
    // degrees survived contact with the code (docs/hitbox-audit.md 3.3).
    const lift = Math.sin(Math.abs(angle)) * kb;
    if (angle < 0) {
      if (target.grounded) {
        // A meteor cannot drive someone through a floor they are standing on.
        // It bounces them off it instead, and leaves them down.
        target.vy = -lift * GROUND_SPIKE_BOUNCE;
        target.grounded = false;
        slammed = true;
        label = label || "SLAM";
      } else {
        target.vy = lift;     // spike: downward
        target.grounded = false;
        label = label || "METEOR";
      }
    } else if (target.grounded && lift < GROUND_RELEASE) {
      // Not enough to lift them. The energy goes along the ground instead of
      // being quietly converted into a pop, which is what makes a down tilt a
      // down tilt and what a jab needs to combo out of at low percent.
      target.vy = 0;
      target.vx *= GROUND_SLIDE_BOOST;
    } else {
      target.vy = -lift;
      target.grounded = false;
    }
    // Tumble. Past a threshold the victim rotates through the launch rather
    // than sliding through it rigidly — the single biggest readability win on
    // a hit, since `hurt` is one still frame for every character. A fighter
    // still on their feet slides; only a launched one spins.
    if (kb > TUMBLE_KB_MIN && !target.grounded) {
      const rate = Math.min((kb - TUMBLE_KB_MIN) * TUMBLE_SPIN_PER_KB, TUMBLE_SPIN_MAX);
      target.spin = dir * rate;
    }
    let stun = clamp(0.12 + kb * 0.00048 + stunBonus, 0.12, 1.35);
    if (target.char.passive.id === "oldGuard") stun *= 0.75; // barely flinches
    target.hitstun = stun;
    // A fresh launch overrides a knockdown: getting hit off the floor is being
    // hit, not lying down. Moves that WANT the victim flat (`knockdown: true`,
    // e.g. Reggie's sedan) arm the prone timer instead — it starts counting
    // once they are down and the hitstun has run out (see fighter.js).
    // A meteor that met the floor also leaves them down, without the move
    // having to ask for it: being spiked into the ground you are standing on is
    // a knockdown by definition.
    target.prone = hit.knockdown || slammed
      ? Math.max(target.prone, hit.proneTime ?? (slammed ? 0.6 : 1.1))
      : 0;
    interruptActions(target);
  }

  target.invuln = 0.06;
  if (hit.effect === "heavenly") target.invuln = 0.02;

  // hitlag / freeze frames
  const lag = clamp(0.028 + dmg * 0.0045, 0.03, 0.15) * (hit.heavy ? 1.25 : 1);
  owner.hitPause = Math.max(owner.hitPause, lag);
  target.hitPause = Math.max(target.hitPause, lag * 1.1);
  target.shakeMag = 3 + Math.min(6, dmg * 0.4);
  // Rumble scales off the same magnitudes hitlag does: the victim's pad
  // thumps with the damage, the attacker's carries a weaker echo of it.
  const rStrong = Math.min(1, dmg * RUMBLE.hitScale);
  rumbleFighter(target, rStrong, rStrong * 0.5, RUMBLE.hitTime + lag);
  rumbleFighter(owner, rStrong * RUMBLE.attackerEcho, rStrong * 0.4, RUMBLE.hitTime);

  // presentation — element-aware: a magma hit burns, a blade hit glints, and
  // a kit with no fxElement tags draws exactly the old theme burst. Placed at
  // the CONTACT POINT — where what hit overlaps what was hit — rather than a
  // fixed offset from the victim's centre, which parked every spark at the
  // same spot on the body regardless of where the fist visibly was.
  const cp = contactPoint(owner, target, hit, source, dir);
  const hx = cp.x;
  const hy = cp.y;
  const fxEl = elementOf(hit, owner);
  hitFx(fxEl, hx, hy, dir, dmg, owner.char.theme);
  // The element's own sound, layered quietly under the hit sound, louder with
  // the damage behind it. All seven elements have a file; an element with no
  // registry entry would simply be silent here.
  if (ELEMENT_HIT_SFX[fxEl]) playSfx(ELEMENT_HIT_SFX[fxEl], Math.min(0.9, 0.45 + dmg / 34));
  popup(target.x, target.y - 132, `${dmg}%`, "#ffffff", 20 + Math.min(16, dmg));
  if (label) popup(target.x - dir * 26, target.y - 160, label, owner.char.theme, 17);
  state.camera.shake = Math.max(state.camera.shake, clamp(4 + dmg * 0.5, 4, 15));
  if (kb > 880) {
    rumbleEvent(target, "launch");
    state.slowMo = Math.max(state.slowMo, 0.1);
    state.camera.kick = 0.14;
  }
  playSfx(hit.sfx === "melee" ? "punch" : hit.sfx || "punch", Math.min(1.05, 0.7 + dmg / 26));

  applyStatus(hit.effect, owner, target, { stunBonus: hit.stunBonus });

  // Rika echoes Yuta's blows during Full Manifestation
  if (owner.installs && owner.installs.echoDamage && source === "melee") {
    const bonus = Math.round(dmg * owner.installs.echoDamage * 10) / 10;
    target.damage = Math.min(999, target.damage + bonus);
    popup(target.x + dir * 30, target.y - 190, `RIKA +${bonus}%`, "#e8ecf8", 18);
    sparkLine(hx, hy - 30, dir, "#e8ecf8", 10);
  }

  // Jogo's Iron Mountain sears anyone who strikes him up close
  if (target.installs && target.installs.contactBurn && source === "melee") {
    applyStatus("burn", target, owner);
    burst(owner.x, owner.y - 80, "#ff7a2f", 10, 0.7);
  }

  recordHit(owner, target, dmg, armored);
  return "hit";
}

// How long a hit stands as KO credit. A fighter launched off the top of the
// stage is often nowhere near whoever hit them by the time they cross the blast
// line, so the credit has to outlive the contact — but not so far that a stray
// poke thirty seconds ago claims a self-destruct.
const KO_CREDIT_TIME = 4;

/** The bookkeeping every landed hit does for the SCREEN rather than for the
 *  simulation: the result-screen tally, the combo chain, and who to credit if
 *  this hit turns out to have been the one that ended a stock.
 *
 *  Deliberately at the very end of applyHit, where a hit is known to have
 *  actually landed and `dmg` is final — every multiplier, the shield and armor
 *  branches, and Rika's echo have all had their say by here. Nothing in this
 *  function is read back by the simulation, so it cannot desync anything. */
function recordHit(owner, target, dmg, armored) {
  owner.tally.dealt += dmg;
  target.tally.taken += dmg;
  owner.tally.biggestHit = Math.max(owner.tally.biggestHit, dmg);
  target.lastHitBy = owner;
  target.lastHitT = KO_CREDIT_TIME;

  // A combo is counted against ONE victim: hits spread across a Battle Royal
  // are not a combo, they are a busy afternoon. The chain continues only while
  // the previous hit's window is still open on the same target.
  const continuing = owner.comboT > 0 && owner.comboTarget === target;
  owner.combo = continuing ? owner.combo + 1 : 1;
  owner.comboTarget = target;
  // Open for as long as the victim cannot act, plus a little. An armored hit
  // grants no hitstun, so it gets the grace alone.
  owner.comboT = (armored ? 0 : target.hitstun) + COMBO_GRACE;
  owner.tally.bestCombo = Math.max(owner.tally.bestCombo, owner.combo);

  // Taking a hit ends whatever you were building. Otherwise two fighters
  // trading blows both read as being on a ten-hit run.
  target.combo = 0;
  target.comboT = 0;
  target.comboTarget = null;
}

/** Steps the two timers recordHit sets. Called once per sim step per fighter
 *  from the main loop — outside updateFighter, which returns early during
 *  hitlag and would freeze the combo window along with the fighter. */
export function stepHitCredit(f, dt) {
  if (f.comboT > 0) {
    f.comboT -= dt;
    if (f.comboT <= 0) { f.combo = 0; f.comboTarget = null; }
  }
  if (f.lastHitT > 0) {
    f.lastHitT -= dt;
    if (f.lastHitT <= 0) f.lastHitBy = null;
  }
}

/**
 * Can this action still be knocked out of the fighter doing it?
 *
 * `uninterruptible` is the flat answer most actions give. `commitAt` is the
 * softer one a spoken cast gives: interruptible up to that point in the
 * wind-up, committed after it. A Domain Expansion can be shouted down while it
 * is being announced, but once the sentence is most of the way out the move is
 * already happening and taking it back would read as the game reneging.
 */
function interruptible(a) {
  if (!a || a.uninterruptible) return false;
  return a.commitAt === undefined || a.t < a.commitAt;
}

function interruptActions(target) {
  if (interruptible(target.action)) {
    // Actions that need to say something when they are cut off — refunds,
    // cutting a spoken line short — hook it here. Nothing else sets this.
    target.action.onInterrupt?.(target);
    target.action = null;
  }
  target.charging = null;
  if (target.healing) target.healing = null;
  target.counter = null;
  target.reflect = null;
}

export function shieldBreak(target) {
  target.shield = 0;
  target.shielding = false;
  target.dizzy = SHIELD_BREAK_STUN;
  target.vy = -420;
  target.grounded = false;
  banner("SHIELD BREAK!", "#ff8a8a", { y: 180, size: 44, life: 1.2 });
  playSfx("guardBreak", 0.9);
  burst(target.x, target.y - 90, "#cfe4ff", 40, 1.4);
  state.camera.shake = Math.max(state.camera.shake, 12);
  rumbleEvent(target, "shieldBreak");
}

export function triggerCounter(target, attacker) {
  const c = target.counter;
  target.counter = null;
  target.invuln = Math.max(target.invuln, 0.5);
  popup(target.x, target.y - 168, c.name || "COUNTER!", target.char.theme, 26);
  ring(target.x, target.y - 90, target.char.theme, 130);
  playSfx("parry", 1);
  state.slowMo = Math.max(state.slowMo, 0.16);
  state.camera.shake = Math.max(state.camera.shake, 10);
  // retaliation only lands at melee range — countering a projectile from
  // across the stage still nullifies it, but doesn't punish the shooter
  if (Math.abs(attacker.x - target.x) < 300) {
    applyHit(target, attacker, {
      dmg: c.dmg, baseKb: c.baseKb, growth: c.growth, angle: c.angle,
      label: c.label, sfx: "blast", unblockable: true,
    }, "counter");
  }
}
