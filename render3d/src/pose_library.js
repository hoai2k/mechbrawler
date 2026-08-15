// PUTTING A LIBRARY POSE ON A REAL RIG, and reading it back as bone rotations.
//
// The two pose libraries — battle_poses.js and baseline_poses.js — are written
// in the FIGHTER's own frame from a T-pose, because that is the only way one
// table can describe one human movement for a whole roster. A delivered `.glb`
// is not bound in a T-pose and is not aligned to the world: Yuji arrives with
// his arms at his sides and his facing about 20° off the world axes. So a
// table applied raw turns him to face away from the camera and throws his
// punches over his shoulder, which is exactly what it did.
//
// This module is the translation, and it lives here rather than in the
// workbench because BOTH sides need it and they must not drift: the pose
// editor shows a fighter in a library pose, and the clip builder next door
// bakes the same pose into the animation the game plays. A preview that
// disagrees with the game is worse than no preview.
//
// The conversion, in order:
//
//   1. ANATOMY — measure the fighter's own axes off the bind: lateral is the
//      line through the shoulders, up is the world's, forward is their cross.
//   2. T-POSE — swing the rig into the pose the tables count as zero, using a
//      world-space aim, so the numbers mean the same thing on any bind.
//   3. APPLY — turn each bone about the fighter's axes. Parent-first, and the
//      axes are deliberately NOT carried down the chain: carrying them rotates
//      "lateral" until it runs along the upper arm, and an elbow asked to
//      hinge about its own bone just twists.
//   4. BAKE (optional) — read every driven bone's resulting LOCAL rotation
//      back out as XYZ Euler degrees, which is what clips.js wants.

const DEG = Math.PI / 180;

/** The child each driven bone points AT in the bind pose. Its offset gives the
 *  bone's own forward direction without hardcoding one rig's axis convention. */
export const BONE_TIP = {
  Spine: "Spine1", Spine2: "Neck", Neck: "Head",
  LeftShoulder: "LeftArm", RightShoulder: "RightArm",
  LeftArm: "LeftForeArm", LeftForeArm: "LeftHand",
  RightArm: "RightForeArm", RightForeArm: "RightHand",
  LeftUpLeg: "LeftLeg", LeftLeg: "LeftFoot", LeftFoot: "LeftToeBase",
  RightUpLeg: "RightLeg", RightLeg: "RightFoot", RightFoot: "RightToeBase",
};

/** The inverse of BONE_TIP: which driven bone each one hangs off. */
export const BONE_PARENT = Object.fromEntries(
  Object.entries(BONE_TIP).map(([bone, tip]) => [tip, bone]));

/**
 * The bones a library pose can talk about, PARENT FIRST, and where each points
 * in the reference T-pose.
 *
 * `Head` is deliberately absent: it has no bone below it to aim, so "which way
 * does a head point" resolves to whatever hair or eye bone the rig happens to
 * list first, and aiming THAT upright screws the skull round on the neck.
 */
export const T_POSE = [
  ["Spine", "up"], ["Spine1", "up"], ["Spine2", "up"], ["Neck", "up"],
  ["LeftShoulder", "left"], ["LeftArm", "left"], ["LeftForeArm", "left"],
  ["RightShoulder", "right"], ["RightArm", "right"], ["RightForeArm", "right"],
  ["LeftUpLeg", "down"], ["LeftLeg", "down"], ["LeftFoot", "forward"],
  ["RightUpLeg", "down"], ["RightLeg", "down"], ["RightFoot", "forward"],
];

/** Every bone a baked pose can carry a rotation for. */
export const DRIVEN = [...new Set([...T_POSE.map(([n]) => n), "Head", "Hips"])];

/** name → bone, for a rig root. */
export function boneIndex(root) {
  const map = new Map();
  root?.traverse((o) => { if (o.isBone && !map.has(o.name)) map.set(o.name, o); });
  return map;
}

/** Each driven bone's bind quaternion, so a pose can start from a clean slate. */
export function bindOf(bones) {
  const bind = new Map();
  for (const bone of bones.values()) bind.set(bone, bone.quaternion.clone());
  return bind;
}

/**
 * THE FIGHTER'S OWN AXES, measured off the rig rather than assumed. LATERAL is
 * the line between the shoulders (his own left), UP is the world's, FORWARD is
 * their cross — the direction a body with those shoulders faces, in the same
 * handedness the mannequin's table uses.
 */
export function anatomyOf(THREE, bones) {
  const at = (n) => (bones.get(n)
    ? new THREE.Vector3().setFromMatrixPosition(bones.get(n).matrixWorld) : null);
  const up = new THREE.Vector3(0, 1, 0);
  const l = at("LeftArm"); const r = at("RightArm");
  const lateral = l && r ? l.clone().sub(r) : new THREE.Vector3(1, 0, 0);
  lateral.addScaledVector(up, -lateral.dot(up)).normalize();
  const forward = lateral.clone().cross(up).normalize();
  return { up, lateral, forward };
}

/** Swing a bone so its tip points along a WORLD direction, keeping its twist. */
export function aimBone(THREE, bone, tip, worldDir) {
  const boneQ = bone.getWorldQuaternion(new THREE.Quaternion());
  const dir = new THREE.Vector3().copy(tip.position).applyQuaternion(boneQ).normalize();
  const swing = new THREE.Quaternion().setFromUnitVectors(dir, worldDir.clone().normalize());
  const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.premultiply(parentQ).premultiply(swing).premultiply(parentQ.clone().invert());
  bone.updateMatrixWorld(true);
}

/**
 * Put the rig in the pose the tables count as zero. A delivered rig is not
 * bound in a T-pose, and adding a table's "arms down" to arms already down
 * swings them 65° past the legs.
 */
export function toTPose(THREE, bones, { up, lateral, forward }) {
  const dirs = {
    up, down: up.clone().negate(), forward,
    left: lateral, right: lateral.clone().negate(),
  };
  for (const [name, which] of T_POSE) {
    const bone = bones.get(name);
    const tip = bones.get(BONE_TIP[name]) || bone?.children.find((c) => c.isBone);
    if (bone && tip && bone.parent) aimBone(THREE, bone, tip, dirs[which]);
  }
}

function applyChain(THREE, node, pose, basis) {
  const e = node.isBone && pose[node.name];
  if (e && node.parent) {
    const [rx, ry, rz] = e;
    const R = new THREE.Quaternion()
      .setFromAxisAngle(basis.lateral, rx * DEG)
      .multiply(new THREE.Quaternion().setFromAxisAngle(basis.up, ry * DEG))
      .multiply(new THREE.Quaternion().setFromAxisAngle(basis.forward, rz * DEG));
    const p = node.parent.getWorldQuaternion(new THREE.Quaternion());
    node.quaternion.premultiply(p).premultiply(R).premultiply(p.clone().invert());
    node.updateMatrixWorld(true);
  }
  for (const child of node.children) if (child.isBone) applyChain(THREE, child, pose, basis);
}

/**
 * Pose a rig from a library table. Returns the anatomy it measured, because
 * callers that go on to plant the fighter on the floor need the same one.
 */
export function applyLibraryPose(THREE, root, bones, bind, pose) {
  for (const [bone, q] of bind) bone.quaternion.copy(q);
  root.updateMatrixWorld(true);
  const basis = anatomyOf(THREE, bones);
  toTPose(THREE, bones, basis);
  applyChain(THREE, bones.get("Hips") || root, pose, basis);
  root.updateMatrixWorld(true);
  return basis;
}

/**
 * The pose the rig is CURRENTLY in, as local XYZ Euler degrees per bone —
 * which is the form clips.js bakes and the pose library exports.
 *
 * This is the step that lets one library drive the game. The tables cannot go
 * into a clip directly: they are in the fighter's frame and a clip track holds
 * a bone's own local rotation, so the numbers only line up after a rig has
 * actually been posed and read back.
 */
export function bakeLocalEulers(THREE, bones) {
  const out = {};
  const e = new THREE.Euler();
  for (const name of DRIVEN) {
    const bone = bones.get(name);
    if (!bone) continue;
    e.setFromQuaternion(bone.quaternion, "XYZ");
    const deg = [e.x, e.y, e.z].map((v) => +((v / DEG).toFixed(3)));
    if (deg.some((v) => Math.abs(v) > 1e-3)) out[name] = deg;
  }
  return out;
}

/**
 * How far the root has to drop for the fighter to stand on the floor.
 *
 * THE FEET ARE THE SUPPORT, so they are what sits on the line — not "the
 * lowest bone", which is wrong twice over. A delivered rig hangs its armature
 * off an outer node parked at the world origin, so the lowest bone is that
 * node and the fighter never moves; and once that is fixed, an overhand whose
 * fist goes below the feet is planted ON ITS FIST, which is a handstand.
 *
 * `root` is THE FIGHTER'S OWN FRAME, and the answer is measured in it. The
 * floor is y = 0 of that frame — never world y = 0. Those are the same line
 * only while the rig stands at the origin, which is true for the offscreen
 * blit and false the moment a real scene puts the fighter on a platform: in
 * `?camera=3d` the root sits at the platform's height, so a world-space
 * reading made every fighter above the main stage look metres in the air,
 * and this correction hauled them down by its own clamp — the feet-through-
 * the-floor bug on every raised platform. Passing no root keeps the old
 * world-space reading, which is what the origin-parked callers want.
 */
export function groundOffset(THREE, bones, { prone = false, root = null } = {}) {
  const support = prone
    ? [...Object.values(BONE_TIP), "Spine2", "Head"]
    : ["LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"];
  const v = new THREE.Vector3();
  let low = Infinity;
  for (const name of support) {
    const bone = bones.get(name);
    if (!bone) continue;
    v.setFromMatrixPosition(bone.matrixWorld);
    if (root) root.worldToLocal(v);
    if (v.y < low) low = v.y;
  }
  return Number.isFinite(low) ? -low : 0;
}
