"""Merge a folder of numbered PNG frames into an animated GIF.

The inverse of extract_card_frames/extract_flame_frames: point it at a
directory of frames (000.png, 001.png, ...) from a game animation export and
it produces one GIF, transparency preserved. Needs ffmpeg on PATH (the
palettegen/paletteuse pass is what keeps sprite alpha and colors clean).

Usage:
  python tools/frames_to_gif.py <frames_dir> [-o out.gif] [--fps 15] [--width N]
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("frames_dir", type=Path)
    parser.add_argument("-o", "--output", type=Path, default=None)
    parser.add_argument("--fps", type=int, default=15)
    parser.add_argument("--width", type=int, default=None, help="scale to this width")
    args = parser.parse_args()

    frames = sorted(args.frames_dir.glob("*.png"))
    if not frames:
        sys.exit(f"no .png frames in {args.frames_dir}")
    out = args.output or args.frames_dir.with_suffix(".gif")

    scale = f"scale={args.width}:-1:flags=lanczos," if args.width else ""
    filters = (
        f"{scale}split[s0][s1];"
        "[s0]palettegen=reserve_transparent=1[p];"
        "[s1][p]paletteuse=alpha_threshold=128"
    )
    cmd = [
        "ffmpeg",
        "-y",
        "-loglevel",
        "error",
        "-framerate",
        str(args.fps),
        "-pattern_type",
        "glob",
        "-i",
        str(args.frames_dir / "*.png"),
        "-lavfi",
        filters,
        "-gifflags",
        "+transdiff",
        str(out),
    ]
    subprocess.run(cmd, check=True)
    size = out.stat().st_size
    print(f"{out}: {len(frames)} frames @ {args.fps}fps, {size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
