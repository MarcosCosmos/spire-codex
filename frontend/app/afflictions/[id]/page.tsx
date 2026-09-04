import type { Metadata } from "next";
import AfflictionDetail from "./AfflictionDetail";
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
    const res = await fetch(`${API_INTERNAL}/api/afflictions/${id}${lang ? `?lang=${lang}` : ""}`);
    if (!res.ok) return { title: "Affliction Not Found" };
    const entity = await res.json();
    const desc = stripTagsFlat(entity.description || "");
    const name = entity.name || id;
    const gameName = LANG_GAME_NAME[lang];
    const title = `${name} - ${t("Affliction", lang)}`;
    const meta = buildPageMetadata({
      lang: _lang,
      path: `/afflictions/${id}`,
      title,
      description: clipMetaDescription(`${gameName} affliction, ${name}${desc ? `: ${desc}` : ""}`),
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
  let affliction = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/afflictions/${id}${_lang ? `?lang=${_lang}` : ""}`);
    if (res.ok) {
      affliction = await res.json();
      const desc = stripTags(affliction.description || "");
      const name = affliction.name || id;
      const detailJsonLd = buildDetailPageJsonLd({
        name,
        description: desc || `${name} affliction from Slay the Spire 2`,
        path: `${prefix}/afflictions/${id}`,
        category: "Affliction",
        breadcrumbs: [
          { name: t("Home", lang), href: prefix || "/" },
          { name: t("Reference", lang), href: `${prefix}/reference` },
          { name, href: `${prefix}/afflictions/${id}` },
        ],
        inLanguage: LANG_HREFLANG[lang],
      });
      const faqQuestions = [
        { question: `What does ${name} do in Slay the Spire 2?`, answer: desc || `${name} is an affliction in Slay the Spire 2.` },
        ...(affliction.is_stackable ? [{ question: `Is ${name} stackable?`, answer: `Yes, ${name} is stackable.` }] : []),
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!affliction) redirectMissingEntity("afflictions", id, _lang);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <AfflictionDetail initialAffliction={affliction} />
    </>
  );
}
