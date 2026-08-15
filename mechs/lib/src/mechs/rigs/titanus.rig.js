// TITANUS custom rig — a clean hand-placed humanoid skeleton for
// mech_titanus.glb, replacing a Tripo auto-rig that was scrambled beyond
// remapping: its 15 boneOverrides had `hips` on tripo0_Left_Limb_0, `torso` on
// tripo0_Right_Limb_0 and `shoulderL` on tripoSpine_0 — i.e. the spine was
// wired to limb chains — and 101 hand-written skinOps were patching the
// fallout. A stretch audit of that rig still flagged 33 islands with seam
// elongation up to 148x (one "torso" bone owned 14.8k verts, 18% of the mesh).
// This rig gives every limb a real chain and lets the proximity re-skin
// (reskin.js) redraw all the weights from scratch. The old rig + its skinOps
// are preserved as the manifest `alt` entry, so ?debug=models can compare them.
//
// Positions are MESH-LOCAL (raw GLB bind space): +x FORWARD (toes/knuckles),
// +y UP, +z LEFT / -z RIGHT. The model is symmetric about z = 0 and stands
// 0→1.0 tall, so every left/right pair below is a true mirror. Tune live in
// ?rigedit=titanus; `skinSpan`/`bias` are re-attached here because the editor's
// Export emits only name/parent/pos (+ bias/post).
//
// `skinSpan: 'child'`: each bone owns the limb slice BELOW it (shoulder→elbow
// is the upper arm, knee→ankle is the shin) — the slice three.js actually
// pivots about that bone. See reskin.js; the legacy 'parent' spans would put
// the upper arm on `elbow`, so a bent elbow swings the upper arm off the
// shoulder. Titanus throws hooks and haymakers (poundSlam, the ult), so he
// gets the correct spans.
//
// Consequence of 'child' spans, and the reason for every non-joint bone here:
// a LEAF bone's span degenerates to a point at its own position, and its
// parent's span already ENDS at that point — so a leaf can never win a vertex
// and would render zero-weight. Each driven chain therefore terminates in a
// static tip bone (fistL/R, toeL/R, heelL/R, crown), which is what gives the
// last driven joint a span to reach along: `handL/R` hold the huge fists,
// `ankleL/R` the boots (two tips each — heel behind, toe ahead — so the whole
// long sole rides the ankle instead of the shin), `head` the skull. Tip bones
// are NOT game joints, so the RigAdapter never drives them; a bone with no
// animation of its own transforms exactly like its nearest animated ancestor,
// so they only decide which geometry follows which joint.
//
// `stackL/R` are the twin exhaust towers behind the shoulders (y 0.78→1.00 at
// x ≈ -0.15). They are parented to TORSO on purpose: they are hull-mounted, and
// the nearest span otherwise is head→crown, which would make the whole back
// gear swivel with every animator head turn-lead.
//
// Moving these bones CANNOT change how big Titanus renders, and that is now
// guaranteed rather than incidental: his manifest entry carries
// `modelScale: 9.04432`, and gltf.js treats a pinned modelScale as the model's
// size of record and skips head-height matching entirely (see the FROZEN MODEL
// SCALE block there, and CHARACTER_PIPELINE.md).
//
// This mech is why that mechanism exists. gltf.js used to auto-size a GLB by
// matching its rendered HEAD-REGION top to the procedural canonical head top —
// which reads bone positions AND skin weights. Under the old auto-rig the head
// bone's geometry included the back exhaust towers, so the "head top" being
// matched was really the tower tips, which happened to land on the canonical
// height. Titanus's real head is the low block sunk between the pauldrons with
// the towers well above it, so once the towers correctly ride the torso the
// measured head top dropped ~12%, the match clamped at its 1.12 ceiling, and he
// rendered 5.7% larger. Tuning this rig freely is safe now; if you ever want to
// change his SIZE, edit modelScale deliberately (do not --repin).
export const TITANUS_RIG = {
  skinSpan: 'child',
  bones: [
    // ---- spine ---- hips carry the pelvis + belt column (y 0.46→0.62), torso
    //      the chest up to the neck. bias<1 on both so the trunk keeps its
    //      shell against the very close pauldrons and thighs.
    { name: 'hips', parent: null, pos: [-0.01, 0.465, 0.00], bias: 0.85 },
    { name: 'torso', parent: 'hips', pos: [-0.02, 0.620, 0.00], bias: 0.85 },
    // head is a low flat block sunk between the pauldrons (no neck); bias>1
    // keeps it off the upper chest and the inner pauldron corners.
    { name: 'head', parent: 'torso', pos: [-0.02, 0.775, 0.00], bias: 1.15 },
    { name: 'crown', parent: 'head', pos: [-0.03, 0.870, 0.00] },
    // ---- back exhaust towers (static, ride the hull) ----
    { name: 'stackL', parent: 'torso', pos: [-0.145, 0.820, 0.120] },
    { name: 'stackLTop', parent: 'stackL', pos: [-0.150, 0.985, 0.120] },
    { name: 'stackR', parent: 'torso', pos: [-0.145, 0.820, -0.120] },
    { name: 'stackRTop', parent: 'stackR', pos: [-0.150, 0.985, -0.120] },
    // ---- LEFT arm (+z) ---- the pauldron is a huge pad (y 0.68→0.90, out to
    //      z 0.37); bias<1 on the shoulder so it wins that pad off the chest
    //      and the pad swings with the arm. The arm hangs down and slightly
    //      back, ending in a fist that projects FORWARD to x 0.19 at knee
    //      height — hence fistL sits forward of the wrist, not below it.
    { name: 'shoulderL', parent: 'torso', pos: [-0.040, 0.745, 0.250], bias: 0.80 },
    { name: 'elbowL', parent: 'shoulderL', pos: [-0.070, 0.600, 0.295] },
    { name: 'handL', parent: 'elbowL', pos: [-0.015, 0.455, 0.315] },
    { name: 'fistL', parent: 'handL', pos: [0.070, 0.340, 0.325] },
    // ---- RIGHT arm (-z) ----
    { name: 'shoulderR', parent: 'torso', pos: [-0.040, 0.745, -0.250], bias: 0.80 },
    { name: 'elbowR', parent: 'shoulderR', pos: [-0.070, 0.600, -0.295] },
    { name: 'handR', parent: 'elbowR', pos: [-0.015, 0.455, -0.315] },
    { name: 'fistR', parent: 'handR', pos: [0.070, 0.340, -0.325] },
    // ---- LEFT leg (+z) ---- thigh y 0.29→0.47, shin y 0.13→0.29, boot y 0→0.13
    //      with a long sole (x -0.19→+0.20) split across heel and toe tips.
    { name: 'thighL', parent: 'hips', pos: [-0.010, 0.440, 0.145] },
    { name: 'kneeL', parent: 'thighL', pos: [-0.020, 0.290, 0.155] },
    { name: 'ankleL', parent: 'kneeL', pos: [-0.020, 0.135, 0.170] },
    { name: 'toeL', parent: 'ankleL', pos: [0.130, 0.045, 0.185] },
    { name: 'heelL', parent: 'ankleL', pos: [-0.140, 0.055, 0.165] },
    // ---- RIGHT leg (-z) ----
    { name: 'thighR', parent: 'hips', pos: [-0.010, 0.440, -0.145] },
    { name: 'kneeR', parent: 'thighR', pos: [-0.020, 0.290, -0.155] },
    { name: 'ankleR', parent: 'kneeR', pos: [-0.020, 0.135, -0.170] },
    { name: 'toeR', parent: 'ankleR', pos: [0.130, 0.045, -0.185] },
    { name: 'heelR', parent: 'ankleR', pos: [-0.140, 0.055, -0.165] },
  ],
};
