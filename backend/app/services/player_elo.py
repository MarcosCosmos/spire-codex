"""Hidden per-player Elo over A10 standard runs.

Each rated run is a match against a per-character difficulty anchor: the
anchor rating is chosen so a 1000-rated player's expected win chance equals
the community's A10 win rate for that character (from the snapshot's
ascension_matrix). Runs are walked in played order; K is 32 for a player's
first 30 rated runs, 16 after. Results persist as ``hidden_elo`` on the user
doc and serve ONLY through the admin router — no public endpoint reads them.
"""

import logging
import math
import threading
import time
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)

START_ELO = 1000.0
K_PLACEMENT = 32.0
K_SETTLED = 16.0
PLACEMENT_RUNS = 30
# Below this many community A10 runs a character's win rate is too thin to
# anchor on; fall back to the average of the anchored characters.
MIN_ANCHOR_RUNS = 100
_CACHE_KEY = "admin:player_elo"
_CACHE_TTL = 3600


def _anchor_rating(p: float) -> float:
    """The rating an opponent would need so a START_ELO player's expected
    score equals p (the community win rate for the slice)."""
    p = min(max(p, 0.01), 0.99)
    return START_ELO + 400.0 * math.log10((1.0 - p) / p)


def _expected(player: float, anchor: float) -> float:
    return 1.0 / (1.0 + 10.0 ** ((anchor - player) / 400.0))


def rate_runs(runs: list[dict], p_by_char: dict[str, float], default_p: float) -> dict:
    """Fold one player's chronologically ordered A10 runs into a rating."""
    elo, wins = START_ELO, 0
    for i, r in enumerate(runs):
        char = (r.get("character") or "").split(".")[-1].lower()
        p = p_by_char.get(char, default_p)
        k = K_PLACEMENT if i < PLACEMENT_RUNS else K_SETTLED
        score = 1.0 if r.get("win") else 0.0
        elo += k * (score - _expected(elo, _anchor_rating(p)))
        wins += int(score)
    return {"elo": round(elo, 1), "runs": len(runs), "wins": wins}


def _difficulty_anchors() -> tuple[dict[str, float], float]:
    from .run_entity_stats import get_community_stats

    matrix = (get_community_stats() or {}).get("ascension_matrix") or {}
    p_by_char: dict[str, float] = {}
    for cid, per_asc in matrix.items():
        cell = (per_asc or {}).get("10")
        if cell and cell.get("runs", 0) >= MIN_ANCHOR_RUNS:
            p_by_char[cid] = cell["win_rate"] / 100.0
    default_p = sum(p_by_char.values()) / len(p_by_char) if p_by_char else 0.2
    return p_by_char, default_p


def compute_player_elos(persist: bool = True) -> list[dict]:
    """Rate every account with at least one linked A10 standard run. Pulls
    the rated rows once, orders them in Python (played_at with submitted_at
    as the legacy fallback), and optionally persists hidden_elo on each user
    doc. One scan of the A10 slice — callers cache."""
    from .runs_db_mongo import _get_collection
    from .users_db import _get_collection as _users_coll

    p_by_char, default_p = _difficulty_anchors()
    from bson import ObjectId

    # $gt over the ObjectId floor rides the (user_id, ...) index and skips
    # every unlinked doc; {$ne: None} forced a 1.2M-doc collection scan,
    # which is what 504'd the first admin request.
    rows = _get_collection().find(
        {
            "user_id": {"$gt": ObjectId("0" * 24)},
            "ascension": 10,
            "game_mode": "standard",
            "deleted_at": None,
            "hidden": {"$ne": True},
        },
        {"user_id": 1, "win": 1, "character": 1, "played_at": 1, "submitted_at": 1},
    )
    by_user: dict[Any, list[dict]] = {}
    for r in rows:
        by_user.setdefault(r["user_id"], []).append(r)

    floor = datetime(1970, 1, 1)
    out: list[dict] = []
    raw_id: dict[str, Any] = {}
    for uid, runs in by_user.items():
        runs.sort(key=lambda r: r.get("played_at") or r.get("submitted_at") or floor)
        rec = rate_runs(runs, p_by_char, default_p)
        rec["user_id"] = str(uid)
        raw_id[str(uid)] = uid
        out.append(rec)
    out.sort(key=lambda r: -r["elo"])

    users = _users_coll()
    names = {
        str(u["_id"]): u.get("username")
        for u in users.find({"_id": {"$in": list(raw_id.values())}}, {"username": 1})
    }
    for r in out:
        r["username"] = names.get(r["user_id"])

    if persist and out:
        try:
            from pymongo import UpdateOne

            users.bulk_write(
                [
                    UpdateOne(
                        {"_id": raw_id[r["user_id"]]},
                        {"$set": {"hidden_elo": r["elo"]}},
                    )
                    for r in out
                ],
                ordered=False,
            )
        except Exception:
            logger.warning("hidden_elo persist failed", exc_info=True)
    return out


_inflight_lock = threading.Lock()
_inflight = False


def _kick_compute() -> None:
    global _inflight
    from . import cache as app_cache

    with _inflight_lock:
        if _inflight:
            return
        _inflight = True
    if not app_cache.acquire_lock(f"{_CACHE_KEY}:lock", 600):
        with _inflight_lock:
            _inflight = False
        return

    def _run() -> None:
        global _inflight
        try:
            started = time.time()
            board = compute_player_elos()
            app_cache.set_json(
                _CACHE_KEY,
                {
                    "players": board,
                    "computed_at": time.time(),
                    "compute_seconds": round(time.time() - started, 1),
                },
                _CACHE_TTL,
            )
        except Exception:
            logger.warning("player elo compute failed", exc_info=True)
        finally:
            app_cache.delete(f"{_CACHE_KEY}:lock")
            with _inflight_lock:
                _inflight = False

    threading.Thread(target=_run, daemon=True, name="player-elo").start()


def get_player_elos(refresh: bool = False) -> dict:
    """Cached admin view. Never computes on the request path — the walk can
    outlive the gateway timeout, so a cold or refreshed board returns
    {"building": true} and the client polls until the background compute
    lands."""
    from . import cache as app_cache

    cached = None if refresh else app_cache.get_json(_CACHE_KEY)
    if cached is not None:
        return cached
    _kick_compute()
    return {"building": True}
