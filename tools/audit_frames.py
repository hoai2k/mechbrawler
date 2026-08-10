#!/usr/bin/env python3
"""Comprehensive per-frame sprite audit.

Checks the four failure classes that actually show up in this project:

  BLEED       content from a neighbouring sheet cell that got captured into
              this frame — usually a detached blob sitting below the body
              (the top of the sprite in the row underneath).
  ALPHA       semi-transparent body pixels, enclosed holes, keying halos.
  SIZE        the character drawn at a different zoom than their other frames,
              measured at FINAL RENDER SCALE so it reflects what players see.
  ANCHOR      body bottom far from the cell's foot line, which makes a fighter
              hover or sink between animations.

Reports only; it never edits art. Use --board to also write visual contact
sheets for the frames it flags.

Usage:
  python3 audit_frames.py [--chars gojo,maki] [--board] [--only bleed,size]
"""

import argparse
import json
import os
from collections import defaultdict

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SPRITES = os.path.join(HERE, "..", "assets", "sprites")
CHAR_JS = os.path.join(HERE, "..", "src", "characters.js")
CELL_W, CELL_H = 313.5, 313.6

manifest = json.load(open(os.path.join(SPRITES, "manifest.json")))


def char_scales():
    """Pull each character's base render scale out of characters.js."""
    import re
    src = open(CHAR_JS).read()
    out = {}
    for m in re.finditer(r'\n  (\w+): \{\n    name: "([^"]+)"', src):
        key = m.group(1)
        seg = src[m.end():m.end() + 900]
        sm = re.search(r"scale:\s*([\d.]+)", seg)
        if sm:
            out[key] = float(sm.group(1))
    return out


SCALES = char_scales()


def load(char, frame_key):
    meta = manifest["characters"][char][frame_key]
    img = np.array(Image.open(os.path.join(SPRITES, meta["file"])).convert("RGBA"))
    return img, meta


def components(alpha, thresh=40):
    labels, n = ndimage.label(alpha >= thresh, structure=np.ones((3, 3), np.int8))
    if n == 0:
        return labels, [], None
    counts = np.bincount(labels.ravel())
    counts[0] = 0
    order = np.argsort(counts)[::-1]
    return labels, [(int(i), int(counts[i])) for i in order if counts[i] > 0], int(order[0])


def audit_bleed(char, key, img, meta):
    """Detached blobs that sit below the main body are almost always the top of
    the sprite in the row beneath, captured by the grid crop."""
    a = img[:, :, 3]
    labels, comps, main = components(a)
    if main is None or len(comps) < 2:
        return None
    main_rows = np.nonzero(labels == main)[0]
    main_bottom = main_rows.max()
    main_cols = np.nonzero(labels == main)[1]

    flags = []
    for cid, size in comps[1:]:
        if size < 400:
            continue
        rows = np.nonzero(labels == cid)[0]
        cols = np.nonzero(labels == cid)[1]
        gap = rows.min() - main_bottom
        # sits below the body, with clear separation, and is wide enough to be
        # a body part rather than a spark
        if gap > 6 and size > 900:
            flags.append({
                "size": size,
                "gap": int(gap),
                "span": [int(cols.min()), int(cols.max())],
                "rows": [int(rows.min()), int(rows.max())],
            })
    if not flags:
        return None
    return flags


def audit_alpha(char, key, img, meta):
    a = img[:, :, 3]
    labels, comps, main = components(a, thresh=128)
    if main is None:
        return {"empty": True}
    body = labels == main
    nz = a[a > 8]
    opaque_share = float((a >= 250).sum() / max(1, (a > 8).sum()))

    filled = ndimage.binary_fill_holes(body)
    holes = filled & ~body & (a < 24)
    hl, hn = ndimage.label(holes, structure=np.ones((3, 3), np.int8))
    big_hole = 0
    if hn:
        hc = np.bincount(hl.ravel())
        hc[0] = 0
        big_hole = int(hc.max())

    issues = {}
    if opaque_share < 0.85:
        issues["semiTransparent"] = round(opaque_share, 3)
    # Holes larger than this are anatomical negative space (gaps between limbs,
    # Hanami's branch body). Only mid-size clusters indicate moth-eaten art —
    # anything under 60px is already inpainted by the extractor.
    if hn:
        hc2 = np.bincount(hl.ravel()); hc2[0] = 0
        mothy = int(((hc2 >= 60) & (hc2 <= 900)).sum())
        if mothy >= 6:
            issues["mothEatenHoles"] = mothy
    return issues or None


def audit_size(char, key, img, meta):
    """Body metrics at FINAL render scale (base scale x per-frame renderScale)."""
    a = img[:, :, 3]
    labels, comps, main = components(a, thresh=128)
    if main is None:
        return None
    body = labels == main
    rows = np.nonzero(body)[0]
    cols = np.nonzero(body)[1]
    h = rows.max() - rows.min() + 1
    w = cols.max() - cols.min() + 1

    # head proxy: width of the body across its top 12% — stable across poses
    top_band = body[rows.min(): rows.min() + max(1, int(h * 0.12))]
    head_w = 0
    if top_band.any():
        band_cols = np.nonzero(top_band.any(axis=0))[0]
        head_w = band_cols.max() - band_cols.min() + 1

    scale = SCALES.get(char, 0.6) * meta.get("renderScale", 1.0)
    return {
        "bodyH": round(h * scale, 1),
        "bodyW": round(w * scale, 1),
        "headW": round(head_w * scale, 1),
    }


def audit_anchor(char, key, img, meta):
    """bodyBottom is the foot line. Frames whose foot line sits far from the
    cell's normal ground line make the fighter hover or sink."""
    bb = meta.get("bodyBottom")
    if bb is None:
        return None
    # expressed as a fraction of cell height; standing art lands ~0.95-1.0
    return round(bb / CELL_H, 3)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chars", default=",".join(manifest["characters"].keys()))
    ap.add_argument("--only", default="bleed,alpha,size,anchor")
    ap.add_argument("--board", action="store_true")
    args = ap.parse_args()
    only = set(args.only.split(","))
    chars = [c.strip() for c in args.chars.split(",")]

    bleed_hits, alpha_hits, anchor_hits = [], [], []
    size_data = defaultdict(dict)

    for char in chars:
        for key in sorted(manifest["characters"][char]):
            img, meta = load(char, key)
            if "bleed" in only:
                b = audit_bleed(char, key, img, meta)
                if b:
                    bleed_hits.append((char, key, b))
            if "alpha" in only:
                al = audit_alpha(char, key, img, meta)
                if al:
                    alpha_hits.append((char, key, al))
            if "size" in only:
                s = audit_size(char, key, img, meta)
                if s:
                    size_data[char][key] = s
            if "anchor" in only:
                an = audit_anchor(char, key, img, meta)
                if an is not None and not (0.88 <= an <= 1.06):
                    anchor_hits.append((char, key, an))

    if "bleed" in only:
        print("=" * 72)
        print("BLEED — detached blobs below the body (likely the row beneath)")
        print("=" * 72)
        if not bleed_hits:
            print("  none")
        for char, key, flags in bleed_hits:
            for f in flags:
                print(f"  {char:9s} {key}  size={f['size']:6d}px gap={f['gap']:4d}px "
                      f"rows={f['rows']} cols={f['span']}")

    if "alpha" in only:
        print()
        print("=" * 72)
        print("ALPHA — semi-transparent bodies / large enclosed holes")
        print("=" * 72)
        if not alpha_hits:
            print("  none")
        for char, key, iss in alpha_hits:
            print(f"  {char:9s} {key}  {iss}")

    if "size" in only:
        print()
        print("=" * 72)
        print("SIZE — per-character spread at final render scale")
        print("=" * 72)
        for char, frames in size_data.items():
            hs = [v["headW"] for v in frames.values() if v["headW"] > 0]
            if not hs:
                continue
            med = float(np.median(hs))
            outliers = [(k, v["headW"]) for k, v in frames.items()
                        if v["headW"] > 0 and abs(v["headW"] - med) / med > 0.30]
            tag = "OK " if not outliers else "!! "
            print(f"  {tag}{char:9s} medianHeadW={med:5.1f}px  "
                  f"spread={min(hs):.0f}-{max(hs):.0f}")
            for k, hw in sorted(outliers, key=lambda o: -abs(o[1] - med)):
                print(f"        {k}  headW={hw:5.1f}  ({hw/med:.2f}x median)")

    if "anchor" in only:
        print()
        print("=" * 72)
        print("ANCHOR — foot line far from the normal ground line")
        print("=" * 72)
        if not anchor_hits:
            print("  none")
        for char, key, frac in anchor_hits:
            print(f"  {char:9s} {key}  bodyBottom={frac:.3f} of cell height")


if __name__ == "__main__":
    main()
