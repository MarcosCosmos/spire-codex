"""Read-path behavior: sibling lookup stays scoped to real multiplayer
parties, and a blob-cache miss is never cached as a permanent 404."""

import json

from app.services import runs_db_mongo


class FakeCursor:
    def __init__(self, docs):
        self.docs = docs
        self.limited = None

    def limit(self, n):
        self.limited = n
        return self

    def __iter__(self):
        return iter(self.docs)


class FakeColl:
    def __init__(self, row, sibling_docs=()):
        self.row = row
        self.sibling_docs = list(sibling_docs)
        self.find_queries = []

    def find_one(self, q, projection=None, **kwargs):
        return self.row

    def find(self, q, projection=None, **kwargs):
        self.find_queries.append(q)
        return FakeCursor(self.sibling_docs)


def _patch(monkeypatch, coll):
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: coll)


def test_solo_run_has_no_siblings(monkeypatch):
    coll = FakeColl({"seed": "S1", "player_count": 1, "game_mode": "standard"})
    _patch(monkeypatch, coll)
    assert runs_db_mongo.find_sibling_hashes("h") == []
    assert coll.find_queries == []


def test_daily_run_has_no_siblings(monkeypatch):
    # A daily seed is shared by every player that day; "same seed" there
    # would let the caller copy an unrelated player's file in.
    coll = FakeColl({"seed": "24_07_2026", "player_count": 2, "game_mode": "daily"})
    _patch(monkeypatch, coll)
    assert runs_db_mongo.find_sibling_hashes("h") == []
    assert coll.find_queries == []


def test_multiplayer_siblings_match_party_size(monkeypatch):
    coll = FakeColl(
        {"seed": "S2", "player_count": 2, "game_mode": "standard"},
        sibling_docs=[{"_id": "sib1"}],
    )
    _patch(monkeypatch, coll)
    assert runs_db_mongo.find_sibling_hashes("h") == ["sib1"]
    (q,) = coll.find_queries
    assert q["seed"] == "S2"
    assert q["player_count"] == 2
    assert q["_id"] == {"$ne": "h"}


def test_blob_cache_does_not_cache_misses(tmp_path, monkeypatch):
    from app.routers import runs as runs_router

    monkeypatch.setattr(runs_router, "_data_dir", tmp_path)
    monkeypatch.delenv("MONGO_URL", raising=False)
    runs_router._load_run_blob.cache_clear()
    (tmp_path / "runs").mkdir()

    assert runs_router._load_run_blob("abc") is None

    blob = {"seed": "S3"}
    (tmp_path / "runs" / "abc.json").write_text(json.dumps(blob), encoding="utf-8")
    cached = runs_router._load_run_blob("abc")
    assert cached is not None
    assert json.loads(cached) == blob
