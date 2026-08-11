"""The in-flight gauge must not accumulate values from dead uvicorn workers
(uvicorn has no gunicorn child_exit hook, so 'livesum' needs our sweep), and
presence-poll 404s must not count as API errors (they're the protocol's
"not in a run right now" answer)."""

import os

from app import metrics


def test_sweep_removes_dead_worker_gauge_files(tmp_path, monkeypatch):
    monkeypatch.setenv("PROMETHEUS_MULTIPROC_DIR", str(tmp_path))
    me = os.getpid()
    # Find a PID that certainly isn't running.
    dead_pid = 2
    while _alive(dead_pid):
        dead_pid += 1
    live_file = tmp_path / f"gauge_livesum_{me}.db"
    dead_file = tmp_path / f"gauge_livesum_{dead_pid}.db"
    live_file.write_bytes(b"")
    dead_file.write_bytes(b"")
    monkeypatch.setattr(metrics, "_last_sweep", 0.0)

    metrics.sweep_dead_worker_gauges()

    assert live_file.exists(), "own gauge file must survive"
    assert not dead_file.exists(), "dead worker's gauge file must be removed"


def test_sweep_is_throttled(tmp_path, monkeypatch):
    monkeypatch.setenv("PROMETHEUS_MULTIPROC_DIR", str(tmp_path))
    dead_pid = 2
    while _alive(dead_pid):
        dead_pid += 1
    monkeypatch.setattr(metrics, "_last_sweep", 0.0)
    metrics.sweep_dead_worker_gauges()
    # Second call inside the interval must not touch the dir.
    stale = tmp_path / f"gauge_livesum_{dead_pid}.db"
    stale.write_bytes(b"")
    metrics.sweep_dead_worker_gauges()
    assert stale.exists()


def _alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True
