"""The orphan filter's staleness clock must ignore toolchain artifacts:
one obj/ file written by an IDE days after extraction made every real
file look stale and silently dropped fully-implemented unreferenced
classes (the Adversary/Gravity batch) from a reparse."""

import os
import sys
from pathlib import Path

PARSERS = Path(__file__).resolve().parents[1] / "app" / "parsers"
sys.path.insert(0, str(PARSERS))


def _write(p: Path, text: str, mtime: float) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")
    os.utime(p, (mtime, mtime))


def _load_filter(tmp_path, monkeypatch):
    import orphan_filter

    monkeypatch.setattr(orphan_filter, "DECOMPILED", tmp_path)
    orphan_filter._scan.cache_clear()
    return orphan_filter


def test_toolchain_artifact_does_not_poison_staleness(tmp_path, monkeypatch):
    base = 1_700_000_000.0
    week_later = base + 7 * 86400
    # Real extraction: uniform mtimes, one unreferenced class.
    _write(
        tmp_path / "Models/UnreferencedMonster.cs", "class UnreferencedMonster {}", base
    )
    _write(tmp_path / "Models/Referenced.cs", "var x = Model<Referenced>();", base)
    # IDE artifact written a week later: must not become the clock.
    _write(
        tmp_path / "obj/Debug/net9.0/AssemblyAttributes.cs",
        "// tool artifact",
        week_later,
    )

    orphan_filter = _load_filter(tmp_path, monkeypatch)
    assert not orphan_filter.is_orphan(tmp_path / "Models/UnreferencedMonster.cs")


def test_genuine_leftover_is_still_flagged(tmp_path, monkeypatch):
    base = 1_700_000_000.0
    week_later = base + 7 * 86400
    # A real re-extraction wrote current files a week after the leftover.
    _write(tmp_path / "Models/Leftover.cs", "class Leftover {}", base)
    _write(tmp_path / "Models/Current.cs", "var x = Model<Current>();", week_later)

    orphan_filter = _load_filter(tmp_path, monkeypatch)
    assert orphan_filter.is_orphan(tmp_path / "Models/Leftover.cs")
    assert not orphan_filter.is_orphan(tmp_path / "Models/Current.cs")
