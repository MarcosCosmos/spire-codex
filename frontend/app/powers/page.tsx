import type { Power } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import PowersClient from "./PowersClient";
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
  let count = "260";
  try {
    const stats = await api.getStatsBounded();
    count = String(stats.powers);
  } catch {
    // Fall back to the baseline count if the API is unreachable at build time.
  }
  return buildPageMetadata({
    lang: _lang,
    path: "/powers",
    title: t("Powers", lang),
    description: `All ${count} ${gameName} powers, buffs, debuffs, and neutral effects. Filter by type and stack behavior. Icons and full descriptions.`,
  });
}

export default async function PowersPage({ params }: Props) {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const gameName = LANG_GAME_NAME[lang];
  const prefix = _lang ? `/${_lang}` : "";

  let powers: Power[] = [];
  try {
    const res = await fetch(`${API}/api/powers?lang=${lang}`, { next: { revalidate: 300 } });
    if (res.ok) powers = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home", lang), href: prefix || "/" },
      { name: t("Powers", lang), href: `${prefix}/powers` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} Powers`,
      description: `Browse every power in ${gameName}.`,
      path: `${prefix}/powers`,
      items: powers.map((p) => ({ name: p.name, path: `${prefix}/powers/${p.id.toLowerCase()}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{gameName} {t("Powers", lang)}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {t("powers_tagline", lang)}
      </p>

      <RecentlyAdded entityType="powers" label="Power" pathPrefix={`${prefix}/powers`} />

      <PowersClient initialPowers={powers} />
    </div>
  );
}
