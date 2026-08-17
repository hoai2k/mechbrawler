#!/usr/bin/env python3
"""Build the small copies the MENUS draw, from the full-size paintings.

The arena select paints each board into a card 200x113 css px (fixed by the
layout — measured at 1280, 1920 and 2560-wide windows, it does not grow) and was
handed the match backdrop to do it with: 2048x1152 files, 4.4 MB across the
twelve arenas, for 200x113 of screen. That is 10x oversized in each direction,
and it is why the arena grid fills in one card at a time — the browser is
streaming the whole gallery at match resolution.

So the menus get their own copies here. `THUMB_WIDTH` is set from that card with
room for a 2x display on top, which is the point at which a smaller file would
start to be visible rather than merely smaller.

Character cards are deliberately NOT thumbnailed: the select spotlight already
draws `assets/cards/` art larger than the file, and the roster tile and the
spotlight share one fetch, so a tile-sized variant would add a download per mech
to save nothing.

Needs Pillow (`pip install Pillow`), like the other Python tools here.

  (no flags)   build whatever is missing or out of date
  --force      rebuild everything
  --check      build nothing; exit 1 if anything is missing or stale

Usage:
  python3 tools/make_thumbnails.py
  python3 tools/make_thumbnails.py --check
"""
import argparse
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
BACKGROUNDS = os.path.join(ROOT, "assets", "backgrounds")

# The subdirectory name is part of the URL src/stages.js builds — see
# `thumbFile()` there. Changing it here changes it in two places.
THUMB_DIR = "thumbs"

# 200 px is the arena card the layout produces at every window width; doubling
# covers a 2x display, and the round number leaves headroom for the card growing
# later without a regenerate.
THUMB_WIDTH = 480
QUALITY = 82

# Which trees hold menu-facing paintings. Every arena has exactly one painting
# serving both cameras (src/stages.js backgroundFile), so unlike upstream there
# is a single tree rather than one per camera.
TREES = ["arenas"]

# Full-bleed CSS backgrounds, not cards — `menu.jpg` and `victory.jpg` are drawn
# at the window's size (styles.css), so a 480 px copy would be an upscale.
SKIP = {"menu.jpg", "victory.jpg"}


def sources(tree):
    """The paintings in one tree, as (name, absolute path)."""
    d = os.path.join(BACKGROUNDS, tree) if tree else BACKGROUNDS
    if not os.path.isdir(d):
        return []
    out = []
    for name in sorted(os.listdir(d)):
        if name in SKIP or not name.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
            continue
        path = os.path.join(d, name)
        if os.path.isfile(path):
            out.append((name, path))
    return out


def thumb_path(tree, name):
    parts = [BACKGROUNDS, THUMB_DIR] + ([tree] if tree else []) + [os.path.splitext(name)[0] + ".jpg"]
    return os.path.join(*parts)


def stale(src, dst):
    """Out of date if it is missing, or older than the painting it came from.

    mtime rather than a content hash: the thumbnails are a build product of one
    file each, git does not preserve mtimes on clone, and `--check` is run
    against a tree where the source was just edited. A false "stale" costs a
    rebuild of one small file; a false "fresh" ships a thumbnail of the previous
    painting, which is the failure this exists to catch.
    """
    if not os.path.exists(dst):
        return True
    return os.path.getmtime(dst) < os.path.getmtime(src)


def build(src, dst):
    with Image.open(src) as im:
        im = im.convert("RGB")
        if im.width > THUMB_WIDTH:
            height = max(1, round(im.height * THUMB_WIDTH / im.width))
            im = im.resize((THUMB_WIDTH, height), Image.LANCZOS)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        im.save(dst, "JPEG", quality=QUALITY, optimize=True, progressive=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="rebuild everything")
    ap.add_argument("--check", action="store_true",
                    help="write nothing; exit 1 if any thumbnail is missing or stale")
    args = ap.parse_args()

    missing = []
    built = 0
    src_bytes = 0
    dst_bytes = 0
    for tree in TREES:
        for name, src in sources(tree):
            dst = thumb_path(tree, name)
            src_bytes += os.path.getsize(src)
            if args.force or stale(src, dst):
                if args.check:
                    missing.append(os.path.relpath(dst, ROOT))
                    continue
                build(src, dst)
                built += 1
            dst_bytes += os.path.getsize(dst) if os.path.exists(dst) else 0

    if args.check:
        if missing:
            print(f"{len(missing)} thumbnail(s) missing or stale:")
            for m in missing[:20]:
                print(f"  {m}")
            if len(missing) > 20:
                print(f"  ... and {len(missing) - 20} more")
            print("\nRun: python3 tools/make_thumbnails.py")
            return 1
        print("all menu thumbnails are current")
        return 0

    print(f"{built} thumbnail(s) built at {THUMB_WIDTH}px wide")
    if dst_bytes:
        print(f"menu now fetches {dst_bytes / 1e6:.1f} MB where the paintings are "
              f"{src_bytes / 1e6:.1f} MB ({src_bytes / dst_bytes:.0f}x)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
