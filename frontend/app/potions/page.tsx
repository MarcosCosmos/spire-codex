import { Suspense } from "react";
import type { Potion } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import HighestRated from "@/app/components/HighestRated";
import PotionsClient from "./PotionsClient";
import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { api } from "@/lib/api";
import { getLangOrDefault, LANG_GAME_NAME } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ lang?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const gameName = LANG_GAME_NAME[lang];
  let count = "63+";
  try {
    const stats = await api.getStatsBounded();
    count = String(stats.potions);
  } catch {
    // Fall back to the baseline count if the API is unreachable at build time.
  }
  return buildPageMetadata({
    lang: _lang,
    path: "/potions",
    title: t("Potions", lang),
    description: `Every ${gameName} potion, all ${count}. Filter by rarity (Common, Uncommon, Rare) and character pool. Effects, shop prices, and use timing.`,
  });
}

export default async function PotionsPage({ params }: Props) {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const gameName = LANG_GAME_NAME[lang];
  const prefix = _lang ? `/${_lang}` : "";

  let potions: Potion[] = [];
  try {
    const res = await fetch(`${API}/api/potions?lang=${lang}`, { next: { revalidate: 300 } });
    if (res.ok) potions = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home", lang), href: prefix || "/" },
      { name: t("Potions", lang), href: `${prefix}/potions` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} Potions`,
      description: "Browse every potion across all character pools.",
      path: `${prefix}/potions`,
      items: potions.map((p) => ({ name: p.name, path: `${prefix}/potions/${p.id.toLowerCase()}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{gameName} {t("Potions", lang)}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {t("potions_tagline", lang)}
      </p>

      <HighestRated
        entityType="potions"
        entities={potions}
        label="potions"
        pathPrefix={`${prefix}/potions`}
        tierHref="/tier-list/potions"
      />

      <RecentlyAdded entityType="potions" label="Potion" pathPrefix={`${prefix}/potions`} />

      <Suspense>
        <PotionsClient initialPotions={potions} />
      </Suspense>
    </div>
  );
}
