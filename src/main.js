import { state } from "./state.js";
import { loadCoreAssets, startBackgroundLoad, ensureMatchAssets, matchAssetsPending } from "./assets.js";
import { initInput, readGamepads, endInputFrame, playerInput, keyPressed, consumeKey, anyPadPausePressed, connectedPadCount, joinedPlayerCount, blankInput } from "./input.js";
import { initAudio, playSfx, setBattleStage, syncMusic, stepAudio } from "./audio.js";
import { updateRumble } from "./rumble.js";
import { makeFighter, updateFighter } from "./fighter.js";
import { updateHitboxes, updateProjectiles } from "./combat.js";
import { updateParticles, banner } from "./particles.js";
import { updateCamera } from "./camera.js";
import { draw } from "./render.js";
import { getStage, spawnXs } from "./stages.js";
import { matchPlan, HUMAN_TEAM } from "./modes.js";
import { oneSideLeft } from "./teams.js";
import { TEXT } from "./config_menus.js";
import { initStageFx } from "./stage_fx.js";
import { RANDOM_KEY, randomCharacterKey } from "./characters.js";
import { makeAiState, aiInput, cpuDamageMul } from "./ai.js";
import { initUi, setPhase, setLoadProgress, updateHud, showRoundOver, updateMenuButtons, updateSelectionUi, updateControllerStatus, updateMenuNav, syncControllerPlayers, resetReady } from "./ui.js";
import { FIXED_DT, MAX_FIXED_STEPS, WORLD } from "./constants.js";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let previousTime = 0;
let accumulator = 0;
let introT = 0;
let endT = 0;

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(canvas.width / WORLD.w, 0, 0, canvas.height / WORLD.h, 0, 0);
}

function startMatch(stageKey) {
  state.stageKey = stageKey;
  return resetMatch();
}

// Slot 1/2 have keyboard maps; slot 3/4 need a connected gamepad to be human.
// A slot the mode added (`plan.cpuFrom` and up) is a CPU whatever is plugged in.
function isHumanSlot(id, plan) {
  if (id >= plan.cpuFrom) return false;
  if (state.playerCount === 1) return id === 1;
  if (id <= 2) return id <= state.playerCount;
  return id <= state.playerCount && connectedPadCount() >= id;
}

// Turn each slot's selection into the concrete fighter for this match. Random
// slots draw fresh every time, so a player on Random gets a new fighter each
// round. The CPU honours the roll already shown on the select screen, then
// clears it so the next round re-draws.
function resolveRoster(plan) {
  const taken = [];
  for (let id = 1; id <= plan.count; id++) {
    // Slots a match MODE added — the Battle Royal extras, the CPU team — were
    // never picked by anyone and are never shown, so they always draw fresh.
    const picked = id >= plan.cpuFrom ? null : state.selection[id];
    // An unpicked slot (P1 before anyone chooses) draws like Random rather than
    // building a fighter from nothing; readying normally guarantees a pick.
    if (picked && picked !== RANDOM_KEY) {
      state.roster[id] = picked;
      taken.push(picked);
      continue;
    }
    const shown = id === 2 && plan.cpuFrom > 2 && state.playerCount === 1 ? state.cpuRoll : null;
    // A mode's own CPUs steer clear of fighters already in the match, so a
    // Battle Royal is a brawl between four faces rather than four of one.
    state.roster[id] = shown || randomCharacterKey(id >= plan.cpuFrom ? taken : []);
    taken.push(state.roster[id]);
  }
  state.cpuRoll = null;
}

// Bumped by every match start. An await in the middle of resetMatch is a window
// in which the player can back out or start something else, and the stale call
// must not then seize the screen.
let matchToken = 0;

async function resetMatch() {
  const token = ++matchToken;
  // How many fighters, which slots are mode-added CPUs, and who is on whose
  // side — all of it from the match mode chosen on the select screen.
  const plan = matchPlan();
  const entrantCount = plan.count;
  // Resolved BEFORE the assets are gathered, because a Random slot only becomes
  // a concrete fighter here — and it re-rolls every rematch, so this is the
  // first point at which the match knows what art it needs.
  resolveRoster(plan);
  const entrants = Array.from({ length: entrantCount }, (_, i) => state.roster[i + 1]);

  if (matchAssetsPending(entrants, state.stageKey)) {
    setPhase("loading");
    await ensureMatchAssets(entrants, state.stageKey, setLoadProgress);
    if (token !== matchToken || state.phase !== "loading") return; // superseded
  }

  const stage = getStage(state.stageKey);
  // Pick this match's battle track before the phase flips to "playing".
  setBattleStage(stage.key);
  state.platforms = stage.platforms.map((p) => ({ ...p }));
  const groundY = state.platforms[0].y;

  const spawns = spawnXs(entrantCount);
  state.fighters = Array.from({ length: entrantCount }, (_, i) => {
    const id = i + 1;
    const x = spawns[i];
    const fighter = makeFighter(id, state.roster[id], x, x < WORLD.w / 2 ? 1 : -1);
    fighter.y = groundY;
    fighter.grounded = true;
    // Free-for-all gives every fighter a side of their own, so "teammate" only
    // means something in the modes that actually have teams.
    fighter.team = plan.teamOf(id);
    return fighter;
  });
  // Any entrant without a human control source is driven by the CPU.
  // Slots 1 and 2 always have keyboard maps; slots 3+ are gamepad-only, so
  // they fall back to AI unless a pad is connected for them. This keeps 3/4
  // player modes playable (and testable) instead of seating motionless dummies.
  for (const fighter of state.fighters) {
    if (isHumanSlot(fighter.id, plan)) continue;
    fighter.aiState = makeAiState();
    fighter.cpuDamageMul = cpuDamageMul(state.cpuLevel);
  }

  state.hitboxes.length = 0;
  state.projectiles.length = 0;
  state.entities.length = 0;
  state.particles.length = 0;
  state.popups.length = 0;
  state.banners.length = 0;
  state.domainOverlay = null;
  state.domain = null;
  state.screenFlash = null;
  state.slowMo = 0;
  state.matchTime = 0;
  state.camera.x = 640; state.camera.y = 360; state.camera.zoom = 1; state.camera.shake = 0; state.camera.kick = 0;

  // Stage identity (Active Boards): field modifiers + the gimmick entity.
  // After the arrays are cleared, so the fx entity survives the reset.
  initStageFx();

  introT = 1.6;
  endT = 0;
  banner("READY…", "#e8ecf8", { y: 300, size: 60, life: 1.0 });
  playSfx("countdownReady");
  setPhase("playing");
}

function quitToMenu() {
  resetReady();
  setPhase("menu");
  updateSelectionUi();
  updateMenuButtons();
}

function togglePause() {
  if (state.phase === "playing") setPhase("paused");
  else if (state.phase === "paused") setPhase("playing");
}

function updateSimulation(dt, held) {
  state.matchTime += dt;

  if (introT > 0) {
    const before = introT;
    introT -= dt;
    if (before > 0.6 && introT <= 0.6) {
      banner("GO!", "#ffd35a", { y: 300, size: 72, life: 0.6 });
      playSfx("countdownGo");
    }
    // fighters frozen during countdown
    for (const f of state.fighters) updateFighter(f, dt, (f.lastInput = blankInput()));
  } else {
    for (const f of state.fighters) {
      let input;
      if (f.aiState) input = aiInput(f);
      else input = held[f.id] || blankInput();
      if (f.dizzy > 0 || endT > 0) input = blankInput();
      // Summons update after the fighters and steer off their owner's stick,
      // so the input a fighter acted on this step is kept where they can read
      // it rather than threaded through every entity's update().
      f.lastInput = input;
      updateFighter(f, dt, input);
    }
  }

  updateHitboxes(dt);
  updateProjectiles(dt);

  for (let i = state.entities.length - 1; i >= 0; i--) {
    const e = state.entities[i];
    e.update(dt);
    if (e.dead) state.entities.splice(i, 1);
  }

  if (state.screenFlash) {
    state.screenFlash.life -= dt;
    if (state.screenFlash.life <= 0) state.screenFlash = null;
  }
  if (state.vignette) {
    state.vignette.life -= dt;
    if (state.vignette.life <= 0) state.vignette = null;
  }
  if (state.domainOverlay) {
    state.domainOverlay.life -= dt;
    if (state.domainOverlay.life <= 0) state.domainOverlay = null;
  }

  // round end
  if (endT > 0) {
    endT -= dt;
    if (endT <= 0) {
      const winner = state.fighters.find((f) => !f.dead);
      const loser = state.fighters.find((f) => f.dead);
      // A team match is won by a side, not by whoever happened to survive, so
      // the result screen is told which side that was.
      const side = !winner || !matchPlan().teams ? null
        : winner.team === HUMAN_TEAM ? TEXT.roundOver.players
        : TEXT.roundOver.cpus;
      showRoundOver(winner, loser, side);
    }
    return;
  }
  const alive = state.fighters.filter((f) => !f.dead);
  if (oneSideLeft(alive)) {
    endT = 1.4;
    banner("GAME!", "#ffffff", { y: 280, size: 80, life: 1.3 });
    playSfx("matchEnd");
    state.slowMo = Math.max(state.slowMo, 0.6);
  }
}

let lastFrameAt = 0;
let rafPending = false;

// Edge presses are latched here until a simulation step consumes them, so
// inputs are never dropped on stepless frames (high-refresh displays) nor
// double-consumed when one frame runs several steps.
const PLAYER_IDS = [1, 2, 3, 4];
const latched = Object.fromEntries(PLAYER_IDS.map((id) => [id, blankInput()]));

function latchInputs() {
  for (const id of PLAYER_IDS) {
    const now = playerInput(id);
    const l = latched[id];
    for (const k of Object.keys(now)) {
      l[k] = k.endsWith("P") ? l[k] || now[k] : now[k];
    }
    l.dirX = now.dirX;
  }
}

function clearLatchedEdges() {
  for (const id of PLAYER_IDS) {
    const l = latched[id];
    for (const k of Object.keys(l)) if (k.endsWith("P")) l[k] = false;
  }
}

function rafLoop(time) {
  rafPending = false;
  loop(time);
}

function loop(time) {
  lastFrameAt = performance.now();
  // Clamped at BOTH ends. The ceiling covers a stall; the floor covers the fact
  // that this loop has two callers whose clocks do not agree — the watchdog
  // below passes `performance.now()`, while rAF passes the vsync timestamp for
  // the START of the frame, which is a few ms EARLIER than the moment its
  // callback runs. A watchdog tick immediately followed by a real frame
  // therefore produced a negative dt, which ran the whole frame backwards:
  // shrinking ring particles past zero radius until drawParticles() threw an
  // IndexSizeError and took the rest of that frame's rendering with it.
  const dt = Math.max(0, Math.min((time - previousTime) / 1000, 1 / 30));
  previousTime = Math.max(previousTime, time);

  readGamepads();
  updateRumble(dt);
  stepAudio(dt);

  if (anyPadPausePressed()) {
    if (["playing", "paused"].includes(state.phase)) togglePause();
    else if (state.phase === "menu") document.getElementById("startButton").click();
    else if (state.phase === "stageSelect") document.getElementById("randomStageButton").click();
    else if (state.phase === "roundOver") document.getElementById("rematchButton").click();
  }
  if (keyPressed("Space") || keyPressed("Escape")) {
    if (["playing", "paused"].includes(state.phase)) togglePause();
    consumeKey("Space");
    consumeKey("Escape");
  }
  if (keyPressed("Backquote")) {
    state.debugHitboxes = !state.debugHitboxes;
    consumeKey("Backquote");
  }

  const padCount = connectedPadCount();
  syncControllerPlayers(joinedPlayerCount());
  updateControllerStatus(padCount);

  if (!["playing", "loading"].includes(state.phase)) {
    updateMenuNav(dt);
  }

  if (state.phase === "playing") {
    latchInputs();
    const simDt = state.slowMo > 0 ? dt * 0.45 : dt;
    state.slowMo = Math.max(0, state.slowMo - dt);
    accumulator = Math.min(accumulator + simDt, FIXED_DT * MAX_FIXED_STEPS);
    while (accumulator >= FIXED_DT) {
      updateSimulation(FIXED_DT, latched);
      clearLatchedEdges();
      accumulator -= FIXED_DT;
    }
    updateParticles(dt);
    updateCamera(dt);
    updateHud();
  }

  if (["playing", "paused", "roundOver"].includes(state.phase)) {
    draw(ctx);
  }

  endInputFrame();
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(rafLoop);
  }
}

async function init() {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  initInput();
  initAudio();
  initUi({ startMatch, resetMatch, quitToMenu, togglePause });
  setPhase("loading");
  try {
    await loadCoreAssets();
  } catch (err) {
    document.getElementById("loadStatus").textContent = `Asset load failed: ${err.message}`;
    return;
  }
  setPhase("menu");
  // The roster is ~450 MB of sprite art and a match uses at most four fighters,
  // so it streams in behind the menu instead of in front of it. Choosing a
  // fighter pulls them to the front of that queue (see ui.js), and startMatch
  // waits on whatever is still missing.
  startBackgroundLoad();
  previousTime = performance.now();
  lastFrameAt = previousTime;
  rafPending = true;
  requestAnimationFrame(rafLoop);
  // rAF can be throttled or suspended (background tabs, embedded webviews);
  // a watchdog keeps the simulation running whenever frames stop arriving.
  setInterval(() => {
    if (performance.now() - lastFrameAt > 28) loop(performance.now());
  }, 12);
}

init();
