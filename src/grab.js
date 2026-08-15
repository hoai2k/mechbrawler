// Smash-style grabbing and throwing. Experimental — the whole mechanic sits
// behind `?throw=true` (src/flags.js); with the flag off nothing in here runs
// and RT stays the second jump button.
//
// The shape of it, and why each piece exists:
//
//   grab      RT (or Light while shielding — the shield grab every Smash
//             player's thumb already knows). Grounded only. A short reach with
//             real whiff recovery: grabs beat shield, attacks beat grabs.
//   hold      The victim is carried in front of the grabber, helpless but not
//             passive: every fresh press they make shortens the hold, and at
//             low damage they WILL mash out of a lazy one.
//   pummel    Light while holding. Small damage on a cooldown — strictly worse
//             than throwing unless the hold is long, which is the gamble.
//   throw     A direction while holding: forward, back (tossed behind), up
//             (juggle starter), down (the combo throw). Routed through
//             applyHit so DI, staling, tallies and KO credit all work.
//   break-out The hold timer expiring is the VICTIM's win: they shove off with
//             brief invulnerability and the grabber stumbles — a real punish
//             window, not a neutral reset.
//
// Nobody can be re-grabbed for a beat after any release (GRAB.releaseImmune):
// chain grabs are the one part of Smash history this deliberately does not
// import.
//
// State lives on the fighters themselves so KO/reset cleanup is the same
// story as everything else: `f.grab = { victim, ... }` on the holder,
// `f.grabbedBy = holder` on the held, `f.grabImmune` ticking down on anyone
// recently released (fighter.js owns the timer).

import { state } from "./state.js";
import { clamp, rectsOverlap, sign } from "./utils.js";
import { bodyMetrics } from "./silhouette.js";
import { applyHit, hurtbox, debugShape } from "./combat.js";
import { burst, dust, popup, ring } from "./particles.js";
import { playSfx, playGrunt, stopShieldLoop } from "./audio.js";
import { rumbleFighter } from "./rumble.js";
import { isFoe } from "./teams.js";
import { GRAB, THROWS, METER_MAX } from "./constants.js";

function setAnim(f, key) {
  if (f.animKey !== key) {
    f.animKey = key;
    f.animTime = 0;
  }
}

/** How far apart the two bodies sit during a hold, centre to centre. */
function holdGap(holder, victim) {
  const a = bodyMetrics(holder.spriteChar || holder.charKey);
  const b = bodyMetrics(victim.spriteChar || victim.charKey);
  return (a.width + b.width) * 0.45;
}

// ------------------------------------------------------------------ reaching

/** Start the grab attempt: a committed reach with startup, a short live
 *  window, and whiff recovery long enough to be punished on reaction. */
export function beginGrab(f) {
  f.action = {
    kind: "grabReach", t: 0,
    dur: GRAB.startup + GRAB.active + GRAB.whiffRecover,
    anim: "grabReach",
    // Locked steering but kept momentum: a grab out of a dash slides forward
    // through its own reach, which is the dash grab without a second code path.
    lockMovement: true, keepMomentum: true,
  };
  playSfx("whoosh", 0.6);
}

/** Called each sim step while a grabReach action runs; connects at most once.
 *  The reach tests a box, not a hitbox: grabs ignore shields entirely, which
 *  is the entire reason to have them. */
export function updateGrabReach(f) {
  const a = f.action;
  if (!a || a.kind !== "grabReach") return;
  if (a.t < GRAB.startup || a.t > GRAB.startup + GRAB.active) return;
  const m = bodyMetrics(f.spriteChar || f.charKey);
  const reach = m.reach * 0.85 + GRAB.grace;
  const h = m.height * 0.9;
  const rect = {
    x: f.facing === 1 ? f.x : f.x - reach,
    y: f.y - h, w: reach, h,
  };
  debugShape(rect);
  for (const t of state.fighters) {
    if (!isFoe(f, t) || t.dead || t.respawnTimer > 0) continue;
    // A hand cannot close on: i-frames (dodges included), someone freshly
    // released, a body already held, a hanging fighter, or one flat on the
    // floor — prone is below the reach the same way it is below high pokes.
    if (t.invuln > 0 || t.grabImmune > 0 || t.grabbedBy || t.ledge) continue;
    if (t.prone > 0 && t.hitstun <= 0) continue;
    if (!rectsOverlap(rect, hurtbox(t))) continue;
    connectGrab(f, t);
    return;
  }
}

function connectGrab(f, victim) {
  // Whatever either of them was doing is over. The victim keeps nothing —
  // charge, counter stance, heal channel — because being seized is the answer
  // to all of it; the grabber keeps only the hold itself.
  f.action = null;
  f.charging = null;
  if (victim.grab) releaseHold(victim, { silent: true }); // grabbed mid-grab: they drop theirs
  if (victim.shielding) {
    victim.shielding = false;
    stopShieldLoop();
  }
  victim.action = null;
  victim.charging = null;
  victim.counter = null;
  victim.reflect = null;
  victim.healing = null;
  victim.hitstun = 0;
  victim.hitPause = 0;
  victim.spin = 0;
  victim.fastFalling = false;
  victim.vx = 0; victim.vy = 0;

  f.facing = sign(victim.x - f.x) || f.facing;
  f.vx = 0;

  const holdT = clamp(GRAB.holdBase + victim.damage * GRAB.holdPerDmg, 0, GRAB.holdMax);
  f.grab = { victim, t: 0, holdT, holdMax: holdT, pummelCd: GRAB.pummelFirst };
  victim.grabbedBy = f;

  pinVictim(f);
  victim.facing = -f.facing;

  // Impact beat: both freeze a moment, exactly like a landed hit, so a grab
  // connecting reads as an event rather than a teleport into a cuddle.
  f.hitPause = Math.max(f.hitPause, 0.1);
  victim.hitPause = Math.max(victim.hitPause, 0.12);
  victim.shakeMag = 4;
  popup(victim.x, victim.y - 160, "GRABBED!", f.char.theme, 20);
  burst(victim.x, victim.y - 90, f.char.theme, 10, 0.8);
  playSfx("punch", 0.8);
  rumbleFighter(victim, 0.5, 0.3, 0.12);
  rumbleFighter(f, 0.3, 0.2, 0.1);
}

/** The victim's spot in the grabber's hands, re-asserted every step so hitlag,
 *  slide friction and stray knockback can never let the two drift apart. */
function pinVictim(f) {
  const v = f.grab.victim;
  v.x = f.x + f.facing * holdGap(f, v);
  v.y = f.y;
  v.vx = 0; v.vy = 0;
  v.grounded = true;
}

// ------------------------------------------------------------------ holding

/** The grabber's whole turn while holding: pin, count the hold down, pummel,
 *  throw, or lose the victim. Runs INSTEAD of the normal update body. */
export function updateGrabHold(f, dt, input) {
  const g = f.grab;
  const v = g.victim;

  // A hold only survives while both parties are actually here for it.
  if (v.dead || v.respawnTimer > 0 || v.grabbedBy !== f) {
    f.grab = null;
    return;
  }
  if (!f.grounded) {
    releaseHold(f, { silent: true });
    return;
  }

  g.t += dt;
  g.holdT -= dt;
  g.pummelCd = Math.max(0, g.pummelCd - dt);
  pinVictim(f);
  v.facing = -f.facing;
  f.vx = 0;
  setAnim(f, "grabHold");
  f.animTime += dt;

  // Break-out: the victim's mashing (updateGrabbedFighter) drained the timer.
  if (g.holdT <= 0) {
    breakOut(f, v);
    return;
  }

  // Throw beats pummel when both arrive in one frame: a direction is a
  // decision, a Light press mid-direction is usually the pummel they were
  // already mashing.
  const dir = input.up ? "up"
    : input.down ? "down"
    : input.dirX === f.facing ? "fwd"
    : input.dirX === -f.facing ? "back"
    : (input.heavyP || input.grabP) ? "fwd"
    : null;
  if (dir) {
    executeThrow(f, v, dir);
    return;
  }

  if (input.lightP && g.pummelCd <= 0) {
    g.pummelCd = GRAB.pummelRate;
    // Through applyHit so tallies, meter, staling and passives all see it; the
    // tiny knockback it rolls is erased by the pin on the next step.
    applyHit(f, v, {
      dmg: GRAB.pummelDmg, baseKb: 40, growth: 0, angle: 0.3,
      label: null, sfx: "punch", unblockable: true,
    }, "melee");
  }
}

/** The victim's turn while held: struggle. Every fresh press or flick shaves
 *  the hold down — escape is something they do, not something they wait for. */
export function updateGrabbedFighter(f, dt, input) {
  const holder = f.grabbedBy;
  if (!holder || !holder.grab || holder.grab.victim !== f) {
    f.grabbedBy = null;
    return;
  }
  const mashes =
    (input.lightP ? 1 : 0) + (input.heavyP ? 1 : 0) + (input.specialP ? 1 : 0) +
    (input.jumpP ? 1 : 0) + (input.grabP ? 1 : 0) + (input.tiltDir ? 1 : 0) +
    (input.dashP ? 1 : 0);
  if (mashes) {
    holder.grab.holdT -= mashes * GRAB.mashReduce;
    f.shakeMag = Math.max(f.shakeMag, 2.5);
    if (Math.random() < 0.35) dust(f.x, f.y - 40, 2);
  }
  setAnim(f, "grabbed");
  f.animTime += dt;
}

// ----------------------------------------------------------------- releases

/** The victim mashed free: they shove off with brief protection, the grabber
 *  is left stumbling — holding too long is a punishable mistake. */
function breakOut(f, v) {
  releaseHold(f, { silent: true });
  v.vx = f.facing * GRAB.breakoutPush;
  v.vy = -220;
  v.grounded = false;
  v.invuln = Math.max(v.invuln, 0.35);
  f.landLag = Math.max(f.landLag, GRAB.escapeLag); // the stumble: no act, no move
  popup(v.x, v.y - 160, "BROKE FREE!", "#ffffff", 22);
  ring(v.x, v.y - 90, v.char.theme, 90);
  dust(v.x, v.y, 8);
  playSfx("guardHit", 0.9, 1.2);
  rumbleFighter(f, 0.4, 0.25, 0.12);
}

/** Unlink the pair. Every path out of a grab funnels through here, and every
 *  path grants the victim the no-regrab window — chain grabs die here. */
function releaseHold(f, { silent = false } = {}) {
  const g = f.grab;
  if (!g) return;
  const v = g.victim;
  f.grab = null;
  if (v.grabbedBy === f) v.grabbedBy = null;
  v.grabImmune = Math.max(v.grabImmune, GRAB.releaseImmune);
  if (!silent) {
    dust(v.x, v.y, 6);
    playSfx("whoosh", 0.5);
  }
}

/** A hit landing on either half of a grab shakes it apart. Called from
 *  applyHit (combat.js) — the grabber being struck drops the victim, and a
 *  third party striking the victim knocks them out of the hands holding them.
 *  The one hit that must NOT do this is the holder's own pummel. */
export function breakGrabsOn(target, attacker) {
  if (target.grab) releaseHold(target, { silent: true });
  if (target.grabbedBy && target.grabbedBy !== attacker) {
    releaseHold(target.grabbedBy, { silent: true });
  }
}

/** KO / reset cleanup: sever any grab links without ceremony. */
export function clearGrabLinks(f) {
  if (f.grab) releaseHold(f, { silent: true });
  if (f.grabbedBy?.grab?.victim === f) releaseHold(f.grabbedBy, { silent: true });
  f.grabbedBy = null;
  f.grabImmune = 0;
}

// ------------------------------------------------------------------- throws

const THROW_ANIMS = { fwd: "throwFwd", back: "throwBack", up: "throwUp", down: "throwDown" };

function executeThrow(f, v, dir) {
  const spec = THROWS[dir];
  releaseHold(f, { silent: true });

  // A back throw tosses them behind: the body changes sides first so
  // applyHit's own direction reading (sign of the separation) launches them
  // the right way, and the grabber turns to watch them go.
  if (dir === "back") {
    v.x = f.x - f.facing * holdGap(f, v);
  }

  f.action = {
    kind: "throw", t: 0, dur: GRAB.throwDur,
    anim: THROW_ANIMS[dir], lockMovement: true,
  };
  setAnim(f, THROW_ANIMS[dir]);

  applyHit(f, v, { ...spec, unblockable: true, heavy: dir === "back" }, "throw");

  if (dir === "back") f.facing = -f.facing;
  if (dir === "down") {
    dust(v.x, v.y, 12);
    state.camera.shake = Math.max(state.camera.shake, 6);
  }
  playGrunt(f.charKey);
  playSfx("whoosh", 0.8);
  const gain = 3;
  f.meter = clamp(f.meter + gain, 0, METER_MAX);
}
