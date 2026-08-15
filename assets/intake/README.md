# `assets/intake/` — where delivered art is dropped

**What to draw is [docs/image-requests.md](../../docs/image-requests.md).** This
file is about what happens to a delivery once it lands here.

Upload new art here, not into `assets/sprites/`. A delivery that arrives wrapped
in its own batch directory — `R2/assets/intake/effects/...`, the shape an upload
of a whole tree makes — has to be flattened onto the layout below first: the
tool reads `assets/intake/<dir>/*.png` one level deep, so a plate nested deeper
is silently not there rather than an error. `git mv` it into place; the batch
directory is not kept.

```
assets/intake/effects/<name>.png     an effect, a status, a hazard, shared feedback
assets/intake/ui/<name>.png          a UI plate — a wordmark, a badge, a chip
```

## What happens to it

```bash
python3 tools/effects_intake.py            # dry run — what would land, and how it changes
python3 tools/effects_intake.py --apply
```

One pass, because the art arrives keyed. The tool checks each plate really is
RGBA with a transparent field, **trims it to its own alpha**, downscales
anything past 1024px on the long edge, and copies it to
`assets/sprites/effects/` or `assets/ui/`. The untouched originals move to
`assets/reference/effects_r1/`, which is gitignored — the trim discards only
transparent margin, so the archive is the same picture at twice the size, and
the delivered plates are already in history where they were uploaded.

**The trim is the load-bearing step.** Every drawing gets a hand-tuned `dx`/`dy`
in [src/config_effects.js](../../src/config_effects.js), and that nudge should
be correcting where the ART sits — not paying off a hundred pixels of empty
plate the generator happened to leave on one side.

## Then it has to be named by something

A plate in `assets/sprites/effects/` that nothing names is a file, not an
effect. Landing it is the easy half; the other half is one of these:

1. **A move throws it.** Add `sprite: "effect:<name>"` and a `spriteH` to that
   move's `p` in [src/characters.js](../../src/characters.js), and the key to
   `EFFECT_KEYS` in [src/assets.js](../../src/assets.js). Nearly every handler
   and ultimate director already reads `p.sprite` — check the one you are aiming
   at does, because a few paint themselves and read nothing.
2. **A hazard draws it.** Add the key to `STAGE_FX_SPRITES` (assets.js) and an
   entry to `STAGE_FX` in
   [src/shared_sprites.js](../../src/shared_sprites.js) with the height and
   anchor its draw site uses, then call `hazardArt` from that board's `draw` in
   [src/stage_fx.js](../../src/stage_fx.js). Draw it OVER the procedural hazard
   rather than instead of it: the gradients are tuned to the timings, and a
   plate that replaced them would have to re-earn all of it.
3. **A moment plays it.** `spriteFlash` in [src/fx.js](../../src/fx.js) puts a
   drawing on screen once, at a point, and fades it — the KO burst, the shield
   shatter, the air-jump jet.
4. **The HUD shows it.** The HUD is HTML, so it is a `background-image` in
   `styles.css` and must NOT also be in `EFFECT_KEYS` — that fetches the same
   picture twice under two URLs.

## Then it gets placed

`node server.mjs`, then **<http://127.0.0.1:5174/workbench/>** — the effect
workbench. Every shared drawing in the game in one grid, each beside the mech
that throws it, at the size the game paints it. Drag to nudge, scroll to size,
Mirror for a plate that arrived facing the wrong way. **Copy config** and paste
the result over `EFFECT_PLACEMENT` in `src/config_effects.js`.

Mirror is the one that catches people: everything that travels is drawn pointing
**left** and mirrored by the renderer when it flies right, so a plate delivered
pointing right needs the flag or it flies backwards.

## Cards, backgrounds, sound

None of these are sprites and none of them come through here.

- **Cards** (`intake/cards/`) and **arena backgrounds** (`intake/arenas/`) are
  a move into `assets/cards/` or `assets/backgrounds/` and nothing else. Watch
  the extension: a board is registered in `src/stages.js` by filename.
- **Rigs** are `tools/mech_intake.mjs`, out of `mechs/*.glb`.
- **Sound** is `tools/sfx_intake.mjs`, plus a key in `src/config_audio.js`.

## Why this directory is tracked by git

Art is delivered by uploading it to the repository, so an ignored directory
would silently swallow the upload. Plates live here only until they are
processed. After a run it is empty again, apart from this file.
