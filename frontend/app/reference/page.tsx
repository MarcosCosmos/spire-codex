import type {
  Act,
  Ascension,
  Keyword,
  Orb,
  Affliction,
  Intent,
  Modifier,
  Achievement,
} from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import ReferenceClient from "./ReferenceClient";
import type { ReferenceData } from "./ReferenceClient";
import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_GAME_NAME } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

type Props = { params: Promise<{ lang?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const gameName = LANG_GAME_NAME[lang];
  return buildPageMetadata({
    lang: _lang,
    path: "/reference",
    title: t("Reference", lang),
    description: `${gameName} Reference. Keywords, orbs, afflictions, intents, modifiers, achievements, acts, and ascension levels all in one place.`,
  });
}

const API =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

async function fetchSection<T>(endpoint: string, lang: string): Promise<T[]> {
  try {
    const res = await fetch(`${API}/api/${endpoint}?lang=${lang}`, {
      next: { revalidate: 300 },
    });
    if (res.ok) return await res.json();
  } catch {}
  return [];
}

export default async function ReferencePage({ params }: Props) {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const gameName = LANG_GAME_NAME[lang];
  const prefix = _lang ? `/${_lang}` : "";

  const [acts, ascensions, keywords, orbs, afflictions, intents, modifiers, achievements] =
    await Promise.all([
      fetchSection<Act>("acts", lang),
      fetchSection<Ascension>("ascensions", lang),
      fetchSection<Keyword>("keywords", lang),
      fetchSection<Orb>("orbs", lang),
      fetchSection<Affliction>("afflictions", lang),
      fetchSection<Intent>("intents", lang),
      fetchSection<Modifier>("modifiers", lang),
      fetchSection<Achievement>("achievements", lang),
    ]);

  const data: ReferenceData = {
    acts,
    ascensions,
    keywords,
    orbs,
    afflictions,
    intents,
    modifiers,
    achievements,
  };

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home", lang), href: prefix || "/" },
      { name: t("Reference", lang), href: `${prefix}/reference` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} Reference`,
      description: t("reference_tagline", lang),
      path: `${prefix}/reference`,
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">
          {gameName} {t("Reference", lang)}
        </span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {t("reference_tagline", lang)}
      </p>

      <ReferenceClient initialData={data} />
    </div>
  );
}
