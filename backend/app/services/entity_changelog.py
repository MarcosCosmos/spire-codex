"""Per-entity Version-history entries derived from the game-version diff
changelogs (data-beta/<version>/changelogs/*.json, the per-patch archive).

The site's only Version-history source: every entry is a diff of the shipped
game data itself, so entries land the moment an ingest merges and no
third-party prose ever appears on entity pages."""

import json
import re
from functools import lru_cache

from .data_service import BETA_DATA_DIR

# Noise in a player-facing history entry: raw template text, ordering
# ripples, and art paths.
_SKIP_FIELDS = {
    "description_raw",
    "compendium_order",
    "sort_order",
    "era_position",
    "image_url",
    "beta_image_url",
}
# Game markup ([gold]..[/gold], [energy:1]) and template vars ({Damage:...})
# render as literal text in the history list, so strip them here.
_MARKUP_RE = re.compile(r"\[/?[a-zA-Z_]+(?::[^\]]*)?\]|\{[^}]*\}")


def version_key(version: str | None) -> tuple[int, ...]:
    """Sortable key for "V0.111.0" / "v0.111.0" / "0.111.0" style strings."""
    return tuple(int(n) for n in re.findall(r"\d+", version or ""))


def _clean(value) -> str:
    text = _MARKUP_RE.sub("", str(value if value is not None else "none"))
    return re.sub(r"\s+", " ", text).strip() or "none"


@lru_cache(maxsize=1)
def load_game_changelogs() -> list[dict]:
    """Every per-patch diff changelog, deduped by game version (the `latest`
    symlink doubles one dir), newest first. Cached for the process lifetime —
    the files only change on deploy, which restarts the workers."""
    by_version: dict[str, dict] = {}
    for path in sorted(BETA_DATA_DIR.glob("*/changelogs/*.json")):
        try:
            with open(path, "r", encoding="utf-8") as f:
                log = json.load(f)
        except (OSError, ValueError):
            continue
        version = str(log.get("game_version") or "").strip()
        if version:
            by_version[version] = log
    return [by_version[v] for v in sorted(by_version, key=version_key, reverse=True)]


def game_history_entries(entity_type: str, entity_id: str) -> list[dict]:
    """Update-history rows (same shape as the wiki entries: version / type /
    date / changes[str]) for one entity across every archived patch diff,
    newest first."""
    target_type = entity_type.lower()
    target_id = entity_id.upper()
    out: list[dict] = []
    for log in load_game_changelogs():
        version = str(log.get("game_version") or "")
        head = {
            "version": f"V{version}",
            "type": "Beta Patch",
            "date": log.get("date"),
        }
        for cat in log.get("categories", []):
            if str(cat.get("id", "")).lower() != target_type:
                continue
            for item in cat.get("added", []):
                if str(item.get("id", "")).upper() == target_id:
                    out.append({**head, "changes": ["Added."]})
            for item in cat.get("removed", []):
                if str(item.get("id", "")).upper() == target_id:
                    out.append({**head, "changes": ["Removed."]})
            for item in cat.get("changed", []):
                if str(item.get("id", "")).upper() != target_id:
                    continue
                changes = []
                for ch in item.get("changes", []):
                    field = str(ch.get("field", ""))
                    if field in _SKIP_FIELDS:
                        continue
                    label = field.replace("_", " ").capitalize()
                    changes.append(
                        f"{label}: {_clean(ch.get('old'))} → {_clean(ch.get('new'))}"
                    )
                if changes:
                    out.append({**head, "changes": changes})
    return out
