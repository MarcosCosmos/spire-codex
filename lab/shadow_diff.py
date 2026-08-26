"""Shadow-diff: lake-computed deaths vs the live community-stats payload.

Reads the JSON files shadow_deaths.sql wrote and compares every id in the
live top-15 lists (already catalog-filtered by the site) against the lake's
counts. Exact agreement is only expected right after an incremental extract
-- the live snapshot folds new runs every cycle -- so each row reports its
drift and the verdict line the worst one, with the Mongo-vs-lake run delta
as freshness context.

    docker compose -f docker-compose.lab.yml run --rm shadow
"""

import json
import pathlib
import sys
import urllib.request

sys.path.insert(0, "/app")

LAKE = pathlib.Path("/lake")
LIVE_URLS = [
    "http://spire-codex-backend:8000/api/runs/community-stats",
    "https://spire-codex.com/api/runs/community-stats",
]


def _fetch_live() -> dict:
    for url in LIVE_URLS:
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "spire-codex-lab-shadow-diff/1"}
            )
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.load(r)
                print(f"live payload from {url}")
                return data
        except Exception as e:
            print(f"fetch {url}: {e}")
    raise SystemExit("could not fetch live community-stats")


def _freshness(lake_runs: int) -> None:
    try:
        from app.services.runs_db_mongo import _get_collection

        n = _get_collection().count_documents({})
        print(
            f"freshness: mongo {n:,} runs vs lake {lake_runs:,} "
            f"({n - lake_runs:+,} not yet extracted)"
        )
    except Exception as e:
        print(f"freshness check unavailable: {e}")


def _diff_section(name: str, live_rows: list[dict], lake_file: str) -> float:
    lake = {r["id"]: r["count"] for r in json.loads((LAKE / lake_file).read_text())}
    total = sum(lake.values())
    print(f"\n== deaths.{name} (live top-{len(live_rows)} vs lake) ==")
    print(f"{'id':<34} {'live':>9} {'lake':>9} {'diff':>7} {'drift%':>7}")
    worst = 0.0
    for row in live_rows:
        lv, lk = row["count"], lake.get(row["id"], 0)
        drift = abs(lk - lv) * 100.0 / max(lv, 1)
        worst = max(worst, drift)
        print(f"{row['id']:<34} {lv:>9,} {lk:>9,} {lk - lv:>+7,} {drift:>6.2f}%")
    missing = [i for i in lake if i not in {r["id"] for r in live_rows}]
    print(
        f"lake-only ids (below live top-{len(live_rows)} or catalog-filtered): "
        f"{len(missing)}; lake {name} total: {total:,}"
    )
    return worst


def main() -> None:
    live = _fetch_live()
    meta = json.loads((LAKE / "shadow_meta.json").read_text())[0]
    _freshness(meta["lake_runs"])
    print(
        f"lake eligible losses (A0-A10, official, not hidden): {meta['eligible_losses']:,}"
    )
    worst = max(
        _diff_section(
            "encounters",
            live["deaths"]["encounters"],
            "shadow_deaths_encounters.json",
        ),
        _diff_section("events", live["deaths"]["events"], "shadow_deaths_events.json"),
    )
    print(
        f"\nVERDICT: worst per-id drift {worst:.2f}% "
        f"({'PASS - within fold lag' if worst < 1.0 else 'INVESTIGATE'})"
    )


if __name__ == "__main__":
    main()
