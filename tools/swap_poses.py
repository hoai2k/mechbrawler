#!/usr/bin/env python3
"""Swap two poses of one character — the art AND everything measured about it.

For when a delivery draws the right two frames under the wrong two names. The
canonical case is a wind-up/strike pair arriving backwards: `attack_light_a`
holds the finished thrust and `attack_light_b` holds the blade drawn back, so
the jab plays strike-then-wind-up and the move appears to run in reverse.

WHY SWAP THE ART RATHER THAN RE-POINT THE ACTION

There are two ways to make the animation play correctly, and they are not
equally good:

  Re-point the action (`manifest.animOverrides`, written by the action
  workbench) says "when Nanami jabs, play _b then _a". It fixes the screen and
  changes nothing else — which is the problem. The pose keys go on lying. The
  sprite workbench still labels the wind-up "attack_light_b"; the asset request
  still describes `_a` as the wind-up when asking for a redraw; and the next
  delivery of a correctly-drawn `attack_light_a` lands under an override that
  reverses it again, silently, with nothing to catch it. The indirection
  outlives the reason for it.

  Swapping the art makes the names true. `attack_light_a` becomes the wind-up
  in the only sense the repo has of that word — the file at that path is one.
  Every consumer agrees without being told: the anim table, the workbench, the
  request doc, the intake that re-measures a redelivery of that key. There is
  nothing left over to remember.

So: an override is the right tool when an ACTION should draw a different pose
(Maki's dash borrowing her sprint cell). This is the other case — the drawing is
under the wrong name — and the fix belongs to the name.

WHAT MOVES

Everything measured about a drawing travels with it: size, framing, ground
contact, anchors, rotation, mirror, and the review flags standing against it.
Only `file` stays behind, because it is the pose's own path — the bytes at that
path are what get swapped.

  python3 tools/swap_poses.py nanami attack_light_a attack_light_b
  python3 tools/swap_poses.py nanami attack_light_a attack_light_b --dry-run
"""

import argparse
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SPRITES = os.path.join(HERE, "..", "assets", "sprites")
MANIFEST = os.path.join(SPRITES, "manifest.json")

# The pose's own identity, which does NOT travel with the drawing. Everything
# else in the entry describes the art and moves with it.
STAYS = {"file"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("character")
    ap.add_argument("pose_a")
    ap.add_argument("pose_b")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    man = json.load(open(MANIFEST))
    frames = man["characters"].get(args.character)
    if not frames:
        raise SystemExit(f"no character '{args.character}'")
    a, b = frames.get(args.pose_a), frames.get(args.pose_b)
    if not a or not b:
        raise SystemExit(f"{args.character} has no {args.pose_a} / {args.pose_b}")

    # A pose with several drawings has its placement banked per option, so a
    # swap here would leave those options describing the other pose's art.
    # Refuse rather than corrupt them; pick one drawing first, then swap.
    variants = man.get("variants", {}).get(args.character, {})
    clash = [p for p in (args.pose_a, args.pose_b) if p in variants]
    if clash:
        raise SystemExit(f"{', '.join(clash)} has variants — choose one drawing first")

    path_a = os.path.join(SPRITES, a["file"])
    path_b = os.path.join(SPRITES, b["file"])
    for p in (path_a, path_b):
        if not os.path.exists(p):
            raise SystemExit(f"missing on disk: {p}")

    moved = sorted(set(a) | set(b) - STAYS)
    print(f"{args.character}: {args.pose_a} <-> {args.pose_b}")
    print(f"  art: {a['file']} <-> {b['file']}")
    print(f"  moving with it: {', '.join(k for k in moved if k not in STAYS)}")
    if args.dry_run:
        print("  (dry run — nothing written)")
        return

    new_a = {k: v for k, v in b.items() if k not in STAYS}
    new_b = {k: v for k, v in a.items() if k not in STAYS}
    new_a["file"] = a["file"]
    new_b["file"] = b["file"]
    frames[args.pose_a] = new_a
    frames[args.pose_b] = new_b

    tmp = path_a + ".swap"
    os.rename(path_a, tmp)
    os.rename(path_b, path_a)
    os.rename(tmp, path_b)

    with open(MANIFEST, "w") as fh:
        json.dump(man, fh, indent=1)
        fh.write("\n")
    print("  swapped; manifest updated")


if __name__ == "__main__":
    main()
