"""Pacific calendar buckets: late-UTC timestamps belong to the previous
Pacific day, and labels invert the day numbers exactly."""

from datetime import datetime

from app.services.timeutil import epoch_day_label, pacific_date, pacific_epoch_day


def test_late_utc_evening_is_previous_pacific_day():
    # 05:00 UTC on the 16th is 22:00 PDT on the 15th.
    assert str(pacific_date("2026-08-16T05:00:00")) == "2026-08-15"
    assert str(pacific_date(datetime(2026, 8, 16, 12, 0))) == "2026-08-16"


def test_epoch_day_roundtrips_through_label():
    day = pacific_epoch_day("2026-08-16T05:00:00")
    assert epoch_day_label(day) == "2026-08-15"


def test_unparseable_is_none_and_day_zero():
    assert pacific_date("not a date") is None
    assert pacific_epoch_day(None) == 0
