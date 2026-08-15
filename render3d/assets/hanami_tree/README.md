# `hanami_tree` — the archived tree Hanami

This is **not a fighter**. It is the first generated Hanami model, kept
because it is a good piece of work that the pipeline should not have made.

## What happened

`tools/tripo_generate.mjs` seeded every fighter from `<char>_idle.png`. For
Hanami that file is *retired as an authority* — see
[`assets/reference/canon/README.md`](../../../assets/reference/canon/README.md):
the delivered 2D set draws him as a bark-and-foliage tree body, canon Hanami
is a lean pale humanoid curse, and round 15A exists to redraw the set. The
generator could not know that, because the retirement lived in prose. So it
produced a very convincing tree.

The fix is `CANON_OVERRIDE` in `tools/tripo_generate.mjs`, which now names
the exception in code, next to the default it overrides. `hanami` seeds from
`hanami_anime.png`, and the shipped `hanami` model is the canon curse.

## What is here

| File | What it is |
|---|---|
| `hanami_tree.glb` | The conformed, clip-authored tree delivery — playable as-is |
| `../../intake/hanami_tree/_raw.glb` | The untouched Tripo output it came from |

Nothing loads these: they are absent from `manifest.json` on purpose, so the
game cannot pick them up and intake cannot approve them. To look at the tree
again, copy `hanami_tree.glb` over a character's model and re-import; to make
it a real alternate, it needs a roster key of its own — it is a different
BODY, not a texture swap, so the `hanami_alt` material-variant route in
[`billboards/docs/asset-requests.md`](../../docs/asset-requests.md) does not
fit it.

`render3d/assets/hanami_tree/` holds the same model for the other backend.
