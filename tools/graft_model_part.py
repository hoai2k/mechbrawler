#!/usr/bin/env python3
"""Take a body part from one .glb and put it on another.

    python3 tools/graft_model_part.py --donor old.glb --onto new.glb \
        --part head --out merged.glb
    python3 tools/graft_model_part.py ... --part feet --part head

WHY THIS EXISTS. A regenerated model is not uniformly better than the one it
replaces — it is better in some places and worse in others, because the
generator is re-rolling the whole body every time. Maki's rebuild fixed her
limb balance and her fused weapon and broke her face: a flat plate of hair
lands through the middle of it, hiding one eye. Regenerating again re-rolls
everything, including the parts that came out right. Moving one part across is
the only operation that keeps what worked.

HOW A PART IS DEFINED: by the bones that own it, not by a box. A vertex belongs
to the part if the bone it is mostly weighted to is in the part's bone set, and
a TRIANGLE moves only if all three of its vertices do — so the seam always
falls on the recipient's side and the part comes away clean.

WHERE IT LANDS: by the part's root bone, expressed through the two rigs' bind
matrices. `bind_recipient(root) @ inverseBind_donor(root)` carries a vertex out
of the donor's world, into the root bone's own frame, and back out into the
recipient's world — so the part arrives at the recipient's head or foot,
turned the way that rig is turned, at that rig's scale. Nothing is fitted or
guessed: both matrices are in the files.

THE SEAM IS THE RISK, and the reason this is worth doing on these two parts in
particular: a neck seam sits inside a collar and an ankle seam sits inside a
boot shaft. A part whose join is out in the open needs more than this tool.

THE DONOR KEEPS ITS OWN TEXTURE. Two models do not share a UV atlas, so the
grafted part arrives as its own primitive with its own material and the donor's
image copied in beside it. Repainting the part into the recipient's atlas would
be the alternative and it is a much larger job with much more to go wrong.
"""
import argparse
import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))

CTYPE = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
CSIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}

# What each part is made of. Named by BONE because that is what the skin says,
# and because a box around a head also contains a collar.
PARTS = {
    "head": {"root": "Head", "bones": {"Head"}},
    # The shin comes with the foot. Grafting at the ANKLE puts the donor's
    # slimmer boot against the recipient's bulkier trouser cuff and the join is
    # a visible tear; taking the lower leg too moves the seam up to the knee,
    # which is inside the leg rather than at a change of silhouette.
    "shins": {"root": None, "land": True,
              "bones": {"LeftLeg", "LeftFoot", "LeftToeBase",
                        "RightLeg", "RightFoot", "RightToeBase"},
              "split": [("LeftLeg", {"LeftLeg", "LeftFoot", "LeftToeBase"}),
                        ("RightLeg", {"RightLeg", "RightFoot", "RightToeBase"})]},
    "feet": {"root": None, "land": True,
             "bones": {"LeftFoot", "LeftToeBase",
                                     "RightFoot", "RightToeBase"},
             # Two separate grafts, each about its own ankle: a single frame for
             # both feet would carry the left foot's error onto the right.
             "split": [("LeftFoot", {"LeftFoot", "LeftToeBase"}),
                       ("RightFoot", {"RightFoot", "RightToeBase"})]},
}


def read_glb(path):
    with open(path, "rb") as fh:
        data = fh.read()
    magic, version, _total = struct.unpack_from("<III", data, 0)
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


def view_bytes(doc, blob, i):
    v = doc["bufferViews"][i]
    s = v.get("byteOffset", 0)
    return blob[s:s + v["byteLength"]]


# --- small matrix helpers (no numpy at runtime: this ships beside the game) ---

def mat_from_flat(m):
    """glTF stores column-major; return rows for readability."""
    return [[m[0], m[4], m[8], m[12]],
            [m[1], m[5], m[9], m[13]],
            [m[2], m[6], m[10], m[14]],
            [m[3], m[7], m[11], m[15]]]


def mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def mat_inv(m):
    """Inverse of an affine matrix with a possibly-scaled rotation block."""
    import copy
    n = copy.deepcopy(m)
    inv = [[1.0 if i == j else 0.0 for j in range(4)] for i in range(4)]
    for col in range(4):
        piv = max(range(col, 4), key=lambda r: abs(n[r][col]))
        if abs(n[piv][col]) < 1e-12:
            raise SystemExit("singular bind matrix")
        n[col], n[piv] = n[piv], n[col]
        inv[col], inv[piv] = inv[piv], inv[col]
        d = n[col][col]
        n[col] = [x / d for x in n[col]]
        inv[col] = [x / d for x in inv[col]]
        for r in range(4):
            if r == col:
                continue
            fac = n[r][col]
            n[r] = [x - fac * y for x, y in zip(n[r], n[col])]
            inv[r] = [x - fac * y for x, y in zip(inv[r], inv[col])]
    return inv


def xform_point(m, p):
    return tuple(m[i][0] * p[0] + m[i][1] * p[1] + m[i][2] * p[2] + m[i][3] for i in range(3))


def xform_dir(m, p):
    v = [m[i][0] * p[0] + m[i][1] * p[1] + m[i][2] * p[2] for i in range(3)]
    n = (v[0] ** 2 + v[1] ** 2 + v[2] ** 2) ** 0.5 or 1.0
    return tuple(x / n for x in v)


# --- rig facts -------------------------------------------------------------

def rig_facts(doc, blob):
    names = [n.get("name", "") for n in doc["nodes"]]
    skin = doc["skins"][0]
    joints = skin["joints"]
    ibm = acc_read(doc, blob, skin["inverseBindMatrices"])
    inv_bind = {names[nj]: mat_from_flat(ibm[k]) for k, nj in enumerate(joints)}
    index_of = {names[nj]: k for k, nj in enumerate(joints)}
    return names, joints, inv_bind, index_of


def body_prim(doc):
    """The skinned body: the primitive with the most vertices."""
    best = None
    for mi, mesh in enumerate(doc.get("meshes", [])):
        for pi, p in enumerate(mesh.get("primitives", [])):
            if "JOINTS_0" not in p.get("attributes", {}):
                continue
            n = doc["accessors"][p["attributes"]["POSITION"]]["count"]
            if best is None or n > best[0]:
                best = (n, mi, pi, p)
    if best is None:
        raise SystemExit("no skinned primitive found")
    return best[1], best[2], best[3]


def dominant(joints4, weights4, jname):
    k = max(range(4), key=lambda i: weights4[i])
    return jname.get(joints4[k])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--donor", required=True)
    ap.add_argument("--onto", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--part", action="append", required=True, choices=sorted(PARTS))
    ap.add_argument("--scale", type=float, default=1.0,
                    help="extra uniform scale on the grafted part, about its root joint")
    args = ap.parse_args()

    ddoc, dblob = read_glb(args.donor)
    rdoc, rblob = read_glb(args.onto)
    dnames, djoints, dinv, didx = rig_facts(ddoc, dblob)
    rnames, rjoints, rinv, ridx = rig_facts(rdoc, rblob)
    dmi, dpi, dprim = body_prim(ddoc)
    rmi, rpi, rprim = body_prim(rdoc)

    djname = {k: dnames[nj] for k, nj in enumerate(djoints)}
    rjname = {k: rnames[nj] for k, nj in enumerate(rjoints)}

    dpos = acc_read(ddoc, dblob, dprim["attributes"]["POSITION"])
    dnor = acc_read(ddoc, dblob, dprim["attributes"]["NORMAL"])
    duv = acc_read(ddoc, dblob, dprim["attributes"]["TEXCOORD_0"])
    dj = acc_read(ddoc, dblob, dprim["attributes"]["JOINTS_0"])
    dw = acc_read(ddoc, dblob, dprim["attributes"]["WEIGHTS_0"])
    didxs = [t[0] for t in acc_read(ddoc, dblob, dprim["indices"])]
    dtris = [tuple(didxs[i:i + 3]) for i in range(0, len(didxs), 3)]

    ridxs = [t[0] for t in acc_read(rdoc, rblob, rprim["indices"])]
    rtris = [tuple(ridxs[i:i + 3]) for i in range(0, len(ridxs), 3)]
    rj = acc_read(rdoc, rblob, rprim["attributes"]["JOINTS_0"])
    rw = acc_read(rdoc, rblob, rprim["attributes"]["WEIGHTS_0"])
    rpos = acc_read(rdoc, rblob, rprim["attributes"]["POSITION"])

    # Which bones each part is made of, expanded over the requested parts.
    jobs = []
    for name in args.part:
        spec = PARTS[name]
        for root, bones in spec.get("split", [(spec["root"], spec["bones"])]):
            jobs.append((name, root, bones, spec.get("land", False)))

    # --- 1. cut the part out of the recipient ------------------------------
    all_bones = set()
    for _n, _r, bones, _l in jobs:
        all_bones |= bones
    rin = [dominant(rj[i], rw[i], rjname) in all_bones for i in range(len(rj))]
    kept = [t for t in rtris if not (rin[t[0]] and rin[t[1]] and rin[t[2]])]
    print(f"recipient: dropped {len(rtris) - len(kept)} of {len(rtris)} triangles")

    # --- 2. lift the part out of the donor, one root frame at a time --------
    new_pos, new_nor, new_uv, new_j, new_w = [], [], [], [], []
    new_tris = []
    for pname, root, bones, land in jobs:
        if root not in dinv or root not in rinv:
            print(f"  {pname}/{root}: bone missing from one of the rigs — skipped")
            continue
        first_new = len(new_pos)
        # donor world -> root bone's frame -> recipient world
        M = mat_mul(mat_inv(rinv[root]), dinv[root])
        if args.scale != 1.0:
            pivot = xform_point(mat_inv(rinv[root]), (0.0, 0.0, 0.0))
            S = [[args.scale if i == j else 0.0 for j in range(4)] for i in range(4)]
            S[3][3] = 1.0
            for i in range(3):
                S[i][3] = pivot[i] * (1 - args.scale)
            M = mat_mul(S, M)

        # The recipient verts THIS job removed — what the graft has to stand
        # where. Recomputed per job so the left leg is landed on the left leg's
        # old sole rather than on the lower of the two.
        rin_job = [dominant(rj[i], rw[i], rjname) in bones for i in range(len(rj))]
        din = [dominant(dj[i], dw[i], djname) in bones for i in range(len(dj))]
        take = [t for t in dtris if din[t[0]] and din[t[1]] and din[t[2]]]
        remap = {}
        for t in take:
            tri = []
            for v in t:
                if v not in remap:
                    remap[v] = len(new_pos)
                    new_pos.append(xform_point(M, dpos[v]))
                    new_nor.append(xform_dir(M, dnor[v]))
                    new_uv.append(duv[v])
                    # Bones by NAME. An influence on a bone the recipient does
                    # not have is dropped and the rest renormalised, rather than
                    # left pointing at whatever sits at that index over here.
                    js, ws = [], []
                    for k in range(4):
                        nm = djname.get(dj[v][k])
                        if nm in ridx and dw[v][k] > 0:
                            js.append(ridx[nm])
                            ws.append(dw[v][k])
                    if not js:
                        js, ws = [ridx[root]], [1.0]
                    tot = sum(ws) or 1.0
                    js = (js + [0, 0, 0, 0])[:4]
                    ws = ([x / tot for x in ws] + [0.0, 0.0, 0.0, 0.0])[:4]
                    new_j.append(tuple(js))
                    new_w.append(tuple(ws))
                tri.append(remap[v])
            new_tris.append(tuple(tri))
        # THE FIGHTER HAS TO STAND ON THE FLOOR. The bind matrices land the
        # part correctly ORIENTED and correctly placed relative to its root
        # joint, which is the right answer for a head and half an answer for a
        # leg: a donor whose boot has a thicker sole hangs that much lower, and
        # because the two ankles sit at slightly different heights the two legs
        # hang by DIFFERENT amounts. Maki came out of her graft floating 2.5 cm
        # above the floor with her feet 2.5 cm out of level with each other,
        # which reads as a limp long before anyone thinks to look at the boots.
        # So a part that touches the ground has its lowest point put back where
        # the lowest point of the part it replaced was, and the millimetres of
        # slack go into the seam, up inside the calf, where nothing can see it.
        if land and len(new_pos) > first_new:
            old_low = min((rpos[i][1] for i in range(len(rpos)) if rin_job[i]),
                          default=None)
            if old_low is not None:
                new_low = min(p[1] for p in new_pos[first_new:])
                drop = old_low - new_low
                if abs(drop) > 1e-6:
                    for k in range(first_new, len(new_pos)):
                        x, y, z = new_pos[k]
                        new_pos[k] = (x, y + drop, z)
                    print(f"  {pname}/{root}: sole landed on the floor ({drop * 100:+.1f} cm)")
        print(f"  {pname}/{root}: took {len(take)} triangles, {len(remap)} vertices")

    if not new_tris:
        raise SystemExit("nothing was grafted — check the bone names")

    # --- 3. rebuild the file ------------------------------------------------
    out = bytearray(rblob)

    def add_view(payload, target=None):
        while len(out) % 4:
            out.append(0)
        off = len(out)
        out.extend(payload)
        v = {"buffer": 0, "byteOffset": off, "byteLength": len(payload)}
        if target:
            v["target"] = target
        rdoc["bufferViews"].append(v)
        return len(rdoc["bufferViews"]) - 1

    def add_acc(view, ctype, kind, count, mn=None, mx=None, norm=False):
        a = {"bufferView": view, "componentType": ctype, "count": count, "type": kind}
        if mn is not None:
            a["min"], a["max"] = mn, mx
        if norm:
            a["normalized"] = True
        rdoc["accessors"].append(a)
        return len(rdoc["accessors"]) - 1

    # the recipient's own indices, minus what was cut away
    flat = [i for t in kept for i in t]
    fmt = "<H" if max(flat) < 65535 else "<I"
    rprim["indices"] = add_acc(add_view(b"".join(struct.pack(fmt, i) for i in flat), 34963),
                               5123 if fmt == "<H" else 5125, "SCALAR", len(flat),
                               [min(flat)], [max(flat)])

    def pack(rows, fmt1):
        return b"".join(struct.pack("<" + fmt1 * len(r), *r) for r in rows)

    mn = [min(p[i] for p in new_pos) for i in range(3)]
    mx = [max(p[i] for p in new_pos) for i in range(3)]
    a_pos = add_acc(add_view(pack(new_pos, "f"), 34962), 5126, "VEC3", len(new_pos), mn, mx)
    a_nor = add_acc(add_view(pack(new_nor, "f"), 34962), 5126, "VEC3", len(new_nor))
    a_uv = add_acc(add_view(pack(new_uv, "f"), 34962), 5126, "VEC2", len(new_uv))
    a_j = add_acc(add_view(pack(new_j, "H"), 34962), 5123, "VEC4", len(new_j))
    a_w = add_acc(add_view(pack(new_w, "f"), 34962), 5126, "VEC4", len(new_w))
    gflat = [i for t in new_tris for i in t]
    gfmt = "<H" if max(gflat) < 65535 else "<I"
    a_i = add_acc(add_view(b"".join(struct.pack(gfmt, i) for i in gflat), 34963),
                  5123 if gfmt == "<H" else 5125, "SCALAR", len(gflat),
                  [min(gflat)], [max(gflat)])

    # The donor's material and its image, copied in whole. The part keeps the
    # atlas it was painted against; nothing is repainted.
    dmat = ddoc["materials"][dprim.get("material", 0)]
    tex_i = dmat.get("pbrMetallicRoughness", {}).get("baseColorTexture", {}).get("index")
    new_mat = json.loads(json.dumps(dmat))
    new_mat["name"] = (dmat.get("name", "donor")) + "_graft"
    if tex_i is not None:
        dtex = ddoc["textures"][tex_i]
        dimg = ddoc["images"][dtex["source"]]
        img = {"mimeType": dimg.get("mimeType", "image/png"),
               "name": dimg.get("name", "graft"),
               "bufferView": add_view(view_bytes(ddoc, dblob, dimg["bufferView"]))}
        rdoc.setdefault("images", []).append(img)
        rdoc.setdefault("samplers", [])
        smp = dtex.get("sampler")
        if smp is not None:
            rdoc["samplers"].append(json.loads(json.dumps(ddoc["samplers"][smp])))
        t = {"source": len(rdoc["images"]) - 1}
        if smp is not None:
            t["sampler"] = len(rdoc["samplers"]) - 1
        rdoc.setdefault("textures", []).append(t)
        new_mat["pbrMetallicRoughness"]["baseColorTexture"] = {"index": len(rdoc["textures"]) - 1}
        # Only the base colour travels; a donor's metal/rough/normal maps index
        # its own textures and would point at the recipient's by number.
        for k in ("metallicRoughnessTexture",):
            new_mat["pbrMetallicRoughness"].pop(k, None)
        for k in ("normalTexture", "occlusionTexture", "emissiveTexture"):
            new_mat.pop(k, None)
    rdoc.setdefault("materials", []).append(new_mat)

    rdoc["meshes"][rmi]["primitives"].append({
        "attributes": {"POSITION": a_pos, "NORMAL": a_nor, "TEXCOORD_0": a_uv,
                       "JOINTS_0": a_j, "WEIGHTS_0": a_w},
        "indices": a_i, "material": len(rdoc["materials"]) - 1, "mode": 4,
    })
    rdoc["buffers"][0]["byteLength"] = len(out) + (-len(out) % 4)
    rdoc["buffers"][0].pop("uri", None)
    write_glb(args.out, rdoc, out)
    read_glb(args.out)
    print(f"wrote {args.out}  ({os.path.getsize(args.out) / 1e6:.2f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
