// FACIAL PERFORMANCE — for the mechs that have an organic face.
//
// Most of this roster is a machine: a visor, a lamp, a grill. KONGA and TRITONE
// are not. They have brows, eyes and a jaw made of meat, and a face that never
// moves reads as a mask — worse on them than on a robot, because the sculpt
// promises it should.
//
// TWO LEVELS, so the same performance survives both render routes:
//
//   HEAD GESTURE — driven through `tgt.head` (and a little `tgt.torso`), which
//     EVERY build has, procedural or GLB. A roar throws the head back, a snarl
//     drops it and shakes, a flinch snaps it aside. This is the layer that
//     carries the acting, and it works on a Tripo model with no face bones.
//
//   FACE PARTS — the `jaw`, `browL`, `browR` parts. The procedural designs
//     build them as virtual joints; the GLB route carries the same names as
//     real bones in rigs/<id>.rig.js, and `Animator.part()` resolves whichever
//     this body has. When neither exists the block is skipped in silence, so a
//     GLB with no custom rig simply performs with its head instead of breaking.
//
// WHY IT LIVES HERE and not in each mech's signature: the two faces want the
// same VOCABULARY (idle breath, snarl, roar, flinch, death slack) with different
// PROPORTIONS — a gorilla's jaw opens on a hinge under a heavy brow, a
// ceratopsian's beak opens wider and its brow barely moves. So the behaviour is
// shared and the numbers are per-mech (the `cfg` argument).
//
// Expression is chosen from what the body is doing, in priority order:
//   dead > flinch (hitstun) > roar (heavy/special/ult) > snarl (any attack)
//   > firing > idle
// and then DAMPED toward, never snapped — a face that teleports between poses
// reads as a glitch. Attack expressions ride the CLIP'S OWN PHASE (like cranky's
// pincer gape), so the mouth opens on the wind-up and is widest at the hit
// instead of drifting on a timer of its own.
import * as THREE from 'three';
import { lerp, clamp01 } from '../core/utils.js';
import { PRONE_CLIPS } from './animations.js';

// Per-mech proportions. Angles in radians.
export const FACE_PRESETS = {
  // Gorilla: a heavy prognathous jaw on a low hinge, huge expressive brow ridge.
  // The brow is the readable half of a gorilla's face, so it gets a wide range.
  konga: {
    // …EXCEPT THAT THIS JAW DOES NOT OPEN. `jawFixed` welds the performance to
    // the head: the numbers below are kept because they are right for the
    // face, but nothing writes them while the flag is on. His jaw ISLAND (the
    // auto-mesher's, ~4.2k verts) owns the whole throat and lower muzzle, so
    // rotating the bone 35° for a roar swings that mass down the chest and the
    // face melts into streaks — measured on his chest-beat taunt at the roar
    // peak. A SOLID FACE BEATS A MELTING ONE, which is the owner's call and
    // the same one the feather bands answer. Take the flag off the day the jaw
    // is rebound to just the mandible, and the roar comes back with it.
    jawFixed: true,
    jawIdle: 0.04, jawSnarl: 0.20, jawRoar: 0.62, jawFlinch: 0.10, jawDead: 0.30,
    // A BROW RIDGE IS BONE. It is the readable half of the face, but what
    // reads is a FURROW, not a shrug: the owner's note is that these were
    // moving far too much. Measured with tools/browprobe.mjs, the old
    // -0.30/-0.42 swung the ridge 7% of body height — three quarters of the
    // eye's own height — where 2-3% is a scowl you believe. Cut to roughly a
    // third; the idle effort term rides browSnarl, so it follows.
    browIdle: 0, browSnarl: -0.11, browRoar: -0.06, browFlinch: -0.15,
    breath: 0.035, breathRate: 1.5,
    headRoarBack: -0.34, headSnarlDown: 0.16, headFlinch: 0.30,
    shakeAmp: 0.09, shakeRate: 26,
  },
  // Ceratopsian: a big beak that opens WIDE and slowly; the bony brow ridges
  // are nearly rigid, so their range is small and most of the read is jaw+head.
  tritone: {
    jawIdle: 0.03, jawSnarl: 0.16, jawRoar: 0.52, jawFlinch: 0.06, jawDead: 0.26,
    browIdle: 0, browSnarl: -0.14, browRoar: -0.08, browFlinch: -0.20,
    breath: 0.025, breathRate: 1.1,
    headRoarBack: -0.26, headSnarlDown: 0.12, headFlinch: 0.22,
    shakeAmp: 0.06, shakeRate: 22,
  },
};

// Clips that should read as a full-throated ROAR rather than a working snarl:
// the committed, wind-up-then-commit blows and the set-piece moves.
const ROAR_CLIPS = new Set([
  'kongaSlam', 'kongaSlamMirror', 'chestBeat',
  'tritoneToss', 'tritoneTossMirror', 'goreCharge',
  'heavy', 'heavyMirror', 'poundSlam', 'poundSlamMirror',
  'castRaise', 'burst', 'taunt', 'victory',
]);

/**
 * Ask the face to bellow for `dur` seconds regardless of what clip is playing.
 * Specials/ults call this at the moment they want the roar to land (the chest
 * drum, the moment a charge connects), because those beats are scheduled in
 * combat code and have no clip phase of their own to ride.
 */
export function faceRoar(f, dur = 0.5) {
  const anim = f?.animator;
  if (anim) anim._faceRoarT = Math.max(anim._faceRoarT || 0, dur);
}

/**
 * Drive one mech's face for a frame. Call from that mech's SIGNATURES entry:
 *   driveFace(anim, dt, ctx, tgt, FACE_PRESETS.konga);
 *
 * Writes head/torso through `tgt` (so the animator's smoother owns them, and a
 * clip that keys the head still wins the argument), and writes the jaw/brow
 * joints directly (nothing else touches them).
 */
export function driveFace(anim, dt, ctx, tgt, cfg) {
  const act = anim.action;
  const clip = act && !act.fadingOut ? act.clip : null;
  const name = clip ? clip.name : '';
  // A one-shot, non-prone clip is a STRIKE; a mech on its back is not emoting
  // at anything, it's just down.
  const striking = !!clip && !clip.loop && !PRONE_CLIPS.has(name);
  // phase through the strike, so the mouth peaks at the blow rather than drifting
  const ph = striking ? clamp01(act.t / Math.max(0.01, clip.dur)) : 0;

  // explicit bellow requested by a special/ult (faceRoar)
  anim._faceRoarT = Math.max(0, (anim._faceRoarT || 0) - dt);
  const forcedRoar = anim._faceRoarT > 0;

  const dead = ctx.dead || ctx.state === 'dead';
  const hurt = ctx.state === 'hitstun' || ctx.state === 'launched' || ctx.state === 'knockdown';
  const roaring = forcedRoar || (striking && ROAR_CLIPS.has(name)) || ctx.state === 'ult';

  // ---- choose the target expression -------------------------------------
  let jaw, brow, headPitch = 0, shake = 0;
  if (dead) {
    jaw = cfg.jawDead; brow = 0;
  } else if (hurt) {
    jaw = cfg.jawFlinch; brow = cfg.browFlinch;
    headPitch = cfg.headFlinch;
    shake = 1;
  } else if (roaring) {
    // OPEN on the wind-up, WIDEST at the hit, closing through the recovery —
    // a bell curve over the clip, or wide-open flat for a forced bellow.
    const k = forcedRoar ? 1
      : ph < 0.34 ? ph / 0.34
        : ph < 0.55 ? 1
          : 1 - clamp01((ph - 0.55) / 0.45);
    jaw = lerp(cfg.jawIdle, cfg.jawRoar, k);
    brow = lerp(0, cfg.browRoar, k);
    headPitch = cfg.headRoarBack * k;   // head thrown back to bellow
    shake = k * 0.5;
  } else if (striking) {
    const k = ph < 0.45 ? ph / 0.45 : 1 - clamp01((ph - 0.45) / 0.55);
    jaw = lerp(cfg.jawIdle, cfg.jawSnarl, k);
    brow = lerp(0, cfg.browSnarl, k);
    headPitch = cfg.headSnarlDown * k;  // chin tucked, glaring over the brow
  } else if (ctx.firing) {
    jaw = cfg.jawIdle; brow = cfg.browSnarl * 0.5;
  } else {
    // at rest: breathe, and let effort tighten the brow as he runs
    const effort = clamp01((ctx.speed || 0) / Math.max(1, ctx.maxSpeed || 10));
    jaw = cfg.jawIdle + Math.sin(anim.t * cfg.breathRate) * cfg.breath * (1 + effort);
    brow = cfg.browSnarl * 0.25 * effort;
  }

  // ---- damp toward it ----------------------------------------------------
  // fast onto a violent pose, slower back off it: a snarl SNAPS on and eases
  // away, which is the timing that reads as a reaction rather than a dissolve.
  const want = { jaw, brow };
  const prev = anim._face || (anim._face = { jaw: cfg.jawIdle, brow: 0, head: 0, shake: 0 });
  const rate = (a, b, up, down) => lerp(a, b, 1 - Math.exp(-(b > a ? up : down) * dt));
  prev.jaw = rate(prev.jaw, want.jaw, 26, 9);
  prev.brow = rate(prev.brow, want.brow, 24, 8);
  prev.head = lerp(prev.head, headPitch, 1 - Math.exp(-16 * dt));
  prev.shake = lerp(prev.shake, shake, 1 - Math.exp(-18 * dt));

  // ---- apply -------------------------------------------------------------
  // FACE PARTS. `anim.part` finds them whether this body is procedural (virtual
  // joints) or a GLB on a custom rig (bones of the same name), so the SAME
  // performance drives both routes. Silently skipped on a rig with no face.
  const jawPart = anim.part('jaw');
  const browLPart = anim.part('browL');
  const browRPart = anim.part('browR');
  // `jawFixed` keeps the jaw RIGID TO THE HEAD — the mouth never opens, so a
  // jaw whose skin owns more than the mandible cannot drag the face with it.
  // The rest of the performance (brows, head gesture, shake) is untouched.
  if (jawPart && !cfg.jawFixed) jawPart.rotation.x = prev.jaw;
  // A BROW HAS ONE HINGE, AND IT IS MEASURED, NOT NAMED. `rotation.x` was the
  // whole of this once, which is right on the game's own joints (built facing
  // +z with left at -x, so local x IS the lateral hinge) and WRONG on a custom
  // rig authored in the raw GLB's bind space, where local x points FORWARD and
  // the same line ROLLS the ridge instead of pitching it. On konga that put
  // half the travel sideways — the brows visibly swinging left and right in
  // victory, intro and every strike (tools/browprobe.mjs: 7.1% of body height
  // lateral against 7.5% lift). So the axis comes from the two brows
  // themselves: the vector from the right brow to the left one is the head's
  // lateral axis on ANY rig, in whatever frame that rig was authored in, and
  // rotating about it is a raise/lower by construction. Cached per animator —
  // bind positions never change — and applied in the PARENT's frame over each
  // brow's rest rotation, so nothing else the rig authored is thrown away.
  if (browLPart && browRPart) {
    let h = anim._browHinge;
    if (!h) {
      const axis = new THREE.Vector3().subVectors(browRPart.position, browLPart.position);
      if (axis.lengthSq() < 1e-9) axis.set(1, 0, 0); else axis.normalize();
      h = anim._browHinge = { axis, q: new THREE.Quaternion(),
        restL: browLPart.quaternion.clone(), restR: browRPart.quaternion.clone() };
    }
    h.q.setFromAxisAngle(h.axis, prev.brow);
    browLPart.quaternion.copy(h.q).multiply(h.restL);
    browRPart.quaternion.copy(h.q).multiply(h.restR);
  }

  // HEAD GESTURE — always available, on both routes. Additive into tgt so the
  // clip's own head keys still lead.
  if (tgt.head) {
    tgt.head[0] += prev.head;
    if (prev.shake > 0.02) tgt.head[1] += Math.sin(anim.t * cfg.shakeRate) * cfg.shakeAmp * prev.shake;
  }
  // a real bellow comes off the chest, not just the neck
  if (tgt.torso && prev.head < -0.02) tgt.torso[0] += prev.head * 0.25;
}
