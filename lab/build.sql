-- Build the analytical lake from /lake/staging/*.jsonl.gz.
-- Fully streaming: no intermediate table, each parquet file is written
-- straight off a pass over the staging files, so memory stays bounded
-- regardless of corpus size (materializing the corpus first blew a 3g
-- container cap). Three JSON passes; excluded derives from runs.parquet.
--   docker compose -f docker-compose.lab.yml run --rm duckdb /lake/build.duckdb -c ".read /lake/lab/build.sql"
SET memory_limit='800MB';
SET threads=2;
SET temp_directory='/lake/tmp';
SET preserve_insertion_order=false;

COPY (
SELECT run_hash,
  upper(split_part(players[1].character,'.',-1)) AS character,
  win, coalesce(was_abandoned, false) AS was_abandoned,
  ascension, lower(coalesce(game_mode,'standard')) AS game_mode,
  _meta.player_count AS player_count, build_id, seed, start_time, run_time,
  upper(split_part(killed_by_encounter,'.',-1)) AS killed_by_encounter,
  upper(split_part(killed_by_event,'.',-1)) AS killed_by_event,
  _meta.username AS username, _meta.hidden AS hidden, _meta.deleted AS deleted,
  _meta.submitted_at AS submitted_at, _meta.played_at AS played_at
FROM read_ndjson_auto('/lake/staging/*.jsonl.gz',
  maximum_object_size=104857600, sample_size=30000,
  ignore_errors=true, union_by_name=true)
) TO '/lake/runs.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (
SELECT run_hash FROM read_parquet('/lake/runs.parquet') WHERE hidden OR deleted
) TO '/lake/excluded.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (
SELECT r.run_hash, act.i AS act, loc.i AS floor_idx,
  lower(loc.u.map_point_type) AS map_point_type,
  lower(room.u.room_type) AS room_type,
  upper(split_part(room.u.model_id,'.',-1)) AS encounter,
  room.u.turns_taken AS turns,
  (SELECT sum(ps.u.damage_taken) FROM (SELECT unnest(loc.u.player_stats) AS u) ps) AS damage_taken,
  loc.u.player_stats[1].current_hp AS p1_hp,
  loc.u.player_stats[1].max_hp AS p1_max_hp,
  loc.u.player_stats[1].current_gold AS p1_gold
FROM read_ndjson_auto('/lake/staging/*.jsonl.gz',
  maximum_object_size=104857600, sample_size=30000,
  ignore_errors=true, union_by_name=true) r,
  LATERAL (SELECT unnest(map_point_history) AS u, generate_subscripts(map_point_history,1) AS i) act,
  LATERAL (SELECT unnest(act.u) AS u, generate_subscripts(act.u,1) AS i) loc,
  LATERAL (SELECT unnest(loc.u.rooms) AS u) room
) TO '/lake/floor_events.parquet' (FORMAT parquet, COMPRESSION zstd);

COPY (
SELECT r.run_hash, p.i AS player_idx,
  upper(split_part(p.u.character,'.',-1)) AS character,
  upper(split_part(c.u.id,'.',-1)) AS card,
  c.u.floor_added_to_deck AS floor_added,
  c.u.current_upgrade_level AS upgrade_level
FROM read_ndjson_auto('/lake/staging/*.jsonl.gz',
  maximum_object_size=104857600, sample_size=30000,
  ignore_errors=true, union_by_name=true) r,
  LATERAL (SELECT unnest(players) AS u, generate_subscripts(players,1) AS i) p,
  LATERAL (SELECT unnest(p.u.deck) AS u) c
) TO '/lake/deck.parquet' (FORMAT parquet, COMPRESSION zstd);

SELECT 'runs' AS t, count(*) AS n FROM read_parquet('/lake/runs.parquet')
UNION ALL SELECT 'excluded', count(*) FROM read_parquet('/lake/excluded.parquet')
UNION ALL SELECT 'floor_events', count(*) FROM read_parquet('/lake/floor_events.parquet')
UNION ALL SELECT 'deck', count(*) FROM read_parquet('/lake/deck.parquet');
