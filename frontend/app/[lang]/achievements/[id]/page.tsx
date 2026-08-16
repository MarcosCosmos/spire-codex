import type { Metadata } from "next";
import AchievementDetail from "@/app/achievements/[id]/AchievementDetail";
import { stripTags, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL, stripTagsFlat, clipMetaDescription, buildLanguageAlternates } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { isValidLang, LANG_HREFLANG, LANG_NAMES, LANG_GAME_NAME, type LangCode } from "@/lib/languages";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ lang: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return {};
  try {
    const res = await fetch(`${API_INTERNAL}/api/achievements/${id}?lang=${lang}`);
    if (!res.ok) return { title: "Achievement Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const entity = await res.json();
    const desc = stripTagsFlat(entity.description || "");
    const langCode = lang as LangCode;
    const gameName = LANG_GAME_NAME[langCode];
    const name = entity.name || id;
    const title = `${gameName} ${name} - Achievement | Spire Codex (${LANG_NAMES[langCode]})`;
    const languages = buildLanguageAlternates(`/achievements/${id}`);
    return {
      title,
      description: clipMetaDescription(`${gameName} achievement, ${name}${desc ? `: ${desc}` : ""}`),
      openGraph: {
        type: "article",
        siteName: SITE_NAME,
        url: `${SITE_URL}/${lang}/achievements/${id}`,
        title,
        description: clipMetaDescription(`${gameName} achievement, ${name}${desc ? `: ${desc}` : ""}`),
        locale: LANG_HREFLANG[langCode],
        images: [{ url: DEFAULT_OG_IMAGE }],
      },
      twitter: { card: "summary_large_image", title, description: clipMetaDescription(`${gameName} achievement, ${name}${desc ? `: ${desc}` : ""}`) },
      alternates: { canonical: `/${lang}/achievements/${id}`, languages },
    };
  } catch {
    return { title: "Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return null;
  const langCode = lang as LangCode;
  let jsonLd = null;
  let data = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/achievements/${id}?lang=${lang}`);
    if (res.ok) {
      data = await res.json();
      const desc = stripTags(data.description || "");
      const name = data.name || id;
      const detailJsonLd = buildDetailPageJsonLd({
        name, description: desc || name, path: `/${lang}/achievements/${id}`,
        category: "Achievement",
        breadcrumbs: [{ name: "Home", href: `/${lang}` }, { name: "Reference", href: `/${lang}/reference` }, { name, href: `/${lang}/achievements/${id}` }],
        inLanguage: LANG_HREFLANG[langCode],
      });
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd([
        { question: `How do you unlock the "${name}" achievement in Slay the Spire 2?`, answer: desc || name },
      ])];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!data) redirectMissingEntity("achievements", id, lang);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <AchievementDetail initialAchievement={data} />
    </>
  );
}
