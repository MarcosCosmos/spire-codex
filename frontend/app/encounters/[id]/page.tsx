import type { Metadata } from "next";
import EncounterDetail from "./EncounterDetail";
import { stripTags, clipMetaDescription, buildPageMetadata } from "@/lib/seo";
import { getLangOrDefault, LANG_GAME_NAME, isValidLang } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { fetchEncounterStats } from "@/lib/encounter-stats";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ lang?: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, lang } = await params;
  if (lang && !isValidLang(lang)) return {};
  try {
    const res = await fetch(`${API_INTERNAL}/api/encounters/${id}${lang ? `?lang=${lang}` : ""}`);
    if (!res.ok) return { title: "Encounter Not Found" };
    const entity = await res.json();
    const name = entity.name || id;
    const resolvedLang = getLangOrDefault(lang);
    const gameName = LANG_GAME_NAME[resolvedLang];
    // entity.room_type is not localized by the API.
    const roomType = entity.room_type ? t(entity.room_type, resolvedLang) : "";
    const encounterWord = t("Encounter", resolvedLang);
    const title = `${name} - ${roomType} ${encounterWord}`.replace(/\s+/g, " ").trim();
    const monsterList = entity.monsters?.length
      ? ` ${entity.monsters.map((m: { name: string }) => m.name).join(", ")}.`
      : "";
    const actText = entity.act ? ` (${entity.act})` : "";
    const meta = buildPageMetadata({
      lang,
      path: `/encounters/${id}`,
      title,
      description: clipMetaDescription(
        `${gameName} ${roomType} ${encounterWord}, ${name}${actText}.${monsterList}`,
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
  let encounter = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/encounters/${id}`);
    if (res.ok) {
      encounter = await res.json();
      const desc = encounter.monsters?.length
        ? `${encounter.name} is a ${encounter.room_type} encounter featuring ${encounter.monsters.map((m: { name: string }) => m.name).join(", ")}.`
        : `${encounter.name} encounter from Slay the Spire 2`;
      const detailJsonLd = buildDetailPageJsonLd({
        name: encounter.name,
        description: desc,
        path: `/encounters/${id}`,
        category: "Encounter",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Encounters", href: "/encounters" },
          { name: encounter.name, href: `/encounters/${id}` },
        ],
      });
      const faqQuestions = [
        { question: `What type of encounter is ${encounter.name} in Slay the Spire 2?`, answer: `${encounter.name} is a ${encounter.room_type} encounter${encounter.act ? ` found in ${encounter.act}` : ""}.` },
        { question: `What monsters appear in ${encounter.name}?`, answer: encounter.monsters?.length ? `${encounter.name} features: ${encounter.monsters.map((m: { name: string }) => m.name).join(", ")}.` : `${encounter.name} has no listed monsters.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!encounter) redirectMissingEntity("encounters", id);
  // Community "how deadly" numbers for this fight (encountered / killed), SSR'd.
  const stats = encounter?.id ? await fetchEncounterStats([encounter.id]) : [];
  const encounterStat = stats[0] ?? null;
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <EncounterDetail initialEncounter={encounter} encounterStat={encounterStat} />
    </>
  );
}
