import ActDetail from "@/app/acts/[id]/ActDetail";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd } from "@/lib/jsonld";
import { isValidLang, LANG_HREFLANG, type LangCode } from "@/lib/languages";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";

export const revalidate = 3600;

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ lang: string; id: string }> };

export { generateMetadata } from "@/app/acts/[id]/page";

export default async function Page({ params }: Props) {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return null;
  const langCode = lang as LangCode;
  let jsonLd = null;
  let act = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/acts/${id}?lang=${lang}`);
    if (res.ok) {
      act = await res.json();
      jsonLd = buildDetailPageJsonLd({
        name: act.name,
        description: `${act.name} act with ${act.encounters.length} encounters and ${act.bosses.length} bosses.`,
        path: `/${lang}/acts/${id}`,
        category: "Act",
        breadcrumbs: [
          { name: "Home", href: `/${lang}` },
          { name: "Reference", href: `/${lang}/reference` },
          { name: act.name, href: `/${lang}/acts/${id}` },
        ],
        inLanguage: LANG_HREFLANG[langCode],
      });
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!act) redirectMissingEntity("acts", id, lang);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <ActDetail initialAct={act} />
    </>
  );
}
