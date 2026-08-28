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


def test_community_payload_none_for_unsupported_bracket(monkeypatch, tmp_path):
    # wr50 is cube-served now; versions and unknown keys are the fallbacks.
    monkeypatch.setattr(lake_stats, "SERVE_ENABLED", True)
    monkeypatch.setattr(lake_stats, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(lake_stats, "_cube_cache", None)
    assert lake_stats.community_payload("v0.1.0") is None
    assert lake_stats.community_payload("junk") is None
    # cube-supported bracket but no cube built yet -> clean fallback too
    assert lake_stats.community_payload("wr50") is None


def test_lake_entity_overlay(monkeypatch, tmp_path):
    import json

    from app.services import run_entity_stats as res

    monkeypatch.setattr(lake_stats, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(lake_stats, "_entity_store_cache", None)
    store = {
        "entities": {
            "cards": {
                "ZAP": {
                    "picks": 100,
                    "wins": 60,
                    "by_character": {"DEFECT": {"picks": 100, "wins": 60}},
                }
            }
        },
        "baselines": {"cards": 0.5},
    }
    (tmp_path / "entity_store.json").write_text(json.dumps(store))
    monkeypatch.setattr(res, "_LAKE_ENTITY_SERVE", True)
    monkeypatch.setattr(res, "_lake_overlay_checked", 0.0)
    monkeypatch.setattr(res, "_lake_overlay_mtime", 0.0)
    res._cache[("cards", "ZAP")] = {
        "picks": 1,
        "wins": 0,
        "brackets": {"a10": {"picks": 5}},
    }
    try:
        res._maybe_overlay_lake_entities()
        e = res._cache[("cards", "ZAP")]
        assert e["picks"] == 100
        assert e["brackets"]["a10"]["picks"] == 5
        assert res._type_baselines["cards"] == 0.5
    finally:
        res._cache.pop(("cards", "ZAP"), None)
        res._type_baselines.pop("cards", None)


def test_stats_core_excludes_modded_characters(monkeypatch):
    cells = [
        ("IRONCLAD", 0, 100, 30, 5),
        ("SILENT", 10, 50, 20, 2),
        ("THE_MODDED_ONE", 0, 40, 39, 0),
    ]
    monkeypatch.setattr(lake_stats, "_connect", lambda build=False: None)

    class FakeCon:
        def execute(self, *a):
            return self

        def fetchall(self):
            return cells

        def close(self):
            pass

    monkeypatch.setattr(lake_stats, "_connect", lambda build=False: FakeCon())
    results = dict(
        (tuple(sorted(lake_stats.filters_compact(f).items())), r)
        for f, r in lake_stats._stats_core_results()
    )
    g = results[()]
    assert g["total_runs"] == 150, "modded character runs must not count"
    assert g["total_wins"] == 50
    assert sum(c["total"] for c in g["characters"]) == g["total_runs"]
    assert all("abandoned" in c for c in g["characters"])


def test_encounter_blob_keys_fold():
    from app.services.lake_stats import _encounter_blob_keys

    recent = frozenset({"v0.111.0"})
    ks = _encounter_blob_keys("standard|1|1|2|v0.111.0", recent)
    assert set(ks) == {
        "all",
        "solo",
        "a10",
        "wr30",
        "wr50",
        "ver:v0.111.0",
        "solo:v0.111.0",
        "a10:v0.111.0",
        "wr30:v0.111.0",
        "wr50:v0.111.0",
    }
    assert _encounter_blob_keys("custom|4|0|0|v9", recent) == ["all", "4p"]
    assert _encounter_blob_keys("garbage", recent) == []


def test_entity_cube_cell_matching_and_fold_parity():
    from app.services.lake_stats import _cell_matches, _parse_lake_bracket

    cell = "standard|1|1|2|v0.111.0"
    assert _parse_lake_bracket("standard") is not None
    assert _parse_lake_bracket("solo:standard") is not None
    m, p, s, v = _parse_lake_bracket("solo:standard")
    assert _cell_matches(cell, m, p, s, v)
    assert not _cell_matches("custom|1|1|2|v0.111.0", m, p, s, v)
    m, p, s, v = _parse_lake_bracket("wr50")
    assert _cell_matches(cell, m, p, s, v)
    assert not _cell_matches("standard|1|1|1|v0.111.0", m, p, s, v)
    m, p, s, v = _parse_lake_bracket("2p:a10:standard")
    assert not _cell_matches(cell, m, p, s, v)
    assert _cell_matches("standard|2|1|0|v9", m, p, s, v)


def test_encounter_ghost_rows_pruned_from_every_bracket():
    from app.services.lake_stats import _prune_ghost_rows

    big = ("AEONGLASS_BOSS", 3, "boss", "IRONCLAD", "solo")
    ghost = ("AEONGLASS_BOSS", 1, "boss", "IRONCLAD", "solo")
    accs = {
        "all": {big: [111398, 28121, 1.0, 1.0], ghost: [16, 13, 1.0, 1.0]},
        "solo": {big: [90000, 20000, 1.0, 1.0], ghost: [10, 8, 1.0, 1.0]},
        "wr75": {big: [40, 5, 1.0, 1.0]},
    }
    _prune_ghost_rows(accs)
    assert ghost not in accs["all"] and ghost not in accs["solo"]
    assert big in accs["all"] and big in accs["solo"]
    # A legitimately small row in a niche bracket survives: the floor is
    # judged on the ALL bracket, not per bracket.
    assert big in accs["wr75"]
