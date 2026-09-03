import AncientsClient from "@/app/ancients/AncientsClient";
import {
  isValidLang,
  LANG_GAME_NAME,
  LANG_HREFLANG,
  type LangCode,
} from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";

export const revalidate = 3600;

export { generateMetadata } from "@/app/ancients/page";

export default async function LangAncientsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home", lang), href: `/${lang}` },
      { name: t("Ancients", lang), href: `/${lang}/ancients` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} Ancient Relic Pools`,
      description: `Relic pools for all 8 ${gameName} Ancients, every offering and the conditions required to receive it.`,
      path: `/${lang}/ancients`,
      inLanguage: LANG_HREFLANG[langCode],
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <AncientsClient />
    </>
  );
}
