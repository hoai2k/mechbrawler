#!/usr/bin/env python3
"""Apply a sprite-adjustment patch exported from the workbench.

The workbench (`workbench/?edit=sprites`) lets you tune per-frame `renderScale`
and `ox` live against the game's real renderer, then exports JSON like:

    { "character": "maki",
      "adjustments": { "ledge_hang": { "renderScale": 0.3518, "ox": 47.8,
                                       "bodyBottom": 300, "faceLeft": false,
                                       "anchors": { "com": [148.7, 512.0],
                                                    "ledge": [161.0, 40.6] } } } }

This writes those values into `assets/sprites/manifest.json`. Multiple payloads
can be applied at once — paste several into one file as a JSON array, or pass
several files.

`clearUpdated` is the other half of the workbench's "All Recently Updated Poses"
list: the poses reviewed as they stand, whose `replaced` marker (written by
intake) should come off without an adjustment. A pose that IS adjusted comes off
the list by that alone — having been retuned is the whole point of the list.

The same list also carries poses the game has always drawn through a state's
`fallback`, which the workbench used to report as drawn by nothing and so never
offered up to be sized. Those have no intake marker to remove, so reviewing one
as it stands writes `surfacedReviewed` instead; adjusting one clears it, the
same way an adjustment clears `replaced`.

Usage:
  python3 apply_sprite_adjustments.py patch.json [more.json ...]
  pbpaste | python3 apply_sprite_adjustments.py -        # straight from clipboard
  python3 apply_sprite_adjustments.py patch.json --dry-run
"""

import argparse
import datetime as dt
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(HERE, "..", "assets", "sprites", "manifest.json")

# The workbench's pseudo-character for shared effect/summon art. Its edits go to
# manifest["otherSprites"], not under any character.
OTHER_KEY = "__other"

# renderScale = size, ox = horizontal centring, bodyBottom = ground contact
# (where the sprite's feet meet the floor — not necessarily its lowest pixel,
# since perspective can put one foot below the standing plane).
#
# anchors = named points in the SOURCE IMAGE's own pixels, from its top-left
# corner: "com" is the centre of mass every rotation pivots about, and states
# can add their own ("ledge" is the hand that grips the edge). Image-local
# coordinates mean an anchor stays on the same piece of artwork through any
# later renderScale / ox / bodyBottom change. See src/sprites.js.
#
# faceLeft mirrors a frame whose art was drawn facing left. `nativeLeft` in the
# manifest seeded these by guess; a per-frame faceLeft is an explicit decision
# and wins over it, which is why writing `false` matters rather than deleting
# the key — see loadAssets in src/assets.js.
#
# needsReplacement flags a frame whose ART is wrong. Its VALUE says what is
# wrong — "replace", "crop", "alpha", "bleed" (REPLACEMENT_KINDS in
# src/sprites.js) — because a wholesale redraw and a crop fix are very different
# asks. `false` clears the flag; a legacy `true` means "replace".
# tools/list_replacements.py collects them for the asset request list, and
# intake clears the flag when new art lands.
#
# rotationDeg tilts the pose about its centre of mass, in degrees, clockwise
# positive. It corrects art drawn off square; the game adds its own procedural
# rotation on top. Absolute rather than a delta — a drawing has no inherent tilt
# to be relative to, so 0 is square and the key is dropped at 0.
#
# wantsImprovement is the softer ask: the art works, it is just not as good as
# it should be. Its value is "quality", "pose" or "character"
# (IMPROVEMENT_KINDS in src/sprites.js). Collected at a lower priority, since
# nothing is blocked by one.
#
# replacementNote / improvementNote are the free text written beside either
# flag: what is actually wrong with THIS drawing, in the words of whoever spotted
# it. The kind says which of six shapes the fault has, and a request written from
# the kind alone has to guess the rest. Optional; "" clears one. They ride with
# the drawing (VARIANT_REVIEW), not the pose, and the workbench drops a note when
# the flag it explains is cleared.
ALLOWED = {"renderScale", "ox", "bodyBottom", "rotationDeg", "anchors", "faceLeft",
           "needsReplacement", "wantsImprovement",
           "replacementNote", "improvementNote"}
# Free text. "" is meaningful — it clears the note rather than leaving the old
# one attached to a flag that has since changed.
TEXT = {"replacementNote", "improvementNote"}
# Flags whose VALUE is a kind string. `false` clears; a legacy `true` means the
# first kind in the list.
KIND_FIELDS = {"needsReplacement": "replace", "wantsImprovement": "quality"}
NUMERIC = {"renderScale", "ox", "bodyBottom", "rotationDeg"}
BOOLEAN = {"faceLeft"}

# Fields whose pre-edit value is worth remembering. `edited` maps each to what
# it held before the FIRST hand edit, which does two jobs: it marks the frame as
# hand-tuned (the workbench's view filter reads it), and it lets intake roll the
# tuning back when the art is replaced — nudges made to compensate for bad art
# must not be inherited by the art that fixes it.
TRACKED = {"renderScale", "ox", "bodyBottom", "rotationDeg", "faceLeft"}

# The fields that mean somebody PLACED this pose, as opposed to judging the
# drawing on it. Only these take a pose off the recently-updated list — see the
# note at the point of use.
PLACEMENT_WORK = TRACKED | {"anchors"}

# Cleared off a pose before the chosen drawing's own values are written in, so a
# variant that does not set a field cannot inherit the previous drawing's. That
# covers the review flags as well as the numbers: "fix alpha" is a verdict on a
# DRAWING, and a pose that keeps it across a switch pins it to whichever art
# happens to be selected. Mirrors VARIANT_BANKED in src/sprites.js and BANKED in
# build_variants.py.
VARIANT_PLACEMENT = [
    "w", "h", "ox", "oy", "bodyBottom", "bodyH", "bodyTop",
    "centroidX", "renderScale", "rotationDeg", "anchors", "faceLeft",
]
VARIANT_REVIEW = ["needsReplacement", "wantsImprovement",
                  "replacementNote", "improvementNote",
                  "edited", "surfacedReviewed"]
VARIANT_BANKED = VARIANT_PLACEMENT + VARIANT_REVIEW

# Kinds that only mean something about an option, never about the pose.
# Mirrors VARIANT_ONLY_KINDS in src/sprites.js.
VARIANT_ONLY_KINDS = {"delete"}


def now_stamp():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def bank_superseded(man, char, key, note, meta):
    """Keep the drawing an approval just displaced, as an option on the pose.

    Approving is not the end of the comparison, it is a step in it. The question
    the workbench's **Alternate sprite** view answers is "what was here before",
    and if the displaced drawing were dropped that view would silently start
    showing something else — or nothing — the moment you said yes. Banked with
    the moment it was superseded, so the newest predecessor is the one offered.

    The file is left on disk. It is small, it is the only copy of a drawing that
    shipped for a while, and reverting is otherwise a trip through git.
    """
    live = dict(note.get("live") or {})
    if not live.get("file"):
        return
    entry = man.setdefault("variants", {}).setdefault(char, {}).setdefault(
        key, {"options": []})
    entry["options"] = [o for o in entry["options"] if o["file"] != live["file"]]
    live["label"] = "Superseded"
    live["supersededAt"] = note.get("at") or now_stamp()
    entry["options"].append(live)
    # The drawing now in play belongs in the list too, or approving twice would
    # leave the pose's current art missing from its own options.
    if not any(o["file"] == meta.get("file") for o in entry["options"]):
        current = {f: meta[f] for f in VARIANT_BANKED if f in meta}
        current["file"] = meta.get("file")
        current["label"] = "In game"
        entry["options"].insert(0, current)


def bank_rejected(man, char, key, note, delivered):
    """Keep the drawing an approval just turned down, as an option on the pose.

    The mirror of bank_superseded, and for the same reason: saying no is a step
    in the comparison, not the end of it. The replacement stays on the pose as
    an alternate carrying its own placement, so the answer can be changed later
    — in the workbench, by the pose's own variant chevron — without the drawing
    having to be delivered again.
    """
    if not delivered.get("file"):
        return
    entry = man.setdefault("variants", {}).setdefault(char, {}).setdefault(
        key, {"options": []})
    rejected = dict(delivered)
    rejected["label"] = "Not approved"
    rejected["supersededAt"] = note.get("at") or now_stamp()
    entry["options"] = [o for o in entry["options"] if o["file"] != rejected["file"]]
    entry["options"].append(rejected)
    # The drawing that stays in play belongs in the list too, or the pose's own
    # art would be missing from its own options.
    live = dict(note.get("live") or {})
    if live.get("file") and not any(o["file"] == live["file"] for o in entry["options"]):
        live["label"] = "In game"
        entry["options"].insert(0, live)


def clear_fresh(man, char, key):
    """Drop the "new, not looked at" mark from this pose's variant options.

    The mark exists so an alternate — which changes nothing on screen — is
    visible at all. Once the pose has been adjusted or reviewed, it has been
    looked at, so the dot has done its job. Same lifecycle as the `replaced`
    marker beside it, and cleared in the same two places.
    """
    entry = ((man.get("variants") or {}).get(char) or {}).get(key)
    if not entry:
        return False
    hit = False
    for opt in entry.get("options", []):
        if opt.pop("fresh", None):
            hit = True
    return hit


def load_payloads(sources):
    payloads = []
    for src in sources:
        raw = sys.stdin.read() if src == "-" else open(src).read()
        # tolerate the workbench's "// no changes" placeholder
        raw = raw.strip()
        if not raw or raw.startswith("//"):
            continue
        data = json.loads(raw)
        payloads.extend(data if isinstance(data, list) else [data])
    return payloads


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sources", nargs="+")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    man = json.load(open(MANIFEST))
    applied, skipped = [], []

    for payload in load_payloads(args.sources):
        char = payload.get("character")
        if char == OTHER_KEY:
            # The workbench's "Other Sprites" entry: shared effect/summon art.
            # It has no pose to place — the code that spawns it decides where it
            # goes — so most of the placement fields do not apply. Two do, and
            # both are properties of the DRAWING rather than of a pose:
            # `faceLeft` for art delivered pointing the wrong way, and
            # `renderScale` for art delivered at the wrong size next to the
            # fighter who throws it. Stored in their own manifest section keyed
            # by sprite key ("effect:blue", "summon:nue"), and read back by
            # src/shared_sprites.js.
            frames = man.setdefault("otherSprites", {})
            for key in (payload.get("adjustments") or {}):
                frames.setdefault(key, {})
        else:
            frames = man["characters"].get(char)
        if frames is None:
            skipped.append(f"unknown character '{char}'")
            continue
        # The delivered drawing's own numbers, before this export's adjustments
        # touch them. A "keep" verdict banks the drawing it turns down, and by
        # the time the verdicts are read the pose's fields have already been
        # rewritten with the ones the workbench put back — so what the option
        # deserves is captured here, while it is still the delivered art's.
        delivered_before = {
            key: {f: meta[f] for f in ["file"] + VARIANT_BANKED if f in meta}
            for key, meta in frames.items()
            if isinstance(meta, dict) and meta.get("awaitingApproval")
        }
        # Which sprite each action draws. The workbench's secondary-action
        # editor writes these when a state is pointed at a different cell; the
        # game reads them in animsOf() (src/sprites.js), so characters.js does
        # not change. An empty list clears an override.
        if "animOverrides" in payload:
            table = man.setdefault("animOverrides", {}).setdefault(char, {})
            for stateName, frames in payload["animOverrides"].items():
                before = table.get(stateName)
                if not frames:
                    table.pop(stateName, None)
                    applied.append(f"{char}.{stateName}: {before} -> cleared")
                else:
                    table[stateName] = list(frames)
                    applied.append(f"{char}.{stateName}: {before} -> {list(frames)}")
            if not table:
                man["animOverrides"].pop(char, None)
            if not man.get("animOverrides"):
                man.pop("animOverrides", None)

        # Which drawing a pose uses, when it has more than one to choose from
        # (tools/build_variants.py). Two halves, and both matter:
        #   variantPlacement  banks every option's own size/centring/anchors and
        #                     review flags, so tuning or flagging one drawing is
        #                     not lost by looking at another — both belong to
        #                     the IMAGE.
        #   variantChoice     mirrors the chosen option onto the pose, which is
        #                     the only thing the game reads.
        for pose, options in (payload.get("variantPlacement") or {}).items():
            # Created rather than demanded: a pose earns a variants entry the
            # moment the workbench points it at another of the character's
            # sprites, and that is exactly the export that has to be able to
            # arrive at a pose which never had options before.
            entry = man.setdefault("variants", {}).setdefault(char, {}).setdefault(
                pose, {"options": []})
            by_file = {o["file"]: o for o in entry["options"]}
            for opt in options:
                target = by_file.get(opt["file"])
                if target is None:
                    # A drawing borrowed from another pose. It carries its own
                    # copy of the placement — the whole point of borrowing is
                    # that this pose sits it differently — so it is added, not
                    # skipped as an unknown file.
                    target = {"file": opt["file"]}
                    if opt.get("label"):
                        target["label"] = opt["label"]
                    if opt.get("borrowedFrom"):
                        target["borrowedFrom"] = opt["borrowedFrom"]
                    entry["options"].append(target)
                    by_file[opt["file"]] = target
                    applied.append(f"{char}/{pose}: {opt['file']} added as an option")
                for field, value in opt.items():
                    if field == "file":
                        continue
                    if field == "pending":
                        # Approving or keeping is the absence of this flag, so
                        # a false has to erase it rather than be skipped.
                        if value:
                            target["pending"] = True
                        else:
                            target.pop("pending", None)
                        continue
                    if field == "needsReplacement":
                        # A delete tag on a DRAWING: "we have something better,
                        # discard this one at the next cleanup". False clears it,
                        # so untagging exports as clearly as tagging.
                        before = target.get(field)
                        if value:
                            target[field] = value
                            applied.append(f"{char}/{pose} [{opt['file']}]: tagged {value}")
                        elif before:
                            target.pop(field, None)
                            applied.append(f"{char}/{pose} [{opt['file']}]: {before} -> cleared")
                        continue
                    target[field] = value

        for pose, file in (payload.get("variantChoice") or {}).items():
            meta = frames.get(pose)
            entry = (man.get("variants") or {}).get(char, {}).get(pose)
            if meta is None or entry is None:
                skipped.append(f"{char}/{pose}: cannot select {file}")
                continue
            chosen = next((o for o in entry["options"] if o["file"] == file), None)
            if chosen is None:
                skipped.append(f"{char}/{pose}: {file} is not an option")
                continue
            before = meta.get("file")
            for field in VARIANT_BANKED:
                meta.pop(field, None)
            for field, value in chosen.items():
                if field == "label":
                    continue
                # "Delete variant" says discard this one OF SEVERAL — a sentence
                # only an option can carry. Mirroring it onto the pose would put
                # it in front of list_replacements.py twice, once as a pose
                # needing work and once as the deletion it already collects from
                # the variants list.
                if field == "needsReplacement" and value in VARIANT_ONLY_KINDS:
                    continue
                meta[field] = value
            applied.append(f"{char}/{pose}.file: {before} -> {file}")

        # The scale reference the character's size is solved against. Written
        # when the idle itself is adjusted: from then on the idle is a pose like
        # any other, and the character's size belongs to the height target.
        if "heightSpan" in payload:
            spans = man.setdefault("heightSpans", {})
            before = spans.get(char)
            spans[char] = payload["heightSpan"]
            applied.append(f"{char}.heightSpan: {before} -> {payload['heightSpan']}")

        if "headHeight" in payload:
            heads = man.setdefault("headHeights", {})
            before = heads.get(char)
            heads[char] = payload["headHeight"]
            applied.append(f"{char}.headHeight: {before} -> {payload['headHeight']}")

        # Verdicts first, then the numbers. A "keep" puts the whole of the old
        # drawing back, so an adjustment made AFTER that decision has to land on
        # top of the restored fields rather than under them — which is the order
        # the workbench does it in too: decide, then tune.
        # Verdicts on replacements the intake held back. "approve" lets the
        # new drawing into the game — the pose already carries its placement,
        # so all that is left is to drop the marker that was diverting the game
        # to the old one. "keep" is the other answer: the whole of the old
        # drawing goes back, and the export's adjustments land on top of it.
        for key, verdict in (payload.get("approvals") or {}).items():
            meta = frames.get(key)
            if meta is None:
                skipped.append(f"{char}/{key}: not in manifest")
                continue
            note = meta.pop("awaitingApproval", None)
            if note is None:
                skipped.append(f"{char}/{key}: no replacement was waiting")
                continue
            if verdict == "keep":
                # The whole drawing goes back, not a field-by-field merge over
                # the one being turned down: every field that belongs to an
                # image is cleared first, or the rejected drawing's numbers
                # (and anchors, and mirror) would be left wearing the old art.
                bank_rejected(man, char, key, note, delivered_before.get(key, {}))
                for field in VARIANT_BANKED:
                    meta.pop(field, None)
                for field, value in (note.get("live") or {}).items():
                    meta[field] = value
            else:
                bank_superseded(man, char, key, note, meta)
            applied.append(
                f"{char}/{key}: replacement kept out, old art restored"
                if verdict == "keep"
                else f"{char}/{key}: replacement approved -> {meta.get('file')}")

        for key, changes in (payload.get("adjustments") or {}).items():
            meta = frames.get(key)
            if meta is None:
                skipped.append(f"{char}/{key}: not in manifest")
                continue
            for field, value in changes.items():
                if field not in ALLOWED:
                    skipped.append(f"{char}/{key}: ignoring unsupported field '{field}'")
                    continue
                if field in TRACKED:
                    # record the pristine value once, before it is overwritten
                    meta.setdefault("edited", {}).setdefault(field, meta.get(field))
                if field in KIND_FIELDS:
                    before = meta.get(field)
                    if not value:
                        meta.pop(field, None)
                        applied.append(f"{char}/{key}.{field}: {before} -> cleared")
                    else:
                        kind = KIND_FIELDS[field] if value is True else str(value)
                        meta[field] = kind
                        applied.append(f"{char}/{key}.{field}: {before} -> {kind}")
                    continue
                if field in BOOLEAN:
                    before = meta.get(field)
                    meta[field] = bool(value)
                    applied.append(f"{char}/{key}.{field}: {before} -> {bool(value)}")
                    continue
                if field in TEXT:
                    before = meta.get(field)
                    text = str(value or "").strip()
                    if text:
                        meta[field] = text
                    else:
                        meta.pop(field, None)
                    applied.append(f"{char}/{key}.{field}: "
                                   + ("cleared" if not text else f"{len(text)} chars"))
                    continue
                if field == "anchors":
                    # merge, so exporting one anchor never drops the others
                    anchors = meta.setdefault("anchors", {})
                    for name, point in value.items():
                        before = anchors.get(name)
                        anchors[name] = [round(float(point[0]), 1), round(float(point[1]), 1)]
                        applied.append(f"{char}/{key}.anchors.{name}: {before} -> {anchors[name]}")
                    continue
                before = meta.get(field)
                meta[field] = value
                applied.append(f"{char}/{key}.{field}: {before} -> {value}")
            # Retuning a pose whose art was just replaced is exactly what the
            # updated list asks for, so the marker comes off with the work. A
            # surfaced pose leaves by the same door: `edited` now records it as
            # tuned, which is what put it on the list for lacking.
            #
            # Flagging is NOT that work. Saying "this drawing has to be redrawn"
            # answers a different question from "this drawing is placed", and a
            # flag-only export used to take the pose off the list while nobody
            # had sized or grounded anything — the art still needs placing, and
            # a request can sit open for rounds. So the marker comes off only
            # when a placement field moved; `clearUpdated` remains the way to
            # say "looked at, nothing to do".
            placed = any(f in PLACEMENT_WORK for f in changes)
            if placed and (meta.pop("replaced", None) or meta.pop("surfacedReviewed", None)):
                applied.append(f"{char}/{key}: off the updated list (adjusted)")
            if clear_fresh(man, char, key):
                applied.append(f"{char}/{key}: alternate no longer marked new")

        # Poses reviewed as they stand: the new art needed nothing, so the only
        # thing to record is that someone looked. An intake marker is removed; a
        # surfaced pose has none to remove, so the looking is what gets written.
        for key in (payload.get("clearUpdated") or []):
            meta = frames.get(key)
            if meta is None:
                skipped.append(f"{char}/{key}: not in manifest")
                continue
            if clear_fresh(man, char, key):
                applied.append(f"{char}/{key}: alternate no longer marked new")
            if meta.pop("replaced", None):
                applied.append(f"{char}/{key}: off the updated list (reviewed)")
            elif not meta.get("surfacedReviewed"):
                meta["surfacedReviewed"] = True
                applied.append(f"{char}/{key}: off the updated list (reviewed as drawn)")
            else:
                skipped.append(f"{char}/{key}: already off the updated list")

    for line in applied:
        print("  " + line)
    for line in skipped:
        print("  SKIP " + line)

    if not applied:
        print("nothing to apply")
        return
    if args.dry_run:
        print(f"(dry run — {len(applied)} change(s) not written)")
        return
    json.dump(man, open(MANIFEST, "w"), indent=1)
    print(f"manifest updated: {len(applied)} change(s)")


if __name__ == "__main__":
    main()
