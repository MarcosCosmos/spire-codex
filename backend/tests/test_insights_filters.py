"""Profile insights filter axes: exact row narrowing per axis, and cache-key
back-compat — the unfiltered and character-only keys predate
ascension/version/players and must not change, or a deploy cold-starts every
cached profile into "building" at once."""

from app.services.user_insights import _apply_row_filters, _filters_suffix

ROWS = [
    {
        "character": "CHARACTER.IRONCLAD",
        "ascension": 10,
        "build_id": "v0.111.0",
        "player_count": 1,
    },
    {"character": "SILENT", "ascension": 10, "build_id": "v0.110.1", "player_count": 2},
    {
        "character": "IRONCLAD",
        "ascension": 0,
        "build_id": "v0.111.0",
        "player_count": 1,
    },
    {"character": "REGENT", "ascension": 5, "build_id": None, "player_count": None},
]


def test_each_axis_filters_exactly():
    assert len(_apply_row_filters(ROWS, "IRONCLAD", None, None, None)) == 2
    assert len(_apply_row_filters(ROWS, None, 10, None, None)) == 2
    assert len(_apply_row_filters(ROWS, None, None, "v0.111.0", None)) == 2
    assert len(_apply_row_filters(ROWS, None, None, None, 1)) == 3  # None counts solo
    assert len(_apply_row_filters(ROWS, "IRONCLAD", 10, "v0.111.0", 1)) == 1
    assert _apply_row_filters(ROWS, None, None, None, None) == ROWS


def test_cache_keys_stay_backward_compatible():
    assert _filters_suffix(None, None, None, None) == ":"
    assert _filters_suffix("IRONCLAD", None, None, None) == ":IRONCLAD"
    assert _filters_suffix(None, 10, None, None) == "::a10:v:p"
    assert _filters_suffix("SILENT", 10, "v0.111.0", 2) == ":SILENT:a10:vv0.111.0:p2"


def test_filters_map_to_materialized_brackets():
    from app.services.user_insights import _filters_bracket

    assert _filters_bracket(None, None, None) is None
    assert _filters_bracket(10, None, None) == "a10"
    assert _filters_bracket(None, None, 1) == "solo"
    assert _filters_bracket(10, "v0.111.0", 1) == "solo:a10:v0.111.0"
    assert _filters_bracket(7, None, None) is None  # only A10 has a bracket
    assert _filters_bracket(None, "v0.110.1", 3) == "3p:v0.110.1"


def test_mode_brackets_materialize():
    from app.services.community_stats import new_accumulator
    from app.services.run_entity_stats import _run_extra_brackets

    acc = new_accumulator(("v0.111.0",))
    for key in ("standard", "daily", "custom", "standard:v0.111.0"):
        assert key in acc
    assert "standard" in _run_extra_brackets(1, 0, "standard")
    assert "standard" in _run_extra_brackets(1, 0, "")
    assert "daily" in _run_extra_brackets(1, 0, "daily")
    assert "standard" not in _run_extra_brackets(1, 0, "custom")
