"""The heap snapshot must always return, even with caches in odd states."""

from app.services.memory_debug import _json_mb, snapshot


def test_snapshot_shape():
    out = snapshot(top=5)
    assert out["pid"]
    assert len(out["census_top"]) == 5
    assert all("shallow_mb" in r for r in out["census_top"])
    assert "insights_cache" in out["probes"]
    assert "lake_caches" in out["probes"]


def test_json_mb_never_raises():
    assert _json_mb({"a": 1}) >= 0
    assert _json_mb({("tuple", "key"): 1}) == -1.0
    assert _json_mb(object()) >= 0
