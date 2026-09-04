import type { Metadata } from "next";
import PowerDetail from "./PowerDetail";
import { stripTags, stripTagsFlat, clipMetaDescription, buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_GAME_NAME, LANG_HREFLANG, isValidLang } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { imageUrl } from "@/lib/image-url";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ lang?: string; id: string }> };

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, lang } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/powers/${id}${lang ? `?lang=${lang}` : ""}`);
    if (!res.ok) return { title: "Power Not Found" };
    const entity = await res.json();
    const desc = stripTagsFlat(entity.description || "");
    const name = entity.name || id;
    const resolvedLang = getLangOrDefault(lang);
    const gameName = LANG_GAME_NAME[resolvedLang];
    // entity.type (Buff/Debuff) is not localized by the API.
    const typeWord = t(entity.type, resolvedLang);
    const title = `${name} - ${typeWord} ${t("Power", resolvedLang)}`;
    const meta = buildPageMetadata({
      lang,
      path: `/powers/${id}`,
      title,
      description: clipMetaDescription(`${gameName} ${typeWord} power, ${name}${desc ? `: ${desc}` : ""}`),
      ogType: "article",
    });
    return {
      ...meta,
      openGraph: {
        ...meta.openGraph,
        images: entity.image_url ? [{ url: imageUrl(entity.image_url) }] : undefined,
      },
    };
  } catch {
    return { title: "Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id, lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  const prefix = langPrefix(_lang);
  let jsonLd = null;
  let power = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/powers/${id}${_lang ? `?lang=${_lang}` : ""}`);
    if (res.ok) {
      power = await res.json();
      const desc = stripTags(power.description || "");
      const name = power.name || id;
      const detailJsonLd = buildDetailPageJsonLd({
        name,
        description: desc || `${name} power from Slay the Spire 2`,
        path: `${prefix}/powers/${id}`,
        imageUrl: power.image_url ? imageUrl(power.image_url) : undefined,
        category: "Power",
        breadcrumbs: [
          { name: t("Home", lang), href: prefix || "/" },
          { name: t("Powers", lang), href: `${prefix}/powers` },
          { name, href: `${prefix}/powers/${id}` },
        ],
        inLanguage: LANG_HREFLANG[lang],
      });
      const faqQuestions = [
        { question: `What does ${name} do in Slay the Spire 2?`, answer: desc || `${name} is a power in Slay the Spire 2.` },
        { question: `Is ${name} a buff or debuff?`, answer: `${name} is a ${power.type} with ${power.stack_type} stacking.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!power) redirectMissingEntity("powers", id, _lang);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <PowerDetail initialPower={power} />
    </>
  );
}
