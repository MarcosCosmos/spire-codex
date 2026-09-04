import { Suspense } from "react";
import type { Metadata } from "next";
import type { Encounter } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import EncountersClient from "./EncountersClient";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import { buildPageMetadata } from "@/lib/seo";
import { api } from "@/lib/api";
import {
  getLangOrDefault,
  isValidLang,
  LANG_GAME_NAME,
  LANG_NAMES,
  LANG_HREFLANG,
} from "@/lib/languages";
import { t } from "@/lib/ui-translations";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const CATEGORY = "encounters";
const CATEGORY_LABEL = "Encounters";

type Props = { params: Promise<{ lang?: string }> };

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const gameName = LANG_GAME_NAME[lang];
  const nativeName = LANG_NAMES[lang];

  let title: string;
  let description: string;
  if (_lang) {
    title = t(CATEGORY_LABEL, lang);
    description = `${gameName} ${t(CATEGORY_LABEL, lang)} (${nativeName}). Every combat encounter, normal fights, elites, and bosses with monster compositions and act placement.`;
  } else {
    let count = "87";
    try {
      const stats = await api.getStatsBounded();
      count = String(stats.encounters);
    } catch {
      // Fall back to the baseline count if the API is unreachable at build time.
    }
    title = "Encounters - All Combat Encounters";
    description = `All ${count} Slay the Spire 2 (sts2) encounters, normal fights, elites, and bosses. Monster compositions, act placement, and room types.`;
  }

  return buildPageMetadata({
    lang: _lang,
    path: `/${CATEGORY}`,
    title,
    description,
  });
}

export default async function EncountersPage({ params }: Props) {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const prefix = langPrefix(_lang);
  const gameName = LANG_GAME_NAME[lang];
  const nativeName = LANG_NAMES[lang];

  let encounters: Encounter[] = [];
  try {
    const res = await fetch(`${API}/api/${CATEGORY}?lang=${lang}`, { next: { revalidate: 300 } });
    if (res.ok) encounters = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      ...(_lang ? [{ name: nativeName, href: prefix }] : []),
      { name: CATEGORY_LABEL, href: `${prefix}/${CATEGORY}` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} ${t(CATEGORY_LABEL, lang)}`,
      description: `Browse every combat encounter in ${gameName}.`,
      path: `${prefix}/${CATEGORY}`,
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
        {t("encounters_tagline", lang)}
      </p>

      <RecentlyAdded entityType="encounters" label="Encounter" pathPrefix={`${prefix}/encounters`} />

      <Suspense>
        <EncountersClient initialEncounters={encounters} />
      </Suspense>
    </div>
  );
}
