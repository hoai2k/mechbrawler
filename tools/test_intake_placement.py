#!/usr/bin/env python3
"""Prove that a touched-up sprite keeps its placement through re-import.

A redraw and a touch-up are not the same event (KIND_PLACEMENT in
src/sprites.js). A wholesale redraw — any `needsReplacement` kind — is a
different drawing, so its predecessor's placement means nothing. The
`wantsImprovement` kinds are the opposite: a crop or bleed fix is the SAME
drawing with different bounds, and an alpha fix is the same drawing at the same
bounds, so throwing the tuning away would make every touch-up cost a full
re-tune.

Carrying it across is easy to get subtly wrong, because anchors are stored in
the image's own pixels and those move when the framing does — and because a
frame's `oy` and `bodyBottom` are independent, so re-deriving either from the
other quietly discards a hand-tuned ground contact.

This checks the maths against synthetic re-crops of real art, where the right
answer is known exactly. Everything is asserted in the space the RENDERER draws
in — offsets from the foot line and the cell centre — because image-local
numbers alone would pass a frame that had been shifted bodily, ox/oy having
absorbed the move.

  python3 tools/test_intake_placement.py
"""

import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from intake_import import import_meta, survives, content_box  # noqa: E402

SPRITES = os.path.join(HERE, "..", "assets", "sprites")
MANIFEST = os.path.join(SPRITES, "manifest.json")

fails = 0


def check(ok, label, extra=""):
    global fails
    if not ok:
        fails += 1
    print(f"{'OK  ' if ok else 'FAIL'} {label}" + (f"  {extra}" if extra else ""))


def load(char, key, man):
    meta = man["characters"][char][key]
    path = os.path.join(SPRITES, meta["file"])
    return meta, np.asarray(Image.open(path).convert("RGBA"))


def recrop(frame, pad_left, pad_top, pad_right, pad_bottom):
    """The same drawing with different bounds: pad or trim transparent margin.

    Negative values trim, which is what fixing a too-loose crop does. The
    DRAWING itself is untouched, so any anchor on it must survive.
    """
    x0, y0, x1, y1 = content_box(frame)
    h, w = frame.shape[:2]
    # Never cut into the content itself — that would be a different drawing.
    left = max(0, x0 - pad_left)
    top = max(0, y0 - pad_top)
    right = min(w, x1 + pad_right)
    bottom = min(h, y1 + pad_bottom)
    out = frame[top:bottom, left:right]
    return np.ascontiguousarray(out), (left, top)


def main():
    man = json.load(open(MANIFEST))
    # A frame with a real hand-placed anchor and a non-trivial margin.
    char, key = "gojo", "idle_a"
    meta, frame = load(char, key, man)
    check(bool(meta.get("anchors", {}).get("com")), f"{char}/{key} has an anchor to carry")

    # Everything the renderer needs, in the space it actually draws in: cell
    # coordinates, measured against the foot line and the cell centre. Testing
    # image-local numbers alone would pass a frame that had been shifted
    # bodily, since ox/oy would have absorbed the move.
    def rendered(m, f):
        x0, y0, x1, y1 = content_box(f)
        com = m.get("anchors", {}).get("com")
        return {
            # where the drawing's box sits relative to the foot line
            "art_bottom": (m["oy"] + y1) - m["bodyBottom"],
            "art_centre": m["ox"] + (x0 + x1) / 2,
            "art_h": (y1 - y0) * m["renderScale"],
            # and where the anchor sits within the same frame of reference
            "com_above_feet": None if not com else m["bodyBottom"] - (m["oy"] + com[1]),
            "com_from_centre": None if not com else (m["ox"] + com[0]) - m["ox"] - (x0 + x1) / 2,
        }

    for kind, pads in (("alpha", None),
                       ("crop", (40, 25, 40, 15)),
                       ("bleed", (-6, -4, -6, -3))):
        stored = dict(meta)
        # alpha/crop/bleed are IMPROVEMENT kinds — they ride the other flag.
        # Putting them on needsReplacement would pass too (survives() looks the
        # kind up by name whichever field carries it) while testing a manifest
        # state that can no longer occur.
        stored.pop("needsReplacement", None)
        stored["wantsImprovement"] = kind
        # An alpha fix comes back at the SAME bounds — the file differs only in
        # its transparency — so the frame is handed over untouched.
        new_frame = frame if pads is None else recrop(frame, *pads)[0]

        keeps = survives(stored)
        check(keeps == ("keep" if kind == "alpha" else "reframe"),
              f"{kind}: classified as {keeps}")

        new_meta, _, carried = import_meta(stored, frame, new_frame)
        before, after = rendered(meta, frame), rendered(new_meta, new_frame)

        check("placement" in carried and any(c.startswith("anchors") for c in carried),
              f"{kind}: placement and anchors are carried", ", ".join(carried))

        # The drawing must come back in exactly the same place on screen.
        check(abs(after["art_bottom"] - before["art_bottom"]) < 1.1,
              f"{kind}: the art stands in the same place",
              f"{before['art_bottom']:.1f} -> {after['art_bottom']:.1f} px below the foot line")
        check(abs(after["art_centre"] - before["art_centre"]) < 1.1,
              f"{kind}: the art keeps its horizontal position",
              f"{before['art_centre']:.1f} -> {after['art_centre']:.1f}")
        check(abs(new_meta["renderScale"] - meta["renderScale"]) < 1e-6,
              f"{kind}: renderScale is unchanged — the drawing is not resized",
              f"{meta['renderScale']} -> {new_meta['renderScale']}")
        check(abs(new_meta["bodyBottom"] - meta["bodyBottom"]) < 0.05,
              f"{kind}: the tuned ground contact survives",
              f"{meta['bodyBottom']} -> {new_meta['bodyBottom']}")

        # And the anchor must come back on the same point of the body.
        check(abs(after["com_above_feet"] - before["com_above_feet"]) < 1.1,
              f"{kind}: the anchor keeps its height above the feet",
              f"{before['com_above_feet']:.1f} -> {after['com_above_feet']:.1f}")
        check(abs(after["com_from_centre"] - before["com_from_centre"]) < 1.1,
              f"{kind}: the anchor keeps its offset across the body",
              f"{before['com_from_centre']:.1f} -> {after['com_from_centre']:.1f}")

        # A trimmed bleed genuinely removes content, so the art gets shorter by
        # exactly what was cut — at the SAME scale, never restretched.
        if kind == "bleed":
            check(after["art_h"] < before["art_h"],
                  "bleed: trimming really did remove content",
                  f"{before['art_h']:.1f} -> {after['art_h']:.1f} px tall")
        else:
            check(abs(after["art_h"] - before["art_h"]) < 1.1,
                  f"{kind}: the art is the same height on screen",
                  f"{before['art_h']:.1f} -> {after['art_h']:.1f}")

    # A redraw must NOT inherit any of it — every replacement kind discards,
    # including the retired "replace" and the bare `true` that predate them.
    for kind in ("quality", "pose", "character", "replace", True):
        stored = dict(meta)
        stored.pop("wantsImprovement", None)
        stored["needsReplacement"] = kind
        label = kind if isinstance(kind, str) else "legacy true"
        check(survives(stored) == "discard", f"{label}: classified as discard")
        redrawn, _, carried = import_meta(stored, frame, frame)
        check(not carried, f"{label}: nothing is carried over",
              ", ".join(carried) or "(nothing)")
        check("anchors" not in redrawn, f"{label}: the old anchors are dropped")

    unflagged = dict(meta)
    unflagged.pop("needsReplacement", None)
    check(survives(unflagged) == "discard", "an unflagged frame defaults to discard")

    # ---- the marker the workbench's updated list is built from
    #
    # An import over existing art has to leave a record of itself, because the
    # work it overwrote was spread across the roster and nothing else in the
    # manifest says the art moved. What has to be REDONE is the part that
    # matters, so `lost` names the hand-tuned fields that were rolled back.
    tuned = dict(meta)
    tuned["needsReplacement"] = "quality"
    tuned["edited"] = {"renderScale": 0.25, "bodyBottom": 300.0}
    redrawn, _, _ = import_meta(tuned, frame, frame)
    note = redrawn.get("replaced") or {}
    check(note.get("kept") == "discard", "a redraw records that it discarded the tuning",
          json.dumps(note))
    check(note.get("lost") == ["bodyBottom", "renderScale", "anchors"],
          "and names what has to be done again", json.dumps(note.get("lost")))
    check(bool(note.get("at")), "with the round it landed in", str(note.get("at")))

    touched = dict(tuned)
    touched.pop("needsReplacement", None)
    touched["wantsImprovement"] = "crop"
    reframed, _, _ = import_meta(touched, frame, recrop(frame, 20, 10, 20, 10)[0])
    check((reframed.get("replaced") or {}).get("lost") == [],
          "a touch-up says its tuning survived rather than staying silent",
          json.dumps(reframed.get("replaced")))

    # A brand-new pose is marked too, as `how: "new"`. It overwrote nothing, so
    # `lost` is empty and it sorts below the poses with tuning to redo — but it
    # still has to be placed, and that work scatters across the roster exactly
    # the way an overwrite does. See replaced_note() in intake_import.py.
    fresh, _, _ = import_meta(None, None, frame, meta)
    note = fresh.get("replaced") or {}
    check(note.get("how") == "new", "a brand-new pose is marked as new work",
          json.dumps(fresh.get("replaced")))
    check(note.get("lost") == [], "and has nothing to redo, having overwritten nothing",
          json.dumps(note.get("lost")))

    print("\n" + (f"{fails} check(s) failed" if fails else "All checks pass"))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
