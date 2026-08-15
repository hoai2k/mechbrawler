#!/usr/bin/env python3
"""Composite a model-generation reference board for a fighter.

The render3d sourcing route "AI image-to-3D, seeded with the canon reference
plus a turnaround board" (render3d/docs/plan.md §5) needs a single image that
shows a generator (or briefs an artist on) everything the game knows about a
fighter's appearance: the canonical reference and the sprite poses that best
expose build, costume and props. Sprites only ever show the one 3/4 view, so
this board is a FIRST DRAFT / brief — the real deliverable is the drawn
four-view turnaround requested in render3d/docs/image-requests.md round DI1.

    python tools/build_model_reference.py <char> [<char>...]
    python tools/build_model_reference.py --all

Boards land at render3d/docs/reference/<char>_board.png. Pure read: nothing
in assets/ or sprites/ is touched.
"""

import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("needs Pillow:  pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
CANON = ROOT / "assets" / "reference" / "canon"
SPRITES = ROOT / "sprites" / "assets"
OUT = ROOT / "render3d" / "docs" / "reference"

# The poses that expose the most model-relevant information: neutral build,
# full costume, prop in hand, reach, and the back-ish views a tumble shows.
POSES = ["idle_a", "run_reach_a", "attack_heavy_a", "attack_up", "special_neutral",
         "guard", "crouch_a", "victory"]

CELL = 360          # px per cell edge
PAD = 16
LABEL_H = 22
BG = (250, 250, 252, 255)
INK = (30, 34, 46, 255)


def fit(img, box):
    img = img.convert("RGBA")
    img.thumbnail((box, box), Image.LANCZOS)
    return img


def build_board(char: str) -> bool:
    canon = CANON / f"{char}_idle.png"
    sprite_dir = SPRITES / char
    cells = []  # (label, image)

    if canon.exists():
        cells.append(("canon reference", Image.open(canon)))
    for pose in POSES:
        p = sprite_dir / f"{pose}.png"
        if p.exists():
            cells.append((pose, Image.open(p)))
    if not cells:
        print(f"skip   {char}: no canon reference and no sprites found")
        return False

    cols = min(3, len(cells))
    rows = (len(cells) + cols - 1) // cols
    w = PAD + cols * (CELL + PAD)
    h = PAD + rows * (CELL + LABEL_H + PAD) + 30
    board = Image.new("RGBA", (w, h), BG)
    draw = ImageDraw.Draw(board)
    draw.text((PAD, h - 26), f"{char} — model reference board (brief/seed; the DI1 "
              f"turnaround is the real input)", fill=INK)

    for i, (label, img) in enumerate(cells):
        cx = PAD + (i % cols) * (CELL + PAD)
        cy = PAD + (i // cols) * (CELL + LABEL_H + PAD)
        thumb = fit(img, CELL)
        board.paste(thumb, (cx + (CELL - thumb.width) // 2,
                            cy + (CELL - thumb.height) // 2), thumb)
        draw.rectangle([cx - 1, cy - 1, cx + CELL, cy + CELL], outline=(200, 203, 214, 255))
        draw.text((cx, cy + CELL + 4), label, fill=INK)

    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{char}_board.png"
    board.convert("RGB").save(out)
    print(f"wrote  {out.relative_to(ROOT)}  ({len(cells)} cells)")
    return True


def main():
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    if args == ["--all"]:
        chars = sorted(d.name for d in SPRITES.iterdir() if d.is_dir() and d.name != "archive")
    else:
        chars = args
    ok = sum(build_board(c) for c in chars)
    print(f"{ok}/{len(chars)} board(s) built")


if __name__ == "__main__":
    main()
