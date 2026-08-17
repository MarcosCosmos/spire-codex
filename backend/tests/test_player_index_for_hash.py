"""player_index_for_hash must invert _submit_player_run's hash recipe, so
co-op share pages can show the viewed player's character instead of the
host's (reported live 2026-08-17)."""

import hashlib

from app.services.runs_db_mongo import player_index_for_hash, primary_share_hash

BLOB = {
    "seed": "ABC123",
    "start_time": 1776393693,
    "run_time": 2400,
    "players": [
        {"character": "CHARACTER.IRONCLAD", "deck": [{"id": "BASH"}] * 12},
        {"character": "CHARACTER.SILENT", "deck": [{"id": "NEUTRALIZE"}] * 15},
        {"character": "CHARACTER.REGENT", "deck": [{"id": "POKE"}] * 9},
    ],
}


def _hash_for(idx: int) -> str:
    p = BLOB["players"][idx]
    key = (
        f"{BLOB['seed']}:{p['character']}:{BLOB['start_time']}:"
        f"{BLOB['run_time']}:{len(p['deck'])}:{idx}"
    )
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def test_each_sibling_hash_maps_to_its_player():
    for idx in range(3):
        assert player_index_for_hash(BLOB, _hash_for(idx)) == idx


def test_primary_hash_is_player_zero():
    assert primary_share_hash(BLOB) == _hash_for(0)
    assert player_index_for_hash(BLOB, primary_share_hash(BLOB)) == 0


def test_unknown_hash_returns_none():
    assert player_index_for_hash(BLOB, "deadbeefdeadbeef") is None
    assert player_index_for_hash({}, "deadbeefdeadbeef") is None
