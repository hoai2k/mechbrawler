// Pose-blend animation engine: procedural locomotion + keyframe action clips
// + additive impulses (recoil/flinch) + per-mech signature joint motion.
import * as THREE from 'three';
import { CLIPS, UPPER_JOINTS, defClipVariants } from './animations.js';
import {
  gaitFor, gaitIdFor, applyGait, applyQuadGait, applyGaitKeys, applyToeHang, gaitPhaseRate,
  effectiveGait, applyTailGait, tailChainOf, applyHexGait, hexLegsOf,
} from './gaits.js';
import { ARM_JOINTS, mirrorJointName, mirrorValue } from './glbanim.js';
import { bodySkinnedMesh, boneSoleSamples } from './glbshell.js';
import { SIGNATURES, levelHands } from './signatures.js';
import { ease, lerp, clamp, clamp01, damp, angleDamp, TAU } from '../core/utils.js';

// WHEN THE LEGS GIVE UP AND WALK BACKWARDS. A strafe is not a back-pedal: only
// travel that is very nearly straight AT the camera reverses the cycle, and
// everything short of that — sideways, sideways-and-a-bit-behind — turns the
// hips to face the way he is going and keeps striding forwards.
//
// READ THESE OFF A CLOCK FACE, because that is how the complaint arrives: noon
// is his facing, 3 is a pure right strafe, 6 is straight back. 5 o'clock is
// 150°, and this line USED to sit exactly there — so the one direction most
// likely to be held (sideways-and-back, retreating while circling) landed on
// the boundary and flipped in and out of a backwards walk. It is 170° now:
// everything up to and including 5 o'clock strides FORWARD with the hips turned
// under a still-aiming chest, and only very nearly 6 reverses. 20° of
// hysteresis on top, so the boundary itself cannot flutter.
export const LEG_BACK_ON = 170 * Math.PI / 180;   // enter the reversed cycle
export const LEG_BACK_OFF = 150 * Math.PI / 180;  // and leave it
// HOW FAR THE HIPS MAY TURN off the body's facing, and how fast they get there.
// Exactly the reversal threshold: past it the reversed cycle takes over (see
// legFrame), so nothing ever has to spin the legs the long way round.
const LEG_TURN_MAX = LEG_BACK_ON;
const LEG_TURN_RATE = 9;
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// How fast a downed tail goes limp, and how fast it picks itself back up
// (1/s — ~0.3s either way, which reads as a flop rather than a switch).
const LIMP_RATE = 9;
const DOWN_STATES = new Set(['knockdown', 'getup', 'dead']);
// WHICH PARTS GO LIMP when a body goes down: the roots of the chains that
// hang off it and carry no weight. `tail0` by convention (fenrir's blade,
// tritone's armoured tail); a rig may name others with `limpChains` — wraith's
// cloak is `cape0`, four columns of dead cloth that were holding him a quarter
// of a body height off the ground, and a manifest entry may name them for a
// mech with no custom rig at all (saurion's auto-rigged raptor tail is
// `tripoSpine_0`). gltf.js resolves the list ONCE onto `mech.limpChains` and
// reads the same field to decide what the prone floor clamp must not measure,
// so the ragdoll and the clamp can never disagree about what is dead weight.
export const LIMP_ROOTS = ['tail0'];
export const limpRootsOf = (mech) => mech?.limpChains || LIMP_ROOTS;

const _wp = new THREE.Vector3();
const _sp = new THREE.Vector3();
const _lp = new THREE.Vector3();
const _lc = new THREE.Vector3();
const _ld = new THREE.Vector3();
const _lg = new THREE.Vector3();
const _lr = new THREE.Vector3();
const _lq = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _up = new THREE.Vector3();
const _qup = new THREE.Quaternion();
// Aegis tower shield: local rest carry, and the brace tilt applied when the
// shield is squared to the front during a block

const D2R = Math.PI / 180;
const ALL_JOINTS = [
  'torso', 'head', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'handL', 'handR',
  'thighL', 'thighR', 'kneeL', 'kneeR', 'ankleL', 'ankleR',
];
// The chain that carries a foot. Only these get the grown-body smoothing in
// update() — an arm may whip at giant size (that reads as power), a foot may
// not (that reads as a dropped frame).
const LEG_SMOOTH = new Set(['thighL', 'thighR', 'kneeL', 'kneeR', 'ankleL', 'ankleR']);
// Ceiling on leg-joint angular speed for a GROWN body, in rad/s before the
// √sizeMul divide (see update()). Measured against colossus at normal size: his
// leg joints sit at 2.5 rad/s for the 95th percentile of frames and 5 for the
// 99th, spiking to ~13 on a clip's first frame — so 6 is above everything a
// clip does habitually and only catches the snaps. It never applies at
// sizeMul 1; at 4× it becomes 3 rad/s, which is what stops a stomp from
// teleporting a foot across half an arena block.
const LEG_W_REF = 6;
// How fast the pelvis chases the measured sole (1/s), before the √sizeMul
// divide. This loop removes a mech's STANDING sole offset, which is constant,
// so it only has to be faster than a mech changes speed — not faster than a
// stride. It shipped at 20 (a 0.05 s time constant), which chased the leg
// chain's own per-step ripple and, lagging it by a quarter cycle, drove the
// body instead of tracking it: measured hip travel was 9.6-9.8% of body height
// on Glacier and 5.0-7.1% on Titanus, once per step. That is what reads as a
// heavy mech BOUNCING. At 2.5 the same mechs walk on 3.1-3.5% and 0.8-1.3%,
// while the average sole clearance the loop exists to null stays dead on zero
// (Glacier -0.004 vs +0.010 at rate 20, against +0.109 with the loop off) —
// the anti-float fix is untouched, only the bounce is gone. Faster than ~4
// starts putting the ripple back; much slower than ~1.5 buys nothing more.
const SOLE_FOLLOW_RATE = 2.5;


function sampleTrack(track, t) {
  if (t <= track[0].t) return track[0].v;
  const last = track[track.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 1; i < track.length; i++) {
    if (t <= track[i].t) {
      const a = track[i - 1], b = track[i];
      const f = ease[b.ease]((t - a.t) / (b.t - a.t));
      return [lerp(a.v[0], b.v[0], f), lerp(a.v[1], b.v[1], f), lerp(a.v[2], b.v[2], f)];
    }
  }
  return last.v;
}

export class Animator {
  constructor(mech) {
    this.mech = mech;
    this.J = mech.joints;
    this.D = mech.dims;
    this.s = mech.dims.scale;

    // rest pose: defaults + per-mech overrides (degrees in def)
    this.rest = {};
    for (const j of ALL_JOINTS) this.rest[j] = [0, 0, 0];
    this.rest.shoulderL = [0, 0, -10 * D2R];
    this.rest.shoulderR = [0, 0, 10 * D2R];
    this.rest.elbowL = [-12 * D2R, 0, 0];
    this.rest.elbowR = [-12 * D2R, 0, 0];
    if (mech.def.restPose) {
      for (const [j, v] of Object.entries(mech.def.restPose)) {
        this.rest[j] = [v[0] * D2R, v[1] * D2R, v[2] * D2R];
      }
    }
    // GLB models carry an animation profile (glbanim.js) that reinterprets the
    // shared engine for their geometry; procedural mechs have none (identity).
    this.profile = mech.animProfile || null;
    if (this.profile?.restPose) {
      for (const [j, v] of Object.entries(this.profile.restPose)) {
        this.rest[j] = [v[0] * D2R, v[1] * D2R, v[2] * D2R];
      }
    }

    // measure ground offset under rest pose so bent-leg mechs stand on ground
    this.applyPose(this.makeRestTarget());
    this.J.root.updateWorldMatrix(true, true);
    const rootY = this.J.root.position.y;
    let minAnkle = Infinity;
    for (const a of ['ankleL', 'ankleR']) {
      this.J[a].getWorldPosition(_wp);
      minAnkle = Math.min(minAnkle, _wp.y - rootY);
    }
    this.groundOffset = -(minAnkle - 0.32 * this.s);
    // How deep the SOLE sits under the ankle joint, as a fraction of the depth
    // the gait assumes (0.32 * scale — the same number groundOffset is derived
    // against). 1 = the procedural convention; calibrateFeet() measures the real
    // number for a rigged GLB.
    this.ankleGain = 1;
    this.footFlat = 0;
    this.footDepth = 0.32 * this.s;

    // BODY SIZE MULTIPLIER — 1 normally; a fighter that is grown at RUNTIME
    // (colossus' COLOSSAL FORM scales his group to 4×) sets it to the live
    // factor. Everything in this animator is authored in the model's own local
    // units, so without it a scaled mech's limbs keep their small-body TIMING
    // while covering four times the distance, and the feet skate and teleport.
    // Two places read it, for two different reasons — see update():
    //   · the walk cadence, because a planted foot must sweep at ground speed
    //     (a CONTACT constraint: full 1/sizeMul, or he skates);
    //   · the pose smoothing on the leg joints, because a big limb swings
    //     slower (DYNAMIC SIMILARITY: 1/√sizeMul, the same √L that makes a
    //     giant's stride look heavy instead of frantic).
    this.sizeMul = 1;
    // THE GAIT this body walks with — a named entry in the gait table
    // (gaits.js), shared by every mech whose def names it. Held as a live
    // reference rather than copied, so the gait workbench can retune one gait
    // and see every mech that runs it move. `gaitId` is what the workbench and
    // the pickers display.
    this.gaitId = gaitIdFor(mech.def);
    this.gait = gaitFor(mech.def);
    this._gait = this.gait;   // …at the current speed (see effectiveGait in update)
    this.cur = this.makeRestTarget();   // smoothed applied pose
    this.phase = Math.random() * TAU;   // gait phase
    this.t = Math.random() * 100;       // global time (desyncs idles)
    this.action = null;
    this.impulses = [];
    this.spinVel = 0;                   // gatling spin
    this.fired = false;                 // convenience flag combat can poll
  }

  // ---------------------------------------------------------------------------
  // WHICH WAY THE LEGS ARE POINTING — which is not always the way the body is.
  //
  // A mech in target-lock walks sideways and backwards while its chest stays on
  // the enemy. Until now the whole body turned as one, so a strafe played a
  // forward stride translated sideways (feet skating across the ground) and a
  // BACK-PEDAL played a forward stride translated backwards, which is the
  // "walking backwards looks wrong" report: the legs were pushing the way he
  // was going instead of against it.
  //
  // These are robots, so the answer is the one a person cannot do: TURN THE
  // HIPS. `drift` is the angle from the body's facing to its actual travel, and
  // the legs take it while the torso counter-rotates by the same amount, so the
  // lower body walks where it is going and the upper body still aims.
  //
  // …UP TO A POINT. Aimed almost straight back at the camera there is nothing
  // left to turn toward, so the OTHER answer applies: measure the drift against
  // the REVERSED facing (a 180° back-pedal becomes 0° of leg turn) and run the
  // walk cycle BACKWARDS, so he back-pedals with the feet pushing the right way.
  //
  // WHERE THAT LINE SITS IS THE WHOLE FEEL. It used to be a quarter turn, which
  // made "sideways with a little bit of backwards" a REVERSED cycle — a strafe
  // that walked backwards, which is not what a strafe looks like. It is 170°
  // now (LEG_BACK_ON): a STRAFE NEVER REVERSES, only a genuine retreat does, and
  // the hips are allowed the full 170° to get there.
  //
  // Crossing that line is a real half-turn of the pelvis — the two answers put
  // the legs on opposite sides of the body, so there is no sleight of hand that
  // makes it free — and it is DAMPED like every other leg turn, which reads as
  // the mech pivoting his lower body to back away. What keeps it from happening
  // twice a second is the 20° of hysteresis: he commits to the retreat at 150°
  // and does not come out of it until 130°.
  //
  // Humanoids only. A crab does not counter-rotate its waist, and neither does a
  // wolf on four legs — gated on the gait (`standard`/`sprint`) plus a roster
  // opt-out (`strafeLegs: false`) for the bodies that walk upright but are not
  // built like people.
  legFrame(ctx, speed, dt) {
    const st = this._legFrame || (this._legFrame = { turn: 0, rev: 0, back: false });
    const on = this.canStrafeTurn() && ctx.grounded !== false && speed > 0.4;
    // OFF is an unwind, not a crossing: a mech that stops, jumps or leaves the
    // strafe eases both back to neutral. Rebasing here instead would spin the
    // legs a full half turn every time he came to a halt mid-retreat.
    if (!on) {
      st.back = false;
      st.turn = angleDamp(st.turn, 0, LEG_TURN_RATE, dt);
      st.rev = damp(st.rev, 0, LEG_TURN_RATE, dt);
      return st;
    }
    const drift = ctx.drift || 0;
    // which way round is he actually walking? (hysteresis: enter late, leave
    // early, so the boundary cannot chatter)
    const mag = Math.abs(drift);
    const back = st.back ? mag > LEG_BACK_OFF : mag > LEG_BACK_ON;
    st.back = back;
    const want = back ? wrapPi(drift - Math.PI) : drift;
    st.turn = angleDamp(st.turn, clamp(want, -LEG_TURN_MAX, LEG_TURN_MAX), LEG_TURN_RATE, dt);
    // the cycle's direction is a 0..1 blend rather than a switch, so the stride
    // eases through the reversal instead of jumping to the other foot
    st.rev = damp(st.rev, back ? 1 : 0, LEG_TURN_RATE, dt);
    return st;
  }

  /** Does this body counter-rotate its waist to walk sideways? */
  canStrafeTurn() {
    if (this.mech.def?.strafeLegs === false) return false;
    return this.gaitId === 'standard' || this.gaitId === 'sprint';
  }

  // ---------------------------------------------------------------------------
  // TWO LEGS OR FOUR — a state, not a mixture.
  //
  // The gallop normally crosses in as a function of SPEED: `quad.onset` to
  // `onset + blend`, so at the middle of that band the mech is permanently
  // half-wolf. For a body that genuinely mixes the two that is right. FENRIR is
  // not that body — he jogs like a biped and gallops like a wolf, and there is
  // no animal that spends its afternoon halfway between. `quad.snap` (seconds)
  // turns the crossing into a transition he PASSES THROUGH: past the onset he
  // commits to four legs over `snap` seconds, below it he commits back, and the
  // only time he is in between is while that blend runs.
  //
  // HYSTERESIS is what makes it a state rather than a twitch. Without it, a mech
  // held at exactly the onset flips target every frame that the speed noise
  // crosses it and the body shivers between gaits; the threshold to commit UP is
  // a little above the one to fall back DOWN, so the decision sticks.
  //
  // Returns undefined when the dial is off, which is the signal to gaits.js to
  // use the speed ramp it always did — every other mech is untouched, and so is
  // every stateless caller (the workbench's dial sweep, tools/gaitprobe).
  gallopState(ratio, dt) {
    const Q = this.gait?.quad;
    const snap = Q?.snap || 0;
    if (!Q || snap <= 0) { this._quadQ = undefined; return undefined; }
    const onset = Q.onset ?? 0.4;
    const hyst = Math.min(0.08, (Q.blend ?? 0.35) * 0.5);
    const was = this._quadQ ?? (ratio >= onset ? 1 : 0);
    const want = ratio >= onset + hyst ? 1 : ratio <= onset - hyst ? 0 : (was > 0.5 ? 1 : 0);
    this._quadQ = damp(was, want, 1 / Math.max(0.02, snap), dt);
    return this._quadQ;
  }

  // The tail chain this body has, measured once (see tailChainOf). Null for
  // every mech without one, which is all of them but fenrir today.
  tailChain() {
    if (this._tail === undefined) this._tail = tailChainOf(this.mech.rigBones) || null;
    return this._tail;
  }

  // …and the extra legs a hexapod carries (see hexLegsOf). Null for every body
  // that walks on the two the game knows about.
  hexLegs() {
    if (this._hex === undefined) this._hex = hexLegsOf(this.mech.rigBones) || null;
    return this._hex;
  }

  makeRestTarget() {
    const tgt = { hipsPos: [0, 0, 0], hipsRot: [0, 0, 0] };
    for (const j of ALL_JOINTS) tgt[j] = [...this.rest[j]];
    return tgt;
  }

  // Deterministic neutral rest pose — no idle breathing, no random phase/t, no
  // signature motion. Used to MEASURE a mech (head height) and for the pose
  // tool's static reference, so the same pose is reproduced every time (the
  // live update() seeds phase/t with Math.random(), which made head-height
  // measurements jitter between build and runtime).
  poseStatic() {
    const tgt = this.makeRestTarget();
    for (const key of Object.keys(tgt)) this.cur[key] = [...tgt[key]];
    this.applyPose(this.cur);
    this.mech.postAnimate?.();
  }

  // ---------- foot calibration ----------
  // The walk's plantar-flex TOE-OFF and heel roll rotate the ANKLE, and the
  // sole's vertical travel for a given rotation scales with how far the sole
  // sits BELOW that joint. Procedural bodies are built to one convention — sole
  // 0.32 * scale under the ankle, the same depth groundOffset is derived
  // against — and the gait's ankle amplitudes are authored for exactly that
  // geometry. A rigged GLB is under no such obligation: Titanus' boots put the
  // sole 1.22 units under his ankle bone against an assumed 0.41, so the same
  // ~0.66 rad toe-off drove his sole 0.75 THROUGH the floor. With his body
  // held up by the hips, that reads as the leg reaching down past the ground
  // and pushing off thin air — the "floating" walk.
  //
  // Measure the real depth once, at rest, off the actual skinned foot geometry
  // (not the bone, which on some rigs sits inside or below the boot), and scale
  // the gait's ankle terms by the ratio: every body then rolls its foot through
  // the same amount of GROUND rather than the same number of radians. Only
  // meaningful for GLBs — a procedural mech measures ~0.32*s and keeps 1.0.
  //
  // Called from createMech() once the retarget adapter exists (the GLB's real
  // bones only follow the virtual rig after postAnimate/adapter.sync).
  // `store` is an optional per-MODEL cache object (gltf.js hands over its fit
  // cache). The sole samples are stated in the ankle bone's OWN frame and the
  // depth is a distance on a model whose scale is pinned per entry, so both are
  // properties of the file rather than of this copy: a second body built from
  // the same entry replays them instead of re-walking the whole skinIndex —
  // which is the difference between a raptor-pack spawn costing 8ms and 50.
  calibrateFeet(store = null) {
    const mech = this.mech;
    if (!mech.isGLB || !mech.boneMap) return this.ankleGain;
    const body = bodySkinnedMesh(mech.group);
    if (!body) return this.ankleGain;
    this.poseStatic();
    mech.group.updateMatrixWorld(true);
    let depth = 0;
    const soles = [];
    const cached = store?.foot;
    if (cached) {
      depth = cached.depth;
      for (const c of cached.soles) {
        const bone = mech.boneMap['ankle' + c.side];
        if (bone) soles.push({ side: c.side, bone, points: c.points.map((p) => p.clone()) });
      }
    } else {
      for (const side of ['L', 'R']) {
        const bone = mech.boneMap['ankle' + side];
        if (!bone) continue;
        const s = boneSoleSamples(body, bone);
        if (!s) continue;
        depth = Math.max(depth, bone.getWorldPosition(_wp).y - s.lowest);
        soles.push({ side, bone, points: s.points });
      }
      if (store) {
        store.foot = {
          depth,
          soles: soles.map((s) => ({ side: s.side, points: s.points.map((p) => p.clone()) })),
        };
      }
    }
    // sole sample points, for the per-frame pelvis follow in update()
    this.soles = soles.length === 2 ? soles : null;
    // THE QUADRUPED STOPS HERE. Its soles are now sampled — that is what the
    // pelvis follow needs to keep a body ON the floor, and without it fenrir's
    // paws had nothing holding them up (he was the one mech with no ground
    // contact at all) — but the DAMPING below is derived from a boot's depth
    // under an ankle, and a hock is nothing like a boot: it would quarter the
    // authored gallop's hock motion and ask the paw to lie flat.
    if (this.gait.quad) return this.ankleGain;
    // A rig whose ankle bone sits at or below the sole (depth <= 0) tells us
    // nothing — keep the default rather than inverting the toe-off.
    if (depth > 0.02) {
      this.footDepth = depth;
      this.ankleGain = clamp((0.32 * this.s) / depth, 0.25, 1);
      // A boot that much deeper than the convention is also LONG, and a long
      // sole plate pitched even slightly buries a corner. Ask the gait to keep
      // it parallel to the ground (see footFlat in update()), fading the ask in
      // as the foot outgrows what the authored roll was tuned for.
      this.footFlat = clamp01((depth / (0.32 * this.s) - 1) / 0.5);
    }
    return this.ankleGain;
  }

  // Height of the LOWER foot's sole above the ground, right now. Uses the sole
  // sample points captured by calibrateFeet (a couple of dozen matrix transforms,
  // not a re-walk of the skinned mesh), so it is cheap enough to run every frame.
  // Null when this mech was never calibrated (procedural bodies).
  soleClearance() {
    const per = this.soleClearanceBySide();
    if (!per) return null;
    const low = Math.min(per.L ?? Infinity, per.R ?? Infinity);
    return Number.isFinite(low) ? low : null;
  }

  // The same measurement PER FOOT, which is what tells the gait which foot is on
  // the ground: the foot rules (gaits.js — level the sole while it is down, let it
  // hang off the shin while it is up) need it per side, and a pose-only proxy
  // cannot always tell a lifted foot from a body squatting over a planted one.
  // Null when this mech was never calibrated (procedural bodies, and the
  // quadruped, whose hock calibrateFeet deliberately skips).
  soleClearanceBySide() {
    if (!this.soles) return null;
    // MEASURED ALONG THE BODY'S OWN UP, not world +Y. They are the same thing
    // for anything standing on the floor — but a WALL CLIMBER (combat/climb.js)
    // has had his whole frame damped over onto a facade, and a height taken in
    // world y there reads the distance out from the wall instead of the
    // distance off the surface: every foot rule the gait runs on ("is this one
    // down?") inverts, and the pelvis follow below drives the body with it.
    // Projecting onto the group's up axis costs one dot product and is exact
    // on both.
    this.J.root.getWorldPosition(_wp);
    this.mech.group.getWorldQuaternion(_qup);
    _up.set(0, 1, 0).applyQuaternion(_qup);
    const out = { L: null, R: null };
    for (const f of this.soles) {
      f.bone.updateMatrixWorld(true);
      let low = Infinity;
      for (const p of f.points) {
        const h = _sp.copy(p).applyMatrix4(f.bone.matrixWorld).sub(_wp).dot(_up);
        if (h < low) low = h;
      }
      if (Number.isFinite(low)) out[f.side] = low;
    }
    return out;
  }

  // ---------- action clips ----------
  play(name, opts = {}) {
    // a profile may swap in a bespoke clip for an action it must redo rather
    // than remap (kept under the SAME name so fighter state/isPlaying match);
    // below that, a roster def may reshape a shared clip for its body type
    // (defClipVariants — currently the `ball` tuck via def.ballPose)
    const clip = this.profile?.clipOverrides?.[name] ||
      defClipVariants(this.mech.def)?.[name] || CLIPS[name];
    if (!clip) { console.warn('no clip', name); return 0; }
    this.action = {
      clip, t: 0, speed: opts.speed || 1, weight: 0,
      fadeIn: opts.fade ?? 0.07, fadingOut: false,
      onEvent: opts.onEvent || null, lastT: -1,
    };
    return clip.dur / (opts.speed || 1);
  }

  stop(fade = 0.12) {
    if (this.action) { this.action.fadingOut = true; this.action.fadeOut = fade; }
  }

  // Re-express a smoothed angle in the WINDING an incoming clip is authored in.
  // A half turn is the same pose whether you call it +180° or -180°, but the
  // pose smoother below lerps numbers, not orientations — so handing the body
  // from a clip authored at +180 to one authored at -180 spins it the long way
  // round while we're trying to roll it the short way. Shift the banked value
  // by whole turns instead: nothing moves this frame, the next lerp just goes
  // the way the clip meant. (See the ROLLOVER clips in animations.js.)
  rewrap(joint, i, target) {
    const c = this.cur[joint];
    if (!c) return;
    while (c[i] - target > Math.PI) c[i] -= TAU;
    while (target - c[i] > Math.PI) c[i] += TAU;
  }

  isPlaying(name) {
    return !!this.action && !this.action.fadingOut && (!name || this.action.clip.name === name);
  }

  addImpulse(joint, amp, freq = 26, decay = 9) {
    this.impulses.push({ joint, amp, freq, decay, t: 0 });
  }

  // ---------- main update ----------
  // ctx: { speed, maxSpeed, grounded, vy, blocking, dead, dashT, aimYaw, firing }
  update(dt, ctx = {}) {
    this.t += dt;
    // IS HE DOWN? Only the tail solver reads this today (see limpTail), and it
    // needs the frame time as well, because it is the one part of the pose that
    // integrates rather than being evaluated.
    this._limpDt = dt;
    this._limp = damp(this._limp || 0, DOWN_STATES.has(ctx.state) ? 1 : 0, LIMP_RATE, dt);
    const tgt = this.makeRestTarget();

    // ===== locomotion layer =====
    const speed = ctx.speed || 0;
    const maxSpeed = ctx.maxSpeed || 10;
    const ratio = clamp01(speed / maxSpeed);
    const grounded = ctx.grounded !== false;

    // ===== combat-ready layer =====
    // Every mech carries a signature COMBAT STANCE (def.combatPose: additive
    // deltas over the rest pose) and wears it by DEFAULT — guard up, ready
    // to battle. Only after ~5s of standing genuinely still does the frame
    // relax to the plain rest stance; any motion, shot or action snaps the
    // guard back up. At speed the stance yields to the run cycle (arms are
    // the gait's), and it softens in the air.
    //
    // GLB mechs are the exception: the service models are AUTHORED in their own
    // battle-ready stance (that IS the bind pose the retarget offsets capture),
    // so their native carriage already reads as "guard up". Retargeting the
    // procedural def.combatPose on top of that fights the bind and can wrench
    // fused geometry off-axis — e.g. it rolls Viper's forearm energy blades
    // flat instead of keeping them as clean extensions of the arm. So a GLB
    // uses its native bind as the ready stance by default; a profile may still
    // opt into an explicit combatPose (authored for that model) when wanted.
    const cp = this.profile?.combatPose ?? (this.mech.isGLB ? null : this.mech.def.combatPose);
    if (cp) {
      const still = speed < 0.4 && !this.action && grounded &&
        !ctx.firing && !ctx.hovering && !ctx.charging;
      this._stillT = still ? (this._stillT || 0) + dt : 0;
      const want = ctx.alwaysReady || this._stillT < 5 ? 1 : 0;
      this.readyK = this.readyK === undefined ? want : damp(this.readyK, want, 2.2, dt);
      const k = this.readyK * (grounded ? 1 : 0.45) * (1 - 0.8 * ratio);
      if (k > 0.01) {
        for (const [j, v] of Object.entries(cp)) {
          const base = tgt[j];
          if (!base) continue;
          const m = j === 'hipsPos' ? this.s : D2R;
          base[0] += v[0] * m * k;
          base[1] += v[1] * m * k;
          base[2] += v[2] * m * k;
        }
      }
    }

    if (grounded && speed > 0.4) {
      // THE GAIT. Every number of the walk/run cycle lives in the gait table
      // (src/mechs/gaits.js) — this mech's `def.gait` names one, several mechs
      // share one, and `/workbench/?edit=gait` tunes them against the live
      // model. The cycle itself is applyGait(); all that happens here is
      // advancing the phase at the cadence the gait asks for and handing over
      // the per-body calibration the table can't know (foot depth, scale).
      // …and, for a gait that is TWO tables (fenrir jogs like a runner and
      // gallops like a wolf — see effectiveGait), the crossfade between them at
      // this speed. Everything below runs on THIS, phase rate included, or half
      // the body would get the jog's numbers and half the run's. The scratch
      // object means the per-frame path still allocates nothing.
      const gait = effectiveGait(this.gait, ratio, this._effGait || (this._effGait = {}),
        this.gallopState(ratio, dt));
      this._gait = gait;
      const legLen = this.D.thighLen + this.D.shinLen;
      // BACKWARDS IS THE CYCLE BACKWARDS. A walk run in reverse pushes off with
      // the foot that is in front and reaches with the one behind, which is
      // exactly what walking backwards is; playing it forwards is what made a
      // back-pedal read as a moonwalk. `rev` eases 0..1 (see legFrame) so the
      // change of direction blends rather than snapping to the other foot.
      const lf = this.legFrame(ctx, speed, dt);
      this.phase += gaitPhaseRate(gait, { speed, ratio, legLen, sizeMul: this.sizeMul })
        * (1 - 2 * lf.rev) * dt;
      // ONE env for the whole locomotion pipeline: the passes hand each other
      // conclusions through it (which foot is in the air — see applyGait), so
      // they must not each get a fresh literal.
      this._gaitEnv = {
        ph: this.phase, ratio, s: this.s,
        ankleGain: this.ankleGain, footFlat: this.footFlat, rest: this.rest,
        hipHeight: this.D.hipHeight,
        // the leg's own lengths: the foot rules work out how high a foot hangs
        // from the pose alone (see airWeight)
        thighLen: this.D.thighLen, shinLen: this.D.shinLen,
        // …and the MEASURED per-foot sole clearance where there is one, which
        // beats any pose proxy: it is the real distance from boot to pavement.
        // One frame stale (it is last frame's draw) and in local units, since a
        // grown body's group scale multiplies everything the gait writes.
        footClr: this._soleClrSide && this.sizeMul
          ? { L: this._soleClrSide.L / this.sizeMul, R: this._soleClrSide.R / this.sizeMul }
          : null,
      };
      applyGait(tgt, gait, this._gaitEnv);
    } else if (grounded) {
      // idle: breathing + weight shift + personality sway
      const b = Math.sin(this.t * 1.7);
      tgt.torso[0] += b * 0.018;
      tgt.hipsPos[1] += Math.sin(this.t * 1.7 + 0.6) * 0.03 * this.s;
      tgt.shoulderL[2] += -b * 0.02;
      tgt.shoulderR[2] += b * 0.02;
      tgt.hipsRot[2] += Math.sin(this.t * 0.43) * 0.02;
      tgt.head[1] += Math.sin(this.t * 0.31) * 0.07;
      tgt.head[0] += Math.sin(this.t * 0.53) * 0.03;
    }

    if (!grounded) {
      // airborne: rising tuck vs falling spread by vy
      const rise = clamp((ctx.vy || 0) / 12, -1, 1);
      const tuck = Math.max(0, rise), fall = Math.max(0, -rise);
      tgt.thighL[0] += -0.5 * tuck - 0.25 * fall;
      tgt.thighR[0] += -0.2 * tuck + 0.15 * fall;
      tgt.kneeL[0] += 0.9 * tuck + 0.5 * fall;
      tgt.kneeR[0] += 0.5 * tuck + 0.3 * fall;
      tgt.shoulderL[2] += -0.35 - 0.3 * fall;
      tgt.shoulderR[2] += 0.35 + 0.3 * fall;
      tgt.shoulderL[0] += -0.3 * fall;
      tgt.shoulderR[0] += -0.3 * fall;
      tgt.torso[0] += 0.12 * tuck - 0.1 * fall;

      // AN APE IN THE AIR REACHES (roster `airReach`, KONGA). A jump is not a
      // pose for him, it is the first half of a grab: both arms go up and
      // OPEN, ready to catch a ledge, a pipe or a roof edge on the way past.
      // It REPLACES the default flail rather than adding to it — the two
      // describe opposite arms — and eases in over the first fraction of a
      // second so a hop does not snap them overhead.
      if (this.mech.def?.airReach && !ctx.hovering) {
        this._airK = Math.min(1, (this._airK || 0) + dt / 0.22);
        const k = this._airK;
        const spread = 0.34 + 0.1 * fall;
        for (const [sh, el, sgn] of [['shoulderL', 'elbowL', -1], ['shoulderR', 'elbowR', 1]]) {
          tgt[sh][0] += (-2.55 - tgt[sh][0]) * k;
          tgt[sh][2] += (sgn * spread - tgt[sh][2]) * k;
          tgt[el][0] += (-0.35 - tgt[el][0]) * k;
        }
        tgt.torso[0] += 0.10 * k;
        tgt.head[0] += -0.18 * k;   // watching the thing he means to grab
      } else if (this._airK) {
        this._airK = Math.max(0, this._airK - dt / 0.18);
      }

      if (ctx.hovering) {
        // jet flight: pitch the whole frame forward with speed — Iron Man,
        // not elevator. Legs trail, head stays level.
        const h = ratio;
        tgt.hipsRot[0] += 0.16 + 0.30 * h;
        tgt.torso[0] += 0.08 + 0.14 * h;
        tgt.head[0] += -0.22 - 0.2 * h;
        tgt.thighL[0] += 0.28 * h;
        tgt.thighR[0] += 0.38 * h;
        tgt.kneeL[0] += 0.25 * h;
        tgt.kneeR[0] += 0.2 * h;
        tgt.shoulderL[2] += -0.12;
        tgt.shoulderR[2] += 0.12;
      }
    }

    // ===== quadruped gallop (a gait with a `quad` block — FENRIR the wolf) =====
    // Rides OVER the biped stride above (which is what it lerps out of at
    // walking pace); the numbers are the gait's `quad` section — see gaits.js.
    if (grounded && speed > 0.4 && this.gait.quad) {
      // …the SAME commitment the crossfade used, so the two layers cannot
      // disagree about how much wolf is on screen
      this._gaitEnv.quadQ = this._quadQ;
      applyQuadGait(tgt, this._gait, this._gaitEnv);
    }
    // ===== the extra legs (a gait with a `hex` block — CRANKY the crab) =====
    // A hexapod's other four (see hexLegsOf). Unlike the tail these are LEGS, so
    // they get the same deal the two the game knows about get: they hold their
    // rest shape unless he is actually walking, and the pose smoother eases them
    // back into it when he stops. Seeded whether he is moving or not, or a stop
    // would simply keep the last frame of a stride and freeze mid-step.
    //
    // BEFORE THE FOOT RULE, because this pass also rewrites the BACK pair's
    // thigh — `hex.yaw` trades a share of its pendulum for a swing round the hip
    // — and a foot rule that had already read the old pose would be levelling an
    // ankle against a leg that is no longer there.
    const hex = this.gait?.hex ? this.hexLegs() : null;
    if (hex) {
      for (const l of hex.legs) {
        if (!l.driven) continue;
        tgt[l.hip] = [...l.restHip];
        if (l.knee) tgt[l.knee] = [...l.restKnee];
      }
      // …and the stride itself only while there is one. `_gaitEnv` is built in
      // the walk block above and carries THIS frame's phase, so the extra legs
      // run on the same clock as the two the stride drives — which is what makes
      // the cadence match the ground speed, and what makes the gait workbench's
      // pause freeze them (it freezes the phase, and there is no other clock).
      if (grounded && speed > 0.4 && this._gaitEnv) {
        this._gaitEnv.hex = hex;
        applyHexGait(tgt, this._gait, this._gaitEnv);
      }
    }
    // hand-keyed corrections over the cycle, BEFORE the foot rule — a gait's
    // rules about feet outrank a hand edit (see applyGaitKeys)
    if (grounded && speed > 0.4 && this.gait.keys?.length) {
      applyGaitKeys(tgt, this._gait, this._gaitEnv);
    }
    // THE FOOT RULE, last: stance / push-off / air, whichever layer put the leg
    // where it is (see applyToeHang).
    if (grounded && speed > 0.4) applyToeHang(tgt, this._gait, this._gaitEnv);

    // ===== hips vs chest: the strafe (see legFrame) =====
    // The hips are the root of the virtual rig, so yawing them carries the whole
    // body — legs, spine, arms and all. Taking the same angle back out of the
    // torso leaves ONLY the lower half turned, which is the trick: he walks
    // where he is going and keeps aiming where he was.
    if (this._legFrame && Math.abs(this._legFrame.turn) > 1e-4) {
      tgt.hipsRot[1] += this._legFrame.turn;
      if (tgt.torso) tgt.torso[1] -= this._legFrame.turn;
    }

    // ===== the tail =====
    // NOT gated on moving, unlike everything above it: the gait's stride only
    // exists while he walks, but a tail is alive standing still — that is what
    // `tail.idle` is for. Seeded here rather than in makeRestTarget because a
    // tail chain is a property of the RIG, not of the game's joint list, and
    // most bodies do not have one.
    // NOTE `this._gait` is only refreshed inside the walk block above; at a
    // standstill it is still the last one resolved (or `this.gait` from the
    // constructor), which is what we want — the tail's carriage does not stop
    // existing because the mech did.
    const tail = this._gait?.tail ? this.tailChain() : null;
    if (tail) {
      // its own env: the gait block above only builds one while WALKING, and
      // this pass deliberately runs whether he is moving or not
      const e = this._tailEnv || (this._tailEnv = {});
      for (let i = 0; i < tail.n; i++) tgt['tail' + i] = [0, 0, 0];
      e.tail = tail;
      e.ratio = ctx.maxSpeed > 0 ? clamp01(speed / ctx.maxSpeed) : 0;
      // the wave's own clock: the STRIDE drives it, plus a slow drift so a
      // standing wolf is not a statue
      e.tailPh = this.phase + this.t * (this._gait.tail.idle || 0);
      applyTailGait(tgt, this._gait, e);
    }

    // ===== dash: coil, gather, LUNGE =====
    // A dash used to be a 2-line torso lean over a big velocity change, so it
    // read as the mech SLIDING rather than pushing off. Now it's a real
    // three-beat move, all additive over whatever locomotion is underneath so
    // it mixes into a run instead of replacing it (and placed AFTER the gait
    // blocks above, which assign rather than accumulate, so it survives them).
    //
    //   1. COIL   — standing on a held dash button: sink onto the back leg,
    //      weight loaded, arms drawn back. Deepens as the charge winds.
    //   2. GATHER — the compression at the head of the burst itself, so an
    //      uncharged dash (and one thrown mid-run, where there IS no coil)
    //      still crouches before it goes.
    //   3. DRIVE  — the push-off: hips low and pitched into the run, legs
    //      SPLIT (lead knee up and tucked, trailing leg extended off the toe),
    //      arms counter-swinging. Eases out over the back half of the burst.
    // Leg folds use the duck layer's derivation below (thigh pitched A, shin
    // countertilted B−A) so the feet don't punch through the floor.
    const coil = ctx.dashCoil || 0;
    if (coil > 0.01) {
      const c = 0.45 + 0.55 * clamp01(coil);   // a held button already sinks
      const A = 0.55 * c, B = 1.05 * c;
      tgt.hipsPos[1] -= this.D.thighLen * (1 - Math.cos(A)) + this.D.shinLen * (1 - Math.cos(B - A));
      tgt.hipsPos[2] -= 0.30 * c * this.s;     // weight back over the heels
      tgt.hipsRot[0] += 0.16 * c;
      tgt.thighL[0] += -A; tgt.thighR[0] += -A;
      tgt.kneeL[0] += B; tgt.kneeR[0] += B;
      tgt.ankleL[0] += -(B - A); tgt.ankleR[0] += -(B - A);
      tgt.torso[0] += 0.34 * c;
      tgt.head[0] += -0.30 * c;                // eyes stay up on the target
      tgt.shoulderL[0] += 0.42 * c; tgt.shoulderR[0] += 0.42 * c;  // arms cocked back
      tgt.elbowL[0] += -0.55 * c; tgt.elbowR[0] += -0.55 * c;
    }
    if (ctx.dashT > 0) {
      const p = clamp01(ctx.dashP ?? 0);
      // gather peaks a fifth of the way in and is gone by a third; drive
      // takes over and humps across the rest — sin(x·π) rises and eases 0→1→0
      const gather = p < 0.30 ? Math.sin((p / 0.30) * Math.PI) : 0;
      const drive = p < 0.16 ? 0 : Math.sin(clamp01((p - 0.16) / 0.84) * Math.PI);
      if (gather > 0.01) {
        const A = 0.5 * gather, B = 0.95 * gather;
        tgt.hipsPos[1] -= this.D.thighLen * (1 - Math.cos(A)) + this.D.shinLen * (1 - Math.cos(B - A));
        tgt.thighL[0] += -A; tgt.thighR[0] += -A;
        tgt.kneeL[0] += B; tgt.kneeR[0] += B;
        tgt.ankleL[0] += -(B - A); tgt.ankleR[0] += -(B - A);
        tgt.torso[0] += 0.30 * gather;
        tgt.head[0] += -0.26 * gather;
      }
      if (drive > 0.01) {
        tgt.hipsPos[1] -= this.D.hipHeight * 0.16 * drive;   // stays low through it
        tgt.hipsPos[2] += 0.22 * drive * this.s;             // hips shove forward
        tgt.hipsRot[0] += 0.24 * drive;
        tgt.torso[0] += 0.34 * drive;
        tgt.head[0] += -0.36 * drive;                        // head level, eyes up
        // split stance: lead leg folds up under the chest, trailing leg
        // extends behind off the toe
        tgt.thighL[0] += -0.92 * drive; tgt.kneeL[0] += 0.80 * drive;
        tgt.ankleL[0] += -0.30 * drive;
        tgt.thighR[0] += 0.62 * drive; tgt.kneeR[0] += -0.10 * drive;
        tgt.ankleR[0] += 0.42 * drive;                       // toe-off
        // arms counter-swing the legs
        tgt.shoulderR[0] += -0.60 * drive; tgt.elbowR[0] += -0.45 * drive;
        tgt.shoulderL[0] += 0.50 * drive; tgt.elbowL[0] += -0.30 * drive;
      }
    }

    // ===== duck layer =====
    // ctx.duck is 0..duckDepth — 1 folds the mech into a full squat.
    // The hip drop is DERIVED from the leg fold: with the thigh pitched A
    // from vertical and the shin countertilted (B-A), the leg's vertical
    // reach shrinks by thigh*(1-cosA) + shin*(1-cos(B-A)) — drop the hips by
    // exactly that and the feet stay planted instead of punching through the
    // floor (the old fixed 0.62*hipHeight drop overshot the fold by ~2x).
    // The head still gets low: deeper knee fold + butt back + a stronger
    // forward torso lean make up the depth the reduced drop gave back.
    if (ctx.duck > 0.01) {
      const d = ctx.duck;
      const A = 1.05 * d;                    // thigh forward of vertical
      const B = 2.0 * d;                     // knee fold
      const drop = this.D.thighLen * (1 - Math.cos(A))
                 + this.D.shinLen * (1 - Math.cos(B - A));
      tgt.hipsPos[1] -= drop;
      tgt.hipsPos[2] -= 0.5 * d * this.s;    // butt out a little...
      tgt.thighL[0] += -A;
      tgt.thighR[0] += -A;
      tgt.kneeL[0] += B;
      tgt.kneeR[0] += B;
      tgt.ankleL[0] += -(B - A);             // foot flat on the ground
      tgt.ankleR[0] += -(B - A);
      tgt.torso[0] += 0.68 * d;              // ...upper body angled forward
      tgt.head[0] += -0.5 * d;               // eyes stay up
      // arms tuck in, guard up
      tgt.shoulderL[0] += -0.35 * d;
      tgt.shoulderR[0] += -0.35 * d;
      tgt.shoulderL[2] += 0.15 * d;
      tgt.shoulderR[2] += -0.15 * d;
      tgt.elbowL[0] += -0.55 * d;
      tgt.elbowR[0] += -0.55 * d;
    }

    // ===== action clip layer =====
    const act = this.action;
    if (act) {
      const clip = act.clip;
      const prevT = act.t;
      act.t += dt * act.speed;

      // event firing (with loop wrap)
      let evT = act.t;
      if (clip.loop && evT > clip.dur) evT = evT % clip.dur;
      for (const ev of clip.events) {
        const crossed = clip.loop
          ? this.loopCrossed(prevT % clip.dur, act.t % clip.dur, ev.t)
          : prevT < ev.t && act.t >= ev.t;
        if (crossed && act.onEvent) act.onEvent(ev.type, ev.arg);
      }

      // weight envelope
      if (act.fadingOut) {
        act.weight -= dt / (act.fadeOut || 0.12);
        if (act.weight <= 0) this.action = null;
      } else {
        act.weight = Math.min(1, act.weight + dt / act.fadeIn);
        if (!clip.loop && act.t >= clip.dur) {
          if (clip.hold) act.t = clip.dur;
          else { act.fadingOut = true; act.fadeOut = 0.12; }
        }
      }

      if (this.action) {
        const sampleT = clip.loop ? act.t % clip.dur : Math.min(act.t, clip.dur);
        const w = ease.inOutQuad(clamp01(act.weight));
        const joints = clip.upper ? UPPER_JOINTS : null;
        const mirror = this.profile?.mirrorArms;
        for (const [jname0, track] of Object.entries(clip.tracks)) {
          if (joints && !joints.includes(jname0) && jname0 !== 'hipsPos' && jname0 !== 'hipsRot') continue;
          let v = sampleTrack(track, sampleT);
          let jname = jname0;
          // mirror-handed GLB: a right-arm clip drives the left arm (and vice
          // versa), pitch preserved / yaw+roll flipped — so a weapon in the
          // opposite hand swings from the arm that actually holds it
          if (mirror && ARM_JOINTS.includes(jname0)) { jname = mirrorJointName(jname0); v = mirrorValue(v); }
          const base = tgt[jname];
          if (!base) continue;
          if (jname === 'hipsPos') {
            base[0] = lerp(base[0], v[0] * this.s, w);
            base[1] = lerp(base[1], v[1] * this.s, w);
            base[2] = lerp(base[2], v[2] * this.s, w);
          } else if (jname === 'hipsRot') {
            base[0] = lerp(base[0], v[0], w);
            base[1] = lerp(base[1], v[1], w);
            base[2] = lerp(base[2], v[2], w);
          } else {
            // legs keep their rest-pose bend (digitigrade mechs) during clips
            base[0] = lerp(base[0], v[0] + this.restBias(jname, 0), w);
            base[1] = lerp(base[1], v[1] + this.restBias(jname, 1), w);
            base[2] = lerp(base[2], v[2] + this.restBias(jname, 2), w);
          }
        }
      }
    }

    // ===== additive impulses =====
    for (let i = this.impulses.length - 1; i >= 0; i--) {
      const im = this.impulses[i];
      im.t += dt;
      const k = Math.sin(im.freq * im.t) * Math.exp(-im.decay * im.t);
      if (im.t > 1.2) { this.impulses.splice(i, 1); continue; }
      const base = tgt[im.joint];
      if (base) {
        base[0] += im.amp[0] * k;
        base[1] += im.amp[1] * k;
        base[2] += im.amp[2] * k;
      }
    }

    // ===== signature joints (personality) =====
    this.signature(dt, ctx, tgt);

    // ===== pelvis follows the feet (walk only) =====
    // Rotating joints alone can't keep a foot on the ground: the sole's height is
    // whatever the leg chain happens to leave it at, so a walk either drives the
    // boot through the floor or hangs it in the air — the mech "pushes off" a
    // surface that isn't there. Ride the pelvis on the measured sole instead:
    // whatever the lower foot's clearance was last frame, take it out of the hip
    // height, and the contact foot stays on the pavement while the body bobs
    // over it (which is what carries the weight of a step).
    //
    // Walk/run only, and only for a calibrated (GLB) mech: action clips, jumps
    // and knockdowns move the body on purpose and get the bias eased back out.
    // The correction is 1:1 — hips down by x lowers the sole by x — so a single
    // damped step converges without a gain to tune.
    //
    // IT MUST BE SLOW (see SOLE_FOLLOW_RATE). What this loop is FOR is the
    // standing offset: a rigged boot whose sole sits somewhere the gait never
    // assumed leaves the whole body parked too high, and the walk reads as
    // pushing off air. That error is a CONSTANT. The per-step wobble around it
    // is not an error at all — it is the leg chain's own geometry, a rotate-only
    // leg is shorter when the thigh is swung out than when it is under the hip —
    // and chasing it frame by frame lifts and drops the entire mech once per
    // step. Correct the average, leave the ripple to the legs.
    if (this.soles) {
      const wantFollow = grounded && speed > 0.4 && !this.action && !ctx.duck && !ctx.dashT;
      if (wantFollow) {
        // soleClearance() measures in WORLD units; _footBias is spent in LOCAL
        // ones (applyPose writes hips.position, which the group scale then
        // multiplies). At sizeMul 1 those are the same thing and the 1:1
        // correction below is exact — but a 4× body was feeding a world
        // measurement into a local correction, i.e. correcting FOUR times what
        // it measured. A feedback loop with gain 4 doesn't converge, it rings:
        // that was the giant's feet buzzing up and down. Convert first, and the
        // rate follows the same √ law as the legs so the pelvis doesn't snap
        // over four times the distance in the same instant.
        const clr = this._soleClr === null || this._soleClr === undefined
          ? null : this._soleClr / this.sizeMul;
        if (clr !== null) {
          this._footBias = damp(this._footBias || 0, (this._footBias || 0) - clr,
            SOLE_FOLLOW_RATE / Math.sqrt(this.sizeMul), dt);
          // never lift the body more than a foot's depth: a bad measurement
          // must not launch the mech off the floor
          this._footBias = clamp(this._footBias, -this.footDepth, this.footDepth);
        }
      } else {
        this._footBias = damp(this._footBias || 0, 0, 8, dt);
      }
      tgt.hipsPos[1] += this._footBias || 0;
    }

    // ===== smooth & apply =====
    const rate = 1 - Math.exp(-26 * dt);
    // GROWN BODY, HEAVY LEGS. Everything above (clips especially) is authored
    // for a normal-sized mech: a kick or a stomp swings the leg through the
    // same angle in the same fraction of a second, so at 4× the leg length the
    // FOOT covers four times the distance in that time and reads as
    // teleporting. Slowing the whole clip would slow the attack itself, so
    // instead the LEG joints alone get a lazier approach to whatever the clip
    // asks for: a first-order lag scales peak angular speed by its rate, so
    // dividing by √sizeMul lands the foot at √S times a normal foot's speed —
    // still fast for a giant, no longer a jump cut. (√L, not L: a giant that
    // moved its feet at exactly normal speed would look like it was wading.)
    const legRate = this.sizeMul > 1.001
      ? 1 - Math.exp(-(26 / Math.sqrt(this.sizeMul)) * dt)
      : rate;
    // ...and a hard ceiling on top of the lag. The lag alone only helps where
    // the clip STEPS; a clip that sweeps a leg fast and smoothly sails through
    // a first-order filter unchanged, and at 4× that sweep is still four times
    // the ground per second. This is the cap that actually holds.
    const legCap = this.sizeMul > 1.001 ? (LEG_W_REF / Math.sqrt(this.sizeMul)) * dt : Infinity;
    for (const key of Object.keys(tgt)) {
      const c = this.cur[key] || (this.cur[key] = [...tgt[key]]);
      const leg = LEG_SMOOTH.has(key);
      const r = leg ? legRate : rate;
      for (let i = 0; i < 3; i++) {
        const prev = c[i];
        const v = lerp(prev, tgt[key][i], r);
        c[i] = leg && legCap !== Infinity ? clamp(v, prev - legCap, prev + legCap) : v;
      }
    }
    this.applyPose(this.cur);
    this.mech.postAnimate?.(); // GLB rigs: retarget virtual joints onto bones
    // …and the tail on top. It rides RIG bones, which adapter.sync never writes
    // (they are not game joints), so this has to land after the retarget — and
    // it survives to the draw untouched. Smoothed for free: the keys went into
    // `tgt`, so the same filter the rest of the pose gets applies to them.
    this.applyTailPose();
    this.applyHexPose();
    // where the sole ended up this frame — the input to the pelvis follow above
    if (this.soles) {
      this._soleClrSide = this.soleClearanceBySide();
      this._soleClr = this.soleClearance();
    }
  }

  // rest-pose bias: digitigrade legs (and a predator's spine hunch) keep
  // their signature bend during action clips instead of snapping upright
  restBias(jname, i) {
    if (jname.startsWith('thigh') || jname.startsWith('knee') || jname.startsWith('ankle') ||
        jname === 'torso' || jname === 'head') {
      return this.rest[jname][i];
    }
    return 0;
  }

  loopCrossed(prev, cur, evT) {
    if (prev <= cur) return prev < evT && cur >= evT;
    return evT > prev || evT <= cur; // wrapped
  }

  // The tail's smoothed angles onto the rig's own bones. Separate from
  // applyPose because those are the 15 VIRTUAL joints and these are not joints
  // at all — they belong to one model's skeleton and nothing retargets them.
  applyTailPose() {
    const bones = this.mech.rigBones;
    if (!bones) return;
    // NOT gated together, and that is the point: the KEYED angles exist only
    // where a gait authored a tail, while the LIMP solve belongs to any body
    // with something hanging off it — wraith's cloak has no gait layer at all
    // and still has to fall down when he does.
    const tail = this.tailChain();
    if (tail) {
      for (let i = 0; i < tail.n; i++) {
        const v = this.cur['tail' + i];
        const b = bones['tail' + i];
        if (v && b) b.rotation.set(v[0], v[1], v[2]);
      }
    }
    if (this._limp > 0.001) this.limpTail(bones, this._limp);
    else {
      this._limpDir = null; this._tailFloor = 0;
      if (this.mech.tailFloor && tail) this.tailFloorGuard(bones);
    }
  }

  // ---------------------------------------------------------------------------
  // A TAIL IS NOT A KICKSTAND, AWAKE EITHER (rig/manifest `tailFloor`).
  //
  // limpTail solves this for a body that is DOWN. The same thing happens to a
  // body that is UP: tritone's taunt rears him onto his hind legs, the hips
  // pitch back, and the tail — which hangs off the hips and is nine units long —
  // sweeps down through the pavement. Nothing complains, because the geometry
  // is allowed underground; what the player sees is the FLOOR GUARD
  // (combat/floorguard.js) doing its job and servoing the whole animal upward,
  // so the rear reads as him being levitated by his own tail.
  //
  // The rule is the one a person would state: NO SEGMENT MAY POINT BELOW THE
  // FEET. Run root-to-tip, and where a segment's far end would land under the
  // floor, re-aim that bone so the end sits exactly ON it, keeping the heading
  // it already had — the same clamp limpTail uses, minus the gravity it damps
  // toward, because this tail is not dead and everything above the floor is
  // whatever the gait and the clip asked for. It is therefore free at rest: a
  // tail already carried above the feet is not touched at all.
  //
  // THE FLOOR IS THE FEET, not y=0. Measured off the lower ankle, so it comes
  // out right on a slope, on top of a building, and in mid-air (where y=0 would
  // clamp a jumping mech's tail to the ground it left).
  tailFloorGuard(bones) {
    let seg = this._tfSeg;
    if (!seg) {
      seg = this._tfSeg = [];
      const root = bones.tail0;
      if (root) root.traverse((b) => {
        const c = b.children.find((x) => x.isBone);
        if (c) seg.push([b, c]);
      });
    }
    if (!seg.length) return;
    const B = this.mech.boneMap || {};
    const a1 = B.ankleL || this.J.ankleL, a2 = B.ankleR || this.J.ankleR;
    if (!a1 || !a2) return;
    a1.getWorldPosition(_lp); const yA = _lp.y;
    a2.getWorldPosition(_lp); const floorY = Math.min(yA, _lp.y);
    seg[0][0].parent?.updateWorldMatrix(true, false);
    for (const [b, c] of seg) {
      b.updateWorldMatrix(false, false);
      c.updateWorldMatrix(false, false);
      b.getWorldPosition(_lp);
      c.getWorldPosition(_lc);
      const len = _lp.distanceTo(_lc) || 1e-5;
      _ld.subVectors(_lc, _lp).divideScalar(len);
      const minDy = (floorY - _lp.y) / len;          // the lowest it may point
      if (_ld.y >= minDy || minDy > 1) continue;     // already clear (or the
      // root itself is under the floor, which is a body problem, not a tail one)
      const dy = clamp(minDy, -1, 1);
      const hl = Math.hypot(_ld.x, _ld.z) || 1e-5;
      const hs = Math.sqrt(Math.max(0, 1 - dy * dy));
      _lg.set(_ld.x / hl * hs, dy, _ld.z / hl * hs);
      b.parent.getWorldQuaternion(_lq).invert();
      _lg.applyQuaternion(_lq);
      _lr.copy(c.position).normalize();
      b.quaternion.setFromUnitVectors(_lr, _lg);
      b.updateWorldMatrix(false, false);
    }
  }

  // ---------------------------------------------------------------------------
  // A DOWNED TAIL IS DEAD WEIGHT.
  //
  // The gait's tail is a live thing — it wags, it lags, it carries itself. A
  // knocked-out mech's tail does none of that, and while it keeps carrying
  // itself it is also a KICKSTAND: fenrir's blade curls under him, the prone
  // floor clamp finds the tip as his lowest point, and the whole wolf is stood
  // up in the air on the end of his own tail. (Measured: 48.6% of his body
  // height off the ground, resting on `tail4`.)
  //
  // So when he goes down the chain goes LIMP, and this is a real if quasi-static
  // solve rather than a second authored pose — a pose would have to be authored
  // per body, and would still be wrong for a tail that went down mid-swing.
  // Each segment keeps a WORLD direction that damps toward two things:
  //   GRAVITY  straight down, which is what limp means;
  //   THE FLOOR which it cannot pass through — so once a segment's start is
  //             lower than its own length the end lands ON the ground and the
  //             remaining length goes sideways, keeping the heading it had.
  // Run root-to-tip with the matrices refreshed between segments, that lays the
  // whole chain out flat along whatever direction it was pointing: it FLOPS.
  // The state is the directions themselves, so it settles over ~0.3s instead of
  // snapping, and it is dropped the moment he gets up.
  limpTail(bones, w) {
    // EVERY bone-to-bone link in the SUBTREE under each limp root, parents
    // first. A subtree rather than the `tailN` run, for two reasons: a rig may
    // finish its chain with a differently-named leaf (tritone's `tailTip`), and
    // a hanging thing is not always one strand (wraith's cloak is four columns
    // off `cape0`). Left out, that geometry keeps its animated angle on a body
    // the clamp has stopped measuring — which is straight through the floor.
    let seg = this._limpSeg;
    if (!seg) {
      seg = this._limpSeg = { pairs: [] };
      for (const rootName of limpRootsOf(this.mech)) {
        const r = bones[rootName];
        if (!r?.parent) continue;
        // one entry per bone (a rotation can only aim at ONE child, so a fork
        // follows its first branch and the other branches are solved on their
        // own bones a level down)
        r.traverse((b) => {
          const c = b.children.find((x) => x.isBone);
          if (c) seg.pairs.push([b, c]);
        });
      }
      this._limpDir = null;
    }
    let dirs = this._limpDir;
    if (!dirs) {
      dirs = this._limpDir = seg.pairs.map(() => new THREE.Vector3());
      this._limpSeed = true;
    }
    if (!seg.pairs.length) return;
    seg.pairs[0][0].parent.updateWorldMatrix(true, false);
    const dt = this._limpDt || 1 / 60;
    const k = 1 - Math.exp(-LIMP_RATE * dt);
    // THE FLOOR THE BONE LINE RESTS ON is not y=0 — it is half a tail's
    // thickness above it, and that is a per-rig number nobody wants to author.
    // The prone clamp measures how far the tail's GEOMETRY actually ended up
    // under the ground (mech.tailUnder) and this integrates it away, so the
    // solver converges on whatever the real thickness is in the pose it is in.
    const floorY = this._tailFloor = clamp(
      (this._tailFloor || 0) + (this.mech.tailUnder || 0) * k * 2, 0, 12 * this.s);
    for (let i = 0; i < seg.pairs.length; i++) {
      const [b, c] = seg.pairs[i];
      b.updateWorldMatrix(false, false);
      c.updateWorldMatrix(false, false);
      b.getWorldPosition(_lp);
      c.getWorldPosition(_lc);
      const len = _lp.distanceTo(_lc) || 1e-5;
      _ld.subVectors(_lc, _lp).divideScalar(len);          // where it points now
      if (this._limpSeed) dirs[i].copy(_ld);
      // …and where a dead one wants to point: down, until the floor stops it.
      _lg.set(0, -1, 0);
      const drop = (floorY - _lp.y) / len;                  // floor, in segments
      if (drop > -1) {
        // the end would be through the floor: lay the rest of the segment out
        // flat, keeping whatever heading it already has
        const hl = Math.hypot(dirs[i].x, dirs[i].z) || 1e-5;
        const dy = clamp(drop, -1, 1);
        const hs = Math.sqrt(Math.max(0, 1 - dy * dy));
        _lg.set(dirs[i].x / hl * hs, dy, dirs[i].z / hl * hs);
      }
      dirs[i].lerp(_lg, k).normalize();
      // blend animated -> limp, so going down is a flop and getting up is not
      _ld.lerp(dirs[i], w).normalize();
      // aim the bone: a bone with no rotation points its child along the bind
      // offset, so the rotation wanted is the one taking that to `_ld`
      b.parent.getWorldQuaternion(_lq).invert();
      _lg.copy(_ld).applyQuaternion(_lq);
      _lr.copy(c.position).normalize();
      b.quaternion.setFromUnitVectors(_lr, _lg);
      b.updateWorldMatrix(false, false);
    }
    this._limpSeed = false;
  }

  // The extra legs' smoothed angles onto the rig's own bones. Same placement as
  // the tail — after the retarget, because these bones are not game joints and
  // adapter.sync never writes them.
  applyHexPose() {
    const hex = this._hex;
    if (!hex) return;
    const bones = this.mech.rigBones;
    if (!bones) return;
    for (const l of hex.legs) {
      if (!l.driven) continue;
      for (const key of [l.hip, l.knee]) {
        const v = key && this.cur[key];
        const b = key && bones[key];
        if (v && b) b.rotation.set(v[0], v[1], v[2]);
      }
    }
  }

  applyPose(pose) {
    for (const j of ALL_JOINTS) {
      const v = pose[j];
      if (v && this.J[j]) this.J[j].rotation.set(v[0], v[1], v[2]);
    }
    const hips = this.J.hips;
    hips.position.set(
      pose.hipsPos[0],
      this.D.hipHeight + (this.groundOffset || 0) + pose.hipsPos[1],
      pose.hipsPos[2]
    );
    hips.rotation.set(pose.hipsRot[0], pose.hipsRot[1], pose.hipsRot[2]);
  }

  /**
   * An engine-driven EXTRA part by name, whichever route this body came from.
   *
   * A procedural body carries its extras as virtual JOINTS (`mech.joints.jaw`);
   * a GLB carries the same names as custom-rig BONES (`mech.rigBones.jaw`, from
   * rigs/<id>.rig.js). Same name, same intent, two different homes — so a
   * signature or the face layer that reaches through here is written ONCE and
   * drives both routes, instead of being duplicated into a glbanim post hook.
   *
   * Returns null when neither exists (a GLB with no custom rig), which is what
   * lets every caller stay a plain `if (part) part.rotation.x = ...`.
   *
   * Safe to write to on the GLB route: the retarget (RigAdapter.sync) only ever
   * writes bones it MAPPED to a game joint, and these are not those.
   */
  part(name) {
    return this.J[name] || this.mech.rigBones?.[name] || null;
  }

  signature(dt, ctx, tgt) {
    SIGNATURES[this.mech.def.id]?.(this, dt, ctx, tgt);
    // hand-hardware wrist counter-pitch, opted into via roster def flag
    // (procedural bodies only — see levelHands in signatures.js)
    if (this.mech.def.levelHands && !this.mech.isGLB) levelHands(tgt);
    // GLB per-model reinterpretation, run after the (procedural-shaped)
    // signature so it can adjust the final tgt for this exact model.
    this.profile?.post?.(this, dt, ctx, tgt);
    // SHELL LOCK (roster `rigidShell`, GLB only): on these models the skull is
    // part of the torso block — no neck, no separate head shell — so ANY head
    // rotation shears it against the body. Pin the head to its rest carriage
    // and let the torso carry it. This runs LAST, after clip tracks, additive
    // impulses, the signature and the profile hook, so nothing upstream can
    // sneak head motion back in; combat's turn-lead drops its head twist on
    // the same flag (fighter.js). Procedural bodies of the same mech DO have a
    // neck joint, so they keep every bit of head animation.
    if (this.mech.def.rigidShell && this.mech.isGLB && tgt.head) {
      const r = this.rest.head;
      tgt.head[0] = r[0]; tgt.head[1] = r[1]; tgt.head[2] = r[2];
    }
  }
}
