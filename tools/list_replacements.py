#!/usr/bin/env python3
"""List the sprites flagged as needing art work.

The sprite workbench's **Sprite needs replacement** checkbox writes
`needsReplacement` onto a frame, meaning "the ART here is wrong" — as distinct
from its placement being wrong, which the other controls fix. Its value says
WHAT is wrong: a wholesale redraw and a crop fix are very different asks, and a
request that does not distinguish them is a request someone has to come back and
clarify. This collects the flags, grouped by that kind, so they can be turned
into asset requests.

The kinds are defined in src/sprites.js and parsed from there, so the set has
one source of truth rather than a copy here that can drift.

How much of the existing placement survives the redraw depends on the kind, and
the request has to say so or the intake cannot know what to keep:

  Fix alpha              keep     same drawing, same bounds. Every measurement
                                  and anchor is still valid; reuse them.
  Fix crop / Fix bleed   reframe  same drawing, different bounds. Re-measure,
                                  and shift the anchors by how far the framing
                                  moved.
  Replace                discard  a different drawing. Nothing about the old
                                  placement means anything.

That mapping is KIND_PLACEMENT in src/sprites.js and is parsed from
there, so it cannot drift from what the code believes.

**Request improvement** is the softer, lower-priority ask: the art works, it is
just not as good as it should be (`wantsImprovement`, one of "quality", "pose",
"character"). Listed separately, because nothing is blocked by one.

The flags are cleared automatically: `intake_import.py` rebuilds a frame's entry
when new art lands, which drops them along with the rest of the old settings.
Flagging and importing are the two ends of one pipeline, so this list is always
"still outstanding", never a historical record.

**Delete variant** is a fifth kind and behaves differently: it is tagged on one
DRAWING of a pose that has several (`manifest.variants`), not on the pose, and it
means "we have something better, discard this one". It clears only by being acted
on — nothing gets imported to clear it. Listed separately for that reason.

Answering all of these at once is the "full sprite cleanup" procedure in
docs/sprite-cleanup.md.

Usage:
  python3 list_replacements.py              # grouped by character
  python3 list_replacements.py --markdown   # a table to paste into a request doc
  python3 list_replacements.py --json
"""

import argparse
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(HERE, "..", "assets", "sprites", "manifest.json")
CHARACTERS_JS = os.path.join(HERE, "..", "src", "characters.js")
SPRITES_JS = os.path.join(HERE, "..", "src", "sprites.js")


def kind_list(const):
    """`[key, label]` pairs out of a `[[key, label], ...]` export in sprites.js."""
    src = open(SPRITES_JS).read()
    block = src[src.index(f"export const {const}"):]
    block = block[:block.index("];")]
    return re.findall(r'\["(\w+)", "(.*?)"\]', block)


def replacement_kinds():
    return kind_list("REPLACEMENT_KINDS")


def improvement_kinds():
    return kind_list("IMPROVEMENT_KINDS")


def variant_banked():
    """Fields a variant option carries, from VARIANT_PLACEMENT + VARIANT_REVIEW."""
    src = open(SPRITES_JS).read()
    out = []
    for const in ("VARIANT_PLACEMENT", "VARIANT_REVIEW"):
        block = src[src.index(f"export const {const}"):]
        block = block[:block.index("];")]
        out += re.findall(r'"(\w+)"', block)
    return out


def note_fields():
    """flag -> the key its free-text note is stored under, from NOTE_FIELDS."""
    src = open(SPRITES_JS).read()
    block = src[src.index("export const NOTE_FIELDS"):]
    block = block[:block.index("};")]
    return dict(re.findall(r"(\w+):\s*\"(\w+)\"", block))


NOTE_FIELDS = None      # filled on first use; the file is read once


def placement_rule():
    """kind -> "keep" | "reframe" | "discard" | "none", from KIND_PLACEMENT.

    Covers BOTH flags. A replacement always discards — every replacement kind is
    a redraw — so the interesting entries are the improvements: a re-key keeps
    every measurement, a re-crop moves the bounds and nothing else.
    """
    src = open(SPRITES_JS).read()
    block = src[src.index("export const KIND_PLACEMENT"):]
    block = block[:block.index("};")]
    return dict(re.findall(r'(\w+):\s*"(\w+)"', block))


PLACEMENT_NOTE = {
    "keep": "keep the existing placement and anchors as they are",
    "reframe": "re-measure, and shift the anchors by the change in framing",
    "discard": "re-measure from scratch; the old placement means nothing",
    "none": "no incoming art — nothing to place",
}

# `none` covers two different situations and they read nothing alike, so the
# kind gets the last word: a deletion has no art coming, while an alternate has
# art coming that lands beside the pose instead of on it.
KIND_DELIVERY_NOTE = {
    "alternate": "imported as a second drawing on the pose, with the selection "
                 "left alone — placement measured from scratch, as every "
                 "variant is",
}

# Reuse the audit tool's source scanning so "which states draw this frame" has
# one implementation rather than two that can disagree.
from audit_frame_sizes import anims_by_frame  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--markdown", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    man = json.load(open(MANIFEST))
    chars = man["characters"]
    src = open(CHARACTERS_JS).read()
    anims = anims_by_frame(src, list(chars))
    names = dict(re.findall(r'\n  ([a-z]+): \{\n(?:.*\n)*?    fullName: "(.+?)",', src))

    global NOTE_FIELDS
    NOTE_FIELDS = note_fields()
    kinds = dict(replacement_kinds())
    order = [k for k, _ in replacement_kinds()]
    want_kinds = dict(improvement_kinds())
    want_order = [k for k, _ in improvement_kinds()]
    placement = placement_rule()

    def collect(field, table, default):
        out = []
        for char in sorted(chars):
            for key, meta in sorted(chars[char].items()):
                flag = meta.get(field)
                if not flag:
                    continue
                # a legacy `true` predates the flag carrying a reason
                kind = default if flag is True else str(flag)
                if kind not in table:
                    print(f"  WARN {char}/{key}: unknown kind '{kind}', treating as {default}")
                    kind = default
                states = sorted(s for s, fr in anims[char].items() if key in fr)
                out.append({
                    "character": char,
                    "name": names.get(char, char),
                    "frame": key,
                    "file": meta.get("file", ""),
                    "kind": kind,
                    "kindLabel": table[kind],
                    "placement": placement.get(kind, "discard") if field == "needsReplacement" else None,
                    # Whatever the person who flagged it wrote. The kind says
                    # which of six shapes the fault has; this says what it
                    # actually is, and it is the only part an artist could not
                    # have worked out from the pose name.
                    "note": (meta.get(NOTE_FIELDS.get(field)) or "").strip(),
                    "states": states,
                    "used": bool(states),
                })
        return out

    def collect_variant_deletes():
        """Delete tags live on the variant OPTION, not the pose, because they
        name one drawing out of several. They are collected here so a cleanup
        sees them alongside the pose-level flags rather than having to walk the
        variants section separately."""
        out = []
        for char, poses in sorted((man.get("variants") or {}).items()):
            for key, entry in sorted(poses.items()):
                selected = chars.get(char, {}).get(key, {}).get("file")
                for opt in entry.get("options", []):
                    if opt.get("needsReplacement") != "delete":
                        continue
                    states = sorted(s for s, fr in anims[char].items() if key in fr)
                    out.append({
                        "character": char,
                        "name": names.get(char, char),
                        "frame": key,
                        "file": opt["file"],
                        "label": opt.get("label", ""),
                        "kind": "delete",
                        "kindLabel": kinds.get("delete", "Delete variant"),
                        "placement": "none",
                        "selected": opt["file"] == selected,
                        "keepInstead": selected,
                        "states": states,
                        "used": bool(states),
                    })
        return out

    rows = collect("needsReplacement", kinds, "replace")
    deletes = collect_variant_deletes()
    rows.sort(key=lambda r: (order.index(r["kind"]), r["character"], r["frame"]))
    wants = collect("wantsImprovement", want_kinds, "quality")
    wants.sort(key=lambda r: (want_order.index(r["kind"]), r["character"], r["frame"]))

    if args.json:
        print(json.dumps({"replacements": rows, "improvements": wants,
                          "deletions": deletes}, indent=2))
        return

    if not rows and not wants and not deletes:
        print("no sprites flagged")
        return

    def md_table(group):
        # The note column only appears when something in the group has one, so a
        # round nobody wrote notes for reads exactly as it always has.
        noted = any(r.get("note") for r in group)
        head = "| Character | Pose | Drives | What is wrong | File |" if noted \
            else "| Character | Pose | Drives | File |"
        print(head)
        print("|---|---|---|---|---|" if noted else "|---|---|---|---|")
        for r in group:
            drives = ", ".join(r["states"]) or "_unused_"
            cells = [r["name"], f"`{r['frame']}`", drives]
            if noted:
                cells.append(r.get("note") or "—")
            cells.append(f"`{r['file']}`")
            print("| " + " | ".join(cells) + " |")
        print()

    if args.markdown:
        if rows:
            print(f"## Needs replacement — {len(rows)} sprite(s)\n")
            for kind in order:
                group = [r for r in rows if r["kind"] == kind]
                if not group:
                    continue
                print(f"### {kinds[kind]}\n")
                delivery = KIND_DELIVERY_NOTE.get(
                    kind, PLACEMENT_NOTE[placement.get(kind, "discard")])
                print(f"On delivery: **{delivery}.**\n")
                md_table(group)
        if deletes:
            print(f"## Variants tagged for deletion — {len(deletes)} drawing(s)\n")
            print("Discarded at the next cleanup. The pose keeps whatever "
                  "drawing is selected; a tagged drawing that IS the selected "
                  "one has to be repointed first.\n")
            print("| Character | Pose | Drawing to delete | Keeping |")
            print("|---|---|---|---|")
            for r in deletes:
                warn = " **(currently selected)**" if r["selected"] else ""
                print(f"| {r['name']} | `{r['frame']}` | `{r['file']}`{warn} "
                      f"| `{r['keepInstead']}` |")
            print()
        if wants:
            print(f"## Improvement requests — {len(wants)} sprite(s)\n")
            print("Lower priority: the art works, it is just not as good as it "
                  "should be. Nothing is blocked by these.\n")
            for kind in want_order:
                group = [r for r in wants if r["kind"] == kind]
                if not group:
                    continue
                print(f"### {want_kinds[kind]}\n")
                md_table(group)
        return

    def listing(title, group_rows, table, group_order, show_placement):
        if not group_rows:
            return
        print(f"{len(group_rows)} sprite(s) {title}")
        for kind in group_order:
            group = [r for r in group_rows if r["kind"] == kind]
            if not group:
                continue
            delivery = KIND_DELIVERY_NOTE.get(
                kind, PLACEMENT_NOTE[placement.get(kind, "discard")])
            note = f"   [{delivery}]" if show_placement else ""
            print(f"\n{table[kind]}  ({len(group)}){note}")
            current = None
            for r in group:
                if r["character"] != current:
                    current = r["character"]
                    print(f"  {r['name']} ({current})")
                drives = ", ".join(r["states"]) or "not drawn by any animation"
                print(f"    {r['frame']:22} {drives}")
                if r.get("note"):
                    print(f"      \u201c{r['note']}\u201d")
        print()

    if deletes:
        print(f"{len(deletes)} variant drawing(s) tagged for deletion")
        for r in deletes:
            warn = "  <- CURRENTLY SELECTED, repoint the pose first" if r["selected"] else ""
            print(f"  {r['name']} {r['frame']:20} delete {r['file']}{warn}")
        print()

    listing("flagged for replacement", rows, kinds, order, True)
    listing("with an improvement request", wants, want_kinds, want_order, False)


if __name__ == "__main__":
    main()
