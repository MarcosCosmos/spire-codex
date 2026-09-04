import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, isValidLang, LANG_HREFLANG, LANG_GAME_NAME } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import StatsClient from "./StatsClient";
import { fetchInitialStats } from "./fetch-initial-stats";

export const dynamic = "force-dynamic";

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

/** Shared with app/[lang]/leaderboards/stats/page.tsx, which re-exports this directly. */
export async function generateMetadata(
  { params }: { params?: Promise<{ lang?: string }> } = {},
): Promise<Metadata> {
  const lang = (await params)?.lang;
  return buildPageMetadata({
    lang,
    path: "/leaderboards/stats",
    title: t("Stats", getLangOrDefault(lang)),
    description: t("stats_tagline", getLangOrDefault(lang)),
  });
}

export default async function StatsPage({
  params,
}: {
  params?: Promise<{ lang?: string }>;
} = {}) {
  const _lang = (await params)?.lang;
  const lang = getLangOrDefault(_lang);
  const prefix = langPrefix(_lang);
  const gameName = LANG_GAME_NAME[lang];
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home", lang), href: prefix || "/" },
      { name: t("Leaderboards", lang), href: `${prefix}/leaderboards` },
      { name: t("Stats", lang), href: `${prefix}/leaderboards/stats` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} ${t("Stats", lang)}`,
      description: t("stats_tagline", lang),
      path: `${prefix}/leaderboards/stats`,
      inLanguage: LANG_HREFLANG[lang],
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <StatsClient initialStats={await fetchInitialStats()} />
    </>
  );
}
