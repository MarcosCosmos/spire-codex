"""One-turn-boss detection: a boss the run got past in one turn flags, a
turn-1 death at the final boss does not."""

from app.services.cheat_detect import detect_cheats, one_turn_bosses


def _location(room_type: str, turns: int | None, model_id: str = "ENCOUNTER.BOSS_X"):
    room: dict = {"room_type": room_type, "model_id": model_id}
    if turns is not None:
        room["turns_taken"] = turns
    return {"rooms": [room]}


def _act(*locations: dict) -> list[dict]:
    return list(locations)


def test_one_turn_boss_mid_run_flags_even_on_a_loss():
    data = {
        "win": False,
        "map_point_history": [
            _act(_location("monster", 5), _location("boss", 1)),
            _act(_location("monster", 4)),  # the run continued past the boss
        ],
    }
    assert one_turn_bosses(data) == ["one_turn_boss:act1:BOSS_X"]
    assert "one_turn_boss:act1:BOSS_X" in detect_cheats(data)


def test_turn_one_death_at_final_boss_is_clean():
    data = {
        "win": False,
        "map_point_history": [
            _act(_location("monster", 5), _location("boss", 1)),
        ],
    }
    assert one_turn_bosses(data) == []


def test_won_run_counts_its_final_boss():
    data = {
        "win": True,
        "map_point_history": [
            _act(_location("boss", 4)),
            _act(_location("boss", 3)),
            _act(_location("boss", 1, model_id="ENCOUNTER.AEONGLASS_BOSS")),
        ],
    }
    assert one_turn_bosses(data) == ["one_turn_boss:act3:AEONGLASS_BOSS"]


def test_normal_turn_counts_and_non_boss_rooms_are_clean():
    data = {
        "win": True,
        "map_point_history": [
            _act(_location("monster", 1), _location("elite", 1), _location("boss", 2)),
            _act(_location("boss", None)),  # missing turns never flags
            _act(_location("boss", 12)),
        ],
    }
    assert one_turn_bosses(data) == []


def test_coop_card_in_solo_deck_flags():
    from app.services.cheat_detect import coop_cards_in_solo

    data = {"players": [{"deck": [{"id": "CARD.MIDNIGHT"}, {"id": "CARD.STRIKE"}]}]}
    assert coop_cards_in_solo(data, coop_ids=frozenset({"MIDNIGHT"})) == [
        "coop_card_solo:MIDNIGHT"
    ]


def test_coop_card_in_actual_coop_run_is_clean():
    from app.services.cheat_detect import coop_cards_in_solo

    data = {
        "players": [
            {"deck": [{"id": "CARD.MIDNIGHT"}]},
            {"deck": [{"id": "CARD.STRIKE"}]},
        ]
    }
    assert coop_cards_in_solo(data, coop_ids=frozenset({"MIDNIGHT"})) == []


def test_solo_run_without_coop_cards_is_clean():
    from app.services.cheat_detect import coop_cards_in_solo

    data = {"players": [{"deck": [{"id": "CARD.STRIKE"}]}]}
    assert coop_cards_in_solo(data, coop_ids=frozenset({"MIDNIGHT"})) == []


def test_detect_cheats_carries_the_coop_solo_signal(monkeypatch):
    from app.services import run_entity_stats as res

    monkeypatch.setattr(res, "_multiplayer_card_ids", lambda: frozenset({"MIDNIGHT"}))
    data = {"players": [{"deck": [{"id": "card.midnight"}]}]}
    assert "coop_card_solo:MIDNIGHT" in detect_cheats(data)
