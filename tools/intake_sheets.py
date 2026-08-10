#!/usr/bin/env python3
"""Before/after boards for processed intake art.

Each tile pairs what the game draws TODAY with what the delivery would replace
it with, labelled by the animation state it drives — because "is this a better
sprite" is unanswerable without knowing what action it has to read as. A
gorgeous roaring pose is the wrong answer for `guard`.

Reads `assets/intake/_processed/` (see `intake.py`); nothing here writes to
`assets/sprites/`.

Usage:
  python3 intake_sheets.py
  python3 intake_sheets.py --chars panda,sukuna
"""

import argparse
import json
import os

from PIL import Image, ImageDraw

import intake

HERE = os.path.dirname(os.path.abspath(__file__))
SPRITES = intake.SPRITES
PROCESSED = intake.PROCESSED

CW, CH, COLS = 460, 330, 3          # a tile holds a before AND an after
PANE = CW // 2 - 10


def load(path):
    return Image.open(path).convert("RGBA") if os.path.exists(path) else None


def pane(img, box, bg):
    """Fit `img` into a pane, on `bg` so alpha problems are visible."""
    out = Image.new("RGB", box, bg)
    if img is None:
        return out
    t = img.copy()
    t.thumbnail(box)
    out.paste(t, ((box[0] - t.width) // 2, (box[1] - t.height) // 2), t)
    return out


def sheet(char, items, man, anims, out_dir, bg):
    rows = (len(items) + COLS - 1) // COLS
    W, H = COLS * CW, rows * CH + 58
    img = Image.new("RGB", (W, H), (22, 24, 32))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 52], fill=(38, 44, 62))
    d.text((12, 8), f"{char.upper()} — intake review: CURRENT (left) vs DELIVERED (right)",
           fill=(255, 255, 255))
    d.text((12, 28), "Each tile names the animation state the frame drives. "
                     "Amber = facing unverified, check it points RIGHT.",
           fill=(165, 180, 210))

    for i, it in enumerate(items):
        key = it["key"]
        befores = intake.current_frames_for(anims, man, char, key)
        before = None
        for b in befores:
            meta = man["characters"].get(char, {}).get(b)
            if meta:
                before = load(os.path.join(SPRITES, meta["file"]))
                break
        after = load(os.path.join(PROCESSED, char, f"{key}.png"))

        cx, cy = (i % COLS) * CW, 58 + (i // COLS) * CH
        unsure = it.get("facingUnsure")
        d.rectangle([cx + 4, cy + 2, cx + CW - 4, cy + CH - 8],
                    fill=(30, 33, 44),
                    outline=(214, 164, 62) if unsure else (58, 64, 84),
                    width=2 if unsure else 1)

        top = cy + 52
        img.paste(pane(before, (PANE, CH - 68), (52, 54, 66)), (cx + 14, top))
        img.paste(pane(after, (PANE, CH - 68), (52, 54, 66)), (cx + CW // 2 + 4, top))

        # No state uses it: either a brand-new state being added (dodge_*) or
        # an existing sheet cell nothing points at. Say which — "new state" on
        # an unused cell reads as though the frame will do something.
        states = it.get("states")
        if not states:
            known = key in man["characters"].get(char, {})
            states = ["(unused frame — nothing plays it)"] if known else ["(NEW state)"]
        d.text((cx + 12, cy + 8), ", ".join(states), fill=(120, 215, 255))
        d.text((cx + 12, cy + 22), f"{char}/{key}", fill=(226, 232, 250))
        shown = befores[0] if befores else "nothing"
        d.text((cx + 12, cy + 36), f"now: {shown}", fill=(150, 165, 200))
        d.text((cx + CW // 2 + 6, cy + 36),
               f"new: {it['w']}x{it['h']}" + ("  MIRRORED" if it.get("mirrored") else ""),
               fill=(150, 240, 170))
        if unsure:
            d.text((cx + CW - 96, cy + 8), "facing?", fill=(240, 180, 80))

    os.makedirs(out_dir, exist_ok=True)
    p = os.path.join(out_dir, f"{char}.png")
    img.save(p)
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chars")
    ap.add_argument("--out", default=os.path.join(HERE, "debug", "intake"))
    ap.add_argument("--bg", default="dark", choices=["dark", "grey", "magenta"])
    args = ap.parse_args()

    bg = {"dark": (30, 33, 44), "grey": (110, 116, 132), "magenta": (255, 0, 255)}[args.bg]
    rows = json.load(open(os.path.join(PROCESSED, "report.json")))
    anims = intake.anim_map_all()
    man = json.load(open(os.path.join(SPRITES, "manifest.json")))

    by_char = {}
    for r in rows:
        by_char.setdefault(r["char"], []).append(r)
    chars = ([c.strip() for c in args.chars.split(",")] if args.chars else sorted(by_char))

    for c in chars:
        items = sorted(by_char.get(c, []), key=lambda r: r["key"])
        if items:
            print(sheet(c, items, man, anims, args.out, bg))


if __name__ == "__main__":
    main()
