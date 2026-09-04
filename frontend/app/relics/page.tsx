import { Suspense } from "react";
import type { Relic } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import HighestRated from "@/app/components/HighestRated";
import RelicsClient from "./RelicsClient";
import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { api } from "@/lib/api";
import { getLangOrDefault, LANG_GAME_NAME, LANG_RELICS } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ lang?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const gameName = LANG_GAME_NAME[lang];
  const relicsWord = LANG_RELICS[lang];
  let count = "289+";
  try {
    const stats = await api.getStatsBounded();
    count = String(stats.relics);
  } catch {
    // Fall back to the baseline count if the API is unreachable at build time.
  }
  return buildPageMetadata({
    lang: _lang,
    path: "/relics",
    title: relicsWord,
    description: `Every ${gameName} relic, all ${count}. Filter by rarity (Common to Ancient) and character pool. Effects, flavor text, and shop prices.`,
  });
}

export default async function RelicsPage({ params }: Props) {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const gameName = LANG_GAME_NAME[lang];
  const relicsWord = LANG_RELICS[lang];
  const prefix = _lang ? `/${_lang}` : "";

  let relics: Relic[] = [];
  try {
    const res = await fetch(`${API}/api/relics?lang=${lang}`, { next: { revalidate: 300 } });
    if (res.ok) relics = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home", lang), href: prefix || "/" },
      { name: relicsWord, href: `${prefix}/relics` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} ${relicsWord}`,
      description: "Browse every relic across all rarities and character pools.",
      path: `${prefix}/relics`,
      items: relics.map((r) => ({ name: r.name, path: `${prefix}/relics/${r.id.toLowerCase()}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{gameName} {relicsWord}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {t("relics_tagline", lang)}
      </p>

      <HighestRated
        entityType="relics"
        entities={relics}
        label="relics"
        pathPrefix={`${prefix}/relics`}
        tierHref="/tier-list/relics"
      />

      <RecentlyAdded entityType="relics" label="Relic" pathPrefix={`${prefix}/relics`} />

      <Suspense>
        <RelicsClient initialRelics={relics} />
      </Suspense>
    </div>
  );
}
