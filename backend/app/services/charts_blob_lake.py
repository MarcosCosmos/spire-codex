"""Charts blob built from the lake, replacing the frozen snapshot's copy.

DuckDB does the reading, filtering, eligibility, and bracket assignment;
the fold is charts_stats.accumulate() itself, so every accumulation
semantic (floor caps, first-room reads, dedup sets, deck growth) is
inherited from the proven walk code instead of re-implemented in SQL.
The streams rely on build.sql writing floors/deck/relics/potions parquet
ORDER BY run_hash, so each run's rows are contiguous and the builder
merges four cursors in one pass with constant memory.

Serving follows the fallback ruling (2026-08-29): current generation ->
previous generation -> empty. Never the snapshot.
"""

from __future__ import annotations

import gzip
import json
import logging
from typing import Any

from . import charts_stats
from .lake_stats import (
    _ELIGIBLE_SQL,
    LAKE_DIR,
    _connect,
    _ensure_cells,
    cube_versions,
)

logger = logging.getLogger(__name__)

_BLOB_NAME = "charts_blob.json.gz"
_BLOB_PREV_NAME = "charts_blob.prev.json.gz"

_WR_BY_BAND = {1: "wr30", 2: "wr50", 3: "wr75"}


def _run_brackets(cell: str, versions: set[str]) -> list[str]:
    """Bracket keys one run's cell folds into: the skill ladder the walk
    used, plus version and skill x version composites for cube versions.
    accumulate() ignores keys the accumulator wasn't seeded with."""
    parts = cell.split("|")
    a10 = len(parts) > 2 and parts[2] == "1"
    band = int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else 0
    ver = parts[4] if len(parts) > 4 else ""
    keys = ["all"]
    if a10:
        keys.append("a10")
        for b in range(1, band + 1):
            keys.append(_WR_BY_BAND[b])
    if ver in versions:
        keys.append(ver)
        for k in list(keys[1:-1]):
            keys.append(f"{k}:{ver}")
    return keys


class _RunStream:
    """Cursor over a run_hash-ordered query; take(h) returns that run's
    rows, silently dropping rows for runs the caller never asks about."""

    def __init__(self, con, sql: str):
        self._res = con.execute(sql)
        self._rows: list = []
        self._i = 0
        self._done = False

    def _peek(self):
        while True:
            if self._i < len(self._rows):
                return self._rows[self._i]
            if self._done:
                return None
            self._rows = self._res.fetchmany(20_000)
            self._i = 0
            if not self._rows:
                self._done = True
                return None

    def take(self, run_hash: str) -> list:
        out = []
        while True:
            row = self._peek()
            if row is None:
                return out
            if row[0] < run_hash:
                self._i += 1
                continue
            if row[0] != run_hash:
                return out
            out.append(row)
            self._i += 1


def _assemble_players(deck_rows, relic_rows, potion_rows) -> list[dict]:
    players: dict[int, dict] = {}

    def slot(pidx) -> dict:
        return players.setdefault(
            int(pidx or 1), {"deck": [], "relics": [], "potions": []}
        )

    for _, pidx, card, fa, ench in deck_rows:
        c: dict[str, Any] = {"id": card, "floor_added_to_deck": fa}
        if ench:
            c["enchantment"] = {"id": ench}
        slot(pidx)["deck"].append(c)
    for _, pidx, rid in relic_rows:
        slot(pidx)["relics"].append({"id": rid})
    for _, pidx, pid in potion_rows:
        slot(pidx)["potions"].append({"id": pid})
    return [players[k] for k in sorted(players)]


def _assemble_history(floor_rows) -> list[list[dict]]:
    """floor_rows (sorted by act, floor_idx; one row per floor-player, or a
    single pidx-NULL row for playerless floors) -> map_point_history."""
    acts: list[list[dict]] = []
    cur_act = None
    cur_floor_key = None
    floor: dict | None = None
    for row in floor_rows:
        (_, act, fidx, rtype, rmodel, rturns, pidx, mhp, chp, gold, dmg, sm, ek) = row
        if act != cur_act:
            acts.append([])
            cur_act = act
            cur_floor_key = None
        if (act, fidx) != cur_floor_key:
            room = {}
            if rtype or rmodel:
                room = {
                    "room_type": rtype,
                    "model_id": rmodel,
                    "turns_taken": rturns,
                }
            floor = {"rooms": [room] if room else [], "player_stats": []}
            acts[-1].append(floor)
            cur_floor_key = (act, fidx)
        if pidx is None or floor is None:
            continue
        floor["player_stats"].append(
            {
                "max_hp": mhp,
                "current_hp": chp,
                "current_gold": gold,
                "damage_taken": dmg,
                "rest_site_choices": ["SMITH"] * int(sm or 0),
                "event_choices": [
                    {"title": {"key": k, "table": "events"}} for k in (ek or [])
                ],
            }
        )
    return acts


def build_charts_blob() -> dict | None:
    """Build and store the finalized charts blob from the lake. Returns the
    blob or None when the lake is incomplete."""
    from datetime import datetime

    con = _connect(build=False)
    try:
        con.execute(_ELIGIBLE_SQL.format(lake=LAKE_DIR))
        _ensure_cells(con, str(LAKE_DIR))
        meta: dict[str, tuple] = {}
        for h, ch, win, ab, pc, played, cell in con.execute(
            """
            SELECT run_hash, coalesce(character, ''), coalesce(win, false),
              coalesce(was_abandoned, false), coalesce(player_count, 1),
              coalesce(played_at, submitted_at), cell
            FROM cells
            """
        ).fetchall():
            meta[h] = (ch, bool(win), bool(ab), int(pc), played, cell)
    finally:
        con.close()
    if not meta:
        return None

    versions = cube_versions()
    vset = set(versions)
    acc = charts_stats.new_accumulator(versions)
    bracket_cache: dict[str, list[str]] = {}

    # Cursors on the same shared build instance (4.5GB, spill-enabled).
    # Build connections set preserve_insertion_order=false, which lets a
    # parquet scan return blocks out of file order — the merge relies on
    # each run's rows being contiguous, so restore it for the streams; the
    # next stage's connect flips it back.
    fcon = _connect(build=True)
    dcon = _connect(build=True)
    rcon = _connect(build=True)
    pcon = _connect(build=True)
    try:
        fcon.execute("SET preserve_insertion_order=true")
        floors = _RunStream(
            fcon,
            f"""
            SELECT f.run_hash, f.act, f.floor_idx, f.room_type, f.room_model,
              f.room_turns, ps.i,
              ps.u.max_hp, ps.u.current_hp, ps.u.current_gold,
              ps.u.damage_taken,
              len(list_filter(ps.u.rest_site_choices, x -> x = 'SMITH')),
              [t."key" FOR t IN [e.title FOR e IN ps.u.event_choices]
               IF t."table" = 'events']
            FROM read_parquet('{LAKE_DIR}/floors.parquet') f
            LEFT JOIN LATERAL (
              SELECT unnest(f.players) AS u,
                generate_subscripts(f.players, 1) AS i
            ) ps ON true
            """,
        )
        deck = _RunStream(
            dcon,
            f"""
            SELECT run_hash, player_idx, card, floor_added, enchantment
            FROM read_parquet('{LAKE_DIR}/deck.parquet')
            """,
        )
        relics = _RunStream(
            rcon,
            f"""
            SELECT run_hash, player_idx, relic
            FROM read_parquet('{LAKE_DIR}/relics.parquet')
            """,
        )
        potions = _RunStream(
            pcon,
            f"""
            SELECT run_hash, player_idx, potion
            FROM read_parquet('{LAKE_DIR}/potions.parquet')
            """,
        )

        n = 0
        pending: list = []
        cur: str | None = None

        def flush() -> None:
            nonlocal n
            if cur is None:
                return
            m = meta.get(cur)
            if m is None:
                return
            ch, win, ab, pc, played, cell = m
            brs = bracket_cache.get(cell)
            if brs is None:
                brs = _run_brackets(cell, vset)
                bracket_cache[cell] = brs
            blob = {
                "map_point_history": _assemble_history(pending),
                "players": _assemble_players(
                    deck.take(cur), relics.take(cur), potions.take(cur)
                ),
                "was_abandoned": ab,
            }
            charts_stats.accumulate(
                acc,
                blob,
                brackets=brs,
                is_win=win,
                character=ch,
                player_count=pc,
                played=played if isinstance(played, datetime) else None,
            )
            n += 1

        while True:
            row = floors._peek()
            if row is None:
                break
            if row[0] != cur:
                flush()
                cur = row[0]
                pending = []
            pending.append(row)
            floors._i += 1
        flush()
    finally:
        for c in (fcon, dcon, rcon, pcon):
            try:
                c.close()
            except Exception:
                pass

    blob = charts_stats.finalize(acc)
    cur_path = LAKE_DIR / _BLOB_NAME
    tmp = LAKE_DIR / (_BLOB_NAME + ".tmp")
    with gzip.open(tmp, "wt", encoding="utf-8", compresslevel=6) as f:
        json.dump(blob, f, separators=(",", ":"))
    if cur_path.exists():
        cur_path.replace(LAKE_DIR / _BLOB_PREV_NAME)
    tmp.replace(cur_path)
    logger.info(
        "charts blob stored: %d runs, %d brackets, %d bytes",
        n,
        len(blob),
        cur_path.stat().st_size,
    )
    return blob


_blob_cache: tuple[float, dict] | None = None


def charts_blob_with_mtime() -> tuple[float, dict] | None:
    """Current generation, else previous, else None — per the fallback
    ruling the frozen snapshot is never served."""
    global _blob_cache
    for name in (_BLOB_NAME, _BLOB_PREV_NAME):
        path = LAKE_DIR / name
        try:
            if not path.exists():
                continue
            mtime = path.stat().st_mtime
            if _blob_cache and _blob_cache[0] == mtime:
                return _blob_cache
            with gzip.open(path, "rt", encoding="utf-8") as f:
                _blob_cache = (mtime, json.load(f))
            return _blob_cache
        except Exception:
            logger.warning("charts blob load failed for %s", name, exc_info=True)
    return None
