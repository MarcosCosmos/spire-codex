import type { Metadata } from "next";
import EventDetail from "@/app/events/[id]/EventDetail";
import { stripTags } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { isValidLang, LANG_HREFLANG, type LangCode } from "@/lib/languages";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { imageUrl } from "@/lib/image-url";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ lang: string; id: string }> };

export { generateMetadata } from "@/app/events/[id]/page";

export default async function Page({ params }: Props) {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return null;
  const langCode = lang as LangCode;
  let jsonLd = null;
  let data = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/events/${id}?lang=${lang}`);
    if (res.ok) {
      data = await res.json();
      const desc = stripTags(data.description || "");
      const name = data.name || data.title || id;
      const detailJsonLd = buildDetailPageJsonLd({
        name, description: desc || name, path: `/${lang}/events/${id}`,
        imageUrl: data.image_url ? imageUrl(data.image_url) : undefined, category: "Event",
        breadcrumbs: [{ name: "Home", href: `/${lang}` }, { name: "Events", href: `/${lang}/events` }, { name, href: `/${lang}/events/${id}` }],
        inLanguage: LANG_HREFLANG[langCode],
      });
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd([
        { question: `What happens at the ${name} event in Slay the Spire 2?`, answer: desc || name },
        { question: `Where does the ${name} event appear in Slay the Spire 2?`, answer: `${name} is a random event encounter in Slay the Spire 2.` },
      ])];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!data) redirectMissingEntity("events", id, lang);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <EventDetail initialEvent={data} />
    </>
  );
}
