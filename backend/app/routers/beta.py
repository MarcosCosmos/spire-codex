"""Beta channel endpoints for the unified site (BETA-MIGRATION-PLAN.md).

The channel itself needs no endpoints: every data route serves beta content
when the request carries ?channel=beta or arrives via a beta.* host (see
VersionMiddleware). What lives here is the metadata about the beta branch.
"""

from fastapi import APIRouter, Request
from ..dependencies import shared_limiter
from ..services import rate_limit_config

from ..services.beta_diff import get_beta_diff
from ..services.data_service import get_beta_render_version, get_beta_version

router = APIRouter(prefix="/api/beta", tags=["Beta"])
# client_ip, not slowapi's get_remote_address: behind Cloudflare -> nginx
# the latter reads the proxy address, so every visitor would share ONE
# bucket and these limits would trip fleet-wide (see dependencies.client_ip).
limiter = shared_limiter


@router.get("/diff")
@limiter.limit(rate_limit_config.endpoint_limit("beta.beta_diff", "120/minute"))
def beta_diff(request: Request):
    """What the current beta adds, changes, and removes, per entity type.

    Shape: {beta_version, types: {cards: {added: [ids], changed: {id:
    [fields]}, removed: [ids]}, ...}}. Comparison runs on English catalogs
    with presentation-only fields excluded. This is the single source for
    every BETA badge and changed-in-beta cross-link on the site.
    """
    return get_beta_diff()


@router.get("/version")
@limiter.limit(rate_limit_config.endpoint_limit("beta.beta_version", "120/minute"))
def beta_version(request: Request):
    """The current beta version (from the data-beta latest pointer)."""
    return {
        "beta_version": get_beta_version(),
        "render_version": get_beta_render_version(),
    }
