"""Mods register their own campfire options (AUTOTHESPIRE-MERGE, TRADE,
GODREMOVE, HealSherry, ...) which land in run files like real choices, so the
community-stats rest-site table must keep only the game's own *RestSiteOption
ids and compute shares over the official total."""

from app.services import community_stats


def test_rest_sites_drop_modded_options():
    acc = community_stats._new_acc_one()
    acc["rest"] = {
        "SMITH": [6, 3, 1],
        "HEAL": [2, 1, 2],
        "AUTOTHESPIRE-MERGE": [92, 92, 0],
        "TRADE": [4, 0, 0],
        "HealSherry": [3, 0, 0],
    }
    rows = community_stats._rest_sites(acc)
    assert [r["id"] for r in rows] == ["SMITH", "HEAL"]
    # Shares are over the official picks (8), not diluted by the dropped 99.
    assert rows[0]["pct"] == 75.0
    assert rows[1]["pct"] == 25.0
    assert rows[0]["win_rate"] == 50.0


def test_rest_sites_keep_every_official_option():
    acc = community_stats._new_acc_one()
    acc["rest"] = {c: [1, 0, 0] for c in community_stats._OFFICIAL_REST_OPTIONS}
    rows = community_stats._rest_sites(acc)
    assert {r["id"] for r in rows} == set(community_stats._OFFICIAL_REST_OPTIONS)
