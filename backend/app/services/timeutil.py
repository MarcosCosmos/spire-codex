"""Pacific-time calendar handling for user-facing date buckets.

Storage stays UTC; anything that buckets or labels by calendar day or week
converts to America/Los_Angeles first, so a run played Friday night never
drifts into Saturday's bar. Buckets are always keyed on when a run was
PLAYED (played_at), never when it was uploaded — callers pass
``played_at or submitted_at`` so legacy rows without the field still land
somewhere sane."""

from datetime import date, datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

PACIFIC = ZoneInfo("America/Los_Angeles")
_EPOCH_ORDINAL = date(1970, 1, 1).toordinal()


def pacific_date(ts: Any) -> date | None:
    """The Pacific calendar date of a stored timestamp (datetime or ISO-ish
    string, naive values treated as UTC). None when unparseable."""
    if ts is None:
        return None
    if isinstance(ts, datetime):
        dt = ts
    else:
        try:
            dt = datetime.fromisoformat(str(ts)[:19].replace("Z", ""))
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(PACIFIC).date()


def pacific_epoch_day(ts: Any) -> int:
    """Days since 1970-01-01 of the Pacific calendar date; 0 when unknown."""
    d = pacific_date(ts)
    return (d.toordinal() - _EPOCH_ORDINAL) if d else 0


def epoch_day_label(day: int) -> str:
    """ISO date for a pacific_epoch_day value (pure calendar arithmetic)."""
    return date.fromordinal(_EPOCH_ORDINAL + day).isoformat()
