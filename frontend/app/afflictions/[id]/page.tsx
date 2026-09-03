import type { Metadata } from "next";
import AfflictionDetail from "./AfflictionDetail";
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
    const res = await fetch(`${API_INTERNAL}/api/afflictions/${id}${lang ? `?lang=${lang}` : ""}`);
    if (!res.ok) return { title: "Affliction Not Found" };
    const entity = await res.json();
    const desc = stripTagsFlat(entity.description || "");
    const name = entity.name || id;
    const gameName = LANG_GAME_NAME[getLangOrDefault(lang)];
    const title = `${name} - ${t("Affliction", lang ?? "eng")}`;
    const meta = buildPageMetadata({
      lang,
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
  const { id } = await params;
  let jsonLd = null;
  let affliction = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/afflictions/${id}`);
    if (res.ok) {
      affliction = await res.json();
      const desc = stripTags(affliction.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: affliction.name,
        description: desc || `${affliction.name} affliction from Slay the Spire 2`,
        path: `/afflictions/${id}`,
        category: "Affliction",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Reference", href: "/reference" },
          { name: affliction.name, href: `/afflictions/${id}` },
        ],
      });
      const faqQuestions = [
        { question: `What does ${affliction.name} do in Slay the Spire 2?`, answer: desc || `${affliction.name} is an affliction in Slay the Spire 2.` },
        ...(affliction.is_stackable ? [{ question: `Is ${affliction.name} stackable?`, answer: `Yes, ${affliction.name} is stackable.` }] : []),
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!affliction) redirectMissingEntity("afflictions", id);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <AfflictionDetail initialAffliction={affliction} />
    </>
  );
}
