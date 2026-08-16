# Image requests — MECH BRAWLER (the live list)

## Nothing is outstanding.

Every image the game has asked for has been delivered and wired. The last round
— the neon mech-head favicon, the results-screen backdrop, and the four arena
garnish cards (gull, cloud wisp, aurora curtain, god-ray shaft) — landed on
2026-08-16 and is recorded, brief by brief, in
[docs/image-requests-history.md](image-requests-history.md).

Nothing in the game currently draws a placeholder, and no `optional()` asset in
`src/assets.js` is missing its file: all 41 effect plates, 16 arena hazard
plates and 18 garnish cards resolve. Summons deliberately need no art at all —
a mech summon IS the mech, drawn from its own rig (`src/config_summons.js` says
why at length).

## If a new round is needed

Keep the request here rather than in the archive, and keep the archive's shape:
one row per file, saying what to draw rather than what it is for.

Style baseline, unchanged: **bright neon arcade** — the palette of the intake
arena paintings (deep blue-black grounds, hot cyan/magenta/amber accents),
clean silhouettes that read at 15% screen height, glow baked in, **transparent
background (PNG)** for every sprite. When in doubt, brighter.

Delivery: files land in `assets/intake/` (that directory is tracked on purpose,
so an upload survives a push). Then:

| kind | tool |
|---|---|
| effect / UI plates | `python3 tools/effects_intake.py --apply` |
| garnish cards | same tool — put them in `assets/intake/garnish/` |
| favicon, results backdrop | `python3 tools/site_identity.py --apply` |

Each tool dry-runs by default and prints what it would do, so a delivery can be
inspected before it lands. Nothing here has ever blocked the game: every
optional plate has a procedural fallback, and the engine picks the art up when
it arrives.
