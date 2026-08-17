"""Submit-time cheated-run detection.

Three high-confidence signals, all from real cheated submissions:
stacked copies of one relic (a savegame editor artifact; 21x Infused Core),
boss-teleport wins where an act's visited path is a floor or two instead
of the ~16 a real act takes, and boss fights cleared in a single turn.
Flagged runs are stored hidden with a reason so they never enter
leaderboards or stats but stay inspectable in the admin console."""

from __future__ import annotations

# Tezcatara's Toy Box legitimately grants 5 wax relics, so the ceiling for
# copies of a single relic id sits above that.
MAX_RELIC_COPIES = 5

# A completed act's visited path is ~16 floors; the teleport cheat shows 1.
MIN_ACT_FLOORS = 8

# Fastest conceivable legitimate win is well past this; a 51-second "win"
# from a savegame edit is not.
MIN_WIN_SECONDS = 300


def _bare(raw: str) -> str:
    parts = str(raw or "").split(".")
    return parts[-1] if parts else ""


def one_turn_bosses(data: dict) -> list[str]:
    """Boss rooms this run got PAST in a single turn — no legitimate build
    does that. Dying (or abandoning) on turn 1 of a boss is legitimate, so
    the run's final location only counts on a win; every earlier boss room
    was necessarily cleared for the run to continue. Also used by the
    rehide backfill, which feeds it a stored doc's projection instead of a
    full submission blob."""
    locations: list[tuple[int, dict]] = []
    for i, act in enumerate(data.get("map_point_history") or []):
        for fl in act or []:
            if isinstance(fl, dict) and fl.get("rooms"):
                locations.append((i, fl))
    win = bool(data.get("win"))
    reasons: list[str] = []
    for pos, (i, fl) in enumerate(locations):
        if not win and pos == len(locations) - 1:
            continue
        for room in fl.get("rooms") or []:
            if not isinstance(room, dict):
                continue
            if (room.get("room_type") or "").lower() != "boss":
                continue
            turns = room.get("turns_taken")
            if isinstance(turns, (int, float)) and turns == 1:
                enc = _bare(str(room.get("model_id") or "")).upper() or "UNKNOWN"
                reasons.append(f"one_turn_boss:act{i + 1}:{enc}")
    return reasons


def detect_cheats(data: dict) -> list[str]:
    """Reasons this submission looks cheated; empty list = clean."""
    reasons: list[str] = []
    for p in data.get("players") or []:
        counts: dict[str, int] = {}
        for r in p.get("relics") or []:
            rid = _bare((r or {}).get("id", "")).upper()
            if rid:
                counts[rid] = counts.get(rid, 0) + 1
        for rid, n in counts.items():
            if n > MAX_RELIC_COPIES:
                reasons.append(f"duplicate_relics:{rid}x{n}")
    if data.get("win"):
        run_time = data.get("run_time") or 0
        if 0 < run_time < MIN_WIN_SECONDS:
            reasons.append(f"impossible_time:{int(run_time)}s")
        acts = data.get("map_point_history") or []
        boss_acts = 0
        for i, act in enumerate(acts):
            floors = act or []
            has_boss = any(
                (room.get("room_type") or "").lower() == "boss"
                for fl in floors
                if isinstance(fl, dict)
                for room in fl.get("rooms") or []
                if isinstance(room, dict)
            )
            if has_boss:
                boss_acts += 1
                if len(floors) < MIN_ACT_FLOORS:
                    reasons.append(f"boss_teleport:act{i + 1}:{len(floors)}floors")
        # A standard win goes through all three act bosses; a history with
        # fewer is a savegame edit that skipped ahead. Gated to standard mode
        # so a future short game mode can't false-positive.
        if (
            acts
            and boss_acts < 3
            and str(data.get("game_mode") or "standard").lower() == "standard"
        ):
            reasons.append(f"missing_acts:{boss_acts}of3bosses")
    reasons.extend(one_turn_bosses(data))
    return reasons
