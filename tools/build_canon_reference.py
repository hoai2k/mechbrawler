#!/usr/bin/env python3
"""Render each fighter's canonical reference image into assets/reference/canon/.

A fighter's `idle_a` is the authority for their **costume, proportions, age,
palette, line weight and shading** (10B in docs/asset-requests.md). Every asset
request says "match the existing set", and this is the set: one file per fighter,
plus a contact sheet for judging them against each other.

Copies rather than links, for the same reason the anime references in this
directory are copies — a request doc has to keep resolving after the sprite it
points at is replaced, and a reference that silently changes when the art changes
is not a reference.

**Mahoraga is excluded.** His whole set is being redrawn from scratch (11A)
because the round-9 delivery does not match the shikigami's canon design, so
his `idle_a` is precisely what must NOT be matched. His canonical reference is
`mahoraga_canon.png`, already in this directory. Gakuganji, Reggie Star and Uro
used to be excluded for the same reason; round 9E replaced their idles, and
those idles are canonical like everyone else's.

Two outputs:

  <char>_idle.png    the art as delivered, alpha intact, full resolution
  roster_idle.png    all of them side by side at MATCHED FIGURE SCALE, which is
                     the check that catches a fighter drawn a head too tall

The contact sheet normalises on each frame's measured body height rather than on
the image bounds, so a pose with a lot of empty plate around it does not come out
smaller than one cropped tight.

Usage:
  python3 tools/build_canon_reference.py
  python3 tools/build_canon_reference.py --dry-run
"""

import argparse
import json
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SPRITES = os.path.join(HERE, "..", "assets", "sprites")
MANIFEST = os.path.join(SPRITES, "manifest.json")
CANON = os.path.join(HERE, "..", "assets", "reference", "canon")
CHARACTERS_JS = os.path.join(HERE, "..", "src", "characters.js")

# Being redrawn from scratch in 11A: his existing art is the thing to ignore.
REDRAW = {"mahoraga"}

# Body height every figure is scaled to on the contact sheet. Matches the
# ~290 px the asset requests ask for on a 1024x1536 plate, so the sheet reads at
# the same scale the art is delivered at.
SHEET_BODY_H = 290
# The sheet is for judging figures against each other, not for tracing, so it is
# capped at a width that opens in a viewer rather than one that is 20 full plates
# wide. The per-fighter files beside it are the full-resolution copies.
SHEET_MAX_W = 2400
SHEET_COLS = 5
SHEET_PAD = 24
SHEET_LABEL_H = 22
SHEET_BG = (24, 27, 38, 255)
SHEET_FLOOR = (60, 66, 88, 255)


def fighter_names():
    """key -> display name, read from characters.js so the sheet cannot drift
    from what the game calls people."""
    import re
    src = open(CHARACTERS_JS).read()
    return dict(re.findall(r'\n  ([a-z]+): \{\n    name: "(.+?)",', src))


def idle_frames(man):
    out = []
    for char, frames in sorted(man["characters"].items()):
        if char in REDRAW:
            continue
        meta = frames.get("idle_a")
        if not meta:
            print(f"  WARN {char}: no idle_a, skipped")
            continue
        out.append((char, meta))
    return out


def contact_sheet(rows, names):
    """Every fighter at matched figure scale, on a common floor line."""
    cells = []
    for char, meta, im in rows:
        # bodyH is the measured height of the character within the plate, so
        # scaling by it lines everyone up regardless of how much empty plate
        # each drawing carries.
        body_h = meta.get("bodyH") or im.height
        scale = SHEET_BODY_H / body_h
        w = max(1, round(im.width * scale))
        h = max(1, round(im.height * scale))
        cells.append((char, im.resize((w, h), Image.LANCZOS)))

    cell_w = max(c[1].width for c in cells) + SHEET_PAD
    cell_h = max(c[1].height for c in cells) + SHEET_PAD + SHEET_LABEL_H
    cols = SHEET_COLS
    rows_n = (len(cells) + cols - 1) // cols
    sheet = Image.new("RGBA", (cell_w * cols, cell_h * rows_n), SHEET_BG)
    draw = ImageDraw.Draw(sheet)

    for i, (char, im) in enumerate(cells):
        cx = (i % cols) * cell_w
        cy = (i // cols) * cell_h
        # Feet on a common line, so height differences read as height
        # differences rather than as framing.
        floor = cy + cell_h - SHEET_LABEL_H - SHEET_PAD // 2
        draw.line([(cx + 8, floor), (cx + cell_w - 8, floor)], fill=SHEET_FLOOR, width=1)
        x = cx + (cell_w - im.width) // 2
        sheet.alpha_composite(im, (x, floor - im.height))
        label = names.get(char, char)
        draw.text((cx + 10, cy + cell_h - SHEET_LABEL_H + 4), f"{label}  ({char})",
                  fill=(170, 178, 200, 255))

    if sheet.width > SHEET_MAX_W:
        h = round(sheet.height * SHEET_MAX_W / sheet.width)
        sheet = sheet.resize((SHEET_MAX_W, h), Image.LANCZOS)
    return sheet


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    man = json.load(open(MANIFEST))
    names = fighter_names()
    frames = idle_frames(man)

    rows = []
    for char, meta in frames:
        src = os.path.join(SPRITES, meta["file"])
        if not os.path.exists(src):
            print(f"  WARN {char}: {meta['file']} missing, skipped")
            continue
        rows.append((char, meta, Image.open(src).convert("RGBA")))

    for char, meta, im in rows:
        dest = os.path.join(CANON, f"{char}_idle.png")
        print(f"  {char}_idle.png  {im.width}x{im.height}  from {meta['file']}")
        if not args.dry_run:
            im.save(dest)

    sheet = contact_sheet(rows, names)
    sheet_path = os.path.join(CANON, "roster_idle.png")
    print(f"  roster_idle.png  {sheet.width}x{sheet.height}  ({len(rows)} fighters)")
    if not args.dry_run:
        sheet.save(sheet_path)

    excluded = sorted(REDRAW)
    print(f"\n  {len(rows)} written, {len(excluded)} excluded (being redrawn in 11A): "
          + ", ".join(excluded))
    if args.dry_run:
        print("  dry run — nothing written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
