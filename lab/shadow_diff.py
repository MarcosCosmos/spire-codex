"""Shadow-diff: lake-computed community-stats vs the live payload.

Reads the raw aggregates shadow_deaths.sql and shadow_community.sql wrote,
finalizes them with the same arithmetic community_stats.py uses, and diffs
each section against the live response. Exact agreement is only expected
right after an incremental extract; each section reports its worst drift
and the verdict line the overall worst. Count drift is relative (%), rate
drift is in percentage points (pp).

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
MAX_REAL_FLOOR = 48
WORST_SHOWN = 5


def _pct(part, whole):
    return round(part / whole * 100, 1) if whole else 0.0


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


def _load(name: str):
    return json.loads((LAKE / name).read_text())


class Section:
    def __init__(self, name: str):
        self.name = name
        self.rows: list[tuple[float, str]] = []

    def count(self, label: str, live, lake) -> None:
        drift = abs((lake or 0) - (live or 0)) * 100.0 / max(live or 0, 1)
        self.rows.append(
            (drift, f"{label}: live {live:,} lake {lake:,} ({drift:.2f}%)")
        )

    def rate(self, label: str, live, lake) -> None:
        drift = abs((lake or 0.0) - (live or 0.0))
        self.rows.append((drift, f"{label}: live {live} lake {lake} ({drift:.2f}pp)"))

    def report(self) -> float:
        worst = max((d for d, _ in self.rows), default=0.0)
        print(f"\n== {self.name}: {len(self.rows)} values, worst drift {worst:.2f} ==")
        for d, line in sorted(self.rows, reverse=True)[:WORST_SHOWN]:
            print("  " + line)
        return worst


def diff_deaths(live: dict) -> float:
    worst = 0.0
    for section, fname in (
        ("encounters", "shadow_deaths_encounters.json"),
        ("events", "shadow_deaths_events.json"),
    ):
        lake = {r["id"]: r["count"] for r in _load(fname)}
        s = Section(f"deaths.{section}")
        for row in live["deaths"][section]:
            s.count(row["id"], row["count"], lake.get(row["id"], 0))
        worst = max(worst, s.report())
    return worst


def diff_char_asc(live: dict) -> float:
    rows = _load("shadow_char_asc.json")
    total_runs = sum(r["runs"] for r in rows)
    total_wins = sum(r["wins"] for r in rows)

    s = Section("totals")
    s.count("total_runs", live["total_runs"], total_runs)
    s.count("total_wins", live["total_wins"], total_wins)
    s.count("total_losses", live["total_losses"], total_runs - total_wins)
    s.rate("win_rate", live["win_rate"], _pct(total_wins, total_runs))
    worst = s.report()

    by_asc: dict[int, list[int]] = {}
    by_char: dict[str, list[int]] = {}
    matrix: dict[tuple[str, int], list[int]] = {}
    for r in rows:
        for key, store in (
            (int(r["ascension"]), by_asc),
            (r["character"], by_char),
            ((r["character"], int(r["ascension"])), matrix),
        ):
            rec = store.setdefault(key, [0, 0])
            rec[0] += r["runs"]
            rec[1] += r["wins"]

    s = Section("by_ascension")
    for row in live["by_ascension"]:
        rec = by_asc.get(int(row["ascension"]), [0, 0])
        s.count(f"A{row['ascension']} runs", row["runs"], rec[0])
        s.count(f"A{row['ascension']} wins", row["wins"], rec[1])
    worst = max(worst, s.report())

    s = Section("by_character")
    for row in live["by_character"]:
        rec = by_char.get(row["id"], [0, 0])
        s.count(f"{row['id']} runs", row["runs"], rec[0])
        s.count(f"{row['id']} wins", row["wins"], rec[1])
        s.rate(f"{row['id']} share", row["share"], _pct(rec[0], total_runs))
    worst = max(worst, s.report())

    s = Section("ascension_matrix")
    for cid, per_asc in (live.get("ascension_matrix") or {}).items():
        for asc, cell in per_asc.items():
            rec = matrix.get((cid, int(asc)), [0, 0])
            s.count(f"{cid} A{asc} runs", cell["runs"], rec[0])
            s.count(f"{cid} A{asc} wins", cell["wins"], rec[1])
    return max(worst, s.report())


def diff_survival(live: dict) -> float:
    hist: dict[int, int] = {}
    for r in _load("shadow_floors_hist.json"):
        f = min(int(r["floors_reached"]), MAX_REAL_FLOOR)
        hist[f] = hist.get(f, 0) + r["runs"]
    total = sum(hist.values())
    lake_curve = {}
    remaining = total
    for f in range(1, max(hist, default=0) + 1):
        lake_curve[f] = _pct(remaining, total)
        remaining -= hist.get(f, 0)
    s = Section("survival")
    for row in live.get("survival") or []:
        s.rate(f"floor {row['floor']}", row["alive_pct"], lake_curve.get(row["floor"]))
    return s.report()


def diff_map_danger(live: dict) -> float:
    lake: dict[tuple[int, str], dict] = {}
    for r in _load("shadow_map_danger.json"):
        if r["visits"] < 50:
            continue
        lake[(int(r["act"]), r["map_point_type"])] = {
            "visits": r["visits"],
            "avg_dmg_pct": round(r["dmg_sum"] / r["visits"], 1),
            "death_rate": round(r["deaths"] * 100.0 / r["visits"], 2),
        }
    s = Section("map_danger")
    for act_row in live.get("map_danger") or []:
        for ptype, cell in (act_row.get("types") or {}).items():
            lk = lake.get((int(act_row["act"]), ptype))
            if lk is None:
                s.rows.append(
                    (100.0, f"act {act_row['act']} {ptype}: missing from lake")
                )
                continue
            s.count(
                f"act {act_row['act']} {ptype} visits", cell["visits"], lk["visits"]
            )
            s.rate(
                f"act {act_row['act']} {ptype} dmg%",
                cell["avg_dmg_pct"],
                lk["avg_dmg_pct"],
            )
            s.rate(
                f"act {act_row['act']} {ptype} deaths%",
                cell["death_rate"],
                lk["death_rate"],
            )
    return s.report()


def _freshness() -> None:
    meta = _load("shadow_meta.json")[0]
    try:
        from app.services.runs_db_mongo import _get_collection

        n = _get_collection().count_documents({})
        print(
            f"freshness: mongo {n:,} runs vs lake {meta['lake_runs']:,} "
            f"({n - meta['lake_runs']:+,} not yet extracted)"
        )
    except Exception as e:
        print(f"freshness check unavailable: {e}")


def main() -> None:
    live = _fetch_live()
    _freshness()
    worst = max(
        diff_deaths(live),
        diff_char_asc(live),
        diff_survival(live),
        diff_map_danger(live),
    )
    print(
        f"\nVERDICT: worst drift {worst:.2f} "
        f"({'PASS - within fold lag' if worst < 1.0 else 'INVESTIGATE'})"
    )


if __name__ == "__main__":
    main()
