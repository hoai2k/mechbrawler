// SFX + music. New Audio element per one-shot (matches v1), with pitch jitter.
//
// Music has two layers: menu screens play one fixed track quietly, and a match
// plays its stage's own track where one exists, falling back to a random pick
// from the originals. Which files exist is declared in config_music.js.

import { STAGES } from "./stages.js";
import {
  BOARD_MUSIC_DIR, BOARD_TRACKS, FALLBACK_TRACKS, MENU_TRACK, MUSIC_DIR, MUSIC_EXT,
  MUSIC_MODES as MUSIC_MODE_CONFIG, UNUSED_BOARD_TRACKS,
} from "./config_music.js";
import { AUDIO_MIX, MAX_VOICES, SFX, SFX_ALIASES, SFX_DIR } from "./config_audio.js";
import { state } from "./state.js";

// Resolve a name through the alias table, so pre-round-8 call sites keep
// working while they are migrated.
function entryFor(name) {
  return SFX[name] || SFX[SFX_ALIASES[name]] || null;
}

// A sound may declare several interchangeable files (the voice groups); one is
// drawn per call so a repeated special never loops the identical sample.
function srcFor(entry) {
  const f = entry.file;
  const file = Array.isArray(f) ? f[Math.floor(Math.random() * f.length)] : f;
  return SFX_DIR + file;
}

// Category trim x per-sound trim x the SFX slider x the master ceiling.
function gainFor(entry, intensity) {
  const cat = AUDIO_MIX.categories[entry.category] ?? 1;
  return Math.min(1, audioSettings.sfxVolume * AUDIO_MIX.master * cat * (entry.gain ?? 1) * intensity);
}

// Every fighter on the roster maps to a voice group. Before the round-8 sound
// pass nine of them mapped to nothing and were silent when they attacked.
const GRUNT_GROUPS = {
  gojo: "gruntYoungMale", yuji: "gruntYoungMale", megumi: "gruntYoungMale",
  yuta: "gruntYoungMale", inumaki: "gruntYoungMale",
  nanami: "gruntAdultMale", toji: "gruntAdultMale", geto: "gruntAdultMale",
  reggie: "gruntAdultMale",
  maki: "gruntFemale", momo: "gruntFemale", nobara: "gruntFemale",
  meimei: "gruntFemale", uro: "gruntFemale",
  jogo: "gruntMonster", hanami: "gruntMonster",
  panda: "gruntAnimal", mahito: "gruntAnimal",
  hakari: "gruntBig", todo: "gruntBig", sukuna: "gruntBig",
  choso: "gruntBig", gakuganji: "gruntBig",
  // Staged (round 15). Assigned now, from the groups that already exist, so a
  // promoted fighter is not mute for a round — an unlisted key is silence, and
  // silence is the one bug here nobody notices until somebody says "why does
  // Dagon not make a sound". Kokichi is a seventeen-year-old speaking through
  // a puppet, so he takes the young-male group like the other students.
  mechamaru: "gruntYoungMale", yuki: "gruntFemale",
  dagon: "gruntMonster", kurourushi: "gruntMonster",
};

// The KO cry that matches each voice group.
const KO_FOR_GROUP = {
  gruntYoungMale: "koYoungMale", gruntAdultMale: "koAdultMale",
  gruntBig: "koBig", gruntFemale: "koFemale",
  gruntMonster: "koMonster", gruntAnimal: "koAnimal",
};

export const audioSettings = {
  // Master mute from the toolbar. Independent of the volume sliders and of the
  // Sound Effects setting, so unmuting restores whatever was set rather than
  // resetting it.
  muted: false,
  musicVolume: AUDIO_MIX.musicVolume,
  sfxVolume: AUDIO_MIX.sfxVolume,
  musicMode: 0, // index into MUSIC_MODES below; 0 is per-stage music
};

// Filenames carry spaces, so every src is encoded before it reaches the element.
const trackUrl = (dir, file) => encodeURI(`${dir}${file}${MUSIC_EXT}`);
const MENU_SRC = trackUrl(MUSIC_DIR, MENU_TRACK.file);
const FALLBACK_SRCS = FALLBACK_TRACKS.map((t) => trackUrl(MUSIC_DIR, t.file));
const BOARD_TRACK_SET = new Set(BOARD_TRACKS);

// Menu screens share one track; "playing" gets the battle track; loading and
// pause stay silent (pause holds the match track rather than switching away).
const MENU_PHASES = new Set(["menu", "stageSelect", "moves", "settings", "roundOver"]);

// Default: the stage's own track. Random: anything in the library, board tracks
// and originals alike, drawn fresh per match. Off: silence everywhere.
export const MUSIC_MODES = MUSIC_MODE_CONFIG;

// Everything Random can land on.
const ALL_BATTLE_SRCS = [
  ...BOARD_TRACKS.map((name) => trackUrl(BOARD_MUSIC_DIR, name)),
  ...FALLBACK_SRCS,
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// A stage name in BOARD_TRACKS that matches no stage would silently never play,
// and a track file whose name has a typo looks exactly the same. Say so.
function validateMusicConfig() {
  const stageNames = new Set(STAGES.map((s) => s.name));
  const unmatched = BOARD_TRACKS.filter((name) => !stageNames.has(name));
  if (unmatched.length) {
    console.warn(
      `config_music.js BOARD_TRACKS names no such stage (typo?): ${unmatched.join(", ")}`
    );
  }
  const overlap = UNUSED_BOARD_TRACKS.filter((name) => stageNames.has(name));
  if (overlap.length) {
    console.warn(
      `config_music.js lists these as unused but they are real stages: ${overlap.join(", ")}`
    );
  }
}
validateMusicConfig();

let unlocked = false;
let musicEl = null;
let musicBaseVol = null; // what syncMusic last set, so the duck can restore it
let duckT = 0;
let duckFactor = 1;
let battleSrc = null;   // resolved once per match so it cannot re-roll mid-fight
let battleStageKey = null;
let currentSrc = null;
const loops = new Map(); // sfx key -> the Audio element holding that loop
const active = new Set();

export function initAudio() {
  musicEl = document.getElementById("musicTrack");
  applyMute();
  const unlock = () => {
    unlocked = true;
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

export function playSfx(name, intensity = 1, rate = 0) {
  if (!unlocked || audioSettings.muted || !state.sfxEnabled || audioSettings.sfxVolume <= 0) return;
  const entry = entryFor(name);
  if (!entry) return; // an undelivered sound is silence, not an error
  if (active.size > MAX_VOICES) return; // safety valve
  const el = new Audio(srcFor(entry));
  el.muted = audioSettings.muted;
  el.volume = gainFor(entry, intensity);
  el.playbackRate = rate || 0.96 + Math.random() * 0.08;
  active.add(el);
  const drop = () => active.delete(el);
  el.addEventListener("ended", drop);
  el.addEventListener("error", drop);
  setTimeout(drop, 6000); // stalled elements must not clog the voice cap
  el.play().catch(drop);
}

export function playGrunt(charKey) {
  const group = GRUNT_GROUPS[charKey];
  if (group) playSfx(group, 0.9);
}

// The defeat cry, chosen from the fighter's voice group.
export function playKoCry(charKey) {
  const ko = KO_FOR_GROUP[GRUNT_GROUPS[charKey]];
  if (ko) playSfx(ko, 1);
}

// A held sound, as opposed to the one-shots playSfx fires: at most one element
// per key, started when the thing it voices begins and stopped when it ends.
function startLoop(name) {
  if (loops.has(name)) return;
  if (!unlocked || audioSettings.muted || !state.sfxEnabled || audioSettings.sfxVolume <= 0) return;
  const entry = entryFor(name);
  if (!entry) return; // an undelivered loop is silence, same as a one-shot
  const el = new Audio(srcFor(entry));
  el.muted = audioSettings.muted;
  el.volume = gainFor(entry, 1);
  el.loop = true;
  loops.set(name, el);
  el.play().catch(() => { if (loops.get(name) === el) loops.delete(name); });
}

function stopLoop(name) {
  const el = loops.get(name);
  if (!el) return;
  el.pause();
  loops.delete(name);
}

export function startShieldLoop() { startLoop("shield"); }
export function stopShieldLoop() { stopLoop("shield"); }

// The fire bed under burn ticks and Furnace Shell. Nothing owns it: whatever is
// currently alight asks for it each frame, and it stops on the first frame
// nobody asks — so fighters catching fire and burning out need no bookkeeping,
// and two burning at once share one loop rather than stacking two.
let fireWanted = false;

export function noteFireBurning() {
  fireWanted = true;
}

// The battle track for a match, by mode: the stage's own track (falling back to
// a random original if that stage has none), anything in the library, or none.
function resolveBattleSrc(stageKey) {
  const mode = MUSIC_MODES[audioSettings.musicMode] || MUSIC_MODES[0];
  if (mode.key === "off") return null;
  if (mode.key === "random") return pick(ALL_BATTLE_SRCS);
  const stage = STAGES.find((s) => s.key === stageKey);
  if (stage && BOARD_TRACK_SET.has(stage.name)) return trackUrl(BOARD_MUSIC_DIR, stage.name);
  return pick(FALLBACK_SRCS);
}

// Called when a match starts. Re-rolls the fallback, so a rematch on a stage
// without its own track can come up with the other original.
export function setBattleStage(stageKey) {
  battleStageKey = stageKey;
  battleSrc = resolveBattleSrc(stageKey);
}

export function syncMusic(phase) {
  if (!musicEl) return;
  const menu = MENU_PHASES.has(phase);
  const src = phase === "playing" ? battleSrc : menu ? MENU_SRC : null;
  const off = (MUSIC_MODES[audioSettings.musicMode] || MUSIC_MODES[0]).key === "off";
  const volume = audioSettings.musicVolume * (menu ? MENU_TRACK.volumeScale : 1);

  musicEl.muted = audioSettings.muted;
  if (!src || off || audioSettings.muted || audioSettings.musicVolume <= 0) {
    musicEl.pause();
    return;
  }
  musicBaseVol = Math.min(1, volume);
  musicEl.volume = musicBaseVol;
  if (currentSrc !== src) {
    currentSrc = src;
    musicEl.src = src;
  }
  musicEl.loop = true;
  musicEl.play().catch(() => {});
}

// Toolbar mute. Silences everything already sounding as well as everything that
// follows: gating playSfx alone would leave a long cue (a domain, a KO cry)
// ringing on after the button was pressed, which reads as the button not
// working. Returns the new state so the caller can repaint its icon.
/** Drop the music to a fraction of its volume for a beat — Black Flash's
 *  near-silence — then restore. Frame-driven via stepAudio(). */
export function duckMusic(to = 0.2, seconds = 0.4) {
  duckT = Math.max(duckT, seconds);
  duckFactor = Math.min(duckFactor, to);
}

/** Called once per frame from the main loop; only touches the music element
 *  while a duck is live or just ended. */
export function stepAudio(dt) {
  // Before the music guard below: the fire bed has to stop even in a match with
  // no music playing.
  if (fireWanted) startLoop("fireBurnLoop");
  else stopLoop("fireBurnLoop");
  fireWanted = false;
  if (!musicEl || musicBaseVol == null) return;
  if (duckT > 0) {
    duckT -= dt;
    musicEl.volume = Math.min(1, musicBaseVol * duckFactor);
    if (duckT <= 0) {
      duckFactor = 1;
      musicEl.volume = musicBaseVol;
    }
  }
}

export function applyMute() {
  const muted = audioSettings.muted;
  if (musicEl) musicEl.muted = muted;
  for (const el of active) el.muted = muted;
  for (const el of loops.values()) el.muted = muted;
  // Held sounds are dropped rather than left running silently: whatever is
  // holding them re-asks every frame (the fire bed) or on its next state change
  // (the shield), so unmuting brings back only what is still true.
  if (muted) for (const name of [...loops.keys()]) stopLoop(name);
}

export function toggleMute() {
  audioSettings.muted = !audioSettings.muted;
  applyMute();
  return audioSettings.muted;
}

export function cycleMusicMode() {
  audioSettings.musicMode = (audioSettings.musicMode + 1) % MUSIC_MODES.length;
  // An explicit choice takes effect on the current match, not just the next one.
  battleSrc = resolveBattleSrc(battleStageKey);
  return MUSIC_MODES[audioSettings.musicMode].label;
}
