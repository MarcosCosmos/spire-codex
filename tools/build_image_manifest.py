"""Build game/<version>/manifest.json.gz for the /images full-dump gallery.

Walks a local dump tree (SOURCE pngs mapped to their .webp names, plus the
animations-webp tree as the animations category) and writes the manifest the
backend's browse endpoints read from the CDN. Upload the result next to the
assets: game/<version>/manifest.json.gz.

Usage: python tools/build_image_manifest.py --src /mnt/e/1-110-0 --version v0.110.0 -o manifest.json.gz
"""

import argparse

import gzip
import json
import os
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--src", required=True, type=Path)
parser.add_argument("--version", required=True)
parser.add_argument("-o", "--output", type=Path, default=Path("manifest.json.gz"))
args = parser.parse_args()
SRC = args.src
ANIM = SRC / "animations-webp"
OUT = args.output

TOPS = [
    "cards",
    "assets",
    "monsters",
    "monsters-skins",
    "relics",
    "potions",
    "backgrounds",
    "card-frames",
    "characters",
    "characters-forms",
    "enchantments",
    "afflictions-cards",
    "enchantments-cards",
]

manifest: dict[str, list[str]] = {}
for top in TOPS:
    root = SRC / top
    if not root.is_dir():
        continue
    files = []
    for dirpath, _dirs, names in os.walk(root):
        rel_dir = Path(dirpath).relative_to(root)
        for n in names:
            if n.endswith(".png"):
                p = (rel_dir / n).as_posix() if str(rel_dir) != "." else n
                files.append(p[:-4] + ".webp")
    files.sort()
    manifest[top] = files
    print(top, len(files))

anim_files = []
for dirpath, _dirs, names in os.walk(ANIM):
    rel_dir = Path(dirpath).relative_to(ANIM)
    for n in names:
        if n.endswith(".webp"):
            anim_files.append((rel_dir / n).as_posix() if str(rel_dir) != "." else n)
anim_files.sort()
manifest["animations"] = anim_files
print("animations", len(anim_files))

payload = {"version": args.version, "categories": manifest}
with gzip.open(OUT, "wt", encoding="utf-8") as f:
    json.dump(payload, f, separators=(",", ":"))
print("wrote", OUT, OUT.stat().st_size // 1024, "KB")
