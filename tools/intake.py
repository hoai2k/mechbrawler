#!/usr/bin/env python3
"""Process delivered art in `assets/intake/` — key, straighten, measure, report.

Nothing here touches `assets/sprites/` or the manifest. Intake exists so a
delivery can be judged BEFORE it reaches the game, because past rounds fixed
one problem while introducing another: a corrected costume at half the
resolution, a corrected pose facing the wrong way, art keyed off green that
left a halo on every hair edge.

Processed copies land in `assets/intake/_processed/`, which
`intake_sheets.py` renders as before/after boards. Import is a separate,
later step, run only on the frames a human approved.

  --report     measure and print, write nothing
  --chars      limit to some characters

Usage:
  python3 intake.py
  python3 intake.py --report
  python3 intake.py --chars panda,sukuna
"""

import argparse
import json
import os
import re
import subprocess

import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage

from process_round5_sprites import border_key
import sprite_facing as sf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
INTAKE = os.path.join(ROOT, "assets", "intake")
PROCESSED = os.path.join(INTAKE, "_processed")
SPRITES = os.path.join(ROOT, "assets", "sprites")

SHEET_CELL = re.compile(r"^r\d+c\d+$")
# Body size below which the art is softer than what it replaces. The sheet
# frames it competes with sit at 256-296px; round-5 art came in at 674-700.
#
# Measured on the figure's LONGEST axis, not its height. Resolution is a
# property of how big the drawing is, and a pose drawn lying down carries it
# across the frame instead of up it — `prone` arrives about 939x208, which is a
# perfectly sharp figure and was being flagged as low-res on every fighter in
# the round that introduced the pose. For anything standing the long axis is
# the height, so this changes nothing about the case it was written for.
MIN_BODY_H = 520
# Below this, `detect_facing` is not saying anything useful — it measured ~83%
# on known-good data and near zero here — so the call goes to a human instead.
FACING_CONFIDENT = 0.12


def anim_map_all():
    """Resolve every character's animation map through the GAME's own module.

    Parsed with node rather than a regex: the Python version silently reported
    stale frames after a comment was added to characters.js, which is exactly
    the class of error this whole pipeline exists to catch.
    """
    js = """
    import {CHARACTERS, DEFAULT_ANIMS} from './src/characters.js';
    const out = {};
    for (const [k, c] of Object.entries(CHARACTERS)) {
      const a = {...DEFAULT_ANIMS, ...(c.anims || {})};
      out[k] = Object.fromEntries(Object.entries(a).map(([s, v]) => [s, v.frames]));
    }
    process.stdout.write(JSON.stringify(out));
    """
    r = subprocess.run(["node", "--input-type=module", "-e", js],
                       cwd=ROOT, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr.strip())
    return json.loads(r.stdout)


def key_to_states(anims, char, key):
    """Which animation states this delivered frame will drive."""
    a = anims.get(char, {})
    if SHEET_CELL.match(key):
        return [s for s, fs in a.items() if key in fs]
    if key in a:                       # a semantic frame the manifest already has
        states = [s for s, fs in a.items() if key in fs]
        return states or [key]
    return [key]                       # brand new (dodge_roll / dodge_air)


def current_frames_for(anims, man, char, key):
    """The frame keys a reviewer should compare the new art against."""
    if SHEET_CELL.match(key) or key in man["characters"].get(char, {}):
        return [key]
    # A new state: show whatever that state plays today.
    a = anims.get(char, {})
    if key in a:
        return a[key]
    if key.startswith("dodge"):
        return a.get("dodge", [])
    return []


# ---------------------------------------------------------------- keying

def key_and_trim(path):
    """Key the delivered background out and trim to content.

    Reuses the round-5 routine's border sampling, then decontaminates the
    silhouette edge so no key colour survives on a dark stage.
    """
    rgb = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
    if np.asarray(Image.open(path).convert("RGBA"))[:, :, 3].min() < 250:
        rgba = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
        rgb, alpha = rgba[:, :, :3], rgba[:, :, 3] / 255.0
        key = None
    else:
        key = border_key(rgb)
        r, g, b = np.moveaxis(rgb, 2, 0)
        if key[0] > 180 and key[2] > 180 and key[1] < 100:          # magenta
            cand = (r > 145) & (b > 145) & ((np.minimum(r, b) - g) > 70)
        elif key[1] > 120 and key[1] > key[0] + 25 and key[1] > key[2] + 25:  # green
            cand = (g > key[1] - 60) & (g > r + 25) & (g > b + 25)
        else:                                                        # flat neutral
            cand = np.linalg.norm(rgb - key, axis=2) < 30
        seed = np.zeros(cand.shape, bool)
        seed[[0, -1], :] = cand[[0, -1], :]
        seed[:, [0, -1]] |= cand[:, [0, -1]]
        background = ndimage.binary_propagation(seed, mask=cand)
        # Background sealed inside the silhouette — between an arm and the
        # body, inside a robe, through the gap in a curl of hair — never
        # touches the canvas border, so the flood fill above cannot reach it.
        # Only UNMISTAKABLE key colour qualifies here, which leaves Geto's pink
        # curse and Hanami's blossoms alone; anything softer is judged by eye
        # on the intake board instead.
        if key[0] > 180 and key[2] > 180 and key[1] < 100:
            background |= (r > 190) & (b > 190) & (g < 85) & ((np.minimum(r, b) - g) > 115)
        elif key[1] > 120 and key[1] > key[0] + 25 and key[1] > key[2] + 25:
            background |= (g > 170) & (r < 120) & (b < 120) & ((g - np.maximum(r, b)) > 90)
        alpha = (~background).astype(np.float32)
        soft = ndimage.binary_dilation(background, iterations=2) & ~background
        d = np.linalg.norm(rgb - key, axis=2)
        alpha[soft] = np.clip((d[soft] - 6.0) / 24.0, 0.0, 1.0)

    clean = rgb.copy()
    edge = (alpha > 0.0) & (alpha < 1.0)
    if key is not None and edge.any():
        a = alpha[edge, None]
        clean[edge] = np.clip((rgb[edge] - (1.0 - a) * key) / a, 0, 255)
    alpha[alpha >= 48 / 255] = 1.0

    if key is not None:
        alpha[flat_key_mask(clean, alpha, key)] = 0.0

    vis = alpha >= 8 / 255
    ys, xs = np.nonzero(vis)
    if not len(xs):
        return None, None, None
    rgba = np.dstack((clean.astype(np.uint8), np.rint(alpha * 255).astype(np.uint8)))
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    return rgba[box[1]:box[3], box[0]:box[2]], box, key


# The generator fills the background with a FLAT colour, so anything still
# sitting on exactly that colour and locally uniform is background the border
# flood fill could not reach — sealed inside the silhouette. Art over the same
# colour carries lineart, shading and texture, which the variance test sees.
def flat_key_mask(rgb, alpha, key, tol=14, max_var=9, min_px=250):
    opaque = alpha > 0.5
    dist = np.linalg.norm(rgb - key, axis=2)
    luma = rgb.mean(axis=2)
    local = ndimage.uniform_filter(luma, 5)
    var = ndimage.uniform_filter(luma * luma, 5) - local * local
    cand = opaque & (dist < tol) & (var < max_var)
    lab, n = ndimage.label(cand, structure=np.ones((3, 3), np.int8))
    if not n:
        return np.zeros(opaque.shape, bool)
    counts = np.bincount(lab.ravel())
    counts[0] = 0
    return np.isin(lab, np.nonzero(counts >= min_px)[0])


# Where a translucent motion trail was drawn OVER a magenta key, the composite
# comes back pink — too blended for the strict test, too vivid to keep. The
# trail cannot be recovered, so the tinted region goes and the sprite is clean.
# NAMED FRAMES ONLY: this would also eat Geto's pink curse and Hanami's
# blossoms, which is why it is not part of the default pass.
def magenta_tint_mask(rgb, alpha, min_px=300):
    opaque = alpha > 0.5
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    cand = opaque & ((np.minimum(r, b) - g) > 40) & (r > 90) & (b > 90)
    lab, n = ndimage.label(cand, structure=np.ones((3, 3), np.int8))
    if not n:
        return np.zeros(opaque.shape, bool)
    counts = np.bincount(lab.ravel())
    counts[0] = 0
    return np.isin(lab, np.nonzero(counts >= min_px)[0])


# Frames a reviewer confirmed carry key-coloured motion trails.
TINT_FIX = {
    "gojo/dodge_air", "maki/dodge_air", "toji/dodge_air", "geto/dodge_air",
    # Same trail defect on the remaining nine characters' dodge art. Hanami is
    # deliberately absent: her blossoms are pink, so this test cannot tell her
    # art from the spill, and her trail reads as intentional anyway.
    "inumaki/dodge_air", "inumaki/dodge_roll",
    "jogo/dodge_air", "jogo/dodge_roll",
    "mahito/dodge_roll", "megumi/dodge_roll",
    "nanami/dodge_air", "nanami/dodge_roll",
    "yuta/dodge_air", "yuta/dodge_roll",
}
# The same defect on a GREY key: a translucent trail over mid-grey comes back
# as a neutral smear that no flatness test can catch, because the trail itself
# is shaded. Named frames only — "neutral mid-tone" also describes Toji's
# shirt and half the roster's shading.
GREY_TINT_FIX = {"momo/dodge_air", "momo/dodge_roll"}


def grey_tint_mask(rgb, key, alpha, min_px=400):
    opaque = alpha > 0.5
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    luma = rgb.mean(axis=2)
    cand = opaque & ((mx - mn) < 30) & (np.abs(luma - key.mean()) < 55)
    lab, n = ndimage.label(cand, structure=np.ones((3, 3), np.int8))
    if not n:
        return np.zeros(opaque.shape, bool)
    counts = np.bincount(lab.ravel())
    counts[0] = 0
    return np.isin(lab, np.nonzero(counts >= min_px)[0])
# Directories the facing rule does not apply to. A fighter is drawn facing RIGHT
# and mirrored by the engine when they turn, so art that arrives facing left is
# flipped on the way in. An **effect** is the opposite case twice over: the
# projectile renderer mirrors a travelling sprite when it flies right, so effects
# are drawn pointing LEFT (see "Directional effects point LEFT" in
# docs/asset-requests.md) — and the ones that are not travelling, like an aura or
# an impact ring, have no facing at all. Running a right-facing detector over
# either turns correct art backwards: round 15 delivered `egg_shot` pointing left
# exactly as asked and the mirror flipped it, which is silent, because a mirrored
# egg still looks like an egg.
NO_MIRROR_DIRS = {"effects"}

# Frames the facing detector called wrong, corrected by eye on the intake board.
FACING_OVERRIDE = {
    "panda/r2c0": "right",     # delivered facing right; auto-mirror flipped it
    "toji/dodge_roll": "left",  # delivered facing left, needs the mirror
    # Round 15A: five frames the detector called left with confidence and turned
    # backwards. All five were delivered facing right, and the two light strikes
    # are the reason this list exists — a mirrored punch reads as a perfectly
    # good punch until you notice it lands behind the fighter.
    "dagon/special_side": "right",
    "mechamaru/attack_light_b": "right",
    "mechamaru/attack_up": "right",
    "mechamaru/hurt": "right",
    "yuki/attack_light_b": "right",
}


# -------------------------------------------------------------- measuring

def measure(frame, box, src_shape, key=None):
    """Everything worth failing a delivery over."""
    a = frame[:, :, 3]
    rgb = frame[:, :, :3].astype(int)
    opaque = a >= 128
    h, w = a.shape

    holes = ndimage.binary_fill_holes(opaque) & ~opaque
    lab, n = ndimage.label(holes, structure=np.ones((3, 3), np.int8))
    counts = np.bincount(lab.ravel()) if n else np.array([0])
    counts[0] = 0

    # Key colour surviving on the silhouette edge. The check only means anything
    # when the plate was shot on a GREEN screen: on magenta or grey a green rim
    # is just green art, and round 15's mint-green cannon beams tripped it on
    # every pixel of their own outline. `key` is the screen colour that was keyed
    # out, so the test is "is this the screen leaking", not "is this green".
    fringe = 0
    if key is not None and key[1] > 120 and key[1] > key[0] + 25 and key[1] > key[2] + 25:
        inner = ndimage.binary_erosion(opaque, iterations=2)
        rim = opaque & ~inner
        g, r, b = rgb[:, :, 1], rgb[:, :, 0], rgb[:, :, 2]
        fringe = int((rim & (g > r + 18) & (g > b + 18)).sum())

    # clipped only if content reached the DELIVERED canvas edge
    sh, sw = src_shape[:2]
    clipped = [s for s, hit in (("left", box[0] <= 0), ("top", box[1] <= 0),
                                ("right", box[2] >= sw), ("bottom", box[3] >= sh)) if hit]
    return {
        "w": w, "h": h,
        "bodyH": h,
        "lowRes": max(w, h) < MIN_BODY_H,
        "semiTrans": int(((a > 10) & (a < 245)).sum()),
        "holes": int((counts >= 60).sum()),
        "greenFringe": fringe,
        "clipped": clipped,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chars")
    ap.add_argument("--report", action="store_true")
    args = ap.parse_args()

    anims = anim_map_all()
    man = json.load(open(os.path.join(SPRITES, "manifest.json")))
    chars = ([c.strip() for c in args.chars.split(",")] if args.chars
             else sorted(d for d in os.listdir(INTAKE)
                         if os.path.isdir(os.path.join(INTAKE, d)) and not d.startswith("_")))

    rows, flagged = [], []
    for char in chars:
        d = os.path.join(INTAKE, char)
        for name in sorted(os.listdir(d)):
            if not name.endswith(".png"):
                continue
            key_name = name[:-4]
            src = os.path.join(d, name)
            raw = np.asarray(Image.open(src).convert("RGBA"))
            frame, box, key = key_and_trim(src)
            if frame is None:
                flagged.append(f"{char}/{key_name}: EMPTY after keying")
                continue

            # Facing is decided by eye, not by the detector. It runs at ~83% on
            # known-good data and returned near-zero confidence on two thirds of
            # this delivery; auto-mirroring on a coin flip would hand back art
            # that is wrong in a way the reviewer has to undo. Only clearly
            # confident calls are acted on; everything else ships as delivered
            # and is marked on the board for a human to rule on.
            ref = f"{char}/{key_name}"
            if ref in GREY_TINT_FIX and key is not None:
                a = frame[:, :, 3] / 255.0
                frame[grey_tint_mask(frame[:, :, :3].astype(float), key, a)] = 0
                ys2, xs2 = np.nonzero(frame[:, :, 3] >= 20)
                frame = frame[ys2.min():ys2.max() + 1, xs2.min():xs2.max() + 1]
            if ref in TINT_FIX:
                a = frame[:, :, 3] / 255.0
                frame[magenta_tint_mask(frame[:, :, :3].astype(float), a)] = 0
                ys2, xs2 = np.nonzero(frame[:, :, 3] >= 20)
                frame = frame[ys2.min():ys2.max() + 1, xs2.min():xs2.max() + 1]

            facing, conf = sf.detect_facing(frame)
            if ref in FACING_OVERRIDE:          # ruled on by eye, beats the detector
                facing, conf = FACING_OVERRIDE[ref], 1.0
            mirrored = False
            if char in NO_MIRROR_DIRS:
                facing, conf = "n/a", 1.0
            elif facing == "left" and conf >= FACING_CONFIDENT:
                frame = np.asarray(ImageOps.mirror(Image.fromarray(frame)))
                mirrored = True
            unsure = conf < FACING_CONFIDENT

            m = measure(frame, box, raw.shape, key)
            m.update(char=char, key=key_name, mirrored=mirrored, facingUnsure=bool(unsure),
                     facingGuess=facing, facingConf=round(float(conf), 3),
                     states=key_to_states(anims, char, key_name))
            rows.append(m)

            notes = []
            if m["lowRes"]:
                notes.append(f"LOW-RES body {m['h']}px")
            if m["clipped"]:
                notes.append("CLIPPED " + "+".join(m["clipped"]))
            if m["greenFringe"] > 200:
                notes.append(f"green fringe {m['greenFringe']}px")
            if m["holes"]:
                notes.append(f"{m['holes']} hole(s)")
            if notes:
                flagged.append(f"{char}/{key_name}: " + ", ".join(notes))

            if not args.report:
                out = os.path.join(PROCESSED, char)
                os.makedirs(out, exist_ok=True)
                Image.fromarray(frame).save(os.path.join(out, name))

    mir = sum(1 for r in rows if r["mirrored"])
    print(f"{len(rows)} frame(s) processed, {mir} mirrored to face right")
    if flagged:
        print("\nFLAGGED:")
        for f in flagged:
            print("  " + f)
    else:
        print("no quality flags")
    if not args.report:
        # Merge rather than replace: a `--chars momo` run must not wipe the
        # other 16 characters' rows, which is what made the report claim the
        # whole delivery was six frames.
        path = os.path.join(PROCESSED, "report.json")
        merged = {}
        if os.path.exists(path):
            for r in json.load(open(path)):
                merged[(r["char"], r["key"])] = r
        for r in rows:
            merged[(r["char"], r["key"])] = r
        json.dump(sorted(merged.values(), key=lambda r: (r["char"], r["key"])),
                  open(path, "w"), indent=1)
        print(f"\nprocessed art -> {PROCESSED}")


if __name__ == "__main__":
    main()
