// Two-bone IK: make the strike actually reach where it was aimed.
//
// `applyAim` (renderer.js) pitches the spine toward the target, which reads as
// "leaning into it" — but the hand still lands wherever the clip put it, so an
// opponent on a platform above gets swung at, not hit. This closes that gap:
// the striking limb's shoulder and elbow are solved so the HAND arrives at the
// target point. That is the difference between a clip that gestures at an
// angle and a fighter who attacks at any angle.
//
// It is also the answer to the other half of the sprite pipeline's cost. A
// pose that reads wrong on a sprite is an asset request, a redraw and an
// approval pass (rounds 6, 12A, 13, 14 and 17 were largely that). A pose that
// reaches wrong here is a number.
//
// ---------------------------------------------------------------------------
// HOW IT SOLVES
//
// Analytic, not iterative: with two bones and a target the triangle is closed
// form, so there is no convergence to tune and no per-frame cost worth caching
// around. Law of cosines gives the shoulder and elbow angles; the bend PLANE
// comes from where the clip already had the elbow, so the animator's intent
// survives — a hook and a straight jab keep their different elbow carriage
// while both landing on the target.
//
// Reach is clamped to the arm's actual length. A target further away than the
// limb can reach straightens the limb toward it rather than dislocating it,
// which is both correct and what a real strike at maximum range looks like.
//
// WEIGHT. IK ramps in over the second half of the wind-up and holds at full
// through the contact beat, so the clip owns the anticipation and the solver
// owns the arrival. Snapping to the target on frame one would flatten every
// wind-up in the game into the same straight-line poke.

import { STATES, clipNameFor } from "./states.js";
import { twoHandGrip, CHARACTER_MORPHS, morphBones, CHARACTER_PROPS,
  CARRY_DROP_DEG, CARRY_OVERRIDES } from "./props.js";

/** Which limb reaches, per state: [root, mid, end] bone names.
 *
 *  Arms for punches, the lead leg for the aerial (the default set kicks with
 *  the left). A state absent here does not solve at all — locomotion must
 *  never chase a target, or a running fighter would grope at their opponent. */
const ARM_R = ["RightArm", "RightForeArm", "RightHand"];
const LEG_L = ["LeftUpLeg", "LeftLeg", "LeftFoot"];

export const REACH = {
  light: ARM_R,
  sideHeavy: ARM_R,
  upHeavy: ARM_R,
  downHeavy: ARM_R,
  crouchAttack: ARM_R,
  specialNeutral: ARM_R,
  specialSide: ARM_R,
  airLight: LEG_L,
};

export function reaches(state) {
  return !!REACH[clipNameFor(state)];
}

/** The limb this state solves onto the target, or null. Exported so a tool can
 *  say WHICH bones it is not allowed to author in clip space — a keyframe on a
 *  bone the solver owns is a keyframe the solver silently discards. */
export function reachChain(state) {
  return REACH[clipNameFor(state)] || null;
}

/** The off-hand chain the two-handed grip solves onto the shaft in this state,
 *  or []. Same purpose as reachChain: these bones answer to the weapon, not to
 *  the clip. Named from the roster table rather than the rig, so it is
 *  answerable before a model is loaded. */
export function gripBones(charKey, state) {
  const grip = twoHandGrip(charKey);
  if (!grip || !TWO_HAND_STATES.has(clipNameFor(state))) return [];
  // The prop hangs off the character's weapon hand; the OTHER arm grips the
  // shaft. props.js records which hand the weapon is on.
  const off = grip.hand === "LeftHand" ? "Right" : "Left";
  return [`${off}Arm`, `${off}ForeArm`, `${off}Hand`];
}

/** How much of the solve is blended in at `t` seconds into the clip: nothing
 *  through the first part of the wind-up, smoothly to full by the contact
 *  beat, held after so the follow-through stays on target. `beat` overrides
 *  the state table's contact instant — the game passes the move's own hitbox
 *  delay, which is per-move and speed-scaled where the table is one global
 *  number per state (pose.js sampleTime documents the sync). */
export function reachWeight(state, t, beat) {
  const b = beat ?? STATES[clipNameFor(state)]?.beat;
  if (!b) return 1;
  const start = b * 0.4;
  if (t <= start) return 0;
  if (t >= b) return 1;
  const u = (t - start) / (b - start);
  return u * u * (3 - 2 * u);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Turn `bone` so the child point it currently aims at ends up aiming at
 *  `wantWorld`. Works in world space and converts back through the parent, so
 *  it composes with whatever the clip and the spine aim already did. */
function aimBoneAt(THREE, bone, bonePos, childPos, wantWorld, tmp) {
  const cur = tmp.v1.subVectors(childPos, bonePos);
  const want = tmp.v2.subVectors(wantWorld, bonePos);
  if (cur.lengthSq() < 1e-12 || want.lengthSq() < 1e-12) return;
  cur.normalize();
  want.normalize();
  const delta = tmp.q1.setFromUnitVectors(cur, want);
  const world = bone.getWorldQuaternion(tmp.q2);
  const parentWorld = bone.parent ? bone.parent.getWorldQuaternion(tmp.q3) : tmp.q3.identity();
  // local = parentWorld⁻¹ · (delta · world)
  bone.quaternion.copy(parentWorld.invert().multiply(delta.multiply(world)));
  bone.updateMatrixWorld(true);
}

/**
 * Solve the limb so `end` lands on `targetWorld`.
 *
 * Returns false when the chain is missing or degenerate — the caller keeps the
 * clip's pose, which is always a drawable one.
 */
export function solveTwoBone(THREE, root, mid, end, targetWorld, tmp) {
  root.updateWorldMatrix(true, true);
  const rootPos = tmp.p1.setFromMatrixPosition(root.matrixWorld);
  const midPos = tmp.p2.setFromMatrixPosition(mid.matrixWorld);
  const endPos = tmp.p3.setFromMatrixPosition(end.matrixWorld);

  const l1 = midPos.distanceTo(rootPos);
  const l2 = endPos.distanceTo(midPos);
  if (l1 < 1e-6 || l2 < 1e-6) return false;

  const toTarget = tmp.v3.subVectors(targetWorld, rootPos);
  const rawDist = toTarget.length();
  if (rawDist < 1e-6) return false;
  // Clamped into the range the triangle can actually close: further than the
  // limb reaches straightens it, closer than it can fold stops at the fold.
  const d = clamp(rawDist, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  const dir = tmp.v4.copy(toTarget).normalize();

  // The bend plane: keep the elbow where the clip put it. Its offset from the
  // root-to-target line is the pole vector, so a solve preserves the pose's
  // own elbow carriage instead of imposing one.
  const pole = tmp.v5.subVectors(midPos, rootPos);
  let axis = tmp.v6.crossVectors(dir, pole);
  if (axis.lengthSq() < 1e-10) {
    axis.crossVectors(dir, tmp.v5.set(0, 0, 1));
    if (axis.lengthSq() < 1e-10) axis.crossVectors(dir, tmp.v5.set(0, 1, 0));
  }
  axis.normalize();

  const rootAngle = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const upperDir = tmp.v7.copy(dir).applyAxisAngle(axis, rootAngle);
  const wantMid = tmp.p4.copy(rootPos).addScaledVector(upperDir, l1);

  aimBoneAt(THREE, root, rootPos, midPos, wantMid, tmp);

  // Second bone: with the elbow placed, point the forearm at the target. The
  // segment length is fixed, and d was clamped to something reachable, so the
  // hand lands on target rather than merely toward it.
  mid.updateWorldMatrix(true, true);
  const midPos2 = tmp.p5.setFromMatrixPosition(mid.matrixWorld);
  const endPos2 = tmp.p6.setFromMatrixPosition(end.matrixWorld);
  aimBoneAt(THREE, mid, midPos2, endPos2, targetWorld, tmp);
  return true;
}

/** Scratch vectors and quaternions, allocated once. This runs inside the pose
 *  step for every attacking fighter, and per-frame allocation there is how a
 *  smooth renderer acquires a stutter. */
export function makeScratch(THREE) {
  return {
    v1: new THREE.Vector3(), v2: new THREE.Vector3(), v3: new THREE.Vector3(),
    v4: new THREE.Vector3(), v5: new THREE.Vector3(), v6: new THREE.Vector3(),
    v7: new THREE.Vector3(),
    p1: new THREE.Vector3(), p2: new THREE.Vector3(), p3: new THREE.Vector3(),
    p4: new THREE.Vector3(), p5: new THREE.Vector3(), p6: new THREE.Vector3(),
    q1: new THREE.Quaternion(), q2: new THREE.Quaternion(), q3: new THREE.Quaternion(),
    // Dedicated: the solver reuses p1-p6 internally, so the effective target
    // needs a slot it cannot clobber mid-solve.
    eff: new THREE.Vector3(),
    saved: [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()],
    // The two-hand solve moves BOTH arms — a second effective target and a
    // second set of saved quaternions so the main arm blends independently.
    eff2: new THREE.Vector3(),
    saved2: [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()],
  };
}

/**
 * Solve the reaching limb for `state` toward `targetWorld`, blended by the
 * state's weight ramp. No-op for states that do not reach, rigs missing the
 * chain, or weight 0.
 */
export function applyReach(THREE, root3d, state, clipT, targetWorld, tmp, beat) {
  const chain = REACH[clipNameFor(state)];
  if (!chain) return false;
  const weight = reachWeight(state, clipT, beat);
  if (weight <= 0) return false;

  const bones = chain.map((n) => root3d.getObjectByName(n));
  if (bones.some((b) => !b)) return false;

  // Re-aim the strike; do not re-LENGTHEN it.
  //
  // At fighting range the opponent is metres away and a limb reaches half a
  // metre, so solving straight at them would straighten every limb to full
  // stretch on every blow — a jab, a hook and a lunge all collapsing into the
  // same rigid poke. What the clip already says is how far this attack
  // extends; the target only says which way. So the effective target sits at
  // the clip's OWN reach distance along the direction to the aim point, and
  // pulls in closer when the opponent is nearer than the strike would extend
  // (nobody punches through a body).
  //
  // Because that distance is always inside the limb's range, the solve is
  // exact rather than clamped: the hand lands on the point, every time.
  bones[0].updateWorldMatrix(true, true);
  const rootP = tmp.p1.setFromMatrixPosition(bones[0].matrixWorld);
  const endP = tmp.p2.setFromMatrixPosition(bones[2].matrixWorld);
  const clipReach = endP.distanceTo(rootP);
  const toAim = tmp.v3.subVectors(targetWorld, rootP);
  const aimDist = toAim.length();
  if (aimDist < 1e-6 || clipReach < 1e-6) return false;
  const effective = tmp.eff
    .copy(rootP)
    .addScaledVector(toAim.multiplyScalar(1 / aimDist), Math.min(aimDist, clipReach));

  // Blend by remembering the clip's pose and easing toward the solved one:
  // solving at full strength from the first frame would erase the wind-up.
  for (let i = 0; i < 3; i++) tmp.saved[i].copy(bones[i].quaternion);
  if (!solveTwoBone(THREE, bones[0], bones[1], bones[2], effective, tmp)) {
    for (let i = 0; i < 3; i++) bones[i].quaternion.copy(tmp.saved[i]);
    return false;
  }
  if (weight < 1) {
    for (let i = 0; i < 3; i++) {
      const solved = tmp.q1.copy(bones[i].quaternion);
      bones[i].quaternion.copy(tmp.saved[i]).slerp(solved, weight);
    }
    bones[0].updateMatrixWorld(true);
  }
  return true;
}

// ------------------------------------------------------------ two-hand grip
//
// A two-handed weapon (props.js TWO_HANDED_KINDS) keeps the OFF hand on the
// shaft. This cannot be authored: the aim pitch and the reach solve move the
// striking arm — and the weapon with it — at pose time, so any clip-space
// left hand placement detaches the moment a strike aims anywhere. It has to
// be one more solve, run AFTER aim and reach, against wherever the shaft
// actually ended up.
//
// The shaft itself is measured, not assumed. A delivered rig carries the
// weapon as geometry skinned to the prop bone (the conform pass's prop rescue
// guarantees exactly that), so the verts the prop bone dominates are the
// weapon, and their principal axis in the bone's own frame IS the shaft —
// pose-independent, computed once per rig and cached on the bone. Which way
// along it is "toward the butt" comes from the bind pose: a generated polearm
// arrives standing upright, so at bind the butt end points down.

/** States in which the off hand grips the shaft. The strike family plus the
 *  holds that read as "braced": locomotion stays one-handed (the canon carry),
 *  and states that need the off hand elsewhere — ledge, dodges, hurt — are
 *  simply absent. */
const TWO_HAND_STATES = new Set([
  // IDLE IS NOT IN HERE, and it was tried. The grip solve puts the off hand a
  // fixed distance down the shaft from the main one, which is right when the
  // weapon is presented across the body for a strike and absurd when it is
  // hanging at the fighter's side: Maki's off arm went straight up over her
  // head to reach a shaft point that was above her. A relaxed carry is
  // one-handed — which is also the canon one — and the weapon follows the
  // carrying hand on its own, because the prop hangs off that bone.
  "light", "sideHeavy", "upHeavy", "downHeavy", "crouchAttack",
  "specialNeutral", "specialSide", "specialDown", "charge", "ult",
]);

/** Fit the weapon's shaft in the prop bone's local frame.
 *
 *  Returns { dir, extent } — `dir` a unit Vector3 in bone-local space
 *  pointing from the grip toward the BUTT, `extent` how many metres of shaft
 *  lie that way — or null when the rig carries no measurable prop geometry.
 *
 *  Works from bind-space data only (geometry positions, bindMatrix, the
 *  skeleton's boneInverses), so it does not matter what pose the rig is in
 *  when first asked. Verts rigid to a bone have constant bone-local
 *  coordinates: local = boneInverse × bindMatrix × v. */
export function fitPropShaft(THREE, root3d, propBoneName) {
  const locals = [];
  let restWorldRot = null;
  root3d.traverse((obj) => {
    if (!obj.isSkinnedMesh || !obj.skeleton) return;
    const joint = obj.skeleton.bones.findIndex((b) => b.name === propBoneName);
    if (joint < 0) return;
    const toLocal = new THREE.Matrix4()
      .multiplyMatrices(obj.skeleton.boneInverses[joint], obj.bindMatrix);
    restWorldRot = new THREE.Matrix4()
      .copy(obj.skeleton.boneInverses[joint]).invert();
    const pos = obj.geometry.attributes.position;
    const idx = obj.geometry.attributes.skinIndex;
    const wgt = obj.geometry.attributes.skinWeight;
    if (!pos || !idx || !wgt) return;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      let best = 0, bestW = 0;
      for (let k = 0; k < 4; k++) {
        const w = wgt.getComponent(i, k);
        if (w > bestW) { bestW = w; best = idx.getComponent(i, k); }
      }
      if (best !== joint || bestW < 0.5) continue;
      v.fromBufferAttribute(pos, i).applyMatrix4(toLocal);
      locals.push(v.clone());
    }
  });

  // A SEPARATELY GENERATED WEAPON IS NOT SKIN. Fighters whose weapon a
  // generator would fuse into their arm are now drawn empty-handed and the
  // weapon is joined afterwards as a mesh PARENTED TO the prop bone
  // (tools/blender_attach_prop.py) — so it carries no skin weights at all and
  // the loop above finds nothing on it. Maki's shaft went missing exactly
  // that way, and with no shaft the off hand has nothing to be solved onto.
  //
  // A bone-parented mesh rides its bone rigidly, so its vertices are already
  // constant in the bone's frame whatever pose the rig is in: bone-local is
  // just boneWorld⁻¹ × meshWorld × v, with no bind matrices needed.
  if (!locals.length) {
    root3d.updateMatrixWorld(true);
    let bone = null;
    root3d.traverse((o) => { if (o.isBone && o.name === propBoneName) bone = o; });
    if (bone) {
      const toLocal = new THREE.Matrix4();
      const v = new THREE.Vector3();
      bone.traverse((obj) => {
        if (!obj.isMesh || obj.isSkinnedMesh || obj === bone) return;
        toLocal.copy(bone.matrixWorld).invert().multiply(obj.matrixWorld);
        const pos = obj.geometry.attributes.position;
        if (!pos) return;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(toLocal);
          locals.push(v.clone());
        }
      });
      // The butt test below needs the bone's REST orientation, and with no
      // skinned verts we never picked one up. The prop bone is still a member
      // of the fighter's skeleton, so its boneInverse is there to be read.
      if (!restWorldRot) {
        root3d.traverse((obj) => {
          if (restWorldRot || !obj.isSkinnedMesh || !obj.skeleton) return;
          const j = obj.skeleton.bones.findIndex((b) => b.name === propBoneName);
          if (j < 0) return;
          restWorldRot = new THREE.Matrix4()
            .copy(obj.skeleton.boneInverses[j]).invert();
        });
      }
    }
  }
  if (locals.length < 16 || !restWorldRot) return null;

  // Principal axis by power iteration on the covariance — the shaft dominates
  // every other dimension of a polearm, so this converges in a few steps.
  const mean = locals.reduce((a, b) => a.add(b), new THREE.Vector3())
    .multiplyScalar(1 / locals.length);
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const p of locals) {
    const dx = p.x - mean.x, dy = p.y - mean.y, dz = p.z - mean.z;
    xx += dx * dx; xy += dx * dy; xz += dx * dz;
    yy += dy * dy; yz += dy * dz; zz += dz * dz;
  }
  const dir = new THREE.Vector3(1, 1, 1).normalize();
  for (let it = 0; it < 24; it++) {
    dir.set(
      xx * dir.x + xy * dir.y + xz * dir.z,
      xy * dir.x + yy * dir.y + yz * dir.z,
      xz * dir.x + yz * dir.y + zz * dir.z,
    );
    if (dir.lengthSq() < 1e-20) return null;
    dir.normalize();
  }

  // Butt-ward: at bind the polearm stands upright, so the end of the shaft
  // that points DOWN in bind-world is the butt.
  const worldDir = dir.clone().transformDirection(restWorldRot);
  if (worldDir.y > 0) dir.negate();
  let extent = 0;
  for (const p of locals) extent = Math.max(extent, p.dot(dir));
  return { dir, extent };
}

/**
 * Slide a delivered weapon along its own axis so the hand grips where it
 * should. See props.js `gripAt` for why this is a runtime layer and not a
 * change to `grip`.
 *
 * The prop mesh hangs off the prop bone, so moving the BONE moves the weapon
 * and nothing else — the hand stays where the clip put it. Shifting the bone
 * by −s along the measured shaft brings the point s metres down-shaft to
 * where the grip is now, which is the whole of it.
 *
 * Runs in every state: where a weapon is held is a fact about the fighter,
 * not about the move.
 */
export function applyGrip(THREE, root3d, charKey, tmp) {
  let moved = false;
  for (const p of CHARACTER_PROPS[charKey] || []) {
    if (p.gripAt === undefined || !p.lengthM) continue;
    const bone = root3d.getObjectByName(p.bone);
    if (!bone) continue;
    if (bone.userData.__shaft === undefined) {
      bone.userData.__shaft = fitPropShaft(THREE, root3d, p.bone);
    }
    const shaft = bone.userData.__shaft;
    if (!shaft) continue;
    // Both fractions are measured FROM THE HEAVY END, so a bigger `grip` than
    // `gripAt` means the hand is too far up and must travel down-shaft.
    const s = clamp((p.grip - p.gripAt) * p.lengthM, -shaft.extent, shaft.extent);
    if (Math.abs(s) < 1e-4) continue;
    bone.position.add(tmp.v1.copy(shaft.dir).multiplyScalar(-s)
      .applyQuaternion(bone.quaternion));
    bone.updateMatrixWorld(true);
    moved = true;
  }
  return moved;
}

/** The states a weapon is CARRIED through rather than presented in: the
 *  fighter is travelling, and the prop is luggage. Everything else — every
 *  attack, every guard, the idle — keeps the presentation its pose authored,
 *  because there the weapon's angle is the point of the pose. */
const CARRY_STATES = new Set(["walk", "run", "dash"]);

/**
 * Swing a carried weapon so its heavy end trails, low and behind.
 *
 * See the note in props.js for why this is one rule rather than a table of
 * per-weapon angles: `fitPropShaft` measures which way the heavy end lies in
 * the prop bone's own frame, so "trail it" is the same instruction for a
 * naginata, a guitar and a broom.
 *
 * The swing is applied to the PROP BONE, not the arm: the fighter's hand goes
 * where the run cycle put it and only the thing in it turns, which is what
 * lets this run after the clip without fighting it. Returns true when
 * something was actually turned.
 */
export function applyCarry(THREE, root3d, charKey, state, tmp) {
  if (!CARRY_STATES.has(clipNameFor(state))) return false;
  const props = CHARACTER_PROPS[charKey] || [];
  if (!props.length || CARRY_OVERRIDES[charKey]?.carry === false) return false;

  // Which way the fighter faces, from their own hips — the same measure every
  // other layer here uses, so a turned-around body carries it turned around.
  // characterLateral hands back the fighter's lateral axis built as
  // (fwd.z, 0, -fwd.x); inverting that recovers the forward it came from.
  // Deriving it the other way round points the weapon forward instead of back,
  // which is the exact bug this layer exists to fix — so it is spelled out
  // rather than left as a cross product to re-derive.
  const lat = characterLateral(THREE, root3d, tmp.v3);
  const fwdX = -lat.z, fwdZ = lat.x;
  const drop = ((CARRY_OVERRIDES[charKey]?.dropDeg ?? CARRY_DROP_DEG) * Math.PI) / 180;
  const cos = Math.cos(drop);
  const want = tmp.v2.set(-fwdX * cos, -Math.sin(drop), -fwdZ * cos).normalize();

  let turned = false;
  for (const p of props) {
    if (!p.hand) continue;                        // not held: nothing to carry
    const bone = root3d.getObjectByName(p.bone);
    if (!bone) continue;
    if (bone.userData.__shaft === undefined) {
      bone.userData.__shaft = fitPropShaft(THREE, root3d, p.bone);
    }
    const shaft = bone.userData.__shaft;
    if (!shaft) continue;
    bone.updateWorldMatrix(true, false);
    // Where the heavy end points NOW, in the world.
    const cur = tmp.v1.copy(shaft.dir).transformDirection(bone.matrixWorld).normalize();
    if (cur.lengthSq() < 1e-8) continue;
    const swing = tmp.q1.setFromUnitVectors(cur, want);
    const parentQ = bone.parent ? bone.parent.getWorldQuaternion(tmp.q2) : tmp.q2.identity();
    // world-space swing, expressed back in the bone's parent frame
    const inv = tmp.q3.copy(parentQ).invert();
    bone.quaternion.premultiply(parentQ).premultiply(swing).premultiply(inv);
    bone.updateMatrixWorld(true);
    turned = true;
  }
  return turned;
}

/**
 * Put the off hand on the shaft, for fighters whose prop is two-handed and
 * states where a two-handed grip reads. Call AFTER applyAim/applyReach — the
 * shaft rides the striking hand, so this must see its final position.
 */
export function applyTwoHandGrip(THREE, root3d, charKey, state, clipT, tmp, beat) {
  const grip = twoHandGrip(charKey);
  if (!grip || !TWO_HAND_STATES.has(clipNameFor(state))) return false;
  const bone = root3d.getObjectByName(grip.bone);
  if (!bone) return false;

  if (bone.userData.__shaft === undefined) {
    bone.userData.__shaft = fitPropShaft(THREE, root3d, grip.bone);
  }
  const shaft = bone.userData.__shaft;
  if (!shaft) return false;

  // Which hand already grips: the prop bone hangs off it (conform reparents
  // the hook onto whichever hand the weights name). The OTHER arm reaches.
  let gripHand = null;
  for (let p = bone.parent; p; p = p.parent) {
    if (p.name === "LeftHand" || p.name === "RightHand") { gripHand = p.name; break; }
  }
  if (!gripHand) return false;
  const off = gripHand === "RightHand" ? "Left" : "Right";
  const chain = [`${off}Arm`, `${off}ForeArm`, `${off}Hand`]
    .map((n) => root3d.getObjectByName(n));
  if (chain.some((b) => !b)) return false;

  const mainChain = [`${gripHand === "RightHand" ? "Right" : "Left"}Arm`,
    `${gripHand === "RightHand" ? "Right" : "Left"}ForeArm`, gripHand]
    .map((n) => root3d.getObjectByName(n));

  const weight = reachWeight(state, clipT, beat);
  if (weight <= 0) return false;

  // The grasp point: the spot on the shaft a real off hand would take — the
  // point NEAREST its own shoulder, clamped down-shaft of the main grip so
  // the hands never stack (`spacing` is the minimum separation). Nearest-
  // point gripping is just what hands do — under the main hand on a vertical
  // hold, mid-shaft on a horizontal one. Recomputed from the live matrices on
  // every call because the pull-in loop below moves the shaft between solves.
  const graspTarget = () => {
    bone.updateWorldMatrix(true, false);
    const gripPos = tmp.p1.setFromMatrixPosition(bone.matrixWorld);
    const buttPos = tmp.p2.copy(shaft.dir).multiplyScalar(shaft.extent)
      .applyMatrix4(bone.matrixWorld);
    const shaftDir = tmp.v1.subVectors(buttPos, gripPos);
    const shaftLen = shaftDir.length();
    if (shaftLen < 1e-6) return null;
    shaftDir.multiplyScalar(1 / shaftLen);
    chain[0].updateWorldMatrix(true, false);
    const shoulder = tmp.p3.setFromMatrixPosition(chain[0].matrixWorld);
    const s = clamp(
      tmp.v2.subVectors(shoulder, gripPos).dot(shaftDir),
      Math.min(grip.spacing * 0.6, shaftLen * 0.5),
      shaftLen * 0.95,
    );
    tmp.eff.copy(gripPos).addScaledVector(shaftDir, s);
    return shoulder; // tmp.p3 — target itself is in tmp.eff
  };

  // THE COUPLED HALF. The authored strikes are one-handed: they fling the
  // weapon a full stride from the body, physically outside the off arm's
  // reach — measured, not hypothetical: Maki's sideHeavy puts the nearest
  // shaft point 0.72 m from a 0.43 m arm. No amount of off-hand IK closes
  // that. What closes it is what a real two-handed strike does: the MAIN
  // hand stays near the body and the weapon's tip does the extending. So
  // when the grasp point is out of reach, pull the main hand toward the off
  // shoulder until it isn't. The shaft rides the main hand, so each pull
  // translates the grasp point almost 1:1 — two or three rounds converge.
  const a = tmp.p4.setFromMatrixPosition(chain[0].matrixWorld);
  const b = tmp.p5.setFromMatrixPosition(chain[1].matrixWorld);
  const c = tmp.p6.setFromMatrixPosition(chain[2].matrixWorld);
  const offLen = a.distanceTo(b) + b.distanceTo(c);
  const canPull = mainChain.every((bn) => !!bn);
  if (canPull) for (let i = 0; i < 3; i++) tmp.saved2[i].copy(mainChain[i].quaternion);
  if (canPull) {
    for (let iter = 0; iter < 3; iter++) {
      const shoulder = graspTarget();
      if (!shoulder) break;
      const dist = shoulder.distanceTo(tmp.eff);
      if (dist <= offLen * 0.95) break;
      // Move the main hand by the overshoot, aimed at the off shoulder, with
      // a little slack so the off elbow keeps a bend instead of locking out.
      const pull = tmp.v3.subVectors(shoulder, tmp.eff)
        .multiplyScalar((dist - offLen * 0.85) / dist);
      mainChain[2].updateWorldMatrix(true, false);
      tmp.eff2.setFromMatrixPosition(mainChain[2].matrixWorld).add(pull);
      if (!solveTwoBone(THREE, mainChain[0], mainChain[1], mainChain[2], tmp.eff2, tmp)) break;
    }
    if (weight < 1) {
      for (let i = 0; i < 3; i++) {
        const solved = tmp.q1.copy(mainChain[i].quaternion);
        mainChain[i].quaternion.copy(tmp.saved2[i]).slerp(solved, weight);
      }
      mainChain[0].updateMatrixWorld(true);
    }
  }

  // With the shaft wherever the (blended) main arm finally holds it, land the
  // off hand on it.
  if (!graspTarget()) return false;
  for (let i = 0; i < 3; i++) tmp.saved[i].copy(chain[i].quaternion);
  if (!solveTwoBone(THREE, chain[0], chain[1], chain[2], tmp.eff, tmp)) {
    for (let i = 0; i < 3; i++) chain[i].quaternion.copy(tmp.saved[i]);
    return false;
  }
  if (weight < 1) {
    for (let i = 0; i < 3; i++) {
      const solved = tmp.q1.copy(chain[i].quaternion);
      chain[i].quaternion.copy(tmp.saved[i]).slerp(solved, weight);
    }
    chain[0].updateMatrixWorld(true);
  }
  return true;
}

// ------------------------------------------------------------- body morphs
//
// Per-state bone scaling (props.js CHARACTER_MORPHS) — Mahito's
// transfiguration arms. Runs right after the mixer poses the rig and BEFORE
// aim/reach/two-hand, so every solve sees the morphed limb. The morph ramps
// in on the state's reach curve: the arm swells through the wind-up and is
// fully transformed by the contact beat, which reads as transfiguration
// rather than a costume swap.
//
// Bones the char's morphs ever touch are reset to scale 1 on every call —
// the mixer does not write scale tracks, so a stale swell would otherwise
// survive into the next state.

/** Apply `charKey`'s per-state morphs for `state` at `clipT` seconds in.
 *  No-op (false) for fighters that declare none. */
export function applyMorphs(root3d, charKey, state, clipT, beat) {
  const bones = morphBones(charKey);
  if (!bones) return false;
  const spec = CHARACTER_MORPHS[charKey][clipNameFor(state)] || null;
  const w = spec ? reachWeight(state, clipT, beat) : 0;
  for (const name of bones) {
    const bone = root3d.getObjectByName(name);
    if (!bone) continue;
    const m = spec?.find((s) => s.bone === name);
    if (m && w > 0) {
      const [sx, sy, sz] = Array.isArray(m.scale) ? m.scale : [m.scale, m.scale, m.scale];
      bone.scale.set(1 + (sx - 1) * w, 1 + (sy - 1) * w, 1 + (sz - 1) * w);
    } else {
      bone.scale.set(1, 1, 1);
    }
  }
  return !!spec && w > 0;
}

// ---------------------------------------------------------------- layer axes
//
// The live layers (aim pitch, head look-at, flinch) all need to NOD a bone —
// rotate it in the vertical plane the character faces along. They were written
// as a rotation about the bone's LOCAL X, which is only the nodding axis if the
// rig happens to be built that way. On a generated rig whose neck carries its
// own roll it is not, and the head yaws and rolls instead of nodding: the
// "funny head rotation" on the first delivered fighter.
//
// The honest axis is the character's own LATERAL direction — perpendicular to
// both world up and the way they face — computed from the rig and converted
// into whatever local frame the bone happens to have.

/**
 * The character's lateral (right-hand-side) axis in world space, from the way
 * they actually face and world up.
 *
 * THE RIG'S FORWARD IS NOT ITS LOCAL +Z. That is what the delivery spec asks
 * for and what `yawOffsetDeg` exists to say is false: a generated model arrives
 * built facing some other way, and is turned AT THE ROOT until it looks right.
 * So the root's local +Z misses the fighter's real forward by exactly that
 * offset — nothing for the six rigs that came in square, 45° for most of the
 * roster, 80° for Dagon.
 *
 * Reading it wrong does not look like a wrong axis. It looks like the nod
 * layers going strange on SOME characters and not others: the head lifting
 * cleanly on Yuji and rolling sideways on Nobara, which is how it was
 * reported. A rotation about an axis n° off the lateral is cos(n) of the nod
 * you asked for plus sin(n) of roll you did not, so the failure grades
 * smoothly from invisible to absurd across the roster and never looks like one
 * bug.
 *
 * The offset is stamped on the root by loader.js, so this reads the same rig
 * the engine poses rather than trusting the spec about it. Everything that
 * nods goes through here — aim, look-at, flinch, breath and the head-carriage
 * correction — so they are all right or all wrong together.
 */
export function characterLateral(THREE, root, out) {
  // The fighter's true forward in the ROOT's own frame: +Z turned back by the
  // delivery's framing error, so the world quaternion below (which includes
  // that error) lands on where they actually look.
  const off = root.userData?.yawOffsetRad || 0;
  const fwd = out.set(-Math.sin(off), 0, Math.cos(off))
    .applyQuaternion(root.getWorldQuaternion(_lq));
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-8) return out.set(1, 0, 0);
  fwd.normalize();
  // right = forward x up
  return out.set(fwd.z, 0, -fwd.x);
}
let _lq = null;

/** Turn `bone` by `rad` about a WORLD axis, composing with whatever the clip
 *  and earlier layers already did. */
export function rotateBoneAboutWorldAxis(THREE, bone, axisWorld, rad, tmp) {
  if (!bone || !rad) return;
  const parentWorld = bone.parent ? bone.parent.getWorldQuaternion(tmp.q2) : tmp.q2.identity();
  const localAxis = tmp.v1.copy(axisWorld).applyQuaternion(parentWorld.invert()).normalize();
  bone.quaternion.premultiply(tmp.q1.setFromAxisAngle(localAxis, rad));
}

/**
 * HOW A FIGHTER STANDS in their idle: legs straight, soles flat on the floor,
 * feet however far apart the stance dial says.
 *
 * WHY THE ENGINE OWNS THIS AT ALL. A generated idle arrives with whatever the
 * generator felt about standing — a knee half bent, one foot rolled onto its
 * edge, one ankle four centimetres above the other — and none of it is a
 * decision anybody made about the character. It reads as sloppiness rather
 * than as personality, and it is different sloppiness on every one of the
 * twenty-seven, so no single fix applies. Rebuilding the stand here makes the
 * whole roster agree on the boring part, which is the only way the
 * interesting part (how WIDE they stand) becomes a dial worth turning.
 *
 * STANCE IS WIDTH, MEASURED FROM THE PELVIS. The first version swung the
 * thighs about the direction it believed the fighter faced, taken from the
 * rig's local +Z per the delivery spec. That belief is exactly the one
 * `yawOffsetDeg` exists to say is false: a rig is turned at the root until it
 * LOOKS right, so local +Z misses the fighter's real forward by the offset —
 * nothing for Yuji at 0°, a right angle for Dagon at 80°. A right angle turns
 * a widening into a STRIDE, which is what showed up as "sometimes the legs
 * move forward and back instead of sideways".
 *
 * So do not ask the manifest which way anyone faces. The hip JOINTS are the
 * pelvis, in the pose being drawn: the axis from one hip to the other is the
 * width direction by definition, whatever the rig believes about forward. It
 * does not even have to be true that "LeftUpLeg" is on the fighter's left —
 * swap the two names and the measured lateral flips WITH the sign each leg is
 * turned by, so both legs still part company and the dial still reads
 * "positive is wider".
 *
 * WHAT IT DOES, IN ORDER:
 *
 *   1. Points each thigh straight down, then out by `deg` about that pelvis
 *      axis. Straight down is the reference the dial is measured from, so 0°
 *      is a fighter standing square and every value means the same thing on
 *      every model.
 *   2. Points the shin along the thigh, so the leg is one straight line from
 *      hip to ankle. The knee bend the delivery came with is gone — including
 *      the half-bend that made a fighter look like they were about to sit
 *      down.
 *   3. Levels the sole: the foot is turned until the toes point along the
 *      floor rather than into it, then rolled until it is not standing on its
 *      edge. Yaw is untouched, so a foot turned out stays turned out.
 *   4. Drops the hips by whatever height the feet gained, so the fighter keeps
 *      the ground contact their idle had. Straightening a bent knee makes
 *      somebody taller, and a fighter who grows also floats.
 *
 * Idle only, and composed onto the clip rather than replacing it: everything
 * above the hips is still the delivered pose.
 */
export function applyIdleStand(THREE, root3d, deg, tmp) {
  const legs = ["Left", "Right"].map((side) => ({
    up: root3d.getObjectByName(`${side}UpLeg`),
    lo: root3d.getObjectByName(`${side}Leg`),
    foot: root3d.getObjectByName(`${side}Foot`),
  }));
  if (!legs[0].up || !legs[1].up) return false;
  root3d.updateMatrixWorld(true);

  // The pelvis's own width axis, hip joint to hip joint.
  const span = tmp.v4.setFromMatrixPosition(legs[1].up.matrixWorld)
    .sub(tmp.v5.setFromMatrixPosition(legs[0].up.matrixWorld));
  const lateral = tmp.v3.set(span.x, 0, span.z);
  if (lateral.lengthSq() < 1e-8) return false;
  lateral.normalize();
  // axis = lateral x up: turning a leg about it moves the foot along lateral.
  const axis = tmp.v5.set(-lateral.z, 0, lateral.x).normalize();

  const floorBefore = footFloor(legs, tmp);

  // LEVEL THE PELVIS. An idle usually rests its weight on one leg, which rolls
  // the hips — and with both legs then hanging straight down from hip joints
  // at different heights, one foot ends up in the air. Rolling the pelvis
  // level costs nothing above the waist (the spine keeps its own rotation, so
  // a lean stays a lean) and puts both hip joints on one line to hang from.
  const hips = root3d.getObjectByName("Hips");
  if (hips && span.lengthSq() > 1e-8) {
    turnBoneWorld(THREE, hips, tmp.q1.setFromUnitVectors(span.normalize(), lateral), tmp);
    root3d.updateMatrixWorld(true);
  }

  // MATCH THE LEG LENGTHS, which is not a thing a pose layer should have to do
  // and is unarguably what the deliveries need. Levelling the pelvis made the
  // float WORSE on several fighters, which was the clue: their idle's pelvis
  // roll was covering for legs of different lengths. Measured hip joint to
  // ankle, twenty of the twenty-seven are asymmetric, and Geto's right leg is
  // 12 cm longer than his left — 13%, a limp built into the skeleton. So each
  // leg is scaled to the pair's MEAN rather than the shorter one stretched to
  // the longer: half the correction each way is half the visible change, and
  // at these sizes (±6% at the worst, under 2% for most) it reads as nothing
  // at all, where a foot hanging 12 cm off the floor reads immediately.
  equaliseLegs(legs, tmp);
  root3d.updateMatrixWorld(true);
  const rad = (deg * Math.PI) / 180;
  for (let i = 0; i < 2; i++) {
    const sign = i === 0 ? -1 : 1; // apart, not both the same way
    const { up, lo, foot } = legs[i];
    // Straight down, then out by the stance. One direction for the whole leg.
    const dir = tmp.v6.set(0, -1, 0).applyAxisAngle(axis, sign * rad).normalize();

    up.updateWorldMatrix(true, false);
    const hip = tmp.p1.setFromMatrixPosition(up.matrixWorld);
    if (lo) {
      lo.updateWorldMatrix(true, false);
      const knee = tmp.p2.setFromMatrixPosition(lo.matrixWorld);
      const thighLen = knee.distanceTo(hip);
      aimBoneAt(THREE, up, hip, knee, tmp.p3.copy(hip).addScaledVector(dir, thighLen), tmp);
      if (foot) {
        lo.updateWorldMatrix(true, false);
        foot.updateWorldMatrix(true, false);
        const knee2 = tmp.p1.setFromMatrixPosition(lo.matrixWorld);
        const ankle = tmp.p2.setFromMatrixPosition(foot.matrixWorld);
        const shinLen = ankle.distanceTo(knee2);
        aimBoneAt(THREE, lo, knee2, ankle, tmp.p3.copy(knee2).addScaledVector(dir, shinLen), tmp);
      }
    } else if (foot) {
      foot.updateWorldMatrix(true, false);
      const ankle = tmp.p2.setFromMatrixPosition(foot.matrixWorld);
      aimBoneAt(THREE, up, hip, ankle,
        tmp.p3.copy(hip).addScaledVector(dir, ankle.distanceTo(hip)), tmp);
    }
    if (foot) levelSole(THREE, foot, tmp);
  }
  root3d.updateMatrixWorld(true);

  // A straightened leg is a longer leg, and a splayed one is shorter. Either
  // way the fighter keeps the floor they were standing on.
  const floorAfter = footFloor(legs, tmp);
  if (hips && hips.parent && floorBefore !== null && floorAfter !== null
      && Math.abs(floorAfter - floorBefore) > 1e-4) {
    tmp.v6.setFromMatrixPosition(hips.matrixWorld);
    tmp.v6.y -= floorAfter - floorBefore;
    hips.position.copy(hips.parent.worldToLocal(tmp.v6));
    root3d.updateMatrixWorld(true);
  }
  return true;
}

/**
 * SWING THE LEGS IN OR OUT, about the fighter's FORWARD axis. Positive brings
 * the knees — and the feet with them — toward the midline.
 *
 * WHAT IT IS FOR. Generated legs arrive bandy: the knees sit outboard of the
 * line from hip to foot and the whole leg bows away from the body, which reads
 * at game size as a fighter standing on the outside edges of their boots. It
 * is a fact about the FILE, so it is applied under every state rather than
 * posed around, and the eye judges it in the idle review.
 *
 * ABOUT FORWARD, WHICH IS THE ONLY AXIS THAT MOVES A KNEE SIDEWAYS. The first
 * version of this turned each leg about its OWN LENGTH, on the theory that the
 * fault was a femur built externally rotated — which does square a kneecap and
 * a toe to the front, and is a real thing some of these rigs have, but is not
 * what "the knees bend outward" describes. A roll about the leg cannot move a
 * knee closer to its neighbour; only a rotation about the fore-aft axis does
 * that, and that is what this is now.
 *
 * IT PIVOTS AT THE KNEE, which is the whole difference between this and the
 * stance. The version before this one turned the THIGH, and turning a thigh
 * moves everything hanging off it: the knee travelled, the ankle travelled,
 * and the fighter simply stood narrower — which is `stanceDeg` with a second
 * name on it. Hinging the SHIN instead leaves the hips and the knees exactly
 * where the pose put them and swings only what is below them, so the bow comes
 * out of the leg rather than the width coming out of the stance.
 *
 * WHICH BONE. `${side}Leg`, whose head IS the knee joint in this skeleton —
 * `UpLeg` is the thigh and `Leg` the shin, so "the knee" as a thing to rotate
 * is the shin bone. Worth saying out loud because the name reads like the
 * whole limb and the last two attempts both grabbed the wrong end of it.
 *
 * THE FOOT KEEPS ITS ANGLE TO THE GROUND. Swinging a shin tips the sole onto
 * its edge by exactly the swing, so each foot is re-levelled afterwards —
 * pitch and roll only. Yaw is left alone, because which way a fighter's toes
 * point is a pose and this is not the dial for it.
 */
export function applyKneeTurn(THREE, root3d, deg, tmp) {
  if (!deg) return false;
  const hipL = root3d.getObjectByName("LeftUpLeg");
  const hipR = root3d.getObjectByName("RightUpLeg");
  if (!hipL || !hipR) return false;
  root3d.updateMatrixWorld(true);
  // The pelvis's own width line, hip joint to hip joint, flattened — the same
  // basis `applyIdleStand` opens the stance about, and for the same reason: a
  // rig's local +Z is a claim about facing that `yawOffsetDeg` exists to say
  // is false, while two hip joints are where they are.
  const lateral = tmp.v7.setFromMatrixPosition(hipL.matrixWorld)
    .sub(tmp.v6.setFromMatrixPosition(hipR.matrixWorld));
  lateral.y = 0;
  if (lateral.lengthSq() < 1e-8) return false;
  lateral.normalize();
  // forward = up x lateral. Turning a shin about it swings the foot along the
  // width line, which is the whole point.
  const axis = tmp.v6.set(-lateral.z, 0, lateral.x).normalize();
  const rad = (deg * Math.PI) / 180;
  let turned = 0;
  for (const side of ["Left", "Right"]) {
    // The SHIN, not the thigh: the knee is this bone's head, so rotating it
    // pivots there and leaves the thigh alone.
    const shin = root3d.getObjectByName(`${side}Leg`);
    if (!shin) continue;
    // Mirrored, so one number closes both legs by the same amount rather than
    // walking the fighter sideways.
    rotateBoneAboutWorldAxis(THREE, shin, axis, (side === "Left" ? -1 : 1) * rad, tmp);
    root3d.updateMatrixWorld(true);
    const foot = root3d.getObjectByName(`${side}Foot`);
    if (foot) levelSole(THREE, foot, tmp);
    turned++;
  }
  if (turned) root3d.updateMatrixWorld(true);
  return turned > 0;
}

/** The bind (rest) world matrix of every bone, cached on the root.
 *
 *  `boneInverses[i]` is the inverse of bone i's world matrix at bind, so its
 *  inverse is that matrix — the pose the MODEL was built in, before any clip
 *  touched it. That is the only place a bone's neutral ROLL is recorded, and
 *  roll is the half of an arm that aiming does not set. */
function bindFrames(THREE, root3d) {
  if (root3d.userData.__bind) return root3d.userData.__bind;
  let out = null;
  root3d.traverse((o) => {
    if (out || !o.isSkinnedMesh || !o.skeleton) return;
    const map = new Map();
    o.skeleton.bones.forEach((b, i) => {
      const m = new THREE.Matrix4().copy(o.skeleton.boneInverses[i]).invert();
      map.set(b.name, {
        pos: new THREE.Vector3().setFromMatrixPosition(m),
        quat: new THREE.Quaternion().setFromRotationMatrix(m),
      });
    });
    out = map;
  });
  root3d.userData.__bind = out || new Map();
  return root3d.userData.__bind;
}

/**
 * Point a bone along `dir` FROM ITS BIND POSE, keeping the bind roll.
 *
 * The difference from aimBoneAt, and the whole reason this exists: aimBoneAt
 * turns the bone from wherever the clip left it, by the shortest rotation that
 * lands on the target. That sets the bone's DIRECTION and inherits its TWIST,
 * and for a limb the twist is what decides which way the joint below it
 * hinges. Straightening a delivered idle's arms this way left every elbow
 * pointing wherever that fighter's clip happened to roll the upper arm —
 * Gojo's forward, so his arm read as hinging backwards.
 *
 * Rotating from BIND instead makes the roll a fact about the model: the pose
 * the mesh was built and weighted in, where the elbow points the way the
 * modeller drew it. The rotation used is the minimal one from the bind
 * direction to `dir`, which is a pure swing and adds no twist of its own.
 */
function aimBoneFromBind(THREE, root3d, bone, childName, dir, tmp, rootQ) {
  const bind = bindFrames(THREE, root3d);
  const here = bind.get(bone.name);
  const child = bind.get(childName);
  if (!here || !child) return false;
  // BIND IS THE MODEL'S FRAME; `dir` IS THE WORLD'S. bindFrames reads the
  // skeleton's own inverse-bind matrices, which know nothing about the yaw
  // poseRig puts on the root — the delivery's own facing plus the turnaround.
  // Comparing the two directly silently discards that yaw, so every fighter
  // whose model was built facing somewhere other than the camera had their arm
  // aimed along an axis turned by their `yawOffsetDeg`. Carrying bind into the
  // world first is the whole fix, and it is a no-op on a rig with no offset,
  // which is why it went unseen: Yuji is 0 and reads perfectly.
  const bindDir = tmp.v1.copy(child.pos).sub(here.pos);
  if (bindDir.lengthSq() < 1e-10) return false;
  bindDir.normalize().applyQuaternion(rootQ);
  const swing = tmp.q1.setFromUnitVectors(bindDir, dir);
  const want = tmp.q2.copy(rootQ).multiply(here.quat).premultiply(swing);
  const parent = bone.parent
    ? bone.parent.getWorldQuaternion(new THREE.Quaternion())
    : new THREE.Quaternion();
  bone.quaternion.copy(parent.invert().multiply(want));
  bone.updateMatrixWorld(true);
  return true;
}

/** Put one bone's LOCAL rotation back to what it was at bind. */
function setLocalFromBind(THREE, root3d, bone, bind) {
  const here = bind.get(bone.name);
  const parent = bone.parent && bind.get(bone.parent.name);
  if (!here) return;
  const local = parent
    ? new THREE.Quaternion().copy(parent.quat).invert().multiply(here.quat)
    : here.quat.clone();
  bone.quaternion.copy(local);
  bone.updateMatrixWorld(true);
}

/**
 * THE POSE THE MODEL WAS BUILT IN — every bone, rotation and position, back to
 * the skeleton's own bind.
 *
 * The rig-check poses stand on this, and nothing else in the engine can give
 * it. `restoreClean` (pose.js) restores the pose the CLIP left, which after
 * one frame of anything is not the bind; a mixer with no action playing leaves
 * bones wherever they were. Only the inverse-bind matrices remember the rest
 * pose, so that is what this reads.
 *
 * Positions as well as rotations, because the shoulder-width correction is a
 * TRANSLATION on the arm roots — a bind restore that only put rotations back
 * would leave the previous pose's widening on the bone and quietly double it.
 */
export function applyBindPose(THREE, root3d) {
  const bind = bindFrames(THREE, root3d);
  if (!bind.size) return false;
  const seen = [];
  root3d.traverse((o) => { if (o.isBone && bind.has(o.name)) seen.push(o); });
  // Parents first: a child's local transform is read against a parent that has
  // to be at bind already, or the pose comes out compounding down the chain.
  for (const bone of seen) {
    const here = bind.get(bone.name);
    const parentBind = bone.parent && bind.get(bone.parent.name);
    if (parentBind) {
      const inv = new THREE.Quaternion().copy(parentBind.quat).invert();
      bone.quaternion.copy(inv.clone().multiply(here.quat));
      bone.position.copy(
        new THREE.Vector3().copy(here.pos).sub(parentBind.pos).applyQuaternion(inv));
    } else {
      bone.quaternion.copy(here.quat);
      bone.position.copy(here.pos);
    }
    bone.scale.set(1, 1, 1);
  }
  root3d.updateMatrixWorld(true);
  return true;
}

/** Put one bone's WORLD rotation back to bind, whatever its parent is doing. */
function setLocalFromBindWorld(THREE, bone, bindHere, rootQ) {
  const parent = bone.parent
    ? bone.parent.getWorldQuaternion(new THREE.Quaternion())
    : new THREE.Quaternion();
  // Same frame correction as aimBoneFromBind: the bind orientation is the
  // MODEL's, and setting it as a world orientation un-yaws the bone. On the
  // clavicle that rotated both shoulders by the fighter's own yaw offset,
  // which is what made the review's shoulder-width dial push one shoulder
  // forward and the other back instead of both outward.
  const want = new THREE.Quaternion().copy(rootQ).multiply(bindHere.quat);
  bone.quaternion.copy(parent.invert().multiply(want));
  bone.updateMatrixWorld(true);
}

/** Straighten an elbow only as far as it is bent past `MAX_IDLE_ELBOW`.
 *
 *  A relaxed arm is not a straight arm, and most binds carry a sensible bend
 *  that should survive. A bind holding 78 degrees is a delivery that arrived
 *  mid-pose, and that one has to come back — but only to the limit, not to
 *  straight, because every degree of correction is a degree the skin was not
 *  weighted for. */
function clampElbow(THREE, root3d, fore, handName, dir, tmp) {
  const hand = root3d.getObjectByName(handName);
  if (!hand) return;
  fore.updateWorldMatrix(true, false);
  hand.updateWorldMatrix(true, false);
  const here = tmp.p1.setFromMatrixPosition(fore.matrixWorld);
  const wrist = tmp.p2.setFromMatrixPosition(hand.matrixWorld);
  const have = tmp.v2.copy(wrist).sub(here);
  if (have.lengthSq() < 1e-10) return;
  have.normalize();
  const bend = Math.acos(Math.max(-1, Math.min(1, have.dot(dir)))) * 180 / Math.PI;
  if (bend <= MAX_IDLE_ELBOW) return;
  const swing = new THREE.Quaternion().setFromUnitVectors(have, dir);
  const part = new THREE.Quaternion().slerp(swing, (bend - MAX_IDLE_ELBOW) / bend);
  const parent = fore.parent
    ? fore.parent.getWorldQuaternion(new THREE.Quaternion())
    : new THREE.Quaternion();
  const want = part.multiply(fore.getWorldQuaternion(new THREE.Quaternion()));
  fore.quaternion.copy(parent.invert().multiply(want));
  fore.updateMatrixWorld(true);
}

/**
 * HOW A FIGHTER CARRIES THEIR ARMS in their idle: hanging as the model was
 * built, out from the body by `deg`, with the shoulders squared.
 *
 * THE SAME ARGUMENT AS THE LEGS, one axis later. `applyIdleStand` rebuilt the
 * legs because a generated idle arrives with whatever the generator felt about
 * standing, it is different on every fighter, and it reads as sloppiness
 * rather than as personality. Everything above the hips was left alone, and
 * the arms turned out to be worse than the legs ever were: measured across the
 * roster at rest, the elbow ran from 171° (all but straight) to 104° (a hand
 * held at the chest), and the wrist's distance from the body's centreline
 * varied SIX-FOLD. Uro and Sukuna stand with their hands up; Yuji's hang at
 * his sides. None of that was anybody's decision about the character.
 *
 * WHY OUT AND NOT DOWN. Arms hung dead flat against the ribs read as
 * attention, not as rest, and they also intersect the coat on the wider
 * fighters. A few degrees of abduction is what "relaxed" looks like, and it is
 * the same shape of dial as the legs' stance: one number, measured from
 * straight down, meaning the same thing on every model.
 *
 * THE ELBOW KEEPS THE BEND THE MODEL WAS BUILT WITH. The first version forced
 * the arm dead straight, and that is what made Gojo's elbow read as hinging
 * the wrong way: measured across the roster, a bind pose carries 27-33 degrees
 * of elbow bend (Nanami's left arm 78), and straightening it rotates the
 * forearm that far against skin weighted for the bent pose. The mesh folds at
 * the joint. Nobody stands with locked elbows anyway, so the arm is swung as
 * ONE RIGID PIECE from bind and the bend comes along — clamped at
 * MAX_IDLE_ELBOW, because a bind that arrived at 78 degrees is not a relaxed
 * arm, it is a delivery holding a pose.
 *
 * THE SHOULDER IS RESET TOO, and it has to be. The clavicle carries whatever
 * the delivered clip left on it, which is where "one shoulder squashed into
 * the body" comes from: Gojo's arm roots sat 6 cm apart in height and 3 cm
 * apart in distance from the spine, one hunched and one not. Putting both back
 * to bind makes the pair symmetric; `outM` then moves them outward together,
 * for a fighter whose shoulders read narrow.
 *
 * WHAT IT DOES NOT TOUCH. The wrist, so a hand posed around a weapon keeps its
 * grip; and any fighter whose manifest says `idleArms: false`, whose delivered
 * idle is a pose somebody wants (Sukuna's).
 *
 * AND THE WEAPON COMES WITH IT. A prop hangs off the hand bone, so moving the
 * arm moves the weapon — a straightened arm carries a polearm to the fighter's
 * side with the butt near the floor, which is the carry. The off hand joins
 * the shaft separately (applyTwoHandGrip, which now runs in idle too).
 */
export const MAX_IDLE_ELBOW = 25;

export function applyIdleArms(THREE, root3d, deg, tmp) {
  const arms = ["Left", "Right"].map((side) => ({
    up: root3d.getObjectByName(`${side}Arm`),
    lo: root3d.getObjectByName(`${side}ForeArm`),
    hand: root3d.getObjectByName(`${side}Hand`),
  }));
  if (!arms[0].up || !arms[1].up) return false;
  root3d.updateMatrixWorld(true);

  // The chest's own width axis, shoulder joint to shoulder joint — the same
  // trick the legs use on the pelvis, and for the same reason: it does not ask
  // the manifest which way anybody faces, so `yawOffsetDeg` cannot mislead it.
  const span = tmp.v4.setFromMatrixPosition(arms[1].up.matrixWorld)
    .sub(tmp.v5.setFromMatrixPosition(arms[0].up.matrixWorld));
  const lateral = tmp.v3.set(span.x, 0, span.z);
  if (lateral.lengthSq() < 1e-8) return false;
  lateral.normalize();
  const axis = tmp.v5.set(-lateral.z, 0, lateral.x).normalize();

  // The rig's own rotation, once: everything below reads bind frames, which
  // are the model's, and acts in the world.
  const rootQ = root3d.getWorldQuaternion(new THREE.Quaternion());

  const rad = (deg * Math.PI) / 180;
  for (let i = 0; i < 2; i++) {
    const sign = i === 0 ? -1 : 1; // away from the body, not both the same way
    const { up, lo, hand } = arms[i];
    const dir = tmp.v6.set(0, -1, 0).applyAxisAngle(axis, sign * rad).normalize();

    // FROM BIND, not from the clip: the bind pose is where the elbow's hinge
    // is recorded. Aiming from wherever the delivery left the arm carries that
    // clip's twist into the idle, and a twisted upper arm is an elbow that
    // points the wrong way.
    const side = i === 0 ? "Left" : "Right";
    const bind = bindFrames(THREE, root3d);

    // The clavicle first, back to the pose the body was built in. Everything
    // below hangs off it, so an arm aimed correctly from a hunched shoulder is
    // still an arm coming out of the wrong place.
    const clav = root3d.getObjectByName(`${side}Shoulder`);
    if (clav && bind.has(clav.name)) {
      setLocalFromBindWorld(THREE, clav, bind.get(clav.name), rootQ);
    }

    if (lo) {
      aimBoneFromBind(THREE, root3d, up, `${side}ForeArm`, dir, tmp, rootQ);
      // The forearm rides along: its BIND local rotation, so the elbow keeps
      // the bend and the crease the modeller gave it, and the skin sees no
      // relative rotation at the joint at all.
      if (bind.has(lo.name)) {
        setLocalFromBind(THREE, root3d, lo, bind);
        clampElbow(THREE, root3d, lo, `${side}Hand`, dir, tmp);
      }
    } else if (hand) {
      aimBoneFromBind(THREE, root3d, up, `${side}Hand`, dir, tmp, rootQ);
    }

  }
  root3d.updateMatrixWorld(true);
  return true;
}

/**
 * LENGTHEN THE SHOULDERS: move both arm roots out along the body's own width
 * axis. A translation rather than a scale, so the arms keep their length —
 * what reads as squashed is where the arm STARTS, not how long it is.
 *
 * A MODEL FIX, NOT A POSE, which is why it lives out here on its own rather
 * than inside the idle. It used to be a parameter of `applyIdleArms` and so
 * only happened at rest, and the fighters carrying one visibly narrowed the
 * instant they moved: Uro's shoulders measured 37.6 cm apart standing and
 * 24.9 cm mid-punch, the whole 12.7 cm being twice her 6.5 cm correction
 * arriving and leaving. See render3d/src/rig_fixes.js, which owns the list of
 * corrections this belongs to and applies it under every state.
 */
export function applyShoulderWidth(THREE, root3d, outM, tmp) {
  if (!outM) return false;
  const arms = ["Left", "Right"].map((s) => root3d.getObjectByName(`${s}Arm`));
  if (!arms[0] || !arms[1]) return false;
  root3d.updateMatrixWorld(true);
  // The chest's own width axis, shoulder joint to shoulder joint — the same
  // measurement applyIdleArms makes, and for the same reason: it never asks
  // the manifest which way anybody faces, so `yawOffsetDeg` cannot mislead it.
  const span = tmp.v4.setFromMatrixPosition(arms[1].matrixWorld)
    .sub(tmp.v5.setFromMatrixPosition(arms[0].matrixWorld));
  const lateral = tmp.v3.set(span.x, 0, span.z);
  if (lateral.lengthSq() < 1e-8) return false;
  lateral.normalize();
  for (let i = 0; i < 2; i++) {
    const bone = arms[i];
    const sign = i === 0 ? -1 : 1; // apart, not both the same way
    if (!bone.parent) continue;
    bone.updateWorldMatrix(true, false);
    tmp.p1.setFromMatrixPosition(bone.matrixWorld).addScaledVector(lateral, sign * outM);
    bone.position.copy(bone.parent.worldToLocal(tmp.p1));
    bone.updateMatrixWorld(true);
  }
  root3d.updateMatrixWorld(true);
  return true;
}

/** Hip joint to ankle, following the knee — the length that decides how far
 *  off the floor this foot ends up. */
function legLength(leg, tmp) {
  if (!leg.up || !leg.foot) return 0;
  leg.up.updateWorldMatrix(true, false);
  leg.foot.updateWorldMatrix(true, false);
  const hip = tmp.p1.setFromMatrixPosition(leg.up.matrixWorld);
  const ankle = tmp.p2.setFromMatrixPosition(leg.foot.matrixWorld);
  if (!leg.lo) return hip.distanceTo(ankle);
  leg.lo.updateWorldMatrix(true, false);
  const knee = tmp.p3.setFromMatrixPosition(leg.lo.matrixWorld);
  return hip.distanceTo(knee) + knee.distanceTo(ankle);
}

/** Scale both legs to their mean length. Scaling the thigh takes the whole
 *  chain below it, which is the point — a leg is lengthened, not a thigh. */
function equaliseLegs(legs, tmp) {
  for (const leg of legs) leg.up.scale.set(1, 1, 1);
  legs[0].up.parent?.updateMatrixWorld(true);
  const a = legLength(legs[0], tmp);
  const b = legLength(legs[1], tmp);
  if (a < 1e-4 || b < 1e-4) return;
  const mean = (a + b) / 2;
  legs[0].up.scale.setScalar(mean / a);
  legs[1].up.scale.setScalar(mean / b);
}

/** Give the legs their delivered lengths back. The clean-pose buffer restores
 *  rotations and positions but not SCALE, so a scale left on by the idle would
 *  follow the fighter into every other state (pose.js calls this there). */
export function clearIdleStand(root3d) {
  for (const side of ["Left", "Right"]) {
    const up = root3d.getObjectByName(`${side}UpLeg`);
    if (up && (up.scale.x !== 1 || up.scale.y !== 1 || up.scale.z !== 1)) up.scale.set(1, 1, 1);
  }
}

/**
 * Put the sole on the floor: level the foot without turning it.
 *
 * Two rotations, because a foot can be wrong in two ways and fixing one leaves
 * the other. First the toe direction is brought into the horizontal plane —
 * that is toes-down and toes-up. Then the foot is rolled about that direction
 * until its most upright axis is as upright as it can be — that is standing on
 * the inside or outside edge. What is deliberately NOT touched is yaw: a
 * fighter whose feet splay outward keeps them splayed, because that is a pose,
 * not an error.
 */
function levelSole(THREE, foot, tmp) {
  foot.updateWorldMatrix(true, false);
  const at = tmp.p1.setFromMatrixPosition(foot.matrixWorld);
  const toe = foot.children.find((c) => c.isBone);
  let dir;
  if (toe) {
    toe.updateWorldMatrix(true, false);
    dir = tmp.v1.setFromMatrixPosition(toe.matrixWorld).sub(at);
  } else {
    // No toe bone: the standard skeleton's foot points along its own +Y.
    dir = tmp.v1.set(0, 1, 0).applyQuaternion(foot.getWorldQuaternion(tmp.q3));
  }
  if (dir.lengthSq() < 1e-10) return;
  dir.normalize();
  const flat = tmp.v2.set(dir.x, 0, dir.z);
  if (flat.lengthSq() < 1e-8) return; // a foot pointing straight up or down
  flat.normalize();
  turnBoneWorld(THREE, foot, tmp.q1.setFromUnitVectors(dir, flat), tmp);

  // Roll. Of the foot's own three axes, take whichever now stands closest to
  // vertical and bring it the rest of the way.
  foot.updateWorldMatrix(true, false);
  const m = foot.matrixWorld.elements;
  let best = null, bestDot = 0;
  for (const [i, v] of [[0, tmp.v3], [1, tmp.v4], [2, tmp.v6]]) {
    const c = v.set(m[i * 4], m[i * 4 + 1], m[i * 4 + 2]).normalize();
    const d = c.y;
    if (Math.abs(d) > Math.abs(bestDot)) { bestDot = d; best = v; }
  }
  if (!best || Math.abs(bestDot) < 0.2) return; // no axis is meaningfully "up"
  if (bestDot < 0) best.negate();
  // Both the axis and world up, measured in the plane perpendicular to the toe
  // direction — the only plane a roll can move anything in.
  const cur = tmp.v7.copy(best).addScaledVector(flat, -best.dot(flat));
  const up = tmp.v1.set(0, 1, 0).addScaledVector(flat, -flat.y);
  if (cur.lengthSq() < 1e-8 || up.lengthSq() < 1e-8) return;
  cur.normalize();
  up.normalize();
  turnBoneWorld(THREE, foot, tmp.q1.setFromUnitVectors(cur, up), tmp);
}

/** Compose a WORLD-space rotation onto a bone, keeping everything the clip and
 *  the layers before it did. */
function turnBoneWorld(THREE, bone, deltaWorld, tmp) {
  const world = bone.getWorldQuaternion(tmp.q2);
  const parentWorld = bone.parent ? bone.parent.getWorldQuaternion(tmp.q3) : tmp.q3.identity();
  bone.quaternion.copy(parentWorld.invert().multiply(deltaWorld.multiply(world)));
  bone.updateMatrixWorld(true);
}

/** The lower of the two ankles, in world Y — the height the stand has to hold
 *  on to. Null when neither foot exists. */
function footFloor(legs, tmp) {
  let y = null;
  for (const leg of legs) {
    const foot = leg.foot || leg.lo;
    if (!foot) continue;
    const fy = tmp.v7.setFromMatrixPosition(foot.matrixWorld).y;
    y = y === null ? fy : Math.min(y, fy);
  }
  return y;
}

export function initLayerAxes(THREE) {
  _lq = new THREE.Quaternion();
}
