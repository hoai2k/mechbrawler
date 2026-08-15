#!/usr/bin/env python3
"""Move a rigged .glb onto a new bind pose, without changing how it looks.

    python3 tools/bake_glb_bind.py --in a.glb --out b.glb --bind bind.json

`bind.json` is `{"bones": {"<name>": [16 floats, column-major], ...},
"yawOffsetDeg": n}` — a matrix per joint in the model's own space, which is
what `bakedBind` in render3d/src/pose.js hands back. This tool is the second
half of `tools/bake_model_fixes.mjs`; on its own it is a general "re-bind this
model" operation.

WHY THIS IS ARITHMETIC AND NOT MODELLING. glTF skins a vertex as

    v' = Σ  weight · ( jointGlobal · inverseBindMatrix ) · v

so a model's bind pose lives in exactly two places: the joint nodes' transforms
and the `inverseBindMatrices`. Moving the bind from B to B' is three edits:

  1. every skinned vertex moves by its own weighted blend of  B'ᵢ · Bᵢ⁻¹,
     which is linear-blend skinning run once, at author time,
  2. each joint node's local TRS is rewritten from B' (local = parent's B'
     inverse, times its own),
  3. each inverseBindMatrix becomes B'ᵢ⁻¹.

Do all three and the model at its new rest looks exactly like the old model did
with the correction applied — which is the whole definition of a bake. Do only
the first two and the skin is corrected twice; only the last two and it is not
corrected at all. Both mistakes look like "the exporter is broken".

NORMALS take the same blend with the translation dropped and the result
renormalised. TANGENTS likewise, keeping the handedness in w. MORPH TARGETS are
deltas rather than points, so they take the linear part only — Mahito's
transfiguration arms are the reason that line exists.

WHAT IT DOES NOT TOUCH: materials, textures, extras, UVs, weights, joint
indices, clips, the node graph's shape, or anything outside the skin. That is
the reason not to route this through a DCC round trip — an export rewrites all
of them, and this project keeps its toon settings in material extras and its
shade bias in a texture's alpha channel.

THE ROOT YAW rides along as a rotation applied to the whole model in the same
pass — same arithmetic, one extra factor on the left of every B'.
"""
import argparse
import json
import math
import os
import struct
import sys

CTYPE = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
CSIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


# ------------------------------------------------------------------ glb io

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
    return doc, bytearray(blob)


def write_glb(path, doc, blob):
    text = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    text += b" " * (-len(text) % 4)
    body = bytes(blob) + b"\0" * (-len(blob) % 4)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<III", 0x46546C67, 2,
                             12 + 8 + len(text) + 8 + len(body)))
        fh.write(struct.pack("<II", len(text), 0x4E4F534A))
        fh.write(text)
        fh.write(struct.pack("<II", len(body), 0x004E4942))
        fh.write(body)


def acc_read(doc, blob, i):
    acc = doc["accessors"][i]
    n = NCOMP[acc["type"]]
    if "bufferView" not in acc:
        return [tuple([0] * n) for _ in range(acc["count"])]
    view = doc["bufferViews"][acc["bufferView"]]
    size = CSIZE[acc["componentType"]] * n
    stride = view.get("byteStride") or size
    base = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    fmt = "<" + CTYPE[acc["componentType"]] * n
    return [struct.unpack_from(fmt, blob, base + k * stride)
            for k in range(acc["count"])]


def acc_write(doc, blob, i, rows):
    acc = doc["accessors"][i]
    n = NCOMP[acc["type"]]
    view = doc["bufferViews"][acc["bufferView"]]
    size = CSIZE[acc["componentType"]] * n
    stride = view.get("byteStride") or size
    base = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    fmt = "<" + CTYPE[acc["componentType"]] * n
    for k, row in enumerate(rows):
        struct.pack_into(fmt, blob, base + k * stride, *row)
    if acc["type"] in ("VEC3", "VEC4") and "min" in acc:
        acc["min"] = [min(r[j] for r in rows) for j in range(n)]
        acc["max"] = [max(r[j] for r in rows) for j in range(n)]


# ------------------------------------------------------------- 4x4 matrices
#
# Column-major throughout, matching glTF and three.js: m[c * 4 + r].

def mat_mul(a, b):
    out = [0.0] * 16
    for c in range(4):
        for r in range(4):
            out[c * 4 + r] = sum(a[k * 4 + r] * b[c * 4 + k] for k in range(4))
    return out


def mat_apply(m, p):
    x, y, z = p
    w = m[3] * x + m[7] * y + m[11] * z + m[15]
    w = w or 1.0
    return ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
            (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
            (m[2] * x + m[6] * y + m[10] * z + m[14]) / w)


def mat_apply_dir(m, v):
    x, y, z = v
    return (m[0] * x + m[4] * y + m[8] * z,
            m[1] * x + m[5] * y + m[9] * z,
            m[2] * x + m[6] * y + m[10] * z)


def mat_inverse(m):
    """General 4x4 inverse — the same expansion three.js uses."""
    n = m
    a00, a01, a02, a03 = n[0], n[1], n[2], n[3]
    a10, a11, a12, a13 = n[4], n[5], n[6], n[7]
    a20, a21, a22, a23 = n[8], n[9], n[10], n[11]
    a30, a31, a32, a33 = n[12], n[13], n[14], n[15]
    b00 = a00 * a11 - a01 * a10
    b01 = a00 * a12 - a02 * a10
    b02 = a00 * a13 - a03 * a10
    b03 = a01 * a12 - a02 * a11
    b04 = a01 * a13 - a03 * a11
    b05 = a02 * a13 - a03 * a12
    b06 = a20 * a31 - a21 * a30
    b07 = a20 * a32 - a22 * a30
    b08 = a20 * a33 - a23 * a30
    b09 = a21 * a32 - a22 * a31
    b10 = a21 * a33 - a23 * a31
    b11 = a22 * a33 - a23 * a32
    det = (b00 * b11 - b01 * b10 + b02 * b09
           + b03 * b08 - b04 * b07 + b05 * b06)
    if abs(det) < 1e-20:
        raise SystemExit("singular matrix in bind")
    d = 1.0 / det
    return [
        (a11 * b11 - a12 * b10 + a13 * b09) * d,
        (a02 * b10 - a01 * b11 - a03 * b09) * d,
        (a31 * b05 - a32 * b04 + a33 * b03) * d,
        (a22 * b04 - a21 * b05 - a23 * b03) * d,
        (a12 * b08 - a10 * b11 - a13 * b07) * d,
        (a00 * b11 - a02 * b08 + a03 * b07) * d,
        (a32 * b02 - a30 * b05 - a33 * b01) * d,
        (a20 * b05 - a22 * b02 + a23 * b01) * d,
        (a10 * b10 - a11 * b08 + a13 * b06) * d,
        (a01 * b08 - a00 * b10 - a03 * b06) * d,
        (a30 * b04 - a31 * b02 + a33 * b00) * d,
        (a21 * b02 - a20 * b04 - a23 * b00) * d,
        (a11 * b07 - a10 * b09 - a12 * b06) * d,
        (a00 * b09 - a01 * b07 + a02 * b06) * d,
        (a31 * b01 - a30 * b03 - a32 * b00) * d,
        (a20 * b03 - a21 * b01 + a22 * b00) * d,
    ]


def mat_from_node(node):
    if "matrix" in node:
        return list(node["matrix"])
    t = node.get("translation", [0, 0, 0])
    r = node.get("rotation", [0, 0, 0, 1])
    s = node.get("scale", [1, 1, 1])
    x, y, z, w = r
    x2, y2, z2 = x + x, y + y, z + z
    xx, xy, xz = x * x2, x * y2, x * z2
    yy, yz, zz = y * y2, y * z2, z * z2
    wx, wy, wz = w * x2, w * y2, w * z2
    sx, sy, sz = s
    return [
        (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0.0,
        (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0.0,
        (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0.0,
        t[0], t[1], t[2], 1.0,
    ]


def node_from_mat(m):
    """Decompose to TRS. Scale is read off the column lengths, and a negative
    determinant puts the sign on X, which is three.js's convention too."""
    sx = math.dist((0, 0, 0), (m[0], m[1], m[2]))
    sy = math.dist((0, 0, 0), (m[4], m[5], m[6]))
    sz = math.dist((0, 0, 0), (m[8], m[9], m[10]))
    det = (m[0] * (m[5] * m[10] - m[6] * m[9])
           - m[4] * (m[1] * m[10] - m[2] * m[9])
           + m[8] * (m[1] * m[6] - m[2] * m[5]))
    if det < 0:
        sx = -sx
    ix = 1.0 / sx if sx else 0.0
    iy = 1.0 / sy if sy else 0.0
    iz = 1.0 / sz if sz else 0.0
    r = [m[0] * ix, m[1] * ix, m[2] * ix,
         m[4] * iy, m[5] * iy, m[6] * iy,
         m[8] * iz, m[9] * iz, m[10] * iz]
    trace = r[0] + r[4] + r[8]
    if trace > 0:
        s = 0.5 / math.sqrt(trace + 1.0)
        q = [(r[5] - r[7]) * s, (r[6] - r[2]) * s, (r[1] - r[3]) * s, 0.25 / s]
    elif r[0] > r[4] and r[0] > r[8]:
        s = 2.0 * math.sqrt(1.0 + r[0] - r[4] - r[8])
        q = [0.25 * s, (r[3] + r[1]) / s, (r[6] + r[2]) / s, (r[5] - r[7]) / s]
    elif r[4] > r[8]:
        s = 2.0 * math.sqrt(1.0 + r[4] - r[0] - r[8])
        q = [(r[3] + r[1]) / s, 0.25 * s, (r[7] + r[5]) / s, (r[6] - r[2]) / s]
    else:
        s = 2.0 * math.sqrt(1.0 + r[8] - r[0] - r[4])
        q = [(r[6] + r[2]) / s, (r[7] + r[5]) / s, 0.25 * s, (r[1] - r[3]) / s]
    n = math.sqrt(sum(v * v for v in q)) or 1.0
    return ([m[12], m[13], m[14]], [v / n for v in q], [sx, sy, sz])


def mat_to_quat(m):
    """The rotation half of a matrix, as xyzw — scale divided out first so a
    corrected joint that carries one does not come back as a bent quaternion."""
    _t, r, _s = node_from_mat(m)
    return r


def quat_mul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz)


def yaw_matrix(deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return [c, 0.0, -s, 0.0,  0.0, 1.0, 0.0, 0.0,
            s, 0.0, c, 0.0,   0.0, 0.0, 0.0, 1.0]


# ------------------------------------------------------------------- the bake

def bake(src, dst, spec, report=print):
    doc, blob = read_glb(src)
    nodes = doc.get("nodes", [])
    by_name = {n.get("name"): i for i, n in enumerate(nodes) if n.get("name")}
    parent_of = {}
    for i, n in enumerate(nodes):
        for c in n.get("children", []):
            parent_of[c] = i

    want = spec.get("bones") or {}
    yaw = float(spec.get("yawOffsetDeg") or 0.0)
    # The root turn is one more factor on the left of every corrected matrix:
    # the engine spun the whole rig, so every joint in it moves together.
    #
    # POSITIVE, not negative. The engine set `root.rotation.y = turn +
    # yawOffset`; after the bake the manifest key is gone, so the file has to
    # arrive already turned BY the offset for the same fighter to face the same
    # way. Getting this backwards turns each fighter by twice their offset and
    # is unmistakable: hands and feet a metre and a half out of place, on
    # exactly the fighters whose offset is not zero.
    pre = yaw_matrix(yaw) if yaw else None

    # WHAT EACH JOINT'S BIND BECOMES. Keyed by node index, in model space.
    new_global = {}
    for name, flat in want.items():
        i = by_name.get(name)
        if i is None:
            continue
        m = list(flat)
        new_global[i] = mat_mul(pre, m) if pre else m

    # ------------------------------------------------------- move the vertices
    #
    # One pass per skin. `delta` is the transform each joint drags its share of
    # the mesh through: where the joint ends up, times where it started from.
    moved_meshes = set()
    for skin in doc.get("skins", []):
        joints = skin["joints"]
        ibms = acc_read(doc, blob, skin["inverseBindMatrices"])
        delta = {}
        for k, j in enumerate(joints):
            ibm = list(ibms[k])
            g = new_global.get(j)
            if g is None:
                # Not corrected: the joint keeps its bind, so its delta is the
                # yaw alone (or nothing).
                g = mat_mul(pre, mat_inverse(ibm)) if pre else None
                if g is None:
                    delta[k] = None
                    continue
            delta[k] = mat_mul(g, ibm)

        for mesh_i, mesh in enumerate(doc.get("meshes", [])):
            if not any(n.get("mesh") == mesh_i and n.get("skin") is not None
                       and doc["skins"][n["skin"]] is skin for n in nodes):
                continue
            if mesh_i in moved_meshes:
                continue
            moved_meshes.add(mesh_i)
            for prim in mesh.get("primitives", []):
                attrs = prim.get("attributes", {})
                if "JOINTS_0" not in attrs or "POSITION" not in attrs:
                    continue
                pos = acc_read(doc, blob, attrs["POSITION"])
                jix = acc_read(doc, blob, attrs["JOINTS_0"])
                wgt = acc_read(doc, blob, attrs["WEIGHTS_0"])
                nrm = acc_read(doc, blob, attrs["NORMAL"]) if "NORMAL" in attrs else None
                tan = acc_read(doc, blob, attrs["TANGENT"]) if "TANGENT" in attrs else None

                def blend(k):
                    """The 4x4 this vertex is dragged through: its own weighted
                    mix of its joints' deltas. Summing MATRICES rather than
                    picking the strongest is what keeps a seam smooth — it is
                    the same linear blend the GPU does every frame."""
                    acc = [0.0] * 16
                    total = 0.0
                    for s in range(4):
                        w = wgt[k][s]
                        if w <= 0:
                            continue
                        d = delta.get(jix[k][s])
                        if d is None:
                            d = [1.0 if a in (0, 5, 10, 15) else 0.0 for a in range(16)]
                        for a in range(16):
                            acc[a] += d[a] * w
                        total += w
                    if total <= 1e-8:
                        return None
                    if abs(total - 1.0) > 1e-6:
                        acc = [a / total for a in acc]
                    return acc

                new_pos, new_nrm, new_tan = [], [], []
                for k in range(len(pos)):
                    m = blend(k)
                    if m is None:
                        new_pos.append(pos[k])
                        if nrm:
                            new_nrm.append(nrm[k])
                        if tan:
                            new_tan.append(tan[k])
                        continue
                    new_pos.append(mat_apply(m, pos[k]))
                    if nrm:
                        d = mat_apply_dir(m, nrm[k])
                        L = math.sqrt(sum(c * c for c in d)) or 1.0
                        new_nrm.append((d[0] / L, d[1] / L, d[2] / L))
                    if tan:
                        d = mat_apply_dir(m, tan[k][:3])
                        L = math.sqrt(sum(c * c for c in d)) or 1.0
                        new_tan.append((d[0] / L, d[1] / L, d[2] / L, tan[k][3]))
                acc_write(doc, blob, attrs["POSITION"], new_pos)
                if nrm:
                    acc_write(doc, blob, attrs["NORMAL"], new_nrm)
                if tan:
                    acc_write(doc, blob, attrs["TANGENT"], new_tan)

                # MORPH TARGETS are deltas, not points, so they take the linear
                # part and no translation. Mahito's arms are why this is here.
                for target in prim.get("targets", []):
                    if "POSITION" not in target:
                        continue
                    tp = acc_read(doc, blob, target["POSITION"])
                    out = []
                    for k in range(len(tp)):
                        m = blend(k)
                        out.append(mat_apply_dir(m, tp[k]) if m else tp[k])
                    acc_write(doc, blob, target["POSITION"], out)
                    if "NORMAL" in target:
                        tn = acc_read(doc, blob, target["NORMAL"])
                        outn = []
                        for k in range(len(tn)):
                            m = blend(k)
                            outn.append(mat_apply_dir(m, tn[k]) if m else tn[k])
                        acc_write(doc, blob, target["NORMAL"], outn)

        # ------------------------------------------- and the bind itself
        new_ibms = []
        for k, j in enumerate(joints):
            g = new_global.get(j)
            if g is None:
                g = mat_mul(pre, mat_inverse(list(ibms[k]))) if pre else mat_inverse(list(ibms[k]))
            new_ibms.append(tuple(mat_inverse(g)))
        acc_write(doc, blob, skin["inverseBindMatrices"], new_ibms)

    # ------------------------------------------------- rewrite the joint nodes
    #
    # Local, because that is what a node stores: the parent's new global
    # inverted, times this one's. A joint whose parent is not itself corrected
    # is read against the parent's ORIGINAL global, which is still where it is.
    original_global = {}

    def global_of(i):
        if i in original_global:
            return original_global[i]
        m = mat_from_node(nodes[i])
        p = parent_of.get(i)
        g = mat_mul(global_of(p), m) if p is not None else m
        original_global[i] = g
        return g

    for i in range(len(nodes)):
        global_of(i)

    for i, g in new_global.items():
        p = parent_of.get(i)
        parent_g = new_global.get(p, original_global.get(p)) if p is not None else None
        local = mat_mul(mat_inverse(parent_g), g) if parent_g is not None else g
        t, r, s = node_from_mat(local)
        node = nodes[i]
        node.pop("matrix", None)
        node["translation"] = [round(v, 7) for v in t]
        node["rotation"] = [round(v, 7) for v in r]
        node["scale"] = [round(v, 7) for v in s]

    # ------------------------------------------------- and rewrite the CLIPS
    #
    # THE PIECE THAT IS EASY TO MISS, and it undoes the whole bake when it is
    # missing. A clip track sets a bone's local rotation ABSOLUTELY. Bake a
    # correction into the bind and the first clip that animates that bone
    # writes the uncorrected rotation straight back over it — and because the
    # skin is now bound to the CORRECTED bind, the mesh is dragged back to
    # exactly the shape the correction was removing.
    #
    # It shows up as a bake that is perfect in the rig check and wrong
    # everywhere else: Hanami's T-pose matched to 0.0mm while his idle was out
    # by 579mm, because his head tilt lives on a bone his idle animates.
    #
    # The fix is the same delta, applied to the keys: the correction is
    # D = newLocal · oldLocal⁻¹ in the parent's frame, so a key q becomes D·q
    # and a key t becomes D·t. Bones no clip touches need nothing; bones every
    # clip touches need it in every clip.
    delta_local = {}
    for i, g in new_global.items():
        old_local = mat_from_node(nodes[i])
        p_i = parent_of.get(i)
        parent_g = new_global.get(p_i, original_global.get(p_i)) if p_i is not None else None
        new_local = mat_mul(mat_inverse(parent_g), g) if parent_g is not None else g
        delta_local[i] = mat_mul(new_local, mat_inverse(old_local))

    touched_channels = 0
    for anim in doc.get("animations", []):
        for ch in anim.get("channels", []):
            node_i = ch.get("target", {}).get("node")
            path = ch.get("target", {}).get("path")
            d = delta_local.get(node_i)
            if d is None or path not in ("rotation", "translation"):
                continue
            sampler = anim["samplers"][ch["sampler"]]
            keys = acc_read(doc, blob, sampler["output"])
            if path == "rotation":
                dq = mat_to_quat(d)
                out = [quat_mul(dq, k) for k in keys]
            else:
                out = [mat_apply(d, k) for k in keys]
            acc_write(doc, blob, sampler["output"], out)
            touched_channels += 1

    # ANYTHING ELSE HANGING OFF A CORRECTED JOINT — a weapon on Prop_Main, an
    # unskinned accessory — is parented to that joint, so it has already moved
    # with it. Nothing to do, and doing something would move it twice.

    write_glb(dst, doc, blob)
    report(f"  bind rewritten: {len(new_global)} joint(s), "
           f"{len(moved_meshes)} skinned mesh(es), "
           f"{touched_channels} clip channel(s)"
           + (f", yaw {yaw:g}°" if yaw else ""))
    return len(new_global)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", required=True)
    ap.add_argument("--bind", required=True)
    args = ap.parse_args()
    spec = json.load(open(args.bind))
    if not bake(args.src, args.dst, spec):
        sys.exit("nothing matched — no joint names in common")


if __name__ == "__main__":
    main()
