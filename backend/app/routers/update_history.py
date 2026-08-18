"""Per-entity game-patch update history, derived entirely from our own
per-patch data diffs (the data-beta changelog archive). English-only."""

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/update-history", tags=["Update History"])


@router.get("/{entity_type}/{entity_id}")
def get_update_history(entity_type: str, entity_id: str):
    """Game-patch changes for one entity, newest first. Every entry is our
    own diff of the shipped game data — no third-party prose. 404s when no
    archived patch touched the entity, so the frontend can fall back to the
    changelog timeline."""
    from ..services.entity_changelog import game_history_entries

    entries = game_history_entries(entity_type, entity_id)
    if not entries:
        raise HTTPException(
            status_code=404,
            detail=f"No update history for '{entity_type}/{entity_id}'",
        )
    return entries
