// ---------------------------------------------------------------------------
// The control map — the ONE place a binding is written down.
//
// Every surface that reads inputs or describes them starts here:
//
//   src/input.js          builds its keyboard and pad snapshots from KEY_BINDS
//                         and PAD_BUTTONS
//   src/config_menus.js   builds the move screen's keyboard lines and pad tips
//                         from CONTROL_ROWS, so the in-game instructions cannot
//                         describe a button the game does not use
//   tools/check_controls.mjs  regenerates the tables in README.md and
//                         docs/game-mechanics.md and fails `npm run check` if
//                         they have drifted (`--fix` rewrites them)
//
// So: change a key code or a pad index here, and the game AND every set of
// instructions move together. Nothing else hard-codes a button.
// ---------------------------------------------------------------------------

import { THROW_ENABLED } from "./flags.js";

/** Keyboard codes per player slot. Slots 3 and 4 are gamepad-only. */
export const KEY_BINDS = {
  1: {
    left: ["KeyA"], right: ["KeyD"], up: ["KeyW"], down: ["KeyS"],
    light: ["KeyJ"], heavy: ["KeyK"], special: ["KeyL"], ult: ["KeyI"],
    shield: ["ShiftLeft"],
    dash: ["KeyQ"],
    // Domain Expansion — one key, like the one shoulder button it mirrors.
    domain: ["KeyU"],
    // Summon steering — the keyboard's stand-in for the d-pad. A cluster left
    // of the attack keys, reachable without leaving the WASD hand's
    // neighbours; see summons.js for what it drives.
    steerUp: ["KeyT"], steerLeft: ["KeyF"], steerDown: ["KeyG"], steerRight: ["KeyH"],
    // Grab (src/flags.js). Next to the attack cluster. input.js reads it
    // either way; grab.js acts on it while the mechanic is on, which is the
    // default and everything but a `?throw=false` session.
    grab: ["KeyO"],
  },
  2: {
    left: ["ArrowLeft"], right: ["ArrowRight"], up: ["ArrowUp"], down: ["ArrowDown"],
    light: ["Comma", "Numpad1"], heavy: ["Period", "Numpad2"], special: ["Slash", "Numpad3"], ult: ["Quote", "Numpad0"],
    shield: ["ShiftRight", "NumpadEnter"],
    dash: ["Backslash"],
    domain: ["Semicolon", "Numpad5"],
    // The numpad is fully spoken for by P2's buttons, so their steering cluster
    // is the number row in the same 8/4/5/6 shape.
    steerUp: ["Digit8"], steerLeft: ["Digit4"], steerDown: ["Digit5"], steerRight: ["Digit6"],
    grab: ["KeyM", "Numpad4"],
  },
};

/** Standard-mapping gamepad button indices. A binding may name SEVERAL buttons
 *  (they merge by OR, and the first is the one the diagram calls that action's
 *  home) or NONE, which is a real state: dash has no button and is double-tap
 *  only, the way it was before dash was ever given one. */
export const PAD_BUTTONS = {
  // A, plus RT as a second jump. A pad has one thumb for the face cluster, and
  // jumping while attacking asks that thumb for two buttons at once; the right
  // index finger is doing nothing at that moment.
  //
  // Unless the grab mechanic is on (src/flags.js), which it now is by default:
  // grab wants exactly the button a Smash player's index finger expects, so RT
  // is taken back from jump and A jumps alone. The two-button jump is what a
  // `?throw=false` session falls back to.
  jump: THROW_ENABLED ? [0] : [0, 7],
  grab: THROW_ENABLED ? 7 : [],   // RT behind the flag; bound to nothing otherwise
  dash: [],    // double-tap a direction
  light: 2,
  heavy: 3,
  domain: 4,   // LB
  ult: 5,      // RB
  shield: 6,   // LT
  special: 1,  // B
  pause: 9,
  dpadUp: 12, dpadDown: 13, dpadLeft: 14, dpadRight: 15,
};

/** What each index is called on the pad, for everything that has to SAY a
 *  button rather than read one. Only the buttons the game binds are here. */
const PAD_LABELS = {
  0: "A", 1: "B", 2: "X", 3: "Y",
  4: "LB", 5: "RB", 6: "LT", 7: "RT",
  9: "Start",
};

/** Every label an action is bound to: `padLabelsFor("jump")` → ["A", "RT"]. */
export function padLabelsFor(id) {
  const spec = PAD_BUTTONS[id];
  if (spec == null) return [];
  return (Array.isArray(spec) ? spec : [spec]).map((i) => PAD_LABELS[i] || `Button ${i}`);
}

/** Analog axes. The left stick moves; the right stick attacks. */
export const PAD_AXES = { moveX: 0, moveY: 1, tiltX: 2, tiltY: 3 };

// How a key code is written on screen. Anything not listed reads as itself
// minus the "Key"/"Digit" prefix, which covers every letter and number.
const KEY_LABELS = {
  ArrowLeft: "◀", ArrowRight: "▶", ArrowUp: "▲", ArrowDown: "▼",
  ShiftLeft: "Left Shift", ShiftRight: "Right Shift",
  Comma: ",", Period: ".", Slash: "/", Quote: "'", Semicolon: ";",
  Backslash: "\\", BracketLeft: "[", BracketRight: "]",
  NumpadEnter: "Numpad Enter", Space: "Space", Escape: "Esc",
};

export function keyLabel(code) {
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (code.startsWith("Numpad")) return `Numpad ${code.slice(6)}`;
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

// The control scheme as rows, in the order the tables print them.
//
// A row that names a `bind` gets its `pad` column GENERATED from PAD_BUTTONS
// above — the map the game actually reads — so moving special from RT to B is
// one edit and the table, the tips, the pad diagram and the markdown all follow.
// Only the rows with no button at all (sticks, d-pad, double-tap dash) write
// their own `pad` text, because there is no index to derive it from.
//
// `short` is the compact name the pad diagram draws when the full action does
// not fit the art.
//
// There is no keyboard column. The game is played on controllers, one pad per
// player: that is what the roster, the four-way select screen and the in-game
// diagram are all built around, and it is what the instructions describe.
// KEY_BINDS above still drives slots 1 and 2 so the game can be played and
// tested at a desk with no pad plugged in, but it is deliberately undocumented
// rather than offered as a supported way to play.
const ROWS = [
  { id: "move", action: "Move", pad: "Left stick" },
  { id: "jump", action: "Jump", bind: "jump" },
  { id: "crouch", action: "Crouch / fast-fall", pad: "Left stick ▼" },
  { id: "light", action: "Light attack", bind: "light", short: "Light" },
  { id: "heavy", action: "Heavy attack (hold = charge)", bind: "heavy", short: "Heavy" },
  { id: "special", action: "Special", bind: "special" },
  // Two ways in, and the first is the one a Smash player reaches for: shove the
  // left stick out from centre and the fighter dashes, roll it out gently and
  // they walk (`DASH_FLICK` in input.js). The double tap stays because it is
  // what a keyboard has — a key cannot be shoved.
  { id: "dash", action: "Dash", pad: "Shove the stick, or double-tap" },
  { id: "dashAttack", action: "Dash attack", pad: "Light or heavy, while running" },
  { id: "ult", action: "Ultimate", bind: "ult" },
  { id: "domain", action: "Domain Expansion", bind: "domain", short: "Domain" },
  { id: "shield", action: "Shield / dodges", bind: "shield", short: "Shield / dodge" },
  // Only listed while the mechanic is on (the default; `?throw=false` drops
  // it): a control row the game does not read would be a lie in every
  // generated table and tip.
  ...(THROW_ENABLED
    ? [{ id: "grab", action: "Grab (direction throws · Light pummels)", bind: "grab", short: "Grab" }]
    : []),
  { id: "tilt", action: "Tilt attacks (no run-up)", pad: "Right stick", short: "Tilts" },
  { id: "steer", action: "Steer summons / aim creature shots", pad: "D-pad", short: "Steer / aim" },
  { id: "pause", action: "Pause", bind: "pause" },
];

export const CONTROL_ROWS = ROWS.map((row) => ({
  ...row,
  pad: row.pad || padLabelsFor(row.bind).join(" or "),
}));

/** The row a PHYSICAL button carries, by label — `rowAtPad("B")`. The pad
 *  diagram draws buttons where the plastic puts them and asks what each one
 *  does, rather than assuming an action's position on the pad: that assumption
 *  is what left the drawing promising RT was a second shield two mappings on. */
export function rowAtPad(label) {
  return CONTROL_ROWS.find((row) => row.bind && padLabelsFor(row.bind).includes(label)) || null;
}

/** The pad column as "button — action" pairs, for the controller tips block. */
export function padTips() {
  return CONTROL_ROWS.filter((row) => row.id !== "move" && row.id !== "crouch")
    .map((row) => [row.pad, row.action]);
}

/** The markdown table both README.md and docs/game-mechanics.md carry. Written
 *  by tools/check_controls.mjs, which is also what verifies it. */
export function controlsTable() {
  const lines = [
    "| Action | Gamepad |",
    "|---|---|",
    ...CONTROL_ROWS.map((row) => `| ${row.action} | ${row.pad} |`),
  ];
  return lines.join("\n");
}
