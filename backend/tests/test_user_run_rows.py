"""get_user_run_rows must surface the run hash from the document _id: runs
have no run_hash field (the hash IS _id, see get_user_runs), and projecting a
nonexistent run_hash returned rows without hashes — the insights walk then
loaded zero blobs and every profile rendered the "No insights yet" empty
state (found live on 2026-08-11)."""

from datetime import datetime, timedelta

from app.services import runs_db_mongo


def _apply_projection(doc, projection):
    projection = projection or {}
    out = {k: doc[k] for k, v in projection.items() if v and k != "_id" and k in doc}
    if projection.get("_id", 1):
        out["_id"] = doc["_id"]
    return out


class FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, *a, **k):
        return self

    def limit(self, n):
        self.docs = self.docs[:n]
        return self

    def __iter__(self):
        return iter(self.docs)


class FakeColl:
    """Mongo-faithful on the one point that matters here: documents carry
    _id and no run_hash, and the projection is applied literally."""

    def __init__(self, docs):
        self.docs = docs

    def find(self, q, projection=None, **kwargs):
        return FakeCursor([_apply_projection(d, projection) for d in self.docs])


def test_run_hash_comes_from_document_id(monkeypatch):
    now = datetime.utcnow()
    docs = [
        {
            "_id": f"hash{i}",
            "user_id": "ignored-by-fake",
            "win": i % 2 == 0,
            "character": "IRONCLAD",
            "ascension": 10,
            "submitted_at": now - timedelta(hours=i),
            "game_mode": "standard",
            "player_count": 1,
        }
        for i in range(3)
    ]
    monkeypatch.setattr(runs_db_mongo, "_get_collection", lambda: FakeColl(docs))

    rows = runs_db_mongo.get_user_run_rows("0" * 24)

    assert [r["run_hash"] for r in rows] == ["hash0", "hash1", "hash2"]
    assert all("_id" not in r for r in rows)
    assert rows[0]["character"] == "IRONCLAD"
