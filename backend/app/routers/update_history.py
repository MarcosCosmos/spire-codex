"""Per-entity game-patch update history from data/entity_history.json
(maintained by tools/entity_history_sync.py). English-only."""

import json
from functools import lru_cache

from fastapi import APIRouter, HTTPException

from ..services.data_service import DATA_DIR

router = APIRouter(prefix="/api/update-history", tags=["Update History"])


@lru_cache(maxsize=1)
def _histories() -> dict[str, dict[str, list]]:
    try:
        with open(DATA_DIR / "entity_history.json", "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {}
    types = data.get("types") if isinstance(data, dict) else None
    return types if isinstance(types, dict) else {}


@router.get("/{entity_type}/{entity_id}")
def get_update_history(entity_type: str, entity_id: str):
    """Game-patch changes for one entity, newest first. Wiki-sourced entries
    first-class, topped up with our own per-patch diff entries for versions
    the wiki hasn't documented yet (it lags each patch by days, which froze
    every history at the wiki's newest covered version). 404s when neither
    source has anything, so the frontend can fall back to the changelog
    timeline."""
    from ..services.entity_changelog import game_history_entries, version_key

    wiki = _histories().get(entity_type, {}).get(entity_id.upper()) or []
    game = game_history_entries(entity_type, entity_id)
    if wiki:
        newest_wiki = max((version_key(e.get("version")) for e in wiki), default=())
        game = [e for e in game if version_key(e.get("version")) > newest_wiki]
    entries = game + wiki
    if not entries:
        raise HTTPException(
            status_code=404,
            detail=f"No update history for '{entity_type}/{entity_id}'",
        )
    return entries
