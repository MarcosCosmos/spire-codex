"""ENTITY_SNAPSHOT_LOAD=off must keep the frozen snapshot out of memory."""

from app.services import run_entity_stats as res


def test_off_returns_false_without_touching_mongo(monkeypatch):
    monkeypatch.setenv("ENTITY_SNAPSHOT_LOAD", "off")

    def boom():
        raise AssertionError("snapshot collection touched with loads disabled")

    monkeypatch.setattr(res, "_snapshot_coll", boom)
    assert res._load_snapshot() is False


def test_default_still_reads_the_snapshot(monkeypatch):
    monkeypatch.delenv("ENTITY_SNAPSHOT_LOAD", raising=False)
    calls = {}

    class _Coll:
        def find_one(self, q):
            calls["hit"] = True
            return None

    monkeypatch.setattr(res, "_snapshot_coll", lambda: _Coll())
    assert res._load_snapshot() is False
    assert calls.get("hit")


def test_flag_reads_env_per_call(monkeypatch):
    monkeypatch.setenv("ENTITY_SNAPSHOT_LOAD", "off")
    assert res._snapshot_boot_disabled()
    monkeypatch.setenv("ENTITY_SNAPSHOT_LOAD", "on")
    assert not res._snapshot_boot_disabled()
