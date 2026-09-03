import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { buildPageMetadata } from "@/lib/seo";
import { isValidLang } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import MetricsClient from "./MetricsClient";
import { loadMetrics } from "./metrics-data";

// Render per request (so a build-time bake with the backend unreachable
// never freezes an empty table) but cache the underlying data fetch inside
// loadMetrics. The backend already serves a pre-built snapshot, so the heavy
// work happens at most once per window across all requests; the per-request
// SSR of the table itself is cheap.
export const dynamic = "force-dynamic";

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
  if (lang && !isValidLang(lang)) return {};
  const sp = await searchParams;
  const isVariant = Boolean(sp.bracket || sp.character);
  const meta = buildPageMetadata({
    lang,
    path: "/leaderboards/metrics",
    title: t("Card Metrics", lang ?? "eng"),
    description: t("metrics_tagline", lang ?? "eng"),
  });
  return isVariant ? { ...meta, alternates: { ...meta.alternates, languages: undefined } } : meta;
}

export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ bracket?: string; character?: string }>;
}) {
  const sp = await searchParams;
  const { rows, baselineWinRate, totalRuns, bracket, character } = await loadMetrics(
    "eng",
    sp.bracket || "all",
    sp.character || ""
  );

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Leaderboards", href: "/leaderboards" },
      { name: "Card Metrics", href: "/leaderboards/metrics" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Card Metrics",
      description: t("metrics_tagline", "eng"),
      path: "/leaderboards/metrics",
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
