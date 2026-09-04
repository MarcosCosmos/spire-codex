import type { Metadata } from "next";
import AchievementDetail from "./AchievementDetail";
import {
  stripTags,
  stripTagsFlat,
  clipMetaDescription,
  buildPageMetadata,
} from "@/lib/seo";
import { t } from "@/lib/ui-translations";
import {
  getLangOrDefault,
  LANG_GAME_NAME,
  LANG_HREFLANG,
  isValidLang,
} from "@/lib/languages";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

type Props = { params: Promise<{ lang?: string; id: string }> };

function langPrefix(lang?: string): string {
  return lang && isValidLang(lang) ? `/${lang}` : "";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  try {
    const res = await fetch(
      `${API_INTERNAL}/api/achievements/${id}${lang ? `?lang=${lang}` : ""}`,
    );
    if (!res.ok) return { title: "Achievement Not Found" };
    const entity = await res.json();
    const desc = stripTagsFlat(entity.description || "");
    const name = entity.name || id;
    const gameName = LANG_GAME_NAME[lang];
    const title = `${name} - ${t("Achievement", lang)}`;
    const meta = buildPageMetadata({
      lang: _lang,
      path: `/achievements/${id}`,
      title,
      description: clipMetaDescription(
        `${gameName} achievement, ${name}${desc ? `: ${desc}` : ""}`,
      ),
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
  let achievement = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(
      `${API_INTERNAL}/api/achievements/${id}${_lang ? `?lang=${_lang}` : ""}`,
    );
    if (res.ok) {
      achievement = await res.json();
      const desc = stripTags(achievement.description || "");
      const name = achievement.name || id;
      const detailJsonLd = buildDetailPageJsonLd({
        name,
        description: desc || `${name} achievement from Slay the Spire 2`,
        path: `${prefix}/achievements/${id}`,
        category: "Achievement",
        breadcrumbs: [
          { name: t("Home", lang), href: prefix || "/" },
          { name: t("Reference", lang), href: `${prefix}/reference` },
          { name, href: `${prefix}/achievements/${id}` },
        ],
        inLanguage: LANG_HREFLANG[lang],
      });
      const faqQuestions = [
        {
          question: `How do you unlock the "${name}" achievement in Slay the Spire 2?`,
          answer: desc || `${name} is an achievement in Slay the Spire 2.`,
        },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!achievement) redirectMissingEntity("achievements", id, _lang);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <AchievementDetail initialAchievement={achievement} />
    </>
  );
}
