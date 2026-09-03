import ScoringPage from "@/app/leaderboards/scoring/page";
import { isValidLang } from "@/lib/languages";

// The stats, tier-list, and metrics pages all link "How scoring works" with
// the language prefix, and the English page's hreflang alternates advertise
// /<lang>/leaderboards/scoring — but the route didn't exist, so all 13
// localized variants 404'd. Same shape as the [lang]/modifiers fix; the
// explainer body is shared with the English page.

export { generateMetadata } from "@/app/leaderboards/scoring/page";

export default async function LangScoringPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  return <ScoringPage />;
}
