"""Response models must not strip fields the parsers ship: FastAPI's
response_model silently drops anything undeclared, which already bit
name_variants and channel once."""

import json
from pathlib import Path

import pytest

from app.models.schemas import Act, Card, Character, Epoch

DATA = Path(__file__).resolve().parents[2] / "data" / "eng"


def test_trivia_stays_removed():
    assert "trivia" not in Card.model_fields


def _first_with(entities, key):
    entity = next((e for e in entities if key in e), None)
    if entity is None:
        pytest.skip(f"no {key} in shipped data")
    return entity


@pytest.mark.parametrize(
    "filename,model,key",
    [
        ("cards.json", Card, "multiplayer_only"),
        ("characters.json", Character, "animation_url"),
        ("epochs.json", Epoch, "image_url"),
        ("acts.json", Act, "index"),
    ],
)
def test_model_keeps_shipped_field(filename, model, key):
    entities = json.loads((DATA / filename).read_text(encoding="utf-8"))
    entity = _first_with(entities, key)
    dumped = model.model_validate(entity).model_dump()
    assert dumped[key] == entity[key]
