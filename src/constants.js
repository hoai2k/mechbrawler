export const WORLD = { w: 1280, h: 720 };

export const FIXED_DT = 1 / 60;
export const MAX_FIXED_STEPS = 5;

export const GRAVITY = 2350;
export const MAX_FALL = 1340;
export const FASTFALL_MULT = 1.62;

export const BLAST = { left: -300, right: 1580, top: -420, bottom: 1000 };

// jumping
export const JUMP_BUFFER = 0.15;
// Attack/heavy/special presses are held this long when the fighter can't act
// yet, then fire the moment control returns (see fighter.js).
export const ACTION_BUFFER = 0.12;
export const COYOTE_TIME = 0.1;
export const SHORT_HOP_WINDOW = 0.09;
export const SHORT_HOP_CUT = 0.52;
export const AIR_JUMP_MULT = 0.92;

// dashing
//
// A burst, not a commitment: the dash should be over before anything can react
// to it and leave the fighter available again, rather than being a button you
// press and then wait to arrive somewhere.
//
// DASH_TIME is how long, DASH_MULT is how fast. `startDash` (fighter.js) also
// snaps the velocity to the cap, the intent being that the two dials stay
// independent — but the movement block computes its speed cap BEFORE the dash
// triggers run and clamps the snap straight back off, so in practice a dash
// from standing still ACCELERATES toward DASH_MULT rather than starting there.
// Measured: sweeping DASH_MULT 1.55 -> 1.20 moves the distance a dash covers by
// 6%, while DASH_TIME moves it by 34%. Worth fixing on its own terms one day;
// deliberately not fixed while tuning the dash SHORTER, because restoring the
// snap lengthens the slide a released dash leaves behind (55px -> 74px), which
// is the opposite of what this pass is for.
//
// Measured on Gojo (468 speed), distance covered while the dash is live, with
// the direction held (tools/debug/measure_dash.mjs):
//
//     0.22 / 1.45   87px    the original, before the dash was made a burst
//     0.10 / 1.55   71px    too far: a dash across a platform ran off the end
//     0.07 / 1.20   45px    63% of that, and nothing else got longer
//
// Nothing else got longer is the part that matters. The dash's contribution
// over a third of a second drops 49px -> 38px, and the slide a RELEASED dash
// leaves is untouched at 55px — the ledge brake (fighter.js brakeAtLedge) is
// what stops that one, and it still does.
export const DASH_TAP_WINDOW = 0.24;
export const DASH_TIME = 0.07;
export const DASH_MULT = 1.20;

// ------------------------------------------------------------------ walking
//
// Smash's ground movement is analog: a partial tilt walks, and how far you tilt
// picks how fast, while a full or flicked stick runs (ssbwiki.com/Walk). This
// game had only the run — `dirX` is ±1 past a deadzone, so every input
// accelerated to the same top speed and there was no way to approach anything
// slowly. That is the missing half of the ledge problem: without a walk there
// is no such thing as arriving at an edge uncommitted, and so nothing for a
// teeter to protect.
//
// `RUN_TILT` is where the stick stops asking to walk and starts asking to run.
// Below it the top speed scales across the walk band; at or above it the
// fighter runs as they always did. Keyboards have no analog axis and report a
// full deflection, so they run — the same way a Smash player on a d-pad does.
export const RUN_TILT = 0.72;
/** The walk band, as fractions of the character's own run speed. Smash's walks
 *  sit around half of a run; these are the slowest and fastest ends of it. */
export const WALK_MIN = 0.34;
export const WALK_MAX = 0.62;
/** Below this the stick is at rest — the same deadzone input.js reads. */
export const MOVE_DEADZONE = 0.28;

// How hard a dashStrike special's lunge bleeds off, as a rate against the
// character's own friction (the locked-action rate is 40, ordinary ground
// friction 60). It used to be ZERO — `keepMomentum` meant no drag at all — so
// Hakari's Restless Rush travelled 302 px at a flat 520 px/s with movement
// locked and stopped dead still doing 426. That is 40% of the main platform,
// chosen by the move rather than the player, and it was the commonest way
// anyone left a stage by accident once the ledge brake had stopped everything
// else. At 4 the same lunge covers ~235 px and arrives at ~300 px/s: still the
// longest travelling move in the game, now visibly running out.
export const LUNGE_DRAG = 4;

// shield
export const SHIELD_MAX = 100;
export const SHIELD_DRAIN = 22;
export const SHIELD_REGEN = 14;
export const SHIELD_DAMAGE_MULT = 1.5;
export const SHIELD_BREAK_STUN = 2.2;
export const PARRY_WINDOW = 0.12;

// aerial landing lag: landing mid-aerial costs a fraction of that move's
// recovery, so aerials are commitments rather than free pokes
export const AERIAL_LAND_LAG_MULT = 0.6;
export const AERIAL_LAND_LAG_MIN = 0.08;

// dodges
export const ROLL_TIME = 0.42;
export const ROLL_DIST = 210;
export const SPOT_DODGE_TIME = 0.45;
export const AIR_DODGE_TIME = 0.34;
export const DODGE_STALE_WINDOW = 1.4;

// ledges
//
// The snap box, sized for Smash-style magnet hands rather than precision
// landings. Horizontal: air speeds run 300-380 px/s, so 72 px is about a fifth
// of a second of drift — catchable on reaction. Below: 150 px is a generous
// body height (fighters stand 125-170 px), matching the proportions of Smash's
// grab boxes; at 60 px the window lasted ~3 frames of ordinary falling and
// recovering from below meant threading it.
export const LEDGE_GRAB_X = 72;
export const LEDGE_GRAB_Y_ABOVE = 112;
export const LEDGE_GRAB_Y_BELOW = 150;
export const LEDGE_HANG_X = 28;
export const LEDGE_HANG_Y = 58;

// GETTING ON AND OFF ONE IS A MOVE, NOT A TELEPORT.
//
// Every one of these used to be a single-frame jump of 40-110 px: the catch,
// the climb, the roll, the ledge attack. Smoothing the DRAWING over it stopped
// it reading as a flicker, but a slid drawing over an instant simulation is
// still a fighter arriving before their body does — and it could not put a
// pose on the trip, because as far as the simulation was concerned there was
// no trip. These are the real thing: the fighter TRAVELS, on the clock, with a
// pose per phase, and the hurtbox travels with them.
//
// HOW LONG IS SET BY A MEASUREMENT, not by taste: no frame of a transition may
// move the body further than a full-speed RUN does, which is 7.8 px at Gojo's
// 468 px/s. Below that nothing in the trip is travelling faster than a
// character can travel on their own feet, so nothing in it can read as a jump.
// The durations fall out of the distance each one covers — the climb crosses
// 84 px across and 58 up, the roll 138 and 58 — and a smoothstep's fastest
// moment is 1.5x its average, which is what the arithmetic has to clear.
//
// The first pass at this rushed them (0.13/0.20/0.26/0.14) and peaked at
// 15-18 px per frame — better than the 98 px teleport by a mile, still twice a
// run. Smash is the sanity check on the other side: its getups are
// percent-independent and take roughly half a second (Melee's, the numbers
// actually published, are 34 frames of invincibility on the getup and ~48 for
// the roll), so these are not slow by the genre's standards. They are normal.
//
// Measured worst frame, tools/debug/measure_ledge_pop.mjs, against the 7.8 px
// a run covers:
//
//     climb   24 frames   7.9 px    3 hanging, 14 rising, 8 landing
//     roll    38 frames   8.2 px    4 hanging, 24 rolling, 10 landing
//     attack  23 frames   8.0 px    then the swing
export const LEDGE_CLIMB_TIME = 0.40;   // hang -> standing, the inward input
export const LEDGE_ROLL_TIME = 0.64;    // further, and it rolls
export const LEDGE_ATTACK_TIME = 0.38;  // the climb; the swing follows it

// The catch is the exception, and it is timed by SPEED rather than by a fixed
// duration: it starts wherever the fighter was when the ledge caught them,
// which is anywhere in a 100x210 px reach, so one duration would make a short
// catch crawl and a long one snap. Constant speed keeps the per-frame step the
// same wherever it starts. Quicker than the climbs on purpose — this is the
// hands closing on the ledge, and Smash's own catch animation is about seven
// frames; a slow one feels like the recovery failing rather than working.
//
// The MAX matters more than it looks. Once it binds, speed stops being
// constant and the step grows with distance again, so it is set where the
// longest possible reach still moves no faster than a FAST FALL (15 px/frame)
// — which is what the fighter was already doing when the ledge caught them, so
// it cannot read as a jump. Typical catches are 60-110 px and take 0.13-0.24 s.
export const LEDGE_CATCH_SPEED = 450;   // px/s
export const LEDGE_CATCH_MIN = 0.09;    // s, for a catch from right beside it
export const LEDGE_CATCH_MAX = 0.40;    // s, for the far corner of the reach

// LEDGE INTANGIBILITY, on Smash's terms. Two rules, both about the same thing:
// a ledge is a place you recover THROUGH, not a place you live.
//
// 1. IT ENDS BEFORE THE GETUP DOES. Each option is covered for the first
//    three-quarters of its trip and nothing after, so the last frames of a
//    climb and the whole of the arrival are punishable. That is what makes
//    ledge play a read rather than a free re-entry: the option is a
//    commitment, and getting up in front of somebody who guessed right costs.
//    (Ultimate's neutral getup is intangible for about 20 of its 26 frames.
//    That figure is widely quoted rather than published, so the fraction is
//    chosen to match its SHAPE — covered while travelling, exposed on arrival
//    — rather than copied from a number I could source.)
//
// 2. IT DECAYS WITH REGRABS, AND ONLY THE GROUND RESETS IT. Ultimate: "The
//    intangibility granted by all ledge getup options (standard, jump, attack
//    and roll) is reduced for each ledge regrab, applying a multiplier of 0.8x
//    after the first regrab, 0.5x after the second, and being disabled
//    entirely from the third regrab onwards... This penalty resets when the
//    character becomes grounded again." (ssbwiki.com/Edge.) That one is exact
//    rather than adapted, and it is the anti-camping mechanic proper.
//
//    The loop it kills is grab -> drop -> regrab, which never touches the
//    stage; climbing up resets it, because climbing up is what a ledge is for.
//    At the far end a fighter on their fourth consecutive grab is hittable
//    through the reach itself, unable to act — severe, and meant to be. It is
//    the fourth time in a row they chose the ledge over the stage.
export const LEDGE_INVULN_TRAVEL = 0.75;
export const LEDGE_REGRAB_SCALE = [1, 0.8, 0.5, 0];
/** The hang, once a catch has landed on it. */
export const LEDGE_HANG_INVULN = 0.28;
/** The ledge jump, which has no travel of its own to be covered for. */
export const LEDGE_JUMP_INVULN = 0.32;

export const TEETER_EDGE = 16;          // px from the lip
export const TEETER_DELAY = 0.08;       // s standing there before it shows

// ------------------------------------------------------------------ bodies
//
// A hurtbox as a proportion of the fighter it belongs to. src/silhouette.js
// supplies the height and width from the character's own art; these say what
// fraction of that is hittable in each state.
//
// `standH` is 0.86 rather than 1.0 because the top of an anime silhouette is
// hair, and hair is not a target. Everything else is measured off the poses:
// a crouch is a little over half height and noticeably wider, a fighter lying
// flat is long and low, and a ledge hang is a body dangling from one hand.
export const HURTBOX = {
  standH: 0.86,
  // Fallback only: how low a crouch is assumed to get when the character has
  // no crouch art to measure. The live value comes from the pose itself
  // (`crouch` in src/silhouette.js), so a fighter drawn ducking ducks and one
  // drawn standing does not — most of the roster is currently the latter, and
  // round 14C is the art that fixes it.
  crouchH: 0.62,
  // Guards on the measured value. The ceiling is under 1.0 deliberately: even
  // a crouch pose that barely bends should be a slightly smaller target, or the
  // input does nothing at all.
  crouchMin: 0.50,
  crouchMax: 0.92,
  crouchW: 1.12,
  proneH: 0.25,
  proneW: 0.62,     // of HEIGHT, not width — a body on its side is body-length
  // Airborne: jump/fall poses tuck, so the box is shorter than standing. The
  // live value is measured from the character's own air art (`air` in
  // src/silhouette.js), like crouch; this is the fallback and its guards.
  airH: 0.78,
  airMin: 0.55,
  airMax: 0.92,
  ledgeH: 0.78,
  ledgeW: 0.94,
  ledgeTop: 0.76,
  // A fighter doubled over by a hit is lower and wider than one standing.
  hurtH: 0.80,
  hurtW: 1.10,
};

// ------------------------------------------------------------------ launch
//
// Upward launch speed a hit has to produce before the victim leaves the floor.
// Below it they stay grounded and slide.
//
// There used to be a flat `-120` added to every launch instead, which meant no
// attack in the game could send anyone along the ground: a down tilt authored
// at 8 degrees actually launched at 29, and `grounded` was cleared on every
// hit. That erased the whole grounded layer — jab locks, tech chases, low
// percent strings — and made the per-move `angle` the least effective dial in
// the game. See docs/hitbox-audit.md 3.3.
export const GROUND_RELEASE = 140;
// What a grounded hit's horizontal speed is multiplied by instead of lifting
// them. The energy has to go somewhere, and along the floor is where.
export const GROUND_SLIDE_BOOST = 1.15;
// A meteor that connects with someone already standing on the floor bounces
// them off it rather than driving them through it.
export const GROUND_SPIKE_BOUNCE = 0.45;

// The Sakurai angle. Smash's angle 361: nearly horizontal on a grounded
// target at low knockback, ~44 degrees once the hit is strong enough to lift
// them, and always 44 in the air. It is what lets one jab combo at low percent
// and push out at high percent without being two different moves.
//
// Used as a sentinel `angle` value, so it has to be something no real angle
// could be.
export const SAKURAI = -99;
export const SAKURAI_AIR = 0.77;      // ~44 degrees
export const SAKURAI_LOW = 0.04;      // grounded and weak: along the floor
export const SAKURAI_POP = 0.44;      // grounded and strong: off their feet
export const SAKURAI_KB = 620;        // where one becomes the other

// How far the right stick can angle a charged side smash, in radians, and how
// much of that carries into the launch angle. Smash's angled forward smash:
// three attacks out of one, and the main vertical mixup in the grounded game.
export const SMASH_TILT = 0.42;
export const SMASH_TILT_ANGLE = 0.6;

// ------------------------------------------------------------------- grabs
//
// Smash-style grabbing and throwing (src/flags.js, src/grab.js). On by
// default since the flag graduated; `?throw=false` plays without it.
//
// The triangle it exists to complete: attacks lose to shield, shield loses to
// grab, grab loses to attacks — a whiffed grab is the most punishable thing a
// fighter can do, which is why `whiffRecover` is longer than any jab's endlag.
export const GRAB = {
  startup: 0.07,        // hand closes this long after the press
  active: 0.11,         // window in which it can connect
  whiffRecover: 0.34,   // arms out, hit me: the price of guessing wrong
  grace: 26,            // px past the measured art reach a closing hand gets

  // How long a hold lasts before the victim slips free on their own. Scales
  // with their damage — Smash's rule, and what makes a late-game grab a real
  // threat while an opening grab is only ever a throw's worth of trouble.
  holdBase: 1.15, holdPerDmg: 0.006, holdMax: 2.4,
  // Every fresh press or stick flick the VICTIM makes shaves this much off the
  // hold. Mashing out of an early grab is genuinely possible; at high damage
  // the arithmetic stops working, which is the point.
  mashReduce: 0.09,

  releaseImmune: 0.7,   // no-regrab window after ANY release: no chain grabs
  escapeLag: 0.34,      // grabber's stumble when mashed out of — their punish window
  breakoutPush: 300,    // the hop a victim breaks away with (px/s, plus a small rise)

  pummelDmg: 2.2,       // per hit; deliberately worse than throwing immediately
  pummelRate: 0.34,     // minimum gap between pummels
  pummelFirst: 0.22,    // the hold has to settle before the first one

  throwDur: 0.3,        // the grabber's own throw animation / commitment
};

// The four throws. Fixed data rather than per-character kit numbers, exactly
// like Smash's early games: a throw is positional currency, not a damage race.
// Every one of these is routed through applyHit, so DI, staling, tallies and
// KO credit all apply.
//
// The three POSITIONAL throws send about a quarter further than they used to.
// `baseKb` is the knob rather than `growth`, deliberately: launch speed is
// `(baseKb + damage * growth) / weight`, so raising the base moves every throw
// the same distance further at every damage, while raising the growth would
// have rewritten the KO percentages instead of the throw.
//
// Balance intent, measured against a side smash (`430 * (1 + 0.25 * charge)`,
// growth 8.4 — moves.js), because that is the move a throw is competing with:
//
//   vs a FULLY charged smash (537): forward is passed almost at once, back at
//   ~35% damage, and up never leads it at all. So at the percentages that
//   actually kill, a smash still KOs earliest — back throw at the ledge being
//   the classic exception, and the reason to take somebody's back.
//
//   vs an UNCHARGED one (430): the throws now send further up to 61% (forward),
//   100% (up) and 115% (back). That is the real cost of this change, and it is
//   the right way round: a grab has to be landed first, and a whiffed one is
//   the most punishable thing in the game. Paying for that risk in distance is
//   the point — throwing should beat swinging a heavy you did not charge.
export const THROWS = {
  fwd:  { dmg: 8,   baseKb: 540, growth: 6.6, angle: 0.55, label: "Throw",       sfx: "punch" },
  back: { dmg: 9.5, baseKb: 580, growth: 7.1, angle: 0.62, label: "Back Throw",  sfx: "punch" },
  up:   { dmg: 7,   baseKb: 500, growth: 7.7, angle: 1.42, label: "Up Throw",    sfx: "whoosh" },
  // Left where it was, and the one throw that should not send further: the down
  // throw is the combo starter. Its whole job is to put them barely above you
  // at low damage so the juggle is on, and it stops being worth taking once
  // they fly too far — which is the tuning, not a shortfall in it.
  down: { dmg: 6,   baseKb: 270, growth: 4.0, angle: 1.12, label: "Down Throw",  sfx: "punch" },
};

// meter / ultimate
export const METER_MAX = 100;
export const METER_PASSIVE = 1.1;
export const METER_ON_DEAL = 0.5;
export const METER_ON_TAKE = 0.85;

// Both supers cost the WHOLE bar. Filling the meter is therefore a single
// decision rather than a schedule: spend it on the ultimate everyone has, or
// bank the same bar for a Domain Expansion if you are one of the seven
// fighters who has one. Charging the ultimate less would make that choice
// free — you would simply fire the ultimate on the way to the domain.
export const ULT_METER_COST = METER_MAX;
export const DOMAIN_METER_COST = METER_MAX;

export const RESPAWN_X = { 1: 250, 2: 500, 3: 780, 4: 1030 };
export const DEFAULT_STOCKS = 3;

// ---------------------------------------------------------------- respawning
//
// Modelled on Smash: a KO'd player is out of the fight for a beat, then comes
// back standing on a revival platform WITH CONTROL ALREADY THEIRS. Nothing
// waits for the platform to expire — the platform is a shield you choose when
// to give up, not a cutscene you sit through. It is what stops respawning from
// feeling like a punishment on top of losing the stock.

// The blackout between the KO and reappearing. Short: this is the only part of
// a respawn the player genuinely cannot act in, so it is long enough to read
// the KO and no longer.
export const RESPAWN_WAIT = 0.65;

// Where the revival platform hangs, and how wide it is.
export const RESPAWN_PLATFORM_Y = 250;
export const RESPAWN_PLATFORM_HALF_W = 62;

// How long you may stand on it before it drops you. Invulnerable the whole
// time — but every frame spent up there is a frame the other players spend
// positioning, which is the cost that keeps it from being a free camp.
export const RESPAWN_PLATFORM_TIME = 3.0;

// Invulnerability that follows you off the platform, however you left it. Long
// enough to not be hit in the act of stepping down, short enough that it is no
// substitute for the platform you just gave up.
export const RESPAWN_GRACE = 0.5;

// ------------------------------------------------------------- match clock
//
// A stock match with no clock cannot be made to end: two players who both
// refuse to approach, or a CPU that has decided to keep its distance, run
// forever. The limit is the backstop for that, not the normal way a match
// finishes — every option here is longer than a fight that is actually being
// fought.
//
// Seconds. 0 is "no limit", and it stays available because a friendly match
// between two people who want to keep going is a real thing.
export const TIME_OPTIONS = [0, 120, 180, 300, 480];
export const DEFAULT_TIME_LIMIT = 300;

// When the clock runs out on a tie, the tied fighters play it off: one stock
// each at this much damage, so the next clean hit ends it.
export const SUDDEN_DEATH_DAMAGE = 150;

// How long after a hit the attacker's combo counter stays open. Measured on
// top of the victim's own hitstun, so a true combo — the next hit landing
// while they still cannot act — always counts, and a re-engagement a moment
// after they recover does not.
export const COMBO_GRACE = 0.35;

export const CELL_W = 313.5;
export const CELL_H = 313.6;

// where the feet sit inside a sprite cell when no body-bottom data applies
export const CELL_FOOT_Y = 0.92;

// Feel dials — motion amplitudes, tumble, trails, DI and move staling — live
// in src/config_tuning.js. This file is physics, geometry and match rules: things
// other code depends on the relationships between.
