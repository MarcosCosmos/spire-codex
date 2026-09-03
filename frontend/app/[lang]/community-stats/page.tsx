import { CommunityStatsBody } from "@/app/community-stats/CommunityStatsBody";
import { normalizeBracket } from "@/lib/content-brackets";
import { isValidLang } from "@/lib/languages";

// Render per request like the English route (avoids a build-time empty bake
// when the backend is unreachable); the shared body's fetch stays cached.
export const dynamic = "force-dynamic";

export { generateMetadata } from "@/app/community-stats/page";

export default async function LangCommunityStatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ bracket?: string }>;
}) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  const sp = await searchParams;
  const bracket = normalizeBracket(sp.bracket);
  return <CommunityStatsBody lang={lang} bracket={bracket} />;
}
