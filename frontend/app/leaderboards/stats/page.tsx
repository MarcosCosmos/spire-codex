import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { buildPageMetadata } from "@/lib/seo";
import { isValidLang } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import StatsClient from "./StatsClient";
import { fetchInitialStats } from "./fetch-initial-stats";

export const dynamic = "force-dynamic";

/** Shared with app/[lang]/leaderboards/stats/page.tsx, which re-exports this directly. */
export async function generateMetadata(
  { params }: { params?: Promise<{ lang?: string }> } = {},
): Promise<Metadata> {
  const lang = (await params)?.lang;
  if (lang && !isValidLang(lang)) return {};
  return buildPageMetadata({
    lang,
    path: "/leaderboards/stats",
    title: t("Stats", lang ?? "eng"),
    description: t("stats_tagline", lang ?? "eng"),
  });
}

export default async function StatsPage() {
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Leaderboards", href: "/leaderboards" },
      { name: "Stats", href: "/leaderboards/stats" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Community Stats",
      description:
        "Win rates by character, card pick rates, most common relics, deadliest encounters, aggregated from community-submitted runs.",
      path: "/leaderboards/stats",
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <StatsClient initialStats={await fetchInitialStats()} />
    </>
  );
}
