// RigAdapter: retargets the game's virtual joint rig (driven by Animator)
// onto an arbitrary humanoid skeleton (Mixamo / Meshy / Tripo auto-rigs).
//
// Method: world-space rotation offsets. At setup we pose the virtual rig to
// semantically match the model's bind pose (T-pose, A-pose...), then record
// per-joint offset O = worldQuat(virtualJoint)^-1 * worldQuat(bone).
// At runtime, after the Animator poses the virtual rig, each mapped bone is
// set (parents first) to  local = parentWorld^-1 * jointWorld * O.
// This is convention-free: bone axis layouts never need per-axis hacks.
import * as THREE from 'three';

const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _e = new THREE.Euler();
const D2R = Math.PI / 180;

// Ordered parent-first to match how we propagate world quats.
export const JOINT_ORDER = [
  'hips', 'torso', 'head',
  'shoulderL', 'elbowL', 'handL',
  'shoulderR', 'elbowR', 'handR',
  'thighL', 'kneeL', 'ankleL',
  'thighR', 'kneeR', 'ankleR',
];

// Bone-name aliases per joint (matched case-insensitively as suffix, with
// namespace prefixes like "mixamorig:" stripped). Order = preference. The
// joint's OWN name leads every list, so a hand-authored or BAKED GLB whose
// bones are named exactly as the game joints (hips, torso, shoulderL, ...)
// auto-maps with no boneOverrides — the finalized form after tools/bake-glb.
const BONE_ALIASES = {
  hips: ['hips', 'pelvis', 'hip', 'root_m', 'spine_00'],
  torso: ['torso', 'spine2', 'spine1', 'chest', 'spine', 'upperchest'],
  head: ['head', 'neck'],
  shoulderL: ['shoulderl', 'leftarm', 'l_upperarm', 'upperarm_l', 'arm_l', 'leftupperarm', 'shoulder_l', 'l_arm'],
  elbowL: ['elbowl', 'leftforearm', 'l_forearm', 'forearm_l', 'lowerarm_l', 'leftlowerarm', 'elbow_l', 'l_elbow'],
  handL: ['handl', 'lefthand', 'l_hand', 'hand_l', 'wrist_l'],
  shoulderR: ['shoulderr', 'rightarm', 'r_upperarm', 'upperarm_r', 'arm_r', 'rightupperarm', 'shoulder_r', 'r_arm'],
  elbowR: ['elbowr', 'rightforearm', 'r_forearm', 'forearm_r', 'lowerarm_r', 'rightlowerarm', 'elbow_r', 'r_elbow'],
  handR: ['handr', 'righthand', 'r_hand', 'hand_r', 'wrist_r'],
  thighL: ['thighl', 'leftupleg', 'l_thigh', 'thigh_l', 'upleg_l', 'leftupperleg', 'leg_l'],
  kneeL: ['kneel', 'leftleg', 'l_calf', 'calf_l', 'shin_l', 'leftlowerleg', 'knee_l', 'lowerleg_l', 'l_shin', 'l_knee'],
  ankleL: ['anklel', 'leftfoot', 'l_foot', 'foot_l', 'ankle_l'],
  thighR: ['thighr', 'rightupleg', 'r_thigh', 'thigh_r', 'upleg_r', 'rightupperleg', 'leg_r'],
  kneeR: ['kneer', 'rightleg', 'r_calf', 'calf_r', 'shin_r', 'rightlowerleg', 'knee_r', 'lowerleg_r', 'r_shin', 'r_knee'],
  ankleR: ['ankler', 'rightfoot', 'r_foot', 'foot_r', 'ankle_r'],
};

// How to pose OUR virtual rig so it matches the model's bind pose while the
// offsets are captured. Degrees, applied on top of the mech's rest pose.
export const BIND_PRESETS = {
  // arms straight out to the sides (Mixamo, most auto-riggers)
  tpose: {
    shoulderL: [0, 0, 92], shoulderR: [0, 0, -92],
    elbowL: [0, 0, 0], elbowR: [0, 0, 0],
  },
  // arms ~45° down (many game-ready rigs)
  apose: {
    shoulderL: [0, 0, 47], shoulderR: [0, 0, -47],
    elbowL: [0, 0, 0], elbowR: [0, 0, 0],
  },
  // model already stands arms-down like our rest pose
  native: {},
};

function normName(name) {
  const n = name.toLowerCase();
  const i = n.lastIndexOf(':');
  return (i >= 0 ? n.slice(i + 1) : n).replace(/[\s._-]/g, '');
}

// Find a bone for each joint among the model's bones.
export function mapBones(bones, overrides = {}) {
  const byName = new Map();
  for (const b of bones) byName.set(normName(b.name), b);
  const map = {};
  const taken = new Set();
  for (const joint of JOINT_ORDER) {
    if (overrides[joint]) {
      const b = bones.find((bb) => bb.name === overrides[joint]);
      if (b) { map[joint] = b; taken.add(b); }
      continue;
    }
    for (const alias of BONE_ALIASES[joint]) {
      const key = alias.replace(/[\s._-]/g, '');
      let found = byName.get(key);
      if (!found) {
        // suffix match (e.g. "mixamorigLeftArm" normalized ends with "leftarm")
        for (const [n, b] of byName) {
          if (n.endsWith(key) && !taken.has(b)) { found = b; break; }
        }
      }
      if (found && !taken.has(found)) { map[joint] = found; taken.add(found); break; }
    }
  }
  return map;
}

export class RigAdapter {
  /**
   * @param joints  the game's virtual joint groups (from buildRig), already
   *                parented under mech root; Animator drives these.
   * @param boneMap joint name -> THREE.Bone
   * @param opts    { bindPose: 'tpose'|'apose'|'native'|object, hipsScale }
   */
  constructor(joints, boneMap, opts = {}) {
    this.joints = joints;
    this.entries = []; // ordered: {joint, bone, offset, parentEntry|null}

    const bindPose = typeof opts.bindPose === 'string'
      ? BIND_PRESETS[opts.bindPose] || {}
      : opts.bindPose || {};

    // 1) pose virtual rig into the model's bind stance (on top of whatever
    //    rest pose the Animator has already applied)
    const saved = {};
    for (const [jname, deg] of Object.entries(bindPose)) {
      const j = joints[jname];
      if (!j) continue;
      saved[jname] = j.rotation.clone();
      j.rotation.set(
        j.rotation.x + deg[0] * D2R,
        j.rotation.y + deg[1] * D2R,
        j.rotation.z + deg[2] * D2R
      );
    }
    joints.root.updateWorldMatrix(true, true);

    // 2) capture world-space offsets, parent-first
    const jointWorld = {};
    const entryByBone = new Map();
    for (const jname of JOINT_ORDER) {
      const joint = joints[jname];
      const bone = boneMap[jname];
      if (!joint || !bone) continue;
      bone.updateWorldMatrix(true, false);
      const jw = joint.getWorldQuaternion(new THREE.Quaternion());
      const bw = bone.getWorldQuaternion(new THREE.Quaternion());
      jointWorld[jname] = jw;
      const offset = jw.clone().invert().multiply(bw);
      // nearest mapped ancestor bone (for local conversion at runtime)
      let parentEntry = null;
      let p = bone.parent;
      while (p) {
        if (entryByBone.has(p)) { parentEntry = entryByBone.get(p); break; }
        p = p.parent;
      }
      // bind rotation of unmapped bones sitting BETWEEN this bone and its
      // nearest mapped ancestor (e.g. Tripo rigs: torso bone under an
      // unmapped mid-spine bone). Their locals never change at runtime, so
      // the true live parent world = ancestorWorld * interQ. Dropping this
      // (the old behavior) breaks any rig whose intermediates aren't
      // identity — Tripo v2.5 skeletons have ~90–160° ones.
      const interQ = new THREE.Quaternion();
      if (parentEntry) {
        const chain = [];
        for (let a = bone.parent; a && a !== parentEntry.bone; a = a.parent) chain.push(a);
        for (let i = chain.length - 1; i >= 0; i--) interQ.multiply(chain[i].quaternion);
      }
      // Optional hand-authored correction (from the ?debug=pose workbench):
      // an extra rotation applied in bone-LOCAL space after retargeting, to fix
      // systematic bind mismatches (e.g. a shoulder always splayed too far).
      // Degrees [x,y,z] per joint in opts.corrections.
      //
      // A FOURTH NUMBER MAKES IT RAMP: [x, y, z, rampDeg] fades the correction
      // in with how far this joint has rotated AWAY FROM THE BIND POSE, hitting
      // full strength at rampDeg of deviation. That distinction matters because
      // the two things people reach for this lever for are not the same defect:
      //
      //   CONSTANT — the model's bind itself is wrong for the game's rig (a
      //     shoulder authored 15 degrees too wide). Correct everywhere, rest
      //     included.
      //   RAMPING — the bind is RIGHT and the model's own stance is the art;
      //     what is wrong is what the retarget does as the joint SWINGS,
      //     because the rig's next bone sits off-axis (viper's knee bone is
      //     0.05 outboard of his thigh, so a knee lift throws the shin wide).
      //     A constant correction there fixes the swing by restanding the mech
      //     — it flattened viper's authored 12-degree leg splay to 2 and his
      //     battle stance went with it. The error is zero at bind, so the
      //     correction must be too.
      const cd = (opts.corrections || {})[jname];
      const corr = cd ? new THREE.Quaternion().setFromEuler(
        new THREE.Euler(cd[0] * D2R, cd[1] * D2R, cd[2] * D2R)) : null;
      const corrRamp = cd && cd.length > 3 && cd[3] > 0 ? cd[3] * D2R : 0;
      const entry = {
        jname, joint, bone, offset, parentEntry, interQ, corr, corrRamp,
        bindLocalPos: bone.position.clone(),
        // the bone's own bind-pose local rotation: what a RAMPING correction
        // measures deviation from, and by definition the artist's stance
        bindLocalQ: bone.quaternion.clone(),
        world: new THREE.Quaternion(),
      };
      this.entries.push(entry);
      entryByBone.set(bone, entry);
    }

    // hips vertical bob translation scaling (virtual units -> bone-local units).
    // Rest height is captured lazily on first sync, after the Animator has
    // applied its rest pose + ground offset.
    this.hipsEntry = this.entries.find((e) => e.jname === 'hips') || null;
    this.hipsRestY = null;
    this.hipsScale = opts.hipsScale ?? 1;

    // 3) restore rest pose
    for (const [jname, rot] of Object.entries(saved)) {
      joints[jname].rotation.copy(rot);
    }
    joints.root.updateWorldMatrix(true, true);
  }

  // Call every frame AFTER the Animator has posed the virtual joints.
  sync() {
    const root = this.joints.root;
    root.updateWorldMatrix(true, true);
    for (const e of this.entries) {
      // desired bone world = joint world * offset
      e.joint.getWorldQuaternion(_q1);
      _q1.multiply(e.offset);
      e.world.copy(_q1);
      // convert to bone local. For the topmost mapped bone the parent
      // chain isn't animated by us, but it IS carried by the mech root —
      // which the game yaws to face opponents — so its world quat must be
      // read LIVE each frame (root.updateWorldMatrix above refreshed it).
      // A build-time snapshot here double-applies the root yaw: the model
      // faces 2×yaw and appears to fight/walk backwards.
      if (e.parentEntry) _q2.copy(e.parentEntry.world).multiply(e.interQ);
      else if (e.bone.parent) e.bone.parent.getWorldQuaternion(_q2);
      else _q2.identity();
      e.bone.quaternion.copy(_q2.invert().multiply(_q1));
      if (e.corr) {
        // local post-retarget nudge. A ramping one is scaled by how far this
        // bone has swung from its bind rotation, so the authored stance is
        // returned untouched and only the swing is corrected.
        if (e.corrRamp) {
          const dev = e.bone.quaternion.angleTo(e.bindLocalQ);
          const k = Math.min(1, dev / e.corrRamp);
          e.bone.quaternion.multiply(_q3.identity().slerp(e.corr, k));
        } else {
          e.bone.quaternion.multiply(e.corr);
        }
      }
    }
    // hips bob / crouch translation (vertical only, scaled into model units)
    if (this.hipsEntry) {
      if (this.hipsRestY === null) this.hipsRestY = this.joints.hips.position.y;
      const dy = (this.joints.hips.position.y - this.hipsRestY) * this.hipsScale;
      this.hipsEntry.bone.position.copy(this.hipsEntry.bindLocalPos);
      this.hipsEntry.bone.position.y += dy;
    }
  }
}
