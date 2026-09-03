import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_GAME_NAME, isValidLang } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import { normalizeBracket } from "@/lib/content-brackets";
import { CommunityStatsBody } from "./CommunityStatsBody";

// Community stats rebuild on the backend on the snapshot cadence; a 5min
// HTML cache keeps this page cheap without going stale.
export const revalidate = 300;

/** Shared with app/[lang]/community-stats/page.tsx, which re-exports this directly. */
export async function generateMetadata(
  { params }: { params?: Promise<{ lang?: string }> } = {},
): Promise<Metadata> {
  const lang = (await params)?.lang;
  if (lang && !isValidLang(lang)) return {};
  const gameName = LANG_GAME_NAME[getLangOrDefault(lang)];
  return buildPageMetadata({
    lang,
    path: "/community-stats",
    title: t("Community Stats", lang ?? "eng"),
    description: `Fun ${gameName} community stats: how players vote at every event, what kills runs most, win rates by ascension and character, and run records, all from community-submitted runs.`,
  });
}

// Base English route. Localized copies live at /[lang]/community-stats and
// render the same CommunityStatsBody with the URL language.
export default async function CommunityStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ bracket?: string }>;
}) {
  const sp = await searchParams;
  const bracket = normalizeBracket(sp.bracket);
  return <CommunityStatsBody lang="eng" bracket={bracket} />;
}
