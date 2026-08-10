#!/usr/bin/env python3
"""Audit extracted frames for alpha defects and body-size drift.

A) Semi-transparent body pixels (e.g. hair rendered with partial alpha —
   background bleeds through). Reports frames whose largest component has a
   high fraction of mid-alpha (24..200) pixels, concentrated per-region.
B) Opaque near-white matte residue: big desaturated white blobs touching the
   silhouette edge (background that was never keyed out).
C) Body size drift: pixel area + height of the body component per frame vs the
   character's median — art drawn at inconsistent zoom makes the fighter
   grow/shrink between animations.
"""

import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "sprites")

with open(os.path.join(ROOT, "manifest.json")) as f:
    manifest = json.load(f)

report_alpha = []
report_white = []
sizes = {}

for char, frames in manifest["characters"].items():
    sizes[char] = {}
    for key, meta in frames.items():
        img = np.array(Image.open(os.path.join(ROOT, meta["file"])).convert("RGBA"))
        a = img[:, :, 3]
        rgb = img[:, :, :3].astype(np.int16)
        opaque = a >= 200
        mid = (a >= 24) & (a < 200)

        labels, n = ndimage.label(a >= 24, structure=np.ones((3, 3), np.int8))
        if n == 0:
            continue
        counts = np.bincount(labels.ravel())
        counts[0] = 0
        main = counts.argmax()
        body = labels == main

        # --- A: semi-transparent share of the body
        body_mid = (mid & body).sum()
        body_all = body.sum()
        mid_frac = body_mid / max(1, body_all)
        # where: top third = probable hair
        ys = np.nonzero(body)[0]
        y0, y1 = ys.min(), ys.max()
        top_zone = np.zeros_like(body)
        top_zone[y0 : y0 + (y1 - y0) // 3] = True
        top_mid = (mid & body & top_zone).sum()
        if mid_frac > 0.06 or top_mid > 250:
            report_alpha.append((char, key, round(mid_frac * 100, 1), int(top_mid), int(body_mid)))

        # --- B: near-white desaturated blobs touching the alpha edge
        white = opaque & (rgb.min(axis=2) > 228) & ((rgb.max(axis=2) - rgb.min(axis=2)) < 14)
        wl, wn = ndimage.label(white, structure=np.ones((3, 3), np.int8))
        if wn:
            # alpha edge = opaque pixels bordering transparency
            edge = opaque & ~ndimage.binary_erosion(opaque, iterations=2)
            wcounts = np.bincount(wl.ravel())
            for wi in range(1, wn + 1):
                if wcounts[wi] < 350:
                    continue
                blob = wl == wi
                if (blob & edge).sum() > 25:
                    report_white.append((char, key, int(wcounts[wi])))
                    break

        # --- C: body size
        h = int(ys.max() - ys.min() + 1)
        sizes[char][key] = (int(body_all), h)

print("== A) semi-transparent body pixels (char frame midAlpha% topMidPx bodyMidPx) ==")
for r in sorted(report_alpha, key=lambda r: -r[2])[:40]:
    print(f"  {r[0]:9s} {r[1]}  {r[2]:5.1f}%  top:{r[3]:6d}  all:{r[4]:6d}")

print("\n== B) white matte blobs at silhouette edge (char frame px) ==")
for r in sorted(report_white, key=lambda r: -r[2]):
    print(f"  {r[0]:9s} {r[1]}  {r[2]:7d}px")

print("\n== C) body-size drift vs character median (area ratio; height ratio) ==")
for char, fr in sizes.items():
    areas = {k: v[0] for k, v in fr.items()}
    hs = {k: v[1] for k, v in fr.items()}
    med_a = float(np.median(list(areas.values())))
    med_h = float(np.median(list(hs.values())))
    outliers = []
    for k in fr:
        ra = areas[k] / med_a
        rh = hs[k] / med_h
        if ra > 1.45 or ra < 0.62:
            outliers.append(f"{k}(a×{ra:.2f},h×{rh:.2f})")
    if outliers:
        print(f"  {char:9s} medianArea={int(med_a):6d}: {' '.join(outliers)}")
