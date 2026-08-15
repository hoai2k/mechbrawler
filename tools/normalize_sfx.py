#!/usr/bin/env python3
"""Bring every delivered sound onto the pipeline's contract: MONO, peak -3 dBFS.

`generate_sfx.py` has always produced files that way, and 143 of the 169 in
assets/sfx/ are exactly that. The other 26 are not, and they got there by being
delivered outside the generator — an older pass, a hand-added file, a round that
predates the tool. Nothing checked, so nothing noticed.

What that cost, measured rather than guessed:

  * `hit_steel.mp3` peaked at -22.7 dBFS instead of -3, so after the 0.5 trim
    every element layer carries it reached -38.8 dBFS in play. Steel hits were
    inaudible, and had been through every round of "the mix sounds quiet".
  * `boogie_clap.mp3` — Todo's signature, the sound the technique IS — peaked at
    -26.9. Nearly 24 dB under contract.
  * `crow_caw.mp3`, `hit_wind.mp3` and `sound_sword_hit.mp3` peaked at 0.0 dBFS:
    no headroom at all, already clipped by their own encode.

That is a 27 dB spread across files that are all supposed to be at the same
number, and no amount of tuning category trims can fix it — the mixer's job is
relative balance, and it can only do that job if the files it balances start
level. This makes them start level.

## Stereo, and why the downmix is not just an average

A stereo file in a mono pipeline is its own bug. Three of these are
significantly OUT OF PHASE between channels — `hit_fire` at -0.77 correlation,
`rct_chime` at -0.66, `hit_shadow` at -0.50 — which means they already lose
level on anything that sums to mono: a phone speaker, most laptops, most
Bluetooth speakers. `hit_fire` measured 8 dB quieter summed than on its louder
channel alone.

So the downmix is chosen per file. Correlated channels are averaged, which is
the ordinary correct thing. Anti-correlated channels would CANCEL if averaged —
the average of a signal and its inverse is silence — so the louder channel is
taken whole instead. Losing the stereo image is free here; the game plays every
sound through a mono Audio element anyway.

  python3 tools/normalize_sfx.py --check     # report, change nothing (CI)
  python3 tools/normalize_sfx.py             # repair what is off contract
  python3 tools/normalize_sfx.py --all       # re-encode everything, including
                                             # files already on contract
"""
import argparse, json, os, re, subprocess, sys, tempfile, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
SFX_DIR = os.path.join(ROOT, "assets", "sfx")
CONFIG = os.path.join(ROOT, "src", "config_audio.js")

SR = 44100
TARGET_DB = -3.0
TARGET = 10 ** (TARGET_DB / 20)

# How far off contract a file may be before it is worth re-encoding.
#
# Not zero, and the reason is the format: an MP3 decoded, normalised and
# re-encoded does not come back at exactly the peak it was written at — the
# codec's filterbank overshoots by a fraction of a dB either way. A tool that
# insisted on exactly -3.0 would re-encode the whole library on every run,
# losing a generation of quality each time to chase rounding.
TOLERANCE_DB = 2.0

# Below this, averaging two channels destroys the sound instead of combining it.
PHASE_FLOOR = -0.2


def ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return "ffmpeg"


FFMPEG = ffmpeg()


def referenced():
    """Filenames named by SFX or SFX_ALTERNATES in config_audio.js.

    Read with a regex rather than by importing: this is a Python tool and the
    config is an ES module. Every filename in that file appears in quotes and
    ends in .mp3, which is a narrow enough shape to match honestly.
    """
    text = open(CONFIG).read()
    return set(re.findall(r'"([a-z_0-9]+\.mp3)"', text))


def read_audio(path):
    """-> (samples, channels). Float, -1..1, channels un-mixed."""
    info = subprocess.run([FFMPEG, "-hide_banner", "-i", path],
                          capture_output=True, text=True).stderr
    channels = 2 if "stereo" in info else 1
    raw = subprocess.run(
        [FFMPEG, "-v", "error", "-i", path, "-f", "s16le", "-ar", str(SR), "-"],
        capture_output=True).stdout
    x = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if channels == 2:
        x = x.reshape(-1, 2)
    return x, channels


def downmix(x, channels):
    """-> (mono samples, what was done). See the phase note in the docstring."""
    if channels == 1:
        return x, "mono"
    left, right = x[:, 0], x[:, 1]
    corr = 0.0
    if left.std() > 0 and right.std() > 0:
        corr = float(np.corrcoef(left, right)[0, 1])
    if corr < PHASE_FLOOR:
        # Averaging these would cancel them. Keep whichever channel carries more.
        keep, name = (left, "left") if np.abs(left).max() >= np.abs(right).max() else (right, "right")
        return keep.copy(), f"kept {name} (corr {corr:+.2f} — averaging would cancel)"
    return (left + right) / 2, f"averaged (corr {corr:+.2f})"


def peak_db(x):
    p = float(np.abs(x).max()) if x.size else 0.0
    return 20 * np.log10(p) if p > 0 else -np.inf


def write_mp3(path, x):
    tmp = tempfile.mktemp(suffix=".wav")
    with wave.open(tmp, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())
    try:
        subprocess.run([FFMPEG, "-v", "error", "-y", "-i", tmp,
                        "-codec:a", "libmp3lame", "-b:a", "128k", "-ac", "1", path],
                       check=True)
    finally:
        os.remove(tmp)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only; exit 1 if anything is off contract")
    ap.add_argument("--all", action="store_true", help="re-encode every file, not only the ones off contract")
    ap.add_argument("--include-orphans", action="store_true",
                    help="also touch files on disk that nothing references")
    a = ap.parse_args()

    used = referenced()
    files = sorted(f for f in os.listdir(SFX_DIR) if f.endswith(".mp3"))
    off, fixed, orphans = [], [], []

    for name in files:
        path = os.path.join(SFX_DIR, name)
        is_orphan = name not in used
        if is_orphan and not a.include_orphans:
            orphans.append(name)
            continue
        x, channels = read_audio(path)
        if not x.size:
            off.append((name, "empty file", channels, -np.inf))
            continue
        before = peak_db(x)
        wrong = channels > 1 or abs(before - TARGET_DB) > TOLERANCE_DB
        if not wrong and not a.all:
            continue

        why = []
        if channels > 1:
            why.append("stereo")
        if abs(before - TARGET_DB) > TOLERANCE_DB:
            why.append(f"{before:+.1f} dBFS")
        off.append((name, ", ".join(why) or "re-encode", channels, before))
        if a.check:
            continue

        mono, how = downmix(x, channels)
        peak = float(np.abs(mono).max())
        if peak <= 0:
            print(f"  {name:32} SKIPPED — silent, nothing to normalise")
            continue
        mono = mono * (TARGET / peak)
        write_mp3(path, mono)
        after = peak_db(read_audio(path)[0])
        fixed.append((name, before, after, how))

    if a.check:
        print(f"{len(files)} file(s) in assets/sfx — contract is mono, peak {TARGET_DB:+.0f} dBFS "
              f"(±{TOLERANCE_DB:.0f} dB)")
        if orphans:
            print(f"  {len(orphans)} not referenced by config_audio.js, skipped "
                  f"(--include-orphans to check them too)")
        if off:
            print(f"\n{len(off)} file(s) off contract:")
            for name, why, _, _ in off:
                print(f"  {name:34} {why}")
            print("\nrun: python3 tools/normalize_sfx.py")
            sys.exit(1)
        print("\n  every referenced sound is mono and normalised — the mixer is "
              "balancing files that start level")
        return

    if not fixed:
        print("nothing to do — every referenced sound is already on contract")
        return
    print(f"{len(fixed)} file(s) repaired:\n")
    for name, before, after, how in sorted(fixed, key=lambda r: r[1]):
        print(f"  {name:32} {before:+7.1f} -> {after:+5.1f} dBFS   {how}")
    print(f"\ndone. re-run `node tools/check_audio_mix.mjs` to see what it did to the mix.")


if __name__ == "__main__":
    main()
