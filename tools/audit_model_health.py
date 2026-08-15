# Measure what is WRONG with each delivered model's mesh — the faults that no
# rig, clip or engine layer can fix because they are missing or invented
# geometry.
#
#     blender -b -P tools/audit_model_health.py -- [char ...]
#
# WHY MEASURE INSTEAD OF LOOKING. A generated model is wrong in ways that are
# obvious once seen and invisible until then: Mei Mei grew horns and Momo lost
# a leg, and both shipped, were reviewed for facing, sized against their
# sprites, and had their stances tuned before anybody said so out loud. The
# faults below are the ones that survive every downstream pass, so they are
# worth a number rather than an opinion.
#
#   LIMB BALANCE  A body is symmetric: the mesh bound to the left leg and the
#                 mesh bound to the right should weigh about the same. When one
#                 side is a fraction of the other, that limb was not
#                 reconstructed — either it was hidden behind something in the
#                 seed board or a prop was fused into it.
#   CROWN         Geometry above the head, measured as a fraction of stature.
#                 Hair and hats live there legitimately, so the number is a
#                 flag to look at, not a verdict — but a seed board cut off at
#                 the eyes leaves the generator inventing a crown, and it
#                 invents spikes.
#   STRAYS        Islands of mesh far from any bone that owns them, and meshes
#                 with no weights at all.
#   FOOT SHAPE    A foot is LONGER THAN IT IS WIDE. Measured as the ratio of
#                 the two horizontal extents of the mesh the foot bones own,
#                 taken along the foot's OWN principal axis so it does not
#                 matter which way the fighter is turned or how the file is
#                 oriented. A delivered foot runs about 2.0 (Yuji 2.05 on both,
#                 Gakuganji 2.19/2.26); a generator that failed to resolve one
#                 reports a featureless lump at about 1.0, which is what Momo's
#                 left foot was while her right was a proper boot. Do NOT take
#                 this off the toe bone's direction: those bones are 2 cm stubs
#                 whose orientation is noise, and measuring against them scores
#                 a known-good foot as badly as a broken one.
import bpy, sys, math
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
FLAGS = [a for a in argv if a.startswith("--")]
argv = [a for a in argv if not a.startswith("--")]
import os, json
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAN = os.path.join(ROOT, "render3d/assets/manifest.json")
with open(MAN) as f:
    manifest = json.load(f)
chars = argv or [k for k, v in manifest["characters"].items() if v.get("approved")]

LEG = ["UpLeg", "Leg", "Foot", "ToeBase"]
ARM = ["Arm", "ForeArm", "Hand"]
FOOT = ["Foot", "ToeBase"]


def foot_ratio(pts):
    """How foot-shaped a cloud of vertices is: long axis over short, both
    horizontal, both measured along the cloud's own principal direction."""
    if len(pts) < 12:
        return None
    cx = sum(p.x for p in pts) / len(pts)
    cy = sum(p.y for p in pts) / len(pts)
    xx = xy = yy = 0.0
    for p in pts:
        dx, dy = p.x - cx, p.y - cy
        xx += dx * dx; xy += dx * dy; yy += dy * dy
    th = 0.5 * math.atan2(2 * xy, xx - yy)
    a = Vector((math.cos(th), math.sin(th), 0.0))
    b = Vector((-a.y, a.x, 0.0))
    la = max(p.dot(a) for p in pts) - min(p.dot(a) for p in pts)
    lb = max(p.dot(b) for p in pts) - min(p.dot(b) for p in pts)
    lo, hi = min(la, lb), max(la, lb)
    return (hi / lo) if lo > 1e-6 else None

def side_mass(mesh_obj, groups, names):
    """Total weight held by a side's bones, and the verts they touch."""
    want = {i for i, n in groups.items() if any(n == side + part for part in names for side in [""])}
    return want

def report(char):
    entry = manifest["characters"].get(char)
    if not entry or not entry.get("model"):
        return None
    path = os.path.join(ROOT, "render3d/assets", entry["model"])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    skinned = [o for o in meshes if o.vertex_groups]
    # A weapon generated on its own hangs off a bone rather than being skinned
    # to one, so it has no vertex groups AND is not a stray — it is the whole
    # point of the separate-prop pipeline. Counting it as an unweighted stray
    # reported "2 unweighted mesh (20451 verts)" for every fighter carrying
    # one, which reads as a serious defect and is in fact the design.
    boned = [o for o in meshes if not o.vertex_groups and o.parent_type == "BONE"]
    loose = [o for o in meshes if not o.vertex_groups and o.parent_type != "BONE"]

    # Stature from the SKINNED body only: an unweighted stray would otherwise
    # decide how tall the fighter is.
    zs = [(o.matrix_world @ v.co).z for o in skinned for v in o.data.vertices]
    if not zs:
        return None
    bot, top = min(zs), max(zs)
    height = top - bot

    mass = {}
    head_top = None
    feet = {"Left": [], "Right": []}
    for o in skinned:
        gi = {g.index: g.name for g in o.vertex_groups}
        for v in o.data.vertices:
            for g in v.groups:
                name = gi.get(g.group, "")
                mass[name] = mass.get(name, 0.0) + g.weight
                if name == "Head" and g.weight > 0.5:
                    z = (o.matrix_world @ v.co).z
                    head_top = z if head_top is None else max(head_top, z)
            # Foot shape is about the SHAPE the foot bones own, so a vertex
            # counts for the bone holding most of it rather than for every
            # bone touching it.
            top_g = max(v.groups, key=lambda g: g.weight, default=None)
            if top_g is not None:
                n = gi.get(top_g.group, "")
                for side in ("Left", "Right"):
                    if n in (side + "Foot", side + "ToeBase"):
                        feet[side].append(o.matrix_world @ v.co)

    def limb(side, parts):
        return sum(mass.get(side + p, 0.0) for p in parts)

    legL, legR = limb("Left", LEG), limb("Right", LEG)
    armL, armR = limb("Left", ARM), limb("Right", ARM)
    bal = lambda a, b: (min(a, b) / max(a, b)) if max(a, b) > 0 else 0.0

    # The crown: how far the tallest Head-owned vertex sits above the top of
    # the skull mass, as a fraction of stature. A hat or hair is a bump; a
    # generated horn is a spike.
    crown = (top - head_top) / height if head_top else 0.0

    total = sum(mass.values()) or 1.0
    return {
        "char": char, "height": height, "total": total,
        "legL": legL, "legR": legR, "armL": armL, "armR": armR,
        "legBal": bal(legL, legR), "armBal": bal(armL, armR),
        "crown": crown,
        "loose": sum(len(o.data.vertices) for o in loose),
        "looseN": len(loose),
        # Skinned prop weight, plus the verts of any bone-parented weapon —
        # both are "the fighter's kit", however it got there.
        "prop": (mass.get("Prop_Main", 0.0) + mass.get("Prop_Off", 0.0)
                 + sum(len(o.data.vertices) for o in boned)),
        "footL": foot_ratio(feet["Left"]),
        "footR": foot_ratio(feet["Right"]),
    }

rows = []
for c in chars:
    r = report(c)
    if r:
        rows.append(r)

# A limb can be UNBALANCED two ways and they mean opposite things: one side
# thin because it was never reconstructed, or one side heavy because something
# else was fused into it — a weapon, a hem, a broom. Balance alone cannot tell
# them apart, so each side is also compared with the ROSTER's own median limb.
# Twenty-seven bodies at a comparable mesh density make a usable normal.
def median(vals):
    v = sorted(vals)
    return v[len(v) // 2] if v else 0.0

# ...as a SHARE of that model's own mass, not as a raw count. Momo is 1.5 m and
# Hanami 2.2 m; comparing their limbs by weight alone calls the short one
# malnourished.
MED = {
    "leg": median([(r["legL"] + r["legR"]) / 2 / r["total"] for r in rows]),
    "arm": median([(r["armL"] + r["armR"]) / 2 / r["total"] for r in rows]),
}

def limb_verdict(kind, a, b, total, out):
    light, heavy = min(a, b) / total, max(a, b) / total
    med = MED[kind]
    bal = light / heavy if heavy else 0
    if not med:
        return
    if bal < 0.6 and light < 0.7 * med:
        out.append(f"{kind.upper()} NOT RECONSTRUCTED — one side is "
                   f"{light / med:.0%} of a normal {kind}, the other {heavy / med:.0%}")
    elif bal < 0.8 and heavy > 1.5 * med:
        out.append(f"something is FUSED INTO one {kind} — the heavy side is "
                   f"{heavy / med:.0%} of normal")
    elif heavy < 0.7 * med:
        out.append(f"both {kind}s undersized — {heavy / med:.0%} of normal")
    elif bal < 0.75:
        out.append(f"{kind}s uneven ({bal:.2f})")

def verdict(r):
    out = []
    limb_verdict("leg", r["legL"], r["legR"], r["total"], out)
    limb_verdict("arm", r["armL"], r["armR"], r["total"], out)
    if r["crown"] > 0.06:
        out.append(f"geometry {r['crown']*100:.0f}% of stature ABOVE the head")
    if r["looseN"]:
        out.append(f"{r['looseN']} unweighted mesh ({r['loose']} verts)")
    # A foot that is as wide as it is long is not a foot. 1.4 sits well below
    # every delivered foot on the roster and well above the lumps, and the two
    # sides are called separately because the usual failure is one of them:
    # Momo's left read 1.05 against her right's 1.98, and the fix was her own
    # right foot mirrored over (tools/blender_fix_foot.py).
    for side, key in (("left", "footL"), ("right", "footR")):
        v = r.get(key)
        if v is not None and v < 1.4:
            out.append(f"the {side} FOOT is a lump ({v:.2f} long-to-wide, ~2.0 is a foot)")
    return out

print("\n=== model health")
print(f"a normal limb, as a share of the model's own mass:"
      f" leg {MED['leg']:.1%}, arm {MED['arm']:.1%}\n")
print(f"{'char':<12}{'legs L':>8}{'legs R':>8}{'bal':>6}"
      f"{'arms L':>8}{'arms R':>8}{'bal':>6}{'prop':>7}{'^head':>7}{'feet':>12}   findings")
for r in sorted(rows, key=lambda r: min(r["legBal"], r["armBal"])):
    feet_col = ("%.2f/%.2f" % (r["footL"], r["footR"])) if r["footL"] and r["footR"] else "—"
    print(f"{r['char']:<12}{r['legL']:>8.0f}{r['legR']:>8.0f}{r['legBal']:>6.2f}"
          f"{r['armL']:>8.0f}{r['armR']:>8.0f}{r['armBal']:>6.2f}{r['prop']:>7.0f}"
          f"{r['crown']*100:>6.1f}%{feet_col:>12}"
          f"   {', '.join(verdict(r))}")

if "--json" in FLAGS:
    out = os.path.join(ROOT, "render3d/docs/reference/model-health.json")
    with open(out, "w") as f:
        json.dump({"rows": [{**r, "findings": verdict(r)} for r in rows]}, f, indent=1)
        f.write("\n")
    print(f"\nwrote {out}")
