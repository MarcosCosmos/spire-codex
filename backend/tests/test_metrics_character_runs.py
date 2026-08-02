"""?character= filters the metrics rows but total_runs stays the whole
bracket, so clients couldn't tell what share of the bracket that character
actually is. The table now also carries character_runs / character_wins,
read from the community blob's per-bracket by_character split."""

from app.services import run_entity_stats as res


def _setup(monkeypatch):
    monkeypatch.setattr(res, "_maybe_rebuild", lambda: None)
    monkeypatch.setattr(res, "_cache", {})
    monkeypatch.setattr(
        res,
        "_bracket_totals",
        {"solo:wr30": {"total_runs": 999, "total_wins": 300}},
    )
    monkeypatch.setattr(res, "_bracket_baselines", {"solo:wr30": {"cards": 0.3}})
    monkeypatch.setattr(
        res,
        "_community_stats",
        {
            "all": {"by_character": [{"id": "defect", "runs": 5000, "wins": 1200}]},
            "solo:wr30": {"by_character": [{"id": "defect", "runs": 123, "wins": 45}]},
        },
    )


def test_character_runs_come_from_the_requested_bracket(monkeypatch):
    _setup(monkeypatch)
    out = res.get_entity_metrics_table("cards", "solo:wr30", "DEFECT")
    assert out["total_runs"] == 999
    assert out["character_runs"] == 123
    assert out["character_wins"] == 45


def test_no_character_keeps_the_fields_null(monkeypatch):
    _setup(monkeypatch)
    out = res.get_entity_metrics_table("cards", "solo:wr30")
    assert out["character_runs"] is None
    assert out["character_wins"] is None


def test_bracket_without_community_blob_is_null_not_wrong(monkeypatch):
    # daily/custom never get a community blob, and an unknown character
    # must not fall back to some other bracket's numbers.
    _setup(monkeypatch)
    assert (
        res.get_entity_metrics_table("cards", "daily", "DEFECT")["character_runs"]
        is None
    )
    assert (
        res.get_entity_metrics_table("cards", "solo:wr30", "WATCHER")["character_runs"]
        is None
    )
