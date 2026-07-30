"""Card API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from ..models.schemas import Card
from ..services.data_service import load_cards, load_translation_maps
from ..dependencies import get_lang, matches_search

router = APIRouter(prefix="/api/cards", tags=["Cards"])


def _matches_cost(card: dict, want: str) -> bool:
    if want == "x":
        return bool(card.get("is_x_cost"))
    if want == "starx":
        return bool(card.get("is_x_star_cost"))
    if want.startswith("star"):
        sc = card.get("star_cost")
        if not isinstance(sc, int):
            return False
        return sc >= 4 if want == "star4plus" else want == f"star{sc}"
    c = card.get("cost")
    if not isinstance(c, int) or c < 0:
        return False
    return c >= 4 if want == "4plus" else want == str(c)


@router.get("", response_model=list[Card])
def get_cards(
    request: Request,
    color: str | None = Query(
        None,
        description="Filter by character color (ironclad, silent, defect, necrobinder, regent, colorless)",
    ),
    type: str | None = Query(
        None, description="Filter by card type (Attack, Skill, Power, Status, Curse)"
    ),
    rarity: str | None = Query(
        None, description="Filter by rarity (Basic, Common, Uncommon, Rare, Ancient)"
    ),
    keyword: str | None = Query(
        None,
        description="Filter by keyword (Exhaust, Innate, Ethereal, Retain, Unplayable, Sly, Eternal)",
    ),
    tag: str | None = Query(
        None, description="Filter by tag (Strike, Defend, Minion, etc.)"
    ),
    spawns: str | None = Query(
        None,
        description="Only cards that create or reference this card id (e.g. SOUL lists every Soul generator)",
    ),
    cost: str | None = Query(
        None,
        description=(
            "Filter by cost: energy as 0, 1, 2, 3, 4plus, or x; star cost "
            "(Regent) as star1, star2, star3, star4plus, or starx"
        ),
    ),
    search: str | None = Query(None, description="Search by name or description"),
    lang: str = Depends(get_lang),
):
    cards = load_cards(lang)
    if color:
        cards = [c for c in cards if c["color"].lower() == color.lower()]
    if type or rarity or keyword:
        maps = load_translation_maps(lang)
    if type:
        type_localized = maps["card_types"].get(type, type)
        cards = [c for c in cards if c["type"] == type_localized]
    if rarity:
        rarity_localized = maps["card_rarities"].get(rarity, rarity)
        cards = [c for c in cards if c["rarity"] == rarity_localized]
    if keyword:
        kw_localized = maps["keywords"].get(keyword.upper(), keyword)
        cards = [
            c for c in cards if c.get("keywords") and kw_localized in c["keywords"]
        ]
    if tag:
        cards = [c for c in cards if c.get("tags") and tag in c["tags"]]
    if spawns:
        want = spawns.strip().upper()
        cards = [c for c in cards if want in (c.get("spawns_cards") or [])]
    if cost:
        want_cost = cost.strip().lower()
        cards = [c for c in cards if _matches_cost(c, want_cost)]
    if search:
        cards = [
            c
            for c in cards
            if matches_search(
                c,
                search,
                [
                    "name",
                    "description",
                    "upgrade_description",
                    "type",
                    "rarity",
                    "color",
                    "keywords",
                ],
            )
        ]
    return cards


@router.get("/{card_id}", response_model=Card)
def get_card(request: Request, card_id: str, lang: str = Depends(get_lang)):
    cards = load_cards(lang)
    for card in cards:
        if card["id"] == card_id.upper():
            return card
    raise HTTPException(status_code=404, detail=f"Card '{card_id}' not found")
