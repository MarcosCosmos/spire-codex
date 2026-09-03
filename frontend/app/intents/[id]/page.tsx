import type { Metadata } from "next";
import IntentDetail from "./IntentDetail";
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
    const res = await fetch(`${API_INTERNAL}/api/intents/${id}${lang ? `?lang=${lang}` : ""}`);
    if (!res.ok) return { title: "Intent Not Found" };
    const entity = await res.json();
    const desc = stripTagsFlat(entity.description || "");
    const name = entity.name || id;
    const gameName = LANG_GAME_NAME[getLangOrDefault(lang)];
    const title = `${name} - ${t("Monster Intent", lang ?? "eng")}`;
    const meta = buildPageMetadata({
      lang,
      path: `/intents/${id}`,
      title,
      description: clipMetaDescription(`${gameName} monster intent, ${name}${desc ? `: ${desc}` : ""}`),
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
  let intent = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/intents/${id}`);
    if (res.ok) {
      intent = await res.json();
      const desc = stripTags(intent.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: intent.name,
        description: desc || `${intent.name} intent from Slay the Spire 2`,
        path: `/intents/${id}`,
        category: "Intent",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Reference", href: "/reference" },
          { name: intent.name, href: `/intents/${id}` },
        ],
      });
      const faqQuestions = [
        { question: `What does the ${intent.name} intent mean in Slay the Spire 2?`, answer: desc || `${intent.name} is a monster intent in Slay the Spire 2.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!intent) redirectMissingEntity("intents", id);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <IntentDetail initialIntent={intent} />
    </>
  );
}
