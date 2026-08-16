# Notes for `tools/export-mech.mjs` (the ROBOTWORLD repo)

**Audience: whoever maintains Mech Mayhem's mech exporter.** This document is
written from the receiving end — MECH BRAWLER imports those `.glb` files and
plays their clips with a plain three.js `AnimationMixer`, no MM animator, no
rig adapter, nothing. That is the situation the export exists for, and it is
the situation that found these bugs.

Everything below was measured, not guessed. The two tools that measured it live
in this repo and can be pointed at any export:

| tool | what it answers |
|---|---|
| `tools/probe_clip_coverage.mjs` | is a clip a FUNCTION OF ITSELF? It poses a state twice, from two different previous states, and reports the bones that end up in different places. Anything non-zero means the clip does not cover the skeleton. |
| `tools/verify_clip_fidelity.mjs` | does the export SAY WHAT MM SAYS? It drives both games — MM's live animator through its own dev server, and the exported `.glb` through a bare mixer — and diffs every bone at five points of every clip, fitting out the scale and any folded yaw so a deliberate transform is not mistaken for a fault. |

A patch implementing the two fixes is in [`mm-export-fix.patch`](mm-export-fix.patch).

---

## Fix 1 — every clip must state the whole skeleton

`sampler.tracks()` dropped any track whose value never changed. On titanus that
left `punchHold1` driving 11 bones of 26, and `block` driving 7.

Inside MM that loses nothing: the animator is a pose function over the entire
body, and a clip key naming a few joints is composed onto a base that writes
all of them, every frame. Outside MM there is no base. An `AnimationMixer`
writes the bones a clip has tracks for and leaves every other bone exactly
where the last clip left it — so an attack arrived as an upper body welded onto
whatever the previous animation happened to be doing.

Only the five held poses (`battleIdle`, `crouch`, `hover`, `jumpRise`,
`jumpFall`) were full-body, because `samplePose` already passed `keep`. That is
why the idle always looked correct and every attack did not.

**The fix:** pass `keep` (the baked bone set) from `sampleClip` and `sampleGait`
as well. Cost is a few hundred KB of constant tracks per mech against ~9 MB of
mesh. The rule to keep: **an exported clip is a complete pose, not a delta.**

## Fix 2 — do not fold the transform into the data

`bakeModelTransform` folds `yawOffset × modelScale × heightScale` into the
vertices and into the root bone's rest. The animation, meanwhile, is sampled
from the live build, which is in neither the rotated nor the scaled frame.

The result is not a mech facing the wrong way. It is a mech that **tears**: the
mesh is bound in the folded frame, the clip drives the skeleton toward the
unfolded one, and every joint below the root deforms its skin through a
rotation the vertices never took. Standing still it reads as a few degrees of
wrong facing; a punch pulls the arm into taffy, and it gets worse the further a
pose travels from bind. That is exactly how it was reported: *"even his normal
punch causes his geometry to do all sorts of weird things."*

Two ways to fix it, and the second is the one this game uses:

1. **Fold the sample too.** Premultiply the fold's rotation into the ROOT
   bone's sampled quaternion and apply it to the root's scaled position — the
   same treatment `bakeModelTransform` gives the rest pose. This is in the
   patch. It fixes most of the tearing but was not clean in every clip here, so
   it is offered as the compatibility path rather than the recommendation.
2. **Do not fold at all** (`?nofold` in the patch). Export the model, the
   skeleton and the clips in the build's own frame, where they agree by
   construction, and put the yaw and scale on the NODE ABOVE THE JOINTS. glTF
   already has a place for it, a joint's ancestors are honoured by every
   importer, and a transform there applies rigidly AFTER the skin has deformed
   — so it cannot deform anything. This is verifiably clean: 33 of titanus's 35
   clips match MM's own animator to within 5% of a body height, and the two
   that do not are the gaits, where the comparison itself does not align cycle
   phase.

   `tools/fold_export.py` in this repo does the node-transform step, and could
   sensibly move into the exporter.

**The rule to keep: the model, the skeleton and the animation must share one
frame. If a transform has to be applied, apply it above the joints.**

---

## Fix 3 — two mechs' muzzle anchors are not on a muzzle

The `anchor_<name>` empties are the best thing in this export: `core`,
`overhead`, `boostL/R` and `muzzleL/R` per mech, parented to the bones that
carry them, so they follow the animation. This game now reads the muzzles —
`tools/derive_muzzles.mjs` poses each rig in its own shoot clip and takes the
anchor, and every shot in the game spawns there. Fifteen of the seventeen land
exactly where the art says a barrel is: Wraith's on his rifle tip 82% of a body
forward, Tritone's on the barrels at 98%, Vulcan's on the gatling at 56%.

Two do not, and both look like the exporter rather than the model.

**Nullbot — both anchors are the hips fallback.** `muzzleR` and `muzzleL` are
parented to `hips`, they are within 2px of each other, they are **12px below
the foot line**, and they do not move in ANY clip (idle, shoot, lunge and the
ult all read 18, +12). That is the signature of the search for a weapon bone
failing and something parenting to the root instead. A shot leaving there comes
out of the floor between his feet.

**Colossus — the anchors are on the rear artillery tubes.** `muzzleR`/`muzzleL`
sit **behind the centre line in every pose measured** — -17px in idle, -40px at
the release beat of `brace`, -53px at the deepest point of the ult, all of them
about 1.2 body-heights up. Read against the model, that is the pair of tubes
over his back, and it may be exactly right for MM, where a mech is seen from
any angle and artillery can fire over its own shoulder. It is unusable in a
side-on fighter: the shell would appear behind him and fly out through his
chest. If those tubes are what he fires, this game needs a second anchor on
whatever faces forward; if they are not, the anchors are on the wrong bone.

Both mechs are excluded from the generated config and fall back to a
roster-wide default, so they are the only two whose guns still fire out of the
middle of the machine.

**The rule to keep: an anchor should be somewhere a thing can come OUT of, and
a fallback should be absent rather than wrong.** An anchor that quietly lands on
the hips is worse than no anchor at all — the importer cannot tell it from a
real one without measuring it against the body, which is what this game now has
to do.

---

## Advice for anyone exporting from a procedural animation system

These are not exporter bugs; they are the traps this conversion fell into. They
are worth stating in the exporter's own README.

**Sample from a settled animator, never a cold one.** MM's animator is a
smoother over an integrator: `cur` eases toward the frame target, the pelvis
follows measured sole clearance, the carriage layer damps in. None of it is at
rest when you call it. Recording frame 0 cold captures the PREVIOUS clip still
sliding — every attack opened on a body mid-transient, and an importer
cross-fading idle → attack saw the legs snap on the first frame of every
strike. `settle()` (90 frames at the neutral context) fixes it, and every
sampler must use the SAME neutral or the clips disagree about what standing is.

**A pose is what the animator writes, not what the clip data says.** The clip
tables in `animations.js` name a handful of joints per key; the pose is all of
them. Sample the resulting skeleton, never the authored keys.

**`postAnimate()` is part of the pose.** Anything the mech does after the
animator — signature layers, chain settling, foot placement — is in the body
the player sees, so it has to be in the sample. Call it inside the sampling
loop, as the exporter already does.

**Name the bones the importer will get.** A build carries bones the baked
skeleton does not (titanus: 66 vs 26), and a track that binds to nothing is
silently dropped — three's `GLTFExporter` drops the WHOLE clip on the first
unbindable track. Saurion once exported 25 clips and arrived with
`animations: 0`. Always rename through the bake's map and restrict to the baked
bone set.

**Sampled gaits need a phase, not a clock.** `walk`/`run` are procedural. They
loop seamlessly only if sampled over exactly 2π of animator phase, which the
exporter does — worth keeping, and worth knowing when comparing two independent
samplings, because they will not start at the same phase and a naive diff will
blame the toes.

**Say what could not be sampled.** The sidecar's `failed` list is the only way
the receiving engine learns a state has no clip. Keep it, and keep it accurate.

**Things the receiving engine still has to do, which no export can fix:**

- *Foot grounding.* A mech's carriage sits some way above the rig's own floor;
  the importer has to settle the body onto its ground line per state. In this
  game that is `standOnGround` in `render3d/src/pose.js`.
- *Unit conversion at the seam.* If the transform rides on a node (Fix 2), any
  correction measured in world units and applied to a BONE-LOCAL position must
  be divided by the scale between them — and by only that scale, not the
  camera's zoom as well. Both mistakes were made here; both put the mechs
  through the floor.
- *Facing.* The export's `+z is forward` is a promise about the FILE. Which way
  a body is turned inside a given clip is a separate question, and a game that
  needs a profile view has to measure it (`calibrateCompass`).
