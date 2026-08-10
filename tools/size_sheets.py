#!/usr/bin/env python3
"""Per-character sheets of every pose at its real in-game size.

The workbench shows one pose at a time, which is right for tuning but slow for
*finding* the poses that need tuning — 34 clicks per character, 17 characters.
This draws them all at once, sharing one ground line and one head-height bar,
so an oversized or floating pose is obvious at a glance.

Geometry is copied from `drawCharFrame` in `src/sprites.js` and must stay in
step with it, or the sheet stops predicting what the game shows:

    scale   = charScale * (renderScale or 1)
    anchorY = clamp(bodyBottom, CELL_H*0.45, CELL_H*1.2)
    dst     = ((ox - CELL_W/2) * scale, (oy - anchorY) * scale)

Poses more than `--tol` off the character's head-height target are boxed in
amber, with the miss printed in pixels. That is a hint, not a verdict — a
crouch is *meant* to be short — so the number is there to be judged, not
obeyed.

Usage:
  python3 size_sheets.py                    # every character
  python3 size_sheets.py --chars gojo,maki
  python3 size_sheets.py --summary          # worst-offender table only
"""

import argparse
import json
import os
import re

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SPRITES = os.path.join(HERE, "..", "assets", "sprites")
CHAR_JS = os.path.join(HERE, "..", "src", "characters.js")

CELL_W = CELL_H = 313.5
COLS, CW, CH = 6, 250, 300
GROUND = CH - 54          # ground line inside a tile
ZOOM = 0.62               # fits a ~230px fighter into the tile

# States where a short silhouette is the whole point, so a head-height miss
# there is expected rather than a defect.
SHORT_BY_DESIGN = re.compile(r"^(r4c|crouch|ledge|dizzy|hurt|land)")


def char_scales():
    src = open(CHAR_JS).read()
    out = {}
    for m in re.finditer(r"\n  (\w+): \{(.{0,2000}?)\n  \},", src, re.S):
        s = re.search(r"scale:\s*([\d.]+)", m.group(2))
        if s:
            out[m.group(1)] = float(s.group(1))
    return out


def draw_pose(tile, char, key, meta, char_scale, sprites_cache):
    scale = char_scale * ZOOM * (meta.get("renderScale") or 1)
    anchor = min(max(meta.get("bodyBottom", CELL_H * 0.66), CELL_H * 0.45), CELL_H * 1.2)
    path = os.path.join(SPRITES, meta["file"])
    if path not in sprites_cache:
        sprites_cache[path] = Image.open(path).convert("RGBA")
    img = sprites_cache[path]

    w, h = max(1, round(meta["w"] * scale)), max(1, round(meta["h"] * scale))
    if meta.get("faceLeft"):
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
    small = img.resize((w, h), Image.LANCZOS)

    dx = round((meta["ox"] - CELL_W / 2) * scale) + CW // 2
    dy = round((meta["oy"] - anchor) * scale) + GROUND
    tile.paste(small, (dx, dy), small)
    return dy                      # top of the drawn art


def sheet(man, char, scales, out_dir, tol):
    frames = man["characters"][char]
    head = man.get("headHeights", {}).get(char, 0) * ZOOM
    keys = sorted(frames)
    rows = (len(keys) + COLS - 1) // COLS
    W, H = COLS * CW, rows * CH + 56
    img = Image.new("RGB", (W, H), (24, 26, 34))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 50], fill=(38, 44, 62))
    d.text((12, 8), f"{char.upper()} — every pose at its real in-game size, shared ground line",
           fill=(255, 255, 255))
    d.text((12, 28), "Amber = head misses the target bar by more than "
                     f"{tol}px. Crouch/hurt/ledge poses are short on purpose.",
           fill=(165, 180, 210))

    cache, misses = {}, []
    for i, key in enumerate(keys):
        tile = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
        top = draw_pose(tile, char, key, frames[key], scales.get(char, 0.6), cache)
        miss = abs((GROUND - top) - head) if head else 0
        flag = head and miss > tol and not SHORT_BY_DESIGN.match(key)
        if flag:
            misses.append((key, round(miss)))

        cx, cy = (i % COLS) * CW, 56 + (i // COLS) * CH
        d.rectangle([cx + 3, cy + 2, cx + CW - 3, cy + CH - 6],
                    fill=(31, 34, 45),
                    outline=(210, 160, 60) if flag else (58, 64, 84),
                    width=2 if flag else 1)
        img.paste(tile, (cx, cy), tile)
        d.line([(cx + 8, cy + GROUND), (cx + CW - 8, cy + GROUND)], fill=(70, 140, 95))
        if head:
            hy = cy + GROUND - head
            d.line([(cx + 8, hy), (cx + CW - 8, hy)], fill=(200, 160, 70))
        d.text((cx + 9, cy + 8), key, fill=(222, 230, 250))
        if flag:
            d.text((cx + 9, cy + 22), f"head off by {round(miss)}px", fill=(240, 180, 80))

    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{char}.png")
    img.save(path)
    return path, misses


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chars")
    ap.add_argument("--out", default=os.path.join(HERE, "debug", "size"))
    ap.add_argument("--tol", type=float, default=14)
    ap.add_argument("--summary", action="store_true")
    args = ap.parse_args()

    man = json.load(open(os.path.join(SPRITES, "manifest.json")))
    scales = char_scales()
    chars = ([c.strip() for c in args.chars.split(",")] if args.chars
             else sorted(man["characters"]))

    table = []
    for c in chars:
        path, misses = sheet(man, c, scales, args.out, args.tol)
        table.append((c, len(misses), misses[:4]))
        if not args.summary:
            print(path)
    print()
    for c, n, worst in sorted(table, key=lambda t: -t[1]):
        print(f"  {c:9} {n:>3} pose(s) off target   {worst if worst else ''}")


if __name__ == "__main__":
    main()
