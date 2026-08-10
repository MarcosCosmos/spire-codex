"""Personal community-stats for the profile page.

Walks one player's own submitted runs through the SAME accumulator the
/community-stats page uses (community_stats._accumulate_one), so the profile
gets the identical kit — deaths, campfire choices, event decisions, boon take
rates, records — computed over just their runs, with the community's numbers
attached to every section for comparison. The official-content filters
(modded rest options, modded event options, catalog-only entities) come along
for free from the shared finalize.

Self-only and request-time: a player has orders of magnitude fewer runs than
the community walk (capped anyway), so this stays an on-demand read with a
short per-user cache instead of riding the snapshot."""

import logging
import threading
import time
from typing import Any

from . import community_stats
from .run_entity_stats import get_community_stats, get_entity_metrics_table

logger = logging.getLogger(__name__)

# Newest runs walked per player. High enough that only extreme grinders hit
# it; bounded so one profile view can't stream unbounded blobs.
_MAX_RUNS = 2000
# A pick-rate comparison on 3 offers is noise; require a real sample.
_MIN_CARD_OFFERS = 10
_MIN_BOON_OFFERS = 5
_MIN_EVENT_VISITS = 5
_TOP_DELTAS = 8

_CACHE_TTL = 120.0
_CACHE_MAX = 500
_cache: dict[str, tuple[float, dict]] = {}
_cache_lock = threading.Lock()


def _cache_get(steam_id: str) -> dict | None:
    with _cache_lock:
        hit = _cache.get(steam_id)
        if hit and time.time() - hit[0] < _CACHE_TTL:
            return hit[1]
        if hit:
            del _cache[steam_id]
    return None


def _cache_put(steam_id: str, payload: dict) -> None:
    with _cache_lock:
        if len(_cache) >= _CACHE_MAX:
            oldest = min(_cache, key=lambda k: _cache[k][0])
            del _cache[oldest]
        _cache[steam_id] = (time.time(), payload)


def _pct_map(rows: list[dict] | None, key: str = "pct") -> dict[str, float]:
    return {
        r["id"]: r.get(key)
        for r in rows or []
        if isinstance(r, dict) and r.get("id") is not None and r.get(key) is not None
    }


def _attach_community(mine: dict[str, Any], community: dict[str, Any]) -> None:
    """Stamp community_* comparison fields onto the personal blob, in place."""
    # Campfires: same nine official options; add the community share.
    comm_rest = _pct_map(community.get("rest_sites"))
    for r in mine.get("rest_sites") or []:
        r["community_pct"] = comm_rest.get(r["id"])

    # Map danger: community death rate per (act, node type), so "where you
    # die" renders your rate against everyone's on the same cells.
    comm_danger: dict[tuple, dict] = {}
    for act_row in community.get("map_danger") or []:
        for ptype, cell in (act_row.get("types") or {}).items():
            comm_danger[(act_row.get("act"), ptype)] = cell
    for act_row in mine.get("map_danger") or []:
        for ptype, cell in (act_row.get("types") or {}).items():
            comm = comm_danger.get((act_row.get("act"), ptype))
            cell["community_death_rate"] = (comm or {}).get("death_rate")

    # Deaths: how often the same encounter/event kills everyone else.
    deaths = community.get("deaths") or {}
    for key in ("encounters", "events"):
        comm = _pct_map(deaths.get(key))
        for r in (mine.get("deaths") or {}).get(key) or []:
            r["community_pct"] = comm.get(r["id"])

    # Boons: community take rate when offered.
    comm_boons = {
        r["id"]: r
        for r in community.get("ancient_picks") or []
        if isinstance(r, dict) and r.get("id")
    }
    for r in mine.get("ancient_picks") or []:
        comm = comm_boons.get(r["id"])
        r["community_take_rate"] = (comm or {}).get("take_rate")

    # Events: per-option community split for the events the player hit.
    comm_events = {
        e["id"]: _pct_map(e.get("options"))
        for e in community.get("events") or []
        if isinstance(e, dict) and e.get("id")
    }
    for e in mine.get("events") or []:
        opts = comm_events.get(e["id"]) or {}
        for o in e.get("options") or []:
            o["community_pct"] = opts.get(o["id"])


def _event_divergence(mine: dict[str, Any]) -> list[dict]:
    """Events where the player's favorite option differs most from the crowd,
    ranked by the percentage-point gap. Only events with a real sample."""
    out = []
    for e in mine.get("events") or []:
        if (e.get("total") or 0) < _MIN_EVENT_VISITS:
            continue
        best = None
        for o in e.get("options") or []:
            cp = o.get("community_pct")
            if cp is None or o.get("pct") is None:
                continue
            gap = o["pct"] - cp
            if best is None or abs(gap) > abs(best["gap"]):
                best = {
                    "event_id": e["id"],
                    "event_name": e.get("name"),
                    "option_id": o["id"],
                    "option_label": o.get("label"),
                    "your_pct": o["pct"],
                    "community_pct": cp,
                    "gap": round(gap, 1),
                    "visits": e["total"],
                }
        if best and abs(best["gap"]) >= 10:
            out.append(best)
    out.sort(key=lambda r: -abs(r["gap"]))
    return out[:_TOP_DELTAS]


def _card_pick_deltas(user_id: str) -> dict[str, list[dict]]:
    """The player's card-reward keep rates vs the community's, split into the
    cards they take notably more / less often. Community side comes from the
    in-memory metrics snapshot, so only cards that pass its catalog and
    non-draftable filters can appear."""
    from .runs_db_mongo import get_user_card_pick_tallies

    picks = get_user_card_pick_tallies(user_id) or {}
    table = get_entity_metrics_table("cards")
    comm = {
        r["id"]: r["pick_rate"]
        for r in table.get("rows") or []
        if not r.get("upgraded") and r.get("pick_rate") is not None
    }
    deltas = []
    for cid, rec in picks.items():
        offered = rec.get("offered") or 0
        if offered < _MIN_CARD_OFFERS:
            continue
        community_rate = comm.get((cid or "").upper())
        if community_rate is None:
            continue
        your_rate = round(rec.get("picked", 0) / offered * 100, 1)
        deltas.append(
            {
                "id": (cid or "").upper(),
                "your_pick_rate": your_rate,
                "community_pick_rate": community_rate,
                "gap": round(your_rate - community_rate, 1),
                "offered": offered,
                "picked": rec.get("picked", 0),
            }
        )
    deltas.sort(key=lambda r: -r["gap"])
    return {
        "over_picked": [d for d in deltas if d["gap"] > 0][:_TOP_DELTAS],
        "under_picked": [d for d in deltas[::-1] if d["gap"] < 0][:_TOP_DELTAS],
    }


def _streaks(rows: list[dict]) -> dict[str, int]:
    """Best and current win streaks over the (newest-first) row list."""
    current = 0
    for r in rows:
        if r.get("win"):
            current += 1
        else:
            break
    best = run = 0
    for r in reversed(rows):
        run = run + 1 if r.get("win") else 0
        best = max(best, run)
    return {"current_win_streak": current, "best_win_streak": best}


def _progression(rows: list[dict]) -> list[dict]:
    """Monthly runs/wins/win-rate buckets, oldest first, for the trend chart.
    Months with no runs are simply absent; the chart connects the dots."""
    buckets: dict[str, list[int]] = {}
    for r in rows:
        ts = r.get("submitted_at")
        if ts is None:
            continue
        month = str(ts)[:7]
        b = buckets.setdefault(month, [0, 0])
        b[0] += 1
        if r.get("win"):
            b[1] += 1
    return [
        {
            "month": m,
            "runs": n,
            "wins": w,
            "win_rate": round(w / n * 100, 1) if n else 0.0,
        }
        for m, (n, w) in sorted(buckets.items())
    ]


def _percentiles(username: str | None) -> dict[str, Any] | None:
    """Where the player sits among every qualifying submitter (the same 5-run
    floor the skill brackets use): win-rate and volume percentiles. None when
    the account has no username or too few runs to qualify."""
    if not username:
        return None
    from .runs_db_mongo import get_user_winrates

    winrates = get_user_winrates() or {}
    me = winrates.get(username.lower())
    if not me or (me[0] or 0) < 5:
        return None
    qualified = [(t, w) for t, w in winrates.values() if t >= 5]
    if len(qualified) < 2:
        return None
    my_rate = me[1] / me[0]
    below_rate = sum(1 for t, w in qualified if w / t < my_rate)
    below_runs = sum(1 for t, _ in qualified if t < me[0])
    n = len(qualified)
    return {
        "win_rate": round(my_rate * 100, 1),
        "win_rate_percentile": round(below_rate / n * 100),
        "runs": me[0],
        "runs_percentile": round(below_runs / n * 100),
        "players": n,
    }


def get_user_insights(user_id: str, username: str | None = None) -> dict[str, Any]:
    """The signed-in account's personal community-stats blob plus community
    comparison fields, over its claimed runs. Shape mirrors /community-stats
    with extras: card_picks (over/under-picked vs the crowd) and
    event_divergence."""
    cached = _cache_get(user_id)
    if cached is not None:
        return cached

    from .runs_db_mongo import get_run_blobs, get_user_run_rows

    rows = get_user_run_rows(user_id, limit=_MAX_RUNS)
    acc = community_stats._new_acc_one()
    walked = 0
    for i in range(0, len(rows), 300):
        batch = rows[i : i + 300]
        blobs = get_run_blobs([r["run_hash"] for r in batch])
        for r in batch:
            blob = blobs.get(r["run_hash"])
            if blob is None:
                continue
            try:
                community_stats._accumulate_one(
                    acc,
                    blob,
                    run_hash=r["run_hash"],
                    is_win=bool(r.get("win")),
                    character=r.get("character") or "",
                    ascension=r.get("ascension") or 0,
                )
                walked += 1
            except Exception:
                logger.warning(
                    "user-insights accumulate failed for %s",
                    r["run_hash"],
                    exc_info=True,
                )

    mine = community_stats._finalize_one(acc)
    community = get_community_stats()
    _attach_community(mine, community)
    mine["event_divergence"] = _event_divergence(mine)
    try:
        mine["card_picks"] = _card_pick_deltas(user_id)
    except Exception:
        logger.warning("user-insights card deltas failed", exc_info=True)
        mine["card_picks"] = {"over_picked": [], "under_picked": []}
    mine["streaks"] = _streaks(rows)
    mine["progression"] = _progression(rows)
    try:
        mine["percentiles"] = _percentiles(username)
    except Exception:
        logger.warning("user-insights percentiles failed", exc_info=True)
        mine["percentiles"] = None
    mine["runs_walked"] = walked
    mine["runs_capped"] = len(rows) >= _MAX_RUNS

    _cache_put(user_id, mine)
    return mine
