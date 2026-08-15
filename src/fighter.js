import { state } from "./state.js";
import { clamp, sign } from "./utils.js";
import { getCharacter } from "./characters.js";
import { lightMove, heavyMove } from "./moves.js";
import { spawnMelee, opponentOf, updateStatuses } from "./combat.js";
import { performSpecial, updateSpecialState } from "./specials.js";
import { performUltimate } from "./ultimates.js";
import { performDomain, domainInput, canOpenDomain, activeDomain, domainSlotFor, domainSpecialSlot } from "./domains.js";
import { burst, dust, popup, banner, ring } from "./particles.js";
import { playSfx, playGrunt, playKoCry, startShieldLoop, stopShieldLoop, noteFireBurning } from "./audio.js";
import { rumbleEvent } from "./rumble.js";
import { counterShimmerFx, healMotesFx } from "./fx.js";
import {
  GRAVITY, MAX_FALL, FASTFALL_MULT, BLAST, JUMP_BUFFER, COYOTE_TIME,
  SHORT_HOP_WINDOW, SHORT_HOP_CUT, AIR_JUMP_MULT, DASH_TAP_WINDOW, DASH_TIME,
  DASH_MULT, ACTION_BUFFER, AERIAL_LAND_LAG_MULT, AERIAL_LAND_LAG_MIN, SHIELD_MAX, SHIELD_DRAIN, SHIELD_REGEN, ROLL_TIME, ROLL_DIST,
  SPOT_DODGE_TIME, AIR_DODGE_TIME, DODGE_STALE_WINDOW, METER_MAX, METER_PASSIVE,
  RUN_TILT, WALK_MIN, WALK_MAX, MOVE_DEADZONE, LUNGE_DRAG,
  ULT_METER_COST, DOMAIN_METER_COST,
  LEDGE_GRAB_X, LEDGE_GRAB_Y_ABOVE, LEDGE_GRAB_Y_BELOW, LEDGE_HANG_X, LEDGE_HANG_Y,
  LEDGE_CLIMB_TIME, LEDGE_ROLL_TIME, LEDGE_ATTACK_TIME,
  LEDGE_CATCH_SPEED, LEDGE_CATCH_MIN, LEDGE_CATCH_MAX,
  LEDGE_INVULN_TRAVEL, LEDGE_REGRAB_SCALE, LEDGE_HANG_INVULN, LEDGE_JUMP_INVULN,
  TEETER_EDGE, TEETER_DELAY,
  RESPAWN_X, SMASH_TILT, SMASH_TILT_ANGLE,
  RESPAWN_WAIT, RESPAWN_PLATFORM_Y, RESPAWN_PLATFORM_HALF_W, RESPAWN_PLATFORM_TIME, RESPAWN_GRACE,
} from "./constants.js";
import { TRAIL_LEN, TRAIL_STEP, TURN_TIME, LAND_SQUASH_TIME, TAKEOFF_STRETCH_TIME } from "./config_tuning.js";
import { mainPlatform, spawnXs } from "./stages.js";
import { frameMeta } from "./assets.js";
import { currentFrame } from "./render_backend.js";
import { trailStrength } from "./motion.js";
import { THROW_ENABLED } from "./flags.js";
import { beginGrab, updateGrabReach, updateGrabHold, updateGrabbedFighter, clearGrabLinks } from "./grab.js";

/** `dodge_roll` / `dodge_air` where the character has that art, else the old
 *  shared `dodge`. Round 6 delivered the new frames for only some of the
 *  roster; without this check the rest would draw NOTHING mid-dodge, because a
 *  missing frame makes `drawCharFrame` bail. */
function dodgeAnim(f, key) {
  return frameMeta(f.charKey, key) ? key : "dodge";
}

export function makeFighter(id, charKey, x, facing) {
  const char = getCharacter(charKey);
  return {
    id, charKey, char,
    x, y: 0, vx: 0, vy: 0, facing,
    stocks: state.stocks, damage: 0, meter: 0,
    shield: SHIELD_MAX, shielding: false, shieldRaisedAt: -10, shieldStun: 0,
    prevShield: false,
    grounded: false, crouching: false, fastFalling: false,
    airJumpsLeft: char.stats.airJumps, airDodged: false,
    jumpBuffer: 0, coyote: 0, jumpHeldT: 0, jumpCut: false,
    dashT: 0, dashDir: 0, lastTap: { dir: 0, t: -10 },
    turnLock: 0, landTimer: 0, dropTimer: 0, bufferedAction: null, landLag: 0,
    teeterT: 0, teeterDir: 0,
    invuln: 1.4, hitstun: 0, hitPause: 0, shakeMag: 0,
    dizzy: 0, prone: 0, dodgeStale: 0, lastDodgeAt: -10,
    airT: 0, shieldDownSince: -10,
    action: null, charging: null, jabStep: 0, jabResetT: 0,
    // Grabbing (?throw=true — src/grab.js). `grab` on the holder, `grabbedBy`
    // on the held, `grabImmune` on anyone recently released.
    grab: null, grabbedBy: null, grabImmune: 0,
    counter: null, reflect: null, healing: null, installs: null, armorT: 0,
    // New Shadow Style: Simple Domain — the anti-domain circle Mechamaru and
    // Yuki both carry. Null unless one is held; domains.js asks about it before
    // a sure-hit effect lands (see simpleDomainActive).
    simpleDomain: null,
    // Set while an ultimate has this fighter wearing another actor's sprite set
    // (config_transform.js); null means "draw my own body".
    spriteChar: null,
    cooldowns: { neutral: 0, side: 0, down: 0 },
    throatStrain: 0, throatLock: 0,
    statuses: freshStatuses(),
    ledge: null, ledgeCooldown: 0, ledgeTimer: 0, ledgeMove: null, ledgeGrabs: 0,
    respawnTimer: 0, dead: false,
    // The revival platform this fighter is currently standing on, or null.
    // {x, y, t} — see stepRespawnPlatform.
    respawnPlat: null,
    cpuDamageMul: 0,
    animKey: "idle", animTime: 0,
    // presentation-only state, consumed by motion.js / render.js. Kept on the
    // fighter (and stepped at the fixed rate) so it stays deterministic and
    // freezes with the rest of the fighter during hitlag.
    spin: 0, spinAngle: 0, facingVis: facing,
    landT: 0, takeoffT: 0, trail: [], trailTick: 0, fxTrailT: 0,
    aiState: null,
    // The input this fighter last acted on, written by the sim loop. Summons
    // read it to find their owner's aim pad (see summons.js).
    lastInput: null,
    winner: false,
    // What this fighter did with the match, for the result screen. Built here
    // rather than in a side table so it is cleared by the same reset that
    // builds the fighter — a rematch starts from zero without anyone
    // remembering to empty anything.
    tally: { dealt: 0, taken: 0, kos: 0, falls: 0, biggestHit: 0, bestCombo: 0 },
    // The combo this fighter is currently BUILDING, as the attacker: how many
    // hits, who they are on, and how long the chain stays open (combat.js).
    combo: 0, comboT: 0, comboTarget: null,
    // Who last hit this fighter and how long that credit stands. A ring-out is
    // scored to whoever put them off the stage, which is not necessarily
    // whoever is nearest when they cross the blast line.
    lastHitBy: null, lastHitT: 0,
  };
}

/** A clean status block. Needed in two places — at spawn and on respawn — so
 *  the shape lives here rather than in two literals that have to be kept
 *  identical by hand every time a status is added. */
function freshStatuses() {
  return {
    burn: null, bleed: null, poison: null, infest: null,
    snare: 0, soulMark: 0, nailMarks: 0, nailT: 0, silence: 0,
    drench: 0, blind: 0,
  };
}

function stats(f) {
  return f.char.stats;
}

function speedMul(f) {
  let m = 1;
  // Star Rage adds mass without weight, so nothing that drags at a body drags
  // at Yuki: she carries a hundred tonnes and a snare at the same speed.
  const unslowable = f.char.passive.id === "virtualMass";
  if (f.statuses.snare > 0 && !unslowable) m *= 0.6;
  if (f.statuses.poison && !unslowable) m *= 0.85;
  // Waterlogged: Dagon's soaking is a movement tax, not damage.
  if (f.statuses.drench > 0 && !unslowable) m *= 0.84;
  if (f.installs && f.installs.speedMul) m *= f.installs.speedMul;
  return m;
}

function setAnim(f, key) {
  if (f.animKey !== key) {
    // Where the animation was CUT from, for backends that can blend a state
    // change instead of snapping (render3d): the outgoing state and the
    // playhead it was left at. Sprites ignore it — a drawing cuts.
    f.prevAnim = { key: f.animKey, t: f.animTime };
    f.animKey = key;
    f.animTime = 0;
  }
}

// ------------------------------------------------------------------ actions

function beginAction(f, kind, dur, anim, opts = {}) {
  f.action = { kind, t: 0, dur, anim, ...opts };
  // Committing to an action ends the visual facing sweep: hitboxes mirror on
  // `facing` snapshotted at spawn (combat.js), and for up to TURN_TIME the art
  // could still be drawn mid-turn the other way. A fighter who swings turns
  // decisively.
  f.facingVis = f.facing;
  // A rewind is a cut even when the key does not change (jab 2 restarting the
  // jab clip), so it records prevAnim the same way setAnim does — and before
  // the rewind, while animTime still says where the old playhead was.
  if (anim && f.animKey === anim) f.prevAnim = { key: anim, t: f.animTime };
  if (anim) setAnim(f, anim);
  f.animTime = 0;
}

function executeMove(f, move, opts = {}) {
  const total = move.delay + move.dur + move.recover;
  // `keepMomentum` travels from the move onto the action because it is the
  // MOVE that knows whether it slides: a grounded attack otherwise bleeds its
  // speed off the moment it locks movement, which is right for a tilt thrown on
  // the spot and wrong for a dash attack, whose whole idea is the run carrying
  // through the swing.
  beginAction(f, "attack", total, move.anim, { move, keepMomentum: move.keepMomentum });
  if (move.lungeVx && f.grounded) f.vx += f.facing * move.lungeVx * 3;
  spawnMelee(f, {
    ...move,
    base: move.baseKb,
  });
  if (opts.grunt) playGrunt(f.charKey);
}

function beginLight(f, input) {
  let variant;
  if (!f.grounded) {
    variant = input.down ? "downAir" : input.up ? "upAir" : "air";
  } else if (f.crouching || input.down) {
    variant = "down";
  } else if (input.up) {
    variant = "up";
  } else if (isRunning(f)) {
    // A light press at a run is the DASH ATTACK, not a side tilt. The tilt is
    // still one flick of the right stick away (beginTilt), which is the whole
    // reason the run can afford to have its own attack: nothing was lost.
    variant = "dash";
  } else {
    // jab chain
    if (f.jabResetT <= 0) f.jabStep = 0;
    const move = lightMove(f.char, "jab", f.jabStep);
    f.jabStep = (f.jabStep + 1) % 3;
    f.jabResetT = 0.6;
    executeMove(f, move);
    return;
  }
  executeMove(f, lightMove(f.char, variant));
}

/**
 * A tilt thrown with the right stick.
 *
 * The tilt stick's whole point is that it does not need the left stick's help:
 * a side tilt off a light press only comes out at a run (otherwise the jab
 * chain wins), and up/down tilts need a direction held. Flicked, each one is a
 * single deliberate attack — and in the air, the aerial for that direction,
 * which is the same grammar one level up.
 */
function beginTilt(f, dir) {
  if (!dir) return;
  if (!f.grounded) {
    executeMove(f, lightMove(f.char, dir === "up" ? "upAir" : dir === "down" ? "downAir" : "air"));
    return;
  }
  if (dir === "left" || dir === "right") {
    // Turn into the flick: a tilt aimed behind you is a tilt behind you.
    f.facing = dir === "left" ? -1 : 1;
    executeMove(f, lightMove(f.char, "side"));
    return;
  }
  executeMove(f, lightMove(f.char, dir === "up" ? "up" : "down"));
}

/** Moving fast enough on the ground to have a run's attacks rather than a
 *  standing fighter's — the initial dash, or a sprint that has kept its speed
 *  after it. One definition, so the light and heavy dash attacks can never
 *  disagree about when a fighter is running. */
function isRunning(f) {
  return f.grounded && (f.dashT > 0 || Math.abs(f.vx) > stats(f).speed * 0.7);
}

function beginHeavy(f, input) {
  if (!f.grounded) {
    executeMove(f, heavyMove(f.char, "air"));
    return;
  }
  // Out of a run the heavy button throws its dash attack instead of planting
  // for a charge: a smash is a fighter standing still deciding to, and stopping
  // a sprint dead to start one is not a decision anybody was making on purpose.
  // Holding a direction does not change it — up and down smashes are standing
  // moves, and at a run the input already means "keep going that way".
  if (isRunning(f) && !f.crouching) {
    executeMove(f, heavyMove(f.char, "dash"), { grunt: true });
    return;
  }
  const variant = input.down || f.crouching ? "down" : input.up ? "up" : "side";
  f.charging = { variant, t: 0 };
  setAnim(f, "charge");
}

/**
 * Let go of a charged smash.
 *
 * A side smash can be ANGLED on release, by holding the right stick off
 * horizontal — Smash's angled forward smash, three attacks out of one, and most
 * of the vertical mixup in the grounded game. The right stick is used rather
 * than the left because the left one already chose which smash this is: holding
 * up or down at the start picks the up or down variant, so it has nothing left
 * to say about aim. Holding it is safe: the same stick FLICKED throws a tilt,
 * but a fighter mid-charge cannot act, so an aim never becomes an attack.
 *
 * The hitbox is swung about the fighter rather than simply nudged, so an angled
 * smash reaches the same distance along its new line — and because the strike
 * arc is measured off the hitbox (moves.js), the crescent follows the aim for
 * free.
 */
function releaseHeavy(f, input) {
  const c = f.charging;
  if (!c) return;
  f.charging = null;
  const charge = clamp(c.t / 0.8, 0, 1);
  const move = heavyMove(f.char, c.variant, charge);
  const aim = clamp(input?.tiltY || 0, -1, 1);
  if (c.variant === "side" && Math.abs(aim) > 0.25) {
    const tilt = aim * SMASH_TILT;                 // + is downward, as y is
    const radius = move.ox + move.w * 0.5;
    move.oy += Math.sin(tilt) * radius;
    move.ox *= Math.cos(tilt);
    move.w *= Math.cos(tilt);
    move.angle = clamp(move.angle - tilt * SMASH_TILT_ANGLE, -1.2, 1.4);
    move.label = (tilt < 0 ? "High " : "Low ") + move.label;
  }
  executeMove(f, move, { grunt: charge > 0.5 });
  if (charge > 0.25) {
    burst(f.x, f.y - 90, f.char.theme, 14 + charge * 16, 1 + charge);
    state.camera.shake = Math.max(state.camera.shake, 3 + charge * 4);
  }
}

function beginDodge(f, type, dir = 0) {
  const now = state.matchTime;
  if (now - f.lastDodgeAt < DODGE_STALE_WINDOW) f.dodgeStale = clamp(f.dodgeStale + 1, 0, 3);
  else f.dodgeStale = 0;
  f.lastDodgeAt = now;

  const staleMul = 1 - f.dodgeStale * 0.25;
  // Blinded (Earthen Insect Trance): the dodge still happens, it is just timed
  // against a shape rather than a fighter — half the invincibility.
  const blindMul = f.statuses.blind > 0 ? 0.5 : 1;
  const iframeMul = (f.char.passive.id === "heavenlyVoid" ? 1.25 : 1) * staleMul * blindMul;

  if (type === "roll") {
    beginAction(f, "dodge", ROLL_TIME, dodgeAnim(f, "dodge_roll"), { lockMovement: true, keepMomentum: true });
    f.vx = dir * (ROLL_DIST / ROLL_TIME);
    f.invuln = Math.max(f.invuln, 0.3 * iframeMul);
  } else if (type === "spot") {
    beginAction(f, "dodge", SPOT_DODGE_TIME, "crouch", { lockMovement: true });
    f.vx = 0;
    f.invuln = Math.max(f.invuln, 0.32 * iframeMul);
  } else {
    beginAction(f, "dodge", AIR_DODGE_TIME, dodgeAnim(f, "dodge_air"), { lockMovement: false });
    f.invuln = Math.max(f.invuln, 0.26 * iframeMul);
    f.airDodged = true;
  }
  playSfx("dash", 0.9);
  dust(f.x, f.y, 8);
}

// ------------------------------------------------------------------ ledges

/**
 * How much of a ledge option's intangibility this fighter still gets.
 *
 * Smash Ultimate's anti-camping rule, exactly (ssbwiki.com/Edge): full on the
 * first grab, 0.8x after one regrab, 0.5x after two, nothing from three on —
 * and the counter resets the moment they are grounded, which is why climbing
 * up costs nothing and grab -> drop -> regrab costs everything.
 */
function ledgeInvulnScale(f) {
  const i = Math.min(Math.max(f.ledgeGrabs - 1, 0), LEDGE_REGRAB_SCALE.length - 1);
  return LEDGE_REGRAB_SCALE[i];
}

/** Smoothstep, the shape every ledge transition below travels on: leaves and
 *  arrives slowly, quickest in the middle. */
function ease(k) {
  const t = clamp(k, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * A LEDGE TRANSITION: the fighter travels, on the clock, instead of arriving.
 *
 * `from`/`to` are simulation positions and the fighter is moved between them
 * frame by frame, so the hurtbox goes where the drawing goes — the fighter
 * actually makes the trip rather than the picture being slid over a snap.
 * `kind` is what the transition IS, which decides the pose sequence and what
 * happens when it lands (finishLedgeExit).
 */
function beginLedgeMove(f, kind, dur, toX, toY, extra = {}) {
  f.ledgeMove = {
    kind, dur, t: 0,
    fromX: f.x, fromY: f.y, toX, toY,
    ...extra,
  };
  f.vx = 0;
  f.vy = 0;
  f.fastFalling = false;
}

/** Where a transition has got to. `x` and `y` run on different curves for the
 *  climbs: the body comes UP first and swings IN second, which is what a pull-up
 *  is — a straight diagonal reads as being winched. The two curves also OVERLAP
 *  less than they used to, which is most of what the longer durations bought:
 *  the rise finishes and the step over starts, instead of both happening at
 *  once in the middle. */
function ledgeMovePos(m) {
  const k = clamp(m.t / m.dur, 0, 1);
  if (m.kind === "catch") {
    // The catch is one reach: both axes together, no arc.
    const e = ease(k);
    return { x: m.fromX + (m.toX - m.fromX) * e, y: m.fromY + (m.toY - m.fromY) * e };
  }
  const ky = ease(k / 0.62);              // up, and up first
  const kx = ease((k - 0.34) / 0.66);     // over, once the height is nearly won
  return { x: m.fromX + (m.toX - m.fromX) * kx, y: m.fromY + (m.toY - m.fromY) * ky };
}

/** The pose a transition is drawing this frame. Reuses the poses the roster
 *  already has — a catch is the fall it came in on, a climb is a rise and a
 *  landing, a roll is the roll — so none of this waits on new art. */
function ledgeMoveAnim(m) {
  const k = m.t / m.dur;
  if (m.kind === "catch") return m.rising ? "jump" : "fall";
  // Off the ledge, all three open with a beat of the HANG. The body barely
  // moves in the first frames anyway — the smoothstep is at its slowest there
  // — so this is the moment of taking the weight before the pull, and without
  // it the rise pose appears while the fighter is still hanging.
  if (k < 0.1) return "ledge";
  if (m.kind === "roll") return k < 0.78 ? "dodge_roll" : "land";
  if (m.kind === "attack") return "jump";
  return k < 0.7 ? "jump" : "land";
}

/** Step one transition. Returns true while it is still running, so the caller
 *  knows the fighter is not doing anything else this frame. */
function updateLedgeMove(f, dt) {
  const m = f.ledgeMove;
  m.t += dt;
  const done = m.t >= m.dur;
  const p = done ? { x: m.toX, y: m.toY } : ledgeMovePos(m);
  f.x = p.x;
  f.y = p.y;
  setAnim(f, ledgeMoveAnim(m));
  if (!done) return true;
  f.ledgeMove = null;
  if (m.kind === "catch") {
    // Arrived on the hang: from here the ledge options are live.
    setAnim(f, "ledge");
    f.ledgeTimer = 0;
    return true;
  }
  f.grounded = true;
  f.vx = 0;
  f.landT = LAND_SQUASH_TIME;
  f.landTimer = 0.12;
  dust(f.x, f.y, 8);
  if (m.kind === "attack") {
    executeMove(f, { ...lightMove(f.char, "side"), label: "Ledge " + f.char.light.label });
  }
  return false;
}

function tryGrabLedge(f) {
  if (f.grounded || f.ledge || f.ledgeCooldown > 0 || f.respawnTimer > 0) return;
  // Must have genuinely left the stage (no walk-off regrab loops) and not be
  // reeling — the ledge is a recovery tool, not a combo breaker.
  //
  // Rising grabs are allowed: a double jump that carries you past the ledge
  // catches it on the way up, which is most of what Smash's "magnet hands"
  // feel is. The old `vy < -70` gate made the whole rise ineligible — jumps
  // launch at 745-800 px/s, so you had to float over the snap window and come
  // back DOWN into it. The walk-off loop it guarded against is already covered
  // by airT and the getup cooldowns.
  if (f.hitstun > 0.05 || f.airT < 0.18) return;
  const plat = mainPlatform(state.platforms);
  if (f.y < plat.y - LEDGE_GRAB_Y_ABOVE || f.y > plat.y + LEDGE_GRAB_Y_BELOW) return;
  for (const side of [-1, 1]) {
    const edgeX = side === -1 ? plat.x : plat.x + plat.w;
    const outside = side === -1 ? f.x <= edgeX : f.x >= edgeX;
    if (outside && Math.abs(f.x - edgeX) <= LEDGE_GRAB_X) {
      // One hand per ledge. Two fighters could hold the same point, drawn on
      // top of each other with both hang timers running. Instead the newcomer
      // TRUMPS: they take the ledge and the occupant is popped off it —
      // outward and slightly up, briefly protected so the trump itself is a
      // positional win rather than a free hit. (Smash's rule, and the reason
      // hogging a ledge is an interaction instead of a wall.)
      const occupant = state.fighters.find(
        (o) => o !== f && !o.dead && o.ledge && o.ledge.edgeX === edgeX
      );
      if (occupant) {
        occupant.ledge = null;
        // Including one still REACHING for it: a trump mid-catch has to end
        // the trip too, or they carry on travelling to a hang they no longer
        // have.
        occupant.ledgeMove = null;
        occupant.ledgeCooldown = 0.6;
        occupant.vx = side * 170;
        occupant.vy = -240;
        occupant.invuln = Math.max(occupant.invuln, 0.3);
        dust(occupant.x, occupant.y - 40, 6);
        playSfx("whoosh", 0.6);
      }
      f.ledge = { side, edgeX, plat };
      // Not a snap to the hang point: the fighter REACHES it, over
      // LEDGE_CATCH_TIME, still drawing the fall (or the rise) they arrived
      // on. `updateLedgeMove` swaps to the hang pose when the hands land.
      f.spin = 0;
      f.action = null;
      f.charging = null;
      f.shielding = false;
      f.airJumpsLeft = stats(f).airJumps;
      f.airDodged = false;
      f.facing = side === -1 ? 1 : -1;
      f.ledgeTimer = 0;
      const hangX = edgeX + (side === -1 ? -LEDGE_HANG_X : LEDGE_HANG_X);
      const hangY = plat.y + LEDGE_HANG_Y;
      // Timed by distance, so the reach travels at one speed wherever in the
      // snap box it started (constants.js LEDGE_CATCH_SPEED).
      const reach = Math.hypot(hangX - f.x, hangY - f.y);
      const catchTime = clamp(reach / LEDGE_CATCH_SPEED, LEDGE_CATCH_MIN, LEDGE_CATCH_MAX);
      // The reach plus a grace on the hang — and the whole of it scaled by how
      // many times they have taken this ledge without touching the stage. At
      // the fourth grab the scale is zero and the reach itself is a free hit,
      // which is the point of the rule.
      f.ledgeGrabs += 1;
      f.invuln = Math.max(f.invuln,
        (catchTime + LEDGE_HANG_INVULN) * ledgeInvulnScale(f));
      beginLedgeMove(f, "catch", catchTime, hangX, hangY, { rising: f.vy < -20 });
      playSfx("landing", 0.3);
      dust(f.x, f.y, 8);
      return;
    }
  }
}

function updateLedge(f, dt, input) {
  const l = f.ledge;
  // The reach onto the ledge, and the climb off it, are trips rather than
  // events: while one is running it owns the fighter and no option is live.
  if (f.ledgeMove) {
    if (f.hitstun > 0) { f.ledgeMove = null; f.ledge = null; return; }
    if (!updateLedgeMove(f, dt)) f.ledge = null;
    return;
  }
  f.ledgeTimer += dt;
  setAnim(f, "ledge");
  const inward = l.side === -1 ? input.right : input.left;
  const outward = l.side === -1 ? input.left : input.right;
  const inX = (to) => l.edgeX + (l.side === -1 ? to : -to);

  if (f.ledgeTimer > 2.8 || input.down || outward) {
    f.ledge = null;
    f.ledgeCooldown = 0.45;
    f.vx = (l.side === -1 ? -1 : 1) * 130;
    f.vy = 90;
    return;
  }
  if (input.jumpP) {
    // The one exit that never needed a transition and never should have had a
    // teleport: push off FROM the hang and let the arc do the rest. The old
    // version placed the fighter above the lip first and then launched, which
    // is the jump starting after the interesting part of it.
    f.ledge = null;
    f.ledgeCooldown = 0.5;
    f.vy = -stats(f).jump * 0.95;
    f.vx = (l.side === -1 ? 1 : -1) * 150;
    f.invuln = Math.max(f.invuln, LEDGE_JUMP_INVULN * ledgeInvulnScale(f));
    setAnim(f, "jump");
    dust(f.x, f.y, 10);
    return;
  }
  if (input.lightP || input.heavyP) {
    f.ledge = null;
    f.ledgeCooldown = 0.55;
    f.invuln = Math.max(f.invuln,
      LEDGE_ATTACK_TIME * LEDGE_INVULN_TRAVEL * ledgeInvulnScale(f));
    beginLedgeMove(f, "attack", LEDGE_ATTACK_TIME, inX(52), l.plat.y);
    return;
  }
  if (inward || input.shieldHeld) {
    const roll = input.shieldHeld;
    f.ledge = null;
    f.ledgeCooldown = 0.55;
    const dur = roll ? LEDGE_ROLL_TIME : LEDGE_CLIMB_TIME;
    // Covered while travelling, exposed on arrival — the last quarter of the
    // climb and every frame after it is a punish window.
    f.invuln = Math.max(f.invuln, dur * LEDGE_INVULN_TRAVEL * ledgeInvulnScale(f));
    beginLedgeMove(f, roll ? "roll" : "climb", dur, inX(roll ? 110 : 56), l.plat.y);
  }
}

// ---------------------------------------------------------------- platforms

/** How hard the stick is being pushed sideways, 0..1 — what tells a walk from
 *  a run (constants.js RUN_TILT).
 *
 *  An absent axis means FULL deflection, not none. Only a real pad reports
 *  `moveX`; the CPU builds its input from `dirX` alone (ai.js), as do the
 *  smokes, and a keyboard is filled in by playerInput. Reading a missing axis
 *  as zero made those callers walk as far as the ledge brake was concerned and
 *  run as far as the movement was — so the CPU moved at full speed and could
 *  not leave a platform, which is a stuck fighter rather than a careful one. */
function moveTilt(input) {
  const ax = Math.abs(input.moveX || 0);
  return ax > 0 ? Math.min(1, ax) : Math.abs(input.dirX || 0);
}

/** How far past a platform's lip a fighter can stand before they are off it.
 *  Read by the ledge brake as well as by the contact test, so "the last pixel
 *  you can stand on" is one number rather than two that drift. */
function standMargin(plat) {
  return plat.kind === "main" ? 14 : plat.kind === "respawn" ? 0 : 24;
}

/**
 * THE LEDGE BRAKE: you do not leave the ground unless you meant to.
 *
 * Smash protects this with the TEETER — walk slowly to the lip and the
 * character stops there, arms windmilling, and will not step off until the
 * stick is pushed past a threshold (ssbwiki.com/Teeter). That mechanic needs
 * an analog walk to hang off, and this game has none: `dirX` is ±1 past a
 * 0.28 deadzone, so every input accelerates toward the same top speed. The
 * distinction it is really drawing, though, is not slow-versus-fast. It is
 * DELIBERATE versus not, and that this game can answer exactly: a fighter
 * holding toward the edge has decided, and one coasting on leftover momentum
 * has not.
 *
 * So momentum alone never carries anyone off. Hold the direction and you walk,
 * run or dash off the end as before — chasing, edge-cancelling, dropping to
 * the ledge are all untouched, because all of them are held inputs.
 *
 * Measured before this existed: one frame of dash flick needed 42 px of runway
 * to stop in, against 4 px for the same one frame of walk. That is the whole
 * complaint — the dash starts at full burst speed by design (startDash), so the
 * shortest possible tap already spends more room than most players read as a
 * tap's worth.
 *
 * Hitstun and committed actions are left out on purpose. Being knocked off the
 * stage is the game working, and a dash attack that carries its owner off the
 * end is a move with a cost, not an accident.
 */
function brakeAtLedge(f, input) {
  if (!f.wasGrounded || f.hitstun > 0 || f.ledge || f.dead) return;
  // Committed actions are exempt — a dash attack whose slide carries its owner
  // off the end is a move with a cost, and the roll and the dash grab both
  // spend momentum the player built themselves. A LUNGE is not that: the move
  // chooses the speed and the direction, holds the player still for it, and was
  // by far the commonest way anyone left a platform without deciding to. It
  // brakes like anything else, and holding the direction still takes it over.
  if (f.action && !f.action.lunge) return;
  const plat = f.currentPlatform;
  if (!plat || plat.ghost) return;
  const dir = Math.sign(f.vx);
  if (!dir) return;
  if (input.dirX === dir) {
    // Held toward the edge. RUNNING off is a decision and goes through;
    // WALKING off does not, which is the teeter proper — Smash will not let a
    // walk take you over the lip until the stick is pushed further, and now
    // that this game has a walk it can say the same thing. Pushing to a run,
    // jumping, or dropping through are all still one input away.
    if (moveTilt(input) >= RUN_TILT) return;
  }
  const m = standMargin(plat);
  const lip = dir > 0 ? plat.x + plat.w + m : plat.x - m;
  if (dir > 0 ? f.x <= lip : f.x >= lip) return;
  f.x = lip;
  f.vx = 0;
}

/**
 * TEETERING: standing with your toes over the drop.
 *
 * The ledge brake puts fighters here constantly — that is its whole job, it
 * stops a slide at the lip — and nothing drew it, so the most common thing
 * that happens at an edge looked exactly like standing in the middle of the
 * stage. It is also the answer to "when do you NOT want a ledge hang": a
 * fighter who stopped at the edge has not left it, and should read as balanced
 * on it rather than as anything to do with hanging.
 *
 * Sets `f.teeterT`, seconds spent there, which the pose (pickAnim) and the
 * procedural wobble (motion.js) both read. Requires a moment of standing
 * first, so a fighter crossing the last few pixels at speed is running, not
 * teetering, and reads as running.
 */
function updateTeeter(f, dt) {
  const plat = f.currentPlatform;
  const still = f.grounded && !f.action && !f.charging && !f.shielding
    && !f.crouching && !f.ledge && !f.ledgeMove && f.hitstun <= 0
    && Math.abs(f.vx) < 24;
  if (!still || !plat || plat.ghost) { f.teeterT = 0; f.teeterDir = 0; return; }
  const m = standMargin(plat);
  const left = plat.x - m;
  const right = plat.x + plat.w + m;
  const dir = f.x >= right - TEETER_EDGE ? 1 : f.x <= left + TEETER_EDGE ? -1 : 0;
  if (!dir) { f.teeterT = 0; f.teeterDir = 0; return; }
  f.teeterDir = dir;
  f.teeterT += dt;
}

/** Whether the teeter has held long enough to be worth drawing. */
export function isTeetering(f) {
  return f.teeterT > TEETER_DELAY;
}

function resolvePlatforms(f, prevY) {
  f.grounded = false;
  // A fighter's own revival platform is checked first and only for them, so
  // they can stand on it, walk along it, and step off the end of it exactly the
  // way they would a real one.
  const plats = f.respawnPlat ? [respawnPlatShape(f), ...state.platforms] : state.platforms;
  for (const plat of plats) {
    // phased-out platform (Active Boards: Bone Sanctum, Empty City)
    if (plat.ghost) continue;
    if (f.dropTimer > 0 && plat.kind !== "main") continue;
    const margin = standMargin(plat);
    if (f.x < plat.x - margin || f.x > plat.x + plat.w + margin) continue;
    if (f.vy < 0) continue;
    if (prevY <= plat.y + 4 && f.y >= plat.y) {
      f.y = plat.y;
      f.vy = 0;
      if (!f.wasGrounded) {
        f.landTimer = 0.14;
        f.landT = LAND_SQUASH_TIME;
        f.spin = 0;                  // always come to rest on your feet
        f.animTime = 0;
        playSfx("landing", 0.3);
        dust(f.x, f.y, 8);
        // Landing out of an aerial costs part of that move's recovery, which
        // is what makes aerials a commitment instead of a free poke — before
        // this, cancelling an aerial into the ground was strictly better than
        // finishing it.
        if (f.action && f.action.kind === "attack" && f.action.move) {
          const lag = Math.max(AERIAL_LAND_LAG_MIN,
                               (f.action.move.recover || 0) * AERIAL_LAND_LAG_MULT);
          f.action = null;
          f.landLag = lag;
          f.landTimer = Math.max(f.landTimer, lag);
        }
      }
      f.grounded = true;
      f.currentPlatform = plat;
      f.airJumpsLeft = stats(f).airJumps;
      f.airDodged = false;
      f.fastFalling = false;
      f.coyote = COYOTE_TIME;
      break;
    }
  }
}

/** Begin a ground dash in `dir`. Shared by the double tap and the dash button
 *  so the two cannot drift apart — same duration, same dust, same sound. */
function startDash(f, dir) {
  f.dashT = DASH_TIME;
  f.dashDir = dir;
  // The dash is a BURST, so it starts at burst speed instead of accelerating
  // into it. `DASH_MULT` is a cap on the movement code's usual acceleration,
  // and a fighter walking from a standstill spends the whole window climbing
  // toward it — which meant the shorter the dash got, the SLOWER it was, since
  // it ended before the speed arrived. Shortening it for control then cost the
  // one thing a dash is for. Snapping the velocity here separates the two:
  // DASH_TIME says how long, DASH_MULT says how fast, and they stop fighting.
  //
  // Floored rather than assigned, so dashing out of a run never brakes you.
  const target = stats(f).speed * DASH_MULT * speedMul(f);
  if (Math.abs(f.vx) < target) f.vx = dir * target;
  dust(f.x - dir * 20, f.y, 8);
  playSfx("whoosh", 0.5);
}

// ------------------------------------------------------------------- KO

export function ringOut(f) {
  const opp = opponentOf(f);
  f.stocks -= 1;
  // Result-screen bookkeeping. The KO is credited to whoever last hit them
  // while that credit still stands (combat.js) — a fighter who walked off the
  // edge on their own scores nobody a KO, which is the honest reading of a
  // self-destruct.
  f.tally.falls += 1;
  const killer = f.lastHitT > 0 ? f.lastHitBy : null;
  if (killer && killer !== f) killer.tally.kos += 1;
  playSfx("launch", 1);
  playKoCry(f.charKey);
  rumbleEvent(f, "ko");
  state.camera.shake = Math.max(state.camera.shake, 16);
  state.slowMo = Math.max(state.slowMo, 0.35);
  state.screenFlash = { color: opp ? opp.char.theme : "#ffffff", life: 0.28, maxLife: 0.28 };
  const bx = clamp(f.x, 80, 1200);
  const by = clamp(f.y, 80, 640);
  burst(bx, by, f.char.theme, 54, 1.9);
  ring(bx, by, f.char.theme, 200);
  banner("KO!", "#ffffff", { y: 200, size: 84, life: 1.0 });

  // clear this fighter's combat objects — including scripted entities
  // (domains, traps, summons), so a KO'd fighter's ultimate stops fighting
  for (let i = state.hitboxes.length - 1; i >= 0; i--) if (state.hitboxes[i].owner === f) state.hitboxes.splice(i, 1);
  for (let i = state.projectiles.length - 1; i >= 0; i--) if (state.projectiles[i].owner === f) state.projectiles.splice(i, 1);
  for (let i = state.entities.length - 1; i >= 0; i--) if (state.entities[i].owner === f) state.entities.splice(i, 1);
  if (state.domainOverlay && state.domainOverlay.ownerId === f.id) state.domainOverlay = null;
  if (state.domain && state.domain.owner === f) state.domain = null;
  // A fighter KO'd mid-call loses the action carrying the "open the barrier"
  // event. domainOpen() would notice on its own — it checks the action is still
  // theirs — but dropping the reference here keeps a dead fighter out of it.
  if (state.domainCasting?.f === f) state.domainCasting = null;

  f.action = null; f.charging = null; f.counter = null; f.reflect = null; f.healing = null;
  f.simpleDomain = null;
  clearGrabLinks(f);
  f.installs = null; f.spriteChar = null; f.hitstun = 0; f.statuses = freshStatuses();
  f.vx = 0; f.vy = 0; f.ledge = null; f.ledgeMove = null; f.ledgeGrabs = 0;
  f.dizzy = 0; f.prone = 0; f.armorT = 0;
  f.spin = 0; f.spinAngle = 0; f.trail.length = 0;
  // The revival platform goes with the stock it belonged to, whether or not
  // there is another one coming.
  f.respawnPlat = null;

  if (f.stocks <= 0) {
    f.dead = true;
    f.x = -9999;
    return;
  }
  f.respawnTimer = RESPAWN_WAIT;
}

// Every path that moves a fighter has to run this. A branch that integrates
// position and then returns early without checking — the prone and dizzy
// states used to do exactly that — lets a body sail past the blast zone and
// keep falling forever: no KO, no stock lost, and the round never ends.
// Returns true when the fighter was rung out and the caller must stop.
function checkBlastZones(f) {
  if (f.y > BLAST.bottom || f.x < BLAST.left || f.x > BLAST.right || f.y < BLAST.top) {
    ringOut(f);
    return true;
  }
  return false;
}

/** Where this fighter comes back, given how many are in the match. Exported so
 *  the renderer can put the incoming marker in the right place during the
 *  blackout, instead of guessing from the slot number. */
export function respawnX(f) {
  const respawnSets = {
    2: { 1: 430, 2: 850 },
    3: { 1: 320, 2: 640, 3: 960 },
    4: RESPAWN_X,
  };
  const set = respawnSets[state.fighters.length];
  if (set) return set[f.id] || RESPAWN_X[f.id] || 640;
  // Five or more (the Players vs CPUs and Battle Royal modes): come back where
  // this fighter started, which is already spread across the stage.
  return spawnXs(state.fighters.length)[f.id - 1] ?? RESPAWN_X[f.id] ?? 640;
}

function respawn(f) {
  f.respawnTimer = 0;
  playSfx("respawn");
  f.x = respawnX(f);
  // Standing ON the revival platform, in control from this frame. Smash's rule,
  // and the reason respawning does not feel like a second punishment: the
  // platform is protection you spend, not a wait you serve.
  f.y = RESPAWN_PLATFORM_Y;
  f.vx = 0; f.vy = 0;
  f.damage = 0;
  f.shield = SHIELD_MAX;
  f.respawnPlat = { x: f.x, y: RESPAWN_PLATFORM_Y, t: RESPAWN_PLATFORM_TIME };
  // Held for exactly as long as the platform can last, plus the grace that
  // follows you off it. Leaving early cuts it down to the grace (leaveRespawnPlatform).
  f.invuln = RESPAWN_PLATFORM_TIME + RESPAWN_GRACE;
  f.grounded = true;
  f.action = null; f.charging = null; f.bufferedAction = null;
  f.hitstun = 0; f.landLag = 0; f.landTimer = 0;
  setAnim(f, "idle");
  f.airJumpsLeft = stats(f).airJumps;
  f.facing = f.x < 640 ? 1 : -1;
  f.facingVis = f.facing;
  // Everything Has a Price (Mei Mei): each stock opens with an advance payment
  if (f.char.passive.id === "warCompensation" && f.meter < 25) {
    f.meter = clamp(25, 0, METER_MAX);
    popup(f.x, f.y - 40, "ADVANCE PAID", "#ffd35a", 16);
  }
  dust(f.x, f.y, 20);
  ring(f.x, f.y - 40, f.char.theme, 120);
}

/**
 * The revival platform, once you are standing on it.
 *
 * The player is already in control here — this only decides when the platform
 * goes away, and it goes away the moment they DO anything with that control:
 * Smash's bargain, where the invulnerability lasts exactly as long as you are
 * willing to not play. Attacking, jumping, shielding, dropping through, or
 * simply walking off the edge all end it, and so does the clock.
 */
function stepRespawnPlatform(f, dt, input) {
  const plat = f.respawnPlat;
  plat.t -= dt;
  const acted = input.lightP || input.heavyP || input.specialP || input.ultP ||
                input.domainP || !!input.tiltDir || input.grabP ||
                input.jumpP || input.shieldHeld || input.down;
  const walkedOff = Math.abs(f.x - plat.x) > RESPAWN_PLATFORM_HALF_W;
  if (plat.t <= 0 || acted || walkedOff) leaveRespawnPlatform(f);
}

function leaveRespawnPlatform(f) {
  const plat = f.respawnPlat;
  if (!plat) return;
  f.respawnPlat = null;
  // Whatever was left of the platform's protection is spent; only the grace
  // that carries you off it survives.
  f.invuln = Math.min(f.invuln, RESPAWN_GRACE);
  dust(plat.x, plat.y, 8);
}

/** The revival platform as a platform shape, so resolvePlatforms can stand the
 *  fighter on it without it existing for anyone else — it is theirs alone, and
 *  nobody else can land on it or be blocked by it. */
function respawnPlatShape(f) {
  const plat = f.respawnPlat;
  return {
    x: plat.x - RESPAWN_PLATFORM_HALF_W, y: plat.y,
    w: RESPAWN_PLATFORM_HALF_W * 2, kind: "respawn",
  };
}

// -------------------------------------------------------------- main update

export function updateFighter(f, dt, input) {
  if (f.dead) return;

  // Held for DI: combat.js reads the VICTIM's stick when knockback is applied,
  // and only the owner of a fighter has their input at hand. Stored before the
  // hitlag return so a fighter frozen in hitlag still DIs with a live stick —
  // that freeze is exactly the window Smash players use to pick a direction.
  f.input = input;

  // hitlag freeze: only the freeze timer runs
  if (f.hitPause > 0) {
    f.hitPause -= dt;
    return;
  }
  f.shakeMag = Math.max(0, f.shakeMag - dt * 30);
  updatePresentation(f, dt);

  // timers
  f.invuln = Math.max(0, f.invuln - dt);
  f.hitstun = Math.max(0, f.hitstun - dt);
  f.shieldStun = Math.max(0, f.shieldStun - dt);
  f.landTimer = Math.max(0, f.landTimer - dt);
  f.landLag = Math.max(0, f.landLag - dt);
  f.dropTimer = Math.max(0, f.dropTimer - dt);
  f.jumpBuffer = Math.max(0, f.jumpBuffer - dt);
  f.coyote = Math.max(0, f.coyote - dt);
  f.turnLock = Math.max(0, f.turnLock - dt);
  f.ledgeCooldown = Math.max(0, f.ledgeCooldown - dt);
  f.jabResetT = Math.max(0, f.jabResetT - dt);
  f.throatLock = Math.max(0, f.throatLock - dt);
  f.throatStrain = Math.max(0, f.throatStrain - dt * 0.5);
  f.armorT = Math.max(0, f.armorT - dt);
  f.grabImmune = Math.max(0, f.grabImmune - dt);
  f.airT = f.grounded ? 0 : f.airT + dt;
  // Paper Trail (Reggie): the fine print always favors him — cooldowns run fast
  const cdRate = f.char.passive.id === "contractor" ? 1.18 : 1;
  for (const k of Object.keys(f.cooldowns)) f.cooldowns[k] = Math.max(0, f.cooldowns[k] - dt * cdRate);

  // meter trickle
  let trickle = METER_PASSIVE;
  if (f.char.passive.id === "gamblersFlow") trickle *= 1.3;
  f.meter = clamp(f.meter + trickle * dt, 0, METER_MAX);

  updateStatuses(f, dt);
  updateSpecialState(f, dt);

  // installs
  if (f.installs) {
    // Furnace Shell is worn heat, so it feeds the same fire bed a burn does.
    if (f.installs.contactBurn) noteFireBurning();
    f.installs.t -= dt;
    if (f.installs.healPerSec) f.damage = Math.max(0, f.damage - f.installs.healPerSec * dt);
    // Flowing Red Scale (Choso): overclocked blood burns him while it's held
    if (f.installs.selfDrainPerSec) f.damage = Math.min(999, f.damage + f.installs.selfDrainPerSec * dt);
    if (f.installs.t <= 0) {
      popup(f.x, f.y - 170, `${f.installs.label} FADED`, "#9aa4c0", 16);
      // A transformation ends with the install that carried it: back to your
      // own body (config_transform.js).
      if (f.installs.spriteChar) f.spriteChar = null;
      f.installs = null;
    }
  }
  if (f.counter) {
    f.counter.t -= dt;
    // Infinity / Sky Fold shimmer: the stance visibly holds, not just a ring
    counterShimmerFx(f, f.counter.color || f.char.theme, dt);
    if (f.counter.t <= 0) f.counter = null;
  }
  if (f.reflect) {
    f.reflect.t -= dt;
    if (f.reflect.t <= 0) f.reflect = null;
  }
  if (f.simpleDomain) {
    f.simpleDomain.t -= dt;
    if (f.simpleDomain.t <= 0) f.simpleDomain = null;
  }
  if (f.healing) {
    f.healing.t -= dt;
    f.damage = Math.max(0, f.damage - f.healing.rate * dt);
    // Reverse Cursed Technique reads as warm gold motes rising off the body —
    // the anime's one healing colour — for the whole channel.
    healMotesFx(f, dt);
    if (f.healing.t <= 0) f.healing = null;
  }

  // The blackout after a KO — the ONLY part of a respawn with no control in it.
  if (f.respawnTimer > 0) {
    f.respawnTimer -= dt;
    if (f.respawnTimer <= 0) respawn(f);
    return;
  }

  // Held in someone's grip (?throw=true): position and fate belong to the
  // grabber's update — the victim's own turn is the struggle, nothing else.
  // Timers and statuses above have already ticked, so a burn keeps burning
  // through a hold.
  if (f.grabbedBy) {
    updateGrabbedFighter(f, dt, input);
    return;
  }

  // Holding someone (?throw=true): the hold is the whole turn — pin, pummel,
  // throw or lose them. Movement, jumping and attacks are all forfeit, which
  // is what a grab costs the grabber.
  if (f.grab) {
    updateGrabHold(f, dt, input);
    return;
  }

  // Back on the revival platform, and already driving: this decides when the
  // platform goes, and then the rest of this function runs as it always does —
  // the input below is live from the first frame of the new stock.
  if (f.respawnPlat) stepRespawnPlatform(f, dt, input);

  // shield-break dizzy
  if (f.dizzy > 0) {
    f.dizzy -= dt;
    setAnim(f, "dizzy");
    if (!f.grounded) {
      f.vy = Math.min(f.vy + GRAVITY * (state.stageMods.gravityMul || 1) * dt, MAX_FALL);
    } else {
      f.vx *= Math.pow(0.8, dt * 60);
    }
    const prevY = f.y;
    f.wasGrounded = f.grounded;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    resolvePlatforms(f, prevY);
    checkBlastZones(f);
    return;
  }

  // Knocked flat (Reggie's sedan and anything else with `knockdown` on the
  // hit). The launch itself plays out as normal hitstun; once that has run out
  // the victim lies where they fell, helpless, then gets back up with a moment
  // of invulnerability so a knockdown is not a free re-hit loop. Airborne
  // victims keep falling first — the clock only runs on the floor.
  if (f.prone > 0 && f.hitstun <= 0) {
    setAnim(f, "prone");
    if (f.grounded) {
      f.prone -= dt;
      f.vx *= Math.pow(0.72, dt * 60);
      if (f.prone <= 0) {
        f.invuln = Math.max(f.invuln, 0.45);
        dust(f.x, f.y, 8);
      }
    } else {
      f.vy = Math.min(f.vy + GRAVITY * (state.stageMods.gravityMul || 1) * dt, MAX_FALL);
    }
    const prevY = f.y;
    f.wasGrounded = f.grounded;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    resolvePlatforms(f, prevY);
    checkBlastZones(f);
    return;
  }

  // hanging on ledge
  if (f.ledge) {
    updateLedge(f, dt, input);
    return;
  }

  // ...and climbing off one. The trip owns the fighter: no gravity, no input,
  // no other pose, until they are standing on the stage. One frame per step,
  // the same as the hang above.
  //
  // Unless something hit them. Every ledge transition is invulnerable, so this
  // should be unreachable — but "should be unreachable" is how a fighter ends
  // up gliding serenely to a ledge in the middle of being launched, so the
  // trip yields to knockback rather than trusting the window.
  if (f.ledgeMove) {
    if (f.hitstun <= 0) {
      updateLedgeMove(f, dt);
      return;
    }
    f.ledgeMove = null;
  }

  const st = stats(f);
  const inHitstun = f.hitstun > 0;
  const canAct = !inHitstun && !f.action && !f.charging && f.shieldStun <= 0 && f.landLag <= 0;

  // Attack buffering. Jump was already buffered (JUMP_BUFFER); attack, heavy
  // and special presses were simply dropped when `canAct` was false, so an
  // input during hitstun or the tail of a move read as the game ignoring you.
  // A press is remembered for ACTION_BUFFER and fires the instant control
  // returns, which is most of what "responsive" means in a fighter.
  // A Domain Expansion costs the entire bar, so silently eating the press
  // because the fighter was two frames into a jab is the worst possible
  // outcome. It buffers like everything else, ahead of the smaller actions.
  const domainSlot = input.domainP ? domainSlotFor(f, input) : -1;
  // Buffered whether it opens an Expansion or casts a Simple Domain (slot -1):
  // both are the domain button, and eating either because the fighter was two
  // frames into a jab is the outcome the buffer exists to prevent.
  if (input.domainP && (domainSlot >= 0 || domainSpecialSlot(f))) {
    f.bufferedAction = { kind: "domain", slot: domainSlot, t: ACTION_BUFFER };
  } else if (input.tiltDir) {
    f.bufferedAction = { kind: "tilt", dir: input.tiltDir, t: ACTION_BUFFER };
  } else if (THROW_ENABLED && input.grabP) {
    f.bufferedAction = { kind: "grab", t: ACTION_BUFFER };
  } else if (input.lightP) f.bufferedAction = { kind: "light", t: ACTION_BUFFER };
  else if (input.heavyP) f.bufferedAction = { kind: "heavy", t: ACTION_BUFFER };
  else if (input.specialP) f.bufferedAction = { kind: "special", t: ACTION_BUFFER };
  if (f.bufferedAction) {
    f.bufferedAction.t -= dt;
    if (f.bufferedAction.t <= 0) f.bufferedAction = null;
  }

  // ---- charging heavy
  if (f.charging) {
    if (!f.grounded) {
      f.charging = null; // knocked or slipped off the ground: charge fizzles
    } else {
      f.charging.t += dt;
      if (!input.heavyHeld || f.charging.t >= 0.8) releaseHeavy(f, input);
      else if (Math.random() < 0.3) burst(f.x, f.y - 90, f.char.theme, 1, 0.5);
    }
  }

  // ---- action progress
  if (f.action) {
    f.action.t += dt;
    // A grab reach checks for a body in its hands every step of its live
    // window; connecting consumes the action (grab.js).
    if (f.action.kind === "grabReach") updateGrabReach(f);
    if (f.action && f.action.t >= f.action.dur) {
      f.action = null;
    }
  }

  // ---- shield handling
  // the shield stays up through shield-stun (blocking a hit must not strip
  // the guard against multi-hit strings); new raises require canAct
  const holdingShield = input.shieldHeld && f.grounded && f.shield > 6 && !f.crouching && f.dizzy <= 0;
  const wantShield = holdingShield && (canAct || (f.shielding && f.shieldStun > 0 && !f.action));
  if (wantShield && !f.shielding) {
    f.shielding = true;
    // parry timing only counts for a deliberate fresh raise — mashing the
    // button keeps the stale timestamp and never re-opens the parry window
    if (state.matchTime - f.shieldDownSince >= 0.25) {
      f.shieldRaisedAt = state.matchTime;
    }
    startShieldLoop();
  } else if (!wantShield && f.shielding) {
    f.shielding = false;
    f.shieldDownSince = state.matchTime;
    stopShieldLoop();
  }
  if (f.shielding) {
    f.shield = Math.max(0, f.shield - SHIELD_DRAIN * dt);
    if (f.shield <= 0) {
      f.shielding = false;
      stopShieldLoop();
    }
  } else {
    f.shield = clamp(f.shield + SHIELD_REGEN * dt, 0, SHIELD_MAX);
  }

  // ---- dodges
  const shieldPressed = input.shieldHeld && !f.prevShield;
  f.prevShield = input.shieldHeld;

  if (canAct) {
    if (f.grounded && f.shielding) {
      if (input.down) {
        beginDodge(f, "spot");
        f.shielding = false;
        stopShieldLoop();
      } else if (input.dirX !== 0) {
        beginDodge(f, "roll", input.dirX);
        f.shielding = false;
        stopShieldLoop();
      }
    } else if (!f.grounded && shieldPressed && !f.airDodged) {
      beginDodge(f, "air");
      f.vx += input.dirX * 340;
      if (input.up) f.vy = Math.min(f.vy, -260);
      if (input.down) f.vy = Math.max(f.vy, 260);
    }
  }

  // ---- crouch
  f.crouching = f.grounded && canAct && input.down && !f.shielding;

  // ---- shield grab (?throw=true)
  // Light or the grab button while the shield is up drops the shield into a
  // grab — Smash's answer to "they are just standing on my bubble", and the
  // reason holding shield against a grappler is the wrong plan.
  if (THROW_ENABLED && canAct && f.shielding && f.grounded &&
      (input.grabP || input.lightP)) {
    f.shielding = false;
    f.shieldDownSince = state.matchTime;
    stopShieldLoop();
    f.bufferedAction = null;
    beginGrab(f);
  }

  // ---- attacks & specials
  if (canAct && !f.shielding && !f.action) {
    // A domain that is open owns SPECIAL (and, for Sukuna, LIGHT/HEAVY after a
    // blade is taken) — that is the interaction the domain exists for, so it is
    // checked before the normal action routing and swallows the press.
    const domainAte = activeDomain(f) ? domainInput(f, input) : false;

    // Domain Expansion: LB, or U / ; on a keyboard. A fresh press wins;
    // otherwise a buffered one fires as soon as control returns.
    const openSlot = domainSlot >= 0 ? domainSlot
      : f.bufferedAction?.kind === "domain" ? f.bufferedAction.slot : -1;
    // A fighter with no Domain Expansion may still have a domain — the Simple
    // Domain the New Shadow Style teaches, which lives in their special list.
    // The domain button casts it, at its own cooldown rather than a full bar,
    // so "the domain button opens my domain" is true for everyone who has one.
    const domainSpecial = (input.domainP || f.bufferedAction?.kind === "domain")
      && openSlot < 0 ? domainSpecialSlot(f) : null;
    if (domainAte) {
      // consumed by the open domain
    } else if (openSlot >= 0 && f.char.domains?.[openSlot]) {
      f.bufferedAction = null;
      if (canOpenDomain(f, openSlot)) performDomain(f, openSlot);
      else if (f.meter < DOMAIN_METER_COST) popup(f.x, f.y - 160, "NEEDS A FULL BAR", "#9aa4c0", 15);
    } else if (domainSpecial) {
      f.bufferedAction = null;
      performSpecial(f, domainSpecial);
    } else if (input.domainP) {
      popup(f.x, f.y - 160, "NO DOMAIN", "#9aa4c0", 15);
    } else if (input.ultP && f.meter >= ULT_METER_COST) {
      performUltimate(f);
    } else if (input.ultP && f.meter < ULT_METER_COST) {
      // Same wording as the domain refusal — they cost the same thing now.
      popup(f.x, f.y - 160, "NEEDS A FULL BAR", "#9aa4c0", 15);
    } else {
      // A fresh press wins over a buffered one; the buffer only covers inputs
      // that arrived while the fighter was busy.
      const act = THROW_ENABLED && input.grabP ? "grab"
        : input.specialP ? "special"
        : input.heavyP ? "heavy"
        : input.lightP ? "light"
        : input.tiltDir ? "tilt"
        : f.bufferedAction?.kind;
      if (act === "grab") {
        // Grounded only, like Smash: the air already belongs to aerials, and
        // an air grab would be a fifth aerial nobody asked for. A press in the
        // air stays buffered and fires on landing.
        if (f.grounded) beginGrab(f);
      } else if (act === "tilt") {
        beginTilt(f, input.tiltDir || f.bufferedAction?.dir);
      } else if (act === "special") {
        const slot = input.down || f.crouching ? "down" : (input.dirX !== 0 ? "side" : "neutral");
        performSpecial(f, slot);
      } else if (act === "heavy") {
        beginHeavy(f, input);
      } else if (act === "light") {
        beginLight(f, input);
      }
      // A grab "used" in the air was not actually spent — it stays buffered
      // for the landing instead.
      if (act && (act !== "grab" || f.grounded)) f.bufferedAction = null;
    }
  }

  // ---- movement
  const locked = f.action?.lockMovement || (f.action && f.action.kind === "attack" && f.grounded) ||
    f.charging || f.shielding || inHitstun || f.healing || (f.counter && f.counter.holdStill);

  const moveMul = speedMul(f);
  // How hard the stick is pushed, which is what separates a walk from a run
  // (constants.js). Only the ground cares: there is no such thing as strolling
  // through the air, so an aerial drift reads full either way.
  const tilt = moveTilt(input);
  const walking = f.grounded && f.dashT <= 0 && tilt > 0 && tilt < RUN_TILT;
  const walkFrac = WALK_MIN + (WALK_MAX - WALK_MIN)
    * clamp((tilt - MOVE_DEADZONE) / Math.max(1e-6, RUN_TILT - MOVE_DEADZONE), 0, 1);
  const topFrac = f.dashT > 0 ? DASH_MULT : walking ? walkFrac : 1;
  // The animation layer and the ledge brake both need to know, and neither is
  // in a position to recompute it — pickAnim runs after the movement block and
  // a slowed fighter's speed alone cannot tell a walk from a snared run.
  f.walking = walking;
  const maxSpeed = (f.grounded ? st.speed : st.airSpeed) * moveMul * topFrac;
  const accel = st.accel * (f.grounded ? 1 : 0.62) * moveMul;
  // Ground friction, shaped by the stage surface (Active Boards): a slick
  // stage (frictionPow < 1) pushes the per-character base toward 1, so
  // momentum lingers and stops become slides.
  const frPow = state.stageMods.frictionPow || 1;
  const friction = frPow === 1 ? st.friction : Math.pow(st.friction, frPow);

  // The dash BUTTON — keyboard only. No pad button is bound to dash any more
  // (`PAD_BUTTONS` in config_controls.js): B went back to special, and dash
  // has the double tap below, which is how it has always mostly been played.
  // The branch stays because the keyboard keeps its key and because a pad
  // binding is one line away if the double tap ever proves not to be enough.
  // Neutral dashes the way the fighter faces, so it is never a no-op.
  if (!locked && !f.crouching && f.grounded && input.dashP) {
    startDash(f, input.dirX || f.facing);
  }

  // The stick shove (input.js, DASH_FLICK): the pad's dash, and the one a
  // player coming from Smash will try first. Facing is set HERE rather than
  // left to the movement block below, because that block will not turn a
  // fighter who is already dashing — and on a flick fast enough to cross the
  // walk threshold and the dash threshold in one sample, the dash is already
  // running by the time it would have. A dash attack that lunged the way the
  // fighter happened to be looking is the bug that costs.
  if (!locked && !f.crouching && f.grounded && input.dashFlick) {
    if (!inHitstun) f.facing = input.dashFlick;
    startDash(f, input.dashFlick);
  }

  if (!locked && !f.crouching) {
    const dir = input.dirX;
    if (dir !== 0) {
      // dash detection: double tap
      const tapped = (dir === 1 && input.right && !f.prevRight) || (dir === -1 && input.left && !f.prevLeft);
      if (tapped && f.grounded) {
        if (f.lastTap.dir === dir && state.matchTime - f.lastTap.t < DASH_TAP_WINDOW) {
          startDash(f, dir);
        }
        f.lastTap = { dir, t: state.matchTime };
      }
      if (f.grounded && dir !== sign(f.vx) && Math.abs(f.vx) > 60 && f.turnLock <= 0) {
        f.turnLock = 0.08;
      }
      if (f.turnLock <= 0) {
        f.vx += dir * accel * dt;
        // Easing the stick back from a run to a walk has to actually slow the
        // fighter down. Clamping alone does it, but instantly, which reads as
        // hitting a wall; friction to the new cap keeps the deceleration the
        // character's own.
        if (walking && Math.abs(f.vx) > maxSpeed) {
          f.vx *= Math.pow(friction, dt * 60);
          if (Math.abs(f.vx) < maxSpeed) f.vx = dir * maxSpeed;
        }
        f.vx = clamp(f.vx, -maxSpeed, maxSpeed);
      } else {
        f.vx *= Math.pow(friction, dt * 80);
      }
      if (!inHitstun && f.dashT <= 0) f.facing = dir;
    } else if (f.grounded) {
      f.vx *= Math.pow(friction, dt * 60);
      if (Math.abs(f.vx) < 8) f.vx = 0;
    }
  } else if (f.grounded && (f.crouching || f.shielding || f.charging)) {
    f.vx *= Math.pow(friction, dt * 90);
    if (Math.abs(f.vx) < 8) f.vx = 0;
  } else if (inHitstun) {
    f.vx *= Math.pow(0.988, dt * 60);
  } else if (f.grounded && !f.action?.keepMomentum) {
    // A locked ground action. A LUNGE gets its own, much gentler drag: it is
    // the one action that sets a big velocity and then holds the fighter still
    // for half a second, so at the ordinary rate it would die in three frames
    // and at no rate at all it slid the width of a quarter of the stage at a
    // flat 520 px/s before stopping dead. Decaying is what makes it read as a
    // lunge that ran out rather than a fighter being dragged.
    f.vx *= Math.pow(friction, dt * (f.action?.lunge ? LUNGE_DRAG : 40));
    if (Math.abs(f.vx) < 8) f.vx = 0;
  }

  if (f.dashT > 0) {
    f.dashT -= dt;
    if (input.dirX === -f.dashDir) f.dashT = 0;
  }

  // face the opponent when standing still
  if (f.grounded && !f.action && !inHitstun && input.dirX === 0 && Math.abs(f.vx) < 40) {
    const opp = opponentOf(f);
    if (opp && !opp.dead) f.facing = opp.x >= f.x ? 1 : -1;
  }
  f.prevLeft = input.left;
  f.prevRight = input.right;

  // ---- jumping
  if (input.jumpP) f.jumpBuffer = JUMP_BUFFER;

  const wantsDrop = f.grounded && (f.crouching || input.down) && f.jumpBuffer > 0 &&
    !locked && !f.charging && f.currentPlatform && f.currentPlatform.kind !== "main";
  if (wantsDrop) {
    f.jumpBuffer = 0;
    f.dropTimer = 0.24;
    f.grounded = false;
    f.y += 9;
    f.vy = Math.max(f.vy, 80);
  } else if (f.jumpBuffer > 0 && !locked && !f.crouching) {
    if (f.grounded || f.coyote > 0) {
      f.jumpBuffer = 0;
      f.coyote = 0;
      f.vy = -st.jump;
      f.takeoffT = TAKEOFF_STRETCH_TIME;
      f.grounded = false;
      f.jumpHeldT = 0;
      f.jumpCut = false;
      if (f.action?.kind === "dodge") f.action = null;
      dust(f.x, f.y, 12);
      playSfx("jump");
    } else if (f.airJumpsLeft > 0 && !inHitstun) {
      f.jumpBuffer = 0;
      f.airJumpsLeft -= 1;
      f.vy = -st.jump * AIR_JUMP_MULT;
      f.takeoffT = TAKEOFF_STRETCH_TIME;
      f.fastFalling = false;
      dust(f.x, f.y, 10);
    }
  }

  // short hop: releasing jump early cuts upward velocity
  if (!f.grounded && f.vy < 0 && !f.jumpCut) {
    f.jumpHeldT += dt;
    if (!input.jumpHeld && f.jumpHeldT < SHORT_HOP_WINDOW + 0.06) {
      f.vy *= SHORT_HOP_CUT;
      f.jumpCut = true;
    }
  }

  // fast fall
  if (!f.grounded && f.vy > -80 && input.down && !f.fastFalling && f.hitstun <= 0) {
    f.fastFalling = true;
    f.vy = Math.max(f.vy, 320);
  }

  // ---- physics
  if (!f.grounded) {
    const fallCap = f.fastFalling ? MAX_FALL * FASTFALL_MULT : MAX_FALL;
    f.vy = Math.min(f.vy + GRAVITY * (state.stageMods.gravityMul || 1) * dt, fallCap);
  }

  const prevY = f.y;
  f.wasGrounded = f.grounded;
  f.x += f.vx * dt;
  // Before the contact test, not after: the brake decides whether this step is
  // allowed to take them off the platform at all, so it has to run while they
  // are still standing on the one they are leaving.
  brakeAtLedge(f, input);
  f.y += f.vy * dt;
  if (f.vy >= 0 || f.grounded) resolvePlatforms(f, prevY);
  else f.grounded = false;

  if (!f.grounded) tryGrabLedge(f);
  // After the contact test, so it reads the platform this step actually left
  // the fighter standing on.
  updateTeeter(f, dt);
  // ONLY THE GROUND clears the regrab penalty (constants.js
  // LEDGE_REGRAB_SCALE). Not time, not being hit, not letting go — Smash's
  // rule verbatim, and the reason grab -> drop -> regrab is the loop that
  // pays for itself while climbing up is free.
  if (f.grounded) f.ledgeGrabs = 0;

  // ---- blast zones
  if (checkBlastZones(f)) return;

  // ---- animation selection
  pickAnim(f, input);
  // The run cycle plays at the pace the fighter is actually travelling. It ran
  // at a fixed rate, which was already wrong for anyone snared or slowed — they
  // over-strode, feet skating — and a walk drawn with the run cycle would have
  // been the same fault at half speed. Floored so a fighter easing to a halt
  // does not freeze mid-stride.
  const strideRate = (f.animKey === "run" || f.animKey === "walk") && f.grounded
    ? clamp(Math.abs(f.vx) / (stats(f).speed || 1), 0.5, 1.3)
    : 1;
  f.animTime += dt * strideRate;
}

// Draw-time state that still has to advance on the fixed clock: tumble spin,
// the facing sweep, the squash timers and the trail history. Runs after the
// hitlag early-return, so a frozen fighter is frozen here too.
function updatePresentation(f, dt) {
  f.landT = Math.max(0, f.landT - dt);
  f.takeoffT = Math.max(0, f.takeoffT - dt);
  f.fxTrailT = Math.max(0, f.fxTrailT - dt);

  // Tumble: spin while reeling, then unwind to upright so a fighter always
  // lands on their feet rather than frozen at whatever angle hitstun ended on.
  //
  // Prone comes first: a knocked-down fighter sweeps to flat on their back and
  // HOLDS there. When the timer ends this branch stops matching and the
  // existing unwind below stands them back up — π/2 rounds to a target of 0 —
  // so the get-up animates for free.
  if (f.prone > 0 && f.hitstun <= 0 && f.grounded && !frameMeta(f.spriteChar || f.charKey, "prone")) {
    // Simulated only: a real delivered `prone` pose is already lying down and
    // must not be tipped over on top of that.
    f.spin = 0;
    const flat = -f.facing * Math.PI / 2;
    f.spinAngle += (flat - f.spinAngle) * (1 - Math.pow(0.0005, dt));
  } else if (f.hitstun > 0 && !f.grounded) {
    f.spinAngle += f.spin * dt;
  } else if (f.spin !== 0 || f.spinAngle !== 0) {
    f.spin *= Math.pow(0.02, dt);
    const target = Math.round(f.spinAngle / (Math.PI * 2)) * Math.PI * 2;
    f.spinAngle += (target - f.spinAngle) * (1 - Math.pow(0.001, dt));
    if (Math.abs(f.spin) < 0.05) f.spin = 0;
    if (Math.abs(f.spinAngle - target) < 0.01) f.spinAngle = 0;
  }

  // Facing flips used to snap the mirror in a single frame, which reads as a
  // teleport. Sweeping the mirror through zero reads as a turn.
  if (f.facingVis !== f.facing) {
    const step = dt / TURN_TIME * 2;
    f.facingVis = Math.abs(f.facing - f.facingVis) <= step
      ? f.facing
      : f.facingVis + Math.sign(f.facing - f.facingVis) * step;
  }

  // Afterimage samples. Recorded on the sim clock so the tail length is the
  // same distance regardless of display refresh rate.
  if (trailStrength(f) > 0) {
    if (++f.trailTick >= TRAIL_STEP) {
      f.trailTick = 0;
      f.trail.push({ x: f.x, y: f.y, facing: f.facingVis, frame: currentFrame(f.charKey, f.animKey, f.animTime), rot: f.spinAngle });
      if (f.trail.length > TRAIL_LEN) f.trail.shift();
    }
  } else if (f.trail.length) {
    f.trail.shift();
  }
}

function pickAnim(f, input) {
  if (f.action) {
    if (f.action.anim) setAnim(f, f.action.anim);
    return;
  }
  if (f.charging) { setAnim(f, "charge"); return; }
  if (f.hitstun > 0) { setAnim(f, "hurt"); return; }
  if (f.healing) { setAnim(f, "specialDown"); return; }
  if (f.counter) { setAnim(f, "specialDown"); return; }
  if (f.shielding) { setAnim(f, "shield"); return; }
  if (!f.grounded) { setAnim(f, f.vy < 0 ? "jump" : "fall"); return; }
  if (f.crouching) { setAnim(f, "crouch"); return; }
  if (f.dashT > 0) { setAnim(f, "dash"); return; }
  // A walk is its own cycle where the art exists and the run cycle at a walking
  // cadence where it does not (characters.js WALK_ANIM), so this line is the
  // whole of the switch-over when round 21 lands.
  if (f.walking && Math.abs(f.vx) > 30) { setAnim(f, "walk"); return; }
  if (Math.abs(f.vx) > 50) { setAnim(f, "run"); return; }
  if (f.landTimer > 0) { setAnim(f, "land"); return; }
  // Standing on the very lip. Its own pose where the art exists, the idle
  // with a procedural sway where it does not (characters.js TEETER_ANIM,
  // motion.js) — either way the edge stops looking like the middle.
  if (isTeetering(f)) { setAnim(f, "teeter"); return; }
  setAnim(f, "idle");
}
