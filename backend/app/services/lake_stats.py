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

_OFFICIAL = "('IRONCLAD','SILENT','DEFECT','NECROBINDER','REGENT')"


def available() -> bool:
    if not (LAKE_DIR / "runs.parquet").exists():
        return False
    try:
        import duckdb  # noqa: F401
    except ImportError:
        return False
    return True


def _connect():
    import duckdb

    con = duckdb.connect()
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
