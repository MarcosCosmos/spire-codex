"""Hidden (cheated/moderated) runs must stay out of every public ranking
surface: the bulk export, single-run ranks, and the mod's seed panel."""

from app.routers.exports import _build_match
from app.services import runs_db_mongo

HIDDEN_CLAUSE = {"hidden": {"$ne": True}}


class FakeColl:
    """Captures the filters each query runs with."""

    def __init__(self, row=None):
        self.row = row
        self.find_one_queries = []
        self.count_queries = []

    def find_one(self, q, projection=None, **kwargs):
        self.find_one_queries.append(q)
        return self.row

    def count_documents(self, q):
        self.count_queries.append(q)
        return 0


def test_export_match_excludes_hidden():
    match = _build_match(None, None, None)
    assert HIDDEN_CLAUSE in match["$and"]


def test_get_run_rank_refuses_hidden_run(monkeypatch):
    fake = FakeColl(
        {"win": True, "hidden": True, "character": "IRONCLAD", "run_time": 90}
    )
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: fake)
    assert runs_db_mongo.get_run_rank("h1")["rank"] is None
    assert fake.count_queries == []


def test_get_run_rank_counts_exclude_hidden(monkeypatch):
    fake = FakeColl({"win": True, "character": "IRONCLAD", "run_time": 90})
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: fake)
    out = runs_db_mongo.get_run_rank("h1")
    assert out["rank"] == 1
    assert fake.count_queries
    for q in fake.count_queries:
        assert q.get("hidden") == {"$ne": True}


def test_get_run_rank_scoped_excludes_hidden(monkeypatch):
    fake = FakeColl({"win": True, "character": "SILENT", "run_time": 120})
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: fake)
    out = runs_db_mongo.get_run_rank_scoped("h2", game_mode="standard")
    assert out["rank"] == 1
    for q in fake.count_queries:
        assert q.get("hidden") == {"$ne": True}


def test_seed_rank_for_excludes_hidden_everywhere(monkeypatch):
    fake = FakeColl(None)
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: fake)
    runs_db_mongo.seed_rank_for("7656119", "SEEDX")
    assert fake.count_queries and fake.find_one_queries
    for q in fake.count_queries + fake.find_one_queries:
        assert q.get("hidden") == {"$ne": True}, q
