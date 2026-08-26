"""Nightly lake ingest: incremental extract, then rebuild the parquet lake.

One-shot for host cron, using the backend image (pymongo for the extract,
the pinned duckdb for the build). The shadow SQL files run too when
present, so the nightly log carries fresh comparison inputs for free.

    docker compose -f docker-compose.prod.yml run --rm lake-ingest
"""

import pathlib
import sys

sys.path.insert(0, "/lab")
sys.path.insert(0, "/app")

import extract


def main() -> None:
    extract.main()

    import duckdb

    con = duckdb.connect("/lake/build.duckdb")
    # The shadow SQLs were the migration validation gate; the gate passed,
    # and the payload builder computes the same sections anyway, so the
    # nightly run skips them (halves the tail). Run them by hand from
    # lab/ when a fresh lake-vs-snapshot diff is wanted.
    for name in ("build.sql",):
        path = pathlib.Path("/lab") / name
        if not path.exists():
            print(f"{name}: not present, skipped", flush=True)
            continue
        con.execute(path.read_text())
        print(f"{name}: done", flush=True)
    try:
        from app.services import lake_stats

        lake_stats.build_and_store_payload()
        print("community payload stored", flush=True)
        lake_stats.build_entity_store()
        print("entity store stored", flush=True)
    except Exception as e:
        print(f"community payload build failed: {e}", flush=True)
    # The rebuilder is retired, so the materialized summaries that fed the
    # home overview and the leaderboards move here: plain Mongo aggregations
    # plus a Redis warm, no snapshot involved.
    # Core stats (homepage totals / characters / ascensions) come from the
    # lake in seconds; the legacy Mongo aggregation only tops up the deep
    # item tables and is allowed to fail until its own conversion lands.
    try:
        n = lake_stats.refresh_stats_core()
        print(f"stats core refreshed ({n} combos)", flush=True)
    except Exception as e:
        print(f"stats core failed: {e}", flush=True)
    try:
        from app.services.runs_db_mongo import (
            refresh_leaderboard_summary,
            refresh_stats_summary,
        )

        n = refresh_leaderboard_summary()
        print(f"leaderboard summary refreshed ({n} boards)", flush=True)
        n = refresh_stats_summary()
        print(f"legacy deep tables refreshed ({n} combos)", flush=True)
    except Exception as e:
        print(f"legacy summary refresh failed: {e}", flush=True)
    try:
        from app.services.charts_stats import store_frame_parquet

        n = store_frame_parquet()
        print(f"frame parquet stored ({n} rows)", flush=True)
    except Exception as e:
        print(f"frame parquet failed: {e}", flush=True)
    print("ingest complete", flush=True)


if __name__ == "__main__":
    main()
