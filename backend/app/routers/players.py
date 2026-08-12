"""Public player profile API: the /players/<username> pages.

Serves the same insights blob as the signed-in profile tab, resolved by
username instead of session, for accounts that haven't gone private. Runs
are public by design (leaderboards, run pages); the profile_private flag
only gates this aggregated view."""

import os

from fastapi import APIRouter, HTTPException, Request, Response

from ..dependencies import shared_limiter
from ..services import rate_limit_config

router = APIRouter(prefix="/api/players", tags=["Players"])
limiter = shared_limiter


@router.get("/{username}/insights", tags=["Players"])
@limiter.limit(rate_limit_config.endpoint_limit("players.insights", "30/minute"))
def player_insights(
    username: str,
    request: Request,
    response: Response,
    character: str | None = None,
):
    """One player's public insights: their runs through the community-stats
    accumulator with community comparison fields (the profile Insights tab,
    public). `character` (e.g. IRONCLAD) scopes the view to that character.
    404 for unknown usernames and for private profiles - the two are
    indistinguishable on purpose."""
    if not os.environ.get("MONGO_URL", "").strip():
        raise HTTPException(status_code=404, detail="Player not found")

    from ..services.run_entity_stats import _official_character_ids
    from ..services.user_insights import get_user_insights
    from ..services.users_db import get_user_by_username

    character = (character or "").strip().upper() or None
    if character:
        official = _official_character_ids()
        if official and character not in official:
            raise HTTPException(status_code=400, detail="Unknown character")

    user = get_user_by_username(username)
    if not user or user.get("profile_private"):
        raise HTTPException(status_code=404, detail="Player not found")

    data = get_user_insights(
        str(user["_id"]), username=user.get("username"), character=character
    )
    # Never let the edge cache a building placeholder: CF would pin it for
    # 5 minutes and every viewer's poll loop would spin against it.
    response.headers["Cache-Control"] = (
        "no-store" if data.get("building") else "public, max-age=300"
    )
    return {"username": user.get("username"), **data}
