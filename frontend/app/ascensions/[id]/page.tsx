import type { Metadata } from "next";
import AscensionDetail from "./AscensionDetail";
import JsonLd from "@/app/components/JsonLd";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { stripTags, stripTagsFlat, clipMetaDescription, buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_GAME_NAME, LANG_HREFLANG, isValidLang } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

export const dynamic = "force-static";
export const revalidate = 3600;

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ lang?: string; id: string }> };

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  try {
    const res = await fetch(`${API_INTERNAL}/api/ascensions/${id}${_lang ? `?lang=${_lang}` : ""}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { title: "Ascension Not Found" };
    const asc = await res.json();
    const desc = stripTagsFlat(asc.description);
    const gameName = LANG_GAME_NAME[lang];
    const title = `Ascension ${asc.level}: ${asc.name}`;
    return buildPageMetadata({
      lang: _lang,
      path: `/ascensions/${id}`,
      title,
      description: clipMetaDescription(
        `${gameName} Ascension ${asc.level}, ${asc.name}${desc ? `: ${desc}` : ""}`,
      ),
      ogType: "article",
    });
  } catch {
    return { title: "Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id, lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const prefix = langPrefix(_lang);
  let jsonLd = null;
  let asc = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/ascensions/${id}${_lang ? `?lang=${_lang}` : ""}`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      asc = await res.json();
      const desc = stripTags(asc.description);
      const gameName = LANG_GAME_NAME[lang];
      const detailJsonLd = buildDetailPageJsonLd({
        name: `Ascension ${asc.level}: ${asc.name}`,
        description: `${desc} Ascension level ${asc.level} in ${gameName}.`,
        path: `${prefix}/ascensions/${id}`,
        category: "Ascension",
        breadcrumbs: [
          { name: t("Home", lang), href: prefix || "/" },
          { name: t("Reference", lang), href: `${prefix}/reference` },
          { name: `Ascension ${asc.level}`, href: `${prefix}/ascensions/${id}` },
        ],
        inLanguage: LANG_HREFLANG[lang],
      });
      const faqJsonLd = buildFAQPageJsonLd([
        { question: `What does Ascension ${asc.level} do in ${gameName}?`, answer: desc },
      ]);
      jsonLd = [...detailJsonLd, faqJsonLd];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!asc) redirectMissingEntity("ascensions", id, _lang);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <AscensionDetail initialAscension={asc} />
    </>
  );
}
