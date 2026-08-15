// RHINO custom rig — a clean hand-placed skeleton for mech_rhino.glb, replacing
// a Tripo auto-rig whose arm chains were BOTH mirrored (its "Left_Limb" chain
// drives the mech's RIGHT arm) and whose weights needed 67 hand-written skinOps
// to stop plates from tearing off. Rhino is a straightforward heavy humanoid —
// two arms, two legs, one spine — so a proximity re-skin (reskin.js) off a
// correctly-placed skeleton does the whole job.
//
// Positions are MESH-LOCAL (raw GLB bind space): +x FORWARD (horn/toes),
// +y UP, +z LEFT / -z RIGHT. The model is 1.0 tall in this space and its
// lateral centre line is z = 0. Tune live in ?rigedit=rhino and paste the
// export back (the editor emits only name/parent/pos, so `skinSpan`/`bias`
// are re-attached here).
//
// SHAPE NOTES (measured off the geometry, and per the model's own read):
//  • His HEAD is not on top — it's the horned structure hung off the FRONT of
//    the chest, ears flaring to |z|≈0.33 at y≈0.75-0.85, horn tip reaching
//    x≈0.27. So `head` sits forward and low (a nod pivot at the neck), with
//    `horn` and `earL/earR` as tips so the head owns that whole mass instead
//    of leaving it to the torso.
//  • The SHOULDERS sit at about EAR height (y≈0.80) — the arms hang from the
//    top of a very short, wide torso, flare outboard to |z|≈0.43 at the
//    forearm, and end in fists at y≈0.35.
//  • `hump` holds the back/shoulder spike cluster (y 0.88-1.0, x<0), which is
//    torso geometry no limb should ever carry.
//
// `skinSpan: 'child'`: each bone owns the slice BELOW it (shoulder→elbow is
// the upper arm, knee→ankle the shin) — the slice three.js actually pivots
// about that bone. See reskin.js.
//
// `cutWelds` / `cutPairs` / `softSkin` (all reskin.js, all opt-in) are what make
// this model survive a rigid re-skin. The mesher shipped ONE closed shell: the
// inner arms are welded to the hips through a membrane spanning the air gap,
// and rigidly split that membrane fans out into a metre of shards the moment an
// arm lifts (it is exactly what the uppercut used to drag). `cutWelds` drops
// triangles whose ends sit on bones 3+ links apart — arm-to-hip, fist-to-knee —
// which no joint can explain; `cutPairs` adds hips↔shoulder, only 2 links via
// the torso but the same spurious weld. 631 triangles of 250k, plus the orphan
// scraps left behind. `softSkin: 4` then relaxes the REAL joints over 4 rings
// so knees and armpits bend instead of shearing.
// Measured (tools/cliptear.mjs, all 80 clips, every cross-bone seam): worst
// stretch +0.15 mesh units / 76x vs the old Tripo rig's +0.28 / 731x.
export const RHINO_RIG = {
  skinSpan: 'child',
  softSkin: 4,
  cutWelds: true,
  cutPairs: [['hips', 'shoulderL'], ['hips', 'shoulderR'], ['hipPadL', 'shoulderL'], ['hipPadR', 'shoulderR']],
  bones: [
    // ---- spine ---- (short and deep: pelvis at 0.47, chest at 0.72)
    { name: 'hips', parent: null, pos: [-0.04, 0.47, 0.00], bias: 0.85 },
    { name: 'belly', parent: 'hips', pos: [0.09, 0.50, 0.00] },
    { name: 'hipPadL', parent: 'hips', pos: [-0.06, 0.48, 0.27] },
    { name: 'hipPadR', parent: 'hips', pos: [-0.06, 0.48, -0.27] },
    { name: 'torso', parent: 'hips', pos: [-0.03, 0.72, 0.00], bias: 0.8 },
    { name: 'hump', parent: 'torso', pos: [-0.10, 0.93, 0.00] },
    // ---- head: the FRONT horned structure, pivoting at the neck ----
    { name: 'head', parent: 'torso', pos: [0.06, 0.70, 0.00] },
    { name: 'horn', parent: 'head', pos: [0.26, 0.80, 0.00] },
    { name: 'jaw', parent: 'head', pos: [0.17, 0.57, 0.00] },
    { name: 'earL', parent: 'head', pos: [0.12, 0.79, 0.15] },
    { name: 'earR', parent: 'head', pos: [0.12, 0.79, -0.15] },
    // ---- LEFT arm (+z) ---- shoulder at ear height, fist low and wide
    { name: 'shoulderL', parent: 'torso', pos: [-0.03, 0.78, 0.26] },
    { name: 'pauldronL', parent: 'shoulderL', pos: [-0.06, 0.88, 0.32] },
    { name: 'elbowL', parent: 'shoulderL', pos: [-0.07, 0.56, 0.36], bias: 1.1 },
    { name: 'handL', parent: 'elbowL', pos: [0.00, 0.38, 0.36], bias: 1.1 },
    { name: 'fistL', parent: 'handL', pos: [0.03, 0.33, 0.36] },
    // ---- RIGHT arm (-z) ----
    { name: 'shoulderR', parent: 'torso', pos: [-0.03, 0.78, -0.26] },
    { name: 'pauldronR', parent: 'shoulderR', pos: [-0.06, 0.88, -0.32] },
    { name: 'elbowR', parent: 'shoulderR', pos: [-0.07, 0.56, -0.36], bias: 1.1 },
    { name: 'handR', parent: 'elbowR', pos: [0.00, 0.38, -0.36], bias: 1.1 },
    { name: 'fistR', parent: 'handR', pos: [0.03, 0.33, -0.36] },
    // ---- LEFT leg (+z) ---- long foot: ankle back at x≈-0.05, toes at +0.10
    { name: 'thighL', parent: 'hips', pos: [-0.04, 0.46, 0.15] },
    { name: 'kneeL', parent: 'thighL', pos: [-0.03, 0.27, 0.19], bias: 0.9 },
    { name: 'ankleL', parent: 'kneeL', pos: [-0.05, 0.10, 0.20] },
    { name: 'footL', parent: 'ankleL', pos: [0.10, 0.02, 0.21] },
    // ---- RIGHT leg (-z) ----
    { name: 'thighR', parent: 'hips', pos: [-0.04, 0.46, -0.15] },
    { name: 'kneeR', parent: 'thighR', pos: [-0.03, 0.27, -0.19], bias: 0.9 },
    { name: 'ankleR', parent: 'kneeR', pos: [-0.05, 0.10, -0.20] },
    { name: 'footR', parent: 'ankleR', pos: [0.10, 0.02, -0.21] },
  ],
};
