#!/usr/bin/env python3
"""Sizing review sheets — every pose at TRUE in-game size on a shared ground line.

Each frame is scaled by exactly what the engine uses
(`character.scale * frame.renderScale`) and its `bodyBottom` is pinned to a
common ground line, which is what the game does. So a character who looks
too large or too small in one pose here will look that way in play.

Two reference lines are drawn:
  green  — the ground line (feet)
  amber  — the head height of that character's `idle_a`

Standing poses should reach close to the amber line. Crouches sit well below
it; a pose reaching overhead (attack_up) may legitimately exceed it. What
matters is that the *character* looks the same size, not the bounding box.

Usage: python3 size_review.py [--chars gojo,maki] [--out debug/sizing]
"""

import argparse
import json
import os
import re

from PIL import Image, ImageDraw, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
SPRITES = os.path.join(HERE, "..", "assets", "sprites")
CHAR_JS = os.path.join(HERE, "..", "src", "characters.js")

POSES = ["idle_a", "idle_b", "run_a", "run_b", "jump_rise", "fall", "hurt",
         "guard", "attack_up", "attack_air", "charge", "dizzy", "victory", "ledge_hang"]

PREVIEW = 1.5      # zoom so the sheet is legible; applied uniformly
CW, CH, COLS = 190, 330, 7


def char_scales():
    src = open(CHAR_JS).read()
    out = {}
    for m in re.finditer(r'\n  (\w+): \{\n    name: "', src):
        seg = src[m.end():m.end() + 900]
        sm = re.search(r"scale:\s*([\d.]+)", seg)
        if sm:
            out[m.group(1)] = float(sm.group(1))
    return out


SCALES = char_scales()


def sheet(man, char, out_dir):
    frames = man["characters"][char]
    native_left = set(man.get("nativeLeft", {}).get(char, []))
    base = SCALES.get(char, 0.6) * PREVIEW
    keys = [p for p in POSES if p in frames]

    rows = (len(keys) + COLS - 1) // COLS
    W, H = COLS * CW, rows * CH + 52
    img = Image.new("RGB", (W, H), (24, 26, 34))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 46], fill=(38, 44, 62))
    d.text((12, 8), f"{char.upper()} — every pose at TRUE in-game size, shared ground line",
           fill=(255, 255, 255))
    d.text((12, 26), "amber = idle head height. Tell me any pose that looks too BIG or too SMALL.",
           fill=(165, 180, 210))

    ref = frames.get("idle_a")
    ref_head = None
    if ref:
        s = base * ref.get("renderScale", 1.0)
        ref_head = (ref["bodyBottom"] - ref["oy"]) * s

    for i, key in enumerate(keys):
        m = frames[key]
        s = base * m.get("renderScale", 1.0)
        src = Image.open(os.path.join(SPRITES, m["file"])).convert("RGBA")
        if m.get("faceLeft") or key in native_left:
            src = ImageOps.mirror(src)
        w = max(1, int(src.width * s))
        h = max(1, int(src.height * s))
        src = src.resize((w, h), Image.LANCZOS)

        cx = (i % COLS) * CW
        cy = 52 + (i // COLS) * CH
        d.rectangle([cx + 3, cy + 2, cx + CW - 3, cy + CH - 6], fill=(31, 34, 45),
                    outline=(58, 64, 84))
        ground = cy + CH - 26
        foot_off = (m["bodyBottom"] - m["oy"]) * s
        img.paste(src, (cx + CW // 2 - w // 2, ground - int(foot_off)), src)

        d.line([(cx + 8, ground), (cx + CW - 8, ground)], fill=(70, 140, 95))
        if ref_head:
            hy = ground - int(ref_head)
            d.line([(cx + 8, hy), (cx + CW - 8, hy)], fill=(190, 150, 60))
        d.text((cx + 9, cy + 8), key, fill=(220, 228, 250))

    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{char}.png")
    img.save(path)
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chars")
    ap.add_argument("--out", default=os.path.join(HERE, "debug", "sizing"))
    args = ap.parse_args()
    with open(os.path.join(SPRITES, "manifest.json")) as f:
        man = json.load(f)
    chars = ([c.strip() for c in args.chars.split(",")] if args.chars
             else sorted(man["characters"]))
    for c in chars:
        print(sheet(man, c, args.out))


if __name__ == "__main__":
    main()
