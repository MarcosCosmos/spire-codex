"""Beta-only entities are official content (they ship in the Steam beta) and
players submit runs containing them, so the modded-id filters must accept the
beta catalog too - otherwise every new beta card/relic vanishes from the tier
list and metrics until the patch promotes (the v0.110.0 DOWSING_ROD /
NEOWS_SACRIFICE bug). Genuinely modded ids stay filtered: in neither catalog."""

from app.services import data_service, run_entity_stats as res


def _fake_channels(monkeypatch, main_rows, beta_rows):
    def loader():
        if data_service.current_channel.get("stable") == "beta":
            return beta_rows
        return main_rows

    monkeypatch.setattr(data_service, "get_beta_version", lambda: "v9.9.9")
    return loader


def test_official_ids_union_main_and_beta(monkeypatch):
    loader = _fake_channels(
        monkeypatch,
        [{"id": "SOZU"}],
        [{"id": "SOZU"}, {"id": "DOWSING_ROD"}],
    )
    ids = res._official_ids_with_beta(loader)
    assert ids == {"SOZU", "DOWSING_ROD"}


def test_no_beta_version_keeps_main_only(monkeypatch):
    loader = _fake_channels(monkeypatch, [{"id": "SOZU"}], [{"id": "GHOST"}])
    monkeypatch.setattr(data_service, "get_beta_version", lambda: None)
    assert res._official_ids_with_beta(loader) == {"SOZU"}


def test_card_property_sets_see_beta_only_cards(monkeypatch):
    main = [{"id": "REGRET", "color": "curse"}]
    beta = main + [
        {"id": "BETA_CURSE", "color": "curse"},
        {"id": "BETA_COOP", "color": "red", "multiplayer_only": True},
    ]

    def loader():
        return beta if data_service.current_channel.get("stable") == "beta" else main

    monkeypatch.setattr(data_service, "get_beta_version", lambda: "v9.9.9")
    monkeypatch.setattr(data_service, "load_cards", loader)
    monkeypatch.setattr(res, "_excluded_card_ids_cache", None)
    monkeypatch.setattr(res, "_multiplayer_card_ids_cache", None)
    assert "BETA_CURSE" in res._excluded_card_ids()
    assert "BETA_COOP" in res._multiplayer_card_ids()
