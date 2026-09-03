import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_GAME_NAME, isValidLang } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import AncientsClient from "./AncientsClient";

export const revalidate = 3600;

/** Shared with app/[lang]/ancients/page.tsx, which re-exports this directly. */
export async function generateMetadata(
  { params }: { params?: Promise<{ lang?: string }> } = {},
): Promise<Metadata> {
  const lang = (await params)?.lang;
  if (lang && !isValidLang(lang)) return {};
  const gameName = LANG_GAME_NAME[getLangOrDefault(lang)];
  return buildPageMetadata({
    lang,
    path: "/ancients",
    title: t("Ancients", lang ?? "eng"),
    description: `${gameName} Ancient relic pools. Every offering and condition for all 8 Ancients, Neow, Tezcatara, Pael, Orobas, Darv, Nonupeipe, and more.`,
  });
}

export default function AncientsPage() {
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Ancients", href: "/ancients" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Ancient Relic Pools",
      description:
        "Relic pools for all 8 Slay the Spire 2 Ancients, every offering and the conditions required to receive it.",
      path: "/ancients",
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <AncientsClient />
    </>
  );
}
