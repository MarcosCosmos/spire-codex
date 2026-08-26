from app.services import charts_stats as cs


def _sample_rows():
    return [
        (
            "IRONCLAD",
            1,
            10,
            "standard",
            1,
            3600,
            45,
            30,
            12,
            20600,
            "yitsy",
            0,
            3,
            "",
            "0.111.0",
        ),
        ("ALL", 0, 0, "daily", 2, 0, 12, 15, 3, 20601, "", 1, 1, "2026-08-26", ""),
    ]


def test_frame_parquet_roundtrip(monkeypatch, tmp_path):
    monkeypatch.setattr(cs, "_FRAME_PARQUET", tmp_path / "frame.parquet")
    monkeypatch.setattr(cs, "_load_frame_from_db", _sample_rows)
    n = cs.store_frame_parquet()
    assert n == 2
    loaded = cs._load_frame_parquet()
    assert loaded == _sample_rows()
    # the public loader prefers the parquet over the DB scan
    assert cs._load_frame() == _sample_rows()


def test_frame_parquet_stale_falls_back(monkeypatch, tmp_path):
    import os
    import time

    monkeypatch.setattr(cs, "_FRAME_PARQUET", tmp_path / "frame.parquet")
    monkeypatch.setattr(cs, "_load_frame_from_db", _sample_rows)
    cs.store_frame_parquet()
    old = time.time() - cs._FRAME_PARQUET_MAX_AGE - 60
    os.utime(cs._FRAME_PARQUET, (old, old))
    assert cs._load_frame_parquet() is None
