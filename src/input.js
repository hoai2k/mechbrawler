// Keyboard + gamepad input, exposed as per-player snapshots with edge detection.

const held = new Set();
const pressed = new Set();

const P1_KEYS = {
  left: ["KeyA"], right: ["KeyD"], up: ["KeyW"], down: ["KeyS"],
  light: ["KeyJ"], heavy: ["KeyK"], special: ["KeyL"], ult: ["KeyI"],
  shield: ["ShiftLeft"],
  dash: ["KeyQ"],
  // Domain Expansion. The keyboard's stand-in for the d-pad, so these are
  // DIRECTIONS rather than domain slots — which domain a direction opens
  // depends on how many the fighter has (see domainSlotFor in fighter.js).
  domainUp: ["KeyU"], domainLeft: ["KeyY"], domainRight: ["KeyO"],
  // Summon steering — the keyboard's stand-in for the right stick. A cluster
  // left of the attack keys, so it is reachable without leaving the WASD hand's
  // neighbours; see summons.js for what it drives.
  steerUp: ["KeyT"], steerLeft: ["KeyF"], steerDown: ["KeyG"], steerRight: ["KeyH"],
};

const P2_KEYS = {
  left: ["ArrowLeft"], right: ["ArrowRight"], up: ["ArrowUp"], down: ["ArrowDown"],
  light: ["Comma", "Numpad1"], heavy: ["Period", "Numpad2"], special: ["Slash", "Numpad3"], ult: ["Quote", "Numpad0"],
  shield: ["ShiftRight", "NumpadEnter"],
  dash: ["Backslash"],
  domainUp: ["Semicolon", "Numpad5"], domainLeft: ["BracketLeft", "Numpad4"], domainRight: ["BracketRight", "Numpad6"],
  // The numpad is fully spoken for by P2's buttons, so their steering cluster
  // is the number row in the same 8/4/5/6 shape.
  steerUp: ["Digit8"], steerLeft: ["Digit4"], steerDown: ["Digit5"], steerRight: ["Digit6"],
};

const GAME_CODES = new Set([...Object.values(P1_KEYS).flat(), ...Object.values(P2_KEYS).flat(), "Space", "Escape", "Backquote"]);

const padPrev = new Map(); // pad index -> button pressed array
const padNow = new Map();
const padDeflected = new Map(); // pad index -> was any axis pushed last frame
let joinedPlayers = 1;

// How far a stick must be pushed to read as a deliberate join. Well past the
// movement deadzone, because a controller resting with a drifting stick must
// not walk itself into the match.
const JOIN_AXIS = 0.55;

// Right-stick deadzone for summon steering. Wider than the movement stick's,
// because this stick is normally at rest: a summon that twitches off its hunt
// because of controller drift is worse than one that needs a deliberate push.
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
  window.addEventListener("blur", () => held.clear());
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

export function readGamepads() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const connected = [];
  for (const pad of pads) if (pad && pad.connected) connected.push(pad);
  for (let slot = 0; slot < connected.length; slot++) {
    const pad = connected[slot];
    const prev = padNow.get(pad.index) || [];
    const now = pad.buttons.map((b) => b.pressed);
    padPrev.set(pad.index, prev);
    padNow.set(pad.index, now);
    // Player 1 always owns the first controller. Additional controller slots
    // join only once their player does something deliberate, so a passive USB
    // or Bluetooth connection cannot replace the CPU on its own.
    //
    // Any input counts, not just buttons: picking a pad up and pushing the
    // stick is how people expect to say "I'm in", and a player who did that and
    // saw nothing happen had no way to know a button was the magic word.
    const deflected = pad.axes.some((a) => Math.abs(a) > JOIN_AXIS);
    const wasDeflected = padDeflected.get(pad.index) || false;
    padDeflected.set(pad.index, deflected);
    const acted = now.some((down, i) => down && !prev[i]) || (deflected && !wasDeflected);
    if (slot > 0 && acted) {
      joinedPlayers = Math.max(joinedPlayers, Math.min(4, slot + 1));
    }
  }
}

export function joinedPlayerCount() {
  return joinedPlayers;
}

export function connectedPadCount() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let n = 0;
  for (const pad of pads) if (pad && pad.connected) n += 1;
  return n;
}

/** The physical pad driving a player slot, for rumble (rumble.js). Same
 *  mapping the input snapshots use: Nth connected pad for player N. */
export function padForPlayer(playerId) {
  return padFor(playerId);
}

function padFor(playerId) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const list = [];
  for (const pad of pads) if (pad && pad.connected) list.push(pad);
  return list[playerId - 1] || null;
}

function padButton(pad, i) {
  return !!pad.buttons[i]?.pressed;
}

function padButtonPressed(pad, i) {
  const now = padNow.get(pad.index) || [];
  const prev = padPrev.get(pad.index) || [];
  return !!now[i] && !prev[i];
}

// Standard mapping: 0 A jump, 1 B dash, 2 X light, 3 Y heavy,
// 4 LB ultimate, 5 RB ultimate, 6 LT shield, 7 RT special.
//
// Special sits under the RIGHT TRIGGER and dash under B. Special used to be B
// and RT was a second shield alongside LT, which spent a face button and a
// trigger on two things that never needed both: a trigger is the natural home
// for the move you hold a direction with, and shield only ever needed one.
// Dash was double-tap-only before this and still is as well — the button is a
// second way in, not a replacement, so nothing anybody had learned stopped
// working.
//
// The D-pad (12-15) is the DOMAIN pad, not a second movement stick, and ALL
// FOUR directions open one: a fighter with a single domain opens it from any
// of them, and only a fighter with more than one splits them (see
// domainSlotFor in fighter.js). Movement is the left analog stick.
//
// The RIGHT stick (axes 2/3) steers this player's active summons — nothing
// else reads it, so a player with no summon out loses nothing by resting a
// thumb on it.
function padSnapshot(pad) {
  const axX = Math.abs(pad.axes[0] || 0) > 0.28 ? pad.axes[0] : 0;
  const axY = Math.abs(pad.axes[1] || 0) > 0.42 ? pad.axes[1] : 0;
  const left = axX < -0.28;
  const right = axX > 0.28;
  const up = axY < -0.5;
  const down = axY > 0.5;
  const rx = pad.axes[2] || 0;
  const ry = pad.axes[3] || 0;
  return {
    left, right, up, down,
    aimX: Math.abs(rx) > AIM_DEADZONE ? rx : 0,
    aimY: Math.abs(ry) > AIM_DEADZONE ? ry : 0,
    domainDir: padButtonPressed(pad, 12) ? "up"
             : padButtonPressed(pad, 14) ? "left"
             : padButtonPressed(pad, 15) ? "right"
             : padButtonPressed(pad, 13) ? "down" : null,
    jumpP: padButtonPressed(pad, 0),
    jumpHeld: padButton(pad, 0),
    lightP: padButtonPressed(pad, 2),
    heavyP: padButtonPressed(pad, 3),
    heavyHeld: padButton(pad, 3),
    specialP: padButtonPressed(pad, 7),
    dashP: padButtonPressed(pad, 1),
    ultP: padButtonPressed(pad, 4) || padButtonPressed(pad, 5),
    shieldHeld: padButton(pad, 6),
    pauseP: padButtonPressed(pad, 9),
  };
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
    domainDir: anyPressed(map.domainUp || []) ? "up"
             : anyPressed(map.domainLeft || []) ? "left"
             : anyPressed(map.domainRight || []) ? "right" : null,
    pauseP: false,
  };
}

export function blankInput() {
  return {
    left: false, right: false, up: false, down: false,
    jumpP: false, jumpHeld: false, lightP: false,
    heavyP: false, heavyHeld: false, specialP: false, ultP: false,
    shieldHeld: false, pauseP: false, dirX: 0, dashP: false,
    // Which d-pad direction was pressed this frame, or null. A direction
    // rather than a slot number: the domain it opens depends on the fighter.
    domainDir: null,
    // Right-stick summon steering, -1..1 each. Analog on a pad, ±1 on keys.
    aimX: 0, aimY: 0,
  };
}

// Buttons merge by OR; the analog axes merge by whichever source is pushed
// furthest, so a pad and a keyboard on the same player cannot cancel out or
// collapse a stick to a boolean.
const AXIS_KEYS = new Set(["dirX", "aimX", "aimY"]);
// Fields that carry a VALUE rather than a flag. Whichever source has one wins,
// pad first. ORing these would turn "left" into `true`, which reads as a press
// of no direction at all — and would have made every domain open slot 0.
const VALUE_KEYS = new Set(["domainDir"]);

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
  return merged;
}

export function anyPadPausePressed() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (pad && pad.connected && padButtonPressed(pad, 9)) return true;
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

// One menu snapshot per connected pad, in the same stable order used by
// playerInput(). Character select consumes these separately so each player has
// an independent cursor instead of all pads steering one shared DOM focus.
export function padsMenuStates() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const out = [];
  for (const pad of pads) {
    if (!pad || !pad.connected) continue;
    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    out.push({
      up: ay < -0.5 || padButton(pad, 12),
      down: ay > 0.5 || padButton(pad, 13),
      left: ax < -0.5 || padButton(pad, 14),
      right: ax > 0.5 || padButton(pad, 15),
      confirmP: padButtonPressed(pad, 0),
      backP: padButtonPressed(pad, 1),
      altP: padButtonPressed(pad, 2),
      pagePrevP: padButtonPressed(pad, 4),
      pageNextP: padButtonPressed(pad, 5),
    });
  }
  return out;
}

export function endInputFrame() {
  pressed.clear();
}
