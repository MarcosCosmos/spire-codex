import type { Metadata } from "next";
import UnlocksClient from "./UnlocksClient";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_GAME_NAME, LANG_HREFLANG, isValidLang } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";

type Props = { params: Promise<{ lang?: string }> };

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const gameName = LANG_GAME_NAME[lang];
  return buildPageMetadata({
    lang: _lang,
    path: "/unlocks",
    title: t("Unlocks", lang),
    description: `${gameName} unlocks. All unlockable cards, relics, potions, and characters with their epoch progression and score thresholds.`,
  });
}

export default async function Page({ params }: Props) {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const prefix = langPrefix(_lang);
  const gameName = LANG_GAME_NAME[lang];
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home", lang), href: prefix || "/" },
      { name: t("Unlocks", lang), href: `${prefix}/unlocks` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} ${t("Unlocks", lang)}`,
      description: `${gameName} unlocks, all unlockable cards, relics, potions, and characters with epoch progression and score thresholds.`,
      path: `${prefix}/unlocks`,
      inLanguage: LANG_HREFLANG[lang],
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <UnlocksClient />
    </>
  );
}
