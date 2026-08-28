"""Shadow-validate the lake-built frame against the Mongo row construction.

Builds the lake frame (with run_hash) to a scratch parquet, samples rows,
fetches the same docs from Mongo, runs them through the exact Python row
construction the DB walk uses, and diffs column by column. Sampling makes it
exact on transformation semantics without paying the 3h full walk.

    docker compose -f docker-compose.prod.yml run -T --rm --entrypoint python lake-ingest /lab/validate_frame_lake.py
"""

import pathlib
import sys

sys.path.insert(0, "/app")

SAMPLE = 2000
COLS = (
    "character",
    "win",
    "ascension",
    "game_mode",
    "player_count",
    "run_time",
    "floors_reached",
    "deck_size",
    "relic_count",
    "played_day",
    "username",
    "was_abandoned",
    "acts_completed",
    "daily_date",
    "build_id",
)


def main() -> None:
    import duckdb

    from app.services import charts_stats as cs
    from app.services.runs_db_mongo import _get_collection

    lake = pathlib.Path("/lake")
    runs_p = lake / "runs.parquet"
    scalars_p = lake / "run_scalars.parquet"
    if not (runs_p.exists() and scalars_p.exists()):
        print("lake inputs missing (runs.parquet / run_scalars.parquet)")
        sys.exit(1)

    out = lake / "frame_lake_validate.parquet"
    con = duckdb.connect()
    con.execute("SET TimeZone='UTC'")
    con.execute(
        f"COPY ({cs._lake_frame_select(runs_p, scalars_p, with_hash=True)})"
        f" TO '{out}' (FORMAT parquet, COMPRESSION zstd)"
    )
    total = con.execute(f"SELECT count(*) FROM read_parquet('{out}')").fetchone()[0]
    print(f"lake frame: {total:,} rows")

    hashes = [
        r[0]
        for r in con.execute(
            f"SELECT run_hash FROM read_parquet('{out}') USING SAMPLE {SAMPLE}"
        ).fetchall()
    ]
    lake_rows = {
        r[0]: r[1:]
        for r in con.execute(
            f"SELECT run_hash, {', '.join(COLS)} FROM read_parquet('{out}')"
            " WHERE run_hash IN (SELECT unnest(?))",
            [hashes],
        ).fetchall()
    }

    coll = _get_collection()
    docs = {d["_id"]: d for d in coll.find({"_id": {"$in": hashes}})}
    mismatches = 0
    missing = 0
    by_col: dict[str, int] = {}
    for h in hashes:
        d = docs.get(h)
        if d is None:
            missing += 1
            continue
        mode = (d.get("game_mode") or "standard").lower()
        expected = (
            cs._norm_char(d.get("character")),
            1 if d.get("win") else 0,
            int(d.get("ascension") or 0),
            mode,
            int(d.get("player_count") or 1),
            int(d.get("run_time") or 0),
            int(d.get("floors_reached") or 0),
            int(d.get("deck_size") or 0),
            int(d.get("relic_count") or 0),
            cs._epoch_day(d.get("played_at") or d.get("submitted_at")),
            (d.get("username") or "").lower(),
            1 if d.get("was_abandoned") else 0,
            int(d.get("acts_completed") or 0),
            cs._daily_date(d.get("seed"), mode),
            (d.get("build_id") or "").strip(),
        )
        got = lake_rows.get(h)
        if got != expected:
            mismatches += 1
            for name, e, g in zip(COLS, expected, got or ()):
                if e != g:
                    by_col[name] = by_col.get(name, 0) + 1
                    if by_col[name] <= 3:
                        print(f"  {h} {name}: mongo={e!r} lake={g!r}")
    print(
        f"sampled {len(hashes)}: {mismatches} mismatched rows, "
        f"{missing} not in mongo, per-column: {by_col or 'clean'}"
    )
    # Coverage: how much newer is Mongo than the lake (explains count deltas).
    newer = coll.count_documents(
        {
            "hidden": {"$ne": True},
            "ascension": {"$gte": 0, "$lte": 10},
        }
    )
    print(f"mongo eligible now: {newer:,} vs lake frame {total:,}")
    sys.exit(1 if mismatches else 0)


if __name__ == "__main__":
    main()
