#!/usr/bin/env python3
"""Land the two SITE-IDENTITY plates: the favicon mark and the results backdrop.

Neither is a sprite, so neither belongs in tools/effects_intake.py — they are
not keyed, not trimmed to alpha, and not drawn by a spawn site. What they share
with it is the delivery route (`assets/intake/`) and the rule that landing art
is a script rather than a sequence of remembered image-editor steps.

  favicon_mech.png    one 1024px square mark -> the whole icon set the page
                      asks for (favicon.ico at 16/32/48, favicon-16x16,
                      favicon-32x32, apple-touch-icon at 180, and the two
                      android-chrome sizes named in site.webmanifest).

                      The mark is CROPPED TO ITS OWN CONTENT first, with a
                      small breathing margin. A 1024px painting with 15% empty
                      border loses that border's worth of glyph at 16px, which
                      is exactly the size the favicon has to survive; cropping
                      first is worth more than any resampling choice.

  victory_backdrop.jpg  copied to assets/backgrounds/victory.jpg (styles.css
                      draws it `center / cover`, so only the aspect matters —
                      it is checked, not enforced).

    python3 tools/site_identity.py            # dry run — what would land
    python3 tools/site_identity.py --apply
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

try:
    from PIL import Image, ImageChops
except ImportError:  # pragma: no cover - the message IS the handling
    sys.exit("This tool needs Pillow: python3 -m pip install pillow")

ROOT = Path(__file__).resolve().parent.parent
INTAKE = ROOT / "assets/intake"

ICON_SRC = INTAKE / "favicon_mech.png"
BACKDROP_SRC = INTAKE / "victory_backdrop.jpg"
BACKDROP_DST = ROOT / "assets/backgrounds/victory.jpg"

# Everything index.html and site.webmanifest name, at the size each names.
PNG_ICONS = [
    ("favicon-16x16.png", 16),
    ("favicon-32x32.png", 32),
    ("apple-touch-icon.png", 180),
    ("android-chrome-192x192.png", 192),
    ("android-chrome-512x512.png", 512),
]
ICO_SIZES = [16, 32, 48]

# Distance from the plate's own corner colour that counts as "drawing". The
# mark is painted on a near-black ground with a wide glow tail, so a strict
# threshold would call the glow content and crop nothing.
INK_FLOOR = 18
# Kept around the glyph, as a fraction of its longest side, so the mark is not
# jammed against the tile edge in a browser that draws no padding of its own.
CROP_MARGIN = 0.055


def content_square(img: Image.Image) -> tuple[int, int, int, int]:
    """A SQUARE crop around the mark's own ink, centred on it and clamped to
    the plate. Square because every output is square: cropping to the ink's
    own rectangle and resizing to a square would stretch the glyph."""
    ground = Image.new("RGB", img.size, img.getpixel((0, 0)))
    ink = ImageChops.difference(img, ground).convert("L")
    box = ink.point(lambda v: 255 if v > INK_FLOOR else 0).getbbox()
    if not box:
        return (0, 0, img.width, img.height)
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    side = max(x1 - x0, y1 - y0)
    side = min(img.width, img.height, round(side * (1 + 2 * CROP_MARGIN)))
    half = side / 2
    # Clamp the centre so the square stays on the plate rather than shrinking.
    cx = min(max(cx, half), img.width - half)
    cy = min(max(cy, half), img.height - half)
    return (round(cx - half), round(cy - half), round(cx + half), round(cy + half))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true",
                    help="write the results; without it nothing is touched")
    args = ap.parse_args()

    missing = [p for p in (ICON_SRC, BACKDROP_SRC) if not p.exists()]
    if missing:
        for p in missing:
            print(f"  -- {p.relative_to(ROOT)} not delivered, skipping")

    if ICON_SRC.exists():
        src = Image.open(ICON_SRC).convert("RGB")
        box = content_square(src)
        mark = src.crop(box)
        print(f"\nicons from {ICON_SRC.name} {src.width}x{src.height}"
              f" -> crop {box} ({mark.width}x{mark.height})")
        for name, px in PNG_ICONS:
            out = mark.resize((px, px), Image.LANCZOS)
            print(f"  {'~' if (ROOT / name).exists() else '+'} {name:<26} {px}x{px}")
            if args.apply:
                # RGBA on disk: the set they replace was RGBA, and a browser
                # that composites the icon over its own tab colour should get
                # an alpha channel even when every pixel in it is opaque.
                out.convert("RGBA").save(ROOT / name, optimize=True)
        print(f"  {'~' if (ROOT / 'favicon.ico').exists() else '+'} favicon.ico"
              f"{'':<17} {'/'.join(str(s) for s in ICO_SIZES)}")
        if args.apply:
            mark.resize((max(ICO_SIZES),) * 2, Image.LANCZOS).save(
                ROOT / "favicon.ico", sizes=[(s, s) for s in ICO_SIZES])

    if BACKDROP_SRC.exists():
        bg = Image.open(BACKDROP_SRC)
        ratio = bg.width / bg.height
        print(f"\nbackdrop {BACKDROP_SRC.name} {bg.width}x{bg.height} ({ratio:.2f}:1)"
              f" -> {BACKDROP_DST.relative_to(ROOT)}")
        if abs(ratio - 16 / 9) > 0.02:
            print("  !! not 16:9 — styles.css draws it `cover`, so it will be cropped")
        if args.apply:
            shutil.copy2(BACKDROP_SRC, BACKDROP_DST)

    print("\nlanded" if args.apply else "\nnothing written — re-run with --apply")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
