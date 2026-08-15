// The matched battle poses are DATA, and this is the part of them a machine
// can check.
//
// It cannot tell you whether a pose looks like a cross — that is what the rig
// sheet and a pair of eyes are for. What it can tell you is that the table
// still refers to bones that exist, still covers the frames the sheet draws,
// and still holds angles a joint can reach: the three ways this file rots
// silently. A bone renamed in the rig manifest, a frame added to a character's
// sheet, or a typo'd 180 where a 18 was meant all look like nothing until a
// fighter is standing in the wrong pose in a match.
//
//   node tools/check_battle_poses.mjs        (runs in `npm run check`)

import { BATTLE_POSES, MATCHED_FRAMES, GAIT_FRAMES } from "../render3d/src/battle_poses.js";
import { INTENT_POSES, INTENTS, intentFor, baselinePose, CONTACTS, HEIGHTS, AIRBORNE }
  from "../render3d/src/baseline_poses.js";
import { RIG_FIXES, applyRigFixes, fixesFor } from "../render3d/src/rig_fixes.js";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const READS = join(ROOT, "sprites/docs/pose-reads");

let fails = 0;
const fail = (msg) => { console.error(`FAIL ${msg}`); fails++; };

// The bones a pose is allowed to name. Kept here rather than read off a rig so
// the check runs without a browser — the rig-side list is T_POSE in the sprite
// pose editor, and the two are meant to agree.
const BONES = new Set([
  "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
  "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
  "RightShoulder", "RightArm", "RightForeArm", "RightHand",
  "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase",
  "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase",
]);

// A joint angle past this is not a pose, it is a typo. Elbows and knees are the
// widest real range and they do not reach 180.
const LIMIT = 175;

const checkPose = (label, pose) => {
  if (!pose || typeof pose !== "object") { fail(`${label}: not a pose table`); return; }
  if (!Object.keys(pose).length) fail(`${label}: empty`);
  for (const [bone, angles] of Object.entries(pose)) {
    if (!BONES.has(bone)) fail(`${label}.${bone}: no such bone`);
    if (!Array.isArray(angles) || angles.length !== 3) {
      fail(`${label}.${bone}: want [x, y, z] degrees`);
      continue;
    }
    for (const [i, v] of angles.entries()) {
      if (typeof v !== "number" || !Number.isFinite(v)) {
        fail(`${label}.${bone}[${i}]: ${v} is not an angle`);
      } else if (Math.abs(v) > LIMIT) {
        fail(`${label}.${bone}[${i}]: ${v}° is past anything a joint does`);
      }
    }
  }
};

for (const [frame, pose] of Object.entries(BATTLE_POSES)) checkPose(frame, pose);
for (const [intent, pose] of Object.entries(INTENT_POSES)) checkPose(`baseline/${intent}`, pose);

// Every frame any character's sheet draws should eventually have a match. Only
// the frames Yuji has are required today — he is the read character, and the
// rest of the roster is seeded — but the gap is worth printing.
const yuji = JSON.parse(readFileSync(join(READS, "yuji.json"), "utf8"));
const missing = Object.keys(yuji.poses)
  .filter((k) => !MATCHED_FRAMES.has(k) && !GAIT_FRAMES.has(k));
if (missing.length) fail(`yuji has no matched pose for: ${missing.join(", ")}`);

// THE BASELINE'S ONE PROMISE: it covers everything. A per-frame match is an
// override on top of a floor, and a floor with a hole in it is not a floor —
// the editor would fall through to the generated pose on some frame nobody
// thought about, which is exactly the silent behaviour the cycle exists to
// make visible. So every frame name on every sheet is walked, and the intent
// it resolves to has to be one that exists.
const others = new Set();
const generic = new Set();
let frames = 0;
for (const file of readdirSync(READS).filter((f) => f.endsWith(".json"))) {
  const data = JSON.parse(readFileSync(join(READS, file), "utf8"));
  for (const k of Object.keys(data.poses)) {
    frames++;
    if (!MATCHED_FRAMES.has(k) && !GAIT_FRAMES.has(k)) others.add(k);
    const b = baselinePose(k);
    if (!b?.pose) fail(`${file}/${k}: the baseline returned nothing — it is supposed to be total`);
    else if (!INTENT_POSES[b.intent]) fail(`${file}/${k}: intent "${b.intent}" has no pose`);
    // Landing on the universal floor is not a failure, but it IS the resolver
    // saying "I have never heard of this frame", and that is worth printing.
    if (b.intent === "stance" && intentFor(k) === "stance" && !/^idle/.test(k)
        && !GAIT_FRAMES.has(k)) generic.add(k);
  }
}

// A CONTACT has to name a bone that exists and a height that means something,
// or the editor's readout is measuring against nothing. What it cannot check
// is whether the pose REACHES — that needs a posed rig, and the editor prints
// it per frame.
for (const [intent, c] of Object.entries(CONTACTS)) {
  if (!INTENT_POSES[intent]) fail(`contact for "${intent}": no such intent`);
  if (!c) continue;
  if (!BONES.has(c.bone)) fail(`contact for "${intent}": no bone "${c.bone}"`);
  if (!(c.at in HEIGHTS)) fail(`contact for "${intent}": no height "${c.at}"`);
  if (!c.why) fail(`contact for "${intent}": say what the contact is for`);
}
// Every intent whose name says it strikes something should say WHAT it
// strikes. Anticipation and recovery frames legitimately hit nothing.
for (const intent of INTENTS) {
  if (/^(strike|air)_/.test(intent) && !/_wind$/.test(intent)
      && !(intent in CONTACTS)) fail(`"${intent}" strikes something but declares no contact`);
}
// An airborne intent that is not a pose is a typo in one list or the other.
for (const a of AIRBORNE) if (!INTENT_POSES[a]) fail(`AIRBORNE lists "${a}", which is not an intent`);

// HOW FAR A MATCHED POSE DEPARTS FROM ITS OWN INTENT.
//
// The matched set follows the DRAWING and the baseline follows the frame's
// NAME, and when those two disagree the name wins — a drawing is a guideline
// for how a move looks, the brief is what the move is FOR. Yuji's
// `attack_light_a` is drawn at full extension where the brief says wind-up,
// and shipping that gives a light attack two contact frames and no
// anticipation, which is the one thing that makes a strike unreadable.
//
// So a big departure is not forbidden — five of Yuji's frames are legitimately
// a different animal — but it has to be RARE and it has to be argued. Each
// allowance names what the drawing shows that the name could not have known.
// Anything else over the threshold is a sprite the intent should have
// overruled, and this is what makes "it should be rare" a number.
const DIVERGENCE = 26;
const DIVERGES = new Map([
  ["crouch_a", "a sprinter's three-point set, not the brief's squat"],
  ["crouch_b", "a sprinter's three-point set, not the brief's squat"],
  ["ledge_hang", "hangs from ONE arm; the brief grips with both"],
  ["land", "reaches BOTH hands forward; the brief posts one"],
  ["dizzy", "tips backward; the brief slumps forward"],
  ["jump_rise", "knees already tucked; the brief is still stretching upward"],
  ["crouch_attack_a", "lunges out of the three-point set his crouch actually is"],
  ["crouch_attack_b", "lunges out of the three-point set his crouch actually is"],
  ["attack_air_b", "the striking limb is a LEG — a flying kick, which is a fair "
    + "reading of \"fully extended through the aerial arc\" and not something "
    + "the frame's name could have told anyone"],
]);

/** Root-mean-square difference between two pose tables, in degrees. */
function apart(a, b) {
  const bones = new Set([...Object.keys(a), ...Object.keys(b)]);
  let sum = 0; let n = 0; let worst = 0; let where = "";
  for (const bone of bones) {
    const x = a[bone] || [0, 0, 0]; const y = b[bone] || [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const d = Math.abs(x[i] - y[i]);
      sum += d * d; n++;
      if (d > worst) { worst = d; where = bone; }
    }
  }
  return { rms: n ? Math.sqrt(sum / n) : 0, worst, where };
}

const diverged = [];
for (const [frame, pose] of Object.entries(BATTLE_POSES)) {
  const base = baselinePose(frame)?.pose;
  if (!base) continue;
  const d = apart(pose, base);
  if (d.rms > DIVERGENCE) diverged.push({ frame, ...d, why: DIVERGES.get(frame) });
}
diverged.sort((a, b) => b.rms - a.rms);
const unexplained = diverged.filter((d) => !d.why);
for (const d of unexplained) {
  fail(`${d.frame}: matched pose is ${d.rms.toFixed(0)}° from the "${intentFor(d.frame)}" `
    + `baseline (worst ${d.worst.toFixed(0)}° at ${d.where}) — either the drawing is `
    + "showing something the name could not know, and it belongs in DIVERGES with a "
    + "reason, or the intent should have overruled the drawing");
}

// THE CORRECTION LAYER is data too, and it is the data most likely to be
// written in a hurry between two other things — it exists because somebody
// noticed a shoulder looked wrong. So: real bones, real angles, and a note
// saying what was wrong, because the entry is a message to whoever bakes it
// into the .glb and deletes it.
for (const [charKey, fix] of Object.entries(RIG_FIXES)) {
  if (!fix || !Object.keys(fix).length) { fail(`rig fix for "${charKey}" is empty`); continue; }
  for (const [bone, angles] of Object.entries(fix)) {
    if (!BONES.has(bone)) fail(`rig fix ${charKey}.${bone}: no such bone`);
    if (!Array.isArray(angles) || angles.length !== 3) {
      fail(`rig fix ${charKey}.${bone}: want [x, y, z] degrees`);
      continue;
    }
    // A CORRECTION, not a pose. A bind-pose error big enough to need 40° is a
    // model to send back, not a model to bend at runtime.
    for (const [i, v] of angles.entries()) {
      if (!Number.isFinite(v)) fail(`rig fix ${charKey}.${bone}[${i}]: ${v} is not an angle`);
      else if (Math.abs(v) > 40) {
        fail(`rig fix ${charKey}.${bone}[${i}]: ${v}° is a broken model, not a correction`);
      }
    }
  }
}

// And the layer has to actually reach a bone. An empty table is the normal
// state — the corrections still live in the manifest's headTiltDeg while the
// idle review is the only thing writing them — so the WIRING is what needs
// proving, with a stand-in rig rather than a fake entry in the real table.
{
  const moved = [];
  const stubBone = (name) => ({ name, quaternion: { premultiply: () => moved.push(name) } });
  const bones = new Map([["LeftShoulder", stubBone("LeftShoulder")]]);
  const stubRoot = { getObjectByName: (n) => bones.get(n) || null, updateMatrixWorld() {} };
  const stubTHREE = {
    Quaternion: class { setFromEuler() { return this; } },
    Euler: class { set() { return this; } },
  };
  const saved = RIG_FIXES.__check;
  RIG_FIXES.__check = { LeftShoulder: [0, 0, 3] };
  const hit = applyRigFixes(stubTHREE, stubRoot, "__check");
  if (!hit || !moved.includes("LeftShoulder")) fail("rig fixes: the layer never reaches a bone");
  if (fixesFor("nobody-at-all")) fail("rig fixes: an unknown character should get nothing");
  if (saved === undefined) delete RIG_FIXES.__check; else RIG_FIXES.__check = saved;
}

// Nothing should be defined and never reachable: an intent no frame resolves
// to is either a dead pose or a resolver rule somebody forgot to write.
const reached = new Set();
for (const file of readdirSync(READS).filter((f) => f.endsWith(".json"))) {
  for (const k of Object.keys(JSON.parse(readFileSync(join(READS, file), "utf8")).poses)) {
    reached.add(intentFor(k));
  }
}
const orphans = INTENTS.filter((i) => !reached.has(i));
if (orphans.length) fail(`baseline intents no frame reaches: ${orphans.join(", ")}`);

const gait = Object.keys(yuji.poses).filter((k) => GAIT_FRAMES.has(k));
console.log(`battle poses ok: ${MATCHED_FRAMES.size} matched frames, `
  + `all ${Object.keys(yuji.poses).length - gait.length} of yuji's sheet covered`
  + (gait.length ? `, ${gait.length} left to the gait cycle (${gait.join(", ")})` : ""));
console.log(`baseline ok: ${INTENTS.length} intents cover all ${frames} frames `
  + `across the roster, ${reached.size} of them reached`);
console.log(`contacts ok: ${Object.values(CONTACTS).filter(Boolean).length} declared, `
  + `${INTENTS.length - AIRBORNE.size} intents planted on the ground`);
console.log(`rig fixes ok: ${Object.keys(RIG_FIXES).length} character(s) carry a correction `
  + "layer, applied under every state until it is baked into the .glb");
console.log(`intent ok: ${diverged.length} of ${MATCHED_FRAMES.size} matched poses depart `
  + `from their intent by more than ${DIVERGENCE}°, all of them argued`);
for (const d of diverged) console.log(`  ${d.rms.toFixed(0)}°  ${d.frame} — ${d.why}`);
if (others.size) {
  console.log(`  (${others.size} frame name(s) have no PER-FRAME match and use the baseline: `
    + `${[...others].sort().slice(0, 6).join(", ")}${others.size > 6 ? ", …" : ""})`);
}
if (generic.size) {
  console.log(`  (${generic.size} frame name(s) fell to the generic stance: `
    + `${[...generic].sort().slice(0, 6).join(", ")})`);
}
process.exit(fails ? 1 : 0);
