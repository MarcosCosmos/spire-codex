"""Profile insights walk the player's own runs through the community-stats
accumulator and attach community baselines, so the profile page can show
"you vs everyone" for deaths, campfires, events, boons, and card picks."""

from app.services import community_stats, user_insights
from app.services import runs_db_mongo


def _fake_backend(monkeypatch, rows, blobs, community, table, tallies):
    monkeypatch.setattr(runs_db_mongo, "get_user_run_rows", lambda uid, limit: rows)
    monkeypatch.setattr(
        runs_db_mongo, "get_run_blobs", lambda hashes: {h: blobs[h] for h in hashes}
    )
    monkeypatch.setattr(
        runs_db_mongo, "get_user_card_pick_tallies", lambda uid, character=None: tallies
    )
    monkeypatch.setattr(user_insights, "get_community_stats", lambda: community)
    monkeypatch.setattr(user_insights, "get_entity_metrics_table", lambda etype: table)
    user_insights._cache.clear()


def test_insights_walk_and_compare(monkeypatch):
    rows = [
        {"run_hash": "r1", "win": True, "character": "IRONCLAD", "ascension": 10},
        {"run_hash": "r2", "win": False, "character": "IRONCLAD", "ascension": 10},
    ]
    blobs = {
        "r1": {
            "game_mode": "standard",
            "run_time": 900,
            "players": [{"deck": [{}] * 30}],
        },
        "r2": {
            "game_mode": "standard",
            "run_time": 1200,
            "killed_by_encounter": "ENCOUNTER.KNOWLEDGE_DEMON_BOSS",
            "players": [{"deck": [{}] * 22}],
        },
    }
    community = {
        "rest_sites": [{"id": "SMITH", "pct": 54.7}],
        "deaths": {
            "encounters": [{"id": "KNOWLEDGE_DEMON_BOSS", "pct": 5.5}],
            "events": [],
        },
        "ancient_picks": [],
        "events": [],
    }
    table = {
        "rows": [
            {"id": "WHIRLWIND", "upgraded": False, "pick_rate": 30.0},
            {"id": "FLEX", "upgraded": False, "pick_rate": 45.0},
        ]
    }
    tallies = {
        "WHIRLWIND": {"picked": 9, "offered": 10},
        "FLEX": {"picked": 1, "offered": 10},
        "RARE_SEEN_TWICE": {"picked": 2, "offered": 2},
    }
    _fake_backend(monkeypatch, rows, blobs, community, table, tallies)

    out = user_insights.get_user_insights("507f1f77bcf86cd799439011")
    assert out["total_runs"] == 2
    assert out["runs_walked"] == 2
    assert out["records"]["fastest_win"] == {"run_time": 900, "run_hash": "r1"}
    deaths = out["deaths"]["encounters"]
    assert deaths and deaths[0]["id"] == "KNOWLEDGE_DEMON_BOSS"
    # Community share rides along for the comparison UI.
    assert deaths[0]["community_pct"] == 5.5
    # Card deltas: 90% vs 30% is over-picked, 10% vs 45% under-picked, and
    # the 2-offer sample is dropped by the minimum.
    over = out["card_picks"]["over_picked"]
    under = out["card_picks"]["under_picked"]
    assert [d["id"] for d in over] == ["WHIRLWIND"]
    assert over[0]["gap"] == 60.0
    assert [d["id"] for d in under] == ["FLEX"]
    assert all(d["id"] != "RARE_SEEN_TWICE" for d in over + under)


def test_insights_cached_per_user(monkeypatch):
    calls = {"n": 0}

    def rows(uid, limit):
        calls["n"] += 1
        return []

    monkeypatch.setattr(runs_db_mongo, "get_user_run_rows", rows)
    monkeypatch.setattr(runs_db_mongo, "get_run_blobs", lambda h: {})
    monkeypatch.setattr(
        runs_db_mongo, "get_user_card_pick_tallies", lambda uid, character=None: {}
    )
    monkeypatch.setattr(user_insights, "get_community_stats", lambda: {})
    monkeypatch.setattr(
        user_insights, "get_entity_metrics_table", lambda etype: {"rows": []}
    )
    user_insights._cache.clear()

    user_insights.get_user_insights("u1")
    user_insights.get_user_insights("u1")
    assert calls["n"] == 1


def test_event_divergence_needs_sample_and_gap():
    mine = {
        "events": [
            {
                "id": "SLIPPERY_BRIDGE",
                "name": "Slippery Bridge",
                "total": 20,
                "options": [
                    {
                        "id": "OVERCOME",
                        "label": "Overcome",
                        "pct": 80.0,
                        "community_pct": 39.1,
                    },
                ],
            },
            # Too few visits: dropped no matter the gap.
            {
                "id": "RARE_EVENT",
                "name": "Rare",
                "total": 2,
                "options": [
                    {"id": "A", "label": "A", "pct": 100.0, "community_pct": 10.0}
                ],
            },
        ]
    }
    out = user_insights._event_divergence(mine)
    assert [r["event_id"] for r in out] == ["SLIPPERY_BRIDGE"]
    assert out[0]["gap"] == 40.9


def test_finalize_shape_matches_community_page():
    # The personal blob is finalized by the SAME function as /community-stats,
    # so the modded-content filters apply to profiles too.
    acc = community_stats._new_acc_one()
    acc["rest"] = {"SMITH": [3, 2, 1], "AUTOTHESPIRE-MERGE": [50, 50, 0]}
    out = community_stats._finalize_one(acc)
    assert [r["id"] for r in out["rest_sites"]] == ["SMITH"]


def test_streaks_and_weekly_activity():
    rows = [
        {"win": True, "submitted_at": "2026-08-02T10:00:00"},
        {"win": True, "submitted_at": "2026-08-01T10:00:00", "player_count": 2},
        {"win": False, "submitted_at": "2026-07-28T10:00:00", "game_mode": "daily"},
        {"win": True, "submitted_at": "2026-07-27T10:00:00", "game_mode": "custom"},
        {"win": True, "submitted_at": "2026-07-05T10:00:00"},
        {"win": True, "submitted_at": "2026-06-30T10:00:00"},
    ]
    s = user_insights._streaks(rows)
    assert s == {"current_win_streak": 2, "best_win_streak": 3}
    a = user_insights._activity(rows)
    # Weekly buckets keyed by the Monday of each week, oldest first.
    assert [w["week"] for w in a] == ["2026-06-29", "2026-07-27"]
    older, newer = a
    assert older == {
        "week": "2026-06-29",
        "runs": 2,
        "wins": 2,
        "solo": 2,
        "coop": 0,
        "daily": 0,
        "custom": 0,
        "win_rate": 100.0,
    }
    assert newer["runs"] == 4
    assert newer["solo"] == 1 and newer["coop"] == 1
    assert newer["daily"] == 1 and newer["custom"] == 1
    assert newer["win_rate"] == 75.0


def test_percentiles_use_qualifying_floor(monkeypatch):
    winrates = {
        "peter": [20, 12],
        "alice": [10, 2],
        "bob": [40, 30],
        "tiny": [3, 3],
    }
    monkeypatch.setattr(runs_db_mongo, "get_user_winrates", lambda: winrates)
    out = user_insights._percentiles("Peter")
    assert out["win_rate"] == 60.0
    assert out["players"] == 3
    assert out["win_rate_percentile"] == 33
    assert out["runs_percentile"] == 33
    assert user_insights._percentiles("tiny") is None
    assert user_insights._percentiles(None) is None


def test_character_filter_scopes_walk_and_cache(monkeypatch):
    rows = [
        {
            "run_hash": "r1",
            "win": True,
            "character": "CHARACTER.IRONCLAD",
            "ascension": 10,
        },
        {"run_hash": "r2", "win": False, "character": "SILENT", "ascension": 10},
    ]
    blobs = {
        "r1": {"game_mode": "standard", "run_time": 900, "players": [{"deck": []}]},
        "r2": {"game_mode": "standard", "run_time": 800, "players": [{"deck": []}]},
    }
    seen_chars = []

    def tallies(uid, character=None):
        seen_chars.append(character)
        return {}

    monkeypatch.setattr(runs_db_mongo, "get_user_run_rows", lambda uid, limit: rows)
    monkeypatch.setattr(
        runs_db_mongo, "get_run_blobs", lambda hashes: {h: blobs[h] for h in hashes}
    )
    monkeypatch.setattr(runs_db_mongo, "get_user_card_pick_tallies", tallies)
    monkeypatch.setattr(user_insights, "get_community_stats", lambda: {})
    monkeypatch.setattr(
        user_insights, "get_entity_metrics_table", lambda etype: {"rows": []}
    )
    monkeypatch.setattr(
        runs_db_mongo, "get_user_winrates", lambda: {"p": [10, 5], "q": [10, 4]}
    )
    user_insights._cache.clear()

    everything = user_insights.get_user_insights("u1", username="p")
    ironclad = user_insights.get_user_insights("u1", username="p", character="ironclad")
    assert everything["runs_walked"] == 2
    assert ironclad["runs_walked"] == 1
    assert ironclad["character"] == "IRONCLAD"
    # Card tallies got the same scope; percentiles hide on filtered views.
    assert seen_chars == [None, "IRONCLAD"]
    assert everything["percentiles"] is not None
    assert ironclad["percentiles"] is None
    # Distinct cache entries per scope.
    assert user_insights.get_user_insights("u1", username="p")["runs_walked"] == 2


def test_relic_carry_deltas(monkeypatch):
    monkeypatch.setattr(
        runs_db_mongo,
        "get_user_relic_run_counts",
        lambda uid, character=None: {"KUNAI": 12, "SHOVEL": 1},
    )
    monkeypatch.setattr(
        user_insights,
        "get_entity_metrics_table",
        lambda etype, bracket="all", character=None: {
            "total_runs": 1000,
            "character_runs": None,
            "rows": [
                {"id": "KUNAI", "picks": 100},
                {"id": "SHOVEL", "picks": 300},
                {"id": "BURNING_BLOOD", "picks": 900},
                {"id": "GHOST_RELIC", "picks": 4},
            ],
        },
    )
    monkeypatch.setattr(
        user_insights, "_skipped_relic_ids", lambda: frozenset({"BURNING_BLOOD"})
    )
    out = user_insights._relic_carry_deltas("u1", None, 20)
    over = out["over_carried"]
    under = out["under_carried"]
    # Kunai: 60% of your runs vs 10% community -> over.
    assert [d["id"] for d in over] == ["KUNAI"]
    assert over[0]["gap"] == 50.0
    # Shovel: 5% vs 30% -> under. Ghost relic (0.4% community) misses the
    # 2% community floor; Burning Blood is rarity-skipped.
    assert [d["id"] for d in under] == ["SHOVEL"]
    assert all(d["id"] not in ("BURNING_BLOOD", "GHOST_RELIC") for d in over + under)
    # Too few runs -> empty lists, not noise.
    assert user_insights._relic_carry_deltas("u1", None, 5) == {
        "over_carried": [],
        "under_carried": [],
    }
