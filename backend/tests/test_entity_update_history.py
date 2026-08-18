"""Per-entity Version history must include the current beta patch, and
every entry comes from our own per-patch game-data diffs (imported
third-party prose was dropped 2026-08-18)."""

from app.routers.update_history import get_update_history
from app.services.entity_changelog import game_history_entries, version_key


def test_version_key_orders_numerically():
    assert version_key("V0.111.0") > version_key("V0.99.1")
    assert version_key("0.111.0") == version_key("V0.111.0")
    assert version_key(None) == ()


def test_game_entries_cover_the_current_beta():
    entries = game_history_entries("cards", "expect_a_fight")
    v111 = [e for e in entries if e["version"] == "V0.111.0"]
    assert v111, "0.111.0 diff changelog should yield an entry"
    changes = v111[0]["changes"]
    assert any(c.startswith("Cost: 2 → 3") for c in changes)
    # Noise fields stay out and markup is stripped from what remains.
    assert not any("description raw" in c.lower() for c in changes)
    assert not any("[gold]" in c for c in changes)


def test_history_is_game_diffs_only():
    entries = get_update_history("cards", "expect_a_fight")
    assert all(e["type"] == "Beta Patch" for e in entries)
    versions = [e.get("version") for e in entries]
    assert "V0.111.0" in versions
    keys = [version_key(v) for v in versions]
    assert keys == sorted(keys, reverse=True), "newest first"
