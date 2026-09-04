import type { Metadata } from "next";
import ModBody from "./ModBody";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_GAME_NAME, LANG_NAMES } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

type Props = { params: Promise<{ lang?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const gameName = LANG_GAME_NAME[lang];
  const nativeName = LANG_NAMES[lang];
  return buildPageMetadata({
    lang: _lang,
    path: "/mod",
    title: t("Steam Mod", lang),
    description: `The official Spire Codex mod for ${gameName}, from the Steam Workshop. Automatic run uploads, in-game community insights, and a route planner. ${nativeName}.`,
  });
}

export default async function ModPage({ params }: Props) {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  return <ModBody lang={lang} />;
}
