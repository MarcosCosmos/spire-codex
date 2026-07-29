#!/usr/bin/env python3
"""Per-build file manifests of the extracted game, for lifetime comparisons.

Every extraction (GDRE raw tree + ILSpy decompiled tree) gets one JSON
manifest: relative path -> [size, blake2b-128 hex] for every file MegaCrit
shipped. Diffing two manifests answers "when did X first appear / change /
disappear" at the file level, independent of what the data parsers surface
— which is exactly the question the parsers can get wrong (the Adversary
batch sat in the files for multiple versions while a filter kept it out of
the parsed data).

Excluded as not-MegaCrit's-files: GDRE's derived import cache (raw/.godot),
ILSpy/IDE toolchain artifacts (obj/, bin/, Properties/), and our own run
logs at the extraction root.

Usage:
  # Generate (gz-compressed when the output path ends in .gz):
  python3 tools/extraction_manifest.py generate <extraction_dir> \
      --label v0.109.1 --build-id 24305648 \
      -o extraction-manifests/v0.109.1.json.gz

  # Compare two manifests:
  python3 tools/extraction_manifest.py diff \
      extraction-manifests/v0.109.0.json.gz extraction-manifests/v0.109.1.json.gz

  # Trace a name across every manifest (when did it first appear?):
  python3 tools/extraction_manifest.py grep adversary extraction-manifests/*.json.gz
"""

import argparse
import gzip
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

EXCLUDED_PARTS = {".godot", "obj", "bin", "Properties"}
EXCLUDED_NAMES = {"gdre_run.log", "gdre_export.log", "ilspy_run.log", "README.txt"}


def _iter_files(extraction_dir: Path):
    for sub in ("raw", "decompiled"):
        base = extraction_dir / sub
        if not base.is_dir():
            continue
        for f in sorted(base.rglob("*")):
            if not f.is_file():
                continue
            if f.name in EXCLUDED_NAMES:
                continue
            if any(part in EXCLUDED_PARTS for part in f.relative_to(base).parts):
                continue
            yield sub, f


def _hash_file(path: Path) -> str:
    h = hashlib.blake2b(digest_size=16)
    if path.suffix in (".cs", ".csproj"):
        # Decompiled text is toolchain-flavored: the same assembly decompiled
        # on Windows vs Linux differs only by CRLF. Normalize so manifests
        # compare game content, not the machine that ran ilspycmd.
        h.update(path.read_bytes().replace(b"\r\n", b"\n"))
        return h.hexdigest()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _load(path: Path) -> dict:
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as fh:
        return json.load(fh)


def cmd_generate(args) -> None:
    extraction_dir = Path(args.extraction_dir)
    files: dict[str, list] = {}
    for sub, f in _iter_files(extraction_dir):
        rel = f"{sub}/{f.relative_to(extraction_dir / sub).as_posix()}"
        files[rel] = [f.stat().st_size, _hash_file(f)]

    manifest = {
        "label": args.label,
        "build_id": args.build_id,
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": str(extraction_dir),
        "file_count": len(files),
        "files": files,
    }
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(manifest, sort_keys=True, separators=(",", ":"))
    if out.suffix == ".gz":
        with gzip.open(out, "wt", encoding="utf-8", compresslevel=9) as fh:
            fh.write(payload)
    else:
        out.write_text(payload, encoding="utf-8")
    print(f"{args.label}: {len(files)} files -> {out}")


def cmd_diff(args) -> None:
    old, new = _load(Path(args.old)), _load(Path(args.new))
    of, nf = old["files"], new["files"]
    added = sorted(k for k in nf if k not in of)
    removed = sorted(k for k in of if k not in nf)
    changed = sorted(k for k in nf if k in of and of[k][1] != nf[k][1])
    if args.prefix:
        added = [k for k in added if k.startswith(args.prefix)]
        removed = [k for k in removed if k.startswith(args.prefix)]
        changed = [k for k in changed if k.startswith(args.prefix)]
    print(
        f"{old['label']} -> {new['label']}: "
        f"+{len(added)} -{len(removed)} ~{len(changed)}"
    )
    for tag, items in (("+", added), ("-", removed), ("~", changed)):
        for k in items[: args.limit]:
            print(f"  {tag} {k}")
        if len(items) > args.limit:
            print(f"  ... {len(items) - args.limit} more {tag}")


def cmd_grep(args) -> None:
    needle = args.pattern.lower()
    for mpath in args.manifests:
        m = _load(Path(mpath))
        hits = [k for k in m["files"] if needle in k.lower()]
        print(f"{m['label']}: {len(hits)} match(es)")
        for k in hits[: args.limit]:
            print(f"    {k}  [{m['files'][k][1][:12]}]")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("generate", help="write a manifest for one extraction")
    g.add_argument("extraction_dir")
    g.add_argument("--label", required=True)
    g.add_argument("--build-id", default=None)
    g.add_argument("-o", "--output", required=True)
    g.set_defaults(func=cmd_generate)

    d = sub.add_parser("diff", help="compare two manifests")
    d.add_argument("old")
    d.add_argument("new")
    d.add_argument("--prefix", default=None, help="only paths under this prefix")
    d.add_argument("--limit", type=int, default=50)
    d.set_defaults(func=cmd_diff)

    gr = sub.add_parser("grep", help="trace a name across manifests")
    gr.add_argument("pattern")
    gr.add_argument("manifests", nargs="+")
    gr.add_argument("--limit", type=int, default=20)
    gr.set_defaults(func=cmd_grep)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    sys.exit(main())
