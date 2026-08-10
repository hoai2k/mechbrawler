#!/usr/bin/env python3
"""Stage recently-changed shippable files into `v2/updates/`, keeping paths.

There is no VCS here, so "changed" means "modified more recently than the
cutoff". The point is a folder that can be uploaded on its own: only files the
game or the workbench actually needs, never the debug boards and reference
sheets, which are regenerated on demand and would dwarf the real payload.

  python3 collect_updates.py                 # changed in the last 12 hours
  python3 collect_updates.py --hours 48
  python3 collect_updates.py --since 2026-08-06T09:00
  python3 collect_updates.py --list          # show what would be staged
"""

import argparse
import datetime as dt
import json
import os
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
DEST = os.path.join(ROOT, "updates")
# What has ever been staged, kept OUTSIDE updates/ so it survives the folder
# being emptied after an upload. Without it, `--hours N` guesses at a window,
# and anything changed before that window but never uploaded is silently lost —
# which is exactly how the workbench's new `actions.js` went unstaged.
LEDGER = os.path.join(HERE, ".updates-ledger.json")

# Debug boards, contact sheets and source reference art are working material,
# not deliverables — they are rebuilt from the tools whenever needed.
# `intake` holds art the user delivered plus its processed copies — inbound
# material, regenerable with `intake.py`, and never read by the game. Staging
# it would send hundreds of megabytes straight back to whoever supplied it.
EXCLUDE_DIRS = {"updates", "debug", "reference", "intake",
                "__pycache__", ".git", "node_modules"}
EXCLUDE_NAMES = {".DS_Store", ".updates-ledger.json"}
EXCLUDE_EXT = {".pyc"}


def walk(since):
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for name in files:
            if name in EXCLUDE_NAMES or os.path.splitext(name)[1] in EXCLUDE_EXT:
                continue
            path = os.path.join(base, name)
            if os.path.getmtime(path) >= since:
                yield os.path.relpath(path, ROOT)


def load_ledger():
    if not os.path.exists(LEDGER):
        return {}
    with open(LEDGER) as f:
        return json.load(f)


def unstaged(ledger):
    """Every tracked file newer than the last time it was staged.

    This is the honest answer to "what still needs uploading", and unlike a
    time window it cannot miss a file just because someone edited it hours ago.
    """
    out = []
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for name in files:
            if name in EXCLUDE_NAMES or os.path.splitext(name)[1] in EXCLUDE_EXT:
                continue
            path = os.path.join(base, name)
            rel = os.path.relpath(path, ROOT)
            if os.path.getmtime(path) > ledger.get(rel, 0) + 1:
                out.append(rel)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hours", type=float, default=12)
    ap.add_argument("--since", help="ISO timestamp; overrides --hours")
    ap.add_argument("--new", action="store_true",
                    help="everything changed since it was last staged (recommended)")
    ap.add_argument("--list", action="store_true", help="report only, copy nothing")
    ap.add_argument("--keep", action="store_true",
                    help="add to updates/ instead of replacing it")
    args = ap.parse_args()

    ledger = load_ledger()
    if args.new:
        rels = sorted(unstaged(ledger))
    else:
        if args.since:
            since = dt.datetime.fromisoformat(args.since).timestamp()
        else:
            since = dt.datetime.now().timestamp() - args.hours * 3600
        rels = sorted(walk(since))
    if not rels:
        print("nothing changed since the cutoff")
        return

    if args.list:
        for r in rels:
            print("  " + r)
        print(f"({len(rels)} file(s) — nothing copied)")
        return

    if os.path.isdir(DEST) and not args.keep:
        shutil.rmtree(DEST)
    total = 0
    for rel in rels:
        dst = os.path.join(DEST, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(os.path.join(ROOT, rel), dst)
        total += os.path.getsize(dst)
        print("  " + rel)
    for rel in rels:
        ledger[rel] = os.path.getmtime(os.path.join(ROOT, rel))
    with open(LEDGER, "w") as f:
        json.dump(ledger, f, indent=1, sort_keys=True)
    print(f"staged {len(rels)} file(s), {total / 1024:.0f} KB -> {DEST}")
    print(f"ledger now tracks {len(ledger)} file(s)")


if __name__ == "__main__":
    main()
