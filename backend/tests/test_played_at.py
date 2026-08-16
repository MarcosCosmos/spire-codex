"""played_at must come from the blob's start_time (when the run was played),
bounded so garbage clocks fall back to upload time. Profile lists sort on it —
found live 2026-08-15: a 500-run backlog upload buried the actual latest run
under months-old runs with fresh submitted_at."""

from datetime import datetime, timezone

from app.services.runs_db_mongo import _played_at_from_blob


def test_start_time_wins():
    played = _played_at_from_blob({"start_time": 1776393693})
    assert played == datetime.fromtimestamp(1776393693, timezone.utc)


def test_missing_falls_back_to_now():
    before = datetime.now(timezone.utc)
    assert _played_at_from_blob({}) >= before


def test_garbage_and_out_of_range_fall_back():
    before = datetime.now(timezone.utc)
    for blob in (
        {"start_time": "not-a-number"},
        {"start_time": 0},
        {"start_time": 946684800},  # 2000, pre-bound
        {"start_time": int(datetime.now(timezone.utc).timestamp()) + 7 * 86400},
    ):
        assert _played_at_from_blob(blob) >= before
