import { state } from "./state.js";
import { CHARACTER_KEYS, CHARACTERS, RANDOM_KEY, RESOLVED_GROUPS, randomCharacterKey } from "./characters.js";
import { STAGES, getStage, backgroundFile } from "./stages.js";
import { audioSettings, audioUnlocked, cycleMusicMode, MUSIC_MODES, musicPlaying, setTitleLive, syncMusic, playSfx, toggleMute } from "./audio.js";
import { cpuLevelName } from "./ai.js";
import { METER_MAX, TIME_OPTIONS, INHERENT_ENERGY } from "./constants.js";
import { clamp } from "./utils.js";
import { padsMenuState, padsMenuStates } from "./input.js";
import { cameraMode } from "./camera_mode.js";
import { preloadChar } from "./render_backend.js";
import { previewCharacter, claimCharacter, loadProgress, onLoadProgress } from "./assets.js";
import { CHARACTER_QUOTES, RANDOM_GROUP, TEXT } from "./config_menus.js";
import { CONTROL_ROWS, rowAtPad } from "./config_controls.js";
import { MATCH_MODES, MAX_FIGHTERS, matchPlan, modeLabel, HUMAN_TEAM } from "./modes.js";

const $ = (id) => document.getElementById(id);

export const els = {};
let callbacks = {};
let movesIndex = 0;
let movesReturnPhase = "menu";
// "players" shows every human player's own fighter side by side; "browse" is
// the original one-at-a-time list with Prev/Next. Split is the default
// whenever it has something to say, because in a local versus match the thing
// each player actually wants is their OWN fighter, not a tour of the roster.
let movesMode = "players";
let settingsReturnPhase = "menu";

const STOCK_OPTIONS = [1, 2, 3, 5];
const PLAYER_IDS = [1, 2, 3, 4];
// Every seat a match can have, human or CPU. Only the first four are ever
// picked by hand; the rest are fighters a match mode brought along.
const FIGHTER_IDS = Array.from({ length: MAX_FIGHTERS }, (_, i) => i + 1);
const pickerCursor = { 1: null, 2: null, 3: null, 4: null };
const pickerRepeat = PLAYER_IDS.map(() => ({ dir: null, t: 0 }));

export function initUi(cb) {
  callbacks = cb;
  // The in-match panels exist before anything looks them up: they are built
  // from MAX_FIGHTERS rather than written out per slot, because a match can
  // seat anywhere from two to eight fighters.
  buildHud();
  for (const id of [
    "hud", "utilityActions", "introOverlay", "titleOverlay", "titlePressStart", "titleCredit", "titleHint", "selectSpotlight", "pauseStandings", "menuOverlay", "stageOverlay", "movesOverlay", "roundOverlay", "pauseOverlay",
    "settingsOverlay", "loadOverlay", "loadStatus", "loadBar", "loadBarFill", "characterGrid", "stageGrid",
    "matchupBar",
    "p1PickCard", "p2PickCard", "p3PickCard", "p4PickCard",
    "p1PickImage", "p2PickImage", "p3PickImage", "p4PickImage",
    "p1PickName", "p2PickName", "p3PickName", "p4PickName",
    "p1PickLabel", "p2PickLabel", "p3PickLabel", "p4PickLabel",
    "p1PickInfo", "p2PickInfo", "p3PickInfo", "p4PickInfo",
    "p1PickReady", "p2PickReady", "p3PickReady", "p4PickReady",
    "p1PickRandomArt", "p2PickRandomArt", "p3PickRandomArt", "p4PickRandomArt",
    "startButton", "movesButton", "settingsButton", "fullscreenButton", "muteButton", "controllerStatus", "menuHint", "loadHint",
    ...FIGHTER_IDS.flatMap((id) => [
      `p${id}Panel`, `p${id}Name`, `p${id}Damage`, `p${id}Stocks`,
      `p${id}Meter`, `p${id}MeterLabel`, `p${id}Energy`, `p${id}Portrait`, `p${id}Team`, `p${id}Combo`,
    ]),
    "arenaSign", "arenaSignName", "matchClock", "errorToast", "pauseNotice", "matchStats", "victoryPodium", "stageAgainButton",
    "vsModeButton", "vsModeLabel", "modeMenu", "modeNote",
    "movesPanel", "movesTitle", "movesKicker", "movesPrevButton", "movesNextButton", "movesBackButton",
    "movesModeButton",
    "randomStageButton", "stageBackButton", "roundKicker", "winnerText", "rematchButton", "menuButton",
    "resumeButton", "pauseResetButton", "pauseMenuButton",
    "settingsSfxButton", "settingsMusicButton", "settingsCpuButton", "settingsStocksButton", "settingsTimeButton", "settingsBoardsButton", "musicVolumeRange", "musicVolumeLabel",
    "sfxVolumeRange", "sfxVolumeLabel", "settingsBackButton",
  ]) {
    els[id] = $(id);
  }

  applyStaticText();
  syncVolumeControls();
  buildCharacterGrid();
  buildStageGrid();
  buildModeMenu();
  bindMenuButtons();
  bindMenuKeyboardNav();
  updateSelectionUi();
  updateMenuButtons();
  updateLoadHint();
  onLoadProgress(updateLoadHint);
  window.addEventListener("resize", layoutCharacterGrid);
  // Entering fullscreen from the TITLE screen used to leave the roster at its
  // windowed size: leaveTitle asks for fullscreen and then shows the select
  // screen immediately, but the request resolves a beat later, so the fitter
  // measured the old viewport and pinned the cards small — and only a second
  // fullscreen toggle, which does fire a resize while the roster is on screen,
  // put it right. `fullscreenchange` is the exact signal that the viewport has
  // finished changing; the rAF lets the browser finish laying out at the new
  // size before anything is measured.
  document.addEventListener("fullscreenchange", () => {
    requestAnimationFrame(layoutCharacterGrid);
  });
}

// The roster streams in behind the menu, so a match can occasionally have to
// wait a moment for a fighter nobody had looked at yet. Saying so up front is
// the difference between "still loading" and "why did it freeze".
let loadHintShown = null;
let loadHintCount = -1;

function updateLoadHint() {
  if (!els.loadHint) return;
  const { charsReady, charsTotal } = loadProgress();
  // This fires once per image — several hundred times — but the line only ever
  // shows a count of fighters, so it is rewritten only when that count moves.
  if (charsReady === loadHintCount) return;
  loadHintCount = charsReady;
  const done = charsReady >= charsTotal;
  if (!done) els.loadHint.textContent = TEXT.menu.loadingRoster(charsReady, charsTotal);
  if (done === !loadHintShown) return; // text-only update; the box is the same size
  loadHintShown = !done;
  els.loadHint.classList.toggle("hidden", done);
  // Showing or hiding the line changes how much vertical room the roster has,
  // and the fitted grid height is pinned, so it has to be re-measured. Without
  // this the cards stay at their squeezed size after loading finishes.
  if (state.phase === "menu") layoutCharacterGrid();
}

// Screens whose wording never changes at runtime still comes from config_menus.js, so
// every player-facing string lives in one file. Anything dynamic is written by
// the render functions below.
function applyStaticText() {
  const set = (el, text) => { if (el) el.textContent = text; };
  set(els.titlePressStart, TEXT.title.pressStart);
  set(els.titleCredit, TEXT.title.credit);
  set(els.titleHint, TEXT.title.hint);
  els.titleOverlay?.querySelector(".neon-title")
    ?.setAttribute("aria-label", TEXT.title.logoAlt);
  set(els.startButton, TEXT.menu.startWaiting);
  set(els.loadStatus, TEXT.loading.title);
  set(els.randomStageButton, TEXT.stages.random);
  set(els.stageBackButton, TEXT.stages.back);
  set(els.movesPrevButton, TEXT.moves.prev);
  set(els.movesNextButton, TEXT.moves.next);
  set(els.movesBackButton, TEXT.moves.back);
  set(els.rematchButton, TEXT.roundOver.rematch);
  set(els.stageAgainButton, TEXT.roundOver.stageSelect);
  set(els.menuButton, TEXT.roundOver.fighterSelect);
  set(els.resumeButton, TEXT.pause.resume);
  set(els.pauseResetButton, TEXT.pause.reset);
  set(els.pauseMenuButton, TEXT.pause.quit);
  set(els.settingsBackButton, TEXT.settings.back);
  const tip = (el, label) => { if (el) { el.title = label; el.setAttribute("aria-label", label); } };
  tip(els.movesButton, TEXT.utility.moves);
  tip(els.settingsButton, TEXT.utility.settings);
  tip(els.fullscreenButton, TEXT.utility.fullscreen);
  updateMuteButton();
  for (const id of PLAYER_IDS) {
    set(els[`p${id}PickLabel`], TEXT.slot.player(id));
    set(els[`p${id}PickReady`], TEXT.slot.readyBadge);
    set(els[`p${id}PickRandomArt`], TEXT.slot.randomGlyph);
  }
  // Overlay headings are keyed off the markup rather than ids, since they are
  // pure decoration with nothing to address them by.
  const heading = (overlay, eyebrow, title) => {
    const lockup = els[overlay]?.querySelector(".title-lockup");
    if (!lockup) return;
    set(lockup.querySelector(".eyebrow"), eyebrow);
    if (title !== undefined) set(lockup.querySelector("h2"), title);
  };
  heading("menuOverlay", TEXT.menu.eyebrow);
  heading("stageOverlay", TEXT.stages.eyebrow, TEXT.stages.title);
  heading("pauseOverlay", TEXT.pause.eyebrow, TEXT.pause.title);
  heading("settingsOverlay", TEXT.settings.eyebrow, TEXT.settings.title);
  heading("loadOverlay", TEXT.loading.eyebrow, TEXT.loading.title);
  els.menuOverlay?.querySelector(".neon-title")
    ?.setAttribute("aria-label", TEXT.menu.logoAlt);
}

// The sliders start wherever config_audio.js says, so the markup never has to
// be kept in step with the mix defaults.
function syncVolumeControls() {
  const music = Math.round(audioSettings.musicVolume * 100);
  const sfx = Math.round(audioSettings.sfxVolume * 100);
  els.musicVolumeRange.value = music;
  els.sfxVolumeRange.value = sfx;
  els.musicVolumeLabel.textContent = TEXT.settings.musicVolume(music);
  els.sfxVolumeLabel.textContent = TEXT.settings.sfxVolume(sfx);
}

// ------------------------------------------------- ready / lock-in helpers

// The CPU slot (P2 in single-player) never needs to lock in; it is always
// considered ready with whatever fighter is currently assigned to it.
function isCpuSlot(id) {
  return state.playerCount === 1 && id === 2;
}

/** The slot a player's cursor is steering right now.
 *
 *  Normally their own. But in a one-player match, once you have locked yourself
 *  in, the only other fighter on the screen is the one you are about to fight —
 *  so your selector keeps working and picks THEM instead of going inert. B
 *  releases your own pick and hands the selector back to you. Nothing changes
 *  for a local versus match, where every slot on screen belongs to a person. */
function steeredSlot(playerId) {
  if (playerId !== 1 || !state.ready[1] || state.playerCount !== 1) return playerId;
  return pickedSlots().includes(2) ? 2 : playerId;
}

/** Whether player 1's selector is currently choosing their opponent. */
function steeringCpu() {
  return steeredSlot(1) === 2;
}

function humanIds() {
  return PLAYER_IDS.slice(0, state.playerCount);
}

function allReady() {
  return humanIds().every((id) => state.ready[id]);
}

export function resetReady() {
  for (const id of PLAYER_IDS) {
    state.ready[id] = false;
    // Back on the roster after a match, each player's marker starts on the
    // fighter they just used — considering it again rather than still
    // committed to it. Without this the cursor kept whatever it held before
    // the match and the marker sat somewhere else entirely.
    pickerCursor[id] = state.selection[id] || null;
  }
  state.cpuRoll = null;
  state.activePicker = 1;
}

// The CPU draws its fighter the instant the humans finish locking in, so the
// select screen can show who they are about to face. Backing out of a lock
// discards the draw, so re-readying faces a fresh opponent.
function syncCpuRoll() {
  // Only for the CPU opponent a player picked on the select screen. A mode's
  // own CPUs are never shown, so there is nothing to draw early for.
  const auto = state.playerCount === 1 && state.selection[2] === RANDOM_KEY && matchPlan().cpuFrom > 2;
  if (!auto || !allReady()) state.cpuRoll = null;
  else if (!state.cpuRoll) {
    state.cpuRoll = randomCharacterKey();
    // The roll is shown on the select screen and honoured by the match, so it
    // is as committed as a human's pick — fetch it the same way.
    claimCharacter(state.cpuRoll);
    preloadChar(state.cpuRoll, true);
  }
}

// Commit a fighter for a slot. Humans lock in (ready); the CPU slot just takes
// the fighter and hands the shared cursor back to Player 1.
function selectFighter(id, key) {
  state.selection[id] = key;
  // Committed, so this fighter's art is definitely needed: start it now instead
  // of waiting for the background queue to reach them. Random resolves at match
  // start, so there is nothing to fetch for it yet. The active render backend
  // gets the same nudge for its own per-character weight (a lazily-loaded 3D
  // rig), so menu time pays the load instead of the first seconds of the match.
  if (key !== RANDOM_KEY) { claimCharacter(key); preloadChar(key, true); }
  if (isCpuSlot(id)) {
    state.activePicker = 1;
  } else {
    state.ready[id] = true;
    const next = humanIds().find((h) => !state.ready[h]);
    if (next) state.activePicker = next;
  }
  // The pick is settled, so this player stops pointing at the grid: their
  // cursor ring and keyboard focus both go away until they back out with B.
  if (state.ready[id]) {
    pickerCursor[id] = null;
    if (focusEl?.dataset?.character) clearMenuFocus();
  }
  updateSelectionUi();
  playLockIn(id);
  playSfx("uiLockIn");
}

// Restarts the lock-in animation on a hero card even if it is already playing,
// so a re-pick reads as a fresh commit rather than nothing happening.
function playLockIn(id) {
  const card = els[`p${id}PickCard`];
  card.classList.remove("is-locking");
  void card.offsetWidth;
  card.classList.add("is-locking");
  card.addEventListener("animationend", () => card.classList.remove("is-locking"), { once: true });
}

function unready(id) {
  const target = state.ready[id] ? id : [...humanIds()].reverse().find((h) => state.ready[h]);
  if (!target) return false;
  state.ready[target] = false;
  state.activePicker = target;
  // Backing out puts the cursor back where the pick was made.
  pickerCursor[target] = state.selection[target] || CHARACTER_KEYS[0];
  updateSelectionUi();
  playSfx("uiBack");
  return true;
}

function tryStart() {
  // Confirming before everyone has locked in does nothing, and doing nothing
  // silently reads as a dropped input rather than as a refusal.
  if (!allReady()) { playSfx("uiDenied"); return; }
  els.startButton.click();
}

function buildCharacterGrid() {
  els.characterGrid.innerHTML = "";
  // RESOLVED_GROUPS, not the raw config: a typo'd key would otherwise reach
  // buildCharacterCard and take the whole select screen down on `.name`.
  // One continuous grid, read left to right: every card is a direct child and
  // layoutCharacterGrid() places it, so a category is a block of columns with
  // its title over the top and the next category picks up immediately to its
  // right. Rows line up across the whole roster; only the tail of a block that
  // doesn't divide evenly is left empty.
  for (const group of RESOLVED_GROUPS) {
    els.characterGrid.appendChild(buildGroupLabel(group.key, group.label, group.members.length));
    for (const member of group.members) els.characterGrid.appendChild(buildCharacterCard(member));
  }
  // Random belongs to no category, so it takes the far right end as a single
  // full-height card — no title, because the tile already reads RANDOM.
  if (RANDOM_GROUP.show !== false) {
    const wildcard = buildCharacterCard(RANDOM_KEY);
    wildcard.title = RANDOM_GROUP.label;
    els.characterGrid.appendChild(wildcard);
  }
}

// `size` is what lets the fitter shape the block without walking the cards:
// at a given depth the category is ceil(size / rows) columns wide.
function buildGroupLabel(key, label, size) {
  const heading = document.createElement("h3");
  heading.className = "char-group-title";
  heading.dataset.group = key;
  heading.dataset.size = String(size);
  heading.textContent = label;
  return heading;
}

/** The painted hero card: the picker at the top of the select screen, and the
 *  portrait beside each fighter's damage in a match. Always this art — the
 *  simplified set is a roster-tile format and would read as a mugshot here. */
function heroCardSrc(key) {
  return `assets/cards/${key}_card.jpg`;
}

/** A fighter's one spoken line — the VS splash and the results screen both say
 *  it. Falls back to the epithet so a fighter without a written line still
 *  speaks rather than standing under an empty quote mark. */
function quoteFor(key) {
  return CHARACTER_QUOTES[key] || CHARACTERS[key]?.quotes?.intro || CHARACTERS[key]?.epithet || "";
}

/** The art the roster GRID draws — the hero card, cropped by the grid. */
function rosterTileSrc(key) {
  return heroCardSrc(key);
}

function buildCharacterCard(key) {
  const random = key === RANDOM_KEY;
  const name = random ? TEXT.slot.randomName : CHARACTERS[key].name;
  const btn = document.createElement("button");
  btn.className = random ? "char-card char-card--random" : "char-card";
  btn.dataset.character = key;
  btn.innerHTML = random
    ? `<b class="random-glyph">${TEXT.slot.randomGlyph}</b><span>${name}</span>`
    : `<img src="${rosterTileSrc(key)}" alt="${name}"><span>${name}</span>`;
  btn.addEventListener("click", () => {
    const slot = steeredSlot(state.activePicker);
    if (slot !== state.activePicker) { setPickerCursor(slot, key); return; }
    selectFighter(state.activePicker, key);
  });
  // Hovering previews the fighter in the active picker's hero card, the same
  // way the pad cursor does, without committing anything.
  btn.addEventListener("mouseenter", () => setPickerCursor(steeredSlot(state.activePicker), key, { quiet: true }));
  btn.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    state.selection[2] = key;
    updateSelectionUi();
  });
  return btn;
}

// How many card rows the roster may stack. Two keeps the cards on one shallow
// band; going deeper narrows the roster (each category needs fewer columns) and
// so buys wider cards, at the cost of height.
const MIN_ROSTER_ROWS = 2;
const MAX_ROSTER_ROWS = 5;

// Portrait shapes the fitter may fall back to, tallest first — cropping the art
// is how a row count that is otherwise right survives a short window.
const ROSTER_ASPECTS = ["3 / 4", "1 / 1", "5 / 4", "3 / 2", "2 / 1"];

// Under this, the name plate starts losing characters, so a layout this narrow
// is only ever taken as a last resort.
const MIN_CARD_WIDTH = 96;

// How much bigger a deeper layout's cards have to come out before the extra row
// is worth it. Without a margin, a rounding-sized win would keep stacking rows
// for cards nobody can tell apart.
const DEPTH_GAIN = 1.06;

/** How much vertical room the roster may take, in px.
 *
 *  Measured as "the overlay, less everything else in it" rather than asked of
 *  the overlay directly. #menuOverlay is a centred flex column, and centred
 *  content that overflows spills out of BOTH ends — only the bottom half of it
 *  counts towards scrollHeight, so `scrollHeight > clientHeight` misses an
 *  overflow until it is twice as bad as it looks. The fitter used to test
 *  exactly that, read every candidate as overflowing, and fall through to its
 *  last-resort layout at every window size: a two-row band of 2/1 letterboxes
 *  down at the bottom of the screen with the middle of the menu left empty. */
function rosterHeightBudget(grid) {
  const overlay = els.menuOverlay;
  const cs = getComputedStyle(overlay);
  const gap = parseFloat(cs.rowGap) || 0;
  let others = 0;
  let items = 0;
  for (const child of overlay.children) {
    // The spotlight art is inset:0 behind everything and costs no room; a
    // hidden line costs neither height nor the gap that would follow it.
    if (getComputedStyle(child).position === "absolute") continue;
    const height = child === grid ? 0 : child.getBoundingClientRect().height;
    if (child !== grid && !height) continue;
    others += height;
    items += 1;
  }
  const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  return overlay.clientHeight - pad - others - gap * Math.max(items - 1, 0);
}

// Sizes the roster to the window. The row count is fixed across the whole grid
// and each category claims however many columns its members need at that depth,
// so the categories sit side by side and every row lines up end to end. Runs on
// resize and whenever the menu is shown; nothing here is tied to the current
// roster size.
export function layoutCharacterGrid() {
  const grid = els.characterGrid;
  if (!grid || !grid.clientWidth) return; // hidden overlay: nothing to measure
  if (!grid.querySelector(".char-card")) return;
  grid.style.removeProperty("--grid-height"); // measure the natural size first
  const budget = rosterHeightBudget(grid);

  // Every depth that fits, scored on how big its cards come out. A deeper
  // roster is narrower — each category needs fewer columns — so it buys card
  // WIDTH with height, and the point of the search is to spend the room the
  // menu actually has rather than to stop at the first layout that is merely
  // legible.
  let best = null;
  let fallback = null;
  for (let rows = MIN_ROSTER_ROWS; rows <= MAX_ROSTER_ROWS; rows++) {
    placeRosterBlocks(grid, rows);
    for (const aspect of ROSTER_ASPECTS) {
      grid.style.setProperty("--card-aspect", aspect);
      if (grid.getBoundingClientRect().height > budget) continue; // crop harder
      const card = grid.querySelector(".char-card").getBoundingClientRect();
      const fit = { rows, aspect, width: card.width, area: card.width * card.height };
      // Only the tallest crop that fits is worth scoring at a given depth: the
      // flatter ones below it are the same cards with more of the art thrown
      // away. Ties go to the shallower layout, which is why DEPTH_GAIN is a
      // multiplier rather than a plain >.
      if (!fallback || fit.area > fallback.area) fallback = fit;
      if (fit.width >= MIN_CARD_WIDTH && (!best || fit.area > best.area * DEPTH_GAIN)) best = fit;
      break;
    }
  }
  const chosen = best ?? fallback ?? { rows: MIN_ROSTER_ROWS, aspect: ROSTER_ASPECTS[ROSTER_ASPECTS.length - 1] };
  placeRosterBlocks(grid, chosen.rows);
  grid.style.setProperty("--card-aspect", chosen.aspect);
  // Pin the fitted height so the roster cannot shift while a player is choosing.
  grid.style.setProperty("--grid-height", `${Math.ceil(grid.getBoundingClientRect().height)}px`);
}

// Lays the roster out at a given depth: each category becomes a block of
// ceil(members / rows) columns filled left to right, the blocks run end to end
// across one grid, and the wildcard takes a single full-height column at the
// far right. Titles ride in a row of their own above their block.
function placeRosterBlocks(grid, rows) {
  // The column tracks are written out rather than left to `repeat(--cols)`, so
  // a narrow SPACER track can sit between one category and the next. A margin
  // on the cards at a block's edge would have done it too, and would have made
  // those cards narrower than the rest of the roster — the cards all have to
  // stay the same size, so the space between categories has to be a track of
  // its own.
  const children = [...grid.children];
  const tracks = [];
  const blocks = [];
  let col = 1;

  // Pass one: the blocks, from the titles alone. Each category is
  // ceil(members / rows) columns wide at this depth, so its capacity — and
  // therefore whether it has a spare cell at the end — is known before a
  // single card is placed.
  for (const child of children) {
    if (!child.classList.contains("char-group-title")) continue;
    // Only BETWEEN blocks: no leading gap at the left edge of the roster.
    if (tracks.length) { tracks.push("var(--group-gap)"); col += 1; }
    const size = Number(child.dataset.size);
    const width = Math.ceil(size / rows);
    for (let i = 0; i < width; i++) tracks.push("minmax(0, 1fr)");
    child.style.gridArea = `1 / ${col} / 2 / ${col + width}`;
    blocks.push({ key: child.dataset.group, start: col, width, size });
    col += width;
  }

  // The wildcard is a fighter-sized card like every other one, and it goes in
  // the first hole the roster leaves: a category whose members do not divide
  // evenly into its columns ends with a spare cell, and that is where Random
  // belongs — at the end of the Students, most often. It used to be a
  // full-height slab of its own at the far right, which made the one tile
  // every player starts on the odd one out. Only a roster that fills every
  // block exactly makes it take a column of its own.
  const random = children.find((c) => c.classList.contains("char-card--random"));
  const host = random ? blocks.find((b) => b.width * rows > b.size) : null;
  if (random && !host) {
    if (tracks.length) { tracks.push("var(--group-gap)"); col += 1; }
    tracks.push("minmax(0, 1fr)");
    random.style.gridArea = `2 / ${col} / 3 / ${col + 1}`;
    col += 1;
  }

  // Pass two: the cards, filling each block left to right, row by row.
  let block = null;
  let seen = 0;
  for (const child of children) {
    if (child.classList.contains("char-group-title")) {
      block = blocks.find((b) => b.key === child.dataset.group);
      seen = 0;
      continue;
    }
    if (child.classList.contains("char-card--random")) continue; // placed below
    const line = block.start + (seen % block.width);
    const row = 2 + Math.floor(seen / block.width);
    child.style.gridArea = `${row} / ${line} / ${row + 1} / ${line + 1}`;
    seen += 1;
  }
  // …and the wildcard into its host block's first free cell.
  if (random && host) {
    const line = host.start + (host.size % host.width);
    const row = 2 + Math.floor(host.size / host.width);
    random.style.gridArea = `${row} / ${line} / ${row + 1} / ${line + 1}`;
  }

  grid.style.gridTemplateColumns = tracks.join(" ");
  grid.style.setProperty("--rows", String(rows));
}

function buildStageGrid() {
  els.stageGrid.innerHTML = "";
  for (const stage of STAGES) {
    const btn = document.createElement("button");
    btn.className = "stage-card";
    // The same plate the match will draw, so the card is a preview rather than
    // a different painting of the same place (src/stages.js, backgroundFile).
    const src = backgroundFile(stage, cameraMode !== "3d");
    const blurb = stage.desc ? `<small>${stage.desc}</small>` : "";
    btn.innerHTML = `<img src="${src}" alt="${stage.name}" loading="lazy"><span>${stage.name}${blurb}</span>`;
    btn.dataset.stage = stage.key;
    btn.addEventListener("click", () => { if (!rouletteRunning) callbacks.startMatch(stage.key); });
    els.stageGrid.appendChild(btn);
  }
}

// ------------------------------------------------- the Random Stage draw
//
// Choosing Random is a draw, so it looks like one: the selector sprints once
// over every arena, then comes round a second time slowing to a stop on the
// stage that was actually rolled, and only then does the match load. While it
// runs, nothing else on the screen answers — see updateMenuNav and the click
// handlers above, which both bail on `rouletteRunning`.
let rouletteRunning = false;
// Halved from the original 0.055/0.26. The draw reads the same — a sprint, an
// ease-out, a landing — because what carries it is the SHAPE of the
// deceleration, not its duration. The beat on the winning card is deliberately
// not halved: it is what makes the result register, and a landing with no beat
// after it reads as a cut rather than as an arrival. Measured end to end that
// puts the whole draw at a bit over half its old length (~2.9s against ~4.0s,
// varying with how far round the wheel the target sits); halve LANDED_HOLD too
// if the landing should be as quick as the spin.
const SWEEP_STEP = 0.0275; // seconds per card on the fast first lap
const SETTLE_STEP = 0.13;  // …and on the very last hop of the second
const LANDED_HOLD = 0.55;  // beat on the winning card before the match loads

const wait = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

async function runStageRoulette() {
  const cards = [...els.stageGrid.querySelectorAll(".stage-card")];
  if (rouletteRunning || !cards.length) return;
  rouletteRunning = true;
  // The pad/keyboard cursor steps aside: two highlights racing each other on
  // the same grid would read as a bug.
  clearMenuFocus();

  const n = cards.length;
  const target = Math.floor(Math.random() * n);
  // One full lap at a flat sprint (i < n), then a second lap that eases out
  // over the remaining hops and stops on `target`.
  const last = n + target;
  let landed = null;
  for (let i = 0; i <= last; i++) {
    // Backing out of the screen (or anything else that changes phase) ends the
    // draw where it stands; the match must not start behind the player's back.
    if (state.phase !== "stageSelect") { rouletteRunning = false; cards.forEach((c) => c.classList.remove("stage-card--rolling", "stage-card--drawn")); return; }
    if (landed) landed.classList.remove("stage-card--rolling");
    landed = cards[i % n];
    landed.classList.add("stage-card--rolling");
    landed.scrollIntoView({ block: "nearest", inline: "nearest" });
    // Every card ticks on the slow lap; on the sprint only every third does,
    // otherwise twenty blips in a second turn into noise.
    if (i >= n || i % 3 === 0) playSfx("uiMove");
    const settle = i < n ? 0 : (target ? (i - n + 1) / target : 1);
    await wait(SWEEP_STEP + (SETTLE_STEP - SWEEP_STEP) * settle * settle);
  }

  landed.classList.add("stage-card--drawn");
  playSfx("uiSelect");
  await wait(LANDED_HOLD);
  landed.classList.remove("stage-card--rolling", "stage-card--drawn");
  rouletteRunning = false;
  if (state.phase !== "stageSelect") return;
  callbacks.startMatch(cards[target].dataset.stage);
}

// ------------------------------------------------------------------ hud
//
// One panel per seat, built once. Odd slots read left to right and take their
// accent on the left edge; even slots are mirrored, which is what makes a 1v1
// read as two fighters facing each other rather than a list. The accent colour
// itself is published per panel as --panel-theme when the match starts, so a
// panel needs no per-slot CSS.
function buildHud() {
  const hud = $("hud");
  const center = hud.querySelector(".round-actions");
  for (const id of FIGHTER_IDS) {
    const mirror = id % 2 === 0;
    const panel = document.createElement("div");
    panel.id = `p${id}Panel`;
    panel.className = `fighter-status hidden${mirror ? " fighter-status--mirror" : ""}`;
    const portrait = `<img id="p${id}Portrait" class="hud-portrait" alt="">`;
    const info = `
      <div class="hud-info">
        <div class="hud-row">${mirror
          ? `<strong id="p${id}Damage" class="damage">0%</strong><i id="p${id}Team" class="team-tag hidden"></i><span id="p${id}Name" class="fighter-name"></span>`
          : `<span id="p${id}Name" class="fighter-name"></span><i id="p${id}Team" class="team-tag hidden"></i><strong id="p${id}Damage" class="damage">0%</strong>`}
        </div>
        <div id="p${id}Stocks" class="stocks${mirror ? " stocks--right" : ""}"></div>
        <div class="meter"><div id="p${id}Meter" class="meter-fill"></div><span id="p${id}MeterLabel" class="meter-label"></span></div>
        <div class="energy-bar"><div id="p${id}Energy" class="energy-fill"></div></div>
        <b id="p${id}Combo" class="combo-count hidden"></b>
      </div>`;
    panel.innerHTML = mirror ? info + portrait : portrait + info;
    // Slot order left to right, with the arena sign left where it is.
    hud.insertBefore(panel, null);
  }
  hud.insertBefore(center, hud.firstChild);
}

// ------------------------------------------------------------- match mode
//
// The VS badge is a button: it opens this list. Everything the modes actually
// DO lives in modes.js — here they are four labels and a blurb.
let modeMenuOpen = false;

function buildModeMenu() {
  els.modeMenu.innerHTML = "";
  const title = document.createElement("i");
  title.className = "mode-menu-title";
  title.textContent = TEXT.modes.title;
  els.modeMenu.appendChild(title);
  for (const key of MATCH_MODES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mode-option";
    btn.dataset.mode = key;
    btn.innerHTML = `<b>${TEXT.modes[key].label}</b><em>${TEXT.modes[key].blurb}</em>`;
    btn.addEventListener("click", () => chooseMode(key));
    els.modeMenu.appendChild(btn);
  }
}

function chooseMode(key) {
  state.matchMode = key;
  // Players vs CPUs takes the CPU's hero card off the screen. If that card was
  // the one being picked for, the cursor goes back to Player 1 rather than
  // steering a slot nobody can see.
  if (!pickedSlots().includes(state.activePicker)) state.activePicker = 1;
  closeModeMenu();
  updateSelectionUi();
}

function openModeMenu() {
  modeMenuOpen = true;
  els.modeMenu.classList.remove("hidden");
  els.vsModeButton.setAttribute("aria-expanded", "true");
  syncModeMenu();
  // Opens on the mode already chosen, so a pad player can see where they are
  // before moving.
  const current = els.modeMenu.querySelector(`[data-mode="${state.matchMode}"]`);
  setFocus(current || els.modeMenu.querySelector(".mode-option"), { quiet: true });
}

function closeModeMenu() {
  if (!modeMenuOpen) return;
  modeMenuOpen = false;
  els.modeMenu.classList.add("hidden");
  els.vsModeButton.setAttribute("aria-expanded", "false");
  // Hand the cursor back where it came from: the LB/RB corner cycle for a pad,
  // plain focus for mouse and keyboard.
  if (padsMenuStates().length) {
    utilityIdx = UTILITY_IDS.indexOf("vsModeButton");
    syncMenuHighlight();
  } else {
    setFocus(els.vsModeButton, { quiet: true });
  }
}

// What the select screen says about the mode: its name under the VS badge, and
// — for anything but a plain Vs Battle — a line saying how many CPUs are about
// to join. Never WHICH CPUs: they are drawn when the match starts.
function syncModeUi() {
  const plan = matchPlan();
  els.vsModeLabel.textContent = modeLabel(state.matchMode);
  els.vsModeButton.classList.toggle("is-alternate", state.matchMode !== "versus");
  const note = TEXT.modes[state.matchMode].note(plan.added);
  els.modeNote.textContent = note;
  els.modeNote.classList.toggle("hidden", !note);
  syncModeMenu();
}

function syncModeMenu() {
  for (const btn of els.modeMenu.querySelectorAll(".mode-option")) {
    btn.classList.toggle("is-current", btn.dataset.mode === state.matchMode);
  }
}

function setActivePicker(n) {
  state.activePicker = n;
  updateSelectionUi();
}

function bindMenuButtons() {
  for (const id of PLAYER_IDS) els[`p${id}PickCard`].addEventListener("click", () => setActivePicker(id));
  els.vsModeButton.addEventListener("click", () => {
    if (modeMenuOpen) closeModeMenu();
    else openModeMenu();
  });
  // A click anywhere else is a dismissal — the picker is a menu, not a screen.
  window.addEventListener("mousedown", (e) => {
    if (!modeMenuOpen) return;
    if (els.modeMenu.contains(e.target) || els.vsModeButton.contains(e.target)) return;
    closeModeMenu();
  });
  els.startButton.addEventListener("click", () => setPhase("stageSelect"));
  els.stageBackButton.addEventListener("click", () => setPhase("menu"));
  els.randomStageButton.addEventListener("click", () => { runStageRoulette(); });

  els.settingsCpuButton.addEventListener("click", () => {
    state.cpuLevel = (state.cpuLevel + 1) % 3;
    updateMenuButtons();
  });
  els.settingsStocksButton.addEventListener("click", () => {
    const i = STOCK_OPTIONS.indexOf(state.stocks);
    state.stocks = STOCK_OPTIONS[(i + 1) % STOCK_OPTIONS.length];
    updateMenuButtons();
  });
  // Takes effect on the next match start, like the other match rules — a clock
  // that changed length under a running match would be a strange thing to do
  // to the two people playing it.
  els.settingsTimeButton.addEventListener("click", () => {
    const i = TIME_OPTIONS.indexOf(state.timeLimit);
    state.timeLimit = TIME_OPTIONS[(i + 1) % TIME_OPTIONS.length];
    updateMenuButtons();
  });
  // Takes effect on the next match start; an in-progress match keeps the
  // gimmick it began with (initStageFx reads this in resetMatch).
  els.settingsSfxButton.addEventListener("click", () => {
    state.sfxEnabled = !state.sfxEnabled;
    updateMenuButtons();
  });
  els.settingsBoardsButton.addEventListener("click", () => {
    state.activeBoards = !state.activeBoards;
    updateMenuButtons();
  });
  const musicClick = () => {
    cycleMusicMode();
    updateMenuButtons();
    syncMusic(state.phase);
  };
  els.settingsMusicButton.addEventListener("click", musicClick);

  els.movesButton.addEventListener("click", () => {
    movesReturnPhase = state.phase === "moves" ? movesReturnPhase : state.phase;
    movesIndex = Math.max(0, CHARACTER_KEYS.indexOf(state.selection[1]));
    // Re-open on the split view whenever it applies, so a second player never
    // has to find the toggle to see their own fighter.
    movesMode = canSplitMoves() ? "players" : "browse";
    setPhase("moves");
  });
  els.movesModeButton.addEventListener("click", () => {
    movesMode = movesMode === "players" ? "browse" : "players";
    renderMoveList();
  });
  els.movesBackButton.addEventListener("click", () => setPhase(movesReturnPhase));
  els.movesPrevButton.addEventListener("click", () => {
    movesMode = "browse";
    movesIndex = (movesIndex - 1 + CHARACTER_KEYS.length) % CHARACTER_KEYS.length;
    renderMoveList();
  });
  els.movesNextButton.addEventListener("click", () => {
    movesMode = "browse";
    movesIndex = (movesIndex + 1) % CHARACTER_KEYS.length;
    renderMoveList();
  });

  els.fullscreenButton.addEventListener("click", toggleFullscreen);
  // Leaving the title splash. A click is deliberately NOT a fullscreen
  // trigger — see leaveTitle.
  els.titleOverlay.addEventListener("click", () => leaveTitle({ fullscreen: false }));

  els.muteButton.addEventListener("click", () => {
    // Silence first, repaint second: if anything ever threw while updating the
    // icon, the audio must already be muted rather than left running.
    toggleMute();
    syncMusic(state.phase);
    updateMuteButton();
  });

  els.settingsButton.addEventListener("click", () => {
    settingsReturnPhase = state.phase === "settings" ? settingsReturnPhase : state.phase;
    setPhase("settings");
  });
  els.settingsBackButton.addEventListener("click", () => setPhase(settingsReturnPhase));

  els.musicVolumeRange.addEventListener("input", () => {
    audioSettings.musicVolume = els.musicVolumeRange.value / 100;
    els.musicVolumeLabel.textContent = TEXT.settings.musicVolume(els.musicVolumeRange.value);
    syncMusic(state.phase);
  });
  els.sfxVolumeRange.addEventListener("input", () => {
    audioSettings.sfxVolume = els.sfxVolumeRange.value / 100;
    els.sfxVolumeLabel.textContent = TEXT.settings.sfxVolume(els.sfxVolumeRange.value);
    playSfx("uiSelect", 0.8);
  });

  els.resumeButton.addEventListener("click", () => callbacks.togglePause());
  els.pauseResetButton.addEventListener("click", () => callbacks.resetMatch());
  els.pauseMenuButton.addEventListener("click", () => callbacks.quitToMenu());
  els.rematchButton.addEventListener("click", () => callbacks.resetMatch());
  // Same fighters, different arena — the one thing the result screen could not
  // do before, which sent the player back through fighter select to reach a
  // screen they were only passing through.
  els.stageAgainButton.addEventListener("click", () => setPhase("stageSelect"));
  els.menuButton.addEventListener("click", () => callbacks.quitToMenu());
  bindMenuClickAudio();
}

/** Every menu button clicks audibly, however it was pressed.
 *
 *  One delegated listener rather than a playSfx at each call site: the pad and
 *  keyboard paths go through activateFocus, which used to be the ONLY thing
 *  that made a sound, so a mouse player got silence from the stage grid, the
 *  whole settings screen and the start button. Because activateFocus reaches
 *  its target with .click(), routing everything through the resulting event
 *  covers both without either double-blipping. */
function bindMenuClickAudio() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || btn.disabled) return;
    if (!btn.closest(".overlay, .utility-actions, .mode-menu")) return;
    // The roster has its own, louder confirmation (selectFighter).
    if (btn.classList.contains("char-card")) return;
    playSfx("uiSelect");
  });
}

// Speaker on / speaker off, plus the wording and pressed state that go with it.
function updateMuteButton() {
  const btn = els.muteButton;
  if (!btn) return;
  const muted = audioSettings.muted;
  btn.classList.toggle("is-muted", muted);
  btn.setAttribute("aria-pressed", String(muted));
  const label = muted ? TEXT.utility.unmute : TEXT.utility.mute;
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.querySelector(".icon-sound-on")?.classList.toggle("hidden", muted);
  btn.querySelector(".icon-sound-off")?.classList.toggle("hidden", !muted);
}

/** Seconds as m:ss. Rounds UP while counting down, so a clock reading 1:00 has
 *  a full minute left rather than having just lost one — a timer that shows
 *  0:00 for a whole second before the match ends looks broken. */
export function formatClock(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function updateMenuButtons() {
  const label = MUSIC_MODES[audioSettings.musicMode].label;
  els.settingsMusicButton.textContent = TEXT.settings.music(label);
  els.settingsCpuButton.textContent = TEXT.settings.cpu(cpuLevelName(state.cpuLevel));
  els.settingsStocksButton.textContent = TEXT.settings.stocks(state.stocks);
  els.settingsTimeButton.textContent = TEXT.settings.timeLimit(
    state.timeLimit ? formatClock(state.timeLimit) : TEXT.settings.timeOff
  );
  els.settingsBoardsButton.textContent = TEXT.settings.activeBoards(state.activeBoards);
  els.settingsSfxButton.textContent = TEXT.settings.sfxEnabled(state.sfxEnabled);
}

// Stat bars for the hero cards, normalized against the full roster so a bar
// at 100% means "best in the game", not an absolute number.
const STAT_DEFS = [
  { label: TEXT.slot.stats.speed, value: (c) => c.stats.speed },
  { label: TEXT.slot.stats.power, value: (c) => c.heavy.dmg + c.light.dmg },
  { label: TEXT.slot.stats.weight, value: (c) => c.stats.weight },
];
const STAT_RANGES = STAT_DEFS.map((def) => {
  const values = CHARACTER_KEYS.map((k) => def.value(CHARACTERS[k]));
  return { min: Math.min(...values), max: Math.max(...values) };
});

function randomInfoHtml() {
  const bars = STAT_DEFS.map((def) =>
    `<span class="hero-stat"><i>${def.label}</i><b></b></span>`).join("");
  return `
    <em class="hero-epithet">${TEXT.slot.randomBlurb}</em>
    <span class="hero-stats">${bars}</span>
    <span class="hero-ult"><i>${TEXT.slot.ultimateLabel}</i> ${TEXT.slot.unknownUltimate}</span>
  `;
}

function heroInfoHtml(char) {
  const bars = STAT_DEFS.map((def, i) => {
    const { min, max } = STAT_RANGES[i];
    const pct = Math.round(15 + 85 * ((def.value(char) - min) / (max - min || 1)));
    return `<span class="hero-stat"><i>${def.label}</i><b><u style="width:${pct}%"></u></b></span>`;
  }).join("");
  return `
    <em class="hero-epithet" title="${char.epithet}">${char.epithet}</em>
    <span class="hero-stats">${bars}</span>
    <span class="hero-ult" title="${char.ultimate.name}"><i>${TEXT.slot.ultimateLabel}</i> ${char.ultimate.name}</span>
  `;
}

// The slots that get a hero card: the ones a person actually picks. A mode's
// CPUs (`plan.cpuFrom` and up) are drawn at the start of the match and never
// shown — there is nothing to look at yet, and nothing to choose.
function pickedSlots() {
  const cpuFrom = matchPlan().cpuFrom;
  const seats = state.playerCount === 1 ? [1, 2] : PLAYER_IDS.slice(0, state.playerCount);
  return seats.filter((id) => id < cpuFrom);
}

// A human slot that has not locked in is "browsing": its card shows whatever
// the cursor is over (or its last pick) greyed out, because nothing is settled
// yet. The CPU slot never browses — it is committed to whatever it holds.
function isBrowsing(id) {
  return !state.ready[id] && !isCpuSlot(id);
}

// The fighter a browsing slot is pointing at right now. Falls back to its last
// pick so backing out with B keeps showing the fighter it was on.
function browsingKey(id) {
  if (!isBrowsing(id)) return null;
  const cursor = state.activePicker === id ? pickerCursor[id] : null;
  return cursor || state.selection[id];
}

/** The ONE card a player's marker sits on.
 *
 *  A player is either considering a fighter or committed to one, never both:
 *  while they browse the marker rides their cursor, and once they lock in it
 *  rests on what they locked. Previously the grid drew the marker from the
 *  SELECTION while the cursor moved independently, so after a match — where
 *  the old pick survives and only the ready flag is cleared — a player could
 *  walk a second highlight around the roster with their P1 tag still sitting
 *  on last match's fighter. */
function markedKey(id) {
  const drawn = id === 2 && state.selection[id] === RANDOM_KEY ? state.cpuRoll : null;
  if (drawn) return drawn;
  if (isBrowsing(id)) return pickerCursor[id] || state.selection[id] || null;
  return state.selection[id] || null;
}

/** Paints every marker on the roster in one pass.
 *
 *  Several players share a card constantly — everyone starts on Random — so a
 *  card takes a RING PER PLAYER, drawn concentrically in seat order, rather
 *  than one player's colour winning and the others vanishing. The rings are
 *  built here instead of in CSS because the combinations are the power set of
 *  four seats; the stylesheet just consumes --mark-rings. */
function renderRosterMarkers() {
  const marks = new Map();
  for (const id of pickedSlots()) {
    const key = markedKey(id);
    if (!key) continue;
    if (!marks.has(key)) marks.set(key, []);
    marks.get(key).push(id);
  }
  for (const btn of els.characterGrid?.querySelectorAll(".char-card") || []) {
    const on = marks.get(btn.dataset.character) || [];
    btn.classList.toggle("is-marked", on.length > 0);
    btn.querySelectorAll(".pick-tag").forEach((el) => el.remove());
    if (!on.length) {
      btn.style.removeProperty("--mark-rings");
      btn.style.removeProperty("--mark-color");
      continue;
    }
    const rings = on.map((id, i) => `0 0 0 ${(i + 1) * 3}px var(--p${id}-theme)`).join(", ");
    btn.style.setProperty("--mark-rings",
      `${rings}, 0 0 18px color-mix(in srgb, var(--p${on[0]}-theme) 55%, transparent)`);
    btn.style.setProperty("--mark-color", `var(--p${on[0]}-theme)`);
    for (const id of on) {
      const tag = document.createElement("i");
      tag.className = `pick-tag pick-tag--p${id}`;
      tag.textContent = id === 2 && state.playerCount === 1 ? "CPU" : `P${id}`;
      btn.appendChild(tag);
    }
  }
}

// What each slot's card should point at right now. Normally the selection
// itself, but once the CPU has drawn, its tag follows the drawn fighter rather
// than sitting on the Random card.
function shownKey(id) {
  const drawn = id === 2 && state.selection[id] === RANDOM_KEY ? state.cpuRoll : null;
  return drawn || state.selection[id];
}

// ------------------------------------------------------- select spotlight
//
// The fighter the active picker is browsing, huge and dim behind the whole
// select screen — the screen answers the cursor the way the arena will.
// Two stacked images alternate so a change crossfades instead of popping;
// Random (and an empty slot) fades the spotlight out entirely.
let spotlightKey = null;
let spotlightFlip = false;

function updateSpotlight() {
  const el = els.selectSpotlight;
  if (!el) return;
  const id = state.activePicker;
  const shown = browsingKey(id) || state.selection[id];
  const key = shown && shown !== RANDOM_KEY ? shown : null;
  if (key === spotlightKey) return;
  spotlightKey = key;
  const imgs = el.querySelectorAll("img");
  const show = imgs[spotlightFlip ? 1 : 0];
  const hide = imgs[spotlightFlip ? 0 : 1];
  spotlightFlip = !spotlightFlip;
  hide.classList.remove("is-on");
  if (!key) { show.classList.remove("is-on"); return; }
  show.src = heroCardSrc(key);
  show.classList.add("is-on");
}

export function updateSelectionUi() {
  syncCpuRoll();
  const visiblePlayers = pickedSlots();
  renderRosterMarkers();
  for (const id of PLAYER_IDS) {
    // A random slot shows a "?" tile, except the CPU once it has drawn: then
    // the card reveals the fighter the next match will actually use. A slot
    // nobody has picked yet (P1 at boot) shows an empty placeholder instead of
    // a portrait — an unset key would build "undefined_card.jpg" and 404.
    const drawn = id === 2 && state.selection[id] === RANDOM_KEY ? state.cpuRoll : null;
    const browsing = isBrowsing(id);
    const key = drawn || (browsing ? browsingKey(id) : state.selection[id]);
    const random = key === RANDOM_KEY;
    const char = key && !random ? CHARACTERS[key] : null;
    const badge = els[`p${id}PickReady`];

    els[`p${id}PickCard`].classList.toggle("is-browsing", browsing && !!key);
    els[`p${id}PickCard`].classList.toggle("is-empty", !key);
    els[`p${id}PickImage`].classList.toggle("hidden", !char);
    els[`p${id}PickRandomArt`].classList.toggle("hidden", !random);
    if (char) els[`p${id}PickImage`].src = heroCardSrc(key);
    else els[`p${id}PickImage`].removeAttribute("src");
    // The hero card is the one place with room for the character's full name;
    // roster tiles and the in-match HUD stay on the short form.
    els[`p${id}PickName`].textContent =
      char ? (char.fullName || char.name) : random ? TEXT.slot.randomName : TEXT.slot.empty;
    els[`p${id}PickInfo`].innerHTML = char ? heroInfoHtml(char) : random ? randomInfoHtml() : "";

    badge.textContent = drawn ? TEXT.slot.randomBadge : TEXT.slot.readyBadge;
    badge.classList.toggle("hero-ready--random", !!drawn);
    badge.classList.toggle("hidden", !state.ready[id] && !drawn);
    els[`p${id}PickCard`].classList.toggle("hidden", !visiblePlayers.includes(id));
    els[`p${id}PickCard`].classList.toggle("is-active", state.activePicker === id);
    els[`p${id}PickCard`].classList.toggle("is-ready", state.ready[id]);
  }
  // Three and four hero cards share the same bar, so each one is much narrower
  // than in a 1v1. The full name has to shrink with them, and CSS cannot see a
  // flex item's computed width — so publish the count and let it key off that.
  els.matchupBar.dataset.slots = String(
    [1, 2, 3, 4].filter((id) => !els[`p${id}PickCard`].classList.contains("hidden")).length
  );
  els.p2PickLabel.textContent = state.mode === "cpu" ? TEXT.slot.cpu : TEXT.slot.player(2);
  syncModeUi();
  const go = allReady();
  els.startButton.disabled = !go;
  els.startButton.textContent = go ? TEXT.menu.startReady : TEXT.menu.startWaiting;
  els.menuHint.textContent = steeringCpu() ? TEXT.menu.hintOpponent
    : go ? TEXT.menu.hintReady
    : TEXT.menu.hintPicking;
  updateSpotlight();
  updatePickerCursorClasses();
}

export function syncControllerPlayers(count) {
  const joined = Math.min(4, count);
  if (joined <= state.playerCount) return;
  state.playerCount = joined;
  state.mode = joined === 1 ? state.mode : "local";
  // Slots 3 and 4 arrive holding a default fighter nobody picked by hand. A pad
  // joining is the first moment we know those slots are in play, so their art
  // is claimed here rather than being discovered at the match gate.
  for (let id = 1; id <= joined; id++) {
    const key = state.selection[id];
    if (key && key !== RANDOM_KEY) { claimCharacter(key); preloadChar(key, true); }
  }
  updateMenuButtons();
  updateSelectionUi();
}

// ------------------------------------------------------------------ phases

/** The arena, not the document: fullscreening the whole page would letterbox
 *  the 16:9 frame inside a black document body instead of filling the screen
 *  with it. `requestFullscreen` rejects without a user gesture, so every call
 *  site has to tolerate a refusal. */
function enterFullscreen() {
  if (document.fullscreenElement) return;
  document.querySelector(".arena-wrap")?.requestFullscreen?.().catch(() => {});
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else enterFullscreen();
}

// ------------------------------------------------------------ attract mode
//
// An arcade cabinet is already making noise when you walk up to it; a web page
// is not allowed to. Nothing may sound until the page has had a user gesture,
// so a player whose very first press is the one that starts the game would
// hear Iron vs Bone for a single frame before the menu track replaced it.
//
// So the title screen spends that first press the way a cabinet does: it turns
// the sound on and keeps standing there. The screen does not change what it is
// asking for — PRESS START still blinks — it just comes alive first, and the
// next press starts the game. Only ever ONE extra press, and only when there
// is actually something to wake: with the music off, muted, or already
// unlocked, the title is armed from the moment it appears and the first press
// starts the game as normal.
let titleArmed = false;
let armTimer = null;

/** Whether the splash still owes the player a wake-up press. False whenever
 *  waking would accomplish nothing audible — silence is a setting, and making
 *  someone press twice to reach a menu for no reason is just a worse menu. */
function titleNeedsWake() {
  if (audioUnlocked() || musicPlaying()) return false;
  if (audioSettings.muted || audioSettings.musicVolume <= 0) return false;
  return (MUSIC_MODES[audioSettings.musicMode] || MUSIC_MODES[0]).key !== "off";
}

/** The cabinet coming on: the music starts and the logo takes a hit of light.
 *  The gesture that got here has already unlocked audio (audio.js listens on
 *  the window, and the pad path calls noteGamepadGesture), so this only has to
 *  ask for the title track again — a pad press unlocks after that re-ask has
 *  already been made for the frame. */
// ---------------------------------------------------------------- neon buzz
//
// The title sign's sound. The CSS owns the flicker (styles.css tubeA/tubeB);
// this watcher only OBSERVES it: every ~120ms it reads each tube's computed
// opacity, and the frame a tube dips below 0.9 it plays a short random slice
// of the buzz recording — so sound and light can never drift apart, because
// the light is the clock. The recording is one long take with dozens of
// flicker events in it; a random seek plays a different one each time.
const NEON_BUZZ_URL = new URL("../assets/sfx/neon_buzz.mp3", import.meta.url).href;
const buzzEl = typeof Audio !== "undefined" ? new Audio(NEON_BUZZ_URL) : null;
if (buzzEl) buzzEl.preload = "auto";
let buzzTubes = null;
let buzzLit = [];
let buzzStopTimer = 0;

function watchNeonBuzz() {
  const overlay = els.titleOverlay;
  if (!overlay || overlay.classList.contains("hidden") || !buzzEl) return;
  if (!buzzTubes) {
    buzzTubes = [...overlay.querySelectorAll(".neon-title .tube")];
    buzzLit = buzzTubes.map(() => true);
  }
  for (let i = 0; i < buzzTubes.length; i++) {
    const o = parseFloat(getComputedStyle(buzzTubes[i]).opacity);
    const dim = o < 0.9;
    if (dim && buzzLit[i] && titleArmed && !audioSettings.muted) {
      // Louder the deeper the dip, quieter than any real sfx.
      buzzEl.volume = Math.min(1, 0.16 * (0.8 + (1 - o) * 0.45) * audioSettings.sfxVolume * 4);
      const dur = buzzEl.duration;
      if (Number.isFinite(dur) && dur > 1) {
        buzzEl.currentTime = Math.random() * (dur - 0.6);
      }
      buzzEl.play().catch(() => {});
      clearTimeout(buzzStopTimer);
      buzzStopTimer = setTimeout(() => buzzEl.pause(), 380);
    }
    buzzLit[i] = !dim;
  }
}
setInterval(watchNeonBuzz, 120);

function wakeTitle() {
  titleArmed = true;
  syncMusic(state.phase);
  playSfx("uiSelect");
  const el = els.titleOverlay;
  if (!el) return;
  el.classList.remove("is-waking");
  void el.offsetWidth;
  el.classList.add("is-waking");
  // Taken off again once the flourish is done, and not merely for tidiness:
  // while it is on, its rules outrank the looping ones, so leaving it would
  // stop PRESS START blinking for good the moment its finite burst ended.
  clearTimeout(wakeTitle.timer);
  wakeTitle.timer = setTimeout(() => el.classList.remove("is-waking"), 660);
}

/** Press start. Hands the game from the title splash to fighter select.
 *
 *  `fullscreen` is the one thing that differs by input: a controller (or Enter)
 *  is somebody sitting down to play, so the game takes the screen; a mouse
 *  click is somebody browsing, and seizing their display for that would be
 *  rude. Browsers also only grant fullscreen inside a real user gesture, and a
 *  gamepad poll is not one — enterFullscreen swallows the refusal, so a pad
 *  press always reaches the menu whether or not the screen follows.
 *
 *  Guarded on the phase because three input paths lead here and a second press
 *  arriving a frame later must not re-run it. */
export function leaveTitle({ fullscreen = false } = {}) {
  if (state.phase !== "title") return;
  // The attract-mode press: wake the cabinet, stay on the splash.
  if (!titleArmed) { wakeTitle(); return; }
  if (fullscreen) enterFullscreen();
  playSfx("uiStart");
  setPhase("menu");
}

// Screens that can be opened from the splash and return to it. While one of
// these is up the title is still "the screen underneath", which is what keeps
// its music playing (setTitleLive above).
const TITLE_HOLD_PHASES = new Set(["settings", "moves"]);

const OVERLAY_FOR_PHASE = {
  title: "titleOverlay",
  loading: "loadOverlay",
  menu: "menuOverlay",
  stageSelect: "stageOverlay",
  moves: "movesOverlay",
  paused: "pauseOverlay",
  roundOver: "roundOverlay",
  settings: "settingsOverlay",
  playing: null,
};

export function setPhase(phase) {
  const changed = state.phase !== phase;
  state.prevPhase = state.phase;
  state.phase = phase;
  for (const [ph, id] of Object.entries(OVERLAY_FOR_PHASE)) {
    if (id) els[id].classList.toggle("hidden", ph !== phase);
  }
  // Screens arrive rather than appearing. `.hidden` is display:none, so a CSS
  // transition has nothing to run against — the overlay that just became
  // visible is given its entrance animation instead, restarted by hand so
  // returning to a screen you were just on still plays it. The whole effect is
  // ~180ms and CSS turns it off under prefers-reduced-motion.
  const arriving = OVERLAY_FOR_PHASE[phase] && els[OVERLAY_FOR_PHASE[phase]];
  if (changed && arriving) {
    arriving.classList.remove("is-entering");
    void arriving.offsetWidth;
    arriving.classList.add("is-entering");
  }
  // Everywhere but the loading screen, including the title splash: mute in
  // particular has to be reachable on the one screen that starts playing music
  // at you unprompted.
  els.utilityActions.classList.toggle("hidden", phase === "loading");
  // Any screen change away from the fight takes the VS splash down with it.
  if (phase !== "playing") hideBattleIntro();
  // Arriving on the splash decides whether it owes a wake-up press. Asked here
  // rather than at press time because by then the press itself has already
  // unlocked audio through audio.js's own window listeners.
  // Settings and the move list can be opened from the splash now, and they sit
  // OVER it rather than replacing it — so the title track holds underneath
  // them instead of cutting to the menu one and restarting on the way back.
  if (phase === "title") setTitleLive(true);
  else if (!TITLE_HOLD_PHASES.has(phase)) setTitleLive(false);
  if (phase === "title") {
    titleArmed = !titleNeedsWake();
    els.titleOverlay?.classList.remove("is-waking");
    // …and asked once more a beat later. `play()` is a promise: on a browser
    // that permits autoplay the track is still `paused` for a few ms after
    // syncMusic asks for it, and a cabinet that turns out to be making noise
    // on its own has nothing left to wake.
    clearTimeout(armTimer);
    if (!titleArmed) {
      armTimer = setTimeout(() => {
        if (state.phase === "title" && musicPlaying()) titleArmed = true;
      }, 450);
    }
  }
  // The pause screen reads the match as it stands right now, so its standings
  // strip is rebuilt on every pause rather than kept live.
  if (phase === "paused") renderPauseStandings();
  els.hud.classList.toggle("hidden", !["playing", "paused", "roundOver"].includes(phase));
  // The roster can only be measured once its overlay is on screen.
  if (phase === "menu") layoutCharacterGrid();
  if (phase === "moves") renderMoveList();
  clearMenuFocus();
  // Arriving on the arena screen, the cursor is already parked on Random: a
  // player who just presses A gets a stage without ever steering the grid.
  if (phase === "stageSelect") setFocus(els.randomStageButton, { quiet: true });
  if (phase === "playing") els.arenaSignName.textContent = getStage(state.stageKey)?.name || "";
  syncMusic(phase);
}

/** The match as it stands, one plate per fighter: portrait, damage, stocks.
 *  Built fresh each time the game pauses — the pause screen should answer
 *  "how is this going?" without making anyone resume to find out. Ordered by
 *  current standing (the same comparison the result screen uses), so the
 *  plate on the left is whoever is winning right now. */
function renderPauseStandings() {
  const el = els.pauseStandings;
  if (!el) return;
  const fighters = state.fighters || [];
  el.classList.toggle("hidden", fighters.length === 0);
  if (!fighters.length) return;
  const standing = [...fighters].sort((a, b) =>
    (b.stocks - a.stocks) || (a.damage - b.damage) || (b.tally.dealt - a.tally.dealt));
  el.innerHTML = standing.map((f) => {
    const dots = Array.from({ length: state.stocks }, (_, i) =>
      `<b class="${i < f.stocks ? "" : "is-lost"}"></b>`).join("");
    return `
    <div class="pause-chip" style="--seat:${f.char.theme}">
      <img src="${heroCardSrc(f.charKey)}" alt="">
      <span class="pause-chip-info">
        <strong>${f.char.name}</strong>
        <span class="pause-chip-row"><i>${Math.round(f.damage)}%</i><span class="pause-chip-stocks">${dots}</span></span>
      </span>
    </div>`;
  }).join("");
}

/** The line on the pause screen explaining WHY the match stopped, when it was
 *  not the player who stopped it. `seats` is the player numbers whose pads
 *  went missing, or null to clear. */
export function setPauseNotice(seats) {
  if (!els.pauseNotice) return;
  const list = seats && seats.length ? seats : null;
  els.pauseNotice.classList.toggle("hidden", !list);
  if (list) els.pauseNotice.textContent = TEXT.pause.disconnected(TEXT.pause.playerList(list));
}

/** Something threw. The player is told, in the game, rather than being left
 *  looking at a screen that has quietly stopped updating with the explanation
 *  sitting in a console they will never open. Always logs as well, because the
 *  console is where the stack trace is. */
export function reportError(what, err) {
  console.error(what, err);
  const el = els.errorToast;
  if (!el) return;
  const detail = err && err.message ? err.message : String(err ?? "");
  el.textContent = detail ? `${what}: ${detail}` : what;
  el.classList.remove("hidden");
  clearTimeout(reportError.timer);
  reportError.timer = setTimeout(() => el.classList.add("hidden"), 8000);
}

// ------------------------------------------------------- battle intro splash
//
// The VS splash: every entrant's painted hero card, huge, in angled panels
// that slam in from the sides before the READY…GO! countdown. A cut-scene beat
// rather than a menu — it takes no input.
//
// It keeps no clock of its own. main.js fades it and drops it off the match
// countdown (see the schedule there), so the splash leaving and the READY…
// that replaces it are the same instant by construction rather than by two
// timers agreeing — which, at the busiest moment on the main thread, they did
// not: the fade and the hide once landed 9ms apart and the fade became a cut.

/** Raise the VS splash.
 *
 *  `entrants` is [{ id, key, cpu }] taken from the resolved ROSTER rather than
 *  from built fighters, because the splash now goes up BEFORE the match's art
 *  is fetched — the hero paintings it needs are core assets that are always in
 *  memory, so there is no reason to make the player watch a loading bar on an
 *  empty screen first. When something is still streaming, `loading` adds a
 *  slim bar along the bottom of the splash and setLoadProgress drives it. */
export function showBattleIntro(entrants, { loading = false } = {}) {
  const el = els.introOverlay;
  if (!el || !entrants || entrants.length < 2) return;
  const seat = (e) => e.cpu ? TEXT.intro.seatCpu : TEXT.intro.seatPlayer(e.id);
  el.innerHTML = `
    <div class="intro-splash" data-count="${entrants.length}">
      ${entrants.map((e, i) => {
        const char = CHARACTERS[e.key];
        return `
        <div class="intro-panel" style="--seat:${char.theme}; --i:${i}">
          <img src="${heroCardSrc(e.key)}" alt="${char.name}">
          <div class="intro-plate">
            <i class="intro-seat">${seat(e)}</i>
            <b class="intro-name">${char.name}</b>
            <em class="intro-quote">“${quoteFor(e.key)}”</em>
          </div>
        </div>`;
      }).join("")}
    </div>
    <img class="intro-flash" src="assets/ui/vs_flash.png" alt="" aria-hidden="true">
    <b class="intro-vs" aria-hidden="true">${TEXT.intro.vs}</b>
    <div class="intro-stage">${TEXT.intro.stageLabel(getStage(state.stageKey)?.name || "")}</div>
    ${loading ? `<div class="intro-load" role="progressbar" aria-label="${TEXT.intro.loading}">
      <i class="intro-load-fill"></i>
    </div>` : ""}`;
  el.classList.remove("hidden", "is-leaving");
  // Restart the entrance animations even if the overlay was just up (rematch).
  void el.offsetWidth;
  el.classList.add("is-entering");
}

/** Start the splash's exit fade. Called by the match countdown a beat before
 *  it drops the splash, so the two are the same clock — see the schedule at
 *  the top of main.js. */
export function fadeBattleIntro() {
  const el = els.introOverlay;
  if (!el || el.classList.contains("hidden")) return;
  el.classList.add("is-leaving");
}

/** Drops the splash instantly. Also the guard setPhase runs on every change of
 *  screen, so pausing or quitting mid-intro can never leave it parked on top. */
export function hideBattleIntro() {
  const el = els.introOverlay;
  if (!el || el.classList.contains("hidden")) return;
  el.classList.add("hidden");
  el.classList.remove("is-entering", "is-leaving");
  el.innerHTML = "";
}

export function setLoadProgress(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  els.loadBarFill.style.width = `${pct}%`;
  els.loadBar.setAttribute("aria-valuenow", String(pct));
  // The same progress, on the bar the VS splash carries when a match's art is
  // still streaming behind it.
  const onSplash = els.introOverlay?.querySelector(".intro-load-fill");
  if (onSplash) onSplash.style.width = `${pct}%`;
}

/** Whether the splash is currently holding the screen. The menu loop asks,
 *  because while it is up the screen underneath must not answer a pad: the
 *  splash can go up before the match phase does (see resetMatch). */
export function battleIntroVisible() {
  return !!els.introOverlay && !els.introOverlay.classList.contains("hidden");
}

// ------------------------------------------------------------------- moves

/** Human players paired with the fighter they are actually going to play.
 *
 *  Prefers the live match roster, because that is what resolves a Random pick
 *  into a real character and knows which slots fell back to the CPU. Falls
 *  back to menu selections when the moves screen is opened before a match. */
function movesPlayers() {
  if (state.fighters && state.fighters.length) {
    return state.fighters
      .filter((f) => !f.aiState && CHARACTERS[f.charKey])
      .map((f) => ({ id: f.id, key: f.charKey }));
  }
  return humanIds()
    .map((id) => ({ id, key: shownKey(id) }))
    .filter((p) => p.key && p.key !== RANDOM_KEY && CHARACTERS[p.key]);
}

/** Split only earns its space when there are at least two players AND they are
 *  on different fighters. Two players who both picked Gojo would get two
 *  identical columns, so that case stays on the single view. */
function canSplitMoves() {
  const players = movesPlayers();
  if (players.length < 2) return false;
  return new Set(players.map((p) => p.key)).size >= 2;
}

function renderMoveList() {
  const split = movesMode === "players" && canSplitMoves();
  els.movesPanel.classList.toggle("moves-panel--split", split);
  els.movesModeButton.classList.toggle("hidden", !canSplitMoves());
  els.movesModeButton.textContent = split ? TEXT.moves.browseAll : TEXT.moves.backToPlayers;
  els.movesPrevButton.classList.toggle("hidden", split);
  els.movesNextButton.classList.toggle("hidden", split);
  if (split) renderMovesSplit();
  else renderMovesSingle();
}

/** Every human player's fighter at once. The controller diagram is identical
 *  for everyone, so it is drawn once above the columns rather than repeated. */
function renderMovesSplit() {
  const players = movesPlayers();
  els.movesTitle.textContent = TEXT.moves.splitHeading;
  els.movesKicker.textContent = TEXT.moves.splitKicker;
  // Drives how much room the shared controller diagram is allowed to take:
  // at three or four columns it gives way entirely so each player's Domain
  // Expansion still lands above the fold.
  els.movesPanel.dataset.players = String(players.length);
  els.movesPanel.innerHTML = `
    ${controllerGuide()}
    <div class="moves-players" data-count="${players.length}">
      ${players.map((p) => {
        const c = CHARACTERS[p.key];
        return `
        <section class="moves-player" data-player="${p.id}">
          <header class="moves-player-head">
            <span class="moves-player-badge">${TEXT.moves.playerBadge(p.id)}</span>
            <span class="moves-player-name">${c.fullName || c.name}</span>
            <span class="moves-player-epithet">${c.epithet}</span>
          </header>
          ${characterBody(c)}
        </section>`;
      }).join("")}
    </div>
  `;
}

function renderMovesSingle() {
  const key = CHARACTER_KEYS[movesIndex];
  const c = CHARACTERS[key];
  els.movesTitle.textContent = TEXT.moves.heading(c.name, c.epithet);
  els.movesKicker.textContent = TEXT.moves.kicker;
  els.movesPanel.innerHTML = `
    ${controllerGuide()}
    ${characterBody(c)}
    <p class="keyboard-hint">${TEXT.moves.stickHint}</p>
  `;
}

/** The button map, identical for every fighter and every player.
 *
 *  Every label on the pad is looked up in the control map (config_controls.js),
 *  which is the same file input.js binds from — so a rebinding redraws this
 *  diagram instead of leaving it describing the game as it used to be. This
 *  drawing is why that matters: it is the first thing a player reads, and it
 *  was still promising RT was a second shield two mappings later. */
function padFor(id) {
  return CONTROL_ROWS.find((row) => row.id === id);
}

/** "LB · DOMAIN EXPANSION" — a physical button and what it currently does, in
 *  the diagram's shouting case. Asked by BUTTON, so moving an action across
 *  the pad moves its label with it instead of leaving the drawing to be
 *  re-authored by hand. An unbound button reads as an empty string. */
function buttonCallout(label) {
  const row = rowAtPad(label);
  return row ? `${label} · ${row.short || row.action}`.toUpperCase() : "";
}

/** Just the action at a button — the face cluster prints the letter in the
 *  circle and the name beside it. */
function buttonAction(label) {
  const row = rowAtPad(label);
  return row ? (row.short || row.action).toUpperCase() : "";
}

/** For the two rows that are a stick or the d-pad rather than a button. */
function stickCallout(id, short) {
  const row = padFor(id);
  return row ? `${row.pad} · ${short || row.short || row.action}`.toUpperCase() : "";
}

function controllerGuide() {
  return `
    <div class="controller-guide">
      <svg class="xbox-controller" viewBox="0 0 660 300" role="img" aria-label="Xbox controller button map">
        <path class="controller-shell" d="M180 55C128 60 94 99 80 155L53 246c-8 28 25 43 43 21l69-81h330l69 81c18 22 51 7 43-21l-27-91c-14-56-48-95-100-100-48-5-66 14-110 14S228 50 180 55Z"/>
        <rect class="controller-bumper" x="145" y="38" width="100" height="26" rx="10"/><rect class="controller-bumper" x="415" y="38" width="100" height="26" rx="10"/>
        <text x="195" y="56">${buttonCallout("LB")}</text><text x="465" y="56">${buttonCallout("RB")}</text>
        <circle class="controller-stick" cx="205" cy="126" r="35"/><circle class="controller-stick-cap" cx="205" cy="126" r="21"/>
        <text class="controller-callout" x="205" y="184">MOVE · CROUCH</text>
        <g class="controller-dpad controller-dpad--domain"><rect x="270" y="168" width="62" height="22" rx="5"/><rect x="290" y="148" width="22" height="62" rx="5"/></g>
        <text class="controller-callout" x="301" y="228">${stickCallout("steer")}</text>
        <circle class="controller-menu" cx="305" cy="104" r="10"/><circle class="controller-menu" cx="355" cy="104" r="10"/>
        <circle class="controller-stick" cx="548" cy="212" r="30"/><circle class="controller-stick-cap" cx="548" cy="212" r="18"/>
        <text class="controller-callout" x="548" y="262">${stickCallout("tilt")}</text>
        <g class="controller-face">
          <circle class="button-y" cx="468" cy="102" r="20"/><text x="468" y="108">Y</text>
          <circle class="button-x" cx="428" cy="141" r="20"/><text x="428" y="147">X</text>
          <circle class="button-b" cx="508" cy="141" r="20"/><text x="508" y="147">B</text>
          <circle class="button-a" cx="468" cy="180" r="20"/><text x="468" y="186">A</text>
        </g>
        <text class="face-label" x="552" y="106">${buttonAction("Y")}</text><text class="face-label" x="368" y="146" text-anchor="end">${buttonAction("X")}</text>
        <text class="face-label" x="552" y="146">${buttonAction("B")}</text><text class="face-label" x="552" y="186">${buttonAction("A")}</text>
        <text class="controller-trigger" x="113" y="27">${buttonCallout("LT")}</text><text class="controller-trigger" x="547" y="27" text-anchor="end">${buttonCallout("RT")}</text>
      </svg>
      <div class="controller-tips">
        ${TEXT.moves.tips.map(([input, action]) => `<span><strong>${input}</strong> ${action}</span>`).join("")}
      </div>
    </div>`;
}

/** Everything that is specific to one fighter: passive, techniques, domain.
 *  Shared by the single view and by each column of the split view, so the two
 *  can never drift apart. */
function characterBody(c) {
  const s = c.specials;
  return `
    <p class="moves-blurb"><strong>${c.passive.name}:</strong> ${c.passive.desc}</p>
    <div class="moves-section">${TEXT.moves.sectionTitle}</div>
    <dl class="moves-table">
      ${c.ranged ? `<dt>${TEXT.moves.ranged}</dt><dd><strong>${c.ranged.name}</strong> — ${c.ranged.desc}</dd>` : ""}
      <dt>${TEXT.moves.specialNeutral}</dt><dd><strong>${s.neutral.name}</strong> — ${s.neutral.desc}</dd>
      <dt>${TEXT.moves.specialSide}</dt><dd><strong>${s.side.name}</strong> — ${s.side.desc}</dd>
      <dt>${TEXT.moves.specialDown}</dt><dd><strong>${s.down.name}</strong> — ${s.down.desc}</dd>
      <dt>${TEXT.moves.ultimate}</dt><dd><strong>${c.ultimate.name}</strong> — ${c.ultimate.desc} <em>${TEXT.moves.ultimateNote}</em></dd>
    </dl>
  `;
}

// -------------------------------------------------------------------- HUD

function damageColor(d) {
  const t = clamp(d / 160, 0, 1);
  const r = 255;
  const g = Math.round(255 - t * 190);
  const b = Math.round(255 - t * 230);
  return `rgb(${r},${g},${b})`;
}

// This runs 60 times a second for up to eight panels, and almost nothing on it
// changes between one frame and the next: a name never changes at all, a
// portrait changes once per match, damage changes only when somebody is hit.
// Writing them anyway made every frame pay for a style recalculation — worst
// with `--pN-theme`, which is set on the document root and so invalidates the
// whole page. So each write is guarded by what it wrote last.
const hudCache = new Map();

function hudSet(key, value, write) {
  if (hudCache.get(key) === value) return;
  hudCache.set(key, value);
  write(value);
}

/** Dropped when a match starts, so the first frame of a new match writes
 *  everything rather than trusting values left by the last one. */
export function resetHudCache() {
  hudCache.clear();
}

export function updateHud() {
  els.hud.classList.toggle("hud--multiplayer", state.fighters.length > 2);
  // Five or more panels no longer fit at multiplayer size: portraits go and the
  // type shrinks so a Battle Royal still reads at a glance.
  els.hud.classList.toggle("hud--crowd", state.fighters.length > 4);
  updateMatchClock();
  const teamMatch = matchPlan().teams;
  for (const id of FIGHTER_IDS) {
    const f = state.fighters[id - 1];
    els[`p${id}Panel`].classList.toggle("hidden", !f);
    if (!f) continue;
    const panel = els[`p${id}Panel`];
    // Slots 1-4 also colour the select screen; every panel colours itself.
    hudSet(`${id}:theme`, f.char.theme, (theme) => {
      if (id <= 4) document.documentElement.style.setProperty(`--p${id}-theme`, theme);
      panel.style.setProperty("--panel-theme", theme);
    });
    // In a team match the panels have to say which side each fighter is on;
    // eight names in a row are otherwise eight strangers.
    const side = teamMatch ? (f.team === HUMAN_TEAM ? TEXT.hud.playerSide : TEXT.hud.cpuSide) : "";
    hudSet(`${id}:side`, side, (text) => {
      els[`p${id}Team`].textContent = text;
      els[`p${id}Team`].classList.toggle("hidden", !text);
    });
    hudSet(`${id}:cpuSide`, teamMatch && f.team !== HUMAN_TEAM, (on) =>
      panel.classList.toggle("fighter-status--cpu-side", on));
    hudSet(`${id}:name`, f.char.name, (name) => { els[`p${id}Name`].textContent = name; });
    hudSet(`${id}:portrait`, f.charKey, (key) => { els[`p${id}Portrait`].src = heroCardSrc(key); });
    hudSet(`${id}:damage`, Math.round(f.damage), (dmg) => {
      els[`p${id}Damage`].textContent = `${dmg}%`;
      els[`p${id}Damage`].style.color = damageColor(dmg);
    });
    // Two hits is the smallest thing worth calling a combo; one is a hit.
    hudSet(`${id}:combo`, f.comboT > 0 && f.combo > 1 ? f.combo : 0, (n) => {
      const el = els[`p${id}Combo`];
      el.classList.toggle("hidden", !n);
      if (!n) return;
      el.textContent = TEXT.hud.combo(n);
      // Restarted per hit, so a running combo pulses on every one of them
      // rather than animating once and sitting still while it grows.
      el.classList.remove("is-hit");
      void el.offsetWidth;
      el.classList.add("is-hit");
    });
    renderStocks(els[`p${id}Stocks`], f);
    renderMeter(els[`p${id}Meter`], els[`p${id}MeterLabel`], f);
    renderEnergy(els[`p${id}Energy`], f);
  }
}

function updateMatchClock() {
  const on = state.timeLimit > 0 && !state.suddenDeath;
  els.matchClock.classList.toggle("hidden", !on);
  if (!on) return;
  hudSet("clock", formatClock(state.timeLeft), (text) => { els.matchClock.textContent = text; });
  // The last ten seconds read differently, because by then the clock is the
  // thing deciding the match rather than a limit sitting in the corner.
  els.matchClock.classList.toggle("match-clock--urgent", state.timeLeft <= 10);
}

function renderStocks(el, f) {
  if (el.childElementCount !== state.stocks) {
    el.innerHTML = "";
    for (let i = 0; i < state.stocks; i++) {
      const dot = document.createElement("span");
      dot.className = "stock-dot";
      el.appendChild(dot);
    }
  }
  [...el.children].forEach((dot, i) => {
    dot.classList.toggle("stock-dot--lost", i >= f.stocks);
  });
}

function renderMeter(fillEl, labelEl, f) {
  const pct = (f.meter / METER_MAX) * 100;
  fillEl.style.width = `${pct}%`;
  // One threshold: a full bar, spendable on either super. There is nothing to
  // signal below it, so the bar is either charging or ready.
  const full = f.meter >= METER_MAX;
  fillEl.parentElement.classList.toggle("meter--full", full);
  labelEl.textContent = full ? TEXT.hud.ultimateReady : "";
}

/** The inherent energy pool (constants.js INHERENT_ENERGY): a slim cyan bar
 *  under the attack meter. Dims when the pool is too low to matter — the "you
 *  are out" read at a glance, mirroring the meter's own one-threshold style. */
function renderEnergy(fillEl, f) {
  const pct = Math.max(0, Math.min(100, ((f.energy ?? 0) / INHERENT_ENERGY.max) * 100));
  fillEl.style.width = `${pct}%`;
  fillEl.parentElement.classList.toggle("energy-bar--low", (f.energy ?? 0) < 25);
  // FULL is the state worth a flare: the pool regenerates continuously, so the
  // moment it tops out is the moment the expensive things become affordable
  // again, and it is the only moment in the bar's life a player needs told
  // about. The reactor starburst (assets/ui/energy_flare.png via CSS) lights
  // behind the bar's leading edge while it holds there.
  fillEl.parentElement.classList.toggle("energy-bar--full", pct >= 99.5);
}

/** The result screen. `side` is set only in a team match, where the result
 *  belongs to a side rather than to whichever fighter happened to be left
 *  standing, and `reason` is how the match ended — a player who was watching
 *  the fight saw the KO, but a match decided on the clock needs saying. */
export function showRoundOver({ winner, side = null, reason = "ko" } = {}) {
  els.roundKicker.textContent = TEXT.roundOver.kickerFor[reason] || TEXT.roundOver.kicker;
  els.winnerText.textContent = !winner ? TEXT.roundOver.draw
    : side ? TEXT.roundOver.teamWinner(side)
    : TEXT.roundOver.winner(winner.char.name);
  renderPodium(winner, side);
  renderMatchStats(winner);
  setPhase("roundOver");
}

/** The match's finishing order: stocks left, then least damage taken — the
 *  same comparison the match itself used to decide the result. The winner is
 *  pinned first regardless, because in a sudden-death finish the tie-break
 *  columns can disagree with who actually landed the deciding hit, and a
 *  results screen that ranks the winner second argues with its own headline. */
function rankFighters(winner) {
  return [...state.fighters].sort((a, b) =>
    (b === winner) - (a === winner) ||
    (b.stocks - a.stocks) || (a.damage - b.damage) || (b.tally.dealt - a.tally.dealt));
}

/** The results podium, in the VS splash's own grammar: the winner takes a wide
 *  angled panel — their painted card as the backdrop, their full-body victory
 *  pose standing in it, gold WINNER plate, name at poster size, and their own
 *  line spoken under it. In a team match (`side` set) the whole winning side
 *  gets a panel each — the survivor did not win alone. The beaten file below
 *  as small grey slats in the same angled cut, ranked. A draw has no winner to
 *  celebrate, so it renders nothing and the table carries the screen. */
function renderPodium(winner, side = null) {
  if (!winner) { els.victoryPodium.innerHTML = ""; return; }
  const hero = (f) => `
    <figure class="victory-hero" style="--card-theme:${f.char.theme}">
      <img class="victory-hero-art" src="${heroCardSrc(f.charKey)}" alt="${f.char.name}">
      <figcaption class="victory-hero-plate">
        <i>${TEXT.roundOver.winnerBadge}</i>
        <b>${f.char.name}</b>
        <em>“${quoteFor(f.charKey)}”</em>
      </figcaption>
    </figure>`;
  const slat = (f, badge) => `
    <figure class="victory-card victory-card--loser" style="--card-theme:${f.char.theme}">
      <img src="${heroCardSrc(f.charKey)}" alt="${f.char.name}">
      <figcaption><i>${badge}</i><b>${f.char.name}</b></figcaption>
    </figure>`;
  const ranked = rankFighters(winner);
  const winners = side ? ranked.filter((f) => f.team === winner.team) : [winner];
  const losers = ranked.filter((f) => !winners.includes(f));
  els.victoryPodium.innerHTML =
    `<div class="victory-hero-row" data-count="${winners.length}">${winners.map(hero).join("")}</div>` +
    `<div class="victory-losers">${losers.map((f, i) =>
      slat(f, TEXT.roundOver.place(i + 2))).join("")}</div>`;
}

/** Who did what, in finishing order.
 *
 *  That makes the table a placement list in a Battle Royal, which is the
 *  screen's other job — with eight fighters, "Gojo wins" leaves seven players
 *  with no idea how they did. */
function renderMatchStats(winner) {
  const ranked = rankFighters(winner);
  const s = TEXT.roundOver.stats;
  const cell = (v) => `<span>${v}</span>`;
  const rows = ranked.map((f, i) => `
    <div class="stat-row${f === winner ? " stat-row--winner" : ""}" style="--row-theme:${f.char.theme}">
      ${cell(i + 1)}
      <span class="stat-name">${f.char.name}</span>
      ${cell(`${Math.round(f.tally.dealt)}%`)}
      ${cell(`${Math.round(f.tally.taken)}%`)}
      ${cell(f.tally.kos)}
      ${cell(f.tally.falls)}
      ${cell(s.comboValue(f.tally.bestCombo))}
    </div>`).join("");
  els.matchStats.innerHTML = `
    <div class="stat-row stat-row--head">
      ${cell(s.place)}<span class="stat-name">${s.fighter}</span>
      ${cell(s.dealt)}${cell(s.taken)}${cell(s.kos)}${cell(s.falls)}${cell(s.combo)}
    </div>
    ${rows}
    <p class="stat-footer">${s.duration(formatClock(state.matchTime))}</p>`;
}

export function updateControllerStatus(count) {
  els.controllerStatus.classList.toggle("hidden", count === 0);
  if (count > 0) {
    // Every connected pad is already seated by the time this runs (input.js
    // seats on sight), so there is no longer a "waiting to join" state to
    // report — a pad that exists is a player.
    const joined = state.playerCount;
    const who = joined === 1 ? TEXT.controllers.vsCpu : TEXT.controllers.joined(joined);
    els.controllerStatus.textContent = TEXT.controllers.allJoined(who);
  }
}

// ------------------------------------------- gamepad / keyboard menu nav
//
// Spatial navigation over whatever overlay is visible: directions move focus
// to the geometrically nearest control, A/Enter activates, B backs out of the
// current screen. Works on the character grid, stage grid, and every button
// row without any per-screen wiring.

let focusEl = null;
const navRepeat = { dir: null, t: 0 };

const BACK_TARGET = {
  stageSelect: () => els.stageBackButton,
  moves: () => els.movesBackButton,
  settings: () => els.settingsBackButton,
  paused: () => els.resumeButton,
};

function menuFocusables() {
  // The mode picker is modal: while it is open it is the only thing the cursor
  // can reach, so arrows walk its options instead of wandering the roster
  // behind it.
  if (modeMenuOpen) return [...els.modeMenu.querySelectorAll("button")];
  const overlayId = OVERLAY_FOR_PHASE[state.phase];
  if (!overlayId) return [];
  const overlay = els[overlayId];
  // The roster drops out of the keyboard walk once the player driving it has
  // locked in: a committed player has no selector to move, so directions take
  // them to the buttons below instead of putting a highlight back on the grid.
  // B (Backspace) releases the pick and the cards come back.
  // …unless the selector still has something to do: in a one-player match a
  // locked-in player goes on steering, for their opponent (steeredSlot).
  const gridInert = state.phase === "menu"
    && state.ready[state.activePicker]
    && steeredSlot(state.activePicker) === state.activePicker;
  return [...overlay.querySelectorAll("button, input[type=range]")]
    .filter((el) => !el.classList.contains("hidden") && el.offsetParent !== null && !el.disabled)
    .filter((el) => !(gridInert && el.classList.contains("char-card")));
}

function defaultFocus() {
  const items = menuFocusables();
  if (!items.length) return null;
  if (modeMenuOpen) {
    return els.modeMenu.querySelector(`[data-mode="${state.matchMode}"]`) || items[0];
  }
  // A locked-in player starts on the start button, not on the roster: their pick
  // is made, so the only thing left to point at is the match. menuFocusables()
  // has already dropped the cards in that case, hence the membership test.
  if (state.phase === "menu") {
    const key = state.selection[state.activePicker];
    const current = key
      ? els.characterGrid.querySelector(`[data-character="${key}"]`)
      : els.characterGrid.querySelector(".char-card");
    if (current && items.includes(current)) return current;
  }
  // Random is the arena screen's resting position: it needs no browsing and it
  // always has an answer, so it is what a blind press of A should get.
  if (state.phase === "stageSelect" && items.includes(els.randomStageButton)) return els.randomStageButton;
  return items.find((el) => el.classList.contains("primary-action")) || items[0];
}

// `quiet` places the cursor without the move blip — used when a screen opens
// with something already selected, which is a starting position, not a move.
function setFocus(el, { quiet = false } = {}) {
  if (focusEl === el) return;
  if (focusEl) focusEl.classList.remove("pad-focus");
  focusEl = el;
  if (focusEl) {
    focusEl.classList.add("pad-focus");
    // Keyboard focus previews too, so arrow-key browsing reads the same as pad.
    if (state.phase === "menu" && focusEl.dataset.character) {
      setPickerCursor(steeredSlot(state.activePicker), focusEl.dataset.character, { quiet: true });
    }
    focusEl.scrollIntoView({ block: "nearest", inline: "nearest" });
    playSfx("uiMove");
  }
}

// The cursor and the commit are one marker now (renderRosterMarkers), so the
// pad loop simply repaints them.
function updatePickerCursorClasses() {
  renderRosterMarkers();
}

function setPickerCursor(playerId, key, { quiet = false } = {}) {
  // A player who has locked in has stopped browsing: nothing — pad, mouse hover
  // or keyboard focus — may move their cursor again until they press B. The pad
  // loop already skips ready players, but the hover and focus paths call in
  // through `state.activePicker`, which can still be pointing at someone who is
  // ready, so the rule belongs here where every path passes.
  if (state.ready[playerId]) return;
  if (!key || pickerCursor[playerId] === key) return;
  pickerCursor[playerId] = key;
  // A CPU slot has no lock-in of its own, so pointing at a fighter IS the
  // choice — and being a real commitment, its art is claimed rather than
  // merely hinted at.
  if (isCpuSlot(playerId)) {
    state.selection[playerId] = key;
    if (key !== RANDOM_KEY) { claimCharacter(key); preloadChar(key, true); }
  } else if (key !== RANDOM_KEY) {
    // Looking at a fighter is a hint, not a commitment: they move to the head
    // of the background queue rather than starting a download of their own, so
    // sweeping across the roster cannot kick off twenty parallel loads. The
    // backend hint is the same trade — a lazily-loaded rig starts on hover
    // (ensureRig de-dupes, so sweeping costs one in-flight load at a time).
    previewCharacter(key);
    preloadChar(key);
  }
  // Repaints the hero card too: the cursor drives the transient preview.
  updateSelectionUi();
  if (!quiet) playSfx("uiMove");
}

/** Steer one player's cursor across the roster, WRAPPING at the edges.
 *
 *  The roster is one grid of blocks rather than a rectangle, so the move is
 *  geometric: the nearest card in the pressed direction, biased to stay in the
 *  same row (or column). Running out of grid does not stop the cursor — it
 *  comes back on the far side of the same row, which is what a player expects
 *  from every fighter select ever made, and what the old code only faked for
 *  left/right by stepping through the DOM order (so pressing left on the first
 *  card of a row landed on the LAST card of the row above, and pressing up
 *  anywhere on the top row did nothing at all). */
function movePickerCursor(playerId, dx, dy) {
  const items = [...els.characterGrid.querySelectorAll(".char-card")];
  if (!items.length) return;
  const currentKey = pickerCursor[playerId] || state.selection[playerId];
  const current = items.find((el) => el.dataset.character === currentKey) || items[0];
  const from = current.getBoundingClientRect();
  const fx = from.left + from.width / 2;
  const fy = from.top + from.height / 2;
  // How far out of line a card may be and still count as "this row" when
  // wrapping. Half a card, so a roster whose blocks are a few pixels out of
  // step still reads as rows.
  const tolerance = (dx !== 0 ? from.height : from.width) * 0.5;

  let best = null;
  let bestScore = Infinity;
  const behind = [];
  for (const el of items) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const along = dx !== 0 ? (cx - fx) * dx : (cy - fy) * dy;
    const ortho = dx !== 0 ? Math.abs(cy - fy) : Math.abs(cx - fx);
    if (along < 4) { behind.push({ el, along, ortho }); continue; }
    const score = along + ortho * 2.6;
    if (score < bestScore) { bestScore = score; best = el; }
  }

  // Nothing ahead: wrap to the FURTHEST card the other way, staying in the
  // nearest row — pressing left off the left edge lands on the rightmost card
  // beside you, not on some card two rows up that happens to be far away.
  if (!best && behind.length) {
    const nearest = Math.min(...behind.map((c) => c.ortho));
    const sameLine = behind.filter((c) => c.ortho <= nearest + tolerance);
    best = sameLine.reduce((a, b) => (a.along <= b.along ? a : b)).el;
  }
  if (best) setPickerCursor(playerId, best.dataset.character);
}

// LB/RB on the menu cycle a highlight through the utility buttons in the top
// right corner, then wrap back to the fighter grid (or the start button once
// everyone is locked in). A activates the highlighted button.
// The VS badge rides along with the corner menus so LB/RB reaches the mode
// picker too — a pad player never touches the mouse.
// The four buttons in the bottom-right corner, in cycling order. They are the
// whole list on the title splash; the select screen appends its VS badge so
// LB/RB reaches the mode picker there too.
const CORNER_IDS = ["movesButton", "muteButton", "settingsButton", "fullscreenButton"];
const UTILITY_IDS = [...CORNER_IDS, "vsModeButton"];
let utilityIdx = -1;
let menuHighlightEl = null;

function setMenuHighlight(el) {
  if (menuHighlightEl === el) return;
  if (menuHighlightEl) menuHighlightEl.classList.remove("pad-focus");
  menuHighlightEl = el;
  if (el) {
    el.classList.add("pad-focus");
    playSfx("uiMove");
  }
}

function syncMenuHighlight() {
  if (utilityIdx >= 0) setMenuHighlight(els[UTILITY_IDS[utilityIdx]]);
  // No fighters to be ready on the splash, and its start button belongs to the
  // select screen — the highlight simply rests nowhere.
  else if (state.phase === "title") setMenuHighlight(null);
  else setMenuHighlight(allReady() ? els.startButton : null);
}

function cycleUtility(dir, n = UTILITY_IDS.length) {
  utilityIdx = dir > 0
    ? (utilityIdx >= n - 1 ? -1 : utilityIdx + 1)
    : (utilityIdx < 0 ? n - 1 : utilityIdx - 1);
}

/** One pad's directions, walking one slot's cursor, with the hold-to-repeat
 *  the roster has always had. Shared by a player steering their own pick and
 *  by a locked-in player steering their opponent's. */
function steerPad(slot, pad, repeat, dt) {
  // A slot with no cursor yet (fresh boot, or just backed out) parks on its
  // own pick, else on the first fighter in the grid.
  if (!pickerCursor[slot]) pickerCursor[slot] = state.selection[slot] || CHARACTER_KEYS[0];
  let dx = 0, dy = 0;
  if (pad.left) dx = -1;
  else if (pad.right) dx = 1;
  else if (pad.up) dy = -1;
  else if (pad.down) dy = 1;
  const dirKey = dx !== 0 ? `x${dx}` : dy !== 0 ? `y${dy}` : null;
  if (!dirKey) { repeat.dir = null; return; }
  if (repeat.dir !== dirKey) {
    repeat.dir = dirKey;
    repeat.t = 0.34;
    movePickerCursor(slot, dx, dy);
  } else {
    repeat.t -= dt;
    if (repeat.t <= 0) { repeat.t = 0.13; movePickerCursor(slot, dx, dy); }
  }
}

function updateCharacterPickerPads(dt) {
  const pads = padsMenuStates();

  if (pads.some((p) => p.pageNextP)) cycleUtility(1);
  else if (pads.some((p) => p.pagePrevP)) cycleUtility(-1);

  // While a utility button is highlighted, A presses go to it, not the grid.
  if (utilityIdx >= 0) {
    if (pads.some((p) => p.confirmP)) {
      const el = els[UTILITY_IDS[utilityIdx]];
      utilityIdx = -1;
      setMenuHighlight(null);
      el.click();
      return;
    }
    if (pads.some((p) => p.backP)) utilityIdx = -1;
    syncMenuHighlight();
    updatePickerCursorClasses();
    return;
  }

  // `pads` is indexed by SEAT (input.js), so `pads[i]` is player i+1's own pad
  // and a seat with no pad connected right now is a blank snapshot rather than
  // a gap that shifts everyone along.
  for (let i = 0; i < Math.min(4, pads.length, state.playerCount); i++) {
    const playerId = i + 1;
    const pad = pads[i];
    const repeat = pickerRepeat[i];

    // Ready players stop steering the grid. A starts the match (once everyone
    // is ready); B releases their pick so they can browse again.
    // Locked in. B releases the pick, A starts the match — and in a
    // one-player match the directions keep working, choosing the opponent
    // (steeredSlot) rather than doing nothing.
    if (state.ready[playerId]) {
      if (pad.backP) { repeat.dir = null; unready(playerId); continue; }
      if (pad.confirmP) { repeat.dir = null; tryStart(); continue; }
      const slot = steeredSlot(playerId);
      if (slot === playerId) { repeat.dir = null; continue; }
      steerPad(slot, pad, repeat, dt);
      continue;
    }

    steerPad(playerId, pad, repeat, dt);
    if (pad.confirmP) {
      selectFighter(playerId, pickerCursor[playerId] || state.selection[playerId]);
    }
  }
  syncMenuHighlight();
  updatePickerCursorClasses();
}

export function clearMenuFocus() {
  if (focusEl) focusEl.classList.remove("pad-focus");
  focusEl = null;
  navRepeat.dir = null;
  for (const repeat of pickerRepeat) repeat.dir = null;
  utilityIdx = -1;
  if (menuHighlightEl) menuHighlightEl.classList.remove("pad-focus");
  menuHighlightEl = null;
}

function moveFocus(dx, dy) {
  const items = menuFocusables();
  if (!items.length) return;
  if (!focusEl || !items.includes(focusEl)) {
    setFocus(defaultFocus());
    return;
  }

  // sliders consume left/right to adjust their value
  if (focusEl.tagName === "INPUT" && dy === 0) {
    focusEl.value = clamp(Number(focusEl.value) + dx * 5, Number(focusEl.min), Number(focusEl.max));
    focusEl.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  const from = focusEl.getBoundingClientRect();
  const fx = from.left + from.width / 2;
  const fy = from.top + from.height / 2;
  let best = null;
  let bestScore = Infinity;
  for (const el of items) {
    if (el === focusEl) continue;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const alongX = (cx - fx) * dx;
    const alongY = (cy - fy) * dy;
    const along = dx !== 0 ? alongX : alongY;
    const ortho = dx !== 0 ? Math.abs(cy - fy) : Math.abs(cx - fx);
    if (along < 4) continue; // must lie in the pressed direction
    const score = along + ortho * 2.6;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (best) {
    setFocus(best);
  } else if (dx !== 0) {
    // end of a grid row: fall through to the next/previous item in reading order
    const idx = items.indexOf(focusEl);
    const next = items[idx + dx];
    if (next) setFocus(next);
  }
}

function activateFocus() {
  if (!focusEl || !menuFocusables().includes(focusEl)) {
    setFocus(defaultFocus());
    return;
  }
  if (focusEl.tagName === "INPUT") return; // sliders adjust with left/right
  // On the fighter grid, a confirm from a player who is already locked in is
  // the "second press": it starts the match instead of re-picking.
  if (state.phase === "menu" && focusEl.classList.contains("char-card") && state.ready[state.activePicker]) {
    tryStart();
    return;
  }
  focusEl.click();
}

function menuBack() {
  if (modeMenuOpen) { closeModeMenu(); playSfx("uiBack"); return; }
  const target = BACK_TARGET[state.phase]?.();
  if (target) target.click();
}

// Called every frame by the main loop while a menu phase is active.
export function updateMenuNav(dt) {
  if (rouletteRunning) return; // the draw owns the arena screen until it lands
  // The VS splash goes up before the match does, and can sit over the stage
  // screen while that match's art streams in. Whatever is underneath it has
  // stopped being the screen the player is on.
  if (battleIntroVisible()) return;
  // The title splash has one control: any button begins. A pad player is
  // sitting down to play, so this path takes the screen — main.js handles the
  // Start button itself the same way.
  if (state.phase === "title") {
    const pads = padsMenuStates();
    // LB/RB reach the corner buttons here as they do on the select screen —
    // otherwise a pad-only player has no way to mute the one screen that
    // starts playing music at them unasked. Nothing is highlighted to begin
    // with, so a blind press of A still just starts the game.
    if (pads.some((p) => p.pageNextP)) cycleUtility(1, CORNER_IDS.length);
    else if (pads.some((p) => p.pagePrevP)) cycleUtility(-1, CORNER_IDS.length);
    if (utilityIdx >= 0) {
      if (pads.some((p) => p.confirmP)) {
        const el = els[CORNER_IDS[utilityIdx]];
        utilityIdx = -1;
        setMenuHighlight(null);
        el.click();
        return;
      }
      if (pads.some((p) => p.backP)) utilityIdx = -1;
      syncMenuHighlight();
      return;
    }
    setMenuHighlight(null);
    if (pads.some((p) => p.confirmP) || padsMenuState().confirmP) leaveTitle({ fullscreen: true });
    return;
  }
  // An open mode picker takes the pad off the roster: directions walk its
  // options, A chooses one, B closes it. Without this the picker path below
  // would keep steering fighter cursors behind the menu.
  if (state.phase === "menu" && padsMenuStates().length && !modeMenuOpen) {
    updateCharacterPickerPads(dt);
    return;
  }
  const pad = padsMenuState();

  let dx = 0;
  let dy = 0;
  if (pad.left) dx = -1;
  else if (pad.right) dx = 1;
  else if (pad.up) dy = -1;
  else if (pad.down) dy = 1;

  const dirKey = dx !== 0 ? `x${dx}` : dy !== 0 ? `y${dy}` : null;
  if (dirKey) {
    if (navRepeat.dir !== dirKey) {
      navRepeat.dir = dirKey;
      navRepeat.t = 0.34; // initial repeat delay
      moveFocus(dx, dy);
    } else {
      navRepeat.t -= dt;
      if (navRepeat.t <= 0) {
        navRepeat.t = 0.13;
        moveFocus(dx, dy);
      }
    }
  } else {
    navRepeat.dir = null;
  }

  if (pad.confirmP) activateFocus();
  if (pad.backP) menuBack();
  if (pad.altP && state.phase === "menu" && focusEl?.dataset?.character) {
    state.selection[2] = focusEl.dataset.character;
    updateSelectionUi();
    playSfx("uiSelect");
  }
  if (state.phase === "moves") {
    if (pad.pagePrevP) els.movesPrevButton.click();
    if (pad.pageNextP) els.movesNextButton.click();
  }
}

function bindMenuKeyboardNav() {
  // M mutes from anywhere, including mid-match, where the menu handler below
  // deliberately stays out of the way.
  window.addEventListener("keydown", (e) => {
    if ((e.code || e.key) !== "KeyM" || state.phase === "loading") return;
    e.preventDefault();
    els.muteButton.click();
  });

  window.addEventListener("keydown", (e) => {
    // The title splash, before anything else: Enter or Space begins, and it
    // counts as sitting down to play, so it takes the screen. A keydown IS a
    // user gesture, so unlike the pad path this fullscreen request is granted.
    if (state.phase === "title") {
      const key = e.code || e.key;
      // …unless the player has tabbed to one of the corner buttons, in which
      // case Enter belongs to the thing they are pointing at. Without this,
      // tabbing to Mute and pressing Enter started the match instead.
      if (document.activeElement?.closest(".utility-actions")) return;
      if (["Enter", "Return", "NumpadEnter", "Space"].includes(key)) {
        e.preventDefault();
        leaveTitle({ fullscreen: true });
      }
      return;
    }
    if (state.phase === "playing" || state.phase === "loading" || rouletteRunning) return;
    const map = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const code = e.code || e.key;
    if (map[code]) {
      e.preventDefault();
      moveFocus(...map[code]);
    } else if (code === "Enter" || code === "Return" || code === "NumpadEnter") {
      e.preventDefault();
      activateFocus();
    } else if (code === "Backspace") {
      e.preventDefault();
      if (modeMenuOpen) closeModeMenu();
      else if (state.phase === "menu") unready(state.activePicker);
      else menuBack();
    } else if (code === "Escape" && modeMenuOpen) {
      // Escape is the pause key in a match; on the select screen the only thing
      // it can dismiss is the mode picker.
      e.preventDefault();
      closeModeMenu();
    }
  });
  // real mouse use hides the pad cursor until the pad speaks again
  // (ignore sub-pixel jitter so a nudged desk doesn't eat a controller input)
  let lastMouse = null;
  window.addEventListener("mousemove", (e) => {
    if (lastMouse && Math.hypot(e.clientX - lastMouse.x, e.clientY - lastMouse.y) > 8) clearMenuFocus();
    lastMouse = { x: e.clientX, y: e.clientY };
  }, { passive: true });
}
