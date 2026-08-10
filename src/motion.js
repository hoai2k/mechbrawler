// Procedural sprite motion.
//
// Of the ~180 animation definitions in characters.js, most are a single still
// frame: `jump`, `fall`, `dash`, `hurt`, `dizzy`, `shield`, `dodge_roll` and
// nearly every special are one image held for the whole state. Drawing those
// stills unchanged is what makes the game read as static — a fighter launched
// across the screen is a rigid pose translating, and a 0.42s roll never rolls.
//
// This module derives a draw-time transform from state the simulation already
// keeps (velocity, action phase, hitstun, timers), so one frame can lean,
// tumble, breathe and swing. Nothing here feeds back into the simulation, and
// hurtboxes/hitboxes are computed independently in combat.js, so none of it can
// change what actually connects.

import { state } from "./state.js";
import { clamp } from "./utils.js";
import { cyclePhase } from "./sprites.js";
import { DASH_FX } from "./config_fx.js";
import { headHeightTarget } from "./heights.js";
import { SHIELD_MAX, MAX_FALL } from "./constants.js";
import {
  MOTION as A, SQUASH, SQUASH_DEPTH as S, TRAIL_STRENGTH,
  LAND_SQUASH_TIME, TAKEOFF_STRETCH_TIME,
} from "./config_tuning.js";

const TAU = Math.PI * 2;

/** Per-fighter phase offset, so two of the same character standing together
 *  never breathe in lockstep. */
function phase(f) {
  return f.id * 1.7;
}

function actionPhase(f) {
  const a = f.action;
  if (!a || !a.move) return null;
  const { delay = 0, dur = 0, recover = 0 } = a.move;
  if (a.t < delay) return { name: "startup", k: delay > 0 ? a.t / delay : 1 };
  if (a.t < delay + dur) return { name: "active", k: dur > 0 ? (a.t - delay) / dur : 1 };
  const k = recover > 0 ? (a.t - delay - dur) / recover : 1;
  return { name: "recover", k: clamp(k, 0, 1) };
}

// Which animation states fighterTransform below actually turns or deforms.
//
// Not every pose moves. The function is a chain of branches on SIMULATION state
// — hitstun, action kind, timers, animKey — and a few states match no branch at
// all: `specialNeutral`, `specialSide`, `specialDown` and `ult` run on action
// kinds ("special", "ult") that nothing here tests, and `win` is a grounded
// idle-that-is-not-idle. Those are drawn square, so the centre of mass they
// would pivot about has nothing to do, and the workbench hides the anchor for
// frames only they draw (see comPivots there).
//
// "Only they draw" is the whole caveat. A special thrown in mid-air still picks
// up the airborne lean, and any pose can be launched — though a launched
// fighter switches to `hurt`, so it is their hurt frame that tumbles, not this
// one. The workbench states it that way and lets the anchor be shown anyway.
//
// Listed rather than derived because the branches test simulation state that
// does not exist outside a match. Keep it in step with fighterTransform: a new
// branch that reads `f.animKey` or a new action kind belongs here too.
export const PIVOTED_STATES = new Set([
  "idle", "crouch",              // breathing sway
  "run",                         // stride sway and bob
  "dash",                        // lean into the sprint
  "jump", "fall",                // air lean, and the stretch into a fast fall
  "land",                        // landing squash
  "hurt", "dizzy",               // flinch, tumble, wobble
  "shield",                      // shake as the shield is spent
  "ledge",                       // hanging lean
  "dodge", "dodge_roll", "dodge_air",   // the roll actually rolls
  "charge",                      // charge shake
  // every `kind: "attack"` move — swingRotation carries all of them
  "light", "airLight", "sideHeavy", "upHeavy", "downHeavy", "crouchAttack",
]);

/** A swing arc for attacks that are one held pose: wind back through startup,
 *  whip through the active window, settle over recovery. */
function swingRotation(f) {
  const p = actionPhase(f);
  if (!p) return 0;
  if (p.name === "startup") return -A.swingBack * p.k;
  if (p.name === "active") return -A.swingBack + (A.swingBack + A.swingThrough) * p.k;
  return A.swingThrough * (1 - p.k) * (1 - p.k);
}

/**
 * The visual transform for a fighter this frame.
 * Returns { rotation, scaleX, scaleY, offsetX, offsetY } for drawCharFrame.
 */
export function fighterTransform(f) {
  let rot = 0;
  let sx = 1;
  let sy = 1;
  let dx = 0;
  let dy = 0;
  const t = state.matchTime;
  const airSpeed = f.char.stats.airSpeed || 1;

  // ---- tumble. The dominant read on any real launch, and the reason a
  // one-frame `hurt` pose is enough: a body spinning through the air sells the
  // hit far better than the same body sliding through it.
  rot += f.spinAngle;

  // Simulated knockdown: the body rotates about its centre of mass, which for a
  // standing pose sits half a body-height up — so a fighter tipped 90 degrees
  // hovers there. Lower them with the tip so the flat body lies ON the floor,
  // proportional to how far tipped they are, and the same slide carries them
  // back up as the get-up unwinds.
  if (f.prone > 0 && f.hitstun <= 0 && f.grounded) {
    const flatness = Math.min(1, Math.abs(f.spinAngle) / (Math.PI / 2));
    dy += flatness * (headHeightTarget(f.spriteChar || f.charKey) * 0.55 - 26);
  }

  if (f.dizzy > 0) {
    rot += Math.sin(t * 7 + phase(f)) * A.dizzyWobble;
    dy += Math.sin(t * 3.5 + phase(f)) * 1.2;
  } else if (f.ledge) {
    rot += f.facing * A.ledgeLean;
  } else if (f.hitstun > 0) {
    // low-knockback hits don't tumble; they flinch away from the blow
    if (Math.abs(f.spin) < 0.1) rot += clamp(f.vx / 900, -1, 1) * A.hurtLean;
  } else if (f.action?.kind === "dodge") {
    const k = clamp(f.action.t / f.action.dur, 0, 1);
    if (f.grounded) {
      // a roll that actually rolls, out of a single frame
      const dir = f.vx !== 0 ? Math.sign(f.vx) : f.facing;
      rot += dir * TAU * k;
    } else {
      rot += Math.sign(f.vx || f.facing) * A.airDodgeTilt * Math.sin(Math.PI * k);
    }
  } else if (f.action?.kind === "attack") {
    rot += swingRotation(f) * f.facing;
  } else if (f.charging) {
    const grip = clamp(f.charging.t / 0.8, 0, 1);
    rot += Math.sin(t * 44) * A.chargeShake * grip;
    dx += Math.sin(t * 37) * A.chargeShift * grip * f.facing;
  } else if (f.shielding) {
    const spent = 1 - clamp(f.shield / SHIELD_MAX, 0, 1);
    rot += Math.sin(t * 26) * A.shieldShake * spent;
    dx += Math.sin(t * 31) * 1.5 * spent;
  } else if (!f.grounded) {
    // lean into horizontal air movement, and stretch slightly into a fast fall
    rot += clamp(f.vx / airSpeed, -1, 1) * A.airLean;
    const dive = clamp(f.vy / MAX_FALL, 0, 1) * (f.fastFalling ? 1 : 0.6);
    sy += S.fall * dive * SQUASH;
    sx -= S.fall * 0.5 * dive * SQUASH;
  } else if (f.dashT > 0) {
    rot += f.dashDir * A.dashLean;
  } else if (f.turnLock > 0) {
    // caught mid-pivot: lean against the direction being abandoned
    rot += -f.facing * A.turnLean * clamp(f.turnLock / 0.08, 0, 1);
  } else if (f.animKey === "run") {
    // Sway once per stride cycle, bob once per footfall — twice per cycle —
    // measured against however many frames the run resolved to, so the timing
    // holds for both the four-frame cycle and the two-frame fallback. The
    // cycle art draws its own rise and fall (reach low, pass high), so the
    // procedural bob backs off to half on it rather than doubling the bounce.
    const { phase: c, frames } = cyclePhase(f.charKey, f.animKey, f.animTime);
    rot += Math.sin(c * TAU) * A.runSway * f.facing;
    dy -= Math.abs(Math.sin(c * TAU)) * A.runBob * (frames > 2 ? 0.5 : 1);
  } else if (f.animKey === "idle" || f.animKey === "crouch") {
    const b = t * A.breathRate + phase(f);
    rot += Math.sin(b) * A.idleSway * f.facing;
    dy -= (Math.sin(b) * 0.5 + 0.5) * A.idleBob;
  }

  // ---- squash & stretch, layered on top of whatever the pose is doing
  if (SQUASH > 0) {
    if (f.landT > 0) {
      const k = clamp(f.landT / LAND_SQUASH_TIME, 0, 1);
      sy -= S.land * k * SQUASH;
      sx += S.land * 0.8 * k * SQUASH;
    }
    if (f.takeoffT > 0) {
      const k = clamp(f.takeoffT / TAKEOFF_STRETCH_TIME, 0, 1);
      sy += S.takeoff * k * SQUASH;
      sx -= S.takeoff * 0.55 * k * SQUASH;
    }
    // the hitlag freeze is a total stop; deforming through it reads far
    // punchier than holding a still pose for the same duration
    if (f.shakeMag > 0) {
      const k = clamp(f.shakeMag / 9, 0, 1);
      sy -= S.hit * k * SQUASH;
      sx += S.hit * k * SQUASH;
    }
  }

  return { rotation: rot, scaleX: sx, scaleY: sy, offsetX: dx, offsetY: dy };
}

/** Whether a fighter is moving fast enough, in the right state, to earn
 *  afterimages. Trails are the cheapest possible "this is fast" signal. */
export function trailStrength(f) {
  if (f.respawnTimer > 0 || f.dead) return 0;
  if (Math.abs(f.spin) > 1) return TRAIL_STRENGTH.tumble;
  if (f.action?.kind === "dodge") return TRAIL_STRENGTH.dodge;
  if (f.dashT > 0) return TRAIL_STRENGTH.dash;
  // dashStrike specials boost the trail for their lunge (fx.js sets the timer)
  if (f.fxTrailT > 0) return DASH_FX.trailStrength;
  return 0;
}
