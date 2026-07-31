"""The per-entity update-history endpoint serves the game-patch tables in
data/entity_history.json; unknown entities 404 so the frontend can fall
back to the site-changelog timeline."""

import pytest
from fastapi import HTTPException

from app.routers.update_history import _histories, get_update_history


def test_history_file_loads_and_is_well_formed():
    types = _histories()
    assert len(types["cards"]) > 400
    assert len(types["relics"]) > 150
    for entity_type, entities in types.items():
        for entity_id, entries in list(entities.items())[:30]:
            assert entity_id == entity_id.upper(), (entity_type, entity_id)
            assert entries
            for entry in entries:
                assert set(entry) == {"version", "type", "date", "changes"}
                assert isinstance(entry["changes"], list)
                assert all(isinstance(c, str) and c for c in entry["changes"])


def test_dated_entries_are_newest_first():
    checked = 0
    for entities in _histories().values():
        for entries in entities.values():
            dates = [e["date"] for e in entries if e["date"]]
            if len(dates) > 1:
                assert dates == sorted(dates, reverse=True)
                checked += 1
    assert checked > 50


def test_known_entity_returns_its_entries():
    types = _histories()
    card_id = next(iter(types["cards"]))
    assert get_update_history("cards", card_id.lower()) == types["cards"][card_id]


def test_unknown_entity_404s():
    for entity_type, entity_id in [
        ("cards", "NOT_A_REAL_CARD"),
        ("no_such_type", "WHATEVER"),
    ]:
        with pytest.raises(HTTPException) as exc:
            get_update_history(entity_type, entity_id)
        assert exc.value.status_code == 404


def test_starter_variants_have_history():
    # Duplicate-named starters resolve to per-character pages
    # (e.g. "Strike (Ironclad)"), which regressed once already.
    cards = _histories()["cards"]
    assert "STRIKE_IRONCLAD" in cards
    assert "DEFEND_IRONCLAD" in cards


def test_name_collisions_stay_in_their_type():
    types = _histories()
    # Accelerant is both a card and a power; the power page lookup must not
    # pick up the card page's history.
    assert "ACCELERANT" in types["cards"]
    assert "ACCELERANT" not in types.get("powers", {})
