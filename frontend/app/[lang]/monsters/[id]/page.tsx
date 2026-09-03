import type { Metadata } from "next";
import MonsterDetail from "@/app/monsters/[id]/MonsterDetail";
import { stripTags } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { isValidLang, LANG_HREFLANG, type LangCode } from "@/lib/languages";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { imageUrl } from "@/lib/image-url";

export const revalidate = 3600;

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ lang: string; id: string }> };

export { generateMetadata } from "@/app/monsters/[id]/page";

export default async function Page({ params }: Props) {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return null;
  const langCode = lang as LangCode;
  let jsonLd = null;
  let data = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/monsters/${id}?lang=${lang}`);
    if (res.ok) {
      data = await res.json();
      const desc = stripTags(data.description || "");
      const name = data.name || data.title || id;
      const detailJsonLd = buildDetailPageJsonLd({
        name, description: desc || name, path: `/${lang}/monsters/${id}`,
        imageUrl: data.image_url ? imageUrl(data.image_url) : undefined, category: "Monster",
        breadcrumbs: [{ name: "Home", href: `/${lang}` }, { name: "Monsters", href: `/${lang}/monsters` }, { name, href: `/${lang}/monsters/${id}` }],
        inLanguage: LANG_HREFLANG[langCode],
      });
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd([
        { question: `What is ${name} in Slay the Spire 2?`, answer: desc || name },
        { question: `Where do you encounter ${name}?`, answer: `${name} is a monster encountered in Slay the Spire 2.` },
      ])];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!data) redirectMissingEntity("monsters", id, lang);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <MonsterDetail initialMonster={data} />
    </>
  );
}
