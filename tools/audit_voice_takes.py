#!/usr/bin/env python3
"""Is this take a GRUNT, or is it a word?

The defect that made a whole round of effort grunts unusable was not tone or
level or length — it was that some of them contained words. A voice model given
せいっ or どりゃっ articulates them, because they are things a person chooses to
say; a grunt is not chosen and is not articulated. Nobody noticed until they
were in the game, because every automatic check a take passes — it exists, it is
registered, it is the right length, it is peak-normalised — is a check a spoken
word passes too.

This is the one property that separates them mechanically. A grunt is ONE
utterance: a single burst of voicing with silence either side. A word, or a
kiai with two syllables in it, is several. So count the utterances.

It cannot tell a good grunt from a bad one — nothing can, short of listening —
but it can tell a grunt from a sentence, and that is the failure that shipped.

  python3 tools/audit_voice_takes.py                 # every grunt and KO cry
  python3 tools/audit_voice_takes.py grunt_big       # anything matching
"""
import glob
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
SFX = os.path.join(ROOT, "assets", "sfx")
SR = 44100

MIN_UTTERANCE = 0.04   # shorter than this is a click or a breath
VOICED = 0.12          # envelope threshold, relative to the take's own peak
MAX_UTTERANCES = 2     # more than this and it is not a single grunt


def _ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return "ffmpeg"


def utterances(path):
    """-> (seconds, [utterance lengths in seconds])."""
    raw = subprocess.run(
        [_ffmpeg(), "-v", "error", "-i", path, "-f", "s16le",
         "-ac", "1", "-ar", str(SR), "-"],
        capture_output=True).stdout
    x = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if x.size == 0:
        return 0.0, []
    peak = np.abs(x).max()
    if peak < 1e-6:
        return x.size / SR, []
    # A 50 ms smoothing window: long enough to bridge the closure inside a
    # single stopped syllable (っ), short enough to leave a real gap between
    # two syllables standing.
    env = np.convolve(np.abs(x) / peak, np.ones(int(0.05 * SR)) / (0.05 * SR), "same")
    voiced = (env > VOICED).astype(np.int8)
    edges = np.diff(np.concatenate(([0], voiced, [0])))
    starts = np.flatnonzero(edges == 1)
    ends = np.flatnonzero(edges == -1)
    lens = [(e - s) / SR for s, e in zip(starts, ends) if (e - s) / SR >= MIN_UTTERANCE]
    return x.size / SR, lens


def main():
    want = sys.argv[1] if len(sys.argv) > 1 else None
    files = sorted(glob.glob(os.path.join(SFX, "grunt_*.mp3"))
                   + glob.glob(os.path.join(SFX, "ko_*.mp3")))
    if want:
        files = [f for f in files if want in os.path.basename(f)]
    if not files:
        sys.exit(f"nothing matching {want!r} in assets/sfx/")

    flagged = []
    print(f"{len(files)} take(s) · one utterance is a grunt, several is speech\n")
    for f in files:
        seconds, lens = utterances(f)
        name = os.path.basename(f)[:-4]
        if not lens:
            note, bad = "SILENT", True
        elif len(lens) > MAX_UTTERANCES:
            note, bad = f"{len(lens)} utterances — probably a word", True
        else:
            note, bad = "", False
        if bad:
            flagged.append((name, note))
        marks = " ".join(f"{n:.2f}" for n in lens) or "—"
        print(f"  {'!!' if bad else 'ok'} {name:30} {seconds:5.2f}s  [{marks}]  {note}")

    if flagged:
        print(f"\n{len(flagged)} take(s) to re-roll:")
        for name, note in flagged:
            print(f"  {name}: {note}")
        return 1
    print("\n  every take is a single utterance — no words in the bank")
    return 0


if __name__ == "__main__":
    sys.exit(main())
