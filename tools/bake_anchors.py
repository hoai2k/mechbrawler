#!/usr/bin/env python3
"""Measure each sprite's centre of mass and bake it into the manifest.

Rotation needs a pivot. Without one the renderer falls back to a heuristic —
the detected horizontal centroid at a fixed fraction of body height (see
`defaultCom` in src/sprites.js) — which is close enough on an upright idle and
poor on anything sprawled, crouched or mid-swing, exactly the poses that rotate
most. The honest answer is the opaque pixels' own centroid, which for uniform
density IS the centre of mass.

The opaque pixels' own centroid is the honest answer for a UNIFORM body, and a
human is not one — see COM_LIFT_FRAC below, which raises the measured centroid
out of the legs and into the midsection where a body actually pivots.

That is per-pixel work, so it happens here rather than at runtime: the renderer
does no pixel work by design (docs/audit-guide.md). This writes

    "anchors": { "com": [x, y] }

into every frame of assets/sprites/manifest.json, in the SOURCE IMAGE's own
pixels measured from its top-left corner — the same space the workbench edits,
so a baked value can be dragged afterwards and a hand-placed one is never
silently overwritten.

State-specific anchors are measured too, where a rule can find them: the
`ledge` grip on a hang pose is the centroid of the topmost band of opaque
pixels, which is the raised hand. See EXTRA in this file.

It also records `bodyTop`: the topmost opaque row, in the image's own pixels.
That is what lets a character be scaled so the top of their head lands exactly
on the head-height target (src/heights.js) instead of on an approximation of
it, and it is why changing the idle's ground contact can keep the head where
it was.

And two horizontal spans in the same image pixels: `bodyLeft`/`bodyRight`, the
outer bounds of the drawing, and `coreLeft`/`coreRight`, the columns holding the
middle of its ink once a held weapon or an outflung sleeve has been trimmed off
(see CORE_TRIM). The first says how far a frame REACHES; the second says how
wide the fighter IS. Those are what src/silhouette.js turns into how far a
character actually reaches and how wide they actually are, which is where
hitboxes and hurtboxes now come from — so a swing connects at the distance the
art shows it connecting, and a broad fighter is broad to hit. One frame is
never trusted on its own: silhouette.js takes a robust aggregate over the whole
set of poses and bands the result, so a single re-export cannot move a matchup.

Usage:
  python3 bake_anchors.py                 # every character, skip hand-edited
  python3 bake_anchors.py --only gojo maki
  python3 bake_anchors.py --force         # re-measure even hand-placed anchors
  python3 bake_anchors.py --dry-run
"""

import argparse
import json
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pip install Pillow")

HERE = os.path.dirname(os.path.abspath(__file__))
SPRITES = os.path.join(HERE, "..", "assets", "sprites")
MANIFEST = os.path.join(SPRITES, "manifest.json")

# Ignore near-transparent pixels: soft glow and antialiased edges extend well
# past the body and would drag the centroid toward whichever side the effect
# happens to bloom on.
ALPHA_FLOOR = 40


# Sprite art is ~1000 px square and there are hundreds of frames, so the
# centroid is measured on a downsampled copy. Thresholding happens FIRST, at
# full resolution, and the box filter then turns that mask into an area weight
# per cell — so the result is the true mask centroid, not an approximation of
# it, and it lands well inside a tenth of a source pixel.
WORK_SIZE = 160

# Extra anchors that can be measured rather than placed by hand, keyed by the
# frame they belong on. `band` takes the centroid of the opaque pixels in the
# top fraction of the artwork — on a ledge hang, the hand holding the edge.
# Frame keys match the animation data in src/characters.js, where every
# character's `ledge` state resolves to `ledge_hang`.
EXTRA = {
    "ledge_hang": {"ledge": {"band": 0.08}},
}


def _mask(path):
    """Thresholded alpha, downsampled, plus the scale back to source pixels."""
    with Image.open(path) as im:
        alpha = im.convert("RGBA").getchannel("A")
        full_w, full_h = alpha.size
        mask = alpha.point(lambda a: 255 if a >= ALPHA_FLOOR else 0)
        bbox = mask.getbbox()
        scale = max(full_w, full_h) / WORK_SIZE
        if scale > 1:
            mask = mask.resize((max(1, round(full_w / scale)),
                                max(1, round(full_h / scale))), Image.BOX)
        else:
            scale = 1.0
    return mask, scale, bbox


def body_top(path):
    """Topmost opaque row, in the image's own pixels. None if fully clear."""
    small, scale, bbox = _mask(path)
    return None if bbox is None else round(bbox[1], 1)


def body_span(path):
    """Leftmost and rightmost opaque columns, in the image's own pixels.

    Measured on the same thresholded mask `bodyTop` uses, so the soft glow a
    lot of the attack art blooms with does not read as reach. None if the frame
    is fully clear."""
    small, scale, bbox = _mask(path)
    return None if bbox is None else (round(bbox[0], 1), round(bbox[2], 1))


# How much of the silhouette's ink to trim off each side when measuring the
# BODY rather than the drawing.
#
# The outer bounds say how far a frame's art extends, which is the right
# question for reach and the wrong one for width: a naginata held across the
# chest, a guitar, a broom or an outflung sleeve is a thin sliver of pixels far
# from the torso, and counting it makes a fighter a wider target for carrying
# something they cannot be hit on. Trimming by column MASS rather than by
# distance removes exactly that — a sliver is a little ink over many columns,
# while a torso is a lot of ink over few — and leaves the body itself alone.
#
# Calibrated against the roster rather than guessed. At 7% a side this ate the
# torso as well — a human silhouette carries real mass in the arms and legs, so
# a large trim shrinks everybody instead of only the ones holding something. At
# 2.5% Gakuganji's guitar comes off (his idle measures 96 px wide by its outer
# bounds and 67 by this) while a fighter holding nothing barely moves.
#
# Re-tuning this means re-measuring: `--spans-only` does that pass alone, which
# is a couple of minutes rather than the twenty a full --force bake takes.
CORE_TRIM = 0.025


def core_span(path):
    """The columns holding the middle of the frame's ink, in image pixels.

    This is what a fighter is WIDE, as opposed to how far their drawing
    reaches. None if the frame is fully clear."""
    small, scale, bbox = _mask(path)
    if bbox is None:
        return None
    w, h = small.size
    cols = [0.0] * w
    for i, weight in enumerate(small.getdata()):
        if weight:
            cols[i % w] += weight
    total = sum(cols)
    if total <= 0:
        return None
    cut = total * CORE_TRIM
    run = 0.0
    left = 0
    for x, mass in enumerate(cols):
        run += mass
        if run >= cut:
            left = x
            break
    run = 0.0
    right = w - 1
    for x in range(w - 1, -1, -1):
        run += cols[x]
        if run >= cut:
            right = x
            break
    if right <= left:
        return (round(bbox[0], 1), round(bbox[2], 1))
    return (round(left * scale, 1), round((right + 1) * scale, 1))


def band_centroid(path, top_frac):
    """Centroid of the opaque pixels in the top `top_frac` of the artwork."""
    small, scale, bbox = _mask(path)
    if bbox is None:
        return None
    w, h = small.size
    # measured against the ART's extent, not the image's — the frames carry
    # large transparent margins and a fraction of those would miss the body
    top = bbox[1] / scale
    height = (bbox[3] - bbox[1]) / scale
    cutoff = top + height * top_frac
    total = sx = sy = 0.0
    for i, weight in enumerate(small.getdata()):
        y = i // w
        if weight and y <= cutoff:
            total += weight
            sx += (i % w) * weight
            sy += y * weight
    if total == 0:
        return None
    return (round((sx / total + 0.5) * scale, 1),
            round((sy / total + 0.5) * scale, 1))


# How far ABOVE the silhouette centroid the real centre of mass sits, as a
# fraction of the character's own height (bodyTop to the foot line).
#
# The silhouette centroid assumes uniform density, and a human is not uniform.
# Legs are about a third of body mass but occupy far more than a third of a
# standing silhouette's area, so the area centroid is dragged below the point a
# body actually pivots about — which is the midsection, a little above the
# navel. The gap is not a per-pose accident but a property of the assumption,
# so it is corrected here rather than by hand on every frame.
#
# 0.065 is measured, not guessed: it is the least-squares fit across the 28
# Gojo frames whose centre of mass was placed by hand in the workbench. Against
# those, it halves the error of the raw centroid (26 px RMS against 55 px), and
# it beat both a flat anatomical fraction and every blend of the two. The
# hand-placed points land at 0.570 +/- 0.053 of body height above the feet,
# which is the textbook figure for a standing human — so the correction agrees
# with anatomy as well as with the measurements.
#
# The lift is deliberately a nudge to a measured value rather than a
# replacement for it: the centroid still carries the pose (a curled roll, a
# lunge, a sprawl), and a flat fraction throws that away.
COM_LIFT_FRAC = 0.065


def com_point(path, meta):
    """Centre of mass in the image's own pixels: the silhouette centroid,
    raised out of the legs and into the midsection. Falls back to the plain
    centroid when the frame has no body span to measure the lift against."""
    point = centroid(path)
    if point is None:
        return None
    # The caller measures bodyTop just before this, so read it rather than
    # re-thresholding the image a third time.
    top = meta.get("bodyTop")
    if top is None:
        top = body_top(path)
    foot = meta.get("bodyBottom")
    if top is None or foot is None:
        return point
    # bodyBottom is in CELL space and bodyTop in the image's own pixels, so the
    # foot line has to come back to image space before the two can be spanned.
    body_h = (foot - meta.get("oy", 0)) - top
    if body_h <= 0:
        return point
    return (point[0], round(point[1] - body_h * COM_LIFT_FRAC, 1))


def centroid(path):
    """Centroid of the opaque body, in the image's own pixels. None if empty."""
    small, scale, _ = _mask(path)

    w, h = small.size
    data = small.getdata()
    total = 0.0
    sx = 0.0
    sy = 0.0
    for i, weight in enumerate(data):
        if weight:
            total += weight
            sx += (i % w) * weight
            sy += (i // w) * weight
    if total == 0:
        return None
    # +0.5 moves from cell index to cell centre before scaling back up
    return (round((sx / total + 0.5) * scale, 1),
            round((sy / total + 0.5) * scale, 1))


# What a measurement writes, and therefore what has to travel with the image.
# A subset of VARIANT_PLACEMENT in src/sprites.js — the fields this tool sets.
MEASURED = ["anchors", "bodyTop", "bodyLeft", "bodyRight", "coreLeft", "coreRight"]


def bank_onto_selected(man, targets):
    """Copy what was measured onto the variant option the pose is pointing at."""
    n = 0
    for char in targets:
        for pose, entry in ((man.get("variants") or {}).get(char, {})).items():
            meta = man["characters"].get(char, {}).get(pose)
            if not meta:
                continue
            option = next((o for o in entry["options"] if o["file"] == meta.get("file")), None)
            if option is None:
                continue
            for field in MEASURED:
                if field in meta and option.get(field) != meta[field]:
                    option[field] = meta[field]
                    n += 1
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", help="limit to these character keys")
    ap.add_argument("--force", action="store_true",
                    help="overwrite anchors that were placed by hand")
    ap.add_argument("--spans-only", action="store_true",
                    help="re-measure bodyLeft/Right and coreLeft/Right only")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    man = json.load(open(MANIFEST))
    chars = man["characters"]
    targets = args.only or sorted(chars)

    wrote, kept, missing = 0, 0, []
    for char in targets:
        frames = chars.get(char)
        if frames is None:
            missing.append(f"unknown character '{char}'")
            continue
        for key, meta in sorted(frames.items()):
            anchors = meta.get("anchors") or {}
            wanted = {} if args.spans_only else {"com": None}
            if not args.spans_only:
                wanted.update(EXTRA.get(key, {}))

            path = os.path.join(SPRITES, meta["file"])
            todo = [n for n in wanted if n not in anchors or args.force]
            need_top = not args.spans_only and ("bodyTop" not in meta or args.force)
            need_span = (args.spans_only or args.force
                         or "bodyLeft" not in meta or "bodyRight" not in meta
                         or "coreLeft" not in meta or "coreRight" not in meta)
            if not todo and not need_top and not need_span:
                kept += len(wanted)
                continue
            if not os.path.exists(path):
                missing.append(f"{char}/{key}: {meta['file']} not on disk")
                continue

            if need_top:
                top = body_top(path)
                if top is None:
                    missing.append(f"{char}/{key}.bodyTop: nothing opaque to measure")
                else:
                    before = meta.get("bodyTop")
                    meta["bodyTop"] = top
                    wrote += 1
                    print(f"  {char}/{key}.bodyTop: {before} -> {top}")

            if need_span:
                span = body_span(path)
                if span is None:
                    missing.append(f"{char}/{key}.bodySpan: nothing opaque to measure")
                else:
                    before = (meta.get("bodyLeft"), meta.get("bodyRight"))
                    meta["bodyLeft"], meta["bodyRight"] = span
                    core = core_span(path) or span
                    meta["coreLeft"], meta["coreRight"] = core
                    wrote += 1
                    print(f"  {char}/{key}.bodySpan: {before} -> {span} core {core}")

            kept += len(wanted) - len(todo)
            for name in todo:
                rule = wanted[name]
                point = (band_centroid(path, rule["band"]) if rule and "band" in rule
                         else com_point(path, meta))
                if point is None:
                    missing.append(f"{char}/{key}.{name}: nothing opaque to measure")
                    continue
                before = anchors.get(name)
                meta.setdefault("anchors", {})[name] = list(point)
                anchors = meta["anchors"]
                wrote += 1
                print(f"  {char}/{key}.{name}: {before} -> {list(point)}")

    # A measurement is a fact about the DRAWING, so it has to land on the variant
    # option too, not only on the pose that currently mirrors it. Without this a
    # chevron round-trip in the workbench would drop everything measured here:
    # switching away banks the pose's fields onto the outgoing option, but the
    # option seeded before this ran has no anchors to bank back from.
    banked = bank_onto_selected(man, targets)

    for line in missing:
        print("  SKIP " + line)
    print(f"{wrote} measured, {kept} kept (already placed), {len(missing)} skipped"
          + (f", {banked} banked onto the drawing" if banked else ""))

    if args.dry_run:
        print("(dry run — manifest not written)")
        return
    if wrote or banked:
        json.dump(man, open(MANIFEST, "w"), indent=1)
        print("manifest updated")


if __name__ == "__main__":
    main()
