"""The SQLite fallback stands alone: schema init plus a read/write round
trip through get_conn(), against a throwaway DATA_DIR."""

import importlib
import sqlite3


def _load_runs_db(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.delenv("MONGO_URL", raising=False)
    import app.services.runs_db as runs_db

    return importlib.reload(runs_db)


def test_get_conn_round_trip(tmp_path, monkeypatch):
    runs_db = _load_runs_db(tmp_path, monkeypatch)
    assert (tmp_path / "runs.db").exists()

    with runs_db.get_conn() as conn:
        assert isinstance(conn, sqlite3.Connection)
        conn.execute(
            "INSERT INTO runs (run_hash, seed, character, win) VALUES (?, ?, ?, ?)",
            ("abc123", "SEED1", "IRONCLAD", 1),
        )

    with runs_db.get_conn() as conn:
        row = conn.execute(
            "SELECT run_hash, character, win FROM runs WHERE run_hash = ?",
            ("abc123",),
        ).fetchone()
    assert row["run_hash"] == "abc123"
    assert row["character"] == "IRONCLAD"
    assert row["win"] == 1


def test_get_conn_rolls_back_on_error(tmp_path, monkeypatch):
    runs_db = _load_runs_db(tmp_path, monkeypatch)

    try:
        with runs_db.get_conn() as conn:
            conn.execute(
                "INSERT INTO runs (run_hash, seed, character, win) VALUES (?, ?, ?, ?)",
                ("rollback1", "SEED2", "SILENT", 0),
            )
            raise RuntimeError("boom")
    except RuntimeError:
        pass

    with runs_db.get_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM runs WHERE run_hash = ?", ("rollback1",)
        ).fetchone()
    assert row is None
