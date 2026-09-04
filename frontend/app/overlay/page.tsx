import type { Metadata } from "next";
import OverlayBody from "./OverlayBody";
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
    path: "/overlay",
    title: t("Overlay", lang),
    description: `The Overwolf companion overlay for ${gameName}. In-game card, relic, and monster lookups plus a live run tracker that reads your save file. ${nativeName}.`,
  });
}

export default async function OverlayPage({ params }: Props) {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  return <OverlayBody lang={lang} />;
}
