"""Measure skin-weight bleed: how much of the body moves when ONE bone does.

    blender --background --python tools/blender_probe_bleed.py -- \
        --in render3d/assets/yuji/yuji.glb --bone RightArm --deg 60

Raises `--bone` alone in the bind pose and reports every vertex that moved more
than a centimetre while sitting BELOW the hips — i.e. skin the bone has no
business driving. This is the measurement behind the "his trousers follow his
arm" fault in round B1 (268 vertices, 39 cm worst case) and the acceptance test
for tools/blender_clean_weights.py.
"""

import argparse
import sys

import bpy
from mathutils import Matrix, Vector


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="blender_probe_bleed")
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--bone", default="RightArm")
    ap.add_argument("--deg", type=float, default=60.0)
    ap.add_argument("--region", default="hips",
                    help="'hips' = below the hip joint (trousers), 'all' = whole mesh")
    args = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.src)
    arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]

    dg = bpy.context.evaluated_depsgraph_get()

    def sample():
        dg.update()
        out = []
        for obj in meshes:
            ev = obj.evaluated_get(dg)
            mesh = ev.to_mesh()
            mw = obj.matrix_world
            out.append([mw @ v.co for v in mesh.vertices])
            ev.to_mesh_clear()
        return out

    # Rest.
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix()
    before = sample()

    # The trouser line is the HIP JOINT, not the `Hips` bone — on a glTF rig
    # `Hips` is the root and sits on the floor, so testing against it silently
    # measures nothing. The leg bone's head is the real pelvis height.
    hip_bone = arm.data.bones.get("RightUpLeg") or arm.data.bones["Hips"]
    hip_z = (arm.matrix_world @ hip_bone.head_local).z

    pb = arm.pose.bones.get(args.bone)
    if pb is None:
        sys.exit(f"no bone named {args.bone}")
    pb.rotation_mode = "XYZ"
    pb.rotation_euler = (0, 0, args.deg * 3.14159265 / 180)
    after = sample()

    # Which vertices BELONG to the moved bone's limb, by dominant influence.
    # This matters more than it looks: the rig binds in an A-pose, so the hands
    # hang at hip height, and a naive "below the hips" test measures the HANDS
    # legitimately following the arm — 642 vertices of pure false positive. What
    # bleed means is skin whose own bone did not move going along anyway.
    limb = {b.name for b in arm.data.bones
            if args.bone in [x.name for x in b.parent_recursive] or b.name == args.bone}
    own = []
    for obj in meshes:
        names = {g.index: g.name for g in obj.vertex_groups}
        for vert in obj.data.vertices:
            top = max(vert.groups, key=lambda g: g.weight, default=None)
            own.append(names.get(top.group) if top else None)

    moved, worst, where, worst_bone = 0, 0.0, None, None
    total = 0
    i = 0
    for a_list, b_list in zip(before, after):
        for a, b in zip(a_list, b_list):
            dom = own[i]
            i += 1
            total += 1
            if dom in limb:
                continue  # this skin is the limb's own — it is meant to move
            if args.region == "hips" and a.z > hip_z:
                continue
            d = (b - a).length
            if d > 0.01:
                moved += 1
                if d > worst:
                    worst, where, worst_bone = d, a, dom
    region = "below the hips" if args.region == "hips" else "anywhere"
    print(f"rotating '{args.bone}' by {args.deg:.0f} deg, {total} vertices in the mesh")
    print(f"  moved >1 cm {region}: {moved} ({moved / max(1, total) * 100:.1f}%)")
    print(f"  largest displacement: {worst * 100:.1f} cm"
          + (f" at ({where.x:.2f}, {where.y:.2f}, {where.z:.2f}), skin owned by '{worst_bone}'"
             if where else ""))


if __name__ == "__main__":
    main()
