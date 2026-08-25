"""On-box lake extraction: every run -> gzipped JSONL pages in /lake/staging.

Runs inside the backend image (has pymongo + the app's Mongo config), so it
reads blobs Mongo-first with per-run file fallback -- the same source of
truth the site serves from, including the ~7% of runs the HTTP export's
file-only path silently skipped. Each line is the raw run blob plus a _meta
envelope carrying the server-side fields the blob itself lacks (username,
hidden, timestamps), which later become the lake's sidecar tables.

    docker compose -f docker-compose.lab.yml run --rm extract
"""

import gzip
import json
import pathlib
import sys
import time

sys.path.insert(0, "/app")

from app.services.runs_db_mongo import _get_collection, get_run_blobs 

STAGING = pathlib.Path("/lake/staging")
RUNS_DIR = pathlib.Path("/data/runs")
PAGE_SIZE = 50_000
BATCH = 300


def _iso(v):
    return v.isoformat() if hasattr(v, "isoformat") else v


def main() -> None:
    STAGING.mkdir(parents=True, exist_ok=True)
    coll = _get_collection()
    cursor = coll.find(
        {},
        {
            "_id": 1,
            "username": 1,
            "hidden": 1,
            "deleted_at": 1,
            "submitted_at": 1,
            "played_at": 1,
            "player_count": 1,
        },
        no_cursor_timeout=True,
    ).sort([("submitted_at", 1), ("_id", 1)])

    t0 = time.time()
    page = written = skipped = 0
    out = gzip.open(STAGING / f"{page:05d}.jsonl.gz", "wt", encoding="utf-8")
    batch: list[dict] = []

    def flush(rows: list[dict]) -> None:
        nonlocal written, skipped, page, out
        blobs = {}
        try:
            blobs = get_run_blobs([r["_id"] for r in rows])
        except Exception:
            blobs = {}
        for r in rows:
            h = r["_id"]
            obj = blobs.get(h)
            if obj is None:
                try:
                    obj = json.loads(
                        (RUNS_DIR / f"{h}.json").read_text(encoding="utf-8")
                    )
                except Exception:
                    skipped += 1
                    continue
            try:
                obj["run_hash"] = h
                obj["_meta"] = {
                    "username": r.get("username"),
                    "hidden": bool(r.get("hidden")),
                    "deleted": r.get("deleted_at") is not None,
                    "submitted_at": _iso(r.get("submitted_at")),
                    "played_at": _iso(r.get("played_at")),
                    "player_count": r.get("player_count") or 1,
                }
                out.write(json.dumps(obj, separators=(",", ":")) + "\n")
                written += 1
            except Exception:
                skipped += 1
                continue
            if written % PAGE_SIZE == 0:
                out.close()
                page += 1
                out = gzip.open(
                    STAGING / f"{page:05d}.jsonl.gz", "wt", encoding="utf-8"
                )
                rate = written / max(1.0, time.time() - t0)
                print(
                    f"page {page}: {written:,} written, {skipped:,} skipped, "
                    f"{rate:.0f} runs/s",
                    flush=True,
                )

    try:
        for row in cursor:
            batch.append(row)
            if len(batch) >= BATCH:
                flush(batch)
                batch = []
        if batch:
            flush(batch)
    finally:
        cursor.close()
        out.close()
    print(
        f"DONE: {written:,} written, {skipped:,} skipped in "
        f"{(time.time() - t0) / 60:.1f} min",
        flush=True,
    )


if __name__ == "__main__":
    main()
