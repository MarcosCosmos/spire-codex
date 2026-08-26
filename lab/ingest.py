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
    for name in ("build.sql", "shadow_deaths.sql", "shadow_community.sql"):
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
    print("ingest complete", flush=True)


if __name__ == "__main__":
    main()
