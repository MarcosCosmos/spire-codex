import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  SUPPORTED_LANGS,
  isValidLang,
  LANG_HREFLANG,
  LANG_NAMES,
  LANG_GAME_NAME,
  LANG_DATABASE,
  type LangCode,
} from "@/lib/languages";
import { SITE_NAME, DEFAULT_OG_IMAGE } from "@/lib/seo";
import { LanguageProvider } from "@/app/contexts/LanguageContext";
import HtmlLang from "@/app/components/HtmlLang";

interface Props {
  params: Promise<{ lang: string }>;
  children: React.ReactNode;
}

export async function generateStaticParams() {
  return SUPPORTED_LANGS.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const dbWord = LANG_DATABASE[langCode];
  const nativeName = LANG_NAMES[langCode];

  // Mirrors the root layout's structure exactly, with localized fragments
  // as the only difference, so a page under either tree supplies just its
  // own title segment. og:title is a separate template channel in Next and
  // needs its own copy.
  const template = `%s - ${gameName} | ${SITE_NAME} (${nativeName})`;
  const fallback = `${gameName} ${dbWord} - ${SITE_NAME} (${nativeName})`;
  const description = `Spire Codex, ${gameName} ${dbWord}. ${nativeName}.`;

  return {
    title: { default: fallback, template },
    description,
    openGraph: {
      title: { default: fallback, template },
      type: "website",
      siteName: SITE_NAME,
      locale: LANG_HREFLANG[langCode],
      images: [{ url: DEFAULT_OG_IMAGE, width: 3000, height: 3000 }],
    },
    // Only used by pages still setting `twitter.title` themselves
    // mid-migration; inert once none do and the card inherits from og.
    twitter: { card: "summary_large_image", title: { default: fallback, template } },
    // No `alternates` here on purpose. It used to set canonical `/${lang}`,
    // which every child that declared no alternates of its own inherited —
    // so e.g. /esp/deck-lab announced itself as a duplicate of /esp. It
    // also hand-rolled an hreflang map containing a "canonical" key, which
    // is not a valid hreflang value. Canonical and hreflang are per-route,
    // and belong to buildPageMetadata.
  };
}

export default async function LangLayout({ params, children }: Props) {
  const { lang } = await params;

  if (!isValidLang(lang)) {
    notFound();
  }

  // A nested provider seeded with the URL segment: client components under
  // /<lang>/ now server-render their UI strings in the page's language
  // instead of the English default (crawlers were detecting every localized
  // page as English content). HtmlLang fixes the <html lang> attribute
  // after hydration, since the root layout can't see this segment.
  return (
    <LanguageProvider initialLang={lang}>
      <HtmlLang lang={lang} />
      {children}
    </LanguageProvider>
  );
}
