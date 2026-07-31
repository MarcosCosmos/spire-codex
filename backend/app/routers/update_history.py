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
    """Game-patch changes for one entity, newest first. 404s when nothing is
    recorded, so the frontend can fall back to the changelog timeline."""
    entries = _histories().get(entity_type, {}).get(entity_id.upper())
    if not entries:
        raise HTTPException(
            status_code=404,
            detail=f"No update history for '{entity_type}/{entity_id}'",
        )
    return entries
