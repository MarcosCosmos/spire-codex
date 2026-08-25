# On-box analytics lab (DuckDB 1.5.5)

One-shot tooling to build a Parquet lake from prod Mongo, on the box itself.
Nothing here touches the running services: `extract` is a throwaway container
using the existing backend image, `duckdb` is the official `duckdb/duckdb`
image pinned to 1.5.5. Output lands in `./lake/` (gitignored, local to the box).

## One-time setup (on the box, from the repo root)

```
git fetch origin lab/on-box-lake
git checkout origin/lab/on-box-lake -- lab docker-compose.lab.yml
mkdir -p lake
```

This only copies the lab files into the working tree; the checked-out branch
stays `main` and the deploy script is unaffected.

## 1. Extract (wait for any full walk to finish first — it reads the same blobs)

```
docker compose -f docker-compose.lab.yml run --rm extract
```

Streams every run (Mongo blobs first, file fallback) into
`lake/staging/*.jsonl.gz` pages of 50k, each line tagged with `_meta`
(username, hidden, deleted, submitted_at, played_at, player_count) — fields
the HTTP export doesn't carry. Prints progress per page; capped at 1.5GB RAM.

## 2. Build the lake

```
docker compose -f docker-compose.lab.yml run --rm duckdb /lake/build.duckdb -c ".read /lake/lab/build.sql"
```

Produces `lake/runs.parquet`, `excluded.parquet`, `floor_events.parquet`,
`deck.parquet` and prints row counts. Capped at 2GB RAM (1.5GB inside
DuckDB). The `/lake/build.duckdb` argument matters: the corpus is far
larger than the memory cap, so the build needs a disk-backed database to
spill into. `lake/build.duckdb` and `lake/tmp/` are scratch — delete them
(and `lake/staging/` if you want the ~4GB back) once the parquet files
exist.

## 3. Query

```
docker compose -f docker-compose.lab.yml run --rm duckdb -c "
SELECT killed_by_encounter, count(*) AS deaths
FROM read_parquet('/lake/runs.parquet') r
ANTI JOIN read_parquet('/lake/excluded.parquet') x ON r.run_hash = x.run_hash
WHERE NOT win AND killed_by_encounter IS NOT NULL
GROUP BY 1 ORDER BY 2 DESC LIMIT 15"
```

Interactive shell: `docker compose -f docker-compose.lab.yml run --rm duckdb`
(`.quit` to exit). Queries read the parquet files directly — no database
file argument needed. Always anti-join `excluded.parquet` (with an explicit ON -- DuckDB
rejects ANTI JOIN with USING) so hidden/deleted runs stay out, same as
the site.

## Refresh

Re-run steps 1-2. The extract is a full re-pull (staging pages are
overwritten); incremental append is a later problem, this is a lab.
