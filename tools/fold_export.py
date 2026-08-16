#!/usr/bin/env python3
"""Put the game transform on the SKELETON'S PARENT NODE instead of in the data.

WHY THIS EXISTS. Mech Mayhem's exporter (`tools/export-mech.mjs` in robotworld)
promises a portable mech: native units are game units and +z is forward. It
delivers that by FOLDING the transform — rotating and scaling the vertices, and
premultiplying the yaw into the root bone's rest — while the animation is
sampled from the live build, which is in neither of those frames.

The two halves then disagree, and the disagreement is not a wrong facing but a
TORN BODY: the mesh is bound in the folded frame, the clip drives the skeleton
toward the unfolded one, and every joint away from the root deforms its skin
through a rotation that was never applied to the vertices. It reads exactly the
way the bug was reported — a mech that stands fine and comes apart the instant
it throws a punch — and it gets worse the further a pose travels from bind.

The fix is to stop folding anything. `--nofold` exports the model, the skeleton
and the clips all in the build's own frame, where they agree by construction,
and this script then puts the transform where glTF already has a place for it:
on the node ABOVE the joints. A skinned mesh's own node transform is ignored by
the spec, but a JOINT's ancestors are not — scaling and rotating the armature
scales and rotates the whole rig, rigidly, after the skin has deformed. Nothing
downstream can tell the difference, and nothing can tear.

    node tools/export-mech.mjs --all --out <dir>   # in robotworld, patched to
                                                   # sample in the build frame
    python3 tools/fold_export.py <dir>/*.glb --yaw 270 --scale 9.04432

Reads the yaw and scale from each mech's sidecar `<id>.json` when they are
recorded there; the flags are the override.
"""

from __future__ import annotations

import argparse
import json
import math
import struct
import sys
from pathlib import Path

GLTF_JSON = 0x4E4F534A
GLTF_BIN = 0x004E4942


def read_glb(path: Path):
    d = path.read_bytes()
    if d[:4] != b"glTF":
        raise SystemExit(f"{path}: not a binary glTF")
    off, js, bin_ = 12, None, b""
    while off < len(d):
        ln, ty = struct.unpack_from("<II", d, off)
        chunk = d[off + 8: off + 8 + ln]
        if ty == GLTF_JSON:
            js = json.loads(chunk)
        elif ty == GLTF_BIN:
            bin_ = chunk
        off += 8 + ln
    return js, bin_


def write_glb(path: Path, js: dict, bin_: bytes) -> None:
    jb = json.dumps(js, separators=(",", ":")).encode("utf8")
    jb += b" " * ((4 - len(jb) % 4) % 4)
    bb = bin_ + b"\0" * ((4 - len(bin_) % 4) % 4)
    total = 12 + 8 + len(jb) + (8 + len(bb) if bb else 0)
    out = bytearray()
    out += b"glTF" + struct.pack("<II", 2, total)
    out += struct.pack("<II", len(jb), GLTF_JSON) + jb
    if bb:
        out += struct.pack("<II", len(bb), GLTF_BIN) + bb
    path.write_bytes(bytes(out))


def joint_parent(js: dict) -> int | None:
    """The node every joint hangs off — the one that may carry the transform.

    Taken as the common ancestor of the skin's joints rather than by name: a
    rig may call it Armature, Scene or nothing at all, and putting the scale on
    a node that is not above every joint would rescale half a mech."""
    skin = js.get("skins", [{}])[0]
    joints = set(skin.get("joints", []))
    if not joints:
        return None
    parent = {}
    for i, n in enumerate(js["nodes"]):
        for c in n.get("children", []):
            parent[c] = i
    roots = {j for j in joints if parent.get(j) not in joints}
    above = {parent.get(j) for j in roots}
    if len(above) != 1:
        return None
    return above.pop()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("glb", nargs="+", type=Path)
    ap.add_argument("--yaw", type=float, default=None, help="degrees about +Y")
    ap.add_argument("--scale", type=float, default=None)
    ap.add_argument("--apply", action="store_true", help="write; otherwise dry-run")
    args = ap.parse_args()

    for path in args.glb:
        js, bin_ = read_glb(path)
        side = path.with_suffix(".json")
        yaw, scale = args.yaw, args.scale
        if (yaw is None or scale is None) and side.exists():
            t = json.loads(side.read_text()).get("transform", {})
            yaw = t.get("yawOffsetFolded") if yaw is None else yaw
            scale = t.get("scaleFolded") if scale is None else scale
        yaw = yaw or 0.0
        scale = scale or 1.0

        idx = joint_parent(js)
        if idx is None:
            print(f"  !! {path.name}: no single node above the joints — skipped")
            continue
        node = js["nodes"][idx]
        half = math.radians(yaw) / 2
        rot = [0.0, math.sin(half), 0.0, math.cos(half)]
        had = {k: node.get(k) for k in ("rotation", "scale", "translation") if k in node}
        # The node may already carry a translation (the export grounds the
        # model, and that lands here). It is expressed in the PARENT's frame
        # and glTF applies T before R and S, so it does NOT ride the transform
        # being added — it has to be carried through by hand, or a mech that
        # was standing on the floor ends up hovering a fraction of its old
        # size above it.
        t = node.get("translation", [0.0, 0.0, 0.0])
        c, sn = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
        tx, ty, tz = (v * scale for v in t)
        node["translation"] = [round(tx * c + tz * sn, 9), round(ty, 9),
                               round(-tx * sn + tz * c, 9)]
        node["rotation"] = [round(v, 12) for v in rot]
        node["scale"] = [scale, scale, scale]
        print(f"  {'~' if args.apply else '·'} {path.name}: node[{idx}] "
              f"{node.get('name', '(unnamed)')} <- yaw {yaw}°, scale {scale:.5f}"
              + (f"   (replaced {had})" if had else ""))
        if args.apply:
            write_glb(path, js, bin_)
    print("\nwritten" if args.apply else "\nnothing written — re-run with --apply")
    return 0


if __name__ == "__main__":
    sys.exit(main())
