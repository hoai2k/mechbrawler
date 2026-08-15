"""Conform a generated rig into a delivery this repo's intake accepts.

Run headless — no GUI, no interaction, so it works the same on a laptop, in
CI, or in an agent container:

    blender --background --python tools/blender_conform.py -- \
        --in  billboards/intake/yuji/_raw.glb \
        --out billboards/intake/yuji/yuji.glb \
        --char yuji

WHY THIS EXISTS. A 3D generator (Tripo, Meshy, Rodin…) and an animation
library (Mixamo and friends) each have their own bone naming, their own scale
and their own clip timings. Our delivery spec has exactly one of each
(billboards/docs/asset-requests.md), and `tools/billboard_intake.mjs validate`
enforces it. Everything between "the generator gave me a file" and "intake
accepts it" is mechanical, so it is a script rather than a manual pass — and
it is the same script for all 28 fighters, which is the whole point of paying
for it once during round B1.

WHAT IT DOES, in order:

  1. Import the .glb.
  2. Rename bones onto the standard skeleton — strips `mixamorig:` prefixes,
     maps common generator spellings (`upperarm_l`, `LeftUpperArm`, `thigh.L`)
     onto our names. Blender fixes animation data paths as bones are renamed,
     so clips follow their bones.
  3. Scale and orient: the figure ends up in metres at the character's real
     height, Y-up, facing +Z, origin on the floor between the feet.
  4. Retime every action to the duration its state declares in
     render3d/src/states.js — the timing contract combat is tuned around.
     An action whose name is not a state is reported and left alone.
  5. Add any missing prop / chain bones the roster expects for this character
     (render3d/src/props.js), empty, so a rigger has the hook to hang art on
     and the validator stops warning about a missing weapon.
  6. Rescue a held weapon from the skin passes. A generated polearm arrives
     bound by proximity — foot influences at the bottom of the shaft — and
     step 7's skeleton-distance logic would then saw it in two at the boot
     (it did: Maki's staff). Weapon vertices in the shaft column are rebound
     wholly to the prop hook, which is reparented onto the gripping hand.
  7. Extract a declared hair chain out of the head's skin. A generator binds
     long hair rigidly to Head, so it can only ever move exactly as the skull
     does; a chain declared `fromSkin` in props.js is carved back out of that
     skin onto its own bones, which is what lets the sway layer move it
     separately (Uro's mane).
  8. Prune skin weights the skeleton says are impossible — an auto-binder
     routinely gives trouser vertices to a hand bone, which is how round B1's
     fighter came to carry his trousers up with his arm
     (tools/blender_clean_weights.py).
  9. Grade the texture onto the fighter's canon costume colours where the
     roster declares them — a generator gets the hue right and the value
     badly, which is how round B1's fighter arrived in a navy so dark it read
     as black (tools/blender_grade_texture.py). No-op for a fighter with no
     palette entry, and safe to re-run.
 10. Export .glb.

It never invents animation. Retiming stretches what is there; a clip whose
CONTENT is wrong (a strike that peaks in the wrong place) is a review finding
for the billboard workbench, not something a script can fix.
"""

import argparse
import collections
import os
import re
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blender_clean_weights import clean_all  # noqa: E402
from blender_grade_texture import grade_char  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATES_JS = os.path.join(REPO, "render3d", "src", "states.js")
PROPS_JS = os.path.join(REPO, "render3d", "src", "props.js")
CHARACTERS_JS = os.path.join(REPO, "src", "characters.js")

FPS = 30

# ------------------------------------------------------------------ the spec
#
# Read from the modules that already own these facts rather than restating
# them — states.js is the single source of the state list and its timings, and
# a copy here would drift the first time a duration is tuned.


def load_states():
    src = open(STATES_JS, encoding="utf8").read()
    body = re.search(r"export const STATES = \{(.*?)\n\};", src, re.S)
    if not body:
        sys.exit("could not parse STATES out of render3d/src/states.js")
    states = {}
    for m in re.finditer(r"^  (\w+):\s*\{([^}]*)\}", body.group(1), re.M):
        name, fields = m.group(1), m.group(2)
        dur = re.search(r"duration:\s*([\d.]+)", fields)
        beat = re.search(r"beat:\s*([\d.]+)", fields)
        loop = "loop: true" in fields
        states[name] = {
            "duration": float(dur.group(1)) if dur else 0.5,
            "beat": float(beat.group(1)) if beat else None,
            "loop": loop,
        }
    return states


def load_expectations(char):
    """Prop and chain bones the roster expects for this fighter."""
    src = open(PROPS_JS, encoding="utf8").read()

    def block(name):
        m = re.search(r"export const %s = \{(.*?)\n\};" % name, src, re.S)
        return m.group(1) if m else ""

    props = []
    entry = re.search(r"^  %s:\s*\[(.*?)\],?$" % re.escape(char), block("CHARACTER_PROPS"), re.S | re.M)
    if entry:
        # Per {...}, so `hand` and `rescue` are read off the SAME entry as the
        # bone they qualify — the same trap the chain parse below documents.
        for p in re.finditer(r"\{([^}]*)\}", entry.group(1)):
            f = p.group(1)
            bone = re.search(r"bone:\s*\"(\w+)\"", f)
            if not bone:
                continue
            hand = re.search(r"hand:\s*\"(\w+)\"", f)
            resc = re.search(r"rescue:\s*\"(\w+)\"", f)
            props.append({
                "bone": bone.group(1),
                "hand": hand.group(1) if hand else None,
                "rescue": resc.group(1) if resc else "pole",
            })

    chains = []
    entry = re.search(r"^  %s:\s*\[(.*?)\],?$" % re.escape(char), block("CHARACTER_CHAINS"), re.S | re.M)
    if entry:
        # One chain per {...} so `fromSkin` is read off the SAME entry as its
        # name — scanning the whole block for the flag would arm every chain
        # a fighter has the moment one of them declared it.
        for c in re.finditer(r"\{([^}]*)\}", entry.group(1)):
            f = c.group(1)
            name = re.search(r"name:\s*\"(\w+)\"", f)
            frm = re.search(r"from:\s*\"(\w+)\"", f)
            seg = re.search(r"segments:\s*(\d+)", f)
            if not (name and frm and seg):
                continue
            chains.append((name.group(1), frm.group(1), int(seg.group(1)),
                           "fromSkin: true" in f))
    return props, chains


def canon_height_m(char):
    """The fighter's real height, from their kit. Falls back to the working
    height the game itself uses for a fighter with no published figure."""
    src = open(CHARACTERS_JS, encoding="utf8").read()
    m = re.search(r"^  %s:\s*\{(.*?)\n  \}," % re.escape(char), src, re.S | re.M)
    if m:
        h = re.search(r"heightCm:\s*([\d.]+)", m.group(1))
        if h:
            return float(h.group(1)) / 100.0
    return 1.90


# --------------------------------------------------------------- bone naming

STANDARD = [
    "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
    "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
    "RightShoulder", "RightArm", "RightForeArm", "RightHand",
    "LeftUpLeg", "LeftLeg", "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot",
]

# Spellings seen from generators and animation libraries, normalised (lowercase,
# punctuation stripped) -> our name. Mixamo's `mixamorig:` prefix is stripped
# before lookup, which alone resolves most of a Mixamo rig.
ALIASES = {
    "hips": "Hips", "pelvis": "Hips", "root": "Hips",
    "spine": "Spine", "spine01": "Spine", "spine1": "Spine1", "spine02": "Spine1",
    "spine2": "Spine2", "spine03": "Spine2", "chest": "Spine2", "upperchest": "Spine2",
    "neck": "Neck", "head": "Head",
}
for side, ours in (("left", "Left"), ("right", "Right"), ("l", "Left"), ("r", "Right")):
    ALIASES.update({
        f"{side}shoulder": f"{ours}Shoulder", f"clavicle{side}": f"{ours}Shoulder",
        f"shoulder{side}": f"{ours}Shoulder",
        f"{side}arm": f"{ours}Arm", f"{side}upperarm": f"{ours}Arm",
        f"upperarm{side}": f"{ours}Arm", f"{side}armupper": f"{ours}Arm",
        f"{side}forearm": f"{ours}ForeArm", f"lowerarm{side}": f"{ours}ForeArm",
        f"forearm{side}": f"{ours}ForeArm", f"{side}lowerarm": f"{ours}ForeArm",
        f"{side}hand": f"{ours}Hand", f"hand{side}": f"{ours}Hand",
        f"{side}upleg": f"{ours}UpLeg", f"{side}thigh": f"{ours}UpLeg",
        f"thigh{side}": f"{ours}UpLeg", f"{side}upperleg": f"{ours}UpLeg",
        f"{side}leg": f"{ours}Leg", f"calf{side}": f"{ours}Leg",
        f"shin{side}": f"{ours}Leg", f"{side}lowerleg": f"{ours}Leg",
        f"{side}foot": f"{ours}Foot", f"foot{side}": f"{ours}Foot",
        f"{side}toebase": f"{ours}ToeBase", f"ball{side}": f"{ours}ToeBase",
    })


def normalise(name):
    n = re.sub(r"^mixamorig[:_]?", "", name, flags=re.I)
    n = re.sub(r"[^A-Za-z0-9]", "", n).lower()
    return n


def rename_bones(arm_obj, report):
    """Rename onto the standard skeleton. Renaming through `bone.name` lets
    Blender re-path the actions, so clips stay bound to their bones."""
    renamed = 0
    taken = {b.name for b in arm_obj.data.bones}
    for bone in list(arm_obj.data.bones):
        if bone.name in STANDARD:
            continue
        target = ALIASES.get(normalise(bone.name))
        if not target or target in taken:
            continue
        taken.discard(bone.name)
        old = bone.name
        bone.name = target
        taken.add(target)
        renamed += 1
        report.append(f"  bone {old} -> {target}")
    return renamed


# ------------------------------------------------------------------ geometry

def conform_scale_and_orientation(arm_obj, target_h, report):
    """Metres at the fighter's real height, feet on the floor, centred on the
    origin. Height is measured from the whole rendered bounds (mesh included),
    because that is what the game's height chain sizes against."""
    # Measured from evaluated VERTICES in the REST pose, not from bound_box.
    # bound_box is the undeformed cage and ignores both the armature modifier
    # and whatever pose happens to be loaded, so a rig imported mid-clip
    # measures whatever that frame happened to look like — which is how a
    # 1.75 m figure first came out claiming to be 1.33 m.
    was = arm_obj.data.pose_position
    arm_obj.data.pose_position = "REST"
    bpy.context.view_layer.update()

    def fighter_meshes():
        """Only the meshes bound to THIS armature. A stray object in the
        scene — an importer's leftover, a reference cube — must not set the
        fighter's height or drag the floor down under their feet, which is
        exactly what one did: a sphere at z=-1 pushed the whole rig a metre
        into the air and made the delivery measure a metre too tall."""
        out = []
        for obj in bpy.context.scene.objects:
            if obj.type != "MESH":
                continue
            bound = any(m.type == "ARMATURE" and m.object is arm_obj for m in obj.modifiers)
            if bound or obj.parent is arm_obj:
                out.append(obj)
        return out

    def world_bounds():
        deps = bpy.context.evaluated_depsgraph_get()
        lo = Vector((1e9, 1e9, 1e9))
        hi = Vector((-1e9, -1e9, -1e9))
        found = False
        for obj in fighter_meshes():
            ev = obj.evaluated_get(deps)
            mesh = ev.to_mesh()
            for v in mesh.vertices:
                p = ev.matrix_world @ v.co
                lo = Vector((min(lo[i], p[i]) for i in range(3)))
                hi = Vector((max(hi[i], p[i]) for i in range(3)))
                found = True
            ev.to_mesh_clear()
        return (lo, hi) if found else (None, None)

    lo, hi = world_bounds()
    if lo is None:
        arm_obj.data.pose_position = was
        report.append("  no mesh found — scale left untouched")
        return
    current_h = hi.z - lo.z  # Blender is Z-up; the exporter converts on the way out
    if current_h <= 0:
        arm_obj.data.pose_position = was
        report.append("  degenerate bounds — scale left untouched")
        return
    factor = target_h / current_h
    arm_obj.scale = tuple(s * factor for s in arm_obj.scale)
    bpy.context.view_layer.update()

    lo2, _ = world_bounds()
    arm_obj.location.z -= lo2.z
    arm_obj.data.pose_position = was
    bpy.context.view_layer.update()

    # Bake it into the data rather than leaving it on the node. A skinned mesh
    # renders at the size its JOINT matrices say, so a file carrying its scale
    # as a node transform cannot be measured from the glTF JSON at all — the
    # validator would have to apply inverse bind matrices to find out how tall
    # the fighter is. Applied transforms make the accessor bounds mean what
    # they appear to mean, for every tool downstream.
    bpy.ops.object.select_all(action="DESELECT")
    arm_obj.select_set(True)
    for child in arm_obj.children:
        if child.type == "MESH":
            child.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)
    report.append(f"  scaled ×{factor:.3f} to {target_h:.2f} m, feet on the floor, transforms applied")


def add_missing_hooks(arm_obj, props, chains, report):
    """Prop and chain bones the roster expects but the delivery lacks. Added
    empty: the hook exists (so clips and the validator can find it) and a
    rigger hangs the real geometry on it."""
    existing = {b.name for b in arm_obj.data.bones}
    wanted = []
    for p in props:
        name = p["bone"]
        if name not in existing:
            wanted.append((name, p["hand"] or ("Head" if name == "Prop_Float" else "RightHand"), 0.12))
    for name, parent, segments, _from_skin in chains:
        for i in range(segments):
            bone = f"Chain_{name}_{i}"
            if bone not in existing:
                wanted.append((bone, parent if i == 0 else f"Chain_{name}_{i-1}", 0.1))
    if not wanted:
        return
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    for name, parent, length in wanted:
        eb = arm_obj.data.edit_bones.new(name)
        pb = arm_obj.data.edit_bones.get(parent)
        if pb:
            eb.head = pb.tail
            eb.tail = pb.tail + Vector((0, 0, -length))
            eb.parent = pb
        else:
            eb.head = (0, 0, 0)
            eb.tail = (0, 0, length)
        report.append(f"  added hook bone {name} (parent {parent})")
    bpy.ops.object.mode_set(mode="OBJECT")


# -------------------------------------------------------------- prop rescue

LEG_FAMILY = re.compile(r"^(Left|Right)(UpLeg|Leg|Foot|ToeBase)$")


def rescue_rigid_props(arm_obj, props, report):
    """A held weapon arrives as SKIN, and must stop being skin before the
    weight passes run.

    The generator binds by proximity, so a polearm standing the fighter's full
    height picks up foot and toe influences at the bottom of its shaft. The
    skeleton-distance passes that follow then do exactly the wrong thing, for
    exactly the right reasons: the unwelder — seeing faces whose dominant
    bones are eleven joints apart — saws the weapon in two at the boot. Not a
    hypothetical: Maki's staff arrived in one piece and left conform as a
    hand-held blade plus a stub of shaft riding her ankle.

    Finding the weapon by mesh topology does not work — these meshes are
    patchwork, 197 disconnected shells on Maki alone. GEOMETRY works: a
    carried pole is the one thing that stands taller than the fighter, so the
    topmost slab of vertices fixes its axis, and measurement shows a clean
    empty ring around the shaft (staff out to 7% of mesh height, then air,
    then the body from 12%). Every vertex inside that cylinder whose dominant
    bone is a LEG bone is weapon-not-skin by construction, and is rebound
    wholly to the roster's prop hook, which is reparented onto whichever hand
    actually grips the shaft. Verts already owned by the hand stay put — they
    ride the same transform either way.

    Assumes the weapon stands roughly vertical in the bind pose, which is how
    a full-height polearm has to arrive in a full-body seed image.

    TWO GATES, and the second one was learned the hard way. The roster
    expecting a prop is not enough: a generator often does not produce the
    declared weapon at all (Gakuganji's guitar, Mei Mei's axe), and with only
    the narrow-top test this pass then found a narrow column under a bald
    head, saw leg-bound vertices in it — inner hakama — and bound 1430 of
    them to the weapon hand. So a pole must also RISE ABOVE THE SKULL: the
    tallest geometry has to clear the head bone by a fifth of the fighter's
    height, which a carried polearm does by a wide margin and a scalp never
    does. Both gates skip loudly, because "your weapon did not generate" is
    something the operator has to be told, not something to pass over."""
    if not props:
        return
    if props[0].get("rescue") == "offBone":
        return rescue_offbone_prop(arm_obj, props[0], report)
    hook = props[0]["bone"]  # Prop_Main; nobody two-weapon-generates yet
    hands = ("LeftHand", "RightHand")
    head_bone = arm_obj.data.bones.get("Head")
    head_z = (arm_obj.matrix_world @ head_bone.head_local).z if head_bone else None
    for mesh_obj in [c for c in arm_obj.children if c.type == "MESH"]:
        me = mesh_obj.data
        wm = mesh_obj.matrix_world
        co = [wm @ v.co for v in me.vertices]
        if not co:
            continue
        ztop = max(c.z for c in co)
        height = ztop - min(c.z for c in co)
        if head_z is not None and ztop < head_z + 0.20 * height:
            report.append(
                f"  prop rescue: nothing rises above the head "
                f"(top {ztop - head_z:.2f} m over the head bone, want "
                f"{0.20 * height:.2f}) — the declared weapon did not generate, "
                f"{hook} stays an empty hook")
            continue
        # The staff tip: the topmost 3% slab. If its footprint is wide, the
        # tallest thing is the head or hair and there is no pole to rescue.
        slab = [c for c in co if c.z > ztop - 0.03 * height]
        span = max(max(c.x for c in slab) - min(c.x for c in slab),
                   max(c.y for c in slab) - min(c.y for c in slab))
        if span > 0.25 * height:
            report.append(f"  prop rescue: nothing pole-like above the head "
                          f"(top slab spans {span:.2f} m) — skipped")
            continue
        ax = sum(slab, Vector()) / len(slab)
        radius = 0.09 * height
        group_name = {g.index: g.name for g in mesh_obj.vertex_groups}

        rebind = []
        grip_weight = {h: 0.0 for h in hands}
        for i, v in enumerate(me.vertices):
            dx = co[i].x - ax.x
            dy = co[i].y - ax.y
            if dx * dx + dy * dy > radius * radius:
                continue
            for g in v.groups:
                name = group_name.get(g.group)
                if name in grip_weight:
                    grip_weight[name] += g.weight
            dom = max(v.groups, key=lambda g: g.weight) if v.groups else None
            if dom and LEG_FAMILY.match(group_name.get(dom.group, "")):
                rebind.append(i)
        if not rebind:
            report.append("  prop rescue: shaft column carries no leg "
                          "weights — nothing to fix")
            continue
        grip = max(hands, key=lambda h: grip_weight[h])

        bpy.context.view_layer.objects.active = arm_obj
        bpy.ops.object.mode_set(mode="EDIT")
        eb = arm_obj.data.edit_bones.get(hook)
        gb = arm_obj.data.edit_bones.get(grip)
        if eb and gb and eb.parent is not gb:
            eb.parent = gb
            eb.head = gb.tail
            eb.tail = gb.tail + Vector((0, 0, -0.12))
        bpy.ops.object.mode_set(mode="OBJECT")

        vg = (mesh_obj.vertex_groups.get(hook)
              or mesh_obj.vertex_groups.new(name=hook))
        for other in list(mesh_obj.vertex_groups):
            if other.name != hook:
                other.remove(rebind)
        vg.add(rebind, 1.0, "REPLACE")
        report.append(
            f"  prop rescue: {len(rebind)} shaft vert(s) inside the "
            f"{radius:.2f} m column were leg-bound skin — rebound to {hook} "
            f"on {grip}")


OFFBONE_MIN = 0.11  # of rig height


def rescue_offbone_prop(arm_obj, prop, report):
    """Rescue a held prop that does NOT stand above the head.

    The pole strategy finds a weapon by its silhouette — the one thing taller
    than the fighter. Mei Mei's axe hangs at her hip and is invisible to that,
    and topology cannot help either: these meshes are patchwork, 292
    disconnected shells on her alone, and the axe is shattered across them.

    What DOES separate it: skin sits close to the bone that owns it. A sleeve
    is a few centimetres from its forearm; a thigh wraps its femur. A prop
    bound by proximity does not — the generator gave Mei Mei's axe to her
    thigh and her hands, and those vertices sit up to 0.36 of her height away
    from the bones they were given to, where real skin tops out around 0.10.
    Cutting everything past 0.11 of rig height from its own bone removed the
    axe and nothing else: body, braid, coat and boots all intact.

    THIS IS OPT-IN, and must stay so. The same threshold on Gakuganji flags
    4168 vertices, because a hanging sleeve and a wide hakama are *genuinely*
    far from the bones they belong to. Loose clothing and a held weapon look
    identical to this test, so the roster declares which fighters it is true
    for (`rescue: "offBone"` in props.js) rather than the script guessing.

    Head-dominated vertices are always excluded: hair is far from the head
    bone by nature, it is somebody else's job (extract_skin_chain), and no
    weapon is ever bound to a skull."""
    hook = prop["bone"]
    hands = ("LeftHand", "RightHand")
    mw = arm_obj.matrix_world
    seg = {b.name: (mw @ b.head_local, mw @ b.tail_local) for b in arm_obj.data.bones}

    def dist_to_bone(p, ab):
        a, b = ab
        v = b - a
        L = v.length_squared
        if L < 1e-12:
            return (p - a).length
        t = max(0.0, min(1.0, (p - a).dot(v) / L))
        return (p - (a + v * t)).length

    for mesh_obj in [c for c in arm_obj.children if c.type == "MESH"]:
        me = mesh_obj.data
        wm = mesh_obj.matrix_world
        gname = {g.index: g.name for g in mesh_obj.vertex_groups}
        zs = [(wm @ v.co).z for v in me.vertices]
        if not zs:
            continue
        height = max(zs) - min(zs)
        rebind = []
        grip_weight = {h: 0.0 for h in hands}
        for v in me.vertices:
            if not v.groups:
                continue
            dom = max(v.groups, key=lambda g: g.weight)
            name = gname.get(dom.group)
            if name == "Head" or name is None or name.startswith("Prop_") or name not in seg:
                continue
            if dist_to_bone(wm @ v.co, seg[name]) / height <= OFFBONE_MIN:
                continue
            rebind.append(v.index)
            for g in v.groups:
                n = gname.get(g.group)
                if n in grip_weight:
                    grip_weight[n] += g.weight
        if not rebind:
            report.append(f"  prop rescue (offBone): nothing sits further than "
                          f"{OFFBONE_MIN:.2f} of height from its own bone — "
                          f"{hook} stays an empty hook")
            continue

        # Which hand holds it: the WEIGHTS decide, not the roster.
        #
        # The roster says which hand the fighter is designed to hold it in;
        # the weights say which hand the delivered geometry is actually next
        # to. Those are different questions, and only the second one matters
        # here. Rebinding preserves each vertex where it sits, so hanging the
        # axe off the hand it is NOT near means the first time that hand moves
        # the weapon leaves the other one behind. Mei Mei's model holds hers
        # in the left; the roster says right. Follow the model, say so.
        grip = max(hands, key=lambda h: grip_weight[h])
        if prop.get("hand") and grip != prop["hand"]:
            report.append(f"  prop rescue (offBone): roster designs this for "
                          f"{prop['hand']}, the delivery holds it in {grip} — "
                          f"binding where the geometry is")

        bpy.context.view_layer.objects.active = arm_obj
        bpy.ops.object.mode_set(mode="EDIT")
        eb = arm_obj.data.edit_bones.get(hook)
        gb = arm_obj.data.edit_bones.get(grip)
        if eb and gb and eb.parent is not gb:
            eb.parent = gb
            eb.head = gb.tail
            eb.tail = gb.tail + Vector((0, 0, -0.12))
        bpy.ops.object.mode_set(mode="OBJECT")

        vg = mesh_obj.vertex_groups.get(hook) or mesh_obj.vertex_groups.new(name=hook)
        for other in list(mesh_obj.vertex_groups):
            if other.name != hook:
                other.remove(rebind)
        vg.add(rebind, 1.0, "REPLACE")
        report.append(f"  prop rescue (offBone): {len(rebind)} vert(s) further than "
                      f"{OFFBONE_MIN:.2f} of height from their own bone were prop, "
                      f"not skin — rebound to {hook} on {grip}")


# --------------------------------------------------------- hair extraction


def extract_skin_chain(arm_obj, chains, report):
    """Carve a declared chain back out of the skin it arrived welded to.

    A generator binds long hair to the Head bone and stops there, so the hair
    can only ever move exactly as the skull does — no lag, no swing, no
    settle. That is not something the sway layer can fix from outside: there
    is nothing for it to rotate. The geometry has to become its own bones
    first, and the only place that can happen is here, on the way in.

    HOW HAIR IS TOLD FROM HEAD. Not by material or by island — these meshes
    are patchwork, and a generated head shares its material with the hair
    covering it. By REACH: a skull is compact around the head joint, and hair
    is the part of the head's skin that keeps going. Measured on Uro, whose
    mane is the reason this exists: Head owns 7529 verts, and their distance
    from the head joint runs 0.01 m to 0.74 m — the skull accounts for the
    first tenth of that spread and hair for the rest. So the cut is a sphere
    of `SKULL_R` of the fighter's height (0.085 — a human head is about a
    seventh of a body tall, and that is its radius plus room for a face),
    and everything outside it is hair.

    The chain is then BUILT ALONG THE HAIR rather than hung from a default
    pose: verts are sorted by reach and split into equal-count bands, each
    band's centroid becomes a bone tail, and each bone's head is the previous
    centroid. Hair that streams up and back therefore gets bones that stream
    up and back, and the pendulum sway swings along the hair's own line
    instead of through it.

    Weights blend across each band boundary rather than switching, so the
    mane bends instead of hinging into rigid slabs.

    Gated on the roster declaring `fromSkin: true`, so no fighter loses their
    head to this by accident; skips loudly whenever the geometry does not
    look like the thing described above."""
    skin_chains = [c for c in chains if c[3]]
    if not skin_chains:
        return
    SKULL_R = 0.085  # of rig height

    for name, parent, segments, _ in skin_chains:
        pbone = arm_obj.data.bones.get(parent)
        if not pbone:
            report.append(f"  hair chain '{name}': no '{parent}' bone — skipped")
            continue
        was = arm_obj.data.pose_position
        arm_obj.data.pose_position = "REST"
        bpy.context.view_layer.update()
        joint = arm_obj.matrix_world @ pbone.head_local

        meshes = [c for c in arm_obj.children if c.type == "MESH"]
        allz = [(m.matrix_world @ v.co).z for m in meshes for v in m.data.vertices]
        height = (max(allz) - min(allz)) if allz else 1.75
        radius = SKULL_R * height

        for mesh_obj in meshes:
            me = mesh_obj.data
            gname = {g.index: g.name for g in mesh_obj.vertex_groups}
            wm = mesh_obj.matrix_world
            far = []
            for v in me.vertices:
                if not v.groups:
                    continue
                dom = max(v.groups, key=lambda g: g.weight)
                if gname.get(dom.group) != parent or dom.weight < 0.5:
                    continue
                p = wm @ v.co
                d = (p - joint).length
                if d > radius:
                    far.append((d, v.index, p))
            if len(far) < 50:
                report.append(f"  hair chain '{name}': only {len(far)} vert(s) "
                              f"reach past {radius:.2f} m — nothing to extract")
                continue

            # FOLLOW THE BRAID. Dominance alone finds only the part of the
            # hair the binder gave to Head, and a binder works by proximity:
            # Mei Mei's braids hang down her chest, so their lower halves were
            # bound to Spine and stayed behind — leaving the top 10 cm on the
            # chain and the rest welded to her ribs, which does not sway, it
            # TEARS. So the seed set grows along mesh edges: a braid is
            # connected geometry, and walking it reaches the tip whatever bone
            # owns it. Growth only ever moves further out than the skull, and
            # it refuses to leak: if the hair turns out welded to the body
            # shell the set explodes, so a hard cap aborts the growth and
            # keeps the seed, loudly.
            seed = {i for _, i, _ in far}
            grown = set(seed)
            cap = max(len(seed) * 4, 400)
            edges = collections.defaultdict(list)
            for e in me.edges:
                a, b = e.vertices
                edges[a].append(b)
                edges[b].append(a)
            frontier, leaked = list(seed), False
            while frontier and not leaked:
                nxt = []
                for vi in frontier:
                    for vj in edges[vi]:
                        if vj in grown:
                            continue
                        if (wm @ me.vertices[vj].co - joint).length <= radius:
                            continue
                        grown.add(vj)
                        nxt.append(vj)
                        if len(grown) > cap:
                            leaked = True
                            break
                    if leaked:
                        break
                frontier = nxt
            if leaked:
                report.append(f"  hair chain '{name}': growth ran past {cap} "
                              f"vert(s) — the hair is welded to the body shell, "
                              f"keeping the {len(seed)} dominance-picked vert(s)")
            else:
                added = len(grown) - len(seed)
                if added:
                    report.append(f"  hair chain '{name}': followed {added} more "
                                  f"vert(s) along the strand that other bones owned")
                far = [((wm @ me.vertices[i].co - joint).length, i,
                        wm @ me.vertices[i].co) for i in grown]
            far.sort(key=lambda t: t[0])

            # Equal-count bands: each bone drives a similar amount of the
            # mane, and no band can come out empty (which an equal-DISTANCE
            # split does the moment hair bunches near the crown).
            per = len(far) / segments
            bands = [far[int(i * per):int((i + 1) * per)] for i in range(segments)]
            centroids = []
            for b in bands:
                c = Vector((0, 0, 0))
                for _, _, p in b:
                    c += p
                centroids.append(c / len(b))

            bpy.context.view_layer.objects.active = arm_obj
            bpy.ops.object.mode_set(mode="EDIT")
            head_pt = joint + (centroids[0] - joint).normalized() * radius
            for i in range(segments):
                eb = arm_obj.data.edit_bones.get(f"Chain_{name}_{i}")
                if not eb:
                    continue
                eb.head = head_pt
                eb.tail = centroids[i]
                if (eb.tail - eb.head).length < 1e-3:
                    eb.tail = eb.head + Vector((0, 0, 0.02))
                eb.parent = (arm_obj.data.edit_bones.get(parent) if i == 0
                             else arm_obj.data.edit_bones.get(f"Chain_{name}_{i-1}"))
                head_pt = centroids[i]
            bpy.ops.object.mode_set(mode="OBJECT")

            groups = []
            for i in range(segments):
                bone = f"Chain_{name}_{i}"
                groups.append(mesh_obj.vertex_groups.get(bone)
                              or mesh_obj.vertex_groups.new(name=bone))
            idx = [t[1] for t in far]
            for other in list(mesh_obj.vertex_groups):
                if not other.name.startswith(f"Chain_{name}_"):
                    other.remove(idx)
            # Blend across each boundary: a vert sitting a fraction t of the
            # way through its band leans that far toward the next bone.
            for bi, band in enumerate(bands):
                n = max(len(band), 1)
                for k, (_, vi, _) in enumerate(band):
                    t = (k / n) if bi + 1 < segments else 0.0
                    groups[bi].add([vi], 1.0 - t, "REPLACE")
                    if t > 0:
                        groups[bi + 1].add([vi], t, "REPLACE")
            report.append(
                f"  hair chain '{name}': {len(far)} vert(s) past {radius:.2f} m "
                f"lifted off {parent} onto {segments} bone(s), "
                f"reach {far[0][0]:.2f}-{far[-1][0]:.2f} m")
        arm_obj.data.pose_position = was
        bpy.context.view_layer.update()


# ------------------------------------------------------------------- timing

def canonical_action_name(name, states):
    """The state an action is for, allowing for the decoration importers add.

    Blender's glTF importer names actions `<clip>_<object>` — a file whose
    animations were called `idle`/`run` comes back in as `idle_Armature`,
    `run_Armature`. Exporting those verbatim produces glTF animations under
    those names, which the engine resolves by state name and therefore never
    plays: the fighter would load, register, and silently stand in the default
    pose forever. So the decoration is stripped and the action is RENAMED to
    the state, which is what the export then writes.
    """
    if name in states:
        return name
    # Longest state that prefixes the name, so `dodge_roll_Armature` picks
    # dodge_roll rather than stopping at a shorter match.
    for state in sorted(states, key=len, reverse=True):
        if name == state or name.startswith(state + "_") or name.startswith(state + "."):
            return state
    return None


def retime_actions(states, report):
    """Every action named for a state is renamed to exactly that state and
    scaled to its duration. Actions that are not a state at all are left alone
    and reported — a clip the engine will never play is a delivery problem,
    not something to silently rename into one."""
    bpy.context.scene.render.fps = FPS
    for action in bpy.data.actions:
        state = canonical_action_name(action.name, states)
        if state and action.name != state:
            report.append(f"  action '{action.name}' -> '{state}'")
            action.name = state
        spec = states.get(action.name)
        if not spec:
            report.append(f"  action '{action.name}' is not a state — left as-is, it will never play")
            continue
        start, end = action.frame_range
        span = end - start
        target = spec["duration"] * FPS
        if span <= 0:
            report.append(f"  action '{action.name}' has no span — cannot retime")
            continue
        factor = target / span
        for fcurve in action.fcurves:
            for kp in fcurve.keyframe_points:
                kp.co.x = (kp.co.x - start) * factor + 1
                kp.handle_left.x = (kp.handle_left.x - start) * factor + 1
                kp.handle_right.x = (kp.handle_right.x - start) * factor + 1
            fcurve.update()
        beat = f", beat at frame {spec['beat'] * FPS:.1f}" if spec["beat"] else ""
        report.append(f"  '{action.name}' retimed ×{factor:.3f} -> {spec['duration']}s{beat}")


# ---------------------------------------------------------------------- main

def strip_strays(arm_obj, report):
    """Drop mesh objects that belong to nobody.

    Every delivery so far has carried an unweighted 42-vertex icosphere two
    metres across, out of the generator. It is hidden, so it never drew — and
    it is in all twenty-seven files and every download of them, and it makes
    "how tall is this model" a question the audit has to ask twice.

    The rule is deliberately narrow: no vertex groups AND no parent. A rigid
    prop is legitimately unweighted (it hangs off a bone), so weights alone
    would be a rule that deletes weapons.
    """
    doomed = [o for o in list(bpy.data.objects)
              if o.type == "MESH" and not o.vertex_groups and o.parent is None]
    for o in doomed:
        report.append(f"  stray mesh dropped: '{o.name}' "
                      f"({len(o.data.vertices)} verts, no weights, no parent)")
        bpy.data.objects.remove(o, do_unlink=True)
    return len(doomed)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="blender_conform")
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", required=True)
    ap.add_argument("--char", required=True)
    # The fighter was drawn and generated EMPTY-HANDED and the weapon comes in
    # its own file, so there is no weapon in this mesh to rescue. Saying so
    # matters: the rescue finds a weapon by geometry, and with no weapon there
    # it still finds something — on Momo it bound 4231 vertices of her LEGS to
    # the prop hook and handed her shins to the broom.
    ap.add_argument("--prop-supplied", action="store_true")
    args = ap.parse_args(argv)

    states = load_states()
    props, chains = load_expectations(args.char)
    target_h = canon_height_m(args.char)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.src)

    arm = next((o for o in bpy.context.scene.objects if o.type == "ARMATURE"), None)
    if not arm:
        sys.exit("no armature in the input — a delivery must be a rigged model")

    report = [f"conforming {os.path.basename(args.src)} as '{args.char}':"]
    n = rename_bones(arm, report)
    report.append(f"  {n} bone(s) renamed onto the standard skeleton")
    missing = [b for b in STANDARD if b not in {x.name for x in arm.data.bones}]
    if missing:
        report.append(f"  STILL MISSING after renaming: {', '.join(missing)}")
    conform_scale_and_orientation(arm, target_h, report)
    add_missing_hooks(arm, props, chains, report)
    # Before clean_all, or the weight passes mistake the weapon for badly
    # bound skin and saw it apart — see the function's own comment.
    if args.prop_supplied:
        report.append("  prop rescue skipped: the weapon is generated separately "
                      "and joined after conform — nothing in this mesh to rescue")
    else:
        rescue_rigid_props(arm, props, report)
    # Also before clean_all: the new chain bones are children of Head, so the
    # weight passes accept them — but only once the verts actually belong to
    # them. Run the other way round and the hair is still Head's skin when
    # the pruner looks at it.
    extract_skin_chain(arm, chains, report)
    retime_actions(states, report)
    strip_strays(arm, report)
    clean_all(arm, report)
    grade_char(args.char, report)

    os.makedirs(os.path.dirname(os.path.abspath(args.dst)), exist_ok=True)
    # Export the fighter only. `use_selection` with the armature hierarchy
    # selected keeps an importer's leftovers out of the delivery.
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    for child in arm.children:
        child.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=args.dst,
        use_selection=True,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_yup=True,
    )
    print("\n".join(report))
    print(f"wrote {args.dst}")
    print("next: node tools/billboard_intake.mjs validate " + args.char)


if __name__ == "__main__":
    main()
