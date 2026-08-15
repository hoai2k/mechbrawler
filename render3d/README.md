# `render3d/` — the live-3D anime character rendering path

Rigged 3D models animated at full frame rate, rendered in a hand-drawn anime
style — toon-ramped, ink-outlined, stepped on twos — and blitted into the
same 2D world the sprite path draws into. The billboard path's heir: same
delivery spec, same 26-state clip contract (imported from
`billboards/src/states.js`, never copied), same per-character fallthrough to
sprites. **Phase D0 and the D1/D2 engine side are built**: live playback,
the anime pass, foot IK, real turnarounds, aimed strikes, head look-at, hurt
flinch, micro-parallax and stage-derived lighting all run today, proven by
the mannequin and a generated test delivery. What it waits on now is art
(round D1 in [docs/asset-requests.md](docs/asset-requests.md)).

    node server.mjs
    open 'http://127.0.0.1:5174/?render=3d'               # the real thing
    open 'http://127.0.0.1:5174/?render=3d&mannequin=none' # sprites where no rig exists
    open 'http://127.0.0.1:5174/render3d/workbench/'      # look-dev + review
    open 'http://127.0.0.1:5174/?render=3d&shade=roster'  # every fighter on the OLD shared shade tint

`?render=render3d`, `?render=model(s)` and `?render=anime` are aliases
(src/render_backend.js). The backend NAME is `3d`; the directory is
`render3d/` only to avoid a leading digit.

**`?shade=roster`** turns per-character shade grading off. Every fighter's
shadow colour is measured from their own DI3 palette sheet
(`tools/derive_toon_from_shade.py` → the `shadeTint` in
`render3d/assets/manifest.json`); this flag puts the whole roster back on the
one shared default it used before, so the change is one URL apart to judge.
It affects only the MEASURED tint — art direction somebody dialled by hand in
the workbench still applies — and it reaches the workbench too, which is where
you would actually be looking closely.

- **[docs/plan.md](docs/plan.md)** — the implementation plan: the anime
  look, the live layers, the cost model, phases, risks.

Strikes **aim and reach**: attack states pitch toward the target and the
striking limb is solved onto it by the shared two-bone IK
(`billboards/src/ik.js` — the same solver, the same clip contract). Facing here
is a real 180° yaw rather than a mirror, so the reach target is built in the
rig's own frame and pushed through `localToWorld`; that is what keeps a
left-facing fighter reaching the way they are actually facing.
- **[docs/asset-requests.md](docs/asset-requests.md)** — the D-rounds: every
  rig and clip, the D-spec additions over the billboard delivery spec
  (shade-bias map, outline vertex colors, edited normals, shade palettes).
- **[docs/image-requests.md](docs/image-requests.md)** — the 2D images this
  track needs: turnaround boards for image-to-3D seeding (Tripo et al.),
  face sheets, shade palette swatches, shared face textures.
- **[intake/README.md](intake/README.md)** — where deliveries land and how
  they get into the game (`tools/billboard_intake.mjs … --backend 3d`).

```
render3d/
  src/         the pipeline: backend.js (registry entry), loader.js (rig
               registry + clip inheritance), pose.js (on-twos sampling + the
               live layers, every dial), toon.js (ramp/shade/rim), outline.js
               (ink shells), scene.js (offscreen WebGL + pose cache + stage
               light rig), blit.js (into the 2D world; no mirror — turnaround)
  assets/      approved runtime rigs + manifest.json (the registry)
  intake/      deliveries land here; validate -> import -> review -> apply
  workbench/   /render3d/workbench/ — pose editor, look-dev dials,
               sweeping-light check, comparison sprite, aim crosshair,
               clip inheritance, approval; ?edit=pose is the SPRITE POSE
               EDITOR (sprite_pose.js), a separate tool on the same page
  docs/        plan, asset requests (D-rounds), image requests (DI-rounds)
```

## Reading the art: the sprite pose editor (`?edit=pose`)

Upstream of every clip is a question the clip cannot answer: what does this
fighter's own art actually do? `/render3d/workbench/?edit=pose` is where that
gets written down — sixteen joints dragged onto each frame, the fighter's own
rig taking the pose beside it, and a JSON download at the end. The data lives
in `sprites/docs/pose-reads/` and drives nothing in the game yet; it is the
reference the clip tables get checked against. See
[sprites/docs/pose-reads.md](../sprites/docs/pose-reads.md) for the format, the
orientation and sidedness rules, and what reading Yuji's sheet turned up.

## Posing by hand: the workbench pose editor

The clip library was authored blind — each state's default clip is a guess at
the read of the sprite it replaces — and "the arm is too low" is not a note
anyone can apply. **Edit pose** in `/render3d/workbench/` turns it into
keyframes.

It edits EXTREMES, not frames. A clip is a handful of poses with a timing and
a curve between them (`billboards/src/clips.js`), so the editor gives you the
extremes and nothing else: pick a key from the strip, pose the body, choose how
it travels out of that key (`ease`, `snap`, `back`, `hold`…), and the
in-betweens rebuild. Keys can be added at the playhead or at the contact beat,
and removed. Dragging a joint rotates its PARENT bone so the limb points at the
pointer; joints too small to hit are reachable from **Selected joint** with
per-axis sliders. The playhead snaps to the selected key, so what you drag is
what you change.

**Two spaces, and the panel always says which.** Some bones are not the clip's
to pose: in an attack `ik.js` solves the striking arm onto the aim point and
the spine pitches toward it, and a keyframe on those is overwritten a
millisecond later. Those bones are classified per state (`boneOwners` in
`src/pose.js`), drawn as diamonds rather than discs, and their edits are stored
as offsets applied AFTER the solve — which is also the truer note, since it
holds at every angle the strike can be thrown at rather than just the one on
screen. **Output changes** downloads `clip-edits.json`:

```json
{ "kind": "render3d-clip-edits",
  "characters": { "gojo": { "light": {
    "duration": 0.167, "beat": 0.083,
    "keys": [ { "t": 0, "ease": "in",   "pose": { "Spine": [2, -14, 0], … } },
              { "t": 0.037, "ease": "snap", "pose": { … } },
              { "t": 0.083, "ease": "out",  "pose": { … } } ],
    "targetSpaceOffsetsDeg": { "RightForeArm": [ { "t": 0.083, "deg": [0, 0, 18] } ] } } } } }
```

The `keys` drop straight into the `POSES`/`stateKeys` tables in
`billboards/src/mannequin.js`. `targetSpaceOffsetsDeg` deliberately does not:
those bones are solved at pose time, so the note belongs in the solver's
shares, not in a clip. Everything lives in the page only; nothing on disk moves
until the JSON is applied by hand.

## Two paths, two ways of facing left

Which way a fighter faces is answered differently depending on who is holding
the camera, and the two answers must not be combined.

- **Flat blit** (`?render=3d` drawn into the 2D world) renders through an
  offscreen camera pinned at −60°: the ¾ view comes from the LENS, and the
  fighter stands wherever their delivery leaves them. Facing left therefore has
  to be *built* — `pose.facingYaw` measures the angle the body presents at and
  re-aims it to the mirror of that angle. This path asks for it explicitly, via
  `presentMirror: true` on the live layers.
- **In-scene** (`?camera=3d`, the default) renders through the game's own
  head-on camera: the ¾ comes from the FIGHTER, whom `scene.sceneFacingYaw`
  yaws to ±¾. That *is* the mirror, exactly and by construction, so this path
  sets no `presentMirror` and keeps its own turn.

Layering one on the other mirrors twice, about an angle measured against a
camera that is not the one looking. `facingYaw` used to infer "facing left"
from the turn yaw being non-zero — true in the flat path, true of *both*
directions in the scene — so every fighter in the scene faced left in every
locomotion state while their attacks still turned correctly. `tools/smoke_facing.mjs`
covers both paths.

## Size and facing, per delivery

Two facts about a MODEL that no clip can carry, both on the manifest entry and
both dialled in the workbench under **Model size & facing**:

- `renderScale` — how big this rig is drawn against the character's
  head-height target. It is a hand setting, because "how tall the character is"
  and "how tall the model measures" differ for reasons that are a judgement
  call: nobody idles at full stretch, a stance with the legs apart drops the
  hips, and the top of the art is hair rather than skull. The panel offers the
  measurement (`idle measures 1.61 m against 1.70 m declared → 1.056× would
  stand exactly 157 px`) and a one-click **Use measured**, but the number is
  yours.
- `yawOffsetDeg` — which way the rig faces. The delivery spec says forward is
  +Z; a model built the other way round faces backwards in every state and no
  clip can fix it, because the whole rig is turned. 180 is the common case
  (Maki and Uro both arrived this way).
- `shoulderOutCm` — how far this fighter's arm roots move out from the body,
  in centimetres. **Seeded from a measurement**: a clavicle's length as a
  fraction of stature runs 2.9% to 14.7% across the roster against a median of
  9.9%, and the nine fighters set here are the ones measurably short — the
  value brings each up to that median. It is a starting point for the eye, not
  a verdict; the review dial is what settles it. A generated clavicle often comes out short, which reads as
  the shoulder nearest the camera being squashed into the ribs; this moves
  where the arm STARTS without lengthening the arm. The engine already squares
  the pair — both clavicles go back to their bind rotation, because the
  delivered clip's shoulder is where the asymmetry came from (Gojo's arm roots
  sat 6 cm apart in height and 3 cm apart in distance from the spine).
- `armDeg` — how far this fighter's idle arms hang out from the body, in
  degrees, and the legs' `stanceDeg` one axis up. Unset means the roster's own
  number (`IDLE_ARM_DEG`, 9°); a heavy coat or a wide body wants more room than
  a school uniform does, and only the drawing can say how much. Dialled in the
  Idle Review beside size, stance, head and facing.
- `kneeDeg` — how far this fighter's shins swing in or out at the KNEE,
  degrees about the fighter's own forward axis, positive bringing the feet
  toward the midline. The hips and the knees do not move; only what hangs below
  them does, so the bow comes out of the leg without the width coming out of
  the stance. Each sole is re-levelled afterwards so a foot keeps its angle to
  the ground. Yaw is left alone: which way the toes point is a pose.

  **The bone is `${side}Leg`** — the shin, whose head is the knee joint. `UpLeg`
  is the thigh. Worth stating because the name reads like the whole limb, and
  two earlier versions of this dial grabbed the wrong end of it: turning the
  thigh moves everything hanging off it, so the knee and the ankle both travel
  and the fighter simply stands narrower, which is `stanceDeg` with a second
  name on it.

  **What the measurement says about using it.** `tools/rig_calibrate.mjs`
  reports two frontal-plane numbers on the posed idle: each knee's BOW off the
  hip-to-ankle line, which is what this dial moves one for one, and each leg's
  LEAN off vertical, printed beside it because the two are easy to confuse and
  only one is a defect — a leg can lean a long way while standing perfectly
  straight. Every fighter currently reads a bow of 0.0° and a lean equal to
  their own `stanceDeg` to a tenth of a degree, because `applyIdleStand` aims
  both leg bones down one line. So nothing on the roster carries a value here,
  and if a fighter reads as bandy in their idle, the number to look at first is
  their stance.

  Two earlier readings of "the knees bend outward" are recorded here so they
  are not tried again. The bind's frontal kink is real and large (Geto's shins
  jut 18° and 34° out of their thighs) but does not survive posing, and
  correcting it added 2.9° and 5.4° of kink to a leg that had none. A ROLL
  about each leg's own length squares a kneecap and a toe to the front —
  several rigs are built externally rotated, Geto and Choso by about 80° of
  hinge axis — but a roll cannot move a knee closer to its neighbour.

- `idleArms` — set `false` to keep this fighter's delivered idle arms. The
  engine otherwise rebuilds them, straight and hanging a few degrees out from
  the body (`ik.js applyIdleArms`), for the same reason it rebuilds the legs: a
  generated idle arrives with whatever the generator felt about standing, it is
  different on every fighter, and it reads as sloppiness rather than as
  personality. Measured across the roster before the rule, the idle elbow ran
  from 171° to 104° — a hand held at the chest — and the wrist's distance from
  the body's centreline varied SIX-FOLD. Sukuna is the one `false`: his
  delivered idle is a pose somebody wants.

  **The elbow keeps the bend the model was built with.** Forcing the arm dead
  straight is what made Gojo's elbow read as hinging backwards: a bind pose
  carries 27–33° of elbow bend across the roster (Nanami's left arm 78°), and
  straightening it rotates the forearm that far against skin weighted for the
  bent pose, so the mesh folds at the joint. The arm swings as one rigid piece
  from bind instead, clamped at `MAX_IDLE_ELBOW` for a bind that arrived
  mid-pose.

  **The arms are aimed from the BIND pose, not from the delivered clip**, and
  that is what decides which way an elbow points. Aiming from wherever the clip
  left the arm sets the bone's direction and inherits its TWIST, and for a limb
  the twist is what the joint below it hinges about — Gojo's upper arm came out
  rolled, so his elbow bulged forward and the arm read as hinging backwards.
  The bind pose is the only place a bone's neutral roll is recorded (it comes
  out of the skeleton's `boneInverses`), and the rotation onto the hanging
  direction is a pure swing, which adds no twist of its own.

  **A weapon needs no special case.** A prop hangs off the hand bone, so
  straightening the arm carries it to the fighter's side; Maki's naginata ends
  up vertical with its butt near the floor, which is the carry. Putting the
  off hand on the shaft in idle was tried and reverted — the grip solve places
  it a fixed distance down-shaft, which is right for a weapon presented across
  the body and absurd for one hanging at the side, and it sent Maki's off arm
  straight up over her head.
- `headTiltDeg` — how the fighter carries their head, in degrees of nod;
  positive lifts the chin. Generated heads arrive modelled looking slightly
  down, and the tilt is in the MESH rather than the skeleton: measured
  across the roster the joints come out level to within a degree, so there
  is nothing in the rig to detect it from and no clip can fix it — every
  state inherits the same stoop. Dialled by eye against the drawing in the
  Idle Review, beside size, stance and facing.

  The Idle Review carries a **Revert** per fighter. Every dial in this bench
  edits the live manifest in place, which is what makes them feel immediate and
  left exactly one way back from a number moved by accident: reload the page
  and lose the whole session's work to undo one fighter's. Revert restores that
  one entry to what the file said at boot — the placement numbers, the head
  carriage, and the look overrides, which have to be actively un-pinned from
  the materials rather than merely dropped from the entry. **On a phone the
  review shows one dial at a time**, picked from a dropdown where the label
  sits, because four dial rows plus the buttons is most of a phone screen and
  the screen is what the pass is for.

  These are corrections the ASSET should have carried, so they are on their
  way into the files themselves: `tools/bake_yaw.mjs` writes each rig's yaw
  onto its scene root — a JSON-chunk edit, no Blender, binary chunk
  untouched — after which the manifest field goes to 0. The runbook is
  [docs/bake-yaw.md](docs/bake-yaw.md). `renderScale` and `stanceDeg` stay
  live on purpose: those are dials you keep turning, not facts the file
  got wrong.

The comparison sprite can stand BESIDE the model instead of ghosting under it
(the honest side-by-side for "does this match the sprite"), and the viewer
zooms — slider, ± buttons, scroll wheel — and pans by dragging the background,
which is what makes a 384 px render's hands editable at all.

**On a phone** the same page turns modal: the viewer owns the screen, a bottom
toolbar names the four jobs (Scene / Pose / Look / Clips), and each opens the
matching section of the same panel as a bottom sheet — same controls, same
wiring, nothing forks (`workbench/mobile.js` + the media query in
`workbench.css`). Two-finger pinch zooms the viewer, one finger drags bones
(with a fatter hit ring for fingertips), tapping the viewer drops the sheet,
and opening Pose enters edit mode. Compare-beside plus Output changes — the
review-and-adjust loop — works end to end on a phone.

Smoke: `node tools/smoke_pose_edit.mjs` — handles land on joints under zoom and
pan, the drag leaves the limb pointing at the pointer to within a degree, an
edit lands on the selected extreme and the rebuilt clip eases through it, the
two spaces stay apart, and both delivery dials bite.

Smoke: `node server.mjs` then `node tools/smoke_render3d.mjs` — mannequin
match, on-twos render budget, pixel probe, determinism (same token ->
identical pixels), and the delivered-.glb intake path end to end.

Also `node tools/smoke_facing.mjs` — which way the fighter faces and that the
live layers nod rather than twist, on BOTH model backends. Both were wrong on
the first delivery and neither was visible at 384 px, so they are measured as
dot products and degrees instead of looked at.
