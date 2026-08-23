"""Filters compose: player x skill x mode all narrow together, so picking
Standard on top of Solo + A10 keeps Solo + A10 (it used to replace them).

Everything the UI can express must have a materialized slice, and the entity
cache and the community blob have to agree on what each combination is
called, or one surface silently serves an empty bracket."""

from app.services.community_stats import _BLOB_BRACKETS
from app.services.run_entity_stats import (
    _ALL_BRACKET_COMBOS,
    _MODE_BRACKET_KEYS,
    _PLAYER_BRACKETS,
    _SKILL_BRACKETS,
    axis_combos,
)


def test_entity_and_community_key_sets_match():
    assert sorted(_ALL_BRACKET_COMBOS) == sorted(
        k for k in _BLOB_BRACKETS if k != "all"
    )
    assert "all" in _BLOB_BRACKETS


def test_every_expressible_combination_exists():
    combos = set(_ALL_BRACKET_COMBOS)
    for p in ("",) + _PLAYER_BRACKETS:
        for s in ("",) + _SKILL_BRACKETS:
            for m in ("",) + _MODE_BRACKET_KEYS:
                key = ":".join(x for x in (p, s, m) if x)
                if key:
                    assert key in combos, key
    # 5 player slots x 5 skill slots x 4 mode slots, minus the empty one.
    assert len(combos) == 99


def test_a_run_lands_in_every_slice_that_contains_it():
    keys = set(axis_combos(["solo"], ["a10", "wr30"], ["standard"]))
    # Singles, pairs, and the full triple all get the run.
    for expected in (
        "solo",
        "a10",
        "standard",
        "solo:a10",
        "solo:standard",
        "a10:standard",
        "solo:a10:standard",
        "solo:wr30:standard",
    ):
        assert expected in keys, expected
    # It must NOT land in a slice it doesn't belong to.
    for unexpected in ("2p", "daily", "wr75", "solo:daily", "2p:a10:standard"):
        assert unexpected not in keys, unexpected


def test_canonical_order_is_player_skill_mode():
    for key in _ALL_BRACKET_COMBOS:
        parts = key.split(":")
        axes = [
            0 if p in _PLAYER_BRACKETS else 1 if p in _SKILL_BRACKETS else 2
            for p in parts
        ]
        assert axes == sorted(axes), key
