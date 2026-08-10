#!/usr/bin/env python3
"""Generate every sound in docs/audio-requests-history.md via the ElevenLabs API.

Parses the doc (filename + prompt + target length), requests raw PCM, then
applies the same post-processing the doc asks a human supplier for: trim
leading silence, trim trailing silence, cap runaway length, normalise peak to
-3 dBFS. Finally encodes to mono MP3 — these ship over the network to a
browser, and MP3 is about a fifth the size of the equivalent WAV.

Needs an ffmpeg binary; `pip install imageio-ffmpeg` provides one.
Reads the key from ELEVENLABS_API_KEY. Idempotent: skips files that already
exist unless --force.

  ELEVENLABS_API_KEY=... python3 tools/generate_sfx.py
"""
import argparse, json, os, re, sys, wave
from concurrent.futures import ThreadPoolExecutor
import urllib.request, urllib.error
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
# The prompts live in the HISTORY doc: that round is delivered, but a prompt is
# how a file gets regenerated or re-rolled, so they stay this tool's input
# rather than becoming a record nobody reads.
DOC = os.path.join(ROOT, "docs", "audio-requests-history.md")
OUT = os.path.join(ROOT, "assets", "sfx")
SR = 44100
PEAK_TARGET = 10 ** (-3.0 / 20)      # -3 dBFS
SILENCE_FLOOR = 10 ** (-50.0 / 20)   # -50 dBFS counts as silence

# Sounds that must stay full length and un-faded: they loop in game.
LOOPING = {"energy_charge.wav", "hazard_fire_patch.wav", "fire_burn_loop.wav"}


def parse_doc():
    """-> [(filename, seconds, prompt)] in document order."""
    text = open(DOC).read()
    pat = re.compile(
        r"\*\*`([a-z_0-9]+\.wav)`\*\*[^\n]*?·\s*([0-9.]+)\s*s[^\n]*\n```\n(.*?)\n```",
        re.S)
    return [(m.group(1), float(m.group(2)), m.group(3).strip())
            for m in pat.finditer(text)]


def request_pcm(prompt, seconds, key):
    # The API accepts 0.5-22 s; short combat hits are requested a little long
    # and trimmed afterwards, which beats a clip that ends before its decay.
    dur = min(22.0, max(0.5, seconds * 1.6))
    body = json.dumps({
        "text": prompt,
        "duration_seconds": round(dur, 2),
        "prompt_influence": 0.65,
    }).encode()
    req = urllib.request.Request(
        "https://api.elevenlabs.io/v1/sound-generation?output_format=pcm_44100",
        data=body,
        headers={"xi-api-key": key, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()


def post_process(raw, target, looping):
    x = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if x.size == 0:
        return None
    peak = np.abs(x).max()
    if peak < 1e-6:
        return None

    # Trim leading silence — the engine fires one-shots on the frame of impact,
    # so head padding reads as input lag.
    above = np.abs(x) > SILENCE_FLOOR * peak / max(peak, 1e-9) * SILENCE_FLOOR
    above = np.abs(x) > SILENCE_FLOOR
    idx = np.nonzero(above)[0]
    if idx.size:
        start = max(0, idx[0] - int(0.002 * SR))   # keep 2 ms of the attack
        end = min(x.size, idx[-1] + int(0.01 * SR))
        x = x[start:end]

    if not looping:
        # Cap runaway length so combos don't turn to mush, with a short fade
        # so the cut never clicks.
        cap = int(target * 1.35 * SR)
        if x.size > cap:
            x = x[:cap]
            f = int(min(0.03 * SR, x.size // 4))
            if f > 0:
                x[-f:] *= np.linspace(1.0, 0.0, f)

    peak = np.abs(x).max()
    if peak > 0:
        x = x * (PEAK_TARGET / peak)
    return np.clip(x, -1.0, 1.0)


MP3_BITRATE = "128k"


def _ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return "ffmpeg"


def write_mp3(path, x):
    """WAV to a temp file, then encode. Piping raw PCM through stdin would work
    too, but a real file keeps the ffmpeg invocation debuggable."""
    import subprocess, tempfile
    tmp = tempfile.mktemp(suffix=".wav")
    with wave.open(tmp, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())
    try:
        subprocess.run([_ffmpeg(), "-v", "error", "-y", "-i", tmp,
                        "-codec:a", "libmp3lame", "-b:a", MP3_BITRATE,
                        "-ac", "1", path], check=True)
    finally:
        os.path.exists(tmp) and os.remove(tmp)


def one(entry, key, force):
    name, seconds, prompt = entry
    dest = os.path.join(OUT, name.replace(".wav", ".mp3"))
    if os.path.exists(dest) and not force:
        return name, "skip", os.path.getsize(dest)
    for attempt in range(4):
        try:
            raw = request_pcm(prompt, seconds, key)
            x = post_process(raw, seconds, name in LOOPING)
            if x is None:
                return name, "EMPTY", 0
            write_mp3(dest, x)
            return name, f"ok {x.size / SR:.2f}s", os.path.getsize(dest)
        except urllib.error.HTTPError as e:
            detail = e.read()[:200].decode("utf8", "replace")
            if e.code in (429, 500, 502, 503) and attempt < 3:
                import time; time.sleep(2 ** attempt * 3)
                continue
            return name, f"HTTP {e.code}: {detail}", 0
        except Exception as e:
            if attempt < 3:
                import time; time.sleep(2 ** attempt * 2)
                continue
            return name, f"ERR {e}", 0
    return name, "FAILED", 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="comma-separated filenames")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--workers", type=int, default=4)
    a = ap.parse_args()

    # The key is read from the environment and never stored in the repo.
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not key:
        sys.exit("set ELEVENLABS_API_KEY (never commit it)")
    os.makedirs(OUT, exist_ok=True)
    entries = parse_doc()
    if a.only:
        want = set(a.only.split(","))
        entries = [e for e in entries if e[0] in want]
    if a.limit:
        entries = entries[:a.limit]
    print(f"{len(entries)} sounds to generate", flush=True)

    fails = []
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        for name, status, size in ex.map(lambda e: one(e, key, a.force), entries):
            print(f"  {name:32} {status:22} {size:>7}B", flush=True)
            if not status.startswith(("ok", "skip")):
                fails.append((name, status))
    print(f"\ndone. failures: {len(fails)}")
    for n, s in fails:
        print("  FAIL", n, s)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
