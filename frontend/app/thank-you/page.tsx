import type { Metadata } from "next";
import ThankYouBody from "./ThankYouBody";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_GAME_NAME, LANG_NAMES } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ lang?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const gameName = LANG_GAME_NAME[lang];
  const nativeName = LANG_NAMES[lang];
  return buildPageMetadata({
    lang: _lang,
    path: "/thank-you",
    title: t("Thank You", lang),
    description: `Thank you to the ${gameName} community, Ko-fi supporters, and contributors who help grow Spire Codex. ${nativeName}.`,
  });
}

export default async function ThankYouPage({ params }: Props) {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  return <ThankYouBody lang={lang} />;
}
