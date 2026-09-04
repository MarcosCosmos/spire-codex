import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import ModifiersClient from "./ModifiersClient";
import { getLangOrDefault, LANG_GAME_NAME, LANG_HREFLANG } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

// Pure client component, no fetches, pre-rendered at build time and
// cached at CF edge indefinitely (modifier data only changes on deploy).

type Props = { params: Promise<{ lang?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const gameName = LANG_GAME_NAME[lang];
  return buildPageMetadata({
    lang: _lang,
    path: "/modifiers",
    title: t("Modifiers", lang),
    description: `${gameName} ${t("Modifiers", lang)}. All 16 custom-mode modifiers, Draft, Sealed Deck, Insanity, and more. Effects, deck rules, and Neow interactions for each.`,
  });
}

export default async function ModifiersPage({ params }: Props) {
  const { lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const gameName = LANG_GAME_NAME[lang];
  const prefix = _lang ? `/${_lang}` : "";

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home", lang), href: prefix || "/" },
      { name: t("Modifiers", lang), href: `${prefix}/modifiers` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} ${t("Modifiers", lang)}`,
      description: `All 16 custom-mode modifiers in ${gameName}.`,
      path: `${prefix}/modifiers`,
      inLanguage: LANG_HREFLANG[lang],
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <ModifiersClient />
    </>
  );
}
