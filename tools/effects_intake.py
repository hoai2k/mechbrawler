#!/usr/bin/env python3
"""Land delivered effect and UI art in the tree the game loads from.

Mech Brawler has no character sprite sheets, so the elaborate sprite intake the
JJK base ran — keying, facing straightening, body measurement, manifest
registration, the approval queue — has nothing left to do. What survives of it
is the part that was always about EFFECT plates, and it is short:

  1. an effect arrives as an RGBA plate with a keyed (transparent) field,
  2. it is TRIMMED to its own alpha so the drawing's centre is the plate's
     centre, which is the point every spawn site paints around,
  3. it is downscaled if it is bigger than anything the game will ever draw it
     at, and
  4. it lands at `assets/sprites/effects/<name>.png` — or `assets/ui/<name>.png`
     for the three UI plates, which no spawn site draws.

Trimming is the load-bearing step. `sharedAdjust` in src/shared_sprites.js gives
every drawing a hand-tuned `dx`/`dy` nudge, and the workbench exists to set it —
but a nudge should be correcting where the ART sits, not paying off a hundred
pixels of empty plate that the generator happened to leave on one side. A
trimmed plate starts every drawing near zero.

The originals are archived rather than consumed: a plate can be re-trimmed at a
different threshold without regenerating it.

    python3 tools/effects_intake.py              # dry run — what would land
    python3 tools/effects_intake.py --apply
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover - the message IS the handling
    sys.exit("This tool needs Pillow: python3 -m pip install pillow")

ROOT = Path(__file__).resolve().parent.parent

# Where a delivery is uploaded, and where each kind of plate lands.
SOURCES = [
    ("effects", ROOT / "assets/intake/effects", ROOT / "assets/sprites/effects"),
    ("ui", ROOT / "assets/intake/ui", ROOT / "assets/ui"),
]

# The untouched plates, kept so a trim can be redone.
ARCHIVE = ROOT / "assets/reference/effects_r1"

# Alpha at or below this is "not drawn" for the purposes of finding the edge of
# the picture. Not zero: a soft glow feathers to 1-2/255 over a long tail, and
# trimming to a strictly-positive alpha keeps thirty pixels of invisible haze on
# every side of a bloom, which is exactly the empty margin this step removes.
ALPHA_FLOOR = 6

# Kept around the drawing after the trim, so a hard-edged plate does not end up
# with its outermost lit pixels on the plate boundary — they resample badly when
# the game scales the drawing down, which it always does.
MARGIN = 2

# Nothing is drawn near this big: effects paint at 40-260 game pixels, the
# largest set piece at about 400. A plate past this is detail nobody will see,
# stored and decoded on every load. The cap is generous on purpose — the long
# wide plates (a tsunami wall, a monorail) are drawn across a whole platform.
MAX_EDGE = 1024


def trim_box(img: Image.Image) -> tuple[int, int, int, int] | None:
    """The drawing's own bounds, at ALPHA_FLOOR, padded by MARGIN."""
    alpha = img.getchannel("A")
    box = alpha.point(lambda v: 255 if v > ALPHA_FLOOR else 0).getbbox()
    if not box:
        return None
    x0, y0, x1, y1 = box
    return (
        max(0, x0 - MARGIN), max(0, y0 - MARGIN),
        min(img.width, x1 + MARGIN), min(img.height, y1 + MARGIN),
    )


def process(src: Path, dst: Path, apply: bool) -> dict:
    img = Image.open(src)
    note = []
    if img.mode != "RGBA":
        # A plate with no alpha has not been keyed. The JJK pipeline keyed
        # magenta fields itself; this delivery arrives keyed, so an unkeyed
        # plate here is a mistake to report rather than a case to handle.
        return {"name": src.name, "error": f"not RGBA ({img.mode}) — plate is not keyed"}

    before = img.size
    box = trim_box(img)
    if box is None:
        return {"name": src.name, "error": "fully transparent"}
    img = img.crop(box)
    if img.size != before:
        note.append(f"trim {before[0]}x{before[1]}->{img.width}x{img.height}")

    edge = max(img.size)
    if edge > MAX_EDGE:
        k = MAX_EDGE / edge
        img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))),
                         Image.LANCZOS)
        note.append(f"downscale to {img.width}x{img.height}")

    if apply:
        dst.parent.mkdir(parents=True, exist_ok=True)
        img.save(dst, optimize=True)
    return {"name": src.name, "size": img.size, "note": ", ".join(note) or "already tight",
            "replaced": dst.exists()}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true",
                    help="write the results; without it nothing is touched")
    ap.add_argument("--keep-intake", action="store_true",
                    help="leave the delivered plates in assets/intake/ instead of archiving them")
    args = ap.parse_args()

    errors, landed = [], 0
    for label, src_dir, dst_dir in SOURCES:
        plates = sorted(src_dir.glob("*.png")) if src_dir.is_dir() else []
        print(f"\n{label}: {len(plates)} plate(s) -> {dst_dir.relative_to(ROOT)}")
        if not plates:
            continue
        for src in plates:
            r = process(src, dst_dir / src.name, args.apply)
            if r.get("error"):
                errors.append(f"{label}/{r['name']}: {r['error']}")
                print(f"  !! {r['name']}: {r['error']}")
                continue
            landed += 1
            mark = "~" if r["replaced"] else "+"
            print(f"  {mark} {r['name']:<26} {r['size'][0]}x{r['size'][1]}  {r['note']}")
            if args.apply and not args.keep_intake:
                (ARCHIVE / label).mkdir(parents=True, exist_ok=True)
                shutil.move(str(src), str(ARCHIVE / label / src.name))

    print(f"\n{landed} plate(s) {'landed' if args.apply else 'would land'}"
          f"{'' if args.apply else ' — re-run with --apply'}")
    if errors:
        print(f"{len(errors)} plate(s) could not be processed:")
        for e in errors:
            print(f"  {e}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
