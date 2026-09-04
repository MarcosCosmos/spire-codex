import type { Metadata } from "next";
import KnowledgeDemonBody from "./KnowledgeDemonBody";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_GAME_NAME, LANG_NAMES } from "@/lib/languages";

type Props = { params: Promise<{ lang?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const gameName = LANG_GAME_NAME[lang];
  const nativeName = LANG_NAMES[lang];
  return buildPageMetadata({
    lang: _lang,
    path: "/knowledge-demon",
    title: `Knowledge Demon - ${gameName} Discord Bot`,
    description: `Knowledge Demon, a Discord bot for ${gameName} communities. Slash-command lookups for cards, relics, monsters, and events, plus moderation and news feeds. ${nativeName}.`,
  });
}

export default async function KnowledgeDemonPage({ params }: Props) {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  return <KnowledgeDemonBody lang={lang} />;
}
