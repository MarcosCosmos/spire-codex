"""Compute and durably store profile insights for EVERY account
with claimed runs, most recently active first.

Runs in its own container (the backend image, same env the ingest uses), so
the walk gets a whole process instead of a thread inside a serving worker —
the in-worker walk died to deploys, memory pressure, and worker churn all
day on 2026-08-27; this environment completed the same walk in minutes.
Results land in the durable user_insights store, where serving already
reads them (Redis re-warms from the store on view, submit/claim
invalidation keeps them fresh). Does NOT take the ingest lock: it only
reads Mongo and writes the store, so it can run beside a cycle.

    docker compose -f docker-compose.prod.yml run -T --rm --entrypoint python lake-ingest /lab/precompute_insights.py
"""

import sys
import time

sys.path.insert(0, "/app")


def main() -> None:
    from fastapi.encoders import jsonable_encoder

    from app.services import user_insights as ui
    from app.services.runs_db_mongo import _get_collection

    coll = _get_collection()
    users = list(
        coll.aggregate(
            [
                {"$match": {"user_id": {"$ne": None}}},
                {
                    "$group": {
                        "_id": "$user_id",
                        "last": {"$max": "$submitted_at"},
                        "n": {"$sum": 1},
                        "username": {"$max": "$username"},
                    }
                },
                {"$sort": {"last": -1}},
            ],
            allowDiskUse=True,
        )
    )
    print(f"{len(users)} accounts with claimed runs", flush=True)
    done = failed = 0
    t0 = time.time()
    for u in users:
        uid = str(u["_id"])
        try:
            t = time.time()
            slices = ui._compute_insights_all_slices(uid, u.get("username"))
            for suffix, payload in slices.items():
                ui._store_payload(f"{uid}{suffix}", jsonable_encoder(payload))
            done += 1
            print(
                f"stored {u.get('username') or uid} runs={u['n']} "
                f"slices={len(slices)} in {time.time() - t:.0f}s "
                f"[{done + failed}/{len(users)}]",
                flush=True,
            )
        except Exception as e:
            failed += 1
            print(f"FAILED {uid}: {type(e).__name__}: {e}", flush=True)
    print(
        f"done: {done} stored, {failed} failed in {(time.time() - t0) / 60:.1f} min",
        flush=True,
    )


if __name__ == "__main__":
    main()
