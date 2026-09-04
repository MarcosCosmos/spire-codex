import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_GAME_NAME, LANG_HREFLANG, isValidLang } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import AncientsClient from "./AncientsClient";

export const revalidate = 3600;

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

/** Shared with app/[lang]/ancients/page.tsx, which re-exports this directly. */
export async function generateMetadata(
  { params }: { params?: Promise<{ lang?: string }> } = {},
): Promise<Metadata> {
  const lang = (await params)?.lang;
  const gameName = LANG_GAME_NAME[getLangOrDefault(lang)];
  return buildPageMetadata({
    lang,
    path: "/ancients",
    title: t("Ancients", getLangOrDefault(lang)),
    description: `${gameName} Ancient relic pools. Every offering and condition for all 8 Ancients, Neow, Tezcatara, Pael, Orobas, Darv, Nonupeipe, and more.`,
  });
}

export default async function AncientsPage({
  params,
}: {
  params?: Promise<{ lang?: string }>;
} = {}) {
  const _lang = (await params)?.lang;
  const lang = getLangOrDefault(_lang);
  const prefix = langPrefix(_lang);
  const gameName = LANG_GAME_NAME[lang];
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home", lang), href: prefix || "/" },
      { name: t("Ancients", lang), href: `${prefix}/ancients` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} Ancient Relic Pools`,
      description: `Relic pools for all 8 ${gameName} Ancients, every offering and the conditions required to receive it.`,
      path: `${prefix}/ancients`,
      inLanguage: LANG_HREFLANG[lang],
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <AncientsClient />
    </>
  );
}
