#!/usr/bin/env python3
"""Remove key-colour fringe left along a keyed sprite's silhouette.

Chroma keying decides, per pixel, how much of the background to remove. It gets
the interior right and the EDGE wrong: an antialiased outline pixel is part
subject and part background, and a keyer that only adjusts alpha leaves the
background's colour sitting in the leftover. On a magenta key that reads as a
pink halo tracing every edge — subtle on one sprite, and unmistakable once the
same sprite is drawn against a dark stage.

Two tests have to agree before a pixel is touched, because either alone gets it
wrong on this roster.

WHERE: the pixel must sit within two pixels of actual transparency. Not "near
the outside of the sprite" — Reggie's costume is hundreds of thin receipt
strips, so almost every pixel of him is near the silhouette's outer edge, and a
rim test would swallow the lot. Adjacency to a TRANSPARENT pixel is the honest
version: contamination is what the keyer left where it cut, so it hugs the alpha
boundary wherever that boundary runs, including between the strips. On Reggie's
ult_a, 5,545 of 5,647 magenta-dominant pixels touch transparency and 102 do not.

WHAT: the pixel must be more key-coloured than the art it belongs to. Not more
key-coloured than some fixed threshold — that was the first attempt and it fails
twice over. Set it high and you clean the dark core of the halo and leave its
soft tail behind, because contamination is a gradient and a hard cut takes only
the top of it. Set it low and you start eating art that merely lives in the
key's hue family, which on this roster means Uro's violet hair.

So the comparison is LOCAL: each candidate is measured against its nearest clean
pixel — the closest opaque pixel far enough from the boundary to be uncontaminated
— and cleaned only if it leans toward the key by more than that neighbour does.
Reggie's halo sits against white paper and scores far above it; Uro's hair edge
sits against more violet hair and scores about the same, so it is left alone.
The gradient comes out whole because a soft tail against clean paper still beats
the paper.

What happens to a fringe pixel depends on how much of it is subject:

  mostly background (alpha < 128)   dropped. There was never enough of the
                                    subject there to be worth keeping, and the
                                    silhouette does not visibly change.
  mostly subject (alpha >= 128)     recoloured from its nearest non-fringe
                                    opaque neighbour, keeping its alpha. This is
                                    the pixel the eye reads as the outline, so
                                    deleting it would chew a notch out of the
                                    edge; it needs the right colour, not removal.

The alpha bounding box therefore does not move, which is what makes this safe to
run AFTER a workbench pass: every renderScale / bodyBottom / ox / anchor the
manifest holds is measured from that box and stays valid.

WHERE IT DOES NOT APPLY: art that is genuinely soft. The whole premise is that
contamination sits at a hard cut, so "within two pixels of transparency" picks
out an edge. On a glow or a mist the alpha ramps over hundreds of pixels and
that test selects the entire effect — pointed at assets/sprites/effects it
offered to delete 11,541 pixels of `uzumaki`, which is not fringe but the
effect. So a sprite whose visible pixels are more than SOFT_LIMIT
semi-transparent is skipped and reported. Character sheets sit at 0.000 to
0.001; the effects run to 0.875.

Usage:
  python3 dekey_fringe.py assets/sprites/reggie            # a directory
  python3 dekey_fringe.py assets/sprites/effects/stage_flower.png
  python3 dekey_fringe.py assets/sprites/reggie --key grey # grey-keyed art
  python3 dekey_fringe.py <path> --dry-run                 # measure only
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image

try:
    from scipy import ndimage
except ImportError:
    sys.exit("scipy is required: pip install scipy")

# How much of the key is in a pixel, as a single number per key colour: how far
# the key's channels lead the ones it suppresses. Fringe is the key BLENDED with
# whatever it was cutting around — over Reggie's white receipts it lands near
# rgb(200, 90, 200), over his dark outlines near rgb(107, 11, 104) — so what
# carries across is the RELATION between channels, never an absolute value.
LEAN = {
    "magenta": lambda r, g, b: np.minimum(r, b) - g,
    "green": lambda r, g, b: g - np.maximum(r, b),
    # Grey leads nothing, so the only thing to measure is how close to neutral
    # mid-grey a pixel is; a pixel far from it scores negative and is safe.
    "grey": lambda r, g, b: 60 - (np.abs(r - 128) + np.abs(g - 128) + np.abs(b - 128)),
}

# How far contamination reaches from the alpha boundary. Keyers blur over about
# two pixels.
REACH = 2

# Above this share of semi-transparent pixels the art is soft rather than cut,
# and the edge test stops meaning anything. See the note in the docstring.
SOFT_LIMIT = 0.02

# Two bars, and a pixel clears both or it is left alone.
#
# EXCESS is the local one: how much more key-leaning than its nearest clean
# neighbour. Low enough to take the tail of the gradient, high enough that
# ordinary shading inside one colour does not qualify.
#
# FLOOR is the absolute one, and it is what stops the local test running away.
# A boundary between two ordinary colours is locally lopsided all by itself —
# Gakuganji's purple hakama against his white haori leans 30 more than the haori
# does, and without a floor the whole seam reads as contamination. Real spill
# from a saturated key lands far above that.
EXCESS = 18
FLOOR = 45


class Soft(Exception):
    """Raised for art too soft-edged for an edge test to mean anything."""


def defringe(path, key="magenta", dry_run=False, force=False):
    """Returns (dropped, recoloured) — the counts, whether or not it wrote."""
    img = np.array(Image.open(path).convert("RGBA"))
    rgb = img[:, :, :3].astype(int)
    a = img[:, :, 3]
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]

    opaque = a >= 128
    if not opaque.any():
        return 0, 0

    visible = a > 8
    soft = float(((a > 8) & (a < 248)).sum()) / max(1, int(visible.sum()))
    if soft > SOFT_LIMIT and not force:
        raise Soft(soft)

    # Everything within reach of a hole or an outside edge — the alpha boundary,
    # wherever it runs. Only these can be contaminated; everything deeper in is
    # the art, and is also what the suspects get compared against.
    suspect = ndimage.binary_dilation(a < 128, iterations=REACH) & (a > 8)
    clean = opaque & ~suspect
    if not clean.any():
        return 0, 0

    # For every pixel, the nearest clean one. One distance transform answers it
    # for the whole image, so each suspect is judged against the art it actually
    # borders rather than against a global average.
    _, (iy, ix) = ndimage.distance_transform_edt(~clean, return_indices=True)
    lean = LEAN[key](r, g, b)
    excess = lean - lean[iy, ix]

    contaminated = suspect & (excess > EXCESS) & (lean > FLOOR)
    if not contaminated.any():
        return 0, 0

    drop = contaminated & (a < 128)
    fix = contaminated & (a >= 128)

    if dry_run:
        return int(drop.sum()), int(fix.sum())

    out = img.copy()
    out[drop, 3] = 0
    out[fix, :3] = img[iy[fix], ix[fix], :3]
    Image.fromarray(out).save(path)
    return int(drop.sum()), int(fix.sum())


def targets(path):
    if os.path.isfile(path):
        return [path]
    return sorted(os.path.join(path, f) for f in os.listdir(path) if f.endswith(".png"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+", help="PNG files or directories of them")
    ap.add_argument("--key", default="magenta", choices=sorted(LEAN),
                    help="the colour the art was keyed on (default magenta)")
    ap.add_argument("--force", action="store_true",
                    help="run on soft-edged art too, where the edge test does not apply")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    total_drop = total_fix = touched = 0
    skipped = []
    for root in args.paths:
        for path in targets(root):
            try:
                drop, fix = defringe(path, args.key, args.dry_run, args.force)
            except Soft as e:
                skipped.append(f"{os.path.relpath(path)} ({e.args[0]:.0%} soft)")
                continue
            if drop or fix:
                touched += 1
                total_drop += drop
                total_fix += fix
                print(f"  {os.path.relpath(path):48} dropped {drop:6}  recoloured {fix:6}")
    verb = "would clean" if args.dry_run else "cleaned"
    print(f"{verb} {total_drop + total_fix} fringe pixel(s) across {touched} sprite(s)"
          + (" (dry run — nothing written)" if args.dry_run else ""))
    if skipped:
        print(f"skipped {len(skipped)} soft-edged sprite(s) — an edge test says nothing "
              f"about a glow; --force overrides:")
        for line in skipped[:8]:
            print("  " + line)


if __name__ == "__main__":
    main()
