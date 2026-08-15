#!/usr/bin/env python3
"""Turn the DI3 shade sheets into each rig's `shadeTint`.

A DI3 sheet pairs every major material region — skin, hair, uniform top,
uniform bottom, props — with its **lit fill** and its **painted shadow color**.
The toon pass multiplies: a shade texel shows `baseColor * shadeTint`. So the
tint a sheet is asking for is `shadow / lit`, per region, and every rig has
been running on one roster-wide default instead (TOON.shadeTint in
render3d/src/toon.js), tuned against nobody in particular.

**One tint per character, not per region, and that is a limitation of the RIGS
rather than of the sheets.** Every delivered .glb is a single Tripo-generated
material covering the whole body, so there is exactly one `shadeTint` to set;
per-region tints need per-region materials, which no rig has. The sheets carry
that detail anyway and are worth keeping for when they do — what this tool
takes is the average ratio across the regions it finds, which is the best
single answer to "how does this fighter's art shade".

Swatches are found rather than assumed: the sheets are laid out per fighter and
their sizes vary, so this looks for large rectangles of near-constant color and
pairs them left-to-right within a row. A sheet that does not yield an even
number of swatches is REPORTED AND SKIPPED, never guessed at.

    python3 tools/derive_toon_from_shade.py            # what it found
    python3 tools/derive_toon_from_shade.py --apply    # write the manifest
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
SHEETS = os.path.join(ROOT, "render3d/docs/reference")
MANIFEST = os.path.join(ROOT, "render3d/assets/manifest.json")

# A swatch is a big flat rectangle, and the sheets put them in TWO vertically
# aligned columns — lit on the left, painted shadow on the right. That pairing
# is the thing worth keying on: it survives the sheets being different sizes and
# different heights, and it is what separates a swatch from the flat areas of
# the reference figure printed beside them, which are the same colours and fooled
# a plain "find flat blocks" pass into reading 32 pairs out of a 5-region sheet.
MIN_AREA = 0.004     # a swatch is at least this fraction of the sheet's area
FLAT_WIN = 7         # neighbourhood a pixel must be flat across
FLAT_SPREAD = 5      # …to within this, 0..255
ALIGN = 0.02         # two columns are "aligned" within this fraction of width


def _label(mask):
    from scipy import ndimage
    return ndimage.label(mask)


def _flat_mask(grey, win, spread):
    """Pixels whose neighbourhood is near-constant.

    A max/min filter pair rather than a sliding-window view: the view
    materialises h*w*win*win values, which on a 1536x1024 sheet is 75 million
    per image and took minutes across the roster. These are separable filters
    and run in well under a second."""
    from scipy import ndimage
    hi = ndimage.maximum_filter(grey, size=win, mode="nearest")
    lo = ndimage.minimum_filter(grey, size=win, mode="nearest")
    return (hi - lo) <= spread


def swatches(img):
    """Flat rectangles that are not the page, as dicts with box and colour."""
    import numpy as np
    a = np.asarray(img).astype(int)
    h, w, _ = a.shape

    # The page is whatever colour covers the most of the sheet.
    q = (a // 4 * 4).reshape(-1, 3)
    vals, counts = np.unique(q, axis=0, return_counts=True)
    page = vals[counts.argmax()]
    not_page = (np.abs(a - page).max(axis=2) > 10)

    flat = _flat_mask(a.mean(axis=2), FLAT_WIN, FLAT_SPREAD)

    lab, n = _label(flat & not_page)
    from scipy import ndimage
    out = []
    min_area = MIN_AREA * h * w
    boxes = ndimage.find_objects(lab)
    for i, sl in enumerate(boxes, start=1):
        if sl is None:
            continue
        sub = lab[sl] == i
        if sub.sum() < min_area:
            continue
        ys, xs = np.where(sub)
        ys = ys + sl[0].start
        xs = xs + sl[1].start
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        box = (x1 - x0 + 1) * (y1 - y0 + 1)
        # Rectangles only. The figure's flat coat panels are large but ragged,
        # and this is what tells them apart from a swatch.
        if ys.size / box < 0.9:
            continue
        out.append({"x0": int(x0), "x1": int(x1), "y0": int(y0), "y1": int(y1),
                    "cx": float((x0 + x1) / 2), "cy": float((y0 + y1) / 2),
                    "rgb": tuple(a[ys, xs].mean(axis=0))})
    return out, (h, w)


def pair_columns(found, shape):
    """The two aligned columns of swatches, paired row by row."""
    h, w = shape
    cols = {}
    for s in found:
        key = next((k for k in cols if abs(k - s["cx"]) <= ALIGN * w), s["cx"])
        cols.setdefault(key, []).append(s)
    # Keep columns with at least two swatches — one lone rectangle somewhere on
    # the page is not a column.
    cols = {k: v for k, v in cols.items() if len(v) >= 2}
    if len(cols) < 2:
        return [], cols
    # The rightmost two aligned columns are the palette; anything further left
    # is the reference figure.
    keys = sorted(cols)[-2:]
    lit_col, shade_col = cols[keys[0]], cols[keys[1]]
    pairs = []
    for lit in sorted(lit_col, key=lambda s: s["cy"]):
        match = min(shade_col, key=lambda s: abs(s["cy"] - lit["cy"]), default=None)
        if match and abs(match["cy"] - lit["cy"]) <= (lit["y1"] - lit["y0"]):
            pairs.append((lit, match))
    return pairs, cols


def tint_for(path):
    """(tint, region_count, note) for one sheet."""
    from PIL import Image
    img = Image.open(path).convert("RGB")
    found, shape = swatches(img)
    pairs, _cols = pair_columns(found, shape)
    if len(pairs) < 3:
        return None, len(found), f"{len(found)} swatches, {len(pairs)} paired — too few to trust"
    # Weighted by how BRIGHT each region's lit fill is, for two reasons that
    # point the same way. A dark region's ratio is mostly noise — dividing 16 by
    # 33 moves a long way on one level of paint — and a dark region also looks
    # near enough identical under any tint, because the tint is a multiplier and
    # `black * anything` is black. So the regions that decide what the shading
    # READS as are the bright ones, and they are also the ones measured most
    # reliably. Skin and hair therefore lead, a black coat barely participates,
    # and nothing has to be thrown away with a threshold.
    ratios, weights = [], []
    for lit_s, shade_s in pairs:
        lit, shadow = lit_s["rgb"], shade_s["rgb"]
        if min(lit) < 8:
            continue                      # a true black: the ratio is meaningless
        ratios.append([min(1.0, s / l) for s, l in zip(shadow, lit)])
        weights.append(sum(lit) / 3.0)
    if not ratios:
        return None, len(pairs), "every region too dark to take a ratio from"
    total = sum(weights)
    tint = [round(sum(r[i] * wt for r, wt in zip(ratios, weights)) / total, 4)
            for i in range(3)]
    return tint, len(ratios), f"{len(pairs)} regions"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    man = json.load(open(MANIFEST, encoding="utf-8"))
    chars = man.get("characters", {})
    rows, skipped = [], []
    for key in sorted(chars):
        sheet = os.path.join(SHEETS, f"{key}_shade.png")
        if not os.path.exists(sheet):
            skipped.append((key, "no DI3 sheet"))
            continue
        tint, n, note = tint_for(sheet)
        if tint is None:
            skipped.append((key, note))
            continue
        rows.append((key, tint, note))

    print(f"{'char':12} {'shadeTint':28} from")
    for key, tint, note in rows:
        print(f"{key:12} [{tint[0]:.3f}, {tint[1]:.3f}, {tint[2]:.3f}]      {note}")
    if skipped:
        print("\nskipped:")
        for key, why in skipped:
            print(f"  {key:12} {why}")
    print(f"\nroster default is [0.52, 0.56, 0.74] (TOON.shadeTint)")

    if not args.apply:
        print("dry run — pass --apply to write render3d/assets/manifest.json")
        return 0

    for key, tint, _note in rows:
        entry = chars[key]
        entry.setdefault("toon", {})["shadeTint"] = tint
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(man, f, indent=1)
        f.write("\n")
    print(f"wrote {len(rows)} shadeTint block(s) to render3d/assets/manifest.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
