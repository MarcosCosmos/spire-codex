import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_GAME_NAME, LANG_NAMES } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import { TierListBody } from "./TierListBody";

// Tier-list hub: scores refresh on the backend every 60s, so 5min
// HTML cache is comfortably fresh and lets CF serve from edge.
export const revalidate = 300;

type Props = { params: Promise<{ lang?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const gameName = LANG_GAME_NAME[lang];
  const nativeName = LANG_NAMES[lang];
  return buildPageMetadata({
    lang: _lang,
    path: "/tier-list",
    title: t("Tier List", lang),
    description: `${gameName} tier list ranking every card, relic, and potion S through F. Codex Score from community win rates. ${nativeName}.`,
  });
}

export default async function TierListIndex({ params }: Props) {
  const { lang } = await params;
  return <TierListBody lang={getLangOrDefault(lang)} />;
}
