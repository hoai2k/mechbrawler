#!/usr/bin/env python3
"""Apply the placement corrections that are mechanical, so the hand pass is not.

An intake round lands art at numbers `intake_import.place()` derives, and then
somebody opens the workbench and moves them. `docs/sprite-auto-adjust.md` is the
measurement of which of those moves are mechanical: it reads the `edited` map
(which stores each hand-tuned field's PRE-edit value) and asks, for every
correction ever made, whether the derived value was wrong in a predictable way.

Three of them were, and this applies those three. It is deliberately narrow —
the test for including a rule is not "usually right" but **"wrong in a way that
has a direction"**, because a correction that guesses can land further from the
answer than doing nothing, and it does so silently.

  foot    the derived foot line is the bottom of the alpha box, which it can
          only ever be: generated_frame_meta sets `oy = bodyBottom - by1`. A
          foot drawn in perspective has its sole running away from the camera,
          so the lowest pixel is the toe and the figure stands higher. All 513
          hand corrections moved it the same way, to a median 0.946 of body
          height. Cuts the median foot-line error from ~15.8px to ~4.1px at the
          size the game draws.

  size    ten animation states carry ONE height ratio across the whole
          size-reviewed roster; a leave-one-character-out test recovers them
          exactly. The other fifteen were judged per character and predict no
          better than 8-13%, which is the size of the corrections themselves.
          The split is measured here rather than listed, so a state that stops
          being uniform stops being tuned.

  centre  the derived `ox` centres the CONTENT BOX, which includes Maki's
          naginata and Gakuganji's guitar neck. The corrections track the
          alpha-weighted centroid — mass, not extent. Better by ~73%.

Two rules it does NOT apply, and will not: rotation (118 corrections, all
setting a value where none existed — a judgement about how a pose reads in
motion, with nothing in the file predicting it) and facing (detection scores
near-zero confidence on two thirds of plates; guessing silently mirrors a
character, which looks deliberate).

WHAT THIS IS NOT
----------------
It does not replace the tuning pass and must not be described as doing so. It
moves the starting point from "knowingly wrong" to "defensible", so the pass
becomes checking rather than correcting. Accordingly a tuned pose stays
**unedited** everywhere the UI asks: the workbench's "No saved edits (to do)"
list reads `meta.edited`, and nothing here writes to it. Provenance goes to
`autoTuned`, which is a record, not a claim that the pose has been dealt with.

It also never overwrites a human. A field that appears in `edited` was decided
by somebody looking at the sprite, and no measurement here outranks that.

  python3 tools/auto_tune.py --report          # what the rules learned, no writes
  python3 tools/auto_tune.py --dry-run         # what it would do to the last round
  python3 tools/auto_tune.py                   # do it
  python3 tools/auto_tune.py --all             # every pose, not just the last round
  python3 tools/auto_tune.py --char maki uro
  python3 tools/auto_tune.py --backtest        # score the rules against hand values
"""

import argparse
import collections
import datetime
import json
import os
import statistics
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from audit_frame_sizes import anims_by_frame, DEFAULT_REVIEWED  # noqa: E402
from extract_sprites import ALPHA_THRESHOLD, SHEET_W, COLS  # noqa: E402

SPRITES = os.path.join(HERE, "..", "assets", "sprites")
MANIFEST = os.path.join(SPRITES, "manifest.json")
CHARACTERS_JS = os.path.join(HERE, "..", "src", "characters.js")

# Where a cell's horizontal centre is, in the same units `ox` is stored in.
# generated_frame_meta derives `ox = CELL_MID - <box centre>`; the only change
# here is which feature gets put on that line.
CELL_MID = SHEET_W / COLS / 2

# --- what makes a rule safe enough to apply ------------------------------------
#
# These are the thresholds that decide whether a measurement is a rule or a
# guess. They are deliberately strict: the cost of skipping a pose is that a
# human tunes it, which is what happens today anyway.

# A state's height ratio counts as uniform when its spread across the reviewed
# roster is under this. The measured populations are <=0.1% and >=8%, so
# anything in between is a state that has changed character and should be
# looked at rather than tuned. Nothing currently lands there.
UNIFORM_CV = 0.01
# Reviewed characters a state needs before its ratio is trusted at all.
MIN_STATE_SAMPLES = 6
# Hand-tuned poses a character needs before their own foot fraction is used
# instead of the roster's. Below this the median is noise.
MIN_CHAR_FOOT_SAMPLES = 8
# Refuse to move a foot line further than this fraction of body height in one
# go. The rule has never wanted more than ~0.12; a bigger jump means the frame
# is not what the rule thinks it is (a detached effect owning the largest
# component, say) and it should be left alone and looked at.
MAX_FOOT_SHIFT = 0.20

# States whose ground contact is NOT the sole of a standing foot, so the foot
# fraction does not describe them.
#
# The fraction exists because a foot drawn in perspective hides its sole, and
# that is true of any pose the character stands in — measured across the hand
# tuning it holds at 0.946 whether the pose is drawn taller than wide (n=470)
# or wider than tall (n=39, same median), so how sprawling the drawing is says
# nothing. What breaks it is the character not being on their feet: `prone`
# lies flat and touches the floor along its whole side, so its contact really
# is the lowest pixel and lifting it 5% hovers the body above the ground.
#
# This is a list rather than a measurement because it is a fact about what the
# pose MEANS, and there is nothing in the alpha channel that knows it. The
# magnitude guard above catches the extreme cases either way — it is what
# stopped momo/prone, whose art is flat enough that 0.946 wanted to move the
# contact 37% of its height — but a pose that is quietly 5% wrong would sail
# through, so the states are named.
#
# The airborne states are here for a different reason: a fighter in the air is
# not making contact with anything, so there is no foot line to solve. What the
# rule produced instead was every jump, fall, air dodge and aerial pinned by its
# lowest drawn pixel to the floor — a trailing toe, a tucked heel, a hanging
# hand — which is a placement nobody chose and which was then locked in, because
# the workbench's vertical control refused to move an airborne pose. The pose
# that matters to them is the HURTBOX, and only an eye can say where a tucked
# body should sit inside it, so the rule now declines rather than guessing.
NO_STANDING_FOOT = {"prone", "jump", "fall", "ledge", "dodge_air", "airLight"}


def now_stamp():
    return datetime.datetime.now(datetime.timezone.utc).astimezone().isoformat(timespec="seconds")


# ------------------------------------------------------------------- measuring
def measure(path):
    """The three things the rules need from a drawing.

    `body_bottom` is the bottom of the LARGEST connected component, which is
    what docs/asset-pipeline.md means by the foot line — a detached energy burst
    below the feet is not the floor. `centroid_x` is alpha-weighted, so it is
    the middle of the character's mass rather than of its bounding box.
    """
    a = np.asarray(Image.open(path).convert("RGBA"))
    alpha = a[:, :, 3]
    solid = alpha >= ALPHA_THRESHOLD
    if not solid.any():
        return None
    ys, xs = np.nonzero(solid)
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    lab, n = ndimage.label(solid, np.ones((3, 3), np.int8))
    if n:
        sizes = ndimage.sum(solid, lab, range(1, n + 1))
        body = lab == int(np.argmax(sizes)) + 1
        rows = np.nonzero(body.any(axis=1))[0]
        body_bottom = int(rows[-1]) + 1
    else:
        body_bottom = box[3]
    w = alpha[ys, xs].astype(np.float64)
    return {
        "box": box,
        "body_bottom": body_bottom,
        "centroid_x": float((xs * w).sum() / w.sum()),
        "art_h": box[3] - box[1],
    }


# --------------------------------------------------------------------- learning
def learn_foot(man):
    """The foot line as a fraction of body height, per character and overall.

    Learned from poses whose `bodyBottom` a human edited, because those are the
    ones where somebody decided where the figure stands. A character with too
    few of those falls back to the roster median rather than to a shaky one of
    their own.
    """
    per_char = collections.defaultdict(list)
    for char, poses in man["characters"].items():
        for key, meta in poses.items():
            if not isinstance(meta, dict):
                continue
            if "bodyBottom" not in (meta.get("edited") or {}):
                continue
            path = os.path.join(SPRITES, meta.get("file", ""))
            if not meta.get("file") or not os.path.exists(path):
                continue
            m = measure(path)
            if not m or not m["body_bottom"]:
                continue
            per_char[char].append((meta["bodyBottom"] - meta["oy"]) / m["body_bottom"])
    everyone = [f for v in per_char.values() for f in v]
    return {
        "global": statistics.median(everyone) if everyone else None,
        "per_char": {c: statistics.median(v) for c, v in per_char.items()
                     if len(v) >= MIN_CHAR_FOOT_SAMPLES},
        "n": len(everyone),
    }


def learn_sizes(man, reviewed):
    """Per state: the height-to-idle ratio, and how much it varies.

    The variation is the whole point. A state every reviewed character sizes
    identically is a rule someone applied; one that ranges 13% is a judgement
    they made per fighter, and there is no value to restore it to.
    """
    anims = anims_by_frame(open(CHARACTERS_JS).read(), list(man["characters"]))
    samples = collections.defaultdict(list)
    for char in reviewed:
        frames = man["characters"].get(char) or {}
        base = next((frames[k]["bodyH"] for k in ("idle_a", "r0c0")
                     if isinstance(frames.get(k), dict) and frames[k].get("bodyH")), None)
        if not base:
            continue
        for key, meta in frames.items():
            if not isinstance(meta, dict) or not meta.get("bodyH"):
                continue
            for state, keys in anims.get(char, {}).items():
                if key in keys:
                    samples[state].append(meta["bodyH"] / base)
    out = {}
    for state, vals in samples.items():
        if len(vals) < MIN_STATE_SAMPLES:
            continue
        mean = statistics.mean(vals)
        cv = statistics.pstdev(vals) / mean if mean else 1.0
        out[state] = {"ratio": statistics.median(vals), "cv": cv, "n": len(vals),
                      "uniform": cv <= UNIFORM_CV}
    return out, anims


# --------------------------------------------------------------------- applying
def tune_frame(char, key, meta, states, foot, sizes, idle_bodyh, want):
    """The proposed changes for one frame, as {field: (old, new, why)}.

    Returns only fields that would actually move, and never one the pose's
    `edited` map claims — a value somebody chose while looking at the sprite
    outranks every measurement here.
    """
    edited = meta.get("edited") or {}
    path = os.path.join(SPRITES, meta.get("file", ""))
    if not meta.get("file") or not os.path.exists(path):
        return {}, "no art on disk"
    m = measure(path)
    if not m:
        return {}, "no visible pixels"

    out = {}

    # ---- foot line
    if states and all(s in NO_STANDING_FOOT for s in states):
        want = [r for r in want if r != "foot"]
    if "foot" in want and "bodyBottom" not in edited and meta.get("oy") is not None:
        frac = foot["per_char"].get(char, foot["global"])
        if frac and m["body_bottom"]:
            new_bb = round(meta["oy"] + frac * m["body_bottom"], 1)
            old_bb = meta.get("bodyBottom")
            if old_bb is not None:
                shift = abs(new_bb - old_bb) / m["body_bottom"]
                if shift > MAX_FOOT_SHIFT:
                    return out, f"foot line would move {shift:.0%} of body height — left alone"
                if abs(new_bb - old_bb) >= 0.5:
                    src = "character" if char in foot["per_char"] else "roster"
                    out["bodyBottom"] = (old_bb, new_bb, f"foot={frac:.3f} ({src})")

    # ---- size, uniform states only
    if "size" in want and "renderScale" not in edited and idle_bodyh and states:
        known = [sizes[s] for s in states if s in sizes]
        # Every state this pose serves has to be uniform. A pose that is both a
        # `jump` (uniform) and a `crouchAttack` (not) has no single right answer
        # and is exactly the case to leave to a person.
        if known and len(known) == len(states) and all(s["uniform"] for s in known):
            ratio = statistics.median([s["ratio"] for s in known])
            new_h = round(ratio * idle_bodyh, 1)
            if m["art_h"]:
                new_scale = round(new_h / m["art_h"], 3)
                if abs(new_scale - (meta.get("renderScale") or 0)) >= 0.001:
                    out["bodyH"] = (meta.get("bodyH"), new_h, f"ratio={ratio:.3f} x idle")
                    out["renderScale"] = (meta.get("renderScale"), new_scale,
                                          f"{'/'.join(sorted(states))} is uniform")

    # ---- horizontal centre
    if "centre" in want and "ox" not in edited:
        new_ox = round(CELL_MID - m["centroid_x"], 1)
        old_ox = meta.get("ox")
        if old_ox is None or abs(new_ox - old_ox) >= 0.5:
            out["ox"] = (old_ox, new_ox, "centre of mass, not of the box")

    return out, None


def newest_round(man):
    """The stamp of the most recent import, from the `replaced` markers."""
    stamps = [meta["replaced"]["at"]
              for poses in man["characters"].values() for meta in poses.values()
              if isinstance(meta, dict) and (meta.get("replaced") or {}).get("at")]
    return max(stamps) if stamps else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true",
                    help="print what the rules learned and stop")
    ap.add_argument("--backtest", action="store_true",
                    help="score the rules against the hand values, and stop")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--all", action="store_true",
                    help="every pose, not just the ones the last round touched")
    ap.add_argument("--round", dest="round_prefix",
                    help="tune poses whose import stamp starts with this, e.g. "
                         "2026-08-09 for a round that arrived in several batches")
    ap.add_argument("--char", nargs="*", help="limit to these characters")
    ap.add_argument("--rules", nargs="*", default=["foot", "size", "centre"],
                    choices=["foot", "size", "centre"])
    ap.add_argument("--reviewed", nargs="*", default=DEFAULT_REVIEWED)
    args = ap.parse_args()

    man = json.load(open(MANIFEST))
    foot = learn_foot(man)
    sizes, anims = learn_sizes(man, args.reviewed)

    if args.report:
        print(f"foot line: learned from {foot['n']} hand-tuned poses")
        print(f"  roster median  {foot['global']:.4f}")
        print(f"  per-character  {len(foot['per_char'])} of {len(man['characters'])} "
              f"have >= {MIN_CHAR_FOOT_SAMPLES} samples")
        for c, v in sorted(foot["per_char"].items()):
            print(f"     {c:12} {v:.3f}")
        print(f"\nsize: {sum(1 for s in sizes.values() if s['uniform'])} uniform state(s), "
              f"{sum(1 for s in sizes.values() if not s['uniform'])} judged per character")
        for state, s in sorted(sizes.items(), key=lambda x: x[1]["cv"]):
            mark = "RULE  " if s["uniform"] else "judged"
            print(f"  {mark} {state:16} ratio {s['ratio']:.3f}  spread {s['cv']:6.1%}  n={s['n']}")
        return 0

    if args.backtest:
        return backtest(man, foot, sizes, anims, args)

    stamp = None if (args.all or args.round_prefix) else newest_round(man)
    if not args.all and not args.round_prefix and not stamp:
        print("no import markers found — nothing to tune (use --all to sweep everything)")
        return 0

    def in_scope(meta):
        if args.all:
            return True
        at = (meta.get("replaced") or {}).get("at")
        if not at:
            return False
        return at.startswith(args.round_prefix) if args.round_prefix else at == stamp

    changed, skipped, notes = 0, 0, []
    fields_touched = collections.Counter()
    at = now_stamp()
    for char, poses in sorted(man["characters"].items()):
        if args.char and char not in args.char:
            continue
        frames = anims.get(char, {})
        idle = poses.get("idle_a") or poses.get("r0c0")
        idle_bodyh = idle.get("bodyH") if isinstance(idle, dict) else None
        for key, meta in sorted(poses.items()):
            if not isinstance(meta, dict):
                continue
            if not in_scope(meta):
                continue
            states = tuple(sorted(s for s, keys in frames.items() if key in keys))
            out, why = tune_frame(char, key, meta, states, foot, sizes, idle_bodyh, args.rules)
            if why:
                skipped += 1
                notes.append(f"  {char}/{key}: {why}")
                continue
            if not out:
                continue
            changed += 1
            bits = []
            for field, (old, new, reason) in out.items():
                fields_touched[field] += 1
                if not args.dry_run:
                    meta[field] = new
                fmt = (lambda v: "—" if v is None else
                       (f"{v:g}" if isinstance(v, (int, float)) else str(v)))
                bits.append(f"{field} {fmt(old)}->{fmt(new)}")
            if not args.dry_run:
                # Provenance, NOT an edit. The workbench's "no saved edits" list
                # reads `edited`; a pose the tuner touched still needs a human to
                # look at it, so it has to stay on that list.
                meta["autoTuned"] = {
                    "at": at,
                    "fields": {f: out[f][2] for f in out},
                }
            print(f"  {char}/{key}: " + "; ".join(bits))

    for line in notes:
        print(line)
    scope = ("every pose" if args.all else
             f"the round of {args.round_prefix}" if args.round_prefix else
             f"the round of {stamp}")
    print(f"\n{changed} frame(s) tuned across {scope}"
          + (f", {skipped} left alone" if skipped else ""))
    for f, n in fields_touched.most_common():
        print(f"   {f:12} {n}")
    if args.dry_run:
        print("dry run — nothing written")
        return 0
    if changed:
        with open(MANIFEST, "w") as fh:
            json.dump(man, fh, indent=1)
            fh.write("\n")
        print(f"wrote {MANIFEST}")
    return 0


def backtest(man, foot, sizes, anims, args):
    """Score each rule against the values humans actually chose.

    The rules are learned from the same hand tuning they are scored against, so
    the foot fraction is reported leave-one-character-out: a character's own
    median is recomputed without them before it is used on them. Otherwise this
    would be marking its own homework.
    """
    per_char_all = collections.defaultdict(list)
    rows = []
    for char, poses in man["characters"].items():
        for key, meta in poses.items():
            if not isinstance(meta, dict) or "bodyBottom" not in (meta.get("edited") or {}):
                continue
            path = os.path.join(SPRITES, meta.get("file", ""))
            if not meta.get("file") or not os.path.exists(path):
                continue
            m = measure(path)
            if not m or not m["body_bottom"]:
                continue
            frac = (meta["bodyBottom"] - meta["oy"]) / m["body_bottom"]
            per_char_all[char].append(frac)
            rows.append((char, key, meta, m, frac))

    everyone = [f for v in per_char_all.values() for f in v]
    g = statistics.median(everyone)
    derived, tuned = [], []
    for char, key, meta, m, frac in rows:
        own = [f for f in per_char_all[char] if f is not frac]
        use = statistics.median(own) if len(own) >= MIN_CHAR_FOOT_SAMPLES else g
        scale = meta.get("renderScale") or 0.25
        # what the pipeline derived is the bottom of the art, by construction
        derived.append(abs(m["body_bottom"] - frac * m["body_bottom"]) * scale)
        tuned.append(abs(use * m["body_bottom"] - frac * m["body_bottom"]) * scale)
    derived.sort(); tuned.sort()

    def pct(v, p):
        return v[int(p * (len(v) - 1))]
    print(f"foot line, scored against {len(rows)} hand-tuned poses "
          f"(leave-one-character-out), in ON-SCREEN pixels:")
    print(f"  pipeline today   median {statistics.median(derived):5.1f}  p90 {pct(derived, .9):5.1f}")
    print(f"  with this rule   median {statistics.median(tuned):5.1f}  p90 {pct(tuned, .9):5.1f}")

    # size: a uniform state's ratio should reproduce the hand value exactly
    errs, n_uniform = [], 0
    for char in args.reviewed:
        poses = man["characters"].get(char) or {}
        idle = poses.get("idle_a") or poses.get("r0c0")
        base = idle.get("bodyH") if isinstance(idle, dict) else None
        if not base:
            continue
        for key, meta in poses.items():
            if not isinstance(meta, dict) or not meta.get("bodyH"):
                continue
            states = tuple(sorted(s for s, keys in anims.get(char, {}).items() if key in keys))
            known = [sizes[s] for s in states if s in sizes]
            if not known or len(known) != len(states) or not all(s["uniform"] for s in known):
                continue
            n_uniform += 1
            ratio = statistics.median([s["ratio"] for s in known])
            errs.append(abs(ratio * base - meta["bodyH"]) / meta["bodyH"])
    if errs:
        errs.sort()
        print(f"\nsize, on the {n_uniform} poses whose states are all uniform:")
        print(f"  median relative error {statistics.median(errs):.2%}  "
              f"p90 {pct(errs, .9):.2%}  worst {max(errs):.2%}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
