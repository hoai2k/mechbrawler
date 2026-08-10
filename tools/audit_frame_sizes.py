#!/usr/bin/env python3
"""Find poses that render at the wrong size, and optionally correct them.

`bodyH` is the rendered-height target for a frame and `renderScale` is derived
from it as `bodyH / artBBoxHeight` (docs/asset-pipeline.md). A pose whose
`bodyH` is wrong therefore renders at the wrong size — a fighter who shrinks by
half the moment they dash.

docs/asset-pipeline.md warns that automatic size normalisation measured from
the ART produced worse results than hand values, twice. This does something
different and much narrower: it never looks at pixels. Each animation state has
a characteristic height relative to the character's idle — a crouch is short, a
ledge hang is tall — and that ratio is learned from the characters a human has
already size-reviewed. A frame is only touched when it falls far outside the
band its own state occupies across the reviewed roster.

Sizing stays a human judgement; this just flags, and fixes, the poses that are
obviously outside it.

Usage:
  python3 audit_frame_sizes.py                      # report only
  python3 audit_frame_sizes.py --fix                # correct clear outliers
  python3 audit_frame_sizes.py --fix --tolerance 0.3
  python3 audit_frame_sizes.py --reviewed gojo maki ...
"""

import argparse
import json
import os
import re
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(HERE, "..", "assets", "sprites", "manifest.json")
CHARACTERS_JS = os.path.join(HERE, "..", "src", "characters.js")

# The roster that shipped before round 7 and has been through size review.
# Their per-state ratios are the reference the rest are measured against.
DEFAULT_REVIEWED = [
    "gojo", "yuta", "hakari", "maki", "megumi", "nobara", "inumaki", "panda",
    "todo", "momo", "nanami", "toji", "sukuna", "mahito", "geto", "jogo", "hanami",
]

# A frame is judged against the SPREAD its state actually shows on the reviewed
# roster, not a flat percentage. Some states were sized systematically and are
# identical across all 17 (`run` is 0.82 for every one of them), so any drift is
# an error; others were hand-tuned per character and legitimately range wide
# (`dodge_roll` spans 0.59-0.97). This is the margin allowed outside whatever
# band a state occupies.
DEFAULT_TOLERANCE = 0.08

# Needs at least this many reviewed samples before a state's median is trusted.
MIN_SAMPLES = 6


def named_anims(src):
    """`export const NAME = { frames: [...] }` at module scope, by name.

    An animation defined once and shared — `RUN_ANIM`, which every fighter's
    `run` state points at — is written as a reference rather than inline, and a
    reader that only understands inline literals cannot see through it. That
    made all four frames of the four-frame run cycle look undrawn on all 24
    fighters, so the request tables listed the busiest sprites in the game as
    "not drawn by any state".
    """
    # Frame lists are shared too — `RUN_ANIM` names `RUN_CYCLE_FRAMES` rather
    # than repeating it, since the cycle order is referenced elsewhere — so the
    # array consts are resolved first and an anim may point at one.
    lists = {}
    for name, frames in re.findall(r'const (\w+) = \[([^\]]*)\]', src):
        lists[name] = [f.strip().strip('"') for f in frames.split(",") if f.strip()]

    out = {}
    for name, frames in re.findall(r'const (\w+) = \{ frames: (\[[^\]]*\]|\w+)', src):
        out[name] = (lists.get(frames, []) if not frames.startswith("[")
                     else [f.strip().strip('"')
                           for f in frames[1:-1].split(",") if f.strip()])
    return out


def parse_anims(text, named=None):
    """`state: { frames: ["a", "b"], ... }` pairs out of a block of source.

    Also resolves the two ways a state can name a shared animation instead of
    spelling its frames out: `run: RUN_ANIM,` and `run: { ...RUN_ANIM, fps: 12 }`
    — the second being an inherit-and-retime, which keeps the frames.
    """
    out = {}
    for state, frames in re.findall(r'(\w+): \{ frames: \[(.*?)\]', text):
        out[state] = [f.strip().strip('"') for f in frames.split(",") if f.strip()]
    for state, ref in re.findall(r'(\w+): (?:\{ \.\.\.)?([A-Z_][A-Z0-9_]*)\b', text):
        if state not in out and (named or {}).get(ref):
            out[state] = list(named[ref])
    return out


def slice_block(src, header):
    """Source from `header` up to the line closing it at the same indent.

    Scanning rather than a regex on purpose: the nested-brace patterns this
    needs backtrack catastrophically on a 1200-line file.
    """
    start = src.find(header)
    if start == -1:
        return ""
    body = header.lstrip("\n")
    indent = len(body) - len(body.lstrip())
    close = "\n" + " " * indent + "}"
    end = src.find(close, start + len(header))
    return src[start:end if end != -1 else len(src)]


def anims_by_frame(src, char_keys):
    """Per character: animation state -> frame keys, the shared defaults merged
    with that character's own overrides. Mirrors statesUsingFrame().

    A character picks its base table by NAME — `anims: SEMANTIC_ANIMS` for the
    fighters built one-sprite-per-action, nothing at all for the sheet-era ones,
    who fall through to DEFAULT_ANIMS. Reading only the defaults made every
    semantic fighter look like their whole set was undrawn, so
    list_replacements.py reported eight characters' poses as "not drawn by any
    animation" while the game was drawing them perfectly well.
    """
    shared = named_anims(src)
    tables = {
        "DEFAULT_ANIMS": parse_anims(slice_block(src, "export const DEFAULT_ANIMS = {"), shared),
        "SEMANTIC_ANIMS": parse_anims(slice_block(src, "export const SEMANTIC_ANIMS = {"), shared),
    }
    per_char = {}
    for key in char_keys:
        block = slice_block(src, f"\n  {key}: {{")
        # Two ways to name the base table: `anims: SEMANTIC_ANIMS,` outright, or
        # `anims: { ...SEMANTIC_ANIMS, <overrides> }` when a fighter inherits it
        # and keeps a couple of its own timings.
        named = re.search(r"\n    anims: (?:\{ \.\.\.)?(\w+),", block)
        merged = dict(tables.get(named.group(1) if named else "", tables["DEFAULT_ANIMS"]))
        # An inline `anims: { ... }` block is this character's own overrides on
        # top of whichever table they named.
        merged.update(parse_anims(slice_block(block, "    anims: {"), shared))
        per_char[key] = merged
    return per_char


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fix", action="store_true", help="write corrections")
    ap.add_argument("--tolerance", type=float, default=DEFAULT_TOLERANCE)
    ap.add_argument("--reviewed", nargs="*", default=DEFAULT_REVIEWED)
    args = ap.parse_args()

    man = json.load(open(MANIFEST))
    chars = man["characters"]
    src = open(CHARACTERS_JS).read()
    anims = anims_by_frame(src, list(chars))

    def idle_bodyh(char):
        frames = chars[char]
        for key in ("idle_a", "r0c0"):
            if key in frames and frames[key].get("bodyH"):
                return frames[key]["bodyH"]
        return None

    # frame -> states, and the ratio of each frame's height to its own idle
    ratios = {}
    for char, frames in chars.items():
        base = idle_bodyh(char)
        if not base:
            continue
        for key, meta in frames.items():
            states = [s for s, fr in anims[char].items() if key in fr]
            if not states or not meta.get("bodyH"):
                continue
            ratios[(char, key)] = (states, meta["bodyH"] / base)

    # what each state looks like on the reviewed roster
    per_state = {}
    for (char, key), (states, ratio) in ratios.items():
        if char not in args.reviewed:
            continue
        for state in states:
            per_state.setdefault(state, []).append(ratio)
    expected = {}
    for state, v in per_state.items():
        if len(v) < MIN_SAMPLES:
            continue
        expected[state] = {
            "want": statistics.median(v),
            "lo": min(v) * (1 - args.tolerance),
            "hi": max(v) * (1 + args.tolerance),
        }

    print(f"reference ratios learned from {len(args.reviewed)} reviewed characters:")
    for state in sorted(expected):
        v, e = per_state[state], expected[state]
        flat = "uniform" if max(v) - min(v) < 1e-6 else f"{min(v):.2f}-{max(v):.2f}"
        print(f"  {state:16} median {e['want']:.3f}  accept {e['lo']:.3f}-{e['hi']:.3f}"
              f"  (n={len(v)}, {flat})")

    # frames that miss their state's band
    problems = []
    for (char, key), (states, ratio) in sorted(ratios.items()):
        cand = [expected[s] for s in states if s in expected]
        if not cand:
            continue
        # a frame shared by several states only has to satisfy the kindest one
        if any(e["lo"] <= ratio <= e["hi"] for e in cand):
            continue
        want = min(cand, key=lambda e: abs(ratio - e["want"]))["want"]
        problems.append((char, key, states, ratio, want))

    print(f"\n{len(problems)} frame(s) outside their state's band "
          f"(margin {args.tolerance:.0%}):")
    by_char = {}
    for char, key, states, ratio, want in problems:
        by_char.setdefault(char, []).append((key, states, ratio, want))
    for char in sorted(by_char):
        print(f"  {char}")
        for key, states, ratio, want in sorted(by_char[char]):
            print(f"    {key:22} {ratio:.3f}x  ->  {want:.3f}x   ({'/'.join(states)})")

    if not args.fix:
        print("\n(report only — pass --fix to correct these)")
        return

    for char, key, states, ratio, want in problems:
        meta = chars[char][key]
        base = idle_bodyh(char)
        old_body = meta["bodyH"]
        new_body = round(base * want, 1)
        # renderScale is bodyH / artBBoxHeight, so it moves with bodyH exactly
        if meta.get("renderScale"):
            meta["renderScale"] = round(meta["renderScale"] * new_body / old_body, 4)
        meta["bodyH"] = new_body
    json.dump(man, open(MANIFEST, "w"), indent=1)
    print(f"\nmanifest updated: {len(problems)} frame(s) resized")


if __name__ == "__main__":
    main()
