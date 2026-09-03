import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { buildPageMetadata } from "@/lib/seo";
import { isValidLang } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import EncounterStatsClient from "./EncounterStatsClient";

export const dynamic = "force-dynamic";

/** Shared with app/[lang]/leaderboards/encounters/page.tsx, which re-exports this directly. */
export async function generateMetadata(
  { params }: { params?: Promise<{ lang?: string }> } = {},
): Promise<Metadata> {
  const lang = (await params)?.lang;
  if (lang && !isValidLang(lang)) return {};
  return buildPageMetadata({
    lang,
    path: "/leaderboards/encounters",
    title: t("Encounter Stats", lang ?? "eng"),
    description: t("encounter_stats_tagline", lang ?? "eng"),
  });
}

export default function EncountersStatsPage() {
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Leaderboards", href: "/leaderboards" },
      { name: "Encounters", href: "/leaderboards/encounters" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Encounter Stats",
      description:
        "Per-encounter aggregation: fatal counts, average damage taken, average turn count, and per-character breakdown for every monster, elite, and boss.",
      path: "/leaderboards/encounters",
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <EncounterStatsClient />
    </>
  );
}
