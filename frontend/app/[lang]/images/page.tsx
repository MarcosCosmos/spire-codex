import type { Metadata } from "next";
import ImagesPage from "@/app/images/page";
import {
  isValidLang,
  LANG_GAME_NAME,
  LANG_NAMES,
  LANG_HREFLANG,
  type LangCode,
} from "@/lib/languages";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL, buildLanguageAlternates } from "@/lib/seo";
import { t } from "@/lib/ui-translations";

const CATEGORY = "images";
const CATEGORY_LABEL = "Images";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];

  const title = `${t(CATEGORY_LABEL, lang)}`;
  const description = `${gameName} ${t(CATEGORY_LABEL, lang)} (${nativeName}). Browse and download game assets, card portraits, relic icons, monster sprites, and character art.`;

  const languages = buildLanguageAlternates(`/${CATEGORY}`);

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
      languages,
    },
  };
}

export default async function LangImagesPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;

  return <ImagesPage />;
}
