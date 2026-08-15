// GLB animation profiles — per-model reinterpretation of the shared engine.
//
// WHY: the keyframe CLIPS in animations.js are authored for the PROCEDURAL
// rig — its rest pose, its proportions, its handedness (which hand holds a
// weapon, where a blade points). A Tripo GLB often differs: a weapon in the
// opposite hand, a sword fused to the forearm at an angle, a stance the auto
// rig bound in. Retargeting those clips verbatim warps the result.
//
// HOW: the Animator still drives the SAME virtual joints and the SAME timing
// (so combat hit-windows, muzzle anchors and state durations are unchanged —
// gameplay is identical). A profile only changes HOW a pose is expressed for
// one GLB, at four well-defined seams:
//
//   restPose    {joint:[x,y,z]deg}   overrides the default/idle stance
//   combatPose  {joint:[x,y,z]deg}   overrides the ready-guard stance. NOTE:
//                                     GLB mechs do NOT inherit the procedural
//                                     def.combatPose — the service models are
//                                     authored in their own battle-ready stance
//                                     (that IS their bind pose, which the
//                                     retarget offsets capture), so their native
//                                     carriage already reads as "guard up".
//                                     Retargeting the procedural combatPose on
//                                     top of that fights the bind and wrenches
//                                     fused geometry off-axis. Set this only to
//                                     opt a GLB back into an explicit stance.
//   mirrorArms  bool                 swap L<->R arm clip tracks (weapon in the
//                                     opposite hand) — pitch kept, yaw/roll flip
//   clipOverrides {name: clip}       a bespoke clip for an action that can't be
//                                     remapped (redo, don't remap)
//   build(mech, def)                 one-time hook at the end of buildGlbMech —
//                                     attach extra PROCEDURAL geometry/joints to
//                                     the GLB's virtual rig (wraith's cape)
//   post(anim,dt,ctx,tgt)            per-frame reinterpretation hook, run after
//                                     the built-in signature(); write radians
//                                     into tgt / drive extra joints
//
// FACTORING CONTRACT:
//   • A change that should affect BOTH procedural and GLB  -> edit animations.js
//     (shared CLIPS) or the mech's def (roster.js).
//   • A change to a procedural mech's personality           -> animator.signature()
//   • A change to how ONE GLB interprets the shared motion   -> its profile here
//   • Static rest-pose alignment of a GLB (arms-down bind)   -> manifest
//     boneCorrections (via the ?debug=pose workbench's "Bind patch" export),
//     NOT restPose here — keep the two concerns separate so the pose workbench
//     stays the source of truth for bind.
//
// Procedural mechs have NO profile (mech.animProfile is undefined) and run the
// engine unchanged. Only GLB mechs (buildGlbMech) attach one.
import * as THREE from 'three';
import { lerp, clamp01 } from '../core/utils.js';
import { Assembler } from './parts.js';
import { makeMaterials } from './factory.js';
import { wraithCloak } from './designs/wraith.js';
import { GLB_CLIP_VARIANTS, PRONE_CLIPS } from './animations.js';

export const ARM_JOINTS = ['shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'handL', 'handR'];

// (CRANKY's claw carriage while scuttling — pincers held HIGH and out to the
// sides rather than hanging muzzle-down at the floor — used to be a constant
// table here. It is `GAITS.hexapod.arms` now: carry / tuck / swing, tunable in
// /workbench/?edit=gait like every other body's carriage.)
// Extra shoulder yaw cocked back/out on the wind-up of every Cranky attack.
const CRANKY_WINDBACK = 0.5;

// RHINO (GLB): combined shoulder+elbow PITCH (radians, virtual-joint space)
// that puts his hand-cannon barrels dead level. Measured on this rig: the
// muzzle's authored +Z sits ~82.7° below that joint sum, so a sum of −82.7°
// aims it at the horizon. Negative pitch raises the arm.
const RHINO_LEVEL = -82.7 * Math.PI / 180;
// Lead angle that cancels the animator's pose-chase lag at the fire frame.
const RHINO_LEAD = 14 * Math.PI / 180;

// GLACIER (GLB): same idea for the ICE LANCE in his LEFT hand. Measured on
// this rig by sweeping shoulderL+elbowL pitch and reading the muzzleL axis:
// the lance's authored +Z tracks the joint-pitch sum exactly (muzzle pitch =
// −62.1° − sum), so a sum of −62.1° puts the lance tip on the horizon. The
// shared shot clip drives the arm to −104/−18 = −122°, which would throw the
// whole barrage ~44° into the sky.
const GLACIER_LEVEL = -62.1 * Math.PI / 180;
// Lead past level while the arm is still climbing — the animator chases pose
// targets at a finite rate and the first icicle leaves at 20% into the clip.
const GLACIER_LEAD = 12 * Math.PI / 180;

export function mirrorJointName(j) {
  if (j.endsWith('L')) return j.slice(0, -1) + 'R';
  if (j.endsWith('R')) return j.slice(0, -1) + 'L';
  return j;
}
// mirror a joint value across the sagittal plane: pitch (x) preserved, yaw (y)
// and roll (z) negated. Used with the L<->R name swap for mirrorArms.
export function mirrorValue(v) { return [v[0], -v[1], -v[2]]; }

// wraith cape materials — pbrtex synthesis is expensive, cache per-def so
// every fighter build after the first reuses the same THREE materials
let _wraithMats = null;
function wraithMats(def) {
  return (_wraithMats ??= makeMaterials(def));
}

// ---- WRAITH helpers (shared by the custom-rig build and its `alt`) --------
// Attach the PROCEDURAL cloak (cloak/cloakL/cloakR + blade strips + wing0..5
// emitters, from designs/wraith.js) to the GLB's virtual torso. Hidden until
// the wing-laser heavy grows it in (wraithCapeGrow).
function wraithBuild(mech, def) {
  const A = new Assembler();
  wraithCloak(A, mech.dims, mech.joints, mech.anchors);
  A.build(mech.joints, wraithMats(def));
  // wrapper between torso and cloak: the grow-in scale lives here so it
  // never fights heavyFlare, which SETS the cloak joint's own scale
  const capeRoot = new THREE.Group();
  mech.joints.torso.add(capeRoot);
  capeRoot.add(mech.joints.cloak);
  capeRoot.visible = false;
  mech.capeRoot = capeRoot;
}
function wraithCapeGrow(anim, dt) {
  const cr = anim.mech.capeRoot;
  if (!cr) return;
  const act = anim.action;
  const playing = !!act && !act.fadingOut && act.clip.name === 'wraithLasers';
  const k = lerp(anim._capeK || 0, playing ? 1 : 0, 1 - Math.exp(-10 * dt));
  anim._capeK = k;
  cr.visible = k > 0.03;
  if (cr.visible) cr.scale.setScalar(Math.max(0.001, k));
}

// The rifle hangs MUZZLE-DOWN in the gun hand, so its barrel sits ~90° below
// the horizon at rest — and combat throws every shot along the muzzle anchor's
// +Z (world.js barrelDeflect), which now IS the rifle's tip bone. Left alone,
// the sniper shot would fly into the floor. Same shape as the RHINO fix: a
// combined shoulder+elbow PITCH that puts the barrel dead level, with a lead
// angle that cancels the animator's pose-chase lag at the fire frame (the
// shot leaves 20% into `shoot`, while the arm is still climbing).
// Measured on this rig with tools/aimprobe.mjs: the rifle's tip anchor sits
// 99.5° below the shoulder+elbow pitch sum, so that sum puts it on the horizon.
const WRAITH_LEVEL = -99.5 * Math.PI / 180;
const WRAITH_LEAD = 26 * Math.PI / 180;

// VULCAN (retired TRIPO rig, `alt`): the BULLET HURRICANE's arms pose, where
// the gatlings must ride diagonally UP-and-out. This rig hangs the guns at an
// angle to the forearm and reads the clip's shoulder angles differently, so the
// procedural pose retargets to barrels drooping ~25° BELOW the horizon. Found by
// sweeping the whole shoulder triple in ?debug=models and reading the muzzle
// anchor's +Z: this one lands each barrel 16° above the horizon, straight out to
// the side with no fore/aft skew (hand out 4.4, up 4.0 over the shoulder).
// Applied as a SCALE of how far the clip has flung the arms, so the GLB reaches
// out on the same beat (and comes back down on it).
const VULCAN_TRIPO_HURRICANE_ARM = [0.45, 0.45, 1.68];
const VULCAN_CLIP_ROLL = 138 * Math.PI / 180;   // the clip's own roll at full reach

// VULCAN (custom rig). His bones ARE the game joints now, so the shared clips
// land close to the procedural body and only two trims are left, both measured
// off the muzzleR anchor's +Z in ?debug=models:
//   VULCAN_FIRE     — the gatlingLoop drives the FIRING shoulder to -90 deg,
//     which on this arm throws the barrel high and wide, so each side is pinned
//     to the pitch/yaw that puts ITS barrel dead level and on the centreline.
//     The two sides are NOT mirror images, and that is not a bug: muzzleR and
//     muzzleL are hand-placed anchors carried over from the old rig with their
//     own world aim preserved, so the guns genuinely sit at slightly different
//     angles on their bones. Each trim is measured against its own barrel, by
//     reading the mean spawn direction of the rounds in ?debug=models.
//   HURRICANE_ARM   — the ult's arms-out gathering pose. The clip's roll reads
//     shallower here than on the procedural shoulder, so the whole triple is
//     substituted: barrels 33 deg up and out, hand 4.7 out / 8.8 up (the
//     procedural's 4.9 / 8.0).
const VULCAN_FIRE = {
  R: { pitch: -1.10, yaw: -0.40 },
  L: { pitch: -1.25, yaw: 0.00 },
};
const VULCAN_HURRICANE_ARM = [0.7, 0.45, 1.88];
const WRAITH_SHOTS = new Set(['shoot', 'aim']);
function levelBarrel(anim, tgt) {
  const act = anim.action;
  if (!act || act.fadingOut || !WRAITH_SHOTS.has(act.clip.name)) return;
  // gun arm = LEFT (the model carries the rifle there; mirrorArms has already
  // routed the clip's right-arm tracks onto it)
  const sh = tgt.shoulderL, el = tgt.elbowL;
  if (!sh || !el) return;
  const ph = Math.min(1, act.t / act.clip.dur);
  const k = ph < 0.1 ? ph / 0.1 : ph > 0.45 ? Math.max(0, 1 - (ph - 0.45) / 0.35) : 1;
  const level = WRAITH_LEVEL - el[0] - (ph < 0.3 ? WRAITH_LEAD * (1 - ph / 0.3) : 0);
  // pull onto the line fast, then hold; max() is the ceiling at the horizon so
  // the clip's overshoot can't swing the muzzle up past it (see rhino)
  sh[0] = Math.max(lerp(sh[0], level, k), level);
  sh[1] *= 1 - 0.8 * k;                            // square the gun onto the target line
  sh[2] *= 1 - 0.8 * k;
}

// Cloak sway. The custom rig hangs the drape off the torso as four columns of
// three bones (rigs/wraith.rig.js); none of them is a game joint, so the
// retarget never writes them and this hook owns them outright. Bone-local axes
// are the model's bind axes: +x forward, +y up, +z the model's left — so a
// rotation about LOCAL Z pitches a column back (negative) or forward, and one
// about LOCAL X fans it sideways. Rows compound down the chain, so row 1 does
// most of the work and the fringe follows.
const CLOAK_COLS = ['R', 'MR', 'ML', 'L'];
const CLOAK_ROW_K = [1, 0.62, 0.38];
// `wind` (0..1) is a SECOND source of movement, added to what his own speed
// already gives the cloak: it stands in for a gale he is not actually running
// into, which is what his TAUNT needs — he is stationary and looming, and a
// cloak driven only by ground speed is a dead sheet while he does it.
function swayCloak(anim, dt, ctx, wind = 0) {
  const rb = anim.mech.rigBones;
  if (!rb) return;
  const t = (anim._cloakT = (anim._cloakT || 0) + dt);
  const spd = Math.min(1, Math.max((ctx.speed || 0) / (ctx.maxSpeed || 10), wind));
  // trail back with speed; in the air the drag lifts it further
  let trail = -0.30 * spd;
  if (!ctx.grounded) trail -= Math.min(0.35, 0.02 * Math.max(0, -(ctx.vy || 0)));
  const rate = 2.0 + 3.0 * spd;
  for (let c = 0; c < CLOAK_COLS.length; c++) {
    // a gale RIPPLES as well as swings — a second, faster wave whose amplitude
    // is the wind alone, so ordinary running is unchanged to the bit
    const wave = Math.sin(t * rate + c * 0.8) + wind * 0.8 * Math.sin(t * (rate * 2.3) + c * 2.1);
    const swing = trail + (0.03 + 0.075 * spd) * wave;
    const fan = (0.02 + 0.05 * spd) * Math.sin(t * rate * 0.7 + c * 1.3)
      + wind * 0.06 * Math.sin(t * rate * 1.7 + c * 0.6);
    for (let r = 0; r < 3; r++) {
      const b = rb[`cape${CLOAK_COLS[c]}${r + 1}`];
      if (!b) continue;
      b.rotation.z = swing * CLOAK_ROW_K[r];
      b.rotation.x = fan * CLOAK_ROW_K[r];
    }
  }
}

// helper for post hooks: is an attack clip (non-looping action) playing?
function attacking(anim) {
  return !!(anim.action && !anim.action.fadingOut && !anim.action.clip.loop);
}
function blocking(anim, ctx) {
  const n = anim.action && !anim.action.fadingOut ? anim.action.clip.name : '';
  return !!ctx.blocking || n === 'block';
}

// ---- per-GLB profiles ----------------------------------------------------
// Each entry documents that model's default-pose read and only overrides what
// the shared engine gets wrong for it. Empty {} = the retargeted procedural
// motion already reads correctly (verified) — a home for future tweaks.
export const GLB_ANIM = {
  // AEGIS — tower shield on the LEFT forearm, energy lance in the RIGHT hand:
  // same handedness as procedural, so clips map straight across (no mirror).
  // The procedural mech keeps the shield squared to the front via a J.shield
  // joint the GLB lacks, so reproduce that intent here: while guarding, raise
  // and square the left forearm so the shield faces the enemy.

  // VIPER — twin energy blades are FUSED to the forearms as rigid extensions
  // of the arm (not held in the hands), so the blade axis IS the forearm axis:
  // any twist of the forearm/wrist rolls the flat blade off that axis and it
  // reads as bent. The "blade == forearm extension" invariant is held at two
  // seams:
  //   • rest / ready / menus / title & select carriage — the model's own bind
  //     pose (both blades authored as clean forearm extensions). This holds
  //     automatically because GLBs no longer inherit the procedural combatPose,
  //     which used to retarget a wrist roll onto one arm and twist that blade
  //     flat (the reported title/select bug). No combatPose override needed —
  //     an empty/absent one already means "native bind = battle pose".
  //   • attacks — the shared slash/stab/drill clips add a hand ROLL/yaw that
  //     would swing an in-hand sword but instead twists a forearm blade. Damp
  //     that roll/yaw and let the shoulder+elbow arc carry the slash, so the
  //     blade stays speared along the forearm through the whole swing.
  viper: {
    clipOverrides: { taunt: GLB_CLIP_VARIANTS.viperTaunt },
    post(anim, dt, ctx, tgt) {
      if (attacking(anim)) {
        tgt.handL[1] *= 0.3; tgt.handR[1] *= 0.3;
        tgt.handL[2] *= 0.2; tgt.handR[2] *= 0.2;
      }
    },
  },

  // FENRIR — the wolf's TAIL WAG used to live here as a hard-coded sine over
  // `mech.rigBones.tail0…5`. It is GAIT DATA now: the `tail` dial group in
  // gaits.js (droop / straighten / wag / whip / float), applied by
  // applyTailGait and written onto the same bones by Animator.applyTailPose —
  // so it is tunable in /workbench/?edit=gait against the live body instead of
  // being three numbers in a post hook, and it beats with the stride instead of
  // with a free-running clock.
  // …and his TAUNT whips it. The whip is added HERE rather than keyed into the
  // clip, because a clip track REPLACES what the gait wrote — droop, the
  // measured straightening of the rig's own curve, the wag — and a tail laid
  // out flat and rigid for the duration of a howl is worse than no whip at all.
  // This runs after applyTailGait (post is the last pass over `tgt`), so it is
  // a sweep ADDED to the carriage he already has: two full passes left-right
  // over the clip, the wave lagging down the chain exactly as the gait's does.
  fenrir: {
    clipOverrides: { taunt: GLB_CLIP_VARIANTS.fenrirTaunt },
    post(anim, dt, ctx, tgt) {
      const act = anim.action;
      if (!act || act.clip.name !== 'taunt') return;
      const chain = anim.tailChain?.();
      if (!chain) return;
      const ph = Math.min(1, act.t / act.clip.dur);
      // fade in and out so the whip cannot pop against the ambient wag. 1.15 rad
      // at the tip band (was 0.5, which read as the ordinary walking wag with
      // the volume up rather than a wolf throwing his tail about) — measured
      // sweep per segment 15 degrees at the root climbing to 66 at the tip.
      const amp = 1.15 * Math.sin(Math.PI * Math.min(1, ph / 0.85));
      for (let i = 0; i < chain.n; i++) {
        const a = tgt['tail' + i];
        if (!a) continue;
        const k = chain.n > 1 ? i / (chain.n - 1) : 0;
        a[1] += Math.sin(ph * Math.PI * 4 - 1.1 * k) * amp * (0.35 + k);
      }
    },
  },

  // The rest read correctly with the retargeted procedural motion (verified
  // in showcase/battle). Entries kept so each GLB has a documented home for
  // future per-model animation work.
  // TITANUS — heavy biped brawler, direct map. His TAUNT is the capoeira
  // ginga (animations.js), the only clip on him that is not the shared one.
  titanus: { clipOverrides: { taunt: GLB_CLIP_VARIANTS.titanusTaunt } },
  // TEMPEST — direct map. His taunt opens the chest and holds it while the
  // static walks all over him (Fighter.arcTaunt, roster `arcTaunt`).
  tempest: { clipOverrides: { taunt: GLB_CLIP_VARIANTS.tempestTaunt } },
  // KONGA — cyborg silverback, direct map. His only reinterpretation is the
  // TAUNT: a beckoning hand means nothing on an ape, and a chest beat means
  // everything.
  konga: { clipOverrides: { taunt: GLB_CLIP_VARIANTS.kongaTaunt, block: GLB_CLIP_VARIANTS.kongaBlockGlb } },
  // RHINO — hand-mounted cannons (manifest muzzles ride the handR/handL BONES,
  // each with an authored `rot` = that barrel's own aim axis). This GLB's bind
  // hangs the arms straight down, so at rest those barrels point ~70° at the
  // FLOOR; the shared `shoot` clip then swings the gun arm up past vertical-ish
  // (shoulder −94°, and elbow adds more) and the barrel overshoots to ~+32°
  // ABOVE the horizon — which world.js barrelDeflect faithfully obeys, lobbing
  // the shell into the sky instead of at the enemy.
  // Fix: while a shot plays, LEVEL the arms — hold shoulder+elbow pitch at the
  // barrel-horizontal line (RHINO_LEVEL, measured on this rig) so the muzzle
  // +Z sits on the horizon at the fire frame. The gun arm is CLAMPED (it may
  // still swing up from rest and drop back, it just can't climb past level, so
  // the kick still reads), and the off arm is ramped up to the same line so he
  // braces both cannons forward instead of firing one-handed from the hip.
  rhino: {
    clipOverrides: { taunt: GLB_CLIP_VARIANTS.rhinoTaunt },
    post(anim, dt, ctx, tgt) {
      const act = anim.action;
      const n = act && !act.fadingOut ? act.clip.name : '';
      if (n !== 'shoot' && n !== 'shootL') return;
      // ramp the off-arm raise in/out so it doesn't pop at the clip seams
      const ph = Math.min(1, act.t / act.clip.dur);
      const k = ph < 0.12 ? ph / 0.12 : ph > 0.62 ? Math.max(0, 1 - (ph - 0.62) / 0.3) : 1;
      for (const s of ['R', 'L']) {
        const sh = tgt['shoulder' + s], el = tgt['elbow' + s];
        if (!sh || !el) continue;
        // Shoulder pitch that levels this arm — LED slightly past level while
        // the arm is still climbing: the animator chases pose targets at ~26/s
        // and the shell leaves at 20% into the clip, so a plain level target is
        // still ~5° short of the horizon at the fire frame. The lead decays out
        // by mid-clip, leaving the hold exactly on the line.
        const level = RHINO_LEVEL - el[0] - (ph < 0.3 ? RHINO_LEAD * (1 - ph / 0.3) : 0);
        // pull onto the line fast, then hold: max() is a hard ceiling at the
        // horizon so the clip's overshoot can't lift the barrel above it again.
        sh[0] = Math.max(lerp(sh[0], level, k), level);
        sh[2] *= 1 - 0.7 * k;                     // unsplay: barrels parallel, forward
      }
    },
  },
  // COLOSSUS — artillery biped, direct map (mortars procedural-only). The one
  // reinterpretation: his charged heavy is a THUNDERCLAP on this model instead of
  // the shared overhead pound, whose follow-through dragged these forearms through
  // the widest chest slab on the roster. Kept under the POUND's clip names so the
  // charge machinery matches either build (see the note above COLOSSUS_CLAP in
  // animations.js); the procedural colossus keeps the pound, which never clipped
  // on it. Both mirror names map to the same clap — it is symmetric, and without
  // them half his heavies would fall through to the mirrored pound.
  colossus: {
    clipOverrides: {
      poundHold: GLB_CLIP_VARIANTS.colossusClapHoldGlb,
      poundHoldMirror: GLB_CLIP_VARIANTS.colossusClapHoldGlb,
      poundSlam: GLB_CLIP_VARIANTS.colossusClapGlb,
      poundSlamMirror: GLB_CLIP_VARIANTS.colossusClapGlb,
      taunt: GLB_CLIP_VARIANTS.colossusTaunt,
    },
  },

  // WRAITH — hand-placed CUSTOM RIG (src/mechs/rigs/wraith.rig.js), so this
  // profile reads very differently from the old Tripo build kept as `alt`
  // (wraith_alt below):
  //   • the rifle is in the model's LEFT hand and the rig is named
  //     anatomically, so `mirrorArms` plays the right-arm clip tracks on the
  //     arm that actually holds the gun — no crossed bones, no hand-written
  //     punch fixup (the alt still needs one; see wraith_alt).
  //   • the gun hangs MUZZLE-DOWN, so a ranged shot levels the barrel first
  //     (levelBarrel) — the muzzle anchor rides the rifle's own tip bone.
  //   • the model's cloak is a real four-column chain now, so it SWAYS.
  // The WING-LASER heavy still wears the PROCEDURAL cape: build() attaches the
  // cloak/cloakL/cloakR rig + blade strips + wing0..5 emitters from
  // designs/wraith.js onto the virtual torso joint. It stays hidden in normal
  // play and GROWS out while the heavy runs (heavyFlare/heavyRaise spread and
  // fan it exactly as on the procedural mech, and heavyImpactFx fires from the
  // same wing tips). The body swaps the lift-off hover clip for a grounded lean.
  wraith: {
    mirrorArms: true,
    build: wraithBuild,
    //   • the GUARD is his own too: the shared block stands the rifle on end
    //     beside his head, so `block` brings it down across him instead.
    clipOverrides: {
      wraithLasers: GLB_CLIP_VARIANTS.wraithLasersGlb,
      taunt: GLB_CLIP_VARIANTS.wraithTaunt,
      block: GLB_CLIP_VARIANTS.wraithBlockGlb,
    },
    post(anim, dt, ctx, tgt) {
      levelBarrel(anim, tgt);
      // THE TAUNT BLOWS A GALE THROUGH THE CLOAK. He stands still to do it, and
      // a cloak driven only by ground speed hangs dead while he looms.
      const act = anim.action;
      const taunting = !!act && !act.fadingOut && act.clip.name === 'taunt';
      swayCloak(anim, dt, ctx, taunting ? 1 : 0);
      wraithCapeGrow(anim, dt);
    },
  },
  // WRAITH (alt) — the original Tripo auto-rig build, kept for comparison.
  // Its manifest CROSSES the arms (handR mapped onto the gun arm), so it must
  // NOT mirror, and its splayed bind needs the punch fixup below.
  wraith_alt: {
    build: wraithBuild,
    clipOverrides: { wraithLasers: GLB_CLIP_VARIANTS.wraithLasersGlb },
    post(anim, dt, ctx, tgt) {
      // LEFT (claw / non-gun) arm: this GLB's left-arm bones sit splayed
      // outward at bind, so the retarget turns the jab's shoulder yaw+roll
      // into a sideways swipe — the claw reaches OUT instead of punching in.
      // When the arm is thrown forward (a punch), flatten that yaw/roll so
      // the bone reads as driving straight ahead. Gated on forward pitch, so
      // rest/guard poses (and the whole GUN arm) are left exactly as-is.
      const sp = tgt.shoulderL;
      if (sp && sp[0] < -0.7) {                 // arm past ~40° forward = punching
        const k = Math.min(1, (-sp[0] - 0.7) / 0.7); // ramp in across -40°..-80°
        sp[0] -= 0.2 * k;                       // drive a touch deeper down the line
        sp[1] = sp[1] * (1 - k) - 0.8 * k;      // kill the outward yaw, then reach IN
        sp[2] *= 1 - 2.2 * k;                   // cancel + reverse the splaying roll
        const ep = tgt.elbowL;
        if (ep) { ep[1] *= 1 - 0.9 * k; ep[2] *= 1 - 0.9 * k; }
      }
      wraithCapeGrow(anim, dt);
    },
  },
  // INFERNO — flamer biped, direct map (levelHands is shape-shared). The only
  // reinterpretation is the flame channel: his torches are forearm barrels, so
  // the shared shootLoop's folded elbows pointed them at the sky.
  inferno: { clipOverrides: {
    shootLoop: GLB_CLIP_VARIANTS.infernoFlameGlb,
    shootLoopL: GLB_CLIP_VARIANTS.infernoFlameLGlb,
    // …and the TAUNT, which folds his arms so the venting has a body to happen
    // on (Fighter.tauntVenting / stackfx.js stackToot)
    taunt: GLB_CLIP_VARIANTS.infernoTaunt,
  } },
  // GLACIER — heavy biped, direct map except for the two attacks that come out
  // of the ICE LANCE in his LEFT hand: the Icicle Barrage (`shootL`) and the
  // Cryo Beam channel (`shootLoopL`), both pointed at roster `primaryMuzzle`.
  // This GLB's bind hangs that arm straight down with the lance angled further
  // down still, so the shared clips swing it past level and the barrage sprays
  // skyward. Hold the lance arm on the level line (with a hard ceiling, so the
  // clip's overshoot can't lift it again) for as long as the attack runs, and
  // counter-steer the shoulder yaw against the recoil twist so the shots fly
  // parallel to the facing. Only the lance arm is touched — the off arm keeps
  // the clip's counter-pose, and every other clip is untouched. (The head is
  // held by the shared `rigidShell` lock, not here.)
  glacier: {
    clipOverrides: { taunt: GLB_CLIP_VARIANTS.glacierTaunt },
    post(anim, dt, ctx, tgt) {
      const act = anim.action;
      const n = act && !act.fadingOut ? act.clip.name : '';
      if (n !== 'shootL' && n !== 'shootLoopL') return;
      const sh = tgt.shoulderL, el = tgt.elbowL;
      if (!sh || !el) return;
      // ramp in so the hold doesn't pop at the clip seam. The one-shot also
      // ramps OUT across its recovery; the channel loops for as long as the
      // beam is pouring, so it ramps on once and then just holds.
      const ph = Math.min(1, act.t / act.clip.dur);
      const k = act.clip.loop
        ? Math.min(1, act.t / 0.12)
        : (ph < 0.12 ? ph / 0.12 : ph > 0.62 ? Math.max(0, 1 - (ph - 0.62) / 0.3) : 1);
      // lead past level while the arm is still climbing (GLACIER_LEAD) — 0.15s
      // is the same window as the old ph<0.3 on the 0.5s shot clip
      const level = GLACIER_LEVEL - el[0] - (act.t < 0.15 ? GLACIER_LEAD * (1 - act.t / 0.15) : 0);
      sh[0] = Math.max(lerp(sh[0], level, k), level);
      // The clips twist the torso into the recoil, and with the lance now held
      // level that twist reads straight through to the barrel's yaw — it walked
      // the fan out to 11° off the facing across the barrage. Counter-steer the
      // shoulder by the same yaw so the body still rocks but the lance keeps
      // pointing where the mech is pointing (peak drift 3°).
      sh[1] -= (tgt.torso?.[1] || 0) * k;
    },
  },
  // CRANKY — the Tripo auto-rig welded both giant claws onto one leg bone and
  // buried the arm chains in the thin walking-legs, so the shipped rig swung a
  // back leg on attacks while the claws sat dead (the reported bug). It's fixed
  // upstream now: a hand-placed CUSTOM RIG (src/mechs/rigs/cranky.rig.js,
  // authored in ?rigedit) re-skins the mesh so each giant claw is a real
  // independent arm — the shared attack clips drive the claws directly through
  // the retarget, no special-casing needed.
  //
  // The only reinterpretation left is aesthetic: the humanoid punch clips twist
  // the torso like a boxer, which a wide crab shouldn't do — square him up so he
  // THRUSTS the claws straight ahead instead of winding up.
  cranky: {
    clipOverrides: { taunt: GLB_CLIP_VARIANTS.crankyTaunt },
    // post: crab-squaring during attacks (no boxer torso-twist) + advance the
    // hexapod gait clock from walk speed. build: drive all SIX legs in a tripod
    // gait (custom rig gives each crab leg a real hip bone; two carry the game
    // leg joints, four are extra). postDress runs AFTER the retarget so it owns
    // the leg pose. Attacks still drive the real claw arms via the shared clips.
    post(anim, dt, ctx, tgt) {
      const act = anim.action;
      // FLIPPED (roster `rollover`, see fighter.js): while he's over on his
      // shell every crab rule below is wrong — the walk carry would flatten the
      // prone hips back to level, the no-droop floor is meaningless on a body
      // whose claws point at the sky, and the flip and righting-roll clips are
      // one-shots that would otherwise read as ATTACKS and pick up a wind-up.
      const prone = !!act && PRONE_CLIPS.has(act.clip.name);
      const attacking = act && !act.fadingOut && !act.clip.loop && !prone;
      const m = anim.mech;
      if (attacking) {
        tgt.hipsRot[1] *= 0.2; tgt.torso[1] *= 0.2; tgt.torso[2] *= 0.4;
        // clawSnap is a straight-ahead CLAP — the clip reaches the arms
        // outstretched wide then drives them together at the centerline. Square
        // the body up HARD through it so the giant pincers travel straight in
        // instead of sweeping across the torso (which reads as a body turn).
        // Overlapping pincers at the peak are fine; the lateral travel is the move.
        if (act.clip.name === 'clawSnap') {
          tgt.hipsRot[1] *= 0.1;
          tgt.torso[1] *= 0.1;
          tgt.torso[2] *= 0.25;
        }
        // WIND BACK: before the strike goes forward, cock BOTH shoulders far
        // back/out to the sides — a crab loads its pincers wide, it doesn't jab
        // from a neutral guard. Triangular envelope: swells to a peak just
        // before the strike frame, then unwinds as the claws drive in. Yaw only,
        // so it stacks on the clip's own swing without touching the pitch the
        // no-droop clamp below owns.
        const wph = Math.min(1, act.t / act.clip.dur);
        const wind = wph < 0.34 ? wph / 0.34 : Math.max(0, 1 - (wph - 0.34) / 0.24);
        tgt.shoulderL[1] -= CRANKY_WINDBACK * wind;
        tgt.shoulderR[1] += CRANKY_WINDBACK * wind;
      }
      // SHELL LOCK: head + torso are one rigid carapace on this crab. That is
      // now the shared roster `rigidShell` flag — the animator pins the head to
      // its rest carriage after this hook runs, so there is nothing to do here.
      // (The mouth plate rides the shell too, but it hangs off `hips` in the
      // rig, so postDress re-seats it on the torso.)
      // NO-DROOP: his neutral already rests the claws ON the floor, so ANY
      // downward arm travel drives them through it — which is what had the idle
      // arm propping the body up during a light. Positive shoulder pitch lowers
      // the arm here, so neutral is a hard floor: arms may only rise from rest.
      if (!prone) {
        tgt.shoulderL[0] = Math.min(tgt.shoulderL[0], anim.rest.shoulderL[0]);
        tgt.shoulderR[0] = Math.min(tgt.shoulderR[0], anim.rest.shoulderR[0]);
      }
      // Pincer clench — drives the clawL/clawR jaw bones (not game joints, so
      // the retarget never touches them) via postDress below. Jaws spread OPEN
      // on the wind-up, SNAP shut through the strike, then ease back open.
      let clench = 0;
      if (attacking) {
        const ph = Math.min(1, act.t / act.clip.dur);
        clench = ph < 0.30 ? -0.7 * (ph / 0.30)
          : ph < 0.50 ? (ph - 0.30) / 0.20
            : Math.max(0, 1 - (ph - 0.50) / 0.50);
      }
      m._clawClench = (m._clawClench ?? 0) + (clench - (m._clawClench ?? 0)) * Math.min(1, dt * 16);
      // ---- CRUSTACEAN WALK: IT IS THE GAIT, NOT THIS HOOK ----
      // This used to be a private crab walk bolted on beside the gait system:
      // the leg stride was unwound back to rest, the claw carriage assigned from
      // a constant table, and a SECOND phase clock (`_gaitPhase += (2+6*ratio)*dt`)
      // drove four of the six legs from postDress. Three things fell out of that
      // and all three were reported: his legs kept moving after the gait
      // workbench was paused (that clock is not the gait phase, so freezing the
      // phase did nothing to it), his step cadence had no relationship to how
      // fast he was actually travelling, and most of the panel's dials could not
      // move him because this hook undid them a moment later.
      //
      // It is all in `GAITS.hexapod` now (gaits.js): the back pair is the game's
      // own leg joints and rides the ordinary stride, the other four are the
      // `hex` block on the same phase, and the claw carriage is `arms.carry` /
      // `tuck` / `swing`. What is left here is the crab's own reinterpretation of
      // the shared ATTACK clips, which is what this hook is for.
    },
    build(mech) {
      const byName = {};
      mech.group.traverse((o) => { if (o.isBone) byName[o.name] = o; });
      // (the six legs are the GAIT's now — `GAITS.hexapod`, applied to these same
      // bones by Animator.applyHexPose after the retarget. Nothing to hold here.)
      // Movable pincer jaws (custom-rig claw bones, children of the hands).
      // Each claw's MOVABLE jaw is isolated onto claw*/ the fixed jaw + palm onto
      // hand* by the jaw-split skinOps in the manifest — without that split the
      // whole pincer head sits on one bone and rotating it just flicks the claw
      // as a rigid lump instead of opening it.
      // The two pincers are MIRRORED, so they clamp on OPPOSITE local-X
      // directions (measured on the skinned mesh: left jaw closes on +X, right
      // on -X). A single shared sign would open one claw while closing the other.
      const claws = [['clawL', 1], ['clawR', -1]]
        .map(([n, close]) => ({ b: byName[n], close, rx: byName[n]?.rotation.x || 0 }))
        .filter((c) => c.b);
      // SHELL LOCK (mouth): the mouth plate is part of the same carapace as the
      // torso, but the rig hangs it off `hips`, so a torso tilt tore it away
      // from the shell. Bank its bind transform IN TORSO SPACE now, then re-seat
      // it there every frame — a rigid parent constraint without re-parenting
      // the rig (which would change what the skinning binds to).
      const torsoB = byName.torso, mouthB = byName.mouth;
      let mouthOffset = null;
      if (torsoB && mouthB && mouthB.parent) {
        mech.group.updateMatrixWorld(true);
        mouthOffset = new THREE.Matrix4().copy(torsoB.matrixWorld).invert().multiply(mouthB.matrixWorld);
      }
      const _mm = new THREE.Matrix4(), _pinv = new THREE.Matrix4();
      mech.postDress = () => {
        // pincer open/close: clench +1 clamps shut, negative gapes open. The two
        // jaws are ONE connected shell, so the split boundary shears as the jaw
        // swings — keep the angle modest: enough to read as a snap, small enough
        // that the knuckle doesn't visibly tear.
        const cc = mech._clawClench || 0;
        const A = 0.30;                                               // full-clench angle
        for (const c of claws) c.b.rotation.x = c.rx + cc * A * c.close;
        // re-seat the mouth plate rigidly on the torso (see build)
        if (mouthOffset) {
          torsoB.updateMatrixWorld(true);
          _mm.multiplyMatrices(torsoB.matrixWorld, mouthOffset);       // want, in world
          _pinv.copy(mouthB.parent.matrixWorld).invert();
          _mm.premultiply(_pinv);                                      // -> parent space
          _mm.decompose(mouthB.position, mouthB.quaternion, mouthB.scale);
        }
      };
    },
  },

  // SAURION — the GLB has big readable arm-claws, so its light cycle
  // alternates sickle KICKS with claw RAKES (right kick, left rake, left
  // kick, right rake); the procedural stays all-kick (def.lightClips).
  // This model's arms are short against its long skull and deep chest, so the
  // shared raptor forms (authored on the procedural body) landed behind the
  // enemy — the jaws arrived, the claws raked the air in front of his own
  // chest. The overrides drive each strike THROUGH a target at the light
  // move's range instead of across the body; see animations.js.
  saurion: {
    lightClips: ['saurionKick1', 'saurionClawL', 'saurionKick2', 'saurionClawR'],
    clipOverrides: {
      saurionClawR: GLB_CLIP_VARIANTS.saurionClawRGlb,
      saurionClawL: GLB_CLIP_VARIANTS.saurionClawLGlb,
      saurionKick1: GLB_CLIP_VARIANTS.saurionKick1Glb,
      saurionKick2: GLB_CLIP_VARIANTS.saurionKick2Glb,
      taunt: GLB_CLIP_VARIANTS.saurionTaunt,
      // the shared victory punches a fist over the head — a raptor cannot,
      // and the claws end up behind him. His is a rear-and-shriek with the
      // claws held where the taunt holds them (see animations.js).
      victory: GLB_CLIP_VARIANTS.saurionVictory,
      block: GLB_CLIP_VARIANTS.saurionBlockGlb,
    },
  },
  // FROGGER — four-arm; the lower arms are procedural-only joints. His gunk
  // guns are HULL mounts on this model (the manifest pins muzzleR/muzzleL to
  // cannon bones), so the ranged shot must not raise a hand: swap in the
  // body-recoil variants, one per cannon (doRanged alternates the side).
  frogger: {
    clipOverrides: {
      shoot: GLB_CLIP_VARIANTS.froggerShootGlb,
      shootL: GLB_CLIP_VARIANTS.froggerShootLGlb,
      taunt: GLB_CLIP_VARIANTS.froggerTaunt,
      block: GLB_CLIP_VARIANTS.froggerBlockGlb,
    },
  },
  // JERRY — the CANNON PODS aim the Bilge Spit. His two pods are modelled
  // splayed outward (the right barrel sits 35° off his facing at rest, the
  // left 29° the other way), so a shot leaving them flew out sideways. The
  // custom rig carries each pod as its own bone (rigs/jerry.rig.js:
  // strutMidL/R, with the pod geometry skinned to them and the muzzle
  // anchors riding them), and the RigAdapter never touches non-game bones —
  // so swing the FIRING pod's bone by exactly its rest splay, which puts its
  // barrel on his facing, and let it drift back after. World.fireRanged
  // deflects the shot along the anchor's LIVE +Z (barrelDeflect), so the goo
  // leaves down whatever line the pod has reached; the burst re-reads it
  // every tick. He alternates sides shot to shot, so the clip tells us which
  // pod is working: `shootL` is the left one, `shoot` the right.
  jerry: {
    // The pods do the aiming, so the CLIP must not: the shared shoot raises an
    // arm (hoisting a claw) and yaws the torso — which carries the torso-bolted
    // pods 13-14° off the fire line even with the pod swung dead ahead. The
    // variants are pitch-only recoil, claws untouched (see animations.js).
    clipOverrides: {
      shoot: GLB_CLIP_VARIANTS.jerryShootGlb,
      shootL: GLB_CLIP_VARIANTS.jerryShootLGlb,
      taunt: GLB_CLIP_VARIANTS.jerryTaunt,
      block: GLB_CLIP_VARIANTS.jerryBlockGlb,
    },
    post(anim, dt, ctx, tgt) {
      // (The light-clip torso damping that used to live here is gone: the
      // shared jab trio it was reshaping has been replaced by bespoke rake
      // clips — jerryRake* in animations.js — authored with a quiet shell.)
      const act = anim.action;
      const bones = anim.mech.rigBones;
      if (!bones) return;                       // stock auto-rig: no pod bones
      const n = act && !act.fadingOut ? act.clip.name : '';
      const firing = n === 'shoot' || n === 'shootL' || ctx.firing;
      const side = n === 'shootL' ? 'L' : 'R';
      for (const [key, name, aim] of [['R', 'strutMidR', -0.620], ['L', 'strutMidL', 0.515]]) {
        const b = bones[name];
        if (!b) continue;
        // AIM IS RELATIVE TO THE POD'S REST, and it has to be stated that way.
        // This used to servo toward absolute 0, which is the same thing ONLY
        // while the bone rests unrotated — true of a custom rig by construction
        // (applyCustomRig builds every bone at identity) and not true of a
        // BAKED model, whose bones carry their rest rotation in the file. Baked,
        // the hook drove jerry's pods off their splay every frame: measured 5.1%
        // of body height of skin deviation and 45% of extra rendered height,
        // with all 15 joints still perfect. Nothing else writes these bones, so
        // the first frame's value IS the rest. Cranky's claws (`c.rx`) have
        // always done it this way.
        if (b.userData.rwRestY === undefined) b.userData.rwRestY = b.rotation.y;
        const want = b.userData.rwRestY + (firing && side === key ? aim : 0);
        // snap ONTO the line (the fire event lands a beat into the clip), ease
        // off it — the pod should look like it recoils back, not springs
        b.rotation.y += (want - b.rotation.y) * (1 - Math.exp(-(want ? 26 : 7) * dt));
      }
    },
  },
  // TRITONE — a long, low ceratopsian wearing clips authored for a humanoid.
  // The shared crouch-and-pitch numbers drive a metre of skull through the
  // road on him (measured: jaw 1.2 units under on the charge, brow 1.2 on the
  // plunge, chin 1.7 in the air tuck), so the moves that do it are swapped for
  // ceratopsian versions — see the TRITONE_* block in animations.js for what
  // changes and why. His OWN clips (tritoneGore/Toss/Brace) are authored for
  // this body already and are not overridden here.
  tritone: {
    clipOverrides: {
      chargeLean: GLB_CLIP_VARIANTS.tritoneChargeGlb,
      heavy: GLB_CLIP_VARIANTS.tritoneSlamGlb,
      groundPound: GLB_CLIP_VARIANTS.tritonePoundGlb,
      land: GLB_CLIP_VARIANTS.tritoneLandGlb,
      landReach: GLB_CLIP_VARIANTS.tritoneLandReachGlb,
      taunt: GLB_CLIP_VARIANTS.tritoneTauntGlb,
      block: GLB_CLIP_VARIANTS.tritoneBlockGlb,
    },
  },
  // NULLBOT — humanoid, direct map (the glitch strobe is material-only). His
  // TAUNT is the one place the corruption is the point: a jitter on the spot,
  // with the body flickering out and back like a bad connection. The flicker is
  // Fighter.glitchTaunt, not a clip track — what breaks up is the render, not
  // the pose.
  nullbot: { clipOverrides: { taunt: GLB_CLIP_VARIANTS.nullbotTaunt } },

  // VULCAN — hand-authored custom rig (src/mechs/rigs/vulcan.rig.js): his bones
  // ARE the game joints, placed where the model's own shoulders/elbows/wrists
  // sit, so the shared clips retarget onto him without reinterpretation. The
  // stack of corrections the Tripo auto-rig needed lives on as `vulcan_tripo`
  // below, for the alt build that still runs that skeleton.
  vulcan: {
    clipOverrides: { taunt: GLB_CLIP_VARIANTS.vulcanTaunt },
    post(anim, dt, ctx, tgt) {
      const raw = anim.action?.clip.name || '';
      const n = anim.action && !anim.action.fadingOut ? raw : '';
      if (ctx.firing || n === 'gatlingLoop' || n === 'gatlingLoopL'
        || n === 'shootLoop' || n === 'shoot') {
        // The trim follows whichever gatling is LEADING — he trades hands in
        // bursts, and the mirrored clip wants the mirrored yaw. Read the raw
        // clip name (fade-out included) so the arm keeps its aim on the way out.
        const left = raw.endsWith('L');
        const sh = left ? tgt.shoulderL : tgt.shoulderR;
        const fire = left ? VULCAN_FIRE.L : VULCAN_FIRE.R;
        // clamp, not set: the clip only ever drives the shoulder PAST level
        sh[0] = Math.max(sh[0], fire.pitch);
        sh[1] = fire.yaw;
      }
      // Read off the RAW clip name so the correction stays on through the
      // fade-out: the arms come down from where they actually were.
      if (anim.action?.clip.name === 'hurricaneSpin') {
        const k = clamp01(tgt.shoulderR[2] / VULCAN_CLIP_ROLL);
        for (let i = 0; i < 3; i++) {
          const v = VULCAN_HURRICANE_ARM[i] * k;
          tgt.shoulderR[i] = v;
          tgt.shoulderL[i] = i ? -v : v;   // mirrored: pitch kept, yaw/roll flipped
        }
      }
    },
  },

  // ---- model VARIANTS (manifest entry.profileKey) ----
  // AEGIS ALT (P1) — carries a great SPEAR in the right hand and banner
  // panels instead of a forearm shield, so it must NOT inherit base aegis's
  // shield-forward guard hook (raising that arm would hoist a banner).
  // Identity for now; a javelin-style ranged reinterpretation belongs here
  // if this model is promoted.

  // VULCAN (retired TRIPO auto-rig, manifest `alt` -> profileKey vulcan_tripo).
  // Every number here was measured against THAT skeleton and means nothing on
  // the custom rig. Twin gatling pods FUSED along the forearms. The shared
  // shootLoop raises the virtual shoulder to horizontal (procedural arms
  // hang straight at bind), but this GLB's bind already carries the arms
  // forward-raised — the retarget stacks the two and the pods aim SKYWARD
  // while the bullet stream flies flat from the muzzle line. While firing,
  // cap the raise so the visible barrels sit ON the fire line (and keep the
  // brace arm level with it — both pods read as blazing forward).
  vulcan_tripo: {
    post(anim, dt, ctx, tgt) {
      const raw = anim.action?.clip.name || '';
      const n = anim.action && !anim.action.fadingOut ? raw : '';
      if (ctx.firing || n === 'gatlingLoop' || n === 'gatlingLoopL'
        || n === 'shootLoop' || n === 'shoot') {
        // Per-side, by whichever gatling is leading (he trades hands in bursts).
        // The pitch is where THAT barrel comes out level: the gun is fused along
        // the hand's own axis, so the arm chain's raise is what pitches the
        // muzzle. Lower and he hoses the dirt, higher and he shoots sky. The
        // right also wants a wrist tuck — this model's right arm hangs OUTBOARD
        // of the shoulder, so its barrel line ran ~10 deg wide once level; the
        // left needs none. Both measured off the rounds' own spawn direction.
        const left = raw.endsWith('L');
        const S = left ? 'L' : 'R', O = left ? 'R' : 'L';
        tgt['shoulder' + S][0] = Math.max(tgt['shoulder' + S][0], left ? -1.28 : -1.13);
        tgt['elbow' + S][0] = Math.max(tgt['elbow' + S][0], -0.15);
        tgt['hand' + S][1] = left ? 0 : -0.44;
        tgt['shoulder' + O][0] = Math.max(tgt['shoulder' + O][0], -0.55);
        tgt['elbow' + O][0] = Math.max(tgt['elbow' + O][0], -0.4);
      }
      // Checked on the raw clip name (not `n`) so the correction stays on
      // through the FADE-OUT: the arms come down from where they actually were
      // instead of popping up to the uncorrected pose on the way out.
      if (anim.action?.clip.name === 'hurricaneSpin') {
        const k = clamp01(tgt.shoulderR[2] / VULCAN_CLIP_ROLL);
        for (let i = 0; i < 3; i++) {
          const v = VULCAN_TRIPO_HURRICANE_ARM[i] * k;
          tgt.shoulderR[i] = v;
          tgt.shoulderL[i] = i ? -v : v;   // mirrored: pitch kept, yaw/roll flipped
        }
      }
    },
  },
};

export function profileFor(id) { return GLB_ANIM[id] || null; }
