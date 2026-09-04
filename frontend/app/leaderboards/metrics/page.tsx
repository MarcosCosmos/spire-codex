import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, isValidLang, LANG_HREFLANG, LANG_GAME_NAME } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import MetricsClient from "./MetricsClient";
import { loadMetrics } from "./metrics-data";

// Render per request (so a build-time bake with the backend unreachable
// never freezes an empty table) but cache the underlying data fetch inside
// loadMetrics. The backend already serves a pre-built snapshot, so the heavy
// work happens at most once per window across all requests; the per-request
// SSR of the table itself is cheap.
export const dynamic = "force-dynamic";

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

/**
 * Shared with app/[lang]/leaderboards/metrics/page.tsx, which re-exports
 * this directly. Filtered URLs (?bracket=, ?character=) drop hreflang:
 * canonical still points at the clean per-locale URL, but a page whose own
 * URL isn't its canonical must not carry hreflang alternates — crawlers
 * flag that as a conflict.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params?: Promise<{ lang?: string }>;
  searchParams: Promise<{ bracket?: string; character?: string }>;
}): Promise<Metadata> {
  const lang = (await params)?.lang;
  const sp = await searchParams;
  const isVariant = Boolean(sp.bracket || sp.character);
  const meta = buildPageMetadata({
    lang,
    path: "/leaderboards/metrics",
    title: t("Card Metrics", getLangOrDefault(lang)),
    description: t("metrics_tagline", getLangOrDefault(lang)),
  });
  return isVariant ? { ...meta, alternates: { ...meta.alternates, languages: undefined } } : meta;
}

export default async function MetricsPage({
  params,
  searchParams,
}: {
  params?: Promise<{ lang?: string }>;
  searchParams: Promise<{ bracket?: string; character?: string }>;
}) {
  const _lang = (await params)?.lang;
  const lang = getLangOrDefault(_lang);
  const prefix = langPrefix(_lang);
  const gameName = LANG_GAME_NAME[lang];
  const sp = await searchParams;
  const { rows, baselineWinRate, totalRuns, bracket, character } = await loadMetrics(
    lang,
    sp.bracket || "all",
    sp.character || ""
  );

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home", lang), href: prefix || "/" },
      { name: t("Leaderboards", lang), href: `${prefix}/leaderboards` },
      { name: t("Card Metrics", lang), href: `${prefix}/leaderboards/metrics` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} ${t("Card Metrics", lang)}`,
      description: t("metrics_tagline", lang),
      path: `${prefix}/leaderboards/metrics`,
      inLanguage: LANG_HREFLANG[lang],
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
        character={character}
      />
    </>
  );
}
