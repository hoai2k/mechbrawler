# Image requests — MECH BRAWLER (the live list)

Everything the game currently wants that cannot be drawn procedurally, and
nothing else. **Fulfilled rounds move to
[docs/image-requests-history.md](image-requests-history.md)** — that archive
keeps every delivered brief verbatim (a redraw has to agree with the brief the
others were drawn to), so this page stays a one-screen read of what is
actually outstanding.

Style baseline for every request: **bright neon arcade** — the palette of the
intake arena paintings (deep blue-black grounds, hot cyan/magenta/amber
accents), clean silhouettes that read at 15% screen height, glow baked in,
**transparent background (PNG)** for every sprite. When in doubt, brighter.

Delivery: files land in `intake/` (or `intake/effects/` for effect sprites).
Nothing here blocks the game — every sprite below has a procedural fallback
or an existing placeholder, and the engine picks the art up when it arrives.

## 1 — Site identity (carried over; still open)

| file | what |
|---|---|
| `favicon_mech.png` | the site favicons + touch icons (favicon.ico, favicon-16/32, apple-touch-icon, android-chrome-192/512) still carry the old JJK logo mark — a square neon mech-head glyph on `#05070c`, readable at 16px, replaces the whole set |
| `victory_backdrop.jpg` | `assets/backgrounds/victory.jpg` (the results-screen backdrop, 2048×1152) is still the JJK painting — a neon hangar / winner's podium scene in the arena palette replaces it |

## 2 — Arena garnish cards (the arena-polish round)

Flat cards for the 3D camera's garnish layer (`src/camera3d/garnish.js`) —
the near-lens and deep-background dressing added in the arena polish pass.
Each one already draws procedurally and the art replaces the TEXTURE only:
motion, depth and spawning are unchanged, so they can land one at a time.
They live in `assets/sprites/garnish/` after intake; ~512px long side,
transparent PNG, same as the delivered garnish set (leaves, rubble, cars).

| file | arena | what to draw |
|---|---|---|
| `gull.png` | harbor | a gull glide silhouette, near-black against sunset, wings in the shallow-M glide pose, slight warm rim light on the upper edge |
| `cloud_wisp.png` | skyterrace, frozen | a soft horizontal cloud wisp, white with a faint cool shadowed underside, feathered edges all round (used both as the drifting cloud deck and, dimmed, as steam) |
| `aurora_curtain.png` | frozen | a wide aurora curtain, vertical striations, aurora green `#2ee89a` fading to transparent at the bottom and edges — will be drawn additively, so paint it on black-transparent |
| `godray_shaft.png` | jungle | a single god-ray light shaft, widening downward, pale green-white `#d6ffe0` at the top fading out at the foot — painted for additive blending |

## Notes for the generator

- Nothing here needs animation frames — the engine moves, scales, fades and
  flickers the cards itself.
- The garnish layer draws cards semi-transparent and often additive; keep
  glows soft-edged so alpha fades don't band.
- Delivered-but-unassigned plates (`shock_arc`, and any card whose board
  changes) are tracked in the history doc, not here.
