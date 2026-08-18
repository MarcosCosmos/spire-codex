"""The per-entity update-history endpoint serves only our own per-patch
game-data diffs; entities no archived patch touched 404 so the frontend
falls back to the site-changelog timeline."""

import pytest
from fastapi import HTTPException

from app.routers.update_history import get_update_history
from app.services.entity_changelog import game_history_entries, version_key


def test_known_entity_serves_game_diffs_newest_first():
    entries = get_update_history("cards", "expect_a_fight")
    assert entries == game_history_entries("cards", "expect_a_fight")
    keys = [version_key(e.get("version")) for e in entries]
    assert keys == sorted(keys, reverse=True)


def test_every_entry_is_a_game_diff():
    for e in get_update_history("cards", "expect_a_fight"):
        assert e["type"] == "Beta Patch"
        assert all(isinstance(c, str) and c for c in e["changes"])


def test_unknown_entity_404s():
    for entity_type, entity_id in [
        ("cards", "NOT_A_REAL_CARD"),
        ("no_such_type", "WHATEVER"),
    ]:
        with pytest.raises(HTTPException) as exc:
            get_update_history(entity_type, entity_id)
        assert exc.value.status_code == 404
