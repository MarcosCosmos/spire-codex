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


def get_user_insights(user_id: str) -> dict[str, Any]:
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
    mine["runs_walked"] = walked
    mine["runs_capped"] = len(rows) >= _MAX_RUNS

    _cache_put(user_id, mine)
    return mine
