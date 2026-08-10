# Flagged sprite diagnoses

Marked-up evidence for the sprites the workbench flags as having something wrong
with the **art** rather than its placement — what the defect actually is, in
pixels, so a redraw request can be specific about it.

Nothing here is a repair. The sheets below were made while trying to fix these
frames, and the attempt is what established that fixing them is the wrong move:
every one of them is a pose round 10A already redraws, and a patch would only
disguise the flag until the replacement lands. The measurements are the useful
part, so they are kept and the pixels are left alone.

| Sheet | Frames | What it shows |
|---|---|---|
| `nobara-r2c2-alpha.png` | `nobara/r2c2` (down heavy) | An 853 px patch of the original background, never keyed out, enclosed between her sleeve, thigh and shoe — visible in game as a white shape under her. Erasing it is a two-line script and it was reverted: the pose is also a crouched hand-plant standing in for a down heavy, so `attack_down` has to be drawn regardless, and that redraw fixes both at once. |
| `crop-flagged-diagnosis.png` | the 7 cells flagged **Fix crop** | Every opaque pixel sitting on the image border, in red — art the extraction cut through. Those pixels exist nowhere in the repo or its git history, so no edit recovers them. |

Both feed `docs/asset-requests.md`: the per-frame table in round 10A, and the
per-edge measurements in 10B.

## When something here *should* be repaired

If a defect ever turns up on a pose that is **not** being redrawn — a delivered
semantic pose, say — then patch the pixels, and record the before/after here
with a note on what moved. There is no source file behind these PNGs, so the
diff and a picture of it are the only account of the change. Check the frame's
alpha bounding box afterwards: if it moved, `w`/`h`/`ox`/`oy` and the anchors in
`manifest.json` all need re-measuring with `tools/bake_anchors.py`.
