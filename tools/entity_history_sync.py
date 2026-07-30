"""Sync per-entity game-patch update histories into data/entity_history.json.

Pulls the templated "Update History" tables from the community wiki's
MediaWiki API for every entity type that has pages there (cards, relics,
monsters, events, powers, orbs, ...), joins patch type/date from the Cargo
Patches table, and writes one JSON keyed by entity type and id. Types or
entities without a page are simply absent; the site falls back to the
changelog-derived timeline for those.

Usage: python tools/entity_history_sync.py [--out data/entity_history.json]
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

API = "https://slaythespire.wiki.gg/api.php"
NAMESPACE = "Slay the Spire 2"
USER_AGENT = "spire-codex.com entity history sync (im@ptrlrd.com)"
BATCH = 50

REPO = Path(__file__).resolve().parent.parent

# Category names identify the page's entity type, so a name shared across
# types (e.g. the Accelerant card vs the Accelerant power) can't attach the
# wrong page's history. Pages with no recognized category are accepted.
TYPES: dict[str, dict] = {
    "cards": {"file": "cards.json", "categories": {"Cards"}},
    "relics": {"file": "relics.json", "categories": {"Relics"}},
    "potions": {"file": "potions.json", "categories": {"Potions"}},
    "monsters": {
        "file": "monsters.json",
        "categories": {"Monsters", "Elites", "Bosses", "Ancients"},
    },
    "encounters": {
        "file": "encounters.json",
        "categories": {"Monsters", "Elites", "Bosses", "Ancients", "Events"},
    },
    # The named story events are the Ancients themselves (Neow, Darv, ...),
    # so their pages carry the Ancients category, not Events.
    "events": {"file": "events.json", "categories": {"Events", "Ancients"}},
    "powers": {
        "file": "powers.json",
        "categories": {"Game Mechanics", "Buffs", "Debuffs", "Powers"},
    },
    "orbs": {"file": "orbs.json", "categories": {"Orbs"}},
    "keywords": {"file": "keywords.json", "categories": {"Game Mechanics", "Keywords"}},
    "enchantments": {
        "file": "enchantments.json",
        "categories": {"Enchantments", "Game Mechanics"},
    },
    "characters": {
        "file": "characters.json",
        "categories": {"Character", "Characters"},
    },
}

KNOWN_CATEGORIES: set[str] = set().union(*(t["categories"] for t in TYPES.values()))


def api_get(params: dict) -> dict:
    params = {**params, "format": "json"}
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def fetch_patch_index() -> dict[str, dict]:
    """Version -> {type, date}; first row per version wins."""
    data = api_get(
        {
            "action": "cargoquery",
            "tables": "Patches",
            "fields": "Version,Type,ReleaseDate",
            "where": 'Sequel="2"',
            "limit": "500",
        }
    )
    index: dict[str, dict] = {}
    for row in data.get("cargoquery", []):
        t = row["title"]
        index.setdefault(t["Version"], {"type": t["Type"], "date": t["ReleaseDate"]})
    return index


def fetch_pages(titles: list[str]) -> dict[str, dict]:
    """Title -> {"text": wikitext, "categories": set} for existing pages."""
    data = api_get(
        {
            "action": "query",
            "prop": "revisions|categories",
            "rvprop": "content",
            "rvslots": "main",
            "cllimit": "max",
            "redirects": "1",
            "titles": "|".join(titles),
        }
    )
    query = data.get("query", {})
    redirect_map = {r["from"]: r["to"] for r in query.get("redirects", [])}
    normalized = {n["from"]: n["to"] for n in query.get("normalized", [])}
    by_title: dict[str, dict] = {}
    for page in query.get("pages", {}).values():
        if "revisions" not in page:
            continue
        by_title[page["title"]] = {
            "text": page["revisions"][0]["slots"]["main"]["*"],
            "categories": {
                c["title"].removeprefix("Category:") for c in page.get("categories", [])
            },
        }
    out: dict[str, dict] = {}
    for title in titles:
        resolved = normalized.get(title, title)
        resolved = redirect_map.get(resolved, resolved)
        if resolved in by_title:
            out[title] = by_title[resolved]
    return out


def split_template_args(body: str) -> list[str]:
    """Split template arg string on top-level pipes, respecting {{ }} and [[ ]]."""
    args, depth, current = [], 0, []
    i = 0
    while i < len(body):
        two = body[i : i + 2]
        if two in ("{{", "[["):
            depth += 1
            current.append(two)
            i += 2
        elif two in ("}}", "]]"):
            depth -= 1
            current.append(two)
            i += 2
        elif body[i] == "|" and depth == 0:
            args.append("".join(current))
            current = []
            i += 1
        else:
            current.append(body[i])
            i += 1
    args.append("".join(current))
    return args


TEMPLATE_RE = re.compile(r"\{\{([^{}|]+)(?:\|((?:[^{}]|\{\{[^{}]*\}\})*))?\}\}")


def clean_wikitext(text: str) -> str:
    """Flatten inline wiki markup to plain text."""
    prev = None
    while prev != text:
        prev = text
        text = TEMPLATE_RE.sub(_template_text, text)
    text = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]|]*)\]\]", r"\1", text)
    text = text.replace("'''", "").replace("''", "")
    text = re.sub(r"<[^>]+>", "", text)
    return text


def _template_text(match: re.Match) -> str:
    name = match.group(1).strip().lower()
    args = split_template_args(match.group(2) or "")
    positional = [a for a in args if "=" not in a.split("{{")[0].split("[[")[0]]
    if name == "tooltip":
        return positional[0].strip() if positional else ""
    if positional:
        return positional[0].strip()
    return ""


ROW_RE = re.compile(r"\{\{Update History Table/row\s*\|", re.IGNORECASE)


def parse_history(wikitext: str) -> list[dict]:
    """Extract rows from the Update History section of a page."""
    rows = []
    for match in ROW_RE.finditer(wikitext):
        start = match.end()
        depth, i = 1, start
        while i < len(wikitext) and depth:
            if wikitext[i : i + 2] == "{{":
                depth += 1
                i += 2
            elif wikitext[i : i + 2] == "}}":
                depth -= 1
                i += 2
            else:
                i += 1
        body = wikitext[start : i - 2]
        args = split_template_args(body)
        positional = [a for a in args if not re.match(r"\s*\w+\s*=", a)]
        if len(positional) < 2:
            continue
        version = positional[0].strip()
        changes = [
            re.sub(r"^\*+\s*", "", clean_wikitext(line)).strip()
            for line in positional[1].splitlines()
            if line.strip().lstrip("*").strip()
        ]
        overrides = {
            k.strip().lower(): v.strip()
            for k, v in (a.split("=", 1) for a in args if re.match(r"\s*\w+\s*=", a))
        }
        rows.append(
            {
                "version": None if version == "?" else version,
                "changes": [c for c in changes if c],
                "overrides": overrides,
            }
        )
    return rows


def load_entities(file_name: str) -> list[dict]:
    data = json.loads((REPO / "data" / "eng" / file_name).read_text("utf-8"))
    items = data if isinstance(data, list) else list(data.values())
    return [i for i in items if isinstance(i, dict) and i.get("id") and i.get("name")]


def title_candidates(entity_type: str, entity: dict, dup_names: set[str]) -> list[str]:
    """Wiki page titles to try for an entity, most specific first."""
    name = entity["name"]
    candidates = []
    if entity_type == "cards" and name in dup_names:
        # Shared starter names resolve to per-character pages.
        candidates.append(f"{name} ({entity.get('color', '').title()})")
    candidates.append(name)
    if name.startswith("The "):
        candidates.append(name.removeprefix("The "))
    return [f"{NAMESPACE}:{c}" for c in candidates]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(REPO / "data" / "entity_history.json"))
    args = parser.parse_args()

    patch_index = fetch_patch_index()
    print(f"{len(patch_index)} patches")

    # (type, id) -> candidate titles, plus the global unique title list.
    wanted: dict[str, list[tuple[str, str]]] = {}
    candidates_by_entity: dict[tuple[str, str], list[str]] = {}
    for entity_type, spec in TYPES.items():
        try:
            entities = load_entities(spec["file"])
        except OSError:
            continue
        names = [e["name"] for e in entities]
        dup_names = {n for n in names if names.count(n) > 1}
        for entity in entities:
            key = (entity_type, entity["id"])
            titles = title_candidates(entity_type, entity, dup_names)
            candidates_by_entity[key] = titles
            for title in titles:
                wanted.setdefault(title, []).append(key)

    titles = list(wanted)
    pages: dict[str, dict] = {}
    for offset in range(0, len(titles), BATCH):
        chunk = titles[offset : offset + BATCH]
        pages.update(fetch_pages(chunk))
        print(f"  fetched {min(offset + BATCH, len(titles))}/{len(titles)}")
        time.sleep(1)

    histories: dict[str, dict[str, list]] = {}
    skipped_wrong_type: list[str] = []
    for (entity_type, entity_id), candidates in candidates_by_entity.items():
        expected = TYPES[entity_type]["categories"]
        for title in candidates:
            page = pages.get(title)
            if page is None:
                continue
            cats = page["categories"] & KNOWN_CATEGORIES
            if cats and not (cats & expected):
                skipped_wrong_type.append(f"{entity_type}/{entity_id} -> {title}")
                continue
            rows = parse_history(page["text"])
            if not rows:
                break
            entries = []
            for row in rows:
                patch = patch_index.get(row["version"] or "", {})
                entries.append(
                    {
                        "version": row["version"],
                        "type": row["overrides"].get("type") or patch.get("type"),
                        "date": row["overrides"].get("date") or patch.get("date"),
                        "changes": row["changes"],
                    }
                )
            # Hand-edited tables aren't reliably ordered; guarantee newest
            # first, undated rows last.
            entries.sort(key=lambda e: e["date"] or "", reverse=True)
            histories.setdefault(entity_type, {})[entity_id] = entries
            break

    out = {
        "_meta": {"fetched": date.today().isoformat()},
        "types": histories,
    }
    Path(args.out).write_text(
        json.dumps(out, ensure_ascii=False, indent=1) + "\n", "utf-8"
    )
    counts = {t: len(v) for t, v in histories.items()}
    print(f"wrote {args.out}: {counts}")
    if skipped_wrong_type:
        print(f"skipped wrong-type pages ({len(skipped_wrong_type)}):")
        for line in skipped_wrong_type[:20]:
            print(f"  {line}")


if __name__ == "__main__":
    main()
