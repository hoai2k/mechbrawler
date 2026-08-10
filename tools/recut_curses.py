#!/usr/bin/env python3
"""Re-cut Geto's cursed spirits and rainbow dragon out of his delivered art.

Supersedes the first pass in `extract_curses.py`, which cut fixed rectangles out
of the round-6 art. Three things were wrong with the result, and all three are
properties of cutting a rectangle rather than a creature:

  * **Clipping.** A box tight enough to exclude a neighbour also sliced limbs off
    its own occupant — curse_b lost an arm to the right edge, curse_d a foot to
    the bottom.
  * **Purple everywhere.** The spirits are joined to Geto's hand by purple energy
    trails, so every cut-out dragged a comet tail behind it, and the keyed edge
    kept a violet rim all the way round. The game draws its own purple aura under
    these; a second one baked into the sprite reads as a smear.
  * **A stray hand.** The dragon's crop reached far enough left to take Geto's
    outstretched hand and sleeve with it.

The fix is to cut by CONTENT. Removing the purple first is what makes that
possible: the trails are the only thing joining the four spirits to each other
and to Geto, so once they are gone, connected-component labelling isolates each
creature by itself — complete, and with nothing of its neighbours.

Purple is identified by hue, not by a hand-drawn region. The trails sit at hue
~280 deg with saturation ~0.93; every creature's body is hue 6-56 deg with
saturation at most 0.6, and none of them comes close. The window below has room
on both sides of that gap.

Usage:
  python3 tools/recut_curses.py --preview      # before/after sheets, writes nothing
  python3 tools/recut_curses.py                # writes assets/sprites/effects/
"""

import argparse
import os
import tempfile

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

import dekey_fringe

HERE = os.path.dirname(os.path.abspath(__file__))
SPRITES = os.path.join(HERE, "..", "assets", "sprites")
OUT = os.path.join(SPRITES, "effects")
PREVIEW = os.path.join(HERE, "..", "assets", "reference", "curse_recut")

# Hue window (degrees) and minimum saturation for the cursed-energy trails. The
# measured gap is 56 deg (creature max) to 279 deg (trail), so this is nowhere
# near either edge of it.
PURPLE_HUE = (248, 330)
PURPLE_SAT = 0.45

# A pixel this opaque counts as content. The source keying is 1-bit, so this is
# only guarding against stray specks.
SOLID = 60

# Fragments this size or smaller are re-attached to a creature if they sit within
# MERGE_GAP px of it — a claw or a tooth cut off by a trail crossing it.
FRAGMENT_MAX = 4000
MERGE_GAP = 14

# Seed points: one pixel known to be inside each creature, in source pixels.
# A seed is stabler than a bounding box — it says "this creature", and the
# component finds its own extent, so nothing has to be re-measured when the art
# is redelivered at a slightly different position.
SPIRITS = [
    ("curse_a", "specialSide", (1150, 160)),   # pink bat with the halo
    ("curse_b", "specialSide", (930, 300)),    # green, two eyestalks, long tongue
    ("curse_c", "specialSide", (800, 520)),    # small grey cyclops
    ("curse_d", "specialSide", (1200, 500)),   # brown shaggy cyclops
]

# curse_b's far arm has no hand IN THE SOURCE. The artist drew it reaching into
# the cursed-energy trail and painted the trail over the top, opaquely — checked
# at every saturation threshold from 0.45 to 0.88, and no green ever appears
# under the purple. So there is nothing to recover, and the arm ends in a blunt
# stub wherever the trail is cut away.
#
# What it does have is its OWN other hand, in the clear on the near side. That
# one is mirrored, turned to the far arm's angle and tucked under the forearm,
# which is a graft rather than a redraw — it is the creature's own anatomy, at
# its own scale, in its own palette and line weight.
#
# Composited BEHIND the creature so the forearm covers the wrist: the join is
# then hidden by art that was already there, rather than by a blend that has to
# be got exactly right.
GRAFT = {
    "spirit": "curse_b",
    "hand_box": (1074, 277, 1128, 331),   # the near hand, wrist ring excluded
    "wrist": (1076, 309),                 # where it meets the forearm
    "target": (842, 280),                 # a few px inside the far arm's stub
    "rotate": 20,                         # far arm sits ~20 deg above the near one
    "scale": 0.95,                        # foreshortened slightly, being further away
}

# Geto's outstretched hand, and the burst of pink and yellow glow around his
# fingertips where the dragon is pouring out.
#
# The hand is also the BRIDGE: Geto and the dragon are one connected blob in the
# source, joined through that glow, so no amount of component labelling separates
# them until the hand itself is cut. Once it is, they fall apart into two
# components and the dragon can be taken whole.
DRAGON = {
    "name": "curse_dragon",
    "src": "specialNeutral",
    # Around the reaching hand and its sleeve cuff. Measured, not guessed: the
    # skin blob sits at x469-553 y289-350 and the cuff runs up to x485.
    "hand_box": (400, 240, 640, 400),
    # The glow burst, centred on the fingertips. Faded rather than cut, over a
    # radius small enough to leave the dragon's tail alone — the tail passes
    # close, and a hard edge here would read as a bite taken out of it.
    "hand_seed": (510, 320),               # inside the reaching hand
    "burst": (560, 320, 95),               # cx, cy, radius
    "seed": (1150, 300),                  # inside the dragon's head
}


def load(name):
    p = os.path.join(SPRITES, "geto", f"{name}.png")
    return np.asarray(Image.open(p).convert("RGBA")).astype(np.int16)


def hsv(rgba):
    """Hue in degrees, saturation and value as 0..1 planes."""
    rgb = rgba[:, :, :3].astype(np.float32) / 255.0
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    mx, mn = rgb.max(2), rgb.min(2)
    d = mx - mn + 1e-6
    h = np.zeros_like(r)
    m = mx == r; h[m] = ((g - b)[m] / d[m]) % 6
    m = mx == g; h[m] = ((b - r)[m] / d[m]) + 2
    m = mx == b; h[m] = ((r - g)[m] / d[m]) + 4
    return h * 60, np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0), mx


def purple_mask(rgba):
    h, s, _ = hsv(rgba)
    lo, hi = PURPLE_HUE
    return (h > lo) & (h < hi) & (s > PURPLE_SAT) & (rgba[:, :, 3] > 0)


def despill(rgba, mask):
    """Take the violet cast off the pixels the trail was touching. A keyed edge
    keeps a rim of whatever it was drawn against; here that is cursed energy, so
    the rim is purple and survives any amount of erosion. Pulling the blue and
    red channels down to the green neighbour they sit against removes the cast
    without moving the silhouette."""
    out = rgba.copy()
    edge = ndimage.binary_dilation(mask, np.ones((5, 5), bool)) & ~mask & (rgba[:, :, 3] > 0)
    r, g, b = out[:, :, 0], out[:, :, 1], out[:, :, 2]
    # A purple cast means both R and B run ahead of G. Clamp them to G plus the
    # headroom a natural colour would have, which leaves warm skin and brown fur
    # untouched — their red leads for a reason.
    cast = edge & (b > g) & (r > g)
    lim = np.minimum(255, g + 24)
    r[cast] = np.minimum(r[cast], lim[cast] + 40)
    b[cast] = np.minimum(b[cast], lim[cast])
    return out


def feather(alpha, radius=1.0):
    """The source keying is 1-bit, so every silhouette is a staircase. One pass
    of a small blur, re-thresholded to keep the shape, gives the edge a soft
    pixel to sit on — which is what stops a projectile shimmering as it moves."""
    a = ndimage.gaussian_filter(alpha.astype(np.float32), radius)
    a = np.where(alpha > 0, np.maximum(a, 90), a)      # never thin the interior
    return np.clip(a, 0, 255).astype(np.uint8)


def component_at(keep, seed):
    """The connected blob containing a seed point, plus any small fragment close
    enough to be part of the same creature."""
    lab, _ = ndimage.label(keep, structure=np.ones((3, 3), np.int8))
    sx, sy = seed
    idx = lab[sy, sx]
    if idx == 0:
        # The seed landed on a removed pixel; take the nearest labelled blob.
        ys, xs = np.nonzero(lab)
        d = (xs - sx) ** 2 + (ys - sy) ** 2
        idx = lab[ys[d.argmin()], xs[d.argmin()]]
    main = lab == idx
    grown = ndimage.binary_dilation(main, np.ones((MERGE_GAP, MERGE_GAP), bool))
    counts = np.bincount(lab.ravel())
    for other in np.unique(lab[grown & (lab > 0)]):
        if other != idx and counts[other] <= FRAGMENT_MAX:
            main |= lab == other
    return main


def trim(rgba):
    ys, xs = np.nonzero(rgba[:, :, 3] > 8)
    return rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def dekey(rgba):
    """Run the roster's own de-fringe over a cut sprite.

    The spirits are cut from art that was keyed off a magenta screen, so every
    silhouette carries the usual pink rim — including the near hand, which is
    then mirrored onto the far arm and brings its rim along. dekey_fringe.py
    already solves exactly this, judging each edge pixel against the nearest
    clean one rather than against a fixed threshold, so it is used rather than
    reimplemented.

    It has to run BEFORE the feather: it refuses art whose alpha is mostly soft,
    on the reasonable grounds that soft alpha means it is not looking at a keyed
    edge. Via a temp file because that is the interface it exposes; the cost is
    one write of a 300x200 PNG."""
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "cut.png")
        Image.fromarray(rgba).save(path)
        try:
            dropped, fixed = dekey_fringe.defringe(path, "magenta")
            if dropped or fixed:
                print(f"      de-fringed: {dropped} dropped, {fixed} recoloured")
        except dekey_fringe.Soft as e:
            print(f"      de-fringe skipped: alpha too soft ({e})")
        return np.asarray(Image.open(path).convert("RGBA"))


def graft_hand(out):
    """Mirror curse_b's near hand onto its far arm. Works in source pixels on the
    un-trimmed canvas, so every number stays a source coordinate."""
    # Resample PREMULTIPLIED. A transparent pixel still carries a colour, and
    # scaling or rotating blends it into the visible edge — which is where a
    # halo comes from. Multiplying by alpha first means transparent pixels
    # contribute nothing, and the division afterwards restores the colour.
    src = out.astype(np.float32)
    a = src[:, :, 3:4] / 255.0
    src[:, :, :3] *= a
    im = Image.fromarray(src.astype(np.uint8))

    x0, y0, x1, y1 = GRAFT["hand_box"]
    patch = im.crop((x0, y0, x1, y1)).transpose(Image.FLIP_LEFT_RIGHT)
    wx = patch.width - (GRAFT["wrist"][0] - x0)
    wy = GRAFT["wrist"][1] - y0

    scale = GRAFT["scale"]
    if scale != 1:
        patch = patch.resize((round(patch.width * scale), round(patch.height * scale)), Image.LANCZOS)
        wx *= scale
        wy *= scale
    rot = GRAFT["rotate"]
    if rot:
        bw, bh = patch.size
        patch = patch.rotate(rot, resample=Image.BICUBIC, expand=True)
        th = np.deg2rad(rot)
        dx, dy = wx - bw / 2, wy - bh / 2
        wx = dx * np.cos(th) + dy * np.sin(th) + patch.width / 2
        wy = -dx * np.sin(th) + dy * np.cos(th) + patch.height / 2

    # Re-harden the alpha. Resampling twice — LANCZOS to scale, BICUBIC to
    # rotate — leaves the fingers semi-transparent, because they are only three
    # pixels across and every filter pass eats into a structure that thin. The
    # result reads as a ghost hand beside a solid creature. Threshold it back to
    # a hard silhouette here; the one deliberate feather pass at the end of the
    # cut then softens it exactly as much as everything else.
    pa = np.asarray(patch).astype(np.float32)
    solid = pa[:, :, 3] > 110
    # Un-premultiply, then threshold back to a hard silhouette.
    with np.errstate(divide="ignore", invalid="ignore"):
        pa[:, :, :3] = np.where(pa[:, :, 3:4] > 0, pa[:, :, :3] * 255.0 / np.maximum(pa[:, :, 3:4], 1), 0)
    pa[:, :, 3] = np.where(solid, 255, 0)
    # A transparent pixel still carries a colour, and the feather at the end of
    # the cut raises some of them back above zero — which is how a magenta rim
    # reappears on art that was already cleaned. Clear the colour too, so there
    # is nothing left to resurrect.
    pa[~solid] = 0
    patch = Image.fromarray(np.clip(pa, 0, 255).astype(np.uint8))

    tx, ty = GRAFT["target"]
    layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
    layer.paste(patch, (round(tx - wx), round(ty - wy)))
    return np.asarray(Image.alpha_composite(layer, im)).astype(np.int16)


def cut_spirit(src, seed, name=None):
    rgba = load(src)
    mask = purple_mask(rgba)
    body = despill(rgba, mask)
    body[mask] = 0
    keep = component_at((body[:, :, 3] > SOLID), seed)
    out = body.copy()
    out[~keep] = 0
    # Clamp to the creature BEFORE grafting: the graft is deliberately outside
    # the component, so doing it the other way round would erase the new hand.
    out[~ndimage.binary_dilation(keep, np.ones((3, 3), bool))] = 0
    if name == GRAFT["spirit"]:
        out = graft_hand(out)
    out = dekey(trim(out.astype(np.uint8))).astype(np.int16)
    # Same guard, now for the whole sprite: nothing transparent keeps a colour,
    # so the feather below can only soften art that is actually there.
    out[out[:, :, 3] == 0] = 0
    out[:, :, 3] = feather(out[:, :, 3])
    return out.astype(np.uint8)


def cut_dragon():
    rgba = load(DRAGON["src"])
    out = rgba.copy()

    # Geto's hand and sleeve: skin is a warm mid-tone, the sleeve is near-black,
    # and both are only removed inside the box around them, so the dragon's own
    # warm scales and dark outlines elsewhere are untouched.
    x0, y0, x1, y1 = DRAGON["hand_box"]
    h, s, v = hsv(rgba)
    region = np.zeros(rgba.shape[:2], bool)
    region[y0:y1, x0:x1] = True
    skin = region & (h > 15) & (h < 50) & (s > 0.10) & (s < 0.55) & (v > 0.55)
    sleeve = region & (v < 0.32)
    # Only the blobs that are actually the hand and the sleeve it grows out of —
    # the hand's own component, plus anything running off the left edge of the
    # box, which is the arm. Colour-matching the whole box instead takes bites
    # out of the dragon's tail wherever a scale happens to be warm or dark.
    lab, _ = ndimage.label(skin | sleeve, np.ones((3, 3), np.int8))
    hx, hy = DRAGON["hand_seed"]
    wanted = {lab[hy, hx]}
    wanted |= set(np.unique(lab[y0:y1, x0:x0 + 2]))
    wanted.discard(0)
    hand = np.isin(lab, list(wanted))
    hand = ndimage.binary_dilation(hand, np.ones((5, 5), bool)) & region
    out[hand] = 0

    # Dissolve the burst the hand was sitting in, as a disc rather than a column:
    # the dragon's tail passes within a few dozen pixels of the fingertips, and
    # anything wider takes the tail with it.
    cx, cy, rad = DRAGON["burst"]
    yy, xx = np.ogrid[:rgba.shape[0], :rgba.shape[1]]
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / float(rad)
    ramp = np.clip(dist, 0, 1)
    ramp = ramp * ramp * (3 - 2 * ramp)                     # smoothstep
    out[:, :, 3] = (out[:, :, 3] * ramp).astype(np.int16)

    # Cutting the hand is what separates Geto from the dragon; before it they are
    # a single blob joined through the glow.
    keep = component_at(out[:, :, 3] > SOLID, DRAGON["seed"])
    out[~keep] = 0
    out[:, :, 3] = feather(out[:, :, 3])
    out[~ndimage.binary_dilation(keep, np.ones((3, 3), bool))] = 0
    return trim(out.astype(np.uint8))


# Three views per sprite, because each shows a different failure. Mid-grey shows
# a violet rim; white shows holes and dark fringe; the game's own aura colour
# shows whether the sprite still reads once the engine draws purple under it,
# which is the whole reason for taking the baked-in purple out.
VIEWS = [("on grey", (86, 88, 104)), ("on white", (238, 240, 246)), ("on the game aura", (77, 52, 128))]


def board(rows, path, cell=300):
    head = 42
    cols = 1 + len(VIEWS)                     # before, then the after views
    img = Image.new("RGB", (cell * cols + 14 * cols + 10, (cell + head) * len(rows) + 10), (30, 32, 42))
    d = ImageDraw.Draw(img)
    for i, (name, before, after) in enumerate(rows):
        y = i * (cell + head) + 8
        d.text((12, y), f"{name}    before {before.size[0]}x{before.size[1]}"
                        f"    after {after.size[0]}x{after.size[1]}", fill=(235, 238, 248))
        panels = [("BEFORE (on grey)", before, (86, 88, 104))]
        panels += [(f"AFTER {label}", after, bg) for label, bg in VIEWS]
        for j, (label, im, bg) in enumerate(panels):
            box = im.copy()
            box.thumbnail((cell - 16, cell - 16))
            tile = Image.new("RGB", (cell, cell), bg)
            tile.paste(box, ((cell - box.width) // 2, (cell - box.height) // 2), box)
            x = 12 + j * (cell + 14)
            img.paste(tile, (x, y + head - 4))
            d.text((x, y + 20), label, fill=(150, 158, 180))
    img.save(path)
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", action="store_true")
    args = ap.parse_args()

    rows = []
    for name, src, seed in SPIRITS:
        after = Image.fromarray(cut_spirit(src, seed, name))
        before = Image.open(os.path.join(OUT, f"{name}.png")).convert("RGBA")
        rows.append((name, before, after))
        print(f"  {name}: {before.size[0]}x{before.size[1]} -> {after.size[0]}x{after.size[1]}")
        if not args.preview:
            after.save(os.path.join(OUT, f"{name}.png"))

    after = Image.fromarray(cut_dragon())
    before = Image.open(os.path.join(OUT, "curse_dragon.png")).convert("RGBA")
    rows.append(("curse_dragon", before, after))
    print(f"  curse_dragon: {before.size[0]}x{before.size[1]} -> {after.size[0]}x{after.size[1]}")
    if not args.preview:
        after.save(os.path.join(OUT, "curse_dragon.png"))

    os.makedirs(PREVIEW, exist_ok=True)
    print("  " + board(rows[:4], os.path.join(PREVIEW, "spirits.png")))
    print("  " + board(rows[4:], os.path.join(PREVIEW, "dragon.png")))
    if args.preview:
        print("  preview only — assets/sprites/effects/ untouched")


if __name__ == "__main__":
    main()
