import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import StatsClient from "@/app/leaderboards/stats/StatsClient";
import { fetchInitialStats } from "@/app/leaderboards/stats/fetch-initial-stats";
import { isValidLang, LANG_HREFLANG, type LangCode, LANG_GAME_NAME } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

export const dynamic = "force-dynamic";

export { generateMetadata } from "@/app/leaderboards/stats/page";

export default async function LangStatsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home", lang), href: `/${lang}` },
      { name: t("Leaderboards", lang), href: `/${lang}/leaderboards` },
      { name: t("Stats", lang), href: `/${lang}/leaderboards/stats` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} ${t("Stats", lang)}`,
      description: t("stats_tagline", lang),
      path: `/${lang}/leaderboards/stats`,
      inLanguage: LANG_HREFLANG[langCode],
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <StatsClient initialStats={await fetchInitialStats()} />
    </>
  );
}
