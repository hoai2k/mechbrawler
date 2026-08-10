#!/usr/bin/env python3
"""Contact sheets of everything still waiting on a human decision.

Four defect classes have resisted every attempt to judge them automatically —
white leak vs white art, a clipped pose vs a deliberate one, bleed vs a
scattered effect, a hole vs a limb gap. Measurements overlap in all four, so
each sheet is a question, not a finding.

Anything already ruled on in `docs/sprite-review-log.json` is left out, so a
frame is only ever asked about once. Record decisions there — including "it was
fine" — or the same tiles come back next round.

  facing   frames the manifest mirrors, drawn as the engine draws them
  white    flat-white blobs walled in by the silhouette: leak, or white art?
  crop     sheet cells whose art reaches the left/top/right cell boundary
  bleed    detached blobs big enough to be a neighbour rather than an effect

Usage:
  python3 review_sheets.py                     # every open topic
  python3 review_sheets.py --topics white,crop
  python3 review_sheets.py --counts            # how much is outstanding
"""

import argparse
import json
import os
import re

import numpy as np
from PIL import Image, ImageDraw, ImageOps
from scipy import ndimage

import clean_frames as cf
import facing_review as fr

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, "..", "docs", "sprite-review-log.json")
CELL_W = CELL_H = 313.5
COLS, CW, CH = 6, 216, 250
SHEET_CELL = re.compile(r"^r\d+c\d+$")


def load_log():
    if not os.path.exists(LOG):
        return {}
    with open(LOG) as f:
        return {k: set(v) for k, v in json.load(f).items() if not k.startswith("_")}


def frames(man):
    for c in sorted(man["characters"]):
        for k, meta in man["characters"][c].items():
            yield c, k, meta


def img_of(meta):
    return np.array(Image.open(os.path.join(cf.SPRITES, meta["file"])).convert("RGBA"))


# ------------------------------------------------------------- candidates

def facing_items(man, done):
    out = []
    for c in sorted(man["characters"]):
        for state, k, mirrored in fr.frame_items(man, c):
            if mirrored and f"{c}/{k}" not in done:
                out.append((c, k, state, "mirrored", True))
    seen, uniq = set(), []
    for it in out:                       # a frame can serve several states
        if (it[0], it[1]) not in seen:
            seen.add((it[0], it[1]))
            uniq.append(it)
    return uniq


def white_items(man, done):
    """Flat-white blobs fully walled in by the silhouette. That enclosure is
    the leak signature — but Panda's belly and Maki's blade are enclosed too,
    which is exactly why this is a question rather than a rule."""
    out = []
    for c, k, meta in frames(man):
        if f"{c}/{k}" in done:
            continue
        f = img_of(meta)
        opaque = f[:, :, 3] >= 128
        total = 0
        for blob, px, _ in cf.white_blobs(f, 120):
            inner = ndimage.binary_dilation(blob, iterations=4)
            ring = ndimage.binary_dilation(blob, iterations=9) & ~inner
            if ring.any() and opaque[ring].mean() >= 0.97:
                total += px
        if total >= 150:
            out.append((c, k, f"{total}px enclosed white", "white", False))
    return sorted(out, key=lambda t: -int(t[2].split("px")[0]))


def crop_items(man, done):
    """Sheet cells whose art reaches the left, top or right cell boundary.
    The bottom is excluded — feet touch it by design."""
    out = []
    for c, k, meta in frames(man):
        if f"{c}/{k}" in done or not SHEET_CELL.match(k):
            continue
        ox, oy, w = meta["ox"], meta["oy"], meta["w"]
        sides = [s for s, hit in (("left", ox <= 0), ("top", oy <= 0),
                                  ("right", ox + w >= CELL_W - 2)) if hit]
        if sides:
            out.append((c, k, "clipped " + "+".join(sides), "crop", False))
    return out


def bleed_items(man, done):
    out = []
    for c, k, meta in frames(man):
        if f"{c}/{k}" in done:
            continue
        f = img_of(meta)
        labels, n = ndimage.label(f[:, :, 3] >= 128, structure=np.ones((3, 3), np.int8))
        if n < 2:
            continue
        counts = np.bincount(labels.ravel())
        counts[0] = 0
        second = int(sorted(counts)[-2])
        if second >= 250:
            out.append((c, k, f"detached blob {second}px", "bleed", False))
    return sorted(out, key=lambda t: -int(t[2].split()[-1][:-2]))


TOPICS = {
    "facing": (facing_items,
               "All should look RIGHTWARD. Report any that look LEFT."),
    "white":  (white_items,
               "Red = flat white walled in by the sprite. Say which are background leak vs real white art."),
    "crop":   (crop_items,
               "Art reaches a cell edge. Say which are actually cut off vs merely close to it."),
    "bleed":  (bleed_items,
               "Red = a blob detached from the body. Say which belong to the pose vs the neighbouring cell."),
}


# ------------------------------------------------------------------ draw

def tile_image(man, c, k, topic):
    """The frame as the reviewer needs to see it for this question."""
    meta = man["characters"][c][k]
    f = img_of(meta)
    if topic == "facing":
        native = set(man.get("nativeLeft", {}).get(c, []))
        if meta.get("faceLeft") or k in native:
            return ImageOps.mirror(Image.fromarray(f))
        return Image.fromarray(f)
    if topic == "white":
        opaque = f[:, :, 3] >= 128
        for blob, _, _ in cf.white_blobs(f, 120):
            inner = ndimage.binary_dilation(blob, iterations=4)
            ring = ndimage.binary_dilation(blob, iterations=9) & ~inner
            if ring.any() and opaque[ring].mean() >= 0.97:
                f[blob] = [255, 40, 40, 255]
    elif topic == "bleed":
        labels, n = ndimage.label(f[:, :, 3] >= 128, structure=np.ones((3, 3), np.int8))
        counts = np.bincount(labels.ravel())
        counts[0] = 0
        main = counts.argmax()
        f[(labels != main) & (labels != 0)] = [255, 40, 40, 255]
    return Image.fromarray(f)


def render(man, items, topic, subtitle, out_dir, page=48):
    os.makedirs(out_dir, exist_ok=True)
    paths = []
    total = (len(items) + page - 1) // page
    for pi in range(total):
        chunk = items[pi * page:(pi + 1) * page]
        rows = (len(chunk) + COLS - 1) // COLS
        W, H = COLS * CW, rows * CH + 52
        img = Image.new("RGB", (W, H), (24, 26, 34))
        d = ImageDraw.Draw(img)
        d.rectangle([0, 0, W, 46], fill=(38, 44, 62))
        d.text((12, 8), f"{topic.upper()} — {len(items)} open"
                        + (f"  (page {pi + 1}/{total})" if total > 1 else ""),
               fill=(255, 255, 255))
        d.text((12, 26), subtitle, fill=(165, 180, 210))

        for i, (c, k, note, _, _) in enumerate(chunk):
            t = tile_image(man, c, k, topic)
            t.thumbnail((CW - 18, CH - 62))
            cx, cy = (i % COLS) * CW, 52 + (i // COLS) * CH
            d.rectangle([cx + 3, cy + 2, cx + CW - 3, cy + CH - 6],
                        fill=(31, 34, 45), outline=(58, 64, 84))
            base = cy + CH - 18
            d.line([(cx + 10, base), (cx + CW - 10, base)], fill=(70, 120, 90))
            img.paste(t, (cx + (CW - t.width) // 2, base - t.height), t)
            d.text((cx + 9, cy + 8), note, fill=(120, 215, 255))
            d.text((cx + 9, cy + 21), f"{c}/{k}", fill=(222, 230, 250))

        p = os.path.join(out_dir, f"{topic}_{pi + 1:02d}.png")
        img.save(p)
        paths.append(p)
    return paths


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--topics", default=",".join(TOPICS))
    ap.add_argument("--out", default=os.path.join(HERE, "debug", "review_open"))
    ap.add_argument("--counts", action="store_true")
    ap.add_argument("--page", type=int, default=48)
    args = ap.parse_args()

    man = json.load(open(cf.MANIFEST))
    log = load_log()

    for topic in [t.strip() for t in args.topics.split(",")]:
        collect, subtitle = TOPICS[topic]
        items = collect(man, log.get(topic, set()))
        if args.counts:
            print(f"{topic:8} {len(items):>4} open")
            continue
        if not items:
            print(f"{topic:8} nothing open")
            continue
        for p in render(man, items, topic, subtitle, args.out, args.page):
            print(p)


if __name__ == "__main__":
    main()
