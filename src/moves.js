// Derives concrete attack data (timings + hitboxes) from each character's
// light/heavy profiles. Keeps per-character data compact while giving every
// fighter a full Smash-style kit:
//   light:  jab chain (3 steps), side tilt, up tilt, down tilt (crouch), aerials
//   heavy:  side smash (chargeable), up smash, down smash, air heavy
//
// ---------------------------------------------------------------------------
// Where a move's RANGE comes from.
//
// It used to be a hand-typed `reach` per character, pulled toward the sprites
// by a single global `REACH_SCALE = 0.62`. That produced hitboxes reaching
// about 2.1x as far as the art, with the size of the gap varying 1.55x-2.89x
// between fighters — the same 20 px of spacing was a hit on one character and a
// whiff on another, for no reason a player could see. It also made range the
// flattest stat in the game (1.13x across the roster) and left it correlated
// with nothing: longer-reaching moves came out very slightly FASTER.
// docs/hitbox-audit.md has the measurements.
//
// Range is now derived from the art. `artReach` (src/silhouette.js) is how far
// in front of themselves a character's swing is actually painted, measured
// across their whole set of attack poses and banded so the art can be reworked
// without moving a matchup. A move's far edge is that, plus an explicit grace
// margin per move type — so the invisible part of every attack is the same
// small, deliberate amount for everybody instead of an accident of how each
// character happened to be drawn.
//
// The trade Smash prices range against is startup and endlag, and it is priced
// here too: `priceOf` slows a long-armed fighter's attacks and speeds up a
// short-armed one's, against the roster median.
//
// Vertical geometry scales with the character. The literals below are written
// for a fighter of HEIGHT_BASE_PX and multiplied through `g.vy` — otherwise a
// 153 px Momo throws an up smash whose box floats 73 px above her own head.

import { STRIKE_ARC, MELEE_GRACE, REACH_PRICE, SWEETSPOT, HEIGHT_BASE_PX } from "./config_tuning.js";
import { SAKURAI } from "./constants.js";
import { artReach, bodyWidth, bodyMetrics, rosterReach } from "./silhouette.js";
import { clamp } from "./utils.js";

function round1(v) {
  return Math.round(v * 10) / 10;
}

/**
 * How far in front of a fighter their art is painted to reach — the number the
 * strike arc's "art cap" marks and the sprite workbench draws its range targets
 * against. Per character now, because the art is: it spans 60-113 px across the
 * roster, and the single global constant this replaces was right for nobody.
 */
export function visibleArtReach(char) {
  return artReach(keyOf(char));
}

function keyOf(char) {
  return char?.key || "";
}

/**
 * The geometry of one fighter, resolved once per move.
 *
 * `vy` rescales a vertical literal written for a reference-height fighter onto
 * this one, so "up smash reaches above the head" stays true at both ends of the
 * roster.
 */
function geo(char) {
  const m = bodyMetrics(keyOf(char));
  return {
    width: m.width,
    height: m.height,
    reach: m.reach,
    vy: (px) => px * (m.height / HEIGHT_BASE_PX),
  };
}

/** The far edge of a move's hitbox: where the art gets to, plus this move
 *  type's grace margin. `MELEE_GRACE.scale` softens or tightens all of it. */
function tipOf(g, variant) {
  const grace = (MELEE_GRACE[variant] ?? MELEE_GRACE.side) * MELEE_GRACE.scale;
  return g.reach + grace;
}

/**
 * Startup and recovery multiplier for a fighter's reach. Long arms are slow
 * arms; short ones are quick. Clamped so an outlier at either end pays a
 * bounded price rather than becoming unusable.
 */
function priceOf(g) {
  const ref = rosterReach() || g.reach;
  const over = clamp((g.reach - ref) / ref, -REACH_PRICE.clamp, REACH_PRICE.clamp);
  return 1 + over * REACH_PRICE.amount;
}

/** A box in front of the fighter: near edge just clear of the body, far edge
 *  at the move's tip. */
function forward(g, tip, oy, h, nearMul = 1) {
  const ox = g.width * MELEE_GRACE.near * nearMul;
  return { ox, w: Math.max(g.width * 0.45, tip - ox), oy: g.vy(oy), h: g.vy(h) };
}

/** A box centred on the fighter, reaching out `span` in both directions —
 *  rising, falling and quaking attacks. */
function straddle(g, span, oy, h) {
  return { ox: -span / 2, w: span, oy: g.vy(oy), h: g.vy(h) };
}

/**
 * A tip sweetspot for a move that reaches well past the roster.
 *
 * This is Marth's tipper, and it is how range gets paid for a second time: a
 * long disjoint hits hardest only at the very end of its arc and weakly up
 * close, so reach becomes something a player has to space for rather than a
 * stat they were handed. Derived from the tip rather than authored per
 * character, so it follows whatever the art does — a fighter who is redrawn
 * holding something longer earns a tipper without anyone editing a table.
 *
 * `critBand` is matched against the distance between the two fighters' CENTRES
 * (combat.js), while `tip` is measured from the swinging fighter's centre — so
 * the band sits outside the tip by `inset`, which stands in for the half-width
 * of whoever is being hit. A fixed inset rather than the attacker's own width:
 * the body that matters is the target's, it is not known when the move is
 * built, and a band placed off the wrong one drifts out of reach entirely
 * (Maki's sat 15 px past anything she could actually connect with).
 *
 * `ring` is the same band expressed as a distance from the fighter, for the
 * strike arc to draw. Nothing reads it in the simulation.
 */
function tipBand(g, tip) {
  if (g.reach < (rosterReach() || g.reach) * SWEETSPOT.minReachRatio) return null;
  return {
    center: tip + SWEETSPOT.inset,
    tolerance: SWEETSPOT.tolerance,
    ring: tip,
    dmg: SWEETSPOT.dmg, kb: SWEETSPOT.kb, growth: SWEETSPOT.growth,
    sourDmg: SWEETSPOT.sourDmg, sourKb: SWEETSPOT.sourKb,
    label: "TIP!",
  };
}

export function lightMove(char, variant, jabStep = 0) {
  const p = char.light;
  const g = geo(char);
  const s = (p.speed || 1) / priceOf(g);
  const base = {
    effect: p.effect || null,
    sfx: p.sfx || "punch",
    anim: "light",
  };

  switch (variant) {
    case "jab": {
      const finisher = jabStep >= 2;
      const tip = tipOf(g, finisher ? "jab" : "jabEarly");
      return {
        ...base,
        delay: 0.05 / s, dur: 0.09,
        recover: (finisher ? 0.24 : 0.13) * priceOf(g),
        ...forward(g, tip, -92, 98),
        dmg: round1(p.dmg * (finisher ? 0.95 : 0.5)),
        baseKb: finisher ? 330 : 90,
        growth: finisher ? 6.0 : 1.0,
        // The jab chain is exactly what the Sakurai angle exists for: it keeps
        // a weak hit along the floor where it can be followed up, and pops the
        // victim off their feet once it is strong enough to.
        angle: finisher ? p.angle : SAKURAI,
        critBand: finisher ? p.critBand || null : null,
        label: finisher ? p.label : null,
        lungeVx: 40,
      };
    }
    case "side": {
      const tip = tipOf(g, "side");
      return {
        ...base,
        delay: 0.07 / s, dur: 0.12, recover: 0.2 * priceOf(g),
        ...forward(g, tip, -90, 92),
        dmg: round1(p.dmg), baseKb: 310, growth: 5.8, angle: p.angle,
        critBand: p.critBand || tipBand(g, tip),
        label: p.label, lungeVx: 90,
      };
    }
    // The DASH ATTACK — a run's own attack, thrown out of a dash or a sprint.
    //
    // It is the side tilt's opposite trade. A tilt is what you throw because it
    // is safe: short startup, short recovery, back to neutral. This one travels
    // with the run behind it (`lunge`, so the slide carries through the swing
    // instead of dying the moment the action locks), hits harder than anything
    // else off a light press, and then leaves you standing in it — recovery is
    // nearly twice a tilt's, which is what makes running in a decision rather
    // than the default approach.
    //
    // `lunge` and not `keepMomentum`, which is what this used to be and which
    // means no friction AT ALL. The lunge kick is added on top of the run, so
    // the move opened at 902 px/s against a 452 px/s run, held that for the
    // whole 0.6 s and ended still doing 902 — 556 px of swing and 481 px of
    // free coast after it, 1037 px in total across a 784 px platform. One light
    // press crossed the stage. It was also backwards: HOLDING the direction
    // travelled less (670 px), because only the held branch clamps to the run
    // speed. A lunge decays as it goes and plants when the action ends unless
    // the direction is still held (fighter.js), so the numbers now run the way
    // round a player would guess.
    case "dash": {
      const tip = tipOf(g, "side");
      return {
        ...base,
        anim: "dashAttack",
        delay: 0.08 / s, dur: 0.13, recover: 0.34 * priceOf(g),
        ...forward(g, tip, -94, 104),
        dmg: round1(p.dmg * 1.1), baseKb: 330, growth: 6.2, angle: p.angle,
        critBand: p.critBand || tipBand(g, tip),
        label: "Dash " + p.label,
        lungeVx: 88, lunge: true,
      };
    }
    case "up":
      return {
        ...base,
        anim: "upHeavy",
        delay: 0.06 / s, dur: 0.13, recover: 0.2 * priceOf(g),
        ...straddle(g, tipOf(g, "up") * 0.9, -196, 130),
        dmg: round1(p.dmg * 0.9), baseKb: 300, growth: 6.0, angle: 1.15,
        label: "Rising " + p.label,
      };
    case "down":
      return {
        ...base,
        anim: "crouchAttack",
        delay: 0.05 / s, dur: 0.12, recover: 0.18 * priceOf(g),
        ...forward(g, tipOf(g, "down"), -52, 54, 0.8),
        dmg: round1(p.dmg * 0.85), baseKb: 250, growth: 5.0,
        // A low poke that stays low. With the flat launch pop gone (combat.js)
        // this finally sends a grounded opponent sliding rather than popping
        // them up at 29 degrees regardless of what it was authored at.
        angle: SAKURAI,
        label: "Low " + p.label,
      };
    case "air":
      return {
        ...base,
        anim: "airLight",
        delay: 0.05 / s, dur: 0.16, recover: 0.14 * priceOf(g),
        ...forward(g, tipOf(g, "air"), -104, 104, 0.7),
        dmg: round1(p.dmg * 0.95), baseKb: 290, growth: 5.9, angle: 0.5,
        label: "Aerial " + p.label,
      };
    case "upAir":
      return {
        ...base,
        anim: "airLight",
        delay: 0.05 / s, dur: 0.15, recover: 0.14 * priceOf(g),
        ...straddle(g, tipOf(g, "up") * 0.9, -210, 120),
        dmg: round1(p.dmg * 0.9), baseKb: 280, growth: 6.1, angle: 1.3,
        label: "Air Rising " + p.label,
      };
    case "downAir":
      return {
        ...base,
        anim: "airLight",
        delay: 0.07 / s, dur: 0.15, recover: 0.18 * priceOf(g),
        ...straddle(g, tipOf(g, "down") * 0.8, -8, 96),
        dmg: round1(p.dmg * 1.05), baseKb: 240, growth: 6.6, angle: -1.25,
        label: "Meteor " + p.label, spike: true,
      };
    default:
      return lightMove(char, "side");
  }
}

export function heavyMove(char, variant, charge = 0) {
  const p = char.heavy;
  const g = geo(char);
  const price = priceOf(g);
  const s = (p.speed || 1) / price;
  const chargeMul = 1 + 0.55 * charge;
  const base = {
    effect: p.effect || null,
    sfx: p.sfx || "slashHeavy",
    shieldMul: p.shieldMul || 1.6,
    heavy: true,
    charge,
  };

  switch (variant) {
    case "side": {
      const tip = tipOf(g, "sideHeavy");
      return {
        ...base,
        anim: "sideHeavy",
        delay: 0.15 / s, dur: 0.14, recover: 0.3 * price,
        ...forward(g, tip, -96, 108),
        dmg: round1(p.dmg * chargeMul), baseKb: 430 * (1 + 0.25 * charge), growth: 8.4, angle: p.angle,
        // An authored band (Nanami's 7:3) is a character's own decision and
        // wins; otherwise a long enough swing earns a tipper from its reach.
        critBand: p.critBand || tipBand(g, tip),
        label: p.label, lungeVx: 130,
      };
    }
    // The heavy DASH ATTACK: the running shoulder-charge. A smash cannot be
    // charged at a run — a charge is a fighter standing still deciding to — so
    // the heavy button out of a dash commits to one uncharged swing instead of
    // stopping the run dead. It is the hardest hit available without a charge,
    // and it is paid for in the longest recovery on the ground.
    case "dash": {
      const tip = tipOf(g, "sideHeavy");
      return {
        ...base,
        anim: "dashAttackHeavy",
        delay: 0.13 / s, dur: 0.15, recover: 0.42 * price,
        ...forward(g, tip, -96, 112),
        dmg: round1(p.dmg * 0.95), baseKb: 420, growth: 8.0, angle: p.angle,
        critBand: p.critBand || tipBand(g, tip),
        label: "Charging " + p.label,
        lungeVx: 124, lunge: true,
      };
    }
    case "up":
      return {
        ...base,
        anim: "upHeavy",
        delay: 0.14 / s, dur: 0.16, recover: 0.32 * price,
        ...straddle(g, tipOf(g, "upHeavy"), -226, 160),
        dmg: round1(p.dmg * 0.95 * chargeMul), baseKb: 440 * (1 + 0.25 * charge), growth: 8.8, angle: 1.35,
        critBand: p.critBand || null,
        label: "Skyward " + p.label,
      };
    case "down":
      return {
        ...base,
        anim: "downHeavy",
        delay: 0.17 / s, dur: 0.15, recover: 0.34 * price,
        ...straddle(g, tipOf(g, "downHeavy") * 1.9, -64, 78),
        dmg: round1(p.dmg * 0.9 * chargeMul), baseKb: 400 * (1 + 0.25 * charge), growth: 7.8, angle: 0.9,
        critBand: p.critBand || null,
        label: "Quake " + p.label, quake: true,
      };
    case "air":
      return {
        ...base,
        anim: "airLight",
        delay: 0.13 / s, dur: 0.16, recover: 0.2 * price,
        ...forward(g, tipOf(g, "airHeavy"), -104, 110, 0.7),
        dmg: round1(p.dmg * 0.9), baseKb: 380, growth: 7.6, angle: 0.48,
        critBand: p.critBand || null,
        label: "Aerial " + p.label,
      };
    default:
      return heavyMove(char, "side", charge);
  }
}

// ------------------------------------------------------------- strike arcs
//
// Where a swing's crescent of energy is drawn. This is the ONLY place that
// decides it, and it decides it from the hitbox: the arc's radius is the
// distance the box actually reaches, so retuning a move's reach moves the
// visual with it and neither can drift from the other.
//
// The one thing the box does not supply is height. Hitboxes are deliberately
// generous downward — a jab's box runs from chest to floor so it catches a
// crouching opponent — and drawing the arc at the box's centre would put every
// punch at hip level. So the arc is placed off the CHARACTER instead: a
// sideways swing hangs at the level of an outstretched arm, a rising or
// falling one sits directly above or below. Only the reach comes from the box.

/**
 * How far out a swing has got, as a fraction of its full reach, `k` of the way
 * through its active window.
 *
 * A melee box used to exist at full length from its first active frame, which
 * is why it had to be so wide: it had to cover everywhere the arm WOULD be. A
 * swing that extends instead means the tip only threatens once the arm has
 * actually got there, so spacing and timing are the same question — which is
 * what a tip sweetspot needs to be worth anything.
 *
 * Both the hitbox (combat.js) and the crescent drawn around it (render.js) call
 * this, so the picture and the thing it describes cannot come apart.
 */
export function swingExtent(k) {
  const A = STRIKE_ARC;
  return A.reachFrom + (1 - A.reachFrom) * Math.min(1, clamp(k, 0, 1) / A.reachIn);
}

/** Half the angular width of an arc of `radius` covering `half` px of the
 *  hitbox's cross-measure, held inside the readable range. */
function arcSpan(half, radius) {
  const raw = Math.atan2(half * STRIKE_ARC.spanOfBox, radius);
  return clamp(raw, STRIKE_ARC.spanMin, STRIKE_ARC.spanMax);
}

/**
 * The arcs a melee box throws, in fighter-local coordinates with the fighter
 * facing +x and y running downward as canvas does (so the foot line is 0 and
 * the head is negative). The renderer mirrors the whole frame for facing.
 *
 * Each arc is `{ pivotY, radius, aim, span }`: a band of constant `radius`
 * about a centre of curvature `pivotY` above the feet, covering `aim ± span`
 * where 0 points forward, -PI/2 straight up and +PI/2 straight down.
 *
 * Returns 0-2 of them — two for a move that comes out both sides at once, and
 * none for a box too small to be worth drawing around.
 *
 * @param {{ox:number, oy:number, w:number, h:number}} m  the hitbox
 * @param {number} bodyH  the fighter's rendered height, foot line to head
 */
export function strikeArcs(m, bodyH) {
  const x0 = m.ox, x1 = m.ox + m.w;
  const y0 = m.oy, y1 = m.oy + m.h;
  const armY = -STRIKE_ARC.armHeight * bodyH;
  const hipY = -STRIKE_ARC.hipHeight * bodyH;
  const straddles = x0 < 0;

  // Straddling the fighter and taller than it is wide: the reach is upward or
  // downward, not forward. Which one is settled by the side of the feet the
  // box ends on.
  if (straddles && m.h > m.w * 1.2) {
    return y1 <= 0
      ? vertical(armY, armY - y0, -Math.PI / 2, m.w / 2)
      : vertical(hipY, y1 - hipY, Math.PI / 2, m.w / 2);
  }
  // Straddling and hanging at or below the feet: a meteor, wider than it is
  // deep but still aimed straight down.
  if (straddles && y0 > -m.h * 0.3) {
    return vertical(hipY, y1 - hipY, Math.PI / 2, m.w / 2);
  }

  // Sideways. Arm height, unless the box sits low enough that the strike is
  // plainly a low one — a crouch poke, a ground quake — in which case it draws
  // from its own height, because that is where the fighter is swinging.
  const low = y0 > armY + STRIKE_ARC.lowStrike * bodyH;
  const pivotY = low ? (y0 + y1) / 2 : armY;
  const half = m.h / 2;
  const arcs = [];
  if (x1 >= STRIKE_ARC.minRadius) {
    arcs.push({ pivotY, radius: x1, aim: 0, span: arcSpan(half, x1) });
  }
  // Backward too, for the down-smash quakes whose box spans both sides.
  if (-x0 >= STRIKE_ARC.minRadius) {
    arcs.push({ pivotY, radius: -x0, aim: Math.PI, span: arcSpan(half, -x0) });
  }
  return arcs;
}

/** The one-arc list for a straight-up or straight-down strike — empty when the
 *  arc would sit inside the fighter's own art. */
function vertical(pivotY, radius, aim, half) {
  if (radius < STRIKE_ARC.minRadius) return [];
  return [{ pivotY, radius, aim, span: arcSpan(half, radius) }];
}
