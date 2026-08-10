// CPU opponent. Produces the same input snapshot shape as a human player.
// Three difficulty levels tune reaction speed, aggression, and defense.

import { state } from "./state.js";
import { foesOf } from "./teams.js";
import { blankInput } from "./input.js";
import { chance, clamp, sign } from "./utils.js";
import { mainPlatform } from "./stages.js";
import { METER_MAX } from "./constants.js";
import { heavyMove } from "./moves.js";
import { bodyMetrics } from "./silhouette.js";

const LEVELS = [
  { name: "Easy", planMin: 0.5, planMax: 0.9, attack: 0.3, special: 0.18, defend: 0.1, ult: 0.4, dmgMul: 0.62 },
  { name: "Normal", planMin: 0.32, planMax: 0.6, attack: 0.48, special: 0.3, defend: 0.28, ult: 0.8, dmgMul: 0.82 },
  { name: "Hard", planMin: 0.18, planMax: 0.4, attack: 0.66, special: 0.42, defend: 0.5, ult: 1, dmgMul: 1.0 },
];

export function cpuLevelName(level) {
  return LEVELS[level].name;
}

export function cpuDamageMul(level) {
  return LEVELS[level].dmgMul;
}

export function makeAiState() {
  return { planT: 0, plan: blankInput(), presses: [] };
}

export function aiInput(f) {
  const ai = f.aiState;
  const lvl = LEVELS[state.cpuLevel];
  const opponents = foesOf(f);
  const opp = opponents.reduce((best, o) =>
    !best || Math.abs(o.x - f.x) < Math.abs(best.x - f.x) ? o : best
  , null);
  const input = blankInput();
  if (!opp) return input;

  const dt = 1 / 60;
  ai.planT -= dt;

  const plat = mainPlatform(state.platforms);
  const stageL = plat.x;
  const stageR = plat.x + plat.w;
  const offstage = f.x < stageL - 10 || f.x > stageR + 10 || f.y > plat.y + 60;

  // --- recovery has absolute priority
  if (offstage) {
    const targetX = clamp(f.x, stageL + 120, stageR - 120);
    input.left = f.x > targetX;
    input.right = f.x < targetX;
    if (f.vy > 40 && f.y > plat.y - 140) {
      input.jumpP = true;
      input.jumpHeld = true;
    }
    // Momo's broom charge doubles as recovery
    if (f.charKey === "momo" && f.y > plat.y && chance(0.05)) input.specialP = true;
    return finishPlan(f, input, opp);
  }

  if (ai.planT <= 0) {
    ai.planT = lvl.planMin + Math.random() * (lvl.planMax - lvl.planMin);
    ai.plan = makePlan(f, opp, lvl);
  }

  // one-shot presses fire once per plan
  const plan = ai.plan;
  const out = { ...plan };
  plan.lightP = false;
  plan.heavyP = false;
  plan.specialP = false;
  plan.ultP = false;
  plan.jumpP = false;

  return finishPlan(f, out, opp);
}

/**
 * How far apart these two can stand and still be reached by a side heavy,
 * centre to centre.
 *
 * Derived rather than authored, because melee reach is now a property of the
 * attacker's artwork (src/silhouette.js) and their opponent's body is a
 * property of theirs. The hand-tuned `profile.range` numbers were quietly
 * calibrated against the old fixed hitboxes, so a CPU that kept using them for
 * melee would stand exactly out of its own range and swing at nothing.
 *
 * `profile.range` is still what a zoner wants — that is about projectiles and
 * is a real authored decision. This is only the melee half.
 */
function meleeRange(f, opp) {
  const m = heavyMove(f.char, "side");
  return m.ox + m.w + bodyMetrics(opp.spriteChar || opp.charKey).width * 0.5;
}

function makePlan(f, opp, lvl) {
  const input = blankInput();
  const profile = f.char.ai;
  const dx = opp.x - f.x;
  const adx = Math.abs(dx);
  const range = profile.range;
  const melee = meleeRange(f, opp);

  // spacing
  if (adx > range + 60) {
    input.left = dx < 0;
    input.right = dx > 0;
  } else if (adx < range - 90 && profile.style === "zoner") {
    input.left = dx > 0;
    input.right = dx < 0;
  } else if (adx > melee * 0.85) {
    if (chance(0.7)) {
      input.left = dx < 0;
      input.right = dx > 0;
    }
  }

  // don't walk off the stage while spacing backwards
  const plat = mainPlatform(state.platforms);
  if (input.left && f.x < plat.x + 90) { input.left = false; input.right = chance(0.5); }
  if (input.right && f.x > plat.x + plat.w - 90) { input.right = false; input.left = chance(0.5); }

  // chase to platforms above
  if (opp.y < f.y - 60 && f.grounded && chance(0.4)) {
    input.jumpP = true;
    input.jumpHeld = true;
  }

  // ultimate
  if (f.meter >= METER_MAX && chance(lvl.ult)) {
    const t = f.char.ultimate.type;
    const wantsClose = ["flurry", "domain", "shout", "concert", "skyInvert", "supernova"].includes(t);
    if (!wantsClose || adx < 420) input.ultP = true;
  }

  // offense
  const close = adx < melee * 1.05;
  const mid = adx >= melee * 0.8 && adx < 460;
  if (close && chance(lvl.attack)) {
    if (chance(0.3)) {
      input.heavyP = true;
      input.heavyHeld = true; // held for the plan's lifetime -> real charge
    } else {
      input.lightP = true;
    }
    if (opp.y < f.y - 50) input.up = true;
  } else if (chance(lvl.special)) {
    if (profile.style === "zoner" && mid) {
      input.specialP = true; // neutral projectile
    } else if (profile.style === "rush" && mid) {
      input.specialP = true;
      if (dx > 0) input.right = true; else input.left = true; // side special approach
    } else if (close && chance(0.5)) {
      input.specialP = true;
      if (chance(0.4)) input.down = true;
    } else if (mid) {
      input.specialP = true;
    }
  }

  // defense reaction
  const danger = opp.action?.kind === "attack" || opp.charging || opp.action?.kind === "special";
  if (danger && adx < 240 && chance(lvl.defend)) {
    input.shieldHeld = true;
    // holding shield with a direction rolls, so clear movement for a plain
    // block, and never roll toward a stage edge
    input.left = false;
    input.right = false;
    input.down = false;
    if (!chance(0.55)) {
      if (chance(0.5)) {
        input.down = true; // spot dodge
      } else {
        const awayDir = dx > 0 ? -1 : 1;
        const destX = f.x + awayDir * 220;
        if (destX > plat.x + 80 && destX < plat.x + plat.w - 80) {
          if (awayDir < 0) input.left = true; else input.right = true; // roll away
        } else {
          input.down = true; // too close to the edge: spot dodge instead
        }
      }
    }
    input.lightP = false;
    input.heavyP = false;
    input.heavyHeld = false;
    input.specialP = false;
  }

  // duck under projectiles occasionally
  const incoming = state.projectiles.some((p) => p.owner !== f && sign(f.x - p.x) === sign(p.vx) && Math.abs(p.x - f.x) < 320);
  if (incoming && chance(lvl.defend * 0.9)) {
    if (chance(0.5)) input.down = true;
    else { input.jumpP = true; input.jumpHeld = true; }
  }

  // step out of telegraphed stage hazards (Active Boards). Overrides the
  // plan's movement: a free 5% from standing in the warning glow looks worse
  // than any spacing the plan was going for.
  const now = state.matchTime;
  const hz = (state.hazardZones || []).find((z) =>
    now < z.until && f.x > z.x - 20 && f.x < z.x + z.w + 20 &&
    (z.yMin === undefined || f.y >= z.yMin) && (z.yMax === undefined || f.y <= z.yMax));
  if (hz) {
    const exitLeft = f.x - hz.x < hz.x + hz.w - f.x;
    // a zone spanning the whole floor has no walkable exit — jump it instead
    if (hz.w > 500) {
      input.jumpP = true;
      input.jumpHeld = true;
    } else {
      input.left = exitLeft;
      input.right = !exitLeft;
      if (chance(0.4)) { input.jumpP = true; input.jumpHeld = true; }
    }
  }

  return input;
}

function finishPlan(f, input, opp) {
  input.dirX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  return input;
}
