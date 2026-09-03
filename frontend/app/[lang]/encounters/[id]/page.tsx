import type { Metadata } from "next";
import EncounterDetail from "@/app/encounters/[id]/EncounterDetail";

import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { isValidLang, LANG_HREFLANG, type LangCode } from "@/lib/languages";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ lang: string; id: string }> };

export { generateMetadata } from "@/app/encounters/[id]/page";

export default async function Page({ params }: Props) {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return null;
  const langCode = lang as LangCode;
  let jsonLd = null;
  let data = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/encounters/${id}?lang=${lang}`);
    if (res.ok) {
      data = await res.json();
      const name = data.name || id;
      const desc = data.monsters?.length
        ? `${name} is a ${data.room_type} encounter featuring ${data.monsters.map((m: { name: string }) => m.name).join(", ")}.`
        : `${name} encounter`;
      const detailJsonLd = buildDetailPageJsonLd({
        name, description: desc, path: `/${lang}/encounters/${id}`,
        category: "Encounter",
        breadcrumbs: [{ name: "Home", href: `/${lang}` }, { name: "Encounters", href: `/${lang}/encounters` }, { name, href: `/${lang}/encounters/${id}` }],
        inLanguage: LANG_HREFLANG[langCode],
      });
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd([
        { question: `What monsters appear in the ${name} encounter in Slay the Spire 2?`, answer: desc },
        { question: `What type of encounter is ${name}?`, answer: `${name} is a ${data.room_type || "combat"} encounter in Slay the Spire 2.` },
      ])];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!data) redirectMissingEntity("encounters", id, lang);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <EncounterDetail initialEncounter={data} />
    </>
  );
}
