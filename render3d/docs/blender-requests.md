# Blender requests — modelling jobs for a person

**This file asks for MESH AND RIG WORK that needs hands in Blender.** It is the
sibling of [asset-requests.md](asset-requests.md) (which asks for whole models
and clips) and [image-requests.md](image-requests.md) (which asks for 2D). Same
rules: everything here is **outstanding**, jobs move to a history section when
they land, and job numbers (B1, B2…) are permanent so commits citing them keep
resolving.

---

## First, what does NOT need Blender

**Baking the correction layer into the `.glb`s does not.** That was the job
this file was opened for, and on inspection it is arithmetic rather than
modelling — writing it down here would be asking a person to do a computer's
work.

The corrections are a change to the **bind pose**. In glTF, skinning is

```
skinned vertex = Σ  weight · ( jointGlobal · inverseBindMatrix ) · vertex
```

so moving a fighter's bind from `B` to a corrected `B'` is three edits to the
file, all of them exact:

1. every skinned vertex moves by its own weighted blend of `B'ᵢ · Bᵢ⁻¹`
   (positions and normals; morph-target deltas take the linear part),
2. each joint node's local TRS is rewritten from `B'`,
3. each `inverseBindMatrix` becomes `B'ᵢ⁻¹`.

The engine already computes `B'` — `bakedBind` in `render3d/src/pose.js` puts a
rig into the bind, runs the correction layer over it with no pose on top, and
hands back a matrix per bone. The repo already edits glTF buffers directly in
Python (`tools/bake_bone_rotation.py`, `tools/fill_model_holes.py`). Going
through Blender adds an import/export round trip that rewrites materials and
drops the `toon` extras this project depends on — a cost with nothing bought.

*(An earlier attempt did route it through Blender, and the re-skin came out
with the skeleton right and the skin smeared. That is a symptom of the round
trip, not a reason to keep it.)*

**Also not here:** closing tears (`tools/fill_model_holes.py`), cutting a
generated weld (`tools/cut_fused_limb.py`), grafting a part from an older
generation (`tools/graft_model_part.py`), mirroring a lopsided skeleton
(`SYMMETRISE` in `render3d/src/rig_fixes.js`), or any correction that can be
written as a bone rotation — the rig bench at
`render3d/workbench/?edit=rigs` produces those as numbers.

**What IS here** is work that needs judgement about *shape*: geometry that has
to be modelled, removed or re-topologised, where no rotation and no script gets
there.

---

## How to deliver

**Upload to `render3d/intake/`, never to `render3d/assets/`** — the same rule
and the same folders as a full delivery ([../intake/README.md](../intake/README.md)):

```
render3d/intake/<char>/<char>.glb          the whole fighter, re-exported
```

One `.glb` per fighter, containing everything that fighter had before plus the
fix. Then the same flow a delivery takes:

```
python3 tools/fill_model_holes.py --file render3d/intake/<char>/<char>.glb
node tools/billboard_intake.mjs validate <char> --backend 3d
node tools/billboard_intake.mjs import <char>   --backend 3d
```

### What must survive the round trip

A Blender export rewrites more than the mesh, and these are the things this
project loses if nobody watches for them. **Check each one before handing back:**

| Must survive | Where it lives | How it breaks |
|---|---|---|
| `toon` extras | material extras: `shadeTint`, `shadeThreshold`, `outlinePx` | dropped silently on export; the fighter renders with the roster default and looks subtly wrong next to their sprite |
| Shade-bias | the baseColor texture's **alpha channel** | flattened if the texture is re-saved without alpha |
| Outline width | vertex colour, channel **R** | dropped if vertex colours are not exported |
| Bone names | the standard Mixamo set, no `mixamorig:` prefix | Blender renames on import/export collisions; every solver in the engine finds bones by name |
| Prop bones | `Prop_Main`, `Prop_Off` — bone-parented, unskinned | lost if props are joined into the body |
| Chain bones | `Chain_<name>_<i>` | the hair and braid physics find them by name |
| Clips | one per state, named for the state | `export_animations` must be on |
| Shape keys | Mahito's arm morphs | consumed by an `Apply Modifier` on a mesh that has them |

**The units and the origin do not change**: metres, Y-up, origin between the
feet. If the fighter comes back a hundred times too big, the export was in
centimetres.

---

## Open jobs

**None right now.** The list below is kept for the next round rather than
asking for anything today.

### B1 — the ¾-panel faces, if the roster ever gets another generation

Not outstanding, recorded so the next round does not rediscover it: the
generator's turnaround boards are sliced front / left / back and the ¾ panel is
dropped (`tools/slice_turnaround.py`). Feeding it whole produced four statues
in one file. If a future round wants the ¾ view used, it is a modelling job to
reconcile the two.

---

## Landed

### Inumaki's welded arm — done in code, no modelling needed

His left arm was generated welded to his side: one surface from forearm to hip,
invisible in the bind and stretching into a black membrane every time he ran.
`tools/cut_fused_limb.py` found it by weights (three shells, 248 faces, one of
them weighted to the forearm and the thigh at once) and removed it. Checked
from the front, three-quarter, below and behind: nothing shows through, and the
health audit reads arms balanced at 0.97.

The rim it left is open on purpose. The obvious repair is wrong — the rim spans
the gap the weld was filling, so capping it rebuilds the membrane, which
`fill_model_holes.py` duly did, 136 triangles of it, before anybody looked.
