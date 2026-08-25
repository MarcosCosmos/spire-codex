"""The snapshot walk wraps every accumulate() call in try/except, so a
signature drift fails SILENTLY and empties that blob for a whole rebuild.

That happened for real: PR #867 renamed charts_stats.accumulate's `submitted`
keyword to `played` but left the walk passing `submitted=`, so every run threw
TypeError, the walk logged a warning per run, and all 14 blob-backed charts
served empty series for days.

Rather than restate the walk's keywords here (which would drift with it),
these tests read the ACTUAL call sites out of run_entity_stats.py and bind
them against each accumulator's real signature."""

import ast
import inspect
from pathlib import Path

from app.services import charts_stats, community_stats, encounter_stats
from app.services import run_entity_stats

ACCUMULATORS = {
    "charts_stats": charts_stats,
    "community_stats": community_stats,
    "encounter_stats": encounter_stats,
}


def _call_sites(source: str, module_name: str) -> list[tuple[int, list[str]]]:
    """(positional count, keyword names) for each `<module>.accumulate(...)`."""
    tree = ast.parse(source)
    found = []
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "accumulate"
            and isinstance(node.func.value, ast.Name)
            and node.func.value.id == module_name
        ):
            found.append((len(node.args), [kw.arg for kw in node.keywords if kw.arg]))
    return found


def test_walk_call_sites_bind_to_accumulator_signatures():
    source = Path(inspect.getfile(run_entity_stats)).read_text(encoding="utf-8")
    for module_name, module in ACCUMULATORS.items():
        sites = _call_sites(source, module_name)
        assert sites, f"no {module_name}.accumulate call found in the walk"
        sig = inspect.signature(module.accumulate)
        for n_positional, keywords in sites:
            # Raises TypeError on a renamed, removed, or missing keyword.
            sig.bind(*([{}] * n_positional), **dict.fromkeys(keywords))


def test_charts_accumulate_actually_folds_a_run():
    blob = {
        "game_mode": "standard",
        "run_time": 900,
        "players": [{"deck": [{"id": "CARD.STRIKE"}] * 12, "relics": []}],
        "map_point_history": [
            [
                {
                    "rooms": [
                        {
                            "room_type": "monster",
                            "model_id": "ENCOUNTER.JAW_WORM",
                            "turns_taken": 4,
                        }
                    ],
                    "player_stats": [
                        {"damage_taken": 7, "current_hp": 60, "max_hp": 80}
                    ],
                }
            ]
        ],
    }
    acc = charts_stats.new_accumulator()
    charts_stats.accumulate(
        acc,
        blob,
        brackets=["all"],
        is_win=True,
        character="IRONCLAD",
        player_count=1,
        played="2026-08-20T10:00:00",
    )
    out = charts_stats.finalize(acc)["all"]
    # Something must land: an empty result here is the silent-failure mode.
    assert any(out.get(k) for k in out), "charts accumulator produced nothing"
