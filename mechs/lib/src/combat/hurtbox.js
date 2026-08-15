// HURTBOX — the per-mech collision shape combat actually hits.
//
// WHY THIS EXISTS. Every mech used to be one sphere: `hitRadius = 1.7 *
// body.scale`, centred at 55% of a dims-derived height. That is fine for
// blast falloff, and wrong for everything that should read as "did that
// blow land on him?" — a GLB body is whatever the artist modelled, and its
// silhouette has nothing to do with 1.7 units. Skinny mechs (viper,
// wraith) were hit by swings that visibly missed; wide ones (cranky,
// frogger, colossus) had shots pass through a shoulder. Nothing followed
// the ANIMATION either: a mech lying flat in a knockdown, or lunging with
// one arm out, kept a fat upright ball around its origin.
//
// WHAT THIS IS. A small set of BONE-BOUND CAPSULES measured off the mech's
// actual rendered geometry, on both routes:
//   • GLB    — skinned vertices bucketed by their dominant bone, folded up
//              the bone chain to the nearest mapped semantic joint
//              (rigadapter's JOINT_ORDER, via mech.boneMap).
//   • proc   — the merged meshes parented under each rig joint.
// Each capsule is stored in its bone's LOCAL frame, so it is pose-free at
// build time and rides the rig for free at runtime: pose the mech, read
// two world points per part, done. A launched rocket fist (whose joint is
// scaled to ~0) collapses its own capsule, which is exactly right.
//
// WHAT IT IS NOT. `Fighter.hitRadius` is untouched and still owns the
// broad-phase / AoE falloff work it always did — blast radii, crowd
// sweeps, camera framing. Swapping THOSE for capsules would re-tune two
// dozen moves for no accuracy anyone can see. Capsules are used where a
// player can actually tell: melee strikes, bullets and beams.
//
// MEASUREMENT IS ROBUST, NOT EXACT. Radii are 85th-percentile distances,
// not maxima, and each part first culls the outliers that ride along with
// a bone but are not part of it (a sword in the hand, a tail weighted to
// the hips). A capsule is a body region, not a convex hull.
import * as THREE from 'three';

// ---------------------------------------------------------------------
// GAMEPLAY TUNING — how generous a strike is.
//
// A capsule body is a much smaller target than the old ball, and the old
// melee test was extremely forgiving on top of that: it put a sphere of
// `reach*0.8 + victim.hitRadius` at `reach*0.75` in front of the attacker,
// which for a stock 3.5-reach mech reached ~7 units from his own origin —
// nearly two body-lengths, in a cone he did not have to be facing well.
// Landing the strike ON THE FIST would have cut that roughly in half and
// quietly nerfed every melee mech (and the AI, which commits to a swing at
// `light.range * scale + 1.2`).
//
// So the numbers below were picked by running fights with BOTH tests live
// (tools/hitprobe.mjs) and pushing the volume up until the connect rate
// stopped responding — past that point the remaining disagreements are not
// near-misses, they are swings thrown two metres wide of the target that
// the old ball caught anyway.
//
// A blow is modelled as the STRIKING LIMB, SWEPT: a capsule from the elbow
// (or knee) to a little past the fist (or foot), not a ball hanging off the
// knuckles. That is more honest — a punch thrown across the body no longer
// clobbers whoever happens to be in front — and it keeps the range, which a
// sphere at the fist alone does not: the AI commits to a swing at
// `light.range * scale + 1.2` and a fist simply is not that far forward.
// OVERSHOOT stands in for the arc the limb crosses during the impact
// window, which one sampled frame cannot see.
//
// WHAT THIS COSTS, measured over three melee matchups and 264 swings: the
// old test connected on 61% of swings, this one on 51%, and the swings it
// drops are overwhelmingly ones where the striking limb ended up beside or
// behind the target. Fighter.strikeVolume's vertical assist covers the one
// case that is NOT the animation's fault (a heavyweight's fist finishing
// over a lightweight's head). Re-run the probe after touching any of this.
export const MELEE = {
  SWING_R: 0.24,    // strike capsule radius, × the move's reach
  SWING_MIN: 0.45,  // floor on that radius, × attacker scale
  OVERSHOOT: 0.70,  // extension past the fist along the strike line, × reach
  PAD: 0.28,        // extra slack on the victim's capsules, × victim scale
  // Ceiling on the vertical strike assist (fighter.strikeVolume): the most a
  // swing may be slid up or down to reach a target it finished clear of,
  // × the ATTACKER's height. It exists to close the head-height gap between
  // a heavyweight and a lightweight — measured worst case is titanus'
  // haymaker finishing 2.8 units over viper's crown, so 0.45 (3.4 on
  // titanus) covers it with room. Uncapped, this same line slid a swing
  // however far it took, which let a grounded mech punch someone 40 units
  // up in the air.
  ASSIST_Y: 0.45,
  // ---- WHERE AN AUTO-AIMED BLOW WANTS TO ARRIVE (fighter.elevateStrikeAt).
  // Fractions of the TARGET's height, feet = 0: the band a punch, kick or
  // bite is steered into while the swing is live. It starts at the CHEST and
  // ends at the crown, deliberately — a blow that finishes at a target's
  // shins or waist reads as a body shot at best and a whiff at worst, and the
  // one thing a fight has to sell is that the fist went where the fighter was
  // looking. A blow already arriving inside the band is left exactly as the
  // clip authored it, so head-hunting hooks and chest-height jabs keep their
  // shape and only the ones sailing over the crown or sweeping the floor move.
  AIM_LO: 0.58,     // chest
  AIM_HI: 0.95,     // crown
  // Ceiling on the elevation the aim servo may add at the shoulder/thigh/
  // torso (radians). Generous enough to close a heavyweight-vs-lightweight
  // height gap, small enough that the pose still reads as the authored swing.
  AIM_PITCH: 0.5,
};

// Bullets and beams are aimed, so they get much less slack than a swing —
// just enough that a shot grazing an arm still counts.
export const SHOT_PAD = 0.35;   // × victim scale

// ---------------------------------------------------------------------
// The part table. Each entry is `[name, boneA, boneB]`; boneB === null
// means a terminal blob measured on boneA alone (head, fists, feet) and
// fitted along its own longest axis, so a foot reads as a foot and not as
// a ball at the ankle.
// ---------------------------------------------------------------------
export const PART_TABLE = [
  ['pelvis', 'hips', 'torso'],
  ['chest', 'torso', 'head'],
  ['head', 'head', null],
  ['upperArmL', 'shoulderL', 'elbowL'],
  ['foreArmL', 'elbowL', 'handL'],
  ['handL', 'handL', null],
  ['upperArmR', 'shoulderR', 'elbowR'],
  ['foreArmR', 'elbowR', 'handR'],
  ['handR', 'handR', null],
  ['thighL', 'thighL', 'kneeL'],
  ['shinL', 'kneeL', 'ankleL'],
  ['footL', 'ankleL', null],
  ['thighR', 'thighR', 'kneeR'],
  ['shinR', 'kneeR', 'ankleR'],
  ['footR', 'ankleR', null],
];

// The four striking extremities, in the order strike-limb auto-detection
// considers them (see pickStrikeLimb).
const LIMB_PARTS = ['handL', 'handR', 'footL', 'footR'];
// the limb segment a blow is swept along: extremity -> the part whose bone
// is the joint it swings from (elbow / knee)
const STRIKE_ARM = {
  handL: 'foreArmL', handR: 'foreArmR', footL: 'shinL', footR: 'shinR',
};

// ---------------------------------------------------------------------
// measurement tuning
// ---------------------------------------------------------------------
const SAMPLE_TARGET = 24000;  // vertices sampled across the whole body
const RADIUS_PCTILE = 0.85;   // "the flesh", ignoring spikes and antennae
// A segment capsule only owns vertices that project onto its own span, plus
// this much overhang at each cap (as a fraction of the segment, and never
// less than the fitted radius — see fitSegment). This is what stops a tail
// or a cape weighted to the hips from inflating the pelvis capsule.
const SPAN_OVER = 0.35;
// A terminal blob drops vertices further than this multiple of the median
// distance from the bone — a hand holding a two-metre sword keeps a fist.
const BLOB_OUTLIER = 2.6;
const MIN_R = 0.05;           // never produce a degenerate zero capsule
// A two-joint capsule this much shorter than its own radius is a ball, not
// a rod: see fitPart.
const DEGENERATE_SEG = 0.3;

// ---------------------------------------------------------------------
// scratch
// ---------------------------------------------------------------------
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _seg = new THREE.Vector3();
const _rel = new THREE.Vector3();

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(sorted.length * p) - 1))];
}

// uniform-ish world scale of a node, read off its world matrix
function worldScale(node) {
  const e = node.matrixWorld.elements;
  return Math.hypot(e[0], e[1], e[2]);
}

// ---------------------------------------------------------------------
// SPEC BUILD — bucket vertices, fit one capsule per part.
// A spec is plain data: [{ name, bone, p0:[x,y,z], p1:[x,y,z], r }] with
// p0/p1/r in the BONE'S LOCAL units (r converted to world at fit time via
// that bone's world scale, so it is already in metres).
// ---------------------------------------------------------------------

// Fit one capsule from a bucket of bone-local points. EVERYTHING here —
// points, tip, resulting radius — stays in the BONE'S LOCAL units; the
// bone's own world scale is applied once per frame in Hurtbox.refresh, and
// applying it here too was a real bug (radii came out ×8 on models whose
// native units are small, which made every mech a barn door).
// `tip` (bone-local) is the far joint for a segment part, or null for a blob.
// `minR` is the world-space floor MIN_R expressed in those local units.
// TWO CANDIDATES PER PART, and the one that describes the vertex cloud
// better wins.
//   • SEGMENT — a capsule drawn between the two joints. Right for a limb:
//     it is anchored at both ends, so it tracks a bend exactly.
//   • BLOB — a capsule along the cloud's own longest axis. Right for a body
//     region that is wide and shallow (a crab's shell is 5m across and 1m
//     thick: a cylinder around its short spine has to swell to 3m to contain
//     it, and the mech ends up a BIGGER target than the ball this replaced).
// The choice is made on coverage first, then tightness — never on shape
// preference, because the rigs disagree about what a "shoulder" is. Some
// mechs carry a whole pincer on a bone pair 0.1m apart, where the segment
// fit describes almost nothing and the blob fit describes the claw.
function fitPart(pts, tip, minR) {
  if (pts.length < 6) return null;
  const blob = fitBlob(pts, minR);
  if (!tip) return blob;
  const seg = fitSegment(pts, tip, minR);
  if (!seg) return blob;
  if (!blob) return seg;
  // DEGENERATE SEGMENT: when the two joints sit closer together than the
  // fitted radius, the segment carries no shape information at all — it is
  // a ball, and its radius is just "how far the furthest flesh is". The
  // procedural rig puts hips and torso 0.18 apart, so saurion's whole
  // abdomen AND tail were being described as one 3.9-radius sphere around
  // his waist. The free fit lays a capsule ALONG that mass instead.
  // The threshold is deliberately low: a torso capsule is legitimately about
  // as wide as it is long, and only a genuinely collapsed joint pair (ratio
  // ~0.05 on the rigs here, against ~0.9 for a real torso) should give up
  // the two-joint anchoring that makes a capsule track a bend.
  if (_v.set(seg.p1[0], seg.p1[1], seg.p1[2]).length() < DEGENERATE_SEG * seg.r) return blob;
  const cb = coverage(blob, pts), cs = coverage(seg, pts);
  if (cb > cs + 0.05) return blob;                     // clearly better described
  if (cb > cs - 0.05 && blob.r < seg.r * 0.8) return blob; // as good, and tighter
  return seg;
}

// fraction of the bucket inside a candidate capsule
function coverage(fit, pts) {
  _v.set(fit.p0[0], fit.p0[1], fit.p0[2]);
  _v2.set(fit.p1[0], fit.p1[1], fit.p1[2]);
  let n = 0;
  for (const p of pts) if (distPointSeg(p.x, p.y, p.z, _v, _v2) <= fit.r) n++;
  return n / pts.length;
}

function fitSegment(pts, tip, minR) {
  const L = tip.length();
  if (L < 1e-4) return null;
  const dir = _v.copy(tip).divideScalar(L);
  // Span culling is what stops a tail weighted to the hips from inflating
  // the pelvis, but a window measured only as a FRACTION of the segment
  // collapses on rigs whose joints nearly coincide. So: measure the spread
  // once with no cull, then allow that much overhang past each cap.
  let pad = 0;
  for (let pass = 0; pass < 2; pass++) {
    const perp = [];
    for (const p of pts) {
      const t = p.dot(dir);
      if (t < -SPAN_OVER * L - pad || t > L + SPAN_OVER * L + pad) continue;
      perp.push(_v2.copy(p).addScaledVector(dir, -t).length());
    }
    if (perp.length < 6) return null;
    perp.sort((a, b) => a - b);
    const r = Math.max(minR, percentile(perp, RADIUS_PCTILE));
    if (pass === 0) { pad = r; continue; }
    return { p0: [0, 0, 0], p1: [tip.x, tip.y, tip.z], r };
  }
  return null;
}

// Free fit: drop the outliers, then run the capsule along the longest axis
// of what's left, so a foot stays a foot and a shell stays a shell.
function fitBlob(pts, minR) {
  const d = pts.map((p) => p.length()).sort((a, b) => a - b);
  const cut = percentile(d, 0.5) * BLOB_OUTLIER + 1e-3;
  const keep = pts.filter((p) => p.length() <= cut);
  if (keep.length < 6) return null;
  // percentile extents, not min/max — one stray spike must not set the size
  const xs = keep.map((p) => p.x).sort((a, b) => a - b);
  const ys = keep.map((p) => p.y).sort((a, b) => a - b);
  const zs = keep.map((p) => p.z).sort((a, b) => a - b);
  const lo = 1 - RADIUS_PCTILE;
  const span = (s) => [percentile(s, lo), percentile(s, RADIUS_PCTILE)];
  const [x0, x1] = span(xs), [y0, y1] = span(ys), [z0, z1] = span(zs);
  const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  const ext = [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2];
  const axis = ext[0] >= ext[1] && ext[0] >= ext[2] ? 0 : (ext[1] >= ext[2] ? 1 : 2);
  const other = ext.filter((_, i) => i !== axis);
  // radius spans the two SHORT axes; the long one becomes capsule length
  const r = Math.max(minR, (other[0] + other[1]) * 0.5);
  const half = Math.max(0, ext[axis] - r);
  const a = [...c], b = [...c];
  a[axis] -= half; b[axis] += half;
  return { p0: a, p1: b, r };
}

// GLB: bucket skinned vertices by their dominant bone, folded up to the
// nearest MAPPED semantic bone, expressed in that bone's bind-local frame.
// ---------------------------------------------------------------------
// EXTRA REGIONS — the parts of a body the 15-joint table cannot name.
//
// PART_TABLE describes a humanoid, and bucketsFromSkin walks UP the bone
// chain until it finds a game joint, so anything hanging off a non-game bone
// is folded into its nearest named ancestor. On a humanoid that is right (a
// finger belongs to the hand). On a body that is not a humanoid it is a
// disaster: cranky's four extra crab legs all roll up into `hips`, so the
// pelvis capsule is fitted to a bucket containing six legs' worth of
// geometry — it cannot contain them (they point four different ways) and it
// is bloated by trying. Measured, half his rendered body sat outside every
// capsule, which is exactly what "my blows go through him" feels like.
//
// So: any bone carrying a real share of the mesh that the table cannot name
// gets its OWN capsule, ON TOP OF the ancestor's. Purely ADDITIVE — the
// ancestor's bucket is left exactly as it was, so every existing capsule fits
// identically and no shipped mech's hitbox shrinks. Taking the geometry away
// from the ancestor instead was tried and measured: it shrinks the big body
// capsules onto what is left, and containment fell on nine mechs (wraith
// 62%->47%, frogger 81%->63%) to buy cranky ten points. Overlap is free here;
// a hole is not. Named `x:<bone>` so nothing keyed on part names (strike
// limbs, the torso clamp) can collide, and derived from the skin, so a new
// rig with new bones is covered the day it lands.
const EXTRA_MIN_SHARE = 0.01;   // of sampled vertices, per bone
const EXTRA_MAX = 14;           // don't turn a finger rig into 60 capsules
const EXTRA_R_CAP = 0.5;        // extra capsule radius ceiling, x the torso's

function extraBones(mech) {
  const named = new Set(Object.values(mech.boneMap || {}));
  const skins = [];
  mech.group.traverse((o) => { if (o.isSkinnedMesh) skins.push(o); });
  if (!skins.length) return [];
  const count = new Map();
  let total = 0;
  let all = 0;
  for (const sk of skins) all += sk.geometry?.attributes?.position?.count || 0;
  const stride = Math.max(1, Math.floor(all / SAMPLE_TARGET));
  for (const sk of skins) {
    const pos = sk.geometry?.attributes?.position;
    const ji = sk.geometry?.attributes?.skinIndex;
    const wt = sk.geometry?.attributes?.skinWeight;
    if (!pos || !ji || !wt) continue;
    const bones = sk.skeleton.bones;
    for (let i = 0; i < pos.count; i += stride) {
      let b = ji.getX(i), w = wt.getX(i);
      if (wt.getY(i) > w) { w = wt.getY(i); b = ji.getY(i); }
      if (wt.getZ(i) > w) { w = wt.getZ(i); b = ji.getZ(i); }
      if (wt.getW(i) > w) { w = wt.getW(i); b = ji.getW(i); }
      total++;
      const bone = bones[b];
      if (!bone || named.has(bone)) continue;
      count.set(bone, (count.get(bone) || 0) + 1);
    }
  }
  if (!total) return [];
  return [...count.entries()]
    .filter(([, n]) => n / total >= EXTRA_MIN_SHARE)
    .sort((a, b) => b[1] - a[1])
    .slice(0, EXTRA_MAX)
    .map(([bone]) => bone);
}

// Vertices whose dominant bone IS one of `bones`, in that bone's local frame.
// Same bind-space transform as bucketsFromSkin; no walking up the chain,
// because here the bone is the region.
function bucketsForBones(mech, bones) {
  const out = new Map();
  if (!bones.length) return out;
  const want = new Map(bones.map((b) => [b, `x:${b.name}`]));
  const skins = [];
  mech.group.traverse((o) => { if (o.isSkinnedMesh) skins.push(o); });
  let all = 0;
  for (const sk of skins) all += sk.geometry?.attributes?.position?.count || 0;
  const stride = Math.max(1, Math.floor(all / SAMPLE_TARGET));
  for (const sk of skins) {
    const pos = sk.geometry?.attributes?.position;
    const ji = sk.geometry?.attributes?.skinIndex;
    const wt = sk.geometry?.attributes?.skinWeight;
    if (!pos || !ji || !wt) continue;
    const sbones = sk.skeleton.bones;
    const inv = sk.skeleton.boneInverses;
    const idxOf = new Map(sbones.map((b, i) => [b, i]));
    for (let i = 0; i < pos.count; i += stride) {
      let b = ji.getX(i), w = wt.getX(i);
      if (wt.getY(i) > w) { w = wt.getY(i); b = ji.getY(i); }
      if (wt.getZ(i) > w) { w = wt.getZ(i); b = ji.getZ(i); }
      if (wt.getW(i) > w) { w = wt.getW(i); b = ji.getW(i); }
      const name = want.get(sbones[b]);
      if (!name) continue;
      const oi = idxOf.get(sbones[b]);
      if (oi === undefined) continue;
      _v.fromBufferAttribute(pos, i).applyMatrix4(sk.bindMatrix).applyMatrix4(inv[oi]);
      if (!Number.isFinite(_v.x + _v.y + _v.z)) continue;
      let arr = out.get(name);
      if (!arr) out.set(name, arr = []);
      arr.push(_v.clone());
    }
  }
  return out;
}

function bucketsFromSkin(mech) {
  const buckets = new Map();   // joint name -> Vector3[] (bone-local)
  const semOf = new Map();     // THREE.Bone -> joint name
  for (const [j, b] of Object.entries(mech.boneMap || {})) if (b) semOf.set(b, j);
  if (!semOf.size) return buckets;

  const skins = [];
  mech.group.traverse((o) => { if (o.isSkinnedMesh) skins.push(o); });
  if (!skins.length) return buckets;
  let total = 0;
  for (const sk of skins) total += sk.geometry?.attributes?.position?.count || 0;
  const stride = Math.max(1, Math.floor(total / SAMPLE_TARGET));

  for (const sk of skins) {
    const pos = sk.geometry?.attributes?.position;
    const ji = sk.geometry?.attributes?.skinIndex;
    const wt = sk.geometry?.attributes?.skinWeight;
    if (!pos || !ji || !wt) continue;
    const bones = sk.skeleton.bones;
    const inv = sk.skeleton.boneInverses;
    // per skeleton index: which semantic joint owns it, and that joint's
    // own skeleton index (whose boneInverse puts the vertex in its frame)
    const owner = new Array(bones.length).fill(null);
    const ownerIdx = new Array(bones.length).fill(-1);
    const idxOf = new Map(bones.map((b, i) => [b, i]));
    for (let i = 0; i < bones.length; i++) {
      let n = bones[i];
      while (n && !semOf.has(n)) n = n.parent;
      if (!n) continue;
      const oi = idxOf.get(n);
      if (oi === undefined) continue;
      owner[i] = semOf.get(n);
      ownerIdx[i] = oi;
    }
    for (let i = 0; i < pos.count; i += stride) {
      let b = ji.getX(i), w = wt.getX(i);
      if (wt.getY(i) > w) { w = wt.getY(i); b = ji.getY(i); }
      if (wt.getZ(i) > w) { w = wt.getZ(i); b = ji.getZ(i); }
      if (wt.getW(i) > w) { w = wt.getW(i); b = ji.getW(i); }
      const name = owner[b];
      if (!name) continue;
      // boneInverses[k] * bindMatrix * v  ==  v in bone k's local frame at
      // bind — pose-independent, which is why this can run at any time
      _v.fromBufferAttribute(pos, i).applyMatrix4(sk.bindMatrix).applyMatrix4(inv[ownerIdx[b]]);
      // a single non-finite vertex (some hand-built lathe profiles produce
      // them) would poison every percentile downstream
      if (!Number.isFinite(_v.x + _v.y + _v.z)) continue;
      let arr = buckets.get(name);
      if (!arr) buckets.set(name, arr = []);
      arr.push(_v.clone());
    }
  }
  return buckets;
}

// Procedural: geometry is rigidly parented under the rig joints, so a
// joint owns every mesh below it that no OTHER semantic joint claims first.
function bucketsFromRig(mech) {
  const buckets = new Map();
  const semantic = new Set(PART_TABLE.flatMap(([, a, b]) => (b ? [a, b] : [a])));
  const nodes = [];
  for (const j of semantic) if (mech.joints[j]) nodes.push([j, mech.joints[j]]);
  if (!nodes.length) return buckets;
  const claimed = new Set(nodes.map(([, n]) => n));
  let total = 0;
  const meshesFor = new Map();
  for (const [name, node] of nodes) {
    const list = [];
    const walk = (o, isRoot) => {
      if (!isRoot && claimed.has(o)) return;      // belongs to a deeper joint
      if ((o.isMesh || o.isSkinnedMesh) && o.geometry?.attributes?.position) {
        list.push(o);
        total += o.geometry.attributes.position.count;
      }
      for (const c of o.children) walk(c, false);
    };
    walk(node, true);
    meshesFor.set(name, list);
  }
  const stride = Math.max(1, Math.floor(total / SAMPLE_TARGET));
  for (const [name, node] of nodes) {
    const list = meshesFor.get(name);
    if (!list.length) continue;
    const inv = _m.copy(node.matrixWorld).invert().clone();
    const arr = [];
    for (const o of list) {
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i += stride) {
        _v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
        if (!Number.isFinite(_v.x + _v.y + _v.z)) continue;  // see bucketsFromSkin
        arr.push(_v.clone());
      }
    }
    if (arr.length) buckets.set(name, arr);
  }
  return buckets;
}

/**
 * Measure a built mech and return its capsule spec (plain data — safe to
 * cache and share between clones of the same model).
 */
function measureHurtbox(mech) {
  mech.group.updateWorldMatrix(true, true);
  // WHICH GEOMETRY IS THE BODY. A GLB's shell is one skinned mesh bound to
  // bones, so its regions are found by walking the SKIN weights; a procedural
  // mech is a pile of meshes parented to rig joints, so its regions are found by
  // walking the RIG. The test is the shape of the model, not the file it came
  // from — the reference mannequin (mechs/mannequin.js) is skinned to the same
  // 15 bones without being a GLB, and measures like one. No shipped mech changes
  // hands: `boneMap` only exists on the GLB path.
  const skinned = mech.isGLB || !!(mech.boneMap && mech.skeleton);
  // regions the 15-joint table cannot name (see extraBones) — GLB path only:
  // a procedural body has no bones but its own rig joints
  const extra = skinned ? extraBones(mech) : [];
  const byName = new Map(extra.map((b) => [`x:${b.name}`, b]));
  const node = (j) => (byName.get(j)
    || (skinned ? (mech.boneMap?.[j] || null) : (mech.joints?.[j] || null)));
  const buckets = skinned ? bucketsFromSkin(mech) : bucketsFromRig(mech);
  const exBuckets = skinned ? bucketsForBones(mech, extra) : new Map();
  const spec = [];
  for (const [name, aName, bName] of PART_TABLE) {
    const a = node(aName);
    if (!a) continue;
    const pts = buckets.get(aName);
    if (!pts || pts.length < 6) continue;
    let tip = null;
    if (bName) {
      const b = node(bName);
      if (!b) continue;
      // far joint expressed in A's local frame
      tip = a.worldToLocal(b.getWorldPosition(_v3.set(0, 0, 0)).clone());
    }
    const fit = fitPart(pts, tip, MIN_R / Math.max(1e-6, worldScale(a)));
    if (fit) spec.push({ name, bone: aName, ...fit, scale: worldScale(a) });
  }
  // …and one capsule per extra region, along the bone's own segment (to its
  // first child) or as a terminal blob if it ends there — the same fit the
  // table's parts get, just for a bone nobody could name in advance.
  for (const b of extra) {
    const name = `x:${b.name}`;
    const pts = exBuckets.get(name);
    if (!pts || pts.length < 6) continue;
    const child = b.children?.find((c) => c.isBone) || null;
    const tip = child ? b.worldToLocal(child.getWorldPosition(_v3.set(0, 0, 0)).clone()) : null;
    const fit = fitPart(pts, tip, MIN_R / Math.max(1e-6, worldScale(b)));
    if (fit) spec.push({ name, bone: name, ...fit, scale: worldScale(b) });
  }
  // NO LIMB IS FATTER THAN THE BODY IT HANGS OFF. Auto-rigged GLBs
  // occasionally map a hand or forearm bone to something across the model
  // (nova's staff), and everything welded to that bone then reads as arm:
  // one 3.4-radius forearm turned the whole mech into a barn door. The
  // torso is the honest upper bound for what a limb can be, and clamping
  // there costs nothing on the rigs that map cleanly.
  const torso = Math.max(...spec.filter((s) => s.name === 'chest' || s.name === 'pelvis')
    .map((s) => s.r * s.scale), 0);
  if (torso > 0) {
    for (const s of spec) {
      if (s.name === 'chest' || s.name === 'pelvis' || s.name === 'head') continue;
      // an EXTRA region is an appendage by definition — a crab leg, a claw
      // jaw, a tail link — so it gets a tighter ceiling than a limb does.
      // Without it the ± r box around a capsule out at the end of a spear
      // (aegis) or a fourth arm (frogger) is what the bloat metric sees, and
      // both went from bad to worse; at half the torso they land back where
      // they started while keeping the containment the extras bought.
      const cap = s.name.startsWith('x:') ? torso * EXTRA_R_CAP : torso;
      s.r = Math.min(s.r, cap / s.scale);
    }
  }
  for (const s of spec) delete s.scale;
  return spec;
}

// ---------------------------------------------------------------------
// RUNTIME
// ---------------------------------------------------------------------

const _specCache = new Map();

function specKey(mech) {
  // gltf.js's glbKey covers every manifest field that moves a bone, so the
  // primary and `alt` builds of one mech never share measurements even when
  // they are the same GLB file wearing different rigs.
  return mech.def.id + (mech.isGLB ? ':glb:' + (mech.glbKey || '')
    : mech.isMannequin ? ':mannequin' : ':proc');
}

/**
 * Build (or reuse) the hurtbox for a mech. Returns null when the model is
 * too unusual to measure — callers fall back to the legacy sphere.
 */
export function buildHurtbox(mech) {
  let spec = _specCache.get(specKey(mech));
  if (!spec) {
    try {
      spec = measureHurtbox(mech);
    } catch (e) {
      console.warn(`[hurtbox] ${mech.def.id}: measure failed (${e.message}) — legacy sphere`);
      spec = [];
    }
    _specCache.set(specKey(mech), spec);
  }
  // 3 capsules is the floor for "this is a body, not noise"
  if (spec.length < 3) return null;
  return new Hurtbox(mech, spec);
}

export class Hurtbox {
  constructor(mech, spec) {
    this.mech = mech;
    this.spec = spec;
    this.parts = [];
    this.byName = new Map();
    // `x:` regions name a bone that is NOT in boneMap, so resolve them off the
    // skinned meshes' own skeletons — mech.skeleton only exists on the
    // mannequin path, and using it here silently dropped every extra capsule.
    const extraNode = new Map();
    mech.group.traverse((o) => {
      if (!o.isSkinnedMesh || !o.skeleton) return;
      for (const b of o.skeleton.bones) if (b?.name) extraNode.set(`x:${b.name}`, b);
    });
    for (const s of spec) {
      const node = extraNode.get(s.bone)
        || ((mech.isGLB || (mech.boneMap && mech.skeleton))
          ? mech.boneMap?.[s.bone] : mech.joints?.[s.bone]);
      if (!node) continue;
      const part = {
        name: s.name, node,
        l0: new THREE.Vector3(...s.p0), l1: new THREE.Vector3(...s.p1), r0: s.r,
        // world-space, refreshed per frame
        a: new THREE.Vector3(), b: new THREE.Vector3(), r: s.r,
      };
      this.parts.push(part);
      this.byName.set(s.name, part);
    }
    this._stamp = -1;
  }

  /**
   * Refresh world-space capsules. Cheap; skipped if already done at
   * `stamp` (pass world.time so every query in a frame shares one pass).
   * `r0` is in the bone's local units — the bone's world scale, applied
   * here, is what puts the capsule in metres, and it is also what collapses
   * a launched rocket fist's capsule along with its joint.
   */
  refresh(stamp = null) {
    if (stamp !== null && stamp === this._stamp) return this;
    this._stamp = stamp;
    for (const p of this.parts) {
      p.node.updateWorldMatrix(true, false);
      p.a.copy(p.l0).applyMatrix4(p.node.matrixWorld);
      p.b.copy(p.l1).applyMatrix4(p.node.matrixWorld);
      p.r = p.r0 * worldScale(p.node);
    }
    return this;
  }

  part(name) { return this.byName.get(name) || null; }

  /** World midpoint of a named part (out is written and returned), or null. */
  partPoint(name, out, stamp = null) {
    const p = this.refresh(stamp).byName.get(name);
    if (!p) return null;
    return out.copy(p.a).add(p.b).multiplyScalar(0.5);
  }

  /**
   * The swept segment a blow from `limb` occupies: `out0` at the joint it
   * swings from (elbow for a punch, knee for a kick), `out1` at the
   * extremity, pushed `overshoot` further along the same line to stand in
   * for the arc the limb crosses during the impact window.
   * Returns false when this rig has no such limb.
   */
  strikeSegment(limb, overshoot, out0, out1, stamp = null) {
    this.refresh(stamp);
    const tip = this.byName.get(limb);
    if (!tip) return false;
    out1.copy(tip.a).add(tip.b).multiplyScalar(0.5);
    const arm = this.byName.get(STRIKE_ARM[limb]);
    if (arm) arm.node.getWorldPosition(out0); else out0.copy(out1);
    if (overshoot > 0) {
      _rel.copy(out1).sub(out0);
      const L = _rel.length();
      if (L > 1e-3) out1.addScaledVector(_rel, overshoot / L);
    }
    return true;
  }

  /**
   * Closest approach of a sphere to the body.
   * `off` shifts the query point by (dx,dy,dz) — the caller's seam-wrap
   * correction, so this never needs to know about world wrapping.
   * Returns { part, d, r } for the deepest overlap, or null.
   */
  hitSphere(cx, cy, cz, radius, pad = 0, stamp = null) {
    this.refresh(stamp);
    let best = null, bestSlack = 0;
    for (const p of this.parts) {
      const d = distPointSeg(cx, cy, cz, p.a, p.b);
      const slack = (p.r + radius + pad) - d;
      if (slack > 0 && (!best || slack > bestSlack)) { best = p; bestSlack = slack; }
    }
    return best ? { part: best, depth: bestSlack, d: best.r + radius + pad - bestSlack } : null;
  }

  /** Same, for a swept segment (bullets, beams). */
  hitSegment(p0, p1, radius, pad = 0, stamp = null) {
    this.refresh(stamp);
    let best = null, bestSlack = 0, bestT = 0;
    for (const p of this.parts) {
      const { d, t } = distSegSeg(p0, p1, p.a, p.b);
      const slack = (p.r + radius + pad) - d;
      if (slack > 0 && (!best || slack > bestSlack)) { best = p; bestSlack = slack; bestT = t; }
    }
    return best ? { part: best, depth: bestSlack, t: bestT } : null;
  }
}

// ---------------------------------------------------------------------
// geometry helpers
// ---------------------------------------------------------------------

/** Distance from a point to a segment. */
function distPointSeg(x, y, z, a, b) {
  _seg.copy(b).sub(a);
  const ll = _seg.lengthSq();
  _rel.set(x - a.x, y - a.y, z - a.z);
  const t = ll > 1e-9 ? Math.min(1, Math.max(0, _rel.dot(_seg) / ll)) : 0;
  return _rel.addScaledVector(_seg, -t).length();
}

const _u = new THREE.Vector3(), _w = new THREE.Vector3(), _dv = new THREE.Vector3();
/**
 * Closest distance between two segments (p0->p1 and q0->q1), plus the
 * parameter t along the FIRST one — callers use t to order bullet hits.
 * Standard clamped-parameters solution; the parallel case falls out of the
 * denominator guard.
 */
function distSegSeg(p0, p1, q0, q1) {
  _u.copy(p1).sub(p0);
  _v.copy(q1).sub(q0);
  _w.copy(p0).sub(q0);
  const a = _u.dot(_u), b = _u.dot(_v), c = _v.dot(_v);
  const d = _u.dot(_w), e = _v.dot(_w);
  const den = a * c - b * b;
  let s, t;
  if (den < 1e-9) { s = 0; t = c > 1e-9 ? e / c : 0; } else {
    s = (b * e - c * d) / den;
    t = (a * e - b * d) / den;
  }
  s = Math.min(1, Math.max(0, s));
  t = Math.min(1, Math.max(0, t));
  // re-clamp the other parameter against the clamped one (one pass is
  // enough for the accuracy a hitbox needs)
  t = c > 1e-9 ? Math.min(1, Math.max(0, (b * s + e) / c)) : 0;
  s = a > 1e-9 ? Math.min(1, Math.max(0, (b * t - d) / a)) : 0;
  _dv.copy(_w).addScaledVector(_u, s).addScaledVector(_v, -t);
  return { d: _dv.length(), t: s };
}

// ---------------------------------------------------------------------
// FIGHTER-LEVEL ENTRY POINTS
//
// One entry point, taking a SWEPT SEGMENT: a melee blow is the striking
// limb, a bullet is its step through the frame, a beam is its whole length,
// and a stationary sphere is just a segment of zero length. The query is
// already corrected for the arena seam (callers pass world-space points
// wrapped toward the victim), and it falls back to the legacy `hitRadius`
// ball when a mech has no measurable hurtbox — an unrigged model must never
// become unhittable.
// ---------------------------------------------------------------------

/** Segment vs body. Returns { part, depth, t } | null. */
export function bodyHitSegment(f, p0, p1, radius, pad = 0, stamp = null) {
  const hb = f.hurtbox;
  if (!hb) {
    const c = f.center(_v3);
    const d = distPointSeg(c.x, c.y, c.z, p0, p1);
    const rr = f.hitRadius + radius;
    if (d >= rr) return null;
    _seg.copy(p1).sub(p0);
    const ll = _seg.lengthSq();
    const t = ll > 1e-9 ? Math.min(1, Math.max(0, _v2.copy(c).sub(p0).dot(_seg) / ll)) : 0;
    return { part: null, depth: rr - d, t };
  }
  return hb.hitSegment(p0, p1, radius, pad * f.scale, stamp);
}

// ---------------------------------------------------------------------
// STRIKE LIMB — which hand or foot is throwing the blow.
// ---------------------------------------------------------------------

// When a clip names a strike limb this rig has no capsule for, these are the
// stand-ins, nearest joint first: still the same limb, just further up it.
const LIMB_FALLBACK = {
  handL: ['foreArmL', 'upperArmL'],
  handR: ['foreArmR', 'upperArmR'],
  footL: ['shinL', 'thighL'],
  footR: ['shinR', 'thighR'],
};

/**
 * Resolve the limb a clip strikes with.
 *   1. clip.strikeLimb — explicit ('handR' | 'footL' | ...), the escape
 *      hatch for kicks, stomps and tail whips.
 *   2. clip.strikeArm  — the existing 'L'/'R' one-armed-blow marker that
 *      aimStrikeAt already reads.
 *   3. otherwise: whichever extremity is reaching furthest along the
 *      attacker's facing at the impact frame. That auto-covers the bespoke
 *      clips (sword forms, claw rakes) without a table to keep in sync.
 * Returns a part name, or null when nothing is far enough forward to be
 * plausibly the thing that hit (caller falls back to a body-relative point).
 */
export function pickStrikeLimb(hurtbox, clip, fwdX, fwdZ, originX, originZ, minLead = 0.35, stamp = null) {
  if (!hurtbox) return null;
  const declared = clip?.strikeLimb || (clip?.strikeArm ? 'hand' + clip.strikeArm : null);
  if (declared) {
    if (hurtbox.part(declared)) return declared;
    // The clip named a limb this rig doesn't measure — aegis' GLB yields no
    // hand parts at all, so a lance thrust marked `strikeArm: 'R'` found no
    // handR. Walk UP that same limb rather than dropping to the lead-limb
    // scan below, which on a fencing lunge picked the front FOOT (the leg
    // outruns the point) and resolved the skewer at ankle height. Same arm,
    // same side, one joint back: still the thing doing the hitting.
    for (const up of LIMB_FALLBACK[declared] || []) {
      if (hurtbox.part(up)) return up;
    }
  }
  hurtbox.refresh(stamp);
  let best = null, bestF = minLead;   // must actually lead the body to count
  for (const name of LIMB_PARTS) {
    const p = hurtbox.byName.get(name);
    if (!p) continue;
    const mx = (p.a.x + p.b.x) * 0.5 - originX;
    const mz = (p.a.z + p.b.z) * 0.5 - originZ;
    const f = mx * fwdX + mz * fwdZ;
    if (f > bestF) { bestF = f; best = name; }
  }
  return best;
}
