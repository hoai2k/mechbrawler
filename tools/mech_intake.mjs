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
// STATES WITH NO PERFECT SOURCE (the compromises, made once, here — K5;
// jump/crouch/hover upgraded by K8):
//   idle    <- battleIdle: K8 sampled MM's real ready/combat stance (the
//              animator's readyK carriage layer, with the idle breath/sway
//              alive in the clip) — retiring the K5 frozen-heavy-wind-up
//              stopgap. render3d's own breath layer still animates on top.
//   charge  <- the mech's own heavy wind-up, frozen mid-wind-up (freeze:
//              0.35, K5) — except
//              titanus/colossus, whose poundHold is a REAL hold loop and
//              stays unfrozen.
//   jump/fall/crouch <- jumpRise/jumpFall/crouch: K8 sampled Mech Mayhem's
//              PROCEDURAL animator layers (the airborne rising-tuck/
//              falling-spread + airReach, and the duck layer at each mech's
//              own duckDepth) into real 0.5s held clips in the export, so
//              the K5 freeze-frame stopgap (landReach@0.02 / land@0.14) is
//              retired. Each mech's personality is baked in — konga jumps
//              arms-up ready to grab, frogger squats to the floor. ball is
//              the DODGE tuck and never the jump.
//   hover   <- the MM jet-flight pose, exported alongside (K8): feet gathered
//              under the body, thrust down. This is the pose the JET BURN air
//              jump wants (fighter.js spends `airJumpsLeft` and flashes
//              `effect:jet_flame` under the mech — these are jets, not
//              flight). The key is written for every mech and the clip is in
//              every export; what it needs to become visible is TWO lines
//              this tool cannot write, in files it does not own:
//
//                render3d/src/states.js, in STATES, after `fall`:
//                  hover: { loop: true, duration: 0.4, tier: "library" },
//
//                src/fighter.js, where the air jump is spent (~line 1501,
//                beside the jet_flame flash): hold the state for the burn,
//                e.g. `setAnim(f, "hover"); f.hoverT = 0.22;` and let the
//                airborne branch (~line 1642) keep playing `hover` while
//                `f.hoverT > 0` before falling back to jump/fall.
//
//              Nothing else changes: the manifest already names the clip, and
//              the loader resolves a state to `clips.<state>.glb` by name.
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
// (played) and charge (a frozen frame of the same clip, see below).
const HEAVY_WINDUP = [
  "clawSnap", "kongaSlam", "tritoneToss", "fenrirSpike", "viperDrill",
  "tempestTornado", "wraithLasers", "jerryBarrage", "nullBackhand",
  "saurionBite", "poundSlam", "heavy",
];

// How far into the heavy wind-up the charge freeze sits, seconds.
const CHARGE_FREEZE_T = 0.35;

// state -> exported clip candidates, first present in that mech's GLB wins.
// Bespoke names lead so a mech with its own move animation always uses it.
// charge is handled after the loop — its frozen frame needs the `freeze`
// key, not just a name. idle/jump/fall/crouch are the K8-sampled MM
// stance/procedural layers, real held clips now — no freeze. hover is mapped
// for every mech and waits only on the states.js entry named in the
// compromises block above. The dodge tuck is written
// under dodge_roll AND dodge_air: render3d resolves by CLIP name, and the
// dodge state aliases to dodge_roll (states.js STATE_ALIASES), so a plain
// `dodge` key would never be looked up.
const PREFER = {
  idle: ["battleIdle"],
  walk: ["walk"],
  run: ["run"],
  dash: ["run"],
  jump: ["jumpRise"],
  fall: ["jumpFall"],
  crouch: ["crouch"],
  hover: ["hover"],
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
  // THE RELEASE, NEVER THE HOLD. `punchHold1` is a LOOP of the cocked fist
  // quaking at the hip — in Mech Mayhem it plays only while the button is
  // down, and `punchRelease1` throws the punch from exactly that chamber (its
  // first frame IS the hold pose, which is why MM hands over between them with
  // no cross-fade). Preferring the hold here gave titanus and colossus — the
  // only two mechs with no `light1` — a jab that wound up and never landed.
  light: [
    "viperSlash1", "saurionKick1", "jerryRakeR", "tritoneGore", "bigPunch1",
    "punchRelease1", "light1", "heavy",
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
  // K5 freeze frame: charge = mid-wind-up of the mech's own heavy — unless
  // this mech exported a real hold loop (poundHold: titanus, colossus),
  // which plays unfrozen. (idle's freeze was retired by K8's battleIdle.)
  if (have.has("poundHold")) clips.charge = { glb: "poundHold" };
  else if (clips.sideHeavy) clips.charge = { glb: clips.sideHeavy.glb, freeze: CHARGE_FREEZE_T };
  else missing.push("charge");
  // ...and the JAB bank, which is a different hold on the two mechs that have
  // one (states.js chargeLight says why it is its own state). Everyone else
  // maps it to the smash wind-up and never plays it — a state with no entry
  // draws the placeholder body, so "never played" still has to resolve.
  if (have.has("punchHold1")) clips.chargeLight = { glb: "punchHold1" };
  else if (clips.charge) clips.chargeLight = { ...clips.charge };
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
