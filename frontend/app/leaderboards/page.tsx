import { Suspense } from "react";
import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, isValidLang, LANG_HREFLANG, LANG_GAME_NAME } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import LeaderboardBrowseClient from "./LeaderboardBrowseClient";

export const dynamic = "force-dynamic";

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

/** Shared with app/[lang]/leaderboards/page.tsx, which re-exports this directly. */
export async function generateMetadata(
  { params }: { params?: Promise<{ lang?: string }> } = {},
): Promise<Metadata> {
  const lang = (await params)?.lang;
  return buildPageMetadata({
    lang,
    path: "/leaderboards",
    title: t("Leaderboards", getLangOrDefault(lang)),
    description: t("leaderboards_tagline", getLangOrDefault(lang)),
  });
}

export default async function ToolsPage({
  params,
}: {
  params?: Promise<{ lang?: string }>;
} = {}) {
  const _lang = (await params)?.lang;
  const lang = getLangOrDefault(_lang);
  const prefix = langPrefix(_lang);
  const gameName = LANG_GAME_NAME[lang];
  const leaderboardsWord = t("Leaderboards", lang);
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home", lang), href: prefix || "/" },
      { name: leaderboardsWord, href: `${prefix}/leaderboards` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} ${leaderboardsWord}`,
      description: t("leaderboards_tagline", lang),
      path: `${prefix}/leaderboards`,
      inLanguage: LANG_HREFLANG[lang],
    }),
  ];

  // LeaderboardBrowseClient calls `useSearchParams()`, which opts the
  // whole tree out of static prerender and was preventing the JSON-LD
  // sibling from making it into the SSR HTML, GSC saw zero
  // structured data on /leaderboards. Wrapping the client component
  // in <Suspense> isolates the bailout so the JsonLd ships in the
  // initial server response.
  return (
    <>
      <JsonLd data={jsonLd} />
      <Suspense>
        <LeaderboardBrowseClient />
      </Suspense>
    </>
  );
}
