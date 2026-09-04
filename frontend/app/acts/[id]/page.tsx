import type { Metadata } from "next";
import ActDetail from "./ActDetail";
import JsonLd from "@/app/components/JsonLd";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { buildDetailPageJsonLd } from "@/lib/jsonld";
import { clipMetaDescription, buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_GAME_NAME } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

export const dynamic = "force-static";
export const revalidate = 3600;

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ lang?: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, lang: _lang } = await params;
  const lang = getLangOrDefault(_lang);
  try {
    const res = await fetch(`${API_INTERNAL}/api/acts/${id}${lang ? `?lang=${lang}` : ""}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { title: "Act Not Found" };
    const act = await res.json();
    const gameName = LANG_GAME_NAME[getLangOrDefault(lang)];
    const title = `${act.name} - ${t("Act", lang ?? "eng")}`;
    const meta = buildPageMetadata({
      lang,
      path: `/acts/${id}`,
      title,
      description: clipMetaDescription(
        `${gameName} act, ${act.name}. ${act.num_rooms || "?"} rooms, ${act.bosses.length} bosses, ${act.encounters.length} encounters, ${act.events.length} events.`,
      ),
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
  let act = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/acts/${id}`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      act = await res.json();
      jsonLd = buildDetailPageJsonLd({
        name: act.name,
        description: `${act.name} act in Slay the Spire 2 with ${act.encounters.length} encounters and ${act.bosses.length} bosses.`,
        path: `/acts/${id}`,
        category: "Act",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Reference", href: "/reference" },
          { name: act.name, href: `/acts/${id}` },
        ],
      });
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!act) redirectMissingEntity("acts", id);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <ActDetail initialAct={act} />
    </>
  );
}
