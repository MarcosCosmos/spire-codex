"""The hidden player Elo: anchors reproduce the community win rate at the
starting rating, ratings move the right way, and upsets pay more."""

from app.services.player_elo import (
    START_ELO,
    _anchor_rating,
    _expected,
    rate_runs,
)


def test_anchor_reproduces_community_rate():
    for p in (0.1, 0.207, 0.5, 0.9):
        assert abs(_expected(START_ELO, _anchor_rating(p)) - p) < 1e-9


def test_wins_raise_and_losses_lower():
    p = {"ironclad": 0.2}
    win = rate_runs([{"character": "IRONCLAD", "win": True}], p, 0.2)
    loss = rate_runs([{"character": "IRONCLAD", "win": False}], p, 0.2)
    assert win["elo"] > START_ELO > loss["elo"]
    # Winning at 20% odds pays ~4x what losing costs.
    assert (win["elo"] - START_ELO) > (START_ELO - loss["elo"]) * 3


def test_harder_characters_pay_more():
    anchors = {"defect": 0.15, "regent": 0.3}
    hard = rate_runs([{"character": "CHARACTER.DEFECT", "win": True}], anchors, 0.2)
    easy = rate_runs([{"character": "CHARACTER.REGENT", "win": True}], anchors, 0.2)
    assert hard["elo"] > easy["elo"]


def test_settled_k_after_placement():
    runs = [{"character": "IRONCLAD", "win": True}] * 32
    rec = rate_runs(runs, {"ironclad": 0.2}, 0.2)
    assert rec["runs"] == 32 and rec["wins"] == 32
    assert rec["elo"] > START_ELO


def test_wilson_punishes_small_samples():
    from app.services.player_elo import wilson_lower_bound

    # 92% over 74 runs must score below 89% over 310 runs.
    assert wilson_lower_bound(68, 74) < wilson_lower_bound(277, 310)
    assert wilson_lower_bound(0, 0) == 0.0
    assert 0.9 < wilson_lower_bound(9400, 10000) < 0.94


def test_lifetime_is_order_independent_and_history_collects():
    anchors = {"ironclad": 0.2}
    early_wins = [
        {"character": "IRONCLAD", "win": w} for w in [True] * 50 + [False] * 50
    ]
    late_wins = [
        {"character": "IRONCLAD", "win": w} for w in [False] * 50 + [True] * 50
    ]
    a = rate_runs(early_wins, anchors, 0.2, collect_history=True)
    b = rate_runs(late_wins, anchors, 0.2)
    assert a["lifetime"] == b["lifetime"]  # same record, same lifetime
    assert b["elo"] > a["elo"]  # but recent form separates the Elo
    assert len(a["history"]) == 100
    assert a["history"][0]["n"] == 1 and a["history"][-1]["elo"] == a["elo"]


def test_blend_is_run_weighted_across_characters():
    anchors = {"ironclad": 0.5, "defect": 0.5}
    runs = [{"character": "IRONCLAD", "win": True}] * 3 + [
        {"character": "DEFECT", "win": False}
    ]
    rec = rate_runs(runs, anchors, 0.5)
    ic = rec["by_character"]["ironclad"]
    de = rec["by_character"]["defect"]
    assert ic["runs"] == 3 and ic["wins"] == 3
    assert de["runs"] == 1 and de["wins"] == 0
    # The blend weights each ladder by how much it was actually played.
    assert abs(rec["elo"] - (ic["elo"] * 3 + de["elo"]) / 4) < 0.2
    # One character's losses never touch another character's ladder.
    assert ic["elo"] > START_ELO > de["elo"]


def test_block_rates_solo_standard_a10_only(monkeypatch):
    from app.services import player_elo

    monkeypatch.setattr(player_elo, "_solo_anchors", lambda: ({"ironclad": 0.2}, 0.2))
    rows = [
        {"ascension": 10, "character": "IRONCLAD", "win": True, "player_count": 1},
        {"ascension": 10, "character": "IRONCLAD", "win": True},  # legacy solo
        {"ascension": 10, "character": "IRONCLAD", "win": True, "player_count": 2},
        {"ascension": 7, "character": "IRONCLAD", "win": True, "player_count": 1},
        {
            "ascension": 10,
            "character": "IRONCLAD",
            "win": True,
            "player_count": 1,
            "game_mode": "daily",
        },
        {
            "ascension": 10,
            "character": "CHARACTER.DOWNFALL_HERMIT",  # modded cast never rates
            "win": True,
            "player_count": 1,
        },
    ]
    block = player_elo.elo_block_from_rows(rows)
    assert block is not None and block["runs"] == 2  # co-op, A7, daily, modded out
    assert set(block["by_character"]) == {"ironclad"}
    assert block["by_character"]["ironclad"]["runs"] == 2
    assert block["current"] == block["by_character"]["ironclad"]["elo"]
