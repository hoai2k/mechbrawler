# 3D Asset Requests — open requests (the D-rounds)

**Modelling jobs on a fighter who is already delivered — geometry that has to
be cut, closed or re-topologised by hand — are asked for in
[blender-requests.md](blender-requests.md), not here.**

**This file asks for MODELS and CLIPS. Every 2D image any render mode needs —
including the reference boards these rounds are generated from — is in
[docs/image-requests.md](../../docs/image-requests.md), the single
image-request document.**

Everything the `?render=3d` backend needs generated: **rigged, toon-ready 3D
models and animation clips**. This file is the render3d sibling of
[billboards/docs/asset-requests.md](../../billboards/docs/asset-requests.md)
and follows the same rules: everything here is **outstanding**, delivered
rounds move to a history file when the first one lands, and round numbers
(D1, D2…) are permanent so commits citing them keep resolving.

**Current status: the roster is delivered** — 27 rigs are in
`render3d/assets/` and 25 draw in game (`inGame: false` holds back Mei Mei
and Kurourushi pending rebuilds; see the D6 round below). The pipeline
(live playback, on-twos sampling, toon ramp, ink outlines, foot IK,
turnaround, stage lighting, intake, workbench review and inheritance) runs
against the delivered bodies, with the mannequin still available as the
stand-in (`?mannequin=all`); see [plan.md](plan.md). Open work is the
per-round list below.

The 2D image inputs this track needs (Tripo seeding boards, face sheets,
shade-palette swatches, eye/mouth textures) are requested separately in
[image-requests.md](image-requests.md) — deliver those to the 2D intake, not
here.

---

## One asset truth, two backends

**The billboard delivery spec applies VERBATIM.** Read
[billboards/docs/asset-requests.md](../../billboards/docs/asset-requests.md)
first — units (metres, real height from its roster table), orientation (Y-up,
facing +Z, origin between the feet), T-pose bind, the standard Mixamo-named
skeleton, `Prop_*` prop bones, `Chain_<name>_<i>` physics chains, mesh budget
(≤30k tris standard / ≤60k bulk, ≤4 influences), baseColor-only ≤2048px, the
26 named clips with their durations and contact beats, aim-neutral strikes,
no baked engine motion, and the three sharing tiers (library / archetype /
identity). One commissioned rig serves both backends; **any rig already
approved for billboards is a valid intake candidate here** — drop it in
`render3d/intake/` and run the flow below.

### The D-spec additions (this backend only)

A delivery that also wants to look its best under the anime pass adds, in
the same `.glb`:

1. **Shade-bias (ILM) map** — grayscale, one value per baseColor texel,
   **packed as the baseColor texture's alpha channel** (glTF material extras:
   `"shadeBias": "baseColorAlpha"`). 0.5 is neutral; darker forces the texel
   into shade early (underside of the jaw, hair clumps, cloth folds); lighter
   holds the lit side late (the face plane). A rig without one renders with
   the neutral bias — legal, but the face will read "shader", not "drawn".
2. **Outline width channel** — vertex color, channel **R**, 0–1, default 0.5.
   0.5 = nominal line, 1.0 = double (jaw, silhouette), near 0 = hairline or
   none. A mesh (or material) can opt out entirely with extras
   `"outline": false` (eye whites, effect cards).
3. **Edited normals, baked in.** Face normals transferred from a smoothed
   proxy so the terminator sweeps the face as ONE clean arc; hair normals
   combed along clump direction. **This is a review gate**: the workbench's
   sweeping-light check fails a face whose terminator breaks into triangles,
   no matter how good the body is.
4. **Shadow palette** — per-material shade tint in glTF extras:
   `"toon": { "shadeTint": [r, g, b] }` (0–1 floats). Cool-shifted per the
   sprite art's own shading. Omitted = the global cool shift in
   `render3d/src/toon.js`. Any other TOON knob (`shadeThreshold`,
   `rimStrength`, `rimColor`, …) may be pinned the same way.
5. **Mouth/eye variants** *(optional — fighters ship without them)* — texture
   swap regions listed in extras, keyed to states (idle, hurt, ult, win).
   Spec'd fully when the first fighter needs them; do not block on this.

What separates a good model, in order of importance — silhouette equals
sprite silhouette (the ghost overlay is the gate), big flat shapes (toon
shading punishes surface noise), color from the canon reference with **no
baked lighting or gradients** (the ramp supplies all shading), **face
first** — is argued in [plan.md §5](plan.md).

### Clip authoring for LIVE playback

Everything in the billboard clip contract, plus (see [plan.md §6](plan.md)):
author **pose-to-pose** like limited animation (strong keys held, fast
breakdowns — on-twos sampling flattens inbetweens, so spend keys on poses);
put the **anticipation inside the startup** and snap to extension exactly at
the beat; **follow through after the beat** into a hold; do NOT bake foot
planting fixes (the engine runs foot IK) or breathing (the engine adds a
shoulder-only breath layer on holds). Optional per clip: **smear frames** —
stretched duplicate geometry at the 1–2 samples before the beat on heavies
and specials, standard anime practice, flagged in the clip's extras.

---

## Where to deliver

**Upload to `render3d/intake/`, never to `render3d/assets/`.** The flow is
[../intake/README.md](../intake/README.md):

```
render3d/intake/<char>/<char>.glb          the fighter: rig, mesh, materials,
                                           and their bespoke clips, embedded
render3d/intake/_shared/library.glb        the shared locomotion/defense clips
render3d/intake/_shared/<archetype>.glb    one normals set per archetype
```

Validate / import / approve with the shared model-intake tool (one validator
for both backends, extended, not forked):

```
node tools/billboard_intake.mjs validate <char> --backend 3d
node tools/billboard_intake.mjs import <char>   --backend 3d
# review in /render3d/workbench/?char=<char>, export the payload, then:
node tools/billboard_intake.mjs apply payload.json --backend 3d
```

Approval is **all-or-nothing per fighter**, decided in the render3d workbench
(sweeping-light face check first, then every clip against its sprite ghost,
at the beat, under the aim crosshair, facing both ways).

### Approved, but not in the game yet

`approved` and `inGame` answer two different questions and a fighter needs both
to reach a player. `approved: true` says the delivery passed intake and belongs
in the repo — it is what the workbench opens. `inGame: false` says this
particular body is not fit to be SEEN by a player yet, and the game draws their
sprites instead.

```jsonc
"meimei": { "approved": true, "inGame": false,
            "inGameNote": "arm at 151% of a normal one; feet 1.52/1.56" }
```

Collapsing the two — hiding a fighter by un-approving them, which is what was
done to Mei Mei and Kurourushi — also hides them from the tool that would fix
them. The workbenches pass `{ includeDisabled: true }` to `initRigs` and mark
them: `⊘` in the roster list, the reason on the rig line, and **"not in game
yet"** drawn under the fighter's feet, so it travels into the line-up and the
Idle Review where the panel is not on screen. Everything else — the default —
gets the cautious answer.

### The GLB correction layer — what is still owed to the models

Every fighter is drawn with corrections applied on top of their delivered
`.glb`: a head modelled looking down is tilted back, a model built facing the
wrong way is yawed round, arm roots built into the body are pushed out. They
are facts about the FILE — no clip can fix them, because every state inherits
them — and they are dialled by eye in the Idle Review, which is the one pose
with an obvious right answer.

**They are meant to go away.** Each one is a modelling job on the `.glb`, after
which its number is zeroed and nothing else changes. So the layer is written to
be found and switched off in one piece:

- `render3d/src/rig_fixes.js` holds the bake list. `MODEL_FIXES` says, per key,
  where the number lives, what it means, and what baking it would be;
  `MODEL_FIX_KEYS` is the set that counts as a model correction; `RIG_FIXES`
  holds per-bone bind corrections; `setModelFixesEnabled(false)` turns the
  whole layer off.
- `render3d/src/pose.js` applies it in ONE delimited block, marked
  `THE GLB CORRECTION LAYER — begin/end`, for every state.
- `node tools/model_fixes.mjs` prints what each fighter still carries.
- The pose workbench's **rig-check poses** show it on the body — see below.

### T-pose and A-pose: judging the rig instead of the pose

At the top of the pose workbench's pose list, above every drawing, sit
**T-pose** and **A-pose** (`?rigcheck=T` / `?rigcheck=A`, `[` and `]` step
onto them). They are not poses of the character and there is no sprite to
match them against. They are poses of the SKELETON: the bind pose out of the
`.glb`, legs straight, soles level, arms taken out to 90° or 45° from the
body's own width axis.

That is where a rig gives itself away. A bone rolled the wrong way, an arm
root built inside the chest, one shoulder higher than the other, a foot that
is really a lump — in a pose that came out of a clip, all of it reads as
something the animation did. With every joint at a right angle to the next
and a silhouette you already know, it reads as what it is. Jogo's arms come
out visibly uneven; Hakari's 20° head correction is unmistakable.

**And the corrections are listed beside the figure.** The body on screen is
the `.glb` PLUS the correction layer, so the panel under the pose is exactly
that difference: each outstanding key, its value, and what baking it would be.
One pose answers "is this rig good" and "what is left in the pipeline" at the
same time — which is the whole reason the list lives here rather than only in
a tool nobody remembers to run.

### What a live bone correction can and cannot fix — the Geto round

Geto's rig was hand-dialled in the rig bench and the skeleton mirrored, then
measured in five states. The result is worth writing down, because it changes
what belongs in this layer at all.

**In the T-pose it works, and the two halves need each other.**

| | shoulders apart | knees apart | arms | feet (L / R) |
|---|---|---|---|---|
| delivered | 3.9 cm | 5.6 cm | 12° apart | 26° / 46° out |
| mirrored only | 0 | 0 | 10° apart | 37° / 37° out |
| rotations only | 3.9 cm | 6.3 cm | 1.4° apart | 10° / 2° out |
| both | 0 | 0.8 cm | 1.1° apart | 20° / 7° out |

Mirroring is the only thing that levels the pairs — a bone's position is set by
its parent, so no rotation can move it — and the rotations are the only thing
that squares the feet. Note the last row's feet: the yaws were dialled against
the LOPSIDED skeleton, so once it is mirrored they overshoot. **Straighten
first, then dial**, or the second correction is fitted to a defect the first
one removed.

**In a clip-driven state the rotations make it worse.** Geto's run, heavy and
crouch resolve to library clips, which are built from the sprite poses and come
out symmetric by construction — feet 1.4° apart in the run. With his bone
corrections on, the same frame reads 45° and −55°: the fix creates exactly the
splay it was written to remove.

That is not a bug in the fix, it is the shape of the problem. **A rotation
correction only helps where the BIND is showing through.** In the rig check and
in the idle, foot yaw comes from the bind (`applyIdleStand` levels soles and
deliberately leaves yaw alone), so the correction lands on the defect. In a
clip, the rotation came from the clip, the defect is not there, and the
correction is pure damage. The layer cannot tell the two apart, because by the
time it runs they look identical.

So:

- **Position fixes (`SYMMETRISE`) are safe everywhere.** Clips animate
  rotations, not bone positions, so there is no state where a mirrored
  skeleton fights what the clip asked for. It is now ON for the whole roster —
  see below.
- **Rotation fixes are safe on bones the clips do not drive** — a clavicle
  roll, a wrist the grip solver owns. On a foot, a knee or a toe they should be
  BAKED into the .glb rather than applied live. Baking puts the correction in
  the bind, where the clip overwrites it exactly as it overwrites everything
  else, and the damage cannot happen.

Geto's foot, toe and leg entries are in `RIG_FIXES` today so they can be looked
at, and they carry this warning in the file. They are the strongest argument
yet for getting the bake done rather than living on the correction layer.

### THE LAYER IS BAKED (and what is left in it)

The corrections are in the `.glb`s. `tools/bake_model_fixes.mjs` asked the
engine what each fighter's corrected bind is (`bakedBind`), and
`tools/bake_glb_bind.py` rewrote the file to hold it: skinned vertices moved by
their own weighted blend of `B'ᵢ · Bᵢ⁻¹`, joint nodes rewritten, inverse-bind
matrices inverted, and every delivered clip's rotation and translation keys
carried through the same delta. `RIG_FIXES` and `SYMMETRISE` are empty and the
manifest's `headTiltDeg`, `shoulderOutCm` and `kneeDeg` are gone.

**Two things stayed out, and both are deliberate.**

`renderScale` is not a defect in the model — the `.glb` is the size it is, and
the number says how big the fighter is DRAWN (blit.js divides it by `heightM`).

`yawOffsetDeg` looked like the easy one and was not. Baking it — turn the rig,
delete the number — moved every yawed fighter's clip-driven poses by up to
1.1m while their rig check still matched to 0.0mm. The error tracked the
offset exactly: Hanami (75°) 1101mm, Dagon (80°) 1112mm, Choso (0°) 97mm. The
CLIP BUILDER reads the offset, and 702 of the roster's 729 clips are built at
load from the pose libraries, so zeroing the number while pre-rotating the
geometry hands it a fighter whose bones say one thing and whose manifest says
another. Rotating a model is a calibration, not a defect; it stays.

**What the bake cost.** A baked correction sits in the bind, where the old
layer sat on top of the pose, and the idle layers aim limbs FROM the bind — so
the same `armDeg` is a different pose once the shoulders move. `tools/redial_idle.mjs`
searched each fighter's `armDeg`/`stanceDeg` back onto their pre-bake idle;
what is left is 18–105mm at the extremities, most of the roster between 25 and
75. That is the correction landing in the right place rather than an error, and
`tools/smoke_bake.mjs` measures it against a reference captured before the bake
so the number is never a guess.

### The mirror was on for everybody

A body is symmetric. That is not a style choice about these characters, it is
what the drawings show and what every pose library assumes when it says one
thing about "the arm" — so the mirror is the rule and an exemption is the claim
that needs arguing. The survey that settled it, taken across the roster with
the correction layer lifted (left joint minus right, centimetres):

```
hanami  shoulders  8.5    jogo  -6.9    sukuna  -5.5    dagon   4.4
geto              -3.9    nanami  3.8   toji (knee) 3.7  mecha   3.4
maki (knee)        3.2    choso   3.0   ...eighteen more under 3
```

A third of the roster is lopsided by over a centimetre in the joints that
matter. Every non-exempt fighter now measures **0.00cm** at the shoulders and
knees, and the eighteen that were already square pay nothing.

**Hanami was exempt**, alone. His arm roots are 8.5cm apart — the widest gap on
the roster by a distance, which is either the worst rig we have or the point of
the character, and those look identical from here.

**Three solved shoulder rolls were retired by it.** Yuji, Megumi and Jogo
carried a `LeftShoulder` roll from `tools/rig_calibrate.mjs`. They worked, and
running them alongside the mirror double-corrects:

| arm roots, L−R (cm) | neither | roll | mirror | both |
|---|---|---|---|---|
| yuji | −1.96 | −0.13 | **0.00** | +2.52 |
| megumi | −0.40 | −0.01 | **0.00** | +0.56 |
| jogo | −6.94 | −0.05 | **0.00** | +6.56 |

The roll was a *rotation* compensating for a *position* error — it tilted the
clavicle until the arm root happened to come out level, which is why it had to
be solved numerically and why it landed near zero rather than on it. The mirror
moves the joint to where it belongs, is exact, and is safe in every state. Two
fixes for one defect; this is the one that keeps. The same goes for the fighters
the calibrate loop gave up on (Nanami, Dagon, Mahito, tilted the other way): the
mirror takes all three to zero without needing to know which way anybody leans.

**A skeleton fix must be idempotent, and this one nearly was not.** The first
version measured the sagittal plane off the skeleton *as it stood* and wrote
positions back through the posed parents — inside the per-frame loop, between
the clip and the clean-pose snapshot, so its own output became the next frame's
input and the frame it measured moved with the clip. The rig walked: two renders
of one frame came out thirteen cells apart, and the shoulder-width dial measured
20cm in the idle and 0 in every other state. It is derived from the **bind** now
and cached as local offsets, so applying it is a copy — safe to call every
frame, in any state, in any order. `tools/smoke_rig_bench.mjs` holds it there.

### The rig bench — turning the bones, not the pose

`render3d/workbench/?edit=rigs` is the tool that goes with those poses: one
fighter in a T- or A-pose, in a live viewport you can orbit and zoom, with a
rotation handle on every bone.

Pick a bone — from the list, or by clicking its dot on the body — and drag one
of the four rings until the pose looks like an actual T.

The three coloured rings turn about the bone's own axes: red X, green Y, blue
Z. They write a clean single-axis number, and they are the ones you cannot
always use — a ring seen edge-on projects thirteen pixels wide and cannot be
dragged accurately by anyone, so it goes dim to say so. The fourth, white and
outside them, turns the bone in the **plane of the screen**, about whatever the
camera is looking down. It is face-on by construction, so there is never a
joint you have to orbit twice to reach: nudge it the way it looks wrong and the
bench works out which axes that was.

Bone dots have a click target much larger than the dot, and picking is done in
screen space — for both dots and rings, because a ray that must hit the
geometry makes the target the geometry's size, and these are deliberately small
so they do not bury the body they are drawn on.

**Straighten skeleton** mirrors the bone POSITIONS about the body's own centre
line, so paired joints sit at the same height and the same distance out. It is
the half a rotation cannot reach, and the only correction here that is safe in
every state — see the Geto round above.

**Mannequin ghost** overlays the stand-in — the one body in the project that is
certainly correct, being written out in code rather than generated — scaled to
this fighter and posed by the same call. It turns "does this look like a
T-pose" into "does this match that". Overlaid rather than beside on purpose: a
five-degree shoulder is invisible when you are comparing two silhouettes from
memory, and obvious as a green edge sticking out of one. Its *proportions* are
the stand-in's, so judge angles and symmetry against it, not limb lengths.

**What you are editing is not the pose.** It is the fighter's entry in
`RIG_FIXES`, so a shoulder straightened here is straightened in the idle, the
run and the punch. The bench writes into that live table, which means the
figure in front of you is drawn by exactly the code that will draw it in the
game — and **Corrections on/off** switches the whole layer, so you can see the
`.glb` as delivered and what the engine makes of it, one click apart.

**Handing the work back** is a paste box and two buttons, pinned to the bottom
of the panel: ⧉ Copy for a message, ⤓ Download for a file. The box holds the
same payload the file does — every fighter touched in the session, in the shape
`RIG_FIXES` takes:

```jsonc
{ "kind": "render3d-model-bench",
  "fixes": { "yuji": { "model": "yuji/yuji.glb",
                       "bones": { "LeftShoulder": [0, 0, 19.2] } } } }
```

Angles are XYZ Euler degrees in the bone's **parent** frame, which is the frame
`applyRigFixes` composes in — the one frame that means the same thing whatever
the arm happens to be doing. That is also why the rings are aligned to the
parent rather than to the world: what you drag is what gets recorded.

It has its own renderer rather than the game's pipeline, and deliberately: the
other benches pose a rig, render it to a 512px texture and blit that, which is
right for judging what a player sees and useless for surgery — you cannot orbit
a texture or pick a joint in one. `tools/smoke_rig_bench.mjs` guards it,
including that a tenth of a turn on a ring records 36° about that ring's axis
and nothing about the other two.

Implementation: `poseRigCheck` in `render3d/src/pose.js` (which throws the
clip away and calls `applyBindPose` — `restoreClean` restores the pose the
last CLIP left, which after one frame is not the bind), and `applyBindPose` in
`render3d/src/ik.js`, which reads the skeleton's inverse-bind matrices because
they are the only record of the rest pose. Positions as well as rotations: the
shoulder correction is a translation, and a rotation-only restore would leave
the previous pose's widening on the bone and double it.

`armDeg` and `stanceDeg` are deliberately not on the list. They say how a
fighter carries their arms and plants their feet *at rest*, which is a pose and
only means anything in the idle; baking them would freeze a fighter mid-idle in
every other state. The test for belonging on the list is whether the correction
is true of the body no matter what it is doing.

**The test of a finished bake:** with a fighter's numbers in their model and
zeroed in the manifest, `setModelFixesEnabled(false)` leaves them looking
identical. If it does not, the bake was wrong or incomplete.

This layer had exactly the bug the arrangement is meant to make impossible.
`shoulderOutCm` was an argument to the idle-arm solver, so it existed only
while a fighter stood still: Uro measured 37.6 cm across the shoulders in her
idle and 24.9 cm mid-punch — a 12.7 cm snap, exactly twice her 6.5 cm
correction, on the first frame of every attack (Maki 33.8 → 25.8, Yuji
34.1 → 31.1; Hakari, who carries no correction, held at 40.4 throughout). The
in-game instances never received it at all, because `acquireInstance` copied
`headTiltDeg` and not the rest. `tools/smoke_pose_bench.mjs` guards both:
the correction has to widen the shoulders by the same amount in the idle, a
light, a heavy, a crouch and a run.

### Gakuganji cannot be given a two-handed idle by the grip solver

He is drawn playing his guitar with both hands and the model carries it in one,
so the obvious fix is to let the off-hand grip solve run in idle for a guitar
while leaving polearms alone (a `carryTwoHanded` flag on the weapon KIND). It
was built, and it must not be: it reproduces exactly the failure
`TWO_HAND_STATES` was written to avoid, and it takes the carrying arm with it.

Measured on his idle, the flag being the only difference:

| | left elbow | left hand | guitar |
|---|---|---|---|
| grip off in idle (shipping) | 7.3° | 0.943 m | 0.678 m — at his side |
| grip on in idle | **118.7°** | 1.406 m | **1.658 m** — above his head (1.564) |

The solve puts the off hand a fixed distance DOWN-SHAFT from the carrying hand.
In a strike that is right, because the clip presents the weapon across the body
and both arms are posed. At rest the shaft rides a hand the solver is also
moving, so the two chase each other upward — the same runaway that sent Maki's
off arm over her head, and the reason the comment in `ik.js` says idle "was
tried". It also breaks the Idle Review's arm dial for him, because his arms
stop answering to `applyIdleArms` at all.

What a two-handed idle actually needs is a grip TARGET that is a point on the
instrument's body rather than an offset from the other hand, or simply an
authored idle pose — his clip already holds his arms up near the instrument.
Not this solver.

### Uro's neck cannot be repaired by surgery

Recorded because it was tried three ways and none of them work, and the next
person to look at her should skip straight to a regeneration.

Her sprite wears a plain dark choker. The generator saw the choker AND the
pale-blue cursed-energy cloud she is drawn inside, and built both out of the
same lumpy shelves: a collar of irregular slabs through her throat, in **41
separate shells** in the band around the neck joint.

They cannot be cut away, because they are not separable from her:

* **By shell, conservatively** (shells lying wholly in the collar band): 396
  vertices, 7 shells — the shelves straddle the band edge and survive.
* **By shell, widened** to everything between 1.5 and 5 neck-radii out with no
  Head/Neck/Chain vertex: 1865 vertices, 16 shells — clears some, leaves the
  ring at the collarbone and a ragged fringe where each shell was cut.
* **By shell, aggressively** (down to the chest, out to 9 radii): 4293
  vertices, 52 shells — and it takes her shoulders and upper torso with them,
  leaving a floating head.

The cloud is weighted to `Left/RightShoulder` and `Spine2`, the same bones as
her actual shoulders, and interleaved with them in space; there is no
threshold in bone, height or radius that separates the two. **Grafting the
head from her pre-D6 model** (`graft_model_part.py --part head`) does give a
clean skull and column — her older generation has a proper neck with the
choker's band at its base — but the shelves are shoulder-weighted, so they
stand untouched under the new head.

What she needs is a seed that does not draw the cloud: the DI board reshot
with the cursed energy removed, so the generator models a woman with a choker
instead of a woman inside a cloud.

A regeneration does not always win. When a fighter is rebuilt, the model it
replaces is kept beside it as `<char>_alt.glb` and registered under an `alt`
block in the manifest, so the two can be judged against each other on screen
rather than from memory — the workbench's **Compare: Alt GLB** dial stands the
alternate where the drawing usually goes, in the same pose, and the Idle
Review carries the same dial.

```jsonc
"momo": {
  "model": "momo/momo.glb", "heightM": 1.5,
  "renderScale": 1.12, "stanceDeg": 6, "yawOffsetDeg": 60,
  "alt": {
    "model": "momo/momo_alt.glb", "label": "pre-D6 — single-view seed",
    "heightM": 1.5, "renderScale": 1.16, "stanceDeg": 3, "yawOffsetDeg": 60
  }
}
```

**The alternate carries its own numbers, and that is the point.** Size, turn,
stance and head carriage describe one specific .glb — how tall it measures,
how far round it was built, how its legs are planted. Dress an older model in
the current one's corrections and it looks wrong for a reason that has nothing
to do with the model, which is precisely the question the comparison exists to
answer. The review dials follow whichever body is on screen.

### Fixing a foot instead of regenerating a fighter

`tools/blender_fix_foot.py` replaces a malformed foot with a good one. It
works because a generated body is a **patchwork of disconnected shells** —
198 on Mei Mei, 272 on Momo — that overlap rather than share edges, so there
is no continuous surface to cut and nothing to tear: swapping a shell for one
that fills the same space at the ankle is a local edit.

```
<blender> -b -P tools/blender_fix_foot.py -- \
    --in render3d/intake/momo/momo.glb --out render3d/intake/momo/momo.glb \
    --from Right --to Left
```

**Two tools, two jobs — take the foot from the right place.** Mirroring is for
one model with one good foot; **`tools/graft_model_part.py` is for taking a part from another
generation**, and it is the better tool
whenever there are two models: it moves whole TRIANGLES whose vertices all
belong to the part, so the seam falls on the recipient's side, and it carries
the donor's texture across as its own primitive. `blender_fix_foot.py` once
had a `--donor` path that worked at SHELL granularity and dragged half a shin
with every foot; that path is deleted rather than left around to be picked by
mistake.

The mirror is clean because everything matches by construction: same density,
same texture, same leg, same generation, and the two ankle bones are already
mirror images — so reflecting the geometry and renaming its weight groups puts
the foot in the right place *and* deforms correctly. The mirror plane is the
perpendicular bisector of the two ankle bones, never `x = 0` — these rigs
carry a yaw offset and half of them sit off-centre.

**Both tools land the sole**, and both need to. A graft placed by bind matrix
arrives correctly *oriented* and hanging at the donor's own sole depth: Maki
came out of her shin graft **2.5 cm off the floor with her feet 2.5 cm out of
level with each other**, which reads as a limp long before anyone looks at the
boots. The lowest point of the new part is put where the lowest point of the
part it replaced was, and the slack goes into the seam, up inside the calf.

**A shin graft is only safe when nothing else hangs off the leg bones.** Mei
Mei's old feet measure much better than her new ones (2.24/2.43 against
1.52/1.56) and she still cannot have them: her skirt hem is weighted to
`Left/RightLeg`, so cutting the shins tears the skirt, and the distances give
no way to spare it — hem and leg run continuously from 3 cm to 17 cm off the
shin axis, with the boot itself reaching 14.9 cm, so any radius that keeps the
skirt also keeps the old boot. Grafting her at the ANKLE instead leaves the
skirt alone and tears the ankle. Her feet are mid-roster and under no flag, so
she keeps them.

**The audit measures feet now**, so this cannot pass unnoticed again: a foot is
longer than it is wide, and the ratio is taken along the foot's own principal
axis (never off the toe bone, which is a 2 cm stub whose direction is noise and
which scores known-good feet as badly as broken ones). Delivered feet run about
2.0; a lump reads about 1.0. Momo's left was **1.05** against her right's 1.98,
and the sweep turned up Sukuna's left at **1.29** against 1.97 — both now 1.98
from their own right foot mirrored over. Maki's were **1.03 / 1.15** — both lumps, so no mirror could
help her; she took her old boots instead and reads **2.41 / 2.31**, the best on
the roster.

### `heightM` is measured, never reviewed

It is read off the .glb at import — **the fighter, not their weapon**. A
separately generated prop hangs off a bone as its own un-skinned mesh, and
counting it recorded Momo at 1.91 m against a canon 1.50 m. On-screen size is
`renderScale / heightM` (blit.js), so all four prop carriers were drawn ~20%
small and the size dial got raised to hide it — a correction sitting on top of
a measurement error. `apply` now drops `heightM` from a payload for the same
reason: a stale export must not be able to reinstate an old height. Re-import
is what changes a height.

---

## The rounds

The roster table (who, at what height, which archetype, which props/chains)
is the billboard file's — one table, not two.

### Round D1 — the pilot: Yuji, complete *(open — draw against this)*

One toon-ready rig and all 26 clips, end to end, before anything else is
commissioned. **If billboard round B1 has delivered Yuji, D1 is that rig plus
the D-spec additions** (shade-bias alpha, outline vertex colors, edited
normals, shade tints); if not, D1 commissions him once and both backends are
served. His 14 locomotion/defense clips seed the shared library, his six
normals seed the unarmed archetype, six identity clips are his alone.

The style call — "does an anime-shaded, live-animated Yuji sit beside 26
sprite fighters without clashing?" — is answered here, on one rig, before the
roster spends anything.

**Deliverable: 1 rig (+ D-spec), 26 clips, to `render3d/intake/yuji/yuji.glb`.**

### Round D2 — the shared library and the archetype sets

Opens when D1's library seeds survive live retargeting review (the workbench
validates onto the extreme proportions: Momo at 150 cm, Hanami at 220).
The 14 shared clips finalized + the five remaining archetype normal sets
(blade, heavy, polearm, caster, bulk — six clips each), authored pose-to-pose
per the live-playback rules above.

**Deliverable: 14 library clips finalized + 30 archetype clips.**

### Round D3 — the standard humanoid rigs

Twenty-two toon-ready rigs (every standard-skeleton fighter except Yuji), in
review-sized batches of four to six, each shipping individually the moment
their set clears approval — per-character fallthrough carries the rest of the
roster on sprites throughout.

**Deliverable: 22 rigs (+ D-spec each) + 132 identity clips.**

### Round D4 — the bespoke bodies

Panda, Hanami (his tree design is retired — no `hanami_alt` variant), Dagon, Kurourushi,
Mahoraga — same order and same override allowance as billboard round B4.

**Deliverable: 5 rigs, 1 material variant, 30 identity clips, ~20 bulk-normal
overrides.**

### Round D5 — spectacle *(opens after D3's first batch)*

The plan's §7/§8-D4 extras that need authored content: smear frames on the
archetype heavies, foreshortened identity moments (ult wind-ups toward the
lens, win-pose orbits — flagged per clip in extras so spectacle never blurs a
hitbox), and state-keyed material variants (Yuji's Sukuna markings during
ult, Yuta's full-meter glow).

### Round D6 — regeneration: the workbench catches *(delivered)*

Every art round has produced a catch round; D6 is this track's, held open so
findings from D1–D5 have a number that is not a new fighter's round. It is
now open, and what it holds is five models that cannot be repaired.

**These are not rigging faults.** A pose can be re-authored, a facing turned, a
skin re-weighted — but a leg that was never reconstructed is not in the file,
and a horn that was invented cannot be un-invented without leaving a hole where
a skull should be. Mei Mei's horns are still there with her hair chain removed
and her chain bones reset to identity; Momo's missing leg is missing mesh, and
the broom standing in its place carries 4201 of skin weight. The only fix is a
new model from a better seed.

**The seed is [DI5](image-requests.md#round-di5--regeneration-seeds-delivered--read-the-verdict-before-generating)**,
which reopens the turnaround board for exactly these fighters and states the
four rules their old boards broke. Do not regenerate from the boards on file:
they are the cause.

| Fighter | Regenerate because | Priority |
|---|---|---|
| `momo` | one leg not reconstructed (51% of a normal leg against the other's 181%); the broom is fused into the body and fragments across it | **first** — visible in every frame she is on screen |
| `meimei` | 5.8% of her stature is invented geometry above her head, read in game as horns; her braid is welded to the skull, so the chain extraction cannot find it | **first** |
| `maki` | one arm at 167% of normal — the polearm is fused into the forearm rather than parented to `Prop_Main`, so the two-handed grip solves onto skin | second |
| `gakuganji` | one arm at 158% — the guitar, same fault as Maki's polearm | second |
| `uro` | legs at 55% of normal and 29% of stature above the head: the proportions the Idle Review kept fighting (she needed 1.26× where the roster needed 1.02×) | second |

`nanami`, `nobara` and `yuji` measure uneven-armed (0.55–0.71) with no fused
prop. Look at them in the workbench's **Mannequin(s)** view before spending
credits — an uneven arm can be a pose, and none of the three reads wrong on
screen today.

#### Delivered — and the seed was never the art

All five rebuilt, all five through the gate. Against the roster's medians
(leg 21.5%, arm 11.3% of a model's own mass):

| Fighter | legs | arms | was |
|---|---|---|---|
| `momo` | **0.98** | 0.75 | 0.29 — "LEG NOT RECONSTRUCTED" |
| `maki` | **0.97** | **0.96** | 0.91 / 0.48 — "ARM NOT RECONSTRUCTED" |
| `gakuganji` | **0.97** | 0.86 | 0.41 / 0.73 — leg *and* arm |
| `uro` | 0.90 | 0.77 | legs at 19% of normal |
| `meimei` | 0.84 | 0.43 | fused arm at 287% of normal; now 151% |

Momo has two legs, Mei Mei has no horns, and Uro's hair finally extracts onto
its chain (3240 verts; the old model had **none** past the threshold). Mei
Mei's arm is the one number still outside the gate — it is her cape weighted
to one side, not a missing limb, and it is down from 287% to 151%.

**The boards were fine. We were feeding them in wrong.** A DI5 board is four
drawings in ONE png, and it was going to the single-image endpoint whole — so
the generator modelled the *picture*: four Momo statues in a row, one skeleton
fitted to one of them and the other three skinned onto her hands. That is the
entire "fused into one arm" signal, on all five, and it is why the first
rebuild measured *identical* to the models it was replacing. The weapon plates
are boards too: four brooms, four axes — which is what "her broom is divided
into many pieces" always was.

`tools/slice_turnaround.py` now cuts a board into its panels and
`tripo_generate.mjs` sends them to the **multiview** endpoint as separate
views (front, left, back; the ¾ panel is dropped, having no slot). Same art,
same round, same credits — one body out instead of four.

**The gate, before approval:** `blender -b -P tools/audit_model_health.py`.
A delivery is refused if any limb is under 70% or over 150% of the roster's
median for that limb, or if geometry sits more than 6% of stature above the
head without a hat to explain it. That check is why this round exists as a
list of measurements rather than a list of opinions — every one of these five
shipped through a facing review, a size review and a stance pass with nobody
noticing.

**THE ATTACH KNOWS WHICH END IS HEAVY, NOT WHICH END IS THE TOP.** `grip` in
`render3d/src/props.js` is measured from the heavy end, and the comment beside
it says why: which end is heavy is measurable and which end is the top is not.
That is true, and it is also a hole in the contract — nothing says which end
points AWAY from the hand, so the attach can seat a weapon perfectly and hand
it over upside down. Maki shipped with her blade at her feet and the butt of
the shaft past her head.

`python3 tools/flip_prop.py --char <key> --apply` turns one end for end by
rewriting a single node's rotation — no geometry, no skin, no texture, no
Blender. It is the STOPGAP. The fix is a tip direction in the prop spec and a
re-attach, and until that lands every newly attached weapon has to be looked
at.

**The same tool angles a CARRY**, with `--deg` and `--pivot hand`, and
Gakuganji is the case for it. His guitar is attached exactly as the spec says
— `grip` 0.75 of a 1.00 m instrument — so 0.75 m of it hangs below a hand that
his straightened arm puts at 0.95 m. That is physically right and it reads as
a red object lying on the floor, because his robe covers the neck and only the
body clears it. `--deg 45 --pivot hand` swings the whole attachment about the
hand, so the grip stays on the same fret and the instrument comes forward,
clear of the robe and clear of the floor.

Which way it swings is not a free choice: **−45° looked better in a still and
puts the body of the guitar through his hakama.** The direction that reads is
the one that moves the prop AWAY from the body, and the way to tell is to
render it from four sides rather than from the angle that prompted the
change.

**A REGENERATION IS NOT UNIFORMLY BETTER, AND ONE PART CAN BE MOVED ACROSS.**
Maki's D6 rebuild fixed her limb balance and her fused weapon and broke her
face: a flat plate of hair lands through the middle of it, hiding one eye
behind a hard vertical edge. Her boots came back bulkier than the pair they
replaced. Regenerating again re-rolls the whole body, including the parts that
came out right, so the fix is to move the good parts across —
`python3 tools/graft_model_part.py --donor old.glb --onto new.glb --part head
--part shins --out merged.glb`. She now wears the new body with the old head
and the old lower legs.

A part is defined by the BONES that own it rather than by a box, and it lands
by the two rigs' bind matrices — `bind_recipient(root) @
inverseBind_donor(root)` — so nothing is fitted or guessed. **The seam is the
whole risk**, which is why these two parts and not others: a neck seam sits
inside a collar and a knee seam sits inside a leg. Grafting the foot at the
ANKLE was tried first and tore, because the donor's slimmer boot met the
recipient's bulkier cuff at a change of silhouette; taking the shin with it
moves the join somewhere nothing changes shape.

The donor part keeps its own texture, as its own primitive with its own
material and the donor's image copied in beside it — two models do not share a
UV atlas, and repainting the part into the recipient's is a much larger job.

**The tears are already closed, and they were not a regeneration problem.**
Every delivered model but three arrived with holes in its surface — rims where
the generator ended the mesh instead of guessing at what it could not see from
the boards, most often where a forearm rests against the ribs or one thigh
hides behind the other. They read in game as slits that show the inside of the
body, and the toon pass makes them worse rather than better because the
interior faces light from the wrong side. `python3 tools/fill_model_holes.py`
reports them and `--apply` closes them: 120 tears across 23 rigs. A cap adds
one vertex per rim position and **invents only its texture coordinate** —
position, normal, JOINTS_0 and WEIGHTS_0 are all copied from the rim vertex it
sits on, because a skin weight this tool guessed at would be a vertex that
swims off the body the moment a clip plays, a worse fault than the hole and one
that only shows in motion. The UV is one coordinate for the whole cap, read off
the surviving surface around the hole, so the patch comes out the colour of
what it patches. Closing a rim over its OWN vertices instead — which is what
shipped first — paints the patch out of the wrong part of the sheet, because a
rim is exactly where the atlas is cut: Yuji's hip came out wearing the skin of
his hand. The tool now reports each model's worst cap as a multiple of a normal
triangle's atlas footprint, and refuses to be quiet about anything over 2×; the
version that shipped scored 46×. Rims wider than 26% of the
figure's height are left alone as hems: Momo's skirt and her broom bristles are
open surfaces on purpose, and a cap there is a lid. Re-run it after any
regeneration — a new delivery arrives torn.

**THE WEAPON IS A SEPARATE GENERATION.** Four of the five carry one, and a
weapon drawn in a hand is a weapon the generator fuses into the hand. So each
of them is two generations — the fighter empty-handed, the weapon alone — and
`tools/blender_attach_prop.py` joins them onto `Prop_Main` after conform,
scaling the weapon to its declared `lengthM` and putting its declared `grip`
point in the fist. That step is wired into `tools/build_model.sh`: drop the
weapon at `billboards/intake/<char>/_prop.glb` and the run picks it up.

It costs a second generation per armed fighter and buys three things beyond
the fusion going away: hands that are hands rather than fists moulded round a
shaft, a weapon that can be re-scaled or replaced without re-generating the
fighter, and `Prop_Main` finally carrying real geometry for Maki and
Gakuganji — whose two-handed grip has never engaged because their weapons are
body skin.

**While regenerating, two pipeline fixes ride along:**

- **Strip the stray.** Every one of the 27 delivered files carries an
  unweighted 42-vertex icosphere, 2 m across, from the generator. It is hidden
  so it never drew, but it is in every file and every download.
  `tools/blender_conform.py` now deletes unweighted meshes at conform.
- **A prop must be a prop.** Maki's and Gakuganji's weapons are body skin, not
  `Prop_Main` geometry, which is why the two-handed grip has never engaged for
  either of them. A regenerated model whose weapon is a separate object in the
  seed board can be bound properly at conform.

**Deliverable: 5 rigs, regenerated from DI5 boards, same intake as D3.**

---

## The budget, in one place

| | Rigs | Clips |
|---|---|---|
| D1 — pilot | 1 (or B1's + D-spec) | 26 (shared with B1) |
| D2 — library + archetypes | — | 44 (shared with B2) |
| D3 — standard roster | 22 | 132 (shared with B3) |
| D4 — bespoke bodies | 5 (+1 variant) | ~50 (shared with B4) |
| D5 — spectacle | — | ~20 smears/variants |
| **Total NEW cost if B-rounds deliver** | **D-spec passes only** | **~20** |

The headline: because the two backends read the same rigs and the same clips,
the D-rounds' marginal cost over the B-rounds is the D-spec additions (a
texture-channel pass and a normals pass per rig) plus D5 — not a second
roster. If the B-rounds never run, the D-rounds ARE the commissioning rounds
and the B-numbers retire.
