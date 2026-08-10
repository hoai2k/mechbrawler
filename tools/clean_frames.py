#!/usr/bin/env python3
"""Apply pixel cleanups to already-extracted frames, in place.

`extract_sprites.py` rebuilds `manifest.json` from scratch, so re-running it to
pick up a new cleanup rule would discard everything curated since: facing
corrections, workbench `renderScale`/`ox`/`bodyBottom` edits and `headHeights`.
This tool carries the same rules to the PNGs that already exist and repairs the
placement metadata the crop invalidates, leaving the rest of the manifest alone.

The rules mirror `extract_sprites.py` exactly — keep them in step, so a future
clean re-extraction produces the same pixels this produced.

  --white     drop flat near-white pockets walled in by dark pixels
  --bleed     drop blobs separated from the body by a wide horizontal gutter
  --report    list what WOULD change across the roster, touching nothing

Usage:
  python3 clean_frames.py --report
  python3 clean_frames.py --white --bleed maki/r2c2 nobara/r4c1
  python3 clean_frames.py --white --bleed --chars maki,megumi,nobara
"""

import argparse
import json
import os
import re

import numpy as np
from PIL import Image
from scipy import ndimage

from extract_sprites import (
    DETACHED_SIDE_GAP, DETACHED_SIDE_MIN_PX,
    TRAPPED_WHITE_MIN_PX, TRAPPED_WHITE_RING_DARK, TRAPPED_WHITE_RING_OPAQUE,
    TRAPPED_WHITE_RING_INNER, TRAPPED_WHITE_RING_OUTER,
)

HERE = os.path.dirname(os.path.abspath(__file__))
SPRITES = os.path.join(HERE, "..", "assets", "sprites")
MANIFEST = os.path.join(SPRITES, "manifest.json")


def white_blobs(frame, min_px=TRAPPED_WHITE_MIN_PX):
    """Every flat near-white blob, largest first, as (mask, px, box).

    These are CANDIDATES only. Background leak and legitimate white art are not
    separable by measurement — size, flatness, spatial variance and ring
    darkness all overlap, and Panda's belly is flatter than the leak between
    Megumi's legs — so the choice is made by eye via `--pick` / `--clear`.
    """
    rgb = frame[:, :, :3].astype(np.int16)
    opaque = frame[:, :, 3] >= 128
    span = rgb.max(axis=2) - rgb.min(axis=2)
    white = opaque & (rgb.min(axis=2) > 225) & (span < 16)
    labels, n = ndimage.label(white, structure=np.ones((3, 3), np.int8))
    if not n:
        return []
    counts = np.bincount(labels.ravel())
    counts[0] = 0
    out = []
    for i in np.nonzero(counts >= min_px)[0]:
        blob = labels == i
        ys, xs = np.nonzero(blob)
        out.append((blob, int(counts[i]),
                    (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))))
    out.sort(key=lambda t: -t[1])
    return out


def trapped_white_mask(frame, force=False, min_px=TRAPPED_WHITE_MIN_PX):
    """Pixels `extract_sprites.strip_trapped_white` would clear — the automatic
    heuristic, kept in step with the pipeline for `--report` only. It is NOT
    trustworthy on its own (see `white_blobs`); prefer `--pick`."""
    rgb = frame[:, :, :3].astype(np.int16)
    opaque = frame[:, :, 3] >= 128
    span = rgb.max(axis=2) - rgb.min(axis=2)
    white = opaque & (rgb.min(axis=2) > 225) & (span < 16)
    labels, n = ndimage.label(white, structure=np.ones((3, 3), np.int8))
    out = np.zeros(white.shape, bool)
    if not n:
        return out
    luma = rgb.mean(axis=2)
    counts = np.bincount(labels.ravel())
    counts[0] = 0
    for i in np.nonzero(counts >= min_px)[0]:
        blob = labels == i
        inner = ndimage.binary_dilation(blob, iterations=TRAPPED_WHITE_RING_INNER)
        ring = ndimage.binary_dilation(blob, iterations=TRAPPED_WHITE_RING_OUTER) & ~inner
        if not ring.any():
            continue
        if opaque[ring].mean() < TRAPPED_WHITE_RING_OPAQUE:
            continue
        if force or (luma[ring] < 105).mean() >= TRAPPED_WHITE_RING_DARK:
            out |= blob
    return out


SHEET_CELL = re.compile(r"^r\d+c\d+$")


def side_bleed_mask(frame, gap=DETACHED_SIDE_GAP):
    """Pixels belonging to blobs sitting in their own vertical band, clear of
    the body — the neighbouring cell's pose leaking across the gutter.

    Guarded against the two ways this misfires. A blob whose colour matches
    another detached blob that is staying is part of a multi-blob EFFECT, not
    bleed: Inumaki's orb ring scatters lavender blobs across the whole cell and
    the outermost one clears the gutter by chance. And bleed always arrives
    from a neighbour, so it is only possible at all on the 5x4 sheet grid —
    see `bleed_candidates` for the generated-pose exclusion.
    """
    opaque = frame[:, :, 3] >= 128
    labels, n = ndimage.label(opaque, structure=np.ones((3, 3), np.int8))
    out = np.zeros(opaque.shape, bool)
    if n < 2:
        return out
    counts = np.bincount(labels.ravel())
    counts[0] = 0
    main = counts.argmax()
    main_cols = np.nonzero(labels == main)[1]
    main_l, main_r = main_cols.min(), main_cols.max()

    rgb = frame[:, :, :3].astype(float)
    mean_of = {cid: rgb[labels == cid].mean(axis=0) for cid in range(1, n + 1)
               if counts[cid] >= 200}

    suspect = []
    for cid in range(1, n + 1):
        if cid == main or counts[cid] < DETACHED_SIDE_MIN_PX:
            continue
        cols = np.nonzero(labels == cid)[1]
        if cols.max() <= main_l - gap or cols.min() >= main_r + gap:
            suspect.append(cid)

    for cid in suspect:
        twin = any(other not in suspect and other != main
                   and np.abs(mean_of[cid] - mean_of[other]).max() < 24
                   for other in mean_of)
        if not twin:
            out |= labels == cid
    return out


def below_bleed_mask(frame, gap=2):
    """Components sitting wholly below the body — the row beneath leaking up.

    `extract_sprites` wants an 8px gap before it will call this bleed, which is
    right for an unattended sweep but misses cases like `yuta/r2c2`, where a
    whole neighbouring sprite sits 4px under his feet. Named frames only.
    """
    opaque = frame[:, :, 3] >= 128
    labels, n = ndimage.label(opaque, structure=np.ones((3, 3), np.int8))
    out = np.zeros(opaque.shape, bool)
    if n < 2:
        return out
    counts = np.bincount(labels.ravel())
    counts[0] = 0
    main = counts.argmax()
    main_bottom = np.nonzero(labels == main)[0].max()
    for cid in range(1, n + 1):
        if cid == main:
            continue
        rows = np.nonzero(labels == cid)[0]
        if rows.min() >= main_bottom + gap:
            out |= labels == cid
    return out


GROUND_PATCH_BAND = 0.14
GROUND_PATCH_MIN_PX = 150


def ground_patch_mask(frame, band=GROUND_PATCH_BAND):
    """A baked-in floor patch under the feet — pale ground with a drawn-on
    shadow, which the engine then double-shadows with its own.

    Taking only the pale pixels would strand the dark shadow drawn on top, so
    the pale region is closed into a solid footprint and the shadow inside it
    goes too. Boots are rescued by protecting dark pixels that connect upward
    to the figure above the band.

    NAME THE FRAMES — never sweep the roster. "Pale thing near the feet" also
    describes Yuta's white boots, Momo's broom straw and every pale ground
    effect; run bare it flags 160 frames and eats most of those. Preview, then
    apply to the frames someone has actually looked at.
    """
    opaque = frame[:, :, 3] >= 128
    rgb = frame[:, :, :3].astype(int)
    h = opaque.shape[0]
    top = int(h * (1 - band))

    pale = np.zeros_like(opaque)
    pale[top:] = (opaque & (rgb.min(axis=2) > 150)
                  & (np.ptp(rgb, axis=2) < 26))[top:]
    if pale.sum() < GROUND_PATCH_MIN_PX:
        return np.zeros_like(opaque)

    patch = ndimage.binary_fill_holes(ndimage.binary_dilation(pale, iterations=4))
    patch = ndimage.binary_erosion(patch, iterations=4) | pale

    labels, _ = ndimage.label(opaque, structure=np.ones((3, 3), np.int8))
    attached = set(np.unique(labels[:top][opaque[:top]])) - {0}
    body = np.isin(labels, list(attached))
    return patch & ~(body & (rgb.mean(axis=2) < 120))


FRINGE_RING = 2
FRINGE_MARGIN = 18


def fringe_mask(frame, ring=FRINGE_RING, margin=FRINGE_MARGIN):
    """Green key residue clinging to the silhouette's edge.

    The round-5 art was delivered over a green background, so every soft edge —
    hair tips above all — kept a green halo once keyed. It shows as an olive
    rim against a dark stage.

    Green ART is spared by requiring the contamination to be edge-only: if
    green also appears in the eroded interior nearby, this is Maki's hair or
    Hanami's foliage and the pixels are left alone.
    """
    rgb = frame[:, :, :3].astype(int)
    opaque = frame[:, :, 3] >= 128
    inner = ndimage.binary_erosion(opaque, iterations=ring)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    green = (g > r + margin) & (g > b + margin)
    interior_green = ndimage.binary_dilation(inner & green, iterations=4)
    return (opaque & ~inner) & green & ~interior_green


def defringe(frame):
    """Repaint fringe pixels from the nearest clean pixel. COLOUR ONLY — alpha
    is untouched, so the silhouette keeps its shape and anti-aliasing."""
    mask = fringe_mask(frame)
    if not mask.any():
        return frame, mask
    clean = (frame[:, :, 3] >= 128) & ~mask
    _, (iy, ix) = ndimage.distance_transform_edt(~clean, return_indices=True)
    ys, xs = np.nonzero(mask)
    frame[ys, xs, :3] = frame[iy[ys, xs], ix[ys, xs], :3]
    return frame, mask


def enclosed_white_mask(frame, min_px=TRAPPED_WHITE_MIN_PX):
    """Exactly what `review_sheets.py` paints red on the WHITE sheets: flat
    white blobs walled in by the silhouette. Keeping the two in step means a
    reviewer's "yes, that red is background" maps to precisely these pixels."""
    opaque = frame[:, :, 3] >= 128
    out = np.zeros(opaque.shape, bool)
    for blob, _, _ in white_blobs(frame, min_px):
        inner = ndimage.binary_dilation(blob, iterations=TRAPPED_WHITE_RING_INNER)
        ring = ndimage.binary_dilation(blob, iterations=TRAPPED_WHITE_RING_OUTER) & ~inner
        if ring.any() and opaque[ring].mean() >= TRAPPED_WHITE_RING_OPAQUE:
            out |= blob
    return out


def hole_blobs(frame, min_px=60):
    """Fully-enclosed transparent regions, largest first, as (mask, px, box).

    The pipeline auto-fills these only up to 60px. Bigger ones need an eye:
    a gap punched through Mahito's chest and the triangle framed by his arm
    resting on his hip are the same shape to a computer and opposite to a
    player, so they are picked with `--holes` / `--fill` rather than a rule.
    """
    opaque = frame[:, :, 3] >= 128
    holes = ndimage.binary_fill_holes(opaque) & ~opaque
    labels, n = ndimage.label(holes, structure=np.ones((3, 3), np.int8))
    if not n:
        return []
    counts = np.bincount(labels.ravel())
    counts[0] = 0
    out = []
    for i in np.nonzero(counts >= min_px)[0]:
        blob = labels == i
        ys, xs = np.nonzero(blob)
        out.append((blob, int(counts[i]),
                    (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))))
    out.sort(key=lambda t: -t[1])
    return out


def fill_holes(frame, mask):
    """Inpaint `mask` from the nearest opaque pixel, as `fill_pinholes` does."""
    opaque = frame[:, :, 3] >= 128
    _, (iy, ix) = ndimage.distance_transform_edt(~opaque, return_indices=True)
    ys, xs = np.nonzero(mask)
    frame[ys, xs] = frame[iy[ys, xs], ix[ys, xs]]
    frame[ys, xs, 3] = 255
    return frame


def pick_board(man, targets, out_path, min_px=TRAPPED_WHITE_MIN_PX, kind="white"):
    """Contact sheet with every candidate numbered, so blobs can be named on
    the command line: `--clear maki/r2c2:2`, `--fill mahito/charge:0`."""
    from PIL import ImageDraw
    tiles = []
    for c, k in targets:
        meta = man["characters"].get(c, {}).get(k)
        if not meta:
            continue
        frame = np.array(Image.open(os.path.join(SPRITES, meta["file"])).convert("RGBA"))
        blobs = (hole_blobs(frame, min_px) if kind == "holes"
                 else white_blobs(frame, min_px))
        vis = frame.copy()
        # a distinct hue per index so a number can be tied to a region
        hues = [(255, 60, 60), (60, 200, 255), (255, 220, 60), (120, 255, 120),
                (255, 130, 240), (255, 160, 60)]
        for i, (blob, _, _) in enumerate(blobs):
            vis[blob] = [*hues[i % len(hues)], 255]
        tiles.append((c, k, blobs, Image.fromarray(vis)))

    if not tiles:
        return None
    cols = min(4, len(tiles))
    rows = (len(tiles) + cols - 1) // cols
    W, H = 260, 320
    board = Image.new("RGB", (W * cols, H * rows), (20, 22, 30))
    d = ImageDraw.Draw(board)
    for i, (c, k, blobs, t) in enumerate(tiles):
        t.thumbnail((W - 14, H - 66))
        x, y = (i % cols) * W, (i // cols) * H
        board.paste(t, (x + (W - t.width) // 2, y + 44 + (H - 66 - t.height) // 2), t)
        d.text((x + 7, y + 6), f"{c}/{k}", fill=(255, 255, 255))
        hues = [(255, 60, 60), (60, 200, 255), (255, 220, 60), (120, 255, 120),
                (255, 130, 240), (255, 160, 60)]
        for j, (_, px, _) in enumerate(blobs[:5]):
            d.text((x + 7 + (j % 3) * 82, y + 20 + (j // 3) * 12),
                   f"{j}:{px}px", fill=hues[j % len(hues)])
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    board.save(out_path)
    return out_path


def process(char, key, meta, do_white, do_bleed, write, force=False,
            min_px=TRAPPED_WHITE_MIN_PX, picks=None, do_shadow=False, fills=None, mend=0, do_defringe=False, do_below=False, do_enclosed=False):
    path = os.path.join(SPRITES, meta["file"])
    if not os.path.exists(path):
        return None
    frame = np.array(Image.open(path).convert("RGBA"))
    notes, removed = [], np.zeros(frame.shape[:2], bool)

    if do_enclosed:
        m = enclosed_white_mask(frame, min_px)
        if m.any():
            removed |= m
            notes.append(f"enclosed white {int(m.sum())}px")
    if do_below:
        m = below_bleed_mask(frame)
        if m.any():
            removed |= m
            notes.append(f"below-bleed {int(m.sum())}px")
    if do_shadow:
        m = ground_patch_mask(frame)
        if m.any():
            removed |= m
            notes.append(f"ground patch {int(m.sum())}px")
    if do_bleed and SHEET_CELL.match(key):
        # Generated poses are standalone images with no neighbouring cell, so
        # a detached blob there is always part of the art.
        m = side_bleed_mask(frame)
        if m.any():
            removed |= m
            notes.append(f"bleed {int(m.sum())}px")
    if do_defringe:
        _, m = defringe(frame)
        if m.any():
            notes.append(f"defringe {int(m.sum())}px")
            if write:
                Image.fromarray(frame).save(path)
            return f"{char}/{key}: " + ", ".join(notes)
        return None

    if mend:
        # Moth-eaten holes: the chroma pass nibbled pinpricks and patches out
        # of solid bodies. Genuine gaps a player reads as gaps — an armpit
        # triangle, an arm on a hip — are far larger than this ceiling, so a
        # size cutoff separates them cleanly where colour and shape could not.
        chosen = np.zeros(frame.shape[:2], bool)
        for blob, px, _ in hole_blobs(frame, 20):
            if px < mend:
                chosen |= blob
                notes.append(f"mend {px}px")
        if not chosen.any():
            return None
        if write:
            fill_holes(frame, chosen)
            Image.fromarray(frame).save(path)
        return f"{char}/{key}: mended {len(notes)} hole(s), {int(chosen.sum())}px"

    if fills:
        blobs = hole_blobs(frame, min_px)
        chosen = np.zeros(frame.shape[:2], bool)
        for idx in fills:
            if idx >= len(blobs):
                return f"{char}/{key}: no hole #{idx} (only {len(blobs)})"
            chosen |= blobs[idx][0]
            notes.append(f"hole #{idx} {blobs[idx][1]}px")
        if write:
            fill_holes(frame, chosen)
            Image.fromarray(frame).save(path)
        return f"{char}/{key}: " + ", ".join(notes)

    if picks:
        blobs = white_blobs(frame, min_px)
        for idx in picks:
            if idx >= len(blobs):
                return f"{char}/{key}: no blob #{idx} (only {len(blobs)})"
            removed |= blobs[idx][0]
            notes.append(f"white #{idx} {blobs[idx][1]}px")
    elif do_white:
        m = trapped_white_mask(frame, force=force, min_px=min_px)
        if m.any():
            removed |= m
            notes.append(f"white {int(m.sum())}px")
    if not notes:
        return None

    frame[removed] = 0
    ys, xs = np.nonzero(frame[:, :, 3] >= 128)
    if not len(ys):
        return f"{char}/{key}: SKIPPED — cleanup would empty the frame"

    # Dropping a blob shrinks the content box, so the frame must be re-cropped
    # and its cell-space anchor moved by the same amount. `ox`/`oy` are
    # cell-relative and shift with the crop.
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    cropped = frame[y0:y1, x0:x1]
    if (x0, y0) != (0, 0) or cropped.shape[:2] != frame.shape[:2]:
        notes.append(f"recrop +{x0},+{y0} -> {x1 - x0}x{y1 - y0}")

    # `bodyBottom` is the foot line. Clearing a ground patch removes the
    # lowest pixels, so the old foot line points into empty space and the
    # sprite would hover exactly that far above the platform.
    lift = frame.shape[0] - y1
    if lift:
        notes.append(f"bodyBottom -{lift}")

    a = cropped[:, :, 3].astype(float)
    cys, cxs = np.nonzero(a >= 128)
    centroid = float((cxs * a[cys, cxs]).sum() / max(1.0, a[cys, cxs].sum()))

    if write:
        Image.fromarray(cropped).save(path)
        meta["ox"] = int(meta.get("ox", 0)) + int(x0)
        meta["oy"] = int(meta.get("oy", 0)) + int(y0)
        meta["w"], meta["h"] = int(x1 - x0), int(y1 - y0)
        meta["centroidX"] = round(centroid, 1)
        if lift and meta.get("bodyBottom") is not None:
            meta["bodyBottom"] = meta["bodyBottom"] - int(lift)
    return f"{char}/{key}: " + ", ".join(notes)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("frames", nargs="*", help="char/frame keys; default = all")
    ap.add_argument("--chars")
    ap.add_argument("--white", action="store_true")
    ap.add_argument("--bleed", action="store_true")
    ap.add_argument("--shadow", action="store_true",
                    help="drop baked-in ground/shadow patches under the feet")
    ap.add_argument("--report", action="store_true", help="show changes, write nothing")
    ap.add_argument("--force", action="store_true",
                    help="clear enclosed white pockets even where the wall is bright "
                         "(human-reviewed frames only)")
    ap.add_argument("--min-px", type=int, default=TRAPPED_WHITE_MIN_PX)
    ap.add_argument("--pick", action="store_true",
                    help="write a numbered candidate board instead of editing")
    ap.add_argument("--clear", nargs="*", default=[],
                    help="char/frame:i,j — clear those numbered white blobs")
    ap.add_argument("--holes", action="store_true",
                    help="with --pick, number enclosed transparent holes instead")
    ap.add_argument("--fill", nargs="*", default=[],
                    help="char/frame:i,j — inpaint those numbered holes")
    ap.add_argument("--enclosed", action="store_true",
                    help="clear the blobs review_sheets marks red on WHITE sheets")
    ap.add_argument("--below", action="store_true",
                    help="drop components sitting wholly below the body")
    ap.add_argument("--defringe", action="store_true",
                    help="repaint green key residue on silhouette edges")
    ap.add_argument("--mend", type=int, default=0, metavar="MAXPX",
                    help="inpaint every enclosed hole smaller than MAXPX")
    ap.add_argument("--board", default=os.path.join(HERE, "debug", "clean", "pick.png"))
    args = ap.parse_args()
    if not (args.white or args.bleed or args.shadow or args.mend or args.fill or args.defringe or args.below or args.enclosed):
        args.white = args.bleed = True

    man = json.load(open(MANIFEST))

    fills = {}
    for spec in args.fill:
        ref, _, idxs = spec.partition(":")
        c, k = ref.split("/")
        fills[(c, k)] = [int(i) for i in idxs.split(",") if i != ""]

    picks = {}
    for spec in args.clear:
        ref, _, idxs = spec.partition(":")
        c, k = ref.split("/")
        picks[(c, k)] = [int(i) for i in idxs.split(",") if i != ""]

    targets = []
    if fills:
        targets = list(fills)
    elif picks:
        targets = list(picks)
    elif args.frames:
        for f in args.frames:
            c, k = f.split("/")
            targets.append((c, k))
    else:
        chars = ([c.strip() for c in args.chars.split(",")] if args.chars
                 else sorted(man["characters"]))
        for c in chars:
            targets.extend((c, k) for k in sorted(man["characters"][c]))

    if args.pick:
        print(pick_board(man, targets, args.board, args.min_px,
                         "holes" if args.holes else "white") or "no candidates")
        return

    lines = []
    for c, k in targets:
        meta = man["characters"].get(c, {}).get(k)
        if not meta:
            lines.append(f"{c}/{k}: not in manifest")
            continue
        r = process(c, k, meta, args.white, args.bleed, write=not args.report,
                    force=args.force, min_px=args.min_px,
                    picks=picks.get((c, k)), do_shadow=args.shadow,
                    fills=fills.get((c, k)), mend=args.mend, do_defringe=args.defringe, do_below=args.below, do_enclosed=args.enclosed)
        if r:
            lines.append(r)

    for line in lines:
        print("  " + line)
    if args.report:
        print(f"({len(lines)} frame(s) would change — nothing written)")
    elif lines:
        json.dump(man, open(MANIFEST, "w"), indent=1)
        print(f"{len(lines)} frame(s) cleaned; manifest metadata updated")
    else:
        print("nothing to clean")


if __name__ == "__main__":
    main()
