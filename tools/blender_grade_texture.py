"""Grade a generated texture back onto the character's canon colours.

    blender --background --python tools/blender_grade_texture.py -- \
        --in  render3d/assets/yuji/yuji.glb \
        --out render3d/assets/yuji/yuji.glb \
        --char yuji

WHY THIS EXISTS. Yuji's uniform is navy. The delivered model read as black, and
the reason turned out not to be the light rig or the toon ramp: the baked
texture is hue 226 degrees — correct navy — at 15% brightness, which is
near-black whatever you light it with. A 3D generator matches a reference
image's HUE well and its VALUE badly, because it is inferring albedo from
pictures that already have shading baked into them, and a navy garment in
shadow photographs as almost black. Every fighter will arrive with some
version of this, so it is a pipeline step and not a paint job.

WHAT IT DOES. render3d/assets/canon-palette.json declares, per fighter, the
regions of the costume that have a canon colour: how to find their pixels (a
hue / saturation / value window) and where they belong. This moves them there.

It REMAPS rather than repaints. Flooding the region with a flat colour would
throw away the folds, the creases and the ambient occlusion that make the
garment read as cloth. Instead the region's MEDIAN value is moved to the
target and every other pixel scales with it, through a soft shoulder so the
brightest folds compress instead of clipping to white; hue is set outright
(a generated hue is a guess, and the canon one is not) and saturation is
scaled toward the target while keeping each pixel's relative position. Folds
survive; the garment changes colour.

Working space is sRGB, because that is the space the palette's numbers are read
off a reference image in. For an 8-bit sRGB-tagged texture Blender hands the
stored values straight back — measured, not assumed: texel bytes (6, 9, 18)
arrive as (0.0235, 0.0353, 0.0706) — so no conversion is wanted, and doing one
anyway silently doubles the encoding and makes every reported value wrong. A
float or Non-Color image is linear and IS converted; `needs_decode` decides.

It touches the base-colour image only. Geometry, skinning, actions and
materials come through untouched, so it is safe to run on an already-animated,
already-approved delivery.
"""

import argparse
import json
import os
import sys

import bpy
import numpy as np

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PALETTE = os.path.join(REPO, "render3d", "assets", "canon-palette.json")


# ----------------------------------------------------------------- colour bits
#
# sRGB <-> linear, and RGB <-> HSV, vectorised over the whole image. The naive
# per-pixel loop is ~30 seconds on a 2048 square; this is well under one.

def to_srgb(x):
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(np.maximum(x, 0), 1 / 2.4) - 0.055)


def to_linear(x):
    return np.where(x <= 0.04045, x / 12.92, np.power((np.maximum(x, 0) + 0.055) / 1.055, 2.4))


def rgb_to_hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = np.max(rgb, axis=-1)
    mn = np.min(rgb, axis=-1)
    d = mx - mn
    h = np.zeros_like(mx)
    safe = d > 1e-9
    idx = safe & (mx == r)
    h[idx] = ((g - b)[idx] / d[idx]) % 6
    idx = safe & (mx == g)
    h[idx] = ((b - r)[idx] / d[idx]) + 2
    idx = safe & (mx == b)
    h[idx] = ((r - g)[idx] / d[idx]) + 4
    h = h * 60.0
    s = np.where(mx > 1e-9, d / np.maximum(mx, 1e-9), 0.0)
    return h, s, mx


def hsv_to_rgb(h, s, v):
    h = np.mod(h, 360.0) / 60.0
    i = np.floor(h).astype(np.int32)
    f = h - i
    p = v * (1 - s)
    q = v * (1 - s * f)
    t = v * (1 - s * (1 - f))
    i = i % 6
    r = np.select([i == 0, i == 1, i == 2, i == 3, i == 4, i == 5], [v, q, p, p, t, v])
    g = np.select([i == 0, i == 1, i == 2, i == 3, i == 4, i == 5], [t, v, v, q, p, p])
    b = np.select([i == 0, i == 1, i == 2, i == 3, i == 4, i == 5], [p, p, t, v, v, q])
    return np.stack([r, g, b], axis=-1)


def soft_clip(v, knee=0.75):
    """Scale values into [0,1] with a shoulder above `knee`, so a region lifted
    hard keeps its brightest folds distinct instead of clipping them flat."""
    out = np.array(v, dtype=np.float64)
    hi = out > knee
    out[hi] = knee + (1 - knee) * np.tanh((out[hi] - knee) / (1 - knee))
    return np.clip(out, 0.0, 1.0)


# ------------------------------------------------------------------- the pass

BLOCK = 32


def _solid_only(sel, shape, fill):
    """Drop matched pixels that are not part of a broad matched area."""
    hgt, wid = shape
    flat = sel.reshape(hgt, wid)
    ph = (-hgt) % BLOCK
    pw = (-wid) % BLOCK
    pad = np.pad(flat, ((0, ph), (0, pw)), constant_values=False)
    bh, bw = pad.shape[0] // BLOCK, pad.shape[1] // BLOCK
    dens = pad.reshape(bh, BLOCK, bw, BLOCK).mean(axis=(1, 3))
    keep = dens >= fill
    # Grow by one block so the region's own boundary blocks, which are only
    # part-covered by construction, are not left as an un-graded rim.
    grown = keep.copy()
    grown[1:, :] |= keep[:-1, :]
    grown[:-1, :] |= keep[1:, :]
    grown[:, 1:] |= keep[:, :-1]
    grown[:, :-1] |= keep[:, 1:]
    mask = np.repeat(np.repeat(grown, BLOCK, axis=0), BLOCK, axis=1)[:hgt, :wid]
    return (flat & mask).reshape(-1)


def grade_region(h, s, v, region, report, shape=None):
    """Move one declared region onto its canon colour, in place. Returns the
    number of pixels moved."""
    m = region["match"]
    sel = np.ones(h.shape, dtype=bool)
    if m.get("hue"):
        lo, hi = m["hue"]
        sel &= (h >= lo) & (h <= hi) if lo <= hi else ((h >= lo) | (h <= hi))
    if m.get("sat"):
        sel &= (s >= m["sat"][0]) & (s <= m["sat"][1])
    if m.get("val"):
        sel &= (v >= m["val"][0]) & (v <= m["val"][1])

    # SOLID REGIONS ONLY. A colour window alone cannot tell a garment from a
    # coincidence: "neutral and bright" is the trainers, and it is also the
    # WHITES OF HIS EYES, which duly turned red the first time this ran. What
    # separates them is not colour, it is area — a costume covers a contiguous
    # patch of the atlas, a highlight is a speck. So a matched pixel is kept
    # only if its neighbourhood is mostly matched too, with the surviving
    # blocks grown by one so the region's own edges are not left un-graded.
    fill = m.get("minBlockFill")
    if fill and shape:
        sel = _solid_only(sel, shape, fill)

    n = int(sel.sum())
    if n == 0:
        report.append(f"  {region['name']}: MATCHED NOTHING — the window is wrong for this delivery")
        return 0

    t = region["target"]
    before = float(np.median(v[sel]))
    # Idempotent: a region already at its canon value is left alone. Without
    # this, running the pass twice lifts an already-graded costume a second
    # time — the match window still catches it — and there is no way to see
    # that from the file. Being safe to re-run is what lets this sit inside
    # the conform pipeline.
    #
    # The band is 20%, not a hair's breadth, because a second pass re-measures
    # a TRUNCATED region: grading pushes the brightest folds out of the match
    # window, so the median of what still matches reads a little low (0.26
    # against a 0.28 target here). A costume within a fifth of canon does not
    # want grading in any case; the delivery that did was 68% off.
    if t.get("val") is not None and abs(before - t["val"]) <= t["val"] * 0.20:
        report.append(f"  {region['name']}: already at canon ({before:.2f}) — left alone")
        return 0
    if t.get("val") is not None and before > 1e-6:
        # The median lands on target and everything scales with it: relative
        # shading — folds, creases, contact shadow — is preserved exactly.
        v[sel] = soft_clip(v[sel] * (t["val"] / before))
    if t.get("sat") is not None:
        before_s = float(np.median(s[sel]))
        if t.get("satMode") == "set" or before_s <= 1e-6:
            # Recolouring something NEUTRAL — white trainers to red ones. There
            # is no saturation to scale (a ratio against ~0.05 explodes every
            # off-white pixel to full chroma), and no hue worth keeping either,
            # so saturation is set outright and only a little of the original
            # variation is carried through to keep the material from reading
            # flat. Value still carries the shading, which is what sells it.
            s[sel] = np.clip(t["sat"] + (s[sel] - before_s) * 0.5, 0.0, 1.0)
        else:
            s[sel] = np.clip(s[sel] * (t["sat"] / before_s), 0.0, 1.0)
    if t.get("hue") is not None:
        h[sel] = t["hue"]

    report.append(
        f"  {region['name']}: {n} px ({n / h.size * 100:.1f}% of the sheet), "
        f"value {before:.2f} -> {float(np.median(v[sel])):.2f}, "
        f"hue -> {t.get('hue', 'kept')}, sat -> {t.get('sat', 'kept')}")
    return n


def needs_decode(img):
    """True when Blender's pixels are LINEAR and must be encoded to sRGB before
    the palette's numbers mean anything. An 8-bit sRGB texture — which is what
    a glTF base colour is — comes back already encoded."""
    return bool(img.is_float) or img.colorspace_settings.name in ("Non-Color", "Linear", "Linear Rec.709")


def grade_image(img, regions, report):
    px = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(-1, 4).astype(np.float64)
    decode = needs_decode(img)
    rgb = to_srgb(px[:, :3]) if decode else px[:, :3]
    h, s, v = rgb_to_hsv(rgb)
    shape = (img.size[1], img.size[0])
    moved = sum(grade_region(h, s, v, r, report, shape) for r in regions)
    if moved:
        out = hsv_to_rgb(h, s, v)
        px[:, :3] = to_linear(out) if decode else out
        img.pixels.foreach_set(px.astype(np.float32).reshape(-1))
        img.update()
    return moved


def resolve_regions(chars, char, seen=None):
    """This fighter's regions, following `like` up the chain.

    Half the roster wears the SAME Jujutsu High uniform and arrives with the
    same failure (right hue, near-black value), so their entries would be the
    same four numbers copied a dozen times — and a copy is a place for the
    twelfth one to drift. `like` names the fighter whose regions to inherit;
    `regions` on the inheriting entry is appended, so a fighter can take the
    uniform and still declare their own hair or shoes."""
    seen = seen or set()
    entry = chars.get(char)
    if not entry or char in seen:
        return []
    seen.add(char)
    base = resolve_regions(chars, entry["like"], seen) if entry.get("like") else []
    return base + entry.get("regions", [])


def grade_char(char, report):
    """Grade every loaded image onto `char`'s canon colours. Returns the number
    of pixels moved — 0 both for a fighter with no palette entry and for one
    already at canon, which are both fine and both reported."""
    chars = json.load(open(PALETTE, encoding="utf8"))["characters"]
    regions = resolve_regions(chars, char)
    if not regions:
        report.append(f"canon palette: no entry for '{char}' — the delivery's own colours stand")
        return 0
    via = chars[char].get("like")
    report.append(f"grading {char} onto canon colours"
                  + (f" (inheriting {via}'s)" if via else "") + ":")
    return sum(grade_image(img, regions, report)
               for img in bpy.data.images if img.size[0])


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="blender_grade_texture")
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", required=True)
    ap.add_argument("--char", required=True)
    args = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.src)
    arm = next((o for o in bpy.context.scene.objects if o.type == "ARMATURE"), None)
    if not arm:
        sys.exit("no armature in the input — a delivery must be a rigged model")

    report = []
    total = grade_char(args.char, report)
    if not total:
        sys.exit("\n".join(report) + "\n\nnothing was graded — refusing to rewrite the delivery")

    os.makedirs(os.path.dirname(os.path.abspath(args.dst)), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    for child in arm.children:
        child.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=args.dst,
        use_selection=True,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_yup=True,
        export_image_format="AUTO",
    )
    print("\n".join(report))
    print(f"wrote {args.dst}")


if __name__ == "__main__":
    main()
