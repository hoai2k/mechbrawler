#!/usr/bin/env python3
"""Render every frame of a character at FINAL in-game scale on a shared ground
line, so size inconsistency is visible at a glance.

Automated head/torso measurement is unreliable here — pose changes (outstretched
arms, horizontal flight, crouches) swamp any bounding-box proxy. The eye is the
correct instrument; this tool just presents the frames honestly:

  * each frame is scaled by  character.scale * frame.renderScale  (what the
    game actually uses),
  * each frame is anchored by its `bodyBottom` to a common ground line (what the
    game actually does),
  * a reference line marks the head height of the character's idle frame.

A character is consistent when heads land near the reference line for standing
poses, and clearly below it for crouches/airborne tucks — and when no frame is
obviously drawn at a different zoom.

Usage: python3 size_board.py [--chars gojo,maki] [--out debug]
"""

import argparse
import json
import os
import re

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SPRITES = os.path.join(HERE, "..", "assets", "sprites")
CHAR_JS = os.path.join(HERE, "..", "src", "characters.js")

manifest = json.load(open(os.path.join(SPRITES, "manifest.json")))


def char_scales():
    src = open(CHAR_JS).read()
    out = {}
    for m in re.finditer(r'\n  (\w+): \{\n    name: "([^"]+)"', src):
        seg = src[m.end():m.end() + 900]
        sm = re.search(r"scale:\s*([\d.]+)", seg)
        if sm:
            out[m.group(1)] = float(sm.group(1))
    return out


SCALES = char_scales()
# On-screen preview zoom: the game draws a fighter roughly 190px tall, which is
# too small to judge on a contact sheet.
PREVIEW = 1.45


def build(char, out_dir):
    frames = manifest["characters"][char]
    base = SCALES.get(char, 0.6) * PREVIEW

    keys = sorted(frames)
    cell_w, cell_h = 170, 300
    ground_y = cell_h - 40
    cols = 10
    rows = (len(keys) + cols - 1) // cols
    board = Image.new("RGB", (cols * cell_w, rows * cell_h + 26), (26, 28, 38))
    d = ImageDraw.Draw(board)
    d.text((6, 6), f"{char} — all frames at final in-game scale, shared ground line",
           fill=(255, 255, 255))

    # reference head height from the idle frame
    idle = frames.get("r0c0")
    ref_head = None
    if idle:
        s = base * idle.get("renderScale", 1.0)
        ref_head = (idle["bodyBottom"] - idle["oy"]) * s

    for i, key in enumerate(keys):
        m = frames[key]
        s = base * m.get("renderScale", 1.0)
        img = Image.open(os.path.join(SPRITES, m["file"])).convert("RGBA")
        w = max(1, int(img.width * s))
        h = max(1, int(img.height * s))
        img = img.resize((w, h), Image.LANCZOS)

        cx = (i % cols) * cell_w
        cy = 26 + (i // cols) * cell_h
        # anchor bodyBottom on the ground line, centre horizontally on the cell
        foot_off = (m["bodyBottom"] - m["oy"]) * s
        px = cx + cell_w // 2 - w // 2
        py = cy + ground_y - int(foot_off)
        board.paste(img, (px, py), img)

        d.line([(cx, cy + ground_y), (cx + cell_w, cy + ground_y)], fill=(90, 200, 120), width=1)
        if ref_head:
            hy = cy + ground_y - int(ref_head)
            d.line([(cx, hy), (cx + cell_w, hy)], fill=(230, 190, 80), width=1)
        rs = m.get("renderScale")
        label = key + (f"  x{rs}" if rs else "")
        d.text((cx + 4, cy + 3), label, fill=(200, 210, 235))

    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"size_{char}.png")
    board.save(path)
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chars", default=",".join(manifest["characters"].keys()))
    ap.add_argument("--out", default=os.path.join(HERE, "debug"))
    args = ap.parse_args()
    for c in args.chars.split(","):
        print(build(c.strip(), args.out))


if __name__ == "__main__":
    main()
