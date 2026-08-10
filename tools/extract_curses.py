#!/usr/bin/env python3
"""SUPERSEDED by tools/recut_curses.py. Kept as the record of the first pass.

This cut fixed rectangles out of the round-6 art, which clipped limbs, dragged
each spirit's purple energy trail along with it, and took Geto's hand into the
dragon's crop. The replacement cuts by content instead — see that file for why
removing the purple first is what makes the rest possible.

It will not run as-is: it reads `assets/intake/_processed/geto/`, which is
gitignored and long since cleared.

Cut Geto's summoned curses out of his delivered art into standalone sprites.

The round-6 `specialSide` and `specialNeutral` art drew whole extra creatures
INTO Geto's own sprite. That is wrong for a fighter frame — the curse cannot
move, be timed, or be reused independently, and it inflates his bounding box —
but the creatures themselves are good art. So they get lifted out and become
projectile sprites the engine can throw.

Four cursed spirits come from `specialSide`; the rainbow dragon from
`specialNeutral`. Geto's own frames stay on the previous art.

Regions are hand-picked rather than auto-detected: the spirits are chained
together by their purple energy trails, so connected components merge two or
three of them into one blob. Within a region the largest component wins, which
drops a neighbour's stray limb while keeping the trail attached to its owner.

Output: assets/sprites/effects/curse_<a..d>.png, curse_dragon.png

Usage: python3 extract_curses.py [--preview]
"""

import argparse
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

import intake

OUT = os.path.join(intake.SPRITES, "effects")

# (source frame, name, crop box) in delivered-art pixels
REGIONS = [
    ("specialSide", "curse_a", (1078, 60, 1300, 230)),
    ("specialSide", "curse_b", (820, 150, 1080, 400)),
    ("specialSide", "curse_c", (690, 400, 950, 610)),
    ("specialSide", "curse_d", (1070, 380, 1319, 615)),
    ("specialNeutral", "curse_dragon", (430, 40, 1413, 934)),
]


def cut(frame, box):
    x0, y0, x1, y1 = box
    sub = frame[y0:y1, x0:x1].copy()
    opaque = sub[:, :, 3] >= 110
    if not opaque.any():
        return None
    labels, n = ndimage.label(opaque, structure=np.ones((3, 3), np.int8))
    counts = np.bincount(labels.ravel())
    counts[0] = 0
    sub[labels != counts.argmax()] = 0        # drop a neighbour's stray limb
    ys, xs = np.nonzero(sub[:, :, 3] >= 20)
    return sub[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", action="store_true")
    args = ap.parse_args()

    cache, results = {}, []
    for src, name, box in REGIONS:
        if src not in cache:
            p = os.path.join(intake.PROCESSED, "geto", f"{src}.png")
            cache[src] = np.asarray(Image.open(p).convert("RGBA"))
        part = cut(cache[src], box)
        if part is None:
            print(f"  {name}: EMPTY")
            continue
        results.append((name, part))
        if not args.preview:
            os.makedirs(OUT, exist_ok=True)
            Image.fromarray(part).save(os.path.join(OUT, f"{name}.png"))
        print(f"  {name}: {part.shape[1]}x{part.shape[0]} from {src}")

    if args.preview:
        W, H = 300, 300
        board = Image.new("RGB", (W * len(results), H), (24, 26, 34))
        d = ImageDraw.Draw(board)
        for i, (name, part) in enumerate(results):
            im = Image.fromarray(part)
            im.thumbnail((W - 20, H - 46))
            bg = Image.new("RGB", im.size, (40, 42, 54))
            bg.paste(im, (0, 0), im)
            board.paste(bg, (i * W + 10, 40))
            d.text((i * W + 10, 12), f"{name} {part.shape[1]}x{part.shape[0]}", fill=(255, 255, 255))
        p = os.path.join(intake.HERE, "debug", "intake", "_curses_final.png")
        board.save(p)
        print(p)


if __name__ == "__main__":
    main()
