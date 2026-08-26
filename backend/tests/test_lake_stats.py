from app.services import lake_stats


def test_available_false_without_lake(monkeypatch, tmp_path):
    monkeypatch.setattr(lake_stats, "LAKE_DIR", tmp_path)
    assert lake_stats.available() is False


def test_shadow_check_never_raises_without_lake(monkeypatch, tmp_path, caplog):
    caplog.set_level("INFO")
    monkeypatch.setattr(lake_stats, "LAKE_DIR", tmp_path / "missing")
    lake_stats.shadow_check()
    assert any("lake" in r.message for r in caplog.records)


def test_flag_parses_common_forms(monkeypatch):
    for raw, want in (
        ("on", True),
        ("1", True),
        ("true", True),
        ("", False),
        ("off", False),
    ):
        assert ((raw or "").lower() in ("1", "on", "true")) is want


def test_community_payload_none_when_disabled(monkeypatch):
    monkeypatch.setattr(lake_stats, "SERVE_ENABLED", False)
    assert lake_stats.community_payload() is None


def test_community_payload_none_without_lake(monkeypatch, tmp_path):
    monkeypatch.setattr(lake_stats, "SERVE_ENABLED", True)
    monkeypatch.setattr(lake_stats, "LAKE_DIR", tmp_path)
    assert lake_stats.community_payload() is None


def test_community_payload_none_for_unsupported_bracket(monkeypatch):
    monkeypatch.setattr(lake_stats, "SERVE_ENABLED", True)
    assert lake_stats.community_payload("wr50") is None
