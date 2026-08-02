"""Community records (fastest win / longest run / biggest deck) must come
from standard, modifier-free runs: a custom game stacked with Sealed Deck /
Hoarder produces a multi-thousand-card deck that would hold the record
forever and read as modded data on /community-stats."""

from app.services import community_stats


def _fold(acc, blob, *, is_win=True, run_hash="r1"):
    community_stats._accumulate_one(
        acc,
        blob,
        run_hash=run_hash,
        is_win=is_win,
        character="ironclad",
        ascension=10,
    )


def test_custom_mode_runs_set_no_records():
    acc = community_stats._new_acc_one()
    _fold(
        acc,
        {
            "game_mode": "custom",
            "modifiers": [{"id": "MODIFIER.HOARDER"}],
            "run_time": 100,
            "players": [{"deck": [{}] * 2364}],
        },
    )
    assert acc["fastest_win"] is None
    assert acc["longest_run"] is None
    assert acc["biggest_deck"] is None


def test_modifiers_disqualify_even_standard_mode():
    acc = community_stats._new_acc_one()
    _fold(
        acc,
        {
            "game_mode": "standard",
            "modifiers": [{"id": "MODIFIER.SEALED_DECK"}],
            "run_time": 100,
            "players": [{"deck": [{}] * 999}],
        },
    )
    assert acc["biggest_deck"] is None


def test_standard_runs_still_hold_records():
    acc = community_stats._new_acc_one()
    _fold(
        acc,
        {"game_mode": "standard", "run_time": 1200, "players": [{"deck": [{}] * 40}]},
    )
    # Missing game_mode counts as standard (old blobs predate the field).
    _fold(
        acc,
        {"run_time": 900, "players": [{"deck": [{}] * 55}]},
        run_hash="r2",
    )
    assert acc["fastest_win"] == (900, "r2")
    assert acc["longest_run"] == (1200, "r1")
    assert acc["biggest_deck"] == (55, "r2")


def test_custom_run_cannot_beat_a_standard_record():
    acc = community_stats._new_acc_one()
    _fold(
        acc,
        {"game_mode": "standard", "run_time": 1200, "players": [{"deck": [{}] * 40}]},
    )
    _fold(
        acc,
        {"game_mode": "custom", "run_time": 60, "players": [{"deck": [{}] * 500}]},
        run_hash="r2",
    )
    assert acc["fastest_win"] == (1200, "r1")
    assert acc["biggest_deck"] == (40, "r1")
