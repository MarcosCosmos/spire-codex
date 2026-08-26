"""Read-only DuckDB access to the analytics lake.

First production toehold of the lake migration: LAKE_STATS_SHADOW=on makes
the stats refresher compare lake-computed community-stats deaths against
the snapshot-served payload once per summary cycle and log the drift, so a
divergence (stale folds, broken ingest, filter skew) surfaces in the logs
instead of a user report. Requires the lake mounted at LAKE_DIR (default
/lake) and the nightly lake-ingest job keeping it fresh. No serving path
reads the lake yet.
"""

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

LAKE_DIR = Path(os.environ.get("LAKE_DIR", "/lake"))
SHADOW_ENABLED = (os.environ.get("LAKE_STATS_SHADOW", "") or "").lower() in (
    "1",
    "on",
    "true",
)
# "serve": /api/runs/community-stats builds its payload from the lake (the
# snapshot stays as automatic fallback for unsupported brackets and errors).
SERVE_ENABLED = (os.environ.get("LAKE_COMMUNITY_STATS", "") or "").lower() == "serve"

_OFFICIAL = "('IRONCLAD','SILENT','DEFECT','NECROBINDER','REGENT')"


_SERVE_FILES = (
    "runs.parquet",
    "excluded.parquet",
    "floors.parquet",
    "players.parquet",
)


def available(*extra: str) -> bool:
    for name in ("runs.parquet",) + extra:
        if not (LAKE_DIR / name).exists():
            return False
    try:
        import duckdb  # noqa: F401
    except ImportError:
        return False
    return True


def _connect(build: bool = False):
    """Serving reads get a small in-memory connection; ingest-time builds
    get a bigger cap plus a spill directory, because the full-corpus
    aggregations run far past 500MB and an in-memory connection can't
    spill (it errors instead)."""
    import duckdb

    con = duckdb.connect()
    if build:
        # Tunable so quiet-box runs can burst (LAKE_BUILD_MEMORY=4500MB with
        # the 5g container leaves the observed ~300-500MB native overhead).
        mem = os.environ.get("LAKE_BUILD_MEMORY", "") or "3500MB"
        con.execute(f"SET memory_limit='{mem}'")
        con.execute(f"SET temp_directory='{LAKE_DIR}/tmp'")
        con.execute("SET preserve_insertion_order=false")
    else:
        con.execute("SET memory_limit='500MB'")
    con.execute("SET threads=2")
    return con


def deaths_counts() -> dict[str, dict[str, int]]:
    """Deaths per encounter/event id with the walk's eligibility filters."""
    con = _connect()
    try:
        out: dict[str, dict[str, int]] = {}
        for section, col in (("encounters", "encounter"), ("events", "event")):
            rows = con.execute(
                f"""
                SELECT killed_by_{col} AS id, count(*) AS n
                FROM read_parquet('{LAKE_DIR}/runs.parquet') r
                ANTI JOIN read_parquet('{LAKE_DIR}/excluded.parquet') x
                  ON r.run_hash = x.run_hash
                WHERE NOT r.win AND r.ascension BETWEEN 0 AND 10
                  AND r.character IN {_OFFICIAL}
                  AND killed_by_{col} IS NOT NULL
                  AND killed_by_{col} NOT LIKE 'NONE%'
                GROUP BY 1
                """
            ).fetchall()
            out[section] = dict(rows)
        return out
    finally:
        con.close()


def shadow_check() -> None:
    """One log line comparing lake deaths to the served snapshot payload."""
    try:
        if not available():
            logger.info("lake shadow: lake not available, skipped")
            return
        from . import run_entity_stats

        live = run_entity_stats.get_community_stats(None)
        lake = deaths_counts()
        worst, worst_id, n = 0.0, "", 0
        for section in ("encounters", "events"):
            for row in (live.get("deaths") or {}).get(section) or []:
                lv = row.get("count") or 0
                lk = lake[section].get(row.get("id"), 0)
                drift = abs(lk - lv) * 100.0 / max(lv, 1)
                n += 1
                if drift > worst:
                    worst, worst_id = drift, f"{section}:{row.get('id')}"
        logger.info(
            "lake shadow: worst drift %.2f%% (%s) across %d ids", worst, worst_id, n
        )
        if worst >= 5.0:
            logger.warning(
                "lake shadow: drift %.2f%% on %s - lake and snapshot are diverging",
                worst,
                worst_id,
            )
    except Exception:
        logger.warning("lake shadow check failed", exc_info=True)


# ── Serve mode: the full community-stats payload from the lake ────────────────

_PAYLOAD_TTL_SECONDS = 60.0
_payload_cache: dict[str, tuple[float, dict]] = {}

_ELIGIBLE_SQL = """
CREATE OR REPLACE TEMP VIEW eligible AS
SELECT r.*
FROM read_parquet('{lake}/runs.parquet') r
ANTI JOIN read_parquet('{lake}/excluded.parquet') x ON r.run_hash = x.run_hash
WHERE r.ascension BETWEEN 0 AND 10
  AND r.character IN ('IRONCLAD','SILENT','DEFECT','NECROBINDER','REGENT')
"""

_PFLOORS_SQL = """
CREATE OR REPLACE TEMP VIEW pfloors AS
SELECT f.run_hash, f.act, f.floor_idx, ps.u AS p,
  e.win, lower(e.character) AS run_char, e.cell,
  len(list_filter(f.room_models, m -> m LIKE '%THIEVING_HOPPER%')) > 0 AS hopper_floor
FROM read_parquet('{lake}/floors.parquet') f
JOIN cells e ON f.run_hash = e.run_hash,
LATERAL (SELECT unnest(f.players) AS u) ps
"""

_PID_CHAR_SQL = """
CREATE OR REPLACE TEMP VIEW pid_char AS
SELECT run_hash, player_id, lower(character) AS character
FROM read_parquet('{lake}/players.parquet')
WHERE player_id IS NOT NULL AND character <> ''
"""


_PAYLOAD_PATH_NAME = "community_payload.json"
_CUBE_PATH_NAME = "community_cube.json.gz"

# Finest-grain bracket cells: game mode x player count x A10 x winrate band.
# Every eligible run lands in exactly one cell, so any bracket combination
# folds from cell sums -- the lattice the snapshot could never materialize.
_CELLS_SQL = """
CREATE OR REPLACE TEMP VIEW user_wr AS
SELECT lower(username) AS uname, count(*) FILTER (win) * 1.0 / count(*) AS wr
FROM read_parquet('{lake}/runs.parquet') r
ANTI JOIN read_parquet('{lake}/excluded.parquet') x ON r.run_hash = x.run_hash
WHERE username IS NOT NULL AND username <> ''
GROUP BY 1 HAVING count(*) >= 5;
CREATE OR REPLACE TEMP VIEW cells AS
SELECT e.*,
  lower(coalesce(e.game_mode, 'standard')) || '|' ||
  least(coalesce(e.player_count, 1), 4)::VARCHAR || '|' ||
  (coalesce(e.ascension, 0) = 10)::INT::VARCHAR || '|' ||
  (CASE WHEN coalesce(e.ascension, 0) = 10 AND u.wr > 0.75 THEN 3
        WHEN coalesce(e.ascension, 0) = 10 AND u.wr > 0.50 THEN 2
        WHEN coalesce(e.ascension, 0) = 10 AND u.wr > 0.30 THEN 1
        ELSE 0 END)::VARCHAR || '|' ||
  coalesce(trim(e.build_id), '') AS cell
FROM eligible e
LEFT JOIN user_wr u ON lower(e.username) = u.uname
"""


_MODE_KEYS = frozenset(("standard", "daily", "custom"))
_PLAYER_KEYS = {"solo": "1", "2p": "2", "3p": "3", "4p": "4"}
_SKILL_KEYS = {"a10": 0, "wr30": 1, "wr50": 2, "wr75": 3}

_cube_cache: tuple[float, dict, dict] | None = None


_VERSION_RE = None


def _parse_lake_bracket(bracket: str | None):
    """(mode, player, skill, version) slots, all-None for the plain payload,
    or None when any part is outside the cube's axes -- those fall back to
    the snapshot path."""
    global _VERSION_RE
    if _VERSION_RE is None:
        import re

        _VERSION_RE = re.compile(r"v\d+(\.\d+)*")
    if bracket in (None, "", "all"):
        return (None, None, None, None)
    mode = player = skill = version = None
    for part in bracket.split(":"):
        if part == "all" or part == "":
            continue
        if part in _MODE_KEYS and mode is None:
            mode = part
        elif part in _PLAYER_KEYS and player is None:
            player = _PLAYER_KEYS[part]
        elif part in _SKILL_KEYS and skill is None:
            skill = _SKILL_KEYS[part]
        elif _VERSION_RE.fullmatch(part) and version is None:
            version = part
        else:
            return None
    return (mode, player, skill, version)


def community_payload(bracket: str | None = None) -> dict | None:
    """Community-stats payload from the ingest-built store: the plain
    payload file for the all bracket, or any mode x players x skill
    combination folded from the cube. None (snapshot fallback) for
    version brackets, unknown keys, missing stores, or any error.
    Serving never builds from parquet inline."""
    try:
        if not SERVE_ENABLED:
            return None
        parsed = _parse_lake_bracket(bracket)
        if parsed is None:
            return None
        import json

        mode, player, skill, version = parsed
        if parsed == (None, None, None, None):
            path = LAKE_DIR / _PAYLOAD_PATH_NAME
            if not path.exists():
                return None
            mtime = path.stat().st_mtime
            hit = _payload_cache.get("all")
            if hit and hit[0] == mtime:
                return hit[1]
            payload = json.loads(path.read_text())
            _payload_cache["all"] = (mtime, payload)
            return payload

        import gzip

        global _cube_cache
        path = LAKE_DIR / _CUBE_PATH_NAME
        if not path.exists():
            return None
        mtime = path.stat().st_mtime
        if not _cube_cache or _cube_cache[0] != mtime:
            with gzip.open(path, "rt", encoding="utf-8") as f:
                _cube_cache = (mtime, json.load(f), {})
        _, raw, folded = _cube_cache
        ckey = f"{mode}|{player}|{skill}|{version}"
        hit = folded.get(ckey)
        if hit is not None:
            return hit
        accs = []
        for cell_id, acc_raw in (raw.get("cells") or {}).items():
            parts = cell_id.split("|")
            if len(parts) == 4 and version is not None:
                # pre-version cube on disk: can't answer version slices yet
                return None
            m, pc, a10, band = parts[:4]
            ver = parts[4] if len(parts) > 4 else ""
            if mode is not None and m != mode:
                continue
            if player is not None and pc != player:
                continue
            if skill is not None:
                if a10 != "1":
                    continue
                if skill > 0 and int(band) < skill:
                    continue
            if version is not None and ver != version:
                continue
            accs.append(_acc_from_json(acc_raw))
        from . import community_stats as cs

        payload = cs._finalize_one(_merge_accs(accs))
        payload["data_through"] = raw.get("data_through")
        folded[ckey] = payload
        return payload
    except Exception:
        logger.warning(
            "lake community payload failed; snapshot fallback", exc_info=True
        )
        return None


def build_and_store_payload() -> dict | None:
    """Build the community cube from the lake, store it gzipped beside the
    parquet, and store the folded all-bracket payload as plain JSON for the
    fast path. Ingest-time only."""
    if not available(*_SERVE_FILES[1:]):
        logger.info("lake payload build skipped: lake incomplete")
        return None
    import gzip
    import json

    from . import community_stats as cs

    cube = _build_community_cube()
    con = _connect()
    try:
        data_through = str(
            con.execute(
                f"SELECT max(submitted_at) FROM read_parquet('{LAKE_DIR}/runs.parquet')"
            ).fetchone()[0]
        )
    finally:
        con.close()

    payload = cs._finalize_one(_merge_accs(list(cube.values())))
    payload["data_through"] = data_through
    tmp = LAKE_DIR / (_PAYLOAD_PATH_NAME + ".tmp")
    tmp.write_text(json.dumps(payload, separators=(",", ":")))
    tmp.replace(LAKE_DIR / _PAYLOAD_PATH_NAME)

    cube_doc = {
        "data_through": data_through,
        "cells": {k: _acc_to_json(a) for k, a in cube.items()},
    }
    tmp = LAKE_DIR / (_CUBE_PATH_NAME + ".tmp")
    with gzip.open(tmp, "wt", encoding="utf-8") as f:
        json.dump(cube_doc, f, separators=(",", ":"))
    tmp.replace(LAKE_DIR / _CUBE_PATH_NAME)
    logger.info(
        "lake community stores written: payload %d bytes, cube %d cells / %d bytes",
        (LAKE_DIR / _PAYLOAD_PATH_NAME).stat().st_size,
        len(cube),
        (LAKE_DIR / _CUBE_PATH_NAME).stat().st_size,
    )
    return payload


def _acc_to_json(acc: dict) -> dict:
    out = dict(acc)
    out["map_danger"] = {
        f"{a}|{t}": v for (a, t), v in (acc.get("map_danger") or {}).items()
    }
    return out


def _acc_from_json(raw: dict) -> dict:
    acc = dict(raw)
    acc["map_danger"] = {
        (int(k.split("|", 1)[0]), k.split("|", 1)[1]): v
        for k, v in (raw.get("map_danger") or {}).items()
    }
    acc["by_ascension"] = {
        int(k): v for k, v in (raw.get("by_ascension") or {}).items()
    }
    acc["floors"] = {int(k): v for k, v in (raw.get("floors") or {}).items()}
    acc["char_asc"] = {
        c: {int(a): v for a, v in per.items()}
        for c, per in (raw.get("char_asc") or {}).items()
    }
    return acc


def _merge_accs(cells: list[dict]) -> dict:
    """Fold cell accumulators into one, mirroring how the walk would have
    accumulated the union of their runs."""
    from . import community_stats as cs

    out = cs._new_acc_one()
    for acc in cells:
        out["total_runs"] += acc["total_runs"]
        out["total_wins"] += acc["total_wins"]
        out["reward_screens"] += acc.get("reward_screens") or 0
        out["reward_skips"] += acc.get("reward_skips") or 0
        for field in (
            "by_ascension",
            "by_character",
            "rest",
            "ancient",
            "map_danger",
            "floors",
        ):
            for k, v in (acc.get(field) or {}).items():
                rec = out[field].setdefault(k, [0] * len(v))
                for i, x in enumerate(v):
                    rec[i] += x
        for field in (
            "deaths_encounter",
            "deaths_event",
            "removed",
            "stolen",
            "char_removes",
        ):
            for k, n in (acc.get(field) or {}).items():
                out[field][k] = out[field].get(k, 0) + n
        for eid, opts in (acc.get("events") or {}).items():
            slot = out["events"].setdefault(eid, {})
            for oid, n in opts.items():
                slot[oid] = slot.get(oid, 0) + n
        for c, per in (acc.get("char_asc") or {}).items():
            slot = out["char_asc"].setdefault(c, {})
            for a, v in per.items():
                rec = slot.setdefault(a, [0, 0])
                rec[0] += v[0]
                rec[1] += v[1]
        for c, per in (acc.get("char_rest") or {}).items():
            slot = out["char_rest"].setdefault(c, {})
            for ch, n in per.items():
                slot[ch] = slot.get(ch, 0) + n
        for key, better in (
            ("fastest_win", min),
            ("longest_run", max),
            ("biggest_deck", max),
        ):
            rec = acc.get(key)
            if rec:
                cur = out[key]
                if cur is None or better(cur[0], rec[0]) == rec[0]:
                    out[key] = tuple(rec)
    return out


def _build_community_cube() -> dict[str, dict]:
    """One pass over the lake producing a community accumulator per bracket
    cell (mode x players x A10 x winrate band)."""
    from . import community_stats as cs

    lake = str(LAKE_DIR)
    con = _connect(build=True)
    accs: dict[str, dict] = {}

    def acc_for(cell: str) -> dict:
        a = accs.get(cell)
        if a is None:
            a = accs[cell] = cs._new_acc_one()
        return a

    try:
        con.execute(_ELIGIBLE_SQL.format(lake=lake))
        con.execute(_CELLS_SQL.format(lake=lake))
        con.execute(_PFLOORS_SQL.format(lake=lake))
        con.execute(_PID_CHAR_SQL.format(lake=lake))

        for cell, char, asc, runs, wins in con.execute(
            "SELECT cell, lower(character), coalesce(ascension, 0)::INT, count(*),"
            " count(*) FILTER (win) FROM cells GROUP BY 1, 2, 3"
        ).fetchall():
            acc = acc_for(cell)
            acc["total_runs"] += runs
            acc["total_wins"] += wins
            for rec in (
                acc["by_ascension"].setdefault(asc, [0, 0]),
                acc["by_character"].setdefault(char, [0, 0]),
                acc["char_asc"].setdefault(char, {}).setdefault(asc, [0, 0]),
            ):
                rec[0] += runs
                rec[1] += wins

        for col, key in (("encounter", "deaths_encounter"), ("event", "deaths_event")):
            for cell, eid, n in con.execute(
                f"SELECT cell, killed_by_{col}, count(*) FROM cells"
                f" WHERE NOT win AND killed_by_{col} IS NOT NULL"
                f" AND killed_by_{col} NOT LIKE 'NONE%' GROUP BY 1, 2"
            ).fetchall():
                acc_for(cell)[key][eid] = n

        for cell, floors, runs, wins in con.execute(
            "WITH per_run AS (SELECT f.run_hash, count(*) AS n"
            f" FROM read_parquet('{lake}/floors.parquet') f"
            " JOIN cells e ON f.run_hash = e.run_hash GROUP BY 1)"
            " SELECT e.cell, p.n, count(*), count(*) FILTER (e.win) FROM per_run p"
            " JOIN cells e ON p.run_hash = e.run_hash GROUP BY 1, 2"
        ).fetchall():
            acc_for(cell)["floors"][int(floors)] = [runs, wins]

        for cell, act, ptype, visits, dmg, deaths in con.execute(
            "WITH typed AS (SELECT f.*, e.cell AS cell,"
            " coalesce(e.killed_by_encounter, '') <> ''"
            "  OR coalesce(e.killed_by_event, '') <> '' AS died"
            f" FROM read_parquet('{lake}/floors.parquet') f"
            " JOIN cells e ON f.run_hash = e.run_hash"
            " WHERE f.map_point_type IS NOT NULL AND f.map_point_type <> '')"
            ", visits AS (SELECT cell, act, map_point_type, count(*) AS v,"
            " sum(least(100.0, greatest(0, coalesce(ps.u.damage_taken, 0)) * 100.0"
            " / ps.u.max_hp)) AS dmg FROM typed,"
            " LATERAL (SELECT unnest(players) AS u) ps"
            " WHERE coalesce(ps.u.max_hp, 0) > 0 GROUP BY 1, 2, 3)"
            ", lastf AS (SELECT cell, run_hash, arg_max(act, act * 10000 + floor_idx)"
            " AS act, arg_max(map_point_type, act * 10000 + floor_idx) AS mpt"
            " FROM typed WHERE died GROUP BY 1, 2)"
            ", deaths AS (SELECT cell, act, mpt, count(*) AS d FROM lastf GROUP BY 1, 2, 3)"
            " SELECT v.cell, v.act, v.map_point_type, v.v, v.dmg, coalesce(d.d, 0)"
            " FROM visits v LEFT JOIN deaths d"
            " ON v.cell = d.cell AND v.act = d.act AND v.map_point_type = d.mpt"
        ).fetchall():
            acc_for(cell)["map_danger"][(int(act), ptype)] = [
                visits,
                float(dmg or 0.0),
                deaths,
            ]

        for cell, eid, oid, n in con.execute(
            "SELECT cell, split_part((ec.u).title.\"key\", '.', 1),"
            " split_part(split_part((ec.u).title.\"key\", '.options.', 2), '.', 1),"
            " count(*) FROM pfloors, LATERAL (SELECT unnest((p).event_choices) AS u) ec"
            " WHERE (ec.u).title.\"table\" = 'events'"
            " AND (ec.u).title.\"key\" LIKE '%.options.%' GROUP BY 1, 2, 3"
        ).fetchall():
            if eid and oid:
                acc_for(cell)["events"].setdefault(eid, {})[oid] = n

        for cell, choice, ps_char, n, wins, low in con.execute(
            "WITH hp AS (SELECT run_hash, cell, act, floor_idx, p, win, run_char,"
            " last_value(CASE WHEN (p).current_hp IS NOT NULL"
            " AND coalesce((p).max_hp, 0) > 0 THEN"
            " struct_pack(hp := (p).current_hp, mx := (p).max_hp) END IGNORE NULLS)"
            " OVER (PARTITION BY run_hash, (p).player_id ORDER BY act, floor_idx"
            " ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS hp_prev"
            " FROM pfloors)"
            ", choices AS (SELECT h.cell, rc.u AS choice, h.win,"
            " coalesce(h.hp_prev, struct_pack(hp := (h.p).current_hp,"
            " mx := coalesce((h.p).max_hp, 0))) AS ref,"
            " coalesce(pc.character, h.run_char) AS ps_char FROM hp h"
            " LEFT JOIN pid_char pc ON h.run_hash = pc.run_hash"
            " AND (h.p).player_id = pc.player_id,"
            " LATERAL (SELECT unnest((h.p).rest_site_choices) AS u) rc"
            " WHERE rc.u IS NOT NULL AND rc.u <> '')"
            " SELECT cell, choice, ps_char, count(*), count(*) FILTER (win),"
            " count(*) FILTER (ref.mx > 0 AND ref.hp IS NOT NULL"
            " AND ref.hp * 2 < ref.mx) FROM choices GROUP BY 1, 2, 3"
        ).fetchall():
            acc = acc_for(cell)
            rec = acc["rest"].setdefault(choice, [0, 0, 0])
            rec[0] += n
            rec[1] += wins
            rec[2] += low
            crest = acc["char_rest"].setdefault(ps_char, {})
            crest[choice] = crest.get(choice, 0) + n

        for cell, rid, chosen, offered in con.execute(
            "WITH offers AS (SELECT cell, coalesce((ac.u).TextKey,"
            " CASE WHEN (ac.u).title.\"key\" LIKE '%.%' THEN"
            ' substr((ac.u).title."key", strpos((ac.u).title."key", \'.\') + 1)'
            ' ELSE (ac.u).title."key" END) AS rid, (ac.u).was_chosen AS wc'
            " FROM pfloors, LATERAL (SELECT unnest((p).ancient_choice) AS u) ac)"
            " SELECT cell, rid, count(*) FILTER (coalesce(wc, false)), count(*)"
            " FROM offers WHERE rid IS NOT NULL AND rid <> ''"
            " AND upper(rid) NOT LIKE 'NONE%' GROUP BY 1, 2"
        ).fetchall():
            acc_for(cell)["ancient"][rid] = [chosen, offered]

        for cell, cid, hopper, ps_char, n in con.execute(
            "WITH rem AS (SELECT cell, hopper_floor,"
            " coalesce(pc.character, f.run_char) AS ps_char,"
            " coalesce(json_extract_string(cr.u, '$.card.id'),"
            " json_extract_string(cr.u, '$.id'),"
            " CASE WHEN json_type(cr.u) = 'VARCHAR' THEN cr.u::VARCHAR END) AS raw"
            " FROM pfloors f LEFT JOIN pid_char pc ON f.run_hash = pc.run_hash"
            " AND (f.p).player_id = pc.player_id,"
            " LATERAL (SELECT unnest((f.p).cards_removed) AS u) cr)"
            " SELECT cell, CASE WHEN upper(split_part(raw, '.', -1)) LIKE 'STRIKE_%'"
            " THEN 'STRIKE' WHEN upper(split_part(raw, '.', -1)) LIKE 'DEFEND_%'"
            " THEN 'DEFEND' ELSE upper(split_part(raw, '.', -1)) END,"
            " hopper_floor, ps_char, count(*) FROM rem"
            " WHERE raw IS NOT NULL AND raw <> ''"
            " AND upper(split_part(raw, '.', -1)) NOT LIKE 'NONE%' GROUP BY 1, 2, 3, 4"
        ).fetchall():
            acc = acc_for(cell)
            if hopper:
                acc["stolen"][cid] = acc["stolen"].get(cid, 0) + n
            else:
                acc["removed"][cid] = acc["removed"].get(cid, 0) + n
                acc["char_removes"][ps_char] = acc["char_removes"].get(ps_char, 0) + n

        for cell, screens, skips in con.execute(
            "SELECT cell, count(*), count(*) FILTER (NOT list_bool_or("
            "[coalesce(c.was_picked, false) FOR c IN (p).card_choices]))"
            " FROM pfloors WHERE len((p).card_choices) > 0 GROUP BY 1"
        ).fetchall():
            acc = acc_for(cell)
            acc["reward_screens"] = screens
            acc["reward_skips"] = skips

        for cell, fw, fwh, lr, lrh, bd, bdh in con.execute(
            "WITH rr AS (SELECT * FROM cells WHERE game_mode = 'standard'"
            " AND NOT has_modifiers)"
            " SELECT cell,"
            " min(run_time) FILTER (win AND run_time > 0),"
            " arg_min(rr.run_hash, run_time) FILTER (win AND run_time > 0),"
            " max(run_time) FILTER (run_time > 0),"
            " arg_max(rr.run_hash, run_time) FILTER (run_time > 0),"
            " max(p.deck_size), arg_max(p.run_hash, p.deck_size)"
            f" FROM rr LEFT JOIN read_parquet('{lake}/players.parquet') p"
            " ON rr.run_hash = p.run_hash GROUP BY 1"
        ).fetchall():
            acc = acc_for(cell)
            if fw is not None:
                acc["fastest_win"] = (int(fw), fwh)
            if lr is not None:
                acc["longest_run"] = (int(lr), lrh)
            if bd:
                acc["biggest_deck"] = (int(bd), bdh)

        return accs
    finally:
        con.close()


# ── Codex Elo from the lake ──────────────────────────────────────────────────
# Both Elos are Bradley-Terry fits over aggregated pair counts, so they are
# order-independent: extract the same pairs the walk extracts and feed the
# same solver, and the ratings match by construction.


def _ids_temp_table(con, name: str, ids) -> None:
    con.execute(f"CREATE OR REPLACE TEMP TABLE {name} (cid VARCHAR)")
    rows = [(i,) for i in ids]
    if rows:
        con.executemany(f"INSERT INTO {name} VALUES (?)", rows)


def reward_pair_counts(con=None) -> dict[tuple[str, str], int]:
    """(picked, skipped) -> count over card-reward screens, mirroring the
    walk: eligible runs only, CARD-namespaced ids, curses/status excluded."""
    from . import run_entity_stats as res

    own = con is None
    if own:
        con = _connect(build=True)
    try:
        con.execute(_ELIGIBLE_SQL.format(lake=LAKE_DIR))
        _ids_temp_table(con, "excluded_cards", res._excluded_card_ids())
        rows = con.execute(
            f"""
            WITH choices AS (
              SELECT f.run_hash, f.act, f.floor_idx, ps.i AS pidx,
                upper(split_part(cc.u.card.id, '.', -1)) AS cid,
                coalesce(cc.u.was_picked, false) AS picked
              FROM read_parquet('{LAKE_DIR}/floors.parquet') f
              JOIN eligible e ON f.run_hash = e.run_hash,
              LATERAL (SELECT unnest(f.players) AS u,
                       generate_subscripts(f.players, 1) AS i) ps,
              LATERAL (SELECT unnest(ps.u.card_choices) AS u) cc
              WHERE cc.u.card.id IS NOT NULL
                AND upper(split_part(cc.u.card.id, '.', 1)) = 'CARD'
                AND upper(split_part(cc.u.card.id, '.', -1))
                    NOT IN (SELECT cid FROM excluded_cards)
            )
            SELECT w.cid, l.cid, count(*)
            FROM choices w
            JOIN choices l ON w.run_hash = l.run_hash AND w.act = l.act
              AND w.floor_idx = l.floor_idx AND w.pidx = l.pidx
            WHERE w.picked AND NOT l.picked AND w.cid <> l.cid
            GROUP BY 1, 2
            """
        ).fetchall()
        return {(w, lo): n for w, lo, n in rows}
    finally:
        if own:
            con.close()


def upgrade_pair_counts(con=None) -> dict[tuple[str, str], int]:
    """(upgraded, eligible-but-skipped) -> count over rest-site Smith
    decisions, replaying _walk_rest_upgrade_choices set-by-set: the eligible
    pool is the player's upgradeable final-deck cards present by that floor,
    minus cards already smithed at an earlier decision this run."""
    from . import run_entity_stats as res

    upgradeable = res._upgradeable_card_ids()
    own = con is None
    if own:
        con = _connect(build=True)
    try:
        con.execute(_ELIGIBLE_SQL.format(lake=LAKE_DIR))
        _ids_temp_table(con, "upg_ids", upgradeable)
        upg_filter = "IN (SELECT cid FROM upg_ids)" if upgradeable else "IS NOT NULL"
        rows = con.execute(
            f"""
            WITH floors_g AS (
              SELECT f.run_hash, f.players,
                row_number() OVER (PARTITION BY f.run_hash
                  ORDER BY f.act, f.floor_idx) AS gfloor
              FROM read_parquet('{LAKE_DIR}/floors.parquet') f
              JOIN eligible e ON f.run_hash = e.run_hash
            ),
            pmap AS (
              SELECT run_hash, player_id, player_idx
              FROM read_parquet('{LAKE_DIR}/players.parquet')
              WHERE player_id IS NOT NULL
            ),
            nplayers AS (
              -- Solo is the BLOB's player count, not the runs doc's scalar:
              -- they disagree on some co-op runs, and the walk trusts the blob.
              SELECT run_hash, count(*) AS np
              FROM read_parquet('{LAKE_DIR}/players.parquet') GROUP BY 1
            ),
            smith_raw AS (
              SELECT f.run_hash, f.gfloor, ps.u.player_id AS pid,
                [upper(split_part(u, '.', -1)) FOR u IN ps.u.upgraded_cards
                 IF upper(split_part(u, '.', 1)) = 'CARD'] AS winners_raw
              FROM floors_g f,
              LATERAL (SELECT unnest(f.players) AS u) ps
              WHERE list_contains(ps.u.rest_site_choices, 'SMITH')
                AND len(ps.u.upgraded_cards) > 0
            ),
            smith AS (
              SELECT sr.run_hash,
                CASE WHEN n.np = 1 THEN 1 ELSE pm.player_idx END AS pidx,
                sr.gfloor, sr.winners_raw
              FROM smith_raw sr
              JOIN nplayers n ON sr.run_hash = n.run_hash
              LEFT JOIN pmap pm ON sr.run_hash = pm.run_hash
                AND sr.pid = pm.player_id
              WHERE n.np = 1 OR pm.player_idx IS NOT NULL
            ),
            winners AS (
              SELECT run_hash, pidx, gfloor, wu.u AS card
              FROM smith, LATERAL (SELECT unnest(winners_raw) AS u) wu
              WHERE pidx IS NOT NULL AND wu.u {upg_filter}
            ),
            events AS (
              SELECT DISTINCT run_hash, pidx, gfloor FROM winners
            ),
            first_up AS (
              SELECT run_hash, pidx, card, min(gfloor) AS fu
              FROM winners GROUP BY 1, 2, 3
            ),
            deck_min AS (
              SELECT d.run_hash, d.player_idx AS pidx, d.card,
                min(coalesce(d.floor_added, 0)) AS fa
              FROM read_parquet('{LAKE_DIR}/deck.parquet') d
              JOIN eligible e ON d.run_hash = e.run_hash
              WHERE d.card {upg_filter}
                AND d.run_hash IN (SELECT run_hash FROM events)
              GROUP BY 1, 2, 3
            ),
            losers AS (
              SELECT ev.run_hash, ev.pidx, ev.gfloor, dm.card
              FROM events ev
              JOIN deck_min dm ON ev.run_hash = dm.run_hash AND ev.pidx = dm.pidx
              LEFT JOIN first_up f2 ON f2.run_hash = ev.run_hash
                AND f2.pidx = ev.pidx AND f2.card = dm.card
              LEFT JOIN winners w2 ON w2.run_hash = ev.run_hash
                AND w2.pidx = ev.pidx AND w2.gfloor = ev.gfloor
                AND w2.card = dm.card
              WHERE dm.fa <= ev.gfloor
                AND (f2.fu IS NULL OR f2.fu >= ev.gfloor)
                AND w2.card IS NULL
            )
            SELECT w.card, l.card, count(*)
            FROM winners w
            JOIN losers l ON w.run_hash = l.run_hash AND w.pidx = l.pidx
              AND w.gfloor = l.gfloor
            WHERE w.card <> l.card
            GROUP BY 1, 2
            """
        ).fetchall()
        return {(w, lo): n for w, lo, n in rows}
    finally:
        if own:
            con.close()


def compute_lake_elo() -> dict:
    """Card-reward Elo and upgrade Elo fitted from the lake with the same
    Bradley-Terry solver the walk uses."""
    from . import run_entity_stats as res

    reward = reward_pair_counts()
    upgrade = upgrade_pair_counts()
    card_elo, _ = res._compute_codex_elo(reward)
    upgrade_elo, _ = res._compute_codex_elo(upgrade)
    return {
        "card_elo": card_elo,
        "upgrade_elo": upgrade_elo,
        "reward_pairs": len(reward),
        "upgrade_pairs": len(upgrade),
    }


# ── Entity store: the snapshot cache's per-entity aggregates, from the lake ──

_ENTITY_STORE_NAME = "entity_store.json"


def build_entity_store() -> dict | None:
    """Compute the all-bracket per-entity aggregates (picks, wins,
    by-character, reward metrics, Elos, base/upgraded, relic act buckets)
    and store them beside the parquet. Ingest-time only; the serving swap
    reads this instead of the walked snapshot."""
    if not available(*_SERVE_FILES[1:]):
        logger.info("entity store skipped: lake incomplete")
        return None

    from . import run_entity_stats as res

    con = _connect(build=True)
    try:
        con.execute(_ELIGIBLE_SQL.format(lake=LAKE_DIR))
        entities: dict[str, dict[str, dict]] = {
            "cards": {},
            "relics": {},
            "potions": {},
        }

        def entry(etype: str, eid: str) -> dict:
            return entities[etype].setdefault(
                eid,
                {
                    "picks": 0,
                    "wins": 0,
                    "by_character": {},
                    "last_submitted_at": None,
                    "last_run_hash": None,
                },
            )

        # Per-instance membership + per-character splits + last-seen, one
        # query per membership table.
        for etype, table, col in (
            ("cards", "deck", "card"),
            ("relics", "relics", "relic"),
            ("potions", "potions", "potion"),
        ):
            for eid, char, picks, wins, last_ts, last_hash in con.execute(
                f"""
                SELECT m.{col}, e.character, count(*), count(*) FILTER (e.win),
                  max(e.submitted_at), arg_max(m.run_hash, e.submitted_at)
                FROM read_parquet('{LAKE_DIR}/{table}.parquet') m
                JOIN eligible e ON m.run_hash = e.run_hash
                WHERE m.{col} IS NOT NULL AND m.{col} <> ''
                GROUP BY 1, 2
                """
            ).fetchall():
                a = entry(etype, eid)
                a["picks"] += picks
                a["wins"] += wins
                ch = char or ""
                sub = a["by_character"].setdefault(ch, {"picks": 0, "wins": 0})
                sub["picks"] += picks
                sub["wins"] += wins
                ts = str(last_ts) if last_ts is not None else None
                if ts and (a["last_submitted_at"] or "") < ts:
                    a["last_submitted_at"] = ts
                    a["last_run_hash"] = last_hash

        # Card-reward offer/pick counts with 3 act buckets (A1/A2/A3+).
        _ids_temp_table(con, "excluded_cards", res._excluded_card_ids())
        for eid, bucket, offered, picked in con.execute(
            f"""
            SELECT upper(split_part(cc.u.card.id, '.', -1)),
              least(f.act, 2), count(*),
              count(*) FILTER (coalesce(cc.u.was_picked, false))
            FROM read_parquet('{LAKE_DIR}/floors.parquet') f
            JOIN eligible e ON f.run_hash = e.run_hash,
            LATERAL (SELECT unnest(f.players) AS u) ps,
            LATERAL (SELECT unnest(ps.u.card_choices) AS u) cc
            WHERE cc.u.card.id IS NOT NULL
              AND upper(split_part(cc.u.card.id, '.', 1)) = 'CARD'
              AND upper(split_part(cc.u.card.id, '.', -1))
                  NOT IN (SELECT cid FROM excluded_cards)
            GROUP BY 1, 2
            """
        ).fetchall():
            a = entry("cards", eid)
            if "offered" not in a:
                a.update(
                    {
                        "offered": 0,
                        "picked": 0,
                        "off_act": [0, 0, 0],
                        "pick_act": [0, 0, 0],
                    }
                )
            a["offered"] += offered
            a["picked"] += picked
            a["off_act"][bucket] += offered
            a["pick_act"][bucket] += picked

        # Base vs upgraded deck membership: run-set semantics.
        for eid, upgraded, picks, wins in con.execute(
            f"""
            WITH sets AS (
              SELECT DISTINCT d.run_hash, d.card,
                coalesce(d.upgrade_level, 0) > 0 AS upgraded
              FROM read_parquet('{LAKE_DIR}/deck.parquet') d
              JOIN eligible e ON d.run_hash = e.run_hash
            )
            SELECT s.card, s.upgraded, count(*), count(*) FILTER (e.win)
            FROM sets s JOIN eligible e ON s.run_hash = e.run_hash
            GROUP BY 1, 2
            """
        ).fetchall():
            a = entry("cards", eid)
            a["upg" if upgraded else "base"] = {"picks": picks, "wins": wins}

        # Relic acquisition acts: per-run dedupe, act bounds from the floors
        # table, modded-relic runs skipped entirely (their pickup floors lie).
        official_relics = res._official_relic_ids()
        _ids_temp_table(con, "official_relics", official_relics)
        modded_guard = (
            "AND r.run_hash NOT IN (SELECT DISTINCT run_hash"
            f" FROM read_parquet('{LAKE_DIR}/relics.parquet')"
            " WHERE relic NOT IN (SELECT cid FROM official_relics))"
            if official_relics
            else ""
        )
        for eid, bucket, picks, wins in con.execute(
            f"""
            WITH bounds AS (
              SELECT f.run_hash, f.act, max(cum) AS bound FROM (
                SELECT run_hash, act,
                  count(*) OVER (PARTITION BY run_hash
                    ORDER BY act, floor_idx) AS cum
                FROM read_parquet('{LAKE_DIR}/floors.parquet')
              ) f GROUP BY 1, 2
            ),
            picks AS (
              SELECT DISTINCT r.run_hash, r.relic,
                coalesce(least((SELECT min(b.act) FROM bounds b
                  WHERE b.run_hash = r.run_hash AND r.floor_added <= b.bound),
                  2), 2) AS bucket
              FROM read_parquet('{LAKE_DIR}/relics.parquet') r
              JOIN eligible e ON r.run_hash = e.run_hash
              WHERE r.floor_added IS NOT NULL AND r.floor_added >= 1
                {modded_guard}
            )
            SELECT p.relic, p.bucket, count(*), count(*) FILTER (e.win)
            FROM picks p JOIN eligible e ON p.run_hash = e.run_hash
            GROUP BY 1, 2
            """
        ).fetchall():
            a = entry("relics", eid)
            if "act_picks" not in a:
                a["act_picks"] = [0, 0, 0]
                a["act_wins"] = [0, 0, 0]
            a["act_picks"][int(bucket)] += picks
            a["act_wins"][int(bucket)] += wins

        totals = dict(
            zip(
                ("total_runs", "total_wins"),
                con.execute(
                    "SELECT count(*), count(*) FILTER (win) FROM eligible"
                ).fetchone(),
            )
        )
        data_through = str(
            con.execute(
                f"SELECT max(submitted_at) FROM read_parquet('{LAKE_DIR}/runs.parquet')"
            ).fetchone()[0]
        )
    finally:
        con.close()

    # Each Elo pair extraction gets its own fresh connection: two hours of
    # session state must not sit under the heaviest joins in the build. A
    # failed fit skips Elo (nullable everywhere it serves) instead of
    # destroying everything computed above.
    try:
        card_elo, _ = res._compute_codex_elo(reward_pair_counts())
        for eid, elo in card_elo.items():
            if eid in entities["cards"]:
                entities["cards"][eid]["elo"] = elo
    except Exception:
        logger.warning("reward Elo skipped for this store build", exc_info=True)
    try:
        upgrade_elo, _ = res._compute_codex_elo(upgrade_pair_counts())
        for eid, elo in upgrade_elo.items():
            upg = entities["cards"].get(eid, {}).get("upg")
            if upg is not None:
                upg["elo"] = elo
    except Exception:
        logger.warning("upgrade Elo skipped for this store build", exc_info=True)

    baselines = {}
    for etype, entries_ in entities.items():
        picks = sum(a["picks"] for a in entries_.values())
        wins = sum(a["wins"] for a in entries_.values())
        baselines[etype] = (wins / picks) if picks else 0.0

    store = {
        "entities": entities,
        "totals": totals,
        "baselines": baselines,
        "data_through": data_through,
    }
    import json as _json

    tmp = LAKE_DIR / (_ENTITY_STORE_NAME + ".tmp")
    tmp.write_text(_json.dumps(store, separators=(",", ":")))
    tmp.replace(LAKE_DIR / _ENTITY_STORE_NAME)
    logger.info(
        "lake entity store: %d cards / %d relics / %d potions (%d bytes)",
        len(entities["cards"]),
        len(entities["relics"]),
        len(entities["potions"]),
        (LAKE_DIR / _ENTITY_STORE_NAME).stat().st_size,
    )
    return store


_entity_store_cache: tuple[float, dict] | None = None


def entity_store_with_mtime() -> tuple[float, dict] | None:
    """Mtime-cached load of the ingest-built entity store, or None."""
    global _entity_store_cache
    try:
        path = LAKE_DIR / _ENTITY_STORE_NAME
        if not path.exists():
            return None
        mtime = path.stat().st_mtime
        if _entity_store_cache and _entity_store_cache[0] == mtime:
            return _entity_store_cache
        import json

        store = json.loads(path.read_text())
        _entity_store_cache = (mtime, store)
        return _entity_store_cache
    except Exception:
        logger.warning("entity store load failed", exc_info=True)
        return None


# ── Stats-summary core: the homepage numbers, from the lake ──────────────────


def _stats_core_results() -> list[tuple[dict, dict]]:
    """(filters, core-result) for every materialized stats combo, computed
    from one pass over runs.parquet with get_stats' exact core semantics:
    ascension clamped to 0-10, no hidden filter, characters[] built without
    the character filter and restricted to official ids, win_rate rounded
    to one decimal."""
    from .runs_db_mongo import (
        ASCENSION_FILTER_COMBOS,
        HOT_FILTER_COMBOS,
        OFFICIAL_CHARACTERS,
    )

    con = _connect()
    try:
        cells = con.execute(
            f"""
            SELECT coalesce(upper(character), '') AS ch,
              coalesce(ascension, 0)::INT AS asc,
              count(*) AS n, count(*) FILTER (win) AS w,
              count(*) FILTER (was_abandoned) AS ab
            FROM read_parquet('{LAKE_DIR}/runs.parquet')
            WHERE ascension BETWEEN 0 AND 10
            GROUP BY 1, 2
            """
        ).fetchall()
    finally:
        con.close()

    def pct(w: int, n: int) -> float:
        return round(w / n * 100, 1) if n > 0 else 0

    out: list[tuple[dict, dict]] = []
    for f in [*HOT_FILTER_COMBOS, *ASCENSION_FILTER_COMBOS]:
        char_f = f.get("character")
        asc_f = int(f["ascension"]) if "ascension" in f else None
        filters = {
            "character": char_f,
            "win": None,
            "ascension": f.get("ascension"),
            "game_mode": None,
            "players": None,
            "username": None,
        }
        rows = [
            c
            for c in cells
            if (char_f is None or c[0] == char_f) and (asc_f is None or c[1] == asc_f)
        ]
        total = sum(c[2] for c in rows)
        if total == 0:
            out.append((f, {"total_runs": 0, "filters": filters}))
            continue
        wins = sum(c[3] for c in rows)
        abandoned = sum(c[4] for c in rows)
        no_char = [c for c in cells if asc_f is None or c[1] == asc_f]
        char_totals: dict[str, list[int]] = {}
        for c in no_char:
            rec = char_totals.setdefault(c[0], [0, 0])
            rec[0] += c[2]
            rec[1] += c[3]
        asc_totals: dict[int, list[int]] = {}
        for c in rows:
            rec = asc_totals.setdefault(c[1], [0, 0])
            rec[0] += c[2]
            rec[1] += c[3]
        out.append(
            (
                f,
                {
                    "total_runs": total,
                    "total_wins": wins,
                    "total_abandoned": abandoned,
                    "win_rate": pct(wins, total),
                    "filters": filters,
                    "characters": [
                        {
                            "character": ch,
                            "total": t,
                            "wins": w,
                            "win_rate": pct(w, t),
                        }
                        for ch, (t, w) in sorted(
                            char_totals.items(), key=lambda kv: -kv[1][0]
                        )
                        if ch in OFFICIAL_CHARACTERS
                    ],
                    "ascensions": [
                        {
                            "level": a,
                            "total": t,
                            "wins": w,
                            "win_rate": pct(w, t),
                        }
                        for a, (t, w) in sorted(asc_totals.items())
                    ],
                },
            )
        )
    return out


def refresh_stats_core() -> int:
    """Merge lake-computed core fields into every materialized stats doc,
    preserving the legacy deep tables until their own conversion. Sub-second
    where the Mongo aggregation chain took minutes and timed out."""
    from datetime import datetime, timezone

    from . import cache as app_cache
    from .runs_db_mongo import _filter_key, _summary_coll, seed_stats_counters

    coll = _summary_coll()
    written = 0
    for filters, result in _stats_core_results():
        key = _filter_key(**filters_compact(filters))
        if result.get("total_runs"):
            existing = coll.find_one({"_id": key}) or {}
            merged = {
                **existing,
                **result,
                "_id": key,
                "updated_at": datetime.now(timezone.utc),
            }
        else:
            merged = {
                **result,
                "_id": key,
                "updated_at": datetime.now(timezone.utc),
            }
        coll.replace_one({"_id": key}, merged, upsert=True)
        cache_doc = {k: v for k, v in merged.items() if k not in ("_id", "updated_at")}
        try:
            app_cache.set_json(
                app_cache.stats_key(**filters_compact(filters)),
                cache_doc,
                ttl_seconds=app_cache.WARM_TTL_SECONDS,
            )
        except Exception:
            logger.warning("stats core redis warm failed", exc_info=True)
        if not filters_compact(filters):
            try:
                seed_stats_counters(result)
            except Exception:
                logger.warning("stats counters seed failed", exc_info=True)
        written += 1
    logger.info("lake stats core refreshed: %d combos", written)
    return written


def filters_compact(filters: dict) -> dict:
    """The sparse combo form the legacy key/cache helpers expect."""
    return {k: v for k, v in filters.items() if v is not None}
