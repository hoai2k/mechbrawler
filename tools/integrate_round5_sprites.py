#!/usr/bin/env python3
"""Register processed Round 5 semantic sprites in the runtime manifest."""

import json
from pathlib import Path

import numpy as np
from PIL import Image

from extract_sprites import GENERATED_FRAME_TARGETS, generated_frame_meta


ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "assets" / "sprites"
MANIFEST = SPRITES / "manifest.json"


def main() -> None:
    manifest = json.loads(MANIFEST.read_text())
    count = 0
    for (char, pose), target in GENERATED_FRAME_TARGETS.items():
        if pose.startswith("r") and len(pose) > 1 and pose[1].isdigit():
            continue
        path = SPRITES / char / f"{pose}.png"
        if not path.exists():
            raise FileNotFoundError(path)
        frame = np.asarray(Image.open(path).convert("RGBA"))
        manifest["characters"][char][pose] = {
            "file": f"{char}/{pose}.png",
            **generated_frame_meta(frame, target),
        }
        # Round 5 art is generated facing right and must not inherit a native
        # left-facing exception from any historical sheet cell.
        native = manifest.setdefault("nativeLeft", {}).setdefault(char, [])
        manifest["nativeLeft"][char] = [key for key in native if key != pose]
        count += 1
    MANIFEST.write_text(json.dumps(manifest, indent=1) + "\n")
    print(f"registered {count} Round 5 sprites")


if __name__ == "__main__":
    main()
