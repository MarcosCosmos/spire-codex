"""The full-dump gallery serves CDN-backed categories from the per-version
manifest: capped previews in the listing, paged folder browsing, and search
rows that skip the cross-products and localized card copies."""

import pytest
from fastapi import HTTPException

from app.routers import images

FIXTURE = {
    "cards": ["bash.webp", "zap.webp", "deu/bash.webp", "deu/zap.webp"],
    "animations": [
        "cards/abundance.webp",
        "monsters/byrdonis/idle_loop.webp",
        "monsters/byrdonis/attack.webp",
    ],
    "enchantments-cards": ["adroit/bash.webp"],
}


@pytest.fixture()
def game_dump(monkeypatch):
    monkeypatch.setattr(images, "_game_dumps", lambda: (("v9.9.9", "beta"),))
    monkeypatch.setattr(images, "_game_manifest", lambda v: FIXTURE)
    images._game_folder_index.cache_clear()
    yield
    images._game_folder_index.cache_clear()


def test_listing_entries_have_preview_and_browse(game_dump):
    entries = images._game_category_entries()
    by_id = {e["id"]: e for e in entries}
    cards = by_id["game-cards-v9.9.9"]
    assert cards["name"] == "Card Renders (Beta v9.9.9)"
    assert cards["count"] == 4
    assert cards["browse"] == {"version": "v9.9.9", "category": "cards"}
    assert cards["images"][0]["url"].endswith("/game/v9.9.9/cards/bash.webp")
    # categories with no files in the manifest are omitted entirely
    assert "game-relics-v9.9.9" not in by_id


def test_listing_covers_every_registered_dump(monkeypatch):
    monkeypatch.setattr(
        images, "_game_dumps", lambda: (("v1.0.0", "main"), ("v9.9.9", "beta"))
    )
    monkeypatch.setattr(
        images,
        "_game_manifest",
        lambda v: {"cards": ["strike.webp"]} if v == "v1.0.0" else FIXTURE,
    )
    entries = images._game_category_entries()
    by_id = {e["id"]: e for e in entries}
    assert by_id["game-cards-v1.0.0"]["name"] == "Card Renders (Main v1.0.0)"
    assert by_id["game-cards-v9.9.9"]["count"] == 4
    # main dump listed first
    assert list(by_id)[0] == "game-cards-v1.0.0"


def test_browse_root_and_nested(game_dump):
    root = images.browse_game_category("v9.9.9", "cards")
    assert root["folders"] == ["deu"]
    assert [i["filename"] for i in root["images"]] == ["bash.webp", "zap.webp"]
    nested = images.browse_game_category("v9.9.9", "cards", path="deu")
    assert nested["total"] == 2
    assert nested["images"][0]["url"].endswith("/game/v9.9.9/cards/deu/bash.webp")
    deep = images.browse_game_category("v9.9.9", "animations", path="monsters/byrdonis")
    assert {i["filename"] for i in deep["images"]} == {"idle_loop.webp", "attack.webp"}


def test_browse_paginates(game_dump):
    page = images.browse_game_category("v9.9.9", "cards", offset=1, limit=1)
    assert page["total"] == 2
    assert [i["filename"] for i in page["images"]] == ["zap.webp"]


def test_browse_404s(game_dump):
    for args in (
        ("v0.0.0", "cards"),
        ("v9.9.9", "nope"),
    ):
        with pytest.raises(HTTPException) as exc:
            images.browse_game_category(*args)
        assert exc.value.status_code == 404
    with pytest.raises(HTTPException) as exc:
        images.browse_game_category("v9.9.9", "cards", path="missing")
    assert exc.value.status_code == 404


def test_search_skips_cross_products_and_language_copies(game_dump):
    rows = images._search_game_images(["bash"], budget=10)
    urls = [r["url"] for r in rows]
    # one hit for the English card, none for deu/ copy or the enchant render
    assert len(urls) == 1
    assert urls[0].endswith("/game/v9.9.9/cards/bash.webp")
    assert rows[0]["category_name"] == "Card Renders (Beta v9.9.9)"


def test_search_budget_zero(game_dump):
    assert images._search_game_images(["bash"], budget=0) == []
