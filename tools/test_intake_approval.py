#!/usr/bin/env python3
"""Prove that landing a delivery never disturbs the drawing in the game.

The confirm step (assets/intake/README.md) rests on one promise: a replacement
is a proposal until somebody says yes, so importing changes what the WORKBENCH
shows and nothing about what a player sees. Two bugs broke that promise in ways
nothing would have caught, because both leave a manifest that validates, art
that renders, and a workbench that opens.

  1. Every delivery was written to a fixed `incoming/<pose>.png`. That is fine
     while a replacement is waiting, but the file outlives the wait: approving
     is a change of pointer, not a move, so an approved drawing goes on living
     in `incoming/`. The second delivery for that pose copied straight over the
     art the game was drawing. `awaitingApproval.live` was left naming a path
     that no longer held the live drawing, both sides of the approval
     comparison showed the same picture, and "Keep the current art" would have
     restored the newcomer.

  2. `live` was built from the pose's own fields. On a pose ALREADY awaiting
     approval those fields describe the drawing still waiting, not the one in
     play — so a second delivery promoted an unapproved drawing into the game.

Both are about the same thing: the pose's own `file` is not a reliable name for
"what the game shows". This asserts it directly, against a real import.

  python3 tools/test_intake_approval.py
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))

fails = 0


def check(ok, label, detail=""):
    global fails
    if not ok:
        fails += 1
    print(f"{'OK  ' if ok else 'FAIL'} {label}{'   ' + str(detail) if detail else ''}")


def live_file(man, char, key):
    """What the game draws for this pose — mirrors frameMeta() without preview."""
    meta = man["characters"][char][key]
    waiting = meta.get("awaitingApproval") or {}
    return (waiting.get("live") or {}).get("file") or meta["file"]


def run_import(work, char, key, plate):
    """One delivery of `plate` onto `char`/`key`, inside the sandbox `work`."""
    processed = os.path.join(work, "assets", "intake", "_processed")
    os.makedirs(os.path.join(processed, char), exist_ok=True)
    shutil.copy2(plate, os.path.join(processed, char, f"{key}.png"))
    # The importer reads its own measurement report, so run the real intake.
    shutil.copy2(plate, os.path.join(work, "assets", "intake", char, f"{key}.png")
                 if os.path.isdir(os.path.join(work, "assets", "intake", char))
                 else os.path.join(work, "assets", "intake", f"{key}.png"))
    subprocess.run([sys.executable, os.path.join(work, "tools", "intake.py")],
                   cwd=work, capture_output=True, check=True)
    appr = os.path.join(work, "appr.json")
    json.dump({char: [key]}, open(appr, "w"))
    subprocess.run([sys.executable, os.path.join(work, "tools", "intake_import.py"),
                    "--approve", appr], cwd=work, capture_output=True, check=True)
    return json.load(open(os.path.join(work, "assets", "sprites", "manifest.json")))


def main():
    man0 = json.load(open(os.path.join(ROOT, "assets", "sprites", "manifest.json")))
    # A pose with art on disk and nothing pending, so the first import below is
    # the ordinary case and the second is the one that used to break.
    pick = None
    for char, frames in man0["characters"].items():
        for key, meta in frames.items():
            if meta.get("awaitingApproval") or "/" in meta.get("file", "").replace(f"{char}/", ""):
                continue
            if os.path.exists(os.path.join(ROOT, "assets", "sprites", meta["file"])):
                pick = (char, key, meta["file"])
                break
        if pick:
            break
    if not pick:
        print("no settled pose with art on disk to test against")
        return 1
    char, key, original = pick
    print(f"testing two deliveries onto {char}/{key} (currently {original})\n")

    with tempfile.TemporaryDirectory() as work:
        for sub in ("tools", "src"):
            shutil.copytree(os.path.join(ROOT, sub), os.path.join(work, sub))
        os.makedirs(os.path.join(work, "assets", "sprites", char), exist_ok=True)
        os.makedirs(os.path.join(work, "assets", "intake", char), exist_ok=True)
        shutil.copy2(os.path.join(ROOT, "assets", "sprites", original),
                     os.path.join(work, "assets", "sprites", original))
        json.dump({"characters": {char: {key: dict(man0["characters"][char][key])}}},
                  open(os.path.join(work, "assets", "sprites", "manifest.json"), "w"))

        # Two different plates, so "did the file change" is answerable by size.
        plates = []
        for other in man0["characters"][char]:
            p = os.path.join(ROOT, "assets", "sprites",
                             man0["characters"][char][other].get("file", ""))
            if other != key and os.path.exists(p):
                plates.append(p)
            if len(plates) == 2:
                break
        if len(plates) < 2:
            print("not enough art to build two distinct deliveries")
            return 1

        man1 = run_import(work, char, key, plates[0])
        first_live = live_file(man1, char, key)
        first_pending = man1["characters"][char][key]["file"]
        check(first_live == original,
              "one delivery leaves the game on the art it was already drawing", first_live)
        check(first_pending != first_live,
              "and the workbench on the newcomer", first_pending)

        pending_bytes = open(os.path.join(work, "assets", "sprites", first_pending), "rb").read()

        man2 = run_import(work, char, key, plates[1])
        second_live = live_file(man2, char, key)
        second_pending = man2["characters"][char][key]["file"]

        check(second_live == original,
              "a SECOND delivery still leaves the game on the same art", second_live)
        check(second_pending != first_pending,
              "the new drawing gets its own file rather than overwriting the last",
              f"{first_pending} -> {second_pending}")
        check(open(os.path.join(work, "assets", "sprites", first_pending), "rb").read() == pending_bytes,
              "and the drawing it replaces is byte-for-byte untouched on disk")
        for who, f in (("live", second_live), ("pending", second_pending)):
            check(os.path.exists(os.path.join(work, "assets", "sprites", f)),
                  f"the {who} drawing is on disk", f)

    print()
    print(f"{fails} check(s) failed" if fails else "all checks passed")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
