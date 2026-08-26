from app.services import user_insights as ui


class FakeColl:
    def __init__(self):
        self.docs = {}

    def replace_one(self, flt, doc, upsert=False):
        self.docs[flt["_id"]] = doc

    def find_one(self, flt):
        return self.docs.get(flt["_id"])


def test_redis_miss_serves_durable_store(monkeypatch):
    fake = FakeColl()
    fake.docs["u1:"] = {"_id": "u1:", "payload": {"total_runs": 42}}
    monkeypatch.setattr(ui, "_insights_coll", lambda: fake)
    monkeypatch.setattr(ui, "_cache_get", lambda k: None)
    stored_redis = {}
    monkeypatch.setattr("app.services.cache.get_json", lambda k: None)
    monkeypatch.setattr(
        "app.services.cache.set_json",
        lambda k, v, ttl_seconds=None: stored_redis.__setitem__(k, v),
    )
    kicked = []
    monkeypatch.setattr(ui, "_kick_refresh", lambda *a: kicked.append(a))
    out = ui.get_user_insights("u1")
    assert out == {"total_runs": 42}
    assert stored_redis, "redis should be re-warmed from the store"
    assert kicked, "a background refresh should still be kicked"


def test_never_computed_still_builds(monkeypatch):
    monkeypatch.setattr(ui, "_insights_coll", lambda: FakeColl())
    monkeypatch.setattr(ui, "_cache_get", lambda k: None)
    monkeypatch.setattr("app.services.cache.get_json", lambda k: None)
    monkeypatch.setattr(ui, "_kick_refresh", lambda *a: None)
    assert ui.get_user_insights("nobody") == {"building": True}


def test_store_write_failure_is_soft(monkeypatch):
    class Boom:
        def replace_one(self, *a, **k):
            raise RuntimeError("db down")

    monkeypatch.setattr(ui, "_insights_coll", lambda: Boom())
    ui._store_payload("k", {"x": 1})  # must not raise
