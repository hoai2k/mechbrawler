#!/usr/bin/env python3
"""Smooth a lumpy patch of a delivered mesh, without deflating it.

    python3 tools/smooth_mesh_region.py --char momo --bone Spine1 --bone Spine2 \
        --side back --iters 12 --apply

WHY. An image-to-3D generator reconstructs a surface it cannot see. A back
turned away from every seed view comes out as guesswork, and the guess is
lumpy — Maki and Momo both carry a knot of bumps between the shoulder blades
where a back should be one long curve. Nothing downstream repairs it: the
toon pass shades whatever normals it is handed, and a lump is a real lump.

TAUBIN, NOT LAPLACIAN. Plain Laplacian smoothing moves every vertex toward the
average of its neighbours, which does remove the bumps and also SHRINKS the
surface — run it hard enough on a torso and the fighter loses a cup size and
the costume sinks into the body. Taubin alternates a positive pass with a
slightly larger negative one, which cancels the shrinkage while still killing
the high-frequency noise. That is the whole reason a back can be smoothed
without redrawing it.

WHAT IS SELECTED, and how the edge is hidden. A vertex is in the region by the
BONES that own it, the same rule the graft uses. `--side back` narrows that to
the half facing away from the fighter's front, taken from the manifest's
`yawOffsetDeg` so it works on a delivery turned any which way. Every vertex
then moves by its own selection weight, so the correction fades out where the
region does and leaves no rim to see.

Positions move; normals are rebuilt from the smoothed surface. Weights, UVs,
bones and bind matrices are untouched.
"""
import argparse
import json
import math
import os
import struct
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
ASSETS = os.path.join(ROOT, "render3d/assets")
MANIFEST = os.path.join(ASSETS, "manifest.json")

CTYPE = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
CSIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}

# Taubin's pair. The negative step is a shade larger than the positive one,
# which is what makes the surface come back out to where it started.
LAMBDA = 0.55
MU = -0.58


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


def weld(pos, tol):
    """Group vertices by position, so the surface is connected across the UV
    seams the exporter split it along. Smoothing an unwelded mesh pulls the two
    sides of every seam apart and opens the model up like a paper model."""
    grid, rep = {}, [0] * len(pos)
    inv = 1.0 / tol if tol else 0.0
    for i, p in enumerate(pos):
        key = (int(p[0] * inv), int(p[1] * inv), int(p[2] * inv))
        hit = None
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    c = grid.get((key[0] + dx, key[1] + dy, key[2] + dz))
                    if c is None:
                        continue
                    q = pos[c]
                    if all(abs(q[k] - p[k]) <= tol for k in range(3)):
                        hit = c
                        break
                if hit is not None:
                    break
            if hit is not None:
                break
        if hit is None:
            grid[key] = i
            rep[i] = i
        else:
            rep[i] = hit
    return rep


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--char", required=True)
    ap.add_argument("--bone", action="append", required=True)
    ap.add_argument("--side", default="all", choices=["all", "back", "front"])
    ap.add_argument("--iters", type=int, default=10)
    ap.add_argument("--strength", type=float, default=1.0,
                    help="0..1 scale on the whole correction")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    man = json.load(open(MANIFEST, encoding="utf-8"))["characters"]
    entry = man.get(args.char)
    if not entry or not entry.get("model"):
        raise SystemExit(f"{args.char}: no model in the manifest")
    path = os.path.join(ASSETS, entry["model"])
    doc, blob = read_glb(path)
    out = bytearray(blob)

    # The fighter's own backward, in the model's frame. `yawOffsetDeg` is the
    # angle the delivery is turned by, so forward is +Z turned back through it.
    yaw = math.radians(entry.get("yawOffsetDeg") or 0)
    fwd = (-math.sin(yaw), 0.0, math.cos(yaw))
    names = [n.get("name", "") for n in doc["nodes"]]
    joints = doc["skins"][0]["joints"] if doc.get("skins") else []
    want = {k for k, nj in enumerate(joints) if names[nj] in set(args.bone)}
    if not want:
        raise SystemExit(f"{args.char}: none of {args.bone} are in the skin")

    total = 0
    for mi, mesh in enumerate(doc.get("meshes", [])):
        for pi, prim in enumerate(mesh.get("primitives", [])):
            attrs = prim.get("attributes", {})
            if "JOINTS_0" not in attrs or "indices" not in prim:
                continue
            pos = [list(p) for p in acc_read(doc, blob, attrs["POSITION"])]
            js = acc_read(doc, blob, attrs["JOINTS_0"])
            ws = acc_read(doc, blob, attrs["WEIGHTS_0"])
            idx = [t[0] for t in acc_read(doc, blob, prim["indices"])]
            tris = [tuple(idx[i:i + 3]) for i in range(0, len(idx), 3)]

            height = max(p[1] for p in pos) - min(p[1] for p in pos) or 1.0
            rep = weld(pos, height * 1e-5)

            # centre of the region, to decide which vertices face backward
            sel = {}
            for v in range(len(pos)):
                w = sum(ws[v][c] for c in range(4) if js[v][c] in want)
                if w > 1e-3:
                    sel[v] = w
            if not sel:
                continue
            cx = sum(pos[v][0] for v in sel) / len(sel)
            cz = sum(pos[v][2] for v in sel) / len(sel)
            if args.side != "all":
                sign = -1.0 if args.side == "back" else 1.0
                for v in list(sel):
                    d = (pos[v][0] - cx) * fwd[0] + (pos[v][2] - cz) * fwd[2]
                    # a soft edge, over about 4 cm, so the smoothed half does
                    # not meet the untouched half at a line
                    t = max(0.0, min(1.0, (d * sign) / 0.04))
                    if t <= 0:
                        del sel[v]
                    else:
                        sel[v] *= t
            if not sel:
                continue

            nbr = defaultdict(set)
            for a, b, c in tris:
                for u, v in ((a, b), (b, c), (c, a)):
                    ru, rv = rep[u], rep[v]
                    if ru != rv:
                        nbr[ru].add(rv)
                        nbr[rv].add(ru)

            # welded selection weight: the strongest of the group's members
            wsel = defaultdict(float)
            for v, w in sel.items():
                wsel[rep[v]] = max(wsel[rep[v]], w)
            base = {r: list(pos[r]) for r in nbr}

            def step(cur, factor):
                nxt = dict(cur)
                for r, w in wsel.items():
                    ns = nbr.get(r)
                    if not ns:
                        continue
                    ax = sum(cur[n][0] for n in ns) / len(ns)
                    ay = sum(cur[n][1] for n in ns) / len(ns)
                    az = sum(cur[n][2] for n in ns) / len(ns)
                    k = factor * w * args.strength
                    nxt[r] = [cur[r][0] + k * (ax - cur[r][0]),
                              cur[r][1] + k * (ay - cur[r][1]),
                              cur[r][2] + k * (az - cur[r][2])]
                return nxt

            cur = base
            for _ in range(args.iters):
                cur = step(cur, LAMBDA)
                cur = step(cur, MU)

            moved = 0.0
            for v in range(len(pos)):
                r = rep[v]
                if r in wsel:
                    moved = max(moved, math.dist(pos[v], cur[r]))
                    pos[v] = cur[r]

            # Normals from the smoothed surface, area-weighted over the welded
            # topology so the seams shade continuously.
            nor = defaultdict(lambda: [0.0, 0.0, 0.0])
            for a, b, c in tris:
                pa, pb, pc = pos[a], pos[b], pos[c]
                u = [pb[k] - pa[k] for k in range(3)]
                v = [pc[k] - pa[k] for k in range(3)]
                n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2],
                     u[0] * v[1] - u[1] * v[0]]
                for t in (a, b, c):
                    for k in range(3):
                        nor[rep[t]][k] += n[k]
            normals = acc_read(doc, blob, attrs["NORMAL"]) if "NORMAL" in attrs else None
            if normals:
                normals = [list(n) for n in normals]
                for v in range(len(pos)):
                    r = rep[v]
                    if r not in wsel:
                        continue
                    n = nor[r]
                    L = math.sqrt(sum(c * c for c in n))
                    if L > 1e-9:
                        normals[v] = [c / L for c in n]

            print(f"  mesh {mi}/{pi}: {len(sel)} vertices smoothed, "
                  f"largest move {moved * 100:.1f} cm")
            total += len(sel)
            if args.apply:
                acc_write(doc, out, attrs["POSITION"], pos, "f")
                if normals:
                    acc_write(doc, out, attrs["NORMAL"], normals, "f")

    if not total:
        raise SystemExit("nothing selected — check the bone names")
    if not args.apply:
        print("dry run — pass --apply to write the .glb")
        return 0
    write_glb(path, doc, bytes(out))
    read_glb(path)
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
