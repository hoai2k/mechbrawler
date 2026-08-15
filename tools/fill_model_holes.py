#!/usr/bin/env python3
"""Close the tears in a delivered .glb — the ones you can see through.

    python3 tools/fill_model_holes.py                 # what is torn, roster-wide
    python3 tools/fill_model_holes.py yuji            # one fighter
    python3 tools/fill_model_holes.py --apply yuji    # close them

WHAT A TEAR IS. Tripo reconstructs a body from flat boards, and where it has
no idea what is behind something — the underside of a forearm held against the
ribs, the back of a thigh behind the other leg — it sometimes ends the surface
instead of guessing. What is left is a rim: a loop of edges each belonging to
ONE triangle rather than two. Nothing downstream repairs it, because nothing
downstream is looking at topology. It reads in the game as a slit that shows
the inside of the body through it, worse in motion than in a still, and worse
under the toon pass than under a plain material because the interior faces are
lit from the wrong side.

**A CAP GETS ITS OWN TEXTURE COORDINATE, INHERITING EVERYTHING ELSE.** The
first version of this closed each rim over the vertices already on it, which
kept every attribute buffer byte-identical and painted Yuji's hip with the skin
of his hand. The reason is that a rim is exactly where the texture atlas is cut:
walk around one and consecutive vertices land in unrelated islands, so a
triangle spanning them samples a stripe clear across the sheet. No choice among
the rim's own vertices fixes that, because none of them is wrong; the RIM is
the seam.

The `UVx` column is what says so, and it is worth trusting over the obvious
alternative. It reports the widest cap as a multiple of what a normal triangle
in that same mesh covers of the atlas: the version that shipped scored 46×,
this one scores 0. **Colour does not separate them** — the smeared caps drew
from colours the surrounding surface genuinely wears, just not at that point,
so a "is the patch the right colour" check passed the broken build. A number
that looks like a guard and is not is worse than no number.

So a cap adds one vertex per rim position, and the only thing it invents is the
UV: a single coordinate for the whole cap, taken from the surviving surface
around the hole, so the patch comes out the colour of what it is patching.
Everything else — position, normal, JOINTS_0, WEIGHTS_0 — is copied from the
rim vertex it sits on. **That copy is the part that matters.** These are skinned
meshes, and a weight this tool guessed at would be a vertex that swims off the
body the moment a clip plays: a worse fault than the hole, and one that only
shows up in motion. Inheriting a weight from a vertex in the same place is not
guessing.

WHAT IT WILL NOT CLOSE. A big rim is usually not a tear: it is a hem. The
bottom of a coat, a sleeve cuff, the open end of a skirt — all are legitimately
open surfaces, and capping one puts a lid across the opening. So a rim wider
than `--max-frac` of the figure's height is REPORTED AND LEFT, and the number
is deliberately conservative. Look at the ones it skips.
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

# A rim wider than this fraction of the figure's height is a hem, not a tear.
# Yuji's real tears run 0.03-0.17; the coat hems in the roster run 0.33-0.38.
MAX_FRAC = 0.26
# Positions within this fraction of height are the same point. Exporters split
# a vertex for a UV seam or a hard normal, so the index buffer shows a rim where
# the SURFACE has none — welding by position first is what tells the two apart.
WELD_FRAC = 1e-5
# A cap triangle may not cover more of the texture atlas than the mesh's own
# triangles do, times this. THIS is the check that separates a good cap from
# the smeared one that shipped first: the smear scored 23x, because its corners
# sat in different atlas islands and the texture sampled the whole line between
# them. Colour does NOT separate them — the broken caps drew from colours the
# surrounding surface really does wear, just not at that point — so measuring
# colour here would have been a number that looked like a guard and was not.
UV_SPAN_MAX = 2.0


# --- glTF plumbing ---------------------------------------------------------
# A .glb is a 12-byte header and two length-prefixed chunks, JSON then binary.
# Read and written by hand here rather than through a library, because the
# whole point of the edit is that it touches ONE accessor and leaves every
# other byte where it was; a library's writer regenerates the document.

CTYPE = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
CSIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def read_glb(path):
    """(document, binary chunk) for a .glb."""
    with open(path, "rb") as f:
        data = f.read()
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
    if doc is None:
        raise SystemExit(f"{path}: no JSON chunk")
    return doc, blob


def read_accessor(doc, blob, index):
    acc = doc["accessors"][index]
    view = doc["bufferViews"][acc["bufferView"]]
    n = NCOMP[acc["type"]]
    size = CSIZE[acc["componentType"]]
    stride = view.get("byteStride") or (size * n)
    base = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    fmt = "<" + CTYPE[acc["componentType"]] * n
    return [struct.unpack_from(fmt, blob, base + i * stride)
            for i in range(acc["count"])]


# --- topology --------------------------------------------------------------

def weld(positions, tol):
    """Map every vertex to a representative index, merging coincident ones."""
    grid = {}
    rep = [0] * len(positions)
    inv = tol and (1.0 / tol) or 0.0
    for i, p in enumerate(positions):
        key = (int(math.floor(p[0] * inv)), int(math.floor(p[1] * inv)),
               int(math.floor(p[2] * inv)))
        # Check the 27 neighbouring cells so a pair straddling a cell wall still
        # welds; without this the tolerance is a grid artefact rather than a
        # distance.
        hit = None
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    c = grid.get((key[0] + dx, key[1] + dy, key[2] + dz))
                    if c is None:
                        continue
                    q = positions[c]
                    if (abs(q[0] - p[0]) <= tol and abs(q[1] - p[1]) <= tol
                            and abs(q[2] - p[2]) <= tol):
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


def boundary_cycles(tris, rep):
    """Ordered rims, plus which REAL vertices the surviving surface uses.

    The second return value is what stops a cap from being painted out of the
    wrong part of the texture. A welded id stands for several real vertices —
    that is the point of welding — and on a rim those duplicates are usually
    a UV SEAM, so they carry positions that agree and texture coordinates that
    are nowhere near each other. Picking among them arbitrarily is picking an
    atlas island arbitrarily, and Yuji's hip came out painted in the skin of
    his hand. So each boundary edge remembers the real pair from the ONE
    triangle that still owns it, and the cap is built from those.
    """
    count = defaultdict(int)
    real = defaultdict(dict)
    ring = defaultdict(list)
    for tri in tris:
        a, b, c = tri
        for u, v in ((a, b), (b, c), (c, a)):
            ru, rv = rep[u], rep[v]
            if ru == rv:
                continue
            key = (min(ru, rv), max(ru, rv))
            count[key] += 1
            real[key][ru] = u
            real[key][rv] = v
            ring[key] = list(tri)
    edges = [e for e, n in count.items() if n == 1]
    adj = defaultdict(list)
    for u, v in edges:
        adj[u].append(v)
        adj[v].append(u)

    used = set()
    cycles = []
    for start in list(adj):
        for first in adj[start]:
            key = (min(start, first), max(start, first))
            if key in used:
                continue
            # Walk until we come back, always taking an unused edge. A vertex
            # where two rims pinch together has degree 4; taking edges rather
            # than vertices keeps the two rims separate instead of fusing them
            # into one figure-eight that no triangulation can close.
            loop = [start]
            used.add(key)
            prev, cur = start, first
            while cur != start:
                loop.append(cur)
                nxt = None
                for cand in adj[cur]:
                    k = (min(cur, cand), max(cur, cand))
                    if k not in used and cand != prev:
                        nxt = cand
                        break
                if nxt is None:
                    break
                used.add((min(cur, nxt), max(cur, nxt)))
                prev, cur = cur, nxt
            if cur == start and len(loop) >= 3:
                cycles.append((loop, {e: (real[e], ring[e]) for e in real if e in set(
                    (min(loop[i], loop[(i + 1) % len(loop)]),
                     max(loop[i], loop[(i + 1) % len(loop)]))
                    for i in range(len(loop)))}))
    return cycles


# --- triangulation ---------------------------------------------------------

def plane_basis(pts):
    """Best-fit plane for a rim, as two in-plane axes and a normal."""
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    cz = sum(p[2] for p in pts) / len(pts)
    # Newell's method: robust for a ring that is not flat, which every rim on a
    # torn limb is.
    nx = ny = nz = 0.0
    for i, p in enumerate(pts):
        q = pts[(i + 1) % len(pts)]
        nx += (p[1] - q[1]) * (p[2] + q[2])
        ny += (p[2] - q[2]) * (p[0] + q[0])
        nz += (p[0] - q[0]) * (p[1] + q[1])
    ln = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
    n = (nx / ln, ny / ln, nz / ln)
    ref = (1.0, 0.0, 0.0) if abs(n[0]) < 0.9 else (0.0, 1.0, 0.0)
    ux = n[1] * ref[2] - n[2] * ref[1]
    uy = n[2] * ref[0] - n[0] * ref[2]
    uz = n[0] * ref[1] - n[1] * ref[0]
    lu = math.sqrt(ux * ux + uy * uy + uz * uz) or 1.0
    u = (ux / lu, uy / lu, uz / lu)
    v = (n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2],
         n[0] * u[1] - n[1] * u[0])
    return (cx, cy, cz), u, v, n


def ear_clip(poly):
    """Triangulate a simple 2D polygon. Returns index triples into `poly`."""
    idx = list(range(len(poly)))
    area = sum(poly[i][0] * poly[(i + 1) % len(poly)][1]
               - poly[(i + 1) % len(poly)][0] * poly[i][1]
               for i in range(len(poly))) / 2.0
    if area < 0:
        idx.reverse()

    def cross(o, a, b):
        return ((poly[a][0] - poly[o][0]) * (poly[b][1] - poly[o][1])
                - (poly[a][1] - poly[o][1]) * (poly[b][0] - poly[o][0]))

    def inside(p, a, b, c):
        s = ((poly[b][0] - poly[a][0]) * (poly[p][1] - poly[a][1])
             - (poly[b][1] - poly[a][1]) * (poly[p][0] - poly[a][0]))
        t = ((poly[c][0] - poly[b][0]) * (poly[p][1] - poly[b][1])
             - (poly[c][1] - poly[b][1]) * (poly[p][0] - poly[b][0]))
        w = ((poly[a][0] - poly[c][0]) * (poly[p][1] - poly[c][1])
             - (poly[a][1] - poly[c][1]) * (poly[p][0] - poly[c][0]))
        return (s >= 0 and t >= 0 and w >= 0) or (s <= 0 and t <= 0 and w <= 0)

    tris = []
    guard = 0
    while len(idx) > 3 and guard < 4 * len(poly) + 16:
        guard += 1
        clipped = False
        for i in range(len(idx)):
            a, b, c = idx[i - 1], idx[i], idx[(i + 1) % len(idx)]
            if cross(a, b, c) <= 0:
                continue                     # reflex corner, not an ear
            if any(inside(p, a, b, c) for p in idx if p not in (a, b, c)):
                continue                     # something else is in the ear
            tris.append((a, b, c))
            idx.pop(i)
            clipped = True
            guard = 0
            break
        if not clipped:
            break
    if len(idx) == 3:
        tris.append((idx[0], idx[1], idx[2]))
    elif len(idx) > 3:
        # A rim that will not ear-clip is self-intersecting once flattened.
        # Fan it from its first vertex: not a pretty cap, but a closed one, and
        # still built only from vertices that were already there.
        tris.extend((idx[0], idx[i], idx[i + 1]) for i in range(1, len(idx) - 1))
    return tris


def rim_sources(loop, edge_info):
    """(source vertex per rim position, the surviving ring around the hole)."""
    src, ring = {}, []
    for i in range(len(loop)):
        a, b = loop[i], loop[(i + 1) % len(loop)]
        info = edge_info.get((min(a, b), max(a, b)))
        if not info:
            continue
        pairs, tri = info
        ring.extend(tri)
        for w, r in pairs.items():
            src.setdefault(w, r)
    return src, ring


def patch_uv(ring, uvs):
    """One texture coordinate for a whole cap, read off the surface around it.

    Not the mean of the ring: a rim that runs along a seam has its ring split
    between two islands, and the mean of two islands is a third place on the
    sheet that has nothing to do with either — which is how a hip ends up
    painted in a hand. So the ring VOTES. The densest cluster wins, and the
    answer is that cluster's median, which is a coordinate the surviving
    surface actually uses rather than an average of coordinates it uses.

    One coordinate for the whole cap, not one per corner, and that is on
    purpose. A cap sits in a crevice a few centimetres across; a flat patch of
    the right colour disappears there, and any gradient across it can only be
    built out of the same seam-crossing that made the smear.
    """
    pts = [uvs[i] for i in ring]
    if not pts:
        return (0.0, 0.0)
    near = 0.05                        # islands are further apart than this
    best, best_n = pts[0], -1
    for c in pts:
        n = sum(1 for q in pts if math.dist(c, q) <= near)
        if n > best_n:
            best, best_n = c, n
    cluster = [q for q in pts if math.dist(best, q) <= near]
    cluster.sort(key=lambda q: q[0])
    mx = cluster[len(cluster) // 2][0]
    cluster.sort(key=lambda q: q[1])
    my = cluster[len(cluster) // 2][1]
    return (mx, my)


def cap_rim(loop, srcs, positions, normals, uvs, base):
    """Close one rim. Returns (triangles, new vertices) for the caller to append.

    A new vertex is `(source index, uv)`: everything but the texture coordinate
    is copied from the vertex it sits on, so the cap is welded to the body by
    the same bones, at the same place, facing the same way.
    """
    pts = [positions[i] for i in loop]
    ctr, u, v, n = plane_basis(pts)
    flat = [(sum((p[k] - ctr[k]) * u[k] for k in range(3)),
             sum((p[k] - ctr[k]) * v[k] for k in range(3))) for p in pts]
    tris = ear_clip(flat)

    # Face the cap the way the surface around it faces. The rim's own vertex
    # normals already point out of the body, so the cap agrees with them or it
    # is inside-out — and an inside-out cap is invisible from outside, which
    # looks exactly like not having fixed anything.
    avg = [sum(normals[srcs[w]][k] for w in loop) / len(loop) for k in range(3)]
    if sum(avg[k] * n[k] for k in range(3)) < 0:
        tris = [(t[0], t[2], t[1]) for t in tris]

    uv = patch_uv([srcs[w] for w in loop] + list(base[1]), uvs)
    new_verts = [(srcs[w], uv) for w in loop]
    off = base[0]
    return [(off + a, off + b, off + c) for a, b, c in tris], new_verts


# --- per-model -------------------------------------------------------------

def process(path, max_frac, apply):
    doc, blob = read_glb(path)
    # Every delivered rig is one primitive — Tripo emits a single material over
    # the whole body — and the repack below rewrites exactly one index view, so
    # a second primitive would go unrepaired without a word. Say so instead:
    # unreported partial work is the fault this file exists to stop.
    prims = [(mi, pi, p) for mi, mesh in enumerate(doc.get("meshes", []))
             for pi, p in enumerate(mesh.get("primitives", []))
             if "POSITION" in p.get("attributes", {}) and "indices" in p]
    if not prims:
        return [], [], 0, 1.0, "no indexed geometry", 0
    note = "" if len(prims) == 1 else f"only 1 of {len(prims)} primitives"
    mi, pi, prim = prims[0]
    prim_path = (mi, pi)

    positions = read_accessor(doc, blob, prim["attributes"]["POSITION"])
    normals = (read_accessor(doc, blob, prim["attributes"]["NORMAL"])
               if "NORMAL" in prim["attributes"]
               else [(0.0, 1.0, 0.0)] * len(positions))
    raw = read_accessor(doc, blob, prim["indices"])
    flat_idx = [t[0] for t in raw]
    tris = [tuple(flat_idx[i:i + 3]) for i in range(0, len(flat_idx), 3)]

    height = (max(p[1] for p in positions) - min(p[1] for p in positions)) or 1.0
    rep = weld(positions, height * WELD_FRAC)
    # A welded id stands for several real vertices; any of them has the same
    # position, so any will do for a cap. Take the lowest for determinism.
    members = {}
    for i, r in enumerate(rep):
        if r not in members or i < members[r]:
            members[r] = i

    uvs = (read_accessor(doc, blob, prim["attributes"]["TEXCOORD_0"])
           if "TEXCOORD_0" in prim["attributes"] else [(0.0, 0.0)] * len(positions))
    # The mesh's own triangles set the scale for what a sane UV span is.
    spans = sorted(max(math.dist(uvs[a], uvs[b])
                       for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])))
                   for t in tris)
    normal_span = spans[int(len(spans) * 0.99)] if spans else 1.0

    cycles = boundary_cycles(tris, rep)
    filled, skipped, added, new_verts, errors = [], [], [], [], []
    for loop, edge_info in cycles:
        pts = [positions[i] for i in loop]
        span = max(math.dist(pts[i], pts[j])
                   for i in range(0, len(pts), max(1, len(pts) // 24))
                   for j in range(0, len(pts), max(1, len(pts) // 24)))
        frac = span / height
        if frac > max_frac:
            skipped.append((len(loop), frac, pts))
            continue
        srcs, ring = rim_sources(loop, edge_info)
        # Every POSITION on the rim needs a source, and a rim may visit one
        # twice where two rims pinch together — so this counts distinct
        # positions. Counting the list instead read a pinch as a missing source
        # and quietly left five real holes open.
        if len(srcs) < len(set(loop)):
            skipped.append((len(loop), frac, pts))   # no surviving surface to read
            continue
        filled.append((len(loop), frac, pts))
        base = (len(positions) + len(new_verts), ring)
        caps, made = cap_rim(loop, srcs, positions, normals, uvs, base)
        added.extend(caps)
        new_verts.extend(made)
        allw = uvs + [v[1] for v in new_verts]
        errors.append(max((max(math.dist(allw[a], allw[b])
                               for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])))
                           for t in caps), default=0.0))

    if apply and added:
        write_back(path, doc, blob, prim_path, flat_idx, added, new_verts)
    worst = max(errors, default=0.0) / (normal_span or 1.0)
    return filled, skipped, len(added), height, note, worst


def write_back(path, doc, blob, prim_path, flat_idx, added, new_verts):
    """Rewrite the .glb with a longer index view, and NOTHING else changed.

    Two things this deliberately does the long way.

    **The JSON is PATCHED, not regenerated.** Handing the parsed document back
    to a glTF library's writer re-serialises 1800 accessors with their defaults
    spelled out, which added 62 KB of JSON to Yuji to carry 1.6 KB of
    triangles. Editing the original text's parsed form and dumping it compact
    changes the fields this tool means to change and no others.

    **The buffer is REPACKED, not appended to.** Appending the new indices and
    repointing the accessor leaves the old index block stranded mid-buffer —
    shorter code, and it grew the file by 242 KB of bytes nothing reads.
    """
    new = list(flat_idx)
    for t in added:
        new.extend(t)
    top, low = max(new), min(new)
    ctype, fmt = (5123, "<H") if top < 65535 else (5125, "<I")
    packed = b"".join(struct.pack(fmt, i) for i in new)

    mi, pi = prim_path
    prim = doc["meshes"][mi]["primitives"][pi]
    acc = doc["accessors"][prim["indices"]]
    target = acc["bufferView"]

    # Grow every attribute by the cap vertices, each one a copy of the vertex it
    # sits on except for TEXCOORD_0. Copying the raw bytes rather than decoding
    # and re-encoding is deliberate: JOINTS_0 is integer and WEIGHTS_0 may be
    # normalised bytes, and a round trip through floats is how a weight quietly
    # changes value.
    grown = {}
    for name, ai in sorted(prim["attributes"].items()):
        a = doc["accessors"][ai]
        view = doc["bufferViews"][a["bufferView"]]
        size = CSIZE[a["componentType"]] * NCOMP[a["type"]]
        if a.get("byteOffset") or view.get("byteStride", size) != size:
            raise SystemExit(f"{path}: {name} is interleaved — refusing to grow it")
        start = view.get("byteOffset", 0)
        buf = bytearray(blob[start:start + view["byteLength"]])
        for src, uv in new_verts:
            if name == "TEXCOORD_0":
                buf.extend(struct.pack("<ff", uv[0], uv[1]))
            else:
                buf.extend(blob[start + src * size:start + (src + 1) * size])
        grown[a["bufferView"]] = bytes(buf)
        a["count"] += len(new_verts)
    views = doc["bufferViews"]
    order = sorted(range(len(views)), key=lambda i: views[i].get("byteOffset", 0))

    # Repacking is only safe if no two views share bytes. Tripo's output does
    # not, but a file that did would come out silently corrupted, so check.
    spans = [(views[i].get("byteOffset", 0),
              views[i].get("byteOffset", 0) + views[i]["byteLength"]) for i in order]
    if any(spans[i][1] > spans[i + 1][0] for i in range(len(spans) - 1)):
        raise SystemExit(f"{path}: buffer views overlap — refusing to repack")

    out = bytearray()
    for i in order:
        view = views[i]
        while len(out) % 4:
            out.append(0)
        start = view.get("byteOffset", 0)
        chunk = (packed if i == target
                 else grown.get(i, blob[start:start + view["byteLength"]]))
        view["byteOffset"] = len(out)
        view["byteLength"] = len(chunk)
        out.extend(chunk)
    while len(out) % 4:
        out.append(0)

    acc["byteOffset"] = 0
    acc["componentType"] = ctype
    acc["count"] = len(new)
    acc["type"] = "SCALAR"
    acc["max"], acc["min"] = [top], [low]
    doc["buffers"][0]["byteLength"] = len(out)
    doc["buffers"][0].pop("uri", None)

    text = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    text += b" " * (-len(text) % 4)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2,
                            12 + 8 + len(text) + 8 + len(out)))
        f.write(struct.pack("<II", len(text), 0x4E4F534A))
        f.write(text)
        f.write(struct.pack("<II", len(out), 0x004E4942))
        f.write(out)
    read_glb(path)          # it has to parse before we call it written


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("chars", nargs="*")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--file", help="one .glb by path, for a model mid-build "
                                   "that is not in the manifest yet")
    ap.add_argument("--max-frac", type=float, default=MAX_FRAC,
                    help="rims wider than this fraction of height are hems")
    args = ap.parse_args()

    if args.file:
        targets = [(os.path.splitext(os.path.basename(args.file))[0], args.file)]
    else:
        man = json.load(open(MANIFEST, encoding="utf-8"))["characters"]
        targets = [(k, os.path.join(ASSETS, man[k]["model"]))
                   for k in (args.chars or sorted(man))
                   if man.get(k, {}).get("model")]
        missing = [k for k in (args.chars or sorted(man))
                   if not man.get(k, {}).get("model")]
        for k in missing:
            print(f"{k:14}  no model in the manifest")

    print(f"{'model':14}{'tears':>6}{'widest':>8}{'tris':>7}{'UVx':>6}   hems left open")
    total_t = total_s = notes = off = 0
    for key, path in targets:
        if not os.path.exists(path):
            print(f"{key:14}  {path} missing")
            continue
        filled, skipped, tris, _h, note, err = process(path, args.max_frac, args.apply)
        widest = max((f for _n, f, _p in filled), default=0.0)
        hems = ", ".join(f"{f:.2f}" for _n, f, _p in
                         sorted(skipped, key=lambda s: -s[1])[:4]) or "—"
        print(f"{key:14}{len(filled):>6}{widest:>8.3f}{tris:>7}{err:>6.1f}   {hems}"
              + (f"   ⚠ {note}" if note else "")
              + ("   ⚠ a cap spans the atlas — it will smear"
                 if err > UV_SPAN_MAX else ""))
        off += 1 if err > UV_SPAN_MAX else 0
        notes += 1 if note else 0
        total_t += len(filled)
        total_s += len(skipped)
    verb = "closed" if args.apply else "found"
    print(f"\n{verb} {total_t} tear(s); {total_s} rim(s) left open as hems")
    if notes:
        print(f"{notes} model(s) only partly covered — see the ⚠ rows")
    if off:
        print(f"{off} model(s) with a cap spanning more than {UV_SPAN_MAX}x the "
              f"atlas area of a normal triangle — look at them")
    if not args.apply:
        print("dry run — pass --apply to write the .glb files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
