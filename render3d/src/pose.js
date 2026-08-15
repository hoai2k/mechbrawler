// animKey + animTime -> a posed skeleton, live.
//
// This is where the render3d backend differs from billboards in kind: the
// clip PLAYS — a run cycle runs, a hurt pose recoils — instead of holding a
// quantised pose. Two disciplines keep that affordable and keep it anime:
//
//   * ON-TWOS SAMPLING. Clip time is quantised to 1/SAMPLE_HZ before posing,
//     so motion holds and snaps like limited animation — and so the pose
//     cache in scene.js still works: a fighter re-renders SAMPLE_HZ times a
//     second, not 60. Attack clips are sampled so the CONTACT BEAT is always
//     a sampled frame (never stepped over): the strike shows the instant its
//     hitbox goes live, honouring the timing contract in states.js. If a
//     state's stepping ever reads laggy under 60 Hz knockback, add it to
//     DIALS.onOnesStates — a per-state dial, not a rework.
//
//   * THE LIVE LAYERS. Everything applied on top of the clip at pose time,
//     each quantised so it joins the cache key without exploding it:
//     aim pitch (attacks pitch toward the target — billboards' contract,
//     run live), head look-at (idle/run/charge track the opponent), hurt
//     flinch (hurt states lean away from the attacker), and the turnaround
//     (facing left is the model yawed 180°, not a mirror — asymmetric
//     costumes finally stay correct).
//
// Foot IK: a small CCD pass clamps feet that sink below the ground line for
// grounded states — the engine-side answer to retarget foot-slide across a
// 150–220 cm roster, so the shared clip library lands on every height.
//
// Engine motion (sway, bob, squash, tumble) is NOT here — motion.js owns it
// and blit.js applies it, identically to sprites and billboards. Clips must
// not bake it; the delivery rule carries over verbatim.

import { STATES, clipNameFor, clipTime, aimable } from "./states.js";
import { applyRigFixes, applySkeletonSymmetry, modelFixesEnabled } from "./rig_fixes.js";
import { groundOffset } from "./pose_library.js";
import {
  applyReach, reaches, makeScratch, applyTwoHandGrip, applyCarry, applyGrip, applyMorphs, applyIdleStand, applyIdleArms, applyShoulderWidth, applyBindPose, applyKneeTurn, clearIdleStand,
  characterLateral, rotateBoneAboutWorldAxis, initLayerAxes,
  reachChain, gripBones,
} from "./ik.js";

/** The engine-side dials, each independently workbench-editable. */
export const DIALS = {
  onTwos: true,
  sampleHz: 13,               // 12–15 per the plan; 13 splits the difference
  onOnesStates: new Set(),    // states that step at full rate (see above)
  aim: true,                  // strikes pitch toward the target
  reach: true,                // ...and the striking limb solves onto it (ik.js)
  lookAt: true,               // head tracks the opponent in LOOK_STATES
  lookShare: 0.6,             // how much of the aim pitch the head takes
  flinch: true,               // hurt states lean away from the last attacker
  flinchDeg: 7,
  turnaround: true,           // yaw the rig for facing, instead of mirroring
  parallax: true,             // per-character camera yaw by stage position
  parallaxMaxDeg: 7,
  // 3.5°: the dominant pose-cache-key dimension (plan.md measured it as the
  // reason this backend re-renders more than billboards), and the first knob
  // the plan says to turn. Five buckets across the stage instead of eight,
  // for a change in implied viewpoint well under what the eye tracks.
  parallaxQuantDeg: 3.5,
  footIK: true,
  breath: true,               // additive shoulder breath on held states
  breathDeg: 1.6,
  blend: true,                // cross-fade state changes instead of cutting
  blendTime: 0.1,             // seconds of fade; quantised by the backend
};

/** States a change INTO is a snap on purpose — the cut IS the read. An impact
 *  that eased in would look absorbed rather than taken. Clip names
 *  (post-alias), like every state set here: `grabbed` is covered by `hurt`. */
export const NO_BLEND_IN = new Set(["hurt", "land"]);

/** States whose head may track the opponent. Never during attacks — the
 *  clip owns the head then. */
export const LOOK_STATES = new Set(["idle", "walk", "run", "charge"]);

/** States that flinch away from the hit's direction. */
export const FLINCH_STATES = new Set(["hurt", "dizzy", "prone"]);

/** Grounded states the foot IK may touch. */
const PLANT_STATES = new Set(["idle", "walk", "run", "crouch", "shield", "charge", "dizzy", "win", "land"]);

/** Breathing holds: alive without clips baking breath (which would double
 *  motion.js's bob — the delivery rule). */
const BREATH_STATES = new Set(["idle", "crouch", "shield"]);

const DEG = Math.PI / 180;

/** Clip time for a state, stepped on twos. The contact beat is always a
 *  sampled frame. Returns seconds into the clip.
 *
 *  `beatOverride` replaces the state table's contact instant with the MOVE's
 *  own: the table's `beat` is one number per state derived from sprite fps,
 *  while the hitbox goes live at `move.delay` — per move (an up-tilt and an
 *  up-smash share the upHeavy clip at different startups) and speed-scaled
 *  per character. The game passes the delay through (render.js -> backend
 *  `layers.beat`) so full extension shows the instant the hitbox turns on. */
export function sampleTime(animKey, animTime, beatOverride) {
  const t = clipTime(animKey, animTime);
  const name = clipNameFor(animKey);
  if (!DIALS.onTwos || DIALS.onOnesStates.has(name)) return t;
  const q = 1 / DIALS.sampleHz;
  let s = Math.floor(t / q) * q;
  const beat = beatOverride ?? STATES[name]?.beat;
  if (beat !== undefined && t >= beat && s < beat) s = beat;
  return s;
}

/** Camera yaw from stage position: a fighter at the left edge is seen
 *  slightly from the right, so both fighters agree with one implied
 *  viewpoint. Clamped small (silhouettes are gameplay) and quantised so it
 *  joins the pose-cache key cheaply. Returns degrees. */
export function parallaxDeg(x, cameraX, worldHalfW) {
  if (!DIALS.parallax) return 0;
  const k = Math.max(-1, Math.min(1, (x - cameraX) / worldHalfW));
  const deg = -k * DIALS.parallaxMaxDeg;
  return Math.round(deg / DIALS.parallaxQuantDeg) * DIALS.parallaxQuantDeg;
}

/** Which side the attacker is on, for the flinch lean: +1 ahead of the
 *  fighter's facing, -1 behind, 0 when no opponent is known. */
export function flinchSide(animKey, x, aim, facing) {
  if (!DIALS.flinch || !aim || !FLINCH_STATES.has(clipNameFor(animKey))) return 0;
  return Math.sign((aim.x - x) * (facing < 0 ? -1 : 1)) || 1;
}

// ------------------------------------------------------- which way they face
//
// FACING LEFT IS A MIRROR OF FACING RIGHT — of the picture, not of the model.
//
// The rig is turned rather than flipped (an asymmetric costume has to stay on
// the side it belongs on), so the question is which yaw makes the TURNED body
// present the same silhouette angle the un-turned one does, the other way
// round. scene.turnaroundYaw answers it with a constant, 2θ, derived by
// reflecting +Z across the camera's view plane — and that is exact only for a
// fighter whose forward really is +Z once their `yawOffsetDeg` has corrected
// them. Nobody's is. Measured across the delivered roster, the bodies present
// between 20° and 53° off the lens facing right, where +Z would be 60°; adding
// a flat −120° to that lands them at −67° to −100°, which is side-on. So every
// fighter was angled three-quarter facing right and in flat profile facing
// left, and the two directions did not look like the same character running.
//
// A rotation cannot mirror a body, but it can mirror the ANGLE the body is
// seen at, which is all "left should look like right" means here: measure the
// angle α the fighter presents at (a fact about the delivery, constant across
// every clip — the pelvis barely yaws), then turn by −2α, so α becomes −α.
// At α = 60° that is exactly the old constant, which is why this reads as a
// generalisation of it rather than a different idea.
//
// PRESENTATION is the other half of the same dial. `presentDeg` overrides the
// angle a fighter is SHOWN at rather than accepting their own: Sukuna's
// delivery presents at −10°, chest to the lens, which reads as a fighter
// running at the camera rather than across it, and no offset correction makes
// a run out of it. Pinning him to profile turns both directions to the same
// full-side stride.

/** The states whose facing is mirrored rather than flat-turned — see
 *  facingYaw for why this is not simply "all of them". */
const MIRROR_FACING_STATES = new Set(["idle", "walk", "run", "dash"]);

/** How each fighter presents while facing right, in degrees off the lens:
 *  0 is chest-on, +90 is a full profile facing screen-right. Absent means
 *  "however the delivery stands", which is what everyone but Sukuna wants. */
export const PRESENT_DEG = {
  // Delivered at −10°: nearly square to the camera, so his run read as a
  // fighter jogging on the spot toward the viewer while the same clip on
  // everyone else read as a sprint across the screen. Turned all the way to
  // profile instead, both directions — the one fighter on the roster whose
  // locomotion is better side-on than three-quarter.
  sukuna: 68,
};

/** The camera-space angle this rig presents at, in radians, measured once off
 *  the delivered body and cached on the rig.
 *
 *  Measured rather than derived: it is the composition of the model's own
 *  authored orientation and the `yawOffsetDeg` meant to cancel it, and the
 *  residual between those two is exactly the thing no formula here knows. */
function presentRad(rig) {
  if (rig._presentRad !== undefined) return rig._presentRad;
  let angle = null;
  const root = rig.root;
  if (root) {
    const bones = {};
    root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
    const L = bones.LeftUpLeg, R = bones.RightUpLeg;
    if (L && R) {
      const yaw = root.rotation.y;
      root.rotation.y = rig.yawOffset || 0;
      root.updateMatrixWorld(true);
      const a = _v4.setFromMatrixPosition(L.matrixWorld);
      const b = _v5.setFromMatrixPosition(R.matrixWorld);
      // Hip axis -> the fighter's own right; forward is up × right.
      const lat = b.sub(a).setY(0);
      if (lat.lengthSq() > 1e-8) {
        lat.normalize();
        // forward = up × right = (0,1,0) × lat. Getting this the other way
        // round costs nothing in the default case — the mirror is symmetric,
        // so a 180° error cancels — and silently inverts every explicit
        // `PRESENT_DEG`, which is how Sukuna ended up pinned to profile
        // facing the wrong way down the screen.
        const fx = lat.z, fz = -lat.x;
        // ...expressed against the camera: across the screen, and toward the
        // lens. Same two dot products scene.js frames the shot with.
        const t = CAMERA_YAW_RAD;
        const across = fx * Math.cos(t) - fz * Math.sin(t);
        const toward = fx * Math.sin(t) + fz * Math.cos(t);
        angle = Math.atan2(across, toward);
      }
      root.rotation.y = yaw;
      root.updateMatrixWorld(true);
    }
  }
  rig._presentRad = angle;
  return angle;
}

/** The camera yaw scene.js frames with. Stated here rather than imported
 *  because pose.js is deliberately free of the renderer. */
const CAMERA_YAW_RAD = (-60 * Math.PI) / 180;

/** The root yaw for this pose: the delivery's own correction, plus whatever
 *  it takes to present at the wanted angle and, facing left, to present at
 *  its mirror. Falls back to exactly the old behaviour — the caller's flat
 *  turnaround constant — for a body with no measurable hip axis. */
function facingYaw(rig, animKey, layers) {
  const base = rig.yawOffset || 0;
  // THE PRESENTATION MIRROR IS THE FLAT BLIT'S, and only the flat blit's.
  //
  // There, the ¾ comes from the LENS — the offscreen camera sits at −60° and
  // the fighter stands where their delivery leaves them — so facing left has
  // to be built by re-aiming the body, and how far to turn it depends on the
  // angle that body happens to present at. That is what everything below
  // measures.
  //
  // In a real scene the camera is head-on and the ¾ comes from the FIGHTER:
  // `scene.sceneFacingYaw` yaws them ±¾, which is a mirror already, exactly
  // and by construction. Re-aiming on top of it mirrors twice — and worse,
  // mirrors about an angle measured against a camera that is not the one
  // looking. So the scene keeps its own turn.
  //
  // It also has to be ASKED for rather than inferred. This used to read
  // "facing left" as "the turn yaw is non-zero", which is true in the flat
  // path and true of BOTH directions in the scene — so every fighter there
  // faced left in every locomotion state while their attacks still turned
  // correctly, which is exactly what it looked like.
  if (!layers.presentMirror) return (layers.turnYawRad || 0) + base;
  const left = (layers.facing ?? 1) < 0;
  // LOCOMOTION ONLY, and the boundary is load-bearing.
  //
  // The mirror is computed for the BODY's axis — measured off the hips, which
  // is what you see. The reach solver builds its target along the ROOT's axis
  // instead (pose.js applyMachineReach: the offsets are root-local), and on
  // these deliveries the two do not coincide — `yawOffsetDeg` leaves them tens
  // of degrees apart. One yaw cannot mirror both, so mirroring the body would
  // stop mirroring the strike: facing left, an attack kept reaching toward
  // screen-right (tools/smoke_render3d.mjs asserts exactly this).
  //
  // Travelling states run no reach solve, so there the body IS the whole
  // picture and the mirror is free. Attacks keep the flat turnaround they were
  // tuned against. Fixing this properly means measuring the offsets so the two
  // axes agree — `tools/check_model_facing.mjs --solve` is the instrument —
  // and is a roster pass, not a rendering change.
  if (!MIRROR_FACING_STATES.has(clipNameFor(animKey))) {
    return (layers.turnYawRad || 0) + base;
  }
  const alpha = presentRad(rig);
  if (alpha === null) return (layers.turnYawRad || 0) + base;
  // The presentation override is a LOCOMOTION note — Sukuna's run was the
  // complaint, and his standing pose is nobody's problem — so the idle keeps
  // whatever angle the delivery stands at and only the travel states re-aim.
  const pinned = PRESENT_DEG[rig.charKey];
  const want = pinned !== undefined && clipNameFor(animKey) !== "idle"
    ? (pinned * Math.PI) / 180
    : alpha;
  // `facingK` is the facing SWEEP (backend.js quantises fighter.js's
  // facingVis): ±1 at rest, passing through 0 mid-turn, so a turnaround is a
  // few frames of the body re-aiming through the lens instead of a snap.
  // Callers without the sweep fall back to the sign, the old behaviour.
  const k = layers.facingK ?? (left ? -1 : 1);
  return base + (want * k - alpha);
}

/** How far a relaxed arm hangs from straight down, in degrees, for a fighter
 *  whose manifest does not say. It is what "relaxed" looks like rather than a
 *  fact about any one model — but a heavy coat or a wide body wants more, so
 *  `armDeg` overrides it per character, the way `stanceDeg` does for the legs.
 *  Small on purpose: past about fifteen it stops reading as rest. */
export const IDLE_ARM_DEG = 9;

// ------------------------------------------------------------ posing proper

let THREE = null;
let _q1, _q2, _q3, _v1, _v2, _v3, _v4, _v5, _e1;
let _ik = null, _reachTarget = null, _lateral = null;

export function initPose(three) {
  THREE = three;
  _ik = makeScratch(three);
  initLayerAxes(three);
  _reachTarget = new three.Vector3();
  _lateral = new three.Vector3();
  _e1 = new three.Euler();
  _q1 = new THREE.Quaternion();
  _q2 = new THREE.Quaternion();
  _q3 = new THREE.Quaternion();
  _v1 = new THREE.Vector3();
  _v2 = new THREE.Vector3();
  _v3 = new THREE.Vector3();
  _v4 = new THREE.Vector3();
  _v5 = new THREE.Vector3();
}

/**
 * THE CLEAN POSE — what makes a pose a function of its inputs.
 *
 * Every live layer below (aim, reach, flinch, breath, foot IK, workbench pose
 * edits) MULTIPLIES onto a bone's current rotation. Nothing put those bones
 * back afterwards, and the mixer cannot be relied on to: it writes a bone only
 * when the clip's value for it CHANGED, so a held frame — or any bone the clip
 * has no track for — kept the last pass's correction and took the next one on
 * top. Pose the same frame twice and it drifted. That weakened the cache's
 * promise (same token -> same pixels, which the afterimage trail replays), and
 * in the workbench, where the pose editor previews every frame rather than
 * SAMPLE_HZ times a second, it visibly walked a rig away from itself: a joint
 * dragged 20° swung 200°.
 *
 * So each rig carries a CLEAN POSE — the skeleton as the clip alone leaves it,
 * re-snapshotted every pose right after the mixer runs and restored before the
 * next one. Bones start each pose exactly where the mixer believes it left
 * them, so its skip-if-unchanged stays correct, and the layers compose once.
 * The buffer is allocated at registration (loader.js), holding the bind pose
 * for the first pose to build on.
 */
const CLEAN_POSE = new WeakMap();

/** Start `root`'s clean-pose buffer at its bind pose. `fromRoot`, when given,
 *  is the rig this one was cloned from: an instance is cloned from a base that
 *  may already be posed, so it inherits the BASE's remembered bind values by
 *  bone name rather than whatever pose it was cloned mid-way through. */
export function captureCleanPose(root, fromRoot = null) {
  const source = fromRoot ? CLEAN_POSE.get(fromRoot) : null;
  const byName = source ? new Map(source.map(([b, q, p]) => [b.name, [q, p]])) : null;
  const clean = [];
  root.traverse((o) => {
    if (!o.isBone) return;
    const held = byName?.get(o.name);
    clean.push([o, held ? held[0].clone() : o.quaternion.clone(),
                   held ? held[1].clone() : o.position.clone()]);
  });
  CLEAN_POSE.set(root, clean);
}

/** Put the skeleton back where the CLIP left it last time, undoing the layers
 *  that were applied on top. It cannot be the bind pose instead: the mixer
 *  skips writing a property whose value it believes it already wrote, so a
 *  bone reset behind its back would stay at bind — which is exactly how the
 *  second render of an unchanged frame came out T-posed. */
export function restoreClean(root) {
  const held = CLEAN_POSE.get(root);
  if (!held) return; // never registered (a hand-built probe rig) — nothing to restore
  for (const [bone, q, p] of held) { bone.quaternion.copy(q); bone.position.copy(p); }
}

/** Remember where the clip left the skeleton, before any layer touches it. */
function keepClean(root) {
  const held = CLEAN_POSE.get(root);
  if (!held) return;
  for (const entry of held) {
    entry[1].copy(entry[0].quaternion);
    entry[2].copy(entry[0].position);
  }
}

/** Drive the mixer to the sampled clip time. Same action caching as the
 *  billboard renderer: actions rebind when the workbench changes a state's
 *  resolved clip. */
export function playClip(rig, animKey, sampled, clip) {
  const name = clipNameFor(animKey);
  let action = rig.actions.get(name);
  if (!action || action.getClip() !== clip) {
    rig.mixer.stopAllAction();
    action = rig.mixer.clipAction(clip);
    rig.actions.set(name, action);
  }
  if (!action.isRunning()) {
    rig.mixer.stopAllAction();
    action.reset().play();
  }
  // One-shots clamp to the CLIP's own end, not just the state table's: the
  // table durations now run past the last drawing (the recovery tail), and a
  // DELIVERED clip authored to the old length would wrap under LoopRepeat —
  // the strike replaying mid-recovery. Library-built clips carry a settle key
  // at the full table duration, so for them this clamp never engages. Loops
  // keep raw time: the mixer's own wrap is correct for a short loop clip.
  const oneShot = STATES[name] && !STATES[name].loop;
  rig.mixer.setTime(oneShot ? Math.min(sampled, clip.duration - 1e-4) : sampled);
}

/** NOD `name` by `rad` — a rotation in the vertical plane the character faces
 *  along, positive = chin/chest up.
 *
 *  This was a rotation about the bone's LOCAL X, which is the nodding axis only
 *  if the rig happens to be built that way. On a generated rig whose neck
 *  carries its own roll it is not, and the head yaws and rolls instead of
 *  nodding — the "funny head rotation" on the first delivered fighter. The
 *  honest axis is the CHARACTER's lateral direction, taken from the rig's own
 *  facing and converted into whatever local frame the bone happens to have
 *  (ik.js). For a clean rig that is the same rotation; for a rolled one it is
 *  the one that was meant. */
function rotateBoneNod(root, name, rad) {
  if (!rad) return;
  const bone = root.getObjectByName(name);
  if (!bone) return;
  characterLateral(THREE, root, _lateral);
  rotateBoneAboutWorldAxis(THREE, bone, _lateral, rad, _ik);
}

/** Aim: pitch the strike toward the target, split across the spine so the
 *  whole upper body leans into the shot. Same shares as the billboard
 *  backend — one aim contract, two backends. */
const AIM_BONES = [["Spine1", 0.35], ["Spine2", 0.45], ["Neck", -0.3]];
function applyAim(root, pitchRad) {
  if (!pitchRad) return;
  for (const [name, share] of AIM_BONES) rotateBoneNod(root, name, -pitchRad * share);
}

/** Head look-at: neck and head take a share of the pitch toward the
 *  opponent, in the states that allow it. */
function applyLook(root, pitchRad) {
  if (!pitchRad) return;
  rotateBoneNod(root, "Neck", -pitchRad * DIALS.lookShare * 0.5);
  rotateBoneNod(root, "Head", -pitchRad * DIALS.lookShare * 0.5);
}

/** Hit-direction flinch: lean the spine a few degrees away from the
 *  attacker, so knockback reads in the body, not just the trajectory. */
function applyFlinch(root, side) {
  if (!side) return;
  rotateBoneNod(root, "Spine", -side * DIALS.flinchDeg * DEG);
  rotateBoneNod(root, "Spine1", -side * DIALS.flinchDeg * 0.5 * DEG);
}

/** Additive breath: shoulders only, tied to the SAMPLED clock so the cache
 *  stays honest. */
function applyBreath(root, animKey, sampled) {
  if (!DIALS.breath || !BREATH_STATES.has(clipNameFor(animKey))) return;
  const s = STATES[clipNameFor(animKey)];
  const k = Math.sin((sampled / s.duration) * Math.PI * 2);
  rotateBoneNod(root, "Spine2", -k * DIALS.breathDeg * DEG);
}

/**
 * WORKBENCH POSE EDITS: hand-authored rotation offsets laid on top of the clip.
 *
 * `edits` is [[boneName, rx, ry, rz], ...] in radians, each a rotation in the
 * bone's PARENT frame — which is the frame the clip's own keyframes live in, so
 * an offset composes with the animation instead of fighting it, and the same
 * numbers can be typed straight into a pose table (mannequin.js POSES) once
 * they read right.
 *
 * They go on immediately after the clip and before every live layer, so aim,
 * reach, look-at, flinch and foot IK all solve against the EDITED body: drop a
 * shoulder here and the strike still lands on the target.
 *
 * `postEdits` is the same shape and runs at the very END instead — after every
 * solver. That distinction is not a detail, it is which QUESTION the edit is
 * answering, and the workbench decides it per bone:
 *
 *   A bone the clip owns (a hip, the off arm in a punch) is edited in CLIP
 *   SPACE. The number means "this pose is wrong", it belongs in the keyframe,
 *   and every solver downstream is entitled to move it afterwards.
 *
 *   A bone a solver OWNS in this state — the striking limb, which ik.js aims
 *   at the target; the spine, which pitches toward it; the feet, which the
 *   ground clamps — cannot be edited in clip space at all: the solve would
 *   overwrite it, and the tool would silently do nothing. Its edit has to land
 *   after the solve, which also makes it mean something different and truer:
 *   an offset RELATIVE TO THE TARGET the solver aimed at. "Twenty degrees more
 *   elbow than the solve gives" survives every angle the strike is thrown at,
 *   where a clip-space number would only have been right for one of them.
 *
 * The game never passes either — this is the workbench's authoring surface, and
 * it reaches the render only because `layers.editKey` joins the pose-cache
 * token (scene.js).
 */
function applyPoseEdits(root, edits) {
  if (!edits || !edits.length) return;
  for (const [name, rx, ry, rz] of edits) {
    if (!rx && !ry && !rz) continue;
    const bone = root.getObjectByName(name);
    if (!bone) continue;
    _e1.set(rx, ry, rz, "XYZ");
    _q1.setFromEuler(_e1);
    bone.quaternion.premultiply(_q1);
  }
  root.updateMatrixWorld(true);
}

/**
 * The states whose fighter is standing on something. Everything else is in the
 * air and stays where the clip puts it — a jump that touches the floor is a
 * worse lie than one that hovers.
 */
// CLIP names (post-alias, like every set here): standOnGround tests
// clipNameFor(animKey), so aliased states are covered by the clip they play
// (grabReach→light, grabbed→hurt, ...) and a raw state name that is not a
// clip name would never match.
const GROUNDED = new Set([
  "idle", "walk", "run", "crouch", "shield", "charge", "dizzy", "win", "land",
  "light", "sideHeavy", "upHeavy", "downHeavy", "crouchAttack",
  "hurt", "prone", "dash",
  "specialNeutral", "specialSide", "specialDown",
]);

/** Each rig's armature node and where it sits in the bind, so the ground drop
 *  is applied fresh every frame instead of accumulating. */
const _armature = new WeakMap();

/**
 * DROP THE BODY UNTIL ITS FEET ARE ON THE FLOOR.
 *
 * A pose folds the legs; it does not lower the hips, because a pose is bone
 * rotations and hip height is a translation. So a crouch built from the pose
 * libraries came out standing at full height with its knees bent — hovering
 * 29cm up — and foot IK did not catch it: `plantFeet` only pushes feet that
 * have sunk BELOW the line back up to it, and these are above it.
 *
 * It moves the ARMATURE, not the rig root. The root is where the fighter is
 * standing in the world and belongs to the backend; the armature node inside
 * it is the body, and moving that leaves placement alone.
 */
function standOnGround(rig, animKey) {
  const root = rig?.root;
  if (!root) return;
  let node = _armature.get(root);
  if (node === undefined) {
    const hips = root.getObjectByName("Hips") || root.getObjectByName("mixamorigHips");
    node = hips?.parent === root ? hips : (hips || null);
    _armature.set(root, node ? Object.assign(node, { _bindY: node.position.y }) : null);
    node = _armature.get(root);
  }
  if (!node) return;
  node.position.y = node._bindY;
  if (!GROUNDED.has(clipNameFor(animKey))) { root.updateMatrixWorld(true); return; }
  root.updateMatrixWorld(true);
  const bones = new Map();
  for (const name of ["LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"]) {
    const b = root.getObjectByName(name);
    if (b) bones.set(name, b);
  }
  // Measured in the ROOT's frame: `node.position.y` is local to the root, and
  // so is the floor the fighter stands on. See groundOffset.
  const drop = groundOffset(THREE, bones, { root });
  // A hard clamp, because this is a correction and not a lift: a pose that
  // wants the body a metre lower than its bind is a broken pose, and hoisting
  // a fighter UP to meet a stray foot would be worse than leaving them be.
  node.position.y = node._bindY + Math.min(0, Math.max(-0.6, drop));
  root.updateMatrixWorld(true);
}

// ------------------------------------------------------ both feet on the floor
//
// The crouch is authored as a SPRINTER'S THREE-POINT SET (battle_poses.js
// crouch_a, read off Yuji's own sheet): front knee ~90°, rear knee ~125°, hips
// high, trunk folded over. Read as a drawing that is exactly right. Stood up
// as a body it is not, because the rear knee is folded so far that the rear
// foot rides well clear of the floor — so every fighter crouched with one leg
// tucked up behind them, hanging, which reads as floating rather than as
// crouching.
//
// Neither existing pass catches it. `standOnGround` TRANSLATES the body until
// its LOWEST point is on the floor, which the front foot already satisfies;
// `plantFeet` only pushes feet that have sunk BELOW the line back up. A foot
// in the air above a planted one is invisible to both.
//
// The fix is the one you reach for when you look at it: the pose is fine, it
// is just tilted — so PITCH it about the fighter's own lateral axis until the
// trailing foot comes down too, then let standOnGround re-settle. That keeps
// every authored angle exactly as drawn and changes only the attitude of the
// whole body, which is what "rotate it until both feet are down" means.
//
// The angle is SOLVED rather than derived, by measuring how the foot gap
// responds to a small test rotation and taking one Newton step from it. Two
// sign conventions meet here — the lateral axis's and the bone rotation's —
// and picking them off by hand is how you get a crouch that tips the wrong way
// on half the roster. Measuring costs one extra matrix update and cannot be
// wrong about which way is down.

// ------------------------------------------------------------- a limb that is
//
// SOME LIMBS ARE NOT WORKING LIMBS. Hanami's left arm is a mass of branches
// where a forearm should be — the delivery carries 1021 vertices on
// LeftForeArm reaching 59cm past the elbow, against 473 reaching 26cm on the
// right, and no left hand to speak of. The shared clip library has no idea:
// it swings both arms through every cycle and throws the guard up with both,
// so a ruined arm gestured along as neatly as the good one, which is the one
// thing it should never do.
//
// Freezing is the whole fix. The bones are held at BIND — the rest the model
// was built in — after every other layer has run, so the clip, the reach solve
// and the breath all move on around a limb that simply hangs. The attacks need
// no rework: they already reach with the right arm (ik.js REACH), which is his
// good one, so the strike lands exactly as authored with the branches trailing
// beside it.

/** Per character, bones the clips must not drive. */
const FROZEN_BONES = {
  hanami: ["LeftArm", "LeftForeArm", "LeftHand"],
};

/** Each frozen bone's bind-pose LOCAL rotation, cached per rig.
 *
 *  Taken from the skeleton's own bind matrices rather than from the clean-pose
 *  buffer: that buffer is refreshed with whatever the clip just did (keepClean),
 *  so restoring from it would hold the arm wherever this frame's animation put
 *  it — which is not freezing, it is lagging by a frame. */
function frozenLocals(rig, names) {
  if (rig._frozen) return rig._frozen;
  const out = [];
  const world = new Map();
  rig.root.traverse((o) => {
    if (!o.isSkinnedMesh || !o.skeleton) return;
    o.skeleton.bones.forEach((b, i) => {
      if (world.has(b.name)) return;
      world.set(b.name, new THREE.Matrix4().copy(o.skeleton.boneInverses[i]).invert());
    });
  });
  for (const name of names) {
    const bone = rig.root.getObjectByName(name);
    const here = world.get(name);
    if (!bone || !here) continue;
    const parent = bone.parent && world.get(bone.parent.name);
    const local = parent
      ? new THREE.Matrix4().copy(parent).invert().multiply(here)
      : here.clone();
    out.push([bone, new THREE.Quaternion().setFromRotationMatrix(local)]);
  }
  rig._frozen = out;
  return out;
}

/** Hold a ruined limb still, after everything else has moved. */
function freezeBones(rig, charKey) {
  const names = FROZEN_BONES[charKey];
  if (!names || !rig?.root) return;
  const held = frozenLocals(rig, names);
  if (!held.length) return;
  for (const [bone, q] of held) bone.quaternion.copy(q);
  rig.root.updateMatrixWorld(true);
}

/** States authored with a foot off the floor that should have both down. */
const LEVEL_FEET_STATES = new Set(["crouch"]);

/** How high one foot's sole sits in the root's frame. */
function soleY(root, side) {
  const bones = new Map();
  for (const n of [`${side}Foot`, `${side}ToeBase`]) {
    const b = root.getObjectByName(n);
    if (b) bones.set(n, b);
  }
  if (!bones.size) return null;
  // groundOffset hands back the DROP to the lowest of what it is given, so
  // the sole's height is its negation.
  return -groundOffset(THREE, bones, { root });
}

/** Put the trailing foot down, by TILTING THE WHOLE BODY.
 *
 *  Two ways to ground a foot the pose left in the air, and the choice between
 *  them is a matter of taste rather than of correctness:
 *
 *    EXTEND THE TRAILING KNEE. Keeps the authored trunk fold exactly, and the
 *    fighter stays low — but unfolding the rear leg pushes the hips up, so the
 *    crouch stops being much of a crouch and reads as a forward bend.
 *
 *    PITCH THE BODY about the fighter's own lateral axis until the foot comes
 *    down. Every authored angle survives untouched, the fighter genuinely
 *    settles, and the price is that they come up more upright than the drawing
 *    — the trunk rotates with everything else.
 *
 *  This is the second. It was the first thing tried, swapped for the knee, and
 *  swapped back on the note that upright-and-low beats bent-and-high: a crouch
 *  that is not low is not reading as a crouch at all, whereas a crouch that
 *  stands a little straighter still is.
 *
 *  The angle is SOLVED rather than derived: a test rotation, a measurement, one
 *  Newton step. Two sign conventions meet here — the lateral axis's and the
 *  bone rotation's — and guessing them is how a crouch tips the wrong way on
 *  half the roster.
 */
const LEVEL_MAX_RAD = 45 * DEG;
function levelFeet(rig, animKey) {
  if (!LEVEL_FEET_STATES.has(clipNameFor(animKey))) return;
  const root = rig?.root;
  const hips = root && (root.getObjectByName("Hips")
    || root.getObjectByName("mixamorigHips"));
  if (!hips) return;
  root.updateMatrixWorld(true);
  const gap = () => {
    const l = soleY(root, "Left"), r = soleY(root, "Right");
    return l === null || r === null ? null : l - r;
  };
  const g0 = gap();
  // A centimetre of difference is a foot on the floor; solving that away would
  // spend a rotation to fix something nobody can see.
  if (g0 === null || Math.abs(g0) < 0.01) return;

  const axis = characterLateral(THREE, root, _v1);
  const TEST = 4 * DEG;
  rotateBoneAboutWorldAxis(THREE, hips, axis, TEST, _ik);
  root.updateMatrixWorld(true);
  const g1 = gap();
  if (g1 === null) return;

  const slope = (g1 - g0) / TEST;
  // No response means the legs do not answer to this rotation (a rig parented
  // somewhere unexpected) — undo the probe and leave the pose alone.
  let total = 0;
  if (Number.isFinite(slope) && Math.abs(slope) > 1e-6) {
    total = Math.max(-LEVEL_MAX_RAD, Math.min(LEVEL_MAX_RAD, -g0 / slope));
  }
  rotateBoneAboutWorldAxis(THREE, hips, axis, total - TEST, _ik);
  root.updateMatrixWorld(true);
  // The pitch lifted or dropped the whole body; put it back on the floor.
  standOnGround(rig, animKey);
}

/** Foot IK: clamp feet that sink below the ground line back onto it, with a
 *  short CCD pass over knee and hip. Only grounded states, only downward
 *  penetration — a raised foot is the clip's business. */
function plantFeet(root, animKey) {
  if (!DIALS.footIK || !PLANT_STATES.has(clipNameFor(animKey))) return;
  for (const side of ["Left", "Right"]) {
    const up = root.getObjectByName(`${side}UpLeg`);
    const lo = root.getObjectByName(`${side}Leg`);
    const foot = root.getObjectByName(`${side}Foot`);
    if (!up || !lo || !foot) continue;
    root.updateMatrixWorld(true);
    foot.getWorldPosition(_v1);
    // The ground line is y = 0 of the FIGHTER'S frame, not of the world — the
    // two coincide only while the rig stands at the origin (the offscreen
    // blit). In `?camera=3d` the root is at the platform's height, and reading
    // world y there planted every fighter on the main stage's floor plane.
    root.worldToLocal(_v5.copy(_v1));
    if (_v5.y >= -0.005) continue;
    _v5.y = 0;
    const target = _v2.copy(root.localToWorld(_v5));
    for (let iter = 0; iter < 3; iter++) {
      for (const bone of [lo, up]) {
        bone.getWorldPosition(_v3);
        foot.getWorldPosition(_v1);
        const cur = _v1.sub(_v3).normalize();
        const des = _v4.copy(target).sub(_v3).normalize();
        _q1.setFromUnitVectors(cur, des);
        // Half-steps keep the correction subtle; three passes converge close
        // enough for a ground clamp without fighting the clip.
        _q2.identity().slerp(_q1, 0.5);
        // world-space delta -> the bone's local frame
        bone.parent.getWorldQuaternion(_q3);
        const pw = _q3.clone();
        bone.quaternion.premultiply(pw.invert().multiply(_q2).multiply(_q3));
        bone.updateMatrixWorld(true);
      }
    }
  }
}

/**
 * The full pose for one render: clip at the sampled time, then the live
 * layers. `layers` = { aimRad, lookRad, flinch, turnYawRad } — all already
 * quantised by the caller (they are part of the cache key).
 */
/** The rig-check poses: arm angle from straight down, in degrees. 90 puts the
 *  arms out level (a T), 45 drops them to the classic A. */
export const RIG_CHECK_POSES = { T: 90, A: 45 };

/**
 * STAND THE MODEL UP WITH NOTHING ON IT — no clip, no aim, no reach, no look,
 * no breath. Just the skeleton the file was built with, straightened into a T
 * or an A, plus the GLB correction layer.
 *
 * It is a rig test, not an animation: a T-pose is where a bad weight, a wrong
 * bone roll, a shoulder built inside the chest or a foot that is really a lump
 * has nowhere to hide, because every joint is at a right angle to the next and
 * the silhouette is a shape you already know. A pose that came out of a clip
 * cannot do that — anything wrong reads as something the animation did.
 *
 * The correction layer stays on, and that is the point of showing it here: the
 * difference between this figure and the one in the .glb is exactly what is
 * still owed to the model, which the workbench lists beside it.
 */
function poseRigCheck(rig, kind, layers) {
  rig.root.rotation.y = (layers.turnYawRad || 0) + (rig.yawOffset || 0);
  rig.root.updateMatrixWorld(true);
  // From BIND, not from the clean buffer: the clean buffer holds the pose the
  // last clip left, and a rig check built on a run cycle is not a rig check.
  applyBindPose(THREE, rig.root);
  applySkeletonFixes(rig, layers);
  keepClean(rig.root);
  // Legs straight and soles level, no splay — the stance dial is a character's
  // idle, and this pose is deliberately nobody's.
  applyIdleStand(THREE, rig.root, 0, _ik);
  applyIdleArms(THREE, rig.root, RIG_CHECK_POSES[kind] ?? RIG_CHECK_POSES.T, _ik);
  applyModelFixes(rig, layers);
  standOnGround(rig, "idle");
  rig.root.updateMatrixWorld(true);
}

/**
 * THE GLB CORRECTION LAYER, first half: corrections to WHERE THE BONES ARE.
 *
 * Split out from the rest because it cannot go where the rest goes. A rotation
 * fix is applied last, on top of the pose, and composes with it. A POSITION
 * fix is a change to the skeleton the pose is then built on — straightening
 * the legs, levelling the soles and aiming the arms all measure the body they
 * are working on, so a shoulder moved after them is a shoulder the arm layer
 * never saw. It goes on immediately after the clip, before any of that.
 *
 * Same switch, same bake list, same rule: with the skeleton mirrored in the
 * .glb, `setModelFixesEnabled(false)` must change nothing.
 */
function applySkeletonFixes(rig, layers) {
  if (!modelFixesEnabled()) return;
  const fixKey = layers.charKey || rig.charKey;
  if (fixKey) applySkeletonSymmetry(THREE, rig.root, fixKey);
}

/**
 * THE GLB CORRECTION LAYER, second half: everything in here is a fix to the delivered
 * MODEL, not to any pose: things the file got wrong that no clip can fix,
 * because every state inherits them. They are dialled by eye in the idle
 * review (the one pose with an obvious right answer) but they are NOT part of
 * the idle, so they are applied for every state, unconditionally.
 *
 * It is one function on purpose. The bake list lives in rig_fixes.js
 * (MODEL_FIXES / MODEL_FIX_KEYS), `tools/model_fixes.mjs` prints what is still
 * outstanding per fighter, and the workbench's T and A poses show it on the
 * body. When a fighter's corrections go into their .glb,
 * `setModelFixesEnabled(false)` must leave them looking IDENTICAL — that is
 * the test of a complete bake, and it only works if nothing in this class is
 * applied anywhere but here.
 *
 * Callers run it before the live layers, so look-at nods FROM the corrected
 * carriage rather than fighting it, and reach solves from a body whose
 * shoulders are already where the model should have put them.
 */
function applyModelFixes(rig, layers) {
  if (!modelFixesEnabled()) return;
  // Generated heads arrive modelled looking slightly down — the tilt is in the
  // MESH, not the skeleton, so no amount of measuring the rig finds it (the
  // joints come out level to within a degree across the whole roster).
  // Positive lifts the chin.
  if (rig.headTiltDeg) rotateBoneNod(rig.root, "Head", -rig.headTiltDeg * DEG);
  // Arm roots built too far into the body. This used to live inside the
  // idle-arms call, which meant a fighter's shoulders snapped inward the
  // instant they threw a punch — Uro measured 37.6cm standing and 24.9cm
  // mid-strike, exactly twice her 6.5cm correction. A fact about the model
  // cannot come and go with the state.
  if (rig.shoulderOutCm) {
    applyShoulderWidth(THREE, rig.root, rig.shoulderOutCm / 100, _ik);
  }
  // Legs built screwed outward at the hip, so the kneecap and the toe both
  // point away from the midline. Same argument as the shoulders one line up:
  // it is how the FILE was built, so it cannot stop at the idle — a fighter
  // whose knees square up standing and splay again the moment they crouch is
  // a fighter with a correction in the wrong layer.
  if (rig.kneeDeg) applyKneeTurn(THREE, rig.root, rig.kneeDeg, _ik);
  // Per-bone bind corrections: a rolled clavicle, a cocked wrist.
  const fixKey = layers.charKey || rig.charKey;
  if (fixKey) applyRigFixes(THREE, rig.root, fixKey);
}

/**
 * THE BAKE, DEFINED ONCE, IN THE ENGINE.
 *
 * Put a rig into the pose its .glb should have been delivered in: the bind,
 * plus the whole correction layer and nothing else — no clip, no idle stand,
 * no arms, no live layer. Read the bones back and you have exactly what has to
 * go into the file for `setModelFixesEnabled(false)` to change nothing.
 *
 * It lives here rather than in the baking tool on purpose. A tool that
 * reimplemented these corrections in Blender would be a second opinion about
 * what the fix is, and the first time the two drifted the bake would quietly
 * stop matching the engine — which is the one thing a bake must not do. The
 * tool asks the engine what the answer is and writes it down.
 *
 * Returns the corrected LOCAL transform of every bone, which is what a rest
 * pose is made of.
 */
export function bakedBind(rig, charKey) {
  const layers = { charKey };
  rig.root.rotation.y = 0;
  rig.root.updateMatrixWorld(true);
  applyBindPose(THREE, rig.root);
  applySkeletonFixes(rig, layers);
  applyModelFixes(rig, layers);
  rig.root.updateMatrixWorld(true);
  // MATRICES IN THE RIG'S OWN SPACE, not local transforms.
  //
  // The obvious handover — each bone's local position and rotation — is wrong,
  // and wrong in a way that looks right until you see it: glTF stores a node's
  // transform relative to its parent node, while Blender stores a POSE CHANNEL
  // relative to a rest bone that has its own axis convention (Y runs along the
  // bone) and a roll the importer chose. The two are different numbers for the
  // same thing. Handed the glTF ones, Blender built a rig with the head inside
  // the chest.
  //
  // A bone's matrix in the ARMATURE's space is the same fact in both, up to
  // the Y-up/Z-up swap, and Blender's `pose_bone.matrix` speaks exactly that.
  const inv = new THREE.Matrix4().copy(rig.root.matrixWorld).invert();
  const out = {};
  rig.root.traverse((o) => {
    if (!o.isBone) return;
    out[o.name] = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld).toArray();
  });
  return out;
}

/** Per-rig scratch for the cross-fade: the outgoing pose, snapshotted after
 *  its full solve, that the incoming pose is blended toward. */
const BLEND_SNAP = new WeakMap();

function snapshotPose(root) {
  let snap = BLEND_SNAP.get(root);
  if (!snap) {
    snap = [];
    root.traverse((o) => {
      if (o.isBone) snap.push([o, new THREE.Quaternion(), new THREE.Vector3()]);
    });
    BLEND_SNAP.set(root, snap);
  }
  for (const e of snap) { e[1].copy(e[0].quaternion); e[2].copy(e[0].position); }
  return snap;
}

export function poseRig(rig, animKey, sampled, clip, layers = {}) {
  // A RIG CHECK IS NOT A STATE. It takes the turnaround and the correction
  // layer and stops there — see poseRigCheck.
  if (layers.rigCheck) return poseRigCheck(rig, layers.rigCheck, layers);
  // THE CROSS-FADE. A state change used to be a hard cut — stopAllAction and
  // play, a different body on the next frame. When the backend hands over
  // where the cut came from (layers.blend: the outgoing state, its frozen
  // playhead, its resolved clip, and how far in [0..1) the fade is), the
  // outgoing pose is solved in full, kept, the incoming pose solved on top,
  // and every bone slerped back toward the outgoing by the fade's remainder.
  // Both poses go through the whole layer stack, so the blend is between two
  // finished bodies rather than two raw clips — the same reason CLEAN_POSE
  // exists. Cost: one extra solve, only on cache-miss frames inside the
  // ~0.1 s window. The backend quantises the fraction so it joins the token.
  const blend = layers.blend;
  if (blend?.clip) {
    poseOnce(rig, blend.key, blend.sampled, blend.clip,
      { ...layers, blend: null, beat: undefined, aimRad: 0, reach: null });
    const snap = snapshotPose(rig.root);
    poseOnce(rig, animKey, sampled, clip, layers);
    const k = Math.min(Math.max(blend.k, 0), 1);
    const w = 1 - k * k * (3 - 2 * k); // outgoing weight, smooth at both ends
    for (const [bone, q, p] of snap) {
      bone.quaternion.slerp(q, w);
      bone.position.lerp(p, w);
    }
    rig.root.updateMatrixWorld(true);
    return;
  }
  return poseOnce(rig, animKey, sampled, clip, layers);
}

function poseOnce(rig, animKey, sampled, clip, layers = {}) {
  // The turnaround goes on FIRST, before anything reads a world matrix.
  // Facing here is a real 180° yaw rather than a mirror, so it changes which
  // way "forward" points in the world — and the reach solve below builds its
  // target in the rig's own frame and converts through that matrix. Setting
  // the yaw last (as this did) would have every left-facing fighter reach in
  // the direction they are NOT facing.
  // The delivery's own facing joins the turnaround: a rig built facing -Z
  // (loader.js yawOffsetDeg) is turned once, here, and every layer below sees
  // a fighter whose forward is where the spec says it is.
  rig.root.rotation.y = facingYaw(rig, animKey, layers);
  rig.root.updateMatrixWorld(true);

  restoreClean(rig.root);
  playClip(rig, animKey, sampled, clip);
  applySkeletonFixes(rig, layers);
  keepClean(rig.root);
  // How the fighter STANDS, before anything reaches: straightening the legs
  // and squaring the feet moves the hips, and therefore every joint above
  // them, so a solve run first would be solving from a body about to move.
  //
  // Idle only, and unconditional there — the straight legs and level soles are
  // not an opt-in setting but what standing looks like, so a fighter whose
  // stance dial reads 0 still gets them. A splay held through a run cycle
  // reads as a limp, which is why it stops at the idle.
  if (clipNameFor(animKey) === "idle") {
    applyIdleStand(THREE, rig.root, layers.stanceDeg || 0, _ik);
    // The arms get the same treatment one axis up — unless this fighter's
    // delivered idle is a pose somebody chose, which the manifest says.
    if (rig.idleArms !== false) {
      applyIdleArms(THREE, rig.root, rig.armDeg ?? IDLE_ARM_DEG, _ik);
    }
  } else {
    clearIdleStand(rig.root);
  }
  applyModelFixes(rig, layers);
  // STAND ON THE FLOOR. A pose that folds the legs without lowering the hips
  // leaves the fighter hovering — a library crouch floated 29cm — and foot IK
  // does not catch it, because that only pushes feet that have sunk BELOW the
  // line back up to it. This is the other direction, and it is a translation
  // rather than a bend: the body drops until its lowest foot is on the ground.
  standOnGround(rig, animKey);
  // ...and, where the pose was drawn with a foot in the air that should be on
  // the floor, tilt until it is (the crouch — see levelFeet).
  levelFeet(rig, animKey);
  // Body morphs (Mahito's transfiguration arms) precede aim/reach so every
  // solve sees the morphed limb.
  if (layers.charKey) applyMorphs(rig.root, layers.charKey, animKey, clipTime(animKey, sampled), layers.beat);
  applyPoseEdits(rig.root, layers.edits);
  if (DIALS.aim && layers.aimRad && aimable(animKey)) applyAim(rig.root, layers.aimRad);
  applyMachineReach(rig, animKey, sampled, layers);
  // The off hand joins a two-handed weapon AFTER aim and reach have moved
  // the striking hand — the shaft rides it (ik.js applyTwoHandGrip; a no-op
  // without layers.charKey or for one-handed fighters).
  if (layers.charKey) {
    // Where the hand sits on the shaft, before anything is asked of the
    // weapon: the grip is a fact about the fighter, so both the two-hand
    // solve and the carry below want it already corrected.
    applyGrip(THREE, rig.root, layers.charKey, _ik);
    applyTwoHandGrip(THREE, rig.root, layers.charKey, animKey,
      clipTime(animKey, sampled), _ik, layers.beat);
    // ...and while TRAVELLING, the weapon is luggage rather than a statement:
    // heavy end trailing, low and behind (ik.js applyCarry). After the grip
    // solve, which is a no-op in these states anyway, so the two never argue.
    applyCarry(THREE, rig.root, layers.charKey, animKey, _ik);
  }
  if (DIALS.lookAt && layers.lookRad) applyLook(rig.root, layers.lookRad);
  applyFlinch(rig.root, layers.flinch || 0);
  applyBreath(rig.root, animKey, sampled);
  plantFeet(rig.root, animKey);
  // Target-space edits, last: an offset on top of whatever the solvers made
  // of this bone (see applyPoseEdits).
  applyPoseEdits(rig.root, layers.postEdits);
  // ...and a limb that does not work stays where it is, after everything.
  if (layers.charKey) freezeBones(rig, layers.charKey);
}

/** Which layer OWNS each bone in `animKey` — what the workbench has to know to
 *  put an edit in the right space, and to say so in its UI.
 *
 *  Returns a Map of boneName -> "target" | "ground" | "prop", listing only the
 *  bones something other than the clip drives. Everything absent is the clip's,
 *  which is the common case and the editable one. */
export function boneOwners(animKey, charKey = null) {
  const name = clipNameFor(animKey);
  const owners = new Map();
  if (DIALS.aim && aimable(animKey)) {
    for (const [bone] of AIM_BONES) owners.set(bone, "target");
  }
  if (DIALS.lookAt && LOOK_STATES.has(name)) {
    owners.set("Neck", "target");
    owners.set("Head", "target");
  }
  if (DIALS.reach) {
    for (const bone of reachChain(name) || []) owners.set(bone, "target");
  }
  if (DIALS.flinch && FLINCH_STATES.has(name)) {
    owners.set("Spine", "target");
    owners.set("Spine1", "target");
  }
  if (DIALS.footIK && PLANT_STATES.has(name)) {
    for (const side of ["Left", "Right"]) {
      for (const b of [`${side}UpLeg`, `${side}Leg`, `${side}Foot`]) owners.set(b, "ground");
    }
  }
  if (charKey) {
    for (const bone of gripBones(charKey, animKey)) owners.set(bone, "prop");
  }
  return owners;
}

/** Solve the striking limb onto the aim point (render3d/src/ik.js).
 *
 *  The offsets arrive in GAME PIXELS along the fighter's facing and up from
 *  their feet — quantised by aimSolve, because they are part of the cache key.
 *  Converting is one ratio: the rig is authored in metres and occupies
 *  `targetPx` pixels on screen. The target is then built in the RIG's own
 *  frame (+Z is forward, the same axis applyAim pitches about) and pushed
 *  through localToWorld, which folds in the turnaround, the world placement
 *  and the instance scale in one step — so this works identically for the flat
 *  blit, where the rig sits at the origin, and for the in-scene camera path,
 *  where it stands at the fighter's position scaled to game size. */
function applyMachineReach(rig, animKey, sampled, layers) {
  // A caller that knows better hands over the world point itself. That is not
  // a convenience: WHERE a strike should land depends on how the fighter is
  // presented, and it is one of the few places the two model backends really
  // do differ. Live geometry reaches along the fighter's OWN forward, because
  // that is where they are pointing in the world. A billboard card is always
  // seen from one fixed ¾ camera, so its `dx` is a distance ACROSS THE SCREEN
  // — the card has to reach where the sprite it replaces reached, and that is
  // a camera-relative direction. Building the card's target the rig-relative
  // way put the striking hand 30° off.
  if (DIALS.reach && layers.reachTarget && reaches(animKey)) {
    applyReach(THREE, rig.root, animKey, clipTime(animKey, sampled), layers.reachTarget, _ik, layers.beat);
    return;
  }
  const reach = layers.reach;
  if (!DIALS.reach || !reach || !reaches(animKey)) return;
  const targetPx = reach.targetPx || 0;
  if (targetPx <= 0 || !rig.height) return;
  const mPerPx = rig.height / targetPx;
  _reachTarget.set(0, (reach.dy || 0) * mPerPx, (reach.dx || 0) * mPerPx);
  rig.root.localToWorld(_reachTarget);
  applyReach(THREE, rig.root, animKey, clipTime(animKey, sampled), _reachTarget, _ik, layers.beat);
}
