"""Exact-equality gate for community payload/cube builder changes.

The payload builders are pure functions of the lake, so on an IDLE lake
(right after a cycle, before any new extract) the artifacts the old code
wrote and an in-memory build by the new code must match exactly. Any
difference is a semantics change and blocks the rewrite.

Run only while no ingest is active (it prepares its own build session):

    docker compose -f docker-compose.prod.yml run -T --rm --entrypoint python lake-ingest /lab/validate_payload_rewrite.py
"""

import gzip
import json
import pathlib
import sys

sys.path.insert(0, "/app")


def main() -> None:
    from app.services import community_stats as cs
    from app.services import lake_stats

    lake = pathlib.Path("/lake")
    with gzip.open(lake / "community_cube.json.gz", "rt", encoding="utf-8") as f:
        old_cube = json.load(f)
    old_payload = json.loads((lake / "community_payload.json").read_text())

    session = lake_stats.prepare_build_session()
    session.close()
    try:
        accs = lake_stats._build_community_cube()
    finally:
        lake_stats.cleanup_build_session()

    new_cells = json.loads(
        json.dumps({k: lake_stats._acc_to_json(a) for k, a in accs.items()})
    )
    old_cells = old_cube.get("cells") or {}

    diffs = 0
    for missing in sorted(set(old_cells) ^ set(new_cells)):
        side = "old-only" if missing in old_cells else "new-only"
        print(f"CELL {side}: {missing}")
        diffs += 1
    for cell in sorted(set(old_cells) & set(new_cells)):
        o, n = old_cells[cell], new_cells[cell]
        for field in sorted(set(o) | set(n)):
            if o.get(field) != n.get(field):
                if diffs < 12:
                    print(f"DIFF {cell} .{field}")
                diffs += 1

    new_payload = cs._finalize_one(lake_stats._merge_accs(list(accs.values())))
    op = {k: v for k, v in old_payload.items() if k != "data_through"}
    np_ = json.loads(json.dumps(new_payload))
    for field in sorted(set(op) | set(np_)):
        if op.get(field) != np_.get(field):
            if diffs < 20:
                print(f"PAYLOAD DIFF .{field}")
            diffs += 1

    print(f"cells old={len(old_cells)} new={len(new_cells)}; total diffs: {diffs}")
    sys.exit(1 if diffs else 0)


if __name__ == "__main__":
    main()
