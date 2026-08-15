// Central mutable game state shared by every module.
import { DEFAULT_TIME_LIMIT } from "./constants.js";

export const state = {
  phase: "loading", // loading | title | menu | stageSelect | moves | playing | paused | roundOver | settings
  prevPhase: "menu",
  mode: "cpu",      // cpu | local
  playerCount: 1,   // human players; 1 means P1 versus CPU
  cpuLevel: 1,      // 0 easy, 1 normal, 2 hard
  // Chosen from the VS badge on the select screen (src/modes.js):
  // versus (free-for-all) | playersVsCpus (teams) | royal1 | royal2 (extra CPUs).
  matchMode: "versus",
  stocks: 3,
  // "Time limit" (Settings), in seconds; 0 is no limit. See TIME_OPTIONS.
  timeLimit: DEFAULT_TIME_LIMIT,
  // "Sound Effects" (Settings): the whole SFX bus. Off silences every one-shot
  // and the shield loop; music is a separate setting.
  sfxEnabled: true,
  // "Active Boards" (Settings): stage gimmicks — hazards, moving platforms,
  // surface/gravity modifiers (src/stage_fx.js). Off = every stage reverts to
  // its static v1 layout.
  activeBoards: true,
  // What each slot picked on the select screen. May be RANDOM_KEY, which
  // resolves to a different fighter every match. The CPU defaults to random.
  // P1 starts empty on purpose: the player picks their own fighter rather than
  // inheriting one. The other slots keep defaults so a 1P game is one click.
  selection: { 1: null, 2: "__random", 3: "megumi", 4: "nobara" },
  // Concrete fighter each slot is actually using this match, after RANDOM_KEY
  // has been resolved. This is what fighters are built from.
  roster: { 1: "gojo", 2: "sukuna", 3: "megumi", 4: "nobara" },
  // The CPU's random draw, rolled the moment the humans lock in so the select
  // screen can show who they are about to face. Cleared once a match consumes
  // it, so every rematch faces a fresh opponent.
  cpuRoll: null,
  // Per-player lock-in on the fighter select screen. A player who is ready has
  // committed a fighter; the match can start once every human slot is ready.
  ready: { 1: false, 2: false, 3: false, 4: false },
  activePicker: 1,
  stageKey: "trainingBridge",

  fighters: [],
  platforms: [],
  hitboxes: [],
  projectiles: [],
  entities: [],   // scripted ultimate/special objects with update/draw
  particles: [],
  popups: [],
  banners: [],

  camera: { x: 640, y: 360, zoom: 1, shake: 0, kick: 0 },
  slowMo: 0,
  screenFlash: null, // {color, life, maxLife}
  vignette: null,    // {color, alpha, life, maxLife} — Black Flash's dark beat
  domainOverlay: null, // {color, life, maxLife, ownerId, label}
  domain: null,        // the live Domain Expansion entity, or null (domains.js)
  // The fighter part-way through a Domain Expansion call-out, or null. The
  // barrier does not exist yet during that window, so this is what stops a
  // second domain starting inside the first one's sentence.
  domainCasting: null,

  matchTime: 0,
  // Seconds left on the match clock, counted down while the fight is live.
  // Meaningless when `timeLimit` is 0 — nothing reads it in that case.
  timeLeft: 0,
  // Set once the clock has run out on a tie and the play-off is running: the
  // clock stops, and the result screen says how the match was decided.
  suddenDeath: false,
  // How the match ended, for the result screen: "ko" | "time" | "suddenDeath".
  endReason: "ko",
  debugHitboxes: false,
  // Ad-hoc hit-test shapes registered by special/ultimate scripts while the
  // overlay is on (combat.js debugShape); drawn and decayed by drawDebug.
  debugShapes: [],
  // Mirrors of main.js's round countdown / round end timers, written each sim
  // step. Read-only for everyone else; the 2.5D camera rig keys its intro
  // pull-out and final-blow framing off them.
  introT: 0,
  endT: 0,

  // Stage-wide physics modifiers, set per match by initStageFx (stage_fx.js).
  // gravityMul scales GRAVITY; frictionPow < 1 makes ground slick (the
  // per-character friction base is raised to this power).
  stageMods: { gravityMul: 1, frictionPow: 1 },
  // Telegraphed danger areas ({x, w, until, yMin?, yMax?}) advertised by stage
  // hazards so the CPU can step out of them (ai.js).
  hazardZones: [],
};
