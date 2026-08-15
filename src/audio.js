// SFX + music. New Audio element per one-shot (matches v1), with pitch jitter.
//
// Music has two layers: menu screens play one fixed track quietly, and a match
// plays its stage's own track where one exists, falling back to a random pick
// from the originals. Which files exist is declared in config_music.js.

import { STAGES } from "./stages.js";
import {
  BOARD_MUSIC_DIR, BOARD_TRACKS, FALLBACK_TRACKS, MENU_TRACK, MUSIC_DIR, MUSIC_EXT,
  MUSIC_MODES as MUSIC_MODE_CONFIG, TITLE_TRACK, UNUSED_BOARD_TRACKS,
} from "./config_music.js";
import {
  AUDIO_MIX, MAX_VOICES, MOVE_CALL, SFX, SFX_ALIASES, SFX_DIR,
  SPOKEN_LINES, SPOKEN_TIMING,
} from "./config_audio.js";
import { CHARACTERS } from "./characters.js";
import { state } from "./state.js";

// Asset URLs are resolved against THIS MODULE rather than the document, the
// same rule (and for the same reason) as src/assets.js: a page served from a
// subdirectory — the audio workbench at /workbench/, say — must fetch the files
// the GAME uses rather than look for them beside itself. Document-relative
// paths worked only because every page that made a sound happened to be the
// one at the root, which is a coincidence rather than a design.
const ASSET_BASE = new URL("../", import.meta.url);

// Resolve a name through the alias table, so pre-round-8 call sites keep
// working while they are migrated.
function entryFor(name) {
  return SFX[name] || SFX[SFX_ALIASES[name]] || null;
}

// A sound may declare several interchangeable files (the voice groups); one is
// drawn per call so a repeated special never loops the identical sample.
/** The URL a sound file actually lives at, resolved the way the loader does.
 *  Exported for the audio workbench, which measures a take's real duration off
 *  the file before proposing it as a replacement. */
export function sfxUrl(file) {
  return new URL(SFX_DIR + file, ASSET_BASE).href;
}

function srcFor(entry) {
  const f = entry.file;
  const file = Array.isArray(f) ? f[Math.floor(Math.random() * f.length)] : f;
  return new URL(SFX_DIR + file, ASSET_BASE).href;
}

// Category trim x per-sound trim x the SFX slider x the master ceiling.
function gainFor(entry, intensity) {
  const cat = AUDIO_MIX.categories[entry.category] ?? 1;
  return Math.min(1, audioSettings.sfxVolume * AUDIO_MIX.master * cat * (entry.gain ?? 1) * intensity);
}

// Every fighter on the roster maps to a voice group. Before the round-8 sound
// pass nine of them mapped to nothing and were silent when they attacked.
// Exported for the audio workbench (/workbench/?edit=audio), which shows a
// fighter's whole voice — their grunt trio and KO cry as well as their lines.
export const GRUNT_GROUPS = {
  gojo: "gruntYoungMale", yuji: "gruntYoungMale", megumi: "gruntYoungMale",
  yuta: "gruntYoungMale", inumaki: "gruntYoungMale",
  nanami: "gruntAdultMale", toji: "gruntAdultMale", geto: "gruntAdultMale",
  reggie: "gruntAdultMale",
  maki: "gruntFemale", momo: "gruntFemale", nobara: "gruntFemale",
  meimei: "gruntFemale", uro: "gruntFemale",
  jogo: "gruntMonster", hanami: "gruntMonster",
  panda: "gruntAnimal",
  // Mahito is shaped like a young man and sounds like one; the animal group is
  // for the thing that is actually an animal. He was in it because he is a
  // curse, which is a fact about what he IS rather than about what he sounds
  // like — and it is the second that a voice group is choosing.
  mahito: "gruntYoungMale",
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
export const KO_FOR_GROUP = {
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
const trackUrl = (dir, file) => new URL(encodeURI(`${dir}${file}${MUSIC_EXT}`), ASSET_BASE).href;
const MENU_SRC = trackUrl(MUSIC_DIR, MENU_TRACK.file);
// The title screen's own track. A battle track, played at battle volume — see
// TITLE_TRACK in config_music.js for why it is not simply the menu track.
const TITLE_SRC = trackUrl(MUSIC_DIR, TITLE_TRACK.file);
const FALLBACK_SRCS = FALLBACK_TRACKS.map((t) => trackUrl(MUSIC_DIR, t.file));
const BOARD_TRACK_SET = new Set(BOARD_TRACKS);

// Menu screens share one track; "playing" gets the battle track; loading and
// pause stay silent (pause holds the match track rather than switching away).
const MENU_PHASES = new Set(["menu", "stageSelect", "moves", "settings", "roundOver"]);

// Screens that can be opened FROM a live match without leaving it. Reached that
// way they behave like pause — the element stops where it is and the battle
// track is left loaded — rather than swapping in the menu track, which would
// restart the fight's music from 0:00 the moment the player closed the screen
// again. Reached from the menu they are ordinary menu screens, hence the
// `matchLive` test rather than a phase name alone.
const MATCH_HOLD_PHASES = new Set(["paused", "settings", "moves"]);
let matchLive = false;

/** Told by the match lifecycle (main.js) whether a fight is currently on the
 *  stage, so the screens above know which of their two meanings applies. */
export function setMatchLive(live) {
  matchLive = live;
}

// The same question for the title splash, which now has the corner menus on it:
// Settings and the move list can be opened from the title as well as from a
// live match, and in both cases they are a screen laid OVER something with its
// own music rather than a place of their own. Without this, ducking into
// Settings from the title cut Iron vs Bone to the menu track and coming back
// restarted it from zero.
let titleLive = false;

export function setTitleLive(live) {
  titleLive = live;
}

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

// A MOVE_CALL row is matched against a move's `name` by string. A name with a
// typo — or a straight quote where the kit uses a curly one — would simply
// never match, and the symptom is a line that was recorded, registered and
// silent. Same reasoning as the music check above: say so at load.
function validateMoveCalls() {
  for (const [charKey, moves] of Object.entries(MOVE_CALL)) {
    const char = CHARACTERS[charKey];
    if (!char) {
      console.warn(`config_audio.js MOVE_CALL names no such fighter: ${charKey}`);
      continue;
    }
    const known = new Set([
      ...Object.values(char.specials || {}).map((s) => s.name),
      char.ultimate?.name,
      ...(char.domains || []).map((d) => d.name),
    ]);
    const unmatched = Object.keys(moves).filter((name) => !known.has(name));
    if (unmatched.length) {
      console.warn(
        `config_audio.js MOVE_CALL.${charKey} names no such move (typo?): ${unmatched.join(", ")}`
      );
    }
    const unregistered = Object.values(moves).filter((key) => !SFX[key]);
    if (unregistered.length) {
      console.warn(
        `config_audio.js MOVE_CALL.${charKey} names unregistered sounds: ${unregistered.join(", ")}`
      );
    }
  }
}
validateMoveCalls();

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
}

// Autoplay policy: nothing may sound until the page has had a genuine user
// gesture. `unlocked` gates every path below, and the moment it flips the
// current phase's music is asked for again — the menu track is requested during
// boot, long before any gesture exists, so without that re-ask the title screen
// stays silent until some later phase change happens to call syncMusic.
function unlock() {
  if (unlocked) return;
  unlocked = true;
  window.removeEventListener("pointerdown", unlock);
  window.removeEventListener("keydown", unlock);
  syncMusic(state.phase);
}

window.addEventListener("pointerdown", unlock);
window.addEventListener("keydown", unlock);

/** A gamepad button press is a user gesture the browser does not report as one:
 *  it fires no pointer and no key event, so a player who only ever touches a
 *  controller never satisfies the listeners above and the game stays silent for
 *  the whole session. The input layer calls this the first time any pad button
 *  goes down, which is the gesture in every sense that matters. */
export function noteGamepadGesture() {
  unlock();
}

/** Whether a gesture has already bought the page the right to make noise.
 *  The title screen asks, because it is the one screen whose whole job is to
 *  be heard: if the answer is no it spends the player's first press waking the
 *  cabinet instead of starting the game (see leaveTitle in ui.js). */
export function audioUnlocked() {
  return unlocked;
}

/** Whether the music is audibly playing RIGHT NOW. The honest test of whether
 *  the cabinet is already awake: some browsers (and most headless ones) permit
 *  autoplay outright, and on those there is nothing for a wake-up press to
 *  turn on — asking for one would be friction bought with nothing. */
export function musicPlaying() {
  return !!musicEl && !musicEl.paused && !musicEl.muted && musicEl.volume > 0;
}

// ------------------------------------------------------------ tab visibility
//
// A hidden tab makes no sound. Everything already playing is stopped rather
// than left running quietly, because the one-shots outlive the frame that
// started them and a domain or a KO cry would otherwise ring on into whatever
// the player switched to.
let suspended = false;

export function setAudioSuspended(on) {
  if (suspended === on) return;
  suspended = on;
  if (on) {
    musicEl?.pause();
    for (const name of [...loops.keys()]) stopLoop(name);
    for (const el of active) el.pause();
    active.clear();
  } else {
    syncMusic(state.phase);
  }
}

export function audioSuspended() {
  return suspended;
}

/** Returns the element playing it, or null — a caller that may need to CUT the
 *  sound short keeps the handle; everyone else ignores the return value. */
export function playSfx(name, intensity = 1, rate = 0) {
  return playSfxEntry(entryFor(name), intensity, rate);
}

/**
 * Play a sound described by a registry-shaped entry rather than by name.
 *
 * The game always knows the name; the audio workbench does not — it auditions
 * ALTERNATE takes (config_audio.js `SFX_ALTERNATES`), which are files with no
 * registry key because the game never plays them. Routing them through here
 * rather than through a bare Audio element is the point: an alternate is judged
 * at the level its category and gain would give it in a match, which is the
 * comparison that decides whether to promote it.
 */
export function playSfxEntry(entry, intensity = 1, rate = 0) {
  if (!unlocked || suspended || audioSettings.muted || !state.sfxEnabled || audioSettings.sfxVolume <= 0) return null;
  if (!entry) return null; // an undelivered sound is silence, not an error
  if (active.size > MAX_VOICES) return null; // safety valve
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
  return el;
}

/**
 * Cut a one-shot off mid-way — a fighter hit in the middle of a spoken line.
 *
 * Faded over 60 ms rather than paused outright: stopping a voice dead on a
 * vowel clicks, and the point is that the sentence was cut off, not that the
 * game stopped playing a file. Short enough to still read as an interruption.
 */
export function cutSfx(el) {
  if (!el || el.paused) return;
  const step = el.volume / 6;
  const fade = setInterval(() => {
    el.volume = Math.max(0, el.volume - step);
    if (el.volume <= 0.001) {
      clearInterval(fade);
      el.pause();
      active.delete(el);
    }
  }, 10);
}

/** The sound of a line being cut off: the fighter's own voice, well under the
 *  effort grunt they would have made, so it reads as being winded rather than
 *  as a second attack. */
export function playCutGrunt(charKey) {
  const group = GRUNT_GROUPS[charKey];
  if (group) playSfx(group, 0.45, 1.12);
}

// The effort noise a fighter makes using a move — unless that move is one they
// have a LINE for, in which case they say it instead. `moveName` is the move's
// own `name` from characters.js; callers pass the one they already have and
// nothing else changes for the 26 fighters with no lines.
//
// Instead of, never as well as: a delivered line doubling with a wordless
// shout is the failure this replaces rather than layers on, the same rule the
// domain call-outs set.
export function playGrunt(charKey, moveName) {
  const call = moveCallFor(charKey, moveName);
  if (call) return playSfx(call, 1);
  const group = GRUNT_GROUPS[charKey];
  return group ? playSfx(group, 0.9) : null;
}

/** The spoken line for a move, or null. Exported because the move itself has
 *  to know whether it is introduced by one before it decides when to land. */
export function moveCallFor(charKey, moveName) {
  return (moveName && MOVE_CALL[charKey]?.[moveName]) || null;
}

/**
 * How long a move waits, in seconds, while its line is spoken — 0 for a move
 * with no line, which is every move in the game bar twelve.
 *
 * Read from SPOKEN_LINES rather than from the audio (see the note there): this
 * has to return the same number whether or not the sound is on.
 */
export function spokenLead(call) {
  const length = call && SPOKEN_LINES[call];
  if (!length) return 0;
  const { fraction, min, max } = SPOKEN_TIMING;
  return Math.min(max, Math.max(min, length * fraction));
}

/**
 * How long a spoken move can still be knocked out of the fighter saying it,
 * in seconds from the start of the line — the first `SPOKEN_TIMING.commit` of
 * the line, and never longer than the wind-up it guards (a clamped lead, like
 * Gojo's, would otherwise commit after the move had already gone off).
 */
export function spokenCommitAt(call) {
  const length = call && SPOKEN_LINES[call];
  if (!length) return 0;
  return Math.min(spokenLead(call), length * SPOKEN_TIMING.commit);
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
  if (!unlocked || suspended || audioSettings.muted || !state.sfxEnabled || audioSettings.sfxVolume <= 0) return;
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

// The bed inside an open domain. Owned by the domain entity (domains.js):
// started when the barrier goes up, stopped when it comes down — including
// the paths where it comes down early (the owner died or was knocked out of
// the stage), which is why this is stop-on-close rather than refcounted like
// the fire loop.
export function startDomainLoop() { startLoop("domainInterior"); }
export function stopDomainLoop() { stopLoop("domainInterior"); }

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
  // A hidden tab is silent whatever the phase says; the phase is re-applied
  // when the page comes back (setAudioSuspended below).
  if (suspended) { musicEl.pause(); return; }
  // Paused, or on a screen opened from inside a live match: hold the battle
  // track exactly where it is. `src` stays what is already loaded so the
  // element is only paused, never re-sourced.
  const hold = MATCH_HOLD_PHASES.has(phase) && (matchLive || titleLive);
  const menu = !hold && MENU_PHASES.has(phase);
  // The title screen is deliberately NOT a menu phase: it takes its own track
  // and skips MENU_TRACK.volumeScale below, so the splash opens at full
  // battle volume and pressing start drops into the quieter menu mix.
  const title = !hold && phase === "title";
  const src = hold ? null
    : phase === "playing" ? battleSrc
    : title ? TITLE_SRC
    : menu ? MENU_SRC
    : null;
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
