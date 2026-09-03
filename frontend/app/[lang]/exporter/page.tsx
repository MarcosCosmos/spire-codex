import type { Metadata } from "next";
import ExporterBody from "@/app/exporter/ExporterBody";
import {
  isValidLang,
  LANG_GAME_NAME,
  LANG_NAMES,
  LANG_HREFLANG,
  type LangCode,
} from "@/lib/languages";
import { buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import { t } from "@/lib/ui-translations";

const CATEGORY = "exporter";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];

  const title = `${t("Art Exporter", lang)}`;
  const description = `The tool that generates every image on Spire Codex, free on the Steam Workshop for ${gameName}. Card renders, Spine character art, animations, and texture dumps. ${nativeName}.`;

  return {
    title,
    description,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: `${SITE_URL}/${lang}/${CATEGORY}`,
      title,
      description,
      locale: LANG_HREFLANG[langCode],
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description },
    alternates: {
      canonical: `/${lang}/${CATEGORY}`,
      languages: buildLanguageAlternates(`/${CATEGORY}`),
    },
  };
}

export default async function LangExporterPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  return <ExporterBody lang={lang} />;
}
