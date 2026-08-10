#!/usr/bin/env python3
"""Generate human-review contact sheets for sprite facing.

Every frame is drawn exactly as the ENGINE draws it when a fighter faces RIGHT.
So on a correct sheet, every single character looks rightward. Anything looking
left is mis-flagged and needs `sprite_facing.py --flip <char>/<frame>`.

Labels are the exact flip arguments, so a reviewer can just read off the wrong
ones.

Usage: python3 facing_review.py [--chars gojo,maki] [--out debug/review]
"""

import argparse
import json
import os

from PIL import Image, ImageDraw, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
SPRITES = os.path.join(HERE, "..", "assets", "sprites")

CELL_W, CELL_H = 208, 232
COLS = 5


def recorded_left(man, char, key):
    meta = man["characters"][char][key]
    return bool(meta.get("faceLeft")) or key in man.get("nativeLeft", {}).get(char, [])


def sheet(man, char, out_dir):
    frames = man["characters"][char]
    keys = sorted(frames)
    rows = (len(keys) + COLS - 1) // COLS
    W, H = COLS * CELL_W, rows * CELL_H + 46
    img = Image.new("RGB", (W, H), (24, 26, 34))
    d = ImageDraw.Draw(img)

    d.rectangle([0, 0, W, 40], fill=(38, 44, 62))
    d.text((12, 8), f"{char.upper()}  —  every frame should be FACING RIGHT  ---->",
           fill=(255, 255, 255))
    d.text((12, 24), "label = flip argument. Tell me any that look LEFT.",
           fill=(160, 175, 205))

    for i, key in enumerate(keys):
        meta = frames[key]
        path = os.path.join(SPRITES, meta["file"])
        if not os.path.exists(path):
            continue
        src = Image.open(path).convert("RGBA")
        if recorded_left(man, char, key):
            src = ImageOps.mirror(src)     # engine mirrors these
        src.thumbnail((CELL_W - 16, CELL_H - 44))

        cx = (i % COLS) * CELL_W
        cy = 46 + (i // COLS) * CELL_H
        d.rectangle([cx + 3, cy + 2, cx + CELL_W - 3, cy + CELL_H - 6],
                    fill=(31, 34, 45), outline=(58, 64, 84))
        # baseline so poses read consistently
        base_y = cy + CELL_H - 20
        d.line([(cx + 10, base_y), (cx + CELL_W - 10, base_y)], fill=(70, 120, 90))
        img.paste(src, (cx + (CELL_W - src.width) // 2, base_y - src.height), src)
        d.text((cx + 10, cy + 8), f"{char}/{key}", fill=(220, 228, 250))
        if recorded_left(man, char, key):
            d.text((cx + CELL_W - 34, cy + 8), "flip", fill=(255, 185, 95))

    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{char}.png")
    img.save(path)
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chars")
    ap.add_argument("--out", default=os.path.join(HERE, "debug", "review"))
    args = ap.parse_args()
    with open(os.path.join(SPRITES, "manifest.json")) as f:
        man = json.load(f)
    chars = ([c.strip() for c in args.chars.split(",")] if args.chars
             else sorted(man["characters"]))
    for c in chars:
        print(sheet(man, c, args.out))


if __name__ == "__main__":
    main()
