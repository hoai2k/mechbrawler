#!/usr/bin/env python3
"""Turn the geometry a bone carries, without moving the bone.

    python3 tools/bake_bone_rotation.py --char maki \
        --bone LeftFoot --axis x --deg 45.9 --apply

WHY. A graft lands a part in the recipient's frame for the part's ROOT bone
(tools/graft_model_part.py). Every other bone inside the part keeps whatever
angle IT had in the donor, and where the two rigs disagree about that bone the
geometry arrives rotated. Maki is the case: her boots came from a model whose
ankles sat 2° from level onto a model whose ankles sit 44° nose-down, so the
boot is pitched 46° against the foot bone that carries it. `levelSole` then
levels the BONE, correctly, and the boot ends up toes-up in the air.

WHAT IT DOES. Rotates the mesh about the bone's bind position, WEIGHTED BY HOW
MUCH OF EACH VERTEX THAT BONE OWNS. A vertex fully weighted to the foot turns
the whole way; one half-owned by the shin turns half as far; one the foot does
not touch does not move. That weighting is the difference between a fix and a
tear — rotating the foot's vertices as a block leaves a 46° step at the ankle
ring, and blending it up the boot shaft leaves nothing to see.

It touches POSITION and NORMAL and nothing else: no weights, no UVs, no bones,
no bind matrices. The skeleton is left exactly as it was, because the skeleton
was never what was wrong.
"""
import argparse
import json
import math
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
ASSETS = os.path.join(ROOT, "render3d/assets")
MANIFEST = os.path.join(ASSETS, "manifest.json")

CTYPE = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
CSIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def read_glb(path):
    with open(path, "rb") as fh:
        data = fh.read()
    magic, version, _t = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or version != 2:
        raise SystemExit(f"{path}: not a glTF 2.0 binary")
    doc, blob, at = None, b"", 12
    while at + 8 <= len(data):
        length, kind = struct.unpack_from("<II", data, at)
        chunk = data[at + 8:at + 8 + length]
        if kind == 0x4E4F534A:
            doc = json.loads(chunk.decode("utf-8"))
        elif kind == 0x004E4942:
            blob = chunk
        at += 8 + length + (-length % 4)
    return doc, blob


def write_glb(path, doc, blob):
    text = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    text += b" " * (-len(text) % 4)
    body = bytes(blob) + b"\0" * (-len(blob) % 4)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(text) + 8 + len(body)))
        fh.write(struct.pack("<II", len(text), 0x4E4F534A))
        fh.write(text)
        fh.write(struct.pack("<II", len(body), 0x004E4942))
        fh.write(body)


def acc_read(doc, blob, i):
    acc = doc["accessors"][i]
    view = doc["bufferViews"][acc["bufferView"]]
    n = NCOMP[acc["type"]]
    size = CSIZE[acc["componentType"]] * n
    stride = view.get("byteStride") or size
    base = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    fmt = "<" + CTYPE[acc["componentType"]] * n
    return [struct.unpack_from(fmt, blob, base + k * stride) for k in range(acc["count"])]


def acc_write(doc, blob, i, rows, fmt1):
    """Overwrite an accessor in place. Same count, same layout, same bytes."""
    acc = doc["accessors"][i]
    view = doc["bufferViews"][acc["bufferView"]]
    n = NCOMP[acc["type"]]
    size = CSIZE[acc["componentType"]] * n
    stride = view.get("byteStride") or size
    base = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    for k, row in enumerate(rows):
        struct.pack_into("<" + fmt1 * n, blob, base + k * stride, *row)
    if acc["type"] == "VEC3" and "min" in acc:
        acc["min"] = [min(r[j] for r in rows) for j in range(3)]
        acc["max"] = [max(r[j] for r in rows) for j in range(3)]


def bind_pos(doc, blob, bone):
    """A bone's world position at bind, from the inverse of its inverse-bind."""
    names = [n.get("name", "") for n in doc["nodes"]]
    skin = doc["skins"][0]
    ibm = acc_read(doc, blob, skin["inverseBindMatrices"])
    for k, nj in enumerate(skin["joints"]):
        if names[nj] != bone:
            continue
        m = ibm[k]
        # column-major 4x4; invert the affine to get the bind matrix
        r = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]]
        t = [m[12], m[13], m[14]]
        det = (r[0][0] * (r[1][1] * r[2][2] - r[1][2] * r[2][1])
               - r[0][1] * (r[1][0] * r[2][2] - r[1][2] * r[2][0])
               + r[0][2] * (r[1][0] * r[2][1] - r[1][1] * r[2][0]))
        if abs(det) < 1e-12:
            raise SystemExit(f"{bone}: singular bind matrix")
        inv = [[(r[(j + 1) % 3][(i + 1) % 3] * r[(j + 2) % 3][(i + 2) % 3]
                 - r[(j + 1) % 3][(i + 2) % 3] * r[(j + 2) % 3][(i + 1) % 3]) / det
                for j in range(3)] for i in range(3)]
        return [-sum(inv[i][j] * t[j] for j in range(3)) for i in range(3)], k
    raise SystemExit(f"{bone}: not in the skin")


def unit(a):
    """`x`/`y`/`z`, or three comma-separated numbers for an arbitrary axis.

    The named axes are the easy case and almost never the right one here: a
    delivery is turned in its own frame by `yawOffsetDeg`, so "pitch the foot"
    is a rotation about a line that is neither X nor Z. Maki is turned 45° and
    a correction about X moved her boots sideways instead of down."""
    if a in ("x", "y", "z"):
        return [1.0 if a == n else 0.0 for n in ("x", "y", "z")]
    v = [float(x) for x in a.split(",")]
    n = math.sqrt(sum(c * c for c in v)) or 1.0
    return [c / n for c in v]


def rotate_dir(v, axis, rad):
    """Rodrigues, so any axis works and not just the three named ones."""
    k = axis
    c, s = math.cos(rad), math.sin(rad)
    kv = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]]
    kd = sum(k[i] * v[i] for i in range(3))
    return [v[i] * c + kv[i] * s + k[i] * kd * (1 - c) for i in range(3)]


def rotate(p, pivot, axis, rad):
    v = rotate_dir([p[i] - pivot[i] for i in range(3)], axis, rad)
    return [v[i] + pivot[i] for i in range(3)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--char", required=True)
    ap.add_argument("--bone", action="append", required=True,
                    help="repeatable: --bone LeftFoot --deg 45.9 --bone RightFoot --deg 14.9")
    ap.add_argument("--deg", action="append", type=float, required=True)
    ap.add_argument("--axis", action="append", default=None,
                    help="x/y/z or 'ax,ay,az'; repeatable, one per --bone")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if len(args.bone) != len(args.deg):
        raise SystemExit("--bone and --deg must come in pairs")
    axes = args.axis or ["x"] * len(args.bone)
    if len(axes) == 1 and len(args.bone) > 1:
        axes = axes * len(args.bone)
    if len(axes) != len(args.bone):
        raise SystemExit("--axis must be given once, or once per --bone")
    axes = [unit(a) for a in axes]

    man = json.load(open(MANIFEST, encoding="utf-8"))["characters"]
    entry = man.get(args.char)
    if not entry or not entry.get("model"):
        raise SystemExit(f"{args.char}: no model in the manifest")
    path = os.path.join(ASSETS, entry["model"])
    doc, blob = read_glb(path)
    out = bytearray(blob)

    for mi, mesh in enumerate(doc.get("meshes", [])):
        for pi, prim in enumerate(mesh.get("primitives", [])):
            attrs = prim.get("attributes", {})
            if "JOINTS_0" not in attrs or "POSITION" not in attrs:
                continue
            pos = acc_read(doc, blob, attrs["POSITION"])
            nor = acc_read(doc, blob, attrs["NORMAL"]) if "NORMAL" in attrs else None
            js = acc_read(doc, blob, attrs["JOINTS_0"])
            ws = acc_read(doc, blob, attrs["WEIGHTS_0"])
            newp = [list(p) for p in pos]
            newn = [list(n) for n in nor] if nor else None
            touched = 0
            for bone, deg, axis in zip(args.bone, args.deg, axes):
                pivot, joint = bind_pos(doc, blob, bone)
                rad = math.radians(deg)
                for v in range(len(pos)):
                    w = sum(ws[v][c] for c in range(4) if js[v][c] == joint)
                    if w <= 1e-4:
                        continue
                    touched += 1
                    newp[v] = rotate(newp[v], pivot, axis, rad * w)
                    if newn:
                        newn[v] = rotate_dir(newn[v], axis, rad * w)
                print(f"  mesh {mi}/{pi} {bone}: pivot "
                      f"({pivot[0]:.3f}, {pivot[1]:.3f}, {pivot[2]:.3f}), {deg:+.1f}°")
            if not touched:
                continue
            if args.apply:
                acc_write(doc, out, attrs["POSITION"], newp, "f")
                if newn:
                    acc_write(doc, out, attrs["NORMAL"], newn, "f")
            print(f"  mesh {mi}/{pi}: {touched} vertex turn(s)")

    if not args.apply:
        print("dry run — pass --apply to write the .glb")
        return 0
    write_glb(path, doc, bytes(out))
    read_glb(path)
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
