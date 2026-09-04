import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, isValidLang, LANG_HREFLANG, LANG_GAME_NAME } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import EncounterStatsClient from "./EncounterStatsClient";

export const dynamic = "force-dynamic";

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

/** Shared with app/[lang]/leaderboards/encounters/page.tsx, which re-exports this directly. */
export async function generateMetadata(
  { params }: { params?: Promise<{ lang?: string }> } = {},
): Promise<Metadata> {
  const lang = (await params)?.lang;
  return buildPageMetadata({
    lang,
    path: "/leaderboards/encounters",
    title: t("Encounter Stats", getLangOrDefault(lang)),
    description: t("encounter_stats_tagline", getLangOrDefault(lang)),
  });
}

export default async function EncountersStatsPage({
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
      { name: t("Encounters", lang), href: `${prefix}/leaderboards/encounters` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} ${t("Encounter Stats", lang)}`,
      description: t("encounter_stats_tagline", lang),
      path: `${prefix}/leaderboards/encounters`,
      inLanguage: LANG_HREFLANG[lang],
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <EncounterStatsClient />
    </>
  );
}
