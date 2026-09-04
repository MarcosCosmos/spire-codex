import { Suspense } from "react";
import type { Monster } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import MonstersClient from "./MonstersClient";
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
  let count = "111";
  try {
    const stats = await api.getStatsBounded();
    count = String(stats.monsters);
  } catch {
    // Fall back to the baseline count if the API is unreachable at build time.
  }
  return buildPageMetadata({
    lang: _lang,
    path: "/monsters",
    title: t("Monsters", lang),
    description: `All ${count} ${gameName} monsters, normals, elites, and bosses. HP ranges, attack patterns, innate powers, and ascension scaling.`,
  });
}

export default async function MonstersPage({ params }: Props) {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const gameName = LANG_GAME_NAME[lang];
  const prefix = _lang ? `/${_lang}` : "";

  let monsters: Monster[] = [];
  try {
    const res = await fetch(`${API}/api/monsters?lang=${lang}`, { next: { revalidate: 300 } });
    if (res.ok) monsters = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home", lang), href: prefix || "/" },
      { name: t("Monsters", lang), href: `${prefix}/monsters` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} Monsters`,
      description: `Browse every monster in ${gameName}.`,
      path: `${prefix}/monsters`,
      items: monsters.map((m) => ({ name: m.name, path: `${prefix}/monsters/${m.id.toLowerCase()}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{gameName} {t("Monsters", lang)}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {t("monsters_tagline", lang)}
      </p>

      <RecentlyAdded entityType="monsters" label="Monster" pathPrefix={`${prefix}/monsters`} />

      <Suspense>
        <MonstersClient initialMonsters={monsters} />
      </Suspense>
    </div>
  );
}
