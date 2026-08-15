# Attach a SEPARATELY generated weapon to a conformed rig's prop bone.
#
#     blender -b -P tools/blender_attach_prop.py -- \
#         --rig billboards/intake/maki/maki.glb \
#         --prop billboards/intake/maki/_prop.glb \
#         --char maki --out billboards/intake/maki/maki.glb
#
# ## Why the weapon is generated on its own
#
# Image-to-3D cannot separate two objects that touch in the picture. Momo's
# broom stood against her leg in three views of four and came back as her leg;
# Maki's polearm and Gakuganji's guitar came back as part of an arm, 167% and
# 158% of a normal one. Nothing downstream can undo that — the fusion is in the
# mesh — and the conform pass's rescue heuristics only ever recovered the cases
# where the generator happened to leave a seam.
#
# So the fighter is drawn and generated EMPTY-HANDED, the weapon is drawn and
# generated alone, and the join happens here, where it is arithmetic instead of
# inference. The engine contract does not change at all: a delivered rig still
# carries its weapon on `Prop_Main`, which is what props.js, the two-handed
# grip and the shaft fit all read. What changes is who does the joining.
#
# ## The three numbers this needs, and where they come from
#
# `render3d/src/props.js` declares them per fighter, because they are facts
# about the character and not about a file:
#
#   lengthM   how long the weapon really is, in metres. A generated object
#             arrives at whatever scale it likes.
#   grip      where the hand sits along it, as a fraction of its length
#             measured FROM THE HEAVY END — the axe head, the broom's
#             bristles, the guitar's body. Heavy-end-first is the convention
#             because "which end is heavy" is measurable and "which end is the
#             top" is not.
#   hand      which hand, so the bone is the right one.
#
# The heavy end then points ALONG the bone, out of the fist: an axe held near
# the butt has its head at the far end, a polearm gripped a third of the way
# down has its blade forward. Both are what the sprite draws.
import bpy, sys, os, json, math, argparse
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def prop_spec(char, bone):
    """The fighter's declaration for this prop bone, read from props.js.

    Parsed rather than duplicated: props.js is where the roster's props are
    declared for the engine, the intake validator and the mannequin, and a
    second copy of `grip` here would be a second copy to get wrong.
    """
    import re
    src = open(os.path.join(ROOT, "render3d/src/props.js"), encoding="utf-8").read()
    block = re.search(r"export const CHARACTER_PROPS = \{(.*?)\n\};", src, re.S)
    if not block:
        return None
    entry = re.search(rf"\n  {re.escape(char)}:\s*\[(.*?)\],?\n  \w+:", block.group(1) + "\n  x:", re.S)
    if not entry:
        return None
    for item in re.findall(r"\{([^}]*)\}", entry.group(1)):
        fields = dict(re.findall(r"(\w+):\s*(\"[^\"]*\"|[\d.]+|null|true|false)", item))
        if fields.get("bone", "").strip('"') != bone:
            continue
        return {
            "bone": bone,
            "hand": fields.get("hand", "null").strip('"'),
            "kind": fields.get("kind", "").strip('"'),
            "lengthM": float(fields["lengthM"]) if "lengthM" in fields else None,
            "grip": float(fields["grip"]) if "grip" in fields else 0.5,
        }
    return None


def principal_axis(verts):
    """The direction the object is longest in, by power iteration on the
    covariance — the same measurement ik.js `fitPropShaft` makes at runtime,
    so the two agree about what "along the weapon" means."""
    centre = sum(verts, Vector()) / len(verts)
    axis = Vector((0.0, 0.0, 1.0))
    for _ in range(24):
        acc = Vector()
        for v in verts:
            d = v - centre
            acc += d * d.dot(axis)
        if acc.length < 1e-9:
            break
        axis = acc.normalized()
    return centre, axis


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="blender_attach_prop")
    ap.add_argument("--rig", required=True)
    ap.add_argument("--prop", required=True)
    ap.add_argument("--char", required=True)
    ap.add_argument("--bone", default="Prop_Main")
    ap.add_argument("--out", required=True)
    ap.add_argument("--length", type=float, default=None,
                    help="override the declared lengthM, in metres")
    ap.add_argument("--grip", type=float, default=None,
                    help="override the declared grip fraction")
    ap.add_argument("--along", choices=["hand", "bone"], default="hand",
                    help="lay the weapon along the HAND bone (default) or along "
                         "the prop bone's own axis")
    args = ap.parse_args(argv)

    spec = prop_spec(args.char, args.bone) or {}
    length = args.length or spec.get("lengthM")
    grip = args.grip if args.grip is not None else spec.get("grip", 0.5)
    if not length:
        sys.exit(f"no lengthM declared for {args.char}'s {args.bone} in props.js, "
                 f"and no --length given — a generated prop has no scale of its own")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.rig)
    arm = next((o for o in bpy.context.scene.objects if o.type == "ARMATURE"), None)
    if not arm:
        sys.exit("no armature in the rig")
    bone = arm.data.bones.get(args.bone)
    if not bone:
        sys.exit(f"the rig has no bone '{args.bone}' — conform runs first")
    before = {o.name for o in bpy.data.objects}

    bpy.ops.import_scene.gltf(filepath=args.prop)
    fresh = [o for o in bpy.data.objects if o.name not in before and o.type == "MESH"]
    if not fresh:
        sys.exit("no mesh in the prop file")

    # One object, so the weapon moves as one thing.
    bpy.ops.object.select_all(action="DESELECT")
    for o in fresh:
        o.select_set(True)
    bpy.context.view_layer.objects.active = fresh[0]
    if len(fresh) > 1:
        bpy.ops.object.join()
    prop = bpy.context.view_layer.objects.active
    prop.name = f"Prop_{args.char}"
    # Any rig the generator hung on it is not wanted: this is rigid geometry
    # parented to a bone, and a stray armature would export as a second one.
    for mod in list(prop.modifiers):
        prop.modifiers.remove(mod)
    prop.parent = None

    world = [prop.matrix_world @ v.co for v in prop.data.vertices]
    centre, axis = principal_axis(world)
    along = sorted(v.dot(axis) for v in world)
    lo, hi = along[0], along[-1]
    span = hi - lo
    if span < 1e-6:
        sys.exit("the prop has no length along any axis")

    # WHICH END IS HEAVY: the BULK in the outer fifth at each end, measured as
    # the total distance its vertices stand off the shaft — not as a vertex
    # count, which mostly reports how finely each end happened to be
    # tessellated. An axe head, a broom's bristles and a guitar's body all
    # stand well off the shaft; a bare pole does not, and for a pole the grip
    # is symmetric enough that it does not matter which end wins.
    band = span * 0.2
    def bulk(keep):
        total = 0.0
        for v in world:
            t = v.dot(axis)
            if not keep(t):
                continue
            total += ((v - centre) - axis * (t - centre.dot(axis))).length
        return total
    lo_mass = bulk(lambda t: t < lo + band)
    hi_mass = bulk(lambda t: t > hi - band)
    heavy_at_hi = hi_mass >= lo_mass
    heavy = axis if heavy_at_hi else -axis
    heavy_end = centre + heavy * (span / 2 if heavy_at_hi else span / 2)
    heavy_end = (centre + axis * (hi - centre.dot(axis))) if heavy_at_hi \
        else (centre + axis * (lo - centre.dot(axis)))

    scale = length / span
    # The grip point, measured from the heavy end along the weapon.
    grip_point = heavy_end - heavy * (grip * span)

    # WHERE IT HAS TO END UP: the grip at the prop bone's head, pointing along
    # the HAND — not along the prop bone.
    #
    # The prop bone is a hook, not a direction. `add_missing_hooks` gives it a
    # nominal axis when a delivery arrives without one, and a generator that
    # does supply one points it wherever the weapon happened to lie in the
    # source mesh. Aiming a fresh weapon down it puts a polearm vertically
    # through the fighter's chest, which is what the first run of this did.
    #
    # The HAND bone is a real direction — wrist to knuckles — and a thing held
    # in a fist lies roughly along it. `--along bone` keeps the old behaviour
    # for a delivery whose prop bone genuinely was authored as the weapon
    # direction, and the engine re-derives the shaft from the geometry at
    # runtime either way (ik.js fitPropShaft), so this decides how it LOOKS in
    # the hand rather than how it solves.
    bone_head = arm.matrix_world @ bone.head_local
    aim_bone = bone
    if args.along == "hand" and spec.get("hand"):
        held = arm.data.bones.get(spec["hand"])
        if held:
            aim_bone = held
    bone_dir = (arm.matrix_world.to_3x3()
                @ (aim_bone.tail_local - aim_bone.head_local)).normalized()

    rot = heavy.rotation_difference(bone_dir).to_matrix().to_4x4()
    prop.matrix_world = (
        Matrix.Translation(bone_head)
        @ rot
        @ Matrix.Scale(scale, 4)
        @ Matrix.Translation(-grip_point)
        @ prop.matrix_world
    )
    bpy.context.view_layer.update()

    # Bone-parented, not skinned: rigid props hang off a bone, which is also
    # why blender_conform.py's stray-mesh sweep spares anything with a parent.
    bpy.ops.object.select_all(action="DESELECT")
    prop.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    arm.data.bones.active = bone
    bpy.ops.object.mode_set(mode="POSE")
    arm.data.bones.active = arm.data.bones.get(args.bone)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.parent_set(type="BONE", keep_transform=True)

    check = [prop.matrix_world @ v.co for v in prop.data.vertices]
    c2, a2 = principal_axis(check)
    along2 = sorted(v.dot(a2) for v in check)
    print(f"attached {os.path.basename(args.prop)} to {args.char}'s {args.bone}")
    print(f"  scaled {scale:.3f}x to {along2[-1] - along2[0]:.3f} m")
    print(f"  grip {grip:.2f} from the heavy end "
          f"(bulk {max(lo_mass, hi_mass):.2f} against {min(lo_mass, hi_mass):.2f})")
    print(f"  grip point at {tuple(round(x, 3) for x in bone_head)}, "
          f"laid along {aim_bone.name} {tuple(round(x, 2) for x in bone_dir)}")

    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    for child in arm.children:
        child.select_set(True)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=args.out, use_selection=True,
                              export_format="GLB", export_animations=True,
                              export_animation_mode="ACTIONS", export_yup=True)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
