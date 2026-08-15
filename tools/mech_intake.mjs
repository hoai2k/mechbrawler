// mech_intake — write render3d/assets/manifest.json from the mechs/ export.
//
//   node tools/mech_intake.mjs          # regenerate the manifest
//
// The portable mech export (mechs/, see mechs/PROVENANCE.md) delivers each
// fighter as a GLB whose animations are REAL glTF clips with Mech Mayhem's
// own names (walk, run, light1, clawSnap, …). render3d resolves animation by
// the 26-state contract's names (idle, sideHeavy, …), so every state needs to
// say which exported clip drives it. That mapping is per mech — viper's light
// is `viperSlash1`, rhino's is `light1` — but it is not hand-authored: this
// tool derives it from each mech's clip INVENTORY (mechs/<id>.json) against
// one preference table, bespoke names first, shared names as the fallback.
//
// Regenerate whenever mechs/ is re-exported. Hand edits to the manifest will
// be lost — put a preference change HERE, where it applies roster-wide and
// the diff shows exactly which mechs it moved.
//
// STATES WITH NO PERFECT SOURCE (the compromises, made once, here — K5,
// verified against the MM sources: jump/crouch are PROCEDURAL upstream, no
// clips exist anywhere):
//   idle    <- the mech's own heavy wind-up, FROZEN at its first frame
//              (freeze: 0). MM has no idle clip; the heavy's opening frame is
//              the battle carriage — same bespoke-first candidates as
//              sideHeavy, so every mech idles in ITS OWN stance. The breath
//              layer animates on top (render3d pose.js).
//   charge  <- the same heavy, frozen mid-wind-up (freeze: 0.35) — except
//              titanus/colossus, whose poundHold is a REAL hold loop and
//              stays unfrozen.
//   fall    <- landReach  the stretched pre-landing reach IS a falling pose.
//   jump    <- landReach, FROZEN at 0.02s (owner: MM clips only, no JJK pose
//              sets) — the clip's opening frame stands upright with the legs
//              gathered, which reads airborne-neutral; by 0.04s it tips into
//              the dive reach. Picked by eye off rendered frames. ball is
//              the DODGE tuck and never the jump.
//   crouch  <- land, frozen at 0.14s — the deepest moment of the touchdown
//              absorb (also picked by eye; the clip runs 0.63s and is
//              already rising by 0.3).
//   dodge   <- ball, written under the dodge_roll AND dodge_air keys:
//              render3d aliases the dodge state to those clip names
//              (states.js STATE_ALIASES), so a plain `dodge` key is dead.
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MECHS = join(ROOT, "mechs");
const OUT = join(ROOT, "render3d/assets/manifest.json");

// Real standing heights measured from the export geometry (game units are
// metres for these bodies). The relative ORDER is gameplay: saurion is the
// shortest thing on the roster and jerry towers over everyone.
const HEIGHT_M = {
  titanus: 7.35, vulcan: 6.51, viper: 5.90, rhino: 6.87, tempest: 6.22,
  fenrir: 6.18, colossus: 7.09, wraith: 6.09, inferno: 6.60, glacier: 6.94,
  cranky: 6.07, saurion: 5.41, frogger: 6.11, jerry: 8.14, nullbot: 7.69,
  konga: 6.52, tritone: 6.36,
};

// The heavy wind-up candidates, bespoke names first — shared by sideHeavy
// (played) and idle/charge (frozen frames of the same clip, see below).
const HEAVY_WINDUP = [
  "clawSnap", "kongaSlam", "tritoneToss", "fenrirSpike", "viperDrill",
  "tempestTornado", "wraithLasers", "jerryBarrage", "nullBackhand",
  "saurionBite", "poundSlam", "heavy",
];

// How far into the heavy wind-up the charge freeze sits, seconds.
const CHARGE_FREEZE_T = 0.35;

// Freeze times for the procedural-in-MM states, seconds into their source
// clips — picked by eye off rendered frames (see the compromises block).
const JUMP_FREEZE_T = 0.02;   // into landReach: upright, legs gathered
const CROUCH_FREEZE_T = 0.14; // into land: the deepest absorb

// state -> exported clip candidates, first present in that mech's GLB wins.
// Bespoke names lead so a mech with its own move animation always uses it.
// idle, charge, jump and crouch are handled after the loop — their frozen
// frames need the `freeze` key, not just a name. The dodge tuck is written
// under dodge_roll AND dodge_air: render3d resolves by CLIP name, and the
// dodge state aliases to dodge_roll (states.js STATE_ALIASES), so a plain
// `dodge` key would never be looked up.
const PREFER = {
  idle: HEAVY_WINDUP,
  walk: ["walk"],
  run: ["run"],
  dash: ["run"],
  fall: ["landReach"],
  land: ["land"],
  hurt: ["hitFlinch"],
  teeter: ["hitFlinch"],
  dizzy: ["hitFlinch"],
  crouchAttack: ["shootLow", "saurionClawL", "light3", "light1", "heavy"],
  shield: ["block"],
  ledge: ["hangGrab"],
  dodge_roll: ["ball"],
  dodge_air: ["ball"],
  prone: ["knockdown"],
  getup: ["getup"],
  win: ["victory"],
  light: [
    "viperSlash1", "saurionKick1", "jerryRakeR", "tritoneGore", "bigPunch1",
    "punchHold1", "light1", "heavy",
  ],
  airLight: ["flurry", "viperSlash2", "saurionKick2", "jerryRakeL", "light2", "light1", "heavy"],
  sideHeavy: HEAVY_WINDUP,
  upHeavy: ["tritoneToss", "viperStab", "heavy"],
  downHeavy: ["groundPound"],
  dashAttack: ["lunge", "pounceLeap", "chargeLean", "saurionClawR", "light3", "light1", "heavy"],
  dashAttackHeavy: ["lunge", "pounceLeap", "heavy"],
  specialNeutral: [
    "fistLaunch", "saurionQuillFan", "kongaLob", "tritoneBrace", "brace", "gatlingLoop",
    "vulcanSpray", "shootLoop", "shootLoopL", "shootL", "shootLow", "spray",
    "shoot", "castRaise",
  ],
  specialSide: [
    "viperWhirl", "pounceLeap", "lunge", "chargeLean", "grabReach",
    "castRaise", "shoot", "heavy",
  ],
  specialDown: ["castRaise", "burst", "daintyTap", "groundPound", "block"],
  ult: ["hurricaneSpin", "castRaise", "groundPound"],
  grabReach: ["grabReach", "light1", "heavy"],
  grabHold: ["liftHold", "block"],
  grabbed: ["launched"],
  throwFwd: ["throwHeave", "heavy"],
  throwBack: ["throwHeave", "heavy"],
  throwUp: ["throwHeave", "heavy"],
  throwDown: ["groundPound", "heavy"],
};

const index = JSON.parse(readFileSync(join(MECHS, "index.json"), "utf8"));
// index.json's `mechs` is an object keyed by id, each entry carrying its own
// clip-name inventory — no need to open the per-mech sidecars for this.
const ids = Object.keys(index.mechs).sort();
const characters = {};

for (const id of ids) {
  const have = new Set(index.mechs[id].clips || []);
  const clips = {};
  const missing = [];
  for (const [state, candidates] of Object.entries(PREFER)) {
    const hit = candidates.find((c) => have.has(c));
    if (hit) clips[state] = { glb: hit };
    else missing.push(state);
  }
  // K5 freeze frames. idle = the battle carriage: the first frame of the
  // mech's own heavy wind-up, held (breath animates on top in render3d).
  if (clips.idle) clips.idle.freeze = 0;
  // charge = mid-wind-up of the same heavy — unless this mech exported a real
  // hold loop (poundHold: titanus, colossus), which plays unfrozen.
  if (have.has("poundHold")) clips.charge = { glb: "poundHold" };
  else if (clips.sideHeavy) clips.charge = { glb: clips.sideHeavy.glb, freeze: CHARGE_FREEZE_T };
  else missing.push("charge");
  // jump/crouch are procedural in MM — no clip exists anywhere — and the
  // owner ruled out the JJK pose sets, so both are frozen frames of the
  // landing clips (times picked by eye; see the compromises block). Never
  // ball: the tuck is the dodge's.
  if (have.has("landReach")) clips.jump = { glb: "landReach", freeze: JUMP_FREEZE_T };
  else missing.push("jump");
  if (have.has("land")) clips.crouch = { glb: "land", freeze: CROUCH_FREEZE_T };
  else missing.push("crouch");
  if (missing.length) {
    console.warn(`${id}: no clip for ${missing.join(", ")} — state will use the default pose set`);
  }
  characters[id] = {
    // Loader resolves `assets/${model}` against the render3d root, so this
    // climbs out to the shared mechs/ directory — one copy of each GLB.
    model: `../../mechs/${id}.glb`,
    heightM: HEIGHT_M[id],
    approved: true,
    // The export folds the game transform in: +Z forward, feet at y=0.
    yawOffsetDeg: 0,
    clips,
  };
}

const manifest = {
  comment: "GENERATED by tools/mech_intake.mjs from the mechs/ export — do not hand-edit. clips.<state>.glb names the mech's OWN exported animation driving that state; clips.<state>.freeze holds it at that time in seconds (resolveClip in render3d/src/loader.js).",
  characters,
};
writeFileSync(OUT, JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote ${OUT}: ${ids.length} mechs`);
