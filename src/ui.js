import { state } from "./state.js";
import { CHARACTER_KEYS, CHARACTERS, RANDOM_KEY, RESOLVED_GROUPS, randomCharacterKey } from "./characters.js";
import { STAGES, getStage } from "./stages.js";
import { audioSettings, cycleMusicMode, MUSIC_MODES, syncMusic, playSfx, toggleMute } from "./audio.js";
import { cpuLevelName } from "./ai.js";
import { METER_MAX } from "./constants.js";
import { clamp } from "./utils.js";
import { padsMenuState, padsMenuStates } from "./input.js";
import { setSpriteSet, previewCharacter, claimCharacter, loadProgress, onLoadProgress } from "./assets.js";
import { RANDOM_GROUP, TEXT, USE_SIMPLE_CARDS } from "./config_menus.js";
import { domainDirsFor } from "./domains.js";
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
    "hud", "utilityActions", "menuOverlay", "stageOverlay", "movesOverlay", "roundOverlay", "pauseOverlay",
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
      `p${id}Meter`, `p${id}MeterLabel`, `p${id}Portrait`, `p${id}Team`,
    ]),
    "arenaSign", "arenaSignName", "vsModeButton", "vsModeLabel", "modeMenu", "modeNote",
    "movesPanel", "movesTitle", "movesKicker", "movesPrevButton", "movesNextButton", "movesBackButton",
    "movesModeButton",
    "randomStageButton", "stageBackButton", "roundKicker", "winnerText", "rematchButton", "menuButton",
    "resumeButton", "pauseResetButton", "pauseMenuButton",
    "settingsSfxButton", "settingsMusicButton", "settingsCpuButton", "settingsStocksButton", "settingsSpritesButton", "settingsBoardsButton", "musicVolumeRange", "musicVolumeLabel",
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
  set(els.startButton, TEXT.menu.startWaiting);
  set(els.loadStatus, TEXT.loading.title);
  set(els.randomStageButton, TEXT.stages.random);
  set(els.stageBackButton, TEXT.stages.back);
  set(els.movesPrevButton, TEXT.moves.prev);
  set(els.movesNextButton, TEXT.moves.next);
  set(els.movesBackButton, TEXT.moves.back);
  set(els.rematchButton, TEXT.roundOver.rematch);
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
  const logo = els.menuOverlay?.querySelector(".game-logo");
  if (logo) logo.alt = TEXT.menu.logoAlt;
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

function humanIds() {
  return PLAYER_IDS.slice(0, state.playerCount);
}

function allReady() {
  return humanIds().every((id) => state.ready[id]);
}

export function resetReady() {
  for (const id of PLAYER_IDS) state.ready[id] = false;
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
  }
}

// Commit a fighter for a slot. Humans lock in (ready); the CPU slot just takes
// the fighter and hands the shared cursor back to Player 1.
function selectFighter(id, key) {
  state.selection[id] = key;
  // Committed, so this fighter's art is definitely needed: start it now instead
  // of waiting for the background queue to reach them. Random resolves at match
  // start, so there is nothing to fetch for it yet.
  if (key !== RANDOM_KEY) claimCharacter(key);
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
  if (!allReady()) return;
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

/** The art the roster GRID draws, which is a different question: at tile size,
 *  cropped from the top, twenty-odd at once. `USE_SIMPLE_CARDS` picks between
 *  the two sets; see the note on it in config_menus.js. */
function rosterTileSrc(key) {
  return USE_SIMPLE_CARDS ? `assets/cards/simple/${key}_tile.jpg` : heroCardSrc(key);
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
  btn.addEventListener("click", () => selectFighter(state.activePicker, key));
  // Hovering previews the fighter in the active picker's hero card, the same
  // way the pad cursor does, without committing anything.
  btn.addEventListener("mouseenter", () => setPickerCursor(state.activePicker, key, { quiet: true }));
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

// Under this, the name plate starts losing characters, so the fitter treats the
// layout as too cramped and stacks another row to win the width back.
const MIN_CARD_WIDTH = 96;

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

  // Deeper layouts are wider-carded but taller, so walk from the shallowest and
  // keep going only while the cards are still too narrow to read.
  let fallback = null;
  let chosen = null;
  for (let rows = MIN_ROSTER_ROWS; rows <= MAX_ROSTER_ROWS && !chosen; rows++) {
    placeRosterBlocks(grid, rows);
    for (const aspect of ROSTER_ASPECTS) {
      grid.style.setProperty("--card-aspect", aspect);
      // scrollHeight > clientHeight means this depth overflows the menu at this
      // crop, so crop harder before giving up on it.
      if (els.menuOverlay.scrollHeight > els.menuOverlay.clientHeight) continue;
      const fit = { rows, aspect, width: grid.querySelector(".char-card").getBoundingClientRect().width };
      // The first depth that fits is the shortest one; keep it unless its cards
      // came out too small, in which case a deeper, wider layout is worth the
      // height — and if none of them fit either, this is still the best we have.
      if (!fallback || fit.width > fallback.width) fallback = fit;
      if (fit.width >= MIN_CARD_WIDTH) chosen = fit;
      break;
    }
  }
  chosen ??= fallback ?? { rows: MIN_ROSTER_ROWS, aspect: ROSTER_ASPECTS[ROSTER_ASPECTS.length - 1] };
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
  const tracks = [];
  const card = () => tracks.push("minmax(0, 1fr)");
  let col = 1;
  let block = null;
  let seen = 0;
  // Only BETWEEN blocks: no leading gap at the left edge of the roster.
  const gap = () => { if (tracks.length) { tracks.push("var(--group-gap)"); col += 1; } };

  for (const child of grid.children) {
    if (child.classList.contains("char-group-title")) {
      col += block ? block.width : 0;
      gap();
      block = { start: col, width: 0, size: Number(child.dataset.size) };
      block.width = Math.ceil(block.size / rows);
      for (let i = 0; i < block.width; i++) card();
      seen = 0;
      child.style.gridArea = `1 / ${block.start} / 2 / ${block.start + block.width}`;
      continue;
    }
    if (child.classList.contains("char-card--random")) {
      // No block of its own and no title: one card, as tall as the rest.
      col += block ? block.width : 0;
      gap();
      block = null;
      card();
      child.style.gridArea = `2 / ${col} / ${2 + rows} / ${col + 1}`;
      col += 1;
      continue;
    }
    const line = block.start + (seen % block.width);
    const row = 2 + Math.floor(seen / block.width);
    child.style.gridArea = `${row} / ${line} / ${row + 1} / ${line + 1}`;
    seen += 1;
  }
  grid.style.gridTemplateColumns = tracks.join(" ");
  grid.style.setProperty("--rows", String(rows));
}

function buildStageGrid() {
  els.stageGrid.innerHTML = "";
  for (const stage of STAGES) {
    const btn = document.createElement("button");
    btn.className = "stage-card";
    btn.innerHTML = `<img src="assets/backgrounds/${stage.bgFile}" alt="${stage.name}" loading="lazy"><span>${stage.name}</span>`;
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
const SWEEP_STEP = 0.055; // seconds per card on the fast first lap
const SETTLE_STEP = 0.26; // …and on the very last hop of the second
const LANDED_HOLD = 0.55; // beat on the winning card before the match loads

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
  playSfx("uiSelect");
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
    playSfx("uiSelect");
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
  els.settingsSpritesButton.addEventListener("click", () => {
    state.spriteSet = state.spriteSet === "alternate" ? "default" : "alternate";
    setSpriteSet(state.spriteSet);
    updateMenuButtons();
  });
  // Takes effect on the next match start; an in-progress match keeps the
  // gimmick it began with (initStageFx reads this in resetMatch).
  els.settingsSfxButton.addEventListener("click", () => {
    state.sfxEnabled = !state.sfxEnabled;
    updateMenuButtons();
    // Confirm audibly when switching back on; silence is its own confirmation.
    if (state.sfxEnabled) playSfx("uiSelect");
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

  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.querySelector(".arena-wrap").requestFullscreen?.();
  };
  els.fullscreenButton.addEventListener("click", fullscreen);

  els.muteButton.addEventListener("click", () => {
    // Silence first, repaint second: if anything ever threw while updating the
    // icon, the audio must already be muted rather than left running.
    const muted = toggleMute();
    syncMusic(state.phase);
    updateMuteButton();
    if (!muted) playSfx("uiSelect"); // audible confirmation that sound is back
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
  els.menuButton.addEventListener("click", () => callbacks.quitToMenu());
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

export function updateMenuButtons() {
  const label = MUSIC_MODES[audioSettings.musicMode].label;
  els.settingsMusicButton.textContent = TEXT.settings.music(label);
  els.settingsCpuButton.textContent = TEXT.settings.cpu(cpuLevelName(state.cpuLevel));
  els.settingsStocksButton.textContent = TEXT.settings.stocks(state.stocks);
  els.settingsSpritesButton.textContent = TEXT.settings.sprites(
    state.spriteSet === "alternate" ? TEXT.settings.spriteAlternate : TEXT.settings.spriteDefault
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

// What each slot's card should point at right now. Normally the selection
// itself, but once the CPU has drawn, its tag follows the drawn fighter rather
// than sitting on the Random card.
function shownKey(id) {
  const drawn = id === 2 && state.selection[id] === RANDOM_KEY ? state.cpuRoll : null;
  return drawn || state.selection[id];
}

export function updateSelectionUi() {
  syncCpuRoll();
  const visiblePlayers = pickedSlots();
  for (const btn of els.characterGrid.querySelectorAll(".char-card")) {
    const key = btn.dataset.character;
    for (const id of PLAYER_IDS) btn.classList.toggle(`is-p${id}`, visiblePlayers.includes(id) && key === shownKey(id));
    btn.querySelectorAll(".pick-tag").forEach((el) => el.remove());
    for (const id of visiblePlayers) {
      if (key !== shownKey(id)) continue;
      const tag = document.createElement("i");
      tag.className = `pick-tag pick-tag--p${id}`;
      tag.textContent = id === 2 && state.playerCount === 1 ? "CPU" : `P${id}`;
      btn.appendChild(tag);
    }
  }
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
  els.menuHint.textContent = go ? TEXT.menu.hintReady : TEXT.menu.hintPicking;
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
    if (key && key !== RANDOM_KEY) claimCharacter(key);
  }
  updateMenuButtons();
  updateSelectionUi();
}

// ------------------------------------------------------------------ phases

const OVERLAY_FOR_PHASE = {
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
  state.prevPhase = state.phase;
  state.phase = phase;
  for (const [ph, id] of Object.entries(OVERLAY_FOR_PHASE)) {
    if (id) els[id].classList.toggle("hidden", ph !== phase);
  }
  els.utilityActions.classList.toggle("hidden", phase === "loading");
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

export function setLoadProgress(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  els.loadBarFill.style.width = `${pct}%`;
  els.loadBar.setAttribute("aria-valuenow", String(pct));
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
          <p class="moves-player-keys"><strong>${TEXT.moves.yourKeys(p.id)}</strong> ${TEXT.moves.keyLines[p.id] || ""}</p>
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
    <p class="keyboard-hint">${TEXT.moves.keyboardHint}</p>
  `;
}

/** The button map, identical for every fighter and every player. */
function controllerGuide() {
  return `
    <div class="controller-guide">
      <svg class="xbox-controller" viewBox="0 0 660 300" role="img" aria-label="Xbox controller button map">
        <path class="controller-shell" d="M180 55C128 60 94 99 80 155L53 246c-8 28 25 43 43 21l69-81h330l69 81c18 22 51 7 43-21l-27-91c-14-56-48-95-100-100-48-5-66 14-110 14S228 50 180 55Z"/>
        <rect class="controller-bumper" x="145" y="38" width="100" height="26" rx="10"/><rect class="controller-bumper" x="415" y="38" width="100" height="26" rx="10"/>
        <text x="195" y="56">LB · ULTIMATE</text><text x="465" y="56">RB · ULTIMATE</text>
        <circle class="controller-stick" cx="205" cy="126" r="35"/><circle class="controller-stick-cap" cx="205" cy="126" r="21"/>
        <text class="controller-callout" x="205" y="184">MOVE · CROUCH · AIM</text>
        <g class="controller-dpad controller-dpad--domain"><rect x="270" y="168" width="62" height="22" rx="5"/><rect x="290" y="148" width="22" height="62" rx="5"/></g>
        <text class="controller-callout" x="301" y="228">D-PAD · DOMAIN</text>
        <circle class="controller-menu" cx="305" cy="104" r="10"/><circle class="controller-menu" cx="355" cy="104" r="10"/>
        <g class="controller-face">
          <circle class="button-y" cx="468" cy="102" r="20"/><text x="468" y="108">Y</text>
          <circle class="button-x" cx="428" cy="141" r="20"/><text x="428" y="147">X</text>
          <circle class="button-b" cx="508" cy="141" r="20"/><text x="508" y="147">B</text>
          <circle class="button-a" cx="468" cy="180" r="20"/><text x="468" y="186">A</text>
        </g>
        <text class="face-label" x="552" y="106">HEAVY</text><text class="face-label" x="368" y="146" text-anchor="end">LIGHT</text>
        <text class="face-label" x="552" y="146">SPECIAL</text><text class="face-label" x="552" y="186">JUMP</text>
        <text class="controller-trigger" x="113" y="27">LT · SHIELD / DODGE</text><text class="controller-trigger" x="547" y="27" text-anchor="end">RT · SHIELD / DODGE</text>
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
      <dt>${TEXT.moves.specialNeutral}</dt><dd><strong>${s.neutral.name}</strong> — ${s.neutral.desc}</dd>
      <dt>${TEXT.moves.specialSide}</dt><dd><strong>${s.side.name}</strong> — ${s.side.desc}</dd>
      <dt>${TEXT.moves.specialDown}</dt><dd><strong>${s.down.name}</strong> — ${s.down.desc}</dd>
      <dt>${TEXT.moves.ultimate}</dt><dd><strong>${c.ultimate.name}</strong> — ${c.ultimate.desc} <em>${TEXT.moves.ultimateNote}</em></dd>
    </dl>
    <div class="moves-section">${TEXT.moves.domainSectionTitle}</div>
    ${domainRows(c)}
  `;
}

/** Domain Expansion rows for the moves screen. Most fighters have none at all,
 *  and saying so explicitly is better than an empty section the player has to
 *  interpret.
 *
 *  Which arrows open which domain is asked of `domainDirsFor` rather than
 *  written here, because the answer depends on how many the fighter has: with
 *  one, every direction opens it; with two, the pad splits up/left and
 *  down/right. A screen that stated a fixed mapping would be wrong for one of
 *  those cases and there would be nothing to make it notice. */
function domainRows(c) {
  const list = c.domains || [];
  if (!list.length) return `<p class="moves-blurb moves-blurb--muted">${TEXT.moves.domainNone}</p>`;
  return `<dl class="moves-table">` + list.map((d, i) => `
      <dt>${TEXT.moves.domainInputAlt(
        domainDirsFor(i, list.length).map((d) => TEXT.moves.domainArrows[d]))}</dt>
      <dd>
        <strong>${d.name}</strong> — ${d.desc} <em>${TEXT.moves.domainNote}</em>
        <span class="domain-howto"><strong>${TEXT.moves.domainHowTo}</strong> ${d.howTo}</span>
      </dd>`).join("") + `</dl>`;
}

// -------------------------------------------------------------------- HUD

function damageColor(d) {
  const t = clamp(d / 160, 0, 1);
  const r = 255;
  const g = Math.round(255 - t * 190);
  const b = Math.round(255 - t * 230);
  return `rgb(${r},${g},${b})`;
}

export function updateHud() {
  els.hud.classList.toggle("hud--multiplayer", state.fighters.length > 2);
  // Five or more panels no longer fit at multiplayer size: portraits go and the
  // type shrinks so a Battle Royal still reads at a glance.
  els.hud.classList.toggle("hud--crowd", state.fighters.length > 4);
  const teamMatch = matchPlan().teams;
  for (const id of FIGHTER_IDS) {
    const f = state.fighters[id - 1];
    els[`p${id}Panel`].classList.toggle("hidden", !f);
    if (!f) continue;
    // Slots 1-4 also colour the select screen; every panel colours itself.
    if (id <= 4) document.documentElement.style.setProperty(`--p${id}-theme`, f.char.theme);
    els[`p${id}Panel`].style.setProperty("--panel-theme", f.char.theme);
    // In a team match the panels have to say which side each fighter is on;
    // eight names in a row are otherwise eight strangers.
    const side = teamMatch ? (f.team === HUMAN_TEAM ? TEXT.hud.playerSide : TEXT.hud.cpuSide) : "";
    els[`p${id}Team`].textContent = side;
    els[`p${id}Team`].classList.toggle("hidden", !side);
    els[`p${id}Panel`].classList.toggle("fighter-status--cpu-side", teamMatch && f.team !== HUMAN_TEAM);
    els[`p${id}Name`].textContent = f.char.name;
    els[`p${id}Portrait`].src = heroCardSrc(f.charKey);
    els[`p${id}Damage`].textContent = `${Math.round(f.damage)}%`;
    els[`p${id}Damage`].style.color = damageColor(f.damage);
    renderStocks(els[`p${id}Stocks`], f);
    renderMeter(els[`p${id}Meter`], els[`p${id}MeterLabel`], f);
  }
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
  const hasDomain = !!f.char.domains?.length;
  fillEl.parentElement.classList.toggle("meter--full", full);
  // A fighter with no domain has only one thing to spend the bar on, so they
  // are told that rather than offered a choice they cannot make.
  labelEl.textContent = !full ? ""
    : hasDomain ? TEXT.hud.superChoiceReady
    : TEXT.hud.ultimateReady;
}

/** `side` is set only in a team match, where the result belongs to a side
 *  rather than to whichever fighter happened to be left standing. */
export function showRoundOver(winner, loser, side = null) {
  els.roundKicker.textContent = TEXT.roundOver.kicker;
  els.winnerText.textContent = !winner ? TEXT.roundOver.draw
    : side ? TEXT.roundOver.teamWinner(side)
    : TEXT.roundOver.winner(winner.char.name);
  setPhase("roundOver");
}

export function updateControllerStatus(count) {
  els.controllerStatus.classList.toggle("hidden", count === 0);
  if (count > 0) {
    const joined = state.playerCount;
    const waiting = Math.max(0, Math.min(4, count) - joined);
    const who = joined === 1 ? TEXT.controllers.vsCpu : TEXT.controllers.joined(joined);
    els.controllerStatus.textContent = waiting
      ? TEXT.controllers.waiting(who)
      : TEXT.controllers.allJoined(who);
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
  const gridInert = state.phase === "menu" && state.ready[state.activePicker];
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
      setPickerCursor(state.activePicker, focusEl.dataset.character, { quiet: true });
    }
    focusEl.scrollIntoView({ block: "nearest", inline: "nearest" });
    playSfx("uiMove");
  }
}

function updatePickerCursorClasses() {
  // Cards, not the grid's direct children — those are the group sections, and
  // clearing them would leave a cursor ring on every card ever visited.
  for (const btn of els.characterGrid?.querySelectorAll(".char-card") || []) {
    for (const id of PLAYER_IDS) btn.classList.remove(`pad-focus-p${id}`);
  }
  for (const id of PLAYER_IDS.slice(0, state.playerCount)) {
    // a ready player's cursor disappears: their pick is committed
    if (state.ready[id]) continue;
    const key = pickerCursor[id];
    if (!key) continue;
    els.characterGrid.querySelector(`[data-character="${key}"]`)?.classList.add(`pad-focus-p${id}`);
  }
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
  // Looking at a fighter is a hint, not a commitment: they move to the head of
  // the background queue rather than starting a download of their own, so
  // sweeping across the roster cannot kick off twenty parallel loads.
  if (key !== RANDOM_KEY) previewCharacter(key);
  // Repaints the hero card too: the cursor drives the transient preview.
  updateSelectionUi();
  if (!quiet) playSfx("uiMove");
}

function movePickerCursor(playerId, dx, dy) {
  const items = [...els.characterGrid.querySelectorAll(".char-card")];
  if (!items.length) return;
  const currentKey = pickerCursor[playerId] || state.selection[playerId];
  const current = items.find((el) => el.dataset.character === currentKey) || items[0];
  const from = current.getBoundingClientRect();
  const fx = from.left + from.width / 2;
  const fy = from.top + from.height / 2;
  let best = null;
  let bestScore = Infinity;
  for (const el of items) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const along = dx !== 0 ? (cx - fx) * dx : (cy - fy) * dy;
    const ortho = dx !== 0 ? Math.abs(cy - fy) : Math.abs(cx - fx);
    if (along < 4) continue;
    const score = along + ortho * 2.6;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (!best && dx !== 0) {
    const index = items.indexOf(current);
    best = items[index + dx] || null;
  }
  if (best) setPickerCursor(playerId, best.dataset.character);
}

// LB/RB on the menu cycle a highlight through the utility buttons in the top
// right corner, then wrap back to the fighter grid (or the start button once
// everyone is locked in). A activates the highlighted button.
// The VS badge rides along with the corner menus so LB/RB reaches the mode
// picker too — a pad player never touches the mouse.
const UTILITY_IDS = ["movesButton", "muteButton", "settingsButton", "fullscreenButton", "vsModeButton"];
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
  else setMenuHighlight(allReady() ? els.startButton : null);
}

function cycleUtility(dir) {
  const n = UTILITY_IDS.length;
  utilityIdx = dir > 0
    ? (utilityIdx >= n - 1 ? -1 : utilityIdx + 1)
    : (utilityIdx < 0 ? n - 1 : utilityIdx - 1);
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
      playSfx("uiSelect");
      el.click();
      return;
    }
    if (pads.some((p) => p.backP)) utilityIdx = -1;
    syncMenuHighlight();
    updatePickerCursorClasses();
    return;
  }

  for (let i = 0; i < Math.min(4, pads.length, state.playerCount); i++) {
    const playerId = i + 1;
    const pad = pads[i];
    const repeat = pickerRepeat[i];

    // Ready players stop steering the grid. A starts the match (once everyone
    // is ready); B releases their pick so they can browse again.
    if (state.ready[playerId]) {
      repeat.dir = null;
      if (pad.backP) unready(playerId);
      else if (pad.confirmP) tryStart();
      continue;
    }

    // A slot with no cursor yet (fresh boot, or just backed out) parks on its
    // own pick, else on the first fighter in the grid.
    if (!pickerCursor[playerId]) pickerCursor[playerId] = state.selection[playerId] || CHARACTER_KEYS[0];
    let dx = 0, dy = 0;
    if (pad.left) dx = -1;
    else if (pad.right) dx = 1;
    else if (pad.up) dy = -1;
    else if (pad.down) dy = 1;
    const dirKey = dx !== 0 ? `x${dx}` : dy !== 0 ? `y${dy}` : null;
    if (dirKey) {
      if (repeat.dir !== dirKey) {
        repeat.dir = dirKey;
        repeat.t = 0.34;
        movePickerCursor(playerId, dx, dy);
      } else {
        repeat.t -= dt;
        if (repeat.t <= 0) { repeat.t = 0.13; movePickerCursor(playerId, dx, dy); }
      }
    } else repeat.dir = null;
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
  playSfx("uiSelect");
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
