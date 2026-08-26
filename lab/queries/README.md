# Lake query pack

Replicas of every remaining snapshot-served surface, straight off the
parquet lake. Run any of them with:

```
docker compose -f docker-compose.lab.yml run --rm duckdb /lake/build.duckdb -c ".read /lake/lab/queries/<file>.sql"
```

Every query starts from the same `eligible` filter the walk uses
(hidden/deleted out, A0-A10, official characters). Files:

- `tierlist_cards.sql` — per-card picks / wins / win rate / base-vs-upgraded,
  the Codex Score inputs ("all" bracket plus an A10 and a solo slice).
- `card_rewards.sql` — offered / picked / pick rate per card, with per-act
  splits: the reward-screen metrics.
- `elo_pairs.sql` — per-screen picked-beats-skipped pairs, the Elo input.
- `winrate_brackets.sql` — per-user winrate classification (5-run floor,
  abandons = losses) and a wr50 tier-list slice built from it.
- `charts_frame.sql` — the frame-chart family: winrate by floor, runs and
  winrate over time (Pacific-bucketed), time-to-win histogram.
- `charts_blob.sql` — the blob-chart family: HP trajectory, gold curve,
  deck growth, encounter damage/turns rankings, deaths by room type.
