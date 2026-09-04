import type { Metadata } from "next";
import type { Character } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import CharactersClient from "./CharactersClient";
import { buildPageMetadata } from "@/lib/seo";
import {
  getLangOrDefault,
  isValidLang,
  LANG_GAME_NAME,
  LANG_NAMES,
  LANG_HREFLANG,
} from "@/lib/languages";
import { t } from "@/lib/ui-translations";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const CATEGORY = "characters";
const CATEGORY_LABEL = "Characters";

type Props = { params: Promise<{ lang?: string }> };

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const gameName = LANG_GAME_NAME[lang];
  const nativeName = LANG_NAMES[lang];

  const title = _lang ? t(CATEGORY_LABEL, lang) : "Characters - All Playable Characters";
  const description = _lang
    ? `${gameName} ${t(CATEGORY_LABEL, lang)} (${nativeName}). All five playable characters, Ironclad, Silent, Defect, Necrobinder, Regent. Starting decks and stats.`
    : "All five Slay the Spire 2 (sts2) characters, Ironclad, Silent, Defect, Necrobinder, Regent. Starting decks, starter relic, HP, gold, and energy.";

  return buildPageMetadata({
    lang: _lang,
    path: `/${CATEGORY}`,
    title,
    description,
  });
}

export default async function CharactersPage({ params }: Props) {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const prefix = langPrefix(_lang);
  const gameName = LANG_GAME_NAME[lang];
  const nativeName = LANG_NAMES[lang];

  let characters: Character[] = [];
  try {
    const res = await fetch(`${API}/api/${CATEGORY}?lang=${lang}`, { next: { revalidate: 300 } });
    if (res.ok) characters = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      ...(_lang ? [{ name: nativeName, href: prefix }] : []),
      { name: CATEGORY_LABEL, href: `${prefix}/${CATEGORY}` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} ${t(CATEGORY_LABEL, lang)}`,
      description: `All playable characters in ${gameName}.`,
      path: `${prefix}/${CATEGORY}`,
      items: characters.map((c) => ({ name: c.name, path: `/${CATEGORY}/${c.id.toLowerCase()}` })),
      inLanguage: LANG_HREFLANG[lang],
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{gameName} {t(CATEGORY_LABEL, lang)}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {t("characters_tagline", lang)}
      </p>

      <CharactersClient initialCharacters={characters} />
    </div>
  );
}
