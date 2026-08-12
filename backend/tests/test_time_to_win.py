"""The time-to-win chart answers "how long does it take to beat a run": wins
only, zero/missing timers excluded, average and median in the series label."""

from app.services import charts_stats as cs


def _row(win: bool, minutes: float) -> tuple:
    r = [0] * 15
    r[cs.WIN] = 1 if win else 0
    r[cs.TIME] = int(minutes * 60)
    return tuple(r)


def test_time_to_win_wins_only_with_avg_and_median():
    rows = [_row(True, 40)] * 10 + [_row(True, 50)] * 10 + [_row(True, 90)]
    rows += [_row(False, 300)] * 30  # losses never count
    rows += [_row(True, 0)] * 30  # missing timers never count

    series = cs.time_to_win(rows, "")

    assert len(series) == 1
    s = series[0]
    assert s["id"] == "ALL"
    assert s["total"] == 21
    # (10*40 + 10*50 + 90) / 21; the odd-count middle (index 10) is 50.
    assert s["avg_minutes"] == 47.1
    assert s["median_minutes"] == 50.0
    assert "avg 47m" in s["label"] and "median 50m" in s["label"]
    assert [p["x"] for p in s["points"]] == [40, 50, 90]
    assert s["points"][0]["n"] == 10


def test_time_to_win_needs_min_sample():
    rows = [_row(True, 40)] * (cs.MIN_POINT_N - 1)
    assert cs.time_to_win(rows, "") == []
