// Persistent ally minions: shikigami, curses, transfigured humans.
//
// A summon differs from a projectile in that it lives on the stage, picks its
// own targets, and acts on a cadence. It is data-driven: characters describe a
// summon in their kit config and this module supplies the behavior.
//
// Behaviors:
//   chaser  — grounded pursuer that lunge-bites what it catches
//   bomber  — pursuer that detonates on contact and dies
//   support — hovers behind its owner and fires projectiles at the target
//   brawler — a whole CHARACTER on the board: walks, jumps, and swings a real
//             move set chosen by its own AI (Megumi's Mahoraga)
//
// LIFECYCLE. A summon is not simply switched on and off. It ARRIVES: it forms
// in the air over its landing point, fades up out of nothing, and drops into
// the scene, and the landing is what makes it real — before it touches down it
// cannot hit anything and nothing can hit it. It LEAVES the same way: the last
// seconds of its lifetime it FLASHES, faster and faster, so the moment it is
// about to go is something the player can read off the screen instead of
// something they have to count; then it dissipates upward and is gone. Only a
// summon that was KILLED skips all of that and bursts on the spot, because that
// is the difference worth showing between the timer running out and the
// opponent taking it apart.
//
// PILOTING. Every summon hunts on its own the moment it lands, so casting one
// is never worse than it was. Push the RIGHT STICK and the owner takes the
// reins instead: the summon goes where the stick points until the stick has
// been at rest for PILOT_RELEASE seconds, then resumes hunting. It keeps
// attacking on contact either way — you steer it, you do not have to also
// swing it, which is what makes driving one playable alongside your own
// fighter. Grounded summons steer horizontally and JUMP on up — landing on
// platforms like a fighter, fast-falling on down. Only the support flyer reads
// the vertical axis as flight.
//
// Summons are lifetime-limited and capped per (owner, id): recasting past the
// cap dismisses the oldest. They die with their owner's elimination; match
// reset clears state.entities wholesale.
//
// THEY CAN ALSO BE KILLED. A summon has hit points and takes damage from any
// enemy attack that reaches it — melee, projectile, another summon's bite. That
// makes casting one a real commitment rather than free board presence: the
// opponent can answer it by hitting it, instead of only by running away from it
// until the timer runs out. Damage does not knock a summon back; it wears it
// down and then it bursts.

import { state } from "./state.js";
import { clamp, sign, rand, rectsOverlap } from "./utils.js";
import { applyHit, hurtbox, spawnProjectile, ownerStick } from "./combat.js";
import { isFoe } from "./teams.js";
import { burst, dust, ring, popup, emit } from "./particles.js";
import { playSfx } from "./audio.js";
import { getImage } from "./assets.js";
import { drawCharFrame, currentFrame } from "./sprites.js";
import { SUMMON_ANIMS } from "./config_summons.js";
import { MOTION } from "./config_tuning.js";
import { METER_MAX } from "./constants.js";

// Seconds of a centred stick before a piloted summon goes back to hunting on
// its own. Long enough to survive a thumb repositioning mid-drive, short enough
// that letting go reads as "you have it back" rather than as a stuck summon.
const PILOT_RELEASE = 1.2;

// A piloted summon moves at this multiple of its hunting speed. Slightly faster
// is the reward for spending attention on it.
const PILOT_SPEED_MUL = 1.15;

// Vertical bounds for a flying summon under manual control, so it cannot be
// driven into the blast zones or under the stage.
const PILOT_CEILING = 90;

// A grounded summon's jump, for reaching platforms and airborne enemies. Only
// piloted summons jump — hunting ones have no way to decide it is worth it, and
// a shikigami that hops on its own looks like a bug rather than a tactic. The
// brawler is the exception: it decides like a fighter does.
const PILOT_JUMP_VY = -900;
const PILOT_GRAVITY = 2400;
const PILOT_FASTFALL = 1.7;

// How far up the stick must go to count as a jump. Well above the deadzone, so
// steering a flyer diagonally never launches a dog.
const PILOT_JUMP_AXIS = 0.6;

// ---------------------------------------------------------------- lifecycle

// How long the arrival takes: the shape forms out of nothing, hangs for an
// instant, and drops. Short enough that casting still feels immediate — the
// summon is committed the frame you press the button — long enough that the
// board reads "something is coming down HERE" before it lands.
const APPEAR_TIME = 0.5;

// How far above its landing point a summon forms. Roughly two body heights, so
// the drop is a fall rather than a step.
const APPEAR_DROP = 230;

// The exit: fade out, drift up, come apart. Long enough to be seen, short
// enough that a dismissed summon is out of the fight immediately (it stops
// acting the moment this starts).
const VANISH_TIME = 0.55;

// How long before the timer expires a summon starts flashing. The blink starts
// slow and ends frantic, the way a Smash item announces its own despawn: the
// point is that "about to leave" is legible without a HUD element.
const EXPIRE_FLASH = 1.5;
const FLASH_HZ_MIN = 3.5;
const FLASH_HZ_MAX = 15;

// Hit points by behaviour, when a kit does not name its own. A bomber spends
// itself on contact, so it is glass; a support summon sits behind its owner
// where it is hard to reach, so it does not need much either. The chaser is the
// one that walks into the fight, and the one worth the opponent's time to kill.
// A brawler is an ultimate's whole payoff and is priced like one.
const DEFAULT_HP = { chaser: 46, bomber: 22, support: 34, brawler: 150 };

// Killing a summon is worth meter, on the same principle as popping a stage
// hazard: it took real attacks to do, and it should not be a pure tempo loss
// for the player who did it.
const KILL_METER = 6;

function grantMeterForKill(f) {
  if (!f || f.dead) return;
  f.meter = clamp(f.meter + KILL_METER, 0, METER_MAX);
}

function groundY() {
  return state.platforms.length ? state.platforms[0].y : 568;
}

// The surface a falling summon should land on: the highest platform it is over
// and was above last step. Mirrors the fighter rule (see resolvePlatforms) so
// a dog stands where a fighter would, minus the drop-through handling — nothing
// gives a summon the input to drop through.
function landingY(x, prevY, y, vy) {
  if (vy < 0) return null;
  let best = null;
  for (const plat of state.platforms) {
    if (plat.ghost) continue;
    const margin = plat.kind === "main" ? 14 : 24;
    if (x < plat.x - margin || x > plat.x + plat.w + margin) continue;
    if (prevY <= plat.y + 4 && y >= plat.y) {
      if (best === null || plat.y < best) best = plat.y;
    }
  }
  return best;
}

// Is there still a platform holding this summon up at `y`? A summon that walks
// off the end of the ledge it landed on has to start falling — without this it
// would be pinned to that height out over open air.
function supported(x, y) {
  for (const plat of state.platforms) {
    if (plat.ghost) continue;
    if (Math.abs(plat.y - y) > 1) continue;
    const margin = plat.kind === "main" ? 14 : 24;
    if (x >= plat.x - margin && x <= plat.x + plat.w + margin) return true;
  }
  return false;
}


function nearestTarget(owner, x) {
  let best = null;
  let bestD = Infinity;
  for (const f of state.fighters) {
    if (!isFoe(owner, f) || f.dead || f.respawnTimer > 0) continue;
    const d = Math.abs(f.x - x);
    if (d < bestD) { bestD = d; best = f; }
  }
  return best;
}

// First loaded image from a preference list, so placeholder art can ship now
// and dedicated art (docs/asset-requests.md) drops in without code changes.
function summonImage(sprites) {
  for (const key of sprites || []) {
    const img = getImage(key);
    if (img) return img;
  }
  return null;
}

// ---------------------------------------------------------------- animation
//
// A summon animates off the small pose set in config_summons.js — a breath, a
// stride, a strike, a flinch — resolved POSE BY POSE against its still. So a
// creature with no frames at all draws exactly as every summon drew before
// they animated, one with only `move_a`/`move_b` runs and stands still on its
// portrait, and nothing has to be delivered as a complete set to be worth
// delivering.

/** The `summon:<key>` this creature's poses hang off: its first preference,
 *  which is the creature's own art. Later entries in `sprites` are borrowed
 *  stand-ins (an `effect:*` orb) and never own poses. */
function poseKeyOf(sprites) {
  const first = sprites?.[0];
  return first?.startsWith("summon:") ? first : null;
}

/** The drawing for one pose of one summon, or null if it was never delivered. */
function poseImage(baseKey, pose) {
  return baseKey ? getImage(`${baseKey}:${pose}`) : null;
}

/** The frame an animation is showing at `t`, skipping poses that do not exist
 *  — a two-frame idle with only `idle_a` drawn holds `idle_a` rather than
 *  blinking to nothing every other beat. */
function animFrame(baseKey, animKey, t) {
  const anim = SUMMON_ANIMS[animKey];
  if (!anim) return null;
  const drawn = anim.frames.filter((pose) => poseImage(baseKey, pose));
  if (!drawn.length) return null;
  const idx = Math.floor(t * anim.fps);
  const i = anim.loop ? idx % drawn.length : Math.min(idx, drawn.length - 1);
  return poseImage(baseKey, drawn[i]);
}

// A summon still on its way in, or already on its way out, does not count
// against the cap: dismissing something that is already dissipating would spend
// the recast for nothing.
function enforceCap(owner, id, maxActive) {
  const mine = state.entities.filter((e) =>
    e.kind === "summon" && e.owner === owner && e.id === id && !e.dead && e.vanishT <= 0);
  while (mine.length >= maxActive) {
    const oldest = mine.shift();
    oldest.dismiss();
  }
}

// ------------------------------------------------------------------ brawler
//
// The brawler's move set. A summon with this behavior is not a creature that
// bites whatever it touches — it is a character: it closes distance, picks a
// move for the situation, telegraphs it, and is committed to it once it starts.
// Every attack is windup -> active -> recover, which is what gives an opponent
// something to react to. Reach and height are measured from the summon's feet.
const BRAWLER_MOVES = {
  // The poke. Fast enough to punish someone standing next to it.
  swipe: {
    anim: "light", windup: 0.20, active: 0.14, recover: 0.24,
    reach: 118, high: 156, dmg: 9, base: 300, growth: 5.2, angle: 0.36,
    sfx: "slash",
  },
  // The commitment. Slow, loud, and worth respecting — the windup is long
  // enough to shield or walk out of, and eating one is a real launch.
  smash: {
    anim: "sideHeavy", windup: 0.40, active: 0.16, recover: 0.44,
    reach: 152, high: 190, dmg: 17, base: 480, growth: 7.4, angle: 0.5,
    sfx: "slashHeavy", heavy: true, shake: 7,
  },
  // Anti-air. Nobody should be able to answer a shikigami by standing on the
  // platform above it.
  cleave: {
    anim: "upHeavy", windup: 0.28, active: 0.16, recover: 0.34,
    reach: 120, high: 280, up: true, dmg: 13, base: 430, growth: 6.6, angle: 1.05,
    sfx: "slashHeavy", shake: 5,
  },
};

/** The box a brawler's move covers, from the summon's own position. A forward
 *  swing reaches out along its facing; an anti-air straddles it and goes up. */
function moveRect(s, move) {
  if (move.up) {
    return { x: s.x - move.reach / 2, y: s.y - move.high, w: move.reach, h: move.high };
  }
  return {
    x: s.dir > 0 ? s.x - 20 : s.x + 20 - move.reach,
    y: s.y - move.high, w: move.reach, h: move.high,
  };
}

export function spawnSummon(owner, cfg) {
  enforceCap(owner, cfg.id, cfg.maxActive || 1);

  const behavior = cfg.behavior || "chaser";
  const flies = behavior === "support";
  const bodyH = cfg.h ?? 110;

  const s = {
    kind: "summon",
    id: cfg.id,
    owner,
    behavior,
    // Which creature this is, out of its special's pool. Carried on the entity
    // (not just in the hit label) so anything looking at the stage can say what
    // is standing on it.
    creature: cfg.name || cfg.label || null,
    // The actor whose sprite set this summon animates through, for a brawler.
    // Everything else draws a single still image (cfg.sprites).
    actor: cfg.actor || null,
    x: clamp(owner.x - owner.facing * (cfg.backOff ?? 60) + (cfg.offsetX || 0), 90, 1190),
    y: groundY(),
    dir: owner.facing,
    t: 0,
    dur: cfg.duration ?? 6,
    bob: rand(0, Math.PI * 2),
    attackCd: cfg.firstAttackDelay ?? 0.5,
    lungeT: 0,
    dead: false,

    // --- lifecycle. `appearT` runs the arrival, `vanishT` the departure, and
    // `intangible` is true through both: a summon that has not landed cannot
    // hit or be hit, and neither can one that is already coming apart.
    appearT: APPEAR_TIME,
    vanishT: 0,
    intangible: true,
    blink: 0,
    moteT: 0,

    // Piloting. `piloted` latches on the first deliberate push of the right
    // stick and stays on through momentary re-centring, which is what `idleT`
    // measures.
    piloted: false,
    idleT: 0,
    // Airtime for a jumping grounded summon. `vy` is only meaningful while
    // airborne; `jumpArmed` makes the jump an edge on the stick rather than a
    // hop every frame the stick is held up.
    vy: 0,
    airborne: false,
    jumpArmed: true,

    // --- animation. `animKey` is the pose set being played (idle / move /
    // attack / hurt for a creature; a fighter anim key for a brawler) and
    // `animTime` is its playhead. `moving` and `attackT` are what the pose is
    // chosen from — see poseFor().
    animKey: "idle",
    animTime: 0,
    moving: false,
    attackT: 0,
    // brawler only: the move in progress and its decision clock.
    move: null,      // { name, def, t, hit:Set }
    decideT: 0,

    // --- recoil. A hit does not launch a summon (that would make every summon
    // a free KO setup for whoever hits it hardest) but it absolutely moves it:
    // `knockT` is the stagger, `knockVx` the shove, and both are clamped to the
    // stage so a shikigami can be pushed around and never off.
    knockT: 0,
    knockVx: 0,
    // How much of a shove this creature actually takes. A Max Elephant barely
    // rocks; a rabbit goes flying.
    knockTake: cfg.knockTake ?? 1,

    // Hit points. Scaled off the summon's own reach in the kit config rather
    // than a flat number: a bomber that dies on contact anyway should not
    // soak the same punishment as a chaser meant to hold ground for six
    // seconds.
    hp: cfg.hp ?? DEFAULT_HP[behavior] ?? 40,
    maxHp: cfg.hp ?? DEFAULT_HP[behavior] ?? 40,
    hurtT: 0,          // white flash after taking a hit
    // Mahoraga's wheel turns: past `adapt.hits` blows taken, everything after
    // lands for less. Only a kit that asks for it gets it.
    hitsTaken: 0,
    adapted: false,
    // The box it occupies, published on the entity so combat.js can test
    // against it without reaching into this module's config.
    hitW: cfg.hitW ?? 70,
    hitH: cfg.hitH ?? 90,

    /** Where the body is drawn this frame: the arrival still has it falling in,
     *  and the departure lifts it as it comes apart. A flyer only settles the
     *  last short distance — something that hovers does not FALL into a fight,
     *  it forms where it means to be. */
    drawY() {
      if (this.appearT > 0) {
        const p = 1 - this.appearT / APPEAR_TIME;
        return this.y - (flies ? 54 : APPEAR_DROP) * (1 - p * p);
      }
      if (this.vanishT > 0) {
        const p = 1 - this.vanishT / VANISH_TIME;
        return this.y - 44 * p * p;
      }
      return this.y;
    },

    /** 0..1 opacity for the whole drawing, across arrival and departure. */
    alpha() {
      if (this.appearT > 0) return clamp((1 - this.appearT / APPEAR_TIME) / 0.45, 0, 1);
      if (this.vanishT > 0) return clamp(this.vanishT / VANISH_TIME, 0, 1);
      return 1;
    },

    /** How hard the body is blown out to white this frame: the expiry blink,
     *  or the hit flash, whichever is brighter. */
    flash() {
      let f = this.hurtT > 0 ? Math.min(1, this.hurtT / 0.12) * 0.8 : 0;
      const left = this.dur - this.t;
      if (this.vanishT <= 0 && this.appearT <= 0 && left < EXPIRE_FLASH) {
        const urgency = clamp(1 - left / EXPIRE_FLASH, 0, 1);
        // Square wave, not a sine: a summon about to leave should snap between
        // lit and unlit, the way a blinking item does. Half-lit reads as an
        // aura and gets ignored.
        if (Math.sin(this.blink * Math.PI * 2) > 0) {
          f = Math.max(f, 0.35 + 0.5 * urgency);
        }
      }
      return f;
    },

    /** Start the exit. Everything that ends a summon by CHOICE — its timer, a
     *  recast past the cap, its owner going down — comes through here, so they
     *  all read the same way. */
    dismiss() {
      if (this.dead || this.vanishT > 0) return;
      // Never landed: nothing to dissipate, just stop.
      if (this.appearT > 0) { this.dead = true; return; }
      this.vanishT = VANISH_TIME;
      this.intangible = true;
      this.move = null;
      const cy = this.y - bodyH / 2;
      burst(this.x, cy, cfg.color, 14, 0.55);
      ring(this.x, cy, cfg.color, 70);
      // Motes coming apart upward — the summon unravelling rather than popping.
      for (let i = 0; i < 16; i++) {
        const life = rand(0.35, 0.8);
        emit({
          x: this.x + rand(-this.hitW / 2, this.hitW / 2),
          y: this.y - Math.random() * bodyH,
          vx: rand(-30, 30), vy: rand(-150, -50),
          life, maxLife: life, size: rand(3, 7), color: cfg.color, gravity: -40,
        });
      }
      playSfx("summonAppear", 0.4, 0.7);
    },

    /** Take damage from an enemy attack. Returns true if this killed it. */
    damage(amount, source) {
      if (this.dead || this.intangible) return false;
      // Adaptation: the wheel turns, and what has already hit it hits for less.
      let dealt = amount;
      if (cfg.adapt) {
        this.hitsTaken += 1;
        if (this.adapted) dealt *= cfg.adapt.dmgTakenMul ?? 0.55;
        else if (this.hitsTaken >= (cfg.adapt.hits ?? 8)) {
          this.adapted = true;
          popup(this.x, this.y - bodyH - 26, "ADAPTED", cfg.color, 18);
          ring(this.x, this.y - bodyH / 2, cfg.color, 120);
          playSfx("summonAppear", 0.7, 0.85);
        }
      }
      this.hp -= dealt;
      this.hurtT = 0.12;
      burst(this.x, this.y - bodyH / 2, "#ffffff", 6, 0.5);
      playSfx("hitLight", 0.5, 1.15);
      if (this.hp > 0) {
        this.recoil(dealt, source);
        return false;
      }
      // Destroyed rather than dismissed: bigger burst, a ring, and a shake, so
      // killing one reads as an achievement rather than as the timer running
      // out — and it skips the dissipate entirely, because coming apart on your
      // own schedule is exactly what did NOT happen here.
      this.dead = true;
      burst(this.x, this.y - bodyH / 2, cfg.color, 26, 1.2);
      ring(this.x, this.y - bodyH / 2, cfg.color, 90);
      playSfx("summonAttack", 0.8, 0.8);
      state.camera.shake = Math.max(state.camera.shake, 4);
      popup(this.x, this.y - bodyH - 20, "DESTROYED", cfg.color, 16);
      if (source) grantMeterForKill(source);
      return true;
    },

    /**
     * Knocked back, but never away.
     *
     * A summon that took a hit and kept walking looked like a summon that had
     * not been hit. It now staggers: shoved along the line of the blow, thrown
     * off its own behaviour for a beat, and — for a heavy enough hit — popped
     * off the floor into the same fall a jump uses, so it lands and puffs dust
     * like anything else with feet.
     *
     * It is deliberately NOT a fighter's knockback: the shove is clamped to
     * the stage, there is no launch angle, no percent scaling and no hitstun to
     * combo out of. Send a shikigami off the blast zone and every summon
     * becomes a free stock for whoever hits hardest, which is precisely what
     * giving them hit points was meant to avoid.
     */
    recoil(dealt, source) {
      const away = source ? (sign(this.x - source.x) || this.dir * -1) : -this.dir;
      const power = clamp(70 + dealt * 16, 90, 340) * this.knockTake;
      // A shove already under way is added to rather than replaced, so a
      // multi-hit string pushes a summon further than its first hit did.
      this.knockVx = clamp(this.knockVx + away * power, -420, 420);
      this.knockT = Math.min(0.36, Math.max(this.knockT, 0.14 + dealt * 0.007));
      this.move = null;               // a brawler's swing is interrupted
      this.animKey = "hurt";
      this.animTime = 0;
      // Anything that really connects lifts it off the floor. Flyers are not
      // popped — they are already off it, and a support summon punted upward
      // would simply fly back down looking untouched.
      if (dealt >= 11 && !flies && !this.airborne && this.knockTake > 0.5) {
        this.airborne = true;
        this.vy = -180 - Math.min(160, dealt * 8) * this.knockTake;
      }
      dust(this.x, this.y, 4);
    },

    /** The stagger itself: the shove plays out, the creature's own behaviour
     *  does not. Gravity still runs, so a summon popped into the air by a hit
     *  falls back down and lands. */
    stepStagger(dt) {
      this.knockT -= dt;
      this.x = clamp(this.x + this.knockVx * dt, 90, 1190);
      this.knockVx *= Math.pow(0.86, dt * 60);
      if (!flies) this.stepGravity(dt, false);
      this.moving = false;
      if (this.knockT <= 0) {
        this.knockVx = 0;
        this.animTime = 0;
      }
    },

    update(dt) {
      this.bob += dt * 5;

      // Coming apart: nothing else runs. It is already out of the fight.
      if (this.vanishT > 0) {
        this.vanishT -= dt;
        if (Math.random() < dt * 14) {
          const life = rand(0.3, 0.6);
          emit({
            x: this.x + rand(-this.hitW / 2, this.hitW / 2), y: this.y - Math.random() * bodyH,
            vx: rand(-20, 20), vy: rand(-120, -40),
            life, maxLife: life, size: rand(2, 6), color: cfg.color, gravity: -30,
          });
        }
        if (this.vanishT <= 0) this.dead = true;
        return;
      }

      // Arriving: it forms in the air and falls in. It cannot act and cannot be
      // acted on until its feet are down.
      if (this.appearT > 0) {
        this.stepAppear(dt);
        return;
      }

      this.t += dt;
      // Blink phase accumulates rather than being derived from `t`, so the rate
      // can ramp without the wave jumping every time it changes.
      const left = this.dur - this.t;
      if (left < EXPIRE_FLASH) {
        const urgency = clamp(1 - left / EXPIRE_FLASH, 0, 1);
        this.blink += dt * (FLASH_HZ_MIN + urgency * (FLASH_HZ_MAX - FLASH_HZ_MIN));
      }
      if (this.t >= this.dur || owner.dead) { this.dismiss(); return; }
      this.attackCd -= dt;
      this.lungeT = Math.max(0, this.lungeT - dt);
      this.hurtT = Math.max(0, this.hurtT - dt);
      this.attackT = Math.max(0, this.attackT - dt);
      this.animTime += dt;
      this.moving = false;

      // Staggered: the shove runs and the creature does not. It cannot steer,
      // hunt, bite or be piloted until it has its feet back.
      if (this.knockT > 0) {
        this.stepStagger(dt);
        this.setPose();
        return;
      }

      const stick = ownerStick(owner);
      const pushed = stick.x !== 0 || stick.y !== 0;
      if (pushed) {
        this.idleT = 0;
        // The hand-off is worth announcing once: a summon that silently stops
        // hunting looks broken.
        if (!this.piloted) {
          this.piloted = true;
          ring(this.x, this.y - this.hitH / 2, cfg.color, 60);
          playSfx("summonAppear", 0.45);
        }
      } else if (this.piloted) {
        this.idleT += dt;
        if (this.idleT >= PILOT_RELEASE) this.piloted = false;
      }

      const target = nearestTarget(owner, this.x);
      if (this.piloted) this.updatePiloted(dt, stick, target);
      else if (this.behavior === "support") this.updateSupport(dt, target);
      else if (this.behavior === "brawler") this.updateBrawler(dt, target);
      else this.updatePursuit(dt, target);
      this.setPose();
    },

    /** Which of the four creature poses this frame is: flinching beats
     *  striking beats moving beats standing. A brawler picks its own key from
     *  its move set (setBrawlerAnim) and is left alone here. */
    setPose() {
      if (this.behavior === "brawler") return;
      const key = this.knockT > 0 ? "hurt"
                : this.attackT > 0 ? "attack"
                : this.moving || this.airborne ? "move"
                : "idle";
      if (key !== this.animKey) { this.animKey = key; this.animTime = 0; }
    },

    // The arrival. Cursed energy gathers at the landing point and the shape
    // drops through it; `drawY` does the falling, this does the timing and the
    // dust.
    stepAppear(dt) {
      this.appearT -= dt;
      this.moteT -= dt;
      const p = 1 - this.appearT / APPEAR_TIME;
      if (this.moteT <= 0) {
        this.moteT = 0.03;
        // Motes rising off the landing point, converging on where it will be.
        const life = rand(0.25, 0.5);
        emit({
          x: this.x + rand(-this.hitW * 0.6, this.hitW * 0.6), y: this.y - rand(0, 20),
          vx: rand(-20, 20), vy: rand(-180, -90) * (0.4 + p),
          life, maxLife: life, size: rand(2, 5), color: cfg.color, gravity: -60,
        });
      }
      if (this.appearT > 0) return;

      // Touchdown. This is the frame it becomes real.
      this.appearT = 0;
      this.intangible = false;
      if (!flies) this.y = Math.min(this.y, groundY());
      dust(this.x, this.y, flies ? 4 : 14);
      ring(this.x, this.y - this.hitH / 2, cfg.color, this.hitH * 1.2);
      burst(this.x, this.y - this.hitH / 2, cfg.color, flies ? 8 : 16, 0.9);
      playSfx("summonAppear", 0.9, flies ? 1.15 : 0.9);
      if (!flies) {
        state.camera.shake = Math.max(state.camera.shake, this.behavior === "brawler" ? 8 : 3);
        if (this.behavior === "brawler") playSfx("landing", 0.9, 0.7);
      }
    },

    // Manual control. Movement comes from the stick; everything else — what it
    // does when it reaches someone — is the automatic behavior's job, so a
    // driven summon hits exactly as hard as one that found its own way there.
    updatePiloted(dt, stick, target) {
      // A brawler mid-swing is committed the way a fighter is: the stick steers
      // it at a crawl rather than sliding it out of its own animation.
      const committed = this.behavior === "brawler" && this.move;
      const speed = (cfg.speed ?? 420) * PILOT_SPEED_MUL * (committed ? 0.25 : 1);
      if (stick.x) {
        this.x = clamp(this.x + stick.x * speed * dt, 90, 1190);
        this.moving = true;
        if (!committed) this.dir = sign(stick.x);
      } else if (target) {
        // Still face what it would bite, so a summon held steady over an enemy
        // does not sit there looking the wrong way.
        if (!committed) this.dir = sign(target.x - this.x) || this.dir;
      }
      if (flies) {
        // Held steady it keeps bobbing, so a parked flyer still reads as alive.
        const vy = stick.y ? stick.y * speed : Math.sin(this.bob) * 26;
        this.y = clamp(this.y + vy * dt, PILOT_CEILING, groundY());
        if (stick.y) this.moving = true;
      } else {
        // Up on the stick is a jump, not flight — a dog that hovered would be
        // a different creature. Re-arms only once the stick comes back down,
        // so holding up gives one jump rather than a hover.
        if (stick.y <= -PILOT_JUMP_AXIS) {
          if (this.jumpArmed && !this.airborne && !committed) {
            this.jumpArmed = false;
            this.airborne = true;
            this.vy = PILOT_JUMP_VY;
            dust(this.x, this.y, 6);
            playSfx("jump", 0.4);
          }
        } else {
          this.jumpArmed = true;
        }
        this.stepGravity(dt, stick.y > 0);
        if (stick.x && !this.airborne && Math.random() < dt * 6) dust(this.x - this.dir * 20, this.y, 3);
      }
      if (this.behavior === "brawler") {
        this.stepMove(dt, target);
        if (!this.move && target) this.considerMove(dt, target);
        this.setBrawlerAnim(stick.x !== 0);
        return;
      }
      if (!target) return;
      // Contact resolves through the same code paths as an automatic hunt.
      if (flies) this.fireSupport(target);
      else this.tryContact(target);
    },

    // chaser + bomber share pursuit; they differ in what contact means.
    updatePursuit(dt, target) {
      const speed = cfg.speed ?? 420;
      if (target) {
        this.dir = sign(target.x - this.x) || this.dir;
        const gap = Math.abs(target.x - this.x);
        const desired = this.behavior === "bomber" ? 0 : (cfg.standOff ?? 30);
        if (gap > desired) {
          this.x = clamp(this.x + this.dir * speed * dt, 90, 1190);
          this.moving = true;
        }
      }
      // Finishes any jump the player left it in before pinning back to the
      // ground; a hunting summon never starts one.
      this.stepGravity(dt, false);
      if (!this.airborne && Math.random() < dt * 5) dust(this.x - this.dir * 20, this.y, 3);
      if (target) this.tryContact(target);
    },

    // ------------------------------------------------------------- brawler
    //
    // Driven like a character rather than steered like a pet: it closes to its
    // own range, commits to a move, and lives with the recovery. The decisions
    // are deliberately simple and readable — approach, swing, jump at what is
    // above you — because a summon the player cannot predict is a summon the
    // player cannot fight alongside.
    updateBrawler(dt, target) {
      const speed = cfg.speed ?? 300;
      let walking = false;

      if (this.move) {
        // Committed. It does not walk out of its own swing.
        this.stepMove(dt, target);
      } else if (target) {
        this.decideT -= dt;
        const dx = target.x - this.x;
        const adx = Math.abs(dx);
        this.dir = sign(dx) || this.dir;
        const reach = BRAWLER_MOVES.smash.reach * 0.78;
        if (adx > reach) {
          this.x = clamp(this.x + this.dir * speed * dt, 90, 1190);
          walking = true;
          this.moving = true;
        }
        // Chase upward the way a fighter does: if they are standing above it
        // and roughly overhead, jump after them.
        if (!this.airborne && target.y < this.y - 110 && adx < 210 && this.decideT <= 0) {
          this.decideT = 0.6;
          this.airborne = true;
          this.vy = PILOT_JUMP_VY;
          dust(this.x, this.y, 8);
          playSfx("jump", 0.5, 0.8);
        }
        this.considerMove(dt, target);
      }

      this.stepGravity(dt, false);
      if (walking && !this.airborne && Math.random() < dt * 8) dust(this.x - this.dir * 26, this.y, 3);
      this.setBrawlerAnim(walking);
    },

    /** Pick a move if one fits the situation and the cooldown has run out. */
    considerMove(dt, target) {
      if (this.move || this.attackCd > 0 || !target) return;
      const dx = target.x - this.x;
      const adx = Math.abs(dx);
      const above = target.y < this.y - 120;
      let name = null;
      if (above && adx < BRAWLER_MOVES.cleave.reach * 0.7) name = "cleave";
      else if (adx < BRAWLER_MOVES.swipe.reach * 0.9) name = Math.random() < 0.32 ? "smash" : "swipe";
      else if (adx < BRAWLER_MOVES.smash.reach * 0.95) name = "smash";
      if (!name) return;
      this.startMove(name);
    },

    startMove(name) {
      const def = BRAWLER_MOVES[name];
      this.move = { name, def, t: 0, hit: new Set() };
      this.animKey = def.anim;
      this.animTime = 0;
      // The windup is the tell. A heavy one lights up so the opponent can see
      // it coming and do something about it.
      if (def.heavy) {
        ring(this.x + this.dir * 40, this.y - def.high * 0.6, cfg.color, 70);
        playSfx("hazardTelegraph", 0.35, 0.8);
      }
    },

    /** Advance the move in progress: windup, active window, recovery. */
    stepMove(dt, target) {
      const m = this.move;
      if (!m) return;
      const def = m.def;
      const wasActive = m.t >= def.windup && m.t < def.windup + def.active;
      m.t += dt;
      const active = m.t >= def.windup && m.t < def.windup + def.active;

      if (active && !wasActive) {
        // The swing itself.
        playSfx(def.sfx, 0.85, 0.85);
        if (def.shake) state.camera.shake = Math.max(state.camera.shake, def.shake);
        burst(this.x + this.dir * def.reach * 0.5, this.y - def.high * 0.6, cfg.color, 8, 0.7);
      }
      if (active) {
        const rect = moveRect(this, def);
        for (const f of state.fighters) {
          if (!isFoe(owner, f) || f.dead || f.respawnTimer > 0 || m.hit.has(f)) continue;
          if (!rectsOverlap(rect, hurtbox(f))) continue;
          m.hit.add(f);
          applyHit(owner, f, {
            dmg: def.dmg, baseKb: def.base, growth: def.growth, angle: def.angle,
            effect: cfg.attack?.effect || null, label: cfg.label,
            sfx: def.sfx, heavy: !!def.heavy,
          }, "script");
          if (def.heavy) state.camera.shake = Math.max(state.camera.shake, 9);
        }
      }
      if (m.t >= def.windup + def.active + def.recover) {
        this.move = null;
        this.attackCd = (cfg.attack?.cd ?? 0.45) + Math.random() * 0.35;
      }
    },

    setBrawlerAnim(walking) {
      if (this.behavior !== "brawler") return;
      let key;
      if (this.move) key = this.move.def.anim;
      else if (this.airborne) key = this.vy < 0 ? "jump" : "fall";
      else if (walking) key = "run";
      else key = "idle";
      if (key !== this.animKey) { this.animKey = key; this.animTime = 0; }
    },

    // Airtime for a grounded summon. Shared by piloted and automatic movement,
    // because a summon released mid-jump has to finish the arc — snapping it to
    // the floor the instant the stick centres would read as a teleport.
    stepGravity(dt, fastFall) {
      if (!this.airborne) {
        // Standing: hold the surface it landed on, and step off into a fall the
        // moment that surface stops being under it.
        if (this.y < groundY() && !supported(this.x, this.y)) {
          this.airborne = true;
          this.vy = 0;
        } else {
          if (this.y >= groundY()) this.y = groundY();
          return;
        }
      }
      const prevY = this.y;
      this.vy += PILOT_GRAVITY * (fastFall ? PILOT_FASTFALL : 1) * dt;
      this.y += this.vy * dt;
      const land = landingY(this.x, prevY, this.y, this.vy);
      const floor = groundY();
      if (land !== null) {
        this.y = land;
      } else if (this.y >= floor) {
        this.y = floor;
      } else {
        return;
      }
      this.airborne = false;
      this.vy = 0;
      dust(this.x, this.y, 5);
    },

    // What touching an enemy means, for both the automatic hunt and a piloted
    // drive. Bombers spend themselves; chasers bite on a cooldown.
    tryContact(target) {
      const rect = {
        x: this.x - this.hitW / 2, y: this.y - this.hitH,
        w: this.hitW, h: this.hitH,
      };
      if (!rectsOverlap(rect, hurtbox(target))) return;

      if (this.behavior === "bomber") {
        this.dead = true;
        this.attackT = 0.2;
        burst(this.x, this.y - 50, cfg.color, 30, 1.3);
        ring(this.x, this.y - 50, cfg.color, (cfg.attack.r || 90) * 1.3);
        playSfx("summonAttack", 0.9);
        state.camera.shake = Math.max(state.camera.shake, 5);
        applyHit(owner, target, {
          dmg: cfg.attack.dmg, baseKb: cfg.attack.base, growth: cfg.attack.growth,
          angle: cfg.attack.angle, effect: cfg.attack.effect || null,
          label: cfg.label, sfx: "blast",
        }, "script");
        return;
      }

      if (this.attackCd > 0) return;
      this.attackCd = cfg.attack.cd ?? 0.8;
      this.lungeT = 0.22;
      this.attackT = 0.26;
      applyHit(owner, target, {
        dmg: cfg.attack.dmg, baseKb: cfg.attack.base, growth: cfg.attack.growth,
        angle: cfg.attack.angle, effect: cfg.attack.effect || null,
        label: cfg.label, sfx: cfg.attack.sfx || "slash",
      }, "script");
      burst(target.x, target.y - 80, cfg.color, 10, 0.7);
    },

    updateSupport(dt, target) {
      // Hover behind and above the owner's shoulder, tracking smoothly.
      const anchorX = clamp(owner.x - owner.facing * (cfg.hover?.back ?? 70), 90, 1190);
      const anchorY = owner.y - (cfg.hover?.up ?? 150) + Math.sin(this.bob) * 8;
      this.x += (anchorX - this.x) * Math.min(1, dt * 6);
      this.y += (anchorY - this.y) * Math.min(1, dt * 6);
      this.dir = target ? (sign(target.x - this.x) || this.dir) : owner.facing;
      if (target) this.fireSupport(target);
    },

    // A support summon's shot, on its own cooldown. Shared with piloted flight,
    // where the player picks the firing position and the summon still picks the
    // moment.
    fireSupport(target) {
      if (this.attackCd > 0) return;
      this.attackCd = cfg.attack.cd ?? 1.2;
      this.attackT = 0.3;
      const proj = spawnProjectile(owner, {
        ...cfg.attack.projectile,
        x: this.x + this.dir * 24,
        y: this.y,
        dir: this.dir,
        label: cfg.label,
      });
      // aim at the target rather than firing flat
      const dy = (target.y - 80) - this.y;
      proj.vy = clamp(dy * 1.6, -260, 300);
      burst(this.x + this.dir * 20, this.y, cfg.color, 6, 0.5);
      playSfx("projectileFire", 0.7);
    },

    draw(ctx) {
      const alpha = this.alpha();
      if (alpha <= 0) return;
      const flash = this.flash();
      const y = this.drawY();
      const lunge = this.lungeT > 0 ? Math.sin((0.22 - this.lungeT) / 0.22 * Math.PI) * 16 : 0;
      const hoverBob = this.behavior === "support" ? 0 : Math.sin(this.bob) * (cfg.bobAmp || 0);

      // The landing mark, under an arriving summon: a ring on the floor that
      // tightens as the thing above it falls, so the drop has somewhere to
      // land rather than simply arriving.
      if (this.appearT > 0) this.drawArrivalMark(ctx, alpha);

      if (this.actor) this.drawActor(ctx, y + hoverBob, alpha, flash);
      else this.drawStill(ctx, y + hoverBob, alpha, flash, lunge);

      // Health, once it has taken any. Hidden at full so the stage is not
      // littered with bars for summons nobody has touched.
      if (this.hp < this.maxHp && this.vanishT <= 0) {
        const frac = Math.max(0, this.hp / this.maxHp);
        const w = this.behavior === "brawler" ? 70 : 42;
        const bx = this.x - w / 2;
        const by = y + hoverBob - (cfg.h ?? 110) - 8;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(6, 9, 18, 0.75)";
        ctx.fillRect(bx - 1, by - 1, w + 2, 5);
        ctx.fillStyle = frac > 0.35 ? cfg.color : "#ff6b6b";
        ctx.fillRect(bx, by, w * frac, 3);
        ctx.restore();
      }

      // The pilot marker rides above the summon, outside the mirrored and
      // rotated transform so it never flips or tilts with the art.
      if (this.piloted) {
        const top = y + hoverBob - (cfg.h ?? 110) - 16;
        ctx.save();
        // Pulses, but never dims to the point of being missable. Drawn white
        // with a dark outline rather than in the summon's theme colour — the
        // dogs' navy would vanish against half the stages.
        ctx.globalAlpha = alpha * (0.78 + 0.22 * Math.sin(this.bob * 2));
        ctx.beginPath();
        ctx.moveTo(this.x, top + 12);
        ctx.lineTo(this.x - 9, top);
        ctx.lineTo(this.x + 9, top);
        ctx.closePath();
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
        ctx.lineWidth = 2;
        ctx.shadowColor = cfg.color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    },

    // Cursed energy gathering where it is about to land.
    drawArrivalMark(ctx, alpha) {
      const p = 1 - this.appearT / APPEAR_TIME;
      const r = this.hitW * (1.6 - 0.9 * p);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.35 + 0.4 * p;
      ctx.strokeStyle = cfg.color;
      ctx.lineWidth = 2 + 3 * p;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, r, r * 0.26, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    },

    // A summon with a full sprite set (the brawler) is drawn exactly the way a
    // fighter is: its own pose for whatever it is doing this frame.
    drawActor(ctx, y, alpha, flash) {
      const frame = currentFrame(this.actor, this.animKey, this.animTime);
      const opts = {
        scale: cfg.scale ?? 0.95,
        facing: this.dir,
        alpha,
        glow: cfg.color,
        glowBlur: this.piloted ? 26 : 14,
      };
      drawCharFrame(ctx, this.actor, frame, this.x, y, opts);
      if (flash > 0) {
        // Brightened by re-drawing itself additively — the same silhouette,
        // blown toward white. A filled rect would paint the background too.
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        drawCharFrame(ctx, this.actor, frame, this.x, y, { ...opts, alpha: alpha * flash, glow: null });
        ctx.restore();
      }
    },

    // Everything else: the creature's own pose for what it is doing this
    // frame, falling back to its single still (and, with no art at all, to a
    // glowing orb). It also sways and leans, which is what kept a summon from
    // reading as a decal back when the still was all there was — and still
    // does the work on the frames a creature has not had drawn yet.
    drawStill(ctx, y, alpha, flash, lunge) {
      const img = animFrame(poseKeyOf(cfg.sprites), this.animKey, this.animTime)
               ?? summonImage(cfg.sprites);
      // A flinch is a lean away from the blow on top of whatever the art does,
      // so a creature with no `hurt` drawing still visibly takes the hit.
      const stagger = this.knockT > 0
        ? Math.sin(Math.min(1, this.knockT / 0.36) * Math.PI) * sign(this.knockVx) * 0.22
        : 0;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(this.x + this.dir * lunge, y);
      const sway = Math.sin(this.bob * 0.7) * MOTION.summonSway
                 + (lunge / 16) * this.dir * MOTION.summonLunge
                 + stagger;
      ctx.rotate(sway);
      // summon art faces left in source unless flagged; mirror to face dir
      ctx.scale(this.dir > 0 ? (cfg.faceRight ? 1 : -1) : (cfg.faceRight ? -1 : 1), 1);
      ctx.shadowColor = cfg.color;
      // A driven summon glows harder than one running itself. With four
      // fighters and several summons on screen, the player needs to see at a
      // glance which one their stick is actually moving.
      ctx.shadowBlur = this.piloted ? 26 : 14;
      const h = cfg.h ?? 110;
      if (img) {
        const w = img.width * h / img.height;
        ctx.drawImage(img, -w / 2, -h, w, h);
        if (flash > 0) {
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = alpha * flash;
          ctx.drawImage(img, -w / 2, -h, w, h);
        }
      } else {
        // no art at all: glowing orb silhouette
        ctx.fillStyle = cfg.color;
        ctx.globalAlpha = alpha * (0.8 + flash * 0.2);
        ctx.beginPath();
        ctx.arc(0, -h / 2, h / 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
  };

  if (flies) {
    s.y = owner.y - (cfg.hover?.up ?? 150);
  }
  state.entities.push(s);
  // The caster's end of it, kept light: the summon's own arrival is the loud
  // part, and it announces itself when it lands (stepAppear).
  playSfx("summonAppear", 0.55, 1.15);
  burst(owner.x, owner.y - 80, cfg.color, 8, 0.7);
  return s;
}
