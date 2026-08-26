-- Raw aggregates for the community-stats shadow diff, "all" bracket.
-- Eligibility mirrors the walk's row filter: hidden/deleted out, A0-A10,
-- official characters. Finalization (sorting, percentages, gates) happens
-- in shadow_diff.py, replicating community_stats.py exactly.
--   docker compose -f docker-compose.lab.yml run --rm duckdb /lake/build.duckdb -c ".read /lake/lab/shadow_community.sql"
SET memory_limit='1500MB';
SET threads=2;

CREATE OR REPLACE TEMP VIEW eligible AS
SELECT r.*
FROM read_parquet('/lake/runs.parquet') r
ANTI JOIN read_parquet('/lake/excluded.parquet') x ON r.run_hash = x.run_hash
WHERE r.ascension BETWEEN 0 AND 10
  AND r.character IN ('IRONCLAD','SILENT','DEFECT','NECROBINDER','REGENT');

COPY (
SELECT lower(character) AS character, coalesce(ascension, 0) AS ascension,
  count(*) AS runs, count(*) FILTER (win) AS wins
FROM eligible GROUP BY 1, 2
) TO '/lake/shadow_char_asc.json' (FORMAT json, ARRAY true);

-- floors_reached histogram (runs with at least one visited location).
COPY (
WITH per_run AS (
  SELECT f.run_hash, count(*) AS floors_reached
  FROM read_parquet('/lake/floors.parquet') f
  JOIN eligible e ON f.run_hash = e.run_hash
  GROUP BY 1
)
SELECT floors_reached, count(*) AS runs, count(*) FILTER (e.win) AS wins
FROM per_run p JOIN eligible e ON p.run_hash = e.run_hash
GROUP BY 1
) TO '/lake/shadow_floors_hist.json' (FORMAT json, ARRAY true);

-- Map danger raw: per (act, node type) player-visits, damage%-of-max-hp sum,
-- and deaths attributed to the run's final visited typed location. The died
-- flag is raw truthiness like the walk's: NONE sentinels count.
COPY (
WITH typed AS (
  SELECT f.* FROM read_parquet('/lake/floors.parquet') f
  JOIN eligible e ON f.run_hash = e.run_hash
  WHERE f.map_point_type IS NOT NULL AND f.map_point_type <> ''
),
visits AS (
  SELECT act, map_point_type,
    count(*) AS visits,
    sum(least(100.0, greatest(0, coalesce(ps.u.damage_taken, 0)) * 100.0 / ps.u.max_hp)) AS dmg_sum
  FROM typed, LATERAL (SELECT unnest(players) AS u) ps
  WHERE coalesce(ps.u.max_hp, 0) > 0
  GROUP BY 1, 2
),
last_floor AS (
  SELECT t.run_hash,
    arg_max(t.act, t.act * 10000 + t.floor_idx) AS act,
    arg_max(t.map_point_type, t.act * 10000 + t.floor_idx) AS map_point_type
  FROM typed t
  JOIN eligible e ON t.run_hash = e.run_hash
  WHERE coalesce(e.killed_by_encounter, '') <> '' OR coalesce(e.killed_by_event, '') <> ''
  GROUP BY 1
),
deaths AS (
  SELECT act, map_point_type, count(*) AS deaths FROM last_floor GROUP BY 1, 2
)
SELECT v.act, v.map_point_type, v.visits, v.dmg_sum, coalesce(d.deaths, 0) AS deaths
FROM visits v LEFT JOIN deaths d USING (act, map_point_type)
) TO '/lake/shadow_map_danger.json' (FORMAT json, ARRAY true);

SELECT 'char_asc rows' AS t, count(*) AS n FROM read_json('/lake/shadow_char_asc.json')
UNION ALL SELECT 'floors hist rows', count(*) FROM read_json('/lake/shadow_floors_hist.json')
UNION ALL SELECT 'map danger rows', count(*) FROM read_json('/lake/shadow_map_danger.json');
