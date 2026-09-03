import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import MetricsClient from "@/app/leaderboards/metrics/MetricsClient";
import { loadMetrics } from "@/app/leaderboards/metrics/metrics-data";
import { isValidLang, LANG_HREFLANG, type LangCode, LANG_GAME_NAME } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

// Render per request like the English route (avoids a build-time empty
// bake); the shared loadMetrics fetch is cached so the data layer stays hot.
export const dynamic = "force-dynamic";

export { generateMetadata } from "@/app/leaderboards/metrics/page";

export default async function LangMetricsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ bracket?: string }>;
}) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const sp = await searchParams;
  const { rows, baselineWinRate, totalRuns, bracket } = await loadMetrics(
    lang,
    sp.bracket || "all"
  );
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home", lang), href: `/${lang}` },
      { name: t("Leaderboards", lang), href: `/${lang}/leaderboards` },
      { name: t("Card Metrics", lang), href: `/${lang}/leaderboards/metrics` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} ${t("Card Metrics", lang)}`,
      description: t("metrics_tagline", lang),
      path: `/${lang}/leaderboards/metrics`,
      inLanguage: LANG_HREFLANG[langCode],
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <MetricsClient
        rows={rows}
        baselineWinRate={baselineWinRate}
        totalRuns={totalRuns}
        bracket={bracket}
      />
    </>
  );
}
