"""Every router must use the one shared per-IP limiter, and it must be
endpoint-scoped: slowapi's default key_style="url" buckets per concrete
URL, so caps on parameterized routes (/shared/{run_hash}, /stats/{type}/{id})
never actually bit."""

import importlib

import pytest

from app.dependencies import shared_limiter

ROUTERS = [
    "auth",
    "auth_discord",
    "auth_patreon",
    "auth_steam",
    "auth_twitch",
    "beta",
    "charts",
    "exports",
    "feedback",
    "guides",
    "qa_feedback",
    "runs",
    "uninstall",
]


def test_shared_limiter_is_endpoint_scoped():
    assert shared_limiter._key_style == "endpoint"


@pytest.mark.parametrize("name", ROUTERS)
def test_router_uses_shared_limiter(name):
    mod = importlib.import_module(f"app.routers.{name}")
    assert mod.limiter is shared_limiter
