import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import LeaderboardBrowseClient from "@/app/leaderboards/LeaderboardBrowseClient";
import { isValidLang, LANG_HREFLANG, type LangCode, LANG_GAME_NAME } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

export const dynamic = "force-dynamic";

export { generateMetadata } from "@/app/leaderboards/page";

export default async function LangLeaderboardsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const leaderboardsWord = t("Leaderboards", lang);
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home", lang), href: `/${lang}` },
      { name: leaderboardsWord, href: `/${lang}/leaderboards` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} ${leaderboardsWord}`,
      description: t("leaderboards_tagline", lang),
      path: `/${lang}/leaderboards`,
      inLanguage: LANG_HREFLANG[langCode],
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <LeaderboardBrowseClient />
    </>
  );
}
