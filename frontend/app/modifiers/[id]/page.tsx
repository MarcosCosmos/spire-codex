import type { Metadata } from "next";
import ModifierDetail from "./ModifierDetail";
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
    const res = await fetch(`${API_INTERNAL}/api/modifiers/${id}${lang ? `?lang=${lang}` : ""}`);
    if (!res.ok) return { title: "Modifier Not Found" };
    const entity = await res.json();
    const desc = stripTagsFlat(entity.description || "");
    const name = entity.name || id;
    const gameName = LANG_GAME_NAME[getLangOrDefault(lang)];
    const title = `${name} - ${t("Modifier", lang ?? "eng")}`;
    const meta = buildPageMetadata({
      lang,
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
  const { id } = await params;
  let jsonLd = null;
  let modifier = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/modifiers/${id}`);
    if (res.ok) {
      modifier = await res.json();
      const desc = stripTags(modifier.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: modifier.name,
        description: desc || `${modifier.name} modifier from Slay the Spire 2`,
        path: `/modifiers/${id}`,
        category: "Modifier",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Reference", href: "/reference" },
          { name: modifier.name, href: `/modifiers/${id}` },
        ],
      });
      const faqQuestions = [
        { question: `What does the ${modifier.name} modifier do in Slay the Spire 2?`, answer: desc || `${modifier.name} is a run modifier in Slay the Spire 2.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!modifier) redirectMissingEntity("modifiers", id);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <ModifierDetail initialModifier={modifier} />
    </>
  );
}
