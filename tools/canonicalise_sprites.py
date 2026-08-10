#!/usr/bin/env python3
"""Give every pose's drawing the pose's own name, and archive the rest.

WHY
---
A delivery lands in `<char>/incoming/<pose>.png` and stays there. Approving it
is a change of pointer, not a move, so the drawing the game actually draws goes
on living at a staging path — and the file called `<char>/<pose>.png`, the name
that reads as "this is the art for this pose", is whatever the pose used to
use. After a few rounds the tree stops describing the game: `hanami/idle_a.png`
is a drawing nothing draws, and what you see in a match is
`hanami/incoming/idle_a-2.png`.

This puts the names back on the drawings:

  * the drawing a pose points at moves to `<char>/<pose>.png`
  * whatever held that name and is still referenced moves to
    `<char>/archive/<pose>_2.png`, `_3.png`, ... — kept, not deleted, because
    a superseded drawing is the only copy of art that shipped for a while and
    the workbench still offers it as an alternate
  * orphans left in `incoming/` by earlier rounds move to the archive too, so
    `incoming/` holds only what is actually incoming

Every reference in the manifest is rewritten to match: pose files, the `live`
block of a held-back replacement, every variant option, and the alternate art
sets. Nothing is deleted and nothing is left dangling — both are checked before
anything is written.

SHARED DRAWINGS
---------------
A file can serve more than one pose: the sprite workbench can point a pose at
another pose's drawing (a prone body made from a standing one), and the sheet
cells are shared by construction. One file cannot have two canonical names, so
the pose whose name the drawing already carries keeps it and the borrowers
point at that path. Sheet cells (`r1c2.png`) are left alone entirely — their
name means "row 1, column 2", which is worth more than a pose name they only
half belong to.

Run after applying a round's adjustments:

    python3 tools/canonicalise_sprites.py --dry-run
    python3 tools/canonicalise_sprites.py
"""

import argparse
import collections
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
SPRITES = os.path.join(ROOT, "assets", "sprites")
MANIFEST = os.path.join(SPRITES, "manifest.json")

ARCHIVE_DIR = "archive"
PENDING_DIR = "incoming"

# `r4c1.png` — an extraction grid cell, named for where it sits on the sheet.
SHEET_CELL = re.compile(r"^r\d+c\d+$")

# `idle_a-2.png` / `idle_a-2` — intake's second-delivery suffix.
DELIVERY_SUFFIX = re.compile(r"-\d+$")


def stem(path):
    return os.path.splitext(os.path.basename(path))[0]


def home_pose(path):
    """The pose a drawing's own NAME claims, ignoring where it is stored and
    which delivery it was. `hanami/incoming/idle_a-2.png` -> `idle_a`."""
    return DELIVERY_SUFFIX.sub("", stem(path))


def char_of(path):
    return path.split("/")[0]


def collect(man):
    """Every reference to a sprite file, as (file, setter) pairs.

    The setter writes a new path back into whichever object holds it, so the
    rewrite does not have to walk the manifest a second time and cannot miss a
    place the collection found.
    """
    refs = collections.defaultdict(list)

    def note(file, setter, kind, char, pose):
        if file:
            refs[file].append({"set": setter, "kind": kind, "char": char, "pose": pose})

    for char, poses in (man.get("characters") or {}).items():
        for pose, meta in poses.items():
            if not isinstance(meta, dict):
                continue
            note(meta.get("file"), lambda v, m=meta: m.__setitem__("file", v),
                 "pose", char, pose)
            live = (meta.get("awaitingApproval") or {}).get("live")
            if isinstance(live, dict):
                note(live.get("file"), lambda v, l=live: l.__setitem__("file", v),
                     "live", char, pose)
    for char, poses in (man.get("variants") or {}).items():
        for pose, entry in poses.items():
            for opt in entry.get("options", []):
                note(opt.get("file"), lambda v, o=opt: o.__setitem__("file", v),
                     "option", char, pose)
    for char, poses in (man.get("alternates") or {}).items():
        for pose, meta in poses.items():
            if isinstance(meta, dict):
                note(meta.get("file"), lambda v, m=meta: m.__setitem__("file", v),
                     "alternate", char, pose)
    return refs


def on_disk():
    out = set()
    for root, _, files in os.walk(SPRITES):
        for name in files:
            if name.endswith(".png"):
                out.add(os.path.relpath(os.path.join(root, name), SPRITES))
    return out


def plan(man, files):
    """file -> new path, for everything that should move."""
    refs = collect(man)
    targets = {}
    claimed = {}       # canonical path -> file that won it

    def leave_alone(path):
        # Sheet cells keep their grid name, and an alternate art set is a
        # parallel tree with its own canonical names.
        return SHEET_CELL.match(stem(path)) or "_alt/" in path or "/" not in path

    # 1. The drawing each pose DRAWS claims the pose's name. A drawing serving
    #    several poses is claimed by the one whose name it already carries;
    #    failing that, by the first pose in the file, so the choice is stable
    #    across runs rather than depending on dict order.
    live_by_file = collections.defaultdict(list)
    for file, uses in refs.items():
        for use in uses:
            if use["kind"] == "pose":
                live_by_file[file].append((use["char"], use["pose"]))
    for file, poses in sorted(live_by_file.items()):
        if leave_alone(file):
            continue
        char = char_of(file)
        mine = sorted(p for c, p in poses if c == char)
        if not mine:
            continue
        owner = home_pose(file) if home_pose(file) in mine else mine[0]
        want = f"{char}/{owner}.png"
        if want in claimed:
            continue                      # another drawing already took it
        claimed[want] = file
        if file != want:
            targets[file] = want

    # 2. Everything else that is referenced but not a pose's current drawing,
    #    and everything orphaned in incoming/, goes to the archive under the
    #    name of the pose it belongs to.
    used_names = collections.Counter()

    def archive_path(char, base):
        for n in range(2, 200):
            rel = f"{char}/{ARCHIVE_DIR}/{base}_{n}.png"
            if rel not in claimed and rel not in targets.values() and rel not in files:
                return rel
        raise RuntimeError(f"{char}/{base}: nowhere left to archive to")

    def wants_archive(path):
        if leave_alone(path) or path in targets or path in claimed:
            return False
        # Already parked in the archive, or already the canonical drawing of
        # the pose it is named for: nothing to do.
        if f"/{ARCHIVE_DIR}/" in path:
            return False
        return f"/{PENDING_DIR}/" in path or claimed.get(path) not in (None, path)

    for file in sorted(set(refs) | files):
        if file in targets or file in claimed.values():
            continue
        if leave_alone(file) or f"/{ARCHIVE_DIR}/" in file:
            continue
        char = char_of(file)
        canonical = f"{char}/{stem(file)}.png"
        # A file sitting on a canonical name that a different drawing has now
        # won, or any leftover in the staging directory, is what the archive is
        # for. A file at a canonical name nobody claimed stays where it is —
        # it is still the art for that pose as far as the tree is concerned.
        displaced = file in claimed and claimed[file] != file
        if not displaced and f"/{PENDING_DIR}/" not in file:
            continue
        base = home_pose(file)
        used_names[(char, base)] += 1
        targets[file] = archive_path(char, base)
    return targets, refs


def apply_moves(targets, dry_run):
    """Move every file, without letting one land on another before it has gone.

    Two shapes need care and they are the same shape: a destination that is
    also somebody's source. Straight `a -> b` while `b -> c` clobbers `b` if it
    runs first, and `a -> b, b -> a` clobbers whichever runs first whatever the
    order. So every file that something else is going to land on is moved aside
    to a temporary name first, and the real moves run afterwards. Doing it for
    both cases rather than only for cycles is what makes the order irrelevant,
    which is the only way to be sure a drawing cannot be overwritten.
    """
    moves = [(src, dst) for src, dst in sorted(targets.items()) if src != dst]
    dests = {dst for _, dst in moves}
    tmp_of = {src: f"{src}.canon-tmp" for src, _ in moves if src in dests}

    def move(src, dst, clobber=False):
        os.makedirs(os.path.dirname(os.path.join(SPRITES, dst)), exist_ok=True)
        if dry_run:
            return
        if not clobber and os.path.exists(os.path.join(SPRITES, dst)):
            raise RuntimeError(f"would overwrite {dst} with {src}")
        res = subprocess.run(["git", "mv", "-f", src, dst], cwd=SPRITES,
                             capture_output=True, text=True)
        if res.returncode:
            # Not tracked by git (a brand-new delivery), so move it plainly.
            os.replace(os.path.join(SPRITES, src), os.path.join(SPRITES, dst))

    for src, tmp in sorted(tmp_of.items()):
        move(src, tmp, clobber=True)      # its own name, suffixed: nothing there
    for src, dst in moves:
        move(tmp_of.get(src, src), dst)
    return moves


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    man = json.load(open(MANIFEST))
    files = on_disk()
    before = len(files)
    targets, refs = plan(man, files)

    if not targets:
        print("every drawing is already where it belongs")
        return 0

    # Check before touching anything: the plan must be a bijection, or a move
    # would quietly eat a drawing.
    dests = collections.Counter(targets.values())
    clashes = [d for d, n in dests.items() if n > 1]
    if clashes:
        print("REFUSING: two drawings want the same name:", clashes[:5], file=sys.stderr)
        return 1
    landing = (files - set(targets)) | set(targets.values())
    if len(landing) != before:
        print(f"REFUSING: {before} files in, {len(landing)} out", file=sys.stderr)
        return 1

    moves = apply_moves(targets, args.dry_run)
    for file, dst in sorted(targets.items()):
        where = "canonical" if f"/{ARCHIVE_DIR}/" not in dst else "archived"
        print(f"  {where:9s} {file} -> {dst}")

    # Rewrite every reference through the setters the collection captured.
    rewritten = 0
    for file, uses in refs.items():
        dst = targets.get(file)
        if not dst:
            continue
        for use in uses:
            use["set"](dst)
            rewritten += 1

    # Nothing may point at a file that is not there.
    after = (files - set(targets)) | set(targets.values())
    dangling = [f for f in collect(man) if f not in after]
    if dangling:
        print("REFUSING: references left dangling:", dangling[:5], file=sys.stderr)
        return 1

    print(f"\n{len(moves)} file(s) moved, {rewritten} reference(s) rewritten, "
          f"{before} file(s) before and after")
    if args.dry_run:
        print("(dry run — nothing written)")
        return 0
    with open(MANIFEST, "w") as fh:
        json.dump(man, fh, indent=2)
        fh.write("\n")
    print("manifest updated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
