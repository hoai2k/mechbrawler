#!/usr/bin/env python3
"""Extract individual sprites from the v1 JJK Brawler sheets into per-frame alpha PNGs.

The v1 sheets are 1254x1568 RGBA images on a 4x5 grid (cell ~313.5 x 313.6).
Row layout: 0=idle, 1=run, 2=jump/air (col 3 = hurt), 3=attack/special, 4=crouch.

Problem with the v1 sheets: sprites do not respect cell boundaries — weapons and
effects bleed into neighboring cells, so naive grid crops cut sprites apart and
pick up fragments of their neighbors.

Fix: connected-component labeling over the whole sheet's alpha channel. Each
component is assigned to the grid cell that contains the majority of its pixels,
then every cell's frame is composited from exactly its own components (pixels
from foreign components inside the union bbox are excluded). Output is one
tightly-trimmed PNG per frame plus a manifest recording each frame's placement
relative to its logical cell, and the detected "body bottom" (foot line) used by
the engine to keep ground animations from bobbing.

Usage:  python3 extract_sprites.py [--chars gojo,maki] [--src DIR] [--out DIR]
"""

import argparse
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

SHEET_W, SHEET_H = 1254, 1568
COLS, ROWS = 4, 5
MIN_COMPONENT_PX = 16          # drop isolated specks smaller than this
ALPHA_THRESHOLD = 8            # alpha >= this counts as opaque for labeling
EMPTY_CELL_ALPHA_FRACTION = 0.005  # cell composite below this -> fall back to raw crop

CHARACTERS = [
    "gojo", "nanami", "hanami", "geto", "momo", "mahito", "sukuna", "megumi",
    "jogo", "hakari", "yuta", "nobara", "maki", "inumaki", "panda", "todo", "toji",
]

X_EDGES = [round(c * SHEET_W / COLS) for c in range(COLS + 1)]
Y_EDGES = [round(r * SHEET_H / ROWS) for r in range(ROWS + 1)]

# Surgical per-frame fixes.
# "dropDetachedBelowBody": remove components that float fully below the frame's
#   main body with a clear vertical gap (stray effect fragments that would
#   render under the stage floor).
# "stripFlatWhite": remove large flat pure-white blobs — unkeyed background
#   wedges (only safe on frames with no legitimate large white art).
# "stripChecker": remove baked-in transparency-checkerboard texture (flat
#   white/gray interleaved blocks inside effect cutouts).
# Detached-blob-below-body rule (applied to every frame; see the extraction
# loop). A blob must clear the body by this many pixels and be at least this
# large before it is treated as bleed from the row beneath.
DETACHED_BELOW_GAP = 8
DETACHED_BELOW_MIN_PX = 700
# Same idea for the cells left and right. Horizontal neighbours are much more
# common than vertical ones, and poses legitimately fling a weapon or an effect
# out sideways, so the gap has to be far clearer before a blob counts as bleed.
DETACHED_SIDE_GAP = 24
DETACHED_SIDE_MIN_PX = 400
# Flat-white pockets trapped inside the silhouette (see strip_trapped_white).
TRAPPED_WHITE_MIN_PX = 120
TRAPPED_WHITE_RING_OPAQUE = 0.97
TRAPPED_WHITE_RING_DARK = 0.75
# The ring is sampled from 4px out, not 0px: the first few pixels are the
# anti-aliased fade from white to cloth, and measuring them makes every pocket
# look half-bright no matter how dark the wall behind it is.
TRAPPED_WHITE_RING_INNER = 4
TRAPPED_WHITE_RING_OUTER = 9

FRAME_OVERRIDES = {
    ("sukuna", "r0c0"): {"stripFlatWhite": True},
    ("sukuna", "r1c2"): {"stripFlatWhite": True},
    ("sukuna", "r1c3"): {"stripFlatWhite": True},
    ("toji", "r2c1"): {"stripChecker": True},
    ("inumaki", "r3c1"): {"stripChecker": True},
}

# High-resolution, individually generated replacement cells. These alpha PNGs
# deliberately live at their final asset paths; when the historical sheets are
# re-extracted, the corresponding cells are preserved and their runtime
# placement metadata is rebuilt from the image alpha bounds.
GENERATED_FRAME_TARGETS = {
    ("gojo", "idle_a"): {"bodyBottom": 310, "bodyH": 256},
    ("gojo", "idle_b"): {"bodyBottom": 310, "bodyH": 256},
    ("gojo", "run_a"): {"bodyBottom": 310, "bodyH": 210},
    ("gojo", "run_b"): {"bodyBottom": 310, "bodyH": 210},
    ("gojo", "jump_rise"): {"bodyBottom": 310, "bodyH": 231},
    ("gojo", "fall"): {"bodyBottom": 310, "bodyH": 241},
    ("gojo", "hurt"): {"bodyBottom": 310, "bodyH": 206},
    ("gojo", "guard"): {"bodyBottom": 310, "bodyH": 225},
    ("gojo", "attack_up"): {"bodyBottom": 310, "bodyH": 310},
    ("gojo", "attack_air"): {"bodyBottom": 310, "bodyH": 220},
    ("gojo", "charge"): {"bodyBottom": 310, "bodyH": 225},
    ("gojo", "dizzy"): {"bodyBottom": 310, "bodyH": 250},
    ("gojo", "victory"): {"bodyBottom": 310, "bodyH": 256},
    ("gojo", "ledge_hang"): {"bodyBottom": 310, "bodyH": 137},
    ("momo", "r4c0"): {"bodyBottom": 310, "bodyH": 187},
    ("momo", "r4c1"): {"bodyBottom": 310, "bodyH": 187},
    ("momo", "r4c2"): {"bodyBottom": 310, "bodyH": 193.75},
    ("momo", "r4c3"): {"bodyBottom": 310, "bodyH": 158},
    ("hanami", "r4c0"): {"bodyBottom": 309, "bodyH": 174},
    ("hanami", "r4c1"): {"bodyBottom": 309, "bodyH": 178},
    ("hanami", "r4c2"): {"bodyBottom": 309, "bodyH": 173},
    ("hanami", "r4c3"): {"bodyBottom": 309, "bodyH": 183},
    ("toji", "r2c3"): {"bodyBottom": 277, "bodyH": 255},
    ("sukuna", "r4c0"): {"bodyBottom": 310, "bodyH": 187},
    ("sukuna", "r4c1"): {"bodyBottom": 310, "bodyH": 187},
    ("sukuna", "r4c2"): {"bodyBottom": 307, "bodyH": 175.84},
    ("sukuna", "r4c3"): {"bodyBottom": 310, "bodyH": 187},
    ("toji", "r4c0"): {"bodyBottom": 310, "bodyH": 192},
    ("toji", "r4c1"): {"bodyBottom": 310, "bodyH": 192},
    ("toji", "r4c2"): {"bodyBottom": 306, "bodyH": 188},
    ("toji", "r4c3"): {"bodyBottom": 310, "bodyH": 192},
    ("todo", "r4c0"): {"bodyBottom": 310, "bodyH": 194},
    ("todo", "r4c1"): {"bodyBottom": 304, "bodyH": 188},
    ("todo", "r4c2"): {"bodyBottom": 310, "bodyH": 187},
    ("todo", "r4c3"): {"bodyBottom": 310, "bodyH": 194},
    ("inumaki", "r4c0"): {"bodyBottom": 309, "bodyH": 174},
    ("inumaki", "r4c1"): {"bodyBottom": 309, "bodyH": 174},
    ("inumaki", "r4c2"): {"bodyBottom": 309, "bodyH": 160},
    ("inumaki", "r4c3"): {"bodyBottom": 309, "bodyH": 170},
    ("yuta", "r4c0"): {"bodyBottom": 309, "bodyH": 183},
    ("yuta", "r4c1"): {"bodyBottom": 308, "bodyH": 182},
    ("yuta", "r4c2"): {"bodyBottom": 309, "bodyH": 148},
    ("yuta", "r4c3"): {"bodyBottom": 309, "bodyH": 153},
    ("hakari", "r4c0"): {"bodyBottom": 310, "bodyH": 190},
    ("hakari", "r4c1"): {"bodyBottom": 310, "bodyH": 190},
    ("hakari", "r4c2"): {"bodyBottom": 310, "bodyH": 155},
    ("hakari", "r4c3"): {"bodyBottom": 310, "bodyH": 187},
}

# Round 5 semantic animation sprites. Each fighter keeps the standing height
# established by its original r0c0 art; pose ratios were visually calibrated
# on the first completed set (Gojo) and then applied roster-wide.
ROUND5_IDLE_BODY_H = {
    "gojo": 256, "yuta": 282, "hakari": 292, "maki": 288,
    "megumi": 295, "nobara": 291, "inumaki": 251, "panda": 275,
    "todo": 299, "momo": 288, "nanami": 286, "toji": 296,
    "sukuna": 287, "mahito": 283, "geto": 291, "jogo": 260,
    "hanami": 290,
}
ROUND5_POSE_RATIOS = {
    "idle_a": 1.0, "idle_b": 1.0,
    "run_a": 210 / 256, "run_b": 210 / 256,
    "jump_rise": 231 / 256, "fall": 241 / 256,
    "hurt": 206 / 256, "guard": 225 / 256,
    "attack_up": 310 / 256, "attack_air": 220 / 256,
    "charge": 225 / 256, "dizzy": 250 / 256,
    "victory": 1.0, "ledge_hang": 137 / 256,
}
for _char, _idle_h in ROUND5_IDLE_BODY_H.items():
    for _pose, _ratio in ROUND5_POSE_RATIOS.items():
        GENERATED_FRAME_TARGETS[(_char, _pose)] = {
            "bodyBottom": 310,
            "bodyH": round(_idle_h * _ratio, 1),
        }

# Hand-curated render scales for frames whose art is drawn at a different zoom
# than the character's standing sprites (dramatic technique cells, imagegen
# crouches). Verified visually against each character's idle frame — automated
# height/area heuristics can't separate pose changes from zoom changes.
RENDER_SCALES = {
    ("yuta", "r3c2"): 0.85,
    ("yuta", "r3c3"): 0.92,
    ("maki", "r3c2"): 0.85,
    ("inumaki", "r3c2"): 0.88,
    ("hakari", "r3c2"): 0.80,
    ("megumi", "r3c2"): 0.85,
    ("megumi", "r4c2"): 1.1,
    ("nobara", "r3c3"): 0.88,
    ("momo", "r3c3"): 0.92,
    ("hanami", "r3c3"): 0.87,
    ("jogo", "r3c3"): 0.88,
    ("panda", "r3c2"): 0.93,
    ("nanami", "r3c2"): 0.92,
    ("todo", "r3c2"): 0.85,
    ("mahito", "r3c2"): 0.88,
    ("sukuna", "r3c2"): 0.93,
    ("toji", "r3c1"): 0.93,
    ("gojo", "r3c3"): 0.95,
}

# Native art facing. The sheets are drawn facing RIGHT — verified against
# every character's run row (tools/debug/run_facing.png), where all 17 run
# rightward. Only the frames listed here are drawn facing LEFT; the engine
# mirrors those so a fighter always looks in their logical direction.
#
# NOTE: an earlier version of this table had the polarity inverted (it listed
# "right-facing exceptions" against a left-facing default), which made every
# character face backwards in game. If characters ever look reversed again,
# re-check this table before touching the renderer.
FACE_LEFT = {
    "gojo": {"r0c3", "r2c0", "r2c3", "r3c2", "r4c3"},
    "yuta": {"r0c2", "r0c3", "r4c0", "r4c1", "r4c2", "r4c3"},
    "hakari": {"r4c0", "r4c1", "r4c2", "r4c3"},
    "maki": {"r0c2", "r0c3", "r4c3"},
    "megumi": {"r0c3", "r3c0"},
    "nobara": {"r0c2", "r0c3", "r4c2", "r4c3"},
    "inumaki": {"r0c3", "r4c0", "r4c1", "r4c2", "r4c3"},
    "panda": {"r4c3"},
    "todo": {"r0c3", "r4c0", "r4c1", "r4c2", "r4c3"},
    "momo": {"r0c2", "r0c3", "r2c0", "r4c2", "r4c3"},
    "nanami": {"r0c2", "r0c3", "r3c0", "r4c2", "r4c3"},
    "toji": {"r0c3", "r3c1", "r4c0", "r4c1", "r4c2", "r4c3"},
    "mahito": {"r0c3", "r3c3", "r4c2", "r4c3"},
    "geto": {"r0c3", "r2c0", "r3c1", "r4c2", "r4c3"},
    "jogo": {"r0c3", "r3c0", "r4c2", "r4c3"},
    "hanami": {"r4c0", "r4c1", "r4c2", "r4c3"},
    "sukuna": {"r3c0", "r3c1", "r3c2", "r3c3", "r4c0", "r4c1", "r4c2", "r4c3"},
}


def generated_frame_meta(frame, target):
    """Build sheet-compatible placement metadata for a high-res override."""
    alpha = frame[:, :, 3]
    ys, xs = np.nonzero(alpha >= ALPHA_THRESHOLD)
    if not len(xs):
        raise ValueError("generated override has no visible pixels")
    bx0, bx1 = int(xs.min()), int(xs.max() + 1)
    by0, by1 = int(ys.min()), int(ys.max() + 1)
    weights = alpha[ys, xs].astype(np.float64)
    center_x = (bx0 + bx1) / 2
    ox = SHEET_W / COLS / 2 - center_x
    body_bottom = target["bodyBottom"]
    target_body_h = target["bodyH"]
    return {
        "w": int(frame.shape[1]),
        "h": int(frame.shape[0]),
        "ox": round(ox, 1),
        "oy": int(body_bottom - by1),
        "bodyBottom": body_bottom,
        "bodyH": round(target_body_h, 1),
        "centroidX": round(float(ox + (xs * weights).sum() / weights.sum()), 1),
        "renderScale": round(target_body_h / (by1 - by0), 3),
    }


def cell_rect(col, row):
    x0, x1 = X_EDGES[col], X_EDGES[col + 1]
    y0, y1 = Y_EDGES[row], Y_EDGES[row + 1]
    return x0, y0, x1, y1


def strip_flat_white(frame):
    """Remove big flat pure-white blobs (unkeyed background wedges)."""
    rgb = frame[:, :, :3].astype(np.int16)
    opaque = frame[:, :, 3] >= 128
    flat = opaque & (rgb.min(axis=2) > 233) & ((rgb.max(axis=2) - rgb.min(axis=2)) < 12)
    labels, n = ndimage.label(flat, structure=np.ones((3, 3), np.int8))
    if not n:
        return frame
    counts = np.bincount(labels.ravel())
    counts[0] = 0
    for i in np.nonzero(counts > 220)[0]:
        frame[labels == i] = 0
    return frame


def strip_trapped_white(frame):
    """Remove flat near-white pockets walled in by dark pixels.

    Unkeyed background survives wherever the silhouette encloses it — between
    the legs, under an arm, inside a prop — because the chroma pass never
    reaches those pockets from outside.

    OPT-IN PER FRAME, and deliberately so. Leak and legitimate white art are
    not separable by any measurement tried: size, per-pixel flatness, spatial
    variance and ring darkness all overlap, and some art (Panda's belly) is
    *flatter* than the leak it would be judged against. Run blanket, this eats
    Panda's belly, Sukuna's cursed energy and the white blades on Maki's and
    Toji's polearms. Use `clean_frames.py --pick` to choose blobs by eye
    instead, and only set `stripTrappedWhite` on a frame someone has checked.
    """
    rgb = frame[:, :, :3].astype(np.int16)
    opaque = frame[:, :, 3] >= 128
    span = rgb.max(axis=2) - rgb.min(axis=2)
    white = opaque & (rgb.min(axis=2) > 225) & (span < 16)
    labels, n = ndimage.label(white, structure=np.ones((3, 3), np.int8))
    if not n:
        return frame
    luma = rgb.mean(axis=2)
    counts = np.bincount(labels.ravel())
    counts[0] = 0
    for i in np.nonzero(counts >= TRAPPED_WHITE_MIN_PX)[0]:
        blob = labels == i
        inner = ndimage.binary_dilation(blob, iterations=TRAPPED_WHITE_RING_INNER)
        ring = ndimage.binary_dilation(blob, iterations=TRAPPED_WHITE_RING_OUTER) & ~inner
        if not ring.any():
            continue
        if (opaque[ring].mean() >= TRAPPED_WHITE_RING_OPAQUE
                and (luma[ring] < 105).mean() >= TRAPPED_WHITE_RING_DARK):
            frame[blob] = 0
    return frame


def strip_checker(frame):
    """Remove baked-in transparency-checkerboard (interleaved flat white/gray)."""
    rgb = frame[:, :, :3].astype(np.int16)
    opaque = frame[:, :, 3] >= 128
    span = rgb.max(axis=2) - rgb.min(axis=2)
    white = opaque & (rgb.min(axis=2) > 228) & (span < 12)
    gray = opaque & (rgb.min(axis=2) > 178) & (rgb.max(axis=2) < 235) & (span < 12)
    both = white | gray
    # checker areas contain BOTH tones tightly interleaved
    w_near = ndimage.binary_dilation(white, iterations=6)
    g_near = ndimage.binary_dilation(gray, iterations=6)
    checker = both & w_near & g_near
    labels, n = ndimage.label(checker, structure=np.ones((3, 3), np.int8))
    if not n:
        return frame
    counts = np.bincount(labels.ravel())
    counts[0] = 0
    for i in np.nonzero(counts > 160)[0]:
        frame[labels == i] = 0
    return frame


def fill_pinholes(frame, max_hole=400):
    """Fill fully-enclosed transparent holes (moth-eaten bodies, pinpricks) by
    inpainting from surrounding pixels. Large enclosed holes (arm loops, the
    dark core of an effect ring) are intentional art and stay untouched.

    The ceiling was 60px, which left 250 frames across the roster peppered with
    holes up to 400px — whole patches missing from Nanami's suit and Hanami's
    bark. Gaps a player reads as gaps are far bigger than 400px, so raising it
    mends the damage without touching real art; verified frame by frame on the
    worst offenders in every character."""
    a = frame[:, :, 3]
    opaque = a >= 128
    filled = ndimage.binary_fill_holes(opaque)
    holes = filled & ~opaque
    labels, n = ndimage.label(holes, structure=np.ones((3, 3), np.int8))
    if not n:
        return frame
    counts = np.bincount(labels.ravel())
    counts[0] = 0
    small = np.isin(labels, np.nonzero((counts > 0) & (counts <= max_hole))[0])
    if not small.any():
        return frame
    # nearest-opaque-pixel inpaint
    _, (iy, ix) = ndimage.distance_transform_edt(~opaque, return_indices=True)
    ys, xs = np.nonzero(small)
    frame[ys, xs] = frame[iy[ys, xs], ix[ys, xs]]
    frame[ys, xs, 3] = 255
    return frame


def extract_character(char, src_dir, out_dir, debug_dir):
    sheet_path = os.path.join(src_dir, f"{char}_sprites_cleaned.png")
    img = np.array(Image.open(sheet_path).convert("RGBA"))
    alpha = img[:, :, 3]
    mask = alpha >= ALPHA_THRESHOLD

    labels, n = ndimage.label(mask, structure=np.ones((3, 3), dtype=np.int8))
    ys, xs = np.nonzero(labels)
    label_ids = labels[ys, xs]

    col_of_px = np.digitize(xs, X_EDGES[1:-1])
    row_of_px = np.digitize(ys, Y_EDGES[1:-1])
    cell_of_px = row_of_px * COLS + col_of_px

    # pixel count of every (component, cell) pair -> majority cell per component
    counts = np.zeros((n + 1, ROWS * COLS), dtype=np.int64)
    np.add.at(counts, (label_ids, cell_of_px), 1)
    totals = counts.sum(axis=1)
    home_cell = counts.argmax(axis=1)

    keep = totals >= MIN_COMPONENT_PX
    keep[0] = False

    # map every component to its cell (dropped components -> -1)
    comp_cell = np.where(keep, home_cell, -1)

    # bounding boxes of all components
    slices = ndimage.find_objects(labels)

    # A detached effect fragment that hangs almost entirely below its home
    # cell's bottom edge belongs to the frame in the row underneath (art rows
    # overlap slightly on some sheets). Reassign such fragments — unless they
    # touch the cell's main body sprite.
    for comp in range(1, n + 1):
        if not keep[comp]:
            continue
        cell = comp_cell[comp]
        row, col = divmod(cell, COLS)
        _, y0c, _, y1c = cell_rect(col, row)
        sl = slices[comp - 1]
        top = sl[0].start
        if top > y1c - 12 and row + 1 < ROWS:
            # main body of this cell = largest other component assigned here
            others = [c for c in range(1, n + 1)
                      if c != comp and keep[c] and comp_cell[c] == cell]
            if others:
                main = max(others, key=lambda c: totals[c])
                msl = slices[main - 1]
                pad = 24
                overlaps = not (sl[0].stop < msl[0].start - pad or sl[0].start > msl[0].stop + pad
                                or sl[1].stop < msl[1].start - pad or sl[1].start > msl[1].stop + pad)
                if not overlaps:
                    comp_cell[comp] = (row + 1) * COLS + col

    char_out = os.path.join(out_dir, char)
    os.makedirs(char_out, exist_ok=True)

    manifest = {}
    warnings = []

    # per-pixel cell assignment image for fast per-cell masking
    assigned = np.full(labels.shape, -1, dtype=np.int32)
    assigned[ys, xs] = comp_cell[label_ids]

    # size of the largest component in each cell (for body detection)
    for row in range(ROWS):
        for col in range(COLS):
            cell_idx = row * COLS + col
            x0, y0, x1, y1 = cell_rect(col, row)
            cell_mask = assigned == cell_idx
            frame_key = f"r{row}c{col}"

            generated_target = GENERATED_FRAME_TARGETS.get((char, frame_key))
            generated_path = os.path.join(char_out, f"{frame_key}.png")
            if generated_target and os.path.exists(generated_path):
                generated = np.array(Image.open(generated_path).convert("RGBA"))
                manifest[frame_key] = {
                    "file": f"{char}/{frame_key}.png",
                    **generated_frame_meta(generated, generated_target),
                }
                continue

            override = FRAME_OVERRIDES.get((char, frame_key), {})

            # Drop detached blobs that float entirely below the body with a
            # clear gap. These are almost always the TOP of the sprite in the
            # row beneath (the big technique spheres in row 3 poke up into the
            # air row), and in game they render as stray arcs under the
            # fighter's feet. Ground debris that belongs to the pose abuts the
            # feet and survives, because its gap is tiny.
            # Opt out per frame with {"keepDetachedBelow": True}.
            if cell_mask.any() and not override.get("keepDetachedBelow"):
                gap = override.get("detachedGap", DETACHED_BELOW_GAP)
                cids = np.unique(labels[cell_mask])
                cids = cids[cids != 0]
                main = cids[np.argmax(totals[cids])]
                main_bottom = np.nonzero(labels == main)[0].max()
                for cid in cids:
                    if cid == main:
                        continue
                    csl = slices[cid - 1]
                    if csl[0].start > main_bottom + gap and totals[cid] >= DETACHED_BELOW_MIN_PX:
                        cell_mask &= labels != cid
                        warnings.append(
                            f"{char} {frame_key}: dropped {int(totals[cid])}px blob "
                            f"{csl[0].start - main_bottom}px below the body (row-below bleed)")

            # Same for the cells either side: a blob separated from the body by
            # a wide horizontal gutter is the neighbouring pose leaking in.
            # Opt out per frame with {"keepDetachedSide": True}.
            if cell_mask.any() and not override.get("keepDetachedSide"):
                gap = override.get("detachedSideGap", DETACHED_SIDE_GAP)
                cids = np.unique(labels[cell_mask])
                cids = cids[cids != 0]
                main = cids[np.argmax(totals[cids])]
                main_cols = np.nonzero(labels == main)[1]
                main_l, main_r = main_cols.min(), main_cols.max()
                suspect = {}
                for cid in cids:
                    if cid == main or totals[cid] < DETACHED_SIDE_MIN_PX:
                        continue
                    csl = slices[cid - 1]
                    if csl[1].stop <= main_l - gap:
                        suspect[cid] = "left of"
                    elif csl[1].start >= main_r + gap:
                        suspect[cid] = "right of"

                # A blob that matches the colour of another detached blob which
                # is STAYING belongs to a scattered effect, not the neighbour:
                # Inumaki's orb ring flings lavender blobs right across the cell
                # and the outermost happens to clear the gutter.
                mean_of = {cid: img[:, :, :3][labels == cid].mean(axis=0)
                           for cid in cids if totals[cid] >= 200}
                for cid, side in suspect.items():
                    if any(o not in suspect and o != main
                           and np.abs(mean_of[cid] - mean_of[o]).max() < 24
                           for o in mean_of):
                        continue
                    cell_mask &= labels != cid
                    warnings.append(
                        f"{char} {frame_key}: dropped {int(totals[cid])}px blob "
                        f"{side} the body (adjacent-cell bleed)")

            if cell_mask.sum() < EMPTY_CELL_ALPHA_FRACTION * (x1 - x0) * (y1 - y0):
                # component assignment starved this cell (e.g. its sprite fused
                # with a neighbor) -> fall back to the raw grid crop
                warnings.append(f"{char} {frame_key}: sparse composite, using raw grid crop")
                cell_mask = np.zeros(labels.shape, dtype=bool)
                cell_mask[y0:y1, x0:x1] = mask[y0:y1, x0:x1]
                if not cell_mask.any():
                    warnings.append(f"{char} {frame_key}: EMPTY frame")
                    continue

            cys, cxs = np.nonzero(cell_mask)
            bx0, bx1 = cxs.min(), cxs.max() + 1
            by0, by1 = cys.min(), cys.max() + 1

            frame = np.zeros((by1 - by0, bx1 - bx0, 4), dtype=np.uint8)
            local = cell_mask[by0:by1, bx0:bx1]
            frame[local] = img[by0:by1, bx0:bx1][local]

            if override.get("stripFlatWhite"):
                frame = strip_flat_white(frame)
            if override.get("stripChecker"):
                frame = strip_checker(frame)
            if override.get("stripTrappedWhite"):
                frame = strip_trapped_white(frame)
            frame = fill_pinholes(frame)

            # body bottom: bottom of the largest single component in this cell —
            # effects detached from the body do not drag the foot line down
            comp_ids = np.unique(labels[cell_mask])
            comp_ids = comp_ids[comp_ids != 0]
            if len(comp_ids):
                largest = comp_ids[np.argmax(totals[comp_ids])]
                body_rows = np.nonzero((labels == largest) & cell_mask)[0]
                body_bottom = int(body_rows.max() + 1 - y0)
                body_h = int(body_rows.max() - body_rows.min() + 1)
            else:
                body_bottom = int(by1 - y0)
                body_h = int(by1 - by0)

            # alpha-weighted centroid x, relative to cell
            weights = frame[:, :, 3][local].astype(np.float64)
            centroid_x = float((cxs * alpha[cys, cxs]).sum() / max(1.0, alpha[cys, cxs].sum()) - x0)

            Image.fromarray(frame).save(os.path.join(char_out, f"{frame_key}.png"))
            manifest[frame_key] = {
                "file": f"{char}/{frame_key}.png",
                "w": int(bx1 - bx0),
                "h": int(by1 - by0),
                "ox": int(bx0 - x0),
                "oy": int(by0 - y0),
                "bodyBottom": body_bottom,
                "bodyH": body_h,
                "centroidX": round(centroid_x, 1),
            }

    for key, m in manifest.items():
        rs = RENDER_SCALES.get((char, key))
        if rs:
            m["renderScale"] = rs
        if key in FACE_LEFT.get(char, ()):
            m["faceLeft"] = True
    make_contact_sheet(char, img, manifest, debug_dir)
    # Semantic generated poses live outside the historical 5x4 sheet. Keep
    # them in the rebuilt manifest so re-extraction cannot silently discard
    # the higher-resolution Round 5 animation set.
    for (target_char, key), target in GENERATED_FRAME_TARGETS.items():
        if target_char != char or (key.startswith("r") and len(key) > 1 and key[1].isdigit()):
            continue
        generated_path = os.path.join(char_out, f"{key}.png")
        if not os.path.exists(generated_path):
            continue
        generated = np.array(Image.open(generated_path).convert("RGBA"))
        manifest[key] = {
            "file": f"{char}/{key}.png",
            **generated_frame_meta(generated, target),
        }
    return manifest, warnings


def make_contact_sheet(char, sheet_img, manifest, debug_dir, scale=0.32):
    """Debug view: every extracted frame drawn in its cell with grid, bbox and foot line."""
    cw = round(SHEET_W * scale)
    ch = round(SHEET_H * scale)
    canvas = Image.new("RGBA", (cw, ch), (34, 34, 44, 255))
    draw = ImageDraw.Draw(canvas)

    for key, m in manifest.items():
        row = int(key[1])
        col = int(key[3])
        x0, y0, x1, y1 = cell_rect(col, row)
        frame = Image.open(os.path.join(os.path.dirname(debug_dir), "..", "assets", "sprites", m["file"]))
        fw = max(1, round(m["w"] * scale))
        fh = max(1, round(m["h"] * scale))
        frame = frame.resize((fw, fh), Image.LANCZOS)
        px = round((x0 + m["ox"]) * scale)
        py = round((y0 + m["oy"]) * scale)
        canvas.alpha_composite(frame, (px, py))

    for col in range(COLS + 1):
        x = round(X_EDGES[col] * scale)
        draw.line([(x, 0), (x, ch)], fill=(90, 90, 120, 255), width=1)
    for row in range(ROWS + 1):
        y = round(Y_EDGES[row] * scale)
        draw.line([(0, y), (cw, y)], fill=(90, 90, 120, 255), width=1)

    for key, m in manifest.items():
        row = int(key[1])
        col = int(key[3])
        x0, y0, x1, y1 = cell_rect(col, row)
        bx0 = round((x0 + m["ox"]) * scale)
        by0 = round((y0 + m["oy"]) * scale)
        draw.rectangle([bx0, by0, bx0 + round(m["w"] * scale), by0 + round(m["h"] * scale)],
                       outline=(80, 200, 255, 160), width=1)
        fy = round((y0 + m["bodyBottom"]) * scale)
        draw.line([(round(x0 * scale), fy), (round(x1 * scale), fy)], fill=(255, 80, 80, 220), width=1)

    os.makedirs(debug_dir, exist_ok=True)
    canvas.convert("RGB").save(os.path.join(debug_dir, f"{char}_contact.jpg"), quality=88)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--chars", default=",".join(CHARACTERS))
    parser.add_argument("--src", default=os.path.join(os.path.dirname(__file__), "..", "..", "assets"))
    parser.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "assets", "sprites"))
    args = parser.parse_args()

    debug_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "debug")
    full_manifest = {
        "cellW": SHEET_W / COLS,
        "cellH": SHEET_H / ROWS,
        "nativeRight": {char: sorted(frames) for char, frames in FACE_RIGHT.items() if frames},
        "characters": {},
    }
    all_warnings = []
    for char in args.chars.split(","):
        char = char.strip()
        manifest, warnings = extract_character(char, args.src, args.out, debug_dir)
        full_manifest["characters"][char] = manifest
        all_warnings.extend(warnings)
        print(f"{char}: {len(manifest)} frames")

    with open(os.path.join(args.out, "manifest.json"), "w") as f:
        json.dump(full_manifest, f, indent=1)

    if all_warnings:
        print("\nWARNINGS:")
        for w in all_warnings:
            print(" -", w)


if __name__ == "__main__":
    main()
