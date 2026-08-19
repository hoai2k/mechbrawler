#!/usr/bin/env python3
"""Cut the magenta backing out of the canonical mech images.

The canonical concept art (`docs/canonical/mech_<id>.png`) is the source of
truth for what each fighter looks like — flat cel fills, hard shadow bands, a
black ink outline — and every one of them was delivered composited over a
chroma-key magenta card. That backing is not part of the drawing: it is there
so the figure CAN be cut out, and until it is, the images cannot be layered
over anything (a card, a poster, a side-by-side against a render) without a
magenta rectangle coming along.

So this keys them: same pixels, same size, alpha where the card was.

**Why it is not a threshold on "distance from magenta".** That is the obvious
key and it is wrong on exactly the pixels that matter. Every figure here is
drawn with a black ink outline, so the transition at the silhouette runs card →
INK, and a half-covered texel there is `(124, 3, 122)` — 175 RGB units from the
card, which any distance threshold calls solid drawing. The result keys clean
to the eye and leaves a ring of half-magenta texels welded to every outline;
they are invisible against a dark page and light up the moment the cutout lands
on anything else. (They are also enough to poison a palette read of the image:
a k-means over the cutout elects that ring as the representative colour of the
black regions it hems, because it is brighter and more saturated than the paint
it belongs to.)

What actually recovers coverage is the CARD'S OWN CHROMA. Write a texel's
magenta-ness as `(R + B) / 2 - G`: the card scores ~241, ink scores 0, and a
half-covered texel scores half way — so coverage is what is left after the
card's share is taken out, measured against the drawing on the other side of
that edge rather than against zero. That reading is only meaningful where a
texel COULD be part card, so it is applied only there:

  * TRIMAP. Card is `dist <= A0` from the measured backing colour. Everything
    more than `BAND` texels away from any card texel is drawing, whatever
    colour it is — which is what keeps viper's purple and wraith's plum opaque
    while a magenta-ward blend at an outline does not survive.
  * COVERAGE, on the band between them, from the chroma reading above, scaled
    against the nearest certain-drawing texel's own chroma so a blend into a
    warm colour is not over-cut.
  * COLOUR IS UNMIXED, not just masked. A band texel is `a*F + (1-a)*K`; it is
    solved back to `F`. Masking alone is what leaves the fringe.

**The key is measured, not assumed** — `#ff00ff` is nobody's actual backing
(these run 231..251 red, 2..9 green), the border median is.

**Holes are kept.** The card shows through gaps in most of these figures —
between konga's arm and his chest, inside wraith's cloak, under titanus's
fists — and those enclosed regions are background as much as the outside is.
They need no special case: they are card, and the trimap finds them wherever
they are.

Fully transparent texels keep a colour too — their nearest opaque neighbour's,
flooded outward — so that scaling or mipmapping the cutout pulls a drawn colour
into the fringe rather than the ghost of the card.

    python3 tools/key_canonical.py              # what it would do
    python3 tools/key_canonical.py --apply      # key them, archive the originals

`--apply` moves each original to `docs/canonical/originals/` before writing the
keyed image in its place, so the delivered pixels stay recoverable and the keyed
ones are what the name resolves to. Re-running reads the archived original
rather than re-keying an already-keyed image, so the tool can be tuned and run
again without restoring anything by hand.
"""
import argparse
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
CANON = os.path.join(ROOT, "docs/canonical")
ARCHIVE = os.path.join(CANON, "originals")

# The trimap, in RGB units of distance from the measured card colour. The two
# populations are far apart — the card stays within ~10 units of its own median
# and the nearest drawn colour is 70+ away — so A0 has room to sit in the gap
# and touch neither. It only ever has to answer "is this texel the card", never
# "how much of it is".
A0 = 38.0
# How far the uncertain band reaches in from the card, in texels. These images
# were encoded lossily, so an edge is not one texel wide: it is the covered
# texel plus the ring of encode noise around it.
BAND = 3
# Below this coverage a texel is treated as fully out: it carries almost no
# drawing and unmixing it amplifies encode noise into confetti.
ALPHA_FLOOR = 0.06


def _chroma(rgb, key):
    """How much a texel reads as the CARD's colour rather than as paint.

    The card is magenta, so the reading is `(R + B) / 2 - G` projected onto the
    card's own hue — the card scores its full value, a neutral or opposite
    colour scores ~0, and a partly covered texel scores in between in
    proportion to how much card is showing through. Any two-channel-high key
    works out the same way; the weights come from the measured card, so this is
    not hard-coded to magenta.
    """
    import numpy as np
    w = key - key.mean()
    w /= np.linalg.norm(w) or 1.0
    return rgb @ w


def key_image(rgb):
    """(alpha, unmixed rgb, stats) for one canonical image, as float arrays."""
    import numpy as np
    from scipy.ndimage import binary_dilation, distance_transform_edt

    a = rgb.astype(np.float32)
    # The card, measured: the median of the border ring. Every one of these
    # images is a centred figure on a full-bleed card, so the ring is card.
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    k = np.median(border, axis=0)

    dist = np.sqrt(((a - k) ** 2).sum(2))
    card = dist <= A0
    # The trimap. Everything further than BAND from any card texel is drawing,
    # whatever colour it is — the one rule that keeps a purple mech opaque while
    # a purple-ward blend at an ink outline does not survive.
    near = binary_dilation(card, np.ones((2 * BAND + 1, 2 * BAND + 1)))
    band = near & ~card
    solid = ~near

    alpha = np.where(card, 0.0, 1.0).astype(np.float32)
    if band.any() and solid.any():
        chroma = _chroma(a, k)
        cK = float(_chroma(k[None, :], k)[0])
        # What the drawing on the other side of this edge reads as. Taking it
        # from the nearest certain-drawing texel rather than assuming 0 is what
        # keeps a blend into a warm colour from being over-cut: coverage is
        # measured across the actual span between card and paint.
        _, idx = distance_transform_edt(~solid, return_indices=True)
        cF = chroma[idx[0], idx[1]]
        span = np.maximum(cK - cF, 1.0)
        alpha[band] = np.clip((cK - chroma[band]) / span[band], 0.0, 1.0)

    alpha[alpha < ALPHA_FLOOR] = 0.0

    # Unmix: P = a*F + (1-a)*K, solved for F. This is the despill — the magenta
    # in a band texel is the card showing through, and taking it back out is
    # arithmetic rather than a hue nudge.
    a3 = alpha[..., None]
    out = np.where(a3 > 0, (a - (1 - a3) * k) / np.maximum(a3, 1e-6), 0.0)
    out = np.clip(out, 0, 255)

    # Fully-out texels take their nearest drawn colour, so a downscale of the
    # cutout blends drawing into drawing instead of dragging the card back in.
    empty = alpha <= 0
    if empty.any() and not empty.all():
        _, idx = distance_transform_edt(empty, return_indices=True)
        out[empty] = out[idx[0][empty], idx[1][empty]]

    stats = {
        "key": tuple(int(round(v)) for v in k),
        "cut": float((alpha <= 0).mean()),
        "soft": int(((alpha > 0) & (alpha < 1)).sum()),
        "band": int(band.sum()),
    }
    return alpha, out, stats


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--apply", action="store_true",
                    help="archive the originals and write the keyed images")
    args = ap.parse_args()

    try:
        import numpy as np
        from PIL import Image
        import scipy  # noqa: F401  (used inside key_image)
    except ImportError as exc:
        sys.exit(f"needs numpy, pillow and scipy: {exc}")

    names = sorted(n for n in os.listdir(CANON) if n.lower().endswith(".png"))
    if not names:
        sys.exit(f"no PNGs in {CANON}")

    if args.apply:
        os.makedirs(ARCHIVE, exist_ok=True)

    for name in names:
        dst = os.path.join(CANON, name)
        # The delivered pixels are what gets keyed, always. Once a run has
        # archived them, THAT is the source — so the knobs above can be moved
        # and the tool run again without anybody restoring files by hand, and a
        # second run never keys its own output.
        archived = os.path.join(ARCHIVE, name)
        src_path = archived if os.path.exists(archived) else dst
        im = Image.open(src_path)
        if im.mode == "RGBA":
            print(f"{name:24s} delivered with alpha — nothing to key")
            continue
        alpha, rgb, st = key_image(np.asarray(im.convert("RGB")))
        again = " (re-keyed)" if src_path == archived else ""
        print(f"{name:24s} key=#{st['key'][0]:02x}{st['key'][1]:02x}{st['key'][2]:02x} "
              f"cut={st['cut'] * 100:5.1f}%  edge-band={st['band']:6d}px  "
              f"partial={st['soft']:6d}px{again}")
        if not args.apply:
            continue
        if src_path != archived:
            shutil.move(dst, archived)
        out = np.dstack([rgb.round().astype(np.uint8),
                         (alpha * 255).round().astype(np.uint8)])
        Image.fromarray(out, "RGBA").save(dst, optimize=True)

    if not args.apply:
        print("\ndry run — nothing written. --apply to key them "
              f"and archive the originals under {os.path.relpath(ARCHIVE, ROOT)}/")


if __name__ == "__main__":
    main()
