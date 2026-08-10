#!/usr/bin/env python3
"""Detect, audit, and correct sprite facing — with metadata kept coherent.

The sheets (and therefore the game) treat **right** as the canonical facing.
Generated pose art frequently comes back facing left, so every import needs to
be checked and, when needed, mirrored offline. Mirroring a PNG is the easy
part; the trap is that a frame's placement metadata is expressed in cell
coordinates, so a naive flip leaves the sprite off-centre. This tool flips the
pixels *and* fixes `ox` / `centroidX` / `faceLeft` together.

  --audit          detected vs recorded facing for every frame, worst first
  --board          visual verification sheet (detection is a prior, not proof)
  --flip A/B ...   mirror those frames in place and repair their metadata
  --check PATH     detect facing of a loose image before importing it

Detection is a *heuristic*: it isolates the head blob and asks which side of it
the skin sits on. Measured at ~83% on known-good data, so it is used to
prioritise review, never to auto-flip. Always confirm on the board (or in game)
before flipping.

Examples:
  python3 sprite_facing.py --audit
  python3 sprite_facing.py --board --chars toji,todo
  python3 sprite_facing.py --flip toji/r4c0 toji/r4c1
  python3 sprite_facing.py --check ~/Downloads/new_pose.png
"""

import argparse
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageOps
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SPRITES = os.path.join(HERE, "..", "assets", "sprites")
MANIFEST = os.path.join(SPRITES, "manifest.json")
CELL_W = 313.5

HEAD_TOP_FRACTION = 0.16   # calibrated against the run rows (all face right)
MIN_SKIN_PX = 25
LOW_CONFIDENCE = 0.06


def load_manifest():
    with open(MANIFEST) as f:
        return json.load(f)


def save_manifest(man):
    with open(MANIFEST, "w") as f:
        json.dump(man, f, indent=1)


# ----------------------------------------------------------------- detection

def _skin(rgb):
    r = rgb[:, :, 0].astype(int)
    g = rgb[:, :, 1].astype(int)
    b = rgb[:, :, 2].astype(int)
    return (r > 115) & (r > g + 10) & (g >= b - 6) & ((r - b) > 15) & ((r - b) < 120)


def detect_facing(img):
    """Return (direction, confidence). direction is 'right' | 'left' | '?'.

    Isolates the head (largest blob in the top slice of the body) and measures
    which side of it the skin — i.e. the face — sits on. Hair is deliberately
    NOT used as a counter-signal: anime hair frequently covers the face side and
    measurably degrades accuracy.
    """
    alpha = img[:, :, 3]
    rgb = img[:, :, :3]
    body = alpha >= 128
    if body.sum() < 400:
        return "?", 0.0

    ys = np.nonzero(body)[0]
    y0, h = ys.min(), ys.max() - ys.min() + 1
    top = np.zeros_like(body)
    top[y0: y0 + max(4, int(h * HEAD_TOP_FRACTION))] = True

    labels, n = ndimage.label(body & top, structure=np.ones((3, 3), np.int8))
    if n == 0:
        return "?", 0.0
    counts = np.bincount(labels.ravel())
    counts[0] = 0
    head = labels == counts.argmax()

    hxs = np.nonzero(head)[1]
    head_w = hxs.max() - hxs.min() + 1
    if head_w < 6:
        return "?", 0.0

    skin = _skin(rgb) & head
    if skin.sum() < MIN_SKIN_PX:
        return "?", 0.0

    centre = (hxs.min() + hxs.max()) / 2
    offset = (np.nonzero(skin)[1].mean() - centre) / head_w
    return ("right" if offset > 0 else "left"), abs(offset)


# ------------------------------------------------------------------ flipping

def flip_frame(man, char, key, dry_run=False):
    """Mirror a frame's pixels and repair every piece of derived metadata.

    Placement is stored in cell coordinates: the frame occupies
    [ox, ox + w] inside a CELL_W-wide cell. Mirroring the art about the cell's
    centre maps x -> CELL_W - x, so the new left edge is CELL_W - (ox + w).
    Vertical metadata (oy, bodyBottom, bodyH) is unaffected. `faceLeft` is
    cleared because the art is now canonical right-facing.
    """
    frames = man["characters"].get(char)
    if not frames or key not in frames:
        return f"{char}/{key}: not in manifest"
    meta = frames[key]
    path = os.path.join(SPRITES, meta["file"])
    if not os.path.exists(path):
        return f"{char}/{key}: file missing"

    old_ox = meta.get("ox", 0)
    w = meta["w"]
    new_ox = round(CELL_W - (old_ox + w), 1)
    old_centroid = meta.get("centroidX")
    new_centroid = round(CELL_W - old_centroid, 1) if old_centroid is not None else None

    if not dry_run:
        img = Image.open(path).convert("RGBA")
        ImageOps.mirror(img).save(path)
        meta["ox"] = new_ox
        if new_centroid is not None:
            meta["centroidX"] = new_centroid
        meta.pop("faceLeft", None)
        # keep the manifest's exception list in step
        native_left = man.setdefault("nativeLeft", {})
        if char in native_left and key in native_left[char]:
            native_left[char] = [k for k in native_left[char] if k != key]

    return (f"{char}/{key}: mirrored  ox {old_ox} -> {new_ox}"
            + (f", centroidX {old_centroid} -> {new_centroid}" if new_centroid is not None else "")
            + ", faceLeft cleared")


# -------------------------------------------------------------------- import

def key_background(img, tol=60):
    """Remove a flat chroma background (magenta #FF00FF or mid-grey) if the
    delivered art still has one. No-ops on art that already has real alpha."""
    arr = np.array(img).astype(int)
    if arr[:, :, 3].min() < 250:          # already keyed
        return img
    rgb = arr[:, :, :3]
    corners = np.array([rgb[0, 0], rgb[0, -1], rgb[-1, 0], rgb[-1, -1]])
    bg = np.median(corners, axis=0)
    dist = np.abs(rgb - bg).sum(axis=2)
    arr[:, :, 3] = np.where(dist < tol, 0, 255)
    return Image.fromarray(arr.astype(np.uint8))


def import_frame(man, src_path, char, key, face="auto", body_h=None, dry_run=False):
    """Bring a delivered pose image in as a character frame, normalised to the
    project's canonical right-facing orientation with coherent placement data."""
    if char not in man["characters"]:
        return f"unknown character '{char}'"

    img = key_background(Image.open(src_path).convert("RGBA"))
    arr = np.array(img)

    detected, conf = detect_facing(arr)
    should_mirror = (face == "left") or (face == "auto" and detected == "left")
    if should_mirror:
        img = ImageOps.mirror(img)
        arr = np.array(img)

    alpha = arr[:, :, 3]
    ys, xs = np.nonzero(alpha >= 8)
    if not len(xs):
        return f"{src_path}: no visible pixels"
    bx0, bx1 = int(xs.min()), int(xs.max() + 1)
    by0, by1 = int(ys.min()), int(ys.max() + 1)

    frames = man["characters"][char]
    # Size target: match the median body height of this frame's ROW, so a new
    # crouch matches other crouches rather than the (taller) standing art.
    row = key[:2]
    siblings = [m["bodyH"] for k, m in frames.items()
                if k.startswith(row) and k != key and m.get("bodyH")]
    if body_h is None:
        if siblings:
            body_h = float(np.median(siblings))
            basis = f"median bodyH of row {row} ({len(siblings)} frames)"
        else:
            ref = frames.get("r0c0", {})
            body_h = float(ref.get("bodyH", 187))
            basis = "idle frame (no row siblings — CHECK THIS)"
    else:
        basis = "explicit --body-h"

    # Ground line: reuse the row's convention so feet land consistently.
    bottoms = [m["bodyBottom"] for k, m in frames.items()
               if k.startswith(row) and k != key and m.get("bodyBottom")]
    body_bottom = int(np.median(bottoms)) if bottoms else 310

    centre_x = (bx0 + bx1) / 2
    meta = {
        "file": f"{char}/{key}.png",
        "w": int(arr.shape[1]),
        "h": int(arr.shape[0]),
        "ox": round(CELL_W / 2 - centre_x, 1),
        "oy": int(body_bottom - by1),
        "bodyBottom": body_bottom,
        "bodyH": round(body_h, 1),
        "centroidX": round(CELL_W / 2, 1),
        "renderScale": round(body_h / (by1 - by0), 3),
    }

    lines = [
        f"{char}/{key} <- {os.path.basename(src_path)}",
        f"  detected facing : {detected} (confidence {conf:.2f})"
        + ("  [LOW — verify]" if conf < LOW_CONFIDENCE else ""),
        f"  mirrored        : {'yes (now canonical right-facing)' if should_mirror else 'no'}",
        f"  size target     : bodyH {body_h:.1f} from {basis}",
        f"  renderScale     : {meta['renderScale']}  (art body {by1 - by0}px -> {body_h:.0f}px)",
        f"  anchor          : bodyBottom {body_bottom}, oy {meta['oy']}, ox {meta['ox']}",
    ]
    if not dry_run:
        out = os.path.join(SPRITES, char, f"{key}.png")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        img.save(out)
        frames[key] = meta
        native_left = man.setdefault("nativeLeft", {})
        if char in native_left:
            native_left[char] = [k for k in native_left[char] if k != key]
        lines.append(f"  written         : {out}")
        lines.append(f"  NOTE: add (\"{char}\", \"{key}\"): "
                     f"{{\"bodyBottom\": {body_bottom}, \"bodyH\": {body_h:.1f}}} "
                     f"to GENERATED_FRAME_TARGETS in extract_sprites.py")
    else:
        lines.append("  (dry run — nothing written)")
    return "\n".join(lines)


def set_facing(man, char, key, facing):
    """Correct a mislabelled frame whose ART is already fine.

    Distinct from --flip: nothing is mirrored, only the manifest's record of
    which way the art already points. Use when a frame renders backwards but
    the source PNG is drawn correctly.
    """
    frames = man["characters"].get(char)
    if not frames or key not in frames:
        return f"{char}/{key}: not in manifest"
    meta = frames[key]
    native_left = man.setdefault("nativeLeft", {}).setdefault(char, [])
    was = "left" if (meta.get("faceLeft") or key in native_left) else "right"
    if facing == "left":
        meta["faceLeft"] = True
        if key not in native_left:
            native_left.append(key)
            native_left.sort()
    else:
        meta.pop("faceLeft", None)
        man["nativeLeft"][char] = [k for k in native_left if k != key]
    return f"{char}/{key}: recorded facing {was} -> {facing} (pixels untouched)"


# -------------------------------------------------------------------- report

def recorded_facing(man, char, key):
    meta = man["characters"][char][key]
    if meta.get("faceLeft"):
        return "left"
    if key in man.get("nativeLeft", {}).get(char, []):
        return "left"
    return "right"


def audit(man, chars):
    rows = []
    for char in chars:
        for key in sorted(man["characters"][char]):
            meta = man["characters"][char][key]
            path = os.path.join(SPRITES, meta["file"])
            if not os.path.exists(path):
                continue
            img = np.array(Image.open(path).convert("RGBA"))
            detected, conf = detect_facing(img)
            rec = recorded_facing(man, char, key)
            rows.append((char, key, rec, detected, conf))

    disagree = [r for r in rows if r[3] != "?" and r[3] != r[2] and r[4] >= LOW_CONFIDENCE]
    weak = [r for r in rows if r[3] == "?" or r[4] < LOW_CONFIDENCE]

    print("=" * 76)
    print("FACING AUDIT — recorded vs detected")
    print("=" * 76)
    print(f"  frames checked      : {len(rows)}")
    print(f"  agree               : {len(rows) - len(disagree) - len(weak)}")
    print(f"  DISAGREE (review)   : {len(disagree)}")
    print(f"  low confidence      : {len(weak)}")
    print()
    if disagree:
        print("  Detected facing conflicts with the manifest — confirm on the board")
        print("  before flipping; the detector is ~83% accurate, not authoritative.")
        print(f"  {'frame':22s} {'recorded':>9s} {'detected':>9s} {'conf':>6s}")
        for char, key, rec, det, conf in sorted(disagree, key=lambda r: -r[4]):
            print(f"  {char + '/' + key:22s} {rec:>9s} {det:>9s} {conf:6.2f}")
    return rows


def board(man, chars, out_dir):
    """Render every frame as the ENGINE draws it for facing=right, annotated
    with the detector's opinion. Anything not looking rightward needs a flip."""
    os.makedirs(out_dir, exist_ok=True)
    written = []
    for char in chars:
        keys = sorted(man["characters"][char])
        cw, ch_ = 150, 172
        cols = 10
        rows_n = (len(keys) + cols - 1) // cols
        board_img = Image.new("RGB", (cols * cw, rows_n * ch_ + 30), (26, 28, 38))
        d = ImageDraw.Draw(board_img)
        d.text((6, 6), f"{char} — drawn as the engine would for facing=RIGHT. "
                       f"Every frame should look rightward.", fill=(255, 255, 255))
        for i, key in enumerate(keys):
            meta = man["characters"][char][key]
            path = os.path.join(SPRITES, meta["file"])
            if not os.path.exists(path):
                continue
            src = Image.open(path).convert("RGBA")
            det, conf = detect_facing(np.array(src))
            if recorded_facing(man, char, key) == "left":
                src = ImageOps.mirror(src)          # engine mirrors these
            src.thumbnail((cw - 10, ch_ - 30))
            x = (i % cols) * cw
            y = 30 + (i // cols) * ch_
            board_img.paste(src, (x + 5, y + 22), src)
            rec = recorded_facing(man, char, key)
            tag = f"{key} [{rec[0].upper()}]"
            colour = (150, 200, 255) if rec == "left" else (185, 195, 220)
            d.text((x + 4, y + 3), tag, fill=colour)
            mark = "ok" if det == "?" or det == "right" else f"?{conf:.2f}"
            d.text((x + 4, y + 13), mark, fill=(120, 230, 150) if mark == "ok" else (255, 170, 90))
        path = os.path.join(out_dir, f"facing_{char}.png")
        board_img.save(path)
        written.append(path)
    return written


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chars")
    ap.add_argument("--audit", action="store_true")
    ap.add_argument("--board", action="store_true")
    ap.add_argument("--flip", nargs="*", default=None, metavar="CHAR/FRAME")
    ap.add_argument("--check", metavar="PATH", help="detect facing of a loose image")
    ap.add_argument("--import", dest="import_path", metavar="PATH",
                    help="import a delivered pose image as a character frame")
    ap.add_argument("--char", help="target character for --import")
    ap.add_argument("--frame", help="target frame key for --import, e.g. r4c0")
    ap.add_argument("--face", choices=["auto", "left", "right"], default="auto",
                    help="source art facing; 'auto' uses the detector")
    ap.add_argument("--body-h", type=float, default=None,
                    help="override the target body height for --import")
    ap.add_argument("--set-facing", nargs=2, metavar=("CHAR/FRAME", "left|right"),
                    action="append", default=None,
                    help="correct a mislabelled flag without mirroring pixels")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--out", default=os.path.join(HERE, "debug"))
    args = ap.parse_args()

    if args.check:
        img = np.array(Image.open(args.check).convert("RGBA"))
        det, conf = detect_facing(img)
        print(f"{os.path.basename(args.check)}: detected {det} (confidence {conf:.2f})")
        if conf < LOW_CONFIDENCE:
            print("  low confidence — verify by eye before trusting this")
        print("  canonical facing for this project is RIGHT; mirror if it faces left")
        return

    man = load_manifest()
    chars = ([c.strip() for c in args.chars.split(",")] if args.chars
             else sorted(man["characters"]))

    if args.import_path:
        if not args.char or not args.frame:
            print("--import needs --char and --frame")
            return
        print(import_frame(man, args.import_path, args.char, args.frame,
                           args.face, args.body_h, args.dry_run))
        if not args.dry_run:
            save_manifest(man)
        return

    if args.set_facing:
        for spec, facing in args.set_facing:
            char, _, key = spec.partition("/")
            print("  " + set_facing(man, char, key, facing))
        if not args.dry_run:
            save_manifest(man)
            print("manifest updated")
        return

    if args.flip:
        for spec in args.flip:
            char, _, key = spec.partition("/")
            print("  " + flip_frame(man, char, key, args.dry_run))
        if not args.dry_run:
            save_manifest(man)
            print("manifest updated")
        else:
            print("(dry run — nothing written)")
        return

    if args.audit or not args.board:
        audit(man, chars)
    if args.board:
        for p in board(man, chars, args.out):
            print("  wrote", p)


if __name__ == "__main__":
    main()
