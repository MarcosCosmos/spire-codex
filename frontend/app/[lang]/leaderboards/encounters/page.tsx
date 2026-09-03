import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import EncounterStatsClient from "@/app/leaderboards/encounters/EncounterStatsClient";
import { isValidLang, LANG_HREFLANG, type LangCode, LANG_GAME_NAME } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

export const dynamic = "force-dynamic";

export { generateMetadata } from "@/app/leaderboards/encounters/page";

export default async function LangEncounterStatsPage({
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
      { name: t("Encounters", lang), href: `/${lang}/leaderboards/encounters` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} ${t("Encounter Stats", lang)}`,
      description: t("encounter_stats_tagline", lang),
      path: `/${lang}/leaderboards/encounters`,
      inLanguage: LANG_HREFLANG[langCode],
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <EncounterStatsClient />
    </>
  );
}
