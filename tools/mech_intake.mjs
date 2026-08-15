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
// STATES WITH NO PERFECT SOURCE (the compromises, made once, here):
//   idle    <- intro   MM has no idle clip (idling is procedural upstream);
//                      the intro's settle is the closest delivered stand.
//   fall    <- landReach  the stretched pre-landing reach IS a falling pose.
//   jump    <- ball    the air tuck; reads as the arcade rising somersault.
//   crouch  <- land    the touchdown absorb is the deepest delivered crouch.
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

// state -> exported clip candidates, first present in that mech's GLB wins.
// Bespoke names lead so a mech with its own move animation always uses it.
const PREFER = {
  idle: ["intro"],
  walk: ["walk"],
  run: ["run"],
  dash: ["run"],
  jump: ["ball"],
  fall: ["landReach"],
  land: ["land"],
  hurt: ["hitFlinch"],
  teeter: ["hitFlinch"],
  dizzy: ["hitFlinch"],
  crouch: ["land"],
  crouchAttack: ["shootLow", "saurionClawL", "light3", "light1", "heavy"],
  shield: ["block"],
  ledge: ["hangGrab"],
  dodge: ["ball"],
  prone: ["knockdown"],
  getup: ["getup"],
  win: ["victory"],
  light: [
    "viperSlash1", "saurionKick1", "jerryRakeR", "tritoneGore", "bigPunch1",
    "punchHold1", "light1", "heavy",
  ],
  airLight: ["flurry", "viperSlash2", "saurionKick2", "jerryRakeL", "light2", "light1", "heavy"],
  sideHeavy: [
    "clawSnap", "kongaSlam", "tritoneToss", "fenrirSpike", "viperDrill",
    "tempestTornado", "wraithLasers", "jerryBarrage", "nullBackhand",
    "saurionBite", "poundSlam", "heavy",
  ],
  upHeavy: ["tritoneToss", "viperStab", "heavy"],
  downHeavy: ["groundPound"],
  dashAttack: ["lunge", "pounceLeap", "chargeLean", "saurionClawR", "light3", "light1", "heavy"],
  dashAttackHeavy: ["lunge", "pounceLeap", "heavy"],
  charge: ["poundHold", "castRaise", "chargeLean", "block"],
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
  comment: "GENERATED by tools/mech_intake.mjs from the mechs/ export — do not hand-edit. clips.<state>.glb names the mech's OWN exported animation driving that state (resolveClip in render3d/src/loader.js).",
  characters,
};
writeFileSync(OUT, JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote ${OUT}: ${ids.length} mechs`);
