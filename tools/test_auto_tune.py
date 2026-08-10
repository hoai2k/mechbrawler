#!/usr/bin/env python3
"""Prove the auto-tuner's safety rules, which are the whole reason to trust it.

The tuner writes placement numbers nobody reviewed, so what matters is not that
it is usually right — the backtest in docs/sprite-auto-adjust.md covers that —
but that it cannot do the three things that would make it worse than useless:

  1. overwrite a decision a human made,
  2. claim a pose has been dealt with when it has not,
  3. act on a rule that is not actually a rule.

Each is checked here against real art, because `tune_frame` measures the file.

  python3 tools/test_auto_tune.py
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import auto_tune as A  # noqa: E402

fails = 0


def check(ok, label, extra=""):
    global fails
    if not ok:
        fails += 1
    print(f"{'OK  ' if ok else 'FAIL'} {label}" + (f"  {extra}" if extra else ""))


def main():
    man = json.load(open(A.MANIFEST))
    foot = A.learn_foot(man)
    sizes, anims = A.learn_sizes(man, A.DEFAULT_REVIEWED)

    check(foot["global"] is not None and 0.85 < foot["global"] < 1.0,
          "the foot fraction learns to something plausible", f"{foot['global']:.4f}")
    uniform = [s for s, v in sizes.items() if v["uniform"]]
    judged = [s for s, v in sizes.items() if not v["uniform"]]
    check(len(uniform) >= 6 and len(judged) >= 6,
          "the size rule finds both populations",
          f"{len(uniform)} uniform, {len(judged)} judged")
    # The gap is what makes UNIFORM_CV safe to set anywhere in it. If a state
    # ever lands inside the gap this stops being a clean split and the threshold
    # needs a human, not a nudge.
    worst_uniform = max(sizes[s]["cv"] for s in uniform)
    best_judged = min(sizes[s]["cv"] for s in judged)
    check(worst_uniform < A.UNIFORM_CV < best_judged,
          "and nothing sits near the threshold between them",
          f"{worst_uniform:.4f} < {A.UNIFORM_CV} < {best_judged:.4f}")

    # A real frame to tune, with real pixels behind it, rewound to exactly what
    # generated_frame_meta would have produced: the foot line on the bottom of
    # the art and `ox` centring the content box. That is the state every import
    # lands in, so it is the state the rules have to be able to move.
    char, key = "maki", "crouch_attack_b"
    stored = dict(man["characters"][char][key])
    stored.pop("edited", None)
    stored.pop("autoTuned", None)
    m = A.measure(os.path.join(A.SPRITES, stored["file"]))
    bx0, _, bx1, _ = m["box"]
    stored["bodyBottom"] = round(stored["oy"] + m["body_bottom"], 1)
    stored["ox"] = round(A.CELL_MID - (bx0 + bx1) / 2, 1)
    idle = man["characters"][char]["idle_a"]["bodyH"]
    states = tuple(sorted(s for s, ks in anims[char].items() if key in ks))
    want = ["foot", "size", "centre"]

    out, why = A.tune_frame(char, key, stored, states, foot, sizes, idle, want)
    check(not why and out, "it has something to say about a freshly imported pose",
          why or ", ".join(out))
    check("bodyBottom" in out and "ox" in out,
          "the ground contact and the centring", ", ".join(sorted(out)))
    # The foot line is the one with a guaranteed direction: every one of the 513
    # hand corrections raised it off the bottom of the art, so the tuner must
    # never lower it past there.
    check(out["bodyBottom"][1] < out["bodyBottom"][0],
          "and it raises the foot line off the bottom of the art",
          f"{out['bodyBottom'][0]:g} -> {out['bodyBottom'][1]:g}")

    # Running again over its own output must propose nothing: the numbers are
    # already what the rules want, and a tuner that drifts on re-run would walk
    # a pose away from where it was placed every time the pipeline is run.
    settled = dict(stored)
    for field, (_, new, _) in out.items():
        settled[field] = new
    again, _ = A.tune_frame(char, key, settled, states, foot, sizes, idle, want)
    check(not again, "running it twice changes nothing the second time",
          ", ".join(sorted(again)) or "(nothing)")

    # ---- 1. a human's decision is never overwritten
    for field in ("bodyBottom", "ox", "renderScale"):
        guarded = dict(stored)
        guarded["edited"] = {field: 1.0}
        got, _ = A.tune_frame(char, key, guarded, states, foot, sizes, idle, want)
        check(field not in got, f"a hand-edited {field} is left alone",
              ", ".join(sorted(got)) or "(nothing)")

    # An `edited` map covering everything leaves nothing to do at all.
    locked = dict(stored)
    locked["edited"] = {"bodyBottom": 1.0, "ox": 1.0, "renderScale": 1.0}
    got, _ = A.tune_frame(char, key, locked, states, foot, sizes, idle, want)
    check(not got, "a fully tuned pose is not touched at all",
          ", ".join(sorted(got)) or "(nothing)")

    # ---- 2. tuning is not an edit
    #
    # The workbench's "No saved edits (to do)" list and its character markers
    # both read `meta.edited`, so writing there would quietly take a pose off
    # the list nobody has looked at yet. tune_frame returns proposals and the
    # caller assigns them; neither may invent an `edited` entry.
    check("edited" not in out and all(f != "edited" for f in out),
          "the tuner proposes no `edited` entry")
    applied = dict(stored)
    for field, (_, new, _) in out.items():
        applied[field] = new
    check(not applied.get("edited"),
          "and applying every proposal leaves the pose unedited",
          json.dumps(applied.get("edited")))

    # ---- 3. a rule that is not a rule is not applied
    #
    # This pose's states are hand-judged, so the size rule must decline it even
    # though it was asked for.
    check(all(not sizes[s]["uniform"] for s in states if s in sizes),
          f"{'/'.join(states)} is a judged state, not a uniform one")
    check("renderScale" not in out and "bodyH" not in out,
          "so the size rule declines it", ", ".join(sorted(out)))

    # A pose on a uniform state does get sized.
    for cand_char, cand_key in (("maki", "hurt"), ("gojo", "hurt"), ("gojo", "fall")):
        frames = man["characters"].get(cand_char) or {}
        if cand_key not in frames:
            continue
        st = tuple(sorted(s for s, ks in anims[cand_char].items() if cand_key in ks))
        if not st or not all(sizes.get(s, {}).get("uniform") for s in st):
            continue
        m2 = dict(frames[cand_key])
        m2.pop("edited", None)
        base = man["characters"][cand_char]["idle_a"]["bodyH"]
        got, _ = A.tune_frame(cand_char, cand_key, m2, st, foot, sizes, base, ["size"])
        check("renderScale" in got and "bodyH" in got,
              f"a uniform state ({'/'.join(st)}) is sized", ", ".join(sorted(got)))
        # bodyH and renderScale have to move together or the manifest disagrees
        # with itself — audit_frame_sizes reads bodyH, the renderer reads scale.
        check(("bodyH" in got) == ("renderScale" in got),
              "and its size fields move together")
        break
    else:
        check(False, "found a uniform-state pose to size")

    # ---- the foot guard
    absurd = dict(stored)
    absurd["bodyBottom"] = stored["bodyBottom"] + 10_000
    got, why = A.tune_frame(char, key, absurd, states, foot, sizes, idle, ["foot"])
    check("bodyBottom" not in got and why,
          "a foot line that would jump absurdly is refused, with a reason", why or "")

    print("\n" + (f"{fails} check(s) failed" if fails else "All checks pass"))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
