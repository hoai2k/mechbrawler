#!/usr/bin/env python3
"""Turn archived Round 5 chroma renders into cropped transparent sprites.

The ImageGen originals under assets/reference/round5 are immutable inputs.
This script derives the game-facing copies under assets/sprites and can be
rerun whenever the keying thresholds need adjustment.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage


ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "assets" / "reference" / "round5"
SPRITES = ROOT / "assets" / "sprites"
POSES = (
    "idle_a", "idle_b", "run_a", "run_b", "jump_rise", "fall", "hurt",
    "guard", "attack_up", "attack_air", "charge", "dizzy", "victory",
    "ledge_hang",
)


def border_key(rgb: np.ndarray) -> np.ndarray:
    """Use a broad border sample so a single decorated corner cannot skew it."""
    border = np.concatenate((
        rgb[:3].reshape(-1, 3), rgb[-3:].reshape(-1, 3),
        rgb[:, :3].reshape(-1, 3), rgb[:, -3:].reshape(-1, 3),
    ))
    return np.median(border, axis=0)


def key_image(source: Path, destination: Path) -> None:
    rgb = np.asarray(Image.open(source).convert("RGB"), dtype=np.float32)
    key = border_key(rgb)
    is_magenta = key[0] > 180 and key[2] > 180 and key[1] < 100

    if is_magenta:
        # Generated magenta fields can vary by several RGB values and may have
        # a bright one-pixel rim. Select only magenta connected to the canvas
        # border, then decontaminate the two-pixel silhouette boundary. This
        # preserves intentional purple energy inside the figure/effect.
        r, g, b = np.moveaxis(rgb, 2, 0)
        candidate = (r > 145) & (b > 145) & ((np.minimum(r, b) - g) > 70)
        seed = np.zeros(candidate.shape, dtype=bool)
        seed[[0, -1], :] = candidate[[0, -1], :]
        seed[:, [0, -1]] |= candidate[:, [0, -1]]
        connected = ndimage.binary_propagation(seed, mask=candidate)
        # Enclosed gaps (between limbs, robes, branches, etc.) are not border
        # connected. Remove only unmistakably vivid magenta in those regions.
        strict = (r > 190) & (b > 190) & (g < 85) & ((np.minimum(r, b) - g) > 115)
        background = connected | strict
        near = ndimage.binary_dilation(background, iterations=2) & ~background
        alpha = np.ones(background.shape, dtype=np.float32)
        alpha[background] = 0.0

        # Exact colour-to-alpha solution for a magenta key, limited to the
        # border fringe so real purple cursed-energy art stays opaque.
        unit = rgb / 255.0
        fringe_alpha = np.maximum.reduce((1.0 - unit[:, :, 0], unit[:, :, 1],
                                          1.0 - unit[:, :, 2]))
        alpha[near] = np.clip(fringe_alpha[near], 0.0, 1.0)
    else:
        distance = np.linalg.norm(rgb - key, axis=2)
        # The 6..30 ramp retains anti-aliased silhouettes. Opaque interiors are
        # hardened so pale skin is not thinned by a neutral-grey key.
        alpha = np.clip((distance - 6.0) / 24.0, 0.0, 1.0)

    soft = (alpha > 0.0) & (alpha < 1.0)

    # Reverse the chroma composite on edge pixels. Without this, magenta/grey
    # fringe remains visible when the sprite is drawn over a dark arena.
    clean = rgb.copy()
    if np.any(soft):
        a = alpha[soft, None]
        clean[soft] = np.clip((rgb[soft] - (1.0 - a) * key) / a, 0, 255)
    alpha[alpha >= (48.0 / 255.0)] = 1.0

    visible = alpha >= (8.0 / 255.0)
    ys, xs = np.nonzero(visible)
    if not len(xs):
        raise ValueError(f"no visible pixels after keying {source}")
    pad = 8
    x0, x1 = max(0, int(xs.min()) - pad), min(rgb.shape[1], int(xs.max()) + 1 + pad)
    y0, y1 = max(0, int(ys.min()) - pad), min(rgb.shape[0], int(ys.max()) + 1 + pad)

    rgba = np.dstack((clean.astype(np.uint8), np.rint(alpha * 255).astype(np.uint8)))
    image = Image.fromarray(rgba[y0:y1, x0:x1])
    if max(image.size) > 1000:
        image.thumbnail((1000, 1000), Image.Resampling.LANCZOS)
    # Always retain a runtime-safe transparent gutter, even when the generated
    # subject or effect touched its original canvas boundary.
    image = ImageOps.expand(image, border=8, fill=(0, 0, 0, 0))
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination)


def main() -> None:
    count = 0
    for char_dir in sorted(path for path in REFERENCE.iterdir() if path.is_dir()):
        for pose in POSES:
            source = char_dir / f"{pose}.png"
            if not source.exists():
                raise FileNotFoundError(source)
            key_image(source, SPRITES / char_dir.name / f"{pose}.png")
            count += 1
    print(f"processed {count} Round 5 sprites")


if __name__ == "__main__":
    main()
