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
