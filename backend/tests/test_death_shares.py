"""Death-list percentages are shares of ONE distribution: each row's pct is
100*count/total over every official death, so any displayed subset can never
sum past 100. (Map-danger rates are per-visit and intentionally not shares.)"""

from app.services.community_stats import _ranked


def test_ranked_pcts_are_shares_of_the_full_official_total():
    counts = {"A": 50, "B": 30, "C": 20, "MODDED_THING": 999}
    names = {"A": "A", "B": "B", "C": "C"}
    rows = _ranked(counts, names, 2)
    assert [r["id"] for r in rows] == ["A", "B"]
    # Denominator is all official deaths (100), not just the shown rows.
    assert rows[0]["pct"] == 50.0 and rows[1]["pct"] == 30.0
    assert sum(r["pct"] for r in rows) <= 100.0


def test_ranked_subset_never_sums_past_100():
    counts = {f"E{i}": i + 1 for i in range(40)}
    names = {k: k for k in counts}
    rows = _ranked(counts, names, 15)
    assert sum(r["pct"] for r in rows) <= 100.0
