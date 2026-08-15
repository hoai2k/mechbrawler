// Per-mech SIGNATURE motion — the personality layer the animator runs
// every frame on top of clips/locomotion: vulcan's gatling spin, nova's
// halo, fenrir/saurion tails, jerry's nervous twitches, nullbot's failing
// display... One entry per mech id, dispatched by Animator.signature()
// (same registry idiom as SPECIALS/ULTS in combat/specials.js). Entries
// are (anim, dt, ctx, tgt): anim is the Animator (per-instance scratch
// state lives on it, e.g. anim._nerveT), ctx the fighter's frame context,
// tgt the pose target — write tgt for anything the pose smoother owns
// (hips/torso/head), drive extra joints (anim.J) directly.
//
// Mechs whose hand hardware needs the wrist counter-pitch don't add an
// entry for it — set `levelHands: true` in roster.js instead (the
// dispatcher applies it, procedural bodies only).
import * as THREE from 'three';
import { lerp, clamp, clamp01 } from '../core/utils.js';
import { PRONE_CLIPS } from './animations.js';
import { driveFace, FACE_PRESETS } from './face.js';

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
// AEGIS shield carriage targets (see the aegis entry)
const SHIELD_REST = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.1, 0));
const SHIELD_BRACE = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1, 0, 0));

// A STABILIZED MOUNT: turn `mount` so that the muzzle ANCHOR hanging off it
// points along `yaw`, level, in the WORLD — whatever the body carrying it is
// doing. Used for KONGA's shoulder racks; general enough for any bolted-on
// barrel whose aim must not inherit the animal's posture.
//
// The maths is one step once it is stated the right way round. The anchor is
// rigidly attached somewhere below the mount, so the barrel direction is a
// CONSTANT `u` in the mount's own frame (the anchor's authored `rot`, plus any
// intermediate bone — the R muzzle rides a pod TIP, the L rides the pod). The
// wanted direction is a constant in the world. Pull the world one back into
// the mount's PARENT frame and the mount's local rotation is simply whatever
// takes u there. The roll about the barrel is left free, which is correct: a
// tube has nothing to roll.
//
// Damped and capped, like every other servo in the game — the racks swing onto
// the line, they never snap to it. Returns false when the anchor does not
// actually hang off this mount, so the caller can fall back.
const _qm = new THREE.Quaternion();
const _vm = new THREE.Vector3();
const _vm2 = new THREE.Vector3();
const MOUNT_K = 12;      // exponential damping toward the solution
const MOUNT_CAP = 7;     // rad/s the mount may turn, however far off it is
function aimBarrel(mount, anchor, yaw, dt) {
  // u — the barrel line in the MOUNT's frame, composed up the chain from the
  // anchor. Bails if we walk off the top without meeting the mount.
  _qm.identity();
  let o = anchor, guard = 0;
  for (; o && o !== mount && guard < 8; o = o.parent, guard++) _qm.premultiply(o.quaternion);
  if (o !== mount) return false;
  _vm.set(0, 0, 1).applyQuaternion(_qm);
  if (_vm.lengthSq() < 1e-9) return false;
  _vm.normalize();
  // ...and where it should be, expressed in the same frame the mount's own
  // rotation lives in
  if (!mount.parent) return false;
  mount.parent.updateWorldMatrix(true, false);
  mount.parent.getWorldQuaternion(_qm).invert();
  _vm2.set(Math.sin(yaw), 0, Math.cos(yaw)).applyQuaternion(_qm).normalize();
  _qm.setFromUnitVectors(_vm, _vm2);
  const err = mount.quaternion.angleTo(_qm);
  mount.quaternion.rotateTowards(_qm, Math.min(err * (1 - Math.exp(-MOUNT_K * dt)), MOUNT_CAP * dt));
  return true;
}

// wrist counter-pitch for mechs whose hand hardware (gatling pods, torch
// bells, pincers) extends along the hand's +Z: as the arm chain raises, the
// hardware would pitch skyward, so the wrist rolls back by the raise amount
// — capped near 90° so fully-raised arms read as hardware STRETCHED along
// the arm line rather than a broken wrist. At rest (arms down) it's a no-op.
// PROCEDURAL-ONLY: a GLB's hand hardware is authored aligned to the forearm
// in its own bind pose, so this counter-pitch (built for the procedural
// models' +Z hand hardware) just TWISTS the GLB's wrists off the weapon line
// — Vulcan's gatlings bent downward, Inferno's torches upward. The
// dispatcher skips it for isGLB.
export function levelHands(tgt) {
  for (const side of ['L', 'R']) {
    const raise = -(tgt['shoulder' + side][0] + tgt['elbow' + side][0] * 0.5);
    if (raise > 0.05) {
      tgt['hand' + side][0] += Math.min(1.62, raise);
    }
  }
}

// SAURION'S RUNNING FORELIMB CARRY, in one table because it is the whole of
// what a raptor does with its arms — and because the gait workbench cannot
// help you here. The gait's `arms.*` dials are a jogger's counter-swing; a
// theropod's forelimbs do not pump, they are CARRIED, so the signature ASSIGNS
// these joints (lerp with the speed ratio as the weight) rather than adding to
// what the cycle wrote. That assignment is what makes seven of the nine arm
// dials inert on his body at speed — the workbench measures it and hides them
// now (config.gait.body), which is honest, but it also means these five numbers
// are the only place his running arms can be changed.
//
// ARMS FORWARD, and forward is MEASURED — the rendered hand against the
// shoulder along his own facing, as a fraction of body height
// (tools/scratch/armcarry.mjs). He used to run with the arms hanging BEHIND the
// shoulder line: standing he carried the hand 0.26 ahead of the shoulder (the
// alert Jurassic-Park half-raise the rest pose authors) and the run dropped it
// to 0.07 with the ELBOW at -0.06, i.e. behind the joint it hangs off. That is
// the drop, not a swing — the run carry was pitched LESS forward than his own
// standing stance, so breaking into a run visibly let the arms fall back.
//   · `shoulder`  upper-arm pitch. NEGATIVE IS FORWARD (same sign as thigh
//                 pitch — see the counter-swing note in gaits.js), so the fix
//                 is a bigger magnitude, not a smaller one.
//   · `elbow`     the fold. Deeper keeps the claws tucked under the chest as
//                 the shoulder reaches out, which is the difference between
//                 carried and reaching.
//   · `wrist`     claws cocked up off the forearm line.
//   · `splay`     shoulder roll, mirrored L/R — arms held just off the ribs.
//   · `bob`       the only life in it: a small twice-a-stride carry bounce.
const SAURION_CARRY = { shoulder: -1.35, elbow: -1.45, wrist: 0.55, splay: 0.12, bob: 0.05 };

export const SIGNATURES = {
  vulcan(anim, dt, ctx, tgt) {
    const J = anim.J, t = anim.t;
    anim.spinVel = ctx.firing ? Math.min(anim.spinVel + dt * 40, 28) : Math.max(anim.spinVel - dt * 18, 0);
    if (J.gatlingR) J.gatlingR.rotation.z += anim.spinVel * dt;
    if (J.gatlingL) J.gatlingL.rotation.z -= anim.spinVel * dt;
  },


  rhino(anim, dt, ctx, tgt) {
    const J = anim.J, t = anim.t;
    // BULL RUSH: stays on two legs but the whole frame pitches HARD
    // over the horn — a linebacker sprint, fists pumping, head up the
    // runway. (Written into tgt — direct writes get clobbered.)
    if (ctx.charging) {
      const g = anim.phase * 2.2;         // driving sprint cycle
      const fL = Math.sin(g), fR = Math.sin(g + Math.PI);
      tgt.hipsRot = [0.5, 0, 0];          // heavy forward lean...
      tgt.hipsPos = [0, -anim.D.hipHeight * 0.22, 0];
      tgt.torso = [0.55, 0, 0];           // ...chest down over the horn
      tgt.head = [-0.8, 0, 0];            // eyes forward
      // arms tucked and PUMPING with the stride
      tgt.shoulderL = [-0.4 + fL * 0.9, 0, -0.14];
      tgt.shoulderR = [-0.4 + fR * 0.9, 0, 0.14];
      tgt.elbowL = [-1.2, 0, 0];
      tgt.elbowR = [-1.2, 0, 0];
      tgt.handL = [0.2, 0, 0];
      tgt.handR = [0.2, 0, 0];
      // legs drive on the opposite phase, long and low
      tgt.thighL = [-0.5 + fR * 0.85, 0, 0];
      tgt.thighR = [-0.5 + fL * 0.85, 0, 0];
      tgt.kneeL = [0.6 + Math.max(0, -fR) * 0.8, 0, 0];
      tgt.kneeR = [0.6 + Math.max(0, -fL) * 0.8, 0, 0];
      tgt.ankleL = [-0.3, 0, 0];
      tgt.ankleR = [-0.3, 0, 0];
    }
  },

  fenrir(anim, dt, ctx, tgt) {
    const J = anim.J, t = anim.t;
    const wag = 0.25 + (ctx.speed > 1 ? 0.5 : 0);
    for (let i = 0; i < 3; i++) {
      const tj = J['tail' + i];
      if (tj) {
        tj.rotation.y = Math.sin(t * (2.2 + wag * 2) + i * 0.9) * (0.18 + wag * 0.14);
        tj.rotation.x = Math.sin(t * 1.4 + i * 0.7) * 0.08 - 0.06;
      }
    }
  },

  colossus(anim, dt, ctx, tgt) {
    const J = anim.J, t = anim.t;
    if (J.mortars) J.mortars.rotation.x = ctx.firing ? -0.25 : Math.sin(t * 0.4) * 0.03;
  },


  saurion(anim, dt, ctx, tgt) {
    const J = anim.J, t = anim.t;
    // (the running forelimb carry is SAURION_CARRY, above the registry)
    // RAPTOR LOCOMOTION (researched theropod gait): the tail is a
    // travelling S-wave that wags side-to-side in time with the stride
    // to control angular momentum — raised at rest, whipping and
    // leveling out with speed — while the head counter-rotates to stay
    // stable on the prey as the body bobs and yaws.
    const run = clamp01((ctx.speed || 0) / (ctx.maxSpeed || 10));
    const ph = anim.phase;
    // predator dynamics: mid-strike the tail LASHES (fast heavy whip for
    // balance); in a dash it stiffens straight back as a counterweight;
    // otherwise stride-synced wave when moving, gentle sway at idle.
    const lashing = anim.action && !anim.action.fadingOut && !anim.action.clip.loop;
    const dashing = (ctx.dashT || 0) > 0;
    const wavePh = lashing ? t * 9 : run > 0.05 ? ph * 2 : t * 1.5;
    const amp = lashing ? 0.5 : dashing ? 0.06 : 0.1 + run * 0.3;
    for (let i = 0; i < 3; i++) {
      const tj = J['tail' + i];
      if (!tj) continue;
      // each segment lags the one before → an S-curve that runs down the tail
      tj.rotation.y = Math.sin(wavePh - i * 0.8) * amp;
      tj.rotation.x = (dashing ? 0.02 : 0.15 - run * 0.18) + Math.sin(wavePh * 0.5 - i * 0.5) * 0.05;
      tj.rotation.z = Math.cos(wavePh - i * 0.8) * amp * 0.3; // slight roll on the whip
    }
    // head stabilization: cancel the body's yaw sway + vertical bob so the
    // gaze holds level (real predators keep the head eerily still)
    if (J.head) {
      J.head.rotation.y -= Math.sin(ph) * 0.09 * run;
      J.head.rotation.x += Math.abs(Math.sin(ph)) * 0.06 * run - 0.03 * run;
    }
    // RAPTOR CARRIAGE (written into tgt — direct writes get clobbered):
    if (run > 0.05 && ctx.grounded !== false) {
      // running: the body levels out and stretches, head spearing
      // forward eyes-level — and the arms hold the classic tucked
      // half-raised carry instead of pumping like a jogger's.
      // (rest pitch 27° + locomotion lean already stack up: keep the
      // extra drop SMALL or the run reads nose-down)
      tgt.hipsRot[0] += 0.08 * run;
      tgt.hipsPos[1] -= 0.06 * run * anim.s;
      tgt.head[0] += -0.22 * run;
      const C = SAURION_CARRY;
      const carryBob = Math.sin(ph * 2) * C.bob * run;
      tgt.shoulderL[0] = lerp(tgt.shoulderL[0], C.shoulder + carryBob, run);
      tgt.shoulderR[0] = lerp(tgt.shoulderR[0], C.shoulder + carryBob, run);
      tgt.shoulderL[2] = lerp(tgt.shoulderL[2], -C.splay, run);
      tgt.shoulderR[2] = lerp(tgt.shoulderR[2], C.splay, run);
      tgt.elbowL[0] = lerp(tgt.elbowL[0], C.elbow, run);
      tgt.elbowR[0] = lerp(tgt.elbowR[0], C.elbow, run);
      tgt.handL[0] = lerp(tgt.handL[0], C.wrist, run);
      tgt.handR[0] = lerp(tgt.handR[0], C.wrist, run);
      // longer, springier strides than the humanoid cycle gives
      tgt.thighL[0] += -Math.sin(ph) * 0.2 * run;
      tgt.thighR[0] += -Math.sin(ph + Math.PI) * 0.2 * run;
      tgt.kneeL[0] += Math.max(0, Math.sin(ph + 1.05)) * 0.24 * run;
      tgt.kneeR[0] += Math.max(0, Math.sin(ph + Math.PI + 1.05)) * 0.24 * run;
    } else if (run <= 0.05 && ctx.grounded !== false) {
      // idle: coiled and ALERT — weight rocking between the staggered
      // feet, claws flexing, head ticking in sharp little scans
      tgt.hipsRot[2] += Math.sin(t * 0.9) * 0.02;
      tgt.handL[0] += Math.sin(t * 1.4) * 0.08;
      tgt.handR[0] += Math.sin(t * 1.4 + 1.1) * 0.08;
      tgt.head[1] += Math.sin(t * 0.47) > 0.93 ? 0.22 : Math.sin(t * 0.31) * 0.1;
    }
  },

  frogger(anim, dt, ctx, tgt) {
    const J = anim.J, t = anim.t;
    // FOUR ARMS as one creature: the upper cannon-pair pump in
    // ALTERNATION with the lower pair (counter-swing), like a galloping
    // four-limbed body, plus an idle bob so they never read as dead props.
    const c = anim.cur;
    const run = clamp01((ctx.speed || 0) / (ctx.maxSpeed || 10));
    const attacking = anim.action && !anim.action.fadingOut && !anim.action.clip.loop;
    // FROG LEAP: airborne, the cannon arms act like a diving frog's legs —
    // swept hard back while rising, splayed wide to brace for the landing.
    if (ctx.grounded === false) {
      const rise = clamp((ctx.vy || 0) / 12, -1, 1);
      const tuck = Math.max(0, rise), fall = Math.max(0, -rise);
      for (const sd of ['L', 'R']) {
        const sj = J['shoulder' + sd + '2'], ej = J['elbow' + sd + '2'];
        if (!sj || !ej) continue;
        const sx = sd === 'L' ? -1 : 1;
        sj.rotation.set(0.55 * tuck - 0.65 * fall, 0, sx * (0.18 * tuck - 0.38 * fall));
        ej.rotation.set(0.35 * tuck - 0.4 * fall, 0, 0);
      }
      return;
    }
    for (const sd of ['L', 'R']) {
      const sj = J['shoulder' + sd + '2'], ej = J['elbow' + sd + '2'];
      if (!sj || !ej || !c['shoulder' + sd]) continue;
      const sr = c['shoulder' + sd], er = c['elbow' + sd];
      const sx = sd === 'L' ? -1 : 1;
      // counter-swing the lower arm's pitch → the 4 limbs alternate
      const counter = -sr[0] * 0.7;
      const idle = Math.sin(t * 1.9 + (sd === 'L' ? 0 : Math.PI)) * 0.09 * (1 - run);
      // on an attack, the cannons rear back then punch forward with the arms
      const thrust = attacking ? sr[0] * 0.5 : 0;
      sj.rotation.set(counter * 0.7 + idle + thrust - 0.08, sr[1] * 0.4, sr[2] * 0.5 - sx * 0.06);
      ej.rotation.set(er[0] * 0.6 - 0.16 - run * 0.18, er[1] * 0.4, er[2] * 0.4);
    }
  },

  cranky(anim, dt, ctx, tgt) {
    const J = anim.J, t = anim.t;
    const act = anim.action;
    // crab menace: the pincers gape WIDE through a strike's wind-up, then
    // SNAP shut at the clamp (synced to the shared clip's own timing via
    // act.t/dur), easing back open after — otherwise breathe at rest.
    // ...but a rollover clip is a one-shot too, and a mech on its back is not
    // striking anything — the pincers just keep breathing while he's stranded
    const striking = act && !act.fadingOut && !act.clip.loop && !PRONE_CLIPS.has(act.clip.name);
    let gape;
    if (striking) {
      const ph = Math.min(1, act.t / act.clip.dur);
      gape = ph < 0.30 ? lerp(0.34, 0.55, ph / 0.30)
        : ph < 0.50 ? lerp(0.55, 0.02, (ph - 0.30) / 0.20)
          : lerp(0.02, 0.34, Math.min(1, (ph - 0.50) / 0.5));
    } else {
      gape = 0.34 + Math.sin(t * 1.4) * 0.14;
    }
    for (const sd of ['L', 'R']) {
      const jw = J['jaw' + sd];
      if (jw) jw.rotation.x = lerp(jw.rotation.x, -gape, dt * (striking ? 22 : 8));
    }
    // clawSnap is a straight-ahead CLAP: the clip reaches the arms outstretched
    // wide, then drives them together at the centerline. Keep the body square
    // through it (no boxer twist) so the read is "stretch out, smash in the
    // middle" and never a cross-body sweep. Overlapping pincers at the peak are
    // fine — the sideways travel IS the move.
    if (striking && act.clip.name === 'clawSnap') {
      tgt.hipsRot[1] *= 0.15;
      tgt.torso[1] *= 0.15;
    }
    // crab SCUTTLE: stride-synced shell roll + waddle yaw so the walk
    // reads sideways-crabby (via tgt — the smoother owns hips/torso)
    const scut = clamp01((ctx.speed || 0) / (ctx.maxSpeed || 10));
    if (scut > 0.05) {
      tgt.hipsRot[2] += Math.sin(anim.phase) * 0.11 * scut;
      tgt.hipsRot[1] += Math.cos(anim.phase) * 0.08 * scut;
      tgt.torso[2] -= Math.sin(anim.phase) * 0.06 * scut;
    }
    // hydro recoil: the whole shell kicks back while the cannons fire
    anim._crankyRecoil = lerp(anim._crankyRecoil || 0, ctx.firing ? 0.12 : 0, dt * (ctx.firing ? 18 : 6));
    tgt.torso[0] -= anim._crankyRecoil;
    // raised arms STRETCH the pincers out along the arm line instead
    // of leaving them at the resting 90° wrist crook
  },

  jerry(anim, dt, ctx, tgt) {
    const J = anim.J, t = anim.t;
    // NERVOUS CRUSTACEAN. Nothing about Jerry moves smoothly:
    // • antennae hold dead still, then SNAP to a new angle (randomized
    //   timer) like a startled insect re-aiming its sensors
    // • the little claw-arm nest ripples in a wave down the segments,
    //   and flares wide open while the cannons fire
    // • the head cocks in sharp little tilts on the same nerve timer
    // • the rear strut-legs creep in counter-phase with the stride
    anim._nerveT = (anim._nerveT ?? 0) - dt;
    if (anim._nerveT <= 0) {
      anim._nerveT = 0.4 + Math.random() * 1.5;
      anim._antL = { x: -0.7 + Math.random() * 1.0, z: 0.15 + Math.random() * 0.65 };
      anim._antR = { x: -0.7 + Math.random() * 1.0, z: -0.15 - Math.random() * 0.65 };
      anim._cock = (Math.random() - 0.5) * 0.34;
    }
    const snap = 1 - Math.exp(-24 * dt); // fast ease = twitch, not sway
    if (J.antL && anim._antL) {
      J.antL.rotation.x += (anim._antL.x - J.antL.rotation.x) * snap;
      J.antL.rotation.z += (anim._antL.z - J.antL.rotation.z) * snap;
    }
    if (J.antR && anim._antR) {
      J.antR.rotation.x += (anim._antR.x - J.antR.rotation.x) * snap;
      J.antR.rotation.z += (anim._antR.z - J.antR.rotation.z) * snap;
    }
    tgt.head[2] += anim._cock ?? 0;
    // arm-nest ripple
    const flare = ctx.firing ? 0.55 : 0;
    for (let i = 0; i < 3; i++) {
      for (const sd of ['L', 'R']) {
        const aj = J['armS' + i + sd];
        if (!aj) continue;
        const sx = sd === 'L' ? -1 : 1;
        aj.rotation.x = -0.25 + Math.sin(t * 3.4 - i * 1.15 + (sx > 0 ? 0.7 : 0)) * 0.3;
        aj.rotation.z = sx * (-0.3 - flare) + Math.cos(t * 2.7 - i * 0.9) * 0.14 * sx;
      }
    }
    // rear struts creep against the stride; twitchy scrabble in the air
    const mov = clamp01((ctx.speed || 0) / (ctx.maxSpeed || 10));
    for (const sd of ['L', 'R']) {
      const dj = J['legD' + sd];
      if (!dj) continue;
      if (!ctx.grounded) dj.rotation.x = Math.sin(t * 14 + (sd === 'L' ? 0 : 2)) * 0.2;
      else dj.rotation.x = Math.sin(anim.phase + (sd === 'L' ? Math.PI : 0)) * 0.16 * mov;
    }
  },

  nullbot(anim, dt, ctx, tgt) {
    const J = anim.J, t = anim.t;
    // the corruption shards bolted over the shell strobe like a failing
    // display — dead dark, then a hard flash, sometimes in the WRONG
    // color — and the head snaps in unsettling micro-ticks between
    // long dead stillness (nothing about it should read as alive)
    const mats = anim.mech.materials;
    anim._nbT = (anim._nbT ?? 0) - dt;
    if (anim._nbT <= 0) {
      anim._nbT = 0.05 + Math.random() * 0.16;
      const on = Math.random() < 0.72;
      if (mats?.glow2) {
        mats.glow2.emissiveIntensity = on ? 1.8 + Math.random() * 2.8 : 0.12;
        if (on && Math.random() < 0.35) {
          const c = [0x27f6ff, 0xff2df2, 0xff2038, 0x8a2dff][(Math.random() * 4) | 0];
          mats.glow2.color.setHex(c);
          mats.glow2.emissive.setHex(c);
        }
      }
    }
    if (anim._nbTwitch > 0) anim._nbTwitch -= dt;
    else if (Math.random() < dt * 0.7) {
      anim._nbTwitch = 0.5;
      anim.addImpulse('head', [0.06, (Math.random() < 0.5 ? -1 : 1) * 0.5, 0.1], 36, 15);
    }
  },

  viper(anim, dt, ctx, tgt) {
    const J = anim.J, t = anim.t;
    if (J.bladeL && J.bladeR) {
      const flare = ctx.firing || (anim.action && !anim.action.fadingOut) ? 0.0 : 0.35;
      J.bladeL.rotation.x = lerp(J.bladeL.rotation.x, flare, dt * 6);
      J.bladeR.rotation.x = lerp(J.bladeR.rotation.x, flare, dt * 6);
    }
  },

  // KONGA — a body that walks on its arms and fights with them.
  //   • THE FACE. He is one of two mechs with real features, so the expression
  //     layer runs every frame (see face.js): brow furrows with effort, jaw
  //     opens on a swing, full bellow on the drums and the ult.
  //   • THE PODS. The launchers ride his shoulders and TRACK, but they track
  //     ONTO THE FACING and never into the sky: they run out DEAD LEVEL and
  //     splay slightly outboard while he is firing, and settle flush against
  //     the shoulders when he's brawling — so you can still read at a glance
  //     whether he's about to shoot or swing, and the barrel line you can SEE
  //     is the line the salvo actually leaves on (world.js `salvo` fires each
  //     rocket down its own pod muzzle). They used to pitch 0.9 rad UP to lob,
  //     which made "where they point" and "where the rockets go" two different
  //     directions and left him shooting over the top of what he was facing.
  //   • THE SHOULDER ROLL. A silverback's mass rides forward over whichever
  //     arm is loaded; the gait supplies the roll, this adds the heavy
  //     breathing swell on top so he's never completely still.
  konga(anim, dt, ctx, tgt) {
    const t = anim.t;
    driveFace(anim, dt, ctx, tgt, FACE_PRESETS.konga);

    // SHOULDER PODS: two stabilized mounts that hold the barrel line on the
    // body's own facing, level, whatever the animal under them is doing.
    //
    // This cannot be said as a joint angle, and that is why it used to be
    // wrong. `pod.rotation.x = 0` means "unrotated RELATIVE TO THE TORSO", and
    // the torso is where all the movement is: he walks on his knuckles with
    // his chest pitched forward, and the ranged clip pitches it forward again,
    // so racks that were level in the bind pose were measured 25° into the
    // road at rest and swung another 12° with the clip. The rockets went
    // exactly where the barrels pointed, which was down.
    //
    // So the ask is answered in the WORLD, where it was made: solve the pod's
    // own rotation so that the muzzle ANCHOR's +Z — the real barrel line the
    // salvo leaves on (world.js `salvo`) — lies on the horizon along the
    // mech's facing. Nothing is assumed about which local axis is pitch (on
    // this rig it is not the obvious one), nothing is assumed about where the
    // anchor hangs (the R muzzle rides a pod TIP bone, the L rides the pod
    // itself), and any pose the torso reaches is cancelled by construction.
    const yaw = ctx.yaw;
    for (const side of ['L', 'R']) {
      // anim.part: virtual joint on the procedural body, custom-rig BONE on the
      // GLB (rigs/konga.rig.js) — one driver, both routes
      const pod = anim.part('pod' + side);
      const anchor = anim.mech.anchors?.['muzzle' + side];
      if (!pod) continue;
      if (yaw !== undefined && anchor && aimBarrel(pod, anchor, yaw, dt)) {
        // recoil jolt while actually firing — ON TOP of the solved aim, so it
        // is a kick the servo pulls back rather than a pose it fights
        if (ctx.firing) pod.rotateX(Math.sin(t * 34) * 0.05);
        continue;
      }
      // no anchor to solve against (a build with no authored muzzles): fall
      // back to simply holding the rack unrotated on the shoulder
      pod.rotation.x = lerp(pod.rotation.x, 0, dt * 12);
      pod.rotation.z = lerp(pod.rotation.z, 0, dt * 10);
      if (ctx.firing) pod.rotation.x += Math.sin(t * 34) * 0.05;
    }

    // heavy breathing: a slow swell through the chest and shoulders, bigger
    // the harder he's working. Nothing this size holds perfectly still.
    const effort = clamp01((ctx.speed || 0) / Math.max(1, ctx.maxSpeed || 10));
    const breath = Math.sin(t * 1.5) * (0.020 + 0.018 * effort);
    tgt.torso[0] -= breath;
    tgt.shoulderL[2] -= breath * 0.6;
    tgt.shoulderR[2] += breath * 0.6;
  },

  // TRITONE — a gun platform with an animal underneath.
  //   • THE FACE, as above but ceratopsian: the beak does the talking, the
  //     bony brows barely move.
  //   • THE FRILL. It FLARES — pitches up and back — when he braces to fire or
  //     commits to a charge, the way a real frill is a display organ. That is
  //     the tell that says "this one is about to happen".
  //   • THE CANNONS. They traverse to follow what he's shooting at and buck on
  //     every shell; at rest they settle level with the body line.
  //   • THE TAIL is driven by the gait's own tail layer (gaits.trike.tail),
  //     not here — it is locomotion, not personality.
  tritone(anim, dt, ctx, tgt) {
    const t = anim.t;
    driveFace(anim, dt, ctx, tgt, FACE_PRESETS.tritone);

    const act = anim.action;
    const clipName = act && !act.fadingOut ? act.clip.name : '';
    const bracing = ctx.firing || clipName === 'tritoneBrace' || ctx.state === 'ult';
    const charging = !!ctx.charging || clipName === 'chargeLean';

    // FRILL FLARE — up and back on a brace, jammed FORWARD as a shield on a
    // charge (a charging ceratopsian presents the frill, it doesn't show it off)
    const want = bracing ? -0.42 : charging ? 0.30 : 0;
    anim._frillK = lerp(anim._frillK ?? 0, want, 1 - Math.exp(-8 * dt));
    const frill = anim.part('frill');
    if (frill) {
      frill.rotation.x = anim._frillK;
      // a low shiver through the crown while the rockets are cooking
      if (bracing) frill.rotation.x += Math.sin(t * 26) * 0.012;
    }

    // THE CANNONS ARE NOT DRIVEN HERE. They are two turrets that aim
    // themselves at a lead point and answer to nothing else — combat/
    // cannonaim.js owns their bones, and it runs AFTER the pose is applied
    // (Fighter.updateCannons), so anything written to them here would be a
    // frame of fighting between a servo and a sine wave.

    // the head is enormous and hangs off the front — let it lag and settle
    // rather than tracking the body rigidly (weight, on a body that can't
    // pivot). A slow nod at rest, damped hard while braced.
    const idleNod = bracing ? 0 : Math.sin(t * 0.9) * 0.025;
    tgt.head[0] += idleNod;
    tgt.torso[0] -= idleNod * 0.3;
  },
};
