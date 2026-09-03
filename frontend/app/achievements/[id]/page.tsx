import type { Metadata } from "next";
import AchievementDetail from "./AchievementDetail";
import { stripTags, stripTagsFlat, clipMetaDescription, buildPageMetadata } from "@/lib/seo";
import { t } from "@/lib/ui-translations";
import { getLangOrDefault, LANG_GAME_NAME, isValidLang } from "@/lib/languages";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ lang?: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, lang } = await params;
  if (lang && !isValidLang(lang)) return {};
  try {
    const res = await fetch(`${API_INTERNAL}/api/achievements/${id}${lang ? `?lang=${lang}` : ""}`);
    if (!res.ok) return { title: "Achievement Not Found" };
    const entity = await res.json();
    const desc = stripTagsFlat(entity.description || "");
    const name = entity.name || id;
    const gameName = LANG_GAME_NAME[getLangOrDefault(lang)];
    const title = `${name} - ${t("Achievement", lang ?? "eng")}`;
    const meta = buildPageMetadata({
      lang,
      path: `/achievements/${id}`,
      title,
      description: clipMetaDescription(`${gameName} achievement, ${name}${desc ? `: ${desc}` : ""}`),
      ogType: "article",
    });
    return meta;
  } catch {
    return { title: "Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let achievement = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/achievements/${id}`);
    if (res.ok) {
      achievement = await res.json();
      const desc = stripTags(achievement.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: achievement.name,
        description: desc || `${achievement.name} achievement from Slay the Spire 2`,
        path: `/achievements/${id}`,
        category: "Achievement",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Reference", href: "/reference" },
          { name: achievement.name, href: `/achievements/${id}` },
        ],
      });
      const faqQuestions = [
        { question: `How do you unlock the ${achievement.name} achievement in Slay the Spire 2?`, answer: desc || `${achievement.name} is an achievement in Slay the Spire 2.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!achievement) redirectMissingEntity("achievements", id);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <AchievementDetail initialAchievement={achievement} />
    </>
  );
}
