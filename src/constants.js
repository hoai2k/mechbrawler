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
export const DASH_TAP_WINDOW = 0.24;
export const DASH_TIME = 0.22;
export const DASH_MULT = 1.45;

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
export const LEDGE_GRAB_X = 44;
export const LEDGE_GRAB_Y_ABOVE = 112;
export const LEDGE_GRAB_Y_BELOW = 60;
export const LEDGE_HANG_X = 28;
export const LEDGE_HANG_Y = 58;

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

export const CELL_W = 313.5;
export const CELL_H = 313.6;

// where the feet sit inside a sprite cell when no body-bottom data applies
export const CELL_FOOT_Y = 0.92;

// Feel dials — motion amplitudes, tumble, trails, DI and move staling — live
// in src/config_tuning.js. This file is physics, geometry and match rules: things
// other code depends on the relationships between.
