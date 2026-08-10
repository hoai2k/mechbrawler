import { state } from "./state.js";
import { clamp, sign } from "./utils.js";
import { getCharacter } from "./characters.js";
import { lightMove, heavyMove } from "./moves.js";
import { spawnMelee, opponentOf, updateStatuses } from "./combat.js";
import { performSpecial, updateSpecialState } from "./specials.js";
import { performUltimate } from "./ultimates.js";
import { performDomain, domainInput, canOpenDomain, activeDomain, domainSlotFor } from "./domains.js";
import { burst, dust, popup, banner, ring } from "./particles.js";
import { playSfx, playGrunt, playKoCry, startShieldLoop, stopShieldLoop, noteFireBurning } from "./audio.js";
import { rumbleEvent } from "./rumble.js";
import { counterShimmerFx, healMotesFx } from "./fx.js";
import {
  GRAVITY, MAX_FALL, FASTFALL_MULT, BLAST, JUMP_BUFFER, COYOTE_TIME,
  SHORT_HOP_WINDOW, SHORT_HOP_CUT, AIR_JUMP_MULT, DASH_TAP_WINDOW, DASH_TIME,
  DASH_MULT, ACTION_BUFFER, AERIAL_LAND_LAG_MULT, AERIAL_LAND_LAG_MIN, SHIELD_MAX, SHIELD_DRAIN, SHIELD_REGEN, ROLL_TIME, ROLL_DIST,
  SPOT_DODGE_TIME, AIR_DODGE_TIME, DODGE_STALE_WINDOW, METER_MAX, METER_PASSIVE,
  ULT_METER_COST, DOMAIN_METER_COST,
  LEDGE_GRAB_X, LEDGE_GRAB_Y_ABOVE, LEDGE_GRAB_Y_BELOW, LEDGE_HANG_X, LEDGE_HANG_Y,
  RESPAWN_X, SMASH_TILT, SMASH_TILT_ANGLE,
  RESPAWN_WAIT, RESPAWN_PLATFORM_Y, RESPAWN_PLATFORM_HALF_W, RESPAWN_PLATFORM_TIME, RESPAWN_GRACE,
} from "./constants.js";
import { TRAIL_LEN, TRAIL_STEP, TURN_TIME, LAND_SQUASH_TIME, TAKEOFF_STRETCH_TIME } from "./config_tuning.js";
import { mainPlatform, spawnXs } from "./stages.js";
import { frameMeta } from "./assets.js";
import { currentFrame } from "./sprites.js";
import { trailStrength } from "./motion.js";

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
    invuln: 1.4, hitstun: 0, hitPause: 0, shakeMag: 0,
    dizzy: 0, prone: 0, dodgeStale: 0, lastDodgeAt: -10,
    airT: 0, shieldDownSince: -10,
    action: null, charging: null, jabStep: 0, jabResetT: 0,
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
    ledge: null, ledgeCooldown: 0, ledgeTimer: 0,
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
    // read it to find their owner's right stick (see summons.js).
    lastInput: null,
    winner: false,
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
    f.animKey = key;
    f.animTime = 0;
  }
}

// ------------------------------------------------------------------ actions

function beginAction(f, kind, dur, anim, opts = {}) {
  f.action = { kind, t: 0, dur, anim, ...opts };
  f.animTime = 0;
  if (anim) setAnim(f, anim);
}

function executeMove(f, move, opts = {}) {
  const total = move.delay + move.dur + move.recover;
  beginAction(f, "attack", total, move.anim, { move });
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
  } else if (f.dashT > 0 || Math.abs(f.vx) > stats(f).speed * 0.7) {
    variant = "side";
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

function beginHeavy(f, input) {
  if (!f.grounded) {
    executeMove(f, heavyMove(f.char, "air"));
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
 * to say about aim.
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
  const aim = clamp(input?.aimY || 0, -1, 1);
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

function tryGrabLedge(f) {
  if (f.grounded || f.ledge || f.ledgeCooldown > 0 || f.respawnTimer > 0) return;
  // must have genuinely left the stage (no walk-off regrab loops) and not be
  // reeling — the ledge is a recovery tool, not a combo breaker
  if (f.vy < -70 || f.hitstun > 0.05 || f.airT < 0.18) return;
  const plat = mainPlatform(state.platforms);
  if (f.y < plat.y - LEDGE_GRAB_Y_ABOVE || f.y > plat.y + LEDGE_GRAB_Y_BELOW) return;
  for (const side of [-1, 1]) {
    const edgeX = side === -1 ? plat.x : plat.x + plat.w;
    const outside = side === -1 ? f.x <= edgeX : f.x >= edgeX;
    if (outside && Math.abs(f.x - edgeX) <= LEDGE_GRAB_X) {
      f.ledge = { side, edgeX, plat };
      f.x = edgeX + (side === -1 ? -LEDGE_HANG_X : LEDGE_HANG_X);
      f.y = plat.y + LEDGE_HANG_Y;
      f.vx = 0; f.vy = 0;
      f.spin = 0;
      f.action = null;
      f.charging = null;
      f.shielding = false;
      f.airJumpsLeft = stats(f).airJumps;
      f.airDodged = false;
      f.facing = side === -1 ? 1 : -1;
      f.invuln = Math.max(f.invuln, 0.28);
      f.ledgeTimer = 0;
      f.fastFalling = false;
      playSfx("landing", 0.3);
      dust(f.x, f.y, 8);
      return;
    }
  }
}

function updateLedge(f, dt, input) {
  const l = f.ledge;
  f.ledgeTimer += dt;
  setAnim(f, "ledge");
  const inward = l.side === -1 ? input.right : input.left;
  const outward = l.side === -1 ? input.left : input.right;

  if (f.ledgeTimer > 2.8 || input.down || outward) {
    f.ledge = null;
    f.ledgeCooldown = 0.45;
    f.vx = (l.side === -1 ? -1 : 1) * 130;
    f.vy = 90;
    return;
  }
  if (input.jumpP) {
    f.ledge = null;
    f.ledgeCooldown = 0.5;
    f.x = l.edgeX + (l.side === -1 ? 40 : -40);
    f.y = l.plat.y - 8;
    f.vy = -stats(f).jump * 0.95;
    f.invuln = Math.max(f.invuln, 0.32);
    dust(f.x, f.y, 10);
    return;
  }
  if (input.lightP || input.heavyP) {
    f.ledge = null;
    f.ledgeCooldown = 0.55;
    f.x = l.edgeX + (l.side === -1 ? 52 : -52);
    f.y = l.plat.y;
    f.grounded = true;
    f.invuln = Math.max(f.invuln, 0.3);
    executeMove(f, { ...lightMove(f.char, "side"), label: "Ledge " + f.char.light.label });
    return;
  }
  if (inward || input.shieldHeld) {
    const roll = input.shieldHeld;
    f.ledge = null;
    f.ledgeCooldown = 0.55;
    f.x = l.edgeX + (l.side === -1 ? (roll ? 110 : 56) : (roll ? -110 : -56));
    f.y = l.plat.y;
    f.grounded = true;
    f.vx = 0;
    f.invuln = Math.max(f.invuln, roll ? 0.55 : 0.34);
    dust(f.x, f.y, 8);
  }
}

// ---------------------------------------------------------------- platforms

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
    const margin = plat.kind === "main" ? 14 : plat.kind === "respawn" ? 0 : 24;
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
  dust(f.x - dir * 20, f.y, 8);
  playSfx("whoosh", 0.5);
}

// ------------------------------------------------------------------- KO

export function ringOut(f) {
  const opp = opponentOf(f);
  f.stocks -= 1;
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

  f.action = null; f.charging = null; f.counter = null; f.reflect = null; f.healing = null;
  f.simpleDomain = null;
  f.installs = null; f.spriteChar = null; f.hitstun = 0; f.statuses = freshStatuses();
  f.vx = 0; f.vy = 0; f.ledge = null; f.dizzy = 0; f.prone = 0; f.armorT = 0;
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
  const pressedDomainSlot = domainSlotFor(input.domainDir, f.char.domains?.length || 0);
  if (pressedDomainSlot >= 0 && f.char.domains?.[pressedDomainSlot]) {
    f.bufferedAction = { kind: "domain", slot: pressedDomainSlot, t: ACTION_BUFFER };
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
    if (f.action.t >= f.action.dur) {
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

  // ---- attacks & specials
  if (canAct && !f.shielding) {
    // A domain that is open owns SPECIAL (and, for Sukuna, LIGHT/HEAVY after a
    // blade is taken) — that is the interaction the domain exists for, so it is
    // checked before the normal action routing and swallows the press.
    const domainAte = activeDomain(f) ? domainInput(f, input) : false;

    // Domain Expansion: d-pad up / left / right, one slot each. A fresh press
    // wins; otherwise a buffered one fires as soon as control returns.
    const domainSlot = pressedDomainSlot >= 0 ? pressedDomainSlot
      : f.bufferedAction?.kind === "domain" ? f.bufferedAction.slot : -1;
    if (domainAte) {
      // consumed by the open domain
    } else if (domainSlot >= 0 && f.char.domains?.[domainSlot]) {
      f.bufferedAction = null;
      if (canOpenDomain(f, domainSlot)) performDomain(f, domainSlot);
      else if (f.meter < DOMAIN_METER_COST) popup(f.x, f.y - 160, "NEEDS A FULL BAR", "#9aa4c0", 15);
    } else if (pressedDomainSlot >= 0) {
      popup(f.x, f.y - 160, "NO DOMAIN", "#9aa4c0", 15);
    } else if (input.ultP && f.meter >= ULT_METER_COST) {
      performUltimate(f);
    } else if (input.ultP && f.meter < ULT_METER_COST) {
      // Same wording as the domain refusal — they cost the same thing now.
      popup(f.x, f.y - 160, "NEEDS A FULL BAR", "#9aa4c0", 15);
    } else {
      // A fresh press wins over a buffered one; the buffer only covers inputs
      // that arrived while the fighter was busy.
      const act = input.specialP ? "special"
        : input.heavyP ? "heavy"
        : input.lightP ? "light"
        : f.bufferedAction?.kind;
      if (act === "special") {
        const slot = input.down || f.crouching ? "down" : (input.dirX !== 0 ? "side" : "neutral");
        performSpecial(f, slot);
      } else if (act === "heavy") {
        beginHeavy(f, input);
      } else if (act === "light") {
        beginLight(f, input);
      }
      if (act) f.bufferedAction = null;
    }
  }

  // ---- movement
  const locked = f.action?.lockMovement || (f.action && f.action.kind === "attack" && f.grounded) ||
    f.charging || f.shielding || inHitstun || f.healing || (f.counter && f.counter.holdStill);

  const moveMul = speedMul(f);
  const maxSpeed = (f.grounded ? st.speed : st.airSpeed) * moveMul * (f.dashT > 0 ? DASH_MULT : 1);
  const accel = st.accel * (f.grounded ? 1 : 0.62) * moveMul;
  // Ground friction, shaped by the stage surface (Active Boards): a slick
  // stage (frictionPow < 1) pushes the per-character base toward 1, so
  // momentum lingers and stops become slides.
  const frPow = state.stageMods.frictionPow || 1;
  const friction = frPow === 1 ? st.friction : Math.pow(st.friction, frPow);

  // The dash BUTTON. Same dash the double tap starts, reachable without
  // spending a direction on it — which matters most for the thing double tap
  // is worst at: dashing the way you are already walking, where the second tap
  // has to come after a release the player did not want to make. Neutral
  // dashes the way the fighter faces, so it is never a no-op.
  if (!locked && !f.crouching && f.grounded && input.dashP) {
    startDash(f, input.dirX || f.facing);
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
    // locked ground action (attack/special lunge): momentum carries but decays
    f.vx *= Math.pow(friction, dt * 40);
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
  f.y += f.vy * dt;
  if (f.vy >= 0 || f.grounded) resolvePlatforms(f, prevY);
  else f.grounded = false;

  if (!f.grounded && f.vy > -70) tryGrabLedge(f);

  // ---- blast zones
  if (checkBlastZones(f)) return;

  // ---- animation selection
  pickAnim(f, input);
  f.animTime += dt;
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
  if (Math.abs(f.vx) > 50) { setAnim(f, "run"); return; }
  if (f.landTimer > 0) { setAnim(f, "land"); return; }
  setAnim(f, "idle");
}
