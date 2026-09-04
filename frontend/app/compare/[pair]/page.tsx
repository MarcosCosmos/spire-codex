import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import type { Character, Card } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd } from "@/lib/jsonld";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, isValidLang, LANG_GAME_NAME, LANG_HREFLANG } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import CompareDetail from "./CompareDetail";

export const dynamic = "force-static";
export const revalidate = 3600;

const API_INTERNAL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const CHARACTERS = ["ironclad", "silent", "defect", "necrobinder", "regent"];

const CHAR_NAMES: Record<string, string> = {
  ironclad: "Ironclad",
  silent: "Silent",
  defect: "Defect",
  necrobinder: "Necrobinder",
  regent: "Regent",
};

const CHAR_COLORS: Record<string, string> = {
  ironclad: "Red",
  silent: "Green",
  defect: "Blue",
  necrobinder: "Purple",
  regent: "Orange",
};

function parsePair(pair: string): { a: string; b: string } | null {
  const match = pair.match(/^(\w+)-vs-(\w+)$/);
  if (!match) return null;
  const a = match[1];
  const b = match[2];
  if (!CHARACTERS.includes(a) || !CHARACTERS.includes(b) || a === b) return null;
  return { a, b };
}

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

type Props = { params: Promise<{ lang?: string; pair: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang, pair } = await params;
  const lang = getLangOrDefault(_lang);
  const parsed = parsePair(pair);
  if (!parsed) return { title: "Comparison Not Found" };

  const gameName = LANG_GAME_NAME[lang];
  const nameA = CHAR_NAMES[parsed.a];
  const nameB = CHAR_NAMES[parsed.b];
  const title = `${nameA} vs ${nameB} - Character Comparison`;
  const description = `Compare ${nameA} and ${nameB} in ${gameName}. Side-by-side stats, card pool breakdowns by type and rarity, keyword distributions, and starting decks.`;

  return buildPageMetadata({
    lang: _lang,
    path: `/compare/${pair}`,
    title,
    description,
    ogType: "article",
  });
}

async function fetchCharacterAndCards(
  charId: string,
  lang: string,
): Promise<{ character: Character; cards: Card[] } | null> {
  try {
    const [charRes, cardsRes] = await Promise.all([
      fetch(`${API_INTERNAL}/api/characters/${charId}?lang=${lang}`, { next: { revalidate: 300 } }),
      fetch(`${API_INTERNAL}/api/cards?color=${charId}&lang=${lang}`, {
        next: { revalidate: 300 },
      }),
    ]);
    if (!charRes.ok) return null;
    const character: Character = await charRes.json();
    const cards: Card[] = cardsRes.ok ? await cardsRes.json() : [];
    return { character, cards };
  } catch {
    return null;
  }
}

export default async function Page({ params }: Props) {
  const { lang: _lang, pair } = await params;
  const lang = getLangOrDefault(_lang);
  const prefix = langPrefix(_lang);
  const parsed = parsePair(pair);

  // Invalid pair slug → 308 back to the (possibly localized) /compare hub.
  // The slug grammar is strictly `{charA}-vs-{charB}` from a fixed set of
  // five characters, so anything else is a stale URL we'd rather forward
  // equity from.
  if (!parsed) {
    permanentRedirect(`${prefix}/compare`);
  }

  const [dataA, dataB] = await Promise.all([
    fetchCharacterAndCards(parsed.a, lang),
    fetchCharacterAndCards(parsed.b, lang),
  ]);

  const nameA = CHAR_NAMES[parsed.a];
  const nameB = CHAR_NAMES[parsed.b];
  const gameName = LANG_GAME_NAME[lang];

  let jsonLd = null;
  if (dataA && dataB) {
    jsonLd = buildDetailPageJsonLd({
      name: `${nameA} vs ${nameB}`,
      description: `Side-by-side comparison of ${nameA} and ${nameB} in ${gameName}.`,
      path: `${prefix}/compare/${pair}`,
      category: "Character Comparison",
      breadcrumbs: [
        { name: t("Home", lang), href: prefix || "/" },
        { name: t("Compare", lang), href: `${prefix}/compare` },
        { name: `${nameA} vs ${nameB}`, href: `${prefix}/compare/${pair}` },
      ],
      inLanguage: LANG_HREFLANG[lang],
    });
  }

  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <CompareDetail
        pairSlug={pair}
        initialCharA={dataA?.character ?? null}
        initialCharB={dataB?.character ?? null}
        initialCardsA={dataA?.cards ?? []}
        initialCardsB={dataB?.cards ?? []}
      />
    </>
  );
}
