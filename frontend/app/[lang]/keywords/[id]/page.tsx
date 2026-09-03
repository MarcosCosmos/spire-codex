import type { Metadata } from "next";
import KeywordDetail from "@/app/keywords/[id]/KeywordDetail";
import { stripTags, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL, stripTagsFlat, clipMetaDescription, buildLanguageAlternates } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { isValidLang, LANG_HREFLANG, LANG_NAMES, LANG_GAME_NAME, type LangCode } from "@/lib/languages";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ lang: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return {};
  try {
    const res = await fetch(`${API_INTERNAL}/api/keywords/${id}?lang=${lang}`);
    if (!res.ok) return { title: "Keyword Not Found" };
    const kw = await res.json();
    const desc = stripTags(kw.description);
    const langCode = lang as LangCode;
    const gameName = LANG_GAME_NAME[langCode];
    const title = `${kw.name} Cards - All ${kw.name} Cards`;
    const languages = buildLanguageAlternates(`/keywords/${id}`);
    return {
      title,
      description: `${desc} Browse all ${kw.name} cards in ${gameName}.`,
      openGraph: {
        type: "article",
        siteName: SITE_NAME,
        url: `${SITE_URL}/${lang}/keywords/${id}`,
        title: `${kw.name} Cards`,
        description: `${desc} Browse all ${kw.name} cards in ${gameName}.`,
        locale: LANG_HREFLANG[langCode],
        images: [{ url: DEFAULT_OG_IMAGE }],
      },
      twitter: { card: "summary_large_image", title: `${gameName} ${kw.name} Cards | Spire Codex (${LANG_NAMES[langCode]})`, description: `${desc} Browse all ${kw.name} cards in ${gameName}.` },
      alternates: { canonical: `/${lang}/keywords/${id}`, languages },
    };
  } catch {
    return { title: "Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return null;
  let jsonLd = null;
  let kw = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/keywords/${id}?lang=${lang}`);
    if (res.ok) {
      kw = await res.json();
      const desc = stripTags(kw.description);
      const langCode = lang as LangCode;
      const gameName = LANG_GAME_NAME[langCode];
      const detailJsonLd = buildDetailPageJsonLd({
        name: `${kw.name} Cards`,
        description: `${desc} All cards with the ${kw.name} keyword in ${gameName}.`,
        path: `/${lang}/keywords/${id}`,
        category: "Keyword",
        breadcrumbs: [
          { name: "Home", href: `/${lang}` },
          { name: "Keywords", href: `/${lang}/keywords` },
          { name: kw.name, href: `/${lang}/keywords/${id}` },
        ],
        inLanguage: LANG_HREFLANG[langCode],
      });
      const faqJsonLd = buildFAQPageJsonLd([
        { question: `What does ${kw.name} do in ${gameName}?`, answer: desc },
        { question: `Which cards have ${kw.name}?`, answer: `View the full list of ${kw.name} cards on this page.` },
      ]);
      jsonLd = [...detailJsonLd, faqJsonLd];
    }
  } catch {
    apiUnreachable = true;
  }
  // Unknown keyword → 308 back to the keywords hub. Note this only
  // looks up `/api/keywords/`; glossary terms in other locales fall
  // through to the same redirect (the English version tries glossary
  // first because the URL space is shared, but the localized routes
  // are keyword-only).
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!kw) redirectMissingEntity("keywords", id, lang);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <KeywordDetail initialResult={kw ? { type: "keyword", data: kw } : null} />
    </>
  );
}
