import type { Metadata } from "next";
import KeywordDetail from "./KeywordDetail";
import JsonLd from "@/app/components/JsonLd";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { stripTags, stripTagsFlat, clipMetaDescription, buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_GAME_NAME, LANG_HREFLANG, isValidLang } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ lang?: string; id: string }> };

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

// Glossary terms aren't locale-aware yet: the fallback only runs on the
// canonical (no-lang) route, so a localized /<lang>/keywords/<id> only
// ever resolves against /api/keywords, never /api/glossary.
async function fetchKeywordOrGlossary(id: string, lang?: string) {
  try {
    const res = await fetch(`${API_INTERNAL}/api/keywords/${id}${lang ? `?lang=${lang}` : ""}`);
    if (res.ok) return { type: "keyword" as const, data: await res.json() };
  } catch {}
  if (!lang) {
    try {
      const res = await fetch(`${API_INTERNAL}/api/glossary/${id}`);
      if (res.ok) return { type: "glossary" as const, data: await res.json() };
    } catch {}
  }
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const result = await fetchKeywordOrGlossary(id, _lang);
  if (!result) return { title: "Term Not Found" };

  const { type, data } = result;
  const desc = stripTagsFlat(data.description);
  const gameName = LANG_GAME_NAME[lang];

  if (type === "keyword") {
    const title = `${data.name} - ${t("Keyword", lang)}`;
    return buildPageMetadata({
      lang: _lang,
      path: `/keywords/${id}`,
      title,
      description: clipMetaDescription(
        `${data.name} is a card keyword in ${gameName}${desc ? `: ${desc}` : "."} See every card that uses ${data.name}.`,
      ),
      ogType: "article",
    });
  }

  const title = `${data.name} - Slay the Spire 2 Term`;
  return buildPageMetadata({
    lang: _lang,
    path: `/keywords/${id}`,
    title,
    description: clipMetaDescription(
      `${data.name} is a game term in ${gameName}${desc ? `: ${desc}` : "."}`,
    ),
    ogType: "article",
  });
}

export default async function Page({ params }: Props) {
  const { id, lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const prefix = langPrefix(_lang);
  const result = await fetchKeywordOrGlossary(id, _lang);

  let jsonLd = null;
  if (result) {
    const { type, data } = result;
    const desc = stripTags(data.description);

    if (type === "keyword") {
      const detailJsonLd = buildDetailPageJsonLd({
        name: `${data.name} Cards`,
        description: `${desc} All cards with the ${data.name} keyword in Slay the Spire 2.`,
        path: `${prefix}/keywords/${id}`,
        category: "Keyword",
        breadcrumbs: [
          { name: t("Home", lang), href: prefix || "/" },
          { name: t("Keywords", lang), href: `${prefix}/keywords` },
          { name: data.name, href: `${prefix}/keywords/${id}` },
        ],
        inLanguage: LANG_HREFLANG[lang],
      });
      const faqJsonLd = buildFAQPageJsonLd([
        { question: `What does ${data.name} do in Slay the Spire 2?`, answer: desc },
        { question: `Which cards have ${data.name}?`, answer: `View the full list of ${data.name} cards on this page.` },
      ]);
      jsonLd = [...detailJsonLd, faqJsonLd];
    } else {
      const detailJsonLd = buildDetailPageJsonLd({
        name: data.name,
        description: `${desc} Game term definition for Slay the Spire 2.`,
        path: `${prefix}/keywords/${id}`,
        category: "Game Term",
        breadcrumbs: [
          { name: t("Home", lang), href: prefix || "/" },
          { name: "Keywords & Game Terms", href: `${prefix}/keywords` },
          { name: data.name, href: `${prefix}/keywords/${id}` },
        ],
      });
      const faqJsonLd = buildFAQPageJsonLd([
        { question: `What does ${data.name} mean in Slay the Spire 2?`, answer: desc },
      ]);
      jsonLd = [...detailJsonLd, faqJsonLd];
    }
  }
  if (!result) redirectMissingEntity("keywords", id, _lang);

  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <KeywordDetail initialResult={result} />
    </>
  );
}
