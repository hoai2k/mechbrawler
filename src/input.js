// Keyboard + gamepad input, exposed as per-player snapshots with edge detection.
//
// Every binding in here comes from src/config_controls.js — the one file that
// says which key and which pad button does what, and the one the instructions
// are generated from. Nothing in this module hard-codes a button.

import { KEY_BINDS, PAD_BUTTONS, PAD_AXES } from "./config_controls.js";
import { noteGamepadGesture } from "./audio.js";

const held = new Set();
const pressed = new Set();

const P1_KEYS = KEY_BINDS[1];
const P2_KEYS = KEY_BINDS[2];

const GAME_CODES = new Set([...Object.values(P1_KEYS).flat(), ...Object.values(P2_KEYS).flat(), "Space", "Escape", "Backquote"]);

const padPrev = new Map(); // pad index -> button pressed array
const padNow = new Map();
let joinedPlayers = 1;

// Which seat each physical pad drives, assigned the first time we see it and
// never reassigned: pad index -> player id.
//
// This has to be its own record rather than a position in the browser's list,
// because that list is SPARSE and its holes move. A gamepad is invisible to
// the page until it is touched, so two pads plugged in with only the second
// one used report as `[null, pad]` — and compacting that put player 2's pad
// in player 1's seat. Their stick drove player 1's cursor, their own cursor
// never appeared, and the seat only corrected itself once player 1 touched
// their pad and pushed the list back into shape. That is the whole of "the
// second controller does nothing until the first one moves".
const padSeats = new Map();

// Right-stick deadzone. Wider than the movement stick's, because this stick is
// normally at rest: a smash that angles itself off controller drift is worse
// than one that needs a deliberate push. (Steering moved to the d-pad, which is
// digital and needs no deadzone at all.)
export const AIM_DEADZONE = 0.34;

// Fallback for environments that deliver key events without `code`
// (some remote/embedded browsers). Real keyboards always populate `code`.
function codeOf(e) {
  if (e.code) return e.code;
  const k = e.key;
  if (!k) return "";
  if (k.length === 1) {
    if (/[a-z]/i.test(k)) return "Key" + k.toUpperCase();
    if (/[0-9]/.test(k)) return "Digit" + k;
    const punct = { ",": "Comma", ".": "Period", "/": "Slash", "'": "Quote", " ": "Space", "`": "Backquote" };
    if (punct[k]) return punct[k];
  }
  if (k === "Shift") return "ShiftLeft";
  return k; // "ArrowLeft", "Escape", "Enter", ...
}

export function initInput() {
  window.addEventListener("keydown", (e) => {
    const code = codeOf(e);
    if (GAME_CODES.has(code)) e.preventDefault();
    if (!held.has(code)) pressed.add(code);
    held.add(code);
  });
  window.addEventListener("keyup", (e) => held.delete(codeOf(e)));
  window.addEventListener("blur", clearHeldKeys);
}

/** Drop every held key. Called when the window loses focus and when the tab is
 *  hidden, so a fighter does not keep running in a direction the player let go
 *  of in a window that is no longer listening. */
export function clearHeldKeys() {
  held.clear();
}

export function keyPressed(code) {
  return pressed.has(code);
}

export function consumeKey(code) {
  pressed.delete(code);
}

export function keyHeld(code) {
  return held.has(code);
}

/** Seats stop moving once a match owns them (main.js). Away from a fight the
 *  seating is re-derived from whoever is actually plugged in; during one it is
 *  frozen, because a pad that drops out mid-match must keep its fighter rather
 *  than have the seats shuffle up under the remaining players. */
let seatsFrozen = false;

export function freezePadSeats(on) {
  seatsFrozen = on;
}

/** Seat every connected pad, in the order the browser lists them.
 *
 *  Seats used to be handed out on first sight and kept per pad.index for the
 *  session, which quietly broke for the commonest case of all: ONE controller.
 *  A pad that sleeps and wakes, or is unplugged and plugged back in, can come
 *  back under a different index — and the old mapping had no idea it was the
 *  same controller, so it took the "next free" seat 2 while seat 1 stayed held
 *  by an index that no longer exists. The player then drove player 2 with the
 *  only pad in the room. Counting the pads that are actually there cannot get
 *  that wrong. */
function reseatPads(pads) {
  padSeats.clear();
  let seat = 1;
  for (const pad of pads) {
    if (!pad || !pad.connected || seat > 4) continue;
    padSeats.set(pad.index, seat);
    seat += 1;
  }
}

export function readGamepads() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  // Seating on sight — rather than on a deliberate button press — is what lets
  // a second player start browsing the roster the moment they pick their
  // controller up, without player 1 having to touch anything first. The browser
  // only reveals a pad once its owner has touched it, so "detected" already
  // means "somebody is holding this".
  if (!seatsFrozen) reseatPads(pads);
  for (const pad of pads) {
    if (!pad || !pad.connected) continue;
    const prev = padNow.get(pad.index) || [];
    const now = pad.buttons.map((b) => b.pressed);
    padPrev.set(pad.index, prev);
    padNow.set(pad.index, now);
    // A pad button going down is a user gesture, and it is the ONLY one a
    // controller-only player ever makes: the browser fires no pointer or key
    // event for it, so without this the autoplay lock never opens and the whole
    // session is silent. Cheap to test — this only looks until the first press.
    if (now.some((down, i) => down && !prev[i])) noteGamepadGesture();
  }
  // Inside a match the count never falls: a pad that drops out (a flat battery,
  // a kicked cable) must not silently hand its fighter back to a CPU. On the
  // menu it tracks what is plugged in, so unplugging a second pad before the
  // fight starts is allowed to un-join that player.
  const seated = Math.min(4, padSeats.size);
  joinedPlayers = seatsFrozen ? Math.max(joinedPlayers, seated) : Math.max(1, seated);
}

export function joinedPlayerCount() {
  return joinedPlayers;
}

/** Seats that were taken by a pad at some point this session but whose pad is
 *  not answering right now — a flat battery, a kicked cable, a sleeping pad.
 *
 *  Seats are sticky (see readGamepads), so this is the only way to tell the
 *  difference between "player 3 never joined" and "player 3's controller just
 *  died". A match needs that difference: the second case leaves a fighter with
 *  no input source at all, which reads as a frozen dummy standing in the
 *  stage until something kills it. */
export function disconnectedSeats(upToSeat = 4) {
  const out = [];
  for (const seat of padSeats.values()) {
    if (seat <= upToSeat && !padFor(seat)) out.push(seat);
  }
  return out.sort((a, b) => a - b);
}

export function connectedPadCount() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let n = 0;
  for (const pad of pads) if (pad && pad.connected) n += 1;
  return n;
}

/** The physical pad driving a player slot, for rumble (rumble.js). Same
 *  mapping the input snapshots use: the pad seated in that slot. */
export function padForPlayer(playerId) {
  return padFor(playerId);
}

function padFor(playerId) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (pad && pad.connected && padSeats.get(pad.index) === playerId) return pad;
  }
  return null;
}

// A binding in PAD_BUTTONS is an index, a LIST of indices, or an empty list —
// so every read goes through the same widening. Several buttons merge by OR
// (a second jump button is a second way to jump, not a chord), and an empty
// binding is simply never pressed, which is how dash lives on double-tap alone
// without a special case at every call site.
const indices = (spec) => (Array.isArray(spec) ? spec : [spec]);

function padButton(pad, spec) {
  return indices(spec).some((i) => !!pad.buttons[i]?.pressed);
}

function padButtonPressed(pad, spec) {
  const now = padNow.get(pad.index) || [];
  const prev = padPrev.get(pad.index) || [];
  // Per button, so holding A and then tapping RT still reads as a fresh press.
  return indices(spec).some((i) => !!now[i] && !prev[i]);
}

// Buttons and axes come from PAD_BUTTONS / PAD_AXES in config_controls.js.
// The layout they describe, and why:
//
//   A jump · B special · X light · Y heavy · LT shield · RT jump again
//   Dash has no button: double-tap a direction. It briefly had B, which is the
//     button special wants — special is pressed constantly and dash has a
//     motion that has always worked.
//   RT is a SECOND jump rather than a new action. Jump is the one input a
//     player wants while the thumb is already on an attack button. (Behind
//     ?throw=true, RT is grab instead — see src/flags.js and src/grab.js.)
//   LB Domain Expansion · RB ultimate — the two supers, one shoulder each, so
//     neither can be pressed by accident while reaching for the other. Domain
//     used to be the whole d-pad, which was four buttons spent on a move only
//     eight fighters have and nobody has two of.
//   D-pad steers this player's summons and aims their creature shots. It took
//     that job over from the right stick when the right stick became attacks.
//
// The RIGHT STICK is the tilt stick: flick it and the fighter throws the tilt
// in that direction on the spot — the attack a light press only gives you at a
// standstill (side tilt otherwise needs a run-up) and, in the air, the aerial
// for that direction. Held rather than flicked, it still angles a charged side
// smash on release; a charge cannot act, so aiming one never fires a tilt.
const TILT_DEADZONE = 0.62;

// The DASH FLICK, on the left stick — Smash's smash input. Shove the stick from
// near neutral out past `fire` inside `window` seconds and the fighter dashes;
// roll it out there at any gentler pace and they walk. Speed of the input, not
// its distance, is what separates the two, which is why this needs the clock
// and a tap threshold cannot do it.
//
// ANALOG ONLY. A key crosses every threshold in the same frame it is pressed,
// so on a keyboard a shove and a walk are the same event and cannot be told
// apart; keys keep the double tap, which is a timing the player performs rather
// than one the hardware has to report.
//
// `rest` is generous (0.36) because the stick has to be seen returning through
// it: a dash-turn is a player yanking the stick across centre, and if the
// window only counted a true zero the sample between the two extremes would
// often miss it.
const DASH_FLICK = { rest: 0.36, fire: 0.78, window: 0.14 };
const dashFlickState = new Map(); // pad index -> { restAt: seconds, fired: bool }

/** -1, 1 or 0 — the direction of a fresh dash flick, for ONE frame. */
function dashFlick(pad, x) {
  const now = performance.now() / 1000;
  const st = dashFlickState.get(pad.index) || { restAt: now, fired: false };
  const mag = Math.abs(x);
  let dir = 0;
  if (mag < DASH_FLICK.rest) {
    // Home again: the clock for the next flick starts here, and the last one is
    // spent — one dash per shove, however long the stick is then held.
    st.restAt = now;
    st.fired = false;
  } else if (!st.fired && mag >= DASH_FLICK.fire && now - st.restAt <= DASH_FLICK.window) {
    st.fired = true;
    dir = x < 0 ? -1 : 1;
  }
  dashFlickState.set(pad.index, st);
  return dir;
}

function padSnapshot(pad) {
  const axX = Math.abs(pad.axes[PAD_AXES.moveX] || 0) > 0.28 ? pad.axes[PAD_AXES.moveX] : 0;
  const axY = Math.abs(pad.axes[PAD_AXES.moveY] || 0) > 0.42 ? pad.axes[PAD_AXES.moveY] : 0;
  const left = axX < -0.28;
  const right = axX > 0.28;
  const up = axY < -0.5;
  const down = axY > 0.5;
  const tx = pad.axes[PAD_AXES.tiltX] || 0;
  const ty = pad.axes[PAD_AXES.tiltY] || 0;
  const dLeft = padButton(pad, PAD_BUTTONS.dpadLeft);
  const dRight = padButton(pad, PAD_BUTTONS.dpadRight);
  const dUp = padButton(pad, PAD_BUTTONS.dpadUp);
  const dDown = padButton(pad, PAD_BUTTONS.dpadDown);
  return {
    left, right, up, down,
    moveX: axX,
    aimX: (dRight ? 1 : 0) - (dLeft ? 1 : 0),
    aimY: (dDown ? 1 : 0) - (dUp ? 1 : 0),
    tiltX: Math.abs(tx) > AIM_DEADZONE ? tx : 0,
    tiltY: Math.abs(ty) > AIM_DEADZONE ? ty : 0,
    tiltDir: tiltFlick(pad, tx, ty),
    dashFlick: dashFlick(pad, pad.axes[PAD_AXES.moveX] || 0),
    jumpP: padButtonPressed(pad, PAD_BUTTONS.jump),
    jumpHeld: padButton(pad, PAD_BUTTONS.jump),
    lightP: padButtonPressed(pad, PAD_BUTTONS.light),
    heavyP: padButtonPressed(pad, PAD_BUTTONS.heavy),
    heavyHeld: padButton(pad, PAD_BUTTONS.heavy),
    specialP: padButtonPressed(pad, PAD_BUTTONS.special),
    grabP: padButtonPressed(pad, PAD_BUTTONS.grab),
    dashP: padButtonPressed(pad, PAD_BUTTONS.dash),
    domainP: padButtonPressed(pad, PAD_BUTTONS.domain),
    ultP: padButtonPressed(pad, PAD_BUTTONS.ult),
    shieldHeld: padButton(pad, PAD_BUTTONS.shield),
    pauseP: padButtonPressed(pad, PAD_BUTTONS.pause),
  };
}

// A tilt fires on the FLICK, not on the hold: the stick has to return near
// centre before it can throw another. Held past the edge it would otherwise
// machine-gun tilts, and a player angling a smash would be holding an attack.
const tiltRest = new Map(); // pad index -> is the stick outside the deadzone

function tiltFlick(pad, tx, ty) {
  const out = Math.hypot(tx, ty) > TILT_DEADZONE;
  const was = tiltRest.get(pad.index) || false;
  tiltRest.set(pad.index, out);
  if (!out || was) return null;
  return Math.abs(ty) > Math.abs(tx) ? (ty < 0 ? "up" : "down") : (tx < 0 ? "left" : "right");
}

function keysSnapshot(map) {
  const anyHeld = (codes) => codes.some((c) => held.has(c));
  const anyPressed = (codes) => codes.some((c) => pressed.has(c));
  // Keyboard steering is all-or-nothing per direction; the pad's analog
  // magnitude is the richer version of the same axis.
  const axis = (neg, pos) => (anyHeld(pos || []) ? 1 : 0) - (anyHeld(neg || []) ? 1 : 0);
  return {
    left: anyHeld(map.left), right: anyHeld(map.right),
    up: anyHeld(map.up), down: anyHeld(map.down),
    aimX: axis(map.steerLeft, map.steerRight),
    aimY: axis(map.steerUp, map.steerDown),
    jumpP: anyPressed(map.up),
    jumpHeld: anyHeld(map.up),
    lightP: anyPressed(map.light),
    heavyP: anyPressed(map.heavy),
    heavyHeld: anyHeld(map.heavy),
    specialP: anyPressed(map.special),
    ultP: anyPressed(map.ult),
    shieldHeld: anyHeld(map.shield),
    dashP: anyPressed(map.dash || []),
    grabP: anyPressed(map.grab || []),
    domainP: anyPressed(map.domain || []),
    // No keyboard tilt stick: on keys a tilt is what a light press already
    // gives you with a direction held, so there is nothing extra to bind.
    tiltX: 0, tiltY: 0, tiltDir: null,
    // No keyboard dash flick either — see DASH_FLICK above. Keys dash on the
    // double tap and on their own dash key.
    dashFlick: 0,
    pauseP: false,
  };
}

export function blankInput() {
  return {
    left: false, right: false, up: false, down: false,
    jumpP: false, jumpHeld: false, lightP: false,
    heavyP: false, heavyHeld: false, specialP: false, ultP: false,
    shieldHeld: false, pauseP: false, dirX: 0, dashP: false,
    // How far the stick is pushed sideways, -1..1, kept ALONGSIDE `dirX`
    // rather than replacing it: everything that only asks "which way" still
    // reads dirX, while the movement code reads this to tell a walk from a
    // run (constants.js RUN_TILT). A keyboard reports ±1, so it runs.
    moveX: 0,
    // Grab (?throw=true). Bound to nothing when the flag is off, so it simply
    // never reads true there.
    grabP: false,
    // Domain Expansion (LB / U). One button: nobody has two domains, and a
    // fighter who does picks between them with the left stick (domains.js).
    domainP: false,
    // D-pad summon steering / creature aim, -1..1 each.
    aimX: 0, aimY: 0,
    // The right stick. `tiltX/tiltY` is where it is being held, which is what
    // angles a charged smash; `tiltDir` is set for ONE frame on a fresh flick
    // and is what throws a tilt attack.
    tiltX: 0, tiltY: 0, tiltDir: null,
    // The left stick shoved from neutral: -1 or 1 for ONE frame, and what
    // starts a dash on a pad (DASH_FLICK above).
    dashFlick: 0,
  };
}

// Buttons merge by OR; the analog axes merge by whichever source is pushed
// furthest, so a pad and a keyboard on the same player cannot cancel out or
// collapse a stick to a boolean.
const AXIS_KEYS = new Set(["dirX", "moveX", "aimX", "aimY", "tiltX", "tiltY", "dashFlick"]);
// Fields that carry a VALUE rather than a flag. Whichever source has one wins,
// pad first. ORing these would turn "up" into `true`, which reads as a flick in
// no direction at all.
const VALUE_KEYS = new Set(["tiltDir"]);

function mergeInputs(a, b) {
  const out = blankInput();
  for (const key of Object.keys(out)) {
    if (AXIS_KEYS.has(key)) {
      const av = a[key] || 0;
      const bv = b[key] || 0;
      out[key] = Math.abs(av) >= Math.abs(bv) ? av : bv;
    } else if (VALUE_KEYS.has(key)) {
      out[key] = a[key] ?? b[key] ?? null;
    } else {
      out[key] = !!(a[key] || b[key]);
    }
  }
  return out;
}

export function playerInput(playerId) {
  const keys = playerId === 1 ? keysSnapshot(P1_KEYS) :
    playerId === 2 ? keysSnapshot(P2_KEYS) : blankInput();
  const pad = padFor(playerId);
  const merged = pad ? mergeInputs(keys, padSnapshot(pad)) : keys;
  merged.dirX = (merged.right ? 1 : 0) - (merged.left ? 1 : 0);
  // A keyboard has no axis to report, so it stands in at full deflection —
  // otherwise every key press would read as the gentlest possible walk.
  if (!merged.moveX) merged.moveX = merged.dirX;
  return merged;
}

export function anyPadPausePressed() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (pad && pad.connected && padButtonPressed(pad, PAD_BUTTONS.pause)) return true;
  }
  return false;
}

// Menus are driven by ANY connected pad, so a second player can navigate too.
// Directions report as held state (the menu layer handles its own repeat);
// buttons report as edges.
export function padsMenuState() {
  const out = {
    up: false, down: false, left: false, right: false,
    confirmP: false, backP: false, altP: false,
    pagePrevP: false, pageNextP: false,
  };
  for (const state of padsMenuStates()) {
    for (const key of Object.keys(out)) out[key] ||= state[key];
  }
  return out;
}

// The two menu buttons, by index rather than by gameplay action: A and B.
const MENU_CONFIRM = 0;
const MENU_BACK = 1;

const blankMenuState = () => ({
  up: false, down: false, left: false, right: false,
  confirmP: false, backP: false, altP: false,
  pagePrevP: false, pageNextP: false,
});

// One menu snapshot per SEAT: index 0 is player 1's pad, index 1 is player 2's,
// and a seat whose pad is not currently connected reads as a blank snapshot
// rather than shifting everyone behind it up a place. Character select consumes
// these by seat so each player has an independent cursor instead of all pads
// steering one shared DOM focus — which means an index that means something
// other than the seat silently gives one player another's cursor.
export function padsMenuStates() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const out = [];
  for (const pad of pads) {
    if (!pad || !pad.connected) continue;
    const seat = padSeats.get(pad.index);
    if (!seat) continue; // seated on the next readGamepads(); nothing to report yet
    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    while (out.length < seat) out.push(blankMenuState());
    out[seat - 1] = {
      up: ay < -0.5 || padButton(pad, PAD_BUTTONS.dpadUp),
      down: ay > 0.5 || padButton(pad, PAD_BUTTONS.dpadDown),
      left: ax < -0.5 || padButton(pad, PAD_BUTTONS.dpadLeft),
      right: ax > 0.5 || padButton(pad, PAD_BUTTONS.dpadRight),
      // Menus are A confirms / B goes back, which every console player already
      // knows. They are named by BUTTON here rather than borrowed from a
      // gameplay action: back used to read the dash binding because dash was
      // on B, and when dash lost its button the menus would have lost theirs.
      confirmP: padButtonPressed(pad, MENU_CONFIRM),
      backP: padButtonPressed(pad, MENU_BACK),
      altP: padButtonPressed(pad, PAD_BUTTONS.light),
      pagePrevP: padButtonPressed(pad, PAD_BUTTONS.domain),
      pageNextP: padButtonPressed(pad, PAD_BUTTONS.ult),
    };
  }
  return out;
}

export function endInputFrame() {
  pressed.clear();
}
