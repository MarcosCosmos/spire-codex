"""Mods inject extra options into official events (every installed card-pool
mod shows up as a Colorful Philosophers pick), so the community-stats event
section only keeps options from the event's own option tree. The allowlist
must walk the whole tree: the top-level options list misses the multi-stage
picks (HOLD_ON_1..6, LINGER, ...), and dropping those would erase real data."""

from app.services import community_stats


def test_harvest_walks_nested_pages():
    event = {
        "options": [{"id": "OVERCOME"}, {"id": "HOLD_ON_0"}],
        "pages": [
            {
                "id": "INITIAL",
                "options": [
                    {"id": "hold_on_1", "next": {"options": [{"id": "HOLD_ON_2"}]}}
                ],
            }
        ],
    }
    ids = community_stats._harvest_option_ids(event)
    assert {"OVERCOME", "HOLD_ON_0", "INITIAL", "HOLD_ON_1", "HOLD_ON_2"} <= ids


def test_catalog_allowlist_covers_multi_stage_options():
    ids = community_stats._name_maps()["_event_option_ids"]
    assert {"HOLD_ON_1", "HOLD_ON_6"} <= ids["SLIPPERY_BRIDGE"]
    assert {"LINGER", "EXIT_BATHS"} <= ids["ABYSSAL_BATHS"]
    assert "CARD_POOL∴WATCHER-WATCHER_CARD_POOL" not in ids["COLORFUL_PHILOSOPHERS"]
    assert "MEILIN" not in ids["COLORFUL_PHILOSOPHERS"]


def test_finalize_drops_modded_event_options():
    acc = community_stats._new_acc_one()
    acc["events"]["COLORFUL_PHILOSOPHERS"] = {
        "IRONCLAD": 8,
        "SILENT": 2,
        "CARD_POOL∴WATCHER-WATCHER_CARD_POOL": 3,
        "MEILIN": 1,
    }
    out = community_stats._finalize_one(acc)
    ev = next(e for e in out["events"] if e["id"] == "COLORFUL_PHILOSOPHERS")
    assert {o["id"] for o in ev["options"]} == {"IRONCLAD", "SILENT"}
    # Percentages are over the real options, not diluted by the dropped ones.
    assert ev["total"] == 10
    assert next(o for o in ev["options"] if o["id"] == "IRONCLAD")["pct"] == 80.0


def test_finalize_keeps_multi_stage_options():
    acc = community_stats._new_acc_one()
    acc["events"]["SLIPPERY_BRIDGE"] = {"OVERCOME": 5, "HOLD_ON_3": 4}
    out = community_stats._finalize_one(acc)
    ev = next(e for e in out["events"] if e["id"] == "SLIPPERY_BRIDGE")
    assert {o["id"] for o in ev["options"]} == {"OVERCOME", "HOLD_ON_3"}
    assert ev["total"] == 9
