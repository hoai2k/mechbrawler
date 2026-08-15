# Baking `yawOffsetDeg` into the rigs — a runbook

> **⚠️ DO NOT RUN THIS as written.** A later round
> ([asset-requests.md](asset-requests.md) §"why yawOffsetDeg stayed live")
> found that the pose-library clip builder READS `yawOffsetDeg` at build
> time: 702 of 729 clips are built at load against the un-baked geometry,
> and baking the yaw while zeroing the manifest key moved clip-driven poses
> by up to **1.1 m** (Hanami 1101 mm, Dagon 1112 mm) even though the
> rig-check pose matched to 0.0 mm. The rig check this runbook verifies
> with is blind to exactly the poses that break. Baking becomes safe only
> once the clip builder's dependence on the offset is removed — until then
> this document is the record of a verified mechanism, not a procedure to
> follow. The §5 import guard is still worth landing first regardless: an
> imported pre-baked rig whose manifest entry survives `billboard_intake
> import` would be turned twice today.

**Goal:** make each delivered `.glb` face the way the delivery spec says it
does, so the engine stops turning it at pose time and
`render3d/assets/manifest.json` stops carrying a per-character correction.

**Read this first, because it is not what we expected:** this does **not** need
Blender. Every rig in this repo has a scene shaped so the whole bake is one
quaternion written into the file's JSON chunk, with the binary chunk — every
vertex, weight and keyframe — copied through untouched. The tool is
[`tools/bake_yaw.mjs`](../../tools/bake_yaw.mjs): plain Node, no dependencies,
no install. Section 6 covers the Blender fallback for a rig that ever arrives
shaped differently; the tool refuses those by name rather than guessing.

---

## 1. Why the fast path is legitimate

Every one of the 27 delivered rigs has exactly this scene:

```
scene
 └── Armature          no transform · not a skin joint · not animated
      ├── <mesh>       skinned
      └── Hips         the skeleton root
```

Rotating `Armature` turns the mesh and the skeleton together, and nothing
downstream can undo it:

- **no animation channel targets it** — all 26 clips address the bones, so
  there is no track to overwrite the rotation the way a `Hips` track would
  overwrite a re-framed rest pose;
- **it is not a skin joint** — and per the glTF spec joint matrices are
  computed in world space, so rotating the joints' shared ancestor rotates the
  deformed result exactly as it rotates the bones;
- **the engine composes rather than replaces** — `pose.js` sets
  `rig.root.rotation.y` on the *scene* node, which is `Armature`'s parent.

A Blender round trip would reach the same place by re-exporting the entire
file, risking everything a re-encode can cost (extras, vertex-colour channels,
material graphs, keyframe resampling) in order to change one number. It is the
right tool for re-framing the **bone rests** — making bone-local `+Z` the
fighter's forward — but nothing in this engine reads bone-local forward any
more: every layer derives facing from the rig root's world quaternion
(`characterLateral` in `ik.js`) or measures it from the pose itself (the stance
solver's hip axis). So the cheap bake is also the complete one.

### It was verified before this document was written

Three rigs (maki 60°, dagon 80°, mahito 345°) were baked and rendered against
the same rigs with the offset applied live, through the game's own render path:

| state | result |
|---|---|
| `run` | silhouette IoU **1.0000** — pixel-identical |
| `light` | silhouette IoU **1.0000** — pixel-identical |
| `idle` | IoU 0.987–0.998, **bounding boxes identical** |

The `idle` residual is boundary anti-aliasing: idle is the one state that runs
the stance solver, whose world-space iterative pass rounds differently when the
same rotation is composed at a different level of the hierarchy. It is a
sub-pixel halo, not an orientation error.

---

## 2. What you need

- **Node 18+** (`node --version`). Nothing else — no npm install, no Blender,
  no Python.
- ~200 MB of disk for a sparse checkout.

---

## 3. Get the files

The repository's history is ~3 GB (it carries the sprite library), so **do not
plain-clone it**. Take a blobless, sparse checkout of just what the bake reads:

```bash
git clone --filter=blob:none --sparse https://github.com/hoai2k/jjkbrawler.git
cd jjkbrawler
git sparse-checkout set render3d/assets tools
```

That leaves you with the 27 rigs (`render3d/assets/<char>/<char>.glb`, ~54 MB),
the registry (`render3d/assets/manifest.json`) and the tool.

<details>
<summary>Alternative: download the rigs directly, no git</summary>

```bash
mkdir -p jjkbrawler/render3d/assets && cd jjkbrawler
BASE=https://raw.githubusercontent.com/hoai2k/jjkbrawler/main
curl -sL "$BASE/render3d/assets/manifest.json" -o render3d/assets/manifest.json
curl -sL "$BASE/tools/bake_yaw.mjs" -o tools/bake_yaw.mjs --create-dirs
node -e '
  const m = require("./render3d/assets/manifest.json");
  for (const [c, e] of Object.entries(m.characters)) if (e.model) console.log(e.model);
' | while read -r rel; do
  mkdir -p "render3d/assets/$(dirname "$rel")"
  curl -sL "$BASE/render3d/assets/$rel" -o "render3d/assets/$rel"
done
```
</details>

---

## 4. Find what to bake

The angles are already measured and already in the repo — you are not deriving
anything. Each character's correction is `yawOffsetDeg` on its manifest entry:

```bash
node -e '
  const m = require("./render3d/assets/manifest.json");
  for (const [c, e] of Object.entries(m.characters))
    if (e.model) console.log(c.padEnd(12), String(e.yawOffsetDeg ?? 0).padStart(4) + "°");
'
```

At the time of writing that is 21 rigs with a non-zero angle and 6 already at
0°. Where the numbers came from, and what to do if you doubt one:

- Most were solved by [`tools/solve_yaw.mjs`](../../tools/solve_yaw.mjs), which
  matches each model against its own idle **sprite** at every yaw and maximises
  silhouette IoU × colour agreement. Deriving facing from the skeleton was
  tried three ways and failed three ways — the comment at the top of that file
  is worth reading before anyone tries a fourth.
- A few were dialled by hand in the workbench (`/render3d/workbench/`, *Model
  size & facing*), which is why some are 15° multiples and some are 10°.

**If any angle still looks wrong, fix it before baking, not after.** Once it is
in the file, changing it is another round trip; while it is in the manifest it
is a live dial. This is the one step that is cheap now and expensive later.

---

## 5. Bake

Dry run first — it reports every rig and writes nothing:

```bash
node tools/bake_yaw.mjs
```

Then write:

```bash
node tools/bake_yaw.mjs --write            # -> ./updates/
node tools/bake_yaw.mjs --write --out /some/other/dir
node tools/bake_yaw.mjs --write gojo uro   # just these
```

You get:

```
updates/
  <char>/<char>.glb     only the rigs that had a non-zero angle
  baked.json            the receipt: which character, which angle, which node
```

Rigs already at 0° are skipped, not copied — there is nothing to change about
them, and shipping an identical file back would only add a diff.

`baked.json` is not decoration: it is what the intake side checks the manifest
zeroing against, so the "was this file baked?" question is answered by a record
rather than by a filename.

---

## 6. If the tool refuses a rig

It prints `FAIL <char> … — bake this one in Blender` and exits non-zero when a
rig is not the shape section 1 describes: more than one scene root, a root that
is itself a skin joint, a root some clip animates, or a root carrying a raw
matrix. Those are the cases where turning the root blind would be a guess.

For one of those, the Blender path is:

```bash
blender --background --python-expr '
import bpy, sys, math
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath="in.glb")
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
bpy.ops.object.select_all(action="DESELECT")
for o in [arm] + [c for c in arm.children if c.type == "MESH"]:
    o.select_set(True)
bpy.context.view_layer.objects.active = arm
arm.rotation_euler[2] = math.radians(YAW)   # Blender is Z-up on import
bpy.ops.object.transform_apply(rotation=True)
bpy.ops.export_scene.gltf(filepath="out.glb", export_format="GLB")
'
```

Two warnings about that path, both learned from the structure above rather than
from experience with it:

1. **It re-encodes the whole file.** Diff the glTF JSON before and after and
   confirm nothing else moved — particularly `extras`, `COLOR_0` and material
   definitions. (None of the current 27 rigs use any of those, which is part of
   why the fast path is safe today and might not be for a future delivery.)
2. **Applying the rotation changes the bone rests**, so every clip's `Hips`
   track has to come out rotated to match. Blender's exporter does that
   correctly because it bakes node-local TRS on export — but verify by playing
   a clip, not by reading the file.

---

## 7. Hand back

Upload `updates/` to `render3d/intake/` — one directory per character, the same
shape intake already expects:

```
render3d/intake/<char>/<char>.glb
render3d/intake/baked.json        (the receipt, alongside)
```

Then the zeroing happens with the import, in one commit, per character.

### The hazard this ordering exists to prevent

`billboard_intake.mjs import` currently **preserves** the existing manifest
entry (`{ ...man.characters[char], model, heightM, approved }`), which is
normally exactly right — it is what keeps `renderScale`, `stanceDeg` and the
`toon` block across a re-import. But it means a baked rig imported today would
keep its old `yawOffsetDeg`, and **the fighter would be turned twice**: 45°
in the file plus 45° at pose time. Ninety degrees off reads as a bug in the
model, not as a stale field, which is exactly the kind of thing that costs an
afternoon.

So the import side needs one change before any baked file lands: read
`baked.json` and set `yawOffsetDeg: 0` for every character it names, refusing
the import if a character's baked angle does not match what the manifest
currently says (that mismatch means the file was baked from a different
measurement than the one on disk). That is a small change to
`tools/billboard_intake.mjs` and it is on our side — flag when you are ready
and it goes in with the import.

---

## 8. Acceptance test

The measurement tool is also the check. After the baked rigs are imported and
the manifest is zeroed, with the game served locally:

```bash
node server.mjs &
node tools/solve_yaw.mjs
```

Every character should now solve to **0°** (or within one 10° step of it) —
that is the same silhouette-and-colour match against the sprite that produced
the original numbers, run against rigs that should no longer need correcting.
Anything reporting a large angle was baked wrong or zeroed without being baked.

Then the usual gates:

```bash
npm run check                  # includes the render3d manifest validation
node tools/smoke_facing.mjs    # which way fighters face, measured as dot products
node tools/smoke_render3d.mjs  # the backend end to end, including determinism
```

---

## 9. A note on doing it here instead

None of this needs a local machine any more — the tool is verified, the rigs
are already in the repo, and the whole job is `node tools/bake_yaw.mjs --write`
plus a manifest edit. Running it locally is worth it if you want to eyeball
each rig in the workbench between the bake and the import, or if you would
rather the 21 rewritten `.glb` blobs enter history from your machine. If not,
say the word and it can be one commit from here.
