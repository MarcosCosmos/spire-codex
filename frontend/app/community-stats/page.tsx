import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_GAME_NAME } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import { normalizeBracket } from "@/lib/content-brackets";
import { CommunityStatsBody } from "./CommunityStatsBody";

// Render per request (avoids a build-time empty bake when the backend is
// unreachable); the shared body's fetch stays cached. This used to be a
// 5min ISR cache on the canonical route only, but the [lang] variant this
// file now also serves needed force-dynamic, and both routes render the
// exact same function.
export const dynamic = "force-dynamic";

/** Shared with app/[lang]/community-stats/page.tsx, which re-exports this directly. */
export async function generateMetadata(
  { params }: { params?: Promise<{ lang?: string }> } = {},
): Promise<Metadata> {
  const lang = (await params)?.lang;
  const gameName = LANG_GAME_NAME[getLangOrDefault(lang)];
  return buildPageMetadata({
    lang,
    path: "/community-stats",
    title: t("Community Stats", getLangOrDefault(lang)),
    description: `Fun ${gameName} community stats: how players vote at every event, what kills runs most, win rates by ascension and character, and run records, all from community-submitted runs.`,
  });
}

export default async function CommunityStatsPage({
  params,
  searchParams,
}: {
  params?: Promise<{ lang?: string }>;
  searchParams: Promise<{ bracket?: string }>;
}) {
  const _lang = (await params)?.lang;
  const lang = getLangOrDefault(_lang);
  const sp = await searchParams;
  const bracket = normalizeBracket(sp.bracket);
  return <CommunityStatsBody lang={lang} bracket={bracket} />;
}
