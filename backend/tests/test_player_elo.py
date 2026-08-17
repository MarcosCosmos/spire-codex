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
