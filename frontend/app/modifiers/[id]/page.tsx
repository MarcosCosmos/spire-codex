import type { Metadata } from "next";
import ModifierDetail from "./ModifierDetail";
import { stripTags, stripTagsFlat, clipMetaDescription, buildPageMetadata } from "@/lib/seo";
import { t } from "@/lib/ui-translations";
import { getLangOrDefault, LANG_GAME_NAME, LANG_HREFLANG, isValidLang } from "@/lib/languages";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ lang?: string; id: string }> };

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  try {
    const res = await fetch(`${API_INTERNAL}/api/modifiers/${id}${lang ? `?lang=${lang}` : ""}`);
    if (!res.ok) return { title: "Modifier Not Found" };
    const entity = await res.json();
    const desc = stripTagsFlat(entity.description || "");
    const name = entity.name || id;
    const gameName = LANG_GAME_NAME[lang];
    const title = `${name} - ${t("Modifier", lang)}`;
    const meta = buildPageMetadata({
      lang: _lang,
      path: `/modifiers/${id}`,
      title,
      description: clipMetaDescription(`${gameName} custom-run modifier, ${name}${desc ? `: ${desc}` : ""}`),
      ogType: "article",
    });
    return meta;
  } catch {
    return { title: "Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id, lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const prefix = langPrefix(_lang);
  let jsonLd = null;
  let modifier = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/modifiers/${id}${_lang ? `?lang=${_lang}` : ""}`);
    if (res.ok) {
      modifier = await res.json();
      const desc = stripTags(modifier.description || "");
      const name = modifier.name || id;
      const detailJsonLd = buildDetailPageJsonLd({
        name,
        description: desc || `${name} modifier from Slay the Spire 2`,
        path: `${prefix}/modifiers/${id}`,
        category: "Modifier",
        breadcrumbs: [
          { name: t("Home", lang), href: prefix || "/" },
          { name: t("Reference", lang), href: `${prefix}/reference` },
          { name, href: `${prefix}/modifiers/${id}` },
        ],
        inLanguage: LANG_HREFLANG[lang],
      });
      const faqQuestions = [
        { question: `What does the ${name} modifier do in Slay the Spire 2?`, answer: desc || `${name} is a run modifier in Slay the Spire 2.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!modifier) redirectMissingEntity("modifiers", id, _lang);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <ModifierDetail initialModifier={modifier} />
    </>
  );
}
