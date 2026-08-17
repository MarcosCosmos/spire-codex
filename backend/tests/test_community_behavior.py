"""The per-character behavior splits and survival curve: removals and campfire
choices attribute to the choosing player's own character (players[].id keys
the per-floor player_stats), and the survival curve is the share of runs that
reached each floor."""

from app.services import community_stats as cs


def _blob():
    return {
        "players": [
            {"id": 1, "character": "CHARACTER.NECROBINDER"},
            {"id": 2, "character": "CHARACTER.SILENT"},
        ],
        "map_point_history": [
            [
                {
                    "map_point_type": "shop",
                    "player_stats": [
                        {
                            "player_id": 1,
                            "cards_removed": [
                                "STRIKE_NECROBINDER",
                                "DEFEND_NECROBINDER",
                            ],
                            "current_hp": 60,
                            "max_hp": 70,
                        },
                        {
                            "player_id": 2,
                            "cards_removed": ["STRIKE_SILENT"],
                            "current_hp": 50,
                            "max_hp": 70,
                        },
                    ],
                },
                {
                    "map_point_type": "rest_site",
                    "player_stats": [
                        {
                            "player_id": 1,
                            "rest_site_choices": ["SMITH"],
                            "current_hp": 60,
                            "max_hp": 70,
                        },
                        {
                            "player_id": 2,
                            "rest_site_choices": ["HEAL"],
                            "current_hp": 30,
                            "max_hp": 70,
                        },
                    ],
                },
            ]
        ],
    }


def test_attribution_and_survival():
    acc = cs._new_acc_one()
    cs._accumulate_one(
        acc,
        _blob(),
        run_hash="r1",
        is_win=True,
        character="CHARACTER.NECROBINDER",
        ascension=10,
    )
    short = {
        "players": [],
        "map_point_history": [[{"map_point_type": "monster", "player_stats": []}]],
    }
    cs._accumulate_one(
        acc,
        short,
        run_hash="r2",
        is_win=False,
        character="CHARACTER.SILENT",
        ascension=0,
    )

    assert acc["char_removes"] == {"necrobinder": 2, "silent": 1}
    assert acc["char_rest"] == {"necrobinder": {"SMITH": 1}, "silent": {"HEAL": 1}}
    assert acc["floors"] == {2: [1, 1], 1: [1, 0]}

    out = cs._finalize_one(acc)
    matrix = out["ascension_matrix"]
    assert matrix["necrobinder"]["10"] == {"runs": 1, "wins": 1, "win_rate": 100.0}
    assert matrix["silent"]["0"]["runs"] == 1
    beh = {r["id"]: r for r in out["character_behavior"]}
    assert beh["necrobinder"]["removes_per_run"] == 2.0
    assert beh["silent"]["rest"] == {"HEAL": 100.0}
    # floor 1: both runs alive; floor 2: only the two-floor run
    assert out["survival"][0] == {"floor": 1, "alive_pct": 100.0}
    assert out["survival"][1] == {"floor": 2, "alive_pct": 50.0}


def test_survival_clamps_corrupt_floor_counts():
    acc = cs._new_acc_one()
    acc["floors"] = {40: [98, 20], 53: [2, 1]}  # duplicate-floor blobs log >48
    out = cs._survival(acc)
    assert out[-1]["floor"] == 48
    assert out[-1]["alive_pct"] == 2.0  # the corrupt pair lives in the 48 bucket


def test_merge_combines_new_fields():
    a = cs.new_accumulator()
    b = cs.new_accumulator()
    cs._accumulate_one(
        a["all"],
        _blob(),
        run_hash="r1",
        is_win=True,
        character="CHARACTER.NECROBINDER",
        ascension=10,
    )
    cs._accumulate_one(
        b["all"],
        _blob(),
        run_hash="r2",
        is_win=False,
        character="CHARACTER.NECROBINDER",
        ascension=10,
    )
    cs.merge(a, b)
    assert a["all"]["char_removes"] == {"necrobinder": 4, "silent": 2}
    assert a["all"]["char_rest"]["silent"] == {"HEAL": 2}
    assert a["all"]["floors"] == {2: [2, 1]}
