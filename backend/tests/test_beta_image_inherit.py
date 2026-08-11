"""Beta rows must inherit the stable image_url by id: the beta catalogs ship
image_url null everywhere and the CDN's versioned beta portrait tree is gone,
so without inheritance every beta portrait 404s (broke the Overwolf overlay
on 2026-08-11). Beta-only ids stay null; stable rows must not be mutated."""

from app.services import data_service


def _fake_stable(rows):
    def loader(lang, entity, version):
        return rows

    return loader


def test_null_image_urls_inherit_from_stable_by_id(monkeypatch):
    stable = [
        {
            "id": "MUMMIFIED_HAND",
            "image_url": "/static/images/relics/mummified_hand.webp",
        },
        {"id": "PEN_NIB", "image_url": "/static/images/relics/pen_nib.webp"},
    ]
    monkeypatch.setattr(data_service, "_load_json_versioned", _fake_stable(stable))
    beta = [
        {"id": "MUMMIFIED_HAND", "image_url": None},
        {"id": "BRAND_NEW_BETA_RELIC", "image_url": None},
    ]

    data_service._inherit_stable_image_urls(beta, "eng", "relics")

    assert beta[0]["image_url"] == "/static/images/relics/mummified_hand.webp"
    assert beta[1]["image_url"] is None, "beta-only ids have no art to inherit"
    assert stable[0]["image_url"] == "/static/images/relics/mummified_hand.webp"


def test_rows_without_image_url_key_are_untouched(monkeypatch):
    called = []
    monkeypatch.setattr(
        data_service,
        "_load_json_versioned",
        lambda *a: called.append(a) or [],
    )
    rows = [{"id": "KEYWORD_X", "text": "no image field on this schema"}]

    data_service._inherit_stable_image_urls(rows, "eng", "keywords")

    assert rows == [{"id": "KEYWORD_X", "text": "no image field on this schema"}]
    assert not called, "no stable load when nothing is missing"


def test_present_beta_image_urls_are_kept(monkeypatch):
    stable = [{"id": "CHOMPER", "image_url": "/static/images/monsters/chomper.webp"}]
    monkeypatch.setattr(data_service, "_load_json_versioned", _fake_stable(stable))
    beta = [
        {"id": "CHOMPER", "image_url": "/static/images/monsters/chomper_v2.webp"},
        {"id": "AEONGLASS", "image_url": None},
    ]

    data_service._inherit_stable_image_urls(beta, "eng", "monsters")

    assert beta[0]["image_url"] == "/static/images/monsters/chomper_v2.webp"
