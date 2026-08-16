"""Stamp played_at (from the blob's start_time) on runs that predate the
field, so profile lists sort by when a run was played instead of uploaded.
Idempotent — only touches docs without the field.

    python -m scripts.backfill_played_at
"""

import os


def main() -> int:
    if not os.environ.get("MONGO_URL", "").strip():
        print("MONGO_URL unset; nothing to do")
        return 1
    from app.services.runs_db_mongo import backfill_played_at

    stamped = backfill_played_at()
    print(f"stamped played_at on {stamped} run doc(s)", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
