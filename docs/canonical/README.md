# `docs/canonical/` — what each fighter looks like

One drawing per mech, `mech_<id>.png`, and they are the **source of truth for
that fighter's appearance**: silhouette, panel scheme, decals, glow colour, and
— since the toon pass started reading them — the actual paint. Where a
`mechs/lib/src/mechs/designs/<id>.js` comment or a line in
`mechs/art/CANONICAL-SPECS.md` disagrees with the drawing, the drawing wins.

`mech_null.png` is nullbot; the file predates the rename.

## Cut out, not composited

The drawings were delivered over a chroma-key magenta card. They are stored
here **keyed**: RGBA, alpha where the card was, so a drawing can go straight
onto a card, a poster or a side-by-side without a magenta rectangle coming with
it. The delivered pixels are kept, untouched, in `originals/`.

`tools/key_canonical.py` does the cut and the archiving, and reads from
`originals/` on a re-run — so the key can be tuned and re-applied without
restoring anything by hand. Its module docstring explains why the coverage is
measured from the card's own chroma rather than from distance to it (short
version: these figures are inked in black, and a half-covered texel on an
outline sits 175 RGB units from the card, which any distance threshold calls
solid drawing and welds to the silhouette as a magenta ring).

## What reads them

- **The toon pass**, through `tools/derive_cel_from_canonical.mjs`: each
  drawing's palette becomes that fighter's `toon.cel.palette` and `shadeTint` in
  `render3d/assets/manifest.json`, which is what `?render=toon` paints the rig
  with. Re-run the tool after replacing a drawing.
- **Design notes** in `mechs/lib/src/mechs/designs/*.js`, by reference.
