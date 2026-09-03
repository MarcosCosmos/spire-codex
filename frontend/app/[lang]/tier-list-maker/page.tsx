import type { Metadata } from "next";
import { isValidLang, type LangCode } from "@/lib/languages";
import { SITE_URL, buildLanguageAlternates } from "@/lib/seo";
import TierListHome from "@/app/tier-list-maker/TierListHome";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};
  return {
    title: `Tier List Maker`,
    description:
      "Build and share Slay the Spire 2 tier lists. Drag and drop cards, relics, potions, and monsters into custom tiers.",
    alternates: {
      canonical: `${SITE_URL}/${lang}/tier-list-maker`,
      languages: buildLanguageAlternates("/tier-list-maker"),
    },
  };
}

export default async function LangTierListMakerPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  return <TierListHome />;
}
