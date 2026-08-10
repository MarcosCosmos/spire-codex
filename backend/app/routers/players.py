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
def player_insights(username: str, request: Request, response: Response):
    """One player's public insights: their runs through the community-stats
    accumulator with community comparison fields (the profile Insights tab,
    public). 404 for unknown usernames and for private profiles - the two
    are indistinguishable on purpose."""
    if not os.environ.get("MONGO_URL", "").strip():
        raise HTTPException(status_code=404, detail="Player not found")

    from ..services.user_insights import get_user_insights
    from ..services.users_db import get_user_by_username

    user = get_user_by_username(username)
    if not user or user.get("profile_private"):
        raise HTTPException(status_code=404, detail="Player not found")

    response.headers["Cache-Control"] = "public, max-age=300"
    data = get_user_insights(str(user["_id"]), username=user.get("username"))
    return {"username": user.get("username"), **data}
