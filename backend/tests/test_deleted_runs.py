"""Soft-deleted runs disappear from the OWNER's surfaces (profile stats,
bests) but stay in community aggregates, and re-uploading the exact file
restores them — without this, delete-then-reupload left an empty list, a
stale stat tile, and every upload reporting "duplicate"."""

from app.services import runs_db_mongo


class FakeColl:
    def __init__(self):
        self.update_calls = []

    def update_one(self, q, update, **kwargs):
        self.update_calls.append((q, update))


def test_profile_scoped_stats_exclude_deleted():
    m = runs_db_mongo._build_match(None, None, None, None, None, "Lucas_9845")
    assert m["username_lower"] == "lucas_9845"
    assert m["deleted_at"] is None


def test_global_stats_keep_deleted_runs():
    # Community aggregates still count them: delete means "off my profile",
    # not "out of the community data".
    m = runs_db_mongo._build_match(None, None, None, None, None, None)
    assert "deleted_at" not in m


def test_reupload_restores_soft_deleted_run():
    coll = FakeColl()
    runs_db_mongo._undelete_on_reupload(coll, "abc123")
    ((q, update),) = coll.update_calls
    assert q == {"_id": "abc123", "deleted_at": {"$ne": None}}
    assert update == {"$unset": {"deleted_at": ""}}
