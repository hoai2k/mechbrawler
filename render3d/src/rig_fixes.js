// THE LAYER BETWEEN THE MODEL AND THE POSE — corrections that belong to the
// .glb, applied under everything, until somebody bakes them into the .glb.
//
// A generated model arrives with things wrong that are not anybody's pose: a
// head modelled looking slightly down, a shoulder built a few degrees high, a
// clavicle rolled. They are facts about the FILE, so no clip can fix them —
// every state inherits the same stoop — and no amount of measuring the
// skeleton finds them, because the joints come out level to within a degree
// across the whole roster while the mesh does not.
//
// The idle review is where they get found, because the idle is the one pose
// with an obvious right answer: a fighter standing next to their own idle
// sprite either matches it or does not. So the review dials a correction until
// the idle reads right — and the correction it lands on is NOT part of the
// idle. It is part of the model, and it belongs under the crouch and the punch
// and the run just as much.
//
// That is what this file holds and why it is separate from both pose
// libraries. A pose says what the fighter is doing; a fix says what their
// model got wrong. Mixing them means re-deriving the same shoulder correction
// in forty poses and getting it slightly different in each.
//
// IT IS MEANT TO GO AWAY. Every entry here is a note for the modelling pass
// that bakes it into the rig's bind, after which the entry is deleted and
// nothing else changes — which is the test of whether a correction really
// belonged here rather than in a pose.

/** Degrees → radians. */
const DEG = Math.PI / 180;

/**
 * THE COMPLETE BAKE LIST — every correction the engine applies on top of a
 * delivered .glb, in one place, so that "what has to go into the model" is a
 * question with an answer rather than a search.
 *
 * Each entry says where the number lives, what it means, and what baking it
 * would actually be. `tools/model_fixes.mjs` prints the roster against this.
 */
export const MODEL_FIXES = {
  yawOffsetDeg: {
    where: "manifest",
    means: "the model was built facing somewhere other than +Z",
    bake: "rotate the whole rig about Y by -yawOffsetDeg and re-export",
  },
  headTiltDeg: {
    where: "manifest",
    means: "the head was modelled looking down; the tilt is in the MESH, not the joints",
    bake: "rotate the head mesh about the Head joint's lateral axis by -headTiltDeg",
  },
  shoulderOutCm: {
    where: "manifest",
    means: "the arm roots were built too far into the body",
    bake: "move the Left/RightArm joints (and their skin) out along the shoulder line",
  },
  kneeDeg: {
    where: "manifest",
    means: "the shins splay out of the knees — a bandy leg built into the model",
    bake: "swing each shin (and its skin) about the body's forward axis until it hangs under its knee",
  },
  renderScale: {
    where: "manifest",
    means: "the model measures a different height than the fighter is drawn at",
    bake: "scale the rig uniformly by renderScale and re-measure heightM",
  },
  bones: {
    where: "RIG_FIXES, below",
    means: "a joint was built rotated — a rolled clavicle, a cocked wrist",
    bake: "rotate the joint in the bind pose and re-skin",
  },
  symmetry: {
    where: "SYMMETRISE, below",
    means: "the skeleton was built lopsided — paired joints at different heights",
    bake: "mirror the bind pose about its centre line and re-skin",
  },
};

/** The manifest keys that are MODEL corrections rather than pose choices.
 *
 *  `armDeg` and `stanceDeg` are deliberately NOT here. They say how a fighter
 *  carries their arms and plants their feet AT REST, which is a pose and only
 *  means anything in the idle — baking them would freeze a fighter mid-idle in
 *  every other state. Everything listed here is true of the body no matter
 *  what it is doing, which is exactly the test for belonging on this list. */
export const MODEL_FIX_KEYS = ["yawOffsetDeg", "headTiltDeg", "shoulderOutCm", "kneeDeg", "renderScale"];

/**
 * The whole layer, on or off.
 *
 * OFF IS THE POINT OF BAKING. Once a fighter's corrections are in their .glb,
 * turning this off must change nothing about how they look — and if it does,
 * the bake was wrong or incomplete. So it is a switch rather than a set of
 * deletions: you flip it, compare, and only then delete the numbers.
 */
let ENABLED = true;
export function setModelFixesEnabled(on) { ENABLED = on !== false; }
export function modelFixesEnabled() { return ENABLED; }

/** What is pending for one fighter, given their manifest entry: the bake list,
 *  narrowed to the corrections they actually carry. */
export function pendingFixes(charKey, entry = null) {
  const out = {};
  for (const key of MODEL_FIX_KEYS) {
    const v = entry?.[key];
    if (v === undefined || v === null) continue;
    if (key === "renderScale" && Math.abs(v - 1) < 1e-6) continue;
    if (key !== "renderScale" && !v) continue;
    out[key] = v;
  }
  const bones = RIG_FIXES[charKey];
  if (bones && Object.keys(bones).length) out.bones = bones;
  if (symmetrises(charKey)) out.symmetry = "mirrored about the centre line";
  return out;
}

/**
 * Per character, per bone, a rotation in the BONE'S OWN frame, in degrees.
 *
 * Bone-local rather than the fighter's frame — which is the opposite of the
 * pose libraries and is deliberate. A fix is a correction to how one bone was
 * built, so it is authored by looking at that bone; a pose is a human movement
 * described once for a whole roster, so it is authored in anatomy. Using the
 * anatomical frame here would mean a shoulder fix that changes meaning as the
 * arm swings, which is exactly what a bind-pose correction must not do.
 *
 * `headTiltDeg` in the rig manifest is the same idea and predates this file;
 * it stays where it is, applied alongside these, because the idle review
 * already writes it and a second place to say the same thing is worse than an
 * inconsistent one.
 */
export const RIG_FIXES = {
  // EMPTY BECAUSE IT WAS BAKED, which is the ending this table was written
  // for. Geto's ten bone corrections — the hand-dialled feet, toes, hips and
  // forearms — are in `geto.glb` now, along with the head tilts, the shoulder
  // widenings and the mirrored skeletons the rest of the roster carried.
  // `tools/bake_model_fixes.mjs` put them there and cleared the manifest keys
  // in the same pass.
  //
  // A NEW delivery starts the cycle again: the rig bench produces numbers,
  // they live here until somebody bakes them, and the bake empties the entry.
  // Nothing about the layer is retired — it is just, for once, done.
};



/** The fixes for a character, or null. Never throws on an unknown key. */
export function fixesFor(charKey) {
  const fix = RIG_FIXES[charKey];
  return fix && Object.keys(fix).length ? fix : null;
}

/**
 * Apply a character's fixes to a posed rig.
 *
 * PREMULTIPLIED, so the angle is read in the bone's PARENT frame and composes
 * with whatever the pose already did rather than replacing it — the same
 * convention as `applyPoseEdits` in pose.js, which is the layer this one sits
 * beside.
 *
 * Called for EVERY state, which is the whole point. A fix that only shows up
 * in the idle is a fix that has been mistaken for a pose.
 */
export function applyRigFixes(THREE, root, charKey) {
  const fix = fixesFor(charKey);
  if (!fix || !root) return false;
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let hit = 0;
  for (const [name, [rx = 0, ry = 0, rz = 0]] of Object.entries(fix)) {
    const bone = root.getObjectByName(name);
    if (!bone) continue;
    e.set(rx * DEG, ry * DEG, rz * DEG, "XYZ");
    bone.quaternion.premultiply(q.setFromEuler(e));
    hit++;
  }
  if (hit) root.updateMatrixWorld(true);
  return hit > 0;
}

// ------------------------------------------------------ SKELETON SYMMETRY
//
// A rotation fix says "this joint was built turned". This says something the
// rotations cannot: "this joint was built in the wrong PLACE".
//
// Generated skeletons come out lopsided in position as well as in angle —
// Geto's arm roots sit 3.9cm apart in height, one knee is higher than the
// other, and no amount of rotating a bone moves it, because a bone's position
// is set by its parent. The tell is that the defect survives every pose: the
// engine straightens legs and levels soles in the idle and the fighter still
// stands with one shoulder dropped.
//
// A body is symmetric. That is not a style choice about these characters, it
// is what the drawings show and what every pose library assumes when it says
// one thing about "the arm". So the fix is to MIRROR the skeleton about its
// own sagittal plane: for each Left/Right pair, both bones move to the average
// of where the two of them were, and the bones on the centre line move onto
// it.
//
// WHAT IT DOES NOT DO is touch rotations, lengths along the limb, or anything
// asymmetric on purpose (a prop bone, a hair chain). Only the paired skeleton,
// and only its placement.

/**
 * ON BY DEFAULT, for everybody.
 *
 * A body is symmetric. That is not a style choice about these characters, it
 * is what the drawings show and what every pose library assumes when it says
 * one thing about "the arm" — so the mirror is the rule and an exemption is
 * the claim that needs arguing, not the other way round.
 *
 * The survey that settled it, measured across the roster with the correction
 * layer lifted (left joint minus right, centimetres):
 *
 *     hanami   shoulders  8.5    jogo    -6.9    sukuna  -5.5
 *     dagon           4.4        geto    -3.9    nanami   3.8
 *     toji     knees    3.7      mecha    3.4    maki     3.2
 *     choso             3.0      ...eighteen more under 3
 *
 * A third of the roster is lopsided by more than a centimetre in the joints
 * that matter, and the eighteen that are already square pay nothing: their
 * bones move a fraction of a millimetre. And unlike a rotation fix, this one
 * cannot go wrong in a state nobody looked at — clips animate rotations, not
 * bone positions, so there is no pose where a mirrored skeleton fights what
 * the clip asked for.
 *
 * `false` EXEMPTS a fighter. Only two reasons are good ones: the asymmetry is
 * the design (a broken limb, a lopsided machine), or the body is not a body.
 * "It looked odd" is not — that is what the rig bench's checkbox is for.
 */
export const SYMMETRISE = {
  // Empty for the same reason RIG_FIXES is: every skeleton that needed
  // mirroring has been mirrored IN THE FILE. Hanami's exemption went with it —
  // he was the one fighter held out, and holding him out of a fix nobody is
  // applying any more is a note rather than a setting. It is recorded in
  // render3d/docs/asset-requests.md, where the next round will look.
};


/** The bones a mirror applies to: everything the standard skeleton names in
 *  pairs, plus the centre line it mirrors about. Prop and hair bones are
 *  deliberately absent — they are asymmetric because somebody meant them to
 *  be. */
const PAIRED = ["Shoulder", "Arm", "ForeArm", "Hand", "UpLeg", "Leg", "Foot", "ToeBase"];
const CENTRED = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head"];

/** Does this fighter's skeleton get mirrored?
 *
 *  OPT-IN NOW, where it used to be opt-out. The default flipped when the
 *  roster was baked: a mirror applied to an already-mirrored skeleton is a
 *  no-op, so leaving it on would have been harmless but dishonest — the report
 *  would have gone on listing work that was finished. A new delivery turns it
 *  on for itself, in the rig bench or here, and turns it off again by being
 *  baked. */
export function symmetrises(charKey) {
  return SYMMETRISE[charKey] === true;
}

/**
 * The bind pose's bone positions and rotations, in MODEL space, cached on the
 * root. The same reading `ik.js` takes for the arm layer and for the same
 * reason: the inverse-bind matrices are the only record of the skeleton as it
 * was built, before any clip touched it.
 */
function bindPose(THREE, root) {
  if (root.userData.__bindTRS) return root.userData.__bindTRS;
  let map = null;
  root.traverse((o) => {
    if (map || !o.isSkinnedMesh || !o.skeleton) return;
    map = new Map();
    o.skeleton.bones.forEach((bone, i) => {
      const m = new THREE.Matrix4().copy(o.skeleton.boneInverses[i]).invert();
      map.set(bone.name, {
        pos: new THREE.Vector3().setFromMatrixPosition(m),
        quat: new THREE.Quaternion().setFromRotationMatrix(m),
      });
    });
  });
  root.userData.__bindTRS = map || new Map();
  return root.userData.__bindTRS;
}

/**
 * What a mirrored skeleton's LOCAL bone positions are — computed once from the
 * bind, cached, and thereafter just copied onto the bones.
 *
 * COMPUTED FROM THE BIND AND NOT FROM THE POSE, which is the whole design of
 * this function and was learned the hard way. The first version measured the
 * sagittal plane off the skeleton as it stood at that instant and wrote
 * positions back through the posed parents. It ran inside the per-frame loop,
 * between the clip and the clean-pose snapshot, so its own output became the
 * next frame's input — and because the frame it measured moved with the clip,
 * every pass landed somewhere slightly different. The rig drifted: two renders
 * of one frame came out thirteen cells apart, and the shoulder-width dial
 * measured 20cm in the idle and 0 everywhere else.
 *
 * A bone's LOCAL position is its offset from its parent in the parent's own
 * frame, which is a fact about the skeleton and not about any pose. So that is
 * what is corrected, once, and copying it onto a bone is idempotent no matter
 * how many times or in what state it happens.
 */
function mirroredLocals(THREE, root) {
  if (root.userData.__mirrorLocals) return root.userData.__mirrorLocals;
  const bind = bindPose(THREE, root);
  const out = new Map();
  root.userData.__mirrorLocals = out;
  const hipL = bind.get("LeftUpLeg"), hipR = bind.get("RightUpLeg");
  if (!hipL || !hipR) return out;

  // The rig's own frame, taken from the BIND skeleton: hip joint to hip joint
  // is the width axis, so a model built facing anywhere is judged on its own
  // body and `yawOffsetDeg` never enters into it.
  const lat = new THREE.Vector3(hipR.pos.x - hipL.pos.x, 0, hipR.pos.z - hipL.pos.z);
  if (lat.lengthSq() < 1e-8) return out;
  lat.normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const fwd = new THREE.Vector3().crossVectors(up, lat).normalize();
  const mid = hipL.pos.clone().add(hipR.pos).multiplyScalar(0.5);

  const coords = (p) => {
    const d = p.clone().sub(mid);
    return { l: d.dot(lat), u: d.dot(up), f: d.dot(fwd) };
  };
  const point = (c) => mid.clone()
    .addScaledVector(lat, c.l).addScaledVector(up, c.u).addScaledVector(fwd, c.f);

  // Where every corrected bone ends up, in model space. Built first and in
  // full, because a bone's local offset is read against its PARENT's corrected
  // position and some parents are themselves in this list.
  const want = new Map();
  for (const name of CENTRED) {
    const b = bind.get(name);
    if (!b) continue;
    const c = coords(b.pos);
    if (Math.abs(c.l) < 1e-5) continue;
    want.set(name, point({ l: 0, u: c.u, f: c.f }));
  }
  for (const base of PAIRED) {
    const bl = bind.get(`Left${base}`), br = bind.get(`Right${base}`);
    if (!bl || !br) continue;
    const cl = coords(bl.pos), cr = coords(br.pos);
    // Sideways: the same distance out on each side, which is the average of
    // the two MAGNITUDES rather than of the two signed numbers — those nearly
    // cancel, and a limb pair is not meant to average onto the centre line.
    const outM = (Math.abs(cl.l) + Math.abs(cr.l)) / 2;
    const u = (cl.u + cr.u) / 2;
    const f = (cl.f + cr.f) / 2;
    want.set(`Left${base}`, point({ l: Math.sign(cl.l || -1) * outM, u, f }));
    want.set(`Right${base}`, point({ l: Math.sign(cr.l || 1) * outM, u, f }));
  }

  // ...and then as LOCAL offsets, which is what a bone actually carries.
  for (const [name, target] of want) {
    const bone = root.getObjectByName(name);
    const parent = bone?.parent;
    if (!parent) continue;
    const parentBind = bind.get(parent.name);
    const parentAt = want.get(parent.name) || parentBind?.pos;
    if (!parentAt) continue;
    const local = target.clone().sub(parentAt);
    // Into the parent's frame. Its BIND rotation, because a local position is
    // read against whatever the parent's rotation is at the time and the
    // offset itself must not depend on that.
    if (parentBind) local.applyQuaternion(parentBind.quat.clone().invert());
    out.set(name, local);
  }
  return out;
}

/**
 * Mirror a rig's bone positions about its own sagittal plane.
 *
 * Cheap and idempotent: the arithmetic happens once per rig (mirroredLocals),
 * and this copies the answer onto the bones. Safe to call every frame, in any
 * state, in any order relative to the clip — which is exactly what a fix to
 * the SKELETON has to be.
 */
export function applySkeletonSymmetry(THREE, root, charKey) {
  if (!symmetrises(charKey)) return false;
  const locals = mirroredLocals(THREE, root);
  if (!locals.size) return false;
  let moved = 0;
  for (const [name, pos] of locals) {
    const bone = root.getObjectByName(name);
    if (!bone) continue;
    bone.position.copy(pos);
    moved++;
  }
  if (moved) root.updateMatrixWorld(true);
  return moved > 0;
}
