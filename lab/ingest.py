"""Nightly lake ingest: incremental extract, then rebuild the parquet lake.

One-shot for host cron, using the backend image (pymongo for the extract,
the pinned duckdb for the build). The shadow SQL files run too when
present, so the nightly log carries fresh comparison inputs for free.

    docker compose -f docker-compose.prod.yml run --rm lake-ingest
"""

import json
import pathlib
import sys
import time

sys.path.insert(0, "/lab")
sys.path.insert(0, "/app")

import extract

LAKE = pathlib.Path("/lake")


def _utc(ts: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts))


def main() -> None:
    # One ingest at a time: an overlapping cron start would race the shared
    # scratch DB and double the box's memory pressure. The lock lives for
    # the process; a crashed run releases it automatically.
    import fcntl

    lock = open(LAKE / "ingest.lock", "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        print("another ingest holds /lake/ingest.lock; exiting", flush=True)
        sys.exit(1)

    t0 = time.time()
    generation_id = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime(t0))
    print(f"generation {generation_id} starting", flush=True)
    extracted = extract.main() or (0, 0)
    t_extract = time.time()

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
    t_build = time.time()
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
    # The edge is the last stale layer: origin freshness means nothing while
    # Cloudflare serves yesterday's JSON. Purge exactly the URLs this run
    # refreshed (CF_TOKEN/CF_ZONE come from the same .env the admin tab uses).
    purge_ok = None
    try:
        import os

        import httpx

        token = os.environ.get("CF_TOKEN", "").strip()
        zone = os.environ.get("CF_ZONE", "").strip()
        if token and zone:
            site = os.environ.get("PUBLIC_SITE_BASE", "https://spire-codex.com").rstrip(
                "/"
            )
            files = [
                f"{site}{p}"
                for p in (
                    "/api/runs/stats",
                    "/api/runs/community-stats",
                    "/api/runs/leaderboard",
                    "/api/runs/scores/cards",
                    "/api/runs/scores/relics",
                    "/api/runs/scores/potions",
                    "/api/runs/metrics/cards",
                    "/api/runs/metrics/relics",
                    "/api/runs/metrics/potions",
                )
            ]
            resp = httpx.post(
                f"https://api.cloudflare.com/client/v4/zones/{zone}/purge_cache",
                headers={"Authorization": f"Bearer {token}"},
                json={"files": files},
                timeout=15,
            )
            purge_ok = resp.status_code == 200 and resp.json().get("success") is True
            print(f"edge purge: ok={purge_ok} ({len(files)} urls)", flush=True)
        else:
            print("edge purge skipped: CF_TOKEN/CF_ZONE not set", flush=True)
    except Exception as e:
        purge_ok = False
        print(f"edge purge failed: {e}", flush=True)

    # Cycle record. Stages publish independently (each store is its own
    # atomic rename), so the generation manifest is the completeness
    # contract: it only advances when every serving artifact this cycle
    # owns was rebuilt after the cycle started. /health reports it; a
    # cycle that lost a stage leaves the previous manifest in place and
    # shows up in ingest_metrics.jsonl with complete=false.
    published = time.time()
    manifest: dict = {
        "generation_id": generation_id,
        "cycle_started_at": _utc(t0),
        "source_watermark": None,
        "rows_added": extracted[0],
        "rows_skipped": extracted[1],
        "extract_seconds": round(t_extract - t0, 1),
        "build_sql_seconds": round(t_build - t_extract, 1),
        "stores_seconds": round(published - t_build, 1),
        "total_seconds": round(published - t0, 1),
        "purge_ok": purge_ok,
        "published_at": _utc(published),
        "artifacts": {},
    }
    try:
        st = json.loads((LAKE / "staging" / "state.json").read_text())
        manifest["source_watermark"] = st.get("submitted_at")
    except Exception:
        pass
    required = ("community_payload.json", "entity_store.json", "frame.parquet")
    for name in required + ("community_cube.json.gz",):
        try:
            s = (LAKE / name).stat()
            manifest["artifacts"][name] = {
                "bytes": s.st_size,
                "modified_at": _utc(s.st_mtime),
            }
        except OSError:
            manifest["artifacts"][name] = None
    manifest["complete"] = all(
        (a := manifest["artifacts"].get(n)) and a["modified_at"] >= _utc(t0)
        for n in required
    )
    with open(LAKE / "ingest_metrics.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(manifest, separators=(",", ":")) + "\n")
    if manifest["complete"]:
        tmp = LAKE / "generation.json.tmp"
        tmp.write_text(json.dumps(manifest, indent=1))
        tmp.replace(LAKE / "generation.json")
        print(f"generation {generation_id} published", flush=True)
    else:
        missing = [
            n
            for n in required
            if not (
                (a := manifest["artifacts"].get(n)) and a["modified_at"] >= _utc(t0)
            )
        ]
        print(
            f"generation {generation_id} INCOMPLETE (stale: {', '.join(missing)}); "
            "manifest not advanced",
            flush=True,
        )
    print("ingest complete", flush=True)


if __name__ == "__main__":
    main()
